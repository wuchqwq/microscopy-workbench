"""Exercise the shipped CLI on small CPU fixtures in a standalone directory."""

import importlib.util
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile


def run_cli(folder, *args, error_text=None, standard_library_only=False):
    command = [sys.executable, "-E", "-B"]
    if standard_library_only:
        command.append("-S")
    result = subprocess.run(
        [*command, str(folder / "ptyrad_check.py"), *map(str, args)], cwd=folder,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if error_text is not None:
        assert result.returncode == 2 and error_text in result.stderr, result.stderr
        return None
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout) if result.stdout else None


def write_tiny_dm4(path, data):
    """Write two synthetic image records with the subset of DM4 tags read by ncempy."""
    def integers(*values):
        return struct.pack(f">{len(values)}Q", *values)

    def entry(name, tag_type, payload):
        label = name.encode("ascii")
        return struct.pack(">BH", tag_type, len(label)) + label + integers(len(payload)) + payload

    def group(*entries):
        return bytes((1, 1)) + integers(len(entries)) + b"".join(entries)

    def scalar(name, value):
        return entry(name, 21, b"%%%%" + integers(1, 3) + struct.pack("<i", value))

    def nested(name, *entries):
        return entry(name, 20, group(*entries))

    def image(name, shape, pixels):
        dims = nested("Dimensions", *(scalar(str(i), n) for i, n in enumerate(reversed(shape), 1)))
        cal = nested("Calibrations", nested("Dimension", nested("1", scalar("Scale", 1))))
        raw = entry("Data", 21, b"%%%%" + integers(3, 20, 10, len(pixels)) + pixels)
        return nested(name, nested("ImageData", dims, cal, scalar("DataType", 6), raw))

    body = group(nested("ImageList", image("1", (2, 2), bytes(4)), image("2", data.shape, data.tobytes())))
    path.write_bytes(struct.pack(">IQI", 4, len(body), 1) + body)


