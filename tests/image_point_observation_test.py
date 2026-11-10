"""Original-array intensity evidence, not a physical vacancy classifier."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker, image_peaks
from preview_test_support import acknowledge_received_previews


class PointObservations(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="point-observation-")
        self.root = Path(self.temp.name).resolve()
        self.workspace = self.root / "images"
        self.serial = 0
        self.values = np.arange(64*64, dtype=np.float32).reshape(64,64)/100
        self.frame = self.make_frame(self.values)
        self.rect = [20,20,28,28]
        self.refs = [[4,4,12,12],[36,36,44,44]]

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, ok=True, **args):
        self.serial += 1
        request = dict(action=action, workspace=str(self.workspace), **args)
        if action not in ("get", "result"):
            request["request_id"] = "point-%d" % self.serial
        response = worker.execute(request)
        self.assertEqual(response["ok"], ok, response)
        if ok:
            acknowledge_received_previews(worker, self.workspace, response["result"])
        return response["result"] if ok else response

    def make_frame(self, values):
        source = self.root / ("public-%d.tiff" % self.serial)
        tifffile.imwrite(source, values, photometric="minisblack")
        opened = self.call("open", source_path=str(source))
        return self.call("frame", object_id=opened["object_id"], frame_index=0)

    def stats(self, **args):
        return self.call("statistics", object_id=self.frame["object_id"], rect=self.rect,
                         reference_comparison=dict(reference_rects=self.refs, source_text="Same-type reference assumption supplied by caller"), **args)

    def discovery(self, frame=None, rect=None):
        result = self.call("discovery", object_id=(frame or self.frame)["object_id"], entry="manual", selection_origin="agent",
                          regions=[dict(rect=rect or self.rect, reason="Explicit expected-site ROI; no material identification")])
        return result

    def review(self, discovery, evidence, ok=True):
        return self.call("discovery_review", ok=ok, object_id=discovery["object_id"], candidate_id=discovery["candidates"][0]["candidate_id"],
                         evidence_ids=evidence, observation_text="Stored scalar intensity differs; physical cause remains unresolved")

    def test_original_values_and_signed_reference_difference(self):
        result = self.stats()
        comp = result["reference_comparison"]
        def mean(rect):
            x0,y0,x1,y1=rect
            return float(np.mean(self.values[y0:y1,x0:x1], dtype=np.float64))
        expected = mean(self.rect)-float(np.median([mean(r) for r in self.refs]))
        self.assertEqual(comp["primary_mean_minus_reference_median"], expected)
        self.assertFalse(comp["same_type_reference_verified"])
        self.assertFalse(comp["independent_validation"])
        self.assertIsNone(comp["physical_conclusion"])
        self.assertEqual(comp["reference_rects"], self.refs)
        exported = self.call("export", object_id=result["object_id"], output_dir=str(self.root/"export"))
        self.assertTrue(list((self.root/"export").rglob("statistics-comparison.json")), exported)
        self.assertEqual(self.call("result", query_request_id=result["request_id"])["object_id"],result["object_id"])

    def test_invalid_reference_scope_and_fields_are_rejected(self):
        base = dict(object_id=self.frame["object_id"], rect=self.rect)
        for comp in [dict(reference_rects=[],source_text="x"), dict(reference_rects=[self.rect],source_text="x"),
                     dict(reference_rects=[self.refs[0]]*2,source_text="x"), dict(reference_rects=[[0,0,7,8]],source_text="x"),
                     dict(reference_rects=[[-1,0,7,8]],source_text="x"), dict(reference_rects=self.refs,source_text=""),
                     dict(reference_rects=self.refs,source_text="x",vacancy_confirmed=True)]:
            self.call("statistics",ok=False,**base,reference_comparison=comp)
        self.call("statistics",ok=False,object_id=self.frame["object_id"],reference_comparison=dict(reference_rects=self.refs,source_text="x"))
        fft=self.call("fft",object_id=self.frame["object_id"],rect=[0,0,64,64],window="hann",subtract_mean=True)
        self.call("statistics",ok=False,object_id=fft["object_id"],component="amplitude",reference_comparison=dict(reference_rects=self.refs,source_text="x"))

    def test_realspace_review_exact_primary_and_profile_subset(self):
        discovery=self.discovery()
        stats=self.stats()
        profile=self.call("profile",object_id=self.frame["object_id"],points=[[20,24],[27,24]])
        review=self.review(discovery,[stats["object_id"],profile["object_id"]])
        self.assertEqual(review["fft_refs"],[])
        self.assertEqual([r["support"] for r in review["numerical_observations"]],["exact_candidate_roi","line_subset_of_candidate_roi"])
        self.assertFalse(review["review_is_scientific_verification"])
        self.assertEqual(self.call("get",object_id=review["object_id"])["object_id"],review["object_id"])
        self.assertIsNone(review["physical_conclusion"])
        other=self.call("statistics",object_id=self.frame["object_id"],rect=[19,20,27,28])
        self.review(discovery,[other["object_id"]],ok=False)
        outside=self.call("profile",object_id=self.frame["object_id"],points=[[19,24],[27,24]])
        self.review(discovery,[outside["object_id"]],ok=False)

    def test_native_full_view_annotation_profile_and_statistics_share_exact_frame(self):
        discovery = self.discovery()
        view = self.call("view", object_id=self.frame["object_id"])
        marked = self.call("annotate", object_id=view["object_id"], annotations=[dict(
            annotation_id="native-target", kind="rectangle", coordinates=self.rect,
            source_object_id=self.frame["object_id"], coordinate_space="source_pixels",
            text="Explicit native ROI", status="hypothesized")])
        stats = self.call("statistics", object_id=marked["object_id"], rect=self.rect,
            reference_comparison=dict(reference_rects=self.refs, source_text="Explicit reference priors"))
        profile = self.call("profile", object_id=marked["object_id"], points=[[20,24],[27,24]])
        review = self.review(discovery, [stats["object_id"], profile["object_id"]])
        self.assertEqual([e["object_id"] for e in review["evidence_refs"]], [stats["object_id"], profile["object_id"]])
        self.assertEqual(self.call("result", query_request_id=review["request_id"])["object_id"], review["object_id"])
        # A crop is not silently promoted into an equal full-frame grid.
        crop = self.call("view", object_id=view["object_id"], rect=[16,16,32,32])
        cropped_profile = self.call("profile", object_id=crop["object_id"], points=[[20,24],[27,24]])
        rejected = self.review(discovery, [cropped_profile["object_id"]], ok=False)
        self.assertEqual(rejected["error"]["code"], "DISCOVERY_SCOPE_MISMATCH")

    def test_different_frame_and_calibration_fail_binding(self):
        stats=self.stats()
        other=self.make_frame(self.values.copy())
        self.review(self.discovery(frame=other),[stats["object_id"]],ok=False)
        calibrated=self.call("calibrate",object_id=self.frame["object_id"],scope="image",xy_scale=dict(x=.02,y=.02,unit="nm"),source_text="Public synthetic scale")
        self.review(self.discovery(frame=calibrated),[stats["object_id"]],ok=False)

    def test_standalone_historical_stats_and_old_fft_review_still_work(self):
        stats=self.call("statistics",object_id=self.frame["object_id"],rect=self.rect)
        self.assertNotIn("reference_comparison",stats)
        self.assertEqual(stats["statistics"]["sample_count"],64)
        fft=self.call("fft",object_id=self.frame["object_id"],rect=self.rect,window="none",subtract_mean=True)
        review=self.review(self.discovery(),[fft["object_id"]])
        self.assertNotIn("support",review["numerical_observations"][0])

    def test_large_finite_values_remain_numerical_not_physical(self):
        huge=np.zeros((64,64),np.float32)
        huge[20:28,20:28]=1e30
        frame=self.make_frame(huge)
        result=self.call("statistics",object_id=frame["object_id"],rect=self.rect,reference_comparison=dict(reference_rects=self.refs,source_text="Public finite scale"))
        self.assertTrue(np.isfinite(result["reference_comparison"]["primary_mean_minus_reference_median"]))

    def test_coherently_rehashed_forged_numbers_are_refused_by_review(self):
        stats=self.stats()
        directory=self.workspace/"objects"/stats["object_id"]
        manifest=directory/"object.json"
        journal_path=self.workspace/"requests"/(stats["request_id"]+".json")
        originals={p:p.read_bytes() for p in (manifest,journal_path,directory/"statistics.json")}
        discovery=self.discovery()
        try:
            changed=copy.deepcopy(stats)
            changed["statistics"]["mean"]+=1
            (directory/"statistics.json").write_bytes(worker.canonical(changed["statistics"])+b"\n")
            changed["files_sha256"]["statistics.json"]=worker.sha_file(directory/"statistics.json")
            manifest.write_bytes(worker.canonical(changed)+b"\n")
            journal=json.loads(originals[journal_path])
            journal["object_manifest_sha256"]=worker.sha_file(manifest)
            journal["response"]={"ok":True,"state":"completed","backend":worker.BACKEND,**changed}
            journal_path.write_bytes(worker.canonical(journal)+b"\n")
            worker.Workspace(str(self.workspace),False)._object_record(stats["object_id"])
            response=self.review(discovery,[stats["object_id"]],ok=False)
            self.assertEqual(response["error"]["code"],"CORRUPT_OBJECT")
        finally:
            for p,raw in originals.items(): p.write_bytes(raw)

    def test_overlapping_context_references_are_explicit_not_independent(self):
        self.refs=[[21,20,29,28]]
        result=self.stats()["reference_comparison"]
        self.assertEqual(result["overlapping_roi_pairs"],[[0,1]])
        self.assertFalse(result["independent_validation"])


class PeakCapacity(unittest.TestCase):
    @staticmethod
    def detect(points, cap, separation=2):
        values=np.zeros((64,64),np.complex128)
        for x,y,a in points: values[y,x]=a
        return image_peaks.detect(values,dict(max_peaks=cap,min_separation_bins=separation,exclude_dc_radius_bins=0,threshold_rel=.1,refinement="none"),worker.need)

    def test_cap_equal_to_count_does_not_establish_omission(self):
        rows,_,quality=self.detect([(10,10,10),(20,20,9)],2)
        self.assertTrue(quality["selection_limit_reached"])
        self.assertEqual(quality["candidate_pool_truncation"]["status"],"complete_under_current_filters")
        self.assertEqual(len(rows),2)

    def test_true_omission_preserves_returned_rows(self):
        points=[(10,10,10),(20,20,9),(40,40,8)]
        rows,_,quality=self.detect(points,2)
        full,_,_=self.detect(points,3)
        self.assertEqual([r["bin_xy"] for r in rows],[r["bin_xy"] for r in full[:2]])
        self.assertEqual(quality["candidate_pool_truncation"]["status"],"truncated")
        self.assertEqual(quality["candidate_pool_truncation"]["omitted_candidate_lower_bound"],1)

    def test_nms_suppressed_local_maximum_is_not_cap_omission(self):
        _,_,quality=self.detect([(10,10,10),(12,10,9)],1,separation=3)
        self.assertEqual(quality["local_maxima_above_threshold"],2)
        self.assertEqual(quality["candidate_pool_truncation"]["status"],"complete_under_current_filters")


if __name__=="__main__": unittest.main()
