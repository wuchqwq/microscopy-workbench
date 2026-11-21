import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';import {tmpdir} from 'node:os';import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync,realpathSync,unlinkSync} from 'node:fs';
import {bundledDesktopArguments,bundledDesktopExecutable,bundledDesktopViewerArguments,bundledDesktopViewerSwitch} from '../lib/desktop_bundle.mjs';
test('bundle paths follow relocation and preserve user workspace/source arguments',t=>{
 const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),'bundle-paths-')));t.after(()=>rmSync(root,{recursive:true,force:true}));for(const n of ['node/bin/node','python/bin/python3.13']){const p=path.join(root,'runtimes',n);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,'local path fixture, not executable');}
 const args=bundledDesktopArguments(root,['-psn_0_42','--workspace',path.join(root,'user workspace')]);assert.deepEqual(args,['--node',path.join(root,'runtimes/node/bin/node'),'--python',path.join(root,'runtimes/python/bin/python3.13'),'--workspace',path.join(root,'user workspace')]);
 assert.throws(()=>bundledDesktopArguments(root,['--python','/different']),/bundled/);assert.throws(()=>bundledDesktopArguments('relative'),/Absolute/);
});
test('missing or linked-outside bundled runtimes fail before startup',t=>{
 const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),'bundle-refuse-'))),outside=realpathSync.native(mkdtempSync(path.join(tmpdir(),'outside-runtime-')));t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});});assert.throws(()=>bundledDesktopArguments(root),/missing/);const target=path.join(outside,'node');writeFileSync(target,'not executable');mkdirSync(path.join(root,'runtimes/node/bin'),{recursive:true});symlinkSync(target,path.join(root,'runtimes/node/bin/node'));assert.throws(()=>bundledDesktopArguments(root),/missing|escapes/);
});

test('relocated macOS bundle resolves its own Electron without a development dependency',t=>{
 const scratch=realpathSync.native(mkdtempSync(path.join(tmpdir(),'bundled-viewer-')));
 t.after(()=>rmSync(scratch,{recursive:true,force:true}));
 const contents=path.join(scratch,'Relocated Workbench.app','Contents');
 const app=path.join(contents,'Resources','app'),exe=path.join(contents,'MacOS','Electron');
 mkdirSync(app,{recursive:true});mkdirSync(path.dirname(exe),{recursive:true});writeFileSync(exe,'fixture');
 assert.equal(bundledDesktopExecutable(app),exe);
 assert.equal(bundledDesktopExecutable(scratch),null);
 unlinkSync(exe);
 assert.throws(()=>bundledDesktopExecutable(app),/Bundled Electron executable/);
 const outside=path.join(scratch,'outside-Electron');
 writeFileSync(outside,'fixture');symlinkSync(outside,exe);
 assert.throws(()=>bundledDesktopExecutable(app),/Bundled Electron executable/);
});

test('packaged Electron dispatches attached requests without importing the ordinary app entry',async()=>{
 const entry=new URL('../tools/desktop_bundle_entry.mjs',import.meta.url);
 const code=readFileSync(entry,'utf8').replace(/^import .*;\r?\n/gm,'')
  .replaceAll('import.meta.url',JSON.stringify(entry.href)).replace(/\bimport\(/g,'__load(');
 const identity=['/isolated workspace','a'.repeat(32),'b'.repeat(32),'1','original-request'];
 const run=async(args,defaultApp=false)=>{
  const process={versions:{electron:'test'},execPath:'/Applications/Workbench.app/Contents/MacOS/Electron',defaultApp,env:{PYTHONPATH:'untrusted',PYTHONHOME:'untrusted'}};
  process.argv=[process.execPath,...(defaultApp?['app']:[]),...args];
  const loaded=[];let mainCalls=0;
  const context={URL,fileURLToPath,process,bundledDesktopViewerArguments, bundledDesktopArguments:(_root,user)=>{mainCalls++;return user;},__load:async script=>{loaded.push(script);}};
  await vm.runInNewContext('(async()=>{'+code+'})()',context);
  return {loaded,args:Array.from(process.argv.slice(2)),mainCalls,pythonPath:process.env.PYTHONPATH};
 };
 for(const defaultApp of [false,true]){
  const attached=await run(['-psn_0_42',bundledDesktopViewerSwitch,...identity],defaultApp);
  assert.deepEqual(attached,{loaded:['./desktop_panel_viewer.mjs'],args:identity,mainCalls:0,pythonPath:undefined});
  const malformed=await run([bundledDesktopViewerSwitch],defaultApp);
  assert.deepEqual(malformed.loaded,['./desktop_panel_viewer.mjs']);assert.equal(malformed.mainCalls,0);
  const standard=await run(['--workspace','/isolated workspace'],defaultApp);
  assert.deepEqual(standard.loaded,['./desktop_main.mjs']);assert.equal(standard.mainCalls,1);
 }
});
