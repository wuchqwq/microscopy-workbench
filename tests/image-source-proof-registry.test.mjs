import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import path from 'node:path';
import {ImageWorkspace} from '../lib/image_workspace.mjs';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';

const proofId='a'.repeat(32),rootId='b'.repeat(32),hash='c'.repeat(64);
test('source proof registry keeps fresh verification read-only and request identity scoped to proofs',async()=>{
 const calls=[],module=createImageModule({imageWorkspace:{workspace:'public-proof-contract',call(name,args){calls.push({name,args});return {content:[]};}}}),registry=new ToolRegistry().register(module);
 const entry=module.tools.find(value=>value.definition.name==='image_source_proof_info');assert.ok(entry,'fresh proof info is a registered existing-provider read');
 assert.equal(entry.contract.effects.requestId,'none');assert.equal(entry.contract.effects.sourceMutation,false);assert.deepEqual(entry.contract.execution.resourceKeys,[]);assert.equal(entry.contract.recovery.idField,'proof_object_id');
 await registry.call('image_source_proof_info',{proof_object_id:proofId,expected_sha256:hash});
 for(const args of [{object_id:proofId},{proof_object_id:proofId,request_id:'fake-read-id'},{proof_object_id:proofId,expected_sha256:'bad'}])await assert.rejects(registry.call('image_source_proof_info',args));
 for(const name of ['image_source_proof','image_source_proof_revoke'])assert.equal(module.tools.find(value=>value.definition.name===name).contract.effects.requestId,'required');
 await assert.rejects(registry.call('image_source_proof',{object_id:rootId,purpose:'saved_source'}));
 await assert.rejects(registry.call('image_source_proof',{object_id:rootId,purpose:'invented',request_id:'new-proof'}));
 await assert.rejects(registry.call('image_source_proof_revoke',{proof_object_id:proofId,reason:'withdraw'}));
 assert.deepEqual(calls,[{name:'image_source_proof_info',args:{proof_object_id:proofId,expected_sha256:hash}}]);
});

test('proof info transport checks the requested proof without a new request ID or write dispatch',async()=>{
 const sent=[];
 const spawnProcess=()=>{const child=new EventEmitter();child.pid=123;child.kill=()=>true;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();let input='';child.stdin.on('data',chunk=>input+=chunk.toString());child.stdin.on('finish',()=>{const payload=JSON.parse(input);sent.push(payload);child.stdout.write(JSON.stringify({ok:true,result:{backend:'external-image-workspace',state:'completed',object_id:proofId,proof_object_id:proofId,request_id:'original-proof-creator',status:'unavailable',eligible_for_exact_scope:false,eligible_for_strict_reuse:false,reason:'controlled proof reader abstention'}}));child.emit('close',0);});return child;};
 const provider=new ImageWorkspace({workspace:path.resolve('public-proof-read-contract'),spawnProcess});
 try{const response=await provider.call('image_source_proof_info',{proof_object_id:proofId,expected_sha256:hash});assert.equal(response.isError,undefined);assert.equal(JSON.parse(response.content[0].text).status,'unavailable');assert.equal(sent.length,1);assert.equal(sent[0].action,'source_proof_info');assert.equal(sent[0].proof_object_id,proofId);assert.equal(sent[0].request_id,undefined);assert.equal(sent[0].query_request_id,undefined);}finally{provider.close();}
});
