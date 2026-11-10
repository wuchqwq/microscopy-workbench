// Bounded actual Python provider + existing compiled app-server adapter with
// in-memory text-only stdin/stdout. No model, images in transport or image gate.
import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {CodexStdioHost} from '../lib/codex_stdio_host.mjs';
import {createSavedViewResearchTools} from '../lib/research_text_tools.mjs';
const python=process.env.MICROSCOPY_PYTHON,sha=v=>createHash('sha256').update(v).digest('hex');
function localPeer(port){
 const child=new EventEmitter(),received=[],waiters=new Map();child.stdout=new PassThrough();child.stderr=new PassThrough();
 const send=m=>child.stdout.write(JSON.stringify(m)+'\n');
 child.stdin=new Writable({write(raw,_encoding,done){const m=JSON.parse(raw.toString());received.push(m);queueMicrotask(()=>{
  if(m.method==='initialize')send({id:m.id,result:{}});
  if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'local-scope-thread'}}});
  if(m.method==='turn/start')send({id:m.id,result:{turn:{id:'local-scope-turn'}}});
  if(waiters.has(m.id)){const settle=waiters.get(m.id);waiters.delete(m.id);settle(m);}
 });done();}});child.stdin.once('finish',()=>queueMicrotask(()=>child.emit('close',0,null)));
 const host=new CodexStdioHost({executable:process.execPath,spawnProcess:()=>child,textTools:{port},verification:'synthetic'});
 const call=(id,tool,args,callId=id)=>{const reply=new Promise(resolve=>waiters.set(id,resolve));send({id,method:'item/tool/call',params:{threadId:'local-scope-thread',turnId:'local-scope-turn',callId,tool,arguments:args}});return reply.then(r=>{assert.equal(r.result.contentItems[0].type,'inputText');return JSON.parse(r.result.contentItems[0].text);});};
 return {host,received,send,call};
}
test('actual crop provider through one text-only turn: result-dependent check, exact original query and unknown recovery',{skip:!python,timeout:30000},async()=>{
 assert.ok(path.isAbsolute(python));const evidence=process.env.MICROSCOPY_SAVED_VIEW_EVIDENCE;if(evidence)assert.ok(path.isAbsolute(evidence));
 const directory=evidence?(mkdirSync(evidence),evidence):mkdtempSync(path.join(tmpdir(),'saved-view-provider-'));
 const workspace=path.join(directory,'workspace'),audit=path.join(directory,'audit'),source=path.join(directory,'public-gradient.tiff');mkdirSync(workspace);mkdirSync(audit);
 const generated=spawnSync(python,['-B','-c','import numpy as np,tifffile,sys; y,x=np.mgrid[:20,:30]; tifffile.imwrite(sys.argv[1],(y*100+x).astype(np.uint16),metadata=None,photometric="minisblack")',source],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 const sourceHash=sha(readFileSync(source)),runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:workspace,MICROSCOPY_PYTHON:python,MICROSCOPY_PANEL:'0'}});
 const report={result:'INCOMPLETE',scope:'actual provider + scripted in-memory text-only adapter; not model vision or approval',calls:[],outputs:[],images_sent:false,visual_gate_used:false};let peer;
 try{
  const data=async(name,args)=>{const reply=await runtime.registry.call(name,args);assert.notEqual(reply.isError,true);return JSON.parse(reply.content.find(c=>c.type==='text').text);};
  const opened=await data('image_open',{source_path:source,request_id:'crop-open'}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'crop-frame'}),view=await data('image_preview',{object_id:frame.object_id,rect:[5,6,15,14],max_size:200,scale_bar:false,request_id:'crop-view'});
  const unchanged=new Map(['objects','requests'].flatMap(sub=>readdirSync(path.join(workspace,sub),{recursive:true,withFileTypes:true}).filter(f=>f.isFile()).map(f=>{const file=path.join(f.parentPath,f.name);return [file,sha(readFileSync(file))];})));
  let loseNextStatistics=false,queriesUnavailable=false;
  const registry={listTools:()=>runtime.registry.listTools(),async call(name,args,options){report.calls.push({tool:name,arguments:args});if(name==='image_result'&&queriesUnavailable)throw Error('SCRIPTED_QUERY_RECEIPT_UNAVAILABLE');const reply=await runtime.registry.call(name,args,options);if(name==='image_statistics'&&loseNextStatistics){loseNextStatistics=false;queriesUnavailable=true;throw Error('SCRIPTED_SAVED_RESULT_REPLY_LOST');}return reply;}};
  const tools=createSavedViewResearchTools({registry,workspace,frameId:frame.object_id,viewId:view.object_id,journalDirectory:audit});peer=localPeer(tools.port);
  await peer.host.connect();await peer.host.startSession({task_id:'local-saved-view',context_sha256:tools.context_sha256});await peer.host.startTurn('SCRIPTED local test of this saved crop; no image or model.');
  const countWrites=()=>report.calls.filter(c=>c.tool==='image_statistics').length;
  const refused=await peer.call('crop-relative','image_statistics',{object_id:view.object_id,rect:[0,0,10,8]});assert.equal(refused.status,'not_dispatched');assert.equal(countWrites(),0);
  const first=await peer.call('full-support','image_statistics',{object_id:view.object_id});assert.equal(first.status,'completed');assert.deepEqual(first.source_rect_xyxy,[5,6,15,14]);
  const [x0,y0,x1,y1]=first.source_rect_xyxy,mid=Math.floor((x0+x1)/2),nextRect=first.statistics.mean>0?[x0,y0,mid,y1]:[mid,y0,x1,y1];
  const second=await peer.call('result-dependent-check','image_statistics',{object_id:view.object_id,rect:nextRect});assert.equal(second.status,'completed');
  assert.deepEqual(await peer.call('duplicate-rpc','image_statistics',{object_id:view.object_id},'full-support'),first);assert.equal(countWrites(),2);
  assert.deepEqual(await peer.call('query-first','image_result',{request_id:first.request_id}),first);assert.equal(countWrites(),2);
  loseNextStatistics=true;const unknown=await peer.call('lost-reply','image_statistics',{object_id:view.object_id,rect:[mid,y0,x1,y1]});assert.equal(unknown.status,'unverified_outcome');assert.equal(countWrites(),3);
  const fenced=await peer.call('new-write-after-unknown','image_statistics',{object_id:view.object_id});assert.equal(fenced.status,'not_dispatched');assert.equal(fenced.original_request_id,unknown.request_id);assert.equal(countWrites(),3);
  queriesUnavailable=false;const recovered=await peer.call('query-unknown-original','image_result',{request_id:unknown.request_id});assert.equal(recovered.status,'completed');assert.equal(recovered.request_id,unknown.request_id);assert.equal(countWrites(),3);
  for(const output of [first,second,recovered]){
   const [a,b,c,d]=output.source_rect_xyxy,values=[];for(let y=b;y<d;y++)for(let x=a;x<c;x++)values.push(y*100+x);
   const mean=values.reduce((a,b)=>a+b,0)/values.length,std=Math.sqrt(values.reduce((sum,v)=>sum+(v-mean)**2,0)/values.length);
   assert.equal(output.input_object_id,view.object_id);assert.equal(output.frame_id,frame.object_id);assert.equal(output.statistics.sample_count,values.length);assert.equal(output.statistics.mean,mean);assert.ok(Math.abs(output.statistics.stddev-std)<1e-10);assert.equal(output.statistics.minimum,Math.min(...values));assert.equal(output.statistics.maximum,Math.max(...values));
   const original=JSON.parse(readFileSync(path.join(workspace,'requests',output.request_id+'.json')));assert.equal(original.response.parent_object_id,view.object_id);assert.equal(original.object_manifest_sha256,output.manifest_sha256);assert.equal(original.parameters.object_id,view.object_id);
  }
  const foreignBefore=countWrites();peer.send({id:'foreign-turn',method:'item/tool/call',params:{threadId:'local-scope-thread',turnId:'other-turn',callId:'foreign-turn',tool:'image_statistics',arguments:{object_id:view.object_id}}});await new Promise(resolve=>setImmediate(resolve));assert.equal(countWrites(),foreignBefore);
  peer.send({method:'turn/completed',params:{threadId:'local-scope-thread',turn:{id:'local-scope-turn',status:'completed'}}});assert.equal(peer.host.snapshot().turn_state,'completed');
  const start=peer.received.find(m=>m.method==='turn/start');assert.deepEqual(start.params.input,[{type:'text',text:'SCRIPTED local test of this saved crop; no image or model.'}]);assert.equal(peer.received.filter(m=>m.method==='turn/start').length,1);
  for(const [file,hash]of unchanged)assert.equal(sha(readFileSync(file)),hash);assert.equal(sha(readFileSync(source)),sourceHash);
  assert.equal(JSON.stringify(peer.received.filter(m=>m.result?.contentItems)).includes(workspace),false);
  Object.assign(report,{result:'PASS',input_scope:tools.input_scope,first_mean:first.statistics.mean,next_rect:nextRect,outputs:[first,second,unknown,fenced,recovered],statistics_writes:countWrites(),source_sha256:sourceHash,original_scientific_files_unchanged:unchanged.size,turn_start_count:1,meaning:'Script selected next ROI from returned mean; real numerical values and immutable journals verified independently. Model choice, image receipt/vision, approval and UI not tested.'});
 }finally{if(peer)await peer.host.close();runtime.close();if(evidence)writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');else rmSync(directory,{recursive:true,force:true});}
});
