// Explicit, bounded research reproduction. Not part of npm test or a numerical suite.
// Run after npm ci && npm run build. Output must be a NEW absolute directory.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const output=process.argv[2],python=process.argv[3];
if(!path.isAbsolute(output??'')||!path.isAbsolute(python??'')||fs.existsSync(output))throw Error('Supply a NEW absolute output directory and an explicit scientific Python executable');
fs.mkdirSync(output);
const builtRoot=fs.existsSync(new URL('../tools/image_panel.mjs',import.meta.url))?new URL('../',import.meta.url):new URL('../dist/',import.meta.url);
const {StdioImageClient,createImagePanel}=await import(new URL('tools/image_panel.mjs',builtRoot));
const {readAnalysisWorkspace,readAnalysisWorkspaceResumeSnapshot}=await import(new URL('lib/analysis_workspace.mjs',builtRoot));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const manifestFiles=workspace=>fs.readdirSync(path.join(workspace,'objects')).flatMap(id=>{const dir=path.join(workspace,'objects',id);return fs.readdirSync(dir).map(name=>({file:id+'/'+name,sha256:hash(path.join(dir,name))}));});
const compact=s=>({object_id:s.object?.object_id,frame_identity:s.frame_identity,window_collection:s.window_collection,workspace_analysis:s.workspace_analysis,spatial_return:s.spatial_return,last_operation:s.last_operation});
const cases=[];
const report={schema_version:1,source_commit:'8f6f08789fd7c6ae41639c1f8957170fd2d8dbff',scope:'Formal existing MCP and Panel HTTP only; no native mouse, private data, numerical accuracy or full GUI claim',started_utc:new Date().toISOString(),count_definition:'frame + initial preview + N real annotation revisions = N+2 ancestor records',cases};

