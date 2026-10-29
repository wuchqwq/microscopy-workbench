"""PUBLIC SYNTHETIC reconstructed-sequence proxy with independent truth.

This fixture is not ptychography reconstruction or experimental microscopy.
The runtime tools never import this generator or its oracle. Integer translation
copies samples exactly (no interpolation), with a constant outside the source.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter
import tifffile


def translated(array, dx, dy, fill=22000):
    height, width = array.shape
    result = np.full_like(array, fill)
    x0, y0 = max(0, -dx), max(0, -dy)
    x1, y1 = min(width, width - dx), min(height, height - dy)
    result[y0 + dy:y1 + dy, x0 + dx:x1 + dx] = array[y0:y1, x0:x1]
    return result


def create(output, seed=20261029, size=96):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    y, x = np.indices((size, size))
    rng = np.random.default_rng(seed)
    texture = gaussian_filter(rng.normal(size=(size, size)), sigma=2, mode="reflect")
    texture *= 1600 / texture.std()
    ideal = 22000 + 4000 * np.cos(2 * np.pi * x / 8) + 2600 * np.cos(2 * np.pi * y / 12)
    base = np.rint(ideal + texture).astype(np.uint16)
    edge = (size - 48) // 2
    rect = [edge, edge, edge + 48, edge + 48]
    change = np.zeros_like(ideal)
    change[edge:edge + 48, edge:edge + 48] = 1400 * np.cos(2 * np.pi * x[edge:edge + 48, edge:edge + 48] / 6)
    modified = np.rint(ideal + texture + change).astype(np.uint16)
    shifts = [[-3, 2], [0, 0], [4, -2]]
    stack = np.stack([translated(base, *shifts[0]), base, translated(modified, *shifts[2])])
    source = output / "synthetic-reconstructed-sequence.tiff"
    tifffile.imwrite(source, stack, photometric="minisblack", metadata=None)
    periodic = np.rint(22000 + 4000 * np.cos(2 * np.pi * x / 8) + 2600 * np.cos(2 * np.pi * y / 8)).astype(np.uint16)
    ambiguous = output / "synthetic-periodic-ambiguity.tiff"
    tifffile.imwrite(ambiguous, np.stack([periodic, periodic, periodic]), photometric="minisblack", metadata=None)
    truth = {
        "synthetic": True,
        "description": "Reconstructed-sequence proxy only; not a ptychography reconstruction or specimen",
        "seed": seed, "shape_zyx": list(stack.shape), "dtype": "uint16",
        "reference_index": 1, "reference_rect": rect,
        "target_shift_xy": shifts,
        "target_rects": [[rect[0]+dx, rect[1]+dy, rect[2]+dx, rect[3]+dy] for dx, dy in shifts],
        "translation_convention": "target_xy = reference_xy + shift_xy; integer copy; no interpolation",
        "reference_tones_cycles_per_pixel": [[.125, 0], [-.125, 0], [0, 1/12], [0, -1/12]],
        "new_local_tones_frame2_cycles_per_pixel": [[1/6, 0], [-1/6, 0]],
        "local_change": {"reference_rect": rect, "formula": "1400*cos(2*pi*x/6), added before rounding and translation"},
        "nonperiodic_texture": {"generator": "seeded standard-normal, scipy.ndimage.gaussian_filter sigma2 reflect, scaled to std1600", "purpose": "disambiguates periodic lattice translation"},
        "xy_scale": {"x": .025, "y": -.03, "unit": "nm", "source": "Explicit synthetic validation scale; not experimental"},
        "sequence_meaning": "unknown until caller supplies a sourced meaning; no physical frame spacing",
        "periodic_control": {"shape_yx": [size, size], "period_xy": [8, 8], "expected": "AMBIGUOUS with bounded max_shift8; equal maxima at multiple lattice translations"},
        "files_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [source, ambiguous]},
    }
    (output / "oracle.json").write_text(json.dumps(truth, indent=2) + "\n", encoding="utf-8")
    return truth


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--seed", type=int, default=20261029)
    parser.add_argument("--size", type=int, default=96, choices=[96, 120, 144])
    args = parser.parse_args()
    create(args.output, args.seed, args.size)
    print(args.output.resolve())
