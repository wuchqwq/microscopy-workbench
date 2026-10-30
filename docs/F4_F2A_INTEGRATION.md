# Independent F4-lite / F2a integration qualification

## Scope and identity

This candidate combines **F4 PR #35 at `3678c54a0b8c57ec027fcfd03fd856489d26184c`**
with **F2a PR #36 at `fc3a207fceeeab9f0285ab02596859d90b84d80c`** on
`review/f4-gpa-integration-20261030`. Neither source branch nor `main` was
moved. This is a review candidate, not a main merge or release.

The numerical code was qualified at integration commit
`83dc06e19b080c4ca5b9bfbe1724c97bce392e13` (tree
`94bb05f0c46c26c2b076d75b625f3ed434a3d4ce`). The subsequent closeout only removes
the temporary assembly workflow/recipe and adds this record and a numeric
summary. The normal PR CI separately tests the final combined head.

## Reconciled interfaces

- Both families of tools, recipes, source provenance and export routes coexist.
- The F4 dependency-closure verification, compact projections and manifest-bound
  evidence pages remain intact; GPA participates in the same validation entry.
- The frozen-catalog check retains all exact old schemas/descriptions, allows
  the five named F1a/F4 additions plus the three named GPA additions, and keeps
  the explicitly qualified optional compact/context fields. GPA catalog
  negative tests remain present; no unrestricted additions are allowed.
- F4 and GPA CI jobs coexist with the tested documentation-only change gate.
- The packaged Skill contains both active follow-up and explicit single-domain
  GPA instructions. GPA still has no invented AnalysisContext role.
- GPA core/provider and the F4 contact graph, evidence projection, incremental
  field and active-policy modules retain their respective original bytes.
  No numerical formula, physics tolerance or frozen historical record changed.

## Executed independent tests

The actual Linux hosted-runner [assembly/qualification run](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41023949236)
compiled the combined sources, ran tests and then published only the isolated
candidate branch. Its temporary write-enabled assembly workflow has been
removed; normal CI remains read-only.

| Check | Actual result |
| --- | --- |
| Strict TypeScript typecheck/build | PASS |
| Combined portable Node suite | 315 PASS, 5 explicit skips, 0 FAIL (320 total) |
| GPA core/physics/workspace | 28/28 PASS, 6.058 s |
| New cross-feature compiled MCP handoff | PASS, about 24.836 s |
| Existing standalone science/direct DFT smoke | PASS |
| Copied-package frozen-JS compatibility | 2/2 PASS, about 8.186 s |

The new `tests/f4-gpa-integration.test.mjs` uses a public 192x192 float32 cosine
image and a **128px F4 observation** at full-frame rectangle `[16,24,144,152]`.
It creates a contact-domain map, requests a budgeted action and appends one 32px
observation. The exact saved 128px spectrum then feeds GPA with explicit basis,
reference and signed anisotropic metric `[0.02,-0.03]` nm/pixel.

The 32px FFT is deliberately refused by GPA: no replacement FFT or hidden
upsampling is performed. The independent target is `F=diag(16/15,1)`, with
`E_xx=0.06888888888888889`; the sampled output was `0.06888889013447219`.
This is a periodic synthetic check, **not experimental strain precision**.

The workflow further verifies parameter revision, view-only changes, masked
sample nulls, compact GPA reads, F4 exact-manifest detail reads, budget stop,
dependency-ordered named F4 context, both scientific exports and fresh-client
recovery of field/map/GPA/view/sample objects. It performed 38 formal calls,
including the one expected small-window refusal. Total forward FFTs stayed at
**two**: one initial F4 spectrum and one appended observation. GPA, its revisions,
exports and recovery added no forward FFT. Original source, initial field,
initial FFT and prior GPA object hashes remained unchanged.

See [the numeric summary](examples/f4-gpa-integration/summary.json). Full logs,
exact runtime report and a Git bundle are retained in the run's
`f4-gpa-assembly-evidence` artifact. Test scope is distinct from a model run.

## Reproduction

From the combined candidate, use the independent science environment with
`requirements-gpa.txt`, build once, and run:

```sh
npm run typecheck
npm test
python -B -m unittest discover -s tests -p 'test_image_gpa_*.py' -v
npm run test:integration:f4-gpa
npm run test:science
npm run test:compiled:compat
```

Set `MICROSCOPY_PYTHON` to the absolute interpreter path. An optional
`MICROSCOPY_INTEGRATION_REPORT` saves the new cross-feature report at an explicit
path. The test creates its own temporary synthetic workspace, not a user task.

## Remaining scopes and retained failure

Actual GUI gestures, a fresh model independently choosing GPA/understanding the
combined Skill, real specimens, and GPA-specific interrupted-worker injection
remain **NOT_TESTED**. They are not silently qualified by HTTP, PNG or scripted
MCP success. GUI qualification can proceed separately and does not block F3a
algorithm development on this explicitly reviewed candidate.

The first assembly attempt [failed before scientific tests](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41023693324)
because its integration script expected the older Skill description text.
The exact anchor was corrected; the successful run used a new commit and
retained the first failure. No numerical tolerance or source PR was changed.
