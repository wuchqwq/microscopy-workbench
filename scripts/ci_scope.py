#!/usr/bin/env python3
"""Conservative, dependency-aware PR selection. Stdlib and local Git only.

This is an allowlist of understood changes, not a language/extension heuristic.
Unknown paths, unreadable diffs, pushes and manual/queue runs select every group.
"""
from __future__ import annotations

import json
import os
import shlex
from pathlib import Path, PurePosixPath
import subprocess
import sys

GROUPS = ("node", "client", "images", "spatial", "active", "gpa", "topology",
          "integration", "crystal", "compat", "boundary")
QUICK_JOBS = {
    "node-smoke": "node", "client-setup": "client", "dm4-reader": "images",
    "spatial-evidence": "spatial", "active-analysis": "active",
    "classical-gpa": "gpa", "projected-topology": "topology",
    "f4-gpa-integration": "integration", "projected-twin": "crystal",
    "compiled-compatibility": "compat", "science-boundary": "boundary",
}
F3B_JOBS = {"actual-diffsims-mcp": "crystal"}

# Tests with opt-in execution, or not included in the regular Node suite.
SPECIAL_TESTS = {
    "tests/compiled-baseline-compat.test.mjs": {"node", "compat"},
    "tests/runtime-transport-parity.test.mjs": {"node", "compat"},
    "tests/f4-gpa-integration.test.mjs": {"node", "gpa", "integration", "boundary"},
    "tests/domain-measurement-binding.test.mjs": {"node", "spatial"},
    "tests/preview-recovery.test.mjs": {"node", "images", "boundary"},
    "tests/standalone-science-smoke.mjs": {"node", "boundary"},
    "tests/dm4-science-smoke.mjs": {"node", "images"},
    "tests/dm-planes-science-smoke.mjs": {"node", "images"},
    "tests/dm-complex-science-smoke.mjs": {"node", "images"},
    "tests/image-panel-data-inspector.test.mjs": {"node", "boundary"},
    "tests/image-panel-data-probes.test.mjs": {"node", "boundary"},
    "tests/image-panel-presentation-transport.test.mjs": {"node", "boundary"},
    "tests/test_register_codex_mcp.py": {"client"},
    "tests/manual_crystal_launcher_test.py": {"client"},
    "tests/image_core_cross_test.py": {"spatial"},
    "tests/image_point_observation_test.py": {"spatial"},
    "tests/image_tiff_admission_test.py": {"spatial"},
}


def registered_node_tests() -> set[str]:
    """Only route tests which the existing npm test command actually executes."""
    try:
        package = json.loads((Path(__file__).resolve().parents[1] / "package.json").read_text())
        return {word.removeprefix("dist/") for word in shlex.split(package["scripts"]["test"])
                if word.startswith("dist/tests/") and word.endswith(".test.mjs")}
    except (OSError, ValueError, KeyError, TypeError):
        return set()  # Unknown test paths then select all groups.


NODE_TESTS = registered_node_tests()


