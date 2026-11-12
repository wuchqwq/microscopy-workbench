// Opt-in Windows acceptance. Starts only an isolated microscopy-core stdio peer.
// The operator uses the displayed native window for the ROI edit and save.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = path.join(root, 'dist', 'server.mjs');
const output = process.env.MICROSCOPY_SMOKE_OUTPUT;
const python = process.env.MICROSCOPY_PYTHON;
assert.equal(process.platform, 'win32');
assert.ok(output && path.isAbsolute(output), 'Use a fresh absolute MICROSCOPY_SMOKE_OUTPUT directory');
assert.ok(python && path.isAbsolute(python), 'Use an absolute MICROSCOPY_PYTHON executable');
mkdirSync(output, {recursive: false});

const source = path.join(output, 'synthetic-two-frame.tiff');
const images = path.join(output, 'images');
const contexts = path.join(output, 'contexts');
const digest = data => createHash('sha256').update(data).digest('hex');
const hash = file => digest(readFileSync(file));
const snapshot = directory => Object.fromEntries(readdirSync(directory).map(name => {
  const file = path.join(directory, name);
  return [file, hash(file)];
}));
const report = {scope: 'Windows, actual microscopy-core stdio, native Panel, isolated synthetic TIFF',
  source: 'Synthetic uint16, two frames, no calibration or material claim',
  actual_codex_catalog: 'NOT_TESTED', actual_model_tool_selection: 'NOT_TESTED', human_usability: 'NOT_TESTED', macOS: 'NOT_TESTED', checks: []};
const checked = detail => {
  report.checks.push(detail);
  console.log(detail);
};
const scrub = (key, value) => {
  if (/^(panel_url|token|evidence_token|owner_nonce|nonce)$/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.replace(/http:\/\/127\.0\.0\.1:\d+\/#[^\s"']+/g, '[REDACTED_PANEL_URL]');
  return value;
};
const log = record => appendFileSync(path.join(output, 'calls.ndjson'), JSON.stringify({utc: new Date().toISOString(), ...record}, scrub) + '\n');

// Array truth is evaluated independently in JS for whichever integer ROI was
// actually saved by the UI. No operator gesture is supplied by this script.
function expectedStatistics([left, top, right, bottom]) {
  let total = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const value = 1000 + 17 * y + 3 * x + (((Math.floor(x / 8) + Math.floor(y / 8)) % 2) * 128);
      total += value;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  const sample_count = (right - left) * (bottom - top);
  return {sample_count, minimum, maximum, mean: total / sample_count};
}

class StdioPeer {
  constructor() {
    this.child = spawn(process.execPath, [server], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: {
      ...process.env,
      MICROSCOPY_PYTHON: python,
      MICROSCOPY_IMAGE_WORKSPACE: images,
      MICROSCOPY_CONTEXT_WORKSPACE: contexts,
      MICROSCOPY_STRUCTURE_WORKSPACE: '',
      MICROSCOPY_PANEL: '1',
      MICROSCOPY_PANEL_DESKTOP: '1',
    }});
    this.next = 1;
    this.pending = new Map();
    this.closed = once(this.child, 'close');
    this.closed.catch(() => {});
    this.child.stderr.on('data', data => appendFileSync(path.join(output, 'provider.stderr.log'), scrub('', data.toString())));
    this.child.stdin.on('error', error => this.rejectPending(error));
    this.child.on('error', error => this.rejectPending(error));
    this.child.on('close', () => this.rejectPending(new Error('MCP process closed')));
    createInterface({input: this.child.stdout}).on('line', line => {
      try {
        const reply = JSON.parse(line);
        this.pending.get(reply.id)?.resolve(reply);
      } catch (error) {
        this.rejectPending(error);
      }
    });
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
  }

  async rpc(method, params, {record = true} = {}) {
    const id = this.next++;
    const request = {jsonrpc: '2.0', id, method, params};
    if (record) log({direction: 'to_provider', request});
    let timer;
    try {
      const reply = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Stopped waiting on the original RPC; do not replay the effect')), 130000);
        this.pending.set(id, {resolve, reject});
        this.child.stdin.write(JSON.stringify(request) + '\n');
      });
      if (record) {
        // Keep the exact JSON response and hash any transported image blocks.
        const response = structuredClone(reply);
        for (const block of response.result?.content ?? []) {
          if (block.type === 'image') {
            const data = Buffer.from(block.data, 'base64');
            block.sha256 = digest(data);
            block.bytes = data.length;
            delete block.data;
          } else if (block.type === 'text') {
            try { block.text = JSON.stringify(JSON.parse(block.text), scrub); } catch { block.text = scrub('', block.text); }
          }
        }
        log({direction: 'from_provider', response});
      }
      if (reply.error) throw new Error(reply.error.message);
      return reply.result;
    } finally {
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }

  async call(name, args, options) {
    const reply = await this.rpc('tools/call', {name, arguments: args}, options);
    const text = reply.content.find(item => item.type === 'text')?.text;
    if (reply.isError) throw new Error(text);
    return JSON.parse(text);
  }

  async close() {
    this.child.stdin.end();
    const [code, signal] = await this.closed;
    return {code, signal};
  }
}

