"""Public analytic F3b fixtures; never import a production geometry solver.

The TIFF is a geometric cosine teaching model, not simulated HRTEM, an atomic
interface, experimental electron counts, or a specimen/material identification.
All truth follows from q_hkl=hkl/a and the hard-coded Cartesian matrices below.
"""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import tifffile


A_ANGSTROM = 4.0
N = 128
SQRT2, SQRT3, SQRT6 = math.sqrt(2), math.sqrt(3), math.sqrt(6)
PARENT_MATRIX = np.array([[1/SQRT6, 1/SQRT6, -2/SQRT6],
                          [1/SQRT3, 1/SQRT3, 1/SQRT3],
                          [1/SQRT2, -1/SQRT2, 0.]])
TWIN_MATRIX = np.array([[2, -1, 2], [2, 2, -1], [-1, 2, 2]], dtype=float)/3
CHILD_MATRIX = np.array([[2/SQRT6, -1/SQRT6, -1/SQRT6],
                         [1/SQRT3, 1/SQRT3, 1/SQRT3],
                         [0., -1/SQRT2, 1/SQRT2]])
BEAM111_MATRIX = np.array([[1/SQRT2, -1/SQRT2, 0.],
                           [1/SQRT6, 1/SQRT6, -2/SQRT6],
                           [1/SQRT3, 1/SQRT3, 1/SQRT3]])
PARENT_HKLS = [[1, 1, 1], [1, 1, -1], [2, 2, 0], [1, 1, 3]]
CHILD_HKLS = [[1, 1, 1], [-1, 1, 1], [0, 2, 2], [3, 1, 1]]
# Values are written explicitly, rather than projected by a production solver.
PARENT_QA = np.array([[0., SQRT3], [4/SQRT6, 1/SQRT3],
                      [4/SQRT6, 4/SQRT3], [-4/SQRT6, 5/SQRT3]])
CHILD_QA = np.array([[0., SQRT3], [-4/SQRT6, 1/SQRT3],
                     [-4/SQRT6, 4/SQRT3], [4/SQRT6, 5/SQRT3]])
PARENT_BINS = [[0, -3], [4, -1], [4, -4], [-4, -5]]
CHILD_BINS = [[0, -3], [-4, -1], [-4, -4], [4, -5]]
FCC_BASIS = [[0, 0, 0], [0, .5, .5], [.5, 0, .5], [.5, .5, 0]]
DIAMOND_BASIS = FCC_BASIS + [[.25, .25, .25], [.25, .75, .75],
                             [.75, .25, .75], [.75, .75, .25]]
TOLERANCES = {"matrix_absolute": 2e-12, "exact_q_inv_angstrom_absolute": 1e-11,
              "exact_fft_q_cycles_per_nm_absolute": 1e-10,
              "chosen_vector_admission_inv_angstrom": .005,
              "chosen_interface_admission_degrees": 1.0}


def cosine_roi(bins):
    y, x = np.indices((N, N))
    image = np.full((N, N), 20000., dtype=np.float64)
    # Unequal amplitudes do not carry any inference or correspondence weight.
    for (m, n), amplitude in zip(bins, [3000., 2500., 2000., 1500.]):
        image += amplitude*np.cos(2*np.pi*(m*x+n*y)/N)
    return image.astype(np.float32)


def cif_text(symbol, positions, label):
    lines = ["# Public synthetic geometry reference; a=4 A is a declared model.",
             "# No measured lattice parameter or material identification.",
             "data_"+label, "_cell_length_a 4", "_cell_length_b 4", "_cell_length_c 4",
             "_cell_angle_alpha 90", "_cell_angle_beta 90", "_cell_angle_gamma 90",
             "_space_group_name_H-M_alt 'P 1'", "_space_group_IT_number 1",
             "loop_", "_atom_site_label", "_atom_site_type_symbol",
             "_atom_site_fract_x", "_atom_site_fract_y", "_atom_site_fract_z"]
    lines += [f"{symbol}{i+1} {symbol} {x:g} {y:g} {z:g}"
              for i, (x, y, z) in enumerate(positions)]
    return "\n".join(lines)+"\n"


