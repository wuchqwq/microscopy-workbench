"""Independent synthetic checks of composed cross-frame scientific evidence."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import image_workspace as worker
import image_automation
from image_joint import match_observations, recovery
from image_automation import child_request_id


class JointObservations(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="joint-observations-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.counter = 0
        y, x = np.indices((48, 48))
        original = 20000+4000*np.cos(2*np.pi*x/8)+2000*np.cos(2*np.pi*y/12)
        changed = 20000+4000*np.cos(2*np.pi*x/6)+2000*np.cos(2*np.pi*y/12)
        self.values = np.rint([original, original, changed]).astype(np.uint16)
        self.source = self.root / "public-three-frame.tiff"
        tifffile.imwrite(self.source, self.values, photometric="minisblack")
        self.original_hash = hashlib.sha256(self.source.read_bytes()).hexdigest()
        opened = self.call("open", source_path=str(self.source))
        self.frames = []
        for index in range(3):
            frame = self.call("frame", object_id=opened["object_id"], frame_index=index)
            self.frames.append(self.call("calibrate", object_id=frame["object_id"], scope="image",
                                         xy_scale={"x": .02, "y": -.03, "unit": "nm"}, source_text="Public synthetic signed XY truth"))
        self.sequence = self.call("sequence_create", frames=[{"object_id": f["object_id"]} for f in self.frames],
                                  axis={"meaning": "reconstruction_depth", "source_text": "Synthetic slice-order proxy; no measured depth or resolution"})
        self.corr = self.call("region_correspondence", sequence_object_id=self.sequence["object_id"], reference_index=1,
                              rect=[0,0,48,48], mode="identity", source_text="Synthetic frames deliberately share original pixel coordinates")

    def tearDown(self):
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.original_hash)
        self.temp.cleanup()

    def call(self, action, ok=True, **args):
        self.counter += 1
        request = {"workspace": str(self.workspace), "action": action, **args}
        if action not in ("get", "result"):
            request.setdefault("request_id", "joint-test-%d" % self.counter)
        result = worker.execute(request)
        self.assertEqual(result["ok"], ok, result)
        return result["result"] if ok else result

    def joint(self, **args):
        return self.call("joint_observations", correspondence_object_id=self.corr["object_id"], window="none", subtract_mean=True,
                         peak_options={"refinement": "none", "threshold_rel": .1, "min_separation_bins": 1},
                         max_peaks=8, frequency_tolerance_cycles_per_pixel=.01, **args)

    def fft_arrays(self):
        result = {}
        for path in self.workspace.glob("objects/*/object.json"):
            metadata = json.loads(path.read_text())
            if metadata["kind"] == "fft":
                array = path.parent / "data.npy"
                result[metadata["object_id"]] = hashlib.sha256(array.read_bytes()).hexdigest()
        return result

    def test_real_composition_changed_peaks_direct_dft_and_recovery(self):
        result = self.joint(request_id="joint-original")
        self.assertEqual(len(result["frame_observations"]), 3)
        self.assertEqual(len(self.fft_arrays()), 3)
        for index, row in enumerate(result["frame_observations"]):
            fft = self.call("get", object_id=row["fft_object_id"])
            self.assertEqual(row["source_context"]["dtype"], "uint16")
            self.assertEqual(row["source_context"]["frame_index"], index)
            # Direct complex DFT coefficient from immutable source pixels.
            period = 6 if index == 2 else 8
            expected = sum((float(self.values[index,y,x])-self.values[index].mean())*np.exp(-2j*np.pi*x/period)
                           for y in range(48) for x in range(48))
            actual = np.load(fft["array_path"])[24,24+48//period]
            self.assertLess(abs(actual-expected), 1e-6)
            for point in row["measurements"]:
                fx, fy = point["frequency_cycles_per_pixel"]
                self.assertAlmostEqual(point["d_spacing"], 1/np.hypot(fx/.02, fy/-.03))
        observed_first = [r for r in result["observations"] if r["frame_index"] == 0]
        self.assertTrue(all(r["status"] == "observed" for r in observed_first))
        changed = [r for r in result["observations"] if r["frame_index"] == 2]
        self.assertEqual(sum(r["status"] == "not_detected" for r in changed), 2)
        self.assertEqual(sum(r["status"] == "unmatched" for r in changed), 2)
        before = self.fft_arrays()
        self.assertEqual(self.call("result", query_request_id="joint-original"), result)
        self.assertEqual(self.joint(request_id="joint-original"), result)
        reused = self.joint(previous_observations_id=result["object_id"])
        self.assertTrue(all(r["fft_reused"] for r in reused["frame_observations"]))
        self.assertEqual(self.fft_arrays(), before)
        self.assertEqual(reused["observations"], result["observations"])
        self.assertTrue(Path(result["table_path"]).read_text().startswith("frame_index,status,"))
        failed = self.call("joint_observations", ok=False, request_id="joint-original", correspondence_object_id=self.corr["object_id"])
        self.assertEqual(failed["error"]["code"], "REQUEST_CONFLICT")

    def test_manual_correction_preserved_across_reuse_without_fft(self):
        original = self.joint()
        row = original["frame_observations"][0]
        before = self.fft_arrays()
        old = row["measurements"][0]
        vector = [old["frequency_cycles_per_pixel"][0] + .02, old["frequency_cycles_per_pixel"][1]]
        changed = self.call("remeasure", object_id=row["view_object_id"], measurement_object_id=old["measurement_object_id"],
                            points=[[0,0], vector], source_text="Synthetic UI point correction")
        ids = [changed["object_id"]]+[p["measurement_object_id"] for p in row["measurements"][1:]]
        revised = self.joint(previous_observations_id=original["object_id"],
                             measurement_overrides=[{"frame_index": 0, "measurement_object_ids": ids}])
        self.assertEqual(revised["frame_observations"][0]["measurements"][0]["frequency_cycles_per_pixel"], vector)
        self.assertEqual(revised["frame_observations"][1]["measurements"], original["frame_observations"][1]["measurements"])
        continued = self.joint(previous_observations_id=revised["object_id"])
        self.assertEqual(continued["frame_observations"][0]["measurements"], revised["frame_observations"][0]["measurements"])
        self.assertEqual(self.call("get", object_id=continued["object_id"])["observations"], continued["observations"])
        self.assertEqual(self.fft_arrays(), before)
        self.assertEqual(self.call("get", object_id=original["object_id"])["frame_observations"][0]["measurements"][0], old)
        wrong_ids = [original["frame_observations"][2]["measurements"][0]["measurement_object_id"]]
        refused = self.joint(ok=False, request_id="wrong-frame", previous_observations_id=original["object_id"],
                             measurement_overrides=[{"frame_index": 0, "measurement_object_ids": wrong_ids}])
        self.assertEqual(refused["error"]["code"], "MEASUREMENT_SCOPE_MISMATCH")
        self.assertFalse((self.workspace / "requests" / (child_request_id("wrong-frame", "frame-0-fft-batch")+".json")).exists())

    def test_missing_correspondence_excluded_not_silently_cropped(self):
        unverified = self.call("region_correspondence", sequence_object_id=self.sequence["object_id"], reference_index=1,
                               rect=[0,0,48,48], mode="identity")
        result = self.call("joint_observations", correspondence_object_id=unverified["object_id"], window="none",
                           peak_options={"refinement": "none", "threshold_rel": .1})
        self.assertEqual([r["status"] for r in result["frame_observations"]], ["UNVERIFIED", "VERIFIED", "UNVERIFIED"])
        self.assertEqual(len(self.fft_arrays()), 1)
        self.assertEqual(sum(r["status"] == "not_comparable" for r in result["observations"]), 2)
        self.assertEqual(self.call("get", object_id=result["object_id"])["object_id"], result["object_id"])

    def test_recovery_refuses_corrupt_child_science(self):
        result = self.joint(request_id="joint-corruption")
        fft = self.call("get", object_id=result["frame_observations"][2]["fft_object_id"])
        path = Path(fft["array_path"])
        original = path.read_bytes()
        damaged = bytearray(original)
        damaged[-1] ^= 1
        path.write_bytes(damaged)
        try:
            refused = self.call("result", ok=False, query_request_id="joint-corruption")
            self.assertEqual(refused["error"]["code"], "CORRUPT_OBJECT")
        finally:
            path.write_bytes(original)
        self.assertEqual(self.call("result", query_request_id="joint-corruption")["object_id"], result["object_id"])

    def test_partial_failure_exposes_committed_children_without_replay(self):
        actual = image_automation.run_child

        def injected(workspace, request, label, action, **parameters):
            if label == "frame-1-peaks":
                raise RuntimeError("Deliberate post-first-frame acceptance fault")
            return actual(workspace, request, label, action, **parameters)

        with mock.patch.object(image_automation, "run_child", side_effect=injected):
            failed = self.joint(ok=False, request_id="partial-joint")
        self.assertIn("Deliberate", failed["error"]["message"])
        before = self.fft_arrays()
        self.assertEqual(len(before), 2)
        saved = json.loads((self.workspace / "requests" / "partial-joint.json").read_text())
        inspected = recovery(worker.Workspace(str(self.workspace), False), saved, worker)
        self.assertFalse(inspected["automatic_retry"])
        committed = [r for r in inspected["children"] if r["state"] == "completed"]
        self.assertTrue(any(r["frame_index"] == 0 and r["action"] == "peak_measurements" for r in committed))
        self.assertTrue(any(r["frame_index"] == 1 and r["action"] == "fft" for r in committed))
        self.assertTrue(all(r["state"] == "not_submitted" for r in inspected["children"] if r["frame_index"] == 2))
        recovered = self.call("result", ok=False, query_request_id="partial-joint")
        self.assertEqual(recovered["partial_results"]["children"], inspected["children"])
        self.assertEqual(self.fft_arrays(), before)
        # A repeated failed parent is not resumed and creates no additional FFT.
        self.joint(ok=False, request_id="partial-joint")
        self.assertEqual(self.fft_arrays(), before)

    def test_recovery_does_not_adopt_preoccupied_child_id_from_another_frame(self):
        occupied = child_request_id("occupied-joint", "frame-0-fft-batch")
        wrong = self.call("fft_batch", request_id=occupied, object_id=self.frames[2]["object_id"],
                          rects=[[0,0,48,48]], window="none", subtract_mean=True, max_size=512)
        self.joint(ok=False, request_id="occupied-joint")
        before = self.fft_arrays()
        result = self.call("result", ok=False, query_request_id="occupied-joint")
        children = result["partial_results"]["children"]
        occupied_record = next(r for r in children if r["request_id"] == occupied)
        self.assertEqual(occupied_record["state"], "unrelated")
        self.assertFalse(occupied_record["validated"])
        self.assertNotIn("object_id", occupied_record)
        self.assertFalse(any(r.get("object_id") == wrong["object_id"] or r.get("state") == "completed" for r in children))
        self.assertEqual(self.fft_arrays(), before)

    def test_matching_is_geometric_and_competing_candidates_remain_ambiguous(self):
        def point(ident, vector):
            return {"measurement_object_id": ident, "frequency_cycles_per_pixel": vector, "d_spacing": None, "d_spacing_unit": None}
        reference = {"frame_index": 1, "status": "VERIFIED", "measurements": [point("ref-a", [.1,0]), point("ref-b", [0,.2])]}
        frames = [{"frame_index": 0, "status": "VERIFIED", "measurements": [point("renamed-b", [0,.2]), point("renamed-a", [.1,0])]},
                  reference, {"frame_index": 2, "status": "VERIFIED", "measurements": [point("competing-1", [.095,0]), point("competing-2", [.105,0])]}]
        table = match_observations(frames, 1, .01)
        first = [r for r in table if r["frame_index"] == 0]
        self.assertEqual([r["measurement_object_id"] for r in first], ["renamed-a", "renamed-b"])
        ambiguous = next(r for r in table if r["frame_index"] == 2 and r["reference_measurement_object_id"] == "ref-a")
        self.assertEqual(ambiguous["status"], "ambiguous")
        self.assertIsNone(ambiguous["measurement_object_id"])
        self.assertEqual(ambiguous["candidate_measurement_object_ids"], ["competing-1", "competing-2"])


if __name__ == "__main__":
    unittest.main()
