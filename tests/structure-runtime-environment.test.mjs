import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {StructureWorkspace} from '../lib/structure_workspace.mjs';

test('real structure child keeps optional-library caches local without changing parent environment',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'structure-env-'));
 const names=['MPLCONFIGDIR','NUMBA_CACHE_DIR','XDG_CACHE_HOME','PYTHONNOUSERSITE','PYTHONDONTWRITEBYTECODE','PYTHONHOME','PYTHONPATH'];
 const prior=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{
  for(const key of names)process.env[key]='/unrelated-user-setting';
  const childScript=`let raw='';process.stdin.on('data',x=>raw+=x);process.stdin.on('end',()=>{const p=JSON.parse(raw);const env=Object.fromEntries(${JSON.stringify([...names,'NUMBA_NUM_THREADS','OPENBLAS_NUM_THREADS'])}.map(k=>[k,process.env[k]]));console.log(JSON.stringify({ok:true,result:{backend:'external-structure-workspace',state:'completed',object_id:p.object_id,env}}));});`;
  const service=new StructureWorkspace({workspace:root,python:process.execPath,spawnProcess:(_python,_args,options)=>spawn(process.execPath,['-e',childScript],options)});
  const reply=await service.call('structure_info',{object_id:'a'.repeat(32)});
  const received=JSON.parse(reply.content.find(x=>x.type==='text').text).env;
  assert.equal(received.MPLCONFIGDIR,path.join(root,'.runtime-cache','matplotlib'));
  assert.equal(received.NUMBA_CACHE_DIR,path.join(root,'.runtime-cache','numba'));
  assert.equal(received.XDG_CACHE_HOME,path.join(root,'.runtime-cache'));
  for(const key of ['PYTHONNOUSERSITE','PYTHONDONTWRITEBYTECODE','NUMBA_NUM_THREADS','OPENBLAS_NUM_THREADS'])assert.equal(received[key],'1');
  assert.equal(received.PYTHONHOME,'');assert.equal(received.PYTHONPATH,'');
  for(const key of names)assert.equal(process.env[key],'/unrelated-user-setting');
 }finally{
  for(const key of names){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
  rmSync(root,{recursive:true,force:true});
 }
});
