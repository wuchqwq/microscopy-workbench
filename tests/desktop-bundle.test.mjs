import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';import {tmpdir} from 'node:os';import {mkdirSync,mkdtempSync,writeFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {bundledDesktopArguments} from '../lib/desktop_bundle.mjs';
test('bundle paths follow relocation and preserve user workspace/source arguments',t=>{
 const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),'bundle-paths-')));t.after(()=>rmSync(root,{recursive:true,force:true}));for(const n of ['node/bin/node','python/bin/python3.13']){const p=path.join(root,'runtimes',n);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,'local path fixture, not executable');}
 const args=bundledDesktopArguments(root,['-psn_0_42','--workspace',path.join(root,'user workspace')]);assert.deepEqual(args,['--node',path.join(root,'runtimes/node/bin/node'),'--python',path.join(root,'runtimes/python/bin/python3.13'),'--workspace',path.join(root,'user workspace')]);
 assert.throws(()=>bundledDesktopArguments(root,['--python','/different']),/bundled/);assert.throws(()=>bundledDesktopArguments('relative'),/Absolute/);
});
test('missing or linked-outside bundled runtimes fail before startup',t=>{
 const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),'bundle-refuse-'))),outside=realpathSync.native(mkdtempSync(path.join(tmpdir(),'outside-runtime-')));t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});});assert.throws(()=>bundledDesktopArguments(root),/missing/);const target=path.join(outside,'node');writeFileSync(target,'not executable');mkdirSync(path.join(root,'runtimes/node/bin'),{recursive:true});symlinkSync(target,path.join(root,'runtimes/node/bin/node'));assert.throws(()=>bundledDesktopArguments(root),/missing|escapes/);
});
