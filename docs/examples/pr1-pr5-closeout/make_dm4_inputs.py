"""Public synthetic closeout input, not a runtime scientific DM writer.

Requires NumPy and this checkout's existing test-only encoder. Never GMS Python.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tests" / "fixtures"))
from dm4_fixture import write_dm4


def create_inputs(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    y, x = np.indices((96, 128))
    values = (20_000_000 + np.rint(6000 * np.cos(2*np.pi*x/8)
                                 + 3000 * np.cos(2*np.pi*y/16))).astype(np.uint32)
    values[0, 0] = np.iinfo(np.uint32).max
    values[2, 3] = 16_777_217
    for name, units in [("signed-uint32-pattern.dm4", ("nm", "nm")),
                        ("uncalibrated-uint32-pattern.dm4", ("", ""))]:
        write_dm4(output / name, [{"name": "SYNTHETIC public uint32 periodic field",
                                  "data": values, "scales": (.02, -.03),
                                  "origins": (1.25, -2.5), "units": units}])
    with (output / "known.npy").open("xb") as target:
        np.save(target, values, allow_pickle=False)
    specification = {
        "synthetic": True, "shape_yx": [96, 128], "dtype": "uint32",
        "formula": "20000000+rint(6000*cos(2*pi*x/8)+3000*cos(2*pi*y/16))",
        "sentinels_yx": [[0, 0, 4294967295], [2, 3, 16777217]],
        "roi_xyxy": [16, 16, 112, 80], "scales_xy": [.02, -.03],
        "raw_origins_xy": [1.25, -2.5], "physical_zero_xy": [-.025, -.075],
        "source_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in sorted(output.glob("*.dm4"))},
        "limits": "Synthetic geometry/precision fixture; no material or phase claim.",
    }
    (output / "specification.json").write_text(
        json.dumps(specification, indent=2) + "\n", encoding="utf-8")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", help="New directory; an existing path is refused")
    print(create_inputs(parser.parse_args().output))
