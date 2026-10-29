// Transitional scientific-provider boundary. The portable context imports none
// of this code: existing workers validate immutable science, this port binds refs.
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import type {ToolResult, TextContent} from './runtime/contracts.mjs';
import type {AnalysisRole, ScopedReferenceInput, ContextEntry, ContextSlots, BindingValidation} from './runtime/context_contracts.mjs';

export interface ScientificProviderPort {
  readonly workspace: string;
  readonly requestScope: {provider: string; workspace: string; session: string};
  call(name: string, args: {object_id: string}, signal?: AbortSignal): ToolResult | PromiseLike<ToolResult>;
}
export type ScientificProviders = Record<string, ScientificProviderPort>;
export interface ScientificBindingsOptions {providers?: ScientificProviders; signal?: AbortSignal;}
export interface ProviderReferenceProof {manifestHash: string; kind: unknown; roles: readonly unknown[]; scientific?: unknown;}
interface MetadataRead {value: Record<string, unknown>; manifestHash: string; manifestPath: string;}
type ScalarRole = Exclude<AnalysisRole, 'points' | 'measurements'>;
type BindingSlots = ContextSlots & Partial<Record<ScalarRole, ContextEntry | null>>;
// These local access views retain the legacy native property/array operations.
// They do not turn opaque scientific keys into qualified domain objects; worker
// validation and every original identity/hash/grid/calibration check stay below.
const fields=(value: unknown): Record<string, unknown>=>value as Record<string, unknown>;
const optional=(value: unknown,key: string): unknown=>value==null?undefined:fields(value)[key];
const includes=(values: readonly unknown[],value: unknown)=>values.includes(value);


