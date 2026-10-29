// Metadata/payload contracts only; real decoder/MCP acceptance is test:dm4.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {ImageWorkspace,imageTools} from '../lib/image_workspace.mjs';
import {parseResearcherArgs} from '../tools/researcher_inspector.mjs';

test('DM4 dispatch is additive and explicit TIFF/capture and legacy TIFF payloads remain unchanged',async()=>{
 const workspace=new ImageWorkspace({workspace:path.join(tmpdir(),'dm4-contract-unused'),python:process.execPath}),calls=[];
 workspace.run=payload=>{calls.push(structuredClone(payload));const result=Promise.resolve({ok:true,result:{state:'completed',object_id:'a'.repeat(32)}});result.workerDone=result.then(()=>{});result.requestStop=()=>{};return result;};
 try{
  const source=path.join(tmpdir(),'source.tiff'),original={source_path:source,request_id:'original-tiff'};
  await workspace.call('image_open',original);
  assert.deepEqual(calls.at(-1),{...original,action:'open',workspace:workspace.workspace},'no new default field may alter a saved TIFF fingerprint');
  await workspace.call('image_open',{...original,source_kind:'tiff'});assert.deepEqual(calls.at(-1),calls[0]);
  const dm=path.join(tmpdir(),'ADF.DM4');await workspace.call('image_open',{source_path:dm,request_id:'dm4-auto'});assert.equal(calls.at(-1).action,'open_dm');assert.ok(!('source_kind' in calls.at(-1)));
  await workspace.call('image_open',{source_path:dm,source_kind:'tiff',request_id:'explicit-tiff'});assert.equal(calls.at(-1).action,'open','explicit tiff must not silently try DM decoding');
  await workspace.call('image_open',{source_path:source,source_kind:'capture',request_id:'existing-capture'});assert.equal(calls.at(-1).action,'import_capture');
  await workspace.call('image_frame',{object_id:'a'.repeat(32),frame_index:0,dataset_index:1,request_id:'chosen-dataset'});assert.equal(calls.at(-1).dataset_index,1);
 }finally{workspace.close();}
 assert.deepEqual(imageTools.find(t=>t.name==='image_open').inputSchema.properties.source_kind.enum,['tiff','capture','dm4','dm3']);
});

test('researcher DM4 dataset selector is a bounded human-facing number without exposing object IDs',()=>{
 const common=['--workspace',path.join(tmpdir(),'explicit-workspace'),'--python',process.execPath,'--source',path.join(tmpdir(),'source.dm4')];
 const selected=parseResearcherArgs([...common,'--dataset','2']);assert.equal(selected.dataset,2);
 assert.ok(!('dataset' in parseResearcherArgs(common)));
 for(const value of ['0','-1','1.5','65','nan'])assert.throws(()=>parseResearcherArgs([...common,'--dataset',value]),/dataset/);
});


test('DM3 routing and explicit multidimensional plane selectors remain distinct from TIFF frames',async()=>{
 const workspace=new ImageWorkspace({workspace:path.join(tmpdir(),'dm-planes-contract'),python:process.execPath}),calls=[];
 workspace.run=payload=>{calls.push(structuredClone(payload));const result=Promise.resolve({ok:true,result:{state:'completed',object_id:'a'.repeat(32)}});result.workerDone=result.then(()=>{});result.requestStop=()=>{};return result;};
 try{
  const source=path.join(tmpdir(),'volume.dm3');await workspace.call('image_open',{source_path:source,request_id:'dm3-auto'});assert.equal(calls.at(-1).action,'open_dm');
  await workspace.call('image_open',{source_path:source,source_kind:'dm3',request_id:'dm3-explicit'});assert.equal(calls.at(-1).action,'open_dm');
  assert.throws(()=>workspace.call('image_open',{source_path:source,source_kind:'dm4',request_id:'wrong-explicit-version'}),/match.*extension/);
  const selectors={object_id:'a'.repeat(32),frame_index:0,plane_axes:[2,0],plane_indices:[null,1,null],request_id:'explicit-plane'};
  await workspace.call('image_frame',selectors);assert.deepEqual(calls.at(-1),{...selectors,action:'frame',workspace:workspace.workspace});
 }finally{workspace.close();}
});

test('CLI plane selectors are explicit original-array axes and indices with no implicit defaults',()=>{
 const common=['--workspace',path.join(tmpdir(),'explicit-planes'),'--python',process.execPath,'--source',path.join(tmpdir(),'volume.dm3')];
 const selected=parseResearcherArgs([...common,'--plane-axes','2,0','--plane-indices','*,1,*']);assert.deepEqual(selected.plane_axes,[2,0]);assert.deepEqual(selected.plane_indices,[null,1,null]);
 for(const [axes,indices]of [['1,1','0,*,*'],['2,0','*,*,*'],['5,0','*,1,*'],['1,2','-1,*,*'],['1,2','0,*,*x'],['1,2','9007199254740992,*,*']])assert.throws(()=>parseResearcherArgs([...common,'--plane-axes',axes,'--plane-indices',indices]),/axes|indices|selectors|index/i);
 assert.throws(()=>parseResearcherArgs([...common,'--plane-axes','1,2']),/both/);assert.throws(()=>parseResearcherArgs([...common,'--plane-indices','0,*,*']),/both/);
});
