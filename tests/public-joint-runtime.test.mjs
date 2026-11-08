import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,symlinkSync,realpathSync} from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';
import {publicJointConfig,publicJointArguments,verifyPublicJointRuntime,publicJointDirectory} from '../lib/public_joint_runtime.mjs';
import {CodexStdioHost,createPublicSyntheticJointHost} from '../lib/codex_stdio_host.mjs';
import {createSavedViewResearchTools} from '../lib/research_text_tools.mjs';
import {fixture} from './research-host-input-fixture.mjs';
test('official public profile validates actual effective disabled capabilities, not caller labels',()=>{
 const config=publicJointConfig();assert.equal(verifyPublicJointRuntime(config,{data:[],nextCursor:null}).mcp_tools,0);
 assert.ok(publicJointArguments().includes('features.shell_tool=false'));assert.ok(publicJointArguments().includes('sandbox_mode="read-only"'));
 for(const mutate of [c=>c.features.shell_tool=true,c=>c.features.apps=true,c=>c.features.computer_use=true,c=>delete c.features.view_image,c=>c.mcp_servers.extra={enabled:true},c=>c.cloud.skills.enabled=true,c=>c.orchestrator.mcp.enabled=true,c=>c.model_provider='other',c=>c.model='other',c=>c.sandbox_mode='workspace-write',c=>c.web_search='live',c=>c.project_doc_max_bytes=32768]){const changed=publicJointConfig();mutate(changed);assert.throws(()=>verifyPublicJointRuntime(changed,{data:[]}),/restricted reviewed profile/);}
 assert.throws(()=>verifyPublicJointRuntime(config,{data:[{tools:{outside:{}}}]}),/exposes MCP/);
 assert.throws(()=>verifyPublicJointRuntime(config,{data:[],nextCursor:'more'}),/exposes MCP/);
 const missingBridge=publicJointConfig();missingBridge.features.code_mode_host=false;assert.throws(()=>verifyPublicJointRuntime(missingBridge,{data:[]}),/restricted reviewed profile/);
 for(const override of [{model_providers:{openai:{base_url:'https://example.invalid/v1'}}},{openai_base_url:'https://example.invalid/v1'},{chatgpt_base_url:'https://example.invalid/backend-api'}])assert.throws(()=>verifyPublicJointRuntime({...config,...override},{data:[]}),/outside the reviewed OpenAI recipient/);
});
test('official runtime and memory profiles cannot be enabled by a serialized marker',()=>{
 for(const verification of ['unverified','synthetic'])assert.throws(()=>new CodexStdioHost({executable:process.execPath,verification,jointTools:{tools:{},officialRuntime:{approved:true}}}),/Real joint visual transport|fixed-memory/);
});
test('real public factory refuses a different source without connecting or sending',t=>{
 const f=fixture(t);mkdirSync(path.join(f.workspace,'audit'));const registry={listTools:()=>[{name:'image_statistics',description:'stats',inputSchema:{type:'object',properties:{}}},{name:'image_result',description:'query',inputSchema:{type:'object',properties:{}}}],call:async()=>assert.fail('No science or model call')};
 const tools=createSavedViewResearchTools({registry,workspace:f.workspace,viewId:f.options.view_id,frameId:f.options.frame_id,journalDirectory:path.join(f.workspace,'audit')});
 assert.throws(()=>createPublicSyntheticJointHost({tools,directory:f.workspace}),/exact full public synthetic/);
 assert.throws(()=>createPublicSyntheticJointHost({tools:{...tools},directory:f.workspace}),/Original saved-view/);
});
test('ordinary workspace locations are portable while linked/relative trial locations refuse',t=>{
 const root=realpathSync.native(mkdtempSync(path.join(process.platform==='darwin'?'/tmp':tmpdir(),'portable-public-joint-')));t.after(()=>rmSync(root,{recursive:true,force:true}));const directory=path.join(root,'run');mkdirSync(directory);assert.equal(publicJointDirectory(directory),directory);assert.throws(()=>publicJointDirectory('relative'),/absolute/);const alias=path.join(root,'alias');symlinkSync(directory,alias,'dir');assert.throws(()=>publicJointDirectory(alias),/unlinked/);
});
