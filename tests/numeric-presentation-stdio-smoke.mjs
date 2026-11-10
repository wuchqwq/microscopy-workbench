// Actual full stdio MCP and owned product Panel. No temporary scientific tools,
// model host, frozen metadata bridge, browser gestures or scientific shortcuts.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';
import {prepareOwnedPanelRegistration} from '../lib/panel_ownership.mjs';
import {DataProbes} from '../ui/image-panel/data-probes.mjs';
const [source,directory]=process.argv.slice(2),python=process.env.MICROSCOPY_PYTHON;
if(!source||!directory||!python)throw Error('Pass an authorized TIFF, new acceptance directory, and MICROSCOPY_PYTHON');
mkdirSync(directory,{recursive:true});const workspace=path.join(directory,'workspace'),sourceHash=createHash('sha256').update(readFileSync(source)).digest('hex'),panelId=randomBytes(16).toString('hex');let client,panel,owner,serial=0;const calls=[];
const call=async(name,args={})=>{calls.push(name);return (await client.tool(name,args)).data;};
const write=async(name,args)=>call(name,{...args,request_id:'formal-numeric-'+(++serial)});
const current=()=>call('image_panel_current',{panel_id:panelId});
const openPanel=async object_id=>{owner=prepareOwnedPanelRegistration({workspace,panel_id:panelId});panel=await createImagePanel({workspace,python,object_id,panel_id:panelId,helper_session_id:owner.helper_session_id,panel_generation:owner.generation,journalDirectory:owner.journalDirectory,...(owner.checkpoint?{resume_checkpoint:owner.checkpoint}:{})});owner.publish(panel);};
const http=async(route,body)=>{const origin=panel.url.split('/#')[0],r=await fetch(origin+route,{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;};
const select=async(rect)=>{const s=panel.state(),selection={kind:'rectangle',coordinates:rect,coordinate_space:'source_pixels',source_object_id:s.frame_identity.frame_object_id,panel:s.object.panels[0]};await http('/api/action',{action:'draft',expected_object_id:s.object.object_id,draft_revision:s.edit_state.draft_revision,params:{draft_revision:s.edit_state.draft_revision+1,dirty:false,gesture_active:false,selection,annotation_edit:null,confirm_persistence:true}});};
const show=async(object_id,request_id)=>{const s=await current();return call('image_panel_show',{panel_id:panelId,object_id,expected_object_id:s.view.object.object_id,draft_revision:s.view.edit_state.draft_revision,request_id});};
try{
 client=new StdioImageClient({workspace,python});await client.rpc('initialize');const catalog=await client.rpc('tools/list');for(const name of ['image_panel_current','image_panel_show','image_statistics','image_profile'])assert.ok(catalog.result.tools.some(t=>t.name===name));
 const opened=await write('image_open',{source_path:source}),frame=await write('image_frame',{object_id:opened.object_id,frame_index:0}),view=await write('image_preview',{object_id:frame.object_id});await openPanel(view.object_id);
 const h=frame.shape_yx[0],w=frame.shape_yx[1],roi=[1,1,Math.min(w,33),Math.min(h,33)];await select(roi);
 const a=await current();assert.deepEqual(a.roi_handoff.current_selection.rect_xyxy,roi);assert.equal(a.roi_handoff.interaction_gate.status,'ready');
 assert.equal(a.roi_handoff.scientific_input.direct_input_object_id,frame.object_id);
 // FFT preparation uses its separate frame recipe. Numeric records are bound
 // to the exact saved current view, including preview scopes/calibration.
 const numericInput=a.view.object.object_id;
 const stats=await write('image_statistics',{object_id:numericInput,rect:roi});const imageBefore=panel.state().png_base64,windowsBefore=structuredClone(panel.state().window_collection);
 const presented=await show(stats.object_id,'present-statistics');assert.equal(presented.view.presentation.target,'numeric_results');assert.equal(presented.view.numeric_results.statistics.object_id,stats.object_id);assert.equal(panel.state().object.object_id,view.object_id);assert.equal(panel.state().png_base64,imageBefore);assert.deepEqual(panel.state().window_collection,windowsBefore);
 const changed=[2,2,Math.min(w,26),Math.min(h,24)];await select(changed);const b=await current();assert.deepEqual(b.roi_handoff.current_selection.rect_xyxy,changed);assert.notEqual(a.view.edit_state.draft_revision,b.view.edit_state.draft_revision);
 const profile=await write('image_profile',{object_id:numericInput,points:[[2,2],[Math.min(w-1,25),Math.min(h-1,23)]],coordinate_space:'source_pixels',sample_count:32,line_width:1,interpolation:'nearest'});
 const second=await show(profile.object_id,'present-profile');assert.equal(second.view.numeric_results.profile.object_id,profile.object_id);assert.equal(second.view.numeric_results.statistics.object_id,stats.object_id);
 const probes=new DataProbes({document:null,getState:()=>panel.state(),api:()=>assert.fail('Adoption must not request another measurement')});probes.refreshCurrent();probes.restoreSavedResults(panel.state().numeric_results);assert.equal(probes.statistics.object_id,stats.object_id);assert.equal(probes.profile.object_id,profile.object_id);
 const requestsBefore=readdirSync(path.join(workspace,'requests')).length;
 const replay=await call('image_panel_show',{panel_id:panelId,object_id:stats.object_id,expected_object_id:a.view.object.object_id,draft_revision:a.view.edit_state.draft_revision,request_id:'present-statistics'});assert.equal(replay.recovered,true);assert.equal(replay.view.numeric_results.profile,null);assert.equal(panel.state().numeric_results.profile.object_id,profile.object_id);
 await http('/api/workspace',{action:'save',expected_working_revision:panel.state().workspace_analysis.working_revision,save_id:'formal-numeric-save'});assert.equal(panel.state().workspace_analysis.dirty,false);
 await owner.close(panel);panel=null;await openPanel(view.object_id);const restored=await current();assert.equal(restored.view.numeric_results.statistics.object_id,stats.object_id);assert.equal(restored.view.numeric_results.profile.object_id,profile.object_id);assert.equal(readdirSync(path.join(workspace,'requests')).length,requestsBefore,'Presentation replay/save/reopen must not create scientific requests');
 assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),sourceHash);
 writeFileSync(path.join(directory,'result.json'),JSON.stringify({status:'PASS',source,source_sha256:sourceHash,tool_catalog_count:catalog.result.tools.length,panel_id:panelId,frame_object_id:frame.object_id,view_object_id:view.object_id,first_roi:roi,changed_roi:changed,statistics_object_id:stats.object_id,profile_object_id:profile.object_id,statistic_sample_count:stats.statistics.sample_count,profile_samples:profile.sampling.sample_count,canvas_unchanged:true,existing_ui_result_slots_compatible:true,current_roi_reread:true,original_receipt_recovered:true,save_reopen_no_science:true,calls,native_gui:'NOT_TESTED',external_model:'NOT_TESTED'},null,2));console.log('PASS full formal MCP current ROI -> statistics/profile -> show -> revised ROI -> save/reopen; no model sending');
}finally{if(panel)await owner.close(panel);await client?.close();}
