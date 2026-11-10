# Source publication: application r5 and scientific skills r2

This branch brings the local application source candidate **0.1.12-r5** and
scientific skill candidate **0.6.1-r2** into the existing MIT-licensed repository.
The package versions remain `0.1.12` and `0.6.1`; r5 and r2 identify local
candidate revisions, not published GitHub releases or package-registry versions.

## Provenance and scope

- The application source was frozen before the skill-only revision. The skills
  source manifest was verified file by file before copying into a separate
  publication checkout. The original working checkout and frozen candidates
  were left unchanged. The verified skill-source manifest SHA-256 is
  `5c3e4dc152398e5a28f5e3eecd380fb9ab47cfcd82f9a4ca507077a26ce19077`.
- The remote base was `31f4f014a4293d24de72402727b1efd084fc1022`.
- Frozen application source manifest SHA-256:
  `74862e393a3170bb02861b3d11b237c0fdd64c54f459b3839afbbcabf651dc3c`.
- Only source, tests, generic documentation, and installation tooling are added.
  The only generated software distribution is the reproducible, dependency-free
  Skills npm tarball (about 415 KiB), built from the checked-in text sources.
  No local application bundle, virtual environment, credential, user settings,
  private experiment, screenshot, or new binary evidence archive is included.
- New documentation was checked for machine-specific personal paths and private
  collaboration history. Those passages are generalized for publication without
  changing scientific claims. This is not a full audit of historical repository
  contents or a legal opinion on all dependencies.

## Installation and distribution limits

Use the portable installation guide linked from the README. Source installation
uses Python and supported Node versions supplied by the user, and installs the
explicit package requirements. Optional scientific engines and Electron are
separate choices. Installing skills alone does not connect an MCP provider,
configure model credentials, or establish that a model has analyzed an image.

This is a **source candidate**, not a signed or notarized application release.
The previous local Mac bundle is not uploaded. Windows/macOS/Linux source
installation must be distinguished from clean-machine GUI qualification.
No native Windows or Linux GUI qualification is claimed by a script test.

## Validation status

The publication checkout builds and passes TypeScript checks. The portable
installer has 16 isolated contract tests; they pass locally on Mac. The added
GitHub Actions workflow checks these contracts on Windows, macOS and Linux and
prepares a ready-to-copy scientific-skills artifact. A successful workflow is not
a clean-machine runtime install or a native GUI test.

The initial frozen JavaScript compatibility gate failed on intentional Mac r5
catalog extensions. A follow-up preserves the frozen Git baseline and checks six
tools' exact, enumerated schema/prose deltas, with mutation guards against
unlisted changes. The focused compatibility tests now pass locally, including
historical saved-object bytes, original request recovery and no FFT replay.
The stale figure legend expectation was aligned with the neutral “Image observation”
label; font/wrapping checks remain. No scientific runtime, original source IDs,
hashes or numerical tolerances were changed for these repairs.

The [standalone npx Skills installer](SKILLS_INSTALL.md) adds isolated package
contracts and real GitHub URL installation checks across Node 22/24 and all three
OSes. The PR's latest exact-head Actions runs are the authority for remote CI;
local focused results alone are not an all-green CI claim.

Detailed final targeted regression results are recorded in the draft pull
request. Do not treat this snapshot as an all-green stable release. Installer
contracts are separate from scientific, provider, native GUI and actual-model
validation. Public-image sending remains disabled in this candidate; testing its
local preview and disabled gate does not qualify an actual model send.

Real-material accuracy, automatic phase/defect confirmation, and fully autonomous
image interpretation are not established by synthetic tests or skill loading.
The researcher remains responsible for source conditions and interpretation.
