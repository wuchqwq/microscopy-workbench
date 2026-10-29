#!/usr/bin/env node
// Plugin composition only: the scientific runtime, journals and tools stay shared.
import path from 'node:path';
import os from 'node:os';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startScienceServer} from '../science-server.mjs';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';

const allowed=new Set(['schema_version','python','workspace_root','structures','structure_python']);
function absolute(value,label){
  if(typeof value!=='string'||!value.trim()||!path.isAbsolute(value))throw new Error(label+' must be an absolute path');
  return path.resolve(value);
}
export function validatePluginSettings(settings){
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||settings.schema_version!==1)throw new Error('Plugin settings require schema_version: 1');
  for(const key of Object.keys(settings))if(!allowed.has(key))throw new Error('Unknown plugin setting: '+key);
  const result={schema_version:1,python:absolute(settings.python,'python'),workspace_root:absolute(settings.workspace_root,'workspace_root'),structures:settings.structures??false};
  if(typeof result.structures!=='boolean')throw new Error('structures must be a boolean');
  if(settings.structure_python!==undefined)result.structure_python=absolute(settings.structure_python,'structure_python');
  return result;
}
export function resolvePluginEnvironment({env=process.env,settingsPath,home=os.homedir()}={}){
  const next={...env};
  const explicit=settingsPath??env.MICROSCOPY_PLUGIN_CONFIG;
  const candidate=explicit?absolute(explicit,'MICROSCOPY_PLUGIN_CONFIG'):path.join(home,'.microscopy-workbench','plugin-config.json');
  if(explicit||existsSync(candidate)){
    if(!statSync(candidate).isFile()||statSync(candidate).size>16384)throw new Error('Plugin settings must be a regular JSON file <=16 KiB');
    const settings=validatePluginSettings(JSON.parse(readFileSync(candidate,'utf8')));
    next.MICROSCOPY_PYTHON=settings.python;
    next.MICROSCOPY_IMAGE_WORKSPACE=path.join(settings.workspace_root,'images');
    next.MICROSCOPY_CONTEXT_WORKSPACE=path.join(settings.workspace_root,'contexts');
    next.MICROSCOPY_STRUCTURE_WORKSPACE=settings.structures?path.join(settings.workspace_root,'structures'):'';
    next.MICROSCOPY_STRUCTURE_PYTHON=settings.structure_python??settings.python;
  }else{
    next.MICROSCOPY_PYTHON=env.MICROSCOPY_PYTHON||(process.platform==='win32'?'python':'python3');
    next.MICROSCOPY_IMAGE_WORKSPACE=env.MICROSCOPY_IMAGE_WORKSPACE||path.join(home,'.microscopy-workbench','workspace','images');
    next.MICROSCOPY_CONTEXT_WORKSPACE=env.MICROSCOPY_CONTEXT_WORKSPACE||path.join(home,'.microscopy-workbench','workspace','contexts');
  }
  next.MICROSCOPY_PANEL=env.MICROSCOPY_PANEL??'1';
  next.MICROSCOPY_EXECUTION_OBSERVABILITY=env.MICROSCOPY_EXECUTION_OBSERVABILITY??'1';
  return next;
}
export function startPluginServer({env=process.env,settingsPath,...options}={}){
  return startScienceServer({runtime:createScienceRuntime({env:resolvePluginEnvironment({env,settingsPath})}),...options});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length!==0&&(args.length!==2||args[0]!=='--config'))throw new Error('Usage: node tools/plugin_server.mjs [--config /absolute/plugin-config.json]');
    startPluginServer({settingsPath:args[1]});
  }catch(error){console.error('Microscopy Workbench plugin: '+error.message);process.exitCode=1;}
}
