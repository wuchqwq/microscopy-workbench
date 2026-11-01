// Independent before/after public Panel projection probe. Controlled metadata,
// not a scientific accuracy test. Use a fresh output directory per invocation.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [repo, output, expectation] = process.argv.slice(2);
assert.ok(path.isAbsolute(repo) && path.isAbsolute(output));
assert.ok(['absent', 'preserved'].includes(expectation));
mkdirSync(output, {recursive: false});
const {createImagePanel} = await import(pathToFileURL(path.join(repo, 'dist/tools/image_panel.mjs')));
const {ImagePanelManager} = await import(pathToFileURL(path.join(repo, 'dist/lib/image_panel_mcp.mjs')));
const {prepareOwnedPanelRegistration} = await import(pathToFileURL(path.join(repo, 'dist/lib/panel_ownership.mjs')));
const assessment = {semantics_version: 1, numerical_field_status: 'computed_conditional',
  material_strain_status: 'insufficient_evidence', material_strain_validated: null,
  reason_codes: ['signal_and_model_uncertainty_not_quantified'],
  spatial_transfer: {scope: 'Controlled probe, not measured resolution'}};
const A = 'a'.repeat(32), B = 'b'.repeat(32), P = 'c'.repeat(32);
const supplied = {kind: 'gpa_view', object_id: A, gpa_object_id: B,
  coordinate_domain: 'physical_cartesian_nm', material_strain_verified: false,
  interpretation_status: 'hypothesized', evidence_assessment: assessment, annotations: [],
  panels: [{domain: 'source_array_indices', source_object_id: A,
    source_rect_xyxy: [0, 0, 32, 32], image_rect_xyxy: [0, 0, 32, 32]}]};
const original = JSON.stringify(supplied), calls = [];
const workspace = path.join(output, 'workspace');
const client = {async rpc(method) {return {result: method === 'tools/list' ? {tools: [{name: 'image_info', inputSchema: {}}]} : {}};},
  async tool(name, args) {calls.push({name, args}); assert.equal(name, 'image_info'); assert.equal(args.object_id, A);
    return {data: structuredClone(supplied), png: 'iVBORw0KGgo='};}, async close() {}};
const owned = prepareOwnedPanelRegistration({workspace, panel_id: P});
let panel;
try {
  panel = await createImagePanel({workspace, python: process.execPath, object_id: A, client, panel_id: P,
    helper_session_id: owned.helper_session_id, panel_generation: owned.generation, journalDirectory: owned.journalDirectory});
  owned.publish(panel);
  const response = await fetch(panel.url.split('/#')[0] + '/api/state', {headers: {'X-Panel-Token': panel.token}});
  assert.equal(response.status, 200);
  const state = await response.json();
  const manager = new ImagePanelManager({workspace, python: process.execPath, inspect() {assert.fail('No science on read');}});
  const result = await manager.call('image_panel_current', {panel_id: P});
  const current = JSON.parse(result.content.find(c => c.type === 'text').text);
  const report = {scope: 'Real owned HTTP and MCP handler with controlled provider metadata; no Python or browser',
    expectation, observed_assessment_present: Object.hasOwn(state.object, 'evidence_assessment'),
    provider: supplied, http_object: state.object, mcp_object: current.view.object, calls,
    original_provider_sha256: createHash('sha256').update(original).digest('hex')};
  writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  assert.equal(JSON.stringify(supplied), original);
  for (const object of [state.object, current.view.object]) {
    assert.equal(Object.hasOwn(object, 'evidence_assessment'), expectation === 'preserved');
    if (expectation === 'preserved') assert.deepEqual(object.evidence_assessment, assessment);
  }
  console.log(JSON.stringify({expectation, observed_assessment_present: report.observed_assessment_present}));
} finally {
  if (panel) await owned.close(panel);
}
