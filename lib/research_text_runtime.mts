// Explicit auth-source selection without credential discovery or migration.
import path from 'node:path';
export function textHostProcess(directory:string,defaultAuth:boolean,homeOverride:string|undefined,inherited:NodeJS.ProcessEnv){
 if(!path.isAbsolute(directory))throw Error('Absolute external run directory required');
 if(defaultAuth&&homeOverride!==undefined)throw Error('Default auth mode cannot also select MICROSCOPY_CODEX_HOME');
 const home=defaultAuth?null:homeOverride??path.join(directory,'codex-home');if(home!==null&&!path.isAbsolute(home))throw Error('Explicit absolute Codex runtime directory required');
 const env:NodeJS.ProcessEnv={};for(const key of ['PATH','HOME','USER','LOGNAME','LANG','SHELL'])if(inherited[key])env[key]=inherited[key];
 Object.assign(env,{TMPDIR:path.join(directory,'tmp'),TMP:path.join(directory,'tmp'),TEMP:path.join(directory,'tmp'),XDG_CACHE_HOME:path.join(directory,'cache'),PYTHONDONTWRITEBYTECODE:'1'});
 if(home!==null)env.CODEX_HOME=home;
 return {process:{cwd:path.join(directory,'model-cwd'),env},codex_home:home,auth_source:defaultAuth?'official_default_existing':'explicit_external_runtime',runtime_state_notice:defaultAuth?'Default official profile may write small runtime state; its files and desktop sharing were not inspected.':'Selected external Codex runtime; no credential migration.'};
}
