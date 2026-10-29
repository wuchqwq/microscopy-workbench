// Shared transport contract scenarios. No Python, provider journal or process exit.
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const descriptor={name:'fixture',description:'Public transport fixture',inputSchema:{type:'object',properties:{},additionalProperties:false}};
const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const ok=(id,result)=>({jsonrpc:'2.0',id,result});

export async function exerciseStdioContract(startStdioMcpServer,RpcError){
 assert.throws(()=>startStdioMcpServer({runtime:{}}),{name:'TypeError',message:'MCP stdio facade requires an explicitly composed runtime'});
 const input=new PassThrough(),output=new PassThrough(),holds=new Map(),calls=[],exits=[];
 const sigintBefore=process.listenerCount('SIGINT');
 let wire='',closed=0,failList=false;
 output.setEncoding('utf8');output.on('data',chunk=>wire+=chunk);
 const runtime={instructions:'Public transport fixture instructions',registry:{
  listTools(){if(failList)throw {message:'fixture list exploded'};return [descriptor];},
  call(name,args,{signal}){
   calls.push({name,args});
   if(name==='hold'){const pending=deferred();holds.set(args.token,{...pending,signal});return pending.promise;}
   if(name==='rpc-error')throw new RpcError(-32042,'fixture RPC refusal');
   if(name==='ordinary-error')throw new Error('fixture ordinary failure');
   if(name==='message-object')throw {message:'legacy message property'};
   if(name==='numeric-message')throw {message:0};
   if(name==='raw-string')throw 'legacy string rejection';
   if(name==='null-rejection')throw null;
   if(name==='undefined-rejection')throw undefined;
   return {content:[{type:'text',text:JSON.stringify({name,args})}]};
  },
 },close(){closed++;}};
 const server=startStdioMcpServer({runtime,input,output,exit:code=>exits.push(code),serverName:'parity-fixture',serverVersion:'1'});
 const send=value=>input.write(JSON.stringify(value)+'\n');
 const call=(id,method,params)=>send({jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})});
 const messages=()=>wire.trim().split('\n').filter(Boolean).map(JSON.parse);
 const take=()=>messages().at(-1);
 try{
  call(1,'initialize');await turn();
  assert.deepEqual(take(),ok(1,{protocolVersion:'2024-11-05',capabilities:{tools:{listChanged:false}},serverInfo:{name:'parity-fixture',version:'1'},instructions:runtime.instructions}));
  for(const [id,method,result] of [['ping','ping',{}],['list','tools/list',{tools:[descriptor]}],['resources','resources/list',{resources:[]}],['prompts','prompts/list',{prompts:[]}]]){
   call(id,method);await turn();assert.deepEqual(take(),ok(id,result));
  }
  call('unknown','unrecognized/method');await turn();assert.deepEqual(take(),error('unknown',-32601,'Method not found: unrecognized/method'));
  for(const bad of [null,[],{jsonrpc:'1.0',id:2,method:'ping'},{jsonrpc:'2.0',id:null,method:'ping'},{jsonrpc:'2.0',id:true,method:'ping'},{jsonrpc:'2.0',id:1.5,method:'ping'},{jsonrpc:'2.0',id:Number.MAX_SAFE_INTEGER+1,method:'ping'},{jsonrpc:'2.0',id:3}]){
   send(bad);await turn();assert.deepEqual(take(),error(null,-32600,'Invalid Request'));
  }
  input.write('{\n');await turn();assert.deepEqual(take(),error(null,-32700,'Parse error'));
  const beforeNotification=messages().length;
  send({jsonrpc:'2.0',method:'notifications/initialized'});
  send({jsonrpc:'2.0',method:'ignored/notification',params:null});
  send({jsonrpc:'2.0',method:'notifications/cancelled',params:'legacy scalar notification'});
  input.write('  \n\t\n');await turn();assert.equal(messages().length,beforeNotification);
  for(const params of [null,[],false,'text']){
   call('bad-params','ping',params);await turn();assert.deepEqual(take(),error('bad-params',-32602,'params 必须是对象'));
  }
  call('missing-name','tools/call',{});await turn();assert.deepEqual(take(),error('missing-name',-32602,'需要工具名称'));
  call('cancel-as-request','notifications/cancelled',{requestId:71});await turn();
  assert.deepEqual(take(),error('cancel-as-request',-32601,'Method not found: notifications/cancelled'));
  const args={text:'same original argument',values:[null,true,3],nested:{uninterpreted:'provider-owned'}};
  call('echo','tools/call',{name:'echo',arguments:args});await turn();
  assert.deepEqual(take(),ok('echo',{content:[{type:'text',text:JSON.stringify({name:'echo',args})}]}));
  call('no-arguments','tools/call',{name:'echo'});await turn();
  assert.deepEqual(take(),ok('no-arguments',{content:[{type:'text',text:JSON.stringify({name:'echo'})}]}));
  for(const [name,result] of [
   ['rpc-error',error('rpc-error',-32042,'fixture RPC refusal')],
   ['ordinary-error',ok('ordinary-error',{content:[{type:'text',text:'错误: fixture ordinary failure'}],isError:true})],
   ['message-object',ok('message-object',{content:[{type:'text',text:'错误: legacy message property'}],isError:true})],
   ['numeric-message',ok('numeric-message',{content:[{type:'text',text:'错误: 0'}],isError:true})],
   ['raw-string',ok('raw-string',{content:[{type:'text',text:'错误: undefined'}],isError:true})],
   ['null-rejection',error('null-rejection',-32603,"Cannot read properties of null (reading 'message')")],
   ['undefined-rejection',error('undefined-rejection',-32603,"Cannot read properties of undefined (reading 'message')")],
  ]){call(name,'tools/call',{name});await turn();assert.deepEqual(take(),result);}
  failList=true;call('list-failure','tools/list');await turn();
  assert.deepEqual(take(),error('list-failure',-32603,'fixture list exploded'));failList=false;

  // String and numeric JSON-RPC IDs are distinct even with equal spelling.
  call(71,'tools/call',{name:'hold',arguments:{token:'numeric'}});
  call('71','tools/call',{name:'hold',arguments:{token:'string'}});await turn();
  assert.equal(holds.size,2);
  const callsBeforeDuplicate=calls.length;
  call(71,'tools/call',{name:'hold',arguments:{token:'must-not-run'}});await turn();
  assert.deepEqual(take(),error(71,-32600,'Duplicate in-flight request id'));
  assert.equal(calls.length,callsBeforeDuplicate,'A duplicate does not invoke the provider');
  const beforeCancelledResult=messages().length;
  send({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:'71'}});await turn();
  assert.equal(holds.get('numeric').signal.aborted,false);assert.equal(holds.get('string').signal.aborted,true);
  holds.get('string').resolve({late:'must-not-be-sent'});await turn();assert.equal(messages().length,beforeCancelledResult);
  holds.get('numeric').resolve({completed:'numeric request'});await turn();assert.deepEqual(take(),ok(71,{completed:'numeric request'}));
  call(71,'tools/call',{name:'echo',arguments:{after:'completed ID may be reused'}});await turn();
  assert.equal(take().id,71);assert.ok(take().result);
  call(72,'tools/call',{name:'hold',arguments:{token:'late-rejection'}});await turn();
  send({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:'72'}});await turn();assert.equal(holds.get('late-rejection').signal.aborted,false);
  send({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:72}});await turn();assert.equal(holds.get('late-rejection').signal.aborted,true);
  const beforeCancelledError=messages().length;
  holds.get('late-rejection').reject(new Error('late failure must not be sent'));await turn();assert.equal(messages().length,beforeCancelledError);

  // The budget is UTF-8 bytes, not JS character count; a rejected buffer resets.
  input.write('界'.repeat(Math.floor(2*1024*1024/3)+1));await turn();
  assert.deepEqual(take(),error(null,-32600,'Request exceeds 2 MiB'));
  input.write('\n');call('after-budget','ping');await turn();assert.deepEqual(take(),ok('after-budget',{}));
  const fragmented=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:'fragmented',method:'tools/call',params:{name:'echo',arguments:{text:'界'}}})+'\n');
  const split=fragmented.indexOf(Buffer.from('界'))+1;
  input.write(fragmented.subarray(0,split));input.write(fragmented.subarray(split));await turn();
  assert.deepEqual(take(),ok('fragmented',{content:[{type:'text',text:JSON.stringify({name:'echo',args:{text:'界'}})}]}));
  server.close();server.close();input.end();await turn();
  assert.equal(closed,1);assert.deepEqual(exits,[0]);assert.equal(process.listenerCount('SIGINT'),sigintBefore);
  return {wire,messages:messages(),calls,closed,exits};
 }finally{server.close();input.destroy();output.destroy();}
}
