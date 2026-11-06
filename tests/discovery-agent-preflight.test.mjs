import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAgentSurface,runPreflight} from '../tools/discovery_agent_preflight.mjs';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('preflight queries actual advertisement without model or tool execution claims',async()=>{
 const calls=[],client={async rpc(method){calls.push(method);return {result:method==='initialize'?{serverInfo:{name:'explicit-test-server'}}:{tools:[{name:'image_info',inputSchema:{type:'object'}}]}};}};
 const r=await inspectAgentSurface(client);assert.deepEqual(calls,['initialize','tools/list']);
 assert.equal(r.summary.model_invoked,false);assert.equal(r.summary.scientific_tool_calls,0);
 assert.equal(r.summary.backend_scientific_execution,'NOT_TESTED');
 assert.match(r.summary.host_model_visibility,/NOT_ESTABLISHED/);
 assert.deepEqual(r.summary.advertised_tools,['image_info']);assert.ok(r.summary.missing_expected_site_tools.includes('image_profile'));
});

test('preflight rejects oversized config before starting a server or creating output',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'agent-surface-config-'));
 try{
  const config=path.join(root,'oversized.json'),output=path.join(root,'out');writeFileSync(config,' '.repeat(16385));
  await assert.rejects(runPreflight(config,output),/16 KiB/);assert.equal(existsSync(output),false);
  await assert.rejects(runPreflight('relative.json',output),/absolute/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('preflight rejects malformed, duplicate or failed discovery rather than claiming visibility',async()=>{
 for(const response of [{error:{code:-1}},{result:{}},{result:{tools:[{name:'image_info'}]}},{result:{tools:[{name:'x',inputSchema:{}},{name:'x',inputSchema:{}}]}}]){
  const client={async rpc(method){return method==='initialize'?{result:{serverInfo:{}}}:response;}};
  await assert.rejects(inspectAgentSurface(client));
 }
 let calls=0;await assert.rejects(inspectAgentSurface({async rpc(){calls++;return {error:{code:-1}};}}));assert.equal(calls,1);
});

test('expected-site visibility includes explicit preview-receipt recovery rather than only science names',async()=>{
 const names=['image_open','image_frame','image_info','image_result','image_statistics','image_profile','image_discovery','image_discovery_review'];
 const client={async rpc(method){return {result:method==='initialize'?{}:{tools:names.map(name=>({name,inputSchema:{type:'object'}}))}};}};
 assert.deepEqual((await inspectAgentSurface(client)).summary.missing_expected_site_tools,['image_preview_acknowledge']);
});
