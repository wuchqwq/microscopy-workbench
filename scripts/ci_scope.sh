#!/usr/bin/env bash
# Keep the existing CI entrypoint; classification is stdlib Python + local Git.
set -euo pipefail
exec python3 -B "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/ci_scope.py"
