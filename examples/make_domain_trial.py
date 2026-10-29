"""PUBLIC SYNTHETIC spatial-domain proxy with an analytic geometry oracle.

This is a signed float32 teaching/acceptance fixture, not microscopy data,
reconstruction, a phase map or a material identification. The scientific tools
never import this generator or its oracle. No FFT generates the source or truth.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import tifffile


def create(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    size = 128
    y, x = np.indices((size, size), dtype=np.float64)

    def tones(vectors, amplitudes):
        return sum(amplitude * np.cos(2 * np.pi * (qx * x + qy * y) / size)
                   for (qx, qy), amplitude in zip(vectors, amplitudes))

    qa, qb, square_q = [[10, 0], [0, 15]], [[8, 6], [-9, 12]], [[12, 0], [0, 12]]
    a, b = tones(qa, [1, .7]), tones(qb, [1, .7])
    square = tones(square_q, [1, 1])
    tiles = [a, b, .65 * a + .8 * b, np.full_like(a, -.375), square, square.copy()]
    names = ["pure-A", "pure-B-rotated", "mixed-A-plus-B", "constant", "square", "square-copy"]
    vectors = [qa, qb, qa + qb, [], square_q, square_q]
    mosaic = np.concatenate([np.concatenate(tiles[:3], axis=1), np.concatenate(tiles[3:], axis=1)], axis=0).astype(np.float32)
    source = output / "synthetic-spatial-domains.tiff"
    tifffile.imwrite(source, mosaic, photometric="minisblack", metadata=None)
    sequence = output / "synthetic-domain-sequence.tiff"
    tifffile.imwrite(sequence, np.stack(tiles[:3]).astype(np.float32), photometric="minisblack", metadata=None)
    # Separate true piecewise boundary; the existing A+B mosaic tile remains
    # explicitly a superposition. Shifted/multiscale windows sample this boundary
    # without treating their centers or widths as its measured localization.
    boundary = output / "synthetic-domain-boundary.tiff"
    boundary_values = np.concatenate([a, b], axis=1).astype(np.float32)
    tifffile.imwrite(boundary, boundary_values, photometric="minisblack", metadata=None)
    controls = output / "synthetic-feature-controls.tiff"
    control_values = np.stack([np.full_like(a, -.375), np.random.default_rng(20261030).normal(0, .3, a.shape)]).astype(np.float32)
    tifffile.imwrite(controls, control_values, photometric="minisblack", metadata=None)
    angle = float(np.degrees(np.arctan2(3, 4)))
    rects = [[(i % 3) * size, (i // 3) * size, (i % 3 + 1) * size, (i // 3 + 1) * size] for i in range(6)]
    oracle = {
        "synthetic": True,
        "description": "Analytic signed float spatial mosaic; not experimental domains, phases or reconstruction",
        "dtype": "float32", "shape_yx": list(mosaic.shape), "roi_shape_yx": [size, size],
        "source": source.name, "sequence_source": sequence.name,
        "regions": [{"region_index": i, "label": name, "rect": rects[i], "positive_tones_bins_xy": vectors[i],
                     "all_tones_cycles_per_pixel": [[sign * qx / size, sign * qy / size] for qx, qy in vectors[i] for sign in [1, -1]]}
                    for i, name in enumerate(names)],
        "rotation": {"reference_index": 0, "target_index": 1, "angle_degrees": angle,
                     "matrix_xy": [[.8, -.6], [.6, .8]], "convention": "target column vector = R(angle) @ reference column vector",
                     "formula": "R*[10,0]=[8,6]; R*[0,15]=[-9,12] exactly in bins"},
        "controls": {"mixed": {"index": 2, "formula": "0.65*A + 0.8*B; synthetic superposition, not spatial segmentation",
                               "expected": "Partial match with unmatched families, not one pure rotated signature"},
                     "constant": {"index": 3, "value": -.375, "expected": "No nonzero-frequency measurements after mean subtraction"},
                     "square": {"reference_index": 4, "target_index": 5, "angles_degrees": [-180, -90, 0, 90, 180],
                                "expected": "Several accepted rotations retained; symmetry is not unique orientation"}},
        "sequence": {"frame_count": 3, "source_region_indices": [0, 1, 2], "rect": [0, 0, size, size],
                     "meaning": "synthetic ordered patterns; no physical time or depth"},
        "calibration": {"x": .025, "y": .025, "unit": "nm", "source": "Optional explicit synthetic validation scale; not experimental"},
        "uncertainty": "No experimental uncertainty supplied; geometric residuals are not confidence or phase probability",
        "feature_field": {
            "boundary_source": boundary.name, "boundary_source_shape_yx": [128, 256],
            "true_boundary_source_x": 128, "formula": "A for source x<128, B for source x>=128; no blending or interpolation",
            "rects": [[0, 0, 128, 128], [128, 0, 256, 128], [64, 0, 192, 128], [80, 0, 208, 128],
                      [32, 32, 96, 96], [160, 32, 224, 96], [96, 32, 160, 96], [96, 16, 192, 112]],
            "window_roles": ["pure-A-128", "pure-B-128", "boundary-centered-128", "boundary-shifted-128",
                             "pure-A-64", "pure-B-64", "boundary-centered-64", "boundary-shifted-96"],
            "sampling_note": "Window centers and widths are sampling support, not inferred boundary locations or uncertainty",
            "controls_source": controls.name,
            "controls": [{"frame_index": i, "kind": name, "mean": float(values.astype(np.float64).mean()),
                          "standard_deviation": float(values.astype(np.float64).std()), "minimum": float(values.min()), "maximum": float(values.max())}
                         for i, (name, values) in enumerate(zip(["constant-negative", "seeded-isotropic-noise"], control_values))],
            "noise_seed": 20261030, "noise_generator": "numpy.default_rng standard normal scaled by0.3, float32",
            "claims": "Independent analytic boundary and source moments only; no segmented phase or experimental boundary-resolution claim",
        },
        "files_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [source, sequence, boundary, controls]},
    }
    (output / "oracle.json").write_text(json.dumps(oracle, indent=2) + "\n", encoding="utf-8")
    return oracle


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    create(args.output)
    print(args.output.resolve())
