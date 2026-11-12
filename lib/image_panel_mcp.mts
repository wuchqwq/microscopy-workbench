// Restricted bridge to an owned loopback viewer. Scientific objects remain in
// ImageWorkspace; these small records only retain panel/request connections.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {panelRoiHandoff} from './panel_roi_handoff.mjs';
import {panelStemHandoff} from './panel_stem_handoff.mjs';
import {attachCrystalEvidence} from './panel_crystal_evidence.mjs';
import type {CrystalEvidencePayload} from './panel_crystal_evidence.mjs';
import {prepareOwnedPanelRegistration,readOwnedPanelCheckpoint,assertOwnedPanelStopped,validateOwnedConnection} from './panel_ownership.mjs';
import {ordinaryWorkspaceMetadataDirectory,ordinaryWorkspaceMetadataTarget} from './workspace_metadata_paths.mjs';
import {parsePanelSavedInputReference} from './panel_saved_input_reference.mjs';
import {readAnalysisWorkspace,verifyAnalysisReferences} from './analysis_workspace.mjs';
import {DesktopPanelNotDispatched} from './desktop_panel_activation.mjs';
import type {DesktopPanelActivation} from './desktop_panel_activation.mjs';

import type {ArgumentSchema,ToolInputSchema} from './runtime/schema.mjs';
import type {ToolContent,ToolDefinition,ToolResult} from './runtime/contracts.mjs';
import type {IdentityCheckedPanelState,OwnedPanelConnection,PanelFetch,PanelLaunch,PanelManagerOptions} from './panel_manager_contracts.mjs';

// These slots retain unqualified JSON and thrown values. Local property reads
// preserve the original runtime checks/coercions, without certifying the JSON.
type RawSlots = Record<string,unknown>;
interface ValidatedPanelArguments extends RawSlots {panel_id?:string;object_id?:string;comparison_object_id?:string;observation_view_object_id?:string;request_id?:string;expected_object_id?:string;draft_revision?:number;}
interface PanelMutationArguments extends ValidatedPanelArguments {request_id:string;}
interface InFlightPanelOperation {name:string;args:PanelMutationArguments;promise:Promise<ToolResult>;}
type PanelToolDefinition=ToolDefinition&{inputSchema:ToolInputSchema&{required:readonly string[]}};
interface WrittenPanelRequest extends RawSlots {schema_version:1;request_id:string;name:string;arguments:PanelMutationArguments;panel_id:string;status:'submitted'|'completed'|'failed';response?:unknown;error?:unknown;}
interface ThrownSlots {code?:unknown;httpStatus?:unknown;message?:unknown;}

const objectId: ArgumentSchema={type:'string',pattern:'^[a-f0-9]{32}$',minLength:32,maxLength:32};
const requestId: ArgumentSchema={type:'string',pattern:'^[A-Za-z0-9_-]+$',minLength:1,maxLength:64,description:'Save before submission. Reuse this original ID to query the same operation after cancellation; never invent another ID to retry an uncertain operation.'};
const providerFftInput:ArgumentSchema={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['provider_fft']},request_id:requestId,source_view_object_id:objectId,annotation_id:requestId},required:['kind','request_id','source_view_object_id','annotation_id'],description:'Explicit link to an original completed FFT and a saved ROI view that existed before it. Provider frame, arrays, outward-rounded ROI and calibration must agree. This does not assert that the GUI dispatched the FFT; no link is inferred from the latest ROI.'};
const make=(name:string,description:string,properties:Readonly<Record<string,ArgumentSchema>>,required:readonly string[]):PanelToolDefinition=>({name,description,inputSchema:{type:'object',additionalProperties:false,properties,required}});
export const imagePanelTools: PanelToolDefinition[]=[
  make('image_panel_open','Open an explicitly saved preview/view object in an owned local browser panel; PREVIEW_REQUIRED means no rendering was dispatched. Recover any original preview request before creating another. Open the returned saved view and return its URL and saved PNG. No user path, script or arbitrary URL is accepted. The panel survives MCP client disconnect; same request ID recovers its original panel, never launches another.',{object_id:objectId,request_id:requestId},['object_id','request_id']),
  make('image_panel_current','Read exact current panel/object, source-coordinate selection, saved scoped research_observation reference and unsaved-draft status, plus the saved PNG. A twinning observation confirms only its explicitly recorded scope, not a twin law, orientation or HKL; synthetic_fixture is not human confirmation. With one live registered panel, panel_id may be omitted. This reads after the user says continue; it does not automatically wake the model. Unsaved browser tone/gesture drafts are described separately from the saved image.',{panel_id:objectId},[]),
  make('image_panel_show','Offer an existing result to an explicit panel. Saved statistics/profile results populate the existing numeric slots without replacing the canvas or recalculating. Use current view.object.object_id as the statistics/profile input (not the FFT frame recipe). The exact saved input or an explicitly equal scientific grid, frame and calibration must match. Numeric presentation refuses dirty/newer drafts or pending requests (it is not queued). Optional input_reference links an original provider FFT to an explicit saved ROI for source return/comparison; use its original request, saved spatial view and stable annotation IDs from image_panel_current. The FFT must use that ROI’s outward-rounded source edges, not PNG coordinates. Save request_id first. expected_object_id and draft_revision bind the inspected view. Image results queue for explicit user acceptance when drafts are dirty/newer, instead of overwriting them. Same ID returns the original presentation receipt, never repeats it; call image_panel_current for the latest view.',{panel_id:objectId,object_id:objectId,expected_object_id:objectId,draft_revision:{type:'integer',minimum:0},request_id:requestId,input_reference:providerFftInput},['panel_id','object_id','expected_object_id','draft_revision','request_id']),
];
export const imagePanelResumeTool:PanelToolDefinition=make('image_panel_resume','Explicitly resume a stopped registered owned helper from its exact checkpoint. Save request_id first. Stable logical panel_id, new helper generation and capability; saved crystal evidence remains unvalidated until full image_panel_evidence admission. Never restarts a live, legacy, failed or unknown operation automatically.',{panel_id:objectId,request_id:requestId},['panel_id','request_id']);
export const imagePanelActivateTool:PanelToolDefinition=make('image_panel_activate',
  'Show or focus the Windows native workbench for an exact owned live panel_id. Use for spatial research interaction. This attaches to the same Panel without changing its view or edits. Retain request_id before submitting. Repeat the exact original request only to recover its activation receipt; use a new request for a later intentional focus after the prior outcome is known. A visible window may not receive OS focus.',
  {panel_id:objectId,request_id:requestId},['panel_id','request_id']);
