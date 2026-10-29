#!/usr/bin/env node
// Generate explicit local connection files; never edit an Agent's real config.
import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validatePluginSettings} from './plugin_server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const json=value=>JSON.stringify(value,null,2)+'\n';
export function preparePlugin({python,workspace,output,structures=false,structurePython,node=process.execPath,pluginRoot=root}){
  const settings=validatePluginSettings({schema_version:1,python,workspace_root:workspace,structures,...(structurePython?{structure_python:structurePython}:{})});
  for(const [label,value] of Object.entries({output,node,pluginRoot}))if(typeof value!=='string'||!path.isAbsolute(value))throw new Error(label+' must be an absolute path');
  const destination=path.resolve(output),settingsFile=path.join(destination,'plugin-config.json');
  const server={command:node,args:[path.join(pluginRoot,'tools','plugin_server.mjs'),'--config',settingsFile],startup_timeout_sec:20,tool_timeout_sec:300};
  // The directory must be new: partial previous configuration is not overwritten.
  mkdirSync(destination);
  writeFileSync(settingsFile,json(settings),{flag:'wx'});
  writeFileSync(path.join(destination,'mcp.json'),json({mcpServers:{microscopy_workbench:server}}),{flag:'wx'});
  const toml='[mcp_servers.microscopy_workbench]\ncommand = '+JSON.stringify(server.command)+'\nargs = '+JSON.stringify(server.args)+'\nstartup_timeout_sec = 20\ntool_timeout_sec = 300\n';
  writeFileSync(path.join(destination,'codex.toml'),toml,{flag:'wx'});
  return {configuration:settingsFile,mcp:path.join(destination,'mcp.json'),codex:path.join(destination,'codex.toml'),server,skills:path.join(pluginRoot,'skills','scientific-agent')};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),values={};
    for(let i=0;i<args.length;i++){
      const key=args[i];
      if(key==='--structures'){values.structures=true;continue;}
      const names={'--python':'python','--workspace':'workspace','--output':'output','--structure-python':'structurePython'};
      if(!names[key]||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: node tools/prepare_plugin.mjs --python ABS --workspace ABS --output NEW_ABS_DIRECTORY [--structures] [--structure-python ABS]');
      if(Object.hasOwn(values,names[key]))throw new Error('Duplicate option '+key);
      values[names[key]]=args[++i];
    }
    console.log(json(preparePlugin(values)));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
