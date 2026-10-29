// Read-only hydration of explicit saved figure references. The supplied ports
// expose image_info records/assets only; this module never executes a tool.
import {createHash} from 'node:crypto';
// Hash/identity verification leaves all other provider metadata fields unknown.
type Metadata=Record<string,unknown>;
export interface CompositionReadPorts {readState?:(objectId:string)=>unknown|PromiseLike<unknown>;readObject?:(objectId:string)=>unknown|PromiseLike<unknown>;}
export type ResolvedCompositionPanel = {slot:unknown;profile:Metadata}|{slot:unknown;state:{object:Metadata;effective_display:unknown;frame_identity:unknown};clean_png_base64:unknown;scale_bar:unknown;spatial_source?:{object_id:unknown;shape_yx:unknown;dtype:unknown;array_sha256:unknown;frame_identity:unknown};};
interface SavedState {object:Metadata;effective_display:unknown;frame_identity:unknown;clean_png_base64:unknown;clean_png_sha256:unknown;}

import {validateComposition} from '../ui/image-panel/figure-composer.mjs';
import {readFigureRecipe,recipeIdentity,figureDisplayParameters} from '../ui/image-panel/figure-export.mjs';
import {equalRecords} from '../ui/image-panel/viewer-state.mjs';

const ID=/^[a-f0-9]{32}$/,SHA=/^[a-f0-9]{64}$/;
const IMAGE=new Set(['view','fft','fft_view','annotate','compare']);
const NUMERIC=new Set(['frame','view','fft','fft_view']);
const DTYPES=new Set(['uint8','uint16','uint32','int8','int16','int32','float32','float64','complex64','complex128']);
const MAX_PNG=2*1024*1024,MAX_JSON=2*1024*1024,MAX_READS=64;
const record=(v:unknown):v is Metadata=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function need(ok:unknown,message:string):asserts ok{if(!ok)throw Object.assign(new Error(message),{code:'INVALID_COMPOSITION'});}
const copy=<T,>(v:T):T=>structuredClone(v);
function bounded(value:unknown,maximum=MAX_JSON){
 let nodes=0;const active=new Set<unknown>();
 const visit=(v:unknown,depth:number):void=>{
  need(++nodes<=120000&&depth<=32,'Figure metadata exceeds its bounded depth/node budget');
  if(v===null||typeof v==='string'||typeof v==='boolean')return;
  if(typeof v==='number'){need(Number.isFinite(v),'Figure metadata contains a nonfinite value');return;}
  need(typeof v==='object'&&!active.has(v)&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null),'Figure metadata must be plain finite JSON');
  active.add(v);for(const child of Object.values(v))visit(child,depth+1);active.delete(v);
 };
 visit(value,0);need(Buffer.byteLength(JSON.stringify(value))<=maximum,'Figure metadata exceeds its byte budget');
}
function grid(input:unknown){const value=input as Metadata;
 need(record(value)&&ID.test(((value.source_grid_object_id??'' as string) as string))&&SHA.test(((value.array_sha256??'' as string) as string))&&DTYPES.has((value.dtype as string)),'Profile scientific grid identity is incomplete');
 need(Array.isArray(value.shape_yx)&&value.shape_yx.length===2&&value.shape_yx.every(v=>Number.isSafeInteger(v)&&v>0)&&value.shape_yx[0]*value.shape_yx[1]<=4194304,'Profile scientific shape exceeds its saved-array budget');
 need((['source_pixels','source_array_indices','frequency_cycles_per_pixel'] as readonly unknown[]).includes(value.coordinate_space),'Profile coordinate domain is unsupported');
 const r=value.source_rect_xyxy;
 need(r===null||Array.isArray(r)&&r.length===4&&r.every(Number.isSafeInteger)&&r[0]>=0&&r[1]>=0&&r[2]>r[0]&&r[3]>r[1],'Profile source rectangle is invalid');
 need(value.coordinate_space==='frequency_cycles_per_pixel'?r===null:r!==null,'Profile rectangle and coordinate domain disagree');
 if(r!==null)need(r[2]-r[0]===value.shape_yx[1]&&r[3]-r[1]===value.shape_yx[0],'Profile source rectangle disagrees with its array shape');
}
function png(value:unknown){
 need(typeof value==='string'&&value.length>0&&value.length<=Math.ceil(MAX_PNG/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(value),'Clean PNG is missing, malformed or exceeds 2 MiB');
 const bytes=Buffer.from(value,'base64');
 need(bytes.length>=33&&bytes.length<=MAX_PNG&&bytes.toString('base64')===value&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.readUInt32BE(8)===13&&bytes.subarray(12,16).toString()==='IHDR','Only canonical saved PNG assets are supported');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 need(width>0&&height>0&&width<=2048&&height<=2048&&width*height<=1048576,'Clean PNG dimensions exceed the display budget');
 return {bytes,width,height,digest:createHash('sha256').update(bytes).digest('hex')};
}
function finitePairs(values:unknown,count:number):values is number[][]{return Array.isArray(values)&&values.length===count&&values.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));}
function checkProfile(value:Metadata){
 need(value.kind==='profile'&&ID.test(((value.parent_object_id??'' as string) as string)),'Requested object is not a saved profile');grid(value.scientific_grid_identity);
 const s=value.samples,n=(value.sampling as Metadata|undefined)?.sample_count as number,g=value.scientific_grid_identity as {shape_yx:number[];source_rect_xyxy:number[];coordinate_space:unknown;dtype:unknown};
 need(Number.isInteger(n)&&n>=2&&n<=4096&&(value.sampling as Metadata|undefined)?.interpolation==='nearest'&&(value.sampling as Metadata|undefined)?.line_width===1,'Profile requires 2–4096 saved width-one nearest samples');
 need(record(s)&&finitePairs(s.coordinates_xy,n)&&finitePairs(s.sampled_coordinates_xy,n)&&finitePairs(s.indices_xy,n),'Profile saved coordinates are incomplete');
 need(Array.isArray(s.value)&&s.value.length===n&&s.value.every(Number.isFinite)&&Array.isArray(s.distance)&&s.distance.length===n&&s.distance.every((v,i)=>Number.isFinite(v)&&v>=0&&(i===0?v===0:v>=(s.distance as number[])[i-1])),'Profile requires finite saved values and distances');
 need(finitePairs(value.points,2)&&!equalRecords(value.points[0],value.points[1])&&equalRecords(s.coordinates_xy[0],value.points[0])&&equalRecords(s.coordinates_xy[n-1],value.points[1]),'Profile endpoints disagree with saved sample coordinates');
 need(s.indices_xy.every(p=>p.every(Number.isSafeInteger)&&p[0]>=0&&p[1]>=0&&p[0]<g.shape_yx[1]&&p[1]<g.shape_yx[0]),'Profile indices exceed its scientific grid');
 const spectral=g.coordinate_space==='frequency_cycles_per_pixel';
 need((value.sampling as Metadata).tie_rule==='floor(array_index+0.5)','Profile nearest-sample convention is missing');
 need(s.indices_xy.every((pair,i)=>pair.every((index,axis)=>{
  const size=g.shape_yx[1-axis],offset=spectral?Math.floor(size/2):g.source_rect_xyxy[axis],position=spectral?(s.coordinates_xy as number[][])[i][axis]*size+offset:(s.coordinates_xy as number[][])[i][axis]-offset;
  return index===Math.floor(position+.5)&&(s.sampled_coordinates_xy as number[][])[i][axis]===(spectral?(index-offset)/size:index+offset);
 })),'Profile indices and sampled coordinates disagree with its saved nearest-sample convention');
 need(value.coordinate_space===g.coordinate_space&&value.dtype===g.dtype&&value.distance_unit===(spectral?'cycles/pixel':'pixel'),'Profile dtype or coordinate units disagree with its saved grid');
 need((['complex64','complex128'] as readonly unknown[]).includes(g.dtype)?(['real','imag','amplitude','power'] as readonly unknown[]).includes(value.component):value.component==='raw','Profile component must explicitly match the scientific dtype');
 need(SHA.test((((value.files_sha256 as Metadata)?.['profile.npy']??'' as string) as string))&&SHA.test((((value.files_sha256 as Metadata)?.['profile.csv']??'' as string) as string)),'Profile lacks saved scientific NPY/CSV hashes');
 if(s.physical_distance!==null){
  const cal=value.xy_calibration,scale=(cal as Metadata|undefined)?.xy_scale;
  need(Array.isArray(s.physical_distance)&&s.physical_distance.length===n&&s.physical_distance.every((v,i)=>Number.isFinite(v)&&v>=0&&(i===0?v===0:v>=(s.physical_distance as number[])[i-1])),'Profile physical axis is incomplete');
  need((cal as Metadata|undefined)?.status==='active'&&(cal as Metadata).coordinate_domain==='real_space'&&record(scale)&&[scale.x,scale.y].every(v=>Number.isFinite(v)&&v!==0)&&typeof scale.unit==='string'&&scale.unit.length>0&&value.physical_distance_unit===(spectral?'cycles/':'')+scale.unit,'Profile physical axis has no matching active calibration');
 }else need(value.physical_distance_unit===null,'Uncalibrated profile cannot declare physical units');
}

