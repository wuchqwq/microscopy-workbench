import assert from 'node:assert/strict';
import test from 'node:test';
import {readSmokePanelCurrent, SmokeToolError} from './helpers/windows-smoke-panel-current.mjs';

const panelId = 'same-panel';
const conflictMessage = '错误: Panel changed while reading ROI handoff; read the current state again without replaying science';
const conflict = () => new SmokeToolError(conflictMessage);
const readCall = (record = true) => ['image_panel_current', {panel_id: panelId}, {record}];

function mockPeer(responses) {
  const calls = [];
  return {
    calls,
    async call(...args) {
      calls.push(args);
      assert.ok(responses.length, 'Unexpected extra call');
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

test('rereads the same Panel after the exact read-only conflict and preserves recording mode', async () => {
  const firstError = conflict();
  const current = {panel_id: panelId};
  const peer = mockPeer([firstError, current]);
  const retries = [];
  const result = await readSmokePanelCurrent(peer, panelId, {record: false, onRetry: (...retry) => retries.push(retry)});
  assert.equal(result, current);
  assert.deepEqual(peer.calls, [readCall(false), readCall(false)]);
  assert.deepEqual(retries, [[1, firstError]]);
});

test('stops after twelve read attempts and preserves the final provider error', async () => {
  const errors = Array.from({length: 12}, conflict);
  const peer = mockPeer([...errors]);
  const retries = [];
  await assert.rejects(readSmokePanelCurrent(peer, panelId, {onRetry: (...retry) => retries.push(retry)}),
    error => error === errors.at(-1));
  assert.deepEqual(peer.calls, Array.from({length: 12}, () => readCall()));
  assert.deepEqual(retries, errors.slice(0, -1).map((error, index) => [index + 1, error]));
});

test('fails immediately for other tool errors, transport errors, and unknown outcomes', async () => {
  const failures = [
    new SmokeToolError('错误: Stale panel object'),
    new SmokeToolError(conflictMessage + ' Additional details'),
    new Error(conflictMessage),
    new Error('Stopped waiting on the original RPC; do not replay the effect'),
  ];
  for (const failure of failures) {
    const peer = mockPeer([failure]);
    await assert.rejects(readSmokePanelCurrent(peer, panelId, {onRetry: () => assert.fail('Unexpected retry')}),
      error => error === failure);
    assert.deepEqual(peer.calls, [readCall()]);
  }
});

test('a conflict after calculation and presentation only repeats the read', async () => {
  const stats = {object_id: 'stats'};
  const presentation = {panel_id: panelId, object_id: stats.object_id, request_id: 'show-once'};
  const statisticsArgs = {object_id: 'saved-view', request_id: 'calculate-once'};
  const current = {panel_id: panelId, statistics: stats};
  const peer = mockPeer([stats, {presented: true}, conflict(), current]);
  await peer.call('image_statistics', statisticsArgs);
  await peer.call('image_panel_show', presentation);
  assert.equal(await readSmokePanelCurrent(peer, panelId), current);
  assert.deepEqual(peer.calls, [
    ['image_statistics', statisticsArgs],
    ['image_panel_show', presentation],
    readCall(),
    readCall(),
  ]);
});
