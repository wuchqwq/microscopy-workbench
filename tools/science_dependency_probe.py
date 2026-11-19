"""Read-only dependency probe for the separately configured scientific Python.

Checks imported submodules/functions and distribution versions. This does not
run a reconstruction, write a provider record, or qualify scientific inputs.
"""
from __future__ import annotations

import importlib
from importlib import metadata
import json
import re
import sys

# name, import target, distribution, min inclusive, max exclusive, exact, attribute
_IMAGE = (
    ("numpy", "numpy", "numpy", "1.23", "3", None, "fft"),
    ("Pillow", "PIL.Image", "Pillow", "10.1", "13", None, "open"),
    ("tifffile", "tifffile", "tifffile", "2023.7.10", "2027", None, "TiffFile"),
    ("scipy", "scipy.ndimage", "scipy", "1.10", "2", None, "gaussian_filter"),
)
_GPA = _IMAGE + (
    ("scikit-image", "skimage.restoration", "scikit-image", "0.25", "0.27", None, "unwrap_phase"),
)
_STRUCTURE = (
    ("numpy", "numpy", "numpy", "1.26", "3", None, "fft"),
    ("scipy", "scipy", "scipy", "1.11", "2", None, "optimize"),
    ("ASE", "ase.io", "ase", "3.26", "4", None, "read"),
    ("diffsims", "diffsims", "diffsims", None, None, "0.7.0", None),
    ("matplotlib", "matplotlib", "matplotlib", "3.8", "4", None, "use"),
    ("Pillow", "PIL.Image", "Pillow", "10", "13", None, "open"),
    ("tifffile", "tifffile", "tifffile", "2023.7.10", "2027", None, "TiffFile"),
)
_PTYRAD_CLI = (
    ("numpy", "numpy", "numpy", "1.23", "3", None, "fft"),
    ("scipy", "scipy", "scipy", "1.10", "2", None, "ndimage"),
)
SPECS = {
    "image": _IMAGE,
    "gpa": _GPA,
    "structure": _STRUCTURE,
    "ptyrad_cli": _PTYRAD_CLI,
}


def _version_parts(version: str) -> tuple[int, ...] | None:
    # A conservative gate: do not accept prerelease/unknown versions as ready.
    if not re.fullmatch(r"\d+(?:\.\d+)*", version):
        return None
    return tuple(int(part) for part in version.split("."))


def _compare(a: tuple[int, ...], b: tuple[int, ...]) -> int:
    n = max(len(a), len(b))
    left, right = a + (0,) * (n - len(a)), b + (0,) * (n - len(b))
    return (left > right) - (left < right)


def _compatible(version: str, low: str | None, high: str | None, exact: str | None) -> bool:
    if exact is not None:
        return version == exact
    actual = _version_parts(version)
    if actual is None:
        return False
    return not ((low and _compare(actual, _version_parts(low)) < 0)
                or (high and _compare(actual, _version_parts(high)) >= 0))


def inspect(kind: str) -> dict:
    if kind not in SPECS:
        return {"ok": False, "kind": kind, "error": "unsupported_probe_kind"}
    checks = []
    for name, module, distribution, low, high, exact, attribute in SPECS[kind]:
        version = None
        try:
            version = metadata.version(distribution)
            imported = importlib.import_module(module)
            if attribute is not None and not hasattr(imported, attribute):
                raise ImportError("missing required callable/module: " + module + "." + attribute)
            if not _compatible(version, low, high, exact):
                checks.append({"name": name, "status": "incompatible_version", "version": version})
            else:
                checks.append({"name": name, "status": "ok", "version": version})
        except Exception as exc:
            checks.append({
                "name": name, "status": "import_failed", "version": version,
                "reason": (type(exc).__name__ + ": " + str(exc))[:240],
            })
    return {"ok": all(entry["status"] == "ok" for entry in checks),
            "kind": kind, "checks": checks,
            "meaning": "Imports and version gates only; no numerical or physical validation"}


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) == 2 else ""
    print(json.dumps(inspect(kind), allow_nan=False, ensure_ascii=True))
