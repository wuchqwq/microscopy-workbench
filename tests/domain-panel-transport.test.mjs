import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createImagePanel} from '../tools/image_panel.mjs';

const comparisonId='a'.repeat(32), viewId='b'.repeat(32), overviewId='c'.repeat(32);
const png='iVBORw0KGgo=';

async function open(evidence,run){
 const workspace=mkdtempSync(path.join(tmpdir(),'domain-panel-')),calls=[];
 const records=new Map([
  [comparisonId,evidence],
  [viewId,{object_id:viewId,kind:'fft_view',display:{gamma:1},panels:[],annotations:[]}],
  [overviewId,{object_id:overviewId,kind:'view',display:{gamma:1},panels:[],annotations:[]}],
 ]);
 const client={
  async rpc(method){return {result:method==='tools/list'?{tools:[{name:'image_info',inputSchema:{}}]}:{}};},
  async tool(name,args){assert.equal(name,'image_info');calls.push(args.object_id);assert.ok(records.has(args.object_id));return {data:structuredClone(records.get(args.object_id)),png};},
  async close(){},
 };
 let panel;
 try{panel=await createImagePanel({workspace,python:path.resolve('unused-python'),object_id:comparisonId,client});await run(panel,calls);}
 finally{await panel?.close();rmSync(workspace,{recursive:true,force:true});}
}

test('comparison with an unverified reference opens an existing target view without changing its evidence',async()=>{
 const evidence={object_id:comparisonId,kind:'local_signature_compare',overview_object_id:null,reference_index:2,
  source_entries:[{index:0,source_status:'VERIFIED',view_object_id:viewId},{index:2,source_status:'UNVERIFIED',view_object_id:null}],
  relations:[{target_index:0,status:'not_comparable',candidates:[],reason:'R2 coordinate mapping is not VERIFIED'}]};
 await open(evidence,async(panel,calls)=>{
  const state=panel.state();assert.equal(state.object.object_id,viewId);assert.deepEqual(state.domain_evidence,evidence);
  assert.equal(state.domain_evidence.relations[0].status,'not_comparable');
  assert.deepEqual(calls,[comparisonId,viewId]);
 });
});

test('a saved reference overview remains preferred to any target view',async()=>{
 const evidence={object_id:comparisonId,kind:'local_signature_compare',overview_object_id:overviewId,
  source_entries:[{view_object_id:viewId}],relations:[]};
 await open(evidence,async(panel,calls)=>{assert.equal(panel.state().object.object_id,overviewId);assert.deepEqual(calls,[comparisonId,overviewId]);});
});

test('a comparison without any saved display is rejected',async()=>{
 const evidence={object_id:comparisonId,kind:'local_signature_compare',overview_object_id:null,source_entries:[],relations:[]};
 await assert.rejects(open(evidence,async()=>assert.fail('unexpected panel')),/no saved source overview or observation view/);
});
