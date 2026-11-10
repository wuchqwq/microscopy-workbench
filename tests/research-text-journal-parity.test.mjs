// Synthetic journal bytes queried by the REAL Python provider. No scientific
// algorithm or host/model runs here; actual positive science is tested separately.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';import path from 'node:path';import {tmpdir} from 'node:os';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {createResearchTextTools} from '../lib/research_text_tools.mjs';
import {ImageWorkerDiagnosticError} from '../lib/image_workspace.mjs';
const python=process.env.MICROSCOPY_PYTHON,sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const cases=[
 ['valid_failed',s=>Buffer.from(s),'failed'],
 ['duplicate_state',s=>Buffer.from(s.replace('"state":"failed"','"state":"unknown","state":"failed"')),'unknown'],
 ['duplicate_response_state',s=>Buffer.from(s.replace('"response":{"ok":false,"state":"failed"','"response":{"ok":false,"state":"unknown","state":"failed"')),'unknown'],
 ['escaped_duplicate_state',s=>Buffer.from(s.replace('"state":"failed"','"sta\\u0074e":"unknown","state":"failed"')),'unknown'],
 ['nested_duplicate_extra',s=>Buffer.from(s.slice(0,-1)+',"extra":{"key":1,"key":2}}'),'unknown'],
 ['overflow_number',s=>Buffer.from(s.slice(0,-1)+',"extra":1e999}'),'unknown'],
 ['nan',s=>Buffer.from(s.slice(0,-1)+',"extra":NaN}'),'unknown'],
 ['infinity',s=>Buffer.from(s.slice(0,-1)+',"extra":Infinity}'),'unknown'],
 ['negative_infinity',s=>Buffer.from(s.slice(0,-1)+',"extra":-Infinity}'),'unknown'],
 ['invalid_utf8',s=>Buffer.concat([Buffer.from(s.slice(0,-1)+',"extra":"'),Buffer.from([0xff]),Buffer.from('"}')]),'unknown'],
 ['utf8_bom',s=>Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(s)]),'unknown'],
 ['truncated_json',s=>Buffer.from(s.slice(0,-1)),'unknown'],
 ['prepared',s=>Buffer.from(s.replace('"state":"failed"','"state":"prepared"')),'unknown'],
 // Strictly parseable, but no verified original receipt: a stored marker must
 // not spoof the provider's live snapshot (raw legacy failure != verified one).
 ['stored_receipt_wrong_hash',s=>{const j=JSON.parse(s);j.response.original_failure={schema_version:1,request_id:j.request_id,parameters:j.parameters,parameters_sha256:j.parameters_sha256,journal_sha256:'0'.repeat(64),error_code:'INVALID_ARGUMENT'};j.parameters_sha256='0'.repeat(64);return Buffer.from(JSON.stringify(j));},'failed','unknown'],
];
test('provider and bridge agree on strict journal classification; unknown never admits replacement writes',{skip:!python},async t=>{
 assert.ok(path.isAbsolute(python));const destination=process.env.MICROSCOPY_TEXT_RECOVERY_EVIDENCE,evidence=destination?destination+'-journal-parity':undefined;if(evidence)assert.ok(path.isAbsolute(evidence));
 const directory=evidence?(mkdirSync(evidence),evidence):mkdtempSync(path.join(tmpdir(),'text-journal-parity-')),results=[];
 try{for(const [name,mutate,expected,bridgeExpected=expected] of cases)await t.test(name,async()=>{
  const local=path.join(directory,name),workspace=path.join(local,'workspace'),audit=path.join(local,'audit'),frame='1'.repeat(32);mkdirSync(local);mkdirSync(workspace);mkdirSync(audit);mkdirSync(path.join(workspace,'objects'));mkdirSync(path.join(workspace,'requests'));mkdirSync(path.join(workspace,'objects',frame));
  // Hash-valid reader fixture, never decoded or passed to a numerical operation.
  const array=Buffer.from('public journal-only fixture, not an NPY numerical array'),object={backend:'external-image-workspace',object_id:frame,kind:'frame',request_id:'fixture-frame',shape_yx:[2,2],dtype:'uint16',files_sha256:{'data.npy':sha(array)}},raw=JSON.stringify(object);
  writeFileSync(path.join(workspace,'objects',frame,'object.json'),raw);writeFileSync(path.join(workspace,'objects',frame,'data.npy'),array);writeFileSync(path.join(workspace,'requests','fixture-frame.json'),JSON.stringify({state:'completed',request_id:'fixture-frame',object_manifest_sha256:sha(raw),parameters:{workspace,request_id:'fixture-frame'},response:{ok:true,state:'completed',...object}}));
  const runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:workspace,MICROSCOPY_PYTHON:python,MICROSCOPY_PANEL:'0'}});let attemptedWrites=0,queries=0,journalBytes;
  const registry={listTools:()=>runtime.registry.listTools(),async call(tool,args,options){if(tool==='image_statistics'){
   attemptedWrites++;if(attemptedWrites===1){const parameters={...args,action:'statistics',workspace},response={ok:false,state:'failed',backend:'external-image-workspace',request_id:args.request_id,error:{code:'INVALID_ARGUMENT',message:'PUBLIC_MARKER'}};
    journalBytes=mutate(JSON.stringify({schema_version:1,request_id:args.request_id,state:'failed',parameters,parameters_sha256:sha(canonical(parameters)),response}));writeFileSync(path.join(workspace,'requests',args.request_id+'.json'),journalBytes);}
   throw Error('Simulated lost outcome; no actual scientific write was submitted');
  }queries++;return runtime.registry.call(tool,args,options);}};
  try{const bridge=createResearchTextTools({registry,workspace,frameId:frame,journalDirectory:audit}),signal=new AbortController().signal,call=(callId,tool,arguments_)=>bridge.port.call({threadId:'journal-thread',turnId:'journal-turn',callId,tool,arguments:arguments_},signal);
   const first=JSON.parse((await call('original','image_statistics',{object_id:frame,rect:[0,0,3,2]})).text);let providerError;try{await runtime.registry.call('image_result',{request_id:first.request_id});}catch(error){providerError=error;}
   assert.ok(providerError instanceof ImageWorkerDiagnosticError);const providerState=providerError.diagnostic.provider_reported_state;assert.equal(providerState,expected);
   const normalized=first.status==='unverified_outcome'?'unknown':first.status;assert.equal(normalized,bridgeExpected);if(bridgeExpected===expected)assert.equal(normalized,providerState);const originalQuery=JSON.parse((await call('query-original','image_result',{request_id:first.request_id})).text);assert.equal(originalQuery.status,first.status);assert.equal(originalQuery.request_id,first.request_id);
   if(bridgeExpected==='unknown'){assert.equal(providerError.diagnostic.original_failure,undefined);if(expected==='unknown')assert.match(providerError.message,/INCOMPLETE_REQUEST/);
    const next=JSON.parse((await call('corrected','image_statistics',{object_id:frame,rect:[0,0,2,2]})).text);assert.equal(next.status,'not_dispatched');assert.equal(next.original_request_id,first.request_id);assert.equal(attemptedWrites,1);
   }else{assert.equal(first.error.code,'INVALID_ARGUMENT');assert.equal(first.journal_sha256,sha(journalBytes));assert.equal(providerError.diagnostic.original_failure.journal_sha256,sha(journalBytes));}
   assert.equal(sha(readFileSync(path.join(workspace,'requests',first.request_id+'.json'))),sha(journalBytes),'Provider/bridge queries must inspect unchanged original bytes');
   results.push({name,expected,bridge_expected:bridgeExpected,strict_parser_parity_case:bridgeExpected===expected,provider_state:providerState,bridge_state:normalized,queried_bridge_status:originalQuery.status,request_id:first.request_id,journal_sha256:sha(journalBytes),original_bytes_unchanged:true,bridge_statistics_attempts:attemptedWrites,subsequent_science_dispatches:attemptedWrites-1,actual_scientific_writes:0,actual_provider_queries:queries+1});
  }finally{runtime.close();}
 });}finally{if(evidence)writeFileSync(path.join(directory,'report.json'),JSON.stringify({real_provider_queries:true,synthetic_journals:true,real_model:false,images_sent:false,image_gate_review_run:false,results},null,2)+'\n');else rmSync(directory,{recursive:true,force:true});}
});
