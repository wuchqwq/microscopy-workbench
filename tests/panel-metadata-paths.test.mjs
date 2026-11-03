import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtempSync,mkdirSync,readdirSync,rmSync,rmdirSync,symlinkSync,existsSync,realpathSync} from 'node:fs';
import {prepareOwnedPanelRegistration,loadOwnedPanelRegistration} from '../lib/panel_ownership.mjs';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';
import {ordinaryWorkspaceMetadataDirectory,ordinaryWorkspaceMetadataTarget} from '../lib/workspace_metadata_paths.mjs';
const panelId='a'.repeat(32);
function fixture(t){const workspace=mkdtempSync(path.join(tmpdir(),'panel-path-review-')),outside=mkdtempSync(path.join(tmpdir(),'panel-path-outside-'));t.after(()=>{for(const directory of [workspace,outside]){assert.equal(path.dirname(directory),path.resolve(tmpdir()));rmSync(directory,{recursive:true,force:true});}});return {workspace,outside};}
for(const relative of ['panel-registry','panel-registry/panels','panel-registry/registrations','panel-journals'])test('owned helper refuses an escaping '+relative+' junction before metadata writes',t=>{
 const f=fixture(t),linked=path.join(f.workspace,...relative.split('/'));mkdirSync(path.dirname(linked),{recursive:true});symlinkSync(f.outside,linked,'junction');
 let error;try{prepareOwnedPanelRegistration({workspace:f.workspace,panel_id:panelId});}catch(e){error=e;}
 assert.deepEqual(readdirSync(f.outside),[],'No lock, registration, journal or subdirectory may be created outside the opened workspace');assert.ok(error,'The linked owned metadata directory must be refused');
});
test('MCP manager refuses an escaping request-receipt directory before writing an intent',async t=>{
 const f=fixture(t);mkdirSync(path.join(f.workspace,'panel-registry'));symlinkSync(f.outside,path.join(f.workspace,'panel-registry','requests'),'junction');let inspected=0,launched=0;
 const manager=new ImagePanelManager({workspace:f.workspace,python:process.execPath,inspect:async()=>{inspected++;return {content:[{type:'image',mimeType:'image/png',data:'iVBORw0KGgo='}]};},launch:async()=>{launched++;throw Error('not reached');}});
 await assert.rejects(Promise.resolve().then(()=>manager.call('image_panel_open',{object_id:'b'.repeat(32),request_id:'outside-intent'})));assert.deepEqual(readdirSync(f.outside),[],'No request intent may be written through a linked registry directory');assert.equal(inspected,0);assert.equal(launched,0);
});
test('loading an assigned helper refuses a replaced journal junction before helper entry',t=>{
 const f=fixture(t),prepared=prepareOwnedPanelRegistration({workspace:f.workspace,panel_id:panelId});assert.equal(path.dirname(prepared.journalDirectory),path.join(realpathSync.native(f.workspace),'panel-journals'));rmdirSync(prepared.journalDirectory);symlinkSync(f.outside,prepared.journalDirectory,'junction');
 assert.throws(()=>loadOwnedPanelRegistration(f.workspace,prepared.registration_file));assert.deepEqual(readdirSync(f.outside),[]);assert.equal(existsSync(path.join(f.workspace,'panel-registry','panels',panelId+'.lock')),true,'Unknown original claim is retained, not silently released');
});
test('an explicitly selected workspace alias retains canonical ordinary metadata targets',t=>{
 const f=fixture(t),alias=path.join(f.outside,'selected-workspace-alias');symlinkSync(f.workspace,alias,'junction');ordinaryWorkspaceMetadataDirectory(alias,'panel-registry/requests',{create:true});
 const requested=path.join(alias,'panel-registry','requests','result.json'),canonical=path.join(realpathSync.native(f.workspace),'panel-registry','requests','result.json');assert.equal(ordinaryWorkspaceMetadataTarget(alias,requested),canonical);assert.equal(ordinaryWorkspaceMetadataTarget(alias,canonical),canonical);
});
