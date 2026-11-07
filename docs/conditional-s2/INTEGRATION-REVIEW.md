# Local review candidate on main 31f4f014

This unpublished review branch integrates the existing 17-commit stack ending
at `2ed81e1564f2299c7d052bbb89c2f7f016714aa7` onto canonical main
`31f4f014a4293d24de72402727b1efd084fc1022`. It has not been pushed or merged.
Main's published capability warnings remain applicable. The stack includes its
preceding baseline work and historical research archive, as well as S2, P2
readback repair and evidence-guided Skill routing; it is not only a small S2 diff.

[Lineage](integration-review/lineage.json) records the merge base, all 17
original-to-candidate commits, stable patch identity and zero content conflicts.
Main is an ancestor. The integrated production Git blobs before the later
standalone Skill fix equal the tested `2ed81e1` stack. The later fix makes only
Skill resources/checker and documentation/test changes; solver and gate code are
unchanged. Existing 8b full regular-engineering evidence is reused; the current
candidate receives a build, focused boundary/Skill regressions and the bounded
synthetic compiled MCP smoke. No physics is rerun for this integration.

## Separate scientific records

The [safe package](science-records-v1/manifest.json) contains three distinct
studies and their [interpretation](science-records-v1/interpretation.json):

- Original blind, 8 queries: all AI routes used S0. S2 was not requested, so its
  accuracy was not tested and this is not a solver UNKNOWN result. The observed
  intensity wording may have confounded a latent-mean goal; no causal reason for
  model choice is established.
- Revealed same-frame exploration, 8 queries: fixed S2 totalmean errors improved
  on 6 and worsened on 2. Two whole comparisons stayed UNKNOWN despite local
  query CPEs. This nonblind result is not blind validation or autonomous route gain.
- Fresh unseen explicit latent-mean task, 4 related queries on 2 frames: S0 had
  the lowest MAE/RMSE. AI requested S2 on 2/4; fixed S2 qualified 4/4, but both
  gave worse aggregate errors than S0. This negative result is retained.

These are small, related-frame studies, not pooled independent replication or a
paired prompt ablation. Keep H0/S0 defaults and explicit conditional S2. A local
CPE does not imply whole-reference eligibility, accurate physical modelling,
occupancy or atom counts. Raw observed mean, latent expected total mean and
whole-plane extrapolated central integral remain distinct. The original run03
physical grid FAIL and then-NOT_TESTED record are preserved, not overwritten by
these later studies.

`python -B docs/conditional-s2/science-records-v1/verify_package.py` checks all
bundled hashes and safe-error arithmetic. This is not self-contained physical
reproduction: original research arrays, journals and some runtime sources are
external/local-only links. There are no hidden truths, seeds, credentials or raw
account stderr in the package. Physical experiments tested `2ed81e1`, not this
new integration candidate. The exact safe package is also bundled under the
selected automation Skill so manual installation can read and verify it.

## Byte identity and validation scope

Git blob equivalence is not a claim that all Windows working bytes match the
tested deployment manifest. `tools/image_column_model.py` in this checkout has
90 CRLF pairs (4646 bytes, SHA256
`9d2c32e83dd69a02313041f8b4254fc7007d14e50d948c42e4e09675b110285e`);
CRLF-to-LF only gives the tested 4556 bytes and SHA256
`6f60e322ba3378b20ea3983f09d21962a2cf56ec4e2336832db160a307bcae80`.
The package retains both facts. Dist Python bytes are not covered by the original
physical deployment manifest; current synthetic engineering transport evidence
has its own scope. Final focused validation is recorded alongside this review.

[Focused validation](integration-review/validation.json) records 24 Node passes,
one existing Windows skip, 20 stdlib passes, actual compiled synthetic MCP901,
and three independent text-only Skill forward cases. Complete bounded engineering
logs, including the initial sandbox failure and corrected test assertion, are
bundled there. Final read-only canonical-main observation still points to `31f4f014`.
