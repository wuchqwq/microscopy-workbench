import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {StdioImageClient} from '../tools/image_panel.mjs';

// Real Node subprocesses exercise exit/EOF ordering without a scientific worker.
function fixture(t,mode){
  const directory=mkdtempSync(path.join(tmpdir(),'panel-client-close-'));
  const server=path.join(directory,'server.mjs'),releaseFile=path.join(directory,'release');
  writeFileSync(server,`
    import {existsSync,watch} from 'node:fs';
    const {mode,releaseFile}=${JSON.stringify({mode,releaseFile})};
    process.stdin.setEncoding('utf8');let buffer='';
    process.stdin.on('data',chunk=>{buffer+=chunk;let n;while((n=buffer.indexOf('\\n'))>=0){
      const message=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{ready:true}})+'\\n',()=>{if(mode==='normal')process.exit(0);});
    }});
    process.stdin.on('end',()=>{
      if(mode!=='held')return;
      const watcher=watch(${JSON.stringify(directory)},()=>{if(existsSync(releaseFile))watcher.close();});
      if(existsSync(releaseFile))watcher.close();
      process.stdout.write(JSON.stringify({event:'stdin-ended'})+'\\n');
    });
  `);
  const client=new StdioImageClient({workspace:directory,python:process.execPath,serverPath:server});
  const exited=once(client.child,'exit');
  t.after(async()=>{
    // The child belongs to this fixture. Release any EOF hold without kill().
    writeFileSync(releaseFile,'release');
    if(client.child.exitCode===null&&client.child.signalCode===null)client.child.stdin.end();
    await exited;
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
    rmSync(directory,{recursive:true,force:true});
  });
  return {client,exited,releaseFile};
}

async function promptly(promise){
  let timer;
  try{
    await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('close waited for a second exit from an already stopped subprocess')),1000);})]);
  }finally{clearTimeout(timer);}
}

test('stdio close completes when the subprocess already exited normally',{timeout:5000},async t=>{
  const {client,exited}=fixture(t,'normal');
  assert.equal((await client.rpc('ready')).result.ready,true);
  assert.deepEqual(await exited,[0,null]);
  await promptly(client.close());
});

test('stdio close completes when the subprocess already exited by signal',{timeout:5000},async t=>{
  const {client,exited}=fixture(t,'signal');
  assert.equal((await client.rpc('ready')).result.ready,true);
  assert.equal(client.child.kill('SIGTERM'),true);
  assert.deepEqual(await exited,[null,'SIGTERM']);
  assert.equal(client.child.exitCode,null);
  await promptly(client.close());
});

test('stdio close ends stdin and waits for a still-running subprocess',{timeout:5000},async t=>{
  const {client,exited,releaseFile}=fixture(t,'held');
  assert.equal((await client.rpc('ready')).result.ready,true);
  const eof=new Promise(resolve=>{
    const onData=chunk=>{if(chunk.toString().includes('stdin-ended')){client.child.stdout.off('data',onData);resolve();}};
    client.child.stdout.on('data',onData);
  });
  let settled=false;
  const closing=client.close().then(()=>{settled=true;});
  await eof;
  assert.equal(client.child.exitCode,null);
  assert.equal(client.child.signalCode,null);
  assert.equal(settled,false,'close must wait after EOF while the subprocess remains alive');
  writeFileSync(releaseFile,'release');
  assert.deepEqual(await exited,[0,null]);
  await closing;
});
