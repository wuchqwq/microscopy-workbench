#!/usr/bin/env python3
"""Check actual job results against declared impact. Missing is never PASS."""
from __future__ import annotations

import json
import os
import sys
from ci_scope import F3B_JOBS, GROUPS, QUICK_JOBS


def validate(needs: object, workflow: str) -> list[str]:
    mapping = {"quick": QUICK_JOBS, "f3b": F3B_JOBS}.get(workflow)
    if mapping is None:
        return ["Unknown workflow"]
    if not isinstance(needs, dict):
        return ["Missing needs object"]
    errors = []
    if set(needs) != {"changes", *mapping}:
        errors.append("Missing or unexpected job entries")
    changes = needs.get("changes")
    if not isinstance(changes, dict) or changes.get("result") != "success":
        return errors + ["Scope classification did not succeed"]
    outputs = changes.get("outputs")
    if not isinstance(outputs, dict):
        return errors + ["Missing scope outputs"]
    for group in GROUPS:
        if outputs.get("run_" + group) not in ("true", "false"):
            errors.append("Missing/invalid scope output: " + group)
    all_selected = all(outputs.get("run_" + group) == "true" for group in GROUPS)
    if outputs.get("run_full_ci") != str(all_selected).lower():
        errors.append("Full-scope flag disagrees with group outputs")
    for job, group in mapping.items():
        item = needs.get(job)
        result = item.get("result") if isinstance(item, dict) else None
        required = outputs.get("run_" + group) == "true"
        if result not in ("success", "skipped") or required and result != "success":
            errors.append(f"{job}: required={required}, result={result!r}")
    return errors


def main() -> None:
    workflow = sys.argv[1] if len(sys.argv) == 2 else ""
    try:
        errors = validate(json.loads(os.environ.get("CI_NEEDS", "null")), workflow)
    except (ValueError, TypeError):
        errors = ["Invalid CI_NEEDS JSON"]
    if errors:
        print("CI scope gate FAILED:\n" + "\n".join(errors), file=sys.stderr)
        raise SystemExit(1)
    print("CI scope gate passed: affected jobs succeeded; only out-of-scope skips accepted.")


if __name__ == "__main__":
    main()
