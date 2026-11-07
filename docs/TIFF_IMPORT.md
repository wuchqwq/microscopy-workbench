# Ordinary TIFF import

`image_open` catalogs pages without decoding the whole image stack.
`image_frame` selects one explicit zero-based page and saves its original
numerical dtype and values. Supported grayscale scalar types are uint8,
uint16, uint32, int8, int16, int32, float32 and float64. RGB, palette,
complex, bool, float16 and uint64/int64 layouts refuse with
`UNSUPPORTED_LAYOUT`; no implicit grayscale conversion, real-part selection
or precision reduction is performed.

All pages must meet the catalog layout and existing budgets (4M pixels per
plane, 64MiB decoded bytes, 4096 pages, 4GiB source). Nonfinite floating pixels
refuse on explicit frame decode with `NONFINITE_DATA`. Source identity and
the saved page descriptor are checked again before decoding. Historical
uint16/float32 page descriptor fields are unchanged; old source objects and
request receipts are read without migration or replay.

Classic TIFF/BigTIFF, both byte orders, and uncompressed/Deflate examples are
tested. Other compression depends on available tifffile codecs; missing or
unsupported decoding fails, never silently substitutes values. This is not
a promise to accept every TIFF/OME/vendor variant, color image or volume.
Multi-page frames remain an unspecified sequence, not inferred depth/time.

The original source file and complete-file SHA-256 preserve TIFF metadata.
Resolution tags, descriptions, orientation tags, OME/vendor information and
intensity scaling are not interpreted as scientific calibration or applied
to stored pixels. XY sampling/units remain unknown until explicitly supplied
through the existing calibration workflow. Stored row/column order and
photometric sample values are retained; MINISWHITE does not invert science.

Preview normalization is display-only and clips before subtracting. Opposite
finite float64 endpoints whose difference overflows are scaled safely before
normalization. PNG quantization/resizing does not replace the original array.
Finite input does not guarantee that every later FFT/statistic fits binary64;
existing numerical range guards may explicitly refuse those operations.
