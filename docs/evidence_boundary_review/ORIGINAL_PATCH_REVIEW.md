# Independent attachment review — original supplied patch

Reviewer: delegated GPT-6-astra. Scope: the supplied evidence-boundary increment
above #57 head `4141225653b41b134a76c5b2119888c01c481f54`, not the three deferred
algorithm repairs. No production edits or patch application by this reviewer.

## Findings

1. **P2: finite JSON and known-v1 shape are conflated.** In the supplied
   `ui/image-panel/gpa-evidence.mts:79–89`, recognition checks only four assessment
   scalars and the outer positive boolean. A finite JSON `reason_codes: {}` or
   `reason_codes: [{bad:true}]` remains `available`; its diagnostic reasons vanish
   from explanatory prose. `spatial_transfer: "broken"` also remains available,
   while `{}` produces analytic-bandwidth prose without a usable response object.
   This is malformed known-v1 metadata, distinct from invalid/non-finite JSON,
   an unknown semantic version, or a historically absent assessment. It does not
   produce a positive material-strain certificate. Recommend checking the shape
   of the fields actually interpreted, retaining the bounded original for
   inspection and reporting unrecognized/unavailable when malformed. No numerical
   re-evaluation or scientific acceptance threshold belongs in this adapter.

2. **P2: a malformed outer validation flag is lost in transport.** At supplied
   `gpa-evidence.mts:40–43`, `material_strain_verified: "true"` is silently omitted.
   Both actual HTTP state and `image_panel_current` then lack the field, and the
   renderer calls the otherwise known assessment available. An explicit
   unavailable/projection diagnostic should distinguish corruption from absence.
   Boolean `true` is correctly preserved and rejected as contradictory by the UI.

3. The parent independently identified unconditional `replaceChildren` at
   supplied `gpa-evidence.mts:94` resetting an opened details panel on unchanged
   renders. Source inspection agrees; this reviewer did not execute that
   particular UI-state reproduction and does not claim discovery of it.

## Executed evidence

- The supplied 18 focused tests passed independently, including actual owned
  Panel HTTP + `ImagePanelManager` MCP handler and the real ResearchWorkspace
  renderer method with lightweight DOM ports.
- Direct module adversarial calls covered absent/null/unknown/missing versions,
  malformed reason/transfer fields, invalid and contradictory outer flags,
  and the 32/33-array-size boundary.
- `probe.mjs` repeated seven cases using fresh owned Panels and the actual HTTP
  and MCP-handler routes. `original-results.json` retains the exact controlled
  provider inputs, HTTP/MCP object outputs, UI models and provider read calls.
  HTTP and MCP objects matched in every case. All provider inputs stayed intact.
  Absent assessment remained `not_recorded`; null/over-budget became explicit
  unavailable markers; unknown version stayed present and unavailable. The two
  findings above survived both transport routes.
- Reproduction command: `node probe.mjs /absolute/repo /absolute/fresh-result.json`.
  It refuses to overwrite a result. The fixture's empty transfer object is
  deliberately minimal; stricter post-fix schema checks may reject it. A proper
  production-v1 positive fixture must be included in the parent's fix regressions.

## Boundaries and non-findings

No positive physical-validation claim was found in the code path or scoped
documentation. Known assessments retain conditional numerical output and
insufficient material-strain evidence. Bandwidth prose explicitly limits itself
to small phase, constant amplitude, isolated carriers and a one-dimensional
analytic response; it disclaims measured resolution and uncertainty. Direct
GPA/view-only coverage and lack of arbitrary wrapper inheritance are documented.
The bounded-copy limits constrain the assessment projection/DOM output, not all
pre-existing Panel metadata or initial MCP JSON parsing.

Not independently run here: Python GPA computation, the attachment's complete
Node suite, exact locked-toolchain qualification, real browser layout/gestures,
PR54 integration, real specimens, the three deferred algorithm repairs, or a
fresh autonomous model session using the Skills. Supplied logs were reviewed as
handoff evidence, not substituted for these independent runs. Parent handles
the broader build/science checks and any production corrections.

This review describes the original supplied patch. It is not a post-fix approval.
