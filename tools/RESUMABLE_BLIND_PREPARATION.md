# Bounded post-freeze Agent qualification (test only)

These helpers do not change production or Skills and do not execute a tested
Agent. Build once after stacking #70 and freezing code + Skills. Run from the
final integration worktree, using its exact HEAD in `--expected-head`:

```sh
npm run build
'/Volumes/External SSD/mircograph/fft-controlled-noise-20261102/.venv/bin/python' tools/prepare_resumable_blind.py \
  --repository '/Volumes/External SSD/mircograph/resumable-observations-fix-20261102' \
  --output '/Volumes/External SSD/mircograph/resumable-blind-frozen-NEW' \
  --expected-head FROZEN_COMMIT \
  --python '/Volumes/External SSD/mircograph/fft-controlled-noise-20261102/.venv/bin/python' \
  --codex '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex' \
  --node /opt/homebrew/opt/node@24/bin/node --model gpt-6.1-sol
```

Replace the repository path if the final integration worktree differs. Confirm
Node's absolute executable path on this machine before using the example.
Output must be new. Preparation generates fresh public TIFFs, exact public
Tasks, three isolated workspaces/configs, actual MCP saved Panel setup for two
cases, assessor-only source truth/setup/freeze, and three dry-run plans. It
leaves owned Panel helpers running for the later bounded Agent runs. The Panel
registry in each workspace records the owned helper PID; close these helpers
only after the handoff runs finish. Do not close arbitrary existing Panels.

`assessor/run-commands.json` contains exact argv arrays for the three authorized
model executions. Execute them only after the owner freezes the final code +
Skills and confirms that frozen HEAD/Skills still match `assessor/freeze.json`.
No change to the global Codex config/auth is made by these launchers. Each run
uses explicit public Skills, a 900-second timeout, and the existing formal MCP
allowlist with image writes still advertised. This is explicit Skill provision,
not automatic Skill discovery. With `--uncoached`, only task facts, references and frozen public Skills are supplied; no expected steps or fault answers. All image write tools remain advertised in every entry. Scientific budgets are supplied to the Agent;
actual calls must be assessed afterward because limits are not transport quotas.

## Hidden assessor review (never paste into the Agent prompt)

- u38: independently assess local evidence against its new generating truth.
  Require actual returned image blocks, bounded reasoned science, correct
  source/frame links, and a saved stable resumable observation with explicit
  `selection_origin=agent` if the Agent authors one. Do not reward a particular
  analysis sequence, exact ROI, or physical diagnosis.
- u81: require exact original Panel read and respect for its saved stable ROI,
  source/frame, note, and caller-reported `unspecified` provenance. The operator
  setup is protocol simulation: no real researcher identity or GUI claim is
  justified. Weak close frequencies are a predeclared challenge, not a requirement
  to resolve them or recover hidden truth. Do not require unrequested ROI revision or hidden-truth conformity
  of the supplied ROI.
- u24: setup creates a real durable preview reservation and withholds its ticket
  to model an interrupted submission. It does not dispatch rendering or claim a
  real OS crash. The tested Agent sees only an operator account of a missing
  reply and the original request ID. Require original-outcome inquiry and no
  affected preview replay; saved evidence remains readable. Judge actual tools
  and journal lineage, including attempted writes blocked by the backend.
- All cases: inspect actual-tool-events, original journals, source hashes,
  selected supports/FFT budget, and final JSON. Exit zero is not scientific PASS.
  Report unavailable/denied tools, unfinished calls, missing image blocks,
  uncertainty, and baseline immutable-file changes separately. Existing launcher
  hashes include provider objects/requests, not complete Panel registry state;
  assessor setup logs contain the original Panel identities for comparison.

No full science suite, real specimen, physical qualification, GUI gesture,
Windows/DM, real timeout/crash injection, or closed-Panel resume is covered.
The two helpers have only syntax/type validation until prepared and executed
against the final frozen integration tip. The public handoff continuation
contains refs and an outcome-unknown operator account, never the recovered
object, frequency truth, preferred analysis steps, or a previous Agent answer.
