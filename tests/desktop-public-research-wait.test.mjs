// Offline synthetic protocol peers, plus bounded public-provider setup/statistics.
// No official process, authentication store, loopback listener or Electron access.
import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';import {mkdtempSync,mkdirSync,writeFileSync,realpathSync} from 'node:fs';import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import {DesktopPublicResearch,PublicResearchRefused} from '../lib/desktop_public_research.mjs';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {PublicResearchUI} from '../ui/image-panel/public-research.mjs';
const python=process.env.MICROSCOPY_PYTHON,base=process.env.MICROSCOPY_WAIT_EVIDENCE_DIRECTORY??realpathSync.native(tmpdir());
const until=async(check)=>{const end=Date.now()+5000;while(!check()){assert.ok(Date.now()<end,'bounded offline wait');await new Promise(r=>setTimeout(r,5));}};
async function fixture(t,{interrupt='ack',holdStart=false,rpcMs=1000,waitMs=30}={}){
 const run=mkdtempSync(path.join(base,'wait-case-')),workspace=path.join(run,'workspace');mkdirSync(workspace);const source=path.join(run,'public.tiff');
 assert.equal(spawnSync(python,['-B','-c',"import numpy as np,tifffile,sys; y,x=np.mgrid[:64,:64]; tifffile.imwrite(sys.argv[1],(np.where(x<32,100,300)+(y%2)*20).astype(np.uint16),metadata=None)",source]).status,0);
 const runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:workspace,MICROSCOPY_PYTHON:python,MICROSCOPY_PANEL:'0'}});
 const data=async(name,args)=>{const r=await runtime.registry.call(name,args);assert.ok(!r.isError);return JSON.parse(r.content.find(c=>c.type==='text').text);};
 const opened=await data('image_open',{source_path:source,request_id:'wait-open'}),frame=await data('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'wait-frame'}),view=await data('image_preview',{object_id:frame.object_id,request_id:'wait-preview'});runtime.close();
 const child=new EventEmitter(),received=[];child.stdout=new PassThrough();child.stderr=new PassThrough();let number=0,release;
 const send=m=>child.stdout.write(JSON.stringify(m)+'\n'),threadId='OFFLINE-thread',turnId=()=>`turn-${number}`;
 child.stdin=new Writable({write(bytes,_encoding,done){const m=JSON.parse(bytes.toString());received.push(m);setImmediate(()=>{
  if(m.method==='initialize')send({id:m.id,result:{}});
  if(m.method==='account/read')send({id:m.id,result:{account:{type:'chatgpt'},requiresOpenaiAuth:true}});
  if(m.method==='thread/start')send({id:m.id,result:{thread:{id:threadId},model:'SYNTHETIC_PEER_NOT_MODEL'}});
  if(m.method==='turn/start'){number++;const result={id:m.id,result:{turn:{id:turnId()}}};if(holdStart)release=()=>send(result);else send(result);}
  if(m.method==='turn/interrupt'){if(interrupt==='reject')send({id:m.id,error:{code:-32602,message:'PRIVATE_DIAGNOSTIC_SENTINEL'}});else if(interrupt==='ack')send({id:m.id,result:{}});}
 });done();}});child.stdin.once('finish',()=>setImmediate(()=>child.emit('close',0,null)));
 const service=new DesktopPublicResearch(run,workspace,python,frame.object_id,view.object_id,{executable:process.execPath,spawnProcess:()=>child,verification:'synthetic',timeoutMs:rpcMs},waitMs);
 t.after(async()=>{await service.close();});
 const question=(i=1)=>({id:`ui-${String(i).padStart(8,'0')}-1111-1111-1111-111111111111`,question:'Public synthetic statistics only',approved:true,context_sha256:service.snapshot().context_sha256});
 const complete=(state='completed',id=turnId())=>send({method:'turn/completed',params:{threadId,turn:{id,status:state}}});
 const answer=(text='Exact late answer',id=turnId(),item='answer-'+id)=>send({method:'item/completed',params:{threadId,turnId:id,item:{id:item,type:'agentMessage',phase:'final_answer',text}}});
 const tool=(call='after-wait')=>send({id:'rpc-'+call,method:'item/tool/call',params:{threadId,turnId:turnId(),callId:call,tool:'image_statistics',arguments:{object_id:view.object_id}}});
 const count=method=>received.filter(m=>m.method===method).length;
 const receipt=name=>writeFileSync(path.join(run,name+'.json'),JSON.stringify({snapshot:service.snapshot(),turn_starts:count('turn/start'),interrupts:count('turn/interrupt'),science_writes:service.snapshot().tool_calls.filter(c=>c.phase==='before_dispatch').length},null,2)+'\n');
 return {run,service,question,received,count,complete,answer,tool,receipt,release:()=>release?.(),hasRelease:()=>!!release};
}
test('wait expiry retains original controls and late completion/answer; later turns stay separate',{skip:!python},async t=>{
 const f=await fixture(t);f.service.submit(f.question());await until(()=>f.service.snapshot().operations[0].wait_expired);
 let s=f.service.snapshot();assert.equal(s.active,true);assert.equal(s.status,'unknown');assert.equal(s.host.turn_state,'running');assert.equal(s.can_interrupt,true);assert.equal(s.operations[0].turn_id,'turn-1');
 f.service.submit(f.question());assert.throws(()=>f.service.submit(f.question(2)),PublicResearchRefused);for(let i=0;i<3;i++)f.service.snapshot();assert.equal(f.count('turn/start'),1);f.receipt('wait-expired');
 f.tool();await until(()=>f.service.snapshot().tool_calls.some(c=>c.phase==='completed'));f.tool();await until(()=>f.received.filter(m=>m.id==='rpc-after-wait'&&m.result).length>=1);assert.equal(f.service.snapshot().tool_calls.filter(c=>c.phase==='before_dispatch').length,1);
 f.complete();await until(()=>!f.service.snapshot().active);assert.equal(f.service.snapshot().operations[0].messages.length,0);f.answer();await until(()=>f.service.snapshot().operations[0].messages.length===1);assert.equal(f.service.snapshot().status,'completed');assert.equal(f.service.snapshot().operations[0].messages[0].text,'Exact late answer');f.receipt('late-answer');
 f.service.submit(f.question(2));await until(()=>f.service.snapshot().operations[1].turn_id==='turn-2');f.answer('STALE_OTHER_TURN','turn-1','old-late');f.answer('Second exact answer');f.complete();await until(()=>!f.service.snapshot().active);s=f.service.snapshot();assert.deepEqual(s.operations.map(o=>o.messages.map(m=>m.text)),[['Exact late answer'],['Second exact answer']]);assert.equal(f.count('turn/start'),2);f.receipt('separate-turns');
});
test('wait expiry allows one original interrupt; ack alone does not end the task',{skip:!python},async t=>{
 const f=await fixture(t);f.service.submit(f.question());await until(()=>f.service.snapshot().operations[0].wait_expired);await f.service.interrupt();await f.service.interrupt();let s=f.service.snapshot();assert.equal(f.count('turn/interrupt'),1);assert.equal(s.active,true);assert.equal(s.can_interrupt,false);assert.notEqual(s.status,'interrupted');assert.throws(()=>f.service.submit(f.question(2)));f.receipt('interrupt-ack-not-terminal');
 f.complete('interrupted');await until(()=>!f.service.snapshot().active);s=f.service.snapshot();assert.equal(s.status,'interrupted');assert.equal(s.operations[0].turn_id,'turn-1');assert.equal(f.count('turn/start'),1);f.receipt('confirmed-interrupted');
});
test('a new question failing before turn binding never inherits the previous answer',{skip:!python},async t=>{
 const f=await fixture(t,{waitMs:1000});f.service.submit(f.question());await until(()=>f.service.snapshot().operations[0].turn_id);f.answer('Original answer only');f.complete();await until(()=>!f.service.snapshot().active);
 // A controlled fixture collision, not a permission/configuration change.
 mkdirSync(path.join(f.run,f.question(2).id+'-send-plan.json'));f.service.submit(f.question(2));await until(()=>!f.service.snapshot().active);const s=f.service.snapshot();assert.equal(s.operations[1].state,'failed');assert.deepEqual(s.operations[1].messages,[]);assert.equal(s.operations[0].messages[0].text,'Original answer only');assert.equal(f.count('turn/start'),1);f.receipt('unbound-error-no-old-answer');
});
for(const interrupt of ['reject','hang'])test(`expired original interrupt ${interrupt} stays unknown and is not resent`,{skip:!python},async t=>{
 const f=await fixture(t,{interrupt,rpcMs:100});f.service.submit(f.question());await until(()=>f.service.snapshot().operations[0].wait_expired);await f.service.interrupt();await f.service.interrupt();f.tool('after-rejected-interrupt');f.answer('UNTRUSTED_LATE_ANSWER');f.complete();await new Promise(r=>setTimeout(r,10));
 const s=f.service.snapshot();assert.equal(s.active,true);assert.equal(s.status,'unknown');assert.equal(s.can_interrupt,false);assert.equal(s.host.connection,'failed');assert.equal(s.operations[0].messages.length,0);assert.equal(f.count('turn/start'),1);assert.equal(f.count('turn/interrupt'),1);assert.equal(s.tool_calls.filter(c=>c.phase==='before_dispatch').length,0);assert.throws(()=>f.service.submit(f.question(2)));assert.ok(!JSON.stringify(s).includes('PRIVATE_DIAGNOSTIC_SENTINEL'));f.receipt(interrupt+'-unknown');
});
test('stop during late original turn identity queues exactly one interrupt',{skip:!python},async t=>{
 const f=await fixture(t,{holdStart:true});f.service.submit(f.question());await until(f.hasRelease);assert.equal(f.service.snapshot().can_interrupt,true);await f.service.interrupt();assert.equal(f.count('turn/interrupt'),0);assert.equal(f.service.snapshot().active,true);f.release();await until(()=>f.count('turn/interrupt')===1);assert.equal(f.service.snapshot().active,true);f.complete('interrupted');await until(()=>!f.service.snapshot().active);assert.equal(f.service.snapshot().status,'interrupted');assert.equal(f.count('turn/start'),1);f.receipt('late-id-original-interrupt');
});
test('unknown turn-start outcome does not adopt a retired late RPC or start another turn',{skip:!python},async t=>{
 const f=await fixture(t,{holdStart:true,rpcMs:80});f.service.submit(f.question());await until(()=>f.service.snapshot().status==='unknown');assert.equal(f.service.snapshot().active,true);assert.equal(f.service.snapshot().can_interrupt,false);f.release();await new Promise(r=>setTimeout(r,10));assert.equal(f.service.snapshot().operations[0].turn_id,undefined);await f.service.interrupt();assert.equal(f.count('turn/interrupt'),0);assert.throws(()=>f.service.submit(f.question(2)));assert.equal(f.count('turn/start'),1);f.receipt('unknown-start-no-replay');
});
test('ninth question is an exact not-dispatched quota receipt, not an unknown model send',{skip:!python},async t=>{
 const f=await fixture(t,{waitMs:1000});for(let i=1;i<=8;i++){f.service.submit(f.question(i));await until(()=>f.service.snapshot().operations[i-1].turn_id);f.complete();await until(()=>!f.service.snapshot().active);}
 assert.throws(()=>f.service.submit(f.question(9)),error=>{assert.ok(error instanceof PublicResearchRefused);assert.deepEqual(error.receipt(),{id:f.question(9).id,code:'QUESTION_LIMIT',disposition:'not_dispatched'});return true;});assert.equal(f.count('turn/start'),8);assert.equal(f.service.snapshot().status,'completed');assert.equal(f.service.snapshot().operations.length,8);f.receipt('ninth-refused-zero-dispatch');
});
test('renderer keeps timeout controls and distinguishes quota receipt from ambiguous sending',async()=>{
 const elements=new Map(),element=()=>({textContent:'',value:'',checked:false,disabled:false,hidden:false,children:[],dataset:{},open:false,append(...v){this.children.push(...v);},replaceChildren(){this.children=[];}}),document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};let posts=0,gets=0;
 let packet={enabled:true,status:'unknown',active:true,can_interrupt:true,host:{turn_state:'running'},operations:[{id:'original',state:'unknown',messages:[]}],tool_calls:[]};
 const ui=new PublicResearchUI(document,async(_url,body)=>{if(!body){gets++;return packet;}posts++;return {...packet,operations:Array.from({length:8},(_,i)=>({id:String(i),state:'completed',messages:[]})),public_research_refusal:{id:body.id,code:'QUESTION_LIMIT',disposition:'not_dispatched'}};},async()=>{});await ui.poll();assert.equal(elements.get('public-research-interrupt').disabled,false);assert.equal(elements.get('public-research-send').disabled,true);elements.get('public-research-query').onclick();await new Promise(r=>setImmediate(r));assert.equal(gets,2);assert.equal(posts,0);
 packet={...packet,can_interrupt:false,session_stopped:true,host:{connection:'failed',turn_state:'unknown'}};await ui.poll();assert.equal(elements.get('public-research-interrupt').disabled,true);assert.match(elements.get('public-research-status').textContent,/控制不可用.*结果未知/);
 packet={...packet,status:'completed',active:false,can_interrupt:false,session_stopped:false};await ui.poll();document.getElementById('public-research-question').value='Retained ninth question';document.getElementById('public-research-approved').checked=true;elements.get('public-research-send').onclick();await new Promise(r=>setImmediate(r));assert.equal(posts,1);assert.match(elements.get('public-research-status').textContent,/8 问上限.*未派发/);assert.ok(!elements.get('public-research-status').textContent.includes('发送未确认'));assert.equal(elements.get('public-research-question').value,'Retained ninth question');assert.equal(elements.get('public-research-send').disabled,true);
});
