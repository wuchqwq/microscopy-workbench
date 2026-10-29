"""Optional, read-only DM4 file adapter. RosettaSciIO owns format decoding.

Cataloguing uses lazy arrays. Only an explicitly selected bounded scalar plane
is computed; no GMS import, vendor ABI, thumbnail guess or runtime fallback.
"""
from importlib import import_module, metadata
import gc
import math
from pathlib import Path

import numpy as np

MAX_DATASETS = 64
DTYPES = {"uint8", "uint16", "uint32", "int8", "int16", "int32", "float32", "float64"}


class DMFileError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def require(condition, message, code="UNSUPPORTED_LAYOUT"):
    if not condition:
        raise DMFileError(code, message)


def _reader():
    try:
        version = metadata.version("rosettasciio")
        reader = import_module("rsciio.digitalmicrograph").file_reader
    except (ImportError, metadata.PackageNotFoundError) as error:
        raise DMFileError("MISSING_DEPENDENCY", "DM4 import requires optional requirements-dm4.txt in the independent image environment; TIFF remains available") from error
    require(version == "0.15.0", "This DM4 adapter is qualified with RosettaSciIO 0.15.0; install requirements-dm4.txt", "UNSUPPORTED_READER_VERSION")
    return reader, {"name": "RosettaSciIO", "version": version,
                    "mode": "external file decoding; not DigitalMicrograph native",
                    "dataset_index_convention": "zero-based result of file_reader after its explicit Thumbnails-tag exclusion"}


def _plain(value):
    if isinstance(value, np.generic):
        value = value.item()
    if value is None or type(value) in (str, bool, int):
        return value
    if type(value) is float:
        return value if math.isfinite(value) else None
    if type(value) in (list, tuple):
        return [_plain(v) for v in value]
    if type(value) is dict:
        return {str(k): _plain(v) for k, v in value.items()}
    raise DMFileError("INVALID_DM_METADATA", "DM4 scientific metadata contains an unsupported value type")


def _axis(row, shape, dimension):
    # Read actual tags, not RosettaSciIO's fallback Scale=1/Origin=0/Units=''.
    image = row.get("original_metadata", {}).get("ImageList", {}).get("TagGroup0", {})
    data = image.get("ImageData", {})
    raw = data.get("Calibrations", {}).get("Dimension", {}).get("TagGroup" + str(dimension), {})
    np_axis = 1 - dimension
    parsed = [a for a in row.get("axes", []) if a.get("index_in_array") == np_axis]
    axis = parsed[0] if len(parsed) == 1 else {}
    scale, origin, unit = raw.get("Scale"), raw.get("Origin"), raw.get("Units")
    finite = lambda v: isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, (bool, np.bool_)) and math.isfinite(v)
    complete = finite(scale) and scale != 0 and finite(origin) and type(unit) is str and bool(unit)
    zero = -float(origin) * float(scale) if complete else None
    consistent = bool(complete and math.isfinite(zero) and axis.get("size") == shape[np_axis]
                      and axis.get("scale") == scale and axis.get("offset") == zero and axis.get("units") == unit)
    return {"axis": "x" if dimension == 0 else "y", "dm_dimension": dimension,
            "numpy_axis": np_axis, "size": shape[np_axis], "raw_origin": _plain(origin),
            "signed_scale": _plain(scale), "unit": _plain(unit), "physical_pixel_zero": zero,
            "usable": consistent, "raw_tags": _plain(raw),
            "reader_axis": _plain(axis),
            "coordinate_convention": "value(index)=(index-raw_origin)*signed_scale; raw origin is in pixels"}


