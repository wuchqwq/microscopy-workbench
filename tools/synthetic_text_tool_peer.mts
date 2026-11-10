// Scripted protocol peer, never a model or scientific engine. Chooses a second
// local tool request from the returned first statistics for transport testing.
import {createInterface} from 'node:readline';
const send=(m:unknown)=>process.stdout.write(JSON.stringify(m)+'\n');
let turn=0,frame='',first:Record<string,unknown>|null=null;
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{}});
 if(m.method==='thread/start'){frame=m.params.dynamicTools.find((d:{name:string})=>d.name==='image_statistics').inputSchema.properties.object_id.enum[0];send({id:m.id,result:{thread:{id:'scripted-text-thread'},model:'SCRIPTED_NOT_CODEX'}});}
 const finish=(text:string)=>{send({method:'item/completed',params:{threadId:'scripted-text-thread',turnId:'scripted-turn-'+turn,item:{id:'scripted-final-'+turn,type:'agentMessage',phase:'final_answer',text}}});send({method:'turn/completed',params:{threadId:'scripted-text-thread',turn:{id:'scripted-turn-'+turn,status:'completed'}}});};
 const call=(id:string,args:unknown,tool='image_statistics')=>send({id,method:'item/tool/call',params:{threadId:'scripted-text-thread',turnId:'scripted-turn-'+turn,callId:id,tool,arguments:args}});
 if(m.method==='turn/start'){turn++;send({id:m.id,result:{turn:{id:'scripted-turn-'+turn}}});if(turn===1)call('scripted-call-1',{object_id:frame});else finish('SCRIPTED local continuation only: review the saved statistics and unresolved physical interpretation. Not a Codex answer.');}
 if(m.id==='scripted-call-1'&&m.result){first=JSON.parse(m.result.contentItems[0].text);const stats=first!.statistics as Record<string,number>;if(stats?.stddev>0)call('scripted-call-2',{object_id:frame,rect:[0,0,32,64]});else call('scripted-call-2',{request_id:first!.request_id},'image_result');}
 if(m.id==='scripted-call-2'&&m.result)finish('SCRIPTED peer consumed actual tool outputs: '+JSON.stringify({first,second:JSON.parse(m.result.contentItems[0].text)})+'. This verifies transport/provider flow, not autonomous model choice.');
});
