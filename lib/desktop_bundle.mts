// Resolve only runtimes carried by this application. No Homebrew, venv or PATH
// discovery, downloads, installation, credentials or model connection here.
import path from 'node:path';
import {existsSync,lstatSync,realpathSync} from 'node:fs';
export function bundledDesktopArguments(bundleRoot:string,args:readonly string[]=[]):string[]{
 if(!path.isAbsolute(bundleRoot))throw Error('Absolute application root required');
 const root=realpathSync.native(bundleRoot),selected=args.filter(a=>!/^\-psn_\d+_\d+$/.test(a));
 if(selected.some(a=>a==='--node'||a==='--python'))throw Error('The application uses its bundled Node and Python runtimes');
 const executable=(relative:string)=>{const file=path.join(root,relative);if(!existsSync(file)||!lstatSync(file).isFile())throw Error('Bundled runtime missing: '+relative);const actual=realpathSync.native(file),rel=path.relative(root,actual);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Bundled runtime escapes application');return actual;};
 return ['--node',executable('runtimes/node/bin/node'),'--python',executable('runtimes/python/bin/python3.13'),...selected];
}
