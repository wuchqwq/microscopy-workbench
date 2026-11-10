// Opt-in, one public synthetic lifecycle qualification. No kill or lock cleanup.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {ImageWorkspace} from '../lib/image_workspace.mjs';
import {runCli,cliError,CLI_EXIT} from '../lib/workbench_cli.mjs';

test('normal real worker close releases its own claim; original child and budget continue in the same root',async t=>{
 const directory=process.env.MICROSCOPY_METHOD_CLOSE_EVIDENCE,python=process.env.MICROSCOPY_PYTHON;
 if(!directory||!python){t.skip('Explicit isolated evidence directory and existing Python required');return;}
 assert.ok(path.isAbsolute(directory)&&path.isAbsolute(python));
 const workspace=path.join(directory,'synthetic-workspace'),fixture=fileURLToPath(new URL('./fixtures/method_normal_close_worker.py',import.meta.url));
 const entry=fileURLToPath(new URL('../tools/workbench_cli.mjs',import.meta.url));
 assert.equal(existsSync(workspace),false,'Never rerun writes against a previous execution');
 mkdirSync(workspace,{recursive:true});
 const write=(name,value)=>writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n');
 const json=file=>JSON.parse(readFileSync(file,'utf8'));
 const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
 const claimPath=path.join(workspace,'provider-execution.lock');
 const digest=dir=>Object.fromEntries(readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{
  const file=path.join(dir,e.name);return e.isDirectory()?Object.entries(digest(file)):[[path.relative(workspace,file),sha(file)]];}));
 const executions=[];
 function processCall(label,executable,argv,expected){
  const result=spawnSync(executable,argv,{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
  writeFileSync(path.join(directory,label+'.stdout.txt'),result.stdout??'');
  writeFileSync(path.join(directory,label+'.stderr.txt'),result.stderr??'');
  executions.push({label,executable,argv,exit_code:result.status,signal:result.signal,error:result.error?.message??null});write('executions.json',executions);
  assert.equal(result.error,undefined,label);assert.equal(result.status,expected,label+': '+result.stdout+' '+result.stderr);assert.equal(result.signal,null);
  return JSON.parse(result.stdout);
 }
 const source=path.join(directory,'public-contrast-vortex.tiff');
 const oracle=processCall('01-prepare',python,['-B',fixture,'--prepare',source],0);write('oracle.json',oracle);assert.equal(sha(source),oracle.sha256);
 function tool(label,name,input,expected=0){const file=path.join(directory,label+'.input.json');write(label+'.input.json',input);
  return processCall(label,process.execPath,[entry,'tool','--workspace',workspace,'--python',python,'--name',name,'--input',file],expected);}
 function query(label,id,expected){return processCall(label,process.execPath,[entry,'query','--workspace',workspace,'--python',python,'--request-id',id],expected);}
 const opened=tool('02-open','image_open',{source_path:source,source_kind:'tiff',request_id:'normal-close-open'});
 const frame=tool('03-frame','image_frame',{object_id:opened.data.object_id,frame_index:0,request_id:'normal-close-frame'});
 const fft=tool('04-fft','image_fft',{object_id:frame.data.object_id,rect:[0,0,256,256],window:'none',subtract_mean:true,request_id:'normal-close-fft'});
 const seed=tool('05-seed','image_gpa',{object_id:fft.data.object_id,g_vectors:oracle.g.slice(0,2),mask_sigma:oracle.mask_sigma,
  reference_rect:oracle.reference_rect,reference_mode:'fixed_g',reference_text:'Prescribed synthetic phase gauge; not strain-free material evidence.',
  source_domain:'real_space_lattice',source_domain_text:'Public analytic contrast-only vortex; no true material displacement.',max_size:256,request_id:'normal-close-seed'});
 const budget={method_calls:2,fft_pixels:0,gpa_band_pixels:131072,topology_path_samples:10000};
 const plan=tool('06-plan','image_method_plan',{object_ids:[seed.data.object_id],budget,information:{goal:'projected_topology',
  followup_g_vectors:[oracle.g[0],oracle.g[2]],followup_basis:'Third carrier explicitly prescribed by the public generator; not independent material evidence.',
  loops:oracle.loops,model_assumption_text:'Conditional image-phase exploration only. Contrast topology does not confirm a material dislocation.'},request_id:'normal-close-plan'});
 const action=plan.data.actions.find(a=>a.kind==='gpa');assert.ok(action,'Use a real saved executable action');
 const rootId=plan.data.root_plan_id,parentId=plan.data.next_request_id;
 const step={object_id:plan.data.object_id,root_plan_id:rootId,action_id:action.action_id,
  selection_reason:'Qualification selects the original saved action once; controlled omission of parent finalization after real child commit.',request_id:parentId};
 write('07-step.input.json',step);
 const lifecycle=[];const event=(kind,value={})=>{lifecycle.push({sequence:lifecycle.length+1,kind,time_utc:new Date().toISOString(),...value});write('worker-lifecycle.json',lifecycle);};
 function observedSpawn(executable,argv,options){
  assert.equal(executable,python);assert.equal(argv[1],fixture);
  const claim=json(claimPath);assert.equal(claim.request_id,parentId);assert.equal(claim.pid,process.pid);
  event('claim_owned_before_real_spawn',{claim,executable,argv});
  const child=spawn(executable,argv,options);let stdout='',stderr='';
  child.once('spawn',()=>event('real_python_spawn',{pid:child.pid}));
  child.stdout.on('data',chunk=>{stdout+=chunk.toString();});child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
  child.once('error',error=>event('spawn_error',{message:error.message,code:error.code}));
  child.once('exit',(code,signal)=>event('real_python_exit',{code,signal,claim_still_present:existsSync(claimPath)}));
  // Registered before the product's close handler. It does not release anything.
  child.once('close',(code,signal)=>{writeFileSync(path.join(directory,'07-worker.stdout.json'),stdout);writeFileSync(path.join(directory,'07-worker.stderr.txt'),stderr);
   event('real_python_close_before_product_handler',{code,signal,claim_still_present:existsSync(claimPath)});});
  return child;
 }
 const provider=new ImageWorkspace({workspace,python,workerPath:fixture,spawnProcess:observedSpawn,timeoutMs:600000});
 try{
  await assert.rejects(runCli({command:'tool',workspace,python,name:'image_method_step',input:path.join(directory,'07-step.input.json')},{provider}),error=>{
   const envelope=cliError('tool',error,parentId);write('07-call-error.json',envelope);assert.equal(envelope.status,'outcome_unknown');assert.equal(CLI_EXIT[envelope.status],5);assert.equal(envelope.request_id,parentId);return true;});
  await provider.queue;
  event('product_worker_drained',{claim_present:existsSync(claimPath),metadata_gate_present:existsSync(path.join(workspace,'workspace-metadata.lock'))});
 }finally{provider.close();}
 assert.equal(lifecycle.filter(e=>e.kind==='real_python_spawn').length,1);
 assert.equal(lifecycle.some(e=>e.kind==='spawn_error'),false);
 for(const kind of ['real_python_exit','real_python_close_before_product_handler']){
  const record=lifecycle.find(e=>e.kind===kind);assert.ok(record);assert.equal(record.code,1);assert.equal(record.signal,null);assert.equal(record.claim_still_present,true);}
 assert.equal(existsSync(claimPath),false,'Only the product close handler released its own original claim');
 assert.equal(existsSync(path.join(workspace,'workspace-metadata.lock')),false);
 const beforeCloseReply=json(path.join(directory,'07-worker.stdout.json'));
 assert.equal(beforeCloseReply.state,'unknown');assert.equal(beforeCloseReply.partial_results.claim.matches_parent,true);
 assert.equal(beforeCloseReply.partial_results.children[0].state,'completed');
 const childId=beforeCloseReply.partial_results.children[0].request_id;
 const childObjectId=beforeCloseReply.partial_results.children[0].object_id;
 const audit=JSON.parse(readFileSync(path.join(directory,'07-worker.stderr.txt'),'utf8').trim());assert.equal(audit.child_dispatch_calls,1);assert.equal(audit.child_request_id,childId);
 const parentFile=path.join(workspace,'requests',parentId+'.json'),parentHash=sha(parentFile),parent=json(parentFile);
 assert.equal(parent.state,'prepared');assert.equal(parent.method_attempt.phase,'dispatching');assert.deepEqual(parent.method_attempt.reserved_cost,action.cost);
 const childFile=path.join(workspace,'requests',childId+'.json'),childHash=sha(childFile),child=json(childFile);
 assert.equal(child.state,'completed');assert.equal(child.parameters.request_id,childId);assert.equal(child.response.object_id,childObjectId);
 const beforeQueries=digest(workspace);write('before-query-hashes.json',beforeQueries);
 const queried=query('08-parent-query',parentId,5);assert.equal(queried.data.state,'unknown');assert.equal(queried.data.partial_results.claim.state,'absent');
 assert.equal(queried.data.partial_results.children[0].request_id,childId);assert.deepEqual(queried.data.partial_results.reserved_cost,action.cost);
 const childRead=query('09-child-query',childId,0);assert.equal(childRead.data.request_id,childId);assert.equal(childRead.data.object_id,childObjectId);assert.equal(childRead.data.kind,'gpa');
 tool('10-parent-repeat-query-only','image_method_step',step,5);
 assert.deepEqual(digest(workspace),beforeQueries);write('after-query-hashes.json',digest(workspace));
 const next=tool('11-same-root-next','image_method_next',{object_id:plan.data.object_id,request_id:'normal-close-next'});
 assert.equal(next.data.root_plan_id,rootId);assert.deepEqual(next.data.budget,budget);
 assert.equal(next.data.ledger.attempts.length,1);const row=next.data.ledger.attempts[0];assert.equal(row.request_id,parentId);
 assert.equal(row.state,'unknown');assert.equal(row.effective_state,'completed');assert.equal(row.observed_child_receipt.request_id,childId);
 assert.deepEqual(row.reserved_cost,action.cost);assert.deepEqual(next.data.ledger.spent,action.cost);
 assert.deepEqual(next.data.ledger.remaining,{method_calls:1,fft_pixels:0,gpa_band_pixels:0,topology_path_samples:10000});
 assert.equal(next.data.ledger.has_unknown,false);assert.equal(next.data.actions[0].kind,'topology');assert.equal(next.data.next_request_id,`method-${rootId}-2`);
 query('12-parent-still-unknown',parentId,5);
 for(const [file,hash] of Object.entries(beforeQueries))assert.equal(sha(path.join(workspace,file)),hash,'Existing data/history changed: '+file);
 assert.equal(sha(parentFile),parentHash);assert.equal(sha(childFile),childHash);assert.equal(sha(source),oracle.sha256);
 const objects=readdirSync(path.join(workspace,'objects')).map(id=>path.join(workspace,'objects',id,'object.json')).filter(existsSync).map(json);
 assert.equal(objects.filter(o=>o.kind==='gpa').length,2);assert.equal(objects.filter(o=>o.kind==='topology'||o.kind==='method_step').length,0);
 assert.equal(existsSync(claimPath),false);
 write('summary.json',{parent_request_id:parentId,child_request_id:childId,child_object_id:childObjectId,root_plan_id:rootId,next_object_id:next.data.object_id,
  parent_state:'prepared',parent_sha256:parentHash,child_sha256:childHash,source_sha256:oracle.sha256,reserved_cost:action.cost,
  next_spent:next.data.ledger.spent,next_remaining:next.data.ledger.remaining,original_files_unchanged:Object.keys(beforeQueries).length,
  real_worker_close:true,normal_program_exit_code:1,signal:null,claim_released_by_product:true,child_dispatch_calls:1,
  controlled_parent_finalization_omission:true,hard_kill_tested:false,automatic_parent_reconciliation:false});
});