def main():
    try:
        import numpy as np
        from scipy.ndimage import fourier_shift, gaussian_filter
    except ImportError as error:
        raise SystemExit(f"The smoke check needs NumPy and SciPy: {error}") from error

    with tempfile.TemporaryDirectory(prefix="ptyrad-cli-check-") as work:
        folder = Path(work)
        scripts = Path(__file__).resolve().parent
        for name in ("ptyrad_check.py", "diffraction_check.py", "phase_tilt.py", "calibration_math.py"):
            shutil.copyfile(scripts / name, folder / name)

        scale_result = subprocess.check_output(
            [sys.executable, "-E", "-B", "-S", "calibration_math.py", "--voltage-kv", "300",
             "--bf-radius-px", "94.4", "--dk-angstrom-inv-per-px", "0.01012653"], cwd=folder,
        )
        assert abs(json.loads(scale_result)["semiangle_mrad_paraxial"] - 18.82) < .01
        print("PASS scale: 300 kV, 94.4 px and stated dk give 18.82 mrad")

        result = run_cli(folder, "rotation", "--pair", 0, 1, 1, 0, "--pair", 1, 2, 2, -1,
                         "--check-pair", -1, 2, 2, 1, standard_library_only=True)
        direct, mirror = result["candidates"]
        assert np.allclose(direct["rotation_clockwise_deg"], [90, 270])
        assert direct["held_out_errors"]["rms_deg"] < 1e-6 < mirror["held_out_errors"]["rms_deg"]
        result = run_cli(folder, "rotation", "--oriented", "--pair", 0, 1, -1, 0,
                         "--pair", 1, 2, -2, -1, "--check-pair", -1, 2, -2, 1)
        assert np.allclose(result["candidates"][1]["rotation_clockwise_deg"], [90])
        assert result["candidates"][1]["held_out_errors"]["rms_deg"] < 1e-6
        run_cli(folder, "rotation", "--pair", 0, 1, 1, 0, error_text="two nonparallel")
        print("PASS rotation: 90/270 deg, mirror, held-out residual and nonparallel input")

        y, x = np.ogrid[:64, :72]
        pattern = gaussian_filter((np.hypot(x - 35.25, y - 30.75) < 19.5).astype(float), 0.8)
        scale = np.arange(1, 31, dtype=float).reshape(5, 6, 1, 1)
        raw = (3.0 + 20.0 * pattern * scale).astype(np.float32)
        np.save(folder / "scan.npy", raw)
        np.save(folder / "flat.npy", raw.reshape(-1, 64, 72))
        assert run_cli(folder, "disk", "scan.npy", "--list")["datasets"][0]["shape"] == list(raw.shape)
        roi_args = ("--roi", 1, 5, 2, 6, "--radius-range", 15, 25)
        disk = run_cli(folder, "disk", "scan.npy", "--layout", "scan4d", *roi_args,
                       "--arrays", "arrays.npz", "--virtual-annulus", 21, 26)
        assert disk["fit_status"] == "CANDIDATE" and disk["pattern_count"] == 16, disk
        assert np.allclose(disk["center_xy_px"], [35.25, 30.75], atol=.5)
        assert abs(disk["radius_px"] - 19.5) < .6
        with np.load(folder / "arrays.npz") as arrays:
            assert np.allclose(arrays["mean_dp"], raw[1:5, 2:6].mean(axis=(0, 1), dtype=float))
            assert np.allclose(arrays["virtual_total"], raw[1:5, 2:6].sum(axis=(2, 3), dtype=float))
            assert arrays["virtual_annulus"].shape == (4, 4)
        flat = run_cli(folder, "disk", "flat.npy", "--layout", "flat3d", "--scan-shape", 5, 6, *roi_args)
        assert np.allclose(flat["center_xy_px"], disk["center_xy_px"])
        run_cli(folder, "disk", "scan.npy", "--list", standard_library_only=True, error_text="NumPy")
        print("PASS disk: inventory, ROI, center/radius, raw mean and virtual image, missing dependency")

        texture = gaussian_filter(np.random.default_rng(18).normal(size=(64, 64)), 1.25, mode="wrap")
        step = np.array([.55, -.80])
        spectrum = np.fft.fft2(texture)
        stack = np.array([np.fft.ifft2(fourier_shift(spectrum, i * step)).real for i in range(5)], dtype=np.float32)
        np.save(folder / "phase.npy", stack)
        tilt_args = ("--dx-nm", .02, "--dz-nm", 1.25, "--z-range", 0, 5, "--roi", 8, 56, 8, 56)
        run_cli(folder, "--output", "tilt.json", "tilt", "phase.npy", *tilt_args)
        report = json.loads((folder / "tilt.json").read_text(encoding="utf-8"))
        measured = report["regions"][0]["estimate"]["apparent_tilt_yx_mrad"]
        assert np.allclose(measured, 1000 * np.arctan(step * .02 / 1.25), atol=.8), measured
        run_cli(folder, "--output", "tilt.json", "tilt", "phase.npy", *tilt_args, error_text="already exists")
        np.save(folder / "empty_phase.npy", np.zeros_like(stack))
        empty = run_cli(folder, "tilt", "empty_phase.npy", *tilt_args)
        assert empty["regions"][0]["status"] == "NO_ESTIMATE"
        print(f"PASS tilt: known drift recovered as {measured[0]:+.2f}, {measured[1]:+.2f} mrad; blank phase rejected")

        if importlib.util.find_spec("h5py") is not None:
            import h5py

            with h5py.File(folder / "scan.h5", "w") as file:
                file["dp"] = raw.reshape(-1, 64, 72)
            h5 = run_cli(folder, "disk", "scan.h5", "--key", "/dp", "--layout", "flat3d",
                         "--scan-shape", 5, 6, *roi_args)
            assert np.allclose(h5["center_xy_px"], disk["center_xy_px"])
            print("PASS HDF5: same ROI result as NPY")
        else:
            print("SKIP HDF5: install h5py to exercise that input format")

        if importlib.util.find_spec("ncempy") is not None:
            dm4_path = folder / "scan.dm4"
            dm4_data = (raw / 3).astype(np.uint8)
            write_tiny_dm4(dm4_path, dm4_data)
            original = dm4_path.read_bytes()
            inventory = run_cli(folder, "disk", "scan.dm4", "--list")
            assert inventory["datasets"][0]["shape"] == list(dm4_data.shape)
            dm4 = run_cli(folder, "disk", "scan.dm4", "--dset", 0, "--layout", "scan4d", *roi_args,
                          "--arrays", "dm4_arrays.npz")
            assert dm4["pattern_count"] == 16 and dm4["fit_status"] == "CANDIDATE", dm4
            with np.load(folder / "dm4_arrays.npz") as arrays:
                assert np.array_equal(arrays["mean_dp"], dm4_data[1:5, 2:6].mean(axis=(0, 1)))
            assert dm4_path.read_bytes() == original
            print("PASS DM4: real reader selected the synthetic record and returned the exact ROI mean")
        else:
            print("SKIP DM4: install ncempy to exercise that input format")

        if importlib.util.find_spec("tifffile") is not None:
            import tifffile

            tifffile.imwrite(folder / "phase.tif", stack, imagej=True, metadata={"axes": "ZYX"})
            tiff = run_cli(folder, "tilt", "phase.tif", *tilt_args)
            assert np.allclose(tiff["regions"][0]["estimate"]["apparent_tilt_yx_mrad"], measured)
            print("PASS TIFF: same signed phase estimate as NPY")
        else:
            print("SKIP TIFF: install tifffile to exercise that input format")


if __name__ == "__main__":
    main()
