// Direct researcher entry: the same local MCP/scientific backend, no model.
import path from 'node:path';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {mkdirSync,existsSync,realpathSync,statSync,openSync,writeFileSync,fsyncSync,closeSync,readFileSync,renameSync,unlinkSync} from 'node:fs';
import {StdioImageClient,createImagePanel} from './image_panel.mjs';
import type {PanelClient} from '../lib/image_panel_contracts.mjs';

// CLI options are a caller contract; existing validation still runs at entry.
export interface ResearcherOptions {workspace:string;python:string;source?:string;frame?:number;dataset?:number;plane_axes?:number[];plane_indices?:(number|null)[];component?:string;}
type NativeRecord=Record<string,unknown>;
// These views preserve native property/method access on unqualified saved JSON.
// They are not scientific, session or result validators.
const fields=(value:unknown)=>value as NativeRecord;
const nativeError=(value:unknown)=>value as Error;
interface InspectorPorts {createClient?:(args:{workspace:string;python:string})=>PanelClient;openPanel?:typeof createImagePanel;}


const objectId=/^[a-f0-9]{32}$/;
const HELP='node tools/researcher_inspector.mjs --source ABS_TIFF_OR_DM3_OR_DM4 --workspace ABS_DIRECTORY --python ABS_PYTHON [--frame 1] [--dataset 1] [--component real|imag|amplitude|power] [--plane-axes Y,X --plane-indices 0,*,*]. DM dataset numbers start at 1; omit only when exactly one eligible scientific dataset exists. Reopen with the same workspace/python; source, initial frame and dataset may be omitted.';
function validatePlaneOptions(options: {plane_axes?:unknown;plane_indices?:unknown}){const axes=options.plane_axes,indices=options.plane_indices;if((axes===undefined)!==(indices===undefined))throw new Error('Supply both plane selectors');if(axes!==undefined&&(!Array.isArray(axes)||axes.length!==2||axes.some(v=>!Number.isInteger(v)||v<0||v>5)||axes[0]===axes[1]||!Array.isArray(indices)||indices.length<2||indices.length>6||axes.some(v=>v>=indices!.length)||indices.some((v,i)=>axes.includes(i)?v!==null:!Number.isSafeInteger(v)||v<0)))throw new Error('Invalid explicit DM plane selectors');}
function durableNew(file:string,value:unknown){const fd=openSync(file,'wx');try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
function boundedJSON(file:string):unknown{if(statSync(file).size>1024*1024)throw new Error('Inspector record exceeds 1 MiB');return JSON.parse(readFileSync(file,'utf8'));}
function replaceJSON(file:string,value:unknown){const temporary=file+'.'+randomBytes(6).toString('hex')+'.tmp';durableNew(temporary,value);try{renameSync(temporary,file);}finally{if(existsSync(temporary))unlinkSync(temporary);}}
function inside(root:string,file:string){const resolved=realpathSync(file),relative=path.relative(realpathSync(root),resolved);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Inspector reference escapes its workspace');return resolved;}

export function parseResearcherArgs(argv:readonly string[]):ResearcherOptions{
 const options:Record<string,unknown>={};
 for(let i=0;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];if(!['--source','--workspace','--python','--frame','--dataset','--plane-axes','--plane-indices','--component'].includes(key)||!value||options[key.slice(2).replaceAll('-','_')]!==undefined)throw new Error(HELP);options[key.slice(2).replaceAll('-','_')]=value;}
 for(const key of ['workspace','python'])if(!path.isAbsolute((options[key]??'') as string))throw new Error('Explicit absolute '+key+' required. '+HELP);
 if(options.source!==undefined&&!path.isAbsolute(options.source as string))throw new Error('Source must be an absolute local TIFF/DM3/DM4 path');
 if(options.frame!==undefined&&(!/^[1-9][0-9]*$/.test(options.frame as string)||!Number.isSafeInteger(Number(options.frame))))throw new Error('Frame is a human-facing integer starting at 1');
 if(options.frame!==undefined)options.frame=Number(options.frame);
 if(options.dataset!==undefined&&(!/^[1-9][0-9]*$/.test(options.dataset as string)||Number(options.dataset)>64))throw new Error('DM dataset is a human-facing integer from 1 through 64');
 if(options.dataset!==undefined)options.dataset=Number(options.dataset);
 if((options.plane_axes===undefined)!==(options.plane_indices===undefined))throw new Error('Supply both --plane-axes and --plane-indices');
 if(options.plane_axes!==undefined){if(!/^[0-5],[0-5]$/.test(options.plane_axes as string))throw new Error('--plane-axes is two distinct zero-based original array axes Y,X');options.plane_axes=(options.plane_axes as string).split(',').map(Number);if((options.plane_axes as number[])[0]===(options.plane_axes as number[])[1])throw new Error('Plane axes must be distinct');if(!/^(?:[0-9]+|\*)(?:,(?:[0-9]+|\*)){1,5}$/.test(options.plane_indices as string))throw new Error('--plane-indices uses zero-based integers and * for the two plane axes');options.plane_indices=(options.plane_indices as string).split(',').map(v=>v==='*'?null:Number(v));if((options.plane_indices as (number|null)[]).some(v=>v!==null&&!Number.isSafeInteger(v)))throw new Error('Plane index exceeds safe integer range');}
 if(options.component!==undefined&&!['real','imag','amplitude','power'].includes(options.component as string))throw new Error('Complex display component must be real/imag/amplitude/power');
 validatePlaneOptions(options);return options as unknown as ResearcherOptions;
}

export async function startResearcherInspector(options:ResearcherOptions,{createClient=args=>new StdioImageClient(args),openPanel=createImagePanel}:InspectorPorts={}){
 // The only file entry is the explicitly named TIFF, DM3 or DM4. All later references are
 // provider objects or this launcher's own bounded journal within the workspace.
 const workspace=path.resolve(options.workspace),python=options.python;
 if(options.component!==undefined&&!['real','imag','amplitude','power'].includes(options.component as string))throw new Error('Complex display component must be real/imag/amplitude/power');
 if(!path.isAbsolute(options.workspace??'')||!path.isAbsolute(python??''))throw new Error('Absolute workspace and external Python paths required');
 if(options.dataset!==undefined&&(!Number.isSafeInteger(options.dataset)||options.dataset<1||options.dataset>64))throw new Error('DM dataset must be an integer from 1 through 64');
 validatePlaneOptions(options);
 if(!existsSync(python)||!statSync(python).isFile())throw new Error('External Python executable does not exist');
 mkdirSync(workspace,{recursive:true});
 const directory=path.join(workspace,'researcher-inspector');mkdirSync(directory,{recursive:true});
 const sessionPath=path.join(directory,'session.json');let session:NativeRecord;
 if(existsSync(sessionPath)){
  session=fields(boundedJSON(inside(workspace,sessionPath)));
  if(session.schema_version!==1||session.workspace!==realpathSync(workspace)||!objectId.test((session.session_id??'') as string))throw new Error('Inspector session binding is invalid');
  if(options.source!==undefined&&realpathSync(options.source)!==session.source_path)throw new Error('Workspace is bound to a different source file; use a new workspace');
  if(options.frame!==undefined&&options.frame!==session.initial_frame)throw new Error('Initial frame differs; resume the saved view and use its frame navigation');
  if(options.dataset!==undefined&&options.dataset-1!==session.initial_dataset_index)throw new Error('Dataset differs from the saved startup; reopen without a selector or use a new workspace');
  for(const key of ['plane_axes','plane_indices','component'] as const)if(options[key]!==undefined&&JSON.stringify(options[key])!==JSON.stringify(session['initial_'+key]))throw new Error('Plane or initial component differs from the saved startup; reopen saved view and adjust display, or use a new workspace');
 }else{
  if(!path.isAbsolute(options.source??'')||!existsSync(options.source!)||!statSync(options.source!).isFile())throw new Error('First launch requires an explicit existing local TIFF, DM3 or DM4 source');
  const initialFrame=options.frame??1;if(!Number.isSafeInteger(initialFrame)||initialFrame<1)throw new Error('Frame starts at 1');
  const dm=['.dm3','.dm4'].includes(path.extname(options.source!).toLowerCase());if((options.dataset!==undefined||options.plane_axes!==undefined)&&!dm)throw new Error('Dataset/plane selectors apply to DM3/DM4 sources only');if(dm&&initialFrame!==1)throw new Error('DM selects explicit 2D planes, not an inferred depth frame; --frame must be 1');
  session={schema_version:1,session_id:randomBytes(16).toString('hex'),workspace:realpathSync(workspace),source_path:realpathSync(options.source!),initial_frame:initialFrame,...(options.dataset!==undefined?{initial_dataset_index:options.dataset-1}:{}),...(options.plane_axes!==undefined?{initial_plane_axes:options.plane_axes,initial_plane_indices:options.plane_indices}:{}),...(options.component!==undefined?{initial_component:options.component}:{}),created_utc:new Date().toISOString()};
  durableNew(sessionPath,session);
 }
 const startup=path.join(directory,'startup');mkdirSync(startup,{recursive:true});
 const call=async(client:PanelClient,label:string,name:string,args:NativeRecord):Promise<NativeRecord>=>{
  const request={name,arguments:{...args,request_id:`inspector-${(session.session_id as string).slice(0,12)}-${label}`}},requestFile=path.join(startup,label+'.request.json'),responseFile=path.join(startup,label+'.response.json');
  if(existsSync(requestFile)){
   const saved=fields(boundedJSON(requestFile));if(JSON.stringify(saved)!==JSON.stringify(request))throw new Error('Original inspector request conflicts with saved parameters');
   // An accepted operation is queried by its original ID, never resubmitted.
   const result=await client.tool('image_result',{request_id:fields(saved.arguments).request_id});
   if(!objectId.test((fields(result.data)?.object_id??'') as string))throw new Error('Original request remains unresolved: '+fields(saved.arguments).request_id);
   if(existsSync(responseFile)){const receipt=fields(boundedJSON(responseFile));if(receipt.object_id!==fields(result.data).object_id)throw new Error('Recovered request returned a different object');}
   else durableNew(responseFile,{object_id:fields(result.data).object_id,request_id:fields(saved.arguments).request_id});
   return fields(result.data);
  }
  durableNew(requestFile,request);
  let result;try{result=await client.tool(name,request.arguments);}catch(error){nativeError(error).message+=` Original inspector request_id=${request.arguments.request_id}; reopen this workspace to query it. Do not submit another write to recover it.`;throw error;}
  if(!objectId.test((fields(result.data)?.object_id??'') as string))throw new Error('Operation has not returned a saved object. Recover original request '+request.arguments.request_id);
  durableNew(responseFile,{object_id:fields(result.data).object_id,request_id:request.arguments.request_id});return fields(result.data);
 };
 let bootstrap=createClient({workspace,python}),selected:NativeRecord,previousDraft=false,resumed=false,numericResultRefs:unknown;
 try{
  const initialized=fields(await bootstrap.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'mcp-dm-researcher-inspector',version:'1'}}));if(initialized.error)throw new Error(fields(initialized.error).message as string);
  const pointer=path.join(directory,'latest-panel.json');
  if(existsSync(pointer)){
   resumed=true;
   const saved=fields(boundedJSON(inside(workspace,pointer)));
   if(saved.schema_version!==1||saved.session_id!==session.session_id||!objectId.test((saved.run_id??'') as string))throw new Error('Saved panel binding is invalid');
   const selectionPath=inside(workspace,path.join(directory,'panels',saved.run_id as string,'journal','current-selection.json'));
   const selection=fields(boundedJSON(selectionPath));if(!objectId.test((selection.object_id??'') as string))throw new Error('Saved panel object identity is invalid');
   selected=fields((await bootstrap.tool('image_info',{object_id:selection.object_id})).data);
   previousDraft=Boolean(fields(selection.edit_state)?.dirty||fields(selection.edit_state)?.gesture_active);
   numericResultRefs=Object.hasOwn(selection,'numeric_result_refs')?selection.numeric_result_refs:null;
  }else{
   const source=await call(bootstrap,'open','image_open',{source_path:session.source_path});
   const frame=await call(bootstrap,'frame','image_frame',{object_id:source.object_id,frame_index:(session.initial_frame as number)-1,...(session.initial_dataset_index!==undefined?{dataset_index:session.initial_dataset_index}:{}),...(session.initial_plane_axes!==undefined?{plane_axes:session.initial_plane_axes,plane_indices:session.initial_plane_indices}:{})});
   selected=await call(bootstrap,'preview','image_preview',{object_id:frame.object_id,...(session.initial_component!==undefined?{component:session.initial_component}:{})});
  }
 }finally{await bootstrap.close();}
 const runId=randomBytes(16).toString('hex'),runDirectory=path.join(directory,'panels',runId),journalDirectory=path.join(runDirectory,'journal');mkdirSync(runDirectory,{recursive:true});
 durableNew(path.join(runDirectory,'run.json'),{schema_version:1,session_id:session.session_id,object_id:selected.object_id,created_utc:new Date().toISOString()});
 let panel;
 try{panel=await openPanel({workspace,python,object_id:selected.object_id as string,journalDirectory,numeric_result_refs:numericResultRefs});replaceJSON(path.join(directory,'latest-panel.json'),{schema_version:1,session_id:session.session_id,run_id:runId});}
 catch(error){if(panel)await panel.close();throw error;}
 return {panel,workspace,source_path:session.source_path,resumed,previous_unsaved_draft:previousDraft,numeric_result_recovery:panel.state?.().numeric_result_recovery??{state:numericResultRefs===null?'legacy_missing_refs':'not_requested'},
  async close(){await panel.close();}};
}

