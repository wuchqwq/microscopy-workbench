#!/usr/bin/env node
// Plugin composition only: the scientific runtime, journals and tools stay shared.
import path from 'node:path';
import os from 'node:os';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startScienceServer} from '../science-server.mjs';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import type {startStdioMcpServer} from '../lib/runtime/stdio_mcp_server.mjs';

export type Environment = Record<string,string|undefined>;
export interface PluginSettings {
  readonly schema_version: 1;
  readonly python: string;
  readonly workspace_root: string;
  readonly structures: boolean;
  readonly structure_python?: string;
}

const allowed=new Set(['schema_version','python','workspace_root','structures','structure_python']);
function absolute(value: unknown,label: string): string {
  if(typeof value!=='string'||!value.trim()||!path.isAbsolute(value))throw new Error(label+' must be an absolute path');
  return path.resolve(value);
}
function isRecord(value: unknown): value is Record<string,unknown> {
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
export function validatePluginSettings(settings: unknown): PluginSettings {
  if(!isRecord(settings)||settings.schema_version!==1)throw new Error('Plugin settings require schema_version: 1');
  for(const key of Object.keys(settings))if(!allowed.has(key))throw new Error('Unknown plugin setting: '+key);
  // Preserve validation order as well as the serialized settings shape.
  const python=absolute(settings.python,'python');
  const workspace_root=absolute(settings.workspace_root,'workspace_root');
  const structures=settings.structures??false;
  if(typeof structures!=='boolean')throw new Error('structures must be a boolean');
  return {schema_version:1,python,workspace_root,structures,
    ...(settings.structure_python!==undefined?{structure_python:absolute(settings.structure_python,'structure_python')}:{})};
}
export interface PluginEnvironmentOptions {
  env?: Environment;
  settingsPath?: string;
  home?: string;
}
export function resolvePluginEnvironment({env=process.env,settingsPath,home=os.homedir()}: PluginEnvironmentOptions={}): Environment {
  const next={...env};
  const explicit=settingsPath??env.MICROSCOPY_PLUGIN_CONFIG;
  const candidate=explicit?absolute(explicit,'MICROSCOPY_PLUGIN_CONFIG'):path.join(home,'.microscopy-workbench','plugin-config.json');
  if(explicit||existsSync(candidate)){
    if(!statSync(candidate).isFile()||statSync(candidate).size>16384)throw new Error('Plugin settings must be a regular JSON file <=16 KiB');
    const raw: unknown=JSON.parse(readFileSync(candidate,'utf8'));
    const settings=validatePluginSettings(raw);
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
export type PluginServerOptions = NonNullable<Parameters<typeof startScienceServer>[0]>
  & NonNullable<Parameters<typeof startStdioMcpServer>[0]> & PluginEnvironmentOptions;
export function startPluginServer({env=process.env,settingsPath,...options}: PluginServerOptions={}) {
  return startScienceServer({runtime:createScienceRuntime({env:resolvePluginEnvironment({env,settingsPath})}),...options});
}
export function runPluginCLI(args: string[]=process.argv.slice(2)): void {
  try{
    if(args.length!==0&&(args.length!==2||args[0]!=='--config'))throw new Error('Usage: node tools/plugin_server.mjs [--config /absolute/plugin-config.json]');
    startPluginServer({settingsPath:args[1]});
  }catch(error){console.error('Microscopy Workbench plugin: '+(error instanceof Error?error.message:undefined));process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runPluginCLI();
