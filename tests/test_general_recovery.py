"""Independent pre-recursion orientation-kind guard regression.

This is an isolated admission-boundary unit test, not a full journal fault,
actual interrupted worker, or scattering-engine qualification. The deliberately
minimal workspace stops if the recursive orientation admission is reached.
"""
import ast
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from crystallography import general_evidence
from crystallography.structure_tools import StructureError


class RecursiveOrientationTargetReached(RuntimeError):
    pass


class BoundaryWorkspace:
    """Only the already-admitted simulation/structure boundary is substituted."""
    def __init__(self, root, target_kind="crystal_evidence", target_id="c" * 32):
        self.root = root
        self.simulation_id, self.structure_id, self.target_id = "a" * 32, "b" * 32, target_id
        self.orientation_calls = 0
        self.saved = {"kind": "simulate", "object_id": self.simulation_id,
                      "structure_object_id": self.structure_id,
                      "orientation": {"orientation_id": target_id}}
        for ident, record in ((self.simulation_id, self.saved),
                              (self.structure_id, {"kind": "structure"}),
                              ("c" * 32, {"kind": target_kind})):
            directory = root / "objects" / ident
            directory.mkdir(parents=True)
            (directory / "object.json").write_text(json.dumps(record), encoding="utf-8")

    def object(self, ident):
        if ident != self.simulation_id:
            raise AssertionError("Unexpected object admission before orientation guard")
        return deepcopy(self.saved), self.root / "objects" / ident

    def structure(self, ident):
        if ident != self.simulation_id:
            raise AssertionError("Unexpected structure input")
        return deepcopy(self.saved), None, self.structure_id

    def orientation(self, ident, source_id, atoms):
        self.orientation_calls += 1
        # Real StructureWorkspace.orientation calls object(ident) before it
        # knows the target kind. An aggregate target can recurse at that point.
        raise RecursiveOrientationTargetReached("recursive target admission reached")


def without_orientation_kind_guard():
    """A controlled pre-fix negative control, leaving all other source intact."""
    parsed = ast.parse(Path(general_evidence.__file__).read_text(encoding="utf-8"))
    function = next(node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name == "_simulation")
    removed = []
    for statement in function.body:
        if (isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call)
                and isinstance(statement.value.func, ast.Name) and statement.value.func.id == "need"
                and any(isinstance(arg, ast.Constant) and arg.value == "Simulation orientation is not a saved orientation record"
                        for arg in statement.value.args)):
            removed.append(statement)
    if len(removed) != 1:
        raise AssertionError("Negative control must remove exactly the orientation-kind guard")
    function.body = [statement for statement in function.body if statement not in removed]
    module = ast.Module(body=[function], type_ignores=[])
    namespace = {}
    exec(compile(ast.fix_missing_locations(module), "<controlled-pre-guard-negative>", "exec"), namespace)
    return namespace["_simulation"]


class GeneralOrientationRecoveryGuard(unittest.TestCase):
    def test_aggregate_and_nonorientation_targets_refuse_before_recursive_admission(self):
        for kind in ("crystal_evidence", "simulate", "structure", "compare"):
            with self.subTest(target_kind=kind), tempfile.TemporaryDirectory(prefix="public-orientation-guard-") as temporary:
                workspace = BoundaryWorkspace(Path(temporary), target_kind=kind)
                with self.assertRaises(StructureError) as denied:
                    general_evidence._simulation(workspace, workspace.simulation_id)
                self.assertEqual(denied.exception.code, "CORRUPT_OBJECT")
                self.assertEqual(workspace.orientation_calls, 0)

    def test_malformed_orientation_id_refuses_without_path_or_recursive_admission(self):
        for target in ("../outside", "latest", "C" * 32, "c" * 31):
            with self.subTest(target_id=target), tempfile.TemporaryDirectory(prefix="public-orientation-id-") as temporary:
                workspace = BoundaryWorkspace(Path(temporary), target_id=target)
                with self.assertRaises(StructureError) as denied:
                    general_evidence._simulation(workspace, workspace.simulation_id)
                self.assertEqual(denied.exception.code, "CORRUPT_OBJECT")
                self.assertEqual(workspace.orientation_calls, 0)

    def test_valid_kind_is_not_rejected_by_the_pre_recursion_guard(self):
        with tempfile.TemporaryDirectory(prefix="public-valid-orientation-boundary-") as temporary:
            workspace = BoundaryWorkspace(Path(temporary), target_kind="orient")
            with self.assertRaises(RecursiveOrientationTargetReached):
                general_evidence._simulation(workspace, workspace.simulation_id)
            self.assertEqual(workspace.orientation_calls, 1)

    def test_controlled_pre_guard_function_reaches_the_recursive_aggregate_target(self):
        with tempfile.TemporaryDirectory(prefix="public-pre-guard-control-") as temporary:
            workspace = BoundaryWorkspace(Path(temporary), target_kind="crystal_evidence")
            with self.assertRaises(RecursiveOrientationTargetReached):
                without_orientation_kind_guard()(workspace, workspace.simulation_id)
            self.assertEqual(workspace.orientation_calls, 1)


if __name__ == "__main__":
    unittest.main()