if(isDirectInvocation(import.meta.url)){
 let instance:Awaited<ReturnType<typeof startResearcherInspector>>;
 try{
  instance=await startResearcherInspector(parseResearcherArgs(process.argv.slice(2)));
  process.stdout.write('Researcher Image Inspector — scientific backend active; no model session.\n'+instance.panel.url+'\n');
  process.stdout.write('Keep this process running. Ctrl+C closes the local panel normally. Reuse the same workspace to reopen saved results.\n');
  if(instance.previous_unsaved_draft)process.stderr.write('The previous session had an unsaved draft. Its original journal is retained; this window resumes only the last saved scientific object.\n');
  if(instance.numeric_result_recovery.state==='legacy_missing_refs')process.stderr.write('Previous panel snapshot has no separate statistics/profile references. Old records are retained; no results were guessed or recalculated.\n');
  else if(instance.numeric_result_recovery.state==='partial')process.stderr.write('Some saved statistics/profile references could not be verified. The image remains open; inspect numeric_result_recovery and do not repeat unknown requests automatically.\n');
  let closing=false;const close=async()=>{if(!closing){closing=true;await instance.close();}};process.on('SIGINT',close);process.on('SIGTERM',close);
 }catch(error){process.stderr.write(nativeError(error).message+'\n');process.exitCode=1;}
}
