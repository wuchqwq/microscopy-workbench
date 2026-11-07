// Inspect the actual explicit MCP server, without launching a model or tools.
import path from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import {StdioImageClient} from './image_panel.mjs';
import {validatePluginSettings} from './plugin_server.mjs';

type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const required=['image_open','image_frame','image_info','image_result','image_statistics','image_profile','image_discovery','image_discovery_review','image_preview_acknowledge'];
export async function inspectAgentSurface(client:{rpc(method:string,params?:Row):Promise<unknown>}){
 const initialized=await client.rpc('initialize');
 if(!row(initialized)||initialized.error||!row(initialized.result))throw new Error('MCP initialize failed; tool visibility not established');
 const listed=await client.rpc('tools/list');
 if(!row(listed)||listed.error||!row(listed.result)||!Array.isArray(listed.result.tools))throw new Error('MCP tools/list failed; tool visibility not established');
 const tools=listed.result.tools;
 if(!tools.every(t=>row(t)&&typeof t.name==='string'&&row(t.inputSchema))||new Set(tools.map(t=>(t as Row).name)).size!==tools.length)throw new Error('Invalid or duplicate advertised tool schema');
 const names=tools.map(t=>String((t as Row).name));
 return {initialized,listed,summary:{schema_version:1,scope:'explicit_local_MCP_server_catalog_only',
  advertised_tools:names,missing_expected_site_tools:required.filter(n=>!names.includes(n)),
  host_model_visibility:'NOT_ESTABLISHED: server advertisement is not host registration, allowlist, approval or model selection',
  backend_scientific_execution:'NOT_TESTED',model_invoked:false,scientific_tool_calls:0,registration_or_settings_changed:false}};
}
export async function runPreflight(config:string,output:string){
 if(!path.isAbsolute(config)||!path.isAbsolute(output)||existsSync(output))throw new Error('Explicit absolute config and fresh output directory required');
 if(!statSync(config).isFile()||statSync(config).size>16384)throw new Error('Explicit plugin config must be a regular JSON file <=16 KiB');
 const raw=readFileSync(config),settings=validatePluginSettings(JSON.parse(raw.toString('utf8')));
 const server=path.join(path.dirname(fileURLToPath(import.meta.url)),'plugin_server.mjs');
 mkdirSync(output,{recursive:true});
 const client=new StdioImageClient({workspace:path.join(settings.workspace_root,'images'),python:settings.python,serverPath:server,serverArgs:['--config',config]});
 try{
  const evidence=await inspectAgentSurface(client);
  if(!readFileSync(config).equals(raw))throw new Error('Explicit config changed during preflight');
  for(const [name,value] of Object.entries({initialize:evidence.initialized,'tools-list':evidence.listed,summary:{...evidence.summary,
    config_path:config,config_sha256:createHash('sha256').update(raw).digest('hex'),workspace_root:settings.workspace_root}}))
   writeFileSync(path.join(output,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  return evidence.summary;
 }catch(error){writeFileSync(path.join(output,'failure.json'),JSON.stringify({status:'FAILED',message:String(error),model_invoked:false,scientific_tool_calls:0})+'\n',{flag:'wx'});throw error;}
 finally{await client.close();}
}
if(isDirectInvocation(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--config'||args[2]!=='--output')throw new Error('Usage: --config ABS_CONFIG --output ABS_FRESH_DIRECTORY');
  console.log(JSON.stringify(await runPreflight(args[1],args[3])));
 }catch(error){console.error(String(error));process.exitCode=1;}
}
