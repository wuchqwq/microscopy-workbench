# Per-site occupancy preservation and admission

This repairs audit #53 E01, independently reproduced before editing the numerical
path. It is a candidate-model integrity fix, not sample-chemistry validation or
an implementation of disordered scattering. Audit/proposal PRs #53/#55/#56 remain
separate from this repair. Base: unmerged GPA increment #58,
`b238f9722b31c2959c871bba210c87977d94c2a8`, tree
`094336d3109bbd6b21c80aed2f91f6baf8c7127d`. Main remains
`b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`; no baseline is moved.

## Original failure and independent truth

ASE extXYZ `occupancy`/`occupancies` columns live in per-atom arrays. The old
`crystallography/structure_tools.py::atoms_data/from_data` retained only info
occupancy; `simulate` and `twin_geometry.qualify` consequently saw a different
model after saving. Two Cu sites at fractional x=0 and 1/2 with fractions [1,.5]
produced exactly the same saved reflection table as [1,1]. Partial FCC passed
saved open→orient→twin admission, although direct qualification refused it.

The hand-computable basis intensity is |1+o exp(iπh)|²: for h=1,2, partial gives
[.25,2.25], full gives [0,4], normalized to the single-Cu form factor at each
same reciprocal magnitude. Direct actual diffsims with the correct site
occupancies independently reproduced both. Product output lost the partial
model's 100 reflection. `baseline.json.gz` preserves the original requests,
responses, source models, original failed harness and corrected harness before
the fix. The first harness error was response-envelope indexing, not a new
scientific failure.

Sources checked 2026-11-02: actual installed ASE 3.29.0 `io.extxyz`, `io.cif`,
`spacegroup.xtal`, and diffsims 0.7.0 `utils.sim_utils` (file hashes in
`site_occupancy_evidence/library-sources.json`). Official
[ASE CIF source](https://docs.ase-lib.org/_modules/ase/io/cif.html) explains
kind→site mapping; [diffsims 0.7.0 source](https://github.com/pyxem/diffsims/blob/v0.7.0/diffsims/utils/sim_utils.py)
supplies the electron kinematic intensity routine actually tested. Its occupancy
weighted coherent sum agrees with this two-site oracle; this does not qualify
experimental thickness/dynamical intensity or occupational diffuse scattering.

## Minimal correction and compatibility

- `crystallography/occupancy.py` resolves supported arrays and CIF info through
  actual `spacegroup_kinds`, then stores canonical per-expanded-site species
  fractions in atom-model v2. Multiple channels must agree exactly. Unknown,
  boolean, nonfinite, out-of-range, conflicting and unmapped declarations fail.
  No rounding to full occupancy, threshold adjustment or channel preference.
- Original source bytes/hash and channel/mapping basis remain recorded. Canonical
  fractions survive save→reload→repeat→rotation. Mixed species never collapse to
  total occupancy or the displayed representative element. Inputs with extra
  unused CIF kind rows are conservatively refused; exhaustive CIF disorder import
  is outside this increment.
- `structure_tools.simulate`, new registration/comparison, twin and general
  comparison share the full-ordered-model gate. Well-formed partial/mixed models
  remain viewable/measurable/derivable, but simulation/twin admission refuses
  before constructing an incorrect fully occupied diffpy model. Missing disorder
  metadata means an explicit ideal-model assumption, never verified chemistry.
- Missing atom version is historical v1 with its exact old five-field snapshot.
  Unknown/explicit v1/null versions fail. Old requests/results keep their old
  interpretation; fresh qualified use requires explicitly reopening the original
  source and repeating declared derivations under new IDs. No silent migration.
- General evidence/qualification v2 is used for new outputs. Historical general
  v1 validation dispatches its original occupancy policy. It is not exposed as
  a new-request switch. Viewer transport accepts both schemas but only projects
  geometry; it does not certify occupancy. New result provenance hashes include
  the occupancy policy module.

## Executed validation

Python 3.13.18; all 50 installed dependency versions match the inherited exact
lock list; npm ci uses unchanged package-lock (TS 5.9.3). Raw records, source and
array hashes, exact stdout/stderr and independent review are packaged under
`site_occupancy_evidence/`. Binary scientific arrays remain in the isolated local
analysis directories; hashes and synthetic generators are retained for review.

| Check | Actual outcome |
| --- | --- |
| New independent analytic/negative controls, actual ASE/diffsims | 8 PASS |
| Existing general, twin and qualification Python suites | 17 + 35 + 11 PASS |
| Actual saved old/new worker chain | 32 calls each, completed |
| Old history in its original bound workspace | 16 records, 64 calls; 619 original files unchanged |
| Actual public stdio MCP twin and general crystal smokes | PASS, analytic q/HKL and negative candidates |
| Node full suite | 409 PASS, 5 explicit optional SKIP, 0 FAIL |
| Typecheck/build; standalone science smoke | PASS |
| Independent GPT-6-astra review | 8 executed tests + 12 fresh worker calls + mapping/corruption probes |

Independent review requested the missing new module hash; this was corrected.
The original review remains preserved with its dated resolution. Initial Node
and science runs hit the sandbox loopback restriction; approved reruns passed.
One science invocation raced the test suite's rebuild and saw a missing dist
file; its log is retained, then the completed build was tested sequentially.

Reproduce new controls: `.venv/bin/python -B tests/test_site_occupancy.py -v`.
Set `MICROSCOPY_OCCUPANCY_OUTPUT` to a fresh absolute directory to retain requests
and hashes. Generate the old full chain using `tests/fixtures/science_fix_saved.py`
with `MICROSCOPY_TEST_REPOSITORY` at the frozen base, then run
`tests/fixtures/site_occupancy_history.py OLD_RUN FRESH_OUTPUT` under current code.
Do not copy path-bound objects to another workspace or edit their hashes.

Real materials, dynamical/partial-occupancy scattering, actual browser visuals,
and exhaustive external formats are **NOT_TESTED**. The two remaining Fourier
overlap/flat-spectrum defects are separate repairs. Candidates may still be
discussed without a simulation; a refused numerical check remains unperformed,
not confirmation or exclusion of the physical explanation.
