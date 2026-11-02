// Transport diagnostics + an opt-in actual stdio MCP delivery-fault fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,existsSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ImageWorkspace,ImageWorkerDiagnosticError} from '../lib/image_workspace.mjs';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';

for(const output of ['', '{"ok":'])test('incomplete worker response retains context: '+JSON.stringify(output),async()=>{
 const spawnProcess=()=>{const p=new EventEmitter();p.pid=123;p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.stdin=new EventEmitter();p.kill=()=>true;p.stdin.end=()=>queueMicrotask(()=>{p.stderr.emit('data',Buffer.from('controlled failure token=not-public'));if(output)p.stdout.emit('data',Buffer.from(output));p.emit('close',1);});return p;};
 const provider=new ImageWorkspace({workspace:path.resolve('analysis/diagnostic-only'),python:'never-executed',spawnProcess});
 const promise=provider.call('image_preview',{object_id:'a'.repeat(32),request_id:'transport-original'});
 await assert.rejects(promise,error=>{assert.ok(error instanceof ImageWorkerDiagnosticError);assert.equal(error.diagnostic.phase,'response_decode');assert.equal(error.diagnostic.preview_phase,'reserve');assert.equal(error.diagnostic.request_id,'transport-original');assert.equal(error.diagnostic.exit_code,1);assert.equal(error.diagnostic.stdout_bytes,Buffer.byteLength(output));assert.equal(error.diagnostic.submission_state,'outcome_unknown');assert.match(error.message,/transport-original/);assert.doesNotMatch(error.message,/not-public/);return true;});await promise.workerDone;provider.close();
});
test('a synchronous spawn failure is positively not submitted',async()=>{
 const provider=new ImageWorkspace({workspace:path.resolve('analysis/diagnostic-only'),spawnProcess(){throw Error('controlled before spawn');}});
 const promise=provider.call('image_preview',{object_id:'a'.repeat(32),request_id:'never-started'});
 await assert.rejects(promise,e=>e.diagnostic.submission_state==='not_submitted'&&e.diagnostic.request_id==='never-started');await promise.workerDone;provider.close();
});

test('first-party receiving client never acknowledges readonly evidence/probe/result reads',async()=>{
 const client=Object.create(StdioImageClient.prototype),calls=[];client.rpc=async(method,args)=>{calls.push({method,args});return{result:{content:[]}};};
 const data={object_id:'a'.repeat(32),preview_execution:{version:1,request_id:'original-view',object_id:'a'.repeat(32)}};
 for(const name of ['image_info','image_result','image_evidence','image_probe'])await client.acknowledgeDeliveredPreviews(name,data);
 assert.deepEqual(calls,[]);
});

