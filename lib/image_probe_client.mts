// One bounded read-only JSONL worker per configured ImageWorkspace. No journal
// entry per pointer query, no shared mutable scientific image, no DM access.
import {fileURLToPath} from 'node:url';
import type {ToolResult} from './runtime/contracts.mjs';
import type {ImageProcess,SpawnImageProcess} from './image_process_contracts.mjs';
export type ProbeCoordinateSpace='source_pixels' | 'source_array_indices' | 'frequency_cycles_per_pixel';
export type ProbeComponent='raw' | 'real' | 'imag' | 'amplitude' | 'power';
export interface ProbeRequest extends Readonly<Record<string,unknown>> {
  readonly object_id: string; readonly points: readonly (readonly [number,number])[];
  readonly coordinate_space?: ProbeCoordinateSpace; readonly component?: ProbeComponent;
}
export interface ProbeSample {readonly point: readonly [number,number];readonly array_index_xy: readonly [number,number];readonly sampled_coordinate_xy: readonly [number,number];readonly value: number;}
export interface ProbeResult extends Readonly<Record<string,unknown>> {
  readonly object_id: string; readonly backend:'external-image-workspace';readonly state:'completed';readonly kind:'probe';
  readonly component:ProbeComponent;readonly coordinate_space:ProbeCoordinateSpace;readonly samples: readonly ProbeSample[];
  readonly scientific_grid_identity: {readonly shape_yx: readonly [number,number];readonly coordinate_space: ProbeCoordinateSpace;readonly array_sha256:unknown;};
  readonly sampling: {readonly interpolation:'nearest';readonly line_width:1;};
}
export interface ImageProbeOptions {workspace:string;python:string;spawnProcess:SpawnImageProcess;workerPath?:string;}
interface PendingProbe {parameters:ProbeRequest;resolve:(value:ToolResult)=>void;reject:(reason:unknown)=>void;}

export function validateProbeResponse(input: unknown,parameters: ProbeRequest): ProbeResult{
 const result=input as Record<string,unknown>;
 const pair=(value: unknown): value is [number,number]=>Array.isArray(value)&&value.length===2&&value.every((v: unknown)=>typeof v==='number'&&Number.isFinite(v));
 const samples=result?.samples,grid=result?.scientific_grid_identity as Record<string,unknown> | null | undefined;
 if(result?.object_id!==parameters.object_id||result.backend!=='external-image-workspace'||result.state!=='completed'||result.kind!=='probe'||
  result.component!==(parameters.component??'raw')||!(['source_pixels','source_array_indices','frequency_cycles_per_pixel'] as readonly unknown[]).includes(result.coordinate_space)||
  (parameters.coordinate_space!==undefined&&result.coordinate_space!==parameters.coordinate_space)||
  !Array.isArray(samples)||samples.length!==parameters.points?.length||samples.length<1||samples.length>64||
  !Array.isArray(grid?.shape_yx)||grid.shape_yx.length!==2||!grid.shape_yx.every((v: unknown)=>Number.isSafeInteger(v)&&(v as number)>0)||
  grid.coordinate_space!==result.coordinate_space||!/^[a-f0-9]{64}$/.test((grid.array_sha256??'') as string)||
  (result.sampling as Record<string,unknown> | null | undefined)?.interpolation!=='nearest'||(result.sampling as Record<string,unknown> | null | undefined)?.line_width!==1||
  samples.some((item: unknown,i: number)=>{const sample=item as Record<string,unknown>;return !pair(sample.point)||!sample.point.every((v,j)=>v===parameters.points[i][j])||
   !pair(sample.array_index_xy)||!sample.array_index_xy.every((v,j)=>Number.isSafeInteger(v)&&v>=0&&v<(grid!.shape_yx as number[])[1-j])||
   !pair(sample.sampled_coordinate_xy)||typeof sample.value!=='number'||!Number.isFinite(sample.value);}))throw new Error('Probe response identity, component, coordinates or numeric sample mismatch');
 return result as ProbeResult;
}
export class ImageProbeClient {
 declare readonly workspace:string;declare readonly python:string;declare readonly spawnProcess:SpawnImageProcess;declare readonly workerPath:string;
 declare sequence:number;declare pending:Map<number,PendingProbe>;declare child:ImageProcess | null;
 constructor({workspace,python,spawnProcess,workerPath=fileURLToPath(new URL('../tools/image_probe.py',import.meta.url))}: ImageProbeOptions){Object.assign(this,{workspace,python,spawnProcess,workerPath});this.sequence=0;this.pending=new Map();this.child=null;}
 start(){
  if(this.child)return;
  const child=this.spawnProcess(this.python,['-B',this.workerPath,this.workspace],{stdio:['pipe','pipe','pipe'],windowsHide:true});this.child=child;let buffer='',stderr='';
  const fail=(error: unknown)=>{if(this.child!==child)return;this.child=null;for(const value of this.pending.values())value.reject(error);this.pending.clear();};
  child.unref?.();
  child.stdout.on('data',chunk=>{buffer+=chunk.toString('utf8');if(Buffer.byteLength(buffer)>512*1024){child.kill();fail(new Error('Probe response exceeds bounded JSONL budget'));return;}let n;while((n=buffer.indexOf('\n'))>=0){const raw=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const decoded: unknown=JSON.parse(raw),reply=decoded as Record<string,unknown>,waiting=this.pending.get(reply.serial as number);if(!waiting)continue;this.pending.delete(reply.serial as number);if(!reply.ok)waiting.reject(new Error(`${(reply.error as Record<string,unknown> | null | undefined)?.code??'PROBE_ERROR'}: ${(reply.error as Record<string,unknown> | null | undefined)?.message??'Probe failed'}`));else{try{validateProbeResponse(reply.result,waiting.parameters);waiting.resolve({content:[{type:'text',text:JSON.stringify(reply.result)}]});}catch(error){waiting.reject(error);}}}catch(error){child.kill();fail(error);}}if(!this.pending.size)this.refs(false);});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4096);});
  child.on('error',error=>fail(new Error('Cannot start read-only probe worker: '+error.message)));
  child.stdin.on('error',error=>fail(error));
  child.on('close',()=>fail(new Error('Read-only probe worker closed '+stderr)));
  this.refs(false);
 }
 refs(active: boolean){for(const stream of [this.child?.stdin,this.child?.stdout,this.child?.stderr])if(active)stream?.ref?.();else stream?.unref?.();}
 call(parameters: ProbeRequest): Promise<ToolResult>{
  if(this.pending.size>=8)return Promise.reject(new Error('Read-only probe capacity exceeded; coalesce pointer requests'));
  this.start();const serial=++this.sequence,raw=JSON.stringify({serial,parameters});if(Buffer.byteLength(raw)>32768)return Promise.reject(new Error('Probe request exceeds 32 KiB'));
  this.refs(true);return new Promise<ToolResult>((resolve,reject)=>{this.pending.set(serial,{resolve,reject,parameters:structuredClone(parameters)});this.child!.stdin.write(raw+'\n');});
 }
 close(){this.child?.stdin.end();}
}
