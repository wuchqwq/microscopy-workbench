import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createImagePanel} from '../tools/image_panel.mjs';
import {renderDomainEvidence} from '../ui/image-panel/domain-evidence.mjs';
import {validateSpatialDomainEvidence} from '../ui/image-panel/evidence-contracts.mjs';

const ident=i=>i.toString(16).padStart(32,'0');
const overviewId=ident(2),viewId=ident(3),png='iVBORw0KGgo=';
function evidence(kind='domain_map'){
 const samples=[0,1].map(sample_index=>({sample_index,scale_pixels:32,grid_xy:[sample_index,0],atlas_region_index:sample_index,
  rect_xyxy:[32*sample_index,0,32*(sample_index+1),32],center_xy:[15.5+32*sample_index,15.5],
  fft_object_id:ident(10+sample_index),roi_object_id:ident(20+sample_index),view_object_id:sample_index?ident(4):viewId,
  atlas_object_id:ident(30),status:'valid',measurement_object_ids:[ident(40+sample_index)],features:{family_count:2,shortest_period:8,families:[]}}));
 return {kind,object_id:ident(1),overview_object_id:overviewId,coordinate_domain:'pixel',coordinate_unit:'cycles/pixel',tolerance:.001,samples,
  field_image:{width:400,height:200,hotspots:samples.map(s=>({sample_index:s.sample_index,view_object_id:s.view_object_id,rect_xyxy:[40+s.sample_index*80,20,120+s.sample_index*80,100]}))},
  domains:[{domain_id:'domain-1',sample_indices:[0],status:'candidate',support_rects:[samples[0].rect_xyxy]},{domain_id:'domain-2',sample_indices:[1],status:'candidate',support_rects:[samples[1].rect_xyxy]}],
  edges:[{edge_index:0,sample_indices:[0,1],status:'different',orientation:{status:'incompatible',accepted_angles_degrees:[]},lattice_geometry:{status:'compatible_signature',accepted_angles_degrees:[30]},boundary_band_xyxy:[0,0,64,32]}],
  boundary_bands:[{edge_index:0,sample_indices:[0,1],rect_xyxy:[0,0,64,32]}],unknown_sample_indices:[]};
}
function element(){const doc={createElement(tag){return {tag,textContent:'',children:[],listeners:{},style:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.listeners[name]=fn;},scrollIntoView(){this.scrolled=true;}};}};return {...doc.createElement('details'),ownerDocument:doc};}
const all=node=>[node,...node.children.flatMap(all)],text=node=>all(node).map(value=>value.textContent).join(' ');

test('bounded multi-scale projection rejects malformed coordinates and candidate relationships',()=>{
 assert.doesNotThrow(()=>validateSpatialDomainEvidence(evidence()));
 for(const corrupt of [
  e=>e.samples[0].scale_pixels=NaN,e=>e.samples[0].sample_index=33,e=>e.samples[0].grid_xy=[0,Infinity],
  e=>e.field_image.hotspots[0].rect_xyxy=[40,20,500,100],e=>e.field_image.hotspots[0].sample_index=17,
  e=>e.edges[0].sample_indices=[0,0],e=>e.edges[0].lattice_geometry.accepted_angles_degrees=[Infinity],
  e=>e.domains[0].sample_indices=[9],e=>e.domains[0].status='confirmed',e=>e.unknown_sample_indices=[9],
  e=>e.boundary_bands[0].rect_xyxy=[0,0,0,32],e=>e.tolerance=0,
 ]){const input=evidence();corrupt(input);assert.throws(()=>validateSpatialDomainEvidence(input),/Invalid spatial domain evidence/);}
});

test('candidate coverage and zero-angle versus allowed-rotation evidence remain separate and read-only',async()=>{
 const input=evidence(),before=structuredClone(input),container=element(),shown=[];
 renderDomainEvidence(container,input,{show:id=>shown.push(id),png});
 const contents=text(container);assert.match(contents,/空间结构域与边界/);assert.match(contents,/固定取向/);assert.match(contents,/允许候选旋转/);assert.match(contents,/incompatible/);assert.match(contents,/compatible_signature.*30/);assert.match(contents,/不能当作边界定位精度/);assert.match(contents,/2 个候选连通域/);
 const nodes=all(container),map=nodes.find(n=>n.className==='feature-field-map'),locate=nodes.find(n=>n.tag==='button'&&n.textContent==='定位候选覆盖');
 await locate.listeners.click();assert.equal(map.scrolled,true);assert.equal(map.children[1].style.outline,'3px solid #ffca6a');assert.equal(map.children[2].style.outline,'');assert.deepEqual(shown,[]);
 await map.children[1].listeners.click();assert.deepEqual(shown,[viewId]);assert.deepEqual(input,before);
});

