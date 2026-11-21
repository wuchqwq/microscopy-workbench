// Resolve only runtimes carried by this application. No Homebrew, venv or PATH
// discovery, downloads, installation, credentials or model connection here.
import path from 'node:path';
import {existsSync,lstatSync,realpathSync} from 'node:fs';

export const bundledDesktopViewerSwitch='--mwb-attached-viewer';
const desktopArguments=(args:readonly string[])=>args.filter(arg=>!/^\-psn_\d+_\d+$/.test(arg));

export function bundledDesktopViewerArguments(args:readonly string[]):string[]|null {
 const selected=desktopArguments(args);
 return selected[0]===bundledDesktopViewerSwitch?selected.slice(1):null;
}

// package_mac.py places the emitted runtime below Contents/Resources/app and
// preserves the bundle's native Electron executable at Contents/MacOS/Electron.
export function bundledDesktopExecutable(bundleRoot:string):string|null {
 const root=realpathSync.native(bundleRoot);
 const resources=path.dirname(root),contents=path.dirname(resources);
 if(path.basename(root)!=='app'||path.basename(resources)!=='Resources'||path.basename(contents)!=='Contents'||path.extname(path.dirname(contents))!=='.app')return null;
 const executable=path.join(contents,'MacOS','Electron');
 if(!existsSync(executable)||!lstatSync(executable).isFile()||realpathSync.native(executable)!==executable)throw Error('Bundled Electron executable missing or linked outside application');
 return executable;
}
export function bundledDesktopArguments(bundleRoot:string,args:readonly string[]=[]):string[]{
 if(!path.isAbsolute(bundleRoot))throw Error('Absolute application root required');
 const root=realpathSync.native(bundleRoot),selected=desktopArguments(args);
 if(selected.some(a=>a==='--node'||a==='--python'))throw Error('The application uses its bundled Node and Python runtimes');
 const executable=(relative:string)=>{const file=path.join(root,relative);if(!existsSync(file)||!lstatSync(file).isFile())throw Error('Bundled runtime missing: '+relative);const actual=realpathSync.native(file),rel=path.relative(root,actual);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Bundled runtime escapes application');return actual;};
 return ['--node',executable('runtimes/node/bin/node'),'--python',executable('runtimes/python/bin/python3.13'),...selected];
}
