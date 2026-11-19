import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';

function report(result){
  const row=result.content.find(x=>x.type==='text');
  assert.ok(row,'science_capabilities must return a text report');
  return JSON.parse(row.text);
}
test('capabilities describe live registered tools, optional omissions and independent Skills',async()=>{
  const base=mkdtempSync(path.join(os.tmpdir(),'science-capability-test-'));
  const runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:path.join(base,'images'),
    MICROSCOPY_PANEL:'0',MICROSCOPY_EXECUTION_OBSERVABILITY:'0'}});
  try{
    const names=runtime.registry.listTools().map(x=>x.name);
    assert.ok(names.includes('science_capabilities'));
    assert.ok(names.includes('image_gpa'));
    const all=report(await runtime.registry.call('science_capabilities',{capability:'all',probe_dependencies:false}));
    assert.equal(all.schema_version,1);
    assert.equal(all.kind,'read_only_capability_inspection');
    assert.equal(all.capabilities.length,8);
    const byName=Object.fromEntries(all.capabilities.map(x=>[x.capability,x]));
    assert.equal(byName.gpa.status,'registered_not_probed');
    assert.deepEqual(byName.gpa.missing_tools,[]);
    assert.ok(byName.gpa.registered_tools.includes('image_gpa'));
    assert.equal(byName.structure.status,'tool_not_registered');
    assert.equal(byName.ptyrad_cli.status,'external_cli_only');
    assert.equal(byName.ptyrad_engine.status,'not_registered');
    assert.equal(byName.phasefield_pde.status,'not_registered');
    await assert.rejects(runtime.registry.call('science_capabilities',{capability:'unknown'}));
    await assert.rejects(runtime.registry.call('science_capabilities',{probe_dependencies:'yes'}));
  }finally{runtime.close();rmSync(base,{recursive:true,force:true});}
});
test('unavailable configured Python is explicitly not reported as ready',async()=>{
  const base=mkdtempSync(path.join(os.tmpdir(),'science-capability-probe-'));
  const runtime=createScienceRuntime({env:{MICROSCOPY_IMAGE_WORKSPACE:path.join(base,'images'),
    MICROSCOPY_PYTHON:path.join(base,'not-a-python-executable'),MICROSCOPY_PANEL:'0'}});
  try{
    const answer=report(await runtime.registry.call('science_capabilities',{capability:'gpa',probe_dependencies:true}));
    assert.equal(answer.capabilities[0].status,'dependencies_unavailable');
    assert.equal(answer.capabilities[0].dependency_probe.ok,false);
    assert.match(answer.capabilities[0].dependency_probe.error,/spawn_failed/);
  }finally{runtime.close();rmSync(base,{recursive:true,force:true});}
});
