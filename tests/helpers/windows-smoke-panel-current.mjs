import {setTimeout as delay} from 'node:timers/promises';

const retryableMessage = '错误: Panel changed while reading ROI handoff; read the current state again without replaying science';
const maxAttempts = 12;

export class SmokeToolError extends Error {}

export async function readSmokePanelCurrent(peer, panelId, {record = true, onRetry = () => {}} = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await peer.call('image_panel_current', {panel_id: panelId}, {record});
    } catch (error) {
      if (!(error instanceof SmokeToolError) || error.message !== retryableMessage || attempt === maxAttempts) throw error;
      onRetry(attempt, error);
      await delay(200);
    }
  }
}
