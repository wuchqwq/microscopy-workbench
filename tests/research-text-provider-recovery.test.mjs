// Opt-in actual provider regression on a public analytic fixture. No host/model,
// authentication, image sending or image-gate review is involved.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {createResearchTextTools} from '../lib/research_text_tools.mjs';
const python=process.env.MICROSCOPY_PYTHON;
test('actual provider: invalid ROI -> original failed query -> corrected ROI succeeds', {skip:!python},async()=>{
 assert.ok(path.isAbsolute(python),'Explicit Python required');const evidence=process.env.MICROSCOPY_TEXT_RECOVERY_EVIDENCE;if(evidence)assert.ok(path.isAbsolute(evidence));
 const directory=evidence?(mkdirSync(evidence),evidence):mkdtempSync(path.join(tmpdir(),'text-provider-recovery-'));
 const workspace=path.join(directory,'workspace'),audit=path.join(directory,'audit'),source=path.join(directory,'public-4x4.tiff');mkdirSync(workspace);mkdirSync(audit);
 const generated=spawnSync(python,['-B','-c','import numpy as np,tifffile,sys; tifffile.imwrite(sys.argv[1],np.arange(16,dtype=np.uint16).reshape(4,4),metadata=None,photometric="minisblack")',source],{encoding:'utf8'});assert.equal(generated.status,0,'Generate public analytic fixture');
 const runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:workspace,MICROSCOPY_PYTHON:python,MICROSCOPY_PANEL:'0'}}),report={result:'FAIL_OR_INCOMPLETE',real_provider:true,real_model:false,images_sent:false,image_gate_review_run:false,calls:[],outcomes:[]};
 try{
  const data=async(name,args)=>{const result=await runtime.registry.call(name,args);return JSON.parse(result.content.find(x=>x.type==='text').text);};
  const opened=await data('image_open',{source_path:source,request_id:'recovery-open'}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'recovery-frame'});
  const registry={listTools:()=>runtime.registry.listTools(),call(name,args,options){report.calls.push({tool:name,arguments:args});return runtime.registry.call(name,args,options);}};
  const bridge=createResearchTextTools({registry,workspace,frameId:frame.object_id,journalDirectory:audit}),signal=new AbortController().signal;
  const call=(callId,tool,args)=>bridge.port.call({threadId:'local-recovery-thread',turnId:'local-recovery-turn',callId,tool,arguments:args},signal);
  const invalidArgs={object_id:frame.object_id,rect:[0,0,5,4]},first=await call('invalid-roi','image_statistics',invalidArgs),failed=JSON.parse(first.text);report.outcomes.push(failed);
  assert.equal(first.success,false);assert.equal(failed.status,'failed');assert.equal(failed.error.code,'INVALID_ARGUMENT');
  const journal=JSON.parse(readFileSync(path.join(workspace,'requests',failed.request_id+'.json'),'utf8'));assert.equal(journal.state,'failed');assert.equal(journal.response.error.code,'INVALID_ARGUMENT');report.original_journal={request_id:journal.request_id,state:journal.state,error_code:journal.response.error.code};
  assert.deepEqual(await call('invalid-roi','image_statistics',invalidArgs),first);assert.equal(report.calls.length,2,'Only original write and its one read-only verification query; no duplicate replay');
  const queried=JSON.parse((await call('query-original-failure','image_result',{request_id:failed.request_id})).text);report.outcomes.push(queried);assert.equal(queried.status,'failed');assert.equal(queried.request_id,failed.request_id);assert.equal(queried.error.code,'INVALID_ARGUMENT');
  const correctedReply=await call('corrected-roi','image_statistics',{object_id:frame.object_id,rect:[0,0,4,4]}),corrected=JSON.parse(correctedReply.text);report.outcomes.push(corrected);
  assert.equal(correctedReply.success,true);assert.equal(corrected.status,'completed');assert.notEqual(corrected.request_id,failed.request_id);assert.deepEqual(corrected.source_rect_xyxy,[0,0,4,4]);
  assert.equal(corrected.statistics.sample_count,16);assert.equal(corrected.statistics.mean,7.5);assert.equal(corrected.statistics.minimum,0);assert.equal(corrected.statistics.maximum,15);assert.ok(Math.abs(corrected.statistics.stddev-Math.sqrt(21.25))<1e-12);
  const recovered=JSON.parse((await call('query-corrected','image_result',{request_id:corrected.request_id})).text);report.outcomes.push(recovered);assert.deepEqual(recovered,corrected);
  assert.equal(report.calls.filter(c=>c.tool==='image_statistics').length,2);assert.equal(report.calls.filter(c=>c.tool==='image_result').length,3);report.result='PASS';report.fixture='Public uint16 arange(16) reshaped to 4x4; population variance 21.25';
 }finally{runtime.close();if(evidence)writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');else rmSync(directory,{recursive:true,force:true});}
});
