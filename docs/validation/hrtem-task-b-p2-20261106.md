# Task B P2 correction: actual tool outputs and interpretation scope

Base: `2613a563209c58469132a426c4bc0b636b69c891`, branch
`research/hrtem-baseline-local-20261106`, isolated local repository
`C:\work\microscopy-workbench\hrtem-baseline-local-20261106`.

This corrects feedback only. No GPA/topology kernel, numerical tolerance, source
array, method decision, budget or physical classification algorithm changed.

## Actual next-tool path

1. `image_info` on the exact saved topology object: inspect
   `report.loops[].reflections[]`, specifically `failures`,
   `low_amplitude_path_pixels`, `ineligible_path_pixels`,
   `edge_invalid_path_pixels`. Invalid paths remain unavailable, not zero winding.
2. `image_export` on **each parent GPA object**, choosing a new output directory
   and saving a new unique request ID before dispatch. It exports `amplitude.npy`,
   `low_amplitude.npy`, `valid_phase.npy`, `valid_displacement.npy`,
   `valid_tensor.npy`, `edge_invalid.npy`, scientific metadata, `manifest.json`
   and `provenance.json`. New recommendations carry exact GPA IDs and expected
   hashes for these arrays. A review or `gpa_read` export does not export the
   parent GPA arrays. NPY interpretation uses the GPA `array_manifest` for axes,
   dtype and units; PNG colors are not scientific array values.
3. Optional `image_gpa_read` accepts 1..64 exact integer **local** points and
   returns phase_1/phase_2, ux/uy, exx/eyy/exy/rotation, units, phase_valid,
   tensor_valid and invalid_reason. It does **not** return amplitude or per-band
   low-amplitude masks. Its phase_valid flag comes from valid_displacement;
   it is not a returned per-reflection valid_phase array. Supplied fractional
   anchors are not silently rounded.

The direct regression performs the recommended reads and exports. It checks
actual topology diagnostics, exact returned sample fields, both GPA exports,
the six named array files against saved hashes/values, manifest binding and
provenance. This is not a text-only mock of the recommendation.

## Hypothesis and historical semantics

New output is `source-bound-candidate-assessment-v2`. It includes
`hypothesis_evaluation=free_text_not_parsed_or_tested` and
`numerical_scope=net_image_phase_closure_on_specified_circuits_only`.
Readable text, preview and the input schema say that arbitrary free-text
hypotheses, material displacement and real dislocations are not tested by these
numerical support/opposition lists. Caller-supplied real-space relations remain
separately attributed statements. A direct test changes the hypothesis to an
unrelated gold/real-3D-dislocation assertion and proves all numerical findings,
conditions and recommendations unchanged, with material confirmation false.

The v1 reconstruction is frozen, including its incorrect advice, so original
records retain exactly the same values, sidecars, IDs, journals and hashes.
Current v2 guidance supersedes that advice; a read never silently rewrites v1.
All **8 original v1 reviews** (four worker records plus four MCP records) pass
get/result/full/compact: 32 reads, exact saved payload plus the established
`state=completed` delivery field. All **522 inventory entries** remain unchanged.
Original Task A transferred records/hashes also pass their existing regressions.

## Retained evidence and user example

Sibling evidence directory: `hrtem-task-b-p2-evidence-20261106/cases-final`.
Each case retains full source/truth/NPY files, workspace, original journals,
`receipt.json`, readable report and actual preview. The four independent oracles
remain: positive nonzero closure; negative zero net winding; low-amplitude path
refusal; identical-pixel contrast-only counterexample with prescribed material
displacement zero. Actual compiled MCP writes and restart reads pass for all four.

For a low-amplitude example, the corrected user guidance is:

