// Dedicated local Panels for manual/browser acceptance on generated fixtures.
// No edits to saved science; stop with SIGINT after checking the displayed cards.
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [repo, python, evidenceRoot] = process.argv.slice(2);
const {createImagePanel} = await import(pathToFileURL(path.join(repo, 'dist/tools/image_panel.mjs')));
const {prepareOwnedPanelRegistration} = await import(pathToFileURL(path.join(repo, 'dist/lib/panel_ownership.mjs')));
const current = JSON.parse(readFileSync(path.join(evidenceRoot, 'actual-gpa/report.json'), 'utf8'));
const legacy = JSON.parse(readFileSync(path.join(evidenceRoot, 'actual-legacy-generated/report.json'), 'utf8'));
const output = path.join(evidenceRoot, 'browser-session');mkdirSync(output);
const configs = [{label: 'current', workspace: path.join(evidenceRoot, 'actual-gpa/workspace/images'), object_id: current.panel.object_id},
  {label: 'legacy', workspace: path.join(evidenceRoot, 'legacy-producer/images'), object_id: legacy.new_views[0].object_id}];
const panels = [];
for (const c of configs) {
  const panel_id = createHash('sha256').update(output + c.label).digest('hex').slice(0, 32);
  const owned = prepareOwnedPanelRegistration({workspace: c.workspace, panel_id});
  const panel = await createImagePanel({workspace: c.workspace, python, object_id: c.object_id, panel_id,
    helper_session_id: owned.helper_session_id, panel_generation: owned.generation, journalDirectory: owned.journalDirectory});
  owned.publish(panel);panels.push({owned, panel});
  // Local capability URL is temporary and must not enter public evidence.
  writeFileSync(path.join(output, c.label + '.json'), JSON.stringify({url: panel.url, object_id: c.object_id}));
  console.log(JSON.stringify({label: c.label, url: panel.url, object_id: c.object_id}));
}
let closing = false;
async function close() {if (closing) return; closing = true; for (const p of panels) await p.owned.close(p.panel);process.exit(0);}
process.on('SIGINT', close);process.on('SIGTERM', close);
