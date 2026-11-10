import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fixture,ownerFor} from './research-host-input-fixture.mjs';
import {prepareResearchHostImage} from '../lib/research_host_input.mjs';
import {readJointResearchHistory} from '../lib/research_joint_history.mjs';
import {JointResearchOwner} from '../lib/research_joint_owner.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
function saved(t,status='completed'){
 const f=fixture(t),id='a'.repeat(32),dir=path.join(f.workspace,'research-runs','joint-'+id);mkdirSync(dir,{recursive:true});const prepared=prepareResearchHostImage(f.options),record={review_id:id,status,confirmation:'native_public_send',review:{question:f.options.text,source:prepared.source},host:{agent_messages:[{text:'Saved model text, not scientific authority',phase:'final_answer'}]},results:[],unresolved_request_ids:[]};writeFileSync(path.join(dir,'owner.json'),JSON.stringify(record));return {f,id,dir,record};
}
test('reopen reads saved model text and exact source without connecting or rewriting',t=>{
 const h=saved(t),file=path.join(h.dir,'owner.json'),before=sha(readFileSync(file)),history=readJointResearchHistory(h.f.workspace);assert.equal(history.length,1);assert.equal(history[0].source_view_id,h.f.options.view_id);assert.equal(history[0].agent_messages[0].text,h.record.host.agent_messages[0].text);assert.equal(history[0].verification,'original_provider_records_rechecked');assert.equal(sha(readFileSync(file)),before);
 const state=ownerFor(h.f).state.panel,owner=new JointResearchOwner({workspace:h.f.workspace,python:process.execPath,getState:()=>state});assert.equal(owner.snapshot().history[0].review_id,h.id);assert.equal(owner.snapshot().host,null);assert.equal(owner.snapshot().locked,false);
});
test('changed saved input is labelled unverified, never silently rebound',t=>{
 const h=saved(t);writeFileSync(path.join(h.f.workspace,'objects',h.f.options.frame_id,'data.npy'),'changed');const history=readJointResearchHistory(h.f.workspace);assert.equal(history[0].status,'unverified_history');assert.deepEqual(history[0].results,[]);assert.deepEqual(history[0].agent_messages,[]);const owner=new JointResearchOwner({workspace:h.f.workspace,python:process.execPath,getState:()=>ownerFor(h.f).state.panel});assert.equal(owner.snapshot().status,'unknown');assert.equal(owner.snapshot().locked,true);
});
for(const status of ['starting','running','stopping','unknown'])test('reopen retains a fence for original '+status,t=>{
 const h=saved(t,status),state=ownerFor(h.f).state.panel,owner=new JointResearchOwner({workspace:h.f.workspace,python:process.execPath,getState:()=>state});assert.equal(owner.snapshot().status,'unknown');assert.equal(owner.snapshot().locked,true);assert.throws(()=>owner.begin(0),/锁定/);assert.equal(owner.snapshot().host,null);
});

test('corrupt original unknown run never unlocks a reopened workspace',t=>{const h=saved(t,'unknown');writeFileSync(path.join(h.dir,'owner.json'),'{corrupt');const owner=new JointResearchOwner({workspace:h.f.workspace,python:process.execPath,getState:()=>ownerFor(h.f).state.panel});assert.equal(owner.snapshot().locked,true);assert.equal(owner.snapshot().status,'unknown');assert.throws(()=>owner.begin(0),/锁定/);});

test('truncated but parseable original owner cannot disappear from the restart fence',t=>{const h=saved(t,'unknown');writeFileSync(path.join(h.dir,'owner.json'),JSON.stringify({status:'running'}));assert.equal(readJointResearchHistory(h.f.workspace)[0].status,'unverified_history');const owner=new JointResearchOwner({workspace:h.f.workspace,python:process.execPath,getState:()=>ownerFor(h.f).state.panel});assert.equal(owner.snapshot().locked,true);});