const roi = {annotation_id: 'initial-roi', kind: 'rectangle', status: 'hypothesized', text: 'Initial synthetic ROI',
  purpose: 'resumable_observation', selection_origin: 'agent', coordinate_space: 'source_pixels', coordinates: [8, 8, 30, 30],
  note: 'Public synthetic ROI supplied by the harness. Review a different rectangle for continuation.'};
const analysis_id = 'windows-smoke-analysis';
let peer;
try {
  const fixture = 'import sys,numpy as np,tifffile;y,x=np.indices((64,80));a=(17*y+3*x+128*((x//8+y//8)%2)).astype(np.uint16);tifffile.imwrite(sys.argv[1],np.stack((a,a+1000)),photometric="minisblack",metadata=None)';
  const generated = spawnSync(python, ['-B', '-c', fixture, source], {encoding: 'utf8', windowsHide: true, timeout: 15000});
  assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
  report.source_sha256 = hash(source);
  peer = new StdioPeer();
  const init = await peer.rpc('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'isolated-windows-smoke', version: '1'}});
  assert.equal(init.serverInfo.name, 'microscopy-core');
  peer.child.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
  const catalog = (await peer.rpc('tools/list', {})).tools.map(tool => tool.name);
  for (const name of ['image_panel_open', 'image_panel_activate', 'image_panel_current', 'image_panel_saved', 'analysis_read']) assert.ok(catalog.includes(name), name);
  const opened = await peer.call('image_open', {source_path: source, request_id: 'smoke-open'});
  const frame = await peer.call('image_frame', {object_id: opened.object_id, frame_index: 1, request_id: 'smoke-frame-1'});
  const info = await peer.call('image_info', {object_id: frame.object_id});
  assert.equal(info.frame_index, 1);
  assert.equal(info.dtype, 'uint16');
  const panels = path.join(images, 'panel-registry', 'panels');
  assert.equal(existsSync(panels) ? readdirSync(panels).length : 0, 0);
  checked('PASS ordinary same-provider metadata read produced no owned Panel');
  const preview = await peer.call('image_preview', {object_id: frame.object_id, max_size: 256, request_id: 'smoke-preview'});
  const view = await peer.call('image_annotate', {object_id: preview.object_id, annotations: [{...roi, source_object_id: frame.object_id}], request_id: 'smoke-first-roi'});
  const original = {...snapshot(path.join(images, 'objects', frame.object_id)), ...snapshot(path.join(images, 'objects', view.object_id))};

  const created = await peer.call('analysis_create', {analysis_id, request_id: 'smoke-analysis-create', reason: 'Synthetic spatial review'});
  const references = await peer.call('analysis_update', {analysis_id, request_id: 'smoke-analysis-refs', expected_revision: created.context.revision,
    reason: 'Exact source frame and annotated view before opening', selections: {experiment: {provider: 'image', object_id: frame.object_id}, display: {provider: 'image', object_id: view.object_id}}});
  assert.equal(references.state, 'advanced');
  const startingContext = references.context;
  const open = await peer.call('image_panel_open', {object_id: view.object_id, request_id: 'smoke-panel-open'});
  const panel_id = open.panel_id;
  assert.equal(open.view.object.object_id, view.object_id);
  assert.equal(open.view.frame_identity.frame_object_id, frame.object_id);
  assert.equal(open.view.frame_identity.frame_index, 1);
  assert.equal(open.roi_handoff.saved_rectangles[0].annotation_id, roi.annotation_id);
  assert.deepEqual(open.roi_handoff.saved_rectangles[0].rect_xyxy, roi.coordinates);

  const activationArgs = {panel_id, request_id: 'smoke-panel-activate'};
  const activation = await peer.call('image_panel_activate', activationArgs);
  assert.equal(activation.panel_id, panel_id);
  assert.equal(activation.activation.status, 'activated');
  assert.equal(activation.activation.visible, true);
  const recovered = await peer.call('image_panel_activate', activationArgs);
  assert.equal(recovered.recovered, true);
  assert.deepEqual(recovered.activation, activation.activation);
  const focused = await peer.call('image_panel_activate', {panel_id, request_id: 'smoke-panel-focus-existing'});
  assert.equal(focused.activation.status, 'activated');
  assert.equal(focused.activation.reused, true);
  assert.equal(focused.helper_session_id, activation.helper_session_id);
  assert.equal(focused.panel_generation, activation.panel_generation);
  report.activation = {activation, recovered, focused};
  checked('PASS saved frame/ROI opened in one native Panel; same activation recovered and a new focus request reused the viewer');

  console.log('GUI_READY: use R, drag a second ROI away from the initial ROI, then press Ctrl+S. Waiting up to five minutes.');
  let current;
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const inspected = await peer.call('image_panel_current', {panel_id}, {record: false});
    const status = inspected.view.workspace_analysis;
    if (status?.save_id && status.save_id !== open.view.workspace_analysis?.save_id && status.status === 'clean' && status.dirty === false &&
        inspected.view.edit_state.dirty === false && inspected.view.object.object_id !== view.object_id) {
      current = await peer.call('image_panel_current', {panel_id});
      break;
    }
    await delay(1250);
  }
  assert.ok(current, 'No clean new GUI savepoint with an edited immutable object was observed');
  const save_id = current.view.workspace_analysis.save_id;
  const saved = await peer.call('image_panel_saved', {panel_id, save_id});
  assert.equal(saved.save_id, save_id);
  assert.equal(saved.object_id, current.view.object.object_id);
  assert.equal(saved.frame_identity.frame_object_id, frame.object_id);
  assert.equal(current.view.helper_session_id, activation.helper_session_id);
  assert.equal(current.view.panel_generation, activation.panel_generation);
  assert.equal(current.roi_handoff.interaction_gate.status, 'ready');
  const second = current.roi_handoff.saved_rectangles.find(row => row.annotation_id !== roi.annotation_id && row.usable);
  assert.ok(second, 'No additional usable saved ROI');
  assert.deepEqual(current.roi_handoff.saved_rectangles.find(row => row.annotation_id === roi.annotation_id).rect_xyxy, roi.coordinates);
  assert.equal(second.original_anchor.source_object_id, frame.object_id);
  const edited = await peer.call('image_info', {object_id: saved.object_id});
  const originalView = await peer.call('image_result', {request_id: view.request_id});
  assert.equal(originalView.object_id, view.object_id);
  assert.deepEqual(originalView.annotations, view.annotations);
  assert.deepEqual(edited.annotations.find(mark => mark.annotation_id === second.annotation_id).anchor.coordinates, second.original_anchor.coordinates);
  checked('PASS clean GUI save, original ROI and revised immutable view were read back from the same Panel and provider');

  const contextRead = await peer.call('analysis_read', {analysis_id});
  assert.deepEqual(contextRead.context, startingContext);
  assert.equal(contextRead.context.slots.experiment.ref.objectId, frame.object_id);
  assert.equal(contextRead.context.slots.display.ref.objectId, view.object_id);
  checked('PASS exact AnalysisContext references and revision were preserved');

  const rect = second.rect_xyxy;
  assert.equal(rect.length, 4);
  assert.ok(rect.every(Number.isInteger));
  const stats = await peer.call('image_statistics', {object_id: edited.object_id, rect, request_id: 'smoke-continue-statistics'});
  assert.deepEqual(stats.source_rect_xyxy, rect);
  assert.equal(stats.dtype, 'uint16');
  const expected = expectedStatistics(rect);
  for (const [key, value] of Object.entries(expected)) assert.equal(stats.statistics[key], value, key);
  for (const [file, before] of Object.entries(original)) assert.equal(hash(file), before, file);
  assert.equal(hash(source), report.source_sha256);
  report.saved = {panel_id, save_id, object_id: saved.object_id, frame_object_id: frame.object_id, roi: second, statistics: stats.statistics,
    statistics_request_id: stats.request_id, analysis_id, analysis_revision: startingContext.revision};
  checked('PASS same-frame ROI statistics matched the synthetic original-array truth; input TIFF and original frame/view assets were unchanged');

  const presentation = {panel_id, object_id: stats.object_id, expected_object_id: saved.object_id, draft_revision: current.view.edit_state.draft_revision};
  await peer.call('image_panel_show', {...presentation, request_id: 'smoke-show-statistics'});
  const shown = await peer.call('image_panel_current', {panel_id});
  assert.equal(shown.view.object.object_id, saved.object_id);
  assert.equal(shown.view.numeric_results.statistics.object_id, stats.object_id);
  assert.equal(shown.view.numeric_results.statistics.request_id, stats.request_id);
  checked('PASS exact saved statistics returned to the same Panel numeric slots while the edited view stayed active');

  console.log('GUI_SECOND_EDIT: draw a third non-overlapping ROI (or move the second saved ROI). Leave it unsaved in the workspace. Waiting up to five minutes.');
  let changed;
  const later = Date.now() + 300000;
  while (Date.now() < later) {
    const inspected = await peer.call('image_panel_current', {panel_id}, {record: false});
    if (inspected.view.workspace_analysis.dirty === true && inspected.view.object.object_id !== saved.object_id && !inspected.view.edit_state.gesture_active) {
      changed = await peer.call('image_panel_current', {panel_id});
      break;
    }
    await delay(1250);
  }
  assert.ok(changed, 'No newer GUI ROI revision was observed');
  const late = {...presentation, draft_revision: shown.view.edit_state.draft_revision, request_id: 'smoke-late-statistics'};
  await assert.rejects(peer.call('image_panel_show', late), /stale|revision|expected|changed|dirty|draft|input/i);
  const afterStale = await peer.call('image_panel_current', {panel_id});
  assert.equal(afterStale.view.object.object_id, changed.view.object.object_id);
  assert.equal(afterStale.view.workspace_analysis.save_id, save_id);
  assert.equal(afterStale.view.workspace_analysis.dirty, true);
  assert.deepEqual(afterStale.roi_handoff.saved_rectangles, changed.roi_handoff.saved_rectangles);
  report.late_result = {sequencing: 'Real GUI edits after provider result completion and before attempted late presentation. Numeric worker overlap was not tested.',
    refused_request_id: late.request_id, edited_object_id: afterStale.view.object.object_id, save_id, dirty_preserved: true};
  checked('PASS late presentation with old view/draft lease was refused; newer GUI ROI edit and last savepoint were preserved');
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = error.stack;
  throw error;
} finally {
  try {
    if (peer) report.provider_exit = await peer.close();
  } finally {
    writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, scrub, 2) + '\n');
    console.log(JSON.stringify({status: report.status, report: path.join(output, 'report.json')}));
  }
}
