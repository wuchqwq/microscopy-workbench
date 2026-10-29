"""Small synthetic DM4 files for reader-adapter tests, never a runtime writer.

This is an independent tag encoder for explicit test values. It implements no
DM parsing or scientific processing, and is not copied from a reader package.
Structural integers use big endian; our pixel/scalar payloads use little endian.
"""
from pathlib import Path
import json
import struct

import numpy as np


def _q(value):
    return struct.pack(">Q", value)


def _header(kind, name):
    encoded = name.encode("utf-8")
    return bytes([kind]) + struct.pack(">H", len(encoded)) + encoded


def _value(name, encoded_type, payload):
    body = b"%%%%" + _q(1) + _q(encoded_type) + payload
    return _header(21, name) + _q(len(body)) + body


def _integer(name, value):
    return _value(name, 3, struct.pack("<i", value))


def _double(name, value):
    return _value(name, 7, struct.pack("<d", value))


def _text(name, value):
    # DM Unicode strings are represented by an array of ushort code units.
    raw = value.encode("utf-16le")
    body = b"%%%%" + _q(3) + _q(20) + _q(4) + _q(len(raw) // 2) + raw
    return _header(21, name) + _q(len(body)) + body


def _array(name, encoded_type, values):
    raw = values.tobytes(order="C")
    body = b"%%%%" + _q(3) + _q(20) + _q(encoded_type) + _q(values.size) + raw
    return _header(21, name) + _q(len(body)) + body


def _group(name, children):
    body = b"\x01\x00" + _q(len(children)) + b"".join(children)
    return _header(20, name) + body[:2] + _q(len(body)) + body[2:]


def _image(name, values, *, scales=(.02, -.03), origins=(1.25, -2.5), units=("nm", "nm"), rgb=False):
    values = np.asarray(values)
    codes = {"uint16": (10, 4), "uint32": (11, 5), "float32": (2, 6), "int16": (1, 2)}
    if rgb:
        dm_type, encoded_type = 8, 10
        assert values.dtype == np.uint8 and values.ndim == 3 and values.shape[2] == 4
    else:
        assert values.ndim == 2
        dm_type, encoded_type = codes[str(values.dtype)]
    height, width = values.shape[:2]
    # DM's dimension/list entries are anonymous; readers assign their own
    # dictionary labels. The on-disk order, not a reader-specific name, matters.
    dimensions = [_integer("", width), _integer("", height)]
    axes = [_group("", [_double("Origin", origins[axis]),
            _double("Scale", scales[axis]), _text("Units", units[axis])]) for axis in range(2)]
    calibration = _group("Calibrations", [_group("Dimension", axes),
                    _group("Brightness", [_double("Origin", 0.), _double("Scale", 1.), _text("Units", "")])])
    little = values.astype(values.dtype.newbyteorder("<"), copy=False)
    image_data = _group("ImageData", [_integer("DataType", dm_type), _integer("PixelDepth", values.dtype.itemsize * (4 if rgb else 1)),
                          _group("Dimensions", dimensions), calibration, _array("Data", encoded_type, little)])
    return [_text("Name", name), image_data, _group("ImageTags", [])]


def write_dm4(path, datasets, *, thumbnail=True):
    """Encode bounded 2D synthetic datasets; refuse an existing target."""
    rows = []
    if thumbnail:
        pixels = np.zeros((3, 4, 4), dtype=np.uint8)
        pixels[..., :3] = (27, 91, 183)
        pixels[..., 3] = 255
        rows.append(_image("thumbnail-not-science", pixels, scales=(1., 1.), origins=(0., 0.), units=("", ""), rgb=True))
    for dataset in datasets:
        assert np.asarray(dataset["data"]).size <= 4096, "Fixture-only small-array writer"
        rows.append(_image(dataset.get("name", "synthetic-science"), dataset["data"],
                           scales=dataset.get("scales", (.02, -.03)), origins=dataset.get("origins", (1.25, -2.5)),
                           units=dataset.get("units", ("nm", "nm"))))
    images = _group("ImageList", [_group("", value) for value in rows])
    tags = [images]
    if thumbnail:
        tags.append(_group("Thumbnails", [_group("", [_integer("ImageIndex", 0)])]))
    root = b"\x01\x00" + _q(len(tags)) + b"".join(tags)
    output = Path(path)
    with output.open("xb") as target:
        target.write(struct.pack(">IQI", 4, len(root), 1) + root + b"\0" * 8)
    return output


def create_fixtures(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    values = (np.arange(35, dtype=np.uint32).reshape(5, 7) * 37 + 16777216)
    values[1, 2] = np.iinfo(np.uint32).max
    known = {"name": "synthetic-adf", "data": values}
    write_dm4(directory / "signed-uint32.dm4", [known])
    write_dm4(directory / "uncalibrated.dm4", [{**known, "units": ("", "")}])
    write_dm4(directory / "two-science.dm4", [known, {"name": "second-science", "data": np.array([[4, 3], [2, 1]], dtype=np.uint16)}])
    write_dm4(directory / "angstrom.dm4", [{**known, "units": ("Å", "Å")}])
    np.save(directory / "known.npy", values, allow_pickle=False)
    specification = {"kind": "synthetic DM4 reader fixture", "shape_yx": [5, 7], "dtype": "uint32",
                     "axes": ["y", "x"], "scales_xy": [.02, -.03], "raw_origins_xy": [1.25, -2.5],
                     "physical_value_at_pixel_zero_xy": [-.025, -.075], "units_xy": ["nm", "nm"],
                     "thumbnail": "separate explicit ImageList entry, Thumbnails.ImageIndex=0; excluded science",
                     "maximum_value": int(np.iinfo(np.uint32).max)}
    (directory / "specification.json").write_text(json.dumps(specification, indent=2) + "\n", encoding="utf-8")
    return directory


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    print(create_fixtures(parser.parse_args().directory))
