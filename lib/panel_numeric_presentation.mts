// Admission for an existing provider numeric result, never a numeric engine.
// image_info has already checked its immutable journal, manifest and payloads.
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const same=(a:unknown,b:unknown)=>JSON.stringify(a??null,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)===JSON.stringify(b??null,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
function need(ok:unknown,message:string):asserts ok{if(!ok)throw Object.assign(new Error(message),{status:409});}
export function admitPanelNumericResult(result:Row,current:Row,requestedId:unknown,resultFrame:unknown,currentFrame:unknown):'statistics'|'profile'{
 need(result.kind==='statistics'||result.kind==='profile','Only saved statistics/profile results have a numeric presentation');
 need(result.object_id===requestedId&&result.state==='completed'&&result.backend==='external-image-workspace'&&typeof result.request_id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(result.request_id),'Numeric result must match its completed original provider object/request');
 need(typeof currentFrame==='string'&&/^[a-f0-9]{32}$/.test(currentFrame)&&resultFrame===currentFrame,'Numeric result and current view must have the same exact frame');
 const grid=row(result.scientific_grid_identity);
 need(typeof grid.source_grid_object_id==='string'&&typeof grid.array_sha256==='string'&&/^[a-f0-9]{64}$/.test(grid.array_sha256),'Numeric result has no qualified scientific grid');
 // Older ordinary previews omit a grid projection. The exact immutable input
 // is still a valid binding, matching the existing DataProbes UI contract.
 need(current.scientific_grid_identity?same(current.scientific_grid_identity,grid):result.parent_object_id===current.object_id,'Numeric result belongs to a different scientific grid; when the current view has no grid projection, use its exact view.object.object_id as the numeric input');
 need(same(current.xy_calibration,result.xy_calibration),'Numeric result belongs to a different calibration version');
 if(result.kind==='statistics'){
  const s=row(result.statistics);need(Number.isSafeInteger(s.sample_count)&&(s.sample_count as number)>0&&['mean','stddev','minimum','maximum'].every(k=>finite(s[k]))&&(s.stddev as number)>=0,'Saved statistics are incomplete');
 }else{
  const s=row(result.samples),sampling=row(result.sampling),n=Array.isArray(s.value)?s.value.length:0;
  need(n>=2&&n<=4096&&sampling.sample_count===n&&sampling.line_width===1&&sampling.interpolation==='nearest','Saved profile sampling is incomplete');
  for(const k of ['value','distance'])need(Array.isArray(s[k])&&s[k].length===n&&s[k].every(finite),'Saved profile values or distances are incomplete');
  for(const k of ['coordinates_xy','indices_xy'])need(Array.isArray(s[k])&&s[k].length===n&&s[k].every(p=>Array.isArray(p)&&p.length===2&&p.every(finite)),'Saved profile coordinates are incomplete');
  if(s.physical_distance!=null)need(Array.isArray(s.physical_distance)&&s.physical_distance.length===n&&s.physical_distance.every(finite)&&typeof result.physical_distance_unit==='string'&&result.physical_distance_unit.length>0,'Saved profile physical axis is incomplete');
 }
 return result.kind;
}