def truth():
    a_nm = A_ANGSTROM/10
    angle = math.radians(40)
    r40 = np.array([[math.cos(angle), -math.sin(angle)],
                    [math.sin(angle), math.cos(angle)]])
    return {
        "schema_version": 1,
        "provenance": "public independently calculated cubic reciprocal geometry",
        "interpretation_status": "hypothesized",
        "image_model": "sum of cosines; not HRTEM/scattering/atomic-interface simulation",
        "lattice_parameter_angstrom": A_ANGSTROM,
        "q_convention": "cycles per length, q_cartesian=hkl/a; no 2pi",
        "array_axes": ["y", "x"], "shape_yx": [2*N, N],
        "source_xy_scale_nm": [a_nm*SQRT6/N, -a_nm*SQRT3/N],
        "source_coordinate_convention": "source pixel centres, x right, y increasing rows down; physical metric is signed",
        "parent_rect_xyxy": [0, 0, N, N], "child_rect_xyxy": [0, N, N, 2*N],
        "parent_zone_uvw": [1, -1, 0], "parent_in_plane_uvw": [1, 1, -2],
        "child_zone_uvw": [0, -1, 1], "child_in_plane_uvw": [2, -1, -1],
        "parent_matrix_source_to_lab": PARENT_MATRIX.tolist(),
        "twin_rotation_source": TWIN_MATRIX.tolist(),
        "child_matrix_source_to_lab": CHILD_MATRIX.tolist(),
        "parent_hkls": PARENT_HKLS, "child_hkls": CHILD_HKLS,
        "parent_fft_bin_vectors_xy": PARENT_BINS, "child_fft_bin_vectors_xy": CHILD_BINS,
        "fft_center_xy": [N//2, N//2], "fft_options": {"window": "none", "subtract_mean": True},
        "parent_q_xy_inv_angstrom": (PARENT_QA/A_ANGSTROM).tolist(),
        "child_q_xy_inv_angstrom": (CHILD_QA/A_ANGSTROM).tolist(),
        "parent_q_xy_cycles_per_nm": (PARENT_QA/a_nm).tolist(),
        "child_q_xy_cycles_per_nm": (CHILD_QA/a_nm).tolist(),
        "friedel_partners": "Each real cosine supplies q and -q; count one family and preserve both IDs.",
        "interface_trace_source_pixels": [[0, N], [N-1, N]],
        "interface_trace_physical_direction_xy": [1, 0],
        "wrong_interface_source_pixels": [[N//2, 16], [N//2, 2*N-16]],
        "expected_wrong_interface_angle_degrees": 90,
        "non_twin_40deg_q_xy_inv_angstrom": (PARENT_QA@r40.T/A_ANGSTROM).tolist(),
        "non_twin_40deg_to_sigma3_min_misorientation_degrees": 30.528779365509298,
        "non_twin_scope": "analytic negative only; rotated cosine peaks are not integer bins in this 128px metric",
        "beam111_ambiguity": {
            "orientation_matrix": BEAM111_MATRIX.tolist(),
            "hkls": [[2, -2, 0], [2, 0, -2], [0, 2, -2]],
            "q_xy_times_a": [[2*SQRT2, 0], [SQRT2, SQRT6], [-SQRT2, SQRT6]],
            "identity_and_sigma3_unlabeled_peak_sets_identical": True,
            "coherent_111_projected_normal_zero": True,
            "expected_discrimination": "insufficient_evidence"},
        "tolerances": TOLERANCES,
        "scope": "Independent analytic synthetic geometry; no real specimen, unique 3D twin, phase, coherence, contrast, intensity or instrument qualification."}


def create_fixture(outdir):
    """Create one public TIFF, two explicit CIF references and JSON truth.

    Returns absolute file paths and truth for the ordinary saved-image MCP flow.
    Existing files are refused: invoke with a fresh explicit fixture directory.
    """
    directory = Path(outdir).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    files = {"image": directory/"sigma3_111_edge_on_cosines.tiff",
             "fcc_cif": directory/"synthetic_fcc_a4.cif",
             "diamond_cif": directory/"synthetic_diamond_a4.cif",
             "truth": directory/"truth.json"}
    if any(path.exists() for path in files.values()):
        raise FileExistsError("Use a fresh fixture directory; existing fixture files are preserved")
    image = np.concatenate([cosine_roi(PARENT_BINS), cosine_roi(CHILD_BINS)])
    tifffile.imwrite(files["image"], image, photometric="minisblack", metadata=None)
    files["fcc_cif"].write_text(cif_text("Cu", FCC_BASIS, "synthetic_fcc"), encoding="ascii")
    files["diamond_cif"].write_text(cif_text("C", DIAMOND_BASIS, "synthetic_diamond"), encoding="ascii")
    result = truth()
    result["file_sha256"] = {key: hashlib.sha256(path.read_bytes()).hexdigest()
                             for key, path in files.items() if key != "truth"}
    files["truth"].write_text(json.dumps(result, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    return {**{key: str(path) for key, path in files.items()}, "truth_data": result}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("outdir", type=Path)
    arguments = parser.parse_args()
    print(json.dumps(create_fixture(arguments.outdir), indent=2))
