// Public synthetic metadata fixtures only. No worker, Panel or GUI is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parsePanelSavedInputReference,resolvePanelSavedInputReference} from '../lib/panel_saved_input_reference.mjs';
import {writePanelExecutionInput} from '../lib/panel_execution_inputs.mjs';
import {CliObjectReader,canonical,savedRois} from '../lib/workbench_cli_records.mjs';
import {publishRoiComparisonReport} from '../lib/roi_comparison_reports.mjs';
import {frozenFftInput,fftRequestSuffix,guiFftInputAssociation} from '../lib/workbench_cli_inputs.mjs';
import {AnalysisWorkspace,acquireAnalysisWorkspaceOwner} from '../lib/analysis_workspace.mjs';
import {outwardSourceRectangle} from '../ui/image-panel/coordinates.mjs';
import {createImagePanel} from '../tools/image_panel.mjs';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';
import {prepareOwnedPanelRegistration} from '../lib/panel_ownership.mjs';
const id=n=>n.toString(16).padStart(32,'0'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const recipe={window:'hann',subtract_mean:true};
function fixture(t){
 const workspace=mkdtempSync(path.join(os.tmpdir(),'mwb-saved-input-')),cleanup=[];t.after(()=>{for(const fn of cleanup.reverse())fn();rmSync(workspace,{recursive:true,force:true});});mkdirSync(path.join(workspace,'objects'));mkdirSync(path.join(workspace,'requests'));
 const calibration={calibration_id:id(99),revision:1,status:'active',scope:'image',xy_scale:{x:-.25,y:.5,unit:'nm'},source:'synthetic_fixture_only',source_text:'Public metadata fixture, not an experimental scale'};
 function object(n,value,parameters={}){const object_id=id(n),request_id=value.request_id??'fixture-'+n,dir=path.join(workspace,'objects',object_id);mkdirSync(dir);const bytes=Buffer.from('public metadata fixture array '+n);writeFileSync(path.join(dir,'data.npy'),bytes);const result={schema_version:1,backend:'external-image-workspace',created_utc:'2026-11-08T12:00:00Z',object_id,request_id,files_sha256:{'data.npy':hash(bytes)},xy_calibration:calibration,...value},raw=JSON.stringify(result);writeFileSync(path.join(dir,'object.json'),raw);writeFileSync(path.join(workspace,'requests',request_id+'.json'),JSON.stringify({state:'completed',request_id,parameters:{workspace,request_id,...parameters},object_manifest_sha256:hash(raw),response:{ok:true,state:'completed',backend:'external-image-workspace',request_id,...result}}));return result;}
 const frame=object(1,{kind:'frame',frame_index:0,array_domain:'spatial',shape_yx:[64,64],dtype:'uint16'}),panel={domain:'spatial_pixels',source_object_id:frame.object_id,source_rect_xyxy:[0,0,64,64],image_rect_xyxy:[0,0,64,64]},coordinates=[2.2,3.1,20.6,22.9],mark={kind:'rectangle',annotation_id:'roi-original',status:'hypothesized',anchor:{source_object_id:frame.object_id,coordinate_space:'source_pixels',coordinates}},view=object(2,{kind:'annotate',array_domain:'spatial',parent_object_id:frame.object_id,render_base_object_id:frame.object_id,panels:[panel],annotations:[mark]});
 const fft=(n,requestId,rect,parameters={},metadata={})=>object(n,{kind:'fft',request_id:requestId,array_domain:'frequency',dtype:'complex128',shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],parent_object_id:frame.object_id,source_object_id:frame.object_id,source_rect_xyxy:rect,...recipe,...metadata},{action:'fft',object_id:frame.object_id,rect,...recipe,...parameters});
 function execution({coordinates:inputCoordinates=[30.2,31.1,45.6,46.9],annotation_id=null,status='completed'}={}){
  const journal=path.join(workspace,'panel-journals','fixture-journal');mkdirSync(journal,{recursive:true});const rect=outwardSourceRectangle(inputCoordinates),parameters={object_id:frame.object_id,rect,...recipe},record=writePanelExecutionInput({workspace,journal,session_nonce:'a'.repeat(64),sequence:1,parameters,source_view_object_id:view.object_id,frame_object_id:frame.object_id,selection:{kind:'rectangle',source_object_id:frame.object_id,coordinate_space:'source_pixels',coordinates:inputCoordinates,panel},annotation_id,calibration});
  if(status!=='not_submitted')writeFileSync(path.join(journal,record.request_id+'.request.json'),JSON.stringify({name:'image_fft',arguments:{...parameters,request_id:record.request_id}}));
  const result=status==='completed'?fft(3,record.request_id,rect):null;if(result)writeFileSync(path.join(journal,record.request_id+'.response.json'),JSON.stringify({request_id:record.request_id,object_id:result.object_id}));return {record,result,coordinates:inputCoordinates,rect};
 }
 function report(sourceView,fftObject,proof,annotationId='roi-original',comparisonId='reference-report'){
  const reader=new CliObjectReader(workspace),roi=savedRois(reader,{object_id:sourceView.object_id}).find(row=>row.annotation_id===annotationId),verified=reader.object(fftObject.object_id);return {schema_version:1,kind:'roi_lattice_comparison',comparison_id:comparisonId,request_id:comparisonId,source_save_id:null,source_revision:null,source_view_object_id:sourceView.object_id,frame_object_id:frame.object_id,recipe,rows:[{...roi,fft:{object_id:fftObject.object_id,reused:true,input_snapshot_verified:true,input_association:proof,manifest_sha256:verified.manifest_sha256,array_sha256:fftObject.files_sha256['data.npy']},peaks:[],measurements:[],status:'needs_point_selection',uncertainties:[]}],interpretation:{status:'not_assessed',notes:[]}};
 }
 return {workspace,cleanup,calibration,object,frame,panel,coordinates,mark,view,fft,execution,report};
}
test('input-reference union rejects unknown keys, mixed identities, malformed IDs and unknown kinds',()=>{
 assert.deepEqual(parsePanelSavedInputReference({kind:'execution',request_id:'panel-original'}),{kind:'execution',request_id:'panel-original'});assert.deepEqual(parsePanelSavedInputReference({kind:'comparison',comparison_id:'report-1',annotation_id:'roi-1'}),{kind:'comparison',comparison_id:'report-1',annotation_id:'roi-1'});
 for(const value of [null,[],{}, {kind:'execution',request_id:'r',annotation_id:'extra'}, {kind:'comparison',comparison_id:'r',annotation_id:'a',request_id:'mixed'}, {kind:'execution',request_id:'../outside'}, {kind:'comparison',comparison_id:'r',annotation_id:null}, {kind:'other',request_id:'r'}])assert.throws(()=>parsePanelSavedInputReference(value),error=>error.status===400);
});
test('execution reference retains actual temporary float input, null original annotation and unchanged calibration',t=>{
 const f=fixture(t),execution=f.execution(),before=readdirSync(path.join(f.workspace,'objects')),resolved=resolvePanelSavedInputReference(f.workspace,execution.result.object_id,{kind:'execution',request_id:execution.record.request_id});assert.equal(resolved.source_view_object_id,f.view.object_id);assert.equal(resolved.frame_object_id,f.frame.object_id);assert.equal(resolved.raw_fft_object_id,execution.result.object_id);assert.deepEqual(resolved.float_roi_xyxy,execution.coordinates);assert.deepEqual(resolved.processing_rect_xyxy,execution.rect);assert.equal(resolved.annotation_id,null);assert.deepEqual(resolved.calibration_snapshot,f.calibration);assert.equal(resolved.requested_annotation_id,undefined);assert.deepEqual(resolved.spatial_return_reference,{version:1,view_object_id:f.view.object_id,frame_object_id:f.frame.object_id,fft_object_id:execution.result.object_id,source_rect_xyxy:execution.rect});assert.deepEqual(readdirSync(path.join(f.workspace,'objects')),before);
 assert.throws(()=>resolvePanelSavedInputReference(f.workspace,id(9),{kind:'execution',request_id:execution.record.request_id}),/different raw FFT/);
});
test('unknown, never-submitted and legacy executions cannot provide a spatial-return reference',t=>{
 for(const status of ['unknown','not_submitted']){const f=fixture(t),execution=f.execution({status});assert.throws(()=>resolvePanelSavedInputReference(f.workspace,id(3),{kind:'execution',request_id:execution.record.request_id}),/not a qualified completed FFT/);}
 const f=fixture(t);assert.throws(()=>resolvePanelSavedInputReference(f.workspace,id(3),{kind:'execution',request_id:'panel-0123456789abcdef-1'}));
});
test('comparison of a later explicitly named ROI returns the original temporary execution view and original null identity',t=>{
 const f=fixture(t),execution=f.execution(),later=f.object(4,{kind:'annotate',array_domain:'spatial',parent_object_id:f.frame.object_id,render_base_object_id:f.frame.object_id,panels:[f.panel],annotations:[{...f.mark,annotation_id:'roi-later',anchor:{...f.mark.anchor,coordinates:execution.coordinates}}]}),report=f.report(later,execution.result,{kind:'gui_panel_execution_input_v1',input_relative_path:execution.record.input_relative_path,input_sha256:execution.record.input_sha256},'roi-later');publishRoiComparisonReport(f.workspace,report);
 const resolved=resolvePanelSavedInputReference(f.workspace,execution.result.object_id,{kind:'comparison',comparison_id:report.comparison_id,annotation_id:'roi-later'});assert.equal(resolved.source_view_object_id,f.view.object_id);assert.notEqual(resolved.source_view_object_id,later.object_id);assert.equal(resolved.annotation_id,null);assert.equal(resolved.requested_annotation_id,'roi-later');assert.deepEqual(resolved.float_roi_xyxy,execution.coordinates);
 assert.throws(()=>resolvePanelSavedInputReference(f.workspace,execution.result.object_id,{kind:'comparison',comparison_id:report.comparison_id,annotation_id:'absent'}),/absent or ambiguous/);assert.throws(()=>resolvePanelSavedInputReference(f.workspace,id(9),{kind:'comparison',comparison_id:report.comparison_id,annotation_id:'roi-later'}),/different raw FFT/);
});
test('CLI comparison proof selects its actual original immutable source, not a later same-geometry report view',t=>{
 const f=fixture(t),reader=new CliObjectReader(f.workspace),roi=savedRois(reader,{object_id:f.view.object_id})[0],input=frozenFftInput(reader,roi,recipe),comparisonId='original-cli-comparison',requestId='cli-fft-'+fftRequestSuffix(comparisonId,0,input),fft=f.fft(3,requestId,roi.processing_rect_xyxy),later=f.object(4,{kind:'annotate',array_domain:'spatial',parent_object_id:f.frame.object_id,render_base_object_id:f.frame.object_id,panels:[f.panel],annotations:[{...f.mark,note:'later note only; same exact scientific geometry'}]});mkdirSync(path.join(f.workspace,'cli-requests'));writeFileSync(path.join(f.workspace,'cli-requests','comparison-'+comparisonId+'.json'),JSON.stringify({schema_version:1,command:'compare-rois',request_id:comparisonId,frozen_inputs:[input]}));const report=f.report(later,fft,{kind:'cli_request_v1',comparison_id:comparisonId,row_index:0,input_snapshot:input});publishRoiComparisonReport(f.workspace,report);
 const resolved=resolvePanelSavedInputReference(f.workspace,fft.object_id,{kind:'comparison',comparison_id:report.comparison_id,annotation_id:'roi-original'});assert.equal(resolved.source_view_object_id,f.view.object_id);assert.equal(resolved.annotation_id,'roi-original');assert.deepEqual(resolved.calibration_snapshot,f.calibration);
});
test('a comparison tied to an exact saved GUI input context also provides the original reference',async t=>{
 const f=fixture(t),support=outwardSourceRectangle(f.coordinates),fft=f.fft(3,'original-gui-fft',support),owner=acquireAnalysisWorkspaceOwner(f.workspace,{role:'gui'});f.cleanup.push(()=>owner.release());const snapshot={object_id:f.view.object_id,frame_identity:{frame_object_id:f.frame.object_id},selection:null,edit_state:{dirty:false},window_collection:{active_window_id:id(20),records:[{entry:{window_id:id(20),object_id:f.view.object_id,role:'source'}},{entry:{window_id:id(21),object_id:fft.object_id,role:'fft',source_reference:{input_view_object_id:f.view.object_id,frame_object_id:f.frame.object_id,raw_fft_object_id:fft.object_id,processing_rect_xyxy:support,input_view_context:{selection_candidate:{kind:'rectangle',source_object_id:f.frame.object_id,coordinate_space:'source_pixels',coordinates:f.coordinates}}}}}]}},analysis=new AnalysisWorkspace(f.workspace,snapshot,owner);await analysis.save('saved-gui-input',0,async()=>{});const reader=new CliObjectReader(f.workspace),roi=savedRois(reader,snapshot)[0],proof=guiFftInputAssociation(reader,'saved-gui-input',reader.object(fft.object_id),roi,recipe),report=f.report(f.view,fft,proof);publishRoiComparisonReport(f.workspace,report);assert.equal(resolvePanelSavedInputReference(f.workspace,fft.object_id,{kind:'comparison',comparison_id:report.comparison_id,annotation_id:'roi-original'}).annotation_id,'roi-original');
});
test('legacy report flags cannot recover or invent a floating input',t=>{
 const f=fixture(t),support=outwardSourceRectangle(f.coordinates),fft=f.fft(3,'legacy-fft',support),report=f.report(f.view,fft,undefined);delete report.rows[0].fft.input_association;mkdirSync(path.join(f.workspace,'cli-comparisons'));writeFileSync(path.join(f.workspace,'cli-comparisons',report.comparison_id+'.json'),JSON.stringify({schema_version:1,report_sha256:hash(canonical(report)),report}));assert.throws(()=>resolvePanelSavedInputReference(f.workspace,fft.object_id,{kind:'comparison',comparison_id:report.comparison_id,annotation_id:'roi-original'}),/no verified original floating input/);
});

