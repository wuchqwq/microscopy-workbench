import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';

const A='a'.repeat(32),png='iVBORw0KGgo=';
async function fixture(run){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-launch-')),original=childProcess.spawn,children=[];
 childProcess.spawn=()=>{const child=new EventEmitter();child.stderr=new EventEmitter();child.stderr.resume=()=>{};child.stderr.unref=()=>{child.stderr.unreferenced=true;};child.unref=()=>{child.unreferenced=true;};children.push(child);queueMicrotask(()=>child.emit('spawn'));return child;};syncBuiltinESMExports();
 const m=new ImagePanelManager({workspace,python:path.resolve('unused-python'),inspect:async()=>({content:[{type:'image',mimeType:'image/png',data:png}]}),readyTimeoutMs:160,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({panel_id:panelId(),object:{object_id:A}})})});
 const record=()=>JSON.parse(readFileSync(m.requestFile('launch-test'),'utf8')),panelId=()=>record().panel_id;
 try{await run({m,children,record,publish:()=>writeFileSync(m.connectionFile(panelId()),JSON.stringify({schema_version:1,panel_id:panelId(),port:1234,token:'c'.repeat(48),pid:process.pid}))});}
 finally{childProcess.spawn=original;syncBuiltinESMExports();rmSync(workspace,{recursive:true,force:true});}
}
const args={object_id:A,request_id:'launch-test'};
test('early helper exit reports its bounded startup code before readiness deadline, preserving unknown intent',()=>fixture(async({m,children,record})=>{
 const operation=m.call('image_panel_open',args);setTimeout(()=>{children[0].stderr.emit('data',Buffer.from('Error: WORKSPACE_CONFLICT: private-path-must-not-be-returned\n'));children[0].emit('close',1,null);},15);
 await assert.rejects(operation,/helper exited before readiness.*exit code 1.*WORKSPACE_CONFLICT/);
 assert.equal(record().status,'submitted');assert.doesNotMatch(record().launch_error,/private-path/);
 await assert.rejects(m.call('image_panel_open',args),/helper exited before readiness.*WORKSPACE_CONFLICT/);assert.equal(children.length,1);
 const other=new ImagePanelManager({workspace:m.workspace,python:m.python,inspect:m.inspect});await assert.rejects(other.call('image_panel_open',args),/helper exited before readiness.*WORKSPACE_CONFLICT/);assert.equal(children.length,1);
}));
test('successful readiness releases monitoring without stopping the persistent helper',()=>fixture(async({m,children,publish,record})=>{
 const operation=m.call('image_panel_open',args);setTimeout(publish,15);await operation;
 assert.equal(record().status,'completed');assert.equal(children[0].unreferenced,true);assert.equal(children[0].stderr.unreferenced,true);assert.equal(children[0].listenerCount('close'),0);assert.equal(children[0].stderr.listenerCount('data'),0);
 children[0].emit('close',0,null);await m.call('image_panel_open',args);assert.equal(children.length,1);
}));
test('spawn error is observed promptly and does not turn the intent into a repeatable operation',()=>fixture(async({m,children,record})=>{
 const operation=m.call('image_panel_open',args);setTimeout(()=>children[0].emit('error',Object.assign(new Error('private system detail'),{code:'ENOENT'})),15);
 await assert.rejects(operation,/helper failed to start.*ENOENT/);assert.equal(record().status,'submitted');await assert.rejects(m.call('image_panel_open',args),/helper failed to start/);assert.equal(children.length,1);
}));
test('caller cancellation stops waiting but retains the original monitored operation and its later exit',()=>fixture(async({m,children,record})=>{
 const controller=new AbortController(),operation=m.call('image_panel_open',args,controller.signal);setTimeout(()=>controller.abort(),10);await assert.rejects(operation,/Stopped waiting/);
 const recovery=m.call('image_panel_open',args);children[0].emit('close',0,null);await assert.rejects(recovery,/helper exited before readiness.*exit code 0/);assert.equal(record().status,'submitted');assert.equal(children.length,1);
}));
test('absence of a readiness or exit observation remains unknown and is never automatically relaunched',()=>fixture(async({m,children,record})=>{
 await assert.rejects(m.call('image_panel_open',args),/launch is unverified/);assert.equal(record().status,'submitted');await assert.rejects(m.call('image_panel_open',args),/still unverified/);assert.equal(children.length,1);assert.equal(children[0].listenerCount('close'),0);
}));
