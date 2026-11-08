// Public hash/journal fixture only; its data.npy bytes are not decoded science.
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {createResearchSendGate} from '../lib/research_host_dispatch.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),F='1'.repeat(32),V='2'.repeat(32);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SUYAAAAASUVORK5CYII=','base64');
export function fixture(t){
 const workspace=mkdtempSync(path.join(tmpdir(),'host-input-'));t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 mkdirSync(path.join(workspace,'objects'));mkdirSync(path.join(workspace,'requests'));
 // Hash-only metadata fixture; no scientific decoding is claimed.
 const array=Buffer.from('public synthetic metadata fixture, not decoded NPY');
 const put=(object)=>{const directory=path.join(workspace,'objects',object.object_id);mkdirSync(directory,{recursive:true});const raw=JSON.stringify(object);writeFileSync(path.join(directory,'object.json'),raw);writeFileSync(path.join(directory,'data.npy'),array);writeFileSync(path.join(workspace,'requests',object.request_id+'.json'),JSON.stringify({state:'completed',request_id:object.request_id,object_manifest_sha256:sha(raw),parameters:{workspace,request_id:object.request_id},response:{ok:true,state:'completed',backend:'external-image-workspace',request_id:object.request_id,...object}}));return sha(raw);};
 const base={backend:'external-image-workspace',shape_yx:[1,1],dtype:'uint16',files_sha256:{'data.npy':sha(array)}};
 put({...base,object_id:F,request_id:'public-frame',kind:'frame'});
 const view={...base,object_id:V,request_id:'public-view',kind:'view',parent_object_id:F,files_sha256:{...base.files_sha256,'preview.png':sha(png)},panels:[{domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,1,1],image_rect_xyxy:[0,0,1,1]}]};
 const manifest=put(view),file=path.join(workspace,'objects',V,'preview.png');writeFileSync(file,png);
 const options={workspace,view_id:V,view_sha256:manifest,frame_id:F,text:'Inspect this public synthetic image; retain unknowns.'};
 return {workspace,view,file,put,options,image:{path:file,sha256:sha(png)}};
}

export function ownerFor(f){
 const state={workspace:f.workspace,panel:{panel_id:'4'.repeat(32),research_lead_session_id:'5'.repeat(32),panel_generation:0,state_revision:0,object:{object_id:V},frame_identity:{frame_object_id:F},research_question:{version:1,text:f.options.text,context_object_id:V,frame_object_id:F,recorded_utc:'2026-11-07T00:00:00.000Z'},edit_state:{draft_revision:0,dirty:false,gesture_active:false},window_collection:{revision:0},workspace_analysis:{working_revision:0},selection:null,pending_result:null}};
 const owner={state,readHook:null};owner.gate=createResearchSendGate({readCurrent:()=>{owner.readHook?.();return structuredClone(owner.state);}});return owner;
}
export async function approvedFor(owner,prepared,host,ttlMs=300000){
 const review=owner.gate.review(prepared);await host.startSession({task_id:'bound-synthetic-image',context_sha256:review.context_sha256});return owner.gate.approve(review,host,{ttlMs});
}
