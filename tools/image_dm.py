"""Optional, read-only DM3/DM4 file adapter. RosettaSciIO owns format decoding.

Cataloguing uses lazy arrays. Only an explicitly selected bounded scalar plane
is computed; no GMS import, vendor ABI, thumbnail guess or runtime fallback.
"""
from importlib import import_module, metadata
import gc
import math
from pathlib import Path

import numpy as np

MAX_DATASETS = 64
MAX_DIMENSIONS = 6
MAX_PLANE_CHUNKS = 4096
COMPLEX_DTYPES = {"complex64", "complex128"}
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
        raise DMFileError("MISSING_DEPENDENCY", "DM3/DM4 import requires optional requirements-dm4.txt in the independent image environment; TIFF remains available") from error
    require(version == "0.15.0", "This DM file adapter is qualified with RosettaSciIO 0.15.0; install requirements-dm4.txt", "UNSUPPORTED_READER_VERSION")
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
    np_axis = len(shape) - 1 - dimension
    parsed = [a for a in row.get("axes", []) if a.get("index_in_array") == np_axis]
    axis = parsed[0] if len(parsed) == 1 else {}
    scale, origin, unit = raw.get("Scale"), raw.get("Origin"), raw.get("Units")
    finite = lambda v: isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, (bool, np.bool_)) and math.isfinite(v)
    complete = finite(scale) and scale != 0 and finite(origin) and type(unit) is str and bool(unit)
    zero = -float(origin) * float(scale) if complete else None
    consistent = bool(complete and math.isfinite(zero) and axis.get("size") == shape[np_axis]
                      and axis.get("scale") == scale and axis.get("offset") == zero and axis.get("units") == unit)
    result = {"axis": "x" if dimension == 0 else "y" if dimension == 1 else "dm_dimension_" + str(dimension), "dm_dimension": dimension,
            "numpy_axis": np_axis, "size": shape[np_axis], "raw_origin": _plain(origin),
            "signed_scale": _plain(scale), "unit": _plain(unit), "physical_pixel_zero": zero,
            "usable": consistent, "raw_tags": _plain(raw),
            "reader_axis": _plain(axis),
            "coordinate_convention": "value(index)=(index-raw_origin)*signed_scale; raw origin is in pixels"}
    if axis.get("name") in ("Energy loss", "Energy", "Wavelength"):
        result.update(usable=False, coordinate_role_issue="Reader explicitly identifies a spectroscopic axis, not an operational XY length/frequency axis")
    return result


