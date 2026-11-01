import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {ImageWorkspace} from '../lib/image_workspace.mjs';

const response=(state='unknown')=>({ok:false,state,backend:'external-image-workspace',request_id:'saved-method-parent',
  error:{code:state==='unknown'?'INCOMPLETE_REQUEST':'BATCH_CHILD_FAILED',message:'Original operation did not complete'},
  partial_results:{parent_request_id:'saved-method-parent',automatic_retry:false,
    children:[{request_id:'saved-original-child',state:'completed',object_id:'a'.repeat(32)}]}});

test('real Python nonzero recovery preserves original failed and unknown child receipts',async t=>{
  const python=process.env.MICROSCOPY_PYTHON||process.env.DM_IMAGE_PYTHON||'python';
  if(spawnSync(python,['--version'],{windowsHide:true}).status!==0){t.skip('Independent Python executable unavailable');return;}
  const directory=mkdtempSync(path.join(tmpdir(),'public-method-transport-'));
  try{
    for(const state of ['failed','unknown']){
      // Match image_workspace.py main: JSON stdout followed by exit status1.
      const worker=path.join(directory,`${state}.py`);
      writeFileSync(worker,`import sys\nsys.stdin.read()\nsys.stdout.write(${JSON.stringify(JSON.stringify(response(state)))})\nsys.exit(1)\n`);
      const workspace=new ImageWorkspace({workspace:directory,python,workerPath:worker});
      const result=await workspace.call('image_result',{request_id:'saved-method-parent'});
      assert.equal(result.isError,true);
      assert.deepEqual(JSON.parse(result.content[0].text).partial_results,response(state).partial_results);
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('nonzero partial recovery refuses foreign identity, backend, state and replay permission',async()=>{
  let reply=response();
  const spawnProcess=()=>{
    const child=new EventEmitter();child.pid=123;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
    child.stdin.on('finish',()=>{child.stdout.write(JSON.stringify(reply));child.emit('close',1);});return child;
  };
  const workspace=new ImageWorkspace({workspace:path.resolve('method-transport-contract'),spawnProcess});
  for(const mutate of [value=>value.request_id='foreign',value=>value.partial_results.parent_request_id='foreign',
    value=>value.backend='foreign',value=>delete value.backend,value=>value.state='completed',value=>value.partial_results.automatic_retry=true]){
    reply=response();mutate(reply);
    await assert.rejects(workspace.call('image_result',{request_id:'saved-method-parent'}),/original|partial recovery/i);
  }
});
