import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
import {validate} from '../lib/runtime/schema.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const names=['microscopy-router','microscopy-observe-revise','crystallography-compare'];
const json=file=>JSON.parse(readFileSync(file,'utf8'));

test('question-driven skill examples satisfy the actual provider argument contract',()=>{
 const base=mkdtempSync(path.join(tmpdir(),'microscopy-skill-schema-'));
 const runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:path.join(base,'images'),MICROSCOPY_STRUCTURE_WORKSPACE:path.join(base,'structures'),MICROSCOPY_CONTEXT_WORKSPACE:path.join(base,'contexts'),MICROSCOPY_EXECUTION_OBSERVABILITY:'1'}});
 try {
  const tools=new Map(runtime.registry.listTools().map(tool=>[tool.name,tool]));
  for(const name of names){
   const examples=json(path.join(root,'skills/scientific-agent',name,'examples.json'));
   for(const ref of examples.tool_refs)assert.ok(tools.has(ref),`${name}: ${ref}`);
   for(const scenario of examples.scenarios)for(const call of scenario.calls){
    assert.ok(tools.has(call.tool),`${name}: ${call.tool}`);
    validate(call.arguments,tools.get(call.tool).inputSchema,`${name}: ${scenario.intent}: ${call.tool}`);
   }
  }
 } finally {runtime.close();rmSync(base,{recursive:true,force:true});}
});

test('packaged entrypoints, progressive references, helpers and Codex metadata resolve',()=>{
 const plugin=json(path.join(root,'.codex-plugin/plugin.json'));
 assert.equal(plugin.version,'0.6.1');
 const base=path.resolve(root,plugin.skills);
 for(const name of names){
  const directory=path.join(base,name),entry=readFileSync(path.join(directory,'SKILL.md'),'utf8').replace(/\r\n/g,'\n');
  assert.ok(entry.startsWith(`---\nname: ${name}\n`));
  const metadata=readFileSync(path.join(directory,'agents/openai.yaml'),'utf8');
  assert.ok(metadata.includes('$'+name));
  const walk=dir=>{for(const item of readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,item.name);
   if(item.isDirectory())walk(file);
   else if(item.name.endsWith('.md'))for(const match of readFileSync(file,'utf8').matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)){
    if(/^[a-z]+:|^#/i.test(match[1]))continue;
    assert.ok(existsSync(path.resolve(path.dirname(file),match[1])),`${file}: ${match[1]}`);
   }
  }};
  walk(directory);
 }
 assert.ok(existsSync(path.join(base,'microscopy-observe-revise/scripts/tiff_raw_probe.py')));
 assert.ok(existsSync(path.join(base,'crystallography-compare/scripts/conditional_dk.py')));
});

test('TIFF guidance chooses core from the live catalog and keeps original provider history',()=>{
 const skills=path.join(root,'skills/scientific-agent');
 const observe=readFileSync(path.join(skills,'microscopy-observe-revise/SKILL.md'),'utf8').replace(/\s+/g,' ');
 const router=readFileSync(path.join(skills,'microscopy-router/SKILL.md'),'utf8').replace(/\s+/g,' ');
 assert.match(router,/new original TIFF, follow the provider selection in \[observe and revise\]/);
 assert.match(observe,/actual tool catalog, prefer `microscopy-core` over `microscopy-images` when core supports the original TIFF layout/);
 assert.match(observe,/required core tools are absent.*?new session exposing those tools is needed/);
 assert.match(observe,/source, frame, ROI and statistics in the same provider and workspace/);
 assert.match(observe,/Never pass its `object_id` to a different provider/);
 assert.match(observe,/`UNSUPPORTED_LAYOUT` does not establish a missing tool/);
 assert.match(observe,/terminal `failed` and the new provider supports the original layout/);
 assert.match(observe,/unknown, query it in the original provider\/workspace.*?Do not replay it or switch providers/);
});
