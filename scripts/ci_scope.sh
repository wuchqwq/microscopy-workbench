#!/usr/bin/env bash
# Compatibility entry point. The classifier uses only Python's standard library.
set -euo pipefail
exec python3 "$(dirname "${BASH_SOURCE[0]}")/ci_scope.py"