def open_dm(path, max_pixels, max_bytes):
    path = Path(path)
    require(path.suffix.lower() in (".dm3", ".dm4"), "Direct DM file import supports .dm3 and .dm4", "UNSUPPORTED_FORMAT")
    reader, identity = _reader()
    try:
        # The pinned reader's own metadata parser/shape/dtype helpers allow a
        # preflight before public file_reader constructs any data array. In
        # particular packed complex unpackers never run; scalar nD data stay
        # lazy until an explicit bounded plane has been selected.
        api = import_module(reader.__module__)
        with path.open("rb") as stream:
            parsed = api.DigitalMicrographReader(stream)
            parsed.parse_header()
            require(parsed.endian == "little", "Only little-endian DM pixel payloads are qualified; no byte-order guessing or implicit byte swapping", "UNSUPPORTED_LAYOUT")
            require(parsed.dm_version == int(path.suffix[-1]), "DM filename extension disagrees with the parsed file version", "UNSUPPORTED_FORMAT")
            parsed.parse_file()
            dictionaries = parsed.get_image_dictionaries()
            require(1 <= len(dictionaries) <= MAX_DATASETS, "DM4 scientific dataset count exceeds its metadata budget", "BUDGET_EXCEEDED")
            for entry in dictionaries:
                item = api.ImageObject(entry, stream, order="C")
                require(2 <= len(item.shape) <= MAX_DIMENSIONS and all(type(v) is int and v > 0 for v in item.shape) and (np.dtype(item.dtype).name in DTYPES or len(item.shape) == 2 and np.dtype(item.dtype).name in COMPLEX_DTYPES) and not np.dtype(item.dtype).fields
                        and item.imdict.ImageData.DataType not in (5, 27, 28),
                        "DM import supports real scalar planes or ordinary 2D complex64/complex128; RGB without explicit thumbnail tags, nD complex and packed arrays are refused before decoding")
        rows = reader(path, lazy=True, order="C", optimize=False)
    except DMFileError:
        raise
    except Exception as error:
        raise DMFileError(path.suffix[1:].upper() + "_READ_ERROR", "RosettaSciIO could not parse this " + path.suffix[1:].upper() + " file: " + str(error)) from error
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
        descriptor = {"dataset_index": index, "title": title, "shape": shape, "dtype": str(dtype),
                        "storage_dtype": dtype.str, "eligible_scalar_2d": bool(eligible),
                        "reason": None if eligible else "Only bounded scalar 2D uint8/16/32, int8/16/32 or float32/64 is admitted; no RGB, complex, navigation stack or implicit slicing",
                        "axes": _plain(row.get("axes", [])),
                        "calibration_xy": [_axis(row, shape, dimension) for dimension in (0, 1)] if len(shape) == 2 else None,
                        "raw_calibration": _plain(raw_calibration),
                        "dm_data_type": _plain(image.get("ImageData", {}).get("DataType")),
                        "intensity_calibration_applied": False,
                        "intensity_semantics": "raw stored values; brightness calibration retained but not applied"}
        if len(shape) > 2:
            options = [[y, x] for y in range(len(shape)) for x in range(len(shape)) if x != y
                       if shape[y] * shape[x] <= max_pixels and shape[y] * shape[x] * dtype.itemsize <= max_bytes
                       and math.prod(shape[k] for k in range(len(shape)) if k not in (y, x)) <= MAX_PLANE_CHUNKS]
            descriptor.update(eligible_scalar_plane=bool(options), plane_selection_required=True,
                              plane_axes_options=options, dimension_calibration=[_axis(row, shape, d) for d in range(len(shape))],
                              reason="Explicit plane_axes [output Y array axis, output X array axis] and plane_indices are required; no implicit navigation flattening" if options else "No 2D plane fits the decoded-plane or 4096 lazy-chunk budget")
        if dtype.name in COMPLEX_DTYPES:
            descriptor.update(eligible_complex_2d=bool(len(shape) == 2 and math.prod(shape) <= max_pixels and math.prod(shape) * dtype.itemsize <= max_bytes),
                              reason="Ordinary complex 2D array; explicit real/imag/amplitude/power is required for display or numerical observation; no FFT/wave-domain inference",
                              complex_components=["real", "imag", "amplitude", "power"])
        catalog.append(descriptor)
    return rows, {"source_reader": identity, "datasets": catalog,
                  "thumbnail_policy": "RosettaSciIO file_reader excludes ImageList entries identified by the file's Thumbnails tags; no first-image heuristic in this adapter"}


def catalog_dm(path, max_pixels, max_bytes):
    rows, catalog = open_dm(path, max_pixels, max_bytes)
    # Release graph references promptly; the one-request worker exit also
    # closes any mappings retained by the optional library on Windows.
    del rows
    gc.collect()
    return catalog


def _plane_selection(descriptor, plane_axes, plane_indices, max_pixels, max_bytes):
    shape = descriptor["shape"]
    ndim = len(shape)
    legacy = ndim == 2 and plane_axes is None and plane_indices is None
    if legacy:
        require(descriptor["eligible_scalar_2d"] or descriptor.get("eligible_complex_2d"), "Selected 2D DM dataset exceeds its plane budget", "BUDGET_EXCEEDED")
        return None
    require(type(plane_axes) is list and len(plane_axes) == 2 and all(type(v) is int and 0 <= v < ndim for v in plane_axes)
            and plane_axes[0] != plane_axes[1],
            "Provide explicit plane_axes [output Y array axis, output X array axis] in the original NumPy shape; no axes are guessed", "PLANE_SELECTION_REQUIRED")
    require(type(plane_indices) is list and len(plane_indices) == ndim,
            "plane_indices must have one entry per original array axis: null for the two plane axes, an explicit fixed index for every other axis", "PLANE_SELECTION_REQUIRED")
    for axis, value in enumerate(plane_indices):
        require(value is None if axis in plane_axes else type(value) is int and 0 <= value < shape[axis],
                "plane_indices must bind every non-plane axis within bounds and use null only on the selected plane axes", "INVALID_PLANE_SELECTION")
    pixels = math.prod(shape[axis] for axis in plane_axes)
    require(pixels <= max_pixels and pixels * np.dtype(descriptor["dtype"]).itemsize <= max_bytes,
            "Selected DM plane exceeds the existing pixel/decoded byte budget", "BUDGET_EXCEEDED")
    chunks = math.prod(shape[axis] for axis in range(ndim) if axis not in plane_axes)
    require(chunks <= MAX_PLANE_CHUNKS,
            "Selected plane exceeds the 4096 lazy-chunk graph budget; no whole-volume fallback", "BUDGET_EXCEEDED")
    return {"schema": "dm-explicit-plane-v1", "source_shape": list(shape), "plane_axes_yx": list(plane_axes),
            "indices_by_source_axis": list(plane_indices), "plane_shape_yx": [shape[axis] for axis in plane_axes],
            "source_axes_roles": "caller-selected array axes; no frame/depth or spatial-role inference",
            "slice_convention": "zero-based original NumPy axes/indices; output is ordered [Y,X] as explicitly supplied",
            "lazy_chunk_shape": [shape[axis] if axis in plane_axes else 1 for axis in range(ndim)],
            "lazy_graph_chunks": chunks, "decoded_plane_pixels": pixels,
            "decoded_plane_bytes": pixels * np.dtype(descriptor["dtype"]).itemsize}


