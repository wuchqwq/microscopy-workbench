# Local Mac arm64 application candidate

`tools/package_mac.py` builds a new `.app` from explicit local inputs: the compiled
standalone runtime, official Electron/Node binaries, a standalone Python base
and its installed scientific distributions. It does not download dependencies,
change system installations, discover/copy credentials, or publish anything.

Build the checked TypeScript runtime first, then supply absolute paths:

```sh
npm run build
python3 tools/package_mac.py \
  --output /absolute/new-output/MicroscopyWorkbench.app \
  --runtime /absolute/source/dist \
  --electron-app /absolute/electron/Electron.app \
  --node-root /absolute/node-v24.22.2-darwin-arm64 \
  --python-base /absolute/standalone-cpython-3.13 \
  --python-site /absolute/science-venv/lib/python3.13/site-packages
```

The output must not already exist. The packaged main resolves its own Node and
Python paths relative to the application, never from Homebrew or a developer
venv. Python user-site/PYTHONPATH overrides are excluded from the packaged entry.
The original Python base and venv are not modified. Distribution-owned scientific
packages and license metadata are retained; repository evidence, profiles,
private workspaces and source data are not copied. Only a deterministic public
synthetic TIFF is generated for the example.

For the current public image trial, ordinary canonical local run directories
are supported; no developer-volume pathname is required. The exact public
array/full-image restriction, original gate, native preview and separate send
confirmation remain unchanged. AI requires the separately installed official
ChatGPT client with the user's existing login; it is not bundled or auto-signed-in.

A local build and ad-hoc signature are not clean-machine installation, native
GUI acceptance or Developer ID/notarization qualification. The scientific
libraries' retained license material, optional GPL decoder and eventual release
assets still need to be accounted for before public distribution. Current work
produces local unreleased candidates only.

The packaging layout follows [Electron's manual packaging documentation](https://www.electronjs.org/docs/latest/tutorial/application-distribution/).
Node inputs can be checked against [the official release checksums](https://nodejs.org/dist/v24.22.2/SHASUMS256.txt).
