#!/bin/sh
# Run from any working directory; preserve spaces and all arguments.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$ROOT/tools/install_workbench.py" "$@"
