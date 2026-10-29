import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createImagePanel} from '../tools/image_panel.mjs';

test('composition resolution is token/origin protected, bounded and read-only on refused input',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'composition-http-')),id='a'.repeat(32),frame='b'.repeat(32),calls=[];
 const object={object_id:id,kind:'view',panels:[{domain:'spatial_pixels',source_object_id:frame,source_rect_xyxy:[0,0,1,1],image_rect_xyxy:[0,0,1,1]}],annotations:[],display:{gamma:1,display_range:[0,1]}};
 const client={async rpc(name){return {result:name==='tools/list'?{tools:[{name:'image_info',inputSchema:{}}]}:{}};},async tool(name,args){calls.push({name,args});assert.equal(name,'image_info','read-only restore must never compute or write');return {data:args.object_id===id?object:{object_id:frame,kind:'frame',frame_index:0},png:'iVBORw0KGgo='};},async close(){}};
 let panel;
 try{
  panel=await createImagePanel({workspace:dir,python:path.resolve('unused-python'),object_id:id,client});const origin=panel.url.split('/#')[0],url=origin+'/api/composition/resolve',headers={'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},before=JSON.stringify(panel.state()),count=calls.length;
  assert.equal((await fetch(origin+'/figure-composer.mjs')).status,200);
  const post=(body,h=headers)=>fetch(url,{method:'POST',headers:h,body:typeof body==='string'?body:JSON.stringify(body)});
  assert.equal((await post({composition:{}},{Origin:origin,'Content-Type':'application/json'})).status,403);
  assert.equal((await post({composition:{}},{...headers,Origin:'https://other.invalid'})).status,403);
  assert.equal((await post({composition:{},path:'forbidden'})).status,400);
  assert.equal((await post({composition:{schema:'microscopy-figure-composition-v1',layout:'2x2',font_pt:8,slots:[]}})).status,400);
  assert.equal((await post(' '.repeat(512*1024+1))).status,413);
  assert.equal(calls.length,count,'malformed composition cannot enter provider reads or science calls');assert.equal(JSON.stringify(panel.state()),before,'failed restore cannot adopt a view, clear drafts or change last operation');
 }finally{if(panel)await panel.close();rmSync(dir,{recursive:true,force:true});}
});
