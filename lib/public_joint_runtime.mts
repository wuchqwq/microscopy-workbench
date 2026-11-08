// Explicit official-runtime profile for the one public synthetic development
// trial. This changes only the child process, never the user's saved config.
import path from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';
export const PUBLIC_JOINT_MODEL='gpt-6.1-sol';
export const PUBLIC_JOINT_EXECUTABLE='/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
export const PUBLIC_JOINT_ARRAY_SHA='32605bbed9432e4b1c6fcf4461b884a3ac13ee714932515290f8ca8bf367add3';
const disabled=['shell_tool','unified_exec','view_image','multi_agent','multi_agent_v2','computer_use','browser_use','browser_use_external','in_app_browser','image_generation','apps','plugins','remote_plugin','workspace_dependencies','tool_suggest','skill_search','hooks','memories','sleep_tool','code_mode','code_mode_only','request_permissions_tool','skill_mcp_dependency_install'];
// The official local Code Mode host is also the dynamic-tool dispatch bridge;
// disabling it returns "code-mode host is disabled" before item/tool/call.
// Request model Code Mode off while retaining that host. Model tool_mode can
// still expose official exec/wait orchestration; these flags are not proof of
// an exhaustive official tool allowlist. Our scientific port remains two tools.
export function publicJointConfig(){return {model:PUBLIC_JOINT_MODEL,features:{...Object.fromEntries(disabled.map(k=>[k,false])),code_mode_host:true},mcp_servers:{node_repl:{enabled:false},microscopy_workbench:{enabled:false}},orchestrator:{mcp:{enabled:false}},cloud:{skills:{enabled:false}},web_search:'disabled',sandbox_mode:'read-only',project_doc_max_bytes:0};}
export function publicJointArguments(){const args=['app-server'];const flatten=(v:Record<string,unknown>,head='')=>{for(const [key,value]of Object.entries(v)){const name=head?head+'.'+key:key;if(value&&typeof value==='object'&&!Array.isArray(value))flatten(value as Record<string,unknown>,name);else args.push('-c',name+'='+JSON.stringify(value));}};flatten(publicJointConfig());return args;}
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
export function verifyPublicJointRuntime(config:unknown,mcp:unknown){
 const c=row(config),features=row(c.features),servers=row(c.mcp_servers),cloud=row(c.cloud),orchestrator=row(c.orchestrator);
 const provider=row(row(c.model_providers).openai);
 if(provider.base_url!=null||c.openai_base_url!=null||c.chatgpt_base_url!=null&&!['https://chatgpt.com/backend-api','https://chatgpt.com/backend-api/'].includes(String(c.chatgpt_base_url)))throw Error('Custom inference endpoint is outside the reviewed OpenAI recipient');
 if(c.model!==PUBLIC_JOINT_MODEL||![null,undefined,'openai'].includes(c.model_provider as null|undefined|string)||c.sandbox_mode!=='read-only'||c.web_search!=='disabled'||c.project_doc_max_bytes!==0||features.code_mode_host!==true||disabled.some(k=>features[k]!==false)||Object.values(servers).some(v=>row(v).enabled!==false)||row(cloud.skills).enabled!==false||row(orchestrator.mcp).enabled!==false)throw Error('Official public joint runtime does not match the restricted reviewed profile');
 const listed=row(mcp);if(!Array.isArray(listed.data)||listed.nextCursor||listed.data.some(v=>Object.keys(row(row(v).tools)).length!==0))throw Error('Official public joint runtime still exposes MCP tools');
 return {model:PUBLIC_JOINT_MODEL,provider:'openai',sandbox:'read-only',mcp_tools:0,configured_extra_features_disabled:true,official_code_mode_host:true,complete_official_tool_catalog_attested:false};
}
export function publicJointDirectory(directory:string){
 if(!path.isAbsolute(directory))throw Error('Explicit absolute public-trial directory required');
 const info=lstatSync(directory),resolved=path.resolve(directory);
 if(!info.isDirectory()||info.isSymbolicLink()||realpathSync.native(directory)!==resolved)throw Error('Ordinary unlinked public-trial directory required');
 return resolved;
}
