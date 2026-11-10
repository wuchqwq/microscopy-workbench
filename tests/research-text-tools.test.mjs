// Only the independent text-tool route is exercised. No image-gate review,
// model, credentials, scientific computation or external service here.
import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import {CodexStdioHost} from '../lib/codex_stdio_host.mjs';
import {createResearchTextTools} from '../lib/research_text_tools.mjs';
import {ImageWorkerDiagnosticError} from '../lib/image_workspace.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
const definition={name:'image_statistics',description:'Fixture text tool',inputSchema:{type:'object',properties:{},additionalProperties:false}};
function peer(t,call,{interrupt='completed',timeoutMs=5000}={}){const child=new EventEmitter(),received=[];child.stdout=new PassThrough();child.stderr=new PassThrough();
 const send=m=>child.stdout.write(JSON.stringify(m)+'\n');
 child.stdin=new Writable({write(b,_e,done){const m=JSON.parse(b.toString());received.push(m);queueMicrotask(()=>{
 if(m.method==='initialize')send({id:m.id,result:{}});
 if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'text-thread'}}});
 if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'text-turn'}}});}
 if(m.method==='turn/interrupt'){if(interrupt==='rejected')send({id:m.id,error:{code:-32602,message:'Scripted rejection'}});else if(interrupt==='completed'){send({id:m.id,result:{}});send({method:'turn/completed',params:{threadId:'text-thread',turn:{id:'text-turn',status:'interrupted'}}});}}
 });done();}});child.stdin.once('finish',()=>queueMicrotask(()=>child.emit('close',0,null)));
 const host=new CodexStdioHost({executable:process.execPath,spawnProcess:()=>child,timeoutMs,textTools:{port:{definitions:[definition],call}}});
 t.after(()=>host.close());return {host,received,send,request:(id='rpc-tool',params={})=>send({id,method:'item/tool/call',params:{threadId:'text-thread',turnId:'text-turn',callId:'original-call',tool:'image_statistics',arguments:{},...params}})};
}
async function start(p){await p.host.connect();await p.host.startSession({task_id:'text-tools-test',context_sha256:'a'.repeat(64)});await p.host.startTurn('Public text statistics question');}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('experimental callback returns only text in the same exact thread/turn',async t=>{
 const calls=[],p=peer(t,async c=>{calls.push(c);return {success:true,text:'{"mean":210,"request_id":"original"}'};});await start(p);p.request();await tick();
 assert.equal(calls.length,1);assert.equal(calls[0].threadId,'text-thread');assert.equal(calls[0].turnId,'text-turn');
 assert.deepEqual(p.received.find(m=>m.id==='rpc-tool').result,{success:true,contentItems:[{type:'inputText',text:'{"mean":210,"request_id":"original"}'}]});
 assert.equal(p.received.find(m=>m.method==='initialize').params.capabilities.experimentalApi,true);
 const s=p.received.find(m=>m.method==='thread/start').params;assert.equal(s.dynamicTools[0].type,'function');assert.equal(s.config.features.view_image,false);assert.equal(s.config.features.shell_tool,false);
});
test('duplicate request never re-executes callback; foreign or unknown tool never executes',async t=>{
 let calls=0;const p=peer(t,async()=>{calls++;return {success:true,text:'numeric text'};});await start(p);p.request();p.request();p.request('foreign',{threadId:'other'});p.request('unknown',{tool:'not_in_catalog'});await tick();assert.equal(calls,1);
});
test('interrupt aborts a pending callback and suppresses its late reply',async t=>{
 let finish,signal;const p=peer(t,(_c,s)=>{signal=s;return new Promise(resolve=>{finish=resolve;});});await start(p);p.request();await tick();await p.host.interrupt();assert.equal(signal.aborted,true);finish({success:true,text:'late result'});await tick();assert.equal(p.received.some(m=>m.id==='rpc-tool'),false);
});
test('rejected interrupt fences connection, refuses later tools and never repeats the interrupt',async t=>{
 let finish,signal,calls=0;const p=peer(t,(_c,s)=>{calls++;signal=s;return new Promise(resolve=>{finish=resolve;});},{interrupt:'rejected'}),warnings=[];p.host.subscribe(e=>{if(e.kind==='host_warning')warnings.push(e.reason);});
 await start(p);p.request();await tick();const first=p.host.interrupt(),duplicate=p.host.interrupt();assert.equal(first,duplicate);await assert.rejects(first,/rejected/);
 assert.equal(signal.aborted,true);assert.equal(p.host.snapshot().connection,'failed');assert.equal(p.host.snapshot().turn_state,'unknown');assert.ok(warnings.some(s=>s.includes('Interrupt RPC rejected')));
 p.request('later-valid',{callId:'later-call'});finish({success:true,text:'late original outcome'});await tick();assert.equal(calls,1);assert.equal(p.received.some(m=>m.id==='later-valid'||m.id==='rpc-tool'),false);
 assert.throws(()=>p.host.interrupt(),/not ready/);await assert.rejects(p.host.startTurn('Do not replay'),/not ready/);assert.equal(p.received.filter(m=>m.method==='turn/interrupt').length,1);assert.notEqual(p.host.snapshot().turn_state,'interrupted');
});
test('unknown interrupt outcome stays unknown and is never retried',async t=>{
 let calls=0;const p=peer(t,async()=>{calls++;return {success:true,text:'unused'};},{interrupt:'hang',timeoutMs:200});await start(p);await assert.rejects(p.host.interrupt(),/timed out/);
 assert.equal(p.host.snapshot().connection,'failed');assert.equal(p.host.snapshot().turn_state,'unknown');p.request('after-timeout');await tick();assert.equal(calls,0);assert.throws(()=>p.host.interrupt(),/not ready/);assert.equal(p.received.filter(m=>m.method==='turn/interrupt').length,1);
});
test('synchronous interrupt admission failure also fences already-aborted tools',async t=>{
 const p=peer(t,async()=>({success:true,text:'unused'}));await start(p);
 // The in-memory peer intentionally leaves these harmless status RPCs pending.
 const pending=Promise.allSettled(Array.from({length:16},()=>p.host.authenticationStatus()));await assert.rejects(p.host.interrupt(),/request bound/);assert.ok((await pending).every(r=>r.status==='rejected'));
 assert.equal(p.host.snapshot().connection,'failed');assert.equal(p.host.snapshot().turn_state,'unknown');assert.equal(p.received.filter(m=>m.method==='turn/interrupt').length,0);assert.throws(()=>p.host.interrupt(),/not ready/);
});
test('terminal event before queued callback prevents execution',async t=>{
 let calls=0;const p=peer(t,async()=>{calls++;return {success:true,text:'never'};});await start(p);p.request();p.send({method:'turn/completed',params:{threadId:'text-thread',turn:{id:'text-turn',status:'completed'}}});await tick();assert.equal(calls,0);assert.equal(p.received.some(m=>m.id==='rpc-tool'),false);
});
test('text-only mode refuses non-string inputs without consulting the image gate',async t=>{
 const p=peer(t,async()=>({success:true,text:'unused'}));await p.host.connect();await p.host.startSession({task_id:'text-test',context_sha256:'a'.repeat(64)});let reads=0;
 await assert.rejects(p.host.startTurn({get text(){reads++;return 'object';}}),/Text-tool mode/);assert.equal(reads,0);assert.equal(p.received.some(m=>m.method==='turn/start'),false);
 await p.host.startTurn('Normal primitive text');assert.deepEqual(p.received.find(m=>m.method==='turn/start').params.input,[{type:'text',text:'Normal primitive text'}]);
});
test('invalid projection fails visibly without forwarding arbitrary fields',async t=>{
 const p=peer(t,async()=>({success:true,text:null,unexpected:'do not forward'}));await start(p);p.request();await tick();const r=p.received.find(m=>m.id==='rpc-tool').result;assert.equal(r.success,false);assert.equal(JSON.stringify(r).includes('unexpected'),false);assert.equal(r.contentItems[0].type,'inputText');
});

