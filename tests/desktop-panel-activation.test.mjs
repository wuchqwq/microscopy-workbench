import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
 activateDesktopPanel,acknowledgeDesktopPanelActivation,assertDesktopPanelIntent,attachedDesktopPanelStopped,desktopPanelProfile,
 DesktopPanelNotDispatched,readDesktopPanelActivation,showDesktopPanelWindow,
} from '../lib/desktop_panel_activation.mjs';
import {prepareOwnedPanelRegistration} from '../lib/panel_ownership.mjs';

function fixture(t) {
 const workspace=mkdtempSync(path.join(tmpdir(),'mwb-desktop-panel-'));
 t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 return {workspace,panelId:'a'.repeat(32),helperSessionId:'b'.repeat(32),generation:2,requestId:'activation-1'};
}

test('activation receipt is immutable, exact-generation and safe to query without a helper',async t=>{
 const input=fixture(t);
 assert.equal(readDesktopPanelActivation(input),null);
 const profile=desktopPanelProfile(input,true);
 const observed={status:'activated',visible:true,focused:false,reused:true};
 acknowledgeDesktopPanelActivation(input,observed);
 assert.deepEqual(readDesktopPanelActivation(input),observed);
 acknowledgeDesktopPanelActivation(input,{status:'refused',reason:'viewer_closed'});
 assert.deepEqual(readDesktopPanelActivation(input),observed);
 assert.deepEqual(await activateDesktopPanel({...input,url:'unneeded for receipt recovery'}),observed);
 assert.equal(readDesktopPanelActivation({...input,requestId:'activation-2'}),null);
 assert.throws(()=>readDesktopPanelActivation({...input,generation:3}),/receipt identity mismatch/);
 assert.throws(()=>readDesktopPanelActivation({...input,requestId:'../activation-1'}),/Invalid desktop Panel activation identity/);
 const directory=path.dirname(profile),receipt=readdirSync(directory).find(file=>file.endsWith('.json'));
 const file=path.join(directory,receipt),record=JSON.parse(readFileSync(file,'utf8'));
 assert.deepEqual(Object.keys(record).sort(),['generation','helper_session_id','panel_id','request_id','result','schema_version']);
 writeFileSync(file,JSON.stringify({...record,result:{...observed,focused:true,visible:false}}));
 assert.throws(()=>readDesktopPanelActivation(input),/Invalid desktop Panel activation result/);
});

test('missing exact owned helper refuses before dispatch and leaves no activation receipt',async t=>{
 const input=fixture(t);
 await assert.rejects(activateDesktopPanel({...input,url:`http://127.0.0.1:12345/#${'a'.repeat(48)}`}),DesktopPanelNotDispatched);
 assert.equal(readDesktopPanelActivation(input),null);
});

test('native entry requires the exact dispatching manager intent',t=>{
 const input=fixture(t);
 const directory=path.join(input.workspace,'panel-registry','requests');
 mkdirSync(directory,{recursive:true});
 const intent=path.join(directory,input.requestId+'.json');
 const args={panel_id:input.panelId,request_id:input.requestId};
 const record={schema_version:1,name:'image_panel_activate',status:'submitted',stage:'dispatching',
  ...args,arguments:args,helper_session_id:input.helperSessionId,generation:input.generation};
 assert.throws(()=>assertDesktopPanelIntent(input),/ENOENT/);
 writeFileSync(intent,JSON.stringify(record));
 assert.doesNotThrow(()=>assertDesktopPanelIntent(input));
 assert.throws(()=>assertDesktopPanelIntent({...input,generation:1}),/original submitted intent/);
 writeFileSync(intent,JSON.stringify({...record,status:'completed'}));
 assert.throws(()=>assertDesktopPanelIntent(input),/original submitted intent/);
});

function publishHelper({workspace,panelId}) {
 const helper=prepareOwnedPanelRegistration({workspace,panel_id:panelId});
 const state={panel_id:panelId,helper_session_id:helper.helper_session_id,panel_generation:helper.generation};
 const checkpoint=path.join(helper.journalDirectory,'current-selection.json');
 writeFileSync(checkpoint,JSON.stringify({...state,schema_version:1,object_id:'d'.repeat(32)}));
 helper.publish({state:()=>state,server:{address:()=>({port:12345})},token:'b'.repeat(48),evidenceToken:'c'.repeat(64)});
 return {helper,checkpoint};
}

test('recovery close requires a stopped exact helper or qualified successor; a live PID refuses',async t=>{
 const input=fixture(t);
 assert.equal(attachedDesktopPanelStopped(input),false);
 const {helper}=publishHelper(input);
 const attached={...input,helperSessionId:helper.helper_session_id,generation:helper.generation};
 // Nothing listens on the test port. A transport error cannot prove a stop.
 assert.equal(attachedDesktopPanelStopped(attached),false);
 assert.equal(attachedDesktopPanelStopped({...attached,helperSessionId:'e'.repeat(32)}),false);
 await helper.close({close:async()=>{}});
 assert.equal(attachedDesktopPanelStopped(attached),true);
 const {helper:successor,checkpoint}=publishHelper(input);
 assert.equal(attachedDesktopPanelStopped(attached),true);
 assert.equal(attachedDesktopPanelStopped({...attached,helperSessionId:successor.helper_session_id,generation:successor.generation}),false);
 const saved=checkpoint+'.saved';
 renameSync(checkpoint,saved);
 assert.equal(attachedDesktopPanelStopped(attached),false);
 renameSync(saved,checkpoint);
 assert.equal(attachedDesktopPanelStopped(attached),true);
});

test('a visible and focused window cannot report activation with a gone renderer',async t=>{
 const input=fixture(t);
 desktopPanelProfile(input,true);
 let gone=true,focusCalls=0,dieOnFocus=false;
 const window={isDestroyed:()=>false,isMinimized:()=>false,isVisible:()=>true,isFocused:()=>true,
  restore:()=>assert.fail('visible window must not restore'),show:()=>assert.fail('visible window must not show'),
  focus:()=>{focusCalls++;if(dieOnFocus)gone=true;}};
 const refused={status:'refused',reason:'renderer_gone'};
 assert.deepEqual(await showDesktopPanelWindow(window,true,()=>gone),refused);
 assert.equal(focusCalls,0);
 gone=false;
 assert.deepEqual(await showDesktopPanelWindow(window,true,()=>gone),{status:'activated',visible:true,focused:true,reused:true});
 dieOnFocus=true;
 const receipt=await showDesktopPanelWindow(window,true,()=>gone);
 assert.deepEqual(receipt,refused);
 assert.equal(focusCalls,2);
 acknowledgeDesktopPanelActivation(input,receipt);
 assert.deepEqual(readDesktopPanelActivation(input),refused);
});
