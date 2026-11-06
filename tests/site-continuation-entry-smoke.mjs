// Actual existing CLI path, or one MCP path, driven by a SCRIPTED harness.
// It verifies executable continuation, not a fresh AI's autonomous decisions.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {StdioImageClient} from '../tools/image_panel.mjs';

const output=process.argv[2],flags=new Set(process.argv.slice(3)),mcpMode=flags.has('--mcp'),boundsMode=flags.has('--source-bounds'),followupMode=flags.has('--site-followup');
assert.ok(output&&path.isAbsolute(output)&&!existsSync(output),'Supply a fresh absolute output directory');
assert.ok([...flags].every(f=>['--mcp','--source-bounds','--site-followup'].includes(f)),'Only --mcp, --source-bounds and --site-followup are supported');
mkdirSync(output,{recursive:true});
const root=process.cwd(),workspace=path.join(output,'workspace');
const runtime=spawnSync(process.env.MICROSCOPY_PYTHON??'python',['-B','-c','import sys;print(sys.executable)'],{encoding:'utf8',windowsHide:true});
assert.equal(runtime.status,0,runtime.stderr);const python=runtime.stdout.trim();
const cases=boundsMode?[
 {name:'right_source_edge',target:4,refs:[10,10],modality:'haadf',expected:'tool_proposed',rect:[59,20,64,25],point:[61.25,22.25],off:[[59,20],[63,20]],axis:'vertical',points:[[61.25,20.25],[61.25,24.25]]},
 {name:'no_supported_axis',target:4,refs:[10,10],modality:'haadf',expected:'needs_supported_profile',rect:[59,59,64,64],point:[61.25,61.25]}
]:[{name:'weak_with_offsite_profile',target:4,refs:[10,10],modality:'haadf',expected:'tool_proposed'},
 {name:'reference_conflict',target:5,refs:[2,8],modality:'haadf',expected:'needs_reference_review'},
 {name:'unknown_channel',target:4,refs:[10,10],modality:'unknown',expected:'needs_information'}].slice(0,mcpMode?1:3);
const spec={scope:'Scripted existing-tool continuation only, not autonomous AI or physical STEM',rect:[20,20,25,25],refs:boundsMode?[[10,10,15,15],[40,40,45,45]]:[[4,4,9,9],[40,40,45,45]],point:[22.25,22.5],cases};
writeFileSync(path.join(output,'cases.json'),JSON.stringify(spec,null,2)+'\n',{flag:'wx'});
const generated=spawnSync(python,['-B','-X','utf8','-c',
 `from pathlib import Path\nimport json,sys,numpy as np,tifffile\np=Path(sys.argv[1]);s=json.loads((p/'cases.json').read_text())\nfor c in s['cases']:\n a=np.ones((64,64),np.float32)\n for r,v in zip([c.get('rect',s['rect']),*s['refs']],[c['target'],*c['refs']]):\n  x0,y0,x1,y1=r;a[y0:y1,x0:x1]=v\n a[22,27]=100\n tifffile.imwrite(p/(c['name']+'.tiff'),a,metadata=None)`,output],{encoding:'utf8',windowsHide:true});
assert.equal(generated.status,0,generated.stderr);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
let number=0,client;const delivered=new Set(),records=[];
if(mcpMode){client=new StdioImageClient({workspace,python});await client.rpc('initialize');}
function snapshot(){return Object.fromEntries(['objects','requests','cli-requests'].flatMap(folder=>existsSync(path.join(workspace,folder))?readdirSync(path.join(workspace,folder),{recursive:true,withFileTypes:true})
 .filter(e=>e.isFile()).map(e=>{const p=path.join(e.parentPath,e.name);return [p,hash(p)];}):[]));}
