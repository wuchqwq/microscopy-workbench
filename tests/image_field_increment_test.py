"""Bounded incremental observations use existing science and immutable journals."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import image_workspace as worker
import image_field_increment as increment
import image_spatial_domains as spatial
import image_automation as automation


class Increment(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix="public-increment-")
        cls.root=Path(cls.temp.name);cls.workspace=cls.root/"workspace";cls.n=0
        y,x=np.indices((64,96))
        cls.values=(np.cos(2*np.pi*x/8+.3)+.8*np.cos(2*np.pi*y/16-.2)).astype(np.float32)
        cls.source=cls.root/"public-cosines.tiff";tifffile.imwrite(cls.source,cls.values,photometric="minisblack")
        cls.hash=worker.sha_file(cls.source)
        cls.frame=cls.call("frame",object_id=cls.call("open",source_path=str(cls.source))["object_id"],frame_index=0)
        cls.base=cls.call("spatial_field",object_id=cls.frame["object_id"],window_sizes=[32],stride_xy=[64,64],max_windows=2,
                          coordinate_domain="pixel",max_size=256,window="none",subtract_mean=True,max_peaks=8,
                          peak_options={"threshold_rel":.15,"refinement":"none"})
        cls.extended=cls.call("field_extend",object_id=cls.base["object_id"],rects=[[8,8,24,24]],source_text="Public synthetic explicit append")

    @classmethod
    def tearDownClass(cls):
        assert worker.sha_file(cls.source)==cls.hash
        cls.temp.cleanup()

    @classmethod
    def call(cls,action,ok=True,**parameters):
        cls.n+=1;request={"action":action,"workspace":str(cls.workspace),**parameters}
        if action not in ("get","result"):request.setdefault("request_id","increment-test-%d"%cls.n)
        result=worker.execute(request)
        if bool(result["ok"])!=ok:raise AssertionError(result)
        return result["result"] if ok else result

    def count_ffts(self):
        return sum(json.loads(p.read_text(encoding="utf-8"))["kind"]=="fft" for p in self.workspace.glob("objects/*/object.json"))

    def test_append_keeps_science_identity_and_direct_dft(self):
        old,new=self.base,self.extended
        self.assertEqual(new["kind"],"field_extend");self.assertEqual(new["new_fft_count"],1);self.assertEqual(new["reused_fft_count"],2)
        self.assertEqual(new["sampling_plan"]["fft_pixels"],2*32**2+16**2)
        for a,b in zip(old["samples"],new["samples"]):
            for key in ("fft_object_id","peaks_object_id","measurement_object_ids","source_array","rect_xyxy","xy_calibration"):
                self.assertEqual(a[key],b[key])
            self.assertEqual(increment.observation_key(old,a["rect_xyxy"],worker),b["observation_key"])
        sample=new["samples"][-1];source=self.values[8:24,8:24].astype(float);source-=source.mean()
        exponent=np.exp(-2j*np.pi*np.outer(np.arange(16),np.arange(16))/16)
        direct=np.roll(np.roll(exponent@source@exponent.T,8,0),8,1)
        actual=np.load(self.workspace/"objects"/sample["fft_object_id"]/"data.npy",allow_pickle=False)
        self.assertLess(np.max(np.abs(actual-direct)),1e-7)
        before=self.count_ffts();again=self.call("result",query_request_id=new["request_id"])
        self.assertEqual(again["object_id"],new["object_id"]);self.assertEqual(before,self.count_ffts())

    def test_duplicate_and_conflicting_settings_reject_before_children(self):
        before=self.count_ffts()
        for arguments in ({"rects":[[8,8,24,24]]},{"rects":[[0,16,16,32],[0,16,16,32]]},
                          {"rects":[[0,16,16,32]],"window":"hann"},{"rects":[[0,16,17,32]]},{"rects":[]}):
            rejected=self.call("field_extend",ok=False,object_id=self.extended["object_id"],**arguments)
            self.assertIn(rejected["error"]["code"],("INVALID_ARGUMENT","DUPLICATE_OBSERVATION"))
        self.assertEqual(self.count_ffts(),before)

    def test_stable_key_and_source_geometry_do_not_use_sample_index_or_label(self):
        changed=copy.deepcopy(self.base);changed["samples"][0]["sample_index"]=999;changed["samples"][0]["grid_xy"]=[999,999]
        rect=self.base["samples"][0]["rect_xyxy"]
        self.assertEqual(increment.observation_key(changed,rect,worker),increment.observation_key(self.base,rect,worker))
        rows=[{"sample_index":9,"scale_pixels":16,"grid_xy":[0,0],"rect_xyxy":[0,0,16,16]},
              {"sample_index":3,"scale_pixels":16,"grid_xy":[0,0],"rect_xyxy":[16,0,32,16]},
              {"sample_index":5,"scale_pixels":16,"grid_xy":[0,0],"rect_xyxy":[32,0,48,16]}]
        self.assertEqual([(a["sample_index"],b["sample_index"]) for a,b in spatial._neighbors(rows,True)],[(9,3),(3,5)])

    def test_append_expands_analysis_envelope_without_filling_unsampled_gap(self):
        initial=self.call("spatial_field",object_id=self.frame["object_id"],rect=[0,0,16,16],window_sizes=[16],stride_xy=[16,16],max_windows=1,
                          coordinate_domain="pixel",max_size=256,window="none",subtract_mean=True,max_peaks=8,
                          peak_options={"threshold_rel":.15,"refinement":"none"})
        extended=self.call("field_extend",object_id=initial["object_id"],rects=[[32,0,96,64]],source_text="Explicit synthetic larger observation outside initial region")
        self.assertEqual(extended["sampling_plan"]["rect_xyxy"],[0,0,96,64])
        directory=self.workspace/"objects"/extended["object_id"]
        sampled=np.load(directory/"sampled-support.npy",allow_pickle=False)
        unknown=np.load(directory/"unknown-support.npy",allow_pickle=False)
        self.assertTrue((sampled[:,16:32]==0).all());self.assertTrue((unknown[:,16:32]==1).all())
        mapped=self.call("domain_map",object_id=extended["object_id"],tolerance=.005,angles_degrees=[0,90],max_size=256)
        proposal=self.call("analysis_candidates",object_id=mapped["object_id"],budget_windows=4,budget_fft_pixels=16000,max_candidates=4,candidate_scales=[64])
        # Acceptance of the requested scale and existence of legal64px actions
        # demonstrates that the new scope is used by the formal planner.
        self.assertFalse(proposal["stopping"]["stop"]);self.assertTrue(proposal["actions"])
        for action in proposal["actions"]:
            r=action["rect_xyxy"];self.assertEqual(action["scale_pixels"],64)
            self.assertTrue(0<=r[0]<r[2]<=96 and 0<=r[1]<r[3]<=64)

    def test_revision_only_uses_saved_measurements_without_any_new_fft(self):
        sample=self.extended["samples"][0];old_ids=sample["measurement_object_ids"]
        self.assertGreaterEqual(len(old_ids),2)
        old=self.call("get",object_id=old_ids[0]);points=copy.deepcopy(old["points"]);points[1]=[points[1][0]+.005,points[1][1]]
        moved=self.call("remeasure",object_id=sample["view_object_id"],measurement_object_id=old_ids[0],points=points,source_text="Public synthetic saved anchor correction")
        before=self.count_ffts();ids=[moved["object_id"],*old_ids[1:]]
        revised=self.call("field_extend",object_id=self.extended["object_id"],rects=[],measurement_overrides=[{"observation_key":sample["observation_key"],"measurement_object_ids":ids}])
        self.assertEqual(before,self.count_ffts());self.assertEqual(revised["new_fft_count"],0)
        self.assertEqual(revised["samples"][0]["observation_key"],sample["observation_key"])
        self.assertEqual(revised["samples"][0]["measurement_object_ids"],ids)
        self.assertEqual(revised["increment_history"][-1]["history_role"],"measurement_revision")
        self.assertEqual(revised["increment_history"][-1]["added_observation_keys"],[])
        self.assertEqual([s["fft_object_id"] for s in revised["samples"]],[s["fft_object_id"] for s in self.extended["samples"]])
        self.call("get",object_id=revised["object_id"])

    def test_foreign_grid_measurement_override_is_rejected(self):
        sample=self.extended["samples"][0];other=self.extended["samples"][-1]
        before=self.count_ffts()
        rejected=self.call("field_extend",ok=False,object_id=self.extended["object_id"],rects=[],measurement_overrides=[{"observation_key":sample["observation_key"],"measurement_object_ids":other["measurement_object_ids"]}])
        self.assertEqual(rejected["error"]["code"],"MEASUREMENT_SCOPE_MISMATCH");self.assertEqual(before,self.count_ffts())

    def test_foreign_proposal_and_occupied_child_are_not_replayed(self):
        mapped=self.call("domain_map",object_id=self.base["object_id"],tolerance=.005,angles_degrees=[0,90],max_size=256)
        proposal=self.call("analysis_candidates",object_id=mapped["object_id"],budget_windows=8,budget_fft_pixels=8192,max_candidates=4)
        if proposal["actions"]:
            before=self.count_ffts();rejected=self.call("field_extend",ok=False,object_id=self.extended["object_id"],candidate_set_id=proposal["object_id"],action_ids=[proposal["actions"][0]["action_id"]])
            self.assertIn("different immutable field",rejected["error"]["message"]);self.assertEqual(before,self.count_ffts())
        parent="increment-occupied-parent";child=automation.child_request_id(parent,"added-atlas")
        self.call("view",request_id=child,object_id=self.frame["object_id"],max_size=256)
        before=self.count_ffts();failed=self.call("field_extend",ok=False,request_id=parent,object_id=self.base["object_id"],rects=[[8,8,24,24]])
        self.assertEqual(failed["error"]["code"],"REQUEST_CONFLICT")
        inspected=self.call("result",ok=False,query_request_id=parent)
        self.assertEqual(inspected["partial_results"]["inspection_error"]["code"],"CORRUPT_OBJECT")
        self.assertEqual(before,self.count_ffts())

    def test_budget_depth_and_new_request_conflict(self):
        workspace=worker.Workspace(str(self.workspace),False)
        fake=copy.deepcopy(self.base);fake["samples"]=fake["samples"]*16
        with self.assertRaises(worker.WorkspaceError) as caught:increment._selection(workspace,{"rects":[[8,8,24,24]]},fake,self.values.shape,worker)
        self.assertEqual(caught.exception.code,"BUDGET_EXCEEDED")
        chain=[{"object_id":str(i).zfill(32),"kind":"field_extend","base_field_object_id":str(i-1).zfill(32)} for i in range(1,7)]
        chain.insert(0,{"object_id":"0"*32,"kind":"spatial_field"})
        class Reader:
            def _object_record(self,ident):return next(r for r in chain if r["object_id"]==ident),None
        with self.assertRaises(worker.WorkspaceError):increment._depth(Reader(),chain[-1],worker)
        self.assertEqual(increment._depth(Reader(),chain[-2],worker),7)
        rejected=self.call("field_extend",ok=False,request_id=self.extended["request_id"],object_id=self.base["object_id"],rects=[[24,8,40,24]])
        self.assertEqual(rejected["error"]["code"],"REQUEST_CONFLICT")

    def test_coherent_manifest_tamper_and_operation_local_handoff(self):
        workspace=worker.Workspace(str(self.workspace),False);saved,_=workspace.object(self.extended["object_id"])
        with patch.object(increment,"validate_references",side_effect=AssertionError("Should hand off already qualified graph")):
            self.assertEqual(spatial.qualified_field(workspace,saved["object_id"],worker)[0],saved)
        journal=self.workspace/"requests"/(saved["request_id"]+".json");original=journal.read_bytes()
        try:
            value=json.loads(original);value["parameters"]["source_text"]="changed after qualification"
            journal.write_bytes(worker.canonical(value))
            with self.assertRaises(worker.WorkspaceError):spatial.qualified_field(workspace,saved["object_id"],worker)
        finally:journal.write_bytes(original)
        manifest=self.workspace/"objects"/saved["object_id"]/"object.json";original_meta=manifest.read_bytes()
        try:
            metadata=json.loads(original_meta);metadata["added_sample_indices"]=[0]
            manifest.write_bytes(worker.canonical(metadata));record=json.loads(original)
            record["object_manifest_sha256"]=worker.sha_file(manifest);record["response"]={"ok":True,"state":"completed","backend":worker.BACKEND,"request_id":saved["request_id"],**metadata}
            journal.write_bytes(worker.canonical(record))
            rejected=self.call("get",ok=False,object_id=saved["object_id"]);self.assertEqual(rejected["error"]["code"],"CORRUPT_OBJECT")
        finally:manifest.write_bytes(original_meta);journal.write_bytes(original)


if __name__=="__main__":unittest.main()
