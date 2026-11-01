"""Opt-in read-only profiling of an existing scientific object, with all checks.

Each invocation uses a fresh Python process. Never enables a validation bypass.
"""
import argparse
import cProfile
import io
import json
from pathlib import Path
import pstats
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--object-id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    started = time.perf_counter()
    import_profiler = cProfile.Profile()
    if args.profile:
        import_profiler.enable()
    from tools import image_workspace as api
    if args.profile:
        import_profiler.disable()
    imported = time.perf_counter()
    hashes = {}
    original = api.sha_file

    def timed_hash(path):
        start = time.perf_counter()
        value = original(path)
        row = hashes.setdefault(str(path), {"calls": 0, "bytes": 0, "seconds": 0})
        row["calls"] += 1
        row["bytes"] += Path(path).stat().st_size
        row["seconds"] += time.perf_counter() - start
        return value

    if args.profile:
        api.sha_file = timed_hash  # Always calls the real complete file hash.
    profiler = cProfile.Profile()
    execute_start = time.perf_counter()
    if args.profile:
        profiler.enable()
    response = api._execute({"workspace": str(args.workspace.resolve()), "action": "get", "object_id": args.object_id})
    if args.profile:
        profiler.disable()
    executed = time.perf_counter()
    encoded = json.dumps(response)
    serialized = time.perf_counter()
    result = {"ok": response.get("ok"), "object_id": args.object_id,
              "workspace": str(args.workspace.resolve()), "profiled": args.profile,
              "import_seconds": imported-started, "execute_seconds": executed-execute_start,
              "serialize_seconds": serialized-executed, "response_bytes": len(encoded.encode()),
              "hash_calls": sum(v["calls"] for v in hashes.values()) if args.profile else None,
              "hash_bytes": sum(v["bytes"] for v in hashes.values()) if args.profile else None,
              "hash_seconds": sum(v["seconds"] for v in hashes.values()) if args.profile else None,
              "hashes_by_file": hashes, "error": response.get("error")}
    if args.profile:
        import_stream = io.StringIO()
        pstats.Stats(import_profiler, stream=import_stream).sort_stats("cumulative").print_stats(30)
        (args.output / "import-profile.txt").write_text(import_stream.getvalue(), encoding="utf-8")
        stream = io.StringIO()
        pstats.Stats(profiler, stream=stream).sort_stats("cumulative").print_stats(40)
        (args.output / "profile.txt").write_text(stream.getvalue(), encoding="utf-8")
        profiler.dump_stats(str(args.output / "profile.pstats"))
    (args.output / "timing.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "hashes_by_file"}, indent=2))
    return 0 if response.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
