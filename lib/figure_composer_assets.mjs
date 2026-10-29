// Read-only hydration of explicit saved figure references. The supplied ports
// expose image_info records/assets only; this module never executes a tool.
import {createHash} from 'node:crypto';
import {validateComposition} from '../ui/image-panel/figure-composer.mjs';
import {readFigureRecipe,recipeIdentity,figureDisplayParameters} from '../ui/image-panel/figure-export.mjs';
import {equalRecords} from '../ui/image-panel/viewer-state.mjs';

const ID=/^[a-f0-9]{32}$/,SHA=/^[a-f0-9]{64}$/;
const IMAGE=new Set(['view','fft','fft_view','annotate','compare']);
const NUMERIC=new Set(['frame','view','fft','fft_view']);
const DTYPES=new Set(['uint8','uint16','uint32','int8','int16','int32','float32','float64','complex64','complex128']);
const MAX_PNG=2*1024*1024,MAX_JSON=2*1024*1024,MAX_READS=64;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'INVALID_COMPOSITION'});};
const copy=v=>structuredClone(v);
function bounded(value,maximum=MAX_JSON){
 let nodes=0;const active=new Set();
 const visit=(v,depth)=>{
  need(++nodes<=120000&&depth<=32,'Figure metadata exceeds its bounded depth/node budget');
  if(v===null||typeof v==='string'||typeof v==='boolean')return;
  if(typeof v==='number'){need(Number.isFinite(v),'Figure metadata contains a nonfinite value');return;}
  need(typeof v==='object'&&!active.has(v)&&(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null),'Figure metadata must be plain finite JSON');
  active.add(v);for(const child of Object.values(v))visit(child,depth+1);active.delete(v);
 };
 visit(value,0);need(Buffer.byteLength(JSON.stringify(value))<=maximum,'Figure metadata exceeds its byte budget');
}
function grid(value){
 need(record(value)&&ID.test(value.source_grid_object_id??'')&&SHA.test(value.array_sha256??'')&&DTYPES.has(value.dtype),'Profile scientific grid identity is incomplete');
 need(Array.isArray(value.shape_yx)&&value.shape_yx.length===2&&value.shape_yx.every(v=>Number.isSafeInteger(v)&&v>0)&&value.shape_yx[0]*value.shape_yx[1]<=4194304,'Profile scientific shape exceeds its saved-array budget');
 need(['source_pixels','source_array_indices','frequency_cycles_per_pixel'].includes(value.coordinate_space),'Profile coordinate domain is unsupported');
 const r=value.source_rect_xyxy;
 need(r===null||Array.isArray(r)&&r.length===4&&r.every(Number.isSafeInteger)&&r[0]>=0&&r[1]>=0&&r[2]>r[0]&&r[3]>r[1],'Profile source rectangle is invalid');
 need(value.coordinate_space==='frequency_cycles_per_pixel'?r===null:r!==null,'Profile rectangle and coordinate domain disagree');
 if(r!==null)need(r[2]-r[0]===value.shape_yx[1]&&r[3]-r[1]===value.shape_yx[0],'Profile source rectangle disagrees with its array shape');
}
function png(value){
 need(typeof value==='string'&&value.length>0&&value.length<=Math.ceil(MAX_PNG/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(value),'Clean PNG is missing, malformed or exceeds 2 MiB');
 const bytes=Buffer.from(value,'base64');
 need(bytes.length>=33&&bytes.length<=MAX_PNG&&bytes.toString('base64')===value&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.readUInt32BE(8)===13&&bytes.subarray(12,16).toString()==='IHDR','Only canonical saved PNG assets are supported');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 need(width>0&&height>0&&width<=2048&&height<=2048&&width*height<=1048576,'Clean PNG dimensions exceed the display budget');
 return {bytes,width,height,digest:createHash('sha256').update(bytes).digest('hex')};
}
function finitePairs(values,count){return Array.isArray(values)&&values.length===count&&values.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));}
function checkProfile(value){
 need(value.kind==='profile'&&ID.test(value.parent_object_id??''),'Requested object is not a saved profile');grid(value.scientific_grid_identity);
 const s=value.samples,n=value.sampling?.sample_count,g=value.scientific_grid_identity;
 need(Number.isInteger(n)&&n>=2&&n<=4096&&value.sampling?.interpolation==='nearest'&&value.sampling?.line_width===1,'Profile requires 2–4096 saved width-one nearest samples');
 need(record(s)&&finitePairs(s.coordinates_xy,n)&&finitePairs(s.sampled_coordinates_xy,n)&&finitePairs(s.indices_xy,n),'Profile saved coordinates are incomplete');
 need(Array.isArray(s.value)&&s.value.length===n&&s.value.every(Number.isFinite)&&Array.isArray(s.distance)&&s.distance.length===n&&s.distance.every((v,i)=>Number.isFinite(v)&&v>=0&&(i===0?v===0:v>=s.distance[i-1])),'Profile requires finite saved values and distances');
 need(finitePairs(value.points,2)&&!equalRecords(value.points[0],value.points[1])&&equalRecords(s.coordinates_xy[0],value.points[0])&&equalRecords(s.coordinates_xy[n-1],value.points[1]),'Profile endpoints disagree with saved sample coordinates');
 need(s.indices_xy.every(p=>p.every(Number.isSafeInteger)&&p[0]>=0&&p[1]>=0&&p[0]<g.shape_yx[1]&&p[1]<g.shape_yx[0]),'Profile indices exceed its scientific grid');
 const spectral=g.coordinate_space==='frequency_cycles_per_pixel';
 need(value.sampling.tie_rule==='floor(array_index+0.5)','Profile nearest-sample convention is missing');
 need(s.indices_xy.every((pair,i)=>pair.every((index,axis)=>{
  const size=g.shape_yx[1-axis],offset=spectral?Math.floor(size/2):g.source_rect_xyxy[axis],position=spectral?s.coordinates_xy[i][axis]*size+offset:s.coordinates_xy[i][axis]-offset;
  return index===Math.floor(position+.5)&&s.sampled_coordinates_xy[i][axis]===(spectral?(index-offset)/size:index+offset);
 })),'Profile indices and sampled coordinates disagree with its saved nearest-sample convention');
 need(value.coordinate_space===g.coordinate_space&&value.dtype===g.dtype&&value.distance_unit===(spectral?'cycles/pixel':'pixel'),'Profile dtype or coordinate units disagree with its saved grid');
 need(['complex64','complex128'].includes(g.dtype)?['real','imag','amplitude','power'].includes(value.component):value.component==='raw','Profile component must explicitly match the scientific dtype');
 need(SHA.test(value.files_sha256?.['profile.npy']??'')&&SHA.test(value.files_sha256?.['profile.csv']??''),'Profile lacks saved scientific NPY/CSV hashes');
 if(s.physical_distance!==null){
  const cal=value.xy_calibration,scale=cal?.xy_scale;
  need(Array.isArray(s.physical_distance)&&s.physical_distance.length===n&&s.physical_distance.every((v,i)=>Number.isFinite(v)&&v>=0&&(i===0?v===0:v>=s.physical_distance[i-1])),'Profile physical axis is incomplete');
  need(cal?.status==='active'&&cal.coordinate_domain==='real_space'&&record(scale)&&[scale.x,scale.y].every(v=>Number.isFinite(v)&&v!==0)&&typeof scale.unit==='string'&&scale.unit.length>0&&value.physical_distance_unit===(spectral?'cycles/':'')+scale.unit,'Profile physical axis has no matching active calibration');
 }else need(value.physical_distance_unit===null,'Uncalibrated profile cannot declare physical units');
}

