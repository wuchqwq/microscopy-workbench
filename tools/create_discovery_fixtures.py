"""Public analytic F4b attention fixtures; independent of production analysis.

The truth describes an image-formula perturbation, never material-defect truth.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import tifffile


def cases():
    y, x = np.indices((256, 256), dtype=np.float64)

    def lattice(xx, yy):
        return (np.cos(2*np.pi*xx/8) + .8*np.cos(2*np.pi*yy/8)
                + .25*np.cos(2*np.pi*(xx+yy)/8))

    base = lattice(x, y)
    envelope = 1-.9*np.exp(-((x-88)**2+(y-88)**2)/(2*10**2))
    theta = np.deg2rad(15.)
    xr = np.cos(theta)*(x-128)+np.sin(theta)*y+128
    yr = -np.sin(theta)*(x-128)+np.cos(theta)*y
    return {
        "amplitude_dip": {
            "image": (envelope*base).astype(np.float32),
            "truth_rects": [[72,72,104,104]], "manual_rect": [56,56,120,120],
            "manual_reason": "Synthetic analyst attention: visually depressed texture contrast; carrier phase and physical cause unconfirmed.",
            "description": "Smooth prescribed image-amplitude depression; no carrier phase/frequency/displacement change",
            "analytic_carriers_cycles_per_pixel": [[.125,0],[0,.125],[.125,.125]],
            "calibration_nm_xy": [.02,-.03],
        },
        "orientation_interface": {
            "image": np.where(x<128,base,lattice(xr,yr)).astype(np.float32),
            "truth_rects": [[112,0,144,256]], "manual_rect": [96,96,160,160],
            "manual_reason": "Synthetic analyst attention: image orientation interface; not a twin or a material boundary identification.",
            "description": "Prescribed15-degree image texture change at x128, not an atomistic interface model",
            "calibration_nm_xy": None,
        },
        "clean": {
            "image": base.astype(np.float32), "truth_rects": [], "manual_rect": [56,56,120,120],
            "manual_reason": "Synthetic analyst control ROI in an unchanged lattice; no anomaly or defect claimed.",
            "description": "Unchanged periodic texture with no registered attention anomaly",
            "calibration_nm_xy": None,
        },
        "white_noise": {
            "image": np.random.default_rng(20261031).standard_normal((256,256)).astype(np.float32),
            "truth_rects": [], "manual_rect": [56,56,120,120],
            "manual_reason": "Synthetic analyst noise-control ROI, not a claimed lattice, phase or material defect.",
            "description": "Fixed-seed20261031 white image noise; no registered lattice or local anomaly",
            "calibration_nm_xy": None,
        },
    }


def write_fixture(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    oracle = {"schema":"public-f4b-attention-truth-v1", "shape_yx":[256,256],
              "dtype":"float32", "coordinate_space":"selected_frame_pixels",
              "rect_convention":"half-open XYXY", "hit_iou_threshold":.10,
              "field_parameters":{"window_sizes":[128],"stride_xy":[128,128],"max_windows":4},
              "verification_window":64, "max_verification_windows_per_entry":1,
              "cases":{},
              "scope":"Independent prescribed image-formula truth; not material, specimen, detector-derived or statistical confidence truth"}
    for name, case in cases().items():
        path = directory/(name+".tiff")
        tifffile.imwrite(path, case["image"], metadata=None)
        oracle["cases"][name] = {key:value for key,value in case.items() if key!="image"}
        oracle["cases"][name].update(path=path.name,
                source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                pixel_sha256=hashlib.sha256(case["image"].tobytes()).hexdigest())
    (directory/"oracle.json").write_text(json.dumps(oracle,indent=2)+"\n",encoding="utf-8",newline="\n")
    return oracle


def create_agent_fixture(directory):
    """Fresh public input for real-Agent tool composition, not the comparison.

    Return paths to the launcher; the developer truth file must not be supplied
    to the runtime Agent. No detector/scientific tool is imported or executed.
    """
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=False)
    y, x = np.indices((192,192), dtype=np.float64)
    base = np.cos(2*np.pi*x/8)+.8*np.cos(2*np.pi*y/8)
    envelope = 1-.92*np.exp(-((x-104)**2+(y-88)**2)/(2*15**2))
    image = (envelope*base).astype(np.float32)
    source = directory/"input.tiff"
    tifffile.imwrite(source, image, metadata=None)
    truth_path = directory/"truth.json"
    truth = {"scope":"Independent new-input Agent tool-composition check, not a replacement benchmark or material-defect truth",
             "withheld_from_runtime_agent":True,"shape_yx":[192,192],"dtype":"float32",
             "image_formula":"(cos(2*pi*x/8)+0.8*cos(2*pi*y/8)) * (1-0.92*exp(-((x-104)^2+(y-88)^2)/(2*15^2)))",
             "attention_center_xy":[104,88],"envelope_sigma_pixels":15,"amplitude_depth":.92,
             "analytic_carriers_cycles_per_pixel":[[.125,0],[0,.125]],
             "true_material_displacement_pixel_xy":[0,0],"physical_calibration":None,
             "source_sha256":hashlib.sha256(source.read_bytes()).hexdigest()}
    truth_path.write_text(json.dumps(truth,indent=2)+"\n",encoding="utf-8",newline="\n")
    return {"source_path":str(source),"truth_path":str(truth_path),
            "source_sha256":truth["source_sha256"],"shape_yx":[192,192],"dtype":"float32"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory",type=Path)
    args = parser.parse_args()
    print(json.dumps(write_fixture(args.directory)))


if __name__ == "__main__":
    main()