test('explicit provider FFT reference verifies its pre-existing saved ROI, original request and unchanged arrays',t=>{
 const f=fixture(t),rect=outwardSourceRectangle(f.coordinates),fft=f.fft(3,'external-original',rect),reference={kind:'provider_fft',request_id:fft.request_id,source_view_object_id:f.view.object_id,annotation_id:f.mark.annotation_id},before=readdirSync(path.join(f.workspace,'objects'));
 assert.deepEqual(parsePanelSavedInputReference(reference),reference);
 const result=resolvePanelSavedInputReference(f.workspace,fft.object_id,reference);
 assert.equal(result.source_view_object_id,f.view.object_id);assert.equal(result.annotation_id,f.mark.annotation_id);assert.deepEqual(result.float_roi_xyxy,f.coordinates);assert.deepEqual(result.processing_rect_xyxy,rect);assert.equal(result.spatial_return_reference.fft_object_id,fft.object_id);assert.deepEqual(readdirSync(path.join(f.workspace,'objects')),before);
 assert.throws(()=>resolvePanelSavedInputReference(f.workspace,fft.object_id,{...reference,request_id:'another-original'}),/original provider request/);
 assert.throws(()=>resolvePanelSavedInputReference(f.workspace,fft.object_id,{...reference,annotation_id:'missing-roi'}),/absent/);
 for(const changed of [{...reference,source_view_object_id:'../outside'},{...reference,request_id:'../outside'},{...reference,annotation_id:null},{...reference,extra:true}])assert.throws(()=>parsePanelSavedInputReference(changed),error=>error.status===400);
});
test('provider references reject changed ROI, rounded-in support, newer views and ambiguous/retracted identities',t=>{
 const f=fixture(t),rect=outwardSourceRectangle(f.coordinates),fft=f.fft(3,'external-original',rect),reference={kind:'provider_fft',request_id:fft.request_id,source_view_object_id:f.view.object_id,annotation_id:f.mark.annotation_id};
 const views=[
  {created_utc:'2026-11-08T12:00:01Z',annotations:[f.mark]},
  {annotations:[{...f.mark,anchor:{...f.mark.anchor,coordinates:[30,30,40,40]}}]},
  {annotations:[{...f.mark,status:'retracted'}]},
  {annotations:[f.mark,structuredClone(f.mark)]},
  {array_domain:'frequency',annotations:[f.mark]},
  {panels:[{...f.panel,domain:'source_array_indices'}],annotations:[f.mark]},
 ];
 for(const [i,value]of views.entries()){
  const view=f.object(20+i,{kind:'annotate',array_domain:'spatial',parent_object_id:f.frame.object_id,render_base_object_id:f.frame.object_id,panels:[f.panel],...value});
  assert.throws(()=>resolvePanelSavedInputReference(f.workspace,fft.object_id,{...reference,source_view_object_id:view.object_id}));
 }
 const inward=f.fft(4,'inward-result',[3,4,20,22]);assert.throws(()=>resolvePanelSavedInputReference(f.workspace,inward.object_id,{...reference,request_id:inward.request_id}),/actual ROI/);
});
test('provider references reject a mismatching original recipe, calibration, nonfull operand and unknown provider result',t=>{
 for(const mode of ['recipe','calibration','operand','unknown']){
  const f=fixture(t),rect=outwardSourceRectangle(f.coordinates),fft=f.fft(3,'external-'+mode,rect,mode==='recipe'?{window:'none'}:mode==='operand'?{object_id:f.view.object_id}:{}),reference={kind:'provider_fft',request_id:fft.request_id,source_view_object_id:f.view.object_id,annotation_id:f.mark.annotation_id};
  if(mode==='calibration'){
   const view=f.object(5,{...f.view,object_id:id(5),request_id:'different-calibration-view',xy_calibration:{...f.calibration,revision:2}});reference.source_view_object_id=view.object_id;
  }
  if(mode==='unknown'){const file=path.join(f.workspace,'requests',fft.request_id+'.json'),journal=JSON.parse(readFileSync(file,'utf8'));journal.state='running';writeFileSync(file,JSON.stringify(journal));}
  assert.throws(()=>resolvePanelSavedInputReference(f.workspace,fft.object_id,reference),mode==='recipe'||mode==='operand'?/provider operand/:undefined);
 }
});