function service(t,call,{withView=false}={}){
 const root=mkdtempSync(path.join(tmpdir(),'text-tools-')),workspace=path.join(root,'workspace'),audit=path.join(root,'audit'),frame='1'.repeat(32),hash=b=>createHash('sha256').update(b).digest('hex');t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const d of [workspace,audit,path.join(workspace,'objects'),path.join(workspace,'requests'),path.join(workspace,'objects',frame)])mkdirSync(d);
 const bytes=Buffer.from('public hashed unit metadata, not decoded NPY'),object={backend:'external-image-workspace',object_id:frame,kind:'frame',request_id:'fixture-frame',shape_yx:[1,1],dtype:'uint16',files_sha256:{'data.npy':hash(bytes)}},raw=JSON.stringify(object);
 writeFileSync(path.join(workspace,'objects',frame,'object.json'),raw);writeFileSync(path.join(workspace,'objects',frame,'data.npy'),bytes);writeFileSync(path.join(workspace,'requests','fixture-frame.json'),JSON.stringify({state:'completed',request_id:'fixture-frame',object_manifest_sha256:hash(raw),parameters:{workspace,request_id:'fixture-frame'},response:{ok:true,state:'completed',...object}}));
 const view='2'.repeat(32);if(withView){const png=Buffer.from('iVBORw0KGgo=','base64'),value={...object,object_id:view,request_id:'fixture-view',kind:'view',parent_object_id:frame,files_sha256:{...object.files_sha256,'preview.png':hash(png)},panels:[{domain:'spatial_pixels',source_object_id:frame,source_rect_xyxy:[0,0,1,1],image_rect_xyxy:[0,0,1,1]}],display:{gamma:1,display_range:[0,1]}},raw=JSON.stringify(value);mkdirSync(path.join(workspace,'objects',view));writeFileSync(path.join(workspace,'objects',view,'object.json'),raw);writeFileSync(path.join(workspace,'objects',view,'data.npy'),bytes);writeFileSync(path.join(workspace,'objects',view,'preview.png'),png);writeFileSync(path.join(workspace,'requests','fixture-view.json'),JSON.stringify({state:'completed',request_id:'fixture-view',object_manifest_sha256:hash(raw),parameters:{workspace,request_id:'fixture-view',action:'view',object_id:frame},response:{ok:true,state:'completed',...value}}));}
 const definition={name:'image_statistics',description:'existing fixture definition',inputSchema:{type:'object',properties:{object_id:{type:'string'},rect:{type:'array',items:{type:'integer'}}},required:['object_id'],additionalProperties:false}};
 const tools=createResearchTextTools({registry:{listTools:()=>[definition,{...definition,name:'image_result'}],call},workspace,frameId:frame,...(withView?{viewId:view}:{}),journalDirectory:audit});
 return {tools,frame,view,workspace,call:{threadId:'thread',turnId:'turn',callId:'call-1',tool:'image_statistics',arguments:{object_id:withView?view:frame}}};
}
test('duplicate scientific calls execute once; unknown original blocks replacement writes',async t=>{
 let calls=0,writes=0;const s=service(t,async name=>{calls++;if(name==='image_statistics')writes++;throw Error('PRIVATE_PROVIDER_DIAGNOSTIC');}),signal=new AbortController().signal;
 const a=s.tools.port.call(s.call,signal),b=s.tools.port.call(s.call,signal);assert.deepEqual(await a,await b);assert.equal(calls,2);assert.equal(writes,1);
 const original=JSON.parse((await a).text);assert.equal(original.status,'unverified_outcome');assert.match(original.request_id,/^text_tool_[a-f0-9]{32}$/);assert.equal((await a).text.includes('PRIVATE_PROVIDER'),false);
 const blocked=JSON.parse((await s.tools.port.call({...s.call,callId:'call-2'},signal)).text);assert.equal(blocked.status,'not_dispatched');assert.equal(blocked.original_request_id,original.request_id);assert.equal(calls,2);
 const conflict=await s.tools.port.call({...s.call,arguments:{object_id:s.frame,rect:[0,0,1,1]}},signal);assert.equal(conflict.success,false);assert.equal(calls,2);
 const queried=JSON.parse((await s.tools.port.call({...s.call,callId:'query-unknown',tool:'image_result',arguments:{request_id:original.request_id}},signal)).text);assert.equal(queried.status,'unverified_outcome');assert.equal(calls,3);
 const after=JSON.parse((await s.tools.port.call({...s.call,callId:'after-query',arguments:{object_id:s.frame,rect:[0,0,1,1]}},signal)).text);assert.equal(after.status,'not_dispatched');assert.equal(calls,3);assert.equal(writes,1);
});
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
function failedJournal(s,args,{mismatch=false,code='INVALID_ARGUMENT'}={}){
 const parameters={...args,action:'statistics',workspace:s.workspace,...(mismatch?{rect:[0,0,1,1]}:{})},response={ok:false,state:'failed',backend:'external-image-workspace',request_id:args.request_id,error:{code,message:'PRIVATE_DIAGNOSTIC /secret/path'}};
 const parameters_sha256=createHash('sha256').update(canonical(parameters)).digest('hex'),raw=JSON.stringify({schema_version:1,state:'failed',request_id:args.request_id,parameters,parameters_sha256,response});writeFileSync(path.join(s.workspace,'requests',args.request_id+'.json'),raw);
 return new ImageWorkerDiagnosticError('PRIVATE_QUERY_DIAGNOSTIC',{provider:'external-image-workspace',request_id:args.request_id,provider_reported_state:'failed',submission_state:'provider_reported_failure',original_failure:{schema_version:1,request_id:args.request_id,parameters,parameters_sha256,journal_sha256:createHash('sha256').update(raw).digest('hex'),error_code:code}});
}
test('verified failed original is terminal, queryable and permits a corrected new request',async t=>{
 let writes=0,queries=0,s,failure;const signal=new AbortController().signal;s=service(t,async(name,args)=>{if(name==='image_result'){queries++;throw failure??Error('PRIVATE_QUERY_DIAGNOSTIC');}writes++;failure=writes===1?failedJournal(s,args):undefined;throw Error('PRIVATE_PROVIDER_DIAGNOSTIC');});
 const invalid={...s.call,arguments:{object_id:s.frame,rect:[0,0,2,2]}},first=await s.tools.port.call(invalid,signal),failed=JSON.parse(first.text);assert.equal(first.success,false);assert.equal(failed.status,'failed');assert.equal(failed.error.code,'INVALID_ARGUMENT');assert.equal(first.text.includes('PRIVATE'),false);assert.equal(first.text.includes('/secret'),false);
 assert.deepEqual(await s.tools.port.call(invalid,signal),first);assert.equal(writes,1);
 const query=JSON.parse((await s.tools.port.call({...s.call,callId:'query-failed',tool:'image_result',arguments:{request_id:failed.request_id}},signal)).text);assert.equal(query.status,'failed');assert.equal(query.request_id,failed.request_id);assert.equal(queries,2);
 await s.tools.port.call({...s.call,callId:'corrected',arguments:{object_id:s.frame,rect:[0,0,1,1]}},signal);assert.equal(writes,2);
});
test('a failed journal for different parameters does not unlock an unknown request',async t=>{
 let writes=0,s,failure;s=service(t,async(name,args)=>{if(name==='image_result')throw failure;writes++;failure=failedJournal(s,args,{mismatch:true});throw Error('failure');});const signal=new AbortController().signal;
 const first=JSON.parse((await s.tools.port.call({...s.call,arguments:{object_id:s.frame,rect:[0,0,2,2]}},signal)).text);assert.equal(first.status,'unverified_outcome');
 assert.equal(JSON.parse((await s.tools.port.call({...s.call,callId:'corrected'},signal)).text).status,'not_dispatched');assert.equal(writes,1);
});
test('arbitrary provider error codes are projected to a fixed failure category',async t=>{
 let s,failure;s=service(t,async(name,args)=>{if(name==='image_result')throw failure;failure=failedJournal(s,args,{code:'PRIVATE_CODE /private/path'});throw Error('failure');});const reply=await s.tools.port.call(s.call,new AbortController().signal),value=JSON.parse(reply.text);assert.equal(value.status,'failed');assert.equal(value.error.code,'PROVIDER_FAILURE');assert.equal(reply.text.includes('PRIVATE'),false);assert.equal(reply.text.includes('/private'),false);
});
test('a locally readable failed journal without a live provider receipt stays unknown',async t=>{
 let s,writes=0;s=service(t,async(name,args)=>{if(name==='image_statistics'){writes++;failedJournal(s,args);}throw Error('No provider verification receipt');});const signal=new AbortController().signal;
 assert.equal(JSON.parse((await s.tools.port.call(s.call,signal)).text).status,'unverified_outcome');assert.equal(JSON.parse((await s.tools.port.call({...s.call,callId:'new'},signal)).text).status,'not_dispatched');assert.equal(writes,1);
});
test('only owned result queries are allowed and upstream content is never returned',async t=>{
 let calls=0;const s=service(t,async()=>{calls++;return {isError:true,content:[{type:'text',text:'PRIVATE_RAW_REPLY'},{type:'image',data:'DO_NOT_FORWARD'}]};}),signal=new AbortController().signal;
 const first=JSON.parse((await s.tools.port.call(s.call,signal)).text),query={...s.call,callId:'query',tool:'image_result',arguments:{request_id:first.request_id}};
 const result=await s.tools.port.call(query,signal);assert.equal(calls,3);assert.equal(result.text.includes('PRIVATE_RAW_REPLY'),false);assert.equal(result.text.includes('DO_NOT_FORWARD'),false);
 await s.tools.port.call({...query,callId:'foreign',arguments:{request_id:'unknown'}},signal);assert.equal(calls,3);
});
test('cancellation before submission and source change dispatch no provider request',async t=>{
 let calls=0;const s=service(t,async()=>{calls++;return {};});const abort=new AbortController();abort.abort();
 assert.equal(JSON.parse((await s.tools.port.call(s.call,abort.signal)).text).status,'not_dispatched');
 writeFileSync(path.join(s.workspace,'objects',s.frame,'data.npy'),'changed');
 assert.equal(JSON.parse((await s.tools.port.call({...s.call,callId:'new'},new AbortController().signal)).text).status,'not_dispatched');assert.equal(calls,0);
});

