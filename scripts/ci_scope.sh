#!/usr/bin/env bash
# Classify PR changes without dependencies, checkout mutation, or network access.
# Print GitHub step outputs. Unknown inputs fail closed to the complete CI suite.
set -euo pipefail

full_ci() {
  printf 'run_full_ci=true\ncomparison_base=\n'
}

if [[ "${EVENT_NAME:-}" != 'pull_request' ]]; then
  full_ci
  exit 0
fi
if [[ -z "${BASE_SHA:-}" || -z "${HEAD_SHA:-}" ]]; then
  full_ci
  exit 0
fi

# A PR's changes are measured from its merge base, not from the current base tip.
# Base-only commits must not make a documentation PR look like a code change.
if ! comparison_base=$(git merge-base "$BASE_SHA" "$HEAD_SHA"); then
  full_ci
  exit 0
fi
changed=$(mktemp)
trap 'rm -f "$changed"' EXIT
# Show both ends of a rename so moving code into docs cannot bypass science CI.
if ! git diff --name-only --no-renames -z "$comparison_base" "$HEAD_SHA" > "$changed"; then
  full_ci
  exit 0
fi

run_full_ci=false
count=0
while IFS= read -r -d '' path; do
  count=$((count + 1))
  case "$path" in
    docs/*.md) ;;
    */*) run_full_ci=true ;;
    README.md|README.*.md|CONTRIBUTING.md|CHANGELOG.md) ;;
    *) run_full_ci=true ;;
  esac
done < "$changed"
if [[ "$count" -eq 0 ]]; then run_full_ci=true; fi
printf 'run_full_ci=%s\ncomparison_base=%s\n' "$run_full_ci" "$comparison_base"
