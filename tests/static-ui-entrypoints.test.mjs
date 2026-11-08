import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {createImagePanel} from '../tools/image_panel.mjs';
test('every emitted browser import is served under the unchanged restrictive CSP',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'mwb-static-routes-')),id=n=>String(n).repeat(32),bytes=Buffer.from('89504e470d0a1a0a00000000','hex'),png=bytes.toString('base64'),hash=createHash('sha256').update(bytes).digest('hex');
 const records=new Map([[id(1),{object_id:id(1),kind:'tiff_source'}],[id(2),{object_id:id(2),kind:'frame',source_object_id:id(1),frame_index:0}],[id(3),{object_id:id(3),kind:'view',parent_object_id:id(2),array_domain:'spatial',shape_yx:[64,64],panels:[{domain:'spatial_pixels',source_object_id:id(2),source_rect_xyxy:[0,0,64,64],image_rect_xyxy:[0,0,64,64]}],annotations:[],display:{gamma:1},files_sha256:{'preview.png':hash}}]]);
 for(const [key,value]of records){const dir=path.join(workspace,'objects',key);mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'object.json'),JSON.stringify(value));if(value.files_sha256)writeFileSync(path.join(dir,'preview.png'),bytes);}
 const client={rpc:async method=>({result:method==='tools/list'?{tools:[{name:'image_info',inputSchema:{}}]}:{}}),tool:async(_name,args)=>({data:structuredClone(records.get(args.object_id)),png:records.get(args.object_id)?.files_sha256?png:null}),close:async()=>{}};
 const panel=await createImagePanel({workspace,python:process.execPath,object_id:id(3),client});
 try{
  const origin=new URL(panel.url).origin,queue=['/app.mjs'],seen=new Set();
  while(queue.length){const route=queue.pop();if(seen.has(route))continue;seen.add(route);const response=await fetch(origin+route);assert.equal(response.status,200,route+' must be a real static module');assert.match(response.headers.get('content-type'),/javascript/);assert.match(response.headers.get('content-security-policy'),/script-src 'self'; style-src 'self';/);const body=await response.text();for(const match of body.matchAll(/\bfrom\s+['"]\.\/([^'"]+\.mjs)['"]/g))queue.push('/'+match[1]);}
  const html=await (await fetch(origin+'/')).text(),css=await (await fetch(origin+'/style.css')).text();assert.doesNotMatch(html,/<(?:textarea|img)\b[^>]*id="offline-(?:response|source-image)"[^>]*\bstyle=/);assert.match(css,/#research-lead-dialog #offline-response\{min-height:240px/);assert.match(css,/#offline-source-image\{/);
  assert.match(html,/<link[^>]*href="\/style.css"/);assert.match(css,/#offline-evidence-cards>section\{/);assert.match(html,/<textarea id="offline-response"[^>]*readonly/);assert.match(html,/id="offline-hypothesis"/);
  for(const name of ['workspace-controls','roi-comparison','settle-workspace','window-workspace','offline-research'])assert.ok(seen.has('/'+name+'.mjs'));
 }finally{await panel.close({abnormal:true});assert.equal(path.dirname(workspace),path.resolve(tmpdir()));assert.ok(path.basename(workspace).startsWith('mwb-static-routes-'));rmSync(workspace,{recursive:true,force:true});}
});
