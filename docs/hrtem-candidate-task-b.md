# HRTEM Task B: explicit candidate evidence composition

This increment composes the existing `image_discovery_review`, fixed-g GPA,
v3 saved-mask topology and finite method-loop contracts. It adds no detector,
fringe/plane tracer, numerical engine or physical classifier. Qualification is
synthetic software acceptance, not experimental-material accuracy or GUI usability.

## Input and binding

Select an explicit source-pixel ROI through `image_discovery(entry="manual")`.
`selection_origin` describes the caller-reported selector, not authentication.
Run existing FFT/GPA/topology tools with explicit requests and budgets.
Then add optional `candidate_assessment` to `image_discovery_review`:

```json
{
  "hypothesis": "Specified nonzero projected closure candidate",
  "real_space_evidence": {
    "origin": "synthetic_construction",
    "source_text": "Actual construction or manual-review source; include retained artifact/hash references",
    "observation_text": "Supplied statement, kept separate from measured numerical evidence",
    "relation": "unknown",
    "anchors_xy": [[128.5, 128.5]]
  }
}
```

Origins are `manual_review`, `specified_points` or `synthetic_construction`.
Relations `supports/opposes/unknown` are caller statements. Neither a source
string nor a supplied hash authenticates external evidence. The original journal
binds the statement and anchors; it does not independently read or certify an
external displacement file. This round uses only explicitly supplied construction
truth, with source TIFF, truth JSON and displacement NPY retained and hashed.
No lattice planes or atomic positions were automatically observed/traced.

The opt-in review requires exactly one existing topology and one
`projected_topology` method plan among its 1..8 evidence IDs. It admits current
v3 topology, with saved Fourier-mask dependency qualification, including refusal
outcomes. The method plan must reference the identical GPA objects, paths and
model assumption. A completed method child must be the exact supplied topology.
For a direct topology control, the report explicitly says that this was outside
the method budget; a policy stop is never rewritten as an executed action.

Existing discovery admission still checks exact source/frame identity, array hash,
ROI and calibration. GPA/topology admission checks the shared FFT/grid, reference,
mask, saved arrays and journals. Review creates no FFT, GPA or topology operation.
The returned `candidate_result` is versioned
`source-bound-candidate-assessment-v1`; it is reconstructed exactly from the
original statement and qualified evidence on reads, with no new float tolerance.
An absent opt-in retains the historical review contract and cannot acquire a
candidate result. Historical v1/v2 topology remains separately readable; this
composition does not promote it to v3 qualification.

## Result for a materials user

The ordinary response, its preview footer and `candidate-review.txt` present
supports, opposes, unknown and next tools. Claims retain their authority:

- **Supports:** saved nested circuits can support conditional nonzero *image-phase*
  closure. Caller real-space support is separately marked as supplied input.
- **Opposes:** valid zero winding opposes nonzero net closure on those paths;
  a supplied opposing real-space statement retains its caller origin.
- **Unknown:** invalid/partial paths do not become physical negative evidence.
  Even qualified closure does not establish a material dislocation, unique 3D
  Burgers vector, independent observations, or a validated image-formation model.
- **Next tools/data:** `image_gpa_read` for saved amplitude/validity and reference
  support, `image_profile` on explicit real-space lines, then independent
  lattice-position/structure evidence and an appropriate image-formation model
  or additional imaging data. The final step is a data need, not an implemented
  automatic identification tool.

For the contrast-only counterexample, a readable Chinese interpretation is:

> 支持：两个嵌套回路在已保存的三个方向上给出一致的非零图像相位闭合。
> 反对：调用者提供的对比系数构造规定材料位移为零，因此反对把这个构造解释为材料位错。
> 未知：同一组像素能来自位移模型，也能来自纯对比调制；图像相位拓扑无法独立区分。
> 下一步：先检查幅度、参考与路径有效性，再检查明确指定的实空间剖面；物理确认需要独立晶格位置或结构证据以及成像模型／额外数据。

The executable report stays in the provider's existing English vocabulary.
No overall material-confirmed label is inferred from the four lists.

## Four retained synthetic controls

All images are 256x256 float32 TIFFs. Explicit candidate ROI is `[0,0,256,256]`,
centre `(128.5,128.5)` source pixels, carrier vectors are `(1/8,0)`, `(0,1/8)`,
`(1/8,1/8)` cycles/pixel. Existing GPA pairs `[0,1]` and `[0,2]` deduplicate the
shared reflection; Gaussian sigma is `.012` cycles/pixel. Reference is
`[56,56,88,88]`, `fixed_g`, explicitly supplied rather than certified defect-free.
Paths are `[80,80,176,176]` and `[64,64,192,192]`, half-open rectangles in local
FFT pixels, `positive_image_xy` (E,S,W,N on the y-down image). There is no
physical calibration in these controls; projected closure is in pixels.

| Case | Supplied real-space construction | Existing numerical result | Interpretation |
| --- | --- | --- | --- |
| Positive | `volterra_fixture()`: prescribed `u=b*atan2/(2*pi)`, `b=(8,0)` pixels, tapered carriers | Both loops `[-1,0,-1]`; conditional fitted closure `(8,0)` within existing `1e-6` fixture tolerance | Supports the specified synthetic model and image-phase closure; no material validation |
| Negative | `null_fixture('none')`: undeformed carriers, `u=0` | `no_net_winding_detected` | Opposes nonzero net closure on these paths; not universal defect absence |
| Low amplitude | Positive construction then explicit `I[:,152:]=0`, crossing both right path edges | `insufficient_loop_stability`, low-amplitude ineligible path samples | Unknown/refusal; no physical rejection or aperture relaxation |
| Contrast vortex | `contrast_vortex_fixture()`: fixed lattice, material `u=0`, spatial complex contrast coefficients | Exactly the same float32 image pixels, loop winding and conditional closure as positive | Image topology alone cannot distinguish displacement and contrast origin |

The winding oracle comes from geometric enclosure and prescribed `-G*b`, not
the sampled circulation code. These are analytic multitone textures, with no
multislice, atomistic structure, real specimen or real-dislocation confirmation.
The positive and contrast examples deliberately demonstrate non-identifiability.

The method loop proposes and executes topology for positive/contrast cases.
It stops at `clean_finite_saved_phase_roi` for the negative and
`phase_quality_limited` for low amplitude. The requested negative/refusal
topology checks use separate direct requests; they do not reset policy or budget.

## Verification and review entry points

`tests/test_hrtem_candidate_chain.py` retains complete fixtures when
`HRTEM_TASK_B_OUTPUT` names a **new absolute directory**. It verifies four
real worker chains, unchanged inputs/dependencies, exact get/result/compact,
foreign-frame and path mismatches, missing/invalid source and anchors,
coherent own-hash assessment tampering, readable text/units and exported method
dependencies. A fixture client acknowledges delivered previews; this is not human
GUI acceptance. `tools/smoke_hrtem_candidate_review.mts` then exercises four actual
compiled MCP writes, PNG delivery, client restart and exact compact reads.

The local evidence directory and exact commands/results are recorded separately
in `docs/validation/hrtem-task-b-20261106.md`. The complete saved workspaces keep
request journals, topology paths and arrays; a single JSON prose summary cannot
replace them. Export now follows existing method plan/step references as well
as discovery evidence references, retaining the budget root, completed attempts
and child evidence. Source software provenance includes the new composition
helper hash. Old evidence is never regenerated or resaved to adopt this result.
