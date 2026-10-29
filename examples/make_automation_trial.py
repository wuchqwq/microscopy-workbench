"""Create a PUBLIC SYNTHETIC alternate input for a fresh plugin session.

No sample coordinate/answer is passed to the runtime Agent. The formula and
scale here are independent validation evidence, not experimental calibration.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import tifffile

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
parser.add_argument("--width", type=int, default=96)
parser.add_argument("--height", type=int, default=72)
args = parser.parse_args()
if not (32 <= args.width <= 512 and 32 <= args.height <= 512):
    parser.error("Each synthetic dimension must be32..512")
args.output.mkdir(exist_ok=False, parents=True)
y, x = np.indices((args.height, args.width))
image = np.rint(22000 + 5000*np.cos(2*np.pi*x/8) + 2600*np.cos(2*np.pi*y/12)).astype(np.uint16)
tifffile.imwrite(args.output / "synthetic-alternate.tiff", image, photometric="minisblack", metadata=None)
# A deliberately explicit simple-cubic candidate: geometry comparison only.
(args.output / "candidate.cif").write_text("""data_candidate
_cell_length_a 4.0
_cell_length_b 4.0
_cell_length_c 4.0
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_space_group_name_H-M_alt 'P 1'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Cu1 Cu 0 0 0
""", encoding="utf-8")
(args.output / "oracle.json").write_text(json.dumps({"synthetic": True, "shape_yx": list(image.shape),
    "dtype": "uint16", "formula": "round(22000+5000*cos(2*pi*x/8)+2600*cos(2*pi*y/12))",
    "xy_scale": {"x": .025, "y": -.025, "unit": "nm"},
    "frequency_cycles_per_pixel": [[.125,0],[-.125,0],[0,1/12],[0,-1/12]],
    "interpretation": "Two ideal tones; conjugate pairs not independent; candidate is not a sample identity."}, indent=2)+"\n", encoding="utf-8")
print(args.output.resolve())
