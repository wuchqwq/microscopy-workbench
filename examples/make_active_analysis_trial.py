"""Public analytic F4-lite inputs and a separate, runtime-hidden truth file.

This generator does not compute an FFT, invoke a detector or prescribe an active
ROI. The plugin must not import its oracle. Coordinates denote synthetic image
supports and reciprocal tones, never phases or calibrated confidence.
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
    shape = (128, 128)
    y, x = np.indices(shape, dtype=np.float64)
    # Retain the exact F1a tones. The narrow-f1-crop is the same analytic pixels
    # as the F1a [64,0,192,128] crop; no altered threshold or truth repairs it.
    qa = [[10 / 64, 0], [0, 15 / 64]]
    qb = [[8 / 64, 6 / 64], [-9 / 64, 12 / 64]]

    def tones(vectors, shift=(0, 0)):
        return sum(amplitude * np.cos(2 * np.pi * (qx * (x-shift[0]) + qy * (y-shift[1])))
                   for (qx, qy), amplitude in zip(vectors, (1, .7)))

    a, b = tones(qa), tones(qb)
    masks = {
        "boundary": x >= 64,
        "boundary-shifted": x >= 80,
        "narrow-f1-crop": (x >= 48) & (x < 80),
        "narrow-offset-left": (x >= 32) & (x < 64),
        "narrow-offset-right": (x >= 72) & (x < 104),
    }
    cases = {name: np.where(mask, b, a) for name, mask in masks.items()}
    cases.update({
        "single": a,
        "single-shifted": tones(qa, (3.25, -1.75)),
        "constant": np.full(shape, -.375),
        "noise": np.random.default_rng(20261030).normal(0, .35, shape),
        "square": np.cos(2*np.pi*12*x/64)+np.cos(2*np.pi*12*y/64),
    })
    files = {}
    for name, values in cases.items():
        target = directory / (name + ".tiff")
        tifffile.imwrite(target, values.astype(np.float32), photometric="minisblack", metadata=None)
        files[name] = {"path": target.name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                       "dtype": "float32", "shape_yx": list(shape)}
    # A separate input for a fresh Agent. Its filename and supplied prompt do
    # not expose the generating mask, vectors, phase amplitudes or oracle path.
    fy, fx = np.indices((160, 160), dtype=np.float64)
    def fresh_tones(vectors):
        return sum(amplitude*np.cos(2*np.pi*(qx*(fx-2.25)+qy*(fy+1.5)))
                   for (qx,qy),amplitude in zip(vectors,(1,.7)))
    fresh = np.where((fx >= 88) & (fx < 120), fresh_tones(qb), fresh_tones(qa)).astype(np.float32)
    fresh_path = directory / "fresh-consumer-input.tiff"
    tifffile.imwrite(fresh_path, fresh, photometric="minisblack", metadata=None)
    files["fresh-consumer"] = {"path": fresh_path.name, "sha256": hashlib.sha256(fresh_path.read_bytes()).hexdigest(),
                               "dtype": "float32", "shape_yx": list(fresh.shape)}
    oracle = {
        "synthetic": True, "files": files,
        "source_generation": "Piecewise analytic cosine textures and fixed seeded controls; no FFT-generated truth",
        "positive_vectors_cycles_per_pixel": {"A": qa, "B": qb},
        "rotation_degrees": float(np.degrees(np.arctan2(3,4))),
        "bounds_B": {"boundary":[64,128],"boundary-shifted":[80,128],"narrow-f1-crop":[48,80],
                     "narrow-offset-left":[32,64],"narrow-offset-right":[72,104],"fresh-consumer":[88,120]},
        "interfaces_x": {"boundary":[64],"boundary-shifted":[80],"narrow-f1-crop":[48,80],
                         "narrow-offset-left":[32,64],"narrow-offset-right":[72,104]},
        "benchmark": {"initial_rect":[0,0,128,128],"initial_window_size":64,"stride_xy":[64,64],
                      "initial_windows":4,"additional_windows":4,"additional_window_size":32,
                      "total_window_cap":8,"total_fft_pixel_cap":20480,"random_seed":20261030,
                      "peak_threshold_rel":.18,"evaluation_vector_tolerance_cycles_per_pixel":.025},
        "limits":["Oracle never enters the plugin or fresh Agent input", "Failure or missed narrow structure must remain reported",
                  "Vector evidence is not phase identification", "Equal-budget comparisons charge all initial and added windows",
                  "Timing includes actual decisions and validation; no assumed speedup", "No physical XY scale is supplied"],
    }
    (directory/"oracle.json").write_text(json.dumps(oracle,indent=2)+"\n",encoding="utf-8")
    return oracle


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output",type=Path)
    result=create(parser.parse_args().output)
    print("Created public analytic F4-lite inputs and separate oracle; files:",len(result["files"]))