def open_dm(path, max_pixels, max_bytes):
    path = Path(path)
    require(path.suffix.lower() == ".dm4", "The initial direct DM file adapter supports .dm4 only", "UNSUPPORTED_FORMAT")
    reader, identity = _reader()
    try:
        # The pinned reader's own metadata parser/shape/dtype helpers allow a
        # preflight before public file_reader constructs any data array. In
        # particular packed complex unpackers and non-2D volumes never run.
        api = import_module(reader.__module__)
        with path.open("rb") as stream:
            parsed = api.DigitalMicrographReader(stream)
            parsed.parse_file()
            dictionaries = parsed.get_image_dictionaries()
            require(1 <= len(dictionaries) <= MAX_DATASETS, "DM4 scientific dataset count exceeds its metadata budget", "BUDGET_EXCEEDED")
            for entry in dictionaries:
                item = api.ImageObject(entry, stream, order="C")
                require(len(item.shape) == 2 and np.dtype(item.dtype).name in DTYPES and not np.dtype(item.dtype).fields,
                        "Initial DM4 import supports scalar 2D datasets only; RGB entries without an explicit thumbnail tag, complex/packed data and navigation volumes are refused before decoding")
        rows = reader(path, lazy=True, order="C", optimize=False)
    except DMFileError:
        raise
    except Exception as error:
        raise DMFileError("DM4_READ_ERROR", "RosettaSciIO could not parse this DM4 file: " + str(error)) from error
    require(type(rows) is list and 1 <= len(rows) <= MAX_DATASETS,
            "DM4 has no scientific datasets or exceeds the 64-dataset catalog budget", "BUDGET_EXCEEDED")
    catalog = []
    for index, row in enumerate(rows):
        array = row["data"]
        shape, dtype = list(map(int, array.shape)), np.dtype(array.dtype)
        eligible = (len(shape) == 2 and all(n > 0 for n in shape) and dtype.name in DTYPES and not dtype.fields
                    and math.prod(shape) <= max_pixels and math.prod(shape) * dtype.itemsize <= max_bytes)
        image = row.get("original_metadata", {}).get("ImageList", {}).get("TagGroup0", {})
        raw_calibration = image.get("ImageData", {}).get("Calibrations", {})
        title = row.get("metadata", {}).get("General", {}).get("title", "")
        require(type(title) is str and len(title) <= 4096, "DM4 dataset title exceeds its metadata budget", "BUDGET_EXCEEDED")
        catalog.append({"dataset_index": index, "title": title, "shape": shape, "dtype": str(dtype),
                        "storage_dtype": dtype.str, "eligible_scalar_2d": bool(eligible),
                        "reason": None if eligible else "Only bounded scalar 2D uint8/16/32, int8/16/32 or float32/64 is admitted; no RGB, complex, navigation stack or implicit slicing",
                        "axes": _plain(row.get("axes", [])),
                        "calibration_xy": [_axis(row, shape, dimension) for dimension in (0, 1)] if len(shape) == 2 else None,
                        "raw_calibration": _plain(raw_calibration),
                        "dm_data_type": _plain(image.get("ImageData", {}).get("DataType")),
                        "intensity_calibration_applied": False,
                        "intensity_semantics": "raw stored values; brightness calibration retained but not applied"})
    return rows, {"source_reader": identity, "datasets": catalog,
                  "thumbnail_policy": "RosettaSciIO file_reader excludes ImageList entries identified by the file's Thumbnails tags; no first-image heuristic in this adapter"}


def catalog_dm(path, max_pixels, max_bytes):
    rows, catalog = open_dm(path, max_pixels, max_bytes)
    # Release graph references promptly; the one-request worker exit also
    # closes any mappings retained by the optional library on Windows.
    del rows
    gc.collect()
    return catalog


def selected_plane(path, saved, dataset_index, max_pixels, max_bytes):
    rows, actual = open_dm(path, max_pixels, max_bytes)
    require(actual == saved, "DM4 dataset metadata or reader changed", "SOURCE_CHANGED")
    eligible = [row["dataset_index"] for row in saved["datasets"] if row["eligible_scalar_2d"]]
    if dataset_index is None:
        choices = "; ".join(str(row["dataset_index"]) + " (CLI --dataset " + str(row["dataset_index"] + 1) + "): " +
                            row["title"][:100] + " " + str(row["shape"]) + " " + row["dtype"]
                            for row in saved["datasets"])
        require(len(eligible) == 1,
                "DM4 dataset selection is ambiguous or unsupported; choose an eligible dataset_index, or start a new inspector workspace with --dataset N. Catalog: " + choices,
                "DATASET_SELECTION_REQUIRED")
        dataset_index = eligible[0]
    require(type(dataset_index) is int and dataset_index in eligible,
            "dataset_index must identify an eligible bounded scalar 2D scientific dataset", "UNSUPPORTED_DATASET")
    descriptor = saved["datasets"][dataset_index]
    values = np.array(rows[dataset_index]["data"].compute(scheduler="synchronous"), copy=True, order="C")
    del rows
    gc.collect()
    require(list(values.shape) == descriptor["shape"] and str(values.dtype) == descriptor["dtype"],
            "Decoded DM4 array differs from its catalog", "SOURCE_CHANGED")
    require(np.isfinite(values).all(), "DM4 plane contains nonfinite scientific values; not replaced or silently clipped", "NONFINITE_DATA")
    return values, descriptor, dataset_index
