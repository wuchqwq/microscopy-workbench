"""Public analytic projected-topology fixtures, independent of the kernel.

Truth is prescribed by the continuum Volterra field, never inferred from a
discrete phase-circulation implementation. These are sampled periodic textures,
not multislice images, atomistic relaxations, or validated material specimens.
The tolerance manifest was fixed before the first F3a independent execution.
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


G_VECTORS = np.array([[0.125, 0.0], [0.0, 0.125], [0.125, 0.125]])
MASK_SIGMA = 0.012
REFERENCE_RECT = [56, 56, 88, 88]
NESTED_LOOPS = [[80, 80, 176, 176], [64, 64, 192, 192]]
SHIFTED_LOOP = [72, 68, 184, 188]
EXTERIOR_LOOP = [40, 40, 72, 72]
TOLERANCES = {
    "exact_winding_integer_max_abs_error": 1e-8,
    "filtered_winding_integer_max_abs_error": 1e-6,
    "burgers_pixel_xy_max_abs_error": 1e-6,
    "candidate_reciprocal_cycle_residual_max_abs": 0.05,
    "path_phase_step_limit_radians": float(0.8 * np.pi),
    "core_taper_radius_pixels": 2.0,
    "smooth_null_min_max_abs_displacement_gradient": 0.10,
}


def regular_field(shape_yx=(256, 256), kind="none"):
    """Single-valued displacement and its analytic XY derivative."""
    yy, xx = np.indices(shape_yx, dtype=np.float64)
    u = np.zeros((*shape_yx, 2), dtype=np.float64)
    gradient = np.zeros((*shape_yx, 2, 2), dtype=np.float64)
    if kind == "smooth_hotspot":
        dx, dy, sigma = xx - 128, yy - 128, 12.0
        bump = np.exp(-(dx * dx + dy * dy) / (2 * sigma ** 2))
        u[..., 0], u[..., 1] = 3.0 * bump, -2.0 * bump
        gradient[..., 0, 0] = -3.0 * dx / sigma ** 2 * bump
        gradient[..., 0, 1] = -3.0 * dy / sigma ** 2 * bump
        gradient[..., 1, 0] = 2.0 * dx / sigma ** 2 * bump
        gradient[..., 1, 1] = 2.0 * dy / sigma ** 2 * bump
    elif kind == "affine":
        gradient[:] = [[0.04, 0.02], [0.0, -0.03]]
        u[..., 0] = 0.04 * (xx - 128) + 0.02 * (yy - 128)
        u[..., 1] = -0.03 * (yy - 128)
    elif kind != "none":
        raise ValueError("Unknown independently prescribed regular field")
    return u, gradient


def volterra_fixture(burgers_xy=(8.0, 0.0), *, center_xy=(128.5, 128.5),
                     shape_yx=(256, 256), regular="none", cores=None):
    """Real multitone texture from u=sum b*atan2(y-cy,x-cx)/(2*pi).

    A positive-image-XY loop travels E,S,W,N, increasing atan2 by 2*pi.
    Therefore the analytic phase winding is -G dot sum(enclosed b), by the
    specified constitutive phase phi=-2*pi*G*u. The optional regular field is
    single valued and contributes exactly zero continuum circulation.

    Each nonzero-winding carrier has amplitude tanh(r/2)**abs(G dot b).
    This explicit core taper removes its undefined core contrast without
    changing the analytical Burgers truth or any enclosing loop phase.
    """
    yy, xx = np.indices(shape_yx, dtype=np.float64)
    xy = np.stack((xx, yy), axis=-1)
    displacement, gradient = regular_field(shape_yx, regular)
    amplitude = np.ones((len(G_VECTORS), *shape_yx), dtype=np.float64)
    core_specs = [(list(center_xy), list(burgers_xy))] if cores is None else cores
    for center, burgers in core_specs:
        dx, dy = xx - center[0], yy - center[1]
        theta = np.arctan2(dy, dx)
        b = np.asarray(burgers, dtype=np.float64)
        displacement += theta[..., None] * b / (2 * np.pi)
        charges = G_VECTORS @ b
        taper = np.tanh(np.hypot(dx, dy) / TOLERANCES["core_taper_radius_pixels"])
        amplitude *= taper[None] ** np.abs(charges)[:, None, None]
    phase = -2 * np.pi * np.einsum("ji,yxi->jyx", G_VECTORS, displacement)
    carrier = 2 * np.pi * np.einsum("ji,yxi->jyx", G_VECTORS, xy)
    image = np.sum(amplitude * np.cos(carrier + phase), axis=0)
    return {"image": image, "phase_wrapped": np.angle(np.exp(1j * phase)),
            "amplitude": amplitude, "displacement_pixel_xy": displacement,
            "regular_gradient_xy": gradient, "cores": core_specs}


def null_fixture(kind="smooth_hotspot"):
    return volterra_fixture(cores=[], regular=kind)


def opposite_pair_fixture():
    return volterra_fixture(cores=[([100.5, 128.5], [8.0, 0.0]),
                                   ([156.5, 128.5], [-8.0, 0.0])])


def contrast_vortex_fixture():
    """A contrast-only counterexample with exactly the same real intensities.

    The prescribed lattice carriers remain exp(i*2*pi*g*x), and their complex
    image contrast coefficients C_j=A_j*exp(-i*(g_j dot b)*theta) vary instead.
    No atom coordinates or material displacement are changed in this model.
    The decomposition is observationally identical to the Volterra texture;
    phase winding alone cannot identify the physical origin of image contrast.
    """
    result = volterra_fixture()
    result["true_material_displacement_pixel_xy"] = np.zeros_like(result["displacement_pixel_xy"])
    result["true_material_burgers_pixel_xy"] = [0.0, 0.0]
    result["image_model"] = "fixed_carrier_contrast_coefficient_vortex"
    return result


def noise_fixture(seed=20261030):
    rng = np.random.default_rng(seed)
    shape = (256, 256)
    return {"image": rng.normal(size=shape),
            "phase_wrapped": rng.uniform(-np.pi, np.pi, (3, *shape)),
            "amplitude": np.ones((3, *shape))}


def continuum_truth(cores, rect, orientation="positive_image_xy"):
    """Analytic geometric inclusion, independent of sampled phase operations."""
    x0, y0, x1, y1 = rect
    enclosed_b = np.zeros(2)
    for center, burgers in cores:
        if x0 < center[0] < x1 - 1 and y0 < center[1] < y1 - 1:
            enclosed_b += burgers
    winding = -(G_VECTORS @ enclosed_b)
    if orientation == "negative_image_xy":
        winding = -winding
    return {"enclosed_burgers_pixel_xy": enclosed_b.tolist(),
            "phase_winding": winding.tolist()}


def manifest():
    return {
        "schema": "public-projected-topology-physics-v1",
        "evidence_scope": "public_synthetic_analytic_oracle_not_material_validation",
        "generator": "tools/create_topology_fixtures.py",
        "axes": "array[y,x]; vector[x,y]; positive image loop E,S,W,N (screen clockwise)",
        "shape_yx": [256, 256],
        "g_vectors_cycles_per_pixel": G_VECTORS.tolist(),
        "mask_sigma_cycles_per_pixel": MASK_SIGMA,
        "reference_rect_xyxy": REFERENCE_RECT,
        "image_formula": "I(x)=sum_j A_j(x)*cos(2*pi*g_j dot (x-u(x)))",
        "displacement_formula": "u=sum_k b_k*atan2(y-c_ky,x-c_kx)/(2*pi)+u_regular(x)",
        "phase_formula": "phi_j=-2*pi*g_j dot u; w_j=-g_j dot sum(enclosed b) for positive image XY",
        "core_amplitude_formula": "A_j=product_k tanh(r_k/2)**abs(g_j dot b_k)",
        "tolerance_preregistration": "Fixed in source and manifest before first F3a physics test execution; do not widen after failure",
        "preregistered_tolerances": TOLERANCES,
        "nested_rects_xyxy": NESTED_LOOPS,
        "shifted_rect_xyxy": SHIFTED_LOOP,
        "exterior_rect_xyxy": EXTERIOR_LOOP,
        "cases": {
            "positive": {"cores": [[[128.5, 128.5], [8.0, 0.0]]], "expected_winding": [-1, 0, -1]},
            "negative": {"cores": [[[128.5, 128.5], [-8.0, 0.0]]], "expected_winding": [1, 0, 1]},
            "opposite_pair": {"cores": [[[100.5, 128.5], [8.0, 0.0]], [[156.5, 128.5], [-8.0, 0.0]]],
                              "enclosing_net_winding": [0, 0, 0], "absence_claim_allowed": False},
            "invisible_reflection": {"g": [0, 0.125], "b": [8, 0], "winding": 0, "absence_claim_allowed": False},
            "smooth_hotspot_null": {"u": "[3,-2]*exp(-((x-128)^2+(y-128)^2)/(2*12^2))",
                                    "expected_winding": [0, 0, 0]},
            "affine_null": {"u": "[.04*(x-128)+.02*(y-128),-.03*(y-128)]", "expected_winding": [0, 0, 0]},
            "contrast_only_vortex": {"formula": "I=Re sum_j C_j(x)*exp(i*2*pi*g_j dot x)",
                                     "C_j": "A_j*exp(-i*(g_j dot [8,0])*atan2(y-128.5,x-128.5))",
                                     "true_material_burgers_pixel_xy": [0, 0],
                                     "measured_winding": [-1, 0, -1], "material_dislocation_confirmed": False},
            "noise": {"rng": "numpy.default_rng", "seed": 20261030,
                      "qualification": "selected path rejected by phase-step ambiguity; no universal noise detector claim"},
            "alias_limit": {"qualification": "near-pi steps are rejected; unsampled aliasing with small discrete steps is not identifiable"},
        },
        "metric": {"default": "unknown: pixel Burgers components only",
                   "signed_calibration_example_nm_xy": [0.02, -0.035],
                   "known_positive_b_nm_xy": [0.16, 0.0]},
        "limitations": ["Continuum texture model, not an atomistic/multislice or real-specimen validation",
                        "Core taper is explicit; interior core masking does not alter path truth",
                        "Integer arithmetic closure is not measurement uncertainty or physical confidence",
                        "Zero net winding and g dot b=0 do not establish defect absence",
                        "Image contrast vortices, projection and undetected sampling aliasing can mimic topology"],
    }


def write_fixtures(output, truth_only=False):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    truth = manifest()
    if not truth_only:
        truth["generated_arrays"] = []
        for name, result in (("positive", volterra_fixture()), ("negative", volterra_fixture((-8, 0))),
                             ("opposite_pair", opposite_pair_fixture()), ("smooth_hotspot_null", null_fixture()),
                             ("affine_null", null_fixture("affine")), ("contrast_only_vortex", contrast_vortex_fixture()),
                             ("noise", noise_fixture())):
            path = output / (name + ".npz")
            np.savez_compressed(path, **{k: v for k, v in result.items() if isinstance(v, np.ndarray)})
            truth["generated_arrays"].append({"name": name, "file": path.name,
                                             "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    path = output / "topology_truth.json"
    path.write_text(json.dumps(truth, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    return path


def write_evidence(output):
    """Run bounded physics tests; retain raw failures with unchanged thresholds."""
    import subprocess
    import sys
    root = Path(__file__).resolve().parents[1]
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    result_path = output / "physics-results.json"
    previous = json.loads(result_path.read_text(encoding="utf-8")) if result_path.exists() else {}
    failures = previous.get("failure_history", [])
    command = [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_image_topology_physics.py", "-v"]
    run = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
    public_command = ["python", *command[1:]]
    raw = {"command": public_command, "returncode": run.returncode,
           "stdout": run.stdout, "stderr": run.stderr, "preregistered_tolerances": TOLERANCES}
    if run.returncode:
        failures.append(raw)
    local = root / "analysis" / "2026-10-30-f3a-physics"
    local.mkdir(parents=True, exist_ok=True)
    with (local / "execution-evidence.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({**raw, "local_command": command}) + "\n")
    document = {"status": "PASS" if run.returncode == 0 else "FAIL", **raw,
                "failure_history": failures,
                "semantic_followup": "Invalid-path scientific winding is unavailable (JSON null/NPY NaN); finite arithmetic sums are explicitly diagnostic only. Valid-path truth, tolerances and statuses unchanged; historical failure output retained verbatim.",
                "evidence_scope": "analytic_and_public_synthetic_only_not_real_specimen_material_validation"}
    if run.returncode == 0:
        document["measured_cases"], figure_cases = measured_evidence()
        document["summary_figure"] = "physics-summary.png"
        write_summary_figure(output / document["summary_figure"], figure_cases)
    result_path.write_text(json.dumps(document, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    print(run.stdout + run.stderr)
    if run.returncode:
        raise RuntimeError("Physics tests failed; raw output and original tolerances retained")
    return result_path


def measured_evidence():
    """Export measured values after tests pass; not used to generate truth."""
    from image_gpa_core import analyze as gpa_analyze
    from image_topology_core import analyze as topology_analyze
    cases = [("positive", volterra_fixture(), [-1, 0, -1]),
             ("negative", volterra_fixture((-8, 0)), [1, 0, 1]),
             ("smooth_hotspot_null", null_fixture(), [0, 0, 0]),
             ("opposite_pair_net_zero", opposite_pair_fixture(), [0, 0, 0]),
             ("contrast_only_material_b_zero", contrast_vortex_fixture(), [-1, 0, -1]),
             ("fixed_seed_noise", noise_fixture(), None)]
    rows, figures = [], []
    for name, case, expected in cases:
        spectrum = np.fft.fftshift(np.fft.fft2(case["image"])).astype(np.complex128)
        first = gpa_analyze(spectrum, G_VECTORS[[0, 1]], MASK_SIGMA, REFERENCE_RECT)
        second = gpa_analyze(spectrum, G_VECTORS[[0, 2]], MASK_SIGMA, REFERENCE_RECT)
        phase = np.concatenate((first["arrays"]["phase_demodulated_wrapped"],
                                second["arrays"]["phase_demodulated_wrapped"][[1]]))
        amplitude = np.concatenate((first["arrays"]["amplitude"], second["arrays"]["amplitude"][[1]]))
        result = topology_analyze(phase, amplitude, G_VECTORS, NESTED_LOOPS,
                                  edge_invalid=first["arrays"]["edge_invalid"])
        report = result["report"]
        scientific = result["arrays"]["loop_winding_cycles"]
        diagnostic = result["arrays"]["loop_diagnostic_winding_cycles"]
        row = {"name": name, "independent_analytic_winding": expected,
               "measured_winding_cycles_by_loop": np.where(np.isfinite(scientific), scientific, None).tolist(),
               "diagnostic_winding_cycles_by_loop": np.where(np.isfinite(diagnostic), diagnostic, None).tolist(),
               "diagnostic_winding_semantics": "Finite arithmetic sums on unavailable paths are not scientific winding evidence",
               "valid_paths_by_loop": result["arrays"]["loop_valid"].tolist(),
               "maximum_abs_phase_steps_radians_by_loop": result["arrays"]["loop_maximum_abs_phase_step_radians"].tolist(),
               "status": report["status"], "interpretation_status": report["interpretation_status"],
               "projected_burgers": report["projected_burgers"],
               "gpa_quality": [first["report"]["quality"], second["report"]["quality"]]}
        if "true_material_burgers_pixel_xy" in case:
            row["true_material_burgers_pixel_xy"] = case["true_material_burgers_pixel_xy"]
            row["material_dislocation_confirmed"] = False
        rows.append(row)
        figures.append((name, case["image"], phase[0], row))
    return rows, figures


def write_summary_figure(path, cases):
    """PIL image panels with explicit pixel coordinates and measured captions."""
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.load_default(size=16)
    small = ImageFont.load_default(size=13)
    card_w, card_h, side = 520, 340, 220
    canvas = Image.new("RGB", (card_w * 3, card_h * 2 + 66), "white")
    draw = ImageDraw.Draw(canvas)
    for index, (name, image, phase, row) in enumerate(cases):
        ox, oy = (index % 3) * card_w, (index // 3) * card_h
        draw.text((ox + 12, oy + 8), name, font=font, fill="black")
        lo, hi = np.percentile(image, [1, 99])
        grayscale = np.uint8(np.clip((image - lo) / max(hi - lo, 1e-12), 0, 1) * 255)
        raw = Image.fromarray(grayscale).convert("RGB").resize((side, side))
        # Hue encodes phase; this is display only, never a numerical input.
        hue = np.uint8((phase + np.pi) / (2 * np.pi) * 255)
        hsv = np.stack((hue, np.full_like(hue, 220), np.full_like(hue, 245)), axis=-1)
        phase_image = Image.fromarray(hsv, mode="HSV").convert("RGB").resize((side, side))
        for px, panel in ((ox + 18, raw), (ox + 270, phase_image)):
            canvas.paste(panel, (px, oy + 50))
            for rect in NESTED_LOOPS:
                x0, y0, x1, y1 = rect
                draw.rectangle((px + x0 * side / 256, oy + 50 + y0 * side / 256,
                                px + (x1 - 1) * side / 256, oy + 50 + (y1 - 1) * side / 256),
                               outline="#ffffff", width=2)
            draw.text((px, oy + 274), "x: 0 -> 255 px; y: down", font=small, fill="black")
        draw.text((ox + 18, oy + 30), "real sampled texture", font=small, fill="black")
        draw.text((ox + 270, oy + 30), "GPA phi(g0): -pi..pi hue", font=small, fill="black")
        values = row["measured_winding_cycles_by_loop"][0]
        values_text = ",".join("?" if v is None else "%.3g" % v for v in values)
        draw.text((ox + 18, oy + 295), "w(first loop)=[" + values_text + "] (? unavailable)", font=small, fill="black")
        draw.text((ox + 18, oy + 315), row["status"], font=small, fill="black")
    draw.text((15, card_h * 2 + 10), "PUBLIC SYNTHETIC ONLY. Compatible winding is hypothesized image-phase evidence; no material dislocation is confirmed.",
              font=font, fill="black")
    draw.text((15, card_h * 2 + 36), "Contrast-only and Volterra textures have identical intensities. Zero net winding does not establish defect absence.",
              font=font, fill="black")
    canvas.save(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--truth-only", action="store_true")
    parser.add_argument("--evidence", action="store_true")
    args = parser.parse_args()
    print(write_evidence(args.output) if args.evidence else write_fixtures(args.output, args.truth_only))
