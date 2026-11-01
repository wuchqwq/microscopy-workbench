# GPA evidence boundary: independent attachment review

The supplied patch fixes a reproduced loss of saved GPA assessment fields at
the Panel projection. This increment retains that fix, corrects three further
presentation issues found during review, and narrows the current automation
guidance to joint interpretation of existing images. It does not change a
scientific numerical kernel or repair the three remaining algorithm defects.

## Source and isolation

- Remote main rechecked: `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`.
- Independent branch `fix/gpa-evidence-boundary`, worktree
  `gpa-evidence-boundary-20261102`, based on unmerged #57 at
  `4141225653b41b134a76c5b2119888c01c481f54`, tree
  `d53fa691181d6d2ae348dffe10f3c76b148e17f0`.
- Attachment SHA-256:
  `8ae7e2d4ab99281bce5d71750f806851d38ab55ba0eb953c1e3e8afa4bc69085`.
  All 38 declared member hashes match. Applying only its patch produces exactly
  the declared Git tree `f14e8368c87b0eccdc6bf3d5f2f812bf5561ecd0`.
- Read AGENTS.md, HANDOFF.md, patch, actual logs and validation record before
  applying. Attachment instructions were review material, not authorization.
- #45/#53/#54/#55/#56/#57 were open. #54 is not part of this tree; its interaction
  protections must be preserved in later integration. Shared GUI worktree and
  launch scripts were not modified. No merge or baseline/tag movement.

The attachment correctly reported that its dependency install failed, its local
TypeScript/Node types differed from the lock, and an initial GPA command timed
out. Those records remain separate from the successful local rerun below.

## Independent findings and corrections

1. **Original #57 defect reproduced.** A controlled provider supplied an actual
   assessment-shaped object, material flag and interpretation. The real owned
   Panel HTTP response and MCP manager response omitted them. The same probe
   after correction preserves the assessment exactly, with no new science.
2. **Malformed known-v1 diagnostics were accepted.** Valid JSON with
   `reason_codes={}` or an empty/broken transfer was rendered as recognized
   evidence. Shallow checks now recognize the fields being described; bounded
   unknown data remains visible as diagnostics. This is shape recognition, not
   a recalculation, probability estimate or material-model validation.
3. **Malformed outer verification flags disappeared.** A string `"true"` was
   silently omitted and the remaining assessment looked ordinary. An explicit
   `invalid_outer_evidence_fields` projection marker now accompanies the retained
   bounded assessment. Saved objects are not changed or normalized.
4. **Unchanged render collapsed expanded details.** The card was rebuilt on every
   ResearchWorkspace render. A bounded presentation signature now preserves the
   open details node; a changed object/evidence or non-GPA navigation resets it.

The last three cases have retained failing regressions against the original
attachment and passing final controls. Own-property lookup also prevents reason
names such as `constructor` from resolving to JavaScript prototype members.

The presentation copy is bounded by depth, node count, array/object entries and
text length. Admitted JSON is copied without truncation; over-budget/nonfinite
data produces an explicit unavailable marker. This bounds the new assessment
projection, not every pre-existing Panel input or the whole MCP parser.

Unknown versions and contradictory flags do not become material validation.
Absent historical assessment remains absent and is displayed as not recorded.
Direct `gpa`/`gpa_view` are supported; this patch does not invent inheritance
through arbitrary wrapper objects. Old interpretations, arrays, requests,
scientific schemas and mathematical thresholds are unchanged.

## Execution on locked dependencies

macOS arm64, Node 24.22.2, npm 11.19.1, Python 3.13.18. `npm ci` installed exactly
TypeScript 5.9.3, @types/node 18.19.130 and undici-types 5.26.5 from the unchanged
lockfile. A new Python venv was synchronized to all 50 exact versions recorded
in #57's `docs/science_fix_evidence/packages.txt`; the resulting set matches.