function unchanged(before){for(const [p,h]of Object.entries(before))assert.equal(hash(p),h,'Original evidence changed: '+p);}
async function call(name,input={},read=false){
 const args={...input,...(!read&&!input.request_id?{request_id:'site-entry-'+(++number)}:{})},index=++number;
 writeFileSync(path.join(output,'input-'+index+'.json'),JSON.stringify(args,null,2)+'\n');
 appendFileSync(path.join(output,'calls.jsonl'),JSON.stringify({phase:'before',name,args,mode:mcpMode?'MCP':'CLI'})+'\n');
 let data;
 if(mcpMode){const reply=await client.tool(name,args);data=reply.data;if(reply.png)writeFileSync(path.join(output,'delivered-'+index+'.png'),Buffer.from(reply.png,'base64'));}
 else{
  const query=name==='image_result';
  const argv=[path.join(root,'dist/tools/workbench_cli.mjs'),query?'query':'tool','--workspace',workspace,'--python',python,
   ...(query?['--request-id',args.request_id]:['--name',name,'--input',path.join(output,'input-'+index+'.json')])];
  const p=spawnSync(process.execPath,argv,{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,PYTHONUTF8:'1'}});
  writeFileSync(path.join(output,'stdout-'+index+'.json'),p.stdout??'');writeFileSync(path.join(output,'stderr-'+index+'.txt'),p.stderr??'');
  assert.equal(p.status,0,p.stderr||p.stdout||String(p.error));const envelope=JSON.parse(p.stdout);assert.equal(envelope.status,'completed');data=envelope.data;
 }
 appendFileSync(path.join(output,'calls.jsonl'),JSON.stringify({phase:'after',name,args,result:data})+'\n');
 // CLI exposes saved preview records but does not automatically acknowledge them.
 // Receipt is operational, not proof that a human/AI inspected pixels.
 if(!mcpMode&&['image_discovery','image_discovery_review'].includes(name)){
  const renderRecords=[data];
  if(data.overview_object_id)renderRecords.push(await call('image_info',{object_id:data.overview_object_id},true));
  for(const record of renderRecords){const ref=record.preview_execution;if(!ref)continue;const key=ref.request_id+':'+ref.object_id;if(delivered.has(key))continue;
   await call('image_preview_acknowledge',{preview_request_id:ref.request_id,object_id:ref.object_id,request_id:'site-ack-'+createHash('sha256').update(key).digest('hex').slice(0,30)});delivered.add(key);}
 }
 return data;
}
function prepareFollowup(reviewRequest){
 const before=snapshot(),index=++number;
 const p=spawnSync(process.execPath,[path.join(root,'dist/tools/workbench_cli.mjs'),'site-followup','--workspace',workspace,'--python',python,'--request-id',reviewRequest],
  {encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,PYTHONUTF8:'1'}});
 writeFileSync(path.join(output,'followup-'+index+'-stdout.json'),p.stdout??'');writeFileSync(path.join(output,'followup-'+index+'-stderr.txt'),p.stderr??'');
 const response=JSON.parse(p.stdout);assert.equal(p.status,({completed:0,failed:4,outcome_unknown:5,unavailable:6})[response.status]);
 assert.deepEqual(snapshot(),before,'site-followup must not write provider or CLI journals');
 appendFileSync(path.join(output,'calls.jsonl'),JSON.stringify({phase:'read_only_prepare',name:'CLI site-followup',reviewRequest,response})+'\n');
 return response;
}

