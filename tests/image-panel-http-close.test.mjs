// Real HTTP shutdown regression. net.Server.close reproduces the documented
// v18.20.8 behavior without claiming that this test ran a Node 18 binary.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createImagePanel} from '../tools/image_panel.mjs';

const id=n=>n.toString(16).padStart(32,'0'),A=id(1),B=id(2),F=id(3),T=id(4);
const bytes=Buffer.from('89504e470d0a1a0a','hex'),png=bytes.toString('base64'),digest=createHash('sha256').update(bytes).digest('hex');
const grid={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,32,32],image_rect_xyxy:[0,0,32,32]};
const saved=object_id=>({object_id,kind:'view',parent_object_id:F,array_domain:'spatial',shape_yx:[32,32],panels:[grid],annotations:[],display:{gamma:1},files_sha256:{'preview.png':digest}});
async function within(promise,message){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),1500);})]);}
 finally{clearTimeout(timer);}
}
async function fixture(run){
 const workspace=mkdtempSync(path.join(tmpdir(),'panel-http-close-')),agent=new http.Agent({keepAlive:true}),calls=[];
 const records=new Map([[A,saved(A)],[B,saved(B)],[F,{object_id:F,kind:'frame',source_object_id:T,frame_index:0}],[T,{object_id:T,kind:'tiff_source'}]]);
 for(const object_id of [A,B]){const directory=path.join(workspace,'objects',object_id);mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'preview.png'),bytes);}
 let panel,closing,pending,release,entered;
 const waiting=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const client={async rpc(method){return {result:method==='tools/list'?{tools:[{name:'image_info',inputSchema:{}}]}:{}};},async tool(name,args){
  calls.push({name,args});assert.equal(name,'image_info','Shutdown must not compute scientific results');
  if(args.object_id===B){entered();await waiting;}
  const data=structuredClone(records.get(args.object_id));assert.ok(data);return {data,png:[A,B].includes(args.object_id)?png:null};
 },async close(){}};
 try{
  panel=await createImagePanel({workspace,python:path.resolve('unused-python'),object_id:A,client});
  // Node 18.20.8's Server.close delegates to net.Server.close and does not reap
  // idle HTTP sockets. Use that real native implementation on newer runtimes.
  panel.server.close=function(callback){return net.Server.prototype.close.call(this,callback);};
  const origin=panel.url.split('/#')[0];
  const request=(route,{body,keepAlive=true}={})=>new Promise((resolve,reject)=>{
   const headers={'X-Panel-Token':panel.token,...(body?{Origin:origin,'Content-Type':'application/json'}:{}),...(!keepAlive?{Connection:'close'}:{})};
   let socket;const req=http.request(origin+route,{method:body?'POST':'GET',headers,agent:keepAlive?agent:false},res=>{let text='';res.setEncoding('utf8');res.on('data',part=>text+=part);res.once('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),socket}));res.once('error',reject);});
   req.once('socket',value=>socket=value);req.once('error',reject);req.end(body?JSON.stringify(body):undefined);
  });
  const idle=await request('/api/state');assert.equal(idle.status,200);await new Promise(resolve=>setImmediate(resolve));assert.equal(idle.socket.destroyed,false,'A real keep-alive connection must exist before shutdown');
  await run({panel,workspace,calls,idle,started,release,request,startActive(){pending=request('/api/action',{keepAlive:false,body:{action:'show',params:{object_id:B},expected_object_id:A,draft_revision:0}});return pending;},close(){closing=panel.close();return closing;}});
 }finally{
  release();agent.destroy();if(pending)await pending.catch(()=>{});if(panel)await (closing??panel.close());
  assert.equal(path.dirname(path.resolve(workspace)),path.resolve(tmpdir()));rmSync(workspace,{recursive:true,force:true});
 }
}

test('Panel close reaps an idle keep-alive connection under Node 18 close semantics',()=>fixture(async h=>{
 const before=h.panel.state(),idleClosed=once(h.idle.socket,'close');await within(Promise.all([h.close(),idleClosed]),'Panel close waited for the idle keep-alive timeout');assert.equal(h.idle.socket.destroyed,true);
 const checkpoint=JSON.parse(readFileSync(path.join(h.panel.journal,'current-selection.json'),'utf8'));assert.equal(checkpoint.object_id,A);assert.equal(checkpoint.edit_state.draft_revision,before.edit_state.draft_revision);assert.equal(h.calls.filter(call=>call.name!=='image_info').length,0);
}));

test('Panel close drains idle sockets while allowing an active saved-view response to finish',()=>fixture(async h=>{
 const active=h.startActive();await within(h.started,'Controlled saved-view read did not start');let finished=false;const idleClosed=once(h.idle.socket,'close'),closing=h.close().then(()=>{finished=true;});
 await within(idleClosed,'Idle connection was not reaped while another response was active');assert.equal(finished,false,'Shutdown must await the active response');
 h.release();const reply=await within(active,'Active response was interrupted by shutdown');assert.equal(reply.status,200);assert.equal(reply.data.object.object_id,B);await within(closing,'Server did not finish after the active response');
 const checkpoint=JSON.parse(readFileSync(path.join(h.panel.journal,'current-selection.json'),'utf8'));assert.equal(checkpoint.object_id,B);assert.equal(h.calls.filter(call=>call.name!=='image_info').length,0);
}));