async function externalPanelFixture(t,run,{sameGeometryRoi=false}={}){
 const f=fixture(t),bytes=Buffer.from('89504e470d0a1a0a00000000','hex'),png=bytes.toString('base64'),digest=hash(bytes),rect=outwardSourceRectangle(f.coordinates),K=id(3),P=id(90);
 const view=f.object(20,{kind:'annotate',array_domain:'spatial',parent_object_id:f.frame.object_id,render_base_object_id:f.frame.object_id,shape_yx:[64,64],panels:[f.panel],annotations:sameGeometryRoi?[f.mark,{...structuredClone(f.mark),annotation_id:'other-roi-same-geometry'}]:[f.mark],display:{gamma:1,display_range:[0,255]},files_sha256:{'preview.png':digest}});
 const fft=f.fft(3,'external-original',rect,{}, {panels:[{domain:'frequency',source_object_id:K,fft_shape_yx:[rect[3]-rect[1],rect[2]-rect[0]],image_rect_xyxy:[0,0,19,20]}],files_sha256:{'data.npy':hash(Buffer.from('public metadata fixture array 3')),'preview.png':digest}});
 for(const oid of [view.object_id,K])writeFileSync(path.join(f.workspace,'objects',oid,'preview.png'),bytes);
 let holdSource=null;
 const holdSourceRead=()=>{let entered,release;const started=new Promise(resolve=>entered=resolve),waiting=new Promise(resolve=>release=resolve);holdSource={entered,waiting};return {started,release};};
 const calls=[],client={async rpc(method){return {result:method==='tools/list'?{tools:['image_info','image_preview','image_fft','image_result'].map(name=>({name,inputSchema:{}}))}:{}};},async tool(name,args){calls.push({name,args:structuredClone(args)});assert.equal(name,'image_info','presentation/return must not submit science or render');if(holdSource&&args.object_id===view.object_id){const held=holdSource;holdSource=null;held.entered();await held.waiting;}const data=JSON.parse(readFileSync(path.join(f.workspace,'objects',args.object_id,'object.json'),'utf8'));return {data,png:data.files_sha256['preview.png']?png:null};},async close(){}};
 const owned=prepareOwnedPanelRegistration({workspace:f.workspace,panel_id:P});let panel;
 try{
  panel=await createImagePanel({workspace:f.workspace,python:process.execPath,object_id:view.object_id,client,panel_id:P,helper_session_id:owned.helper_session_id,panel_generation:owned.generation,journalDirectory:owned.journalDirectory});owned.publish(panel);
  const manager=new ImagePanelManager({workspace:f.workspace,python:process.execPath,inspect:async object_id=>{const reply=await client.tool('image_info',{object_id});return {content:[{type:'text',text:JSON.stringify(reply.data)},{type:'image',mimeType:'image/png',data:reply.png}]};}}),origin=panel.url.split('/#')[0],post=async(action,params={},extra={})=>{const s=panel.state(),response=await fetch(origin+'/api/action',{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action,params,expected_object_id:s.object.object_id,draft_revision:s.edit_state.draft_revision,...extra})});return {status:response.status,data:await response.json()};},args={panel_id:P,object_id:K,expected_object_id:view.object_id,draft_revision:panel.state().edit_state.draft_revision,request_id:'external-show',input_reference:{kind:'provider_fft',request_id:fft.request_id,source_view_object_id:view.object_id,annotation_id:f.mark.annotation_id}};
  await run({f,view,fft,panel,manager,post,args,calls,holdSourceRead});
 }finally{if(panel)await owned.close(panel);else owned.releaseUnlaunched();}
}
const toolData=result=>JSON.parse(result.content.find(block=>block.type==='text').text);
test('external MCP show forwards its explicit provider input, returns to the saved ROI without science and keeps original receipt',t=>externalPanelFixture(t,async h=>{
 const result=toolData(await h.manager.call('image_panel_show',h.args));assert.equal(result.view.presentation.status,'shown');assert.equal(h.panel.state().spatial_return.status,'ready');
 const entry=h.panel.state().window_collection.windows.find(w=>w.role==='fft');assert.equal(entry.source_reference.input_view_object_id,h.view.object_id);assert.equal(entry.source_reference.input_view_context.selected_annotation_id,h.f.mark.annotation_id);
 const again=toolData(await h.manager.call('image_panel_show',{...h.args,input_reference:Object.fromEntries(Object.entries(h.args.input_reference).reverse())}));assert.equal(again.recovered,true);
 await assert.rejects(h.manager.call('image_panel_show',{...h.args,input_reference:{...h.args.input_reference,annotation_id:'another-roi'}}),/conflict/);
 const returned=await h.post('return-spatial');assert.equal(returned.status,200,returned.data.error);assert.equal(h.panel.state().object.object_id,h.view.object_id);assert.deepEqual(h.panel.state().selection.coordinates,h.f.coordinates);
 assert.ok(h.calls.every(c=>c.name==='image_info'));
}));
test('external explicit input survives a newer draft as pending and is not adopted until acceptance',t=>externalPanelFixture(t,async h=>{
 assert.equal((await h.post('draft',{draft_revision:h.args.draft_revision+1,dirty:true,gesture_active:false})).status,200);
 const shown=toolData(await h.manager.call('image_panel_show',h.args));assert.equal(shown.view.presentation.status,'queued');assert.equal(h.panel.state().object.object_id,h.view.object_id);assert.equal(h.panel.state().spatial_return.status,'unavailable');
 const frozen=JSON.parse(readFileSync(path.join(h.panel.journal,'current-selection.json'),'utf8'));assert.equal(frozen.pending_result.spatial_return_reference.view_object_id,h.view.object_id);assert.deepEqual(frozen.pending_result.input_view_context.selection_candidate.coordinates,h.f.coordinates);
 await h.post('draft',{draft_revision:h.panel.state().edit_state.draft_revision+1,dirty:false,gesture_active:false});assert.equal((await h.post('accept-result')).status,200);assert.equal(h.panel.state().spatial_return.status,'ready');assert.equal((await h.post('return-spatial')).status,200);assert.deepEqual(h.panel.state().selection.coordinates,h.f.coordinates);
}));
test('invalid external input fails without replacing the active image or inventing a return link',t=>externalPanelFixture(t,async h=>{
 await assert.rejects(h.manager.call('image_panel_show',{...h.args,input_reference:{...h.args.input_reference,request_id:'different-original'}}),/original provider request/);
 assert.equal(h.panel.state().object.object_id,h.view.object_id);assert.equal(h.panel.state().pending_result,null);assert.equal(h.panel.state().spatial_return.status,'unavailable');
 assert.ok(h.calls.every(c=>c.name==='image_info'));
}));
test('a gesture arriving during explicit source admission queues the exact reference without replacing the current ROI',t=>externalPanelFixture(t,async h=>{
 const hold=h.holdSourceRead(),offering=h.manager.call('image_panel_show',h.args);await hold.started;
 try{assert.equal((await h.post('draft',{draft_revision:h.args.draft_revision+1,dirty:false,gesture_active:true})).status,200);}finally{hold.release();}
 const response=toolData(await offering);assert.equal(response.view.presentation.status,'queued');assert.equal(h.panel.state().object.object_id,h.view.object_id);assert.equal(h.panel.state().edit_state.gesture_active,true);assert.equal(h.panel.state().spatial_return.status,'unavailable');
 const frozen=JSON.parse(readFileSync(path.join(h.panel.journal,'current-selection.json'),'utf8'));assert.equal(frozen.pending_result.spatial_return_reference.view_object_id,h.view.object_id);assert.deepEqual(frozen.pending_result.input_view_context.selection_candidate.coordinates,h.f.coordinates);
 await h.post('draft',{draft_revision:h.panel.state().edit_state.draft_revision+1,dirty:false,gesture_active:false});assert.equal((await h.post('accept-result')).status,200);assert.equal(h.panel.state().spatial_return.status,'ready');assert.equal((await h.post('return-spatial')).status,200);assert.deepEqual(h.panel.state().selection.coordinates,h.f.coordinates);
}));
test('caller mutation cannot rewrite the nested input reference in the original MCP presentation journal',t=>externalPanelFixture(t,async h=>{
 const original=structuredClone(h.args),hold=h.holdSourceRead(),offering=h.manager.call('image_panel_show',h.args);await hold.started;
 h.args.input_reference.annotation_id='caller-changed-later';hold.release();await offering;
 const record=JSON.parse(readFileSync(path.join(h.f.workspace,'panel-registry','requests',original.request_id+'.json'),'utf8'));assert.deepEqual(record.arguments,original);assert.equal(record.status,'completed');
 const recovered=toolData(await h.manager.call('image_panel_show',original));assert.equal(recovered.recovered,true);await assert.rejects(h.manager.call('image_panel_show',h.args),/conflict/);
 assert.equal(h.panel.state().window_collection.windows.find(w=>w.role==='fft').source_reference.input_view_context.selected_annotation_id,h.f.mark.annotation_id);
}));
test('retained external FFT cannot silently accept another ROI identity with exactly the same geometry',t=>externalPanelFixture(t,async h=>{
 await h.manager.call('image_panel_show',h.args);const before=h.panel.state(),conflicting={...structuredClone(h.args),expected_object_id:before.object.object_id,draft_revision:before.edit_state.draft_revision,request_id:'different-saved-roi',input_reference:{...h.args.input_reference,annotation_id:'other-roi-same-geometry'}};
 await assert.rejects(h.manager.call('image_panel_show',conflicting),/Retained FFT source conflicts/);
 const after=h.panel.state();assert.equal(after.object.object_id,before.object.object_id);assert.equal(after.edit_state.draft_revision,before.edit_state.draft_revision);assert.equal(after.pending_result,null);assert.equal(after.window_collection.windows.find(w=>w.role==='fft').source_reference.input_view_context.selected_annotation_id,h.f.mark.annotation_id);assert.ok(h.calls.every(c=>c.name==='image_info'));
},{sameGeometryRoi:true}));
