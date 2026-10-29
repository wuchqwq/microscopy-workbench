# Independent image provider migration

Stacked after #20, this slice migrates the image workspace worker adapter,
probe/automation/sequence/domain contracts and tool registration/composition.
Python algorithms, persisted science, original schemas and guards are unchanged.

Worker process streams, worker-close lifetime and coordinated requests have
explicit ports. Probe requests distinguish coordinate/component domains; the
completed probe view contains only fields checked by the original validator.
Scientific JSON, regex-only identities and durable result payloads stay unknown.
Composition recipes type the production tool descriptions and dependency gates.
There is one emitted implementation per migrated source, used by production
entry points and tests.

Validation performed against the emitted runtime:
- strict typecheck/build and full Node: 290 PASS, 5 SKIP;
- independent TIFF/calibration/ROI/FFT/measurement/export/restart/Panel science smoke: PASS;
- exact frozen JS 3790b3d schemas/workspace to copied compiled plugin, no node_modules,
  unrelated working directory, old bytes and single FFT preserved: PASS;
- independent review: 18 worker lifecycle traces, 19 probe accept/reject cases,
  image/annotation schema and instruction parity, and eight strict negative type
  probes: PASS, no blocking findings.

This does not qualify new algorithms, real specimen data, GMS, browser gestures
or optional structure simulations. Later slices test the migrated Panel/browser.