export const imagePanelSavedTool:PanelToolDefinition=make('image_panel_saved',
  'Read back the exact current GUI savepoint for the retained panel_id and save_id observed by image_panel_current. Verifies workspace save and provider references, and returns the saved active view and selection. A draft, unresolved operation, or different save refuses. This does not advance AnalysisContext or start a Codex turn.',
  {panel_id:objectId,save_id:{type:'string',pattern:'^[A-Za-z0-9_.:-]{1,128}$',minLength:1,maxLength:128}},['panel_id','save_id']);
export const imagePanelEvidenceTool:PanelToolDefinition=make('image_panel_evidence','Attach an existing fully admitted general crystal comparison to an owned image Panel without replacing its scientific canvas. Requires the explicitly configured structure provider. Save request_id first; exact original arguments recover only the original attachment receipt, not a new calculation or current-state query. Stale frame/calibration/ROI or unsaved draft refuses; no model is awakened.',{panel_id:objectId,comparison_object_id:objectId,observation_view_object_id:objectId,expected_object_id:objectId,draft_revision:{type:'integer',minimum:0},request_id:requestId},['panel_id','comparison_object_id','expected_object_id','draft_revision','request_id']);
export const IMAGE_PANEL_INSTRUCTIONS='Use image_panel_open to give the researcher a local shared view of an existing image object. Retain the returned panel_id internally. After the user circles a region and says continue, image_panel_current returns its exact source/frequency coordinates and unsaved draft state; use ordinary image_* tools for the chosen operation, then image_panel_show with the inspected object/draft revision. For statistics/profile, use current view.object.object_id as input and image_panel_show to restore the original numeric record without replacing the canvas; a changed/dirty draft refuses numeric presentation. Do not claim automatic model wake. A queued result has not replaced the current view; the researcher explicitly accepts it without losing an unseen draft. Returned PNG is the saved immutable view, not a screenshot of unsaved local tone/gesture drafts. Panel connection records persist across MCP clients but are not a scientific state database; stopped panels are not automatically restarted.';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const canonical=(value:unknown):unknown=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as RawSlots)[key])])):Array.isArray(value)?value.map(canonical):value;
const identical=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const ownKeys=(value:unknown,keys:readonly string[]):value is RawSlots=>(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key))) as boolean;
function validateId(value:unknown,label:string,request=false):asserts value is string{if(typeof value!=='string'||!(request?/^[A-Za-z0-9_-]{1,64}$/:/^[a-f0-9]{32}$/).test(value))throw new Error(`Invalid ${label}`);}
function validateArguments(name:string,args:unknown):asserts args is ValidatedPanelArguments{
  const entry=[...imagePanelTools,imagePanelEvidenceTool,imagePanelResumeTool,imagePanelActivateTool,imagePanelSavedTool].find(tool=>tool.name===name);if(!entry)throw new Error('Unknown panel tool');
  if(!ownKeys(args,Object.keys(entry.inputSchema.properties)))throw new Error('Panel arguments contain unknown fields');
  for(const required of entry.inputSchema.required)if(!Object.hasOwn(args,required))throw new Error(`Missing ${required}`);
  for(const [key,value] of Object.entries(args)){
    if(key==='input_reference'){if(parsePanelSavedInputReference(value).kind!=='provider_fft')throw new Error('Expected explicit provider FFT input reference');}
    else if(key==='draft_revision'){if(!Number.isSafeInteger(value)||(value as number)<0)throw new Error('Invalid draft_revision');}
    else if(key==='save_id'){if(typeof value!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(value))throw new Error('Invalid save_id');}
    else validateId(value,key,key==='request_id');
  }
}
function durableWrite(workspace:string,file:string,value:unknown,{exclusive=false}:{exclusive?:boolean}={}){
  file=ordinaryWorkspaceMetadataTarget(workspace,file);
  const target=exclusive?file:`${file}.${randomBytes(8).toString('hex')}.tmp`,fd=openSync(target,'wx');
  try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}
  if(!exclusive)renameSync(target,ordinaryWorkspaceMetadataTarget(workspace,file));
}
function readJson(file:string,root:string,maxBytes=20*1024*1024):unknown{
  const real=realpathSync.native(file),relative=path.relative(root,real);
  if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative)||!statSync(real).isFile()||statSync(real).size>maxBytes)throw new Error('Invalid private panel record');
  return JSON.parse(readFileSync(real,'utf8'));
}
function connection(value:unknown,panelId:string):OwnedPanelConnection{
  return validateOwnedConnection(value,panelId);
}
function waitWithoutCancelling<Result>(operation:Promise<Result>,signal?:AbortSignal):Promise<Result>{
  if(!signal)return operation;
  return new Promise<Result>((resolve,reject)=>{
    const abort=()=>reject(new Error('Stopped waiting for the panel operation; query its original request_id. It was not cancelled or automatically repeated.'));
    if(signal.aborted){abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    operation.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

export class ImagePanelManager {
  declare readonly workspace:string;declare readonly python:string;declare readonly inspect:NonNullable<PanelManagerOptions['inspect']>;declare readonly fetch:PanelFetch;
  declare readonly inspectEvidence:PanelManagerOptions['inspectEvidence'];
  declare readonly readyTimeoutMs:number;declare readonly requestTimeoutMs:number;
  declare readonly directory:string;declare readonly requests:string;declare readonly panels:string;declare readonly active:Map<string,InFlightPanelOperation>;
  declare readonly launch:(request:PanelLaunch)=>unknown|PromiseLike<unknown>;
  declare readonly desktopActivation:PanelManagerOptions['desktopActivation'];
  // initialize() establishes this path before any public call accesses records.
  declare canonicalDirectory:string;
  constructor({workspace,python,inspect,inspectEvidence,launch,desktopActivation,fetchImpl=fetch,readyTimeoutMs=120000,requestTimeoutMs=120000}:PanelManagerOptions={}){
    if(!workspace||!path.isAbsolute(workspace))throw new Error('Panel workspace must be an absolute configured directory');
    if(typeof python!=='string'||!python)throw new Error('Panel requires a configured DM_IMAGE_PYTHON executable');
    if(typeof inspect!=='function')throw new Error('Panel requires the existing image inspector');
    this.workspace=path.resolve(workspace);this.python=python;this.inspect=inspect;this.inspectEvidence=inspectEvidence;this.fetch=fetchImpl;this.readyTimeoutMs=readyTimeoutMs;this.requestTimeoutMs=requestTimeoutMs;
    this.desktopActivation=desktopActivation;
    this.directory=path.join(this.workspace,'panel-registry');this.requests=path.join(this.directory,'requests');this.panels=path.join(this.directory,'panels');this.active=new Map();
    this.launch=launch??(async({panel_id,object_id,registration_file})=>{
      if(!path.isAbsolute(this.python))throw new Error('Panel launch requires an absolute DM_IMAGE_PYTHON executable; configure the independent image environment');
      const registration=registration_file??prepareOwnedPanelRegistration({workspace:this.workspace,panel_id}).registration_file;
      const child=spawn(process.execPath,[fileURLToPath(new URL('../tools/image_panel.mjs',import.meta.url)),'--workspace',this.workspace,'--python',this.python,'--object',object_id,'--owned-registration',registration],{detached:true,windowsHide:true,stdio:'ignore'});
      await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
    });
  }
  initialize(){mkdirSync(this.workspace,{recursive:true});this.canonicalDirectory=ordinaryWorkspaceMetadataDirectory(this.workspace,'panel-registry',{create:true});for(const relative of ['panel-registry/requests','panel-registry/panels'])ordinaryWorkspaceMetadataDirectory(this.workspace,relative,{create:true});}
  private writeMetadata(file:string,value:unknown,options:{exclusive?:boolean}={}){durableWrite(this.workspace,file,value,options);}
  requestFile(id:unknown){return path.join(this.requests,(id as string)+'.json');}
  connectionFile(id:unknown){return path.join(this.panels,(id as string)+'.json');}
  getConnection(id:unknown){validateId(id,'panel_id');return connection(readJson(this.connectionFile(id),this.canonicalDirectory,4096),id);}
  async request(conn:OwnedPanelConnection,method:string,route:string,body?:unknown):Promise<unknown>{
    if(conn.schema_version===2&&conn.status==='closed')throw new Error('Owned Panel helper was normally closed; use explicit image_panel_resume with a saved new request_id');
    const evidenceKey=method==='POST'&&route==='/api/evidence'?conn.evidence_token:null;
    if(method==='POST'&&route==='/api/evidence'&&!evidenceKey)throw new Error('This saved Panel helper predates qualified evidence attachment; reopen a new Panel without replaying science');
    const readonlyHandoff=method==='GET'&&route.startsWith('/api/roi-handoff?');
    const origin=`http://127.0.0.1:${conn.port}`,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),method==='GET'&&!readonlyHandoff?Math.min(this.requestTimeoutMs,3000):this.requestTimeoutMs);
    try{
      const response=await this.fetch(origin+route,{method,headers:{'X-Panel-Token':conn.token,Origin:origin,...(evidenceKey?{'X-Panel-Evidence-Key':evidenceKey}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
      const text=await response.text();if(Buffer.byteLength(text)>20*1024*1024)throw new Error('Panel response exceeds bound');
      let value:unknown;try{value=JSON.parse(text);}catch{throw new Error('Invalid owned panel response');}
      if(!response.ok){const error:Error&{httpStatus?:number}=new Error(((value as RawSlots).error??`Panel HTTP ${response.status}`) as string);error.httpStatus=response.status;throw error;}
      if(conn.schema_version===2&&(route==='/api/state'||readonlyHandoff)&&((value as RawSlots).helper_session_id!==conn.helper_session_id||(value as RawSlots).panel_generation!==conn.generation))throw new Error('Owned helper generation does not match its connection');
      return value;
    }finally{clearTimeout(timer);}
  }
  response(panelId:string,state:unknown,extra:Readonly<Record<string,unknown>>={}):ToolResult{
    const candidate=state as RawSlots;
    if(!state||typeof state!=='object'||!candidate.object||typeof (candidate.object as RawSlots).object_id!=='string')throw new Error('Panel did not return an explicit current object');
    if(candidate.panel_id!==panelId)throw new Error('Panel response identity does not match the owned connection');
    validateId((candidate.object as RawSlots).object_id,'current object_id');
    const checked=state as IdentityCheckedPanelState;
    // MCP already exposes tools/list; avoid returning the entire catalog with
    // every selection, and never duplicate the base64 image inside text.
    const {png_base64,clean_png_base64,domain_png_base64,tools,crystal_evidence,...baseView}=checked;
    const crystal=crystal_evidence&&typeof crystal_evidence==='object'?crystal_evidence as RawSlots:null,payload=crystal?.payload&&typeof crystal.payload==='object'?crystal.payload as RawSlots:null;
    const {image_png_base64:crystalPng,...crystalMetadata}=payload??{};
    const view=crystal?{...baseView,crystal_evidence:{...crystal,payload:crystalMetadata}}:Object.hasOwn(checked,'crystal_evidence')?{...baseView,crystal_evidence}:baseView;
    const conn=this.getConnection(panelId),roiHandoff=panelRoiHandoff(checked);
    const data={schema_version:1,backend:'external-image-tools',panel_id:panelId,panel_url:`http://127.0.0.1:${conn.port}/#${conn.token}`,...extra,view,roi_handoff:roiHandoff,stem_handoff:panelStemHandoff(checked,roiHandoff),image_semantics:'Saved immutable PNG. Unsaved local display/gesture drafts are described by edit_state and are not baked into this image. Window collection entries are retained saved-view references; object, selection and edit_state describe only the active scientific view. Other windows are read-only displays, not additional active inputs.',automatic_model_wake:false};
    const content:ToolContent[]=[{type:'text',text:JSON.stringify(data,null,2)}];
    for(const image of [png_base64,domain_png_base64,crystalPng])if(image!==null&&image!==undefined){
      if(typeof image!=='string'||image.length>6*1024*1024)throw new Error('Invalid bounded saved panel PNG');
      const png=Buffer.from(image,'base64');if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Panel saved image is not PNG');
      content.push({type:'image',mimeType:'image/png',data:image});
    }
    return {content};
  }
  private async currentResponse(panelId:string,state:unknown):Promise<ToolResult>{
    const view=state as RawSlots;
    if(view.multi_roi_handoff_schema_version!==1)return this.response(panelId,state,{multi_roi_handoff:null});
    const object=view.object as RawSlots,draft=view.edit_state as RawSlots,collection=view.window_collection as RawSlots;
    validateId(object?.object_id,'active handoff object_id');
    if(![view.state_revision,draft?.draft_revision,collection?.revision].every(value=>Number.isSafeInteger(value)&&(value as number)>=0))throw new Error('ROI handoff requires exact current revisions');
    const query=new URLSearchParams({expected_object_id:object.object_id as string,state_revision:String(view.state_revision),draft_revision:String(draft.draft_revision),collection_revision:String(collection.revision)});
    const raw=await this.request(this.getConnection(panelId),'GET','/api/roi-handoff?'+query),packet=raw as RawSlots;
    if(!packet||packet.schema_version!==1||packet.read_only!==true||packet.panel_id!==panelId||packet.active_view_object_id!==object.object_id||packet.state_revision!==view.state_revision||packet.draft_revision!==draft.draft_revision||packet.collection_revision!==collection.revision||packet.frame_object_id!==((view.frame_identity as RawSlots|null)?.frame_object_id??null)||packet.helper_session_id!==view.helper_session_id||packet.panel_generation!==view.panel_generation||!['validated','partial','unavailable'].includes(String(packet.validation_status))||!Array.isArray(packet.source_observations)||packet.source_observations.length>10||!Array.isArray(packet.fft_relations)||packet.fft_relations.length>5)throw new Error('ROI handoff does not match the inspected active view, lease or collection; read current again');
    for(const source of packet.source_observations){if(!source||typeof source!=='object'||!Array.isArray((source as RawSlots).observations)||((source as RawSlots).observations as unknown[]).length>100)throw new Error('ROI handoff observation budget is invalid');}
    return this.response(panelId,state,{multi_roi_handoff:packet});
  }
  async current(args:ValidatedPanelArguments):Promise<ToolResult>{
    let panelId=args.panel_id;
    if(!panelId){
      const entries=readdirSync(this.panels);if(entries.length>100)throw new Error('Panel registry exceeds inspection bound; specify panel_id');
      const live:{id:string;state:unknown}[]=[];
      await Promise.all(entries.filter(name=>/^[a-f0-9]{32}\.json$/.test(name)).map(async name=>{
        const id=name.slice(0,-5);try{const conn=this.getConnection(id),state=await this.request(conn,'GET','/api/state');if((state as RawSlots).panel_id!==id)throw new Error('Wrong panel identity');live.push({id,state});}catch{/* A stopped or malformed panel is not selected by recency. */}
      }));
      if(live.length!==1)throw new Error(`Expected exactly one live registered panel; found ${live.length}. Specify the retained panel_id.`);
      return this.currentResponse(live[0].id,live[0].state);
    }
    return this.currentResponse(panelId,await this.request(this.getConnection(panelId),'GET','/api/state'));
  }
  async saved(args:ValidatedPanelArguments):Promise<ToolResult>{
    const conn=this.getConnection(args.panel_id);
    if(conn.schema_version!==2)throw new Error('Save readback requires an owned Panel helper generation');
    const state=await this.request(conn,'GET','/api/state') as RawSlots;
    const analysis=state.workspace_analysis as RawSlots|undefined;
    const edit=state.edit_state as RawSlots|undefined;
    const persistence=state.draft_persistence as RawSlots|undefined;
    if(state.panel_id!==conn.panel_id||analysis?.status!=='clean'||analysis.dirty!==false||
      analysis.unresolved_request_id!==null||analysis.unresolved_save_id!==null||analysis.recovery_available!==false||
      analysis.save_id!==args.save_id||edit?.dirty!==false||edit.gesture_active!==false||
      edit.annotation_edit!==null||persistence?.pending!==false||persistence.error!==null||
      state.pending_result!==null||state.source_recheck)
      throw new Error('The retained Panel has no matching settled GUI save. Read current state and resolve the original draft, source, or save.');
    const {savepoint,recovery_available}=readAnalysisWorkspace(this.workspace);
    if(!savepoint||recovery_available||savepoint.save_id!==args.save_id||savepoint.revision!==analysis.saved_revision)
      throw new Error('GUI savepoint has changed or needs recovery. Read current state again.');
    verifyAnalysisReferences(this.workspace,savepoint);
    const after=await this.request(conn,'GET','/api/revision') as RawSlots;
    const latest=this.getConnection(args.panel_id);
    if(!Number.isSafeInteger(state.state_revision)||after.state_revision!==state.state_revision||
      latest.helper_session_id!==conn.helper_session_id||latest.generation!==conn.generation||latest.status!=='running')
      throw new Error('Panel changed during save readback. Inspect its current state again.');
    const {object_id,frame_identity,selection,research_observation}=savepoint.snapshot;
    return {content:[{type:'text',text:JSON.stringify({
      panel_id:conn.panel_id,panel_generation:conn.generation,helper_session_id:conn.helper_session_id,
      save_id:savepoint.save_id,saved_revision:savepoint.revision,content_sha256:savepoint.content_sha256,
      object_id,frame_identity,selection,research_observation:research_observation??null,
      automatic_model_wake:false,
    })}]};
  }
  async waitForConnection(panelId:string,helperSession?:string){
    const started=Date.now();
    while(!existsSync(this.connectionFile(panelId))||helperSession&&this.getConnection(panelId).helper_session_id!==helperSession){if(Date.now()-started>this.readyTimeoutMs)throw new Error('Panel launch is unverified; query the original request_id. It will not be automatically relaunched.');await delay(40);}
    return this.getConnection(panelId);
  }
  async recover(record:RawSlots):Promise<ToolResult>{
    if(record.status==='failed')throw new Error(record.error as string|undefined);
    if(record.name==='image_panel_activate')return this.recoverActivation(record);
    if(record.name==='image_panel_resume'){
      if(typeof record.helper_session_id!=='string'||!/^[a-f0-9]{32}$/.test(record.helper_session_id)||!Number.isSafeInteger(record.generation)||(record.generation as number)<2||!['launching','completed'].includes(record.stage as string))throw new Error('Original resume has no qualified assigned helper generation; no operation was repeated');
      if(record.status==='completed'){
        const saved=record.response as RawSlots|undefined;if(!saved||saved.panel_id!==record.panel_id||saved.helper_session_id!==record.helper_session_id||saved.panel_generation!==record.generation)throw new Error('Original resumed-helper receipt has no matching qualified generation');
        return this.response(record.panel_id as string,record.response,{request_id:record.request_id,recovered:true,resumed:true,panel_generation:record.generation,helper_session_id:record.helper_session_id,snapshot_semantics:'Original immutable resumed-helper receipt; call image_panel_current separately.'});
      }
      // A submitted/crashed resume is never another launch. Only the exact
      // already-published generation can establish its original outcome.
      const conn=this.getConnection(record.panel_id);if(conn.schema_version!==2||conn.helper_session_id!==record.helper_session_id||conn.generation!==record.generation)throw new Error('Original resume remains unverified; no helper was relaunched');
      const state=await this.request(conn,'GET','/api/state');record.status='completed';record.response=state;this.writeMetadata(this.requestFile(record.request_id),record);
      return this.response(record.panel_id as string,state,{request_id:record.request_id,recovered:true,resumed:true,panel_generation:record.generation,helper_session_id:record.helper_session_id});
    }
    if(record.name==='image_panel_open'){
      if(!existsSync(this.connectionFile(record.panel_id)))throw new Error('Original panel launch is still unverified. It will not be automatically relaunched.');
      const state=await this.request(this.getConnection(record.panel_id),'GET','/api/state');
      return this.response(record.panel_id as string,state,{request_id:record.request_id,recovered:true});
    }
    if(record.status==='completed')return this.response(record.panel_id as string,record.response,{request_id:record.request_id,recovered:true,snapshot_semantics:'Original immutable presentation receipt; use image_panel_current for the latest view.'});
    const evidence=record.name==='image_panel_evidence';
    const state=await this.request(this.getConnection(record.panel_id),'GET',(evidence?'/api/evidence':'/api/present')+'?request_id='+encodeURIComponent(record.request_id as string));
    if(!(state as RawSlots).presentation||((state as RawSlots).presentation as RawSlots).request_id!==record.request_id||!(evidence?['attached']:['shown','queued']).includes(((state as RawSlots).presentation as RawSlots).status as string))throw new Error('Original panel presentation is not verified; no operation was repeated.');
    record.status='completed';record.response=state;if(evidence)record.stage='completed';this.writeMetadata(this.requestFile(record.request_id),record);
    return this.response(record.panel_id as string,state,{request_id:record.request_id,recovered:true,snapshot_semantics:'Original immutable presentation receipt; use image_panel_current for the latest view.'});
  }
  private activationResult(record:RawSlots,activation:unknown,recovered:boolean):ToolResult{
    return {content:[{type:'text',text:JSON.stringify({
      panel_id:record.panel_id,request_id:record.request_id,panel_generation:record.generation,
      helper_session_id:record.helper_session_id,activation,recovered,automatic_model_wake:false,
      semantics:'Original window activation observation. Read image_panel_current for current scientific state.',
    })}]};
  }
  private finishActivation(record:RawSlots,activation:DesktopPanelActivation,recovered:boolean):ToolResult{
    const file=this.requestFile(record.request_id);
    if(activation.status==='refused'){
      const recovery=activation.reason==='renderer_gone'
        ?' Close the failed native window explicitly, then activate the same live Panel with a new request. If the helper also stopped, recover it through image_panel_resume.'
        :'';
      const error='Native viewer refused activation ('+activation.reason+').'+recovery+' Original request_id: '+record.request_id;
      this.writeMetadata(file,{...record,status:'failed',error});
      throw new Error(error);
    }
    this.writeMetadata(file,{...record,status:'completed',response:activation});
    return this.activationResult(record,activation,recovered);
  }
  private async recoverActivation(record:RawSlots):Promise<ToolResult>{
    if(record.status==='completed')return this.activationResult(record,record.response,true);
    const {panel_id,request_id,helper_session_id,generation}=record;
    if(record.stage==='dispatching'&&typeof helper_session_id==='string'&&typeof generation==='number'){
      const receipt=this.desktopActivation?.read({workspace:this.workspace,panelId:panel_id as string,requestId:request_id as string,helperSessionId:helper_session_id,generation});
      if(receipt)return this.finishActivation(record,receipt,true);
    }
    throw new Error('Original native activation remains unverified. No viewer was relaunched. Original request_id: '+request_id);
  }
  private async activate(args:PanelMutationArguments,file:string):Promise<ToolResult>{
    const panelId=args.panel_id as string,requestId=args.request_id;
    const record:WrittenPanelRequest={schema_version:1,name:'image_panel_activate',request_id:requestId,
      arguments:args,panel_id:panelId,status:'submitted',stage:'preflight'};
    try{this.writeMetadata(file,record,{exclusive:true});}catch(error){
      if((error as ThrownSlots).code==='EEXIST')return this.mutate(record.name,args);
      throw error;
    }
    let dispatched=false;
    let activation:DesktopPanelActivation;
    try{
      if(!this.desktopActivation)throw new Error('Windows native Panel activation is not enabled');
      const conn=this.getConnection(panelId);
      if(conn.schema_version!==2||!conn.helper_session_id||!conn.generation)
        throw new Error('Native activation requires a live owned Panel helper generation');
      const state=await this.request(conn,'GET','/api/state') as RawSlots;
      if(state.panel_id!==panelId)throw new Error('Wrong owned Panel identity');
      const url=`http://127.0.0.1:${conn.port}/#${conn.token}`;
      record.stage='dispatching';record.helper_session_id=conn.helper_session_id;record.generation=conn.generation;
      this.writeMetadata(file,record);
      dispatched=true;
      activation=await this.desktopActivation.activate({workspace:this.workspace,panelId,helperSessionId:conn.helper_session_id,generation:conn.generation,url,requestId});
    }catch(error){
      const detail=error instanceof Error?error.message:'Native activation failed';
      const message=detail+' Original panel request_id: '+requestId+'; query the original request, without relaunching.';
      if(!dispatched||error instanceof DesktopPanelNotDispatched)this.writeMetadata(file,{...record,status:'failed',error:message});
      throw new Error(message);
    }
    return this.finishActivation(record,activation,false);
  }
  async mutateEvidence(args:PanelMutationArguments,file:string):Promise<ToolResult>{
    const record:WrittenPanelRequest={schema_version:1,request_id:args.request_id,name:'image_panel_evidence',arguments:args,panel_id:args.panel_id as string,status:'submitted',stage:'preflight'};
    // NEW tool only: an accepted request identity is reserved before even a
    // read-only qualification/preflight. Failed IDs cannot later become writes.
    try{this.writeMetadata(file,record,{exclusive:true});}catch(error){if((error as ThrownSlots).code==='EEXIST')return this.mutate('image_panel_evidence',args);throw error;}
    let dispatched=false;
    try{
      if(!this.inspectEvidence)throw new Error('Explicit structure provider is unavailable; no fallback is permitted');
      const payload=await this.inspectEvidence(args.comparison_object_id as string) as CrystalEvidencePayload;
      const current=await this.request(this.getConnection(args.panel_id),'GET','/api/state');
      if((current as RawSlots).panel_id!==args.panel_id||((current as RawSlots).object as RawSlots)?.object_id!==args.expected_object_id)throw new Error('Stale owned Panel; read current state before attaching scientific evidence');
      const observation=args.observation_view_object_id?await this.inspect(args.observation_view_object_id):undefined;
      const evidence=attachCrystalEvidence(payload,current,args.request_id,observation);
      const conn=this.getConnection(args.panel_id);
      if(!conn.evidence_token)throw new Error('This saved Panel helper predates qualified evidence attachment; reopen a new Panel without replaying science');
      record.stage='dispatching';this.writeMetadata(file,record);dispatched=true;
      const state=await this.request(conn,'POST','/api/evidence',{request_id:args.request_id,expected_object_id:args.expected_object_id,draft_revision:args.draft_revision,evidence});
      if(!(state as RawSlots).presentation||((state as RawSlots).presentation as RawSlots).request_id!==args.request_id||((state as RawSlots).presentation as RawSlots).status!=='attached')throw new Error('Evidence attachment response is unverified; query the original request_id.');
      record.status='completed';record.stage='completed';record.response=state;this.writeMetadata(file,record);
      return this.response(args.panel_id as string,state,{request_id:args.request_id,recovered:false,snapshot_semantics:'Original immutable presentation receipt; use image_panel_current for the latest view.'});
    }catch(error){
      const message=`${error instanceof Error?error.message:String(error)} Original panel request_id: ${args.request_id}; query the same tool with the same arguments, never submit a new ID to retry.`;
      if(!dispatched||(error as ThrownSlots).httpStatus&&((error as ThrownSlots).httpStatus as number)<500){record.status='failed';record.error=message;this.writeMetadata(file,record);}
      throw new Error(message);
    }
  }
  async mutate(name:string,args:PanelMutationArguments):Promise<ToolResult>{
    const file=this.requestFile(args.request_id);
    if(existsSync(file)){
      const prior=readJson(file,this.canonicalDirectory) as RawSlots;
      if(prior.schema_version!==1||prior.name!==name||!identical(prior.arguments,args))throw new Error('Panel request_id conflicts with its original operation/parameters');
      return this.recover(prior);
    }
    if(name==='image_panel_evidence')return this.mutateEvidence(args,file);
    if(name==='image_panel_resume')return this.resume(args,file);
    if(name==='image_panel_activate')return this.activate(args,file);
    const inspected=await this.inspect(args.object_id as string);
    const inspectedBlocks=(inspected as {content?:unknown}|undefined)?.content;
    if(name==='image_panel_open'&&(!Array.isArray(inspectedBlocks)||!inspectedBlocks.some((block:unknown)=>block&&typeof block==='object'&&(block as RawSlots).type==='image'&&(block as RawSlots).mimeType==='image/png')))throw new Error('PREVIEW_REQUIRED: Panel open was not submitted; explicitly recover/create a saved preview and open its returned object_id. No preview was dispatched.');
    const panelId=name==='image_panel_open'?randomBytes(16).toString('hex'):args.panel_id as string;
    const record:WrittenPanelRequest={schema_version:1,request_id:args.request_id,name,arguments:args,panel_id:panelId,status:'submitted'};
    // Exclusive/fsynced intent is saved before a child or HTTP mutation exists.
    try{this.writeMetadata(file,record,{exclusive:true});}catch(error){if((error as ThrownSlots).code==='EEXIST')return this.mutate(name,args);throw error;}
    try{
      let state:unknown;
      if(name==='image_panel_open'){
        await this.launch({panel_id:panelId,object_id:args.object_id as string,connection_file:this.connectionFile(panelId)});
        state=await this.request(await this.waitForConnection(panelId),'GET','/api/state');
      }else{
        const {panel_id,request_id,object_id,expected_object_id,draft_revision,input_reference}=args;
        state=await this.request(this.getConnection(panel_id),'POST','/api/present',{request_id,object_id,expected_object_id,draft_revision,...(input_reference!==undefined?{input_reference}:{})});
        if(!(state as RawSlots).presentation||((state as RawSlots).presentation as RawSlots).request_id!==request_id||!['shown','queued'].includes(((state as RawSlots).presentation as RawSlots).status as string))throw new Error('Presentation response is unverified; query the original request_id.');
      }
      record.status='completed';if(name!=='image_panel_open')record.response=state;
      this.writeMetadata(file,record);
      return this.response(panelId,state,{request_id:args.request_id,recovered:false,...(name!=='image_panel_open'?{snapshot_semantics:'Original immutable presentation receipt; use image_panel_current for the latest view.'}:{})});
    }catch(error){
      if((error as ThrownSlots).httpStatus&&((error as ThrownSlots).httpStatus as number)<500){record.status='failed';record.error=(error as ThrownSlots).message;this.writeMetadata(file,record);}
      throw new Error(`${(error as ThrownSlots).message} Original panel request_id: ${args.request_id}; query the same tool with the same arguments, never submit a new ID to retry.`);
    }
  }
  async resume(args:PanelMutationArguments,file:string):Promise<ToolResult>{
    const record:WrittenPanelRequest={schema_version:1,request_id:args.request_id,name:'image_panel_resume',arguments:args,panel_id:args.panel_id as string,status:'submitted',stage:'preflight'};
    try{this.writeMetadata(file,record,{exclusive:true});}catch(error){if((error as ThrownSlots).code==='EEXIST')return this.mutate('image_panel_resume',args);throw error;}
    let dispatched=false;
    try{
      const old=this.getConnection(args.panel_id);assertOwnedPanelStopped(old);const checkpoint=readOwnedPanelCheckpoint(this.workspace,old);
      await this.inspect(checkpoint.object_id as string);
      const registration=prepareOwnedPanelRegistration({workspace:this.workspace,panel_id:args.panel_id as string});
      record.helper_session_id=registration.helper_session_id;record.generation=registration.generation;record.stage='launching';this.writeMetadata(file,record);dispatched=true;
      await this.launch({panel_id:args.panel_id as string,connection_file:this.connectionFile(args.panel_id),object_id:checkpoint.object_id as string,registration_file:registration.registration_file,helper_session_id:registration.helper_session_id,generation:registration.generation});
      const state=await this.request(await this.waitForConnection(args.panel_id as string,registration.helper_session_id),'GET','/api/state');
      record.status='completed';record.stage='completed';record.response=state;this.writeMetadata(file,record);
      return this.response(args.panel_id as string,state,{request_id:args.request_id,recovered:false,resumed:true,panel_generation:registration.generation,helper_session_id:registration.helper_session_id});
    }catch(error){const message=`${error instanceof Error?error.message:String(error)} Original resume request_id: ${args.request_id}; query only this original ID; no automatic relaunch.`;if(!dispatched){record.status='failed';record.error=message;this.writeMetadata(file,record);}throw new Error(message);}
  }
  call(name:string,args:unknown={},signal?:AbortSignal):Promise<ToolResult>{
    validateArguments(name,args);this.initialize();
    if(signal?.aborted)throw new Error('Cancelled before panel operation submission');
    if(name==='image_panel_current')return waitWithoutCancelling(this.current(args),signal);
    if(name==='image_panel_saved')return waitWithoutCancelling(this.saved(args),signal);
    const validated=structuredClone(args) as PanelMutationArguments;
    validateArguments(name,validated);
    const identity=validated.request_id;
    let operation=this.active.get(identity);
    if(operation){
      if(!identical(operation.args,validated)||operation.name!==name)throw new Error('Panel request_id conflicts with the in-flight operation');
    }else{
      const promise=this.mutate(name,validated);operation={name,args:validated,promise};this.active.set(identity,operation);
      promise.then(()=>this.active.delete(identity),()=>this.active.delete(identity));
    }
    return waitWithoutCancelling(operation.promise,signal);
  }
}
