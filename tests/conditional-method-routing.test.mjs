// Packaged Skill/data and live registry contracts; no image arrays or optimizer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ToolRegistry} from '../lib/runtime/tool_registry.mjs';
import {createImageModule} from '../lib/tools/image_module.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=path.join(root,'docs/conditional-s2');
const reference=path.join(root,'skills/scientific-agent/microscopy-automation/references');
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const index=read(path.join(directory,'method-evidence-index-v1.json'));
const examples=read(path.join(reference,'method-decision-examples-v1.json'));
function recordingRegistry(){
 const calls=[],registry=new ToolRegistry().register(createImageModule({imageWorkspace:{workspace:'fixture',call(name,args){calls.push({name,args});return {content:[]};}}}));
 return {calls,registry};
}

test('method evidence index binds the frozen evidence and actual selection sections',()=>{
 for(const evidence of Object.values(index.evidence)){
  const file=path.resolve(directory,evidence.path);
  assert.ok(file.startsWith(directory+path.sep));
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),evidence.sha256);
 }
 const selection=read(path.join(directory,index.evidence.selection.path));
 for(const method of index.methods)for(const section of method.evidence_sections){
  const value=section.split('.').reduce((current,key)=>current?.[key],selection);
  assert.notEqual(value,undefined,`${method.id}: missing frozen section ${section}`);
 }
 assert.deepEqual(index.defaults,{HRTEM:'H0',STEM:'S0'});
 assert.deepEqual(index.historical_boundaries.physical_grid_gate,selection.historical_boundaries.physical_grid_gate);
 assert.equal(index.historical_boundaries.formal_physical_blind_acceptance,'NOT_TESTED');
 const s2=index.methods.find(m=>m.id==='S2');
 assert.equal(s2.coverage.whole_comparison_eligible,selection.primary_STEM.eligible.S2_with_geometry);
 assert.equal(s2.coverage.full_denominator,selection.primary_STEM.full_observation_denominator);
});

test('method availability and call examples match the discoverable catalog without adding historical production routes',async()=>{
 const {calls,registry}=recordingRegistry(),names=new Set(registry.listTools().map(t=>t.name));
 for(const method of index.methods){
  for(const name of method.tools)assert.ok(names.has(name),`${method.id}: unavailable tool ${name}`);
  if(['H1','S1'].includes(method.id)){
   assert.equal(method.availability,'research_history_only');
   assert.deepEqual(method.tools,[]);
  }
 }
 const before=structuredClone(examples.tool_calls);
 for(const call of examples.tool_calls)await registry.call(call.tool,call.arguments);
 assert.deepEqual(calls,before.map(call=>({name:call.tool,args:call.arguments})));
 assert.deepEqual(examples.tool_calls,before,'route examples are passed unchanged, with no inferred premises');
 const unknown=calls.filter(call=>call.name==='image_column_fit');
 assert.equal(unknown.length,2);
 assert.equal(unknown[0].args.geometry,undefined);
 assert.equal(unknown[0].args.count_interpretation,undefined);
 assert.equal(unknown[1].args.count_interpretation.model,'normalized_brightness');
 assert.deepEqual(calls.at(-1),{name:'image_result',args:{request_id:'synthetic-unresolved-original'}});
});

test('Skill entry points and their new method references resolve inside the relocatable package',()=>{
 const files=[
  'skills/scientific-agent/microscopy-router/SKILL.md',
  'skills/scientific-agent/microscopy-automation/SKILL.md',
  'skills/scientific-agent/microscopy-automation/references/point-observations.md',
  'skills/scientific-agent/microscopy-automation/references/route-a-decisions.md',
  'skills/scientific-agent/microscopy-automation/references/conditional-methods.md',
  'docs/conditional-s2/METHOD-ROUTING.md',
 ];
 for(const relative of files){
  const file=path.join(root,relative),body=readFileSync(file,'utf8');
  for(const match of body.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)){
   if(/^[a-z]+:|^#/i.test(match[1]))continue;
   const target=path.resolve(path.dirname(file),match[1]);
   assert.ok(target.startsWith(root),`${relative}: reference escapes package`);
   assert.ok(existsSync(target),`${relative}: missing ${match[1]}`);
  }
 }
 assert.ok(existsSync(path.resolve(directory,index.repository_skill_reference)));
 assert.ok(existsSync(path.resolve(directory,index.decision_contract)));
 assert.ok(existsSync(path.resolve(reference,index.skill_reference)));
 assert.deepEqual(read(path.join(reference,'method-evidence-index-v1.json')),index);
 assert.ok(existsSync(path.join(reference,'../scripts/check_method_decision.py')));
});