for(const target of [13,64,65]){
 const directory=path.join(output,'records-'+target),workspace=path.join(directory,'workspace'),source=path.join(directory,'public-source.tiff');fs.mkdirSync(directory);
 const record={target_records:target,annotation_revisions:target-2,events:[],calls:[],started_utc:new Date().toISOString()};cases.push(record);let client,panel;
 const log=event=>{record.events.push({...event,utc:new Date().toISOString()});fs.appendFileSync(path.join(directory,'events.jsonl'),JSON.stringify(record.events.at(-1))+'\n');};
 const newClient=()=>{const base=new StdioImageClient({workspace,python});return{rpc:(...args)=>base.rpc(...args),tool:async(name,args)=>{const start=performance.now();try{const reply=await base.tool(name,args);record.calls.push({name,request_id:args.request_id??null,object_id:args.object_id??null,include_frame_ancestry:args.include_frame_ancestry??false,returned_object_id:reply.data?.object_id??null,state:reply.data?.state??null,elapsed_ms:performance.now()-start});return reply;}catch(error){record.calls.push({name,request_id:args.request_id??null,object_id:args.object_id??null,error:String(error),elapsed_ms:performance.now()-start});throw error;}},close:()=>base.close()};};
 const post=async(route,body)=>{const start=performance.now(),origin=panel.url.split('/#')[0];let response;try{response=await fetch(origin+route,{method:'POST',headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(body),signal:AbortSignal.timeout(300000)});const data=await response.json();const result={status:response.status,error:data.error??null,elapsed_ms:performance.now()-start,state:compact(data)};log({route,action:body.action,...result});return {status:response.status,data};}catch(error){log({route,action:body.action,error:String(error),elapsed_ms:performance.now()-start,outcome:'UNKNOWN; do not replay'});throw error;}};
 const act=(action,params={})=>post('/api/action',{expected_object_id:panel.state().object.object_id,draft_revision:panel.state().edit_state.draft_revision,action,params});
 const work=(action,extra={})=>post('/api/workspace',{action,expected_working_revision:panel.state().workspace_analysis.working_revision,...extra});
 try{
  const generated=spawnSync(python,['-B','-c',"import numpy as np,tifffile,sys;tifffile.imwrite(sys.argv[1],np.arange(16*24,dtype=np.uint16).reshape(16,24),photometric='minisblack',metadata=None)",source],{encoding:'utf8',windowsHide:true});assert.equal(generated.status,0,generated.stderr);record.source_sha256=hash(source);
  client=newClient();await client.rpc('initialize');const opened=(await client.tool('image_open',{source_path:source,request_id:'history-'+target+'-open'})).data,frame=(await client.tool('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'history-'+target+'-frame'})).data;
  let current=(await client.tool('image_preview',{object_id:frame.object_id,max_size:128,request_id:'history-'+target+'-view'})).data;
  for(let step=1;step<=target-2;step++){
   const text='Public history ROI revision '+step,args=step===1?{annotations:[{annotation_id:'history-roi',purpose:'resumable_observation',selection_origin:'agent',kind:'rectangle',coordinate_space:'source_pixels',source_object_id:frame.object_id,coordinates:[2.25,2.25,15.75,11.75],text,status:'hypothesized'}]}:{updates:[{annotation_id:'history-roi',text}]};
   current=(await client.tool('image_annotate',{object_id:current.object_id,...args,request_id:'history-'+target+'-annotation-'+step})).data;
   log({phase:'generated',annotation_step:step,object_id:current.object_id,parent_object_id:current.parent_object_id,request_id:current.request_id,label:text});
  }
  record.source_object_id=opened.object_id;record.frame_object_id=frame.object_id;record.view_object_id=current.object_id;
  const qualified=await client.tool('image_info',{object_id:current.object_id,include_frame_ancestry:true});record.actual_records=qualified.data.frame_ancestry?.records.length;record.terminal_record=qualified.data.frame_ancestry?.records.at(-1);assert.equal(record.actual_records,target);assert.equal(record.terminal_record.object_id,frame.object_id);record.original_files=manifestFiles(workspace);
  await client.close();client=null;
  const start=performance.now();panel=await createImagePanel({workspace,python,object_id:current.object_id,client:newClient()});record.initial_panel_elapsed_ms=performance.now()-start;record.initial_state=compact(panel.state());log({phase:'panel-created',elapsed_ms:record.initial_panel_elapsed_ms,state:record.initial_state});
  const collection=panel.state().window_collection,entry=collection?.windows?.find(w=>w.object_id===current.object_id);
  if(entry){const began=performance.now(),origin=panel.url.split('/#')[0],reply=await fetch(origin+`/api/window-asset?window_id=${entry.window_id}&revision=${collection.revision}`,{headers:{'X-Panel-Token':panel.token,Connection:'close'},signal:AbortSignal.timeout(300000)}),body=await reply.json();record.asset={status:reply.status,error:body.error??null,elapsed_ms:performance.now()-began,object_id:body.object_id,png_sha256:body.png_base64?createHash('sha256').update(Buffer.from(body.png_base64,'base64')).digest('hex'):null};log({phase:'asset',...record.asset});}
  else{record.asset={status:'NOT_AVAILABLE',reason:'No window for the genuine source view was admitted',collection};log({phase:'asset',...record.asset});}
  let result=await work('save',{save_id:'long-history-'+target+'-A'});record.initial_save={status:result.status,error:result.data.error??null,workspace_analysis:result.data.workspace_analysis};
  const sourceState=panel.state(),spatial=sourceState.object.panels.find(p=>p.domain==='spatial_pixels'),selection={kind:'rectangle',coordinate_space:'source_pixels',source_object_id:frame.object_id,coordinates:[2.25,2.25,15.75,11.75],panel:spatial};
  if(spatial){result=await act('draft',{draft_revision:sourceState.edit_state.draft_revision+1,dirty:false,gesture_active:false,selection,confirm_persistence:true});record.draft={status:result.status,error:result.data.error??null};
   if(result.status===200){const callsBefore=record.calls.length;result=await act('fft',{selection,window:'hann',subtract_mean:true});record.fft={status:result.status,error:result.data.error??null,provider_fft_calls:record.calls.slice(callsBefore).filter(c=>c.name==='image_fft').length,state:compact(result.data)};
    if(result.status===200){record.fft.object_id=result.data.object.object_id;result=await act('return-spatial');record.return_spatial={status:result.status,error:result.data.error??null,exact_original_view:result.data.object?.object_id===current.object_id,state:compact(result.data)};}
   }
  }
  result=await work('save',{save_id:'long-history-'+target+'-final'});record.final_save={status:result.status,error:result.data.error??null,workspace_analysis:result.data.workspace_analysis};
  result=await work('close');record.close={status:result.status,error:result.data.error??null};
  await panel.close({abnormal:result.status!==200});panel=null;
  if(record.final_save.status===200){const resumed=readAnalysisWorkspaceResumeSnapshot(workspace),reopenStart=performance.now();panel=await createImagePanel({workspace,python,object_id:resumed.object_id,analysis_restore:resumed,client:newClient()});record.reopen={elapsed_ms:performance.now()-reopenStart,state:compact(panel.state()),save_id:readAnalysisWorkspace(workspace).save_id};log({phase:'reopened',...record.reopen});const closed=await work('close');record.reopen.close_status=closed.status;await panel.close({abnormal:closed.status!==200});panel=null;}
 }catch(error){record.error=String(error);log({phase:'case-error',error:String(error)});}
 finally{
  if(panel){try{await panel.close({abnormal:true});}catch(error){record.cleanup_error=String(error);}}
  if(client)await client.close();
  record.source_unchanged=fs.existsSync(source)&&hash(source)===record.source_sha256;
  if(record.original_files)record.original_files_unchanged=record.original_files.every(f=>fs.existsSync(path.join(workspace,'objects',f.file))&&hash(path.join(workspace,'objects',f.file))===f.sha256);
  if(fs.existsSync(path.join(workspace,'requests')))record.fft_requests=fs.readdirSync(path.join(workspace,'requests')).map(f=>JSON.parse(fs.readFileSync(path.join(workspace,'requests',f),'utf8'))).filter(r=>r.parameters?.action==='fft').map(r=>({request_id:r.request_id,state:r.state,object_id:r.response?.object_id}));
  record.completed_utc=new Date().toISOString();write(path.join(directory,'case-receipt.json'),record);console.log(JSON.stringify({target_records:target,actual_records:record.actual_records,frame_resolved:record.initial_state?.frame_identity?.frame_object_id===record.frame_object_id,asset:record.asset?.status,save:record.final_save?.status,fft:record.fft?.status,return_spatial:record.return_spatial?.status,reopened:Boolean(record.reopen),source_unchanged:record.source_unchanged,original_files_unchanged:record.original_files_unchanged,error:record.error}));
 }
}
report.completed_utc=new Date().toISOString();write(path.join(output,'summary.json'),report);