def selected_plane(path, saved, dataset_index, max_pixels, max_bytes, plane_axes=None, plane_indices=None):
    rows, actual = open_dm(path, max_pixels, max_bytes)
    require(actual == saved, "DM dataset metadata or reader changed", "SOURCE_CHANGED")
    eligible = [row["dataset_index"] for row in saved["datasets"] if row["eligible_scalar_2d"] or row.get("eligible_scalar_plane") or row.get("eligible_complex_2d")]
    if dataset_index is None:
        choices = "; ".join(str(row["dataset_index"]) + " (CLI --dataset " + str(row["dataset_index"] + 1) + "): " +
                            row["title"][:100] + " " + str(row["shape"]) + " " + row["dtype"]
                            for row in saved["datasets"])
        require(len(eligible) == 1,
                "DM dataset selection is ambiguous or unsupported; choose an eligible dataset_index, or start a new inspector workspace with --dataset N. Catalog: " + choices,
                "DATASET_SELECTION_REQUIRED")
        dataset_index = eligible[0]
    require(type(dataset_index) is int and dataset_index in eligible,
            "dataset_index must identify an eligible bounded scientific dataset", "UNSUPPORTED_DATASET")
    descriptor = saved["datasets"][dataset_index]
    require(not descriptor.get("eligible_complex_2d") or plane_axes is None and plane_indices is None, "Explicit axis reinterpretation for complex data is not qualified; ordinary stored 2D axes only")
    selection = _plane_selection(descriptor, plane_axes, plane_indices, max_pixels, max_bytes)
    if selection is None:
        # Preserve the old 2D read and descriptor exactly, including old saved
        # catalogs, source metadata and request recovery fingerprints.
        values = np.array(rows[dataset_index]["data"].compute(scheduler="synchronous"), copy=True, order="C")
    else:
        # Ask the pinned mature reader to make selected-plane-sized memmap
        # chunks. Index before compute: no whole navigation volume is decoded.
        reader, _ = _reader()
        api = import_module(reader.__module__)
        with Path(path).open("rb") as stream:
            parsed = api.DigitalMicrographReader(stream)
            parsed.parse_file()
            item = api.ImageObject(parsed.get_image_dictionaries()[dataset_index], stream, order="C")
            item.filename = Path(path)
            lazy = item.get_data(lazy=True, chunks=tuple(selection["lazy_chunk_shape"]))
            slices = tuple(slice(None) if value is None else value for value in plane_indices)
            plane = lazy[slices]
            remaining = [axis for axis, value in enumerate(plane_indices) if value is None]
            if remaining != plane_axes:
                plane = plane.transpose(tuple(remaining.index(axis) for axis in plane_axes))
            values = np.array(plane.compute(scheduler="synchronous"), copy=True, order="C")
        row = rows[dataset_index]
        xy = []
        for role, source_axis in zip(("x", "y"), reversed(plane_axes)):
            axis = _axis(row, descriptor["shape"], len(descriptor["shape"]) - 1 - source_axis)
            xy.append({**axis, "axis": role, "output_numpy_axis": 1 if role == "x" else 0})
        descriptor = {**descriptor, "calibration_xy": xy, "plane_selection": selection}
    del rows
    gc.collect()
    expected_shape = selection["plane_shape_yx"] if selection else descriptor["shape"]
    require(list(values.shape) == expected_shape and str(values.dtype) == descriptor["dtype"],
            "Decoded DM plane differs from its catalog/explicit selection", "SOURCE_CHANGED")
    require(np.isfinite(values).all(), "DM plane contains nonfinite scientific values; not replaced or silently clipped", "NONFINITE_DATA")
    return values, descriptor, dataset_index
