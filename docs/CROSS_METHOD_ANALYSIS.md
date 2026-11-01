# F4-full first slice: an inspectable method decision

This increment starts at main `9fbc769` after reviewed F3b. It is a reusable
cross-method decision interface, not a requirement to run every scientific tool.
First scope: **saved fixed_g GPA → optional extra phase direction → conditional
wrapped-phase topology → reassess/request information/stop**. Domain/twin-driven
routing, additional source ROIs and multiframe strategies remain future work.
All existing tools remain directly callable. There is no hidden model call,
new numerical engine, scheduler database or instrument connection.

## Scientific gates

The starting GPA must already have the exact qualified unwindowed real-image
FFT, lattice-image declaration, source/calibration/grid, reference and Fourier
mask. A domain-map label alone does not establish these. A Hann/small FFT is
not silently replaced. Missing physical scale remains pixel-domain evidence;
no nanometre or 3D material interpretation is invented.

The policy reads saved wrapped-phase/amplitude diagnostics, not smooth strain
hotspots. Zero eligible residues alone are insufficient: a masked low-amplitude
core may have zero eligible plaquette residues but nonzero amplitude/discontinuity
diagnostics. Conversely a smooth displacement hotspot can have no closure target.
Fixed, disclosed quality guards stop low-support/noisy evidence. They are heuristic
method priorities and limits, not calibrated defect probabilities or confidence.

One sourced extra GPA pair may add a third resolved, nonharmonic direction on
the same FFT. Finite FFT-bin resolution and a 1-degree separation floor prevent
floating-point/Friedel/harmonic jitter from manufacturing redundancy. Explicit
model assumptions and oriented local-grid circuits are required; the policy does
not guess a core, g vector, strain-free patch or material model. Missing information
requests it. Existing GPA/topology admission still checks every scientific input.

Three resolved directions and nested circuits permit the existing topology tool,
not a confirmed defect label. Every topology group keeps its own status. The
intensity-identical contrast-vortex counterexample demonstrates that consistent
projected winding need not be a material dislocation. Results remain hypothesized.

## Public tools

`image_method_plan` starts one explicit additional-work budget. Inputs:

```json
{
  "object_ids": ["<saved fixed_g GPA ID>"],
  "budget": {"method_calls": 2, "fft_pixels": 0,
    "gpa_band_pixels": 131072, "topology_path_samples": 5328},
  "information": {
    "goal": "projected_topology",
    "followup_g_vectors": [[0.125, 0], [0.125, 0.125]],
    "followup_basis": "Explicit candidate/source, not automatic material indexing",
    "model_assumption_text": "A stated simple projected closure working model",
    "loops": [
      {"rect": [80,80,176,176], "orientation": "positive_image_xy"},
      {"rect": [64,64,192,192], "orientation": "positive_image_xy"}
    ]
  },
  "request_id": "save-before-submission"
}
```

These numbers are the public synthetic example, not defaults for experimental
images. Inspect returned `decision`, `actions`, reasons, preconditions, source
references, `ledger` and `next_request_id`. No science executes during planning.
The Agent may accept, supply revised information or stop.

`image_method_step` executes exactly one saved scientific action (`gpa` or
`topology`). Information requests and stops are decisions, handled by the next
tool's information patch/user-stop flag rather than a zero-cost step. Pass plan `object_id`,
`root_plan_id`, `action_id`, actual `selection_reason` and the **exact** returned
`next_request_id` as `request_id`. It saves the child request and reservation
before invoking ordinary `image_gpa` or `image_topology`. A completed step is a
completed orchestration record; inspect `child_receipt` for scientific success.

`image_method_next` accepts the last plan/step `object_id`, optional
`information_patch`, optional `user_stop`, and a new saved request ID. It reads
all root attempt slots, reuses valid saved evidence and proposes/stops again.
Revising information does not reset the budget. Old proposals remain historical;
an attempt-snapshot change rejects stale execution. Proposal history is bounded
at 16 and additional step slots at 8. There is no global mutable latest selection.

`image_info` and `image_result` retain their existing read/query roles. Query an
original step after lost response; an unknown result never means permission to
retry. Inspect `image_method_next` from its saved plan/root for original child IDs
and costs, then query that child. A new proposal may observe a later verified
child completion without rewriting the old unknown record or replaying science.
Unreadable/unknown costs block new scientific dispatch. AnalysisContext stays
reference-only; no new GPA/topology Context role was added.

## All-attempt accounting and recovery

Only the existing request journal is authoritative. Slots are named
`method-<root ID>-1` through `-8`, validated before new journal creation. Exclusive
creation prevents multiple clients from forking the same successor. Future slots
cannot create a hole. Existing IDs preserve normal conflict/dedup/query behavior.

Each submitted slot consumes a method attempt, even when preflight refuses it.
Before scientific dispatch, the original journal fsyncs the full child payload,
identity, selected reason and reservation. GPA reserves two band-pixels per array
pixel; topology conservatively reserves six bands times all circuit perimeter
samples. Dispatched failure/unknown retains that reservation. Known preflight
refusal reserves no scientific pixels. Unknown/unreadable cost is never called
zero. These work bounds are not equal CPU costs.

Elapsed times use a monotonic clock and include failed submissions. Internal
decision/step wall time and measured external MCP round trip are reported
separately; unreported worker stages/startup CPU time remain unknown. Reused seed
GPA/FFT history is listed separately with unknown historical elapsed, not charged
again as new work. A new root is explicitly a new budget, never a way to disguise
continuation of unknown work.

Historical plans validate source hashes and reconstruct policy against their
frozen evidence/attempt snapshot, not today's journal outcome. No old F4/GPA/
topology schema, scientific array or numerical tolerance was changed. The only
shared transport fix preserves original failed/unknown partial receipts when a
real Python worker exits with code 1; foreign identity/backend/retry flags refuse.

## Actual evidence and limits

See [acceptance](F4_CROSS_METHOD_ACCEPTANCE.md) and the public
[same-cap comparison](examples/method-loop/README.md). Positive, smooth hotspot,
noise and contrast-vortex controls were run through actual stdio MCP/Python.
Both strategies receive the same cap, not forcibly equal spending. The active
strategy is **not assumed to win**: in this Windows run positive/contrast active
paths were slower than the fixed two-call sequence because planning/auditing
adds round trips and validation. Avoided scientific calls and total latency are
different outcomes. GUI gestures, experimental specimens and interrupted-worker
fault injection are separately qualified; no such claim follows from these tests.
