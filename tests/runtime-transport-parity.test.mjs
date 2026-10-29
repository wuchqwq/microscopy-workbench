// Exact frozen transport oracle; run separately from the no-Git lightweight suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startStdioMcpServer} from '../lib/runtime/stdio_mcp_server.mjs';
import {RpcError} from '../lib/runtime/schema.mjs';
import {exerciseStdioContract} from './helpers/stdio-contract-scenarios.mjs';

const BASELINE='3790b3d57e427010f0a5cbfce8a31143a7883eef';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const checkout=path.basename(root)==='dist'?path.dirname(root):root;
test('compiled stdio JSONL and lifecycle equal the exact frozen R3 transport',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'microscopy-transport-parity-'));
 try{
  for(const filename of ['stdio_mcp_server.mjs','schema.mjs']){
   const frozen=spawnSync('git',['show',BASELINE+':lib/runtime/'+filename],{cwd:checkout,encoding:'utf8',windowsHide:true});
   assert.equal(frozen.status,0,frozen.stderr||'The exact frozen Git object must be available');
   writeFileSync(path.join(directory,filename),frozen.stdout,'utf8');
  }
  const oldTransport=await import(pathToFileURL(path.join(directory,'stdio_mcp_server.mjs')).href);
  const oldSchema=await import(pathToFileURL(path.join(directory,'schema.mjs')).href);
  const original=await exerciseStdioContract(oldTransport.startStdioMcpServer,oldSchema.RpcError);
  const compiled=await exerciseStdioContract(startStdioMcpServer,RpcError);
  assert.deepEqual(compiled,original,'Emitted transport must preserve exact JSONL, provider calls and close behavior');
 }finally{
  assert.equal(path.dirname(realpathSync(directory)),realpathSync(tmpdir()));
  assert.ok(path.basename(directory).startsWith('microscopy-transport-parity-'));
  rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});
