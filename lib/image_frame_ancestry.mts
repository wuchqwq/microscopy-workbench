// A bounded, per-read projection of already provider-qualified ancestry.
// It contains no arrays, rendered ancestor images, or new scientific identity.
export const IMAGE_FRAME_ANCESTRY_FIELDS=['object_id','kind','parent_object_id','base_object_id','source_object_id','frame_index','dm_dataset_index','dm_plane_selection','source_identity','source_file_format','source_reader','upstream_backend','backend','state','image_path','evidence_format'] as const;
type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const id=/^[a-f0-9]{32}$/;
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):row(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function error():never{throw Object.assign(new Error('Invalid qualified frame ancestry projection'),{status:409});}
export function frameAncestryProjection(value:Row):Row{return Object.fromEntries(IMAGE_FRAME_ANCESTRY_FIELDS.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));}
export function readImageFrameAncestry(raw:unknown,root:Row):Row[]|null {
 if(raw===undefined)return null; // An older provider can keep the original reads.
 if(!row(raw)||Object.keys(raw).some(key=>!['schema_version','root_object_id','records'].includes(key))||raw.schema_version!==1||raw.root_object_id!==root.object_id||!Array.isArray(raw.records)||!raw.records.length||raw.records.length>65||Buffer.byteLength(JSON.stringify(raw))>512*1024)error();
 const records=raw.records as unknown[];
 for(const value of records)if(!row(value)||Object.keys(value).some(key=>!(IMAGE_FRAME_ANCESTRY_FIELDS as readonly string[]).includes(key))||typeof value.object_id!=='string'||!id.test(value.object_id)||value.backend!=='external-image-workspace'||value.state!=='completed')error();
 const values=records as Row[];if(!same(values[0],frameAncestryProjection(root)))error();
 let value=values[0]!,index=0;const visited=new Set<unknown>();
 for(let n=0;n<64;n++){
  if(value.kind==='frame'||value.kind==='tiff_source'||value.kind==='dm_source'||value.kind==='compare'||visited.has(value.object_id)){if(index+1!==values.length)error();return values;}
  visited.add(value.object_id);const next=value.parent_object_id??value.base_object_id??value.source_object_id;
  if(!id.test(String(next??''))){if(index+1!==values.length)error();return values;}
  value=values[++index]!;if(!value||value.object_id!==next)error();
 }
 // The original loop freshly reads the next (65th) object before exhausting
 // its 64 iterations. Keep that read and its rejection checks in the bundle.
 if(index!==64||values.length!==65)error();return values;
}
