"""Create the small SYNTHETIC complex DM4 used for browser acceptance.

Uses this checkout's test-only tag encoder, not a scientific runtime DM writer.
Run with the independent NumPy environment, never GMS Python.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests" / "fixtures"))
from dm4_fixture import write_dm4


def create_trial(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    y, x = np.indices((96, 128))
    values = ((x - 64) + 1j * (2 * y - 96)).astype(np.complex64)
    source = output / "complex-field.dm4"
    write_dm4(source, [{"name": "Synthetic complex field; not a wave or FFT",
                       "data": values, "scales": (.02, -.03),
                       "origins": (1.25, -2.5), "units": ("nm", "nm")}])
    with (output / "known.npy").open("xb") as target:
        np.save(target, values, allow_pickle=False)
    specification = {
        "synthetic": True, "formula": "z(y,x)=(x-64)+i*(2*y-96)",
        "shape_yx": [96, 128], "dtype": "complex64",
        "scale_xy_nm_per_pixel": [.02, -.03], "raw_origin_xy": [1.25, -2.5],
        "physical_zero_xy_nm": [-.025, -.075],
        "suggested_roi_xyxy": [16, 16, 112, 80],
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "limits": "Known complex numbers only; not a wave, FFT or experimental specimen.",
    }
    (output / "specification.json").write_text(
        json.dumps(specification, indent=2) + "\n", encoding="utf-8")
    return source


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", help="New output directory; existing directories are refused")
    print(create_trial(parser.parse_args().output))