export async function resolveComposition(value,{readState,readObject}={}){
 // Validate every slot before even the first provider read. In particular JSON
 // serialisation must not turn NaN/undefined into a different accepted request.
 bounded(value,512*1024);const recipe=validateComposition(value);
 for(const slot of recipe.slots)if(slot.kind==='profile')grid(slot.scientific_grid_identity);
 need(typeof readState==='function'&&typeof readObject==='function','Read-only saved-object ports are required');
 const objects=new Map(),states=new Map();let reads=0,totalPNG=0;
 const budget=()=>need(++reads<=MAX_READS,'Composition saved-object reads exceed the bounded ancestry budget');
 const remember=(id,result)=>{need(record(result)&&result.object_id===id&&typeof result.kind==='string','Provider returned another or missing saved object');bounded(result);objects.set(id,copy(result));return objects.get(id);};
 const object=async id=>{need(ID.test(id??''),'Invalid saved ancestry object ID');if(!objects.has(id)){budget();remember(id,await readObject(id));}return objects.get(id);};
 const state=async id=>{
  if(!states.has(id)){
   budget();const result=await readState(id);need(record(result)&&record(result.object)&&IMAGE.has(result.object.kind),'Image slot requires an already rendered saved image');
   const saved=remember(id,result.object);bounded({object:saved,effective_display:result.effective_display,frame_identity:result.frame_identity});
   need(SHA.test(result.clean_png_sha256??''),'Saved view lacks a clean PNG hash');
   need(typeof result.clean_png_base64==='string'&&result.clean_png_base64.length<=Math.ceil(MAX_PNG/3)*4,'Saved view clean PNG exceeds its budget');
   states.set(id,{object:saved,effective_display:copy(result.effective_display),frame_identity:copy(result.frame_identity),clean_png_base64:result.clean_png_base64,clean_png_sha256:result.clean_png_sha256});
  }return states.get(id);
 };
 const ancestry=async(from,to)=>{
  const pending=[from],seen=new Set();
  while(pending.length){const id=pending.pop();if(seen.has(id))continue;need(seen.size<32,'Saved image ancestry exceeds 32 records');seen.add(id);if(id===to)return true;const v=await object(id);for(const key of ['parent_object_id','base_object_id','render_base_object_id'])if(v[key]!==undefined&&v[key]!==null){need(ID.test(v[key]),'Malformed saved image ancestry');pending.push(v[key]);}}
  return false;
 };
 const plane=async initial=>{
  let current=initial;const seen=new Set();
  for(let n=0;n<32;n++){
   need(!seen.has(current.object_id),'Saved scientific ancestry contains a cycle');seen.add(current.object_id);
   if(NUMERIC.has(current.kind)||current.kind==='compare')return current;
   const id=current.render_base_object_id??current.base_object_id??current.parent_object_id;need(ID.test(id??''),'Saved view has no scientific plane');current=await object(id);
  }need(false,'Scientific ancestry exceeds 32 records');
 };
 const payload=v=>({dtype:v.dtype??null,shape:v.shape_yx??v.source_shape_yx??null,axes:v.axes??null,arrays:Object.fromEntries(Object.entries(v.files_sha256??{}).filter(([name])=>name.endsWith('.npy')))});
 const panels=[];
 for(const slot of recipe.slots){
  if(slot.kind==='profile'){
   const profile=await object(slot.object_id);checkProfile(profile);
   need(equalRecords(profile.scientific_grid_identity,slot.scientific_grid_identity)&&equalRecords(profile.xy_calibration??null,slot.xy_calibration),'Saved profile grid or calibration differs from its reference');
   const parent=await object(profile.parent_object_id),input=await plane(parent),spectral=['fft','fft_view'].includes(input.kind),mapping=input.panels?.[0];
   need(NUMERIC.has(input.kind)&&Array.isArray(input.shape_yx)&&SHA.test(input.files_sha256?.['data.npy']??''),'Profile input lacks one saved scientific plane');
   const actual={source_grid_object_id:spectral?input.spectrum_object_id??input.object_id:input.kind==='view'?mapping?.source_object_id:input.object_id,shape_yx:input.shape_yx,dtype:input.dtype,array_sha256:input.files_sha256['data.npy'],source_rect_xyxy:spectral?null:input.kind==='view'?mapping?.source_rect_xyxy:[0,0,input.shape_yx[1],input.shape_yx[0]],coordinate_space:spectral?'frequency_cycles_per_pixel':['frequency','reciprocal'].includes(parent.array_domain??input.array_domain)?'source_array_indices':'source_pixels'};
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
  const expected={...display,...(source.object.panels.every(p=>p.domain==='frequency')?{spectrum_axes:false}:{scale_bar:false})};
  need(equalRecords(figureDisplayParameters(asset.effective_display,asset.object.panels),expected),'Clean asset does not retain the saved display controls');
  need(await ancestry(asset.object.object_id,source.object.object_id)||await ancestry(source.object.object_id,asset.object.object_id),'Clean asset has no saved ancestry relationship with its source');
  const sourcePlane=await plane(source.object),assetPlane=await plane(asset.object);
  const science=payload(sourcePlane);
  need(Object.keys(science.arrays).length>0&&Object.values(science.arrays).every(hash=>SHA.test(hash))&&equalRecords(science,payload(assetPlane)),'Clean asset changed the scientific array or dtype/axes');
  const image=png(asset.clean_png_base64);totalPNG+=image.bytes.length;need(totalPNG<=4*MAX_PNG,'Composition PNG assets exceed their total budget');
  need(image.digest===slot.asset.clean_png_sha256&&asset.clean_png_sha256===image.digest,'Clean PNG digest differs from the saved asset reference');
  let base=asset.object;if(base.render_base_object_id)base=await object(base.render_base_object_id);
  const savedHash=base.files_sha256?.['unannotated.png']??(!base.annotations?.length?base.files_sha256?.['preview.png']:null);
  need(savedHash===image.digest&&equalRecords(base.panels,source.object.panels),'Clean PNG is not bound to its exact saved render');
  need(Array.isArray(base.panels)&&base.panels.length>=1&&base.panels.length<=4&&base.panels.every(p=>Array.isArray(p.image_rect_xyxy)&&p.image_rect_xyxy.length===4&&p.image_rect_xyxy.every(Number.isFinite)&&p.image_rect_xyxy[0]>=0&&p.image_rect_xyxy[1]>=0&&p.image_rect_xyxy[0]<p.image_rect_xyxy[2]&&p.image_rect_xyxy[1]<p.image_rect_xyxy[3]&&p.image_rect_xyxy[2]<=image.width&&p.image_rect_xyxy[3]<=image.height),'PNG dimensions disagree with the saved panel mapping');
  if(slot.scale_bar!==null){
   const candidates=[source.object,asset.object,sourcePlane,assetPlane,base];
   need(slot.scale_bar.visible===true&&candidates.some(v=>v.scale_bar?.visible===true&&equalRecords(v.scale_bar,slot.scale_bar)),'Scale bar is not an authoritative visible saved record');
   const cal=source.object.xy_calibration;
   need(cal?.status==='active'&&cal.coordinate_domain==='real_space'&&slot.scale_bar.calibration_id===cal.calibration_id&&slot.scale_bar.unit===cal.xy_scale?.unit&&slot.scale_bar.signed_scale===cal.xy_scale?.x,'Scale bar disagrees with the saved calibration');
  }
  panels.push({slot,state:{object:copy(source.object),effective_display:copy(source.effective_display),frame_identity:copy(source.frame_identity)},clean_png_base64:asset.clean_png_base64,scale_bar:copy(slot.scale_bar)});
 }
 return panels;
}
