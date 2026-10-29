"""Independent sourced-frame/translation tests; no GUI or specimen claims."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from scipy.ndimage import gaussian_filter
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import image_workspace as worker
import image_sequence as sequence_module


def moved(values, dx, dy):
    """Independent truth constructor: non-wrapping copy, unchanged interior."""
    output = np.full_like(values, 20000)
    h, w = values.shape
    sx0, sy0, sx1, sy1 = max(0, -dx), max(0, -dy), min(w, w-dx), min(h, h-dy)
    output[sy0+dy:sy1+dy, sx0+dx:sx1+dx] = values[sy0:sy1, sx0:sx1]
    return output


class Sequence(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.n = 0
        self.sources = {}
        y, x = np.indices((72, 80))
        noise = gaussian_filter(np.random.default_rng(1357).normal(size=x.shape), 1.8)
        noise *= 1700/noise.std()
        reference = np.rint(20000+3500*np.cos(2*np.pi*x/8)+2200*np.cos(2*np.pi*y/12)+noise).astype(np.uint16)
        change = reference.astype(float)
        change[18:54, 20:60] += 1100*np.cos(2*np.pi*x[18:54, 20:60]/5)
        self.values = np.stack([moved(reference, -3, 2), reference, moved(np.rint(change).astype(np.uint16), 4, -2)])
        self.frames = self.open_frames("shifted.tiff", self.values)
        self.params = {"frames": [{"object_id": f["object_id"], "label": label} for f, label in zip(self.frames, ["before", "reference", "after"])],
                       "axis": {"meaning": "time", "source_text": "Synthetic frame order, no physical clock provided"}}

    def tearDown(self):
        for path, original in self.sources.items():
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), original)
        self.temp.cleanup()

    def call(self, action, ok=True, **params):
        self.n += 1
        request = dict(action=action, workspace=str(self.root / "workspace"), **params)
        if action not in ("get", "result"):
            request.setdefault("request_id", "sequence-test-%d" % self.n)
        result = worker.execute(request)
        self.assertEqual(result["ok"], ok, result)
        return result["result"] if ok else result

    def open_frames(self, name, data):
        path = self.root / name
        tifffile.imwrite(path, data, photometric="minisblack", metadata={"axes": "QYX"})
        self.sources[path] = hashlib.sha256(path.read_bytes()).hexdigest()
        opened = self.call("open", source_path=str(path))
        return [self.call("frame", object_id=opened["object_id"], frame_index=i) for i in range(len(data))]

    def test_ordered_references_identity_recovery_and_semantics(self):
        seq = self.call("sequence_create", request_id="saved-sequence", **self.params)
        self.assertEqual([r["source_frame_index"] for r in seq["frames"]], [0, 1, 2])
        self.assertEqual([r["shape_yx"] for r in seq["frames"]], [[72,80]]*3)
        self.assertEqual([r["dtype"] for r in seq["frames"]], ["uint16"]*3)
        self.assertTrue(all(r["array_sha256"] and r["source_identity"] for r in seq["frames"]))
        self.assertFalse(seq["scientific_arrays_copied"])
        self.assertEqual(seq, self.call("result", query_request_id="saved-sequence"))
        self.assertEqual(seq, self.call("sequence_create", request_id="saved-sequence", **self.params))
        self.assertEqual(list(Path(seq["manifest_path"]).parent.glob("*.npy")), [])
        altered = {**self.params, "axis": {"meaning": "reconstruction_depth", "source_text": "Synthetic depth ordering only"}}
        self.call("sequence_create", request_id="saved-sequence", ok=False, **altered)
        depth = self.call("sequence_create", **altered)
        self.assertNotEqual(seq["axis"]["meaning"], depth["axis"]["meaning"])
        self.assertIsNone(depth["axis"]["unit"])
        self.assertIsNone(depth["axis"]["axial_resolution"])
        self.call("sequence_create", ok=False, **{**self.params,"axis":{"meaning":"time","step":1,"source_text":"missingunit"}})
        self.call("sequence_create", ok=False, **{**self.params,"frames":[self.params["frames"][0]]*2})

    def test_estimated_translation_matches_independent_integer_truth_and_local_change(self):
        seq = self.call("sequence_create", **self.params)
        request = {"sequence_object_id": seq["object_id"], "reference_index": 1,
                   "rect": [20,18,60,54], "mode": "estimate", "max_shift": 8}
        result = self.call("region_correspondence", request_id="matched-shifts", **request)
        self.assertEqual([r["status"] for r in result["rows"]], ["VERIFIED"]*3)
        self.assertEqual([r["shift_xy"] for r in result["rows"]], [[-3,2],[0,0],[4,-2]])
        self.assertEqual([r["target_rect"] for r in result["rows"]], [[17,20,57,56],[20,18,60,54],[24,16,64,52]])
        np.testing.assert_array_equal(self.values[0,20:56,17:57], self.values[1,18:54,20:60])
        self.assertFalse(np.array_equal(self.values[2,16:52,24:64], self.values[1,18:54,20:60]), "Known local change must remain; registration cannot erase it")
        self.assertFalse(result["resampling_performed"])
        self.assertEqual(result, self.call("result", query_request_id="matched-shifts"))
        self.assertEqual(result, self.call("region_correspondence", request_id="matched-shifts", **request))

    def test_periodic_and_constant_patterns_are_not_unique_translation(self):
        y, x = np.indices((72,80))
        periodic = np.rint(20000+3000*np.cos(2*np.pi*x/8)+2500*np.cos(2*np.pi*y/8)).astype(np.uint16)
        frames = self.open_frames("periodic.tiff", np.stack([periodic]*3))
        seq = self.call("sequence_create", frames=[{"object_id":f["object_id"]} for f in frames], axis=self.params["axis"])
        result = self.call("region_correspondence", sequence_object_id=seq["object_id"], reference_index=1,
                           rect=[24,24,56,56], mode="estimate", max_shift=8)
        self.assertEqual([r["status"] for r in result["rows"]], ["AMBIGUOUS","VERIFIED","AMBIGUOUS"])
        self.assertIsNone(result["rows"][0]["target_rect"])
        self.assertGreaterEqual(len(result["rows"][0]["candidates"]), 4)
        constant = self.open_frames("constant.tiff", np.full((2,16,16), 42, np.uint16))
        flat = self.call("sequence_create", frames=[{"object_id":f["object_id"]} for f in constant], axis=self.params["axis"])
        result = self.call("region_correspondence", sequence_object_id=flat["object_id"], reference_index=0,
                           rect=[4,4,12,12], mode="estimate")
        self.assertEqual(result["rows"][1]["status"], "AMBIGUOUS")

    def test_explicit_authority_no_clipping_missing_mapping_and_unmatched(self):
        seq = self.call("sequence_create", **self.params)
        base = {"sequence_object_id":seq["object_id"],"reference_index":1,"rect":[20,18,60,54]}
        unknown = self.call("region_correspondence", **base, mode="identity")
        self.assertEqual([r["status"] for r in unknown["rows"]], ["UNVERIFIED","VERIFIED","UNVERIFIED"])
        identity = self.call("region_correspondence", **base, mode="identity", source_text="Synthetic test explicitly declares common reconstruction grid")
        self.assertEqual([r["status"] for r in identity["rows"]], ["VERIFIED"]*3)
        self.assertEqual(identity["rows"][0]["basis"]["source"], "user_statement_not_independently_verified")
        shifted = self.call("region_correspondence", **base, mode="translation", source_text="Independent synthetic displacement",
                            translations=[{"frame_index":0,"shift_xy":[40,0]}])
        self.assertEqual([r["status"] for r in shifted["rows"]], ["OUT_OF_VIEW","VERIFIED","UNVERIFIED"])
        self.assertIsNone(shifted["rows"][0]["target_rect"])
        self.assertEqual(shifted["rows"][0]["requested_target_rect"], [60,18,100,54])
        no_match = self.call("region_correspondence", **base, mode="estimate", max_shift=1)
        self.assertTrue(all(r["status"] == "UNMATCHED" for i,r in enumerate(no_match["rows"]) if i!=1))

    def test_signed_calibration_equivalence_mismatch_and_unknown(self):
        scales = [{"x":.02,"y":-.03,"unit":"nm"},{"x":.2,"y":-.3,"unit":"angstrom"},{"x":.02,"y":.03,"unit":"nm"}]
        calibrated = [self.call("calibrate",object_id=frame["object_id"],scope="image",xy_scale=scale,source_text="Independent synthetic signed scale")
                      for frame, scale in zip(self.frames, scales)]
        seq = self.call("sequence_create", frames=[{"object_id":f["object_id"]} for f in calibrated], axis=self.params["axis"])
        result = self.call("region_correspondence", sequence_object_id=seq["object_id"], reference_index=1,
                           rect=[20,18,60,54],mode="identity",source_text="Synthetic same-grid assertion")
        self.assertEqual([r["status"] for r in result["rows"]], ["VERIFIED","VERIFIED","INCOMPATIBLE"])
        mixed = self.call("sequence_create",frames=[{"object_id":calibrated[0]["object_id"]},{"object_id":self.frames[1]["object_id"]}],axis=self.params["axis"])
        result = self.call("region_correspondence",sequence_object_id=mixed["object_id"],reference_index=0,rect=[20,18,60,54],mode="estimate")
        self.assertEqual(result["rows"][1]["status"],"INCOMPATIBLE")

    def test_recovery_reopens_original_array_and_selected_calibration_journal(self):
        calibrated = self.call("calibrate",object_id=self.frames[0]["object_id"],scope="image",xy_scale={"x":.02,"y":.02,"unit":"nm"},source_text="Sourced synthetic scale")
        seq = self.call("sequence_create",request_id="dependency-check",frames=[{"object_id":calibrated["object_id"]},{"object_id":self.frames[1]["object_id"]}],axis=self.params["axis"])
        path = Path(self.frames[1]["array_path"])
        original = path.read_bytes()
        damaged = bytearray(original); damaged[-1] ^= 1; path.write_bytes(damaged)
        try:
            result = self.call("result",ok=False,query_request_id="dependency-check")
            self.assertEqual(result["error"]["code"],"CORRUPT_OBJECT")
        finally:
            path.write_bytes(original)
        journal = self.root/"workspace"/"requests"/(calibrated["request_id"]+".json")
        saved = journal.read_bytes()
        record = json.loads(saved); record["response"]["xy_calibration"]["xy_scale"]["x"] *= 2
        journal.write_text(json.dumps(record),encoding="utf8")
        try:
            self.call("get",ok=False,object_id=seq["object_id"])
        finally:
            journal.write_bytes(saved)
        self.assertEqual(self.call("result",query_request_id="dependency-check")["object_id"],seq["object_id"])

    def test_origin_evidence_and_finite_float_dynamic_range(self):
        def origin(scale, zero, unit):
            return {"xy_calibration":{"status":"active","coordinate_domain":"real_space",
                                      "xy_scale":{"x":scale,"y":-scale,"unit":unit},"physical_zero_xy":zero}}
        first, equivalent = origin(.02,[1.,-2.],"nm"), origin(.2,[10.,-20.],"angstrom")
        self.assertEqual(sequence_module.calibration_comparability(first,equivalent)["origin_relation"],"same")
        different = origin(.02,[1.1,-2.],"nm")
        self.assertEqual(sequence_module.calibration_comparability(first,different)["origin_relation"],"different")
        # Pure numeric range case does not claim a file/import format extension.
        values = np.random.default_rng(71).uniform(-1,1,size=(24,24))*1e308
        target = np.zeros_like(values)
        target[1:,2:] = values[:-1,:-2]
        result = sequence_module.estimate_translation(values,target,[6,6,18,18],4,.9,.03,worker)
        self.assertEqual(result["status"],"VERIFIED")
        self.assertEqual(result["shift_xy"],[2,1])


if __name__ == "__main__":
    unittest.main()
