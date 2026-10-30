"""Public analytic F1a fixtures; no experimental images and no FFT-generated truth.

The provider never imports this file or oracle. Positions describe generated
piecewise textures, not materials, measured boundary accuracy or defect labels.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import tifffile


def create(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    shape = (192, 256)
    y, x = np.indices(shape, dtype=np.float64)
    qa = [[10 / 64, 0], [0, 15 / 64]]
    qb = [[8 / 64, 6 / 64], [-9 / 64, 12 / 64]]

    def tones(vectors, shift=(0, 0), amplitudes=(1, .7)):
        return sum(amplitude * np.cos(2 * np.pi * (qx * (x-shift[0]) + qy * (y-shift[1])))
                   for (qx, qy), amplitude in zip(vectors, amplitudes))

    a, b = tones(qa), tones(qb)
    boundary = np.where(x < 128, a, b)
    narrow = np.where((x >= 112) & (x < 144), b, a)
    square = tones([[12 / 64, 0], [0, 12 / 64]], amplitudes=(1, 1))
    cases = {
        "two-orientations": boundary,
        "single-A": a,
        "single-A-shifted": tones(qa, shift=(3.25, -1.75)),
        "single-B-rotated": b,
        "narrow-B-strip": narrow,
        "constant-negative": np.full(shape, -.375),
        "seeded-noise": np.random.default_rng(20261030).normal(0, .35, shape),
        "square-symmetry": square,
    }
    files = {}
    for name, values in cases.items():
        target = directory / (name + ".tiff")
        tifffile.imwrite(target, values.astype(np.float32), photometric="minisblack", metadata=None)
        files[name] = {"path": target.name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                       "dtype": "float32", "shape_yx": list(shape)}
    oracle = {
        "synthetic": True,
        "description": "Analytic periodic textures on an exact common pixel grid; not real specimen accuracy",
        "source_generation": "sum of analytic cosines; no numerical Fourier transform or detector",
        "files": files,
        "positive_vectors_cycles_per_pixel": {"A": qa, "B": qb},
        "rotation": {"degrees": float(np.degrees(np.arctan2(3, 4))),
                     "matrix_xy": [[.8, -.6], [.6, .8]],
                     "convention": "column-vector target=R(angle)@reference; no mirror/scale"},
        "boundary": {"source_x": 128, "left": "A", "right": "B"},
        "narrow_strip": {"x_half_open": [112, 144], "width_pixels": 32,
                         "interpretation": "Selected 64/128 windows cannot resolve a pure narrow B domain; mixture or unknown is acceptable"},
        "grid": {"rect": [0, 0, 256, 192], "window_sizes": [64, 128], "stride_xy": [64, 64],
                 "max_windows": 24, "expected_windows": 18, "expected_fft_pixels": 147456},
        "baseline": "The same 18 uniform sliding windows, identical parameters and scientific budget, via existing spatial_atlas batches; composition equality, not an independent algorithm",
        "calibration": {"x": .02, "y": .02, "unit": "nm",
                        "source_text": "Public synthetic sampling: X/Y=0.02 nm/pixel; not experimental calibration"},
        "limits": ["Noise, periodic symmetry and mixed windows are not phase evidence",
                   "Boundary support bands are not measured localization error or physical confidence",
                   "FFT bin spacing is not uncertainty", "Threshold and window-size sensitivity are reported"],
    }
    (directory / "oracle.json").write_text(json.dumps(oracle, indent=2) + "\n", encoding="utf-8")
    return oracle


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print(create(parser.parse_args().output)["description"])
