# Round 2 frozen audit plan

Source: `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`; tree:
`82facfce75c5909c510cb5014e228918904f5de4`. Remote main was fetched and
confirmed with `ls-remote` on 2026-11-01. PRs #45, #53, #54 are excluded.
This plan was written before executing the new GPA/uncertainty probes.
The independent crystal reviewer had already started preparing its fixtures.

- Worktree: `algorithm-audit-round2-20261101`; branch
  `audit/scientific-algorithms-round2`. No shared worktree, GUI or launcher changes.
- Independent reviewer: actual `gpt-6-astra`, high effort, fresh-context agent
  `/root/astra_round2_crystal`. Owns saved crystal/registration/general/twin chain.
- Main reviewer: nonuniform analytic GPA displacement, bandwidth sensitivity,
  mixed carriers, noise-only inputs, connected support, missing calibration;
  independent Monte Carlo uncertainty with common centre/scale; endpoint and
  correlated-calibration counterexamples. No production implementation generates
  the truth. FFT may produce the input, but is not the displacement/strain oracle.
- Freeze random seeds and parameters in the scripts. Preserve every scientific
  counterexample and any harness failures. Do not select reference regions or
  lower scientific thresholds after observing failures.
- Public saved-worker route is required for representative GPA and crystal cases;
  core-only coverage will be labeled. Existing tests supplement, not replace,
  independent probes. `npm test`, `npm run test:science`, typecheck and relevant
  Python tests run in the independent environment.
- Only synthetic fixtures. A successful computation, mask, tolerance match or
  held-out geometric consistency is not specimen/material accuracy.
- Evidence folders are exclusive (no overwrite). Keep request/response journals,
  hashes, package versions, frozen inputs/parameters, raw array hashes and logs.
- Classification: code/math defect; correct method limitation; inapplicable data;
  excessive interpretation; insufficient evidence; optional improvement.
- Definite small fixes require a separate branch/worktree and PR, after recording
  original failure. Scientific thresholds/method/interpretation changes receive
  proposals only. No auto-merge or stable-baseline movement.

Not qualified by this round: real samples, instrument distortions, dynamical
multislice simulation, calibrated probability of detection/false positives,
large noisy-indexing completeness, GUI claim presentation or 3D identification.
