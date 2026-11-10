// Local deterministic protocol peer, NOT Codex and NOT model output.
import {createInterface} from 'node:readline';
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
type Row=Record<string,unknown>;
export function runSyntheticAppServer(args:readonly string[]){
 if(!args.includes('app-server'))throw new Error('Synthetic peer expects the adapter app-server argument');
 const scenario=args.find(a=>a.startsWith('--case='))?.slice(7)??'normal';
 const lines=createInterface({input:process.stdin}),timers=new Set<ReturnType<typeof setTimeout>>();
 const send=(message:unknown)=>process.stdout.write(JSON.stringify(message)+'\n');
 const later=(fn:()=>void,ms=5)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);};
 const threadId='synthetic-thread-1';let initialized=false,turn=0,lastTurnRequest:unknown;
 const completed=(turnId:string,status:string)=>send({method:'turn/completed',params:{threadId,turn:{id:turnId,status,items:[],error:null}}});
 const finalMessage=(turnId:string,itemId:string,text:string,phase?:string|null)=>send({method:'item/completed',params:{threadId,turnId,item:{type:'agentMessage',id:itemId,text,...(phase===undefined?{}:{phase})}}});
 lines.on('line',line=>{
  const message=JSON.parse(line) as Row,params=(message.params??{}) as Row;
  const response=(result:unknown)=>send({id:message.id,result});
  if(message.method==='initialize'){
   if(scenario==='hang')return;
   if(scenario==='invalid'){process.stdout.write('not-json\n');return;}
   if(scenario==='invalid-error'){send({id:message.id,error:'invalid error envelope'});return;}
   const result={userAgent:'synthetic-host-no-model',platformFamily:'synthetic',platformOs:'synthetic'};response(result);if(scenario==='duplicate')response(result);return;
  }
  if(message.method==='initialized'){initialized=true;return;}
  if(!initialized){send({id:message.id,error:{code:-32600,message:'Not initialized'}});return;}
  if(message.method==='thread/start'||message.method==='thread/resume'){
   response({thread:{id:scenario==='wrong-thread'&&message.method==='thread/resume'?'synthetic-wrong-thread':threadId}});
   send({method:'thread/started',params:{thread:{id:threadId}}});return;
  }
  if(message.method==='turn/start'){
   if(scenario==='rpc-error'){send({id:message.id,error:{code:-32000,message:'Synthetic explicit rejection'}});return;}
   turn++;const turnId='synthetic-turn-'+turn;
   if(['early-text-bound','early-invalid-phase','early-multi-final'].includes(scenario)){
    if(scenario==='early-text-bound'){finalMessage(turnId,'early-a','x'.repeat(600000),'partial_answer');finalMessage(turnId,'early-b','y'.repeat(600000),'final_answer');}
    else if(scenario==='early-invalid-phase')finalMessage(turnId,'early-invalid','Invalid phase must not be accepted','invalid-phase');
    else for(const phase of ['commentary','partial_answer','final_answer'])finalMessage(turnId,'early-'+phase,'Synthetic '+phase,phase);
    response({turn:{id:turnId,status:'inProgress',items:[],error:null}});
    later(()=>{completed(turnId,'completed');if(scenario!=='early-multi-final'){lines.close();process.stdin.destroy();}},30);return;
   }
   if(scenario==='out-of-order')send({method:'turn/started',params:{threadId,turn:{id:turnId,status:'inProgress',items:[],error:null}}});
   if(scenario==='early-final')finalMessage(turnId,'early-item','Final before start reply','final_answer');
   response({turn:{id:turnId,status:'inProgress',items:[],error:null}});
   if(scenario==='early-final'){completed(turnId,'completed');return;}
   if(scenario==='message-count-bound'||scenario==='message-text-bound'){
    later(()=>{for(let n=0;n<(scenario==='message-count-bound'?65:2);n++)finalMessage(turnId,'bounded-'+n,scenario==='message-count-bound'?'':'x'.repeat(600000));completed(turnId,'completed');},10);return;
   }
   if(scenario==='final-items'||scenario==='conflicting-final'){
    if(turn>1)finalMessage('synthetic-turn-1','message-a','STALE WRONG TEXT','final_answer');
    send({method:'item/completed',params:{threadId:'wrong-thread',turnId,item:{type:'agentMessage',id:'message-a',text:'WRONG THREAD'}}});
    send({method:'item/completed',params:{threadId,turnId:'wrong-turn',turn:{id:turnId},item:{type:'agentMessage',id:'message-a',text:'WRONG TURN SHADOW'}}});
    send({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'message-a',delta:'Partial'}});
    send({method:'item/started',params:{threadId,turnId,item:{type:'agentMessage',id:'message-b',text:''}}});
    finalMessage(turnId,'message-a','Authoritative final','final_answer');
    finalMessage(turnId,'message-a','Authoritative final','final_answer');
    send({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'message-a',delta:'LATE BEFORE TERMINAL'}});
    if(scenario==='conflicting-final'){completed(turnId,'completed');finalMessage(turnId,'message-a','CONFLICTING final','final_answer');completed(turnId,'completed');return;}
    // Turn terminal can arrive before an item's final notification in this negative peer.
    completed(turnId,'completed');
    send({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'message-a',delta:'LATE DELTA'}});
    finalMessage(turnId,'message-b','No delta final',null);return;
   }
   if(scenario==='unfinished-item'){
    send({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'unfinished',delta:'Only a preview'}});completed(turnId,'completed');return;
   }
   if(scenario==='late'&&turn>1){completed('synthetic-turn-1','completed');send({method:'item/agentMessage/delta',params:{threadId,turnId:'synthetic-turn-1',itemId:'old-item',delta:'OLD_SYNTHETIC_TEXT'}});if(lastTurnRequest)send(lastTurnRequest);}
   lastTurnRequest={id:message.id,result:{turn:{id:turnId,status:'inProgress',items:[],error:null}}};
   send({method:'turn/started',params:{threadId,turn:{id:turnId,status:'inProgress',items:[],error:null}}});
   if(scenario==='multi-item'){
    for(const [itemId,delta]of [['item-a','甲1'],['item-b','乙1'],['item-a','甲2'],['item-b','乙2']])send({method:'item/agentMessage/delta',params:{threadId,turnId,itemId,delta}});
    completed(turnId,'completed');return;
   }
   if(scenario==='many-frames'&&turn===1){
    for(let i=0;i<32;i++)send({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'large-item',delta:'x'.repeat(40000)}});
    completed(turnId,'completed');return;
   }
   send({method:'item/agentMessage/delta',params:{threadId,turnId,itemId:'synthetic-item-'+turn,delta:'合成宿主测试；这不是模型回答。'}});
   if(scenario==='tool'){send({id:'synthetic-tool',method:'item/tool/call',params:{threadId,turnId,callId:'synthetic-call',tool:'image_fft',arguments:{request_id:'synthetic-not-executed'}}});return;}
   if(turn===1&&scenario!=='flood'&&scenario!=='invalid-utf8'){finalMessage(turnId,'synthetic-item-'+turn,'合成完成项；这不是模型回答。','final_answer');completed(turnId,'completed');return;}
   send({id:'synthetic-approval-'+turn,method:'item/commandExecution/requestApproval',params:{threadId,turnId,itemId:'synthetic-command',command:'synthetic-command-not-executed',reason:'Synthetic approval boundary test'}});return;
  }
  if(message.method==='turn/interrupt'){
   if(scenario==='invalid-utf8'){
    const prefix=Buffer.from(JSON.stringify({method:'item/agentMessage/delta',params:{threadId,turnId:params.turnId,itemId:'invalid-item',delta:'MARKER'}}));
    const index=prefix.indexOf('MARKER');process.stdout.write(Buffer.concat([prefix.subarray(0,index),Buffer.from([0xc3,0x28]),prefix.subarray(index+6),Buffer.from('\n')]));
    response({});completed(String(params.turnId),'interrupted');return;
   }
   if(scenario==='flood'){
    // Deliberately invalid continuous frame; finite8MiB bounds the RED test.
    // Remain alive on stdin after writing so cleanup must be observed, not assumed.
    let blocks=128;const block=Buffer.alloc(65536,120),timer=setInterval(()=>{process.stdout.write(block);if(--blocks===0){clearInterval(timer);timers.delete(timer);}},1);timers.add(timer);return;
   }
   response({});if(scenario!=='late')later(()=>completed(String(params.turnId),'interrupted'),20);return;
  }
  if(message.error){completed('synthetic-turn-'+turn,'failed');return;}
  send({id:message.id,error:{code:-32601,message:'Synthetic method unsupported'}});
 });
 lines.on('close',()=>{for(const timer of timers)clearTimeout(timer);if(scenario==='delayed-close')setTimeout(()=>{},2500);});
}
if(isDirectInvocation(import.meta.url))runSyntheticAppServer(process.argv.slice(2));