const python=process.env.MICROSCOPY_PYTHON;
test('actual MCP: completed response lost, cross-client variants blocked, exact original recovers', {skip:!python},async()=>{
 const root=process.env.PREVIEW_RECOVERY_OUTPUT??mkdtempSync(path.join(tmpdir(),'preview-recovery-mcp-'));
 if(!existsSync(root))throw Error('PREVIEW_RECOVERY_OUTPUT must be an existing empty directory');
 const workspace=path.join(root,'workspace'),source=path.join(root,'public.tiff'),wrapper=path.join(root,'fault-python'),wire=path.join(root,'wire.jsonl');
 const fixture=spawnSync(python,['-c',"import numpy as np,tifffile,sys;tifffile.imwrite(sys.argv[1],(100+np.indices((48,48))[1]%8).astype('float32'),metadata=None)",source],{encoding:'utf8'});assert.equal(fixture.status,0,fixture.stderr);
 // Delivery is dropped only after the actual independent worker has exited.
 const proxy=`#!/usr/bin/env python3\nimport sys,subprocess,json,hashlib\nraw=sys.stdin.buffer.read()\nrequest=json.loads(raw)\np=subprocess.run([${JSON.stringify(python)},*sys.argv[1:]],input=raw,capture_output=True)\nwith open(${JSON.stringify(wire)},'a') as log:log.write(json.dumps({'request_id':request.get('request_id') or request.get('query_request_id'),'action':request.get('action'),'phase':request.get('_preview_phase'),'exit':p.returncode,'stdout_bytes':len(p.stdout),'stdout_sha256':hashlib.sha256(p.stdout).hexdigest()})+'\\n')\nsys.stderr.buffer.write(p.stderr)\nif not (request.get('request_id')=='fault-original' and request.get('_preview_phase')=='dispatch'):sys.stdout.buffer.write(p.stdout)\nsys.exit(p.returncode)\n`;
 writeFileSync(wrapper,proxy);chmodSync(wrapper,0o700);
 const calls=[],client=new StdioImageClient({workspace,python:wrapper}),make=()=>new StdioImageClient({workspace,python:wrapper});let second,panel;
 const call=async(c,name,args)=>{try{const reply=await c.tool(name,args);calls.push({name,args,result:reply.data});return reply;}catch(e){calls.push({name,args,error:e.message});throw e;}};
 try{
  const opened=(await call(client,'image_open',{source_path:source,request_id:'source'})).data;
  const frame=(await call(client,'image_frame',{object_id:opened.object_id,frame_index:0,request_id:'frame'})).data;
  await assert.rejects(call(client,'image_preview',{object_id:frame.object_id,max_size:512,request_id:'fault-original'}),/response_decode/);
  const journal=JSON.parse(readFileSync(path.join(workspace,'requests/fault-original.json'),'utf8'));assert.equal(journal.state,'completed');
  const immutable=new Map();for(const name of readdirSync(path.join(workspace,'requests')))immutable.set(name,createHash('sha256').update(readFileSync(path.join(workspace,'requests',name))).digest('hex'));
  const count=()=>readdirSync(path.join(workspace,'objects')).length,before=count();second=make();
  for(const size of [32,512,1024])await assert.rejects(call(second,'image_preview',{object_id:frame.object_id,max_size:size,request_id:'new-size-'+size}),/PREVIEW_OUTCOME_UNRESOLVED/);
  await assert.rejects(call(second,'image_panel_open',{object_id:frame.object_id,request_id:'panel-after-lost-response'}),/PREVIEW_REQUIRED/);
  assert.equal(count(),before);
  const recovered=(await call(second,'image_result',{request_id:'fault-original'})).data;const {ok:originalOk,...originalResponse}=journal.response;assert.equal(originalOk,true);assert.deepEqual(recovered,originalResponse);
  panel=await createImagePanel({workspace,python:wrapper,object_id:recovered.object_id});assert.equal(count(),before);await panel.close();panel=null;
  const next=(await call(second,'image_preview',{object_id:recovered.object_id,max_size:1024,request_id:'explicit-next'})).data;assert.notEqual(next.object_id,recovered.object_id);
  for(const [name,digest] of immutable)assert.equal(createHash('sha256').update(readFileSync(path.join(workspace,'requests',name))).digest('hex'),digest);
  const phases=readFileSync(wire,'utf8').trim().split('\n').map(JSON.parse);assert.equal(phases.filter(p=>p.phase==='dispatch'&&p.request_id==='fault-original').length,1);
  assert.equal(phases.filter(p=>p.phase==='dispatch'&&p.request_id?.startsWith('new-size-')).length,0);
  writeFileSync(path.join(root,'report.json'),JSON.stringify({result:'PASS',scope:'actual stdio MCP, controlled lost delivery, not a browser or historical r63 parse-cause proof',calls,wire:phases,original_view:recovered.object_id,next_view:next.object_id,source_sha256:createHash('sha256').update(readFileSync(source)).digest('hex')},null,2));
 }finally{await panel?.close();await client.close();await second?.close();}
});