try{
 for(const c of cases){
  const rect=c.rect??spec.rect,point=c.point??spec.point;
  const source=path.join(output,c.name+'.tiff'),sourceHash=hash(source);
  const opened=await call('image_open',{source_path:source});const frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});
  const discovery=await call('image_discovery',{object_id:frame.object_id,entry:'manual',selection_origin:'agent',regions:[{rect,reason:'Why does the fixed expected site differ from comparable references?'}]});
  const stats=await call('image_statistics',{object_id:frame.object_id,rect,reference_comparison:{reference_rects:spec.refs,source_text:'Two predeclared analytic comparison supports; material equivalence remains unverified'}});
  const evidence=[stats.object_id];
  if(c.expected==='tool_proposed'){const off=await call('image_profile',{object_id:frame.object_id,points:c.off??[[20,20],[24,20]]});evidence.push(off.object_id);}
  const site_context={question:'Is the observed difference consistent across references and has the expected site been sampled?',statistics_id:stats.object_id,expected_position_xy:point,
   position_source_text:'Fixed predeclared expected location, not a detected column',modality:c.modality,signal_kind:'stored_scalar',signal_source_text:'Analytic scalar fixture; no physical count interpretation'};
  const initial=await call('image_discovery_review',{object_id:discovery.object_id,candidate_id:discovery.candidates[0].candidate_id,evidence_ids:evidence,site_context,
   include_site_continuation:true,observation_text:'Retain all references and the actual off-site profile if supplied; physical cause unknown'});
  const proposal=initial.site_continuation;assert.equal(proposal.status,c.expected);
  assert.equal(proposal.version,2);
  if(c.axis){assert.equal(proposal.axis,c.axis);assert.deepEqual(proposal.action.arguments.points,c.points);}
  const protectedFiles=snapshot();let final=initial,profile=null,prepared=null,beforeProfile=null;
  if(followupMode){beforeProfile=prepareFollowup(initial.request_id);if(proposal.action){assert.equal(beforeProfile.status,'outcome_unknown');assert.equal(beforeProfile.data.next_tool_call,null);}else{assert.equal(beforeProfile.status,'completed');assert.equal(beforeProfile.data.next_tool_call,null);assert.equal(beforeProfile.data.phase,proposal.status);}}
  if(proposal.action){
   assert.equal(proposal.action.tool,'image_profile');
   profile=await call(proposal.action.tool,proposal.action.arguments);
   const after=proposal.after_success;assert.equal(profile.request_id,after.require_result_request_id);assert.equal(profile.kind,after.require_result_kind);
   const reviewArgs=structuredClone(after.arguments);reviewArgs.evidence_ids.push(profile.object_id);
   if(followupMode){prepared=prepareFollowup(initial.request_id);assert.equal(prepared.status,'completed');assert.equal(prepared.data.phase,'review_arguments_prepared');assert.deepEqual(prepared.data.next_tool_call,{tool:after.tool,arguments:reviewArgs});}
   final=await call(prepared?.data.next_tool_call.tool??after.tool,prepared?.data.next_tool_call.arguments??reviewArgs);
   assert.equal(final.site_continuation.status,'stop_at_observation');assert.equal(final.site_continuation.action,null);
   assert.equal(final.site_observation.profile_coverage.status,'covered');
   assert.deepEqual(final.evidence_refs.map(r=>r.object_id),[...evidence,profile.object_id]);
   assert.deepEqual(final.site_observation.profile_coverage.assessments.map(r=>r.status),['not_verified','covered']);
   assert.deepEqual(final.site_observation.raw_observation,initial.site_observation.raw_observation);
   assert.equal(final.history.at(-1).object_id,initial.object_id);
   if(followupMode){const again=prepareFollowup(initial.request_id);assert.deepEqual(again.data.next_tool_call,prepared.data.next_tool_call);}
   // Repeating this exact CLI invocation is query-only, never a second profile.
   if(!mcpMode){const state=snapshot();const again=await call(proposal.action.tool,proposal.action.arguments);assert.equal(again.object_id,profile.object_id);assert.deepEqual(snapshot(),state);}
  }else assert.equal(proposal.after_success,null);
  assert.deepEqual(final.site_observation.context.expected_position_xy,point);assert.equal(final.physical_conclusion,null);unchanged(protectedFiles);
  const exported=await call('image_export',{object_id:final.object_id,output_dir:path.join(output,'export-'+c.name)});
  assert.equal(hash(path.join(exported.output_dir,'site-continuation.json')),hash(path.join(workspace,'objects',final.object_id,'site-continuation.json')));
  if(final.image_path)copyFileSync(final.image_path,path.join(output,c.name+'-final.png'));
  assert.equal(hash(source),sourceHash);
  records.push({case:c.name,source_sha256:sourceHash,initial_review:initial,profile,final_review:final,export:exported,before_profile_followup:beforeProfile,prepared_followup:prepared});
 }
 const before=snapshot();
 if(mcpMode){await client.close();client=new StdioImageClient({workspace,python});await client.rpc('initialize');}
 for(const record of records){const recovered=await call('image_result',{request_id:record.final_review.request_id},true);assert.deepEqual(recovered.site_continuation,record.final_review.site_continuation);if(followupMode){const reopened=prepareFollowup(record.final_review.request_id);assert.equal(reopened.status,'completed');assert.equal(reopened.data.next_tool_call,null);assert.equal(reopened.data.phase,record.final_review.site_continuation.status);}}
 assert.deepEqual(snapshot(),before,'Reopen is read-only');
 const objects=readdirSync(path.join(workspace,'objects')).map(id=>JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')));
 assert.equal(objects.filter(r=>['fft','gpa','column_fit'].includes(r.kind)).length,0);
 const result={status:'PASS',entry:mcpMode?'MCP':'CLI tool/query',decision_actor:'scripted_test_harness',
  verification_layers:{deterministic_suggestions:'PASS',executable_existing_tool_continuation:'PASS',real_AI_autonomous_decision:'NOT_TESTED'},
  saved_reopen:'PASS',original_evidence_unchanged:true,read_only_followup:followupMode?'PASS':'NOT_TESTED',records,physical_validation:'NOT_TESTED',gui_gestures:'NOT_TESTED'};
 writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log('PASS: '+result.entry+' -> saved review -> exact existing profile -> linked review/stop -> export/reopen; scripted choice only.');
}catch(error){writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:String(error),stack:error.stack},null,2)+'\n',{flag:'wx'});throw error;}
finally{if(client)await client.close();}
