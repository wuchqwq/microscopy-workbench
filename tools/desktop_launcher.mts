// Ordinary Node launcher. Never pass Electron's process.execPath as Node.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import {DESKTOP_HELP,readDesktopOptions} from '../lib/desktop_contracts.mjs';

export function desktopRuntimePath():string{
 const emittedRoot=fileURLToPath(new URL('../',import.meta.url)),checkout=path.resolve(emittedRoot,'..'),localRuntime=path.join(emittedRoot,'desktop-runtime','package.json'),sourceRuntime=path.join(checkout,'desktop-runtime','package.json');
 const file=existsSync(localRuntime)?localRuntime:sourceRuntime;
 if(!existsSync(file))throw new Error('Desktop runtime is separate: run npm run desktop:install in the source checkout.');
 try{return createRequire(file)('electron') as string;}catch{throw new Error('Desktop runtime missing: run npm run desktop:install (Node >=22.12).');}
}
export async function launchDesktop(argv:readonly string[]):Promise<number>{
 if(argv.length===1&&argv[0]==='--help'){process.stdout.write(DESKTOP_HELP+'\n');return 0;}
 if(process.versions.electron)throw new Error('Launch desktop with ordinary Node, not Electron.');
 const checked=readDesktopOptions(argv,process.execPath),forwarded=[...argv],nodeIndex=forwarded.indexOf('--node');if(nodeIndex>=0)forwarded.splice(nodeIndex,2);
 const args=[fileURLToPath(new URL('./desktop_main.mjs',import.meta.url)),'--node',checked.node,...forwarded];
 return await new Promise<number>((resolve,reject)=>{
  const child=spawn(desktopRuntimePath(),args,{stdio:'inherit',windowsHide:false,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  child.once('error',reject);child.once('exit',code=>resolve(code??1));
  // No kill-on-Ctrl+C: the native close path must settle/save/discard. A terminal
  // shutdown cannot be turned into proof that a scientific request never ran.
 });
}
if(isDirectInvocation(import.meta.url))launchDesktop(process.argv.slice(2)).then(code=>{process.exitCode=code;},error=>{process.stderr.write((error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;});