test('actual MCP: proven non-dispatch and prepared-journal power loss remain different', {skip:!python},async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'preview-prepared-mcp-')),workspace=path.join(root,'workspace'),source=path.join(root,'public.tiff'),wrapper=path.join(root,'fault-python'),crash=path.join(root,'prepared-crash.py'),wire=path.join(root,'wire.jsonl');
 const fixture=spawnSync(python,['-c',"import numpy as np,tifffile,sys;tifffile.imwrite(sys.argv[1],np.arange(1024,dtype='float32').reshape(32,32),metadata=None)",source],{encoding:'utf8'});assert.equal(fixture.status,0,fixture.stderr);
 writeFileSync(crash,`import sys,os,json,importlib.util\nfrom pathlib import Path\np=Path(sys.argv[-1]);sys.path.insert(0,str(p.parent))\nspec=importlib.util.spec_from_file_location('image_workspace',p);m=importlib.util.module_from_spec(spec);sys.modules['image_workspace']=m;spec.loader.exec_module(m)\noriginal=m.Workspace.action\ndef interrupted(self,action,*args):\n if action=='view':os._exit(73)\n return original(self,action,*args)\nm.Workspace.action=interrupted\nreply=m.execute(json.loads(sys.stdin.buffer.read()));print(json.dumps(reply))\n`);
 writeFileSync(wrapper,`#!/usr/bin/env python3\nimport sys,subprocess,json\nraw=sys.stdin.buffer.read();request=json.loads(raw)\nargs=[${JSON.stringify(python)},*sys.argv[1:]]\nif request.get('request_id')=='prepared-original' and request.get('_preview_phase')=='dispatch':args=[${JSON.stringify(python)},${JSON.stringify(crash)},sys.argv[-1]]\np=subprocess.run(args,input=raw,capture_output=True)\nwith open(${JSON.stringify(wire)},'a') as log:log.write(json.dumps({'action':request.get('action'),'phase':request.get('_preview_phase'),'request_id':request.get('request_id'),'exit':p.returncode})+'\\n')\nsys.stdout.buffer.write(p.stdout);sys.stderr.buffer.write(p.stderr);sys.exit(p.returncode)\n`);chmodSync(wrapper,0o700);
 const good=new StdioImageClient({workspace,python:wrapper}),missing=new StdioImageClient({workspace,python:path.join(root,'does-not-exist')}),calls=[];let restarted;
 const call=async(c,name,args)=>{try{const r=await c.tool(name,args);calls.push({name,args,result:r.data});return r.data;}catch(e){calls.push({name,args,error:e.message});throw e;}};
 try{
  const opened=await call(good,'image_open',{source_path:source,request_id:'source'}),frame=await call(good,'image_frame',{object_id:opened.object_id,frame_index:0,request_id:'frame'});
  const count=()=>readdirSync(path.join(workspace,'objects')).length,before=count();
  await assert.rejects(call(missing,'image_preview',{object_id:frame.object_id,request_id:'never-submitted'}),/not_submitted/);assert.equal(count(),before);assert.equal(existsSync(path.join(workspace,'preview-admission-v1/intents/never-submitted.json')),false);
  const ready=await call(good,'image_preview',{object_id:frame.object_id,request_id:'ready'});
  await assert.rejects(call(good,'image_preview',{object_id:ready.object_id,request_id:'prepared-original'}),/response_decode/);
  const original=path.join(workspace,'requests/prepared-original.json'),bytes=readFileSync(original);assert.equal(JSON.parse(bytes).state,'prepared');const preserved=count();
  restarted=new StdioImageClient({workspace,python:wrapper});
  await assert.rejects(call(restarted,'image_result',{request_id:'prepared-original'}),/INCOMPLETE_REQUEST/);
  await assert.rejects(call(restarted,'image_preview',{object_id:ready.object_id,request_id:'prepared-original'}),/INCOMPLETE_REQUEST/);
  for(const size of [32,1024])await assert.rejects(call(restarted,'image_preview',{object_id:frame.object_id,request_id:'replacement-'+size,max_size:size}),/PREVIEW_OUTCOME_UNRESOLVED/);
  await assert.rejects(call(restarted,'image_panel_open',{object_id:frame.object_id,request_id:'panel-after-unknown'}),/PREVIEW_REQUIRED/);
  await call(restarted,'image_info',{object_id:ready.object_id});assert.equal(count(),preserved);assert.deepEqual(readFileSync(original),bytes);
  const trace=readFileSync(wire,'utf8').trim().split('\n').map(JSON.parse);assert.equal(trace.filter(x=>x.phase==='dispatch'&&x.request_id==='prepared-original').length,1);assert.equal(trace.filter(x=>x.phase==='dispatch'&&x.request_id?.startsWith('replacement-')).length,0);
  writeFileSync(path.join(root,'report.json'),JSON.stringify({result:'PASS',scope:'actual MCP, exact controlled power loss after prepared fsync; not a general crash recovery claim',calls,trace,source_sha256:createHash('sha256').update(readFileSync(source)).digest('hex')},null,2));
  console.log('Prepared/non-dispatch formal MCP evidence: '+path.join(root,'report.json'));
 }finally{await good.close();await missing.close();await restarted?.close();}
});
