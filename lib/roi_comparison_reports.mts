// Append-only reference reports over the existing scientific provider. These
// files contain no arrays and never publish a workspace savepoint/adoption.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import {CliObjectReader,canonical,isRow,same,savedRois} from './workbench_cli_records.mjs';
import {verifyFftInputAssociation} from './workbench_cli_inputs.mjs';
import type {SavedRoi} from './workbench_cli_records.mjs';
import {outwardSourceRectangle} from '../ui/image-panel/coordinates.mjs';
import {readSourceProofReferences} from './image_source_proofs.mjs';
import type {SourceProofReference} from './image_source_proofs.mjs';

export type ReportRow=Record<string,unknown>;
export interface RoiComparisonReport {
 schema_version:1;kind:'roi_lattice_comparison';comparison_id:string;request_id:string;
 source_save_id:string|null;source_revision:number|null;source_view_object_id:string;frame_object_id:string;
 recipe:{window:'none'|'hann';subtract_mean:boolean};rows:ReportRow[];
 interpretation:{status:'not_assessed';notes:string[]};
 source_proof_refs?:SourceProofReference[];
}
export const CLI_REPORT_LIMIT=512;
const id=/^[A-Za-z0-9_-]{1,64}$/,objectId=/^[a-f0-9]{32}$/;
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
export function validateRoiComparisonReport(value:unknown):asserts value is RoiComparisonReport {
 if(!record(value)||value.schema_version!==1||value.kind!=='roi_lattice_comparison'||!id.test(String(value.comparison_id))||value.request_id!==value.comparison_id||!objectId.test(String(value.source_view_object_id))||!objectId.test(String(value.frame_object_id))||value.source_save_id!==null&&!id.test(String(value.source_save_id))||value.source_revision!==null&&(!Number.isSafeInteger(value.source_revision)||(value.source_revision as number)<0)||!record(value.recipe)||!['none','hann'].includes(String(value.recipe.window))||typeof value.recipe.subtract_mean!=='boolean'||!Array.isArray(value.rows)||value.rows.length<1||value.rows.length>100||!record(value.interpretation)||value.interpretation.status!=='not_assessed'||!Array.isArray(value.interpretation.notes)||value.interpretation.notes.some(n=>typeof n!=='string'||n.length>2000))throw new Error('Invalid reference-only ROI comparison report');
 const seen=new Set<string>();
 for(const row of value.rows){
  if(!record(row)||typeof row.annotation_id!=='string'||!id.test(row.annotation_id)||seen.has(row.annotation_id)||!objectId.test(String(row.source_view_object_id))||!Array.isArray(row.float_roi_xyxy)||row.float_roi_xyxy.length!==4||row.float_roi_xyxy.some(n=>typeof n!=='number'||!Number.isFinite(n))||!Array.isArray(row.processing_rect_xyxy)||row.processing_rect_xyxy.length!==4||row.processing_rect_xyxy.some(n=>!Number.isSafeInteger(n)||(n as number)<0)||!['measured','candidate_peaks_only','needs_point_selection','needs_fft','input_association_unknown'].includes(String(row.status))||!Array.isArray(row.measurements)||!Array.isArray(row.peaks)||!Array.isArray(row.uncertainties))throw new Error('Invalid ROI comparison row');
  const f=row.float_roi_xyxy as number[],r=row.processing_rect_xyxy as number[];
  if(f[0]>=f[2]||f[1]>=f[3]||JSON.stringify(r)!==JSON.stringify(outwardSourceRectangle(f)))throw new Error('Comparison ROI processing support differs from frozen float coordinates');
  if(row.fft!==null&&(!record(row.fft)||!objectId.test(String(row.fft.object_id))||typeof row.fft.reused!=='boolean'||typeof row.fft.input_snapshot_verified!=='boolean'))throw new Error('Invalid comparison FFT reference');
  if(row.fft===null&&(row.status!=='needs_fft'||row.measurements.length!==0||row.peaks.length!==0)||row.fft!==null&&(row.status==='needs_fft'||row.status==='measured'&&row.measurements.length===0||row.status==='candidate_peaks_only'&&(row.measurements.length!==0||row.peaks.length===0)||row.status==='needs_point_selection'&&(row.measurements.length!==0||row.peaks.length!==0)))throw new Error('Comparison status and actual FFT/measurement/peak references disagree');
  for(const measurement of row.measurements)if(!record(measurement)||!objectId.test(String(measurement.measurement_object_id)))throw new Error('Invalid comparison measurement reference');
  for(const peak of row.peaks)if(!record(peak)||!objectId.test(String(peak.view_object_id)))throw new Error('Invalid comparison peak source');
  seen.add(row.annotation_id);
 }
}
function directory(workspace:string,create=false){
 if(!path.isAbsolute(workspace)||!lstatSync(workspace).isDirectory()||lstatSync(workspace).isSymbolicLink())throw new Error('Absolute ordinary workspace directory required');
 const root=realpathSync.native(workspace),dir=path.join(root,'cli-comparisons');
 if(create)mkdirSync(dir,{recursive:true});
 if(existsSync(dir)&&(!lstatSync(dir).isDirectory()||lstatSync(dir).isSymbolicLink()||path.dirname(realpathSync.native(dir))!==root))throw new Error('Comparison directory is linked or outside workspace');
 return dir;
}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function verifyReferences(workspace:string,report:RoiComparisonReport,requireInputProof=false){
 const proofRefs=readSourceProofReferences(report.source_proof_refs),reader=new CliObjectReader(workspace,proofRefs),frame=reader.object(report.frame_object_id).value;reader.object(report.source_view_object_id);if(frame.kind!=='frame')throw new Error('Comparison frame reference is not an immutable frame');reader.verifyArray(frame.object_id);
 let savedRows:ReturnType<typeof savedRois>|null=null;
 if(report.source_save_id!==null){
  const savepoint=reader.json(path.join(reader.root,'analysis-workspace','savepoints',report.source_save_id+'.json')).value;
  if(savepoint.schema_version!==1||savepoint.save_id!==report.source_save_id||savepoint.revision!==report.source_revision||!isRow(savepoint.snapshot)||savepoint.snapshot.object_id!==report.source_view_object_id||!isRow(savepoint.references))throw new Error('Comparison savepoint identity or revision mismatch');
  for(const [id,sha]of Object.entries(savepoint.references))if(reader.object(id).manifest_sha256!==sha)throw new Error('Comparison savepoint reference hash mismatch');
  savedRows=savedRois(reader,savepoint.snapshot);
 }
 for(const row of report.rows){
  if(savedRows&&!savedRows.some(saved=>saved.annotation_id===row.annotation_id&&saved.source_view_object_id===row.source_view_object_id&&same(saved.float_roi_xyxy,row.float_roi_xyxy)))throw new Error('Comparison ROI version is absent from its claimed savepoint');
  const view=reader.object(row.source_view_object_id).value,mark=(Array.isArray(view.annotations)?view.annotations:[]).find(m=>isRow(m)&&m.annotation_id===row.annotation_id&&m.kind==='rectangle'&&m.status!=='retracted');
  if(!isRow(mark)||!isRow(mark.anchor)||mark.anchor.coordinate_space!=='source_pixels'||mark.anchor.source_object_id!==frame.object_id||row.source_object_id!==frame.object_id||!same(mark.anchor.coordinates,row.float_roi_xyxy)||reader.frame(view.object_id).value.object_id!==frame.object_id)throw new Error('Comparison ROI does not match its original scientific view');
  if(row.fft===null)continue;const fftRef=row.fft as ReportRow,fft=reader.object(fftRef.object_id);
  if(fft.value.kind!=='fft'||fft.value.window!==report.recipe.window||fft.value.subtract_mean!==report.recipe.subtract_mean||!same(fft.value.source_rect_xyxy,row.processing_rect_xyxy)||!same(fft.value.xy_calibration,view.xy_calibration)||reader.frame(fft.value.object_id).value.object_id!==frame.object_id||fftRef.manifest_sha256!==fft.manifest_sha256||!isRow(fft.value.files_sha256)||fftRef.array_sha256!==fft.value.files_sha256['data.npy'])throw new Error('Comparison FFT reference or preprocessing differs from its provider record');reader.verifyArray(fft.value.object_id);
  if(fftRef.input_association!==undefined)verifyFftInputAssociation(reader,fft,{...row,frame_object_id:report.frame_object_id} as unknown as SavedRoi,report.recipe,fftRef.input_association);
  else if(requireInputProof)throw new Error('New comparison requires independent original float-input proof; a report flag is not provenance');
  for(const item of row.measurements as ReportRow[]){
   const measure=reader.object(item.measurement_object_id),value=measure.value;
   if(value.kind!=='measure'||!isRow(value.scientific_grid_identity)||value.scientific_grid_identity.source_grid_object_id!==fft.value.object_id||!same(value.xy_calibration,fft.value.xy_calibration)||item.measurement_manifest_sha256!==measure.manifest_sha256)throw new Error('Comparison measurement grid, calibration or manifest mismatch');
   for(const [key,v]of Object.entries(item))if(!['measurement_object_id','measurement_manifest_sha256','status'].includes(key)&&!same(v,value[key]))throw new Error('Comparison measurement value differs from original provider record');
  }
  for(const item of row.peaks as ReportRow[]){const peakView=reader.object(item.view_object_id),{view_object_id,view_manifest_sha256,meaning,...peak}=item;void view_object_id;void meaning;if(view_manifest_sha256!==peakView.manifest_sha256||peakView.value.spectrum_object_id!==fft.value.object_id||!same(peakView.value.xy_calibration,fft.value.xy_calibration)||!Array.isArray(peakView.value.peak_table)||!peakView.value.peak_table.some(p=>same(p,peak)))throw new Error('Comparison peak candidate differs from original provider record');}
 }
 reader.verifyProofContext();
}
export function publishRoiComparisonReport(workspace:string,report:RoiComparisonReport){
 validateRoiComparisonReport(report);verifyReferences(workspace,report,true);const dir=directory(workspace,true),file=path.join(dir,report.comparison_id+'.json'),raw=JSON.stringify({schema_version:1,report_sha256:hash(canonical(report)),report})+'\n';
 if(Buffer.byteLength(raw)>2*1024*1024)throw new Error('Comparison report exceeds 2 MiB');
 if(existsSync(file)){const prior=readRoiComparisonReport(workspace,report.comparison_id);if(JSON.stringify(prior)!==JSON.stringify(report))throw Object.assign(new Error('Comparison ID is already bound to another immutable report'),{code:'REQUEST_CONFLICT'});return {comparison_id:report.comparison_id,sha256:hash(raw),already_published:true};}
 const fd=openSync(file,'wx');try{writeFileSync(fd,raw);fsyncSync(fd);}finally{closeSync(fd);}
 const receipt=readRoiComparisonReport(workspace,report.comparison_id);if(JSON.stringify(receipt)!==JSON.stringify(report))throw new Error('Comparison report readback mismatch');
 return {comparison_id:report.comparison_id,sha256:hash(raw),already_published:false};
}
export function readRoiComparisonReport(workspace:string,comparisonId:string):RoiComparisonReport {
 if(!id.test(comparisonId))throw new Error('Invalid comparison ID');const file=path.join(directory(workspace),comparisonId+'.json'),s=lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size>2*1024*1024)throw new Error('Missing, linked or oversized comparison report');
 const envelope:unknown=JSON.parse(readFileSync(file,'utf8'));if(!isRow(envelope)||envelope.schema_version!==1||envelope.report_sha256!==hash(canonical(envelope.report)))throw new Error('Comparison report hash mismatch');const value=envelope.report;validateRoiComparisonReport(value);if(value.comparison_id!==comparisonId)throw new Error('Comparison file identity mismatch');verifyReferences(workspace,value);
 const normalized=structuredClone(value);for(const row of normalized.rows)if(isRow(row.fft)&&row.fft.input_association===undefined){row.fft.input_snapshot_verified=false;row.status='input_association_unknown';row.uncertainties=[...(row.uncertainties as unknown[]),'Legacy report has no independently verifiable original float-ROI input association; do not reuse or adopt it as a verified ROI result.'];}return normalized;
}
export function listRoiComparisonReports(workspace:string):RoiComparisonReport[]{
 const dir=directory(workspace);if(!existsSync(dir))return [];const files=readdirSync(dir).filter(n=>n.endsWith('.json'));
 if(files.length>CLI_REPORT_LIMIT)throw new Error('Comparison report listing exceeds 512 records; select an explicit report ID');
 return files.sort().map(name=>readRoiComparisonReport(workspace,name.slice(0,-5)));
}
