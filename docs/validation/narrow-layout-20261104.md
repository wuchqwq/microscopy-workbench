# Narrow image space follow-up

User feedback on the actual trial screenshot rejects the reserved side column.
The600–850px CSS override reserved292/320px beside the entire canvas area while
the drawer itself occupied only the image viewport. This left upper/lower empty
space and wrapped common controls. Earlier reachability checks did not establish
that this layout was acceptable.

The fix removes only the two narrow margin overrides, reusing the existing
viewport-bounded overlay drawers and their close controls. Navigation, image and
results regain full width. Fields stay mounted; no camera, ROI, save, scientific
record, window manager, algorithm or desktop-wide layout changes. Chinese help
now describes the actual overlay behavior.

Validation is intentionally small: locked install/formal build;3 existing drawer
bounds, mutually-exclusive panel and results-height tests PASS; one headless
760x800/1200x900 production-HTML/CSS check, with closed/properties/research states.
At760, canvas area width changes412→704px when properties are open. Both drawers
retain viewport bounds, scroll and reachable close controls; header/navigation/
results are unobstructed. Text values and the illustrative camera transform stay
unchanged; desktop geometry matches the original. Zero scientific requests.

This is a static DOM/layout fixture using an existing public saved PNG and the
actual bounds function, not native mouse or full running-app acceptance. The
first fixture used a raw source ID without a PNG; a second capture checked a
close button during its CSS transition. Those setup/timing failures remain in
local logs; waiting for the actual animation end yields the final PASS. No
scientific object, original failure record, user window or global setting was
changed. No FFT/re-measure/save/reopen loop or unrelated science suite was run.

Local evidence under `F:/mircograph-workbench/dual-roi-evidence-20261103`:
`narrow-layout-check-20261104.mjs`, `narrow-layout-computed-20261104.json`,
`narrow-before-760x800.png`, `narrow-after-760x800.png`,
`narrow-after-closed-760x800.png`, and `narrow-layout-*.log`.

The existing trial window is intentionally still on b57e0d0 after human input
was detected. This source fix is isolated for review; it has not been injected
into that window. Its native narrow-window acceptance remains NOT_TESTED.
