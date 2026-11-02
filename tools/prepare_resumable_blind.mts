// Test-only setup: actual MCP records. No model, browser or hidden truth access.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {StdioImageClient} from './image_panel.mjs';
const output=path.resolve(process.argv[2]!),repo=fileURLToPath(new URL('../',import.meta.url));
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const save=(p:string,v:unknown)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const refs:Record<string,any>={};
for(const label of ['u81','u24']){
 const configPath=path.join(output,'public',label+'-config.json'),config=read(configPath),task=read(path.join(output,'public',label+'.json'));
 process.env.MICROSCOPY_PLUGIN_CONFIG=configPath;
 const c=new StdioImageClient({workspace:path.join(config.workspace_root,'images'),python:config.python,serverPath:path.join(repo,'tools/plugin_server.mjs')});
 let serial=0;const log:any[]=[];
 const call=async(name:string,args:Record<string,unknown>)=>{const parameters={request_id:`blind-setup-${label}-${++serial}`,...args};const r=await c.tool(name,parameters);assert.ok(r.data);log.push({name,arguments:parameters,data:r.data});return r.data as any;};
 try{
  await c.rpc('initialize');const source=await call('image_open',{source_path:task.source_path});const frame=await call('image_frame',{object_id:source.object_id,frame_index:0});
  const preview=await call('image_preview',{object_id:frame.object_id,max_size:256});let saved=preview;
  if(label==='u81')saved=await call('image_annotate',{object_id:preview.object_id,annotations:[{annotation_id:'operator-support-b7',purpose:'resumable_observation',selection_origin:'unspecified',kind:'rectangle',status:'hypothesized',coordinate_space:'source_pixels',source_object_id:frame.object_id,coordinates:[29,35,181,187],note:'test_operator_protocol_simulation: supplied local support for texture inspection; no real researcher gesture or known material truth.'}]});
  const panel=await call('image_panel_open',{object_id:saved.object_id});refs[label]={panel_id:panel.panel_id};
  if(label==='u24'){
   // Controlled interruption after durable reservation, before a dispatch reply.
   // Only the assessor sees the one-use ticket. No inferred completion/answer is
   // given to the tested Agent. Formal transport-fault coverage is separate.
   const request_id=`blind-setup-${label}-${++serial}`,request={workspace:path.join(config.workspace_root,'images'),action:'view',request_id,object_id:frame.object_id,max_size:192,gamma:1.13,_preview_phase:'reserve'};
   const prepared=spawnSync(config.python,['-B',path.join(repo,'..','tools/image_workspace.py')],{input:JSON.stringify(request),encoding:'utf8'});
   assert.equal(prepared.status,0,prepared.stderr);const receipt=JSON.parse(prepared.stdout);assert.equal(receipt.ok,true);assert.equal(receipt.preview_admission.phase,'reserved');
   log.push({scope:'test-only controlled interruption, not an MCP dispatch',request,receipt});
   save(path.join(output,'public','continuation.json'),{schema_version:1,panel_id:panel.panel_id,operator_message:'test_operator_protocol_simulation: a previous image_preview response was unavailable to the operator; outcome unknown. Continue the supplied image task from this saved Panel. No GUI participation.',prior_references:[{provider:'image',object_id:null,request_id}]});
  }
  save(path.join(output,'assessor',label+'-setup.json'),log);
 }finally{await c.close();}
}
save(path.join(output,'public','handoffs.json'),refs);