def groups_for_path(path: str) -> set[str]:
    """Unknown or shared dependencies fail closed to ALL groups."""
    all_groups = set(GROUPS)
    parts = PurePosixPath(path).parts
    if not path or path.startswith("/") or ".." in parts or "\\" in path:
        return all_groups
    name = parts[-1]
    if path.startswith("docs/") and path.endswith(".md"):
        return set()
    if len(parts) == 1 and (name in {"README.md", "AGENTS.md", "CONTRIBUTING.md", "CHANGELOG.md"}
                           or name.startswith("README.") and name.endswith(".md")):
        return set()
    # Skill scripts/assets are NOT documentation; unknown extensions select all.
    if path.startswith("skills/") and path.endswith(".md"):
        return {"node", "client"}  # packaged tool names/links and launch contracts
    if path in SPECIAL_TESTS:
        return set(SPECIAL_TESTS[path])
    if path in NODE_TESTS:
        return {"node"}
    # These UI modules are also used by provider admission/projection; they are
    # not merely browser presentation despite their directory name.
    if path in {
        "ui/image-panel/roi-observations.mts", "ui/image-panel/result-semantics.mts",
        "ui/image-panel/observation-contract.mts", "ui/image-panel/coordinates.mts",
        "ui/image-panel/evidence-contracts.mts",
        "crystallography/capture.py", "crystallography/reflection_compare.py",
        "crystallography/__init__.py",
    } or path.startswith("ui/") and path.endswith("-contracts.mts"):
        return all_groups
    if path.startswith("ui/"):
        if path.endswith((".css", ".html")):
            return {"node"}
        if path in {"ui/image-panel/app.mts", "ui/image-panel/research-workspace.mts",
                    "ui/image-panel/annotation-presentation.mts", "ui/image-panel/viewer-render.mts"}:
            return {"node", "boundary"}
        return all_groups
    if path in {"tools/researcher_inspector.mts", "tools/image_panel.mts"}:
        return {"node", "boundary", "compat"}
    if path in {"crystallography/" + n + ".py" for n in (
            "__main__", "analysis_revision", "compare_batch", "detection", "general_evidence",
            "geometry", "hexagonal", "indexing", "occupancy", "orientation",
            "registration_proposal", "structure_tools", "structures", "twin_geometry",
            "twin_observations", "twin_tools", "workflow")} or path in {
            "tools/structure_worker.py", "tools/crystal_qualification.py"}:
        return {"node", "crystal", "compat", "boundary"}
    if path in {"tools/image_gpa.py", "tools/image_gpa_core.py"}:
        # GPA feeds topology and the cross-method integration, not just its own tests.
        return {"node", "gpa", "topology", "integration", "boundary"}
    if path in {"tools/image_topology.py", "tools/image_topology_core.py", "tools/image_topology_legacy_v1.py"}:
        return {"node", "topology", "integration", "boundary"}
    if path in {"tools/image_spatial_atlas.py", "tools/image_spatial_domains.py",
                "tools/image_feature_field.py", "tools/image_domain_compare.py",
                "tools/image_field_increment.py", "tools/image_active_analysis.py",
                "tools/image_evidence.py"}:
        return {"node", "spatial", "active", "topology", "integration", "crystal", "boundary"}
    # lib/**, common worker/calibration/peaks, source IDs/requests, build scripts,
    # root entrypoints, dependencies, CI files and unclassified tests stay broad.
    return all_groups


def classify_paths(paths: list[str]) -> set[str]:
    if not paths:
        return set(GROUPS)
    selected: set[str] = set()
    for path in paths:
        selected.update(groups_for_path(path))
    return selected


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], stderr=subprocess.PIPE)


def scope(env: dict[str, str] | None = None) -> dict[str, str]:
    env = os.environ if env is None else env
    selected, base, reason = set(GROUPS), "", "non_pr_full"
    if env.get("EVENT_NAME") == "pull_request":
        reason = "unavailable_diff_full"
        try:
            if not env.get("BASE_SHA") or not env.get("HEAD_SHA"):
                raise ValueError("missing explicit comparison refs")
            # Resolve first: untrusted ref strings never become Git options.
            before = git("rev-parse", "--verify", "--end-of-options", env["BASE_SHA"] + "^{commit}").decode().strip()
            head = git("rev-parse", "--verify", "--end-of-options", env["HEAD_SHA"] + "^{commit}").decode().strip()
            base = git("merge-base", before, head).decode().strip()
            raw = git("diff", "--name-only", "--no-renames", "-z", base, head, "--")
            paths = [p.decode("utf-8", "surrogateescape") for p in raw.split(b"\0") if p]
            selected = classify_paths(paths)
            reason = "empty_diff_full" if not paths else "dependency_scoped"
        except (OSError, ValueError, UnicodeError, subprocess.SubprocessError):
            selected, base = set(GROUPS), ""
    result = {"run_full_ci": str(selected == set(GROUPS)).lower(),
              "comparison_base": base, "scope_reason": reason}
    result.update(("run_" + group, str(group in selected).lower()) for group in GROUPS)
    return result


def main() -> None:
    if len(sys.argv) > 1:
        if sys.argv[1] != "--paths-json" or len(sys.argv) != 2:
            raise SystemExit("Use no arguments (Git/env) or --paths-json (stdin JSON array).")
        paths = json.load(sys.stdin)
        if not isinstance(paths, list) or not all(isinstance(p, str) for p in paths):
            raise SystemExit("Expected a JSON array of repository-relative paths")
        print(json.dumps(sorted(classify_paths(paths))))
    else:
        for key, value in scope().items():
            print(f"{key}={value}")


if __name__ == "__main__":
    main()