const canonical=(value: unknown)=>JSON.stringify(value,(_key: string,v: unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const same=(a: unknown,b: unknown)=>canonical(a??null)===canonical(b??null);
export const sameScientificGrid=(a: unknown,b: unknown)=>!!a&&!!b&&same(a,b);
function requireMatch(ok: unknown,message: string): asserts ok {if(!ok)throw Object.assign(new Error(message),{code:'SCIENTIFIC_BINDING_MISMATCH'});}
const rows=(value: ContextEntry | ContextEntry[] | null | undefined): ContextEntry[]=>value===null||value===undefined?[]:Array.isArray(value)?value:[value];
const active=(value: ContextEntry | ContextEntry[] | null | undefined)=>rows(value).filter(entry=>entry.status==='active');
const recordDependency=(record: unknown)=>record?Object.fromEntries(['calibration_id','revision','status','source','coordinate_domain','centre_revision_id'].filter(key=>fields(record)[key]!==undefined).map(key=>[key,fields(record)[key]])):null;
function spatialMeasurementBelongs(science: Record<string,unknown>,id: string): boolean {
  // Context proofs have a16KiB budget. Pack only immutable16-byte object IDs;
  // scientific arrays and authoritative request records stay in the provider.
  if(Array.isArray(science.measurementIds))return science.measurementIds.includes(id);
  const packed=science.measurementIdsBase64;
  requireMatch(typeof packed==='string'&&packed.length<=10924,'Invalid bounded spatial measurement proof');
  const bytes=Buffer.from(packed,'base64');
  requireMatch(bytes.length%16===0&&bytes.length<=8192&&bytes.toString('base64')===packed,'Invalid spatial measurement identity encoding');
  if(!/^[a-f0-9]{32}$/.test(id))return false;
  const sought=Buffer.from(id,'hex');for(let i=0;i<bytes.length;i+=16)if(bytes.subarray(i,i+16).equals(sought))return true;
  return false;
}

export function createScientificContextBindings({providers,signal}: ScientificBindingsOptions={}) {
  const cache=new Map<string | undefined, Promise<MetadataRead>>();
  const workspaceFor=(ref: ScopedReferenceInput)=>{
    const workspace=Object.values(providers!).find(value=>value.requestScope?.provider===ref.provider);
    requireMatch(workspace&&(['provider','workspace','session'] as const).every(key=>workspace.requestScope[key]===ref[key]),'Reference does not belong to a configured provider/workspace/session');
    return workspace;
  };
  async function metadata(ref: ScopedReferenceInput): Promise<MetadataRead> {
    const key=canonical(ref);if(cache.has(key))return cache.get(key)!;
    const pending=(async()=>{
      requireMatch(/^[a-f0-9]{32}$/.test(ref.objectId),'A committed immutable scientific object ID is required');
      const workspace=workspaceFor(ref),name=ref.provider==='external-image-workspace'?'image_info':'structure_info';
      const response=await workspace.call(name,{object_id:ref.objectId},signal);
      requireMatch(response&&!response.isError,'Provider refused scientific reference validation');
      const decoded: unknown=JSON.parse(response.content.find((part): part is TextContent=>part.type==='text')!.text);
      const value=fields(decoded);
      requireMatch(value.object_id===ref.objectId&&value.backend===ref.provider,'Provider returned a different object/backend identity');
      const root=realpathSync.native(workspace.workspace),file=realpathSync.native(value.manifest_path as string),relative=path.relative(root,file);
      requireMatch(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&statSync(file).size<=2*1024*1024,'Scientific manifest escapes configured workspace or budget');
      const bytes=readFileSync(file),saved=fields(JSON.parse(bytes.toString('utf8')) as unknown);
      requireMatch(saved.object_id===value.object_id&&saved.backend===value.backend,'Manifest and provider identity disagree');
      requireMatch(Object.entries(saved).every(([key,item])=>same(item,value[key])),'Scientific manifest changed after provider validation');
      return {value,manifestHash:createHash('sha256').update(bytes).digest('hex'),manifestPath:file};
    })();cache.set(key,pending);return pending;
  }
  const relative=(ref: ScopedReferenceInput,objectId: string)=>({...ref,objectId});
  async function imageProof(ref: ScopedReferenceInput,top: MetadataRead): Promise<ProviderReferenceProof> {
    if(top.value.kind==='spatial_field'||top.value.kind==='domain_map') {
      const samples=top.value.samples;
      requireMatch(Array.isArray(samples)&&samples.length>=1&&samples.length<=32,'Spatial field samples exceed the bounded provider contract');
      const calibrations: unknown[]=[],measurementIds: string[]=[];
      for(const sample of samples) {
        requireMatch(sample!==null&&typeof sample==='object'&&!Array.isArray(sample),'Invalid spatial sample record');
        const row=fields(sample),ids=row.measurement_object_ids;
        requireMatch(Array.isArray(ids)&&ids.length<=16&&ids.every(value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value)),'Invalid spatial measurement identities');
        calibrations.push(recordDependency(row.xy_calibration));measurementIds.push(...ids);
      }
      const uniqueCalibrations=[...new Map(calibrations.map(value=>[canonical(value),value])).values()];
      return {manifestHash:top.manifestHash,kind:top.value.kind,roles:[top.value.kind==='spatial_field'?'spatial_field':'domains'],scientific:{manifestPath:top.manifestPath,sourceId:top.value.parent_object_id,calibrations:uniqueCalibrations,measurementIdsBase64:Buffer.from([...new Set(measurementIds)].join(''),'hex').toString('base64')}};
    }
    const domainRole=({spatial_atlas:'atlas',local_signature_compare:'domain_hypotheses',feature_field:'field'} as Partial<Record<string,AnalysisRole>>)[top.value.kind as string];
    if(domainRole)return {manifestHash:top.manifestHash,kind:top.value.kind,roles:[domainRole],scientific:{manifestPath:top.manifestPath,sourceId:top.value.parent_object_id,sourceKind:top.value.source_kind??null,
      calibrations:((top.value.regions??[]) as unknown[]).map(row=>recordDependency(fields(row).xy_calibration)),measurementIds:((top.value.regions??[]) as unknown[]).flatMap(row=>fields(row).measurement_object_ids)}};
    const sequenceRole=({sequence_create:'sequence',region_correspondence:'correspondence',joint_observations:'observations'} as Partial<Record<string,AnalysisRole>>)[top.value.kind as string];
    if(sequenceRole) return {manifestHash:top.manifestHash,kind:top.value.kind,roles:[sequenceRole],
      scientific:{manifestPath:top.manifestPath,sequenceId:top.value.sequence_object_id??(sequenceRole==='sequence'?top.value.object_id:null),
        correspondenceId:top.value.correspondence_object_id??(sequenceRole==='correspondence'?top.value.object_id:null)}};
    let current=top.value,record=current.xy_calibration,visited=new Set<unknown>(),lineage: unknown[]=[];
    while(includes(['calibration','context','measure','annotate'],current.kind)) {
      requireMatch(!visited.has(current.object_id)&&visited.size<32,'Scientific reference ancestry is cyclic or exceeds budget');
      visited.add(current.object_id);lineage.push(current.object_id);
      const parent=current.kind==='annotate'?current.render_base_object_id:current.kind==='measure'?current.parent_object_id:current.base_object_id;
      current=(await metadata(relative(ref,parent as string))).value;record=record??current.xy_calibration;
    }
    lineage.push(current.object_id);
    const spectral=includes(['fft','fft_view'],current.kind),roles: AnalysisRole[]=[];
    if(includes(['frame','view'],current.kind))roles.push('experiment');
    if(spectral)roles.push('fft');
    if(top.value.image_path)roles.push('display');
    if(record)roles.push('calibration');
    if(optional(record,'centre_revision_id')||optional(record,'dc_index_xy'))roles.push('center');
    if(top.value.kind==='measure')roles.push('points','measurements');
    let grid=top.value.scientific_grid_identity??null;
    if(!grid&&current.shape_yx&&optional(current.files_sha256,'data.npy')) {
      const panel=optional(current.panels,'0');
      grid={source_grid_object_id:spectral?(current.spectrum_object_id??current.object_id):(current.kind==='view'?optional(panel,'source_object_id'):current.object_id),
        shape_yx:current.shape_yx,dtype:current.dtype,array_sha256:fields(current.files_sha256)['data.npy'],
        source_rect_xyxy:spectral?null:(current.kind==='view'?optional(panel,'source_rect_xyxy'):[0,0,(current.shape_yx as unknown[])[1],(current.shape_yx as unknown[])[0]]),
        coordinate_space:spectral?'frequency_cycles_per_pixel':includes(['frequency','reciprocal'],current.array_domain)?'source_array_indices':'source_pixels'};
    }
    // Lineage is metadata only. No pixels, inferred calibration or new FFT.
    let ancestor=current;
    for(let count=0;ancestor.parent_object_id&&count<32;count++) {
      const parent=(await metadata(relative(ref,ancestor.parent_object_id as string))).value;
      requireMatch(!lineage.includes(parent.object_id),'Scientific source ancestry is cyclic');
      lineage.push(parent.object_id);ancestor=parent;
      if(ancestor.base_object_id){ancestor=(await metadata(relative(ref,ancestor.base_object_id as string))).value;lineage.push(ancestor.object_id);}
    }
    return {manifestHash:top.manifestHash,kind:top.value.kind,roles,
      scientific:{grid,lineageIds:lineage,manifestPath:top.manifestPath,
        calibration:top.value.calibration_dependency??recordDependency(record),xyScale:optional(record,'xy_scale')??null,
        centerXY:optional(record,'dc_index_xy')??null,points:top.value.points??null,coordinateSpace:top.value.coordinate_space??optional(grid,'coordinate_space')??null}};
  }
  async function resolveReference(ref: ScopedReferenceInput): Promise<ProviderReferenceProof> {
    const top=await metadata(ref);
    if(ref.provider==='external-image-workspace')return imageProof(ref,top);
    const value=top.value,roles=({structure:['reference'],orient:['orientation'],simulate:['simulation'],register:['registration'],compare:['comparison']} as Partial<Record<string,AnalysisRole[]>>)[value.kind as string]??[];
    return {manifestHash:top.manifestHash,kind:value.kind,roles,scientific:{manifestPath:top.manifestPath,
      structureId:value.structure_object_id??(value.kind==='structure'?value.object_id:null),
      orientationId:optional(value.parameters,'orientation_id')??optional(value.orientation,'orientation_id')??null,
      simulationId:value.simulation_object_id??(value.kind==='simulate'?value.object_id:null),
      measurementPaths:(((value.parameters as {measurement_paths?: unknown} | null | undefined)?.measurement_paths??[]) as unknown[]).map(filename=>path.resolve(filename as string)),
      registrationId:value.registration_object_id??optional(value.registration,'proposal_object_id')??null,
      grid:optional(value.analysis_binding,'scientific_grid_identity')??null,
      calibration:optional(value.analysis_binding,'calibration_dependency')??null}};
  }
  async function validateBindings({slot,entry,slots: rawSlots}: BindingValidation) {
    const slots=rawSlots as BindingSlots,science=fields(entry.proof.scientific);
    if(entry.ref.provider==='external-image-workspace') {
      if(slot==='spatial_field'||slot==='domains') {
        const sourceRole=slot==='spatial_field'?'experiment':'spatial_field';
        if(active(slots[sourceRole]).length) {
          requireMatch(science.sourceId===slots[sourceRole]!.ref.objectId,'Spatial field/domain candidate uses a different immutable source selection');
          requireMatch(entry.dependsOn[sourceRole],'Spatial field/domain candidate must bind the selected source dependency');
        }
        if(slot==='spatial_field') {
          for(const role of ['calibration','center'] as const)for(const selected of active(slots[role]))requireMatch((science.calibrations as unknown[]).length&&(science.calibrations as unknown[]).every(value=>same(value,fields(selected.proof.scientific).calibration)),'Spatial field uses a different selected calibration/centre revision');
          for(const role of ['points','measurements'] as const)for(const selected of active(slots[role]))requireMatch(spatialMeasurementBelongs(science,selected.ref.objectId),'Spatial field does not include the selected corrected measurement');
        }
        return;
      }
      if(['atlas','domain_hypotheses','field'].includes(slot)) {
        const sourceRole=slot==='atlas'?'experiment':science.sourceKind==='local_signature_compare'?'domain_hypotheses':science.sourceKind==='joint_observations'?'observations':'atlas';
        if(active(slots[sourceRole]).length){
          requireMatch(science.sourceId===slots[sourceRole]!.ref.objectId,'Spatial evidence uses a different immutable source selection');
          requireMatch(entry.dependsOn[sourceRole],'Spatial evidence must bind the selected source dependency');
        }
        if(slot==='atlas'){
          for(const role of ['calibration','center'] as const)for(const selected of active(slots[role]))requireMatch((science.calibrations as unknown[]).length&&(science.calibrations as unknown[]).every(value=>same(value,fields(selected.proof.scientific).calibration)),'Atlas measurements use a different selected calibration/centre revision; update the scientific evidence first');
          for(const role of ['points','measurements'] as const)for(const selected of active(slots[role]))requireMatch((science.measurementIds as unknown[]).includes(selected.ref.objectId),'Atlas does not include the selected corrected point/measurement record');
        }
        return;
      }
      if(['sequence','correspondence','observations'].includes(slot)) {
        if(slot!=='sequence'&&active(slots.sequence).length)requireMatch(science.sequenceId===slots.sequence!.ref.objectId,'Sequence evidence belongs to a different immutable sequence');
        if(slot==='observations'&&active(slots.correspondence).length)requireMatch(science.correspondenceId===slots.correspondence!.ref.objectId,'Joint observations use a different region correspondence');
        return;
      }
      const parent=entry.dependsOn.fft?active(slots.fft)[0]:entry.dependsOn.experiment?active(slots.experiment)[0]:null;
      if(slot==='fft'&&active(slots.experiment).length)requireMatch((science.lineageIds as unknown[]).includes(slots.experiment!.ref.objectId),'FFT was not produced from the selected experiment; dependency hashes cannot relabel its source');
      if(parent&&slot!=='fft')requireMatch(same(science.grid,fields(parent.proof.scientific).grid),'Image reference uses a different scientific source/frame/ROI/FFT grid');
      const calibration=active(slots.calibration)[0],center=active(slots.center)[0];
      if(['calibration','center'].includes(slot)&&calibration&&center)requireMatch(same(fields(calibration.proof.scientific).calibration,fields(center.proof.scientific).calibration),'Selected calibration and centre belong to different geometry revisions');
      if(['measurements','display'].includes(slot)&&calibration)requireMatch(same(science.calibration,fields(calibration.proof.scientific).calibration),'Saved result uses a different calibration revision; remeasure or render the selected wrapper');
      if(['measurements','display'].includes(slot)&&center)requireMatch(same(science.calibration,fields(center.proof.scientific).calibration),'Saved result uses a different centre revision');
      if(slot==='measurements'&&active(slots.points).length)requireMatch(active(slots.points).some(point=>same(fields(point.proof.scientific).grid,science.grid)&&same(fields(point.proof.scientific).points,science.points)&&fields(point.proof.scientific).coordinateSpace===science.coordinateSpace),'Saved measurement does not use the selected point anchors');
    } else {
      const reference=active(slots.reference)[0],orientation=active(slots.orientation)[0],simulation=active(slots.simulation)[0];
      if(reference&&['orientation','simulation'].includes(slot))requireMatch(science.structureId===reference.ref.objectId,'Structure result belongs to a different immutable reference structure');
      if(orientation&&slot==='simulation')requireMatch(science.orientationId===orientation.ref.objectId,'Simulation used a different scientific orientation');
      if(['registration','comparison'].includes(slot)) {
        if(simulation)requireMatch(science.simulationId===simulation.ref.objectId,'Comparison uses a different saved simulation');
        const measurements=active(slots.measurements);
        if(measurements.length)requireMatch(same(science.measurementPaths,measurements.map(measure=>path.resolve(fields(measure.proof.scientific).manifestPath as string))),'Registration/comparison was computed with different committed measurements');
        const parent=active(slots.fft)[0]??active(slots.experiment)[0],calibration=active(slots.calibration)[0]??active(slots.center)[0];
        if(parent)requireMatch(same(science.grid,fields(parent.proof.scientific).grid),'Comparison uses a different current scientific grid');
        if(calibration)requireMatch(same(science.calibration,fields(calibration.proof.scientific).calibration),'Comparison uses an obsolete scale or centre');
        if(slot==='comparison'&&active(slots.registration).length)requireMatch(science.registrationId===slots.registration!.ref.objectId,'Comparison did not use the selected constrained registration');
      }
    }
  }
  return {resolveReference,validateBindings};
}
