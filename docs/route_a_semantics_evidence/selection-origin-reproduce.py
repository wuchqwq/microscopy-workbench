"""Save the original actor-attribution counterexample using a frozen real worker.

Run with the locked scientific Python. No historical object is edited or patched.
The optional output directory must not exist; the default is `original-run` here.
"""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import tifffile


ROOT = Path(__file__).resolve().parent
BASELINE = Path(sys.argv[1]).resolve()
OUTPUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / "original-run"
EXPECTED_SHA = "7f0e523ba287de11c0913abd68f553655f008182"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    with path.open("x", encoding="utf-8") as target:
        json.dump(value, target, indent=2, sort_keys=True)
        target.write("\n")


sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=BASELINE, text=True).strip()
assert sha == EXPECTED_SHA, (sha, EXPECTED_SHA)
subprocess.run(["git", "diff", "--exit-code", "HEAD", "--", "tools", "crystallography"],
               cwd=BASELINE, capture_output=True, check=True)
OUTPUT.mkdir(parents=True, exist_ok=False)
workspace = OUTPUT / "workspace"
source = OUTPUT / "public-periodic-image.tiff"
y, x = np.indices((48, 48))
values = (100 + 8 * np.cos(2 * np.pi * x / 8)).astype(np.float32)
tifffile.imwrite(source, values)
calls = []


def call(action, **arguments):
    request = dict(workspace=str(workspace), action=action, **arguments)
    if action not in ("get", "result"):
        request["request_id"] = "selection-origin-original-%02d" % (len(calls) + 1)
    result = subprocess.run([sys.executable, str(BASELINE / "tools/image_workspace.py")],
                            input=json.dumps(request), text=True, capture_output=True, check=False)
    response = json.loads(result.stdout)
    assert result.returncode == 0 and response.get("ok"), response
    calls.append({"request": request, "response": response, "stderr": result.stderr})
    return response["result"]


opened = call("open", source_path=str(source))
frame = call("frame", object_id=opened["object_id"], frame_index=0)
region = {"rect": [8, 8, 40, 40],
          "reason": "Agent-proposed ROI to inspect an observed image stripe; no researcher selected it.",
          "candidate_explanations": ["An image periodicity candidate; material explanation remains unknown"],
          "unresolved": ["No statistical peak qualification or physical identification"]}
discovery = call("discovery", object_id=frame["object_id"], entry="manual", regions=[region], max_size=64)
fft = call("fft", object_id=frame["object_id"], rect=region["rect"], window="none", subtract_mean=True, max_size=64)
review = call("discovery_review", object_id=discovery["object_id"], candidate_id=discovery["candidates"][0]["candidate_id"],
              evidence_ids=[fft["object_id"]], observation_text="Agent inspected an explicit ROI FFT; physical interpretation remains unknown")
feature = call("discovery", object_id=frame["object_id"], entry="feature", window_sizes=[32], max_candidates=1, max_size=64)
actual = discovery["candidates"][0]["entry_basis"]
assert actual == "researcher_statement", actual
try:
    assert actual != "researcher_statement", "Agent-proposed ROI must not be attributed to a researcher"
except AssertionError as failure:
    failure_record = {"classification": "implementation_bug_source_attribution", "state": "FAILED_AS_EXPECTED",
                      "expected": "Do not infer researcher authorship from explicit/manual entry",
                      "actual": actual, "assertion": str(failure)}
else:
    raise AssertionError("The frozen source no longer reproduces the stated failure")
write(OUTPUT / "calls.json", calls)
write(OUTPUT / "failure.json", failure_record)
write(OUTPUT / "records.json", {"frame": frame, "discovery": discovery, "fft": fft, "review": review, "feature": feature})
write(OUTPUT / "hashes.json", {str(p.relative_to(OUTPUT)): digest(p) for p in sorted(OUTPUT.rglob("*")) if p.is_file()})
write(OUTPUT / "environment.json", {
    "source_sha": sha,
    "source_tree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=BASELINE, text=True).strip(),
    "worker_sha256": digest(BASELINE / "tools/image_workspace.py"),
    "discovery_sha256": digest(BASELINE / "tools/image_discovery.py"),
    "source_file_sha256": digest(source), "frame_array_sha256": frame["files_sha256"]["data.npy"],
    "python": sys.version, "executable": sys.executable,
    "packages": {name: importlib.metadata.version(name) for name in ("numpy", "Pillow", "tifffile", "scipy", "scikit-image")},
    "scope": "Synthetic formal Python worker save chain; not an actual model, browser gesture, or real material qualification",
})
print(json.dumps({"failure": failure_record, "output": str(OUTPUT), "discovery_object_id": discovery["object_id"]}))
