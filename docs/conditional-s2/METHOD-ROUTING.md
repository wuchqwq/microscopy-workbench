# Evidence-based conditional method routing

This increment packages method-selection evidence for the existing host Agent
and records its explicit choice. H0 FFT measurements and S0 raw fixed-ROI
statistics remain the defaults. S2 remains an explicit conditional decomposition
or a durable raw + UNKNOWN outcome. H1/S1 are retained as research history;
neither is silently implemented or promoted to production.

Use the [Skill reference](../../skills/scientific-agent/microscopy-automation/references/conditional-methods.md)
for when baseline is sufficient, the premises for proposing S2, stopping/revision
conditions and interpretation limits. The
[method index](method-evidence-index-v1.json) binds the frozen selection/spec/P2
documents by SHA256 and names actual existing tools and estimands. The original
[selection record](method-selection-v1.json) remains byte-exact. Its evidence
paths inside the separate research archive have not been relabelled as local
production artifacts.

The [decision contract](method-decision-contract-v1.json) distinguishes baseline,
conditional S2, a legal missing-prerequisite raw + UNKNOWN request, an unknown
with no dispatch, research history and same-ID result recovery. A deliberate
revision after a known outcome uses a new request ID linked to the old one.
Unknown/pending writes may be queried using their original IDs in their retained
provider/workspace/session locator or stopped; they are never automatically
resubmitted. Recovery may have explicit null source/ROI when only that locator
and original request remain; new measurements require complete source/frame/ROI.
The locator is a declared scope, not authentication. See
[synthetic records/call shapes](../../skills/scientific-agent/microscopy-automation/references/method-decision-examples-v1.json).

The optional [read-only checker](../../skills/scientific-agent/microscopy-automation/scripts/check_method_decision.py)
uses only Python stdlib. It validates an explicitly chosen record and state
relationships, including distinct estimands, sourced premise declarations,
same-ID recovery, explicit revision and non-confirmatory physical status. It
does not choose a method, inspect scientific arrays, authenticate a source text,
prove reference equivalence, call a provider or create another evidence store.
It is a record-specific check, not a general JSON Schema implementation.
The existing provider remains authoritative for accepted values, source closure,
all-site comparison qualification and [P2 readback](READBACK-P2-BOUNDARY.md).

No solver, rank/gradient gate, numerical tolerance, provider source/request
qualification, Panel editor or AnalysisContext role changes in this increment.
An available fit remains conditional on its supplied count, geometry, shape and
reference premises; it is not physical confirmation. Historical physical FAIL
and NOT_TESTED conclusions are preserved. Later physical validation must freeze
its input/implementation and record new evidence separately; this document does
not predict its result.

## Focused validation and CI entry

After `npm run build`, run:

```text
node --test dist/tests/conditional-method-routing.test.mjs dist/tests/point-observation-contract.test.mjs dist/tests/column-fit-contract.test.mjs
python -B tests/ci_method_decision_test.py -v
```

The new Node contract file is in the ordinary `npm test` manifest. It verifies
frozen evidence hashes/sections, real catalog/tool call shapes, legal
missing/unsupported prerequisite dispatch and relocatable packaged resources.
The stdlib record regression is picked up by the existing `quick.yml` changes
job command `python3 -B -m unittest discover -s tests -p 'ci_*_test.py' -v`;
no package installation or workflow change is needed. Its positive and negative
cases cover all supplied/missing premise states, saved UNKNOWN, failed-reference
comparison status, original-ID recovery, intentional revision, history-only
methods and refusal of physical confirmation.

The exact base `8bff842bd084be2986f0bf99613da7b947fe0bae` already has engineering
evidence: build/syntax pass, ordinary suite 1137 pass / 8 skipped / 0 fail after
permission review, bounded Python 41/41 and actual MCP stdio recovery/export/
review pass. Those results apply to that base, not automatically to this commit.
This increment reuses their unchanged-layer evidence and runs the affected
contracts/packaging checks. No ordinary full-suite repeat, research matrix or
physical simulation is needed for this Skill/data change. Local commands,
outcomes, first failures and limits are recorded in
[METHOD-ROUTING-VALIDATION.md](METHOD-ROUTING-VALIDATION.md).
