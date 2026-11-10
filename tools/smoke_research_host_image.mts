// Actual file provider + PNG boundary check. No Codex, model or network.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {prepareResearchHostImage,hostTurnWireInput} from '../lib/research_host_input.mjs';
import {createResearchSendGate} from '../lib/research_host_dispatch.mjs';
const directory=process.argv[2],python=process.env.MICROSCOPY_PYTHON;
if(!directory||!path.isAbsolute(directory)||!python||!path.isAbsolute(python))throw Error('Explicit new absolute output directory and MICROSCOPY_PYTHON required');
mkdirSync(directory,{recursive:false});
const workspace=path.join(directory,'workspace'),source=path.join(directory,'public-synthetic.tiff');
const generated=spawnSync(python,['-B','-c',"import numpy as np,tifffile,sys; y,x=np.mgrid[:32,:32]; a=(1000+200*np.cos(2*np.pi*x/8)+100*np.cos(2*np.pi*y/16)).astype(np.uint16); tifffile.imwrite(sys.argv[1],a,photometric='minisblack',metadata=None)",source],{encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const original=hash(readFileSync(source));
const runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:workspace,MICROSCOPY_PYTHON:python,MICROSCOPY_PANEL:'0'}});
const calls:{name:string;request_id:string;object_id:string}[]=[];
async function call(name:string,args:Record<string,unknown>){
 const request_id='host-image-check-'+(calls.length+1),reply=await runtime.registry.call(name,{...args,request_id});
 assert.ok(reply&&typeof reply==='object'&&'content' in reply);
 const value=reply as {isError?:boolean;content:{type:string;text?:string}[]};assert.ok(!value.isError,JSON.stringify(reply));
 const content=value.content.find(c=>c.type==='text');assert.ok(content?.text);
 const data=JSON.parse(content.text) as Record<string,unknown>;assert.equal(typeof data.object_id,'string');
 calls.push({name,request_id,object_id:String(data.object_id)});return data;
}
const report:Record<string,unknown>={scope:'public synthetic provider/display-input boundary only',real_model:false,source,workspace,calls};
try{
 for(const name of ['image_open','image_frame','image_preview','image_annotate'])assert.ok(runtime.registry.listTools().some(t=>t.name===name));
 const opened=await call('image_open',{source_path:source}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});
 const view=await call('image_preview',{object_id:frame.object_id,max_size:64,scale_bar:false});
 const selected=(value:Record<string,unknown>)=>({workspace,view_id:String(value.object_id),view_sha256:hash(readFileSync(path.join(workspace,'objects',String(value.object_id),'object.json'))),frame_id:String(frame.object_id),text:'Public synthetic pattern: what is visible, and what needs measurement? No specimen or physical scale is supplied.'});
 const files=readdirSync(workspace,{recursive:true,withFileTypes:true}).filter(f=>f.isFile()).map(f=>path.join(f.parentPath,f.name));
 const before=files.map(file=>[file,hash(readFileSync(file))]);
 const prepared=prepareResearchHostImage(selected(view)),wire=hostTurnWireInput(prepared);
 // Synthetic owner state, real provider identity checks. This does not claim a
 // live Panel/GUI approval or real host delivery.
 const owner={workspace,panel:{panel_id:'4'.repeat(32),research_lead_session_id:'5'.repeat(32),state_revision:0,object:{object_id:view.object_id},frame_identity:{frame_object_id:frame.object_id},research_question:{version:1,text:prepared.text,context_object_id:view.object_id,frame_object_id:frame.object_id,recorded_utc:'2026-11-07T00:00:00.000Z'},edit_state:{draft_revision:0,dirty:false,gesture_active:false},window_collection:{revision:0},workspace_analysis:{working_revision:0},selection:null,pending_result:null}};
 const gate=createResearchSendGate({readCurrent:()=>structuredClone(owner)}),review=gate.review(prepared);
 assert.deepEqual(review.wire,wire);owner.panel.research_question.text='Changed intent after review';
 assert.throws(()=>gate.review(prepared),/Current question or source/);
 assert.equal(wire.length,3);assert.equal(wire[2].type,'image');
 if(wire[2].type!=='image')throw Error('Missing encoded image');
 assert.equal(hash(Buffer.from(wire[2].url.split(',')[1],'base64')),prepared.source?.display_png_sha256);
 assert.deepEqual(files.map(file=>[file,hash(readFileSync(file))]),before);
 assert.equal(JSON.stringify(wire).includes(directory),false);
 const marked=await call('image_annotate',{object_id:view.object_id,annotations:[{kind:'point',coordinate_space:'source_pixels',source_object_id:frame.object_id,coordinates:[8,8],text:'Synthetic overlay control',status:'hypothesized'}]});
 const projected=await call('image_preview',{object_id:marked.object_id,max_size:64,scale_bar:false});
 assert.equal(projected.kind,'view');assert.equal(projected.annotation_reprojection,true);
 assert.throws(()=>prepareResearchHostImage(selected(projected)),/Annotated or reprojected/);
 assert.equal(hash(readFileSync(source)),original);
 Object.assign(report,{result:'PASS',source_sha256:original,reference:prepared.source,provider_files_unchanged_by_preparation:files.length,reprojected_view_rejected:true,encoded_image_sha256:prepared.source?.display_png_sha256,review_context_sha256:review.context_sha256,changed_mock_owner_question_refused:true,meaning:'Actual existing Python provider and journals with synthetic owner state; no live Panel approval, model vision or research loop qualification.'});
 console.log('PASS: actual provider TIFF/frame/view -> verified encoded PNG; ordinary reprojected view refused; source and preparation inputs unchanged. No model.');
}catch(error){report.result='FAIL';report.error=error instanceof Error?error.stack:String(error);throw error;}
finally{runtime.close();writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');}