export async function resolveComposition(value:unknown,{readState,readObject}:CompositionReadPorts={}):Promise<ResolvedCompositionPanel[]>{
 // Validate every slot before even the first provider read. In particular JSON
 // serialisation must not turn NaN/undefined into a different accepted request.
 bounded(value,512*1024);const recipe=validateComposition(value);
 for(const slot of recipe.slots)if(slot.kind==='profile')grid(slot.scientific_grid_identity);
 need(typeof readState==='function'&&typeof readObject==='function','Read-only saved-object ports are required');
 const objects=new Map<string,Metadata>(),states=new Map<string,SavedState>();let reads=0,totalPNG=0;
 const budget=()=>need(++reads<=MAX_READS,'Composition saved-object reads exceed the bounded ancestry budget');
 const remember=(id:string,result:unknown)=>{need(record(result)&&result.object_id===id&&typeof result.kind==='string','Provider returned another or missing saved object');bounded(result);objects.set(id,copy(result));return objects.get(id)!;};
 const object=async(id:string):Promise<Metadata>=>{need(ID.test(id??''),'Invalid saved ancestry object ID');if(!objects.has(id)){budget();remember(id,await readObject(id));}return objects.get(id)!;};
 const state=async(id:string):Promise<SavedState>=>{
  if(!states.has(id)){
   budget();const result=await readState(id);need(record(result)&&record(result.object)&&IMAGE.has((result.object.kind as string)),'Image slot requires an already rendered saved image');
   const saved=remember(id,result.object);bounded({object:saved,effective_display:result.effective_display,frame_identity:result.frame_identity});
   need(SHA.test(((result.clean_png_sha256??'' as string) as string)),'Saved view lacks a clean PNG hash');
   need(typeof result.clean_png_base64==='string'&&result.clean_png_base64.length<=Math.ceil(MAX_PNG/3)*4,'Saved view clean PNG exceeds its budget');
   states.set(id,{object:saved,effective_display:copy(result.effective_display),frame_identity:copy(result.frame_identity),clean_png_base64:result.clean_png_base64,clean_png_sha256:result.clean_png_sha256});
  }return states.get(id)!;
 };
 const ancestry=async(from:string,to:string)=>{
  const pending=[from],seen=new Set();
  while(pending.length){const id=pending.pop();if(seen.has(id))continue;need(seen.size<32,'Saved image ancestry exceeds 32 records');seen.add(id);if(id===to)return true;const v=await object((id as string));for(const key of ['parent_object_id','base_object_id','render_base_object_id'])if(v[key]!==undefined&&v[key]!==null){need(ID.test((v[key] as string)),'Malformed saved image ancestry');pending.push((v[key] as string));}}
  return false;
 };
 const plane=async(initial:Metadata):Promise<Metadata>=>{
  let current=initial;const seen=new Set();
  for(let n=0;n<32;n++){
   need(!seen.has(current.object_id),'Saved scientific ancestry contains a cycle');seen.add(current.object_id);
   if(NUMERIC.has((current.kind as string))||current.kind==='compare')return current;
   const id=current.render_base_object_id??current.base_object_id??current.parent_object_id;need(ID.test(((id??'' as string) as string)),'Saved view has no scientific plane');current=await object((id as string));
  }need(false,'Scientific ancestry exceeds 32 records');
 };
 const payload=(v:Metadata):{dtype:unknown;shape:unknown;axes:unknown;arrays:Metadata}=>({dtype:v.dtype??null,shape:v.shape_yx??v.source_shape_yx??null,axes:v.axes??null,arrays:Object.fromEntries(Object.entries((v.files_sha256??{}) as Metadata).filter(([name])=>name.endsWith('.npy')))});
 const panels:ResolvedCompositionPanel[]=[];
 for(const slot of recipe.slots){
  if(slot.kind==='profile'){
   const profile=await object(slot.object_id);checkProfile(profile);
   need(equalRecords(profile.scientific_grid_identity,slot.scientific_grid_identity)&&equalRecords(profile.xy_calibration??null,slot.xy_calibration),'Saved profile grid or calibration differs from its reference');
   const parent=await object((profile.parent_object_id as string)),input=await plane(parent),spectral=(['fft','fft_view'] as readonly unknown[]).includes(input.kind),mapping=(input.panels as Metadata)?.[0];
   need(NUMERIC.has((input.kind as string))&&Array.isArray(input.shape_yx)&&SHA.test((((input.files_sha256 as Metadata)?.['data.npy']??'' as string) as string)),'Profile input lacks one saved scientific plane');
   const actual={source_grid_object_id:spectral?input.spectrum_object_id??input.object_id:input.kind==='view'?(mapping as Metadata|undefined)?.source_object_id:input.object_id,shape_yx:input.shape_yx,dtype:input.dtype,array_sha256:((input).files_sha256 as Metadata)['data.npy'],source_rect_xyxy:spectral?null:input.kind==='view'?(mapping as Metadata|undefined)?.source_rect_xyxy:[0,0,input.shape_yx[1],input.shape_yx[0]],coordinate_space:spectral?'frequency_cycles_per_pixel':(['frequency','reciprocal'] as readonly unknown[]).includes(parent.array_domain??input.array_domain)?'source_array_indices':'source_pixels'};
   need(equalRecords(actual,profile.scientific_grid_identity),'Profile scientific grid disagrees with its actual saved input');
   need(equalRecords(profile.xy_calibration??null,parent.xy_calibration??input.xy_calibration??null),'Profile calibration disagrees with its actual saved input');
   panels.push({slot,profile:copy(profile)});continue;
  }
  const source=await state(slot.source_object_id),asset=await state(slot.asset.object_id);
  readFigureRecipe(slot.recipe,source);
  need(equalRecords(recipeIdentity(source),slot.recipe.source),'Image recipe scientific identity differs from the saved source');
  const display=figureDisplayParameters(source.effective_display,source.object.panels),requested=figureDisplayParameters(slot.recipe.display_recipe,slot.recipe.source.panels);
  need(equalRecords(display,requested),'Image recipe display differs from its saved source');
  need(equalRecords(recipeIdentity(source),recipeIdentity(asset)),'Clean asset belongs to another frame, calibration, anchor or scientific grid');
  const expected={...display,...((source.object.panels as Metadata[]).every(p=>p.domain==='frequency')?{spectrum_axes:false}:{scale_bar:false})};
  need(equalRecords(figureDisplayParameters(asset.effective_display,asset.object.panels),expected),'Clean asset does not retain the saved display controls');
  need(await ancestry((asset.object.object_id as string),(source.object.object_id as string))||await ancestry((source.object.object_id as string),(asset.object.object_id as string)),'Clean asset has no saved ancestry relationship with its source');
  const sourcePlane=await plane(source.object),assetPlane=await plane(asset.object);
  const science=payload(sourcePlane);
  need(Object.keys(science.arrays).length>0&&Object.values(science.arrays).every(hash=>SHA.test(hash as string))&&equalRecords(science,payload(assetPlane)),'Clean asset changed the scientific array or dtype/axes');
  const image=png(asset.clean_png_base64);totalPNG+=image.bytes.length;need(totalPNG<=4*MAX_PNG,'Composition PNG assets exceed their total budget');
  need(image.digest===slot.asset.clean_png_sha256&&asset.clean_png_sha256===image.digest,'Clean PNG digest differs from the saved asset reference');
  let base=asset.object;if(base.render_base_object_id)base=await object((base.render_base_object_id as string));
  const savedHash=(base.files_sha256 as Metadata)?.['unannotated.png']??(!(base.annotations as unknown[]|undefined)?.length?(base.files_sha256 as Metadata)?.['preview.png']:null);
  need(savedHash===image.digest&&equalRecords(base.panels,source.object.panels),'Clean PNG is not bound to its exact saved render');
  need(Array.isArray(base.panels)&&base.panels.length>=1&&base.panels.length<=4&&base.panels.every(p=>Array.isArray(p.image_rect_xyxy)&&p.image_rect_xyxy.length===4&&p.image_rect_xyxy.every(Number.isFinite)&&p.image_rect_xyxy[0]>=0&&p.image_rect_xyxy[1]>=0&&p.image_rect_xyxy[0]<p.image_rect_xyxy[2]&&p.image_rect_xyxy[1]<p.image_rect_xyxy[3]&&p.image_rect_xyxy[2]<=image.width&&p.image_rect_xyxy[3]<=image.height),'PNG dimensions disagree with the saved panel mapping');
  if(slot.scale_bar!==null){
   const candidates=[source.object,asset.object,sourcePlane,assetPlane,base];
   need(slot.scale_bar.visible===true&&candidates.some(v=>(v.scale_bar as Metadata|undefined)?.visible===true&&equalRecords(v.scale_bar,slot.scale_bar)),'Scale bar is not an authoritative visible saved record');
   const cal=source.object.xy_calibration;
   need((cal as Metadata|undefined)?.status==='active'&&(cal as Metadata).coordinate_domain==='real_space'&&slot.scale_bar.calibration_id===(cal as Metadata).calibration_id&&slot.scale_bar.unit===((cal as Metadata).xy_scale as Metadata|undefined)?.unit&&slot.scale_bar.signed_scale===((cal as Metadata).xy_scale as Metadata|undefined)?.x,'Scale bar disagrees with the saved calibration');
  }
  let spatialSource=null;
  const mapping=(source.object.panels as unknown[]|undefined)?.length===1?(source.object.panels as Metadata)[0]:null,frame=source.frame_identity;
  if(recipe.roiOutlines===true&&(mapping as Metadata|undefined)?.domain==='spatial_pixels'&&frame&&(mapping as Metadata).source_object_id===(frame as Metadata).frame_object_id){
   const original=await object(((mapping as Metadata).source_object_id as string)),shape=original.shape_yx,rect=(mapping as Metadata).source_rect_xyxy;
   need(original.kind==='frame'&&original.object_id===(frame as Metadata).frame_object_id&&original.source_object_id===(frame as Metadata).source_object_id&&original.frame_index===(frame as Metadata).frame_index&&ID.test(((original.source_object_id??'' as string) as string))&&Number.isSafeInteger(original.frame_index)&&(original.frame_index as number)>=0,'ROI source does not match its exact saved frame identity');
   need(Array.isArray(shape)&&shape.length===2&&shape.every(v=>Number.isSafeInteger(v)&&v>0)&&shape[0]*shape[1]<=4194304&&DTYPES.has((original.dtype as string))&&SHA.test((((original.files_sha256 as Metadata)?.['data.npy']??'' as string) as string)),'ROI source lacks a bounded original scientific array/hash');
   need(Array.isArray(rect)&&rect.length===4&&rect.every(Number.isSafeInteger)&&rect[0]>=0&&rect[1]>=0&&rect[0]<rect[2]&&rect[1]<rect[3]&&rect[2]<=shape[1]&&rect[3]<=shape[0]&&sourcePlane.dtype===original.dtype&&equalRecords(sourcePlane.shape_yx,[rect[3]-rect[1],rect[2]-rect[0]]),'ROI source rectangle does not match its saved original plane');
   need(source.object.source_shape_yx===undefined||equalRecords(source.object.source_shape_yx,shape),'ROI source shape disagrees with its saved original plane');
   spatialSource={object_id:original.object_id,shape_yx:copy(shape),dtype:original.dtype,array_sha256:((original).files_sha256 as Metadata)['data.npy'],frame_identity:copy(frame)};
  }
  panels.push({slot,state:{object:copy(source.object),effective_display:copy(source.effective_display),frame_identity:copy(source.frame_identity)},clean_png_base64:asset.clean_png_base64,scale_bar:copy(slot.scale_bar),...(spatialSource?{spatial_source:spatialSource}:{})});
 }
 return panels;
}
