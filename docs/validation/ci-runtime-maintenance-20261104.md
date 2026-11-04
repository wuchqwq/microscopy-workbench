# Node 22/24 verified-scope publication receipt

Prepared on 2026-11-04 after the owner authorized publishing the locally
validated portion and retaining unverified work locally. Hosted status for the
published commit is authoritative in its GitHub Checks; local/static checks
below do not claim that new hosted execution already passed.

## Baseline and split audit

Remote protected main remains `dd9b706786041c6c0a6678ff6cd4dd84dbe06a3e`.
The selected product baseline remains #129,
`6497f3f692409f0c0e189c92eda9881fc78a65ac`, branch
`fix/single-image-closeout-20261104`. They diverge by 4 main-only and 37
candidate-only commits, sharing `86b758e3ea422a83a7c5bb0bce8f4d922f3d1ece`.
Those 37 commits are inherited baseline, not new maintenance. Review this
branch against #129; no main integration or product-stack merge is performed.

The independent original candidate
`a2704b78b65b0465b06a29e251d54ce9514e8b1d` is retained locally on
`ci/node22-24-light-maintenance-20261104`. A separate worktree and branch
`ci/node22-24-verified-20261104` contains the selected publication subset.
Other task/user worktrees are not edited. Root `AGENTS.md` was read; no
additional applicable CI skill or nested CI policy was found.

| Original candidate portion | Disposition and evidence |
| --- | --- |
| Core and desktop engines/root lock metadata, Node typings, runtime guides | Included: both Node versions' locked install/build and engines/lock checks passed. |
| Node matrix 18/22 -> 22/24, compatibility job 18 -> 22 | Included: supported majors checked on Windows; hosted Linux/current matrix remains pending execution. |
| Three real Panel files and their explicit-preview/owned-reopen fixture repairs | Included: all four real cases have local individual passes; original scientific assertions preserved. |
| Opt-in Panel step and targeted classifier paths | Included: local case execution, workflow syntax/structure and routing/gate checks; new Linux timing requires hosted evidence. |
| HTTP shutdown tests on actual supported runtime | Included: Node 22/24 passes, active-response and original journal checks retained. |
| Gate failure injection over every required quick-workflow job | Included: required skip/failure/cancel/timeout/missing results rejected locally. |
| checkout/setup-node/setup-python/upload-artifact upgrades | Deferred locally: upgraded action runtime/download/cache/upload behavior not exercised. Both other workflows remain byte-identical to baseline. |
| New Windows/macOS platform-smoke matrix and gate mapping | Deferred locally intact: no new platform job is published. Windows command passed, new hosted/platform jobs and macOS remain unverified. |
| Broad-candidate support/validation prose | Rewritten to this split scope; the original full proposal/report remains in the local candidate. |

No numerical algorithm, source-proof validator, old source ID/hash, frozen
compatibility schema/oracle, science requirement, Electron dependency or worker
tolerance changes. Only development typings update: @types/node 18.19.130 ->
22.20.5 and undici-types 5.26.5 -> 6.21.0; TypeScript stays 5.9.3. The production
desktop source change is a support-version comment. The opt-in display test
adds a 240-second limit without changing its scientific body/assertions.

## Existing local evidence reused

Environment: Windows 11 x64; Node 24.16.0 and checksum-verified portable
Node 22.23.4; independent Python 3.13.2, NumPy 2.2.6, SciPy 1.15.3, Pillow
11.2.1, tifffile 2026.3.3. Retained raw logs/checksums identify the original
candidate. Unchanged code/test blobs are reused rather than rerunning expensive
science merely because a publication branch was split.

| Scope | Local result |
| --- | --- |
| Locked npm ci and all-three-project formal build, Node 22 and 24 | PASS; Node 22 install + build 21.9 s, Node 24 final build 20.8 s. |
| Node 22 frozen workspace/catalog compatibility, transport parity, HTTP close | 6 PASS, 0 SKIP, 33.4 s; original baseline/schema/requests and one FFT preserved. |
| Node 24 focused package/stdio/shutdown/desktop contracts | 29 PASS, 1 Unix-only symlink SKIP, 1.9 s. |
| Basic Windows Node 22/Python 3.13 science command | PASS, 21.8 s; signed calibration, independent direct DFT, export, original request and Panel HTTP. |
| Calibrated table + exact owned checkpoint reopen | Final Node 22 PASS, 89.4 s. |
| Array probes/statistics/profiles and delayed complex read | Final Node 22 PASS, 61.5 s; final corrected-fixture two-case run 2/2 PASS, 0 SKIP, 151.5 s. |
| Pixel-only table/frame switch | Node 24 PASS in a retained mixed-result run. |
| Exact spatial/FFT display recipe and lost response | Node 24 PASS, 156.8 s in that mixed-result run. |
| Original candidate CI scope/gate/workflow checks | 34 PASS, 1 Linux newline-filename case locally excluded; unchanged Linux case still runs hosted. |
| Original candidate actionlint, metadata, semver, local links | PASS; publication subset is separately rechecked before push. |

The earlier real three-file run remains **18 PASS / 2 FAIL**, 268.0 s. One
failure was an outdated implicit-reopen assumption, repaired with an exact
owned checkpoint; one was an introduced probe-fixture variable-name collision,
renamed before the final two-case pass. Initial fixtures also relied on an
implicit preview forbidden by current guards; they now make explicit saved
preview requests. No production fallback or relaxed validator was introduced.
Sandbox DNS/Git Bash/atomic-file/hardlink/loopback failures are retained in raw
local logs; reviewed execution outside that sandbox resolved those restrictions.

## Budget, pending checks and protection

The Node matrix remains four slots. This subset adds **zero platform jobs** and
no new installs/version cross-product. Four real cases run serially once in the
existing Linux boundary job, reusing its build/Python environment and original
five-minute job ceiling. The 156.8-second Windows display case is material cost;
the corresponding hosted Linux duration is pending. A budget failure must remain
a failed gate, not cause reduced scientific assertions or silent skips.

CI-file/dependency changes still select existing full hosted CI under the original
fail-closed policy. This authorized publication can therefore exercise broader
existing jobs once. No manual full Node/scientific/noise/scattering suite is
repeated locally. Existing action versions and other workflow contents remain
at the exact product baseline.

Not locally qualified: current Linux/Windows full matrix, new hosted Panel
aggregate duration, the Linux newline-filename case, macOS, Python 3.10/3.11
minimum environments, native Electron/browser/model and real specimens. Each
must be distinguished from static wiring or synthetic Windows evidence.

Branch-protection detail read was denied with **403 Resource not accessible by
integration** for `GET /repos/wuchqwq/microscopy-workbench/branches/main/protection`.
Aggregate gate names are preserved, but exact directly required matrix contexts
are unknown. No protection write or merge is attempted. A new branch is used;
other existing branch refs are not overwritten. Hosted results are reported for
the exact published commit separately, preserving this pending-state receipt.