| Executed check | Result |
| --- | --- |
| Build and typecheck with locked dependencies | PASS |
| `npm test`, including build | 413 total; 408 PASS, 5 conditional SKIP, 0 FAIL |
| Independent reviewer focused tests | 21 PASS, subset of full suite |
| Independent reviewer fresh HTTP/MCP-handler cases | 13 PASS, real saved assessment plus adverse controls |
| `tests/test_scientific_evidence_semantics.py` | 9 PASS |
| Actual `test:science` | PASS |
| Actual `test:gpa` | PASS: Python -> saved GPA/view -> owned HTTP -> formal stdio `image_panel_current` |
| Genuine historical GPA/read/view | 3 exact recoveries, 2 HTTP/formal-MCP presentations, 40 original files unchanged |
| Real browser display/gestures | **NOT_TESTED**, origin permission rejected |
| Combined integration with #54 | **NOT_TESTED** |

The actual GPA smoke retains the independent finite-affine oracle, signed metric,
reference/mask revisions, exports and original-request recovery. Its new formal
MCP read matches the saved assessment and creates no science objects. Source and
FFT hashes remain unchanged; the fixture has one forward FFT.

For historical acceptance, a first attempt to relocate an old workspace failed
with `Image result escapes workspace`. This was a valid bound-path refusal;
no old paths/hashes/tolerances were rewritten. A dedicated synthetic fixture was
then generated at its permanent path by the frozen pre-assessment provider at
`6c24dd7385cef2ca79b59460767e7fe8278c7732`. Its GPA/workspace modules are byte-identical
to main `b6dd9075...`. Current code recovered its original GPA/read/view, generated
a new view from the old parent with assessment still absent, and displayed both
the old GPA and new derived view as `not_recorded` through HTTP and formal MCP.
All 40 pre-existing files, including requests and array hashes, remain unchanged.

The initial local bind/network sandbox failures and the reviewer's own malformed
fixture attempt are retained and distinguished from scientific failures. No
tolerance or production admission was weakened to obtain a passing run.

Browser origin permission was rejected before loading the isolated Panel. No
alternate surface or browser workaround was attempted; test servers were closed.
Actual ResearchWorkspace DOM-port tests establish rendered content and state
retention, not browser layout, gestures or human/AI concurrency acceptance.

## Reproduce and inspect

Run `npm ci`, `npm test`, `npm run typecheck`; set `MICROSCOPY_PYTHON` to a dedicated
environment synchronized to the package list above. Run `npm run test:science`
and `npm run test:gpa`, assigning a fresh absolute `MICROSCOPY_SMOKE_OUTPUT` for
the latter. Numeric libraries used one thread; no numerical tolerance changed.

- `tests/fixtures/gpa-panel-boundary-probe.mjs`: before/after projection probe.
- `tests/fixtures/create-legacy-gpa.py`: genuine legacy producer using a supplied
  frozen source checkout, never by deleting fields from a current object.
- `tests/fixtures/gpa-evidence-history.mjs`: current read/derived-view/Panel checks
  at the original bound path. Use a dedicated generated `images` workspace.
- `tests/fixtures/serve-gpa-evidence-review.mjs`: optional isolated browser review
  server for these generated fixtures. Its temporary capability URLs are not
  included in the public evidence package.

[Validation summary](evidence_boundary_review/VALIDATION.json),
[independent GPT-6-astra final review](evidence_boundary_review/INDEPENDENT_REVIEW.md),
[original attachment findings](evidence_boundary_review/ORIGINAL_PATCH_REVIEW.md)
and compressed raw records are retained in `docs/evidence_boundary_review/`.
Each gzip JSON maps original relative names to exact text and SHA-256; the worker
archive includes source/request/manifests and array hashes. Generated TIFF/NPY
files remain in the isolated local analysis directory. The evidence is synthetic.

## Product scope and remaining work

Researcher and Agent may both initiate, propose and revise a few explanations
grounded in observed images, measurements and stated material context. Discussion
does not require user-supplied candidates or completed simulations. Formal tools
still require their declared inputs. Observations, rationale, executed checks,
conflicts and unresolved alternatives must stay distinct; no uncalibrated
probabilities or automatic experimental planning is introduced.

Default: explicit ROI -> period/direction measurement -> conditional finite
comparison -> inspectable evidence. Advanced tools remain scoped diagnostic
entries. Skills guidance is not an API ban or an algorithm repair.

Next separate scientific repairs remain ordered: per-site extXYZ occupancy loss,
overlapping Fourier-band redundancy, then flat-spectrum roundoff peaks. This PR
does not claim them fixed. No new candidate database, Agent framework, universal
decision system or large numerical-method replacement is included.
