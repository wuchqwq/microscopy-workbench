import path from 'node:path';
import {closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import {ImageWorkspace,imageTools} from './image_workspace.mjs';
import {validate} from './runtime/schema.mjs';
import type {ToolResult} from './runtime/contracts.mjs';
import {CliObjectReader,isRow,same,savedRois} from './workbench_cli_records.mjs';
import type {Row,SavedRoi,VerifiedObject} from './workbench_cli_records.mjs';
import {listRoiComparisonReports,publishRoiComparisonReport,readRoiComparisonReport} from './roi_comparison_reports.mjs';
import type {RoiComparisonReport} from './roi_comparison_reports.mjs';
import {AnalysisWorkspace,acquireAnalysisWorkspaceOwner,readAnalysisWorkspace,verifyAnalysisReferences} from './analysis_workspace.mjs';
import {readImageMeasurements} from './image_measurement_records.mjs';
import {fftRequestSuffix,frozenFftInput,guiFftInputAssociation,verifyFftInputAssociation} from './workbench_cli_inputs.mjs';
import type {FftInputAssociation} from './workbench_cli_inputs.mjs';
import {listPanelExecutionInputs,readPanelExecutionInput} from './panel_execution_inputs.mjs';
import {readImageSourceProof,readImageSourceProofs,readSourceProofReferences} from './image_source_proofs.mjs';
import type {SourceProofReference} from './image_source_proofs.mjs';

export const CLI_VERSION='0.1.0';
export const CLI_EXIT={completed:0,invalid_arguments:2,conflict:3,failed:4,outcome_unknown:5,unavailable:6} as const;
export const CLI_HELP=`Microscopy Workbench CLI ${CLI_VERSION} — headless, JSON output\n\nnode dist/tools/workbench_cli.mjs COMMAND --workspace ABS_DIRECTORY --python ABS_PYTHON [OPTIONS]\n\nCommands:\n  version | --help\n  doctor                                Check runtime and scientific environment; no image computation\n  tool --name image_fft --input FILE     Call a supported existing provider tool with exact JSON arguments\n  query --request-id ID                  Query an original request; never resubmit it\n  inspect [--save-id ID | --snapshot-object ID]\n  compare-rois --roi ID,ID,ID --request-id ID [--compute-missing] [--detect-missing-peaks]\n              [--save-id ID | --snapshot-object ID] [--window hann|none] [--subtract-mean true|false]\n  reports [--report-id ID]               Read append-only reference reports; does not adopt results\n  history [--request-id ID]              Read original GUI FFT inputs, including unsaved exploration\n  proof-create --object-id ID --purpose saved_source|fft_input --request-id ID\n               [--input-relative-path PATH --input-sha256 SHA] [--parent-proof-id ID]\n  proof-info --proof-id ID [--proof-sha256 SHA]   Verify current evidence; no scientific write\n  proof-revoke --proof-id ID --reason TEXT --request-id ID\n  proof-adopt --proof-id ID --proof-sha256 SHA --new-save-id ID [--replace-proof-id ID]\n\ninspect/compare accept --proof-id ID --proof-sha256 SHA as an explicit proof context.\nproof-adopt requires a closed, clean workspace and publishes the explicitly named new savepoint; old points remain unchanged.\n\nNo command opens a browser, hidden window or MCP server. inspect/compare use the explicit saved workspace version; --snapshot-object is an explicit immutable handoff, never the GUI's guessed current ROI.\nWrite tool arguments must contain their original request_id. After interruption/timeout use query with that ID. Existing FFT reuse requires exact saved float ROI, source, support, preprocessing and calibration.\nExit: 0 completed, 2 arguments, 3 conflict, 4 known failure, 5 unknown outcome, 6 unavailable. Pixel geometry/candidates do not establish a crystal phase or material strain.\n`;
const requestPattern=/^[A-Za-z0-9_-]{1,64}$/,objectPattern=/^[a-f0-9]{32}$/;
const supported=new Set(['image_open','image_frame','image_preview','image_preview_acknowledge','image_fft','image_peaks','image_measure','image_remeasure','image_info','image_result','image_calibrate','image_annotate','image_context','image_export','image_source_proof','image_source_proof_info','image_source_proof_revoke']);
export interface CliOptions {command:string;workspace?:string;python?:string;name?:string;input?:string;request_id?:string;save_id?:string;snapshot_object?:string;roi?:string;window?:'none'|'hann';subtract_mean?:boolean;compute_missing?:boolean;detect_missing_peaks?:boolean;report_id?:string;proof_id?:string;proof_sha256?:string;object_id?:string;purpose?:'saved_source'|'fft_input';input_relative_path?:string;input_sha256?:string;parent_proof_id?:string;reason?:string;new_save_id?:string;replace_proof_id?:string;}
export interface CliResponse {schema_version:1;cli_version:string;command:string;status:keyof typeof CLI_EXIT;request_id:string|null;data?:unknown;error?:{code:string;message:string;submission_state?:string;};}
function invalid(message:string):never{throw Object.assign(new Error(message),{code:'INVALID_ARGUMENT'});}
export function parseCliArgs(argv:readonly string[]):CliOptions {
 if(!argv.length||argv.length===1&&['--help','help','-h'].includes(argv[0]))return {command:'help'};
 const command=argv[0];if(!['version','doctor','tool','query','inspect','compare-rois','reports','history','proof-create','proof-info','proof-revoke','proof-adopt'].includes(command))invalid('Unknown command; use --help');
 const result:Row={command};const flags=new Set(['--compute-missing','--detect-missing-peaks']),values=new Set(['--workspace','--python','--name','--input','--request-id','--save-id','--snapshot-object','--roi','--window','--subtract-mean','--report-id','--proof-id','--proof-sha256','--object-id','--purpose','--input-relative-path','--input-sha256','--parent-proof-id','--reason','--new-save-id','--replace-proof-id']);
 for(let i=1;i<argv.length;i++){const flag=argv[i],key=flag.slice(2).replaceAll('-','_');if(result[key]!==undefined)invalid('Duplicate option '+flag);if(flags.has(flag)){result[key]=true;continue;}if(!values.has(flag)||!argv[i+1]||argv[i+1].startsWith('--'))invalid('Unknown/missing option '+flag);result[key]=argv[++i];}
 if(command!=='version'&&(!result.workspace||!path.isAbsolute(String(result.workspace))))invalid('Explicit absolute --workspace required');
 if(['tool','query','doctor','proof-create','proof-revoke'].includes(command)&&(!result.python||!path.isAbsolute(String(result.python))))invalid('Explicit absolute --python required');
 if(result.python!==undefined&&!path.isAbsolute(String(result.python)))invalid('--python must be absolute');
 if(result.save_id!==undefined&&result.snapshot_object!==undefined)invalid('Choose one exact savepoint or immutable snapshot');
 for(const key of ['request_id','save_id','report_id','new_save_id'])if(result[key]!==undefined&&!requestPattern.test(String(result[key])))invalid('Invalid '+key);
 if(result.snapshot_object!==undefined&&!objectPattern.test(String(result.snapshot_object)))invalid('Invalid snapshot object ID');
 if(result.window!==undefined&&!['none','hann'].includes(String(result.window)))invalid('--window is hann or none');
 if(result.subtract_mean!==undefined){if(!['true','false'].includes(String(result.subtract_mean)))invalid('--subtract-mean is true or false');result.subtract_mean=result.subtract_mean==='true';}
 if(command==='tool'&&(!result.name||!result.input||!path.isAbsolute(String(result.input))))invalid('tool requires --name and absolute --input JSON file');
 if(command==='query'&&!result.request_id)invalid('query requires original --request-id');
 if(command==='compare-rois'&&(!result.roi||!result.request_id))invalid('compare-rois requires stable --roi IDs and original --request-id');
 for(const key of ['proof_id','object_id','parent_proof_id','replace_proof_id'])if(result[key]!==undefined&&!objectPattern.test(String(result[key])))invalid('Invalid '+key);
 for(const key of ['proof_sha256','input_sha256'])if(result[key]!==undefined&&!/^[a-f0-9]{64}$/.test(String(result[key])))invalid('Invalid '+key);
 if(command==='proof-create'&&(!result.object_id||!result.request_id||!['saved_source','fft_input'].includes(String(result.purpose))))invalid('proof-create requires exact --object-id, --purpose and saved --request-id');
 if(command==='proof-create'&&result.purpose==='fft_input'&&(!result.input_relative_path||!result.input_sha256))invalid('fft_input proof requires original --input-relative-path and --input-sha256');
 if(['proof-info','proof-revoke'].includes(command)&&!result.proof_id)invalid('Proof command requires exact --proof-id');
 if(command==='proof-revoke'&&(!result.request_id||typeof result.reason!=='string'||!result.reason.trim()))invalid('proof-revoke requires original --request-id and explicit --reason');
 if(command==='proof-adopt'&&(!result.proof_id||!result.proof_sha256||!result.new_save_id))invalid('proof-adopt requires exact --proof-id, --proof-sha256 and explicit --new-save-id');
 if(['inspect','compare-rois'].includes(command)&&result.proof_id&&!result.proof_sha256)invalid('Explicit source proof context requires --proof-sha256');
 if((result.compute_missing||result.detect_missing_peaks)&&command!=='compare-rois')invalid('Compute flags require compare-rois');
 if((result.compute_missing||result.detect_missing_peaks)&&!result.python)invalid('Explicit --python required for requested calculations');
 return result as unknown as CliOptions;
}
export function decodeToolResult(result:ToolResult):Row {
 const text=result.content.filter(block=>block.type==='text').map(block=>block.type==='text'?block.text:'').join('\n');let data:unknown;
 try{data=JSON.parse(text);}catch{throw Object.assign(new Error('Provider did not return its structured result'),{code:'OUTCOME_UNKNOWN'});}
 if(!isRow(data))throw Object.assign(new Error('Provider returned a non-object result'),{code:'OUTCOME_UNKNOWN'});
 return data;
}
function durableNew(file:string,value:unknown){const fd=openSync(file,'wx');try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
function readIntent(file:string){const s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>256*1024)throw new Error('Linked or oversized CLI request intent');return JSON.parse(readFileSync(file,'utf8')) as unknown;}
function cliDirectory(workspace:string){mkdirSync(workspace,{recursive:true});const root=realpathSync.native(workspace);if(lstatSync(workspace).isSymbolicLink())invalid('Linked workspace is unsupported');const dir=path.join(root,'cli-requests');mkdirSync(dir,{recursive:true});if(lstatSync(dir).isSymbolicLink()||path.dirname(realpathSync.native(dir))!==root)invalid('CLI request directory escapes workspace');return dir;}
export interface CliPort {call(name:string,args:Row,signal?:AbortSignal):PromiseLike<ToolResult>;close():void;}
export class CliExecution {
 constructor(readonly workspace:string,private readonly provider:CliPort,private readonly signal?:AbortSignal){}
 async call(name:string,args:Row):Promise<Row>{
  if(!supported.has(name))invalid('Unsupported first-release CLI tool: '+name);const definition=imageTools.find(tool=>tool.name===name)!;try{validate(args,definition.inputSchema);}catch(error){invalid(error instanceof Error?error.message:String(error));}
  const writing=name!=='image_info'&&name!=='image_result'&&name!=='image_source_proof_info',requestId=String(args.request_id??'');let intentFile:string|undefined;
  if(writing){
   const dir=cliDirectory(this.workspace);intentFile=path.join(dir,requestId+'.json');const intent={schema_version:1,name,arguments:args};
   if(existsSync(intentFile)){
    const saved=readIntent(intentFile);if(!same(saved,intent))throw Object.assign(new Error('Original request is bound to different arguments'),{code:'REQUEST_CONFLICT'});
    // A second invocation reads the original provider outcome, including a
    // request that never reached the provider. It does not submit it again.
    try{return decodeToolResult(await this.provider.call('image_result',{request_id:requestId},this.signal));}catch(error){if(error&&typeof error==='object')Object.assign(error,{request_id:requestId});throw error;}
   }
   durableNew(intentFile,intent);
  }
  try{return decodeToolResult(await this.provider.call(name,args,this.signal));}
  catch(error){if(error&&typeof error==='object'&&typeof args.request_id==='string'&&!Object.hasOwn(error,'request_id'))Object.assign(error,{request_id:args.request_id});throw error;}
 }
 close(){this.provider.close();}
}
function snapshot(options:CliOptions):{snapshot:Row;save_id:string|null;revision:number|null}{
 if(options.snapshot_object)return {snapshot:{object_id:options.snapshot_object},save_id:null,revision:null};
 const saved=readAnalysisWorkspace(options.workspace!);if(!saved.savepoint)throw Object.assign(new Error('No explicit workspace savepoint. Save in GUI or hand off --snapshot-object explicitly; legacy checkpoints are not user saves.'),{code:'VERSION_CONFLICT'});
 verifyAnalysisReferences(options.workspace!,saved.savepoint);
 if(options.save_id!==undefined&&saved.save_id!==options.save_id)throw Object.assign(new Error('Requested savepoint is not the current exact saved version; use an explicit immutable snapshot'),{code:'VERSION_CONFLICT'});
 return {snapshot:saved.savepoint.snapshot as unknown as Row,save_id:saved.save_id,revision:saved.revision};
}
function proofReferences(options:CliOptions,base:Row):SourceProofReference[]{return readSourceProofReferences([...(Array.isArray(base.adopted_results)?base.adopted_results:[]),...(options.proof_id?[{kind:'source_proof_reference_v1',object_id:options.proof_id,manifest_sha256:options.proof_sha256}]:[])]);}
export function findReusableFft(reader:CliObjectReader,objects:VerifiedObject[],roi:SavedRoi,_base:Row,recipe:{window:'none'|'hann';subtract_mean:boolean},reports:RoiComparisonReport[],saveId:string|null=null):(VerifiedObject&{input_association:FftInputAssociation})|null {
 const source=reader.object(roi.source_view_object_id).value,frame=reader.frame(roi.source_view_object_id).value;
 reader.verifyArray(frame.object_id);
 const candidates=objects.filter(candidate=>candidate.value.kind==='fft'&&candidate.value.array_domain==='frequency'&&candidate.value.dtype==='complex128'&&candidate.value.window===recipe.window&&candidate.value.subtract_mean===recipe.subtract_mean&&same(candidate.value.source_rect_xyxy,roi.processing_rect_xyxy)&&same(candidate.value.xy_calibration,source.xy_calibration)&&reader.frame(candidate.value.object_id).value.object_id===frame.object_id&&same(reader.frame(candidate.value.object_id).value.files_sha256,frame.files_sha256));
 const executions=listPanelExecutionInputs(reader.root).filter(entry=>entry.qualification==='validated'&&entry.status==='completed');
 for(const candidate of candidates.sort((a,b)=>String(a.value.object_id).localeCompare(String(b.value.object_id)))){
  let proof=saveId?guiFftInputAssociation(reader,saveId,candidate,roi,recipe):null;
  if(!proof)for(const execution of executions){if(execution.fft_object_id!==candidate.value.object_id)continue;try{proof=verifyFftInputAssociation(reader,candidate,roi,recipe,{kind:'gui_panel_execution_input_v1',input_relative_path:execution.input_relative_path,input_sha256:execution.input_sha256});break;}catch{/* A different frozen exploratory ROI cannot qualify this saved ROI. */}}
  if(!proof)for(const report of reports){for(const row of report.rows){if(row.annotation_id!==roi.annotation_id||!isRow(row.fft)||row.fft.object_id!==candidate.value.object_id||row.fft.input_association===undefined)continue;try{proof=verifyFftInputAssociation(reader,candidate,roi,recipe,row.fft.input_association);break;}catch{/* An unqualified legacy/self-reported association cannot enable reuse. */}}if(proof)break;}
  if(proof){reader.verifyArray(candidate.value.object_id);return {...candidate,input_association:proof};}
 }
 return null;
}
export interface FftLookup {status:'verified'|'known_existing_unqualified'|'proven_missing'|'unavailable';fft?:VerifiedObject&{input_association:FftInputAssociation};fft_object_id?:string;request_id?:string;reason?:string;}
// An execution is a fact independently of whether its old pre-dispatch input
// can still qualify reuse. Missing evidence never licenses a replacement FFT.
export function findReusableFftResult(reader:CliObjectReader,objects:VerifiedObject[],roi:SavedRoi,base:Row,recipe:{window:'none'|'hann';subtract_mean:boolean},reports:RoiComparisonReport[],saveId:string|null=null):FftLookup {
 let originalError:unknown=null;try{const fft=findReusableFft(reader,objects,roi,base,recipe,reports,saveId);if(fft)return {status:'verified',fft,fft_object_id:String(fft.value.object_id),request_id:String(fft.value.request_id)};}catch(error){originalError=error;}
 let history:ReturnType<typeof listPanelExecutionInputs>;try{history=listPanelExecutionInputs(reader.root);}catch(error){return {status:'unavailable',reason:'Original FFT input listing is incomplete: '+String(error)};}
 const view=reader.object(roi.source_view_object_id).value;let uncertain=false;
 for(const entry of history){const input=entry.input_snapshot;if(!input){uncertain=true;continue;}
  if(input.frame_object_id!==roi.frame_object_id||!same(input.processing_rect_xyxy,roi.processing_rect_xyxy)||!same(input.recipe,recipe)||!same(input.calibration_snapshot,view.xy_calibration??null))continue;
  if(!same(input.float_roi_xyxy,roi.float_roi_xyxy))continue;
  if(entry.execution_status==='completed'&&entry.fft_object_id)return {status:'known_existing_unqualified',fft_object_id:entry.fft_object_id,request_id:entry.request_id,reason:entry.reason??'A completed original FFT exists for this exact frame, floating ROI, support, calibration and recipe. Its reuse qualification is unavailable; no replacement is computed.'};
  if(entry.execution_status!=='not_submitted'&&entry.execution_status!=='failed')return {status:'unavailable',request_id:entry.request_id,reason:entry.reason??'Query the original unresolved FFT request; no replacement is computed.'};
 }
 // Legacy FFTs without an independently qualified float-input association
 // are candidates, never proof that this area has not already been computed.
 for(const object of objects){const value=object.value;if(value.kind!=='fft'||value.window!==recipe.window||value.subtract_mean!==recipe.subtract_mean||!same(value.source_rect_xyxy,roi.processing_rect_xyxy)||!same(value.xy_calibration??null,view.xy_calibration??null))continue;
  try{if(reader.frame(value.object_id).value.object_id!==roi.frame_object_id)continue;const binding=history.find(entry=>entry.fft_object_id===value.object_id&&entry.input_snapshot);if(binding&&!same(binding.input_snapshot!.float_roi_xyxy,roi.float_roi_xyxy))continue;return {status:'known_existing_unqualified',fft_object_id:String(value.object_id),request_id:String(value.request_id),reason:'An existing FFT matches frame, support, calibration and recipe, but its exact original floating input is unqualified. It is retained and is not recomputed.'};}catch(error){return {status:'unavailable',fft_object_id:String(value.object_id),reason:'Existing FFT source evidence is unavailable: '+String(error)};}
 }
 if(originalError||uncertain||!reader.completeListing(objects))return {status:'unavailable',reason:originalError?String(originalError):'A complete stable FFT/input listing was not established; absence is not proven.'};
 return {status:'proven_missing'};
}
function compactMeasurement(row:Row):Row {return Object.fromEntries(['measurement_object_id','points','pixel_period','d_spacing','d_spacing_unit','image_coordinate_angle_degrees','physical_angle_degrees','physical_angle','measurement_uncertainty','uncertainty_status','result_semantics','status','scientific_grid_identity','measurement_manifest_sha256','dc_reference_point_index','limitation'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));}
function providerStatus(data:Row):keyof typeof CLI_EXIT {
 if(data.state==='failed'||data.state==='not_submitted')return 'failed';
 return data.state==='completed'&&data.ok!==false?'completed':'outcome_unknown';
}
export async function compareRois(options:CliOptions,execution:CliExecution):Promise<RoiComparisonReport>{
 const base=snapshot(options),reader=new CliObjectReader(options.workspace!,proofReferences(options,base.snapshot)),rois=savedRois(reader,base.snapshot),chosen=String(options.roi).split(',');if(chosen.length<1||chosen.length>100||new Set(chosen).size!==chosen.length||chosen.some(id=>!requestPattern.test(id)))invalid('Select one to 100 distinct stable ROI IDs');
 const selected=chosen.map(id=>{const found=rois.find(roi=>roi.annotation_id===id);if(!found)invalid('ROI is absent from the exact saved snapshot: '+id);return found;});if(new Set(selected.map(r=>r.frame_object_id)).size!==1)invalid('First-release comparison requires ROIs from one exact source frame');
 const recipe={window:options.window??'hann',subtract_mean:options.subtract_mean??true},objects=reader.objects(),reports=listRoiComparisonReports(options.workspace!);
 const lookups=selected.map(roi=>({annotation_id:roi.annotation_id,...findReusableFftResult(reader,objects,roi,base.snapshot,recipe,reports,base.save_id)}));
 if(lookups.some(entry=>entry.status==='known_existing_unqualified'||entry.status==='unavailable'))throw Object.assign(new Error('One or more selected ROIs have existing or unresolved FFT evidence. Query/inspect the original result; --compute-missing will not replace it.'),{code:'FFT_INPUT_UNAVAILABLE',lookup_results:lookups.map(({fft,...entry})=>entry)});
 reader.verifyProofContext();
 const frozenInputs=selected.map(roi=>frozenFftInput(reader,roi,recipe));
 const requestId=options.request_id!,plan={schema_version:1,command:'compare-rois',request_id:requestId,source_save_id:base.save_id,source_revision:base.revision,source_view_object_id:base.snapshot.object_id,rois:selected,frozen_inputs:frozenInputs,recipe,compute_missing:Boolean(options.compute_missing),detect_missing_peaks:Boolean(options.detect_missing_peaks)},dir=cliDirectory(options.workspace!),planFile=path.join(dir,'comparison-'+requestId+'.json');
 if(existsSync(planFile)){const previous=readIntent(planFile);if(!same(previous,plan))throw Object.assign(new Error('Comparison request ID is bound to another exact input/recipe'),{code:'REQUEST_CONFLICT'});try{return readRoiComparisonReport(options.workspace!,requestId);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 else durableNew(planFile,plan);
 const rows:Row[]=[];
 for(const [index,roi] of selected.entries()){
  const uncertainties=['Peak identity/correspondence across ROIs is not established.','Image-coordinate angle is a reciprocal-vector direction, not a crystal orientation or phase assignment.'];
  let fft:VerifiedObject|null=lookups[index].fft??null,inputAssociation=(fft as (VerifiedObject&{input_association:FftInputAssociation})|null)?.input_association??null,reused=Boolean(fft);const input=frozenInputs[index],suffix=fftRequestSuffix(requestId,index,input);
  if(!fft&&options.compute_missing){
   // Rectangles use original source-pixel edges, never coordinates local to a
   // cropped/display/annotation array. Attach only the exact already-saved
   // calibration record when the current observation differs from the frame.
   const source=reader.object(roi.source_view_object_id).value,frame=reader.frame(roi.source_view_object_id).value;let target=frame.object_id;
   if(!same(source.xy_calibration,frame.xy_calibration)){
    if(!isRow(source.xy_calibration)||!objectPattern.test(String(source.xy_calibration.calibration_id)))invalid('Current ROI calibration cannot be bound to its source frame explicitly');
    const attached=await execution.call('image_calibrate',{object_id:frame.object_id,calibration_object_id:source.xy_calibration.calibration_id,request_id:'cli-scale-'+suffix});if(attached.state!=='completed'||!objectPattern.test(String(attached.object_id)))throw Object.assign(new Error('Calibration attachment unresolved; query cli-scale-'+suffix),{code:'OUTCOME_UNKNOWN',request_id:'cli-scale-'+suffix});target=attached.object_id;
   }
   const output=await execution.call('image_fft',{object_id:target,rect:roi.processing_rect_xyxy,...recipe,request_id:'cli-fft-'+suffix});if(output.ok===false||output.state!=='completed'||!objectPattern.test(String(output.object_id)))throw Object.assign(new Error('FFT did not complete; query original request cli-fft-'+suffix),{code:'OUTCOME_UNKNOWN',request_id:'cli-fft-'+suffix});fft=reader.object(output.object_id);reader.verifyArray(fft.value.object_id);inputAssociation={kind:'cli_request_v1',comparison_id:requestId,row_index:index,input_snapshot:input};verifyFftInputAssociation(reader,fft,roi,recipe,inputAssociation);
  }
  if(!fft){rows.push({...roi,fft:null,peaks:[],measurements:[],status:'needs_fft',uncertainties:[...uncertainties,'No FFT with a verified exact input association and recipe is available.']});continue;}
  let peakViews=objects.filter(object=>Array.isArray(object.value.peak_table)&&object.value.spectrum_object_id===fft!.value.object_id&&same(object.value.xy_calibration,fft!.value.xy_calibration));
  if(!peakViews.length&&options.detect_missing_peaks){const output=await execution.call('image_peaks',{object_id:fft.value.object_id,request_id:'cli-peaks-'+suffix});if(output.ok===false||output.state!=='completed'||!objectPattern.test(String(output.object_id)))throw Object.assign(new Error('Peak candidate request did not complete; query cli-peaks-'+suffix),{code:'OUTCOME_UNKNOWN',request_id:'cli-peaks-'+suffix});peakViews=[reader.object(output.object_id)];}
  const peaks=peakViews.flatMap(view=>(view.value.peak_table as Row[]).map(peak=>({...peak,view_object_id:view.value.object_id,view_manifest_sha256:view.manifest_sha256,meaning:'numerical_candidate_not_verified_reflection'}))),measurements=readImageMeasurements({workspace:options.workspace,objectId:String(fft.value.object_id),limit:500}) as Row;
  const measured=(Array.isArray(measurements.entries)?measurements.entries:[]).filter((m):m is Row=>isRow(m)&&m.same_grid===true&&m.status==='current').map(compactMeasurement);
  if(!measured.length)uncertainties.push('No current committed two-point measurement. Choose corresponding peaks explicitly; no period or orientation is asserted.');
  if(!fft.value.xy_calibration)uncertainties.push('No active physical calibration; pixel-domain geometry only.');
  uncertainties.push('Localization, calibration covariance, peak significance and material strain are not established by this comparison.');
  rows.push({...roi,fft:{object_id:fft.value.object_id,reused,input_snapshot_verified:true,input_association:inputAssociation,manifest_sha256:fft.manifest_sha256,array_sha256:isRow(fft.value.files_sha256)?fft.value.files_sha256['data.npy']:null},peaks,measurements:measured,status:measured.length?'measured':peaks.length?'candidate_peaks_only':'needs_point_selection',uncertainties});
 }
 const report:RoiComparisonReport={schema_version:1,kind:'roi_lattice_comparison',comparison_id:requestId,request_id:requestId,source_save_id:base.save_id,source_revision:base.revision,source_view_object_id:String(base.snapshot.object_id),frame_object_id:selected[0].frame_object_id,...(reader.proofReferences.length?{source_proof_refs:[...reader.proofReferences]}:{}),recipe,rows,interpretation:{status:'not_assessed',notes:['Rows are independent conditional observations. No automatic reflection correspondence, crystal phase, defect or strain decision is made.','Scientific provider objects and original journals remain authoritative. This append-only reference report is not a workspace save or GUI adoption.']}};
 publishRoiComparisonReport(options.workspace!,report);return report;
}
export async function runCli(options:CliOptions,{signal,provider}:{signal?:AbortSignal;provider?:CliPort}={}):Promise<CliResponse>{
 const result=(data:unknown):CliResponse=>({schema_version:1,cli_version:CLI_VERSION,command:options.command,status:'completed',request_id:options.request_id??null,data});
 if(options.command==='version')return result({version:CLI_VERSION,node:process.versions.node,headless:true});
 if(options.command==='reports')return result(options.report_id?readRoiComparisonReport(options.workspace!,options.report_id):listRoiComparisonReports(options.workspace!));
 if(options.command==='history')return result({read_only:true,entries:options.request_id?[readPanelExecutionInput(options.workspace!,options.request_id)]:listPanelExecutionInputs(options.workspace!),meaning:'Original execution-input history, not workspace save/adoption. Each entry preserves its scientific execution status separately.'});
 if(options.command==='proof-info'){const proof=readImageSourceProof(options.workspace!,options.proof_id!,options.proof_sha256);return {...result(proof),status:proof.status==='verified'?'completed':'unavailable'};}
 if(options.command==='proof-adopt'){const adopted=await adoptSourceProof(options);return {...result(adopted),status:adopted.state!=='completed'?'failed':isRow(adopted.proof_status)&&adopted.proof_status.status!=='verified'?'unavailable':'completed'};}
 if(options.command==='inspect'){const base=snapshot(options),reader=new CliObjectReader(options.workspace!,proofReferences(options,base.snapshot)),rois=savedRois(reader,base.snapshot);reader.verifyProofContext();return result({save_id:base.save_id,revision:base.revision,state:base.save_id?'explicitly_saved':'explicit_immutable_snapshot',source_view_object_id:base.snapshot.object_id,rois,source_proof_refs:reader.proofReferences,working_gui_edits_read:false});}
 if(options.command==='doctor'){
  if(!existsSync(options.python!)||!lstatSync(options.python!).isFile())return {...result(null),status:'unavailable',error:{code:'PYTHON_UNAVAILABLE',message:'Explicit Python executable is missing'}};
  // Environment checks are separate from an image scientific request. No GUI
  // modules, hidden windows or image objects are created here.
  const {spawnSync}=await import('node:child_process');const check=spawnSync(options.python!,['-B','-c','import json,sys,numpy,PIL,tifffile;print(json.dumps({"python":sys.version.split()[0],"numpy":numpy.__version__,"Pillow":PIL.__version__,"tifffile":tifffile.__version__}))'],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:65536});
  if(check.error||check.status!==0)return {...result(null),status:'unavailable',error:{code:'RUNTIME_UNAVAILABLE',message:'Scientific environment check failed: '+String(check.error?.message??check.stderr).slice(-2000)}};return result({headless:true,runtime:JSON.parse(check.stdout)});
 }
 const own=provider??new ImageWorkspace({workspace:options.workspace,python:options.python}),execution=new CliExecution(options.workspace!,own,signal);
 try{
  if(options.command==='proof-create'){const data=await execution.call('image_source_proof',{object_id:options.object_id,purpose:options.purpose,request_id:options.request_id,...(options.input_relative_path?{input_relative_path:options.input_relative_path,input_sha256:options.input_sha256}:{}),...(options.parent_proof_id?{parent_proof_id:options.parent_proof_id}:{})});return {...result(data),status:providerStatus(data)};}
  if(options.command==='proof-revoke'){const data=await execution.call('image_source_proof_revoke',{proof_object_id:options.proof_id,reason:options.reason,request_id:options.request_id});return {...result(data),status:providerStatus(data)};}
  if(options.command==='compare-rois')return result(await compareRois(options,execution));
  if(options.command==='query'){const data=await execution.call('image_result',{request_id:options.request_id}),status=data.request_id!==options.request_id?'outcome_unknown':providerStatus(data);return {...result(data),status};}
  if(options.command==='tool'){const stat=lstatSync(options.input!);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)invalid('Input must be an ordinary JSON file, at most 256 KiB');const input:unknown=JSON.parse(readFileSync(options.input!,'utf8'));if(!isRow(input))invalid('Tool input must be a JSON object');const data=await execution.call(options.name!,input);const envelope=result(data);envelope.request_id=typeof data.request_id==='string'?data.request_id:typeof input.request_id==='string'?input.request_id:null;return {...envelope,status:providerStatus(data)};}
  return invalid('Unknown CLI command');
 }finally{if(!provider)execution.close();}
}
// This recovery entry publishes one explicitly requested savepoint using the
// existing owner/CAS/save-intent mechanism. It never repairs the old savepoint.
export async function adoptSourceProof(options:CliOptions):Promise<Row>{
 const workspace=options.workspace!,saved=readAnalysisWorkspace(workspace);if(!saved.savepoint)throw Object.assign(new Error('Proof adoption requires an explicit existing workspace savepoint'),{code:'VERSION_CONFLICT'});verifyAnalysisReferences(workspace,saved.savepoint);
 const owner=acquireAnalysisWorkspaceOwner(workspace,{role:'cli'});try{
  const state=new AnalysisWorkspace(workspace,structuredClone(saved.savepoint.snapshot),owner),saveId=options.new_save_id!;
  if(existsSync(path.join(workspace,'analysis-workspace','saves',saveId+'.json'))){const queried=state.querySave(saveId);if(queried.state==='completed'&&!isRow((queried as Row).savepoint))return {...queried,query_only:true,automatic_retry:false,proof_status:{status:'unavailable',reason:'The original completed save is no longer the current savepoint. Its receipt was queried; adoption was not replayed.'}};if(queried.state==='completed'){const point=(queried as Row).savepoint as typeof saved.savepoint,refs=readSourceProofReferences(point.snapshot.adopted_results);if(!refs.some(ref=>ref.object_id===options.proof_id&&ref.manifest_sha256===options.proof_sha256)||options.replace_proof_id&&refs.some(ref=>ref.object_id===options.replace_proof_id))throw Object.assign(new Error('Original save_id belongs to another proof adoption'),{code:'REQUEST_CONFLICT'});state.close();const checked=readImageSourceProofs(workspace,refs);return {state:'completed',query_only:true,savepoint:point,proof_status:checked.find(proof=>proof.status!=='verified')??checked.find(proof=>proof.proof_object_id===options.proof_id)};}return {...queried,automatic_retry:false};}
  const status=state.status();if(status.recovery_available||status.dirty||status.unresolved_save_id||status.unresolved_request_id)throw Object.assign(new Error('Resolve the existing working/recovery/original save state before adopting a proof'),{code:'VERSION_CONFLICT'});
  const reader=new CliObjectReader(workspace),original=structuredClone(saved.savepoint.snapshot),edit=isRow(original.edit_state)?original.edit_state:{};
  const requests=readdirSync(path.join(workspace,'requests'));if(requests.length>8192)throw Object.assign(new Error('Provider request status scan exceeds its existing budget'),{code:'BUDGET_EXCEEDED'});for(const name of requests){if(!name.endsWith('.json'))continue;const request=reader.json(path.join(workspace,'requests',name)).value;if(!['completed','failed','not_submitted'].includes(String(request.state)))throw Object.assign(new Error('Query the original unresolved provider request '+String(request.request_id??name)+' before proof adoption'),{code:'OUTCOME_UNKNOWN',request_id:request.request_id});}
  if(edit.dirty===true||edit.annotation_edit!=null)throw Object.assign(new Error('Apply existing draft edits before proof adoption'),{code:'VERSION_CONFLICT'});
  const journalDir=path.join(workspace,'panel-journals');if(existsSync(journalDir)){const inputs=listPanelExecutionInputs(workspace);if(inputs.some(entry=>entry.execution_status==='unknown'))throw Object.assign(new Error('Query the original unresolved Panel FFT request before proof adoption'),{code:'OUTCOME_UNKNOWN'});}
  const proof=readImageSourceProof(workspace,options.proof_id!,options.proof_sha256);if(proof.status!=='verified'||proof.purpose!=='saved_source'||proof.basis!=='current'||!proof.frame_identity||!proof.dependencies.some(dep=>dep.object_id===original.object_id&&dep.manifest_sha256===reader.object(original.object_id).manifest_sha256))throw Object.assign(new Error(proof.reason??'New saved-source proof does not cover the exact saved current source'),{code:'SOURCE_PROOF_UNAVAILABLE'});
  if(original.frame_identity!==null&&original.frame_identity!==undefined&&!same(original.frame_identity,proof.frame_identity))throw Object.assign(new Error('New proof does not match the original non-null saved frame identity'),{code:'VERSION_CONFLICT'});
  const adopted=Array.isArray(original.adopted_results)?original.adopted_results:[];if(options.replace_proof_id&&!adopted.some(value=>isRow(value)&&value.kind==='source_proof_reference_v1'&&value.object_id===options.replace_proof_id))invalid('--replace-proof-id is absent from this exact savepoint');
  original.adopted_results=[...adopted.filter(value=>!(isRow(value)&&value.kind==='source_proof_reference_v1'&&(value.object_id===options.replace_proof_id||value.object_id===options.proof_id))),{kind:'source_proof_reference_v1',object_id:options.proof_id!,manifest_sha256:options.proof_sha256!}];
  if(original.frame_identity===null||original.frame_identity===undefined)original.frame_identity=structuredClone(proof.frame_identity);
  state.update(original);const point=await state.save(saveId,state.status().working_revision,async value=>{const checked=readImageSourceProofs(workspace,readSourceProofReferences(value.adopted_results)),current=checked.find(proof=>proof.proof_object_id===options.proof_id),failed=checked.find(proof=>proof.status!=='verified');if(failed||!current||!same(current.frame_identity,value.frame_identity))throw Object.assign(new Error(failed?.reason??'Adopted proof/frame changed during explicit save validation; replace unavailable references explicitly'),{code:'SOURCE_PROOF_UNAVAILABLE'});});state.close();return {state:'completed',query_only:false,savepoint:point,proof_status:{status:'verified',proof_object_id:options.proof_id,manifest_sha256:options.proof_sha256,verified_at_explicit_save:true}};
 }finally{owner.release();}
}
export function cliError(command:string,error:unknown,requestId:string|null=null):CliResponse{
 const e=error as Error&{code?:string;executionCategory?:string;request_id?:string;submission_state?:string;diagnostic?:Row;lookup_results?:unknown};const code=e.code??(e instanceof SyntaxError?'INVALID_ARGUMENT':e.diagnostic?.submission_state==='not_submitted'?'NOT_SUBMITTED':e.executionCategory??'CLI_ERROR');
 const status:keyof typeof CLI_EXIT=/CONFLICT|OWNERSHIP|LOCKED/.test(code)||code==='WORKSPACE_METADATA_BUSY'?'conflict':/INVALID|ARGUMENT/.test(code)||e.name==='TypeError'?'invalid_arguments':/UNAVAILABLE|BUDGET_EXCEEDED|SOURCE_PROOF_REVOKED/.test(code)?'unavailable':/UNKNOWN|cancelled|timeout/.test(code)||e.diagnostic?.submission_state==='outcome_unknown'?'outcome_unknown':code==='NOT_SUBMITTED'?'failed':'failed';
 const submission=typeof e.submission_state==='string'?e.submission_state:typeof e.diagnostic?.submission_state==='string'?e.diagnostic.submission_state:undefined;
 return {schema_version:1,cli_version:CLI_VERSION,command,status,request_id:e.request_id??requestId,...(e.lookup_results?{data:{fft_lookup:e.lookup_results}}:{}),error:{code,message:e.message??String(error),...(submission?{submission_state:submission}:{})}};
}
