// Workspace-local metadata paths only. Reuses the analysis save layer's
// component-by-component ordinary-directory admission, without following links.
// This guards existing opened workspaces, not hostile concurrent FS mutation.
import path from 'node:path';
import {lstatSync,mkdirSync,realpathSync} from 'node:fs';

function inside(relative:string){return relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
export function ordinaryWorkspaceMetadataDirectory(workspace:string,relative:string,{create=false}:{create?:boolean}={}):string{
 if(!path.isAbsolute(workspace)||path.isAbsolute(relative))throw new Error('Absolute workspace and relative metadata directory required');
 const parts=relative.split(/[\\/]/).filter(Boolean);if(parts.some(part=>part==='.'||part==='..'))throw new Error('Metadata directory escapes workspace');
 const root=realpathSync.native(workspace);let current=root;
 for(const part of parts){
  current=path.join(current,part);let value;
  try{value=lstatSync(current);}catch(error){if(!create||(error as {code?:string}).code!=='ENOENT')throw error;mkdirSync(current);value=lstatSync(current);}
  if(value.isSymbolicLink()||!value.isDirectory()||!inside(path.relative(root,realpathSync.native(current))))throw new Error('Workspace metadata directory is linked or outside its opened workspace');
 }
 return current;
}
export function ordinaryWorkspaceMetadataTarget(workspace:string,file:string):string{
 if(!path.isAbsolute(workspace)||!path.isAbsolute(file))throw new Error('Absolute workspace metadata target required');
 let relative=path.relative(path.resolve(workspace),path.resolve(file));if(!inside(relative))relative=path.relative(realpathSync.native(workspace),path.resolve(file));if(!relative||!inside(relative))throw new Error('Workspace metadata target escapes its opened workspace');
 const parent=path.dirname(relative),directory=ordinaryWorkspaceMetadataDirectory(workspace,parent==='.'?'':parent),target=path.join(directory,path.basename(file));
 try{const value=lstatSync(target);if(value.isSymbolicLink()||!value.isFile())throw new Error('Workspace metadata target is linked or not an ordinary file');}catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;}
 return target;
}