test('explicit desktop display is the durable statistics input; result recovery never replaces it with the raw frame',async t=>{
 let s,writes=0;const calls=[],hash=b=>createHash('sha256').update(b).digest('hex');
 s=service(t,async(name,args)=>{
  calls.push({name,args});if(name==='image_result')return {};
  writes++;assert.equal(args.object_id,s.view);const frame=JSON.parse(readFileSync(path.join(s.workspace,'objects',s.frame,'object.json'))),statistics={sample_count:1,mean:7,stddev:0,minimum:7,maximum:7},payload=JSON.stringify(statistics),id='3'.repeat(32),value={object_id:id,request_id:args.request_id,backend:'external-image-workspace',kind:'statistics',parent_object_id:s.view,coordinate_space:'source_pixels',source_rect_xyxy:[0,0,1,1],component:'raw',dtype:'uint16',scientific_grid_identity:{source_grid_object_id:s.frame,shape_yx:[1,1],dtype:'uint16',array_sha256:frame.files_sha256['data.npy'],source_rect_xyxy:[0,0,1,1],coordinate_space:'source_pixels'},statistics,files_sha256:{'statistics.json':hash(payload)}},raw=JSON.stringify(value);
  mkdirSync(path.join(s.workspace,'objects',id));writeFileSync(path.join(s.workspace,'objects',id,'object.json'),raw);writeFileSync(path.join(s.workspace,'objects',id,'statistics.json'),payload);writeFileSync(path.join(s.workspace,'requests',args.request_id+'.json'),JSON.stringify({state:'completed',request_id:args.request_id,object_manifest_sha256:hash(raw),parameters:{...args,action:'statistics',workspace:s.workspace},response:{ok:true,state:'completed',...value}}));return {content:[{type:'image',data:'NEVER_FORWARD_IMAGE'}]};
 },{withView:true});
 const signal=new AbortController().signal;assert.deepEqual(s.tools.port.definitions[0].inputSchema.properties.object_id.enum,[s.view]);
 const wrong=await s.tools.port.call({...s.call,callId:'wrong-frame',arguments:{object_id:s.frame}},signal);assert.equal(JSON.parse(wrong.text).status,'not_dispatched');assert.equal(calls.length,0);
 const reply=await s.tools.port.call(s.call,signal),value=JSON.parse(reply.text);assert.equal(reply.success,true);assert.equal(value.statistics.mean,7);assert.equal(value.frame_id,s.frame);assert.equal(value.input_manifest_sha256,hash(readFileSync(path.join(s.workspace,'objects',s.view,'object.json'))));assert.doesNotMatch(reply.text,/NEVER_FORWARD_IMAGE|preview.png|png_base64/);
 assert.deepEqual(await s.tools.port.call(s.call,signal),reply);const recovered=await s.tools.port.call({...s.call,callId:'query',tool:'image_result',arguments:{request_id:value.request_id}},signal);assert.deepEqual(JSON.parse(recovered.text),value);assert.equal(writes,1);
 const journal=JSON.parse(readFileSync(path.join(s.workspace,'requests',value.request_id+'.json')));assert.equal(journal.parameters.object_id,s.view);assert.equal(journal.response.parent_object_id,s.view);
});
test('changed configured display is refused before any new provider request',async t=>{
 let calls=0;const s=service(t,async()=>{calls++;return {};},{withView:true});writeFileSync(path.join(s.workspace,'objects',s.view,'preview.png'),'changed');
 const reply=await s.tools.port.call(s.call,new AbortController().signal);assert.equal(JSON.parse(reply.text).status,'not_dispatched');assert.equal(calls,0);
});
