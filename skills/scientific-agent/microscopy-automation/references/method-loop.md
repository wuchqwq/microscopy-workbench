# Continue a scientific question across methods

This first F4-full increment starts from **saved fixed_g GPA** on an existing
qualified FFT. It does not silently make a domain map GPA-ready, replace a Hann
FFT, infer a reference or install another backend. Domain/twin/multiframe routes
and all ordinary tools remain available separately, outside this budget root.

Use the tools to inspect and choose; there is no model in the provider and no
mandatory complete pipeline. Ask for the missing model/coordinates instead of
inventing them. An apparently smooth/no-trigger ROI is finite evidence, not a
defect-free specimen certificate. Phase/amplitude diagnostics can motivate a
method check, but smooth strain magnitude does not locate a dislocation.

1. Save a request ID and call `image_method_plan` with `object_ids` (1..3 exact
   GPA IDs), `information` and an explicit additional-work `budget`. The initial
   GPA must carry the actual image-domain declaration, reference and mask source.
   `information.goal` is currently `projected_topology`. Optional fields are:
   `followup_g_vectors` (two exact cycles/pixel vectors), `followup_basis`,
   `loops` (existing topology local-grid oriented rectangles), and
   `model_assumption_text`. Missing information produces an inspectable request,
   not guessed circles, arbitrary g or an unsupported material label.
2. Inspect the returned `decision`, `actions`, reason and preconditions. A sourced
   third phase direction can justify one more GPA on the **unchanged** FFT;
   sufficient resolved directions plus explicit nested circuits can justify
   topology. The policy uses conservative finite FFT resolution, not floating
   point rank alone. Friedel partners and harmonic jitter do not add evidence.
   Clean or quality-limited phase diagnostics may stop rather than spend budget.
3. To accept a candidate, save the returned `next_request_id` EXACTLY, then call
   `image_method_step` with `root_plan_id`, plan `object_id`, `action_id` and your
   actual `selection_reason`. Only that single action is executed by an existing
   scientific tool. Never substitute a fresh arbitrary ID for an occupied slot.
4. Inspect `child_receipt`: provider completion of a step record is not child
   scientific success. Call `image_method_next` on that saved step/plan to inspect
   all attempts and re-evaluate. `information_patch` can supply/correct assumptions
   or circuits without resetting the root budget; `user_stop:true` records a stop.
   A stale attempt snapshot must be replanned, never forced through.

Budget fields are `method_calls` (0..8), `fft_pixels` (currently 0),
`gpa_band_pixels`, and `topology_path_samples`. GPA reserves two bands times
array pixels; topology reserves up to six bands times all circuit perimeter
samples. These are conservative work bounds, not equal CPU costs. Reused seed
GPA/FFT cost is listed separately and not recharged; historical elapsed is unknown.
Every submitted slot, including a refusal, uses an attempt. A dispatched failed
or unknown child retains its full reservation, with observed time or explicit
unknown time. Never subtract a failure to make another method fit.

Recover a lost/late result by `image_result` with the original saved step request
ID. If still unknown, inspect `image_method_next` from the saved plan/root for
the recorded child request and budget; query that original child. The tools never
replay unknown science. A later verified child outcome may be observed in a NEW
proposal while the old unknown record remains historical. Unknown/unreadable
reservations block more science. Do not create a new root to evade that state or
pretend it is a continuation. A genuinely new question has a new explicit budget.

Read per-group topology evidence and all masks/circuit conditions. A contrast-only
image vortex can have the same wrapped-phase evidence as a displacement model;
numeric agreement cannot decide that material interpretation. Keep results
`hypothesized`, preserve alternative explanations and never claim unique 3D b or
material dislocation confirmation. Stop when the bounded question has conditional
evidence, evidence quality is insufficient, budget runs out or the user stops.

`image_info` / `image_result` recover the immutable plan/step and PNG; source GPA,
FFT and topology IDs remain usable by existing read/export/Panel tools. These
provider references need no AnalysisContext session. No new scientific Context
role is implied; if using existing supported CAS references, a late proposal must
not silently replace a newer user selection.
