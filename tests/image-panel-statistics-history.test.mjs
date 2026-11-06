// Public metadata fixtures and actual UI handlers; no private microscopy pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readImageStatisticsHistory} from '../lib/image_statistics_history.mjs';
import {DataProbes} from '../ui/image-panel/data-probes.mjs';
import {createImagePanel} from '../tools/image_panel.mjs';
const id=n=>n.toString(16).padStart(32,'0'),F=id(1),V=id(2),A=id(3),B=id(4),OTHER=id(5),C=id(6);
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'statistics-history-')),objects=new Map();
 mkdirSync(path.join(root,'requests'));mkdirSync(path.join(root,'objects'));
 const put=(object,params={})=>{
  objects.set(object.object_id,structuredClone(object));const directory=path.join(root,'objects',object.object_id);mkdirSync(directory,{recursive:true});
  const raw=JSON.stringify(object);writeFileSync(path.join(directory,'object.json'),raw);
  writeFileSync(path.join(root,'requests',object.request_id+'.json'),JSON.stringify({state:'completed',request_id:object.request_id,object_manifest_sha256:sha(raw),parameters:{workspace:root,request_id:object.request_id,...params},response:{ok:true,state:'completed',backend:'external-image-workspace',request_id:object.request_id,...object}}));
 };
 const array=Buffer.from('public synthetic array hash placeholder; this test does not decode or calculate'),grid={source_grid_object_id:F,shape_yx:[4,6],dtype:'uint16',array_sha256:sha(array),source_rect_xyxy:[0,0,6,4],coordinate_space:'source_pixels'};
 const frame={object_id:F,request_id:'frame',backend:'external-image-workspace',kind:'frame',shape_yx:[4,6],dtype:'uint16',files_sha256:{'data.npy':sha(array)},frame_index:0,source_identity:{path:'public-example.tiff',sha256:'a'.repeat(64)}};put(frame);writeFileSync(path.join(root,'objects',F,'data.npy'),array);
 const mark=(name,coords)=>({kind:'rectangle',annotation_id:name,status:'hypothesized',text:name,anchor:{coordinate_space:'source_pixels',source_object_id:F,coordinates:coords}});
 put({object_id:V,request_id:'view',backend:'external-image-workspace',kind:'annotate',parent_object_id:F,render_base_object_id:F,scientific_grid_identity:grid,dtype:'uint16',display:{gamma:1,display_range:[0,100],scale_bar:false},panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,6,4],image_rect_xyxy:[0,0,6,4]}],annotations:[mark('A original',[.1,.1,1.9,1.9]),mark('B original',[2,0,4,2])]});
 const stats=(ident,rect,mean)=>({object_id:ident,request_id:'stats-'+ident,backend:'external-image-workspace',kind:'statistics',parent_object_id:V,created_utc:'2026-01-01T00:00:00Z',coordinate_space:'source_pixels',source_rect_xyxy:rect,component:'raw',dtype:'uint16',scientific_grid_identity:grid,statistics:{sample_count:4,mean,stddev:1,minimum:mean-1,maximum:mean+1},standard_deviation:'population; NumPy ddof=0; binary64 reductions',intensity_semantics:'raw stored values'});
 const saveStats=(s,params={})=>{const raw=JSON.stringify(s.statistics);s={...s,files_sha256:{'statistics.json':sha(raw)}};put(s,{action:'statistics',object_id:s.parent_object_id,component:'raw',rect:s.source_rect_xyxy,...params});writeFileSync(path.join(root,'objects',s.object_id,'statistics.json'),raw);};
 saveStats(stats(A,[0,0,2,2],5));saveStats(stats(B,[2,0,4,2],8));
 const read=(limit=256)=>readImageStatisticsHistory({workspace:root,objectId:V,limit});
 return {root,objects,put,frame,grid,stats,saveStats,read,close:()=>rmSync(root,{recursive:true,force:true})};
}
test('same-frame history returns complete immutable A/B values with original labels and real truncation',()=>{
 const f=fixture();try{
  const before=readdirSync(path.join(f.root,'requests')),bytes=before.map(n=>readFileSync(path.join(f.root,'requests',n)));
  const result=f.read();assert.equal(result.read_only,true);assert.equal(result.entries.length,2);assert.equal(result.scope,'same_frame_source_pixels');
  assert.deepEqual(result.entries.map(e=>e.matching_input_annotations[0].name),['A original','B original']);assert.equal(result.entries[0].statistics.mean,5);assert.equal(result.entries[1].statistics.maximum,9);assert.equal(result.entries[0].intensity_unit,null);assert.equal(result.entries[0].created_utc,'2026-01-01T00:00:00Z');
  // Another frame, even from the same filename, cannot borrow these records.
  f.put({...f.frame,object_id:OTHER,request_id:'other-frame'});f.put({...f.objects.get(V),object_id:C,request_id:'other-view',parent_object_id:OTHER,render_base_object_id:OTHER});
  assert.equal(readImageStatisticsHistory({workspace:f.root,objectId:C}).entries.length,0);
  assert.equal(f.read(1).total,2);assert.equal(f.read(1).truncated,true);assert.equal(f.read(1).entries.length,1);
  for(let i=0;i<before.length;i++)assert.deepEqual(readFileSync(path.join(f.root,'requests',before[i])),bytes[i]);
 }finally{f.close();}
});
test('history does not rename old regions from moved or ambiguous current observations',()=>{
 const f=fixture();try{
  const current={...f.objects.get(V),object_id:C,request_id:'renamed-view',parent_object_id:V,annotations:[]};f.put(current);
  const r=readImageStatisticsHistory({workspace:f.root,objectId:C});assert.equal(r.entries[0].matching_input_annotations[0].name,'A original');
  const s=f.stats(A,[1,1,3,3],5);f.saveStats(s);assert.deepEqual(f.read().entries.find(e=>e.object_id===A).matching_input_annotations,[]);
 }finally{f.close();}
});
test('changed payload, original parameters, nonfinite/count diagnostics and source array are refused',()=>{
 for(const change of ['payload','parameters','nonfinite','count','array']){
  const f=fixture();try{
   if(change==='payload')writeFileSync(path.join(f.root,'objects',A,'statistics.json'),'{}');
   if(change==='parameters')f.saveStats(f.stats(A,[0,0,2,2],5),{rect:[1,0,3,2]});
   if(change==='nonfinite'){const s=f.stats(A,[0,0,2,2],5);s.statistics.mean=null;f.saveStats(s);}
   if(change==='count'){const s=f.stats(A,[0,0,2,2],5);s.statistics.sample_count=3;f.saveStats(s);}
   if(change==='array')writeFileSync(path.join(f.root,'objects',F,'data.npy'),'changed');
   assert.throws(()=>f.read(),/statistics|array/i,change);
  }finally{f.close();}
 }
});
test('actual read-only Panel route requires token and exact current identity without submitting science',async()=>{
 const f=fixture(),calls=[];let panel;
 try{
  panel=await createImagePanel({workspace:f.root,python:process.execPath,object_id:V,client:{async rpc(){return {result:{tools:[{name:'image_info',inputSchema:{}}]}};},async tool(name,args){calls.push(name);assert.equal(name,'image_info');return {data:{...f.objects.get(args.object_id),ok:true,state:'completed'},png:'iVBORw0KGgo='};},async close(){}}});
  const origin=panel.url.split('/#')[0],before=JSON.stringify(panel.state()),files=readdirSync(path.join(f.root,'requests')),count=calls.length;
  for(const [query,status,token]of [['object_id='+V,200,true],['object_id='+C,409,true],['object_id='+V+'&object_id='+V,409,true],['object_id='+V+'&workspace=elsewhere',409,true],['object_id='+V,403,false]]){
   const response=await fetch(origin+'/api/statistics-history?'+query,{headers:token?{'X-Panel-Token':panel.token}:{}});assert.equal(response.status,status);const result=await response.json();if(status===200)assert.equal(result.entries.length,2);
  }
  assert.equal(JSON.stringify(panel.state()),before);assert.equal(calls.length,count);assert.deepEqual(readdirSync(path.join(f.root,'requests')),files);
 }finally{await panel?.close();f.close();}
});
function ui(response){
 let active=null,objectId=V,reads=0;const elements=new Map();
 class Element {children=[];textContent='';open=false;listeners={};append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}focus(){active=this;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}addEventListener(n,fn){this.listeners[n]=fn;}}
 const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},errors=[];
 const doc={getElementById:el,createElement:()=>new Element(),get activeElement(){return active;}};el('origin').focus();
 new DataProbes({document:doc,getState:()=>({object:{object_id:objectId}}),readStatisticsHistory:async()=>{reads++;return typeof response==='function'?response():response;},onOpenStatisticsHistory:()=>el('origin'),onError:e=>errors.push(e.message)});
 return {el,errors,reads:()=>reads,setObject:v=>objectId=v,active:()=>active};
}
const history={schema_version:1,read_only:true,scope:'same_frame_source_pixels',object_id:V,frame_object_id:F,total:1,truncated:false,entries:[{object_id:A,request_id:'saved-A',source_rect_xyxy:[0,0,2,2],matching_input_annotations:[{annotation_id:'old-A',name:'Saved A'}],component:'raw',statistics:{sample_count:4,mean:5,stddev:1,minimum:4,maximum:6},source_identity:{path:'public.tiff'}}]};
const allText=e=>[e.textContent,...e.children.map(allText)].join('\n');
test('actual history UI opens from both entries, shows full identity and unknowns, and closes with focus',async()=>{
 const h=ui(history);await h.el('open-statistics-history').onclick();const text=allText(h.el('statistics-history-rows'));
 for(const value of ['Saved A','均值 5','标准差 1','最小 4','最大 6','n=4','强度单位未声明','保存时间（UTC）：未知',A,'saved-A'])assert.ok(text.includes(value),value);
 assert.match(h.el('statistics-history-status').textContent,/不代表当前选区、周期、方向、应变或物理解释/);
 h.el('close-statistics-history').onclick();assert.equal(h.el('statistics-history-dialog').open,false);assert.equal(h.active(),h.el('origin'));
 await h.el('open-statistics-history-inline').onclick();assert.equal(h.reads(),2);h.el('close-statistics-history').onclick();await h.el('open-statistics-history-measurements').onclick();assert.equal(h.reads(),3);assert.deepEqual(h.errors,[]);
});
test('history UI refuses stale sources, shows true empty state and does not reuse old rows',async()=>{
 const stale=ui({...history,object_id:C});await stale.el('open-statistics-history').onclick();assert.equal(stale.el('statistics-history-rows').children.length,0);assert.equal(stale.errors.length,1);
 const empty=ui({...history,entries:[],total:0});await empty.el('open-statistics-history').onclick();assert.match(empty.el('statistics-history-status').textContent,/不自动计算或借用其他帧/);
});
