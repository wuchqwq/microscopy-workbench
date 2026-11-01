// Explicit protocol simulation over actual MCP tools. No browser automation,
// human identity claim, model invocation, or hidden scientific truth is used.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient} from './image_panel.mjs';
import {readImageMeasurements} from '../lib/image_measurement_records.mjs';

type Row=Record<string,unknown>;
const row=(value:unknown):Row=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Row;};
const rows=(value:unknown):Row[]=>{assert.ok(Array.isArray(value));return value.map(row);};
const text=(value:unknown):string=>{assert.equal(typeof value,'string');return value as string;};
const id=(value:unknown):string=>{assert.match(text(value),/^[a-f0-9]{32}$/);return value as string;};
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const json=(file:string):Row=>row(JSON.parse(readFileSync(file,'utf8')));
const marker='test_operator_protocol_simulation';

export function redactInterventionLog(value:unknown):unknown {
 if(Array.isArray(value))return value.map(redactInterventionLog);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[
  key,/^(?:panel_url|token|evidence_token|owner_nonce|nonce)$/i.test(key)?'[REDACTED]':redactInterventionLog(entry)]));
 if(typeof value==='string')return value.replace(/http:\/\/127\.0\.0\.1:\d+\/#[^\s"']+/g,'[REDACTED_PANEL_URL]');
 return value;
}

export function assertInterventionGate(packet:Row,panelId:string,expectedObject?:string):Row {
 assert.equal(packet.panel_id,panelId,'The exact requested Panel must answer');
 const view=row(packet.view),object=row(view.object),edit=row(view.edit_state),handoff=row(packet.roi_handoff);
 id(object.object_id);assert.equal(view.panel_id,panelId);
 if(expectedObject)assert.equal(object.object_id,expectedObject,'Current object changed; reread and do not infer a replacement');
 assert.equal(edit.dirty,false,'Uncommitted draft: stop protocol intervention');
 assert.equal(edit.gesture_active,false,'Active gesture: stop protocol intervention');
 assert.equal(view.pending_result,null,'Pending result: explicit acceptance is outside this controller');
 assert.equal(row(handoff.draft_state).requires_user_commit,false,'The current handoff is not committed');
 assert.equal(row(handoff.interaction_gate).status,'ready','Current interaction gate must be explicitly ready');
 assert.ok(Number.isSafeInteger(edit.draft_revision)&&Number(edit.draft_revision)>=0);
 return view;
}

export function interventionAnchor(mark:Row,deltaX:number,deltaY:number):number[] {
 assert.ok(Number.isFinite(deltaX)&&Number.isFinite(deltaY)&&(deltaX!==0||deltaY!==0),'Explicit finite nonzero delta required');
 const anchor=row(mark.anchor),coordinates=anchor.coordinates;
 assert.ok(Array.isArray(coordinates)&&[2,4].includes(coordinates.length)&&coordinates.every(v=>typeof v==='number'&&Number.isFinite(v)));
 assert.ok(['point','line','arrow'].includes(String(mark.kind)),'Edit mode only changes an explicit measured point/line/arrow');
 assert.ok(['frequency_cycles_per_pixel','source_pixels','source_array_indices'].includes(String(anchor.coordinate_space)));
 const moved=[...coordinates] as number[],last=moved.length-2;
 moved[last]=moved[last]!+deltaX;moved[last+1]=moved[last+1]!+deltaY;
 return moved;
}

function originalAnnotation(mark:Row):Row {
 const anchor=row(mark.anchor);
 return {...Object.fromEntries(['annotation_id','kind','status','text','note','color','line_width','arrowhead_size','arrow_length','presentation']
  .filter(key=>mark[key]!==undefined).map(key=>[key,mark[key]])),...anchor};
}