> 假设只是保留的自由文本，未被解析或检验；数值结论只针对指定回路的净图像相位闭合。
> 路径幅度不足，不能建立合格的非零闭合，也不能据此否定真实位错。
> 用 image_info 查看 topology 的逐路径失败和低幅计数。用 image_export 导出各 GPA 的 amplitude.npy 与 mask，并核对 manifest、provenance 和已保存哈希。
> image_gpa_read 仅用于整数点的相位／位移／张量采样及有效性标志，不提供幅值或逐频带低幅 mask。

The native low-amplitude preview and delivered MCP contrast-vortex preview were
actually inspected locally: scope and corrected next tools are legible. This
does not qualify human GUI usability or real materials.

## Commands and results

PowerShell environment (all temporary output is inside the authorized root):

```powershell
$python='C:\Python313\python.exe'
$evidence='C:\work\microscopy-workbench\hrtem-task-b-p2-evidence-20261106'
$env:TMP=Join-Path $evidence 'temp'; $env:TEMP=$env:TMP
$env:PYTHONIOENCODING='utf-8'
$env:HRTEM_TASK_B_OUTPUT=Join-Path $evidence 'cases-final' # new at initial run
$env:HRTEM_TASK_B_LEGACY_ROOT='C:\work\microscopy-workbench\hrtem-task-b-evidence-20261106'
$env:HRTEM_HANDOFF_ROOT='C:\work\microscopy-workbench\hrtem-handoff-drive-20261106\payload\hrtem-baseline-integration'
& $python -m unittest discover -s tests -p test_hrtem_candidate_chain.py -v
```

`chain-final.log`: **7 current candidate-chain tests PASS**, including actual
recommended outputs, hypothesis non-interpretation and the original four cases.
The newly added historical test initially **FAILed** because it compared a
delivery wrapper directly with object.json and disallowed the existing
`state=completed` field. Inspection showed no missing/changed saved field, only
that wrapper field. The assertion was corrected without changing production code.

```powershell
& $python -c "import sys,unittest; sys.path.insert(0,'tests'); suite=unittest.defaultTestLoader.loadTestsFromName('test_hrtem_candidate_chain.HistoricalTaskB'); result=unittest.TextTestRunner(verbosity=2).run(suite); raise SystemExit(not result.wasSuccessful())"
```

`legacy-final.log`: **PASS**, one test, all 32 historical reads and 522 original
inventory hashes, 51.659 seconds. The initial failure log is retained. The seven
already-passing current tests use identical production code and were not rerun
after this test-only assertion correction.

```powershell
& $python -c "import unittest; patterns=['test_image_discovery_workspace.py','test_gpa_assessment_compatibility.py','test_peak_summary_read_compatibility.py']; suite=unittest.TestSuite(unittest.TestLoader().discover('tests',pattern=p) for p in patterns); result=unittest.TextTestRunner(verbosity=2).run(suite); raise SystemExit(not result.wasSuccessful())"
npm run build
node --test dist/tests/discovery-contract.test.mjs dist/tests/gpa-contract.test.mjs dist/tests/image-evidence-contract.test.mjs
$env:MICROSCOPY_PYTHON=$python
$env:HRTEM_TASK_B_CASES=Join-Path $evidence 'cases-final'
node dist/tools/smoke_hrtem_candidate_review.mjs
git diff --check
```

**PASS**: 30 Python historical/source regressions, no skips (36.419 seconds);
build; 11 Node contract/transport tests, no skips; four actual MCP writes, PNG
delivery, fresh-client compact info/result and unchanged prior evidence; diff
whitespace check. Logs are `historical-regressions.log`, `build-final.log`,
`node-final.log`, `mcp-final.log`. Dispatch markers preserve original write IDs;
the smoke refuses automatic replay.

**NOT RUN / NOT QUALIFIED:** unchanged numerical-kernel full suites, real
specimens, true dislocation identification, human GUI usability and relocation
of the new workspaces across platforms. No new algorithm or host qualification
is implied. No push/merge, F: access or STEM work. Stop after the corrective
commit and wait for independent re-review.


Publication note: machine-specific paths above are generalized examples. Replace them with your own local paths.
