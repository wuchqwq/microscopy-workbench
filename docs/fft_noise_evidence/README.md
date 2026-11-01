# Execution evidence, exact compressed originals

`index.json` maps every archive to its original path, byte length and SHA-256.
Each `.gz` decompresses directly to the original UTF-8 file bytes, without JSON
reserialization. `main-groups.csv` and `holdout-groups.csv` are convenient copies
of the final provenance-bound statistical tables. `tested-source-sha256.json`
records the new test/fixture code used at packaging time.

Included: both complete v2/v3 raw numerical runs (2,628 records each); complete
public subset/full-primary/holdout call journals, results and file-hash manifests;
all image parameters and input TIFF/array hashes; prewritten protocols and
independent preprocessing runs; original harness failures and aggregation
cross-dataset false acceptance; final corrected aggregation; locked-runtime logs.
The exact earlier public driver (`executed-public-script.py.txt`, SHA
`d3af1c4df6b63fc01e48881778388574b7216b9cf0d87f9972adbdcf5b023678`) is retained:
its source bytes differ from the current driver only because the holdout mode
was added later. The preserved faulty aggregator and failed joined analysis are
**failure evidence**, not approved scientific summaries.

Large binary images, NPY arrays, PNGs and full workspaces remain locally under
`analysis/controlled-noise`, `analysis/controlled-backgrounds` and
`analysis/preprocessing-oracle` in the independent FFT noise worktree. Their
hashes are retained; the checked-in deterministic generator recreates the input
arrays with the recorded dependency versions. No private sample data or
credentials are included. PNGs are display only.

## Reproduce (fresh directories)

Create a Python 3.13 environment and install the exact package snapshot in
`docs/science_fix_evidence/packages.txt`; run `npm ci` without lock changes.
Use a fixed checkout at #61 `31e0edec...` for old results and #63 `3d59c2b5...`
for new producer results; selecting `--repository` does not change a checkout.
Commands below are relative to this PR and do not touch shared GUI workspaces.

```sh
python tests/fixtures/controlled_fft_noise.py /absolute/new/dataset
python tests/fixtures/evaluate_fft_noise.py --repository /absolute/frozen/v2 --dataset /absolute/new/dataset --output /absolute/new/raw-v2
python tests/fixtures/evaluate_fft_noise.py --repository /absolute/frozen/v3 --dataset /absolute/new/dataset --output /absolute/new/raw-v3
python tests/fixtures/controlled_fft_saved.py --repository /absolute/frozen/v3 --dataset /absolute/new/dataset --raw /absolute/new/raw-v3/raw.jsonl --output /absolute/new/public-subset
python tests/fixtures/controlled_fft_saved.py --repository /absolute/frozen/v3 --dataset /absolute/new/dataset --raw /absolute/new/raw-v3/raw.jsonl --output /absolute/new/public-primary --full-primary
python tests/fixtures/summarize_fft_noise.py /absolute/new/raw-v2 /absolute/new/raw-v3 --saved /absolute/new/public-subset --saved /absolute/new/public-primary --output /absolute/new/statistics
python tests/fixtures/controlled_fft_backgrounds.py /absolute/new/backgrounds
python tests/fixtures/evaluate_fft_noise.py --repository /absolute/frozen/v3 --dataset /absolute/new/backgrounds --output /absolute/new/background-raw
python tests/fixtures/controlled_fft_saved.py --repository /absolute/frozen/v3 --dataset /absolute/new/backgrounds --raw /absolute/new/background-raw/raw.jsonl --output /absolute/new/background-public --background-holdout
python tests/fixtures/summarize_fft_noise.py --single /absolute/new/background-raw --saved /absolute/new/background-public --output /absolute/new/background-statistics
python tests/test_fft_preprocessing_oracle.py -v
```

Use `--smoke` for the generator's 76-source/two-seed CI subset. It is a bounded
regression, not a new population estimate. New directories are mandatory;
preserved originals are never overwritten. Regenerated UUID request/object
names can differ; scientific arrays and explicit provenance are compared.

The main document separates actual worker writes from raw numerical calls,
formal MCP transport, HTTP tests and unexecuted browser/model scenarios.
No counts here certify experimental false-positive rates.
