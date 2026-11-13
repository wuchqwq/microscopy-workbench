"""Convert explicit 4D-STEM scale inputs in the PtyRAD paraxial convention."""

import argparse
import json
import math


def positive_float(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("expected a positive finite number")
    return number


def grid_size(value):
    size = int(value)
    if size < 2:
        raise argparse.ArgumentTypeError("expected a grid side of at least two pixels")
    return size


def electron_wavelength_angstrom(voltage_kv):
    # h*c and m_e*c^2 from SI definitions and CODATA 2022.
    energy_ev = voltage_kv * 1000
    return 12398.41984332 / math.sqrt(energy_ev * (energy_ev + 2 * 510998.95069))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--voltage-kv", required=True, type=positive_float)
    parser.add_argument("--bf-radius-px", required=True, type=positive_float)
    basis = parser.add_mutually_exclusive_group(required=True)
    basis.add_argument("--dk-angstrom-inv-per-px", type=positive_float)
    basis.add_argument("--dk-nm-inv-per-px", type=positive_float)
    basis.add_argument("--semiangle-mrad", type=positive_float)
    basis.add_argument("--reference-d-angstrom", type=positive_float)
    parser.add_argument("--reflection-radius-px", type=positive_float)
    parser.add_argument("--grid", nargs="+", type=grid_size, default=[])
    args = parser.parse_args()

    if (args.reference_d_angstrom is None) != (args.reflection_radius_px is None):
        parser.error("--reference-d-angstrom and --reflection-radius-px must be used together")

    wavelength = electron_wavelength_angstrom(args.voltage_kv)
    radius = args.bf_radius_px
    if args.dk_angstrom_inv_per_px is not None:
        dk = args.dk_angstrom_inv_per_px
        input_basis = "supplied_dk_angstrom_inverse_per_pixel"
    elif args.dk_nm_inv_per_px is not None:
        dk = args.dk_nm_inv_per_px / 10
        input_basis = "supplied_dk_nm_inverse_per_pixel"
    elif args.semiangle_mrad is not None:
        dk = (args.semiangle_mrad / 1000) / (wavelength * radius)
        input_basis = "supplied_semiangle"
    else:
        dk = 1 / (args.reference_d_angstrom * args.reflection_radius_px)
        input_basis = "conditional_indexed_reflection"

    angle = 1000 * wavelength * radius * dk
    if not (math.isfinite(dk) and dk > 0 and math.isfinite(angle) and 0 < angle < 1000):
        parser.error("the transverse scattering geometry requires 0 < wavelength * radius * dk < 1")

    report = {
        "input_basis": input_basis,
        "voltage_kv": args.voltage_kv,
        "wavelength_angstrom": wavelength,
        "bright_field_radius_px": radius,
        "dk_angstrom_inverse_per_px": dk,
        "dk_nm_inverse_per_px": 10 * dk,
        "semiangle_mrad_paraxial": angle,
        "real_space_nm_per_px_at_fixed_dk": {
            str(size): 0.1 / (size * dk) for size in args.grid
        },
    }
    if args.reference_d_angstrom is not None:
        report["assumed_reference_d_angstrom"] = args.reference_d_angstrom
        report["reflection_radius_px"] = args.reflection_radius_px
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
