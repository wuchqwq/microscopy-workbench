import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,cpSync,readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {preparePlugin} from '../tools/prepare_plugin.mjs';
import {resolvePluginEnvironment} from '../tools/plugin_server.mjs';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>JSON.parse(readFileSync(path.join(root,name),'utf8'));
const temporary=()=>mkdtempSync(path.join(tmpdir(),'microscopy-plugin-'));

test('plugin paths resolve inside its installed root without shell interpolation',()=>{
  const manifest=read('.codex-plugin/plugin.json'),mcp=read('.mcp.json');
  assert.equal(manifest.name,'microscopy-workbench');
  assert.equal(manifest.requires_local_executor,true);
  for(const relative of [manifest.skills,manifest.mcpServers]){
    assert.ok(relative.startsWith('./'));assert.ok(!relative.split('/').includes('..'));
    assert.ok(existsSync(path.join(root,relative)));
  }
  const server=mcp.mcpServers.microscopy_workbench;
  assert.equal(server.cwd,'.');assert.equal(server.command,'node');
  assert.ok(existsSync(path.join(root,server.args[0])));
  assert.ok(!JSON.stringify(mcp).includes('${'));
  const marketplace=read('.agents/plugins/marketplace.json');
  assert.equal(marketplace.plugins[0].source.path,'./');
});

test('packaged Skills reference present resources and discoverable tool names',()=>{
  const base=temporary(),runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:path.join(base,'images'),MICROSCOPY_STRUCTURE_WORKSPACE:path.join(base,'structures'),MICROSCOPY_CONTEXT_WORKSPACE:path.join(base,'contexts'),MICROSCOPY_EXECUTION_OBSERVABILITY:'1'}});
  try{
    const names=new Set(runtime.registry.listTools().map(tool=>tool.name));
    const skills=path.join(root,read('.codex-plugin/plugin.json').skills);
    for(const folder of readdirSync(skills,{withFileTypes:true}).filter(entry=>entry.isDirectory())){
      const file=path.join(skills,folder.name,'SKILL.md'),text=readFileSync(file,'utf8');
      for(const match of text.matchAll(/`((?:image|structure|analysis|execution)_[a-z_]+)`/g))assert.ok(names.has(match[1]),`${folder.name}: unavailable ${match[1]}`);
      for(const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)){
        if(/^[a-z]+:|^#/i.test(match[1]))continue;
        assert.ok(existsSync(path.resolve(path.dirname(file),match[1])),`${folder.name}: missing ${match[1]}`);
      }
    }
  }finally{runtime.close();rmSync(base,{recursive:true,force:true});}
});

test('explicit generated config is write-new and preserves scope across working directories',()=>{
  const base=temporary();
  try{
    const destination=path.join(base,'config with spaces'),workspace=path.join(base,'science with spaces');
    const made=preparePlugin({python:process.execPath,workspace,output:destination,structures:true});
    const generated=JSON.parse(readFileSync(made.mcp,'utf8')).mcpServers.microscopy_workbench;
    assert.deepEqual(generated.args,[path.join(root,'tools','plugin_server.mjs'),'--config',made.configuration]);
    const next=resolvePluginEnvironment({env:{MICROSCOPY_IMAGE_WORKSPACE:path.join(base,'unrelated'),MICROSCOPY_PYTHON:'wrong'},settingsPath:made.configuration,home:base});
    assert.equal(next.MICROSCOPY_PYTHON,process.execPath);
    assert.equal(next.MICROSCOPY_IMAGE_WORKSPACE,path.join(workspace,'images'));
    assert.equal(next.MICROSCOPY_STRUCTURE_WORKSPACE,path.join(workspace,'structures'));
    assert.equal(next.MICROSCOPY_CONTEXT_WORKSPACE,path.join(workspace,'contexts'));
    const original=readFileSync(made.configuration);
    assert.throws(()=>preparePlugin({python:process.execPath,workspace,output:destination}),/EEXIST/);
    assert.deepEqual(readFileSync(made.configuration),original);
  }finally{rmSync(base,{recursive:true,force:true});}
});

test('optional structures stay opt-in and invalid config cannot silently fall back',()=>{
  const base=temporary();
  try{
    let env=resolvePluginEnvironment({env:{},home:base});
    assert.equal(env.MICROSCOPY_STRUCTURE_WORKSPACE,undefined);
    assert.equal(env.MICROSCOPY_IMAGE_WORKSPACE,path.join(base,'.microscopy-workbench','workspace','images'));
    assert.throws(()=>resolvePluginEnvironment({env:{},settingsPath:path.join(base,'absent.json')}),/ENOENT/);
    const invalid=path.join(base,'invalid.json');
    writeFileSync(invalid,JSON.stringify({schema_version:1,python:process.execPath,workspace_root:base,structures:true,command:'anything'}));
    assert.throws(()=>resolvePluginEnvironment({env:{},settingsPath:invalid}),/Unknown plugin setting/);
    assert.throws(()=>preparePlugin({python:'relative',workspace:base,output:path.join(base,'new')}),/absolute/);
    assert.equal(existsSync(path.join(base,'new')),false);
  }finally{rmSync(base,{recursive:true,force:true});}
});

test('relocated plugin starts shared MCP and exposes image, context and optional structure catalog',async()=>{
  const base=temporary();let child;
  try{
    const relocated=path.join(base,'relocated package');
    // Runtime assets only; no old checkout, science arrays, Python environment or config.
    for(const name of ['lib','tools','ui','server.mjs','science-server.mjs'])cpSync(path.join(root,name),path.join(relocated,name),{recursive:true});
    const made=preparePlugin({python:process.execPath,workspace:path.join(base,'workspace'),output:path.join(base,'connection'),structures:true,pluginRoot:relocated});
    child=spawn(made.server.command,made.server.args,{cwd:base,stdio:['pipe','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
    const lines=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'package-test',version:'1'}}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/list',params:{}}];
    child.stdin.write(lines.map(JSON.stringify).join('\n')+'\n');
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('MCP catalog timeout: '+stderr)),10000);
      const observe=()=>{if(stdout.split('\n').some(line=>{try{return JSON.parse(line).id===2;}catch{return false;}})){clearTimeout(timeout);resolve();}};
      child.stdout.on('data',observe);child.once('error',e=>{clearTimeout(timeout);reject(e);});observe();
    });
    const replies=stdout.trim().split('\n').map(JSON.parse);
    assert.equal(replies.find(r=>r.id===1).result.serverInfo.name,'microscopy-core');
    const names=replies.find(r=>r.id===2).result.tools.map(t=>t.name);
    for(const name of ['image_open','image_fft','image_panel_open','analysis_create','analysis_read','structure_open','structure_compare'])assert.ok(names.includes(name),name);
    assert.ok(!names.some(name=>name.startsWith('dm_')));
  }finally{
    if(child){child.stdin.end();await new Promise(resolve=>{child.once('close',resolve);if(child.exitCode!==null)resolve();});}
    rmSync(base,{recursive:true,force:true});
  }
});
