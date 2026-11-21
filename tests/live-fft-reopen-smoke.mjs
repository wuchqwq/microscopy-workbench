// Genuine Panel actions and provider journals over the existing public affine TIFF.
import assert from 'node:assert/strict';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import {readAnalysisWorkspaceResumeSnapshot} from '../lib/analysis_workspace.mjs';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';
import path from 'node:path';
const [fixture,workspace]=process.argv.slice(2),python=process.env.MICROSCOPY_PYTHON;
assert.ok([fixture,workspace,python].every(value=>value&&path.isAbsolute(value)));
mkdirSync(workspace);
const client=new StdioImageClient({workspace,python});
let panel;
try {
 const opened=(await client.tool('image_open',{source_path:fixture,request_id:'affine-file'})).data;
 const frame=(await client.tool('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'affine-frame'})).data;
 const view=(await client.tool('image_preview',{object_id:frame.object_id,request_id:'affine-view'})).data;
 const start=options=>createImagePanel({workspace,python,object_id:view.object_id,...options});
 panel=await start();
 const post=async (route,body)=>{
  const state=panel.state(),origin=new URL(panel.url).origin;
  const response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'X-Panel-Token':panel.token,'Content-Type':'application/json',Connection:'close'},
   body:JSON.stringify({expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision,...body})});
  const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
 };
 const a=[16.25,31.5,144,159.25],b=[40,50,168,178];
 const select=coordinates=>({kind:'rectangle',coordinates,coordinate_space:'source_pixels',source_object_id:frame.object_id,panel:panel.state().object.panels[0]});
 const live=async(coordinates,window='hann',subtract_mean=true)=>(await post('/api/action',{action:'live-fft',params:{selection:select(coordinates),window,subtract_mean}})).live_fft;
 const first=await live(a),second=await live(b),back=await live(a);
 assert.equal(first.reused,false);assert.notEqual(first.request_id,second.request_id);
 assert.deepEqual(back,{...first,reused:true});
 const otherWindow=await live(a,'none');assert.notEqual(otherWindow.request_id,first.request_id);
 const otherMean=await live(a,'hann',false);assert.notEqual(otherMean.request_id,first.request_id);
 await post('/api/workspace',{action:'save',save_id:'live-fft-before-reopen',expected_working_revision:panel.state().workspace_analysis.working_revision});
 const expected=panel.state().object.object_id;
 await panel.close();panel=null;
 panel=await start({analysis_restore:readAnalysisWorkspaceResumeSnapshot(workspace)});
 const reopened=await live(a);
 assert.deepEqual(reopened,{...first,reused:true});
 assert.equal(panel.state().object.object_id,expected,'readback cannot activate another window');
 const changedView=(await client.tool('image_preview',{object_id:frame.object_id,gamma:1.1,request_id:'changed-source-version'})).data;
 await post('/api/action',{action:'show',params:{object_id:changedView.object_id}});
 const changed=await live(a);assert.equal(changed.reused,false);assert.notEqual(changed.request_id,first.request_id);
 const explicit=await post('/api/action',{action:'fft',params:{selection:select(a),window:'hann',subtract_mean:true}});
 assert.notEqual(explicit.object.object_id,changed.object_id);
 assert.equal(readdirSync(path.join(workspace,'objects')).filter(id=>{
  const value=JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8'));return value.kind==='fft';
 }).length,6);
 console.log(JSON.stringify({result:'PASS',first_request:first.request_id,other_roi_request:second.request_id,
  reopen_request:reopened.request_id,different_window:otherWindow.request_id,different_mean:otherMean.request_id,
  changed_source_version:changed.request_id,explicit_recompute:explicit.object.request_id,total_ffts:6}));
} finally {
 if(panel)await panel.close();
 await client.close();
}
