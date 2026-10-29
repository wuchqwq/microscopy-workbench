"""Small synthetic DM3/DM4 files for reader-adapter tests, never a runtime writer.

This is an independent tag encoder for explicit test values. It implements no
DM parsing or scientific processing, and is not copied from a reader package.
Structural integers use big endian; our pixel/scalar payloads use little endian.
"""
from pathlib import Path
import json
import struct

import numpy as np


class _Encoder:
    def __init__(self, version):
        assert version in (3, 4)
        self.version = version

    def count(self, value):
        return struct.pack(">Q" if self.version == 4 else ">I", value)

    def header(self, kind, name):
        encoded = name.encode("utf-8")
        return bytes([kind]) + struct.pack(">H", len(encoded)) + encoded

    def data(self, name, body):
        return self.header(21, name) + (self.count(len(body)) if self.version == 4 else b"") + body

    def scalar(self, name, encoded_type, payload):
        return self.data(name, b"%%%%" + self.count(1) + self.count(encoded_type) + payload)

    def integer(self, name, value):
        return self.scalar(name, 3, struct.pack("<i", value))

    def double(self, name, value):
        return self.scalar(name, 7, struct.pack("<d", value))

    def text(self, name, value):
        raw = value.encode("utf-16le")
        return self.data(name, b"%%%%" + self.count(3) + self.count(20) + self.count(4) + self.count(len(raw) // 2) + raw)

    def array(self, name, encoded_type, values):
        return self.data(name, b"%%%%" + self.count(3) + self.count(20) + self.count(encoded_type) + self.count(values.size) + values.tobytes(order="C"))

    def group(self, name, children):
        body = b"\x01\x00" + self.count(len(children)) + b"".join(children)
        return self.header(20, name) + body[:2] + (self.count(len(body)) if self.version == 4 else b"") + body[2:]

    def image(self, name, values, *, scales=None, origins=None, units=None, rgb=False, signal_type=None):
        values = np.asarray(values)
        codes = {"uint16": (10, 4), "uint32": (11, 5), "float32": (2, 6), "int16": (1, 2),
                 "float64": (12, 7), "complex64": (3, 6), "complex128": (13, 7)}
        if rgb:
            dm_type, encoded_type = 8, 10
            assert values.dtype == np.uint8 and values.ndim == 3 and values.shape[2] == 4
            shape = values.shape[:2]
        else:
            assert 2 <= values.ndim <= 6
            dm_type, encoded_type = codes[str(values.dtype)]
            shape = values.shape
        ndim = len(shape)
        scales = scales or (.02, -.03) + (1.,) * (ndim - 2)
        origins = origins or (1.25, -2.5) + (0.,) * (ndim - 2)
        units = units or ("nm", "nm") + ("",) * (ndim - 2)
        assert len(scales) == len(origins) == len(units) == ndim
        dimensions = [self.integer("", size) for size in reversed(shape)]
        axes = [self.group("", [self.double("Origin", origins[axis]), self.double("Scale", scales[axis]), self.text("Units", units[axis])]) for axis in range(ndim)]
        calibration = self.group("Calibrations", [self.group("Dimension", axes),
                        self.group("Brightness", [self.double("Origin", 0.), self.double("Scale", 1.), self.text("Units", "")])])
        little = values.astype(values.dtype.newbyteorder("<"), copy=False)
        payload = little.view(np.float32 if values.dtype == np.complex64 else np.float64) if values.dtype.kind == "c" else little
        image_data = self.group("ImageData", [self.integer("DataType", dm_type), self.integer("PixelDepth", values.dtype.itemsize * (4 if rgb else 1)),
                              self.group("Dimensions", dimensions), calibration, self.array("Data", encoded_type, payload)])
        return [self.text("Name", name), image_data, self.group("ImageTags", [self.group("Meta Data", [self.text("Signal", signal_type)])] if signal_type else [])]


def write_dm(path, datasets, *, thumbnail=True, version=4):
    """Independent test encoder, not a runtime writer; refuse existing targets."""
    encoder, rows = _Encoder(version), []
    if thumbnail:
        pixels = np.zeros((3, 4, 4), dtype=np.uint8)
        pixels[..., :3] = (27, 91, 183)
        pixels[..., 3] = 255
        rows.append(encoder.image("thumbnail-not-science", pixels, scales=(1., 1.), origins=(0., 0.), units=("", ""), rgb=True))
    for dataset in datasets:
        assert np.asarray(dataset["data"]).size <= 16384, "Fixture-only small-array writer"
        rows.append(encoder.image(dataset.get("name", "synthetic-science"), dataset["data"],
                                 scales=dataset.get("scales"), origins=dataset.get("origins"), units=dataset.get("units"), signal_type=dataset.get("signal_type")))
    images = encoder.group("ImageList", [encoder.group("", value) for value in rows])
    tags = [images]
    if thumbnail:
        tags.append(encoder.group("Thumbnails", [encoder.group("", [encoder.integer("ImageIndex", 0)])]))
    root = b"\x01\x00" + encoder.count(len(tags)) + b"".join(tags)
    output = Path(path)
    with output.open("xb") as target:
        target.write(struct.pack(">IQI", 4, len(root), 1) + root + b"\0" * 8 if version == 4
                     else struct.pack(">III", 3, len(root), 1) + root + b"\0" * 4)
    return output


def write_dm4(path, datasets, *, thumbnail=True):
    return write_dm(path, datasets, thumbnail=thumbnail, version=4)


def write_dm3(path, datasets, *, thumbnail=True):
    return write_dm(path, datasets, thumbnail=thumbnail, version=3)


def create_plane_fixtures(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    values = np.arange(2 * 3 * 4, dtype=np.uint16).reshape(2, 3, 4) + 100
    row = {"name": "synthetic-volume", "data": values, "scales": (.02, -.03, .4),
           "origins": (1.25, -2.5, 3.), "units": ("nm", "nm", "nm")}
    write_dm4(directory / "volume.dm4", [row])
    write_dm3(directory / "volume.dm3", [row])
    write_dm3(directory / "signed-uint32.dm3", [{"data": np.arange(35, dtype=np.uint32).reshape(5, 7) + 16777217}])
    write_dm3(directory / "uncalibrated.dm3", [{"data": np.arange(35, dtype=np.uint16).reshape(5, 7), "units": ("", "")}])
    write_dm4(directory / "complex.dm4", [{"data": (np.arange(12).reshape(3, 4) + 1j * np.arange(12).reshape(3, 4)[::-1]).astype(np.complex64)}])
    write_dm3(directory / "complex.dm3", [{"data": (np.arange(12).reshape(3, 4) + 1j * np.arange(12).reshape(3, 4)[::-1]).astype(np.complex128)}])
    a, b, c, d = np.indices((2, 3, 5, 7))
    four = (1000 * a + 100 * b + 10 * c + d).astype(np.float32)
    write_dm4(directory / "four-dimensional.dm4", [{"data": four, "scales": (.01, -.02, 7., -.4),
              "origins": (1.5, 2.5, 0., 3.5), "units": ("nm", "nm", "index", "nm")}])
    write_dm4(directory / "chunk-budget.dm4", [{"data": np.arange(4097, dtype=np.uint16).reshape(4097, 1, 1)}])
    write_dm4(directory / "spectral-nm.dm4", [{**row, "signal_type": "CL"}])
    np.save(directory / "volume.npy", values, allow_pickle=False)
    return directory


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