function options(args:string[]):Record<string,string>{
 const result:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];assert.ok(key?.startsWith('--')&&value!==undefined&&!value.startsWith('--'),'Use --key value arguments');assert.equal(result[key.slice(2)],undefined,'Duplicate option');result[key.slice(2)]=value;}
 assert.ok(Object.keys(result).every(k=>['config','panel-id','mode','output','expected-source-sha256','expected-view-id','annotation-id','annotation-object-id','measurement-id','rect','delta-x','delta-y'].includes(k)),'Unknown argument');
 for(const required of ['config','panel-id','mode','output','expected-source-sha256'])assert.ok(result[required],`Missing --${required}`);
 assert.ok(['inspect','observe','edit'].includes(result.mode!));id(result['panel-id']);assert.match(result['expected-source-sha256']!,/^[a-f0-9]{64}$/);
 assert.ok(path.isAbsolute(result.config!)&&path.isAbsolute(result.output!),'Config and output must be absolute');
 return result;
}

export async function runIntervention(args:string[]):Promise<Row>{
 const opt=options(args),output=opt.output!,panelId=opt['panel-id']!,config=json(opt.config!),workspace=path.join(text(config.workspace_root),'images');
 assert.ok(!existsSync(output),'Output must be new; never overwrite an original execution log');mkdirSync(output,{recursive:true});
 const log=(value:unknown)=>appendFileSync(path.join(output,'calls.jsonl'),JSON.stringify(redactInterventionLog(value))+'\n');
 const save=(name:string,value:unknown)=>writeFileSync(path.join(output,name),JSON.stringify(redactInterventionLog(value),null,2)+'\n',{flag:'wx'});
 const oldConfig=process.env.MICROSCOPY_PLUGIN_CONFIG;process.env.MICROSCOPY_PLUGIN_CONFIG=opt.config;
 const runtime=fileURLToPath(new URL('../',import.meta.url)),client=new StdioImageClient({workspace,python:text(config.python),serverPath:path.join(runtime,'tools/plugin_server.mjs')});
 const tag=randomBytes(6).toString('hex');let sequence=0;
 const request=()=>`route-a-intervention-${tag}-${++sequence}`;
 const call=async(name:string,arguments_:Row):Promise<Row>=>{
  log({phase:'before_dispatch',actor:marker,name,arguments:arguments_});
  try{const answer=await client.tool(name,arguments_);const data=row(answer.data);log({phase:'completed',name,data,image_returned:!!answer.png});return data;}
  catch(error){log({phase:'error',name,error:(error as Error).message,automatic_retry:false});throw error;}
 };
 const current=()=>call('image_panel_current',{panel_id:panelId});
 const protect=(objectId:string)=>{
  const directory=path.join(workspace,'objects',id(objectId)),metadata=json(path.join(directory,'object.json'));
  const files=readdirSync(directory).map(name=>path.join(directory,name));files.push(path.join(workspace,'requests',text(metadata.request_id)+'.json'));
  return Object.fromEntries(files.map(file=>[file,hash(file)]));
 };
 const unchanged=(before:Record<string,string>)=>{for(const [file,sha] of Object.entries(before))assert.equal(hash(file),sha,`Original changed: ${file}`);};
 const report:Row={schema_version:1,actor:marker,mode:opt.mode,panel_id:panelId,config_sha256:hash(opt.config!),
  scope:'Actual MCP tool protocol and immutable records; test-operator simulation, not researcher/browser participation',
  GUI:'NOT_TESTED',human_author:'NOT_CLAIMED',model_invoked:false,hidden_truth_read:false};
 try{
  await client.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'route-a-protocol-intervention',version:'1'}});
  const initial=await current(),view=assertInterventionGate(initial,panelId,opt['expected-view-id']),object=row(view.object),beforeId=id(object.object_id);
  const frame=row(view.frame_identity),sourceId=id(frame.source_object_id),source=await call('image_info',{object_id:sourceId});
  const identity=row(source.source_identity);assert.equal(identity.sha256,opt['expected-source-sha256'],'Current Panel belongs to another exact source');
  assert.equal(hash(text(identity.path)),identity.sha256,'Original source changed');
  const protectedFiles={...protect(beforeId),...protect(id(frame.frame_object_id)),...protect(sourceId),[text(identity.path)]:text(identity.sha256)};
  report.initial={object_id:beforeId,frame_identity:frame,source_identity:identity,draft_revision:row(view.edit_state).draft_revision};
  save('initial-current.json',initial);

  const unknownId=request()+'-unsubmitted',unknownFile=path.join(workspace,'requests',unknownId+'.json');assert.equal(existsSync(unknownFile),false);
  const unknownArgs={request_id:unknownId};log({phase:'before_dispatch',name:'image_result',arguments:unknownArgs,write_submitted:false});
  const unknownReply=await client.rpc('tools/call',{name:'image_result',arguments:unknownArgs});
  log({phase:'completed_read',name:'image_result',response:unknownReply,automatic_retry:false});
  assert.match(JSON.stringify(unknownReply),/REQUEST_NOT_FOUND/);assert.equal(existsSync(unknownFile),false);
  report.unknown_request={request_id:unknownId,outcome:'REQUEST_NOT_FOUND',write_submitted:false,automatic_retry:false};

  if(opt.mode==='inspect'){report.final_current=initial;unchanged(protectedFiles);report.original_hashes_unchanged=true;save('report.json',report);return report;}
  let saved:Row,oldMeasurement:Row|null=null,annotationId:string;
  if(opt.mode==='observe'){
   const panels=rows(object.panels).filter(p=>p.domain==='spatial_pixels'&&p.source_object_id===frame.frame_object_id);assert.equal(panels.length,1,'An exact single spatial panel is required');
   const bounds=panels[0]!.source_rect_xyxy as number[];assert.ok(Array.isArray(bounds)&&bounds.length===4);
   const rect=opt.rect?opt.rect.split(',').map(Number):[bounds[0]!+(bounds[2]!-bounds[0]!)/4,bounds[1]!+(bounds[3]!-bounds[1]!)/4,bounds[0]!+3*(bounds[2]!-bounds[0]!)/4,bounds[1]!+3*(bounds[3]!-bounds[1]!)/4].map(Math.round);
   assert.equal(rect.length,4);assert.ok(rect.every(Number.isFinite)&&rect[0]!>=bounds[0]!&&rect[1]!>=bounds[1]!&&rect[2]!<=bounds[2]!&&rect[3]!<=bounds[3]!&&rect[0]!<rect[2]!&&rect[1]!<rect[3]!);
   annotationId=`test-operator-roi-${tag}`;
   const note=`${marker}: central visible image support selected for limited periodicity/texture inspection; no hidden answer or material claim. This is not a real researcher gesture.`;
   saved=await call('image_annotate',{object_id:beforeId,request_id:request(),annotations:[...rows(object.annotations??[]).map(originalAnnotation),
    {annotation_id:annotationId,kind:'rectangle',status:'hypothesized',text:'Test operator ROI',note,coordinate_space:'source_pixels',source_object_id:id(frame.frame_object_id),coordinates:rect}]});
   report.observation={annotation_id:annotationId,rect_xyxy:rect,reason:note,selection_origin:'test_operator_protocol_simulation'};
  }else{
   const annotationObjectId=id(opt['annotation-object-id']);
   const annotated=await call('image_info',{object_id:annotationObjectId});
   Object.assign(protectedFiles,protect(annotationObjectId));
   annotationId=text(opt['annotation-id']);assert.match(annotationId,/^[A-Za-z0-9_-]{1,64}$/);
   const measureId=id(opt['measurement-id']);oldMeasurement=await call('image_info',{object_id:measureId});assert.equal(oldMeasurement.kind,'measure');
   Object.assign(protectedFiles,protect(measureId),protect(id(oldMeasurement.parent_object_id)));
   const marks=rows(annotated.annotations),mark=marks.find(m=>m.annotation_id===annotationId);assert.ok(mark,'The exact saved annotation must be present');
   const targetMeasurements=readImageMeasurements({workspace,objectId:annotationObjectId});
   assert.equal(targetMeasurements.current.source_object_id,sourceId,'Explicit annotation view belongs to a different current source');
   assert.equal(targetMeasurements.current.frame_index,frame.frame_index,'Explicit annotation view belongs to a different current frame');
   const before=targetMeasurements.entries.find(entry=>entry.object_id===measureId);
   assert.ok(before&&before.annotation_id===annotationId&&before.annotation_matches_current&&before.status==='current','Old measurement must actually bind this current anchor');
   const deltaX=Number(opt['delta-x']),deltaY=Number(opt['delta-y']);
   assert.ok(opt['delta-x']!==undefined&&opt['delta-y']!==undefined,'Edit needs explicit delta in the saved anchor coordinate units');
   const coordinates=interventionAnchor(mark,deltaX,deltaY),note=`${marker}: existing endpoint adjusted by [${deltaX}, ${deltaY}] in ${text(row(mark.anchor).coordinate_space)}; the change is a protocol test, not known scientific truth or a human correction.`;
   saved=await call('image_annotate',{object_id:annotationObjectId,request_id:request(),updates:[{annotation_id:annotationId,coordinates,note,status:'hypothesized'}]});
   report.intervention={annotation_id:annotationId,edited_annotation_object_id:annotationObjectId,old_anchor:mark.anchor,new_coordinates:coordinates,delta_xy:[deltaX,deltaY],delta_unit:row(mark.anchor).coordinate_space,old_measurement_object_id:measureId};
  }
  const beforeShow=await current(),showView=assertInterventionGate(beforeShow,panelId,beforeId),showArgs={panel_id:panelId,object_id:id(saved.object_id),expected_object_id:beforeId,draft_revision:row(showView.edit_state).draft_revision,request_id:request()};
  const receipt=await call('image_panel_show',showArgs),fresh=await current();assertInterventionGate(fresh,panelId,id(saved.object_id));
  assert.equal(row(row(receipt.view).object).object_id,saved.object_id);report.presentation_receipt=receipt;
  if(oldMeasurement){
   const measured=readImageMeasurements({workspace,objectId:id(saved.object_id)}).entries.find(entry=>entry.object_id===oldMeasurement!.object_id);
   assert.ok(measured,'Old measurement remains readable');assert.equal(measured.status,'needs_remeasurement');assert.equal(measured.annotation_matches_current,false);
   report.old_measurement={object_id:oldMeasurement.object_id,request_id:oldMeasurement.request_id,status:measured.status,annotation_matches_current:measured.annotation_matches_current,immutable_record:oldMeasurement};
  }
  // Deliberately stale original view guard, using a new presentation request;
  // it must refuse and must not replace the current view or retry any science.
  const staleArgs={...showArgs,request_id:request()};let staleRefused=false;
  try{await call('image_panel_show',staleArgs);}catch(error){assert.match((error as Error).message,/stale/i);staleRefused=true;}
  assert.equal(staleRefused,true);const final=await current();assertInterventionGate(final,panelId,id(saved.object_id));
  unchanged(protectedFiles);report.original_hashes_unchanged=true;report.original_hashes=protectedFiles;
  report.stale_show={refused:true,expected_old_object_id:beforeId,current_object_id:saved.object_id};
  report.final_current=final;report.continuation={panel_id:panelId,current_object_id:saved.object_id,annotation_id:annotationId,
   previous_object_id:beforeId,...(oldMeasurement?{old_measurement_object_id:oldMeasurement.object_id}:{}),
   instruction:'Read actual image_panel_current and saved evidence again. Treat test-operator changes as supplied interventions, not true scientific answers; do not reuse stale measurements.'};
  save('report.json',report);return report;
 }catch(error){report.status='FAILED';report.error=(error as Error).message;save('failure.json',report);throw error;}
 finally{await client.close();if(oldConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=oldConfig;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runIntervention(process.argv.slice(2)).then(report=>console.log(JSON.stringify({status:'PASS',output:process.argv[process.argv.indexOf('--output')+1],continuation:report.continuation??null,GUI:'NOT_TESTED'})))
 .catch(error=>{console.error(redactInterventionLog((error as Error).message));process.exitCode=1;});
}
