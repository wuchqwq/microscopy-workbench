# Structure adapter and local viewer migration

This slice follows the image-provider PR. Structure worker, tool registration,
viewer attachment/closure and loopback server now use strict TypeScript. The
browser initializer is also a checked module; its compiled self-contained
function is serialized at the original /viewer.mjs URL. No unchecked browser
business template or duplicate implementation remains.

Snapshot brands distinguish Cartesian angstrom coordinates, requested display
degrees, proper rotations and saved structure identity after the existing
validator. Raw worker/provenance and journal fields stay unknown where the old
code did not qualify them. Default construction retains the concrete provider
scope; injected ports do not acquire capabilities by assertion. Pinned asset,
Origin/token, alias, fixed-coordinate/contact and close-request checks remain.
Python code and all numerical tolerances are unchanged.

Checks: strict typecheck/build; full emitted Node 290 PASS / 5 SKIP before adding
five new compiled viewer protocol/snapshot/script tests, which also PASS;
independent Python science and frozen JS to copied compiled plugin compatibility
PASS. The viewer tests execute the emitted serialized module with a stub renderer
and test loopback/closure ownership. They do not claim actual WebGL, real 3Dmol,
optional diffraction simulation or real specimen qualification.