test('usable raw observations with cross-scale mixture evidence remain unknown for domain assignment',()=>{
 const input=evidence();input.samples[0].domain_status='unknown';input.samples[0].domain_unknown_reason='Conflicting finer signatures within this window support';input.unknown_sample_indices=[0];input.domains=input.domains.slice(1);
 input.edges[0]={...input.edges[0],status:'unknown',orientation:{status:'not_comparable',accepted_angles_degrees:[]},lattice_geometry:{status:'not_comparable',accepted_angles_degrees:[]},boundary_band_xyxy:null};input.boundary_bands=[];
 const container=element();renderDomainEvidence(container,input,{png});
 assert.match(text(container),/valid \/ 域 unknown/);assert.match(text(container),/1 个未知窗口/);assert.match(text(container),/not_comparable/);
 assert.ok(all(container).some(node=>node.title==='Conflicting finer signatures within this window support'));
});

async function panelFixture(input,run){
 const workspace=mkdtempSync(path.join(tmpdir(),'spatial-domain-panel-')),calls=[];
 const image=id=>({object_id:id,kind:'view',display:{gamma:1},panels:[],annotations:[]});
 const records=new Map([[input.object_id,input],[overviewId,image(overviewId)],[viewId,image(viewId)]]);
 const client={async rpc(method){return {result:method==='tools/list'?{tools:[{name:'image_info',inputSchema:{}}]}:{}};},async tool(name,args){assert.equal(name,'image_info');calls.push(args.object_id);assert.ok(records.has(args.object_id));return {data:structuredClone(records.get(args.object_id)),png};},async close(){}};
 let panel;try{panel=await createImagePanel({workspace,python:path.resolve('unused-python'),object_id:input.object_id,client});await run(panel,calls);}finally{await panel?.close();assert.equal(path.dirname(path.resolve(workspace)),path.resolve(tmpdir()));assert.ok(path.basename(workspace).startsWith('spatial-domain-panel-'));rmSync(workspace,{recursive:true,force:true});}
}
test('Panel serves the complete browser module import graph',async()=>{
 await panelFixture(evidence(),async panel=>{
  const origin=panel.url.split('/#')[0], pending=['/app.mjs'], seen=new Set();
  while(pending.length){
   const file=pending.pop();if(seen.has(file))continue;seen.add(file);
   const response=await fetch(origin+file);
   assert.equal(response.status,200,`Browser module ${file}`);
   assert.match(response.headers.get('content-type'),/javascript/);
   const source=await response.text();
   for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\/[^'"]+\.mjs)['"]/g))pending.push(new URL(match[1],origin+file).pathname);
  }
  assert.ok(seen.has('/evidence-contracts.mjs'));
 });
});
for(const kind of ['spatial_field','domain_map'])test(`saved ${kind} opens original overview and retains scientific map through saved FFT navigation`,async()=>{
 const input=evidence(kind);await panelFixture(input,async(panel,calls)=>{
  assert.equal(panel.state().object.object_id,overviewId);assert.deepEqual(panel.state().domain_evidence,input);assert.equal(panel.state().domain_png_base64,png);assert.deepEqual(calls,[input.object_id,overviewId]);
  const origin=panel.url.split('/#')[0],response=await fetch(origin+'/api/action',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'show',params:{object_id:viewId},expected_object_id:overviewId,draft_revision:0})});
  assert.equal(response.status,200,await response.text());assert.equal(panel.state().object.object_id,viewId);assert.deepEqual(panel.state().domain_evidence,input);assert.equal(panel.state().domain_png_base64,png);assert.ok(calls.every(id=>[input.object_id,overviewId,viewId].includes(id)));
 });
});

test('Panel rejects invalid spatial evidence before opening another saved view',async()=>{
 const input=evidence();input.samples[0].center_xy=[NaN,0];await assert.rejects(panelFixture(input,async()=>assert.fail('invalid evidence opened')),/Invalid spatial domain evidence/);
});
