// Formal Panel/MCP presentation contracts with a controlled provider.
// Actual science-server acceptance is separate in numeric-presentation-stdio-smoke.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {admitPanelNumericResult} from '../lib/panel_numeric_presentation.mjs';
import {createImagePanel} from '../tools/image_panel.mjs';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';
import {prepareOwnedPanelRegistration} from '../lib/panel_ownership.mjs';
const id=n=>n.toString(16).padStart(32,'0'),F=id(1),V=id(2),S=id(3),P=id(4),T=id(5),PID=id(6);
const grid={source_grid_object_id:F,array_sha256:'a'.repeat(64),shape_yx:[4,4],dtype:'uint16',source_rect_xyxy:[0,0,4,4],coordinate_space:'source_pixels'};
const plane={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,4,4],image_rect_xyxy:[0,0,4,4]};
const base={state:'completed',backend:'external-image-workspace'},view={...base,object_id:V,request_id:'view-original',kind:'view',parent_object_id:F,scientific_grid_identity:grid,shape_yx:[4,4],dtype:'uint16',panels:[plane],annotations:[]};
const result=kind=>({...base,object_id:kind==='statistics'?S:P,request_id:kind+'-original',kind,parent_object_id:V,scientific_grid_identity:structuredClone(grid),component:'raw',coordinate_space:'source_pixels',...(kind==='statistics'?{source_rect_xyxy:[0,0,2,2],statistics:{sample_count:4,mean:2,stddev:1,minimum:1,maximum:3}}:{distance_unit:'pixel',physical_distance_unit:null,sampling:{sample_count:2,interpolation:'nearest',line_width:1},samples:{value:[1,3],distance:[0,1],coordinates_xy:[[0,0],[1,0]],indices_xy:[[0,0],[1,0]],physical_distance:null}})});
const data=r=>JSON.parse(r.content.find(x=>x.type==='text').text);
async function fixture(run){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-numeric-show-')),records=new Map([[V,view],[F,{...base,object_id:F,request_id:'frame-original',kind:'frame',source_object_id:T,frame_index:0}],[T,{...base,object_id:T,request_id:'open-original',kind:'tiff_source'}],[S,result('statistics')],[P,result('profile')]]),calls=[];let panel,owner,hold=null;
 const client=()=>({async rpc(method){return {result:method==='tools/list'?{tools:['image_info'].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){calls.push({name,args:structuredClone(args)});assert.equal(name,'image_info','Presentation cannot run science');if(hold&&args.object_id===P){const f=hold;hold=null;await f();}const record=structuredClone(records.get(args.object_id));assert.ok(record);return {data:record,...(args.object_id===V?{png:'iVBORw0KGgo='}:{})};},async close(){}});
 const open=async()=>{owner=prepareOwnedPanelRegistration({workspace,panel_id:PID});panel=await createImagePanel({workspace,python:process.execPath,object_id:V,client:client(),panel_id:PID,helper_session_id:owner.helper_session_id,panel_generation:owner.generation,journalDirectory:owner.journalDirectory,...(owner.checkpoint?{resume_checkpoint:owner.checkpoint}:{})});owner.publish(panel);};await open();
 const manager=()=>new ImagePanelManager({workspace,python:process.execPath,inspect:async object_id=>({content:[{type:'text',text:JSON.stringify((await client().tool('image_info',{object_id})).data)}]})});
 const show=(object_id,request_id,extra={})=>manager().call('image_panel_show',{panel_id:PID,object_id,request_id,expected_object_id:V,draft_revision:panel.state().edit_state.draft_revision,...extra});
 const draft=async(dirty=false)=>{const s=panel.state(),origin=panel.url.split('/#')[0],r=await fetch(origin+'/api/action',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({expected_object_id:V,draft_revision:s.edit_state.draft_revision,action:'draft',params:{draft_revision:s.edit_state.draft_revision+1,dirty,gesture_active:false,selection:null,annotation_edit:null,confirm_persistence:true}})});assert.equal(r.status,200);};
 try{await run({records,calls,panel:()=>panel,show,draft,manager,hold:f=>hold=f,reopen:async()=>{await owner.close(panel);await open();}});}finally{await owner.close(panel);rmSync(workspace,{recursive:true,force:true});}
}
test('numeric admission requires exact provider identity, frame, grid, calibration and bounded complete values',()=>{
 for(const kind of ['statistics','profile']){const r=result(kind);assert.equal(admitPanelNumericResult(r,view,r.object_id,F,F),kind);for(const change of [r=>r.object_id=id(50),r=>r.state='pending',r=>r.request_id='../invalid',r=>r.scientific_grid_identity.array_sha256='b'.repeat(64),r=>r.xy_calibration={calibration_id:id(40)}]){const broken=structuredClone(r);change(broken);assert.throws(()=>admitPanelNumericResult(broken,view,r.object_id,F,F));}assert.throws(()=>admitPanelNumericResult(r,view,r.object_id,id(20),F));assert.throws(()=>admitPanelNumericResult(r,view,r.object_id,null,null));}
 const noGrid={...view};delete noGrid.scientific_grid_identity;assert.equal(admitPanelNumericResult(result('statistics'),noGrid,S,F,F),'statistics');const rawInput=result('statistics');rawInput.parent_object_id=F;assert.throws(()=>admitPanelNumericResult(rawInput,noGrid,S,F,F),/exact view.object.object_id/);
 const stats=result('statistics');stats.statistics.mean=NaN;assert.throws(()=>admitPanelNumericResult(stats,view,S,F,F));const profile=result('profile');profile.samples.value.pop();assert.throws(()=>admitPanelNumericResult(profile,view,P,F,F));
});
test('formal MCP show attaches both original numeric records, preserves canvas and recovers/reopens without science',()=>fixture(async f=>{
 const before=structuredClone(f.panel().state()),shown=data(await f.show(S,'show-stats'));assert.equal(shown.view.presentation.target,'numeric_results');assert.equal(shown.view.presentation.canvas_replaced,false);assert.equal(shown.view.numeric_results.statistics.request_id,'statistics-original');
 await f.show(P,'show-profile');const current=f.panel().state();assert.equal(current.object.object_id,V);assert.equal(current.png_base64,before.png_base64);assert.deepEqual(current.selection,before.selection);assert.deepEqual(current.window_collection,before.window_collection);assert.equal(current.numeric_results.profile.object_id,P);assert.equal(current.workspace_analysis.dirty,true);
 await f.draft(true);const replay=data(await f.show(S,'show-stats',{draft_revision:0}));assert.equal(replay.recovered,true);assert.deepEqual(replay.view,shown.view,'Original receipt, not current state');assert.equal(f.panel().state().edit_state.dirty,true);assert.equal(f.panel().state().numeric_results.profile.object_id,P);
 await f.reopen();assert.equal(f.panel().state().numeric_results.statistics.object_id,S);assert.equal(f.panel().state().numeric_results.profile.object_id,P);assert.ok(f.calls.every(c=>c.name==='image_info'));
}));
test('dirty/stale view refuses numeric adoption and a failed original presentation cannot later replay',()=>fixture(async f=>{
 await f.draft(true);await assert.rejects(f.show(S,'dirty-show'),/settled view/);assert.equal(f.panel().state().numeric_results.statistics,null);await f.draft(false);await assert.rejects(f.show(S,'dirty-show',{draft_revision:1}),/settled view/);await assert.rejects(f.show(S,'stale-show',{draft_revision:0}),/settled view/);await assert.rejects(f.show(S,'stale-object',{expected_object_id:F}),/Stale panel/);assert.equal(f.panel().state().numeric_results.statistics,null);
}));
test('a newer draft arriving during provider inspection cannot be overwritten',()=>fixture(async f=>{
 f.hold(()=>f.draft(true));await assert.rejects(f.show(P,'interrupted-profile'),/settled view/);assert.equal(f.panel().state().numeric_results.profile,null);assert.equal(f.panel().state().edit_state.dirty,true);
}));
test('foreign or changed numeric records and FFT input links refuse before adoption',()=>fixture(async f=>{
 f.records.get(S).scientific_grid_identity.array_sha256='b'.repeat(64);await assert.rejects(f.show(S,'wrong-grid'),/scientific grid/);await assert.rejects(f.show(P,'wrong-link',{input_reference:{kind:'provider_fft',request_id:'original-fft',source_view_object_id:V,annotation_id:'roi'}}),/cannot carry an FFT/);assert.equal(f.panel().state().object.object_id,V);assert.deepEqual(f.panel().state().numeric_results,{statistics:null,profile:null});
}));
