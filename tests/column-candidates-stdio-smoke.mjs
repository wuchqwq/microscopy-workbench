// Bounded actual compiled MCP + Panel HTTP boundary; no GUI qualification.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';
const [source,directory]=process.argv.slice(2),python=process.env.MICROSCOPY_PYTHON;
if(!source||!directory||!python)throw Error('Pass source TIFF, new output directory, and MICROSCOPY_PYTHON');
mkdirSync(directory,{recursive:true});const workspace=path.join(directory,'workspace');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),before=hash(source),calls=[];let client,panel,serial=0;
try{
 client=new StdioImageClient({workspace,python});await client.rpc('initialize');
 const catalog=await client.rpc('tools/list');assert.ok(catalog.result.tools.some(t=>t.name==='image_column_candidates'));
 const call=async(name,args)=>{calls.push(name);return (await client.tool(name,{...args,...(!['image_info','image_result'].includes(name)?{request_id:'candidate-stdio-'+(++serial)}:{})})).data;};
 const opened=await call('image_open',{source_path:source}),frame=await call('image_frame',{object_id:opened.object_id,frame_index:0}),view=await call('image_preview',{object_id:frame.object_id});
 panel=await createImagePanel({workspace,python,object_id:view.object_id,client});
 const action=async(action,params)=>{const s=panel.state(),origin=panel.url.split('/#')[0],reply=await fetch(origin+'/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Panel-Token':panel.token,Origin:origin},body:JSON.stringify({expected_object_id:s.object.object_id,draft_revision:s.edit_state.draft_revision,action,params})}),value=await reply.json();assert.equal(reply.status,200,JSON.stringify(value));return value;};
 const p=panel.state().object.panels[0],selection={kind:'rectangle',coordinates:[5,5,105,75],coordinate_space:'source_pixels',source_object_id:frame.object_id,panel:p};
 const parameters={selection,modality:'haadf',source_text:'Explicit analytic fixture declaration for protocol acceptance',min_distance:3,threshold_rel:.1,smooth_sigma:0,prominence_rel:.05};
 let state=await action('column-candidates',parameters);assert.equal(state.object.annotations.length,15);
 const first=state.object.annotations[0],second=state.object.annotations[1];
 state=await action('edit',{updates:[{annotation_id:first.annotation_id,coordinates:[first.anchor.coordinates[0]+.5,first.anchor.coordinates[1]+.5]}],auto_commit:true});
 state=await action('edit',{updates:[{annotation_id:second.annotation_id,status:'retracted'}],auto_commit:true});
 const edited=structuredClone(state.object.annotations);
 state=await action('column-candidates',parameters);assert.deepEqual(state.object.annotations,edited);
 const finalId=state.object.object_id,record=await call('image_info',{object_id:finalId});
 assert.deepEqual(record.column_candidates.annotation_application.new_annotation_ids,[]);
 const origin=panel.url.split('/#')[0],saveReply=await fetch(origin+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-Panel-Token':panel.token,Origin:origin},body:JSON.stringify({action:'save',expected_working_revision:panel.state().workspace_analysis.working_revision,save_id:'candidate-save-1'})}),saveState=await saveReply.json();assert.equal(saveReply.status,200,JSON.stringify(saveState));assert.equal(saveState.workspace_analysis.dirty,false);
 await panel.close();panel=null;await client.close();client=new StdioImageClient({workspace,python});await client.rpc('initialize');
 const recovered=await call('image_result',{request_id:record.request_id});assert.equal(recovered.object_id,finalId);assert.deepEqual(recovered.annotations,edited);
 panel=await createImagePanel({workspace,python,object_id:finalId,client});assert.deepEqual(panel.state().object.annotations,edited);
 assert.equal(hash(source),before);
 writeFileSync(path.join(directory,'result.json'),JSON.stringify({status:'PASS',source_sha256:before,detected:15,final_object_id:finalId,manual_edit_preserved:true,retraction_preserved:true,restart_readback:true,calls,gui:'NOT_TESTED'},null,2));console.log('PASS actual MCP + Panel HTTP detect/edit/retract/rerun/restart readback');
}finally{await panel?.close();await client?.close();}
