"""Deterministic proposal policies plus actual provider persistence/recovery."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import tifffile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import image_workspace as worker
import image_active_analysis as active


class FixtureWorkspace:
    def __init__(self,root,field,mapped):
        self.root=root;self.saved={field["object_id"]:field,mapped["object_id"]:mapped}
        for ident,value in self.saved.items():
            folder=root/"objects"/ident;folder.mkdir(parents=True);(folder/"object.json").write_bytes(worker.canonical(value))
    def object(self,ident):
        worker.need(ident in self.saved,"Unknown test reference","OBJECT_NOT_FOUND")
        return copy.deepcopy(self.saved[ident]),self.root/"objects"/ident
    def _object_record(self,ident):return self.object(ident)


def fake_evidence():
    samples=[]
    for y in (0,32):
        for x in (0,32):
            i=len(samples)
            families=[{"family_id":"x","vector_xy":[.125,0.],"measurement_object_ids":[("%032x"%(i*2+1))]},
                      {"family_id":"y","vector_xy":[0.,.1875],"measurement_object_ids":[("%032x"%(i*2+2))]}]
            samples.append({"sample_index":i,"rect_xyxy":[x,y,x+32,y+32],"center_xy":[x+15.5,y+15.5],"scale_pixels":32,
                            "source_array":{"array_sha256":"0"*64,"shape_yx":[64,64]},"status":"valid","domain_status":"candidate",
                            "features":{"families":families},"quality":{"detection_truncated":False,"has_two_noncollinear_families":True}})
    field={"object_id":"a"*32,"kind":"spatial_field","parent_object_id":"c"*32,"xy_calibration":None,"samples":samples,
           "fft_parameters":{"window":"none","subtract_mean":True},"peak_parameters":{"max_peaks":8,"threshold_rel":.1,"refinement":"none"},
           "coordinate_domain":"pixel","coordinate_unit":"cycles/pixel","source_context":{"shape_yx":[64,64]},
           "overview_object_id":"d"*32,"sampling_plan":{"rect_xyxy":[0,0,64,64],"fft_pixels":4096,"window_count":4}}
    mapped={"object_id":"b"*32,"kind":"domain_map","parent_object_id":field["object_id"],"samples":copy.deepcopy(samples),"tolerance":.001,
            "edges":[{"edge_index":i,"sample_indices":pair,"status":"compatible"} for i,pair in enumerate(([0,1],[0,2],[1,3],[2,3]))],
            "field_image":{"width":256,"height":256,"panels":[],"hotspots":[]}}
    return field,mapped


class DeterministicPolicies(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="public-active-policy-");self.root=Path(self.temp.name)
        self.field,self.mapped=fake_evidence();self.ws=FixtureWorkspace(self.root,self.field,self.mapped)
        self.request={"object_id":self.mapped["object_id"],"budget_windows":8,"budget_fft_pixels":5120,"candidate_scales":[16]}
    def tearDown(self):self.temp.cleanup()
    def propose(self,**patch):return active.result(self.ws,{**self.request,**patch},worker)[0]

    def test_uniform_geometry_keeps_affordable_offset_exploration_and_stable_identity(self):
        first=self.propose();again=self.propose()
        self.assertEqual(first,again);self.assertFalse(first["stopping"]["stop"])
        self.assertEqual(len(first["recommended_action_ids"]),4);self.assertTrue(first["reserved_exploration_action_ids"])
        actions={a["action_id"]:a for a in first["actions"]}
        self.assertEqual(sum(actions[i]["estimated_cost"]["fft_pixels"] for i in first["recommended_action_ids"]),1024)
        for action in actions.values():
            self.assertEqual(action["scale_pixels"],16);self.assertEqual(action["parameters"],active.action_parameters(self.field))
            self.assertEqual(action["action_id"],active.observation_key(self.field,action["rect_xyxy"],worker)[:32])
            self.assertIn("not probability",action["priority_semantics"])
        # A display/table index is not the observation identity.
        reordered=copy.deepcopy(self.field);reordered["samples"].reverse()
        self.assertEqual(active.observation_key(reordered,[8,8,24,24],worker),active.observation_key(self.field,[8,8,24,24],worker))

    def test_targeted_difference_does_not_consume_reserved_nontarget_exploration(self):
        self.ws.saved[self.mapped["object_id"]]["edges"][0]["status"]="different"
        value=self.propose()
        actions={a["action_id"]:a for a in value["actions"]}
        self.assertTrue(any("neighbor_difference" in a["reason_codes"] for a in value["actions"]))
        reserved=value["reserved_exploration_action_ids"]
        self.assertTrue(reserved)
        self.assertTrue(any("neighbor_difference" not in actions[i]["reason_codes"] for i in reserved))

    def test_stops_are_explicit_and_do_not_fabricate_physical_values(self):
        self.assertEqual(self.propose(user_stop=True)["stopping"]["reason"],"user_stop")
        self.assertEqual(self.propose(budget_windows=4)["stopping"]["reason"],"budget_exhausted")
        self.assertEqual(self.propose(budget_fft_pixels=4096)["stopping"]["reason"],"budget_exhausted")
        for sample in self.ws.saved[self.field["object_id"]]["samples"]:
            sample["status"]="ambiguous";sample["quality"]["detection_truncated"]=True
        limited=self.propose()
        self.assertEqual(limited["stopping"]["reason"],"data_quality_limited");self.assertEqual(limited["actions"],[])
        self.assertEqual(limited["coordinate_unit"],"cycles/pixel")
        self.assertIn("not physically irrecoverable"," ".join(limited["limitations"]))

    def test_no_legal_action_on_small_complete_grid_and_bad_numeric_requests(self):
        self.ws.saved[self.field["object_id"]]["sampling_plan"]["rect_xyxy"]=[0,0,4,4]
        self.ws.saved[self.field["object_id"]]["samples"]=[{**self.field["samples"][0],"scale_pixels":4,"rect_xyxy":[0,0,4,4]}]
        self.assertEqual(self.propose(candidate_scales=[4])["stopping"]["reason"],"no_legal_actions")
        for patch in ({"budget_windows":True},{"budget_windows":33},{"budget_fft_pixels":float("inf")},{"max_candidates":9},{"candidate_scales":[[16]]},{"candidate_scales":[4,4]},{"user_stop":1}):
            with self.assertRaises(worker.WorkspaceError):self.propose(**patch)
        with self.assertRaises(worker.WorkspaceError):self.propose(candidate_scales=[128])

    def test_committed_uninformative_history_stops_and_measurement_only_revision_does_not_reset(self):
        field=self.ws.saved[self.field["object_id"]]
        old=list(field["samples"])
        for i,rect in enumerate(([8,8,24,24],[40,8,56,24])):
            sample=copy.deepcopy(old[i]);sample.update(sample_index=4+i,scale_pixels=16,rect_xyxy=rect,status="ambiguous")
            field["samples"].append(sample)
        field["kind"]="field_extend";field["history_depth"]=4
        field["sampling_plan"]["fft_pixels"]=4608
        field["increment_history"]=[{"added_observation_keys":[active.observation_key(field,s["rect_xyxy"],worker)]} for s in field["samples"][4:]]
        field["increment_history"].append({"history_role":"measurement_revision","added_observation_keys":[]})
        value=self.propose(budget_windows=12,budget_fft_pixels=8192)
        self.assertEqual(value["progress"]["completed_increment_steps"],2)
        self.assertEqual(value["progress"]["measurement_revision_steps"],1)
        self.assertEqual(value["progress"]["recent_no_new_evidence_steps"],2)
        self.assertEqual(value["stopping"]["reason"],"no_new_evidence")
        self.assertEqual(value["actions"],[])

    def test_current_scope_and_settings_change_action_identity_not_text_or_row_id(self):
        rect=[8,8,24,24];original=active.observation_key(self.field,rect,worker)
        for patch in ({"parent_object_id":"f"*32},{"fft_parameters":{"window":"hann","subtract_mean":True}},
                      {"peak_parameters":{"max_peaks":16,"threshold_rel":.01}}):
            self.assertNotEqual(active.observation_key({**self.field,**patch},rect,worker),original)
        renamed=copy.deepcopy(self.field);renamed["samples"][0]["sample_index"]=27;renamed["samples"][0]["label"]="same lattice"
        self.assertEqual(active.observation_key(renamed,rect,worker),original)

    def test_exact_support_coverage_union_is_not_the_largest_single_overlap(self):
        self.assertEqual(active._covered_fraction([0,0,10,10],[[0,0,5,10],[5,0,10,10]]),1.)
        self.assertEqual(active._covered_fraction([0,0,10,10],[[0,0,6,10],[4,0,8,10]]),.8)


class ActualProvider(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix="public-active-provider-");cls.root=Path(cls.temp.name);cls.workspace=cls.root/"workspace";cls.serial=0
        y,x=np.indices((64,64));cls.values=(2*np.cos(2*np.pi*x/8)+np.cos(2*np.pi*3*y/16)).astype(np.float32)
        cls.source=cls.root/"public-pattern.tiff";tifffile.imwrite(cls.source,cls.values,photometric="minisblack",metadata=None)
        cls.source_hash=worker.sha_file(cls.source)
        cls.frame=cls.call("frame",object_id=cls.call("open",source_path=str(cls.source))["object_id"],frame_index=0)
        cls.field=cls.call("spatial_field",object_id=cls.frame["object_id"],window_sizes=[32],stride_xy=[32,32],max_windows=4,coordinate_domain="pixel",window="none",subtract_mean=True,max_peaks=8,peak_options={"threshold_rel":.1,"refinement":"none"},max_size=256)
        cls.mapped=cls.call("domain_map",object_id=cls.field["object_id"],tolerance=.01,angles_degrees=[0,90],max_size=256)
    @classmethod
    def tearDownClass(cls):
        assert worker.sha_file(cls.source)==cls.source_hash
        cls.temp.cleanup()
    @classmethod
    def call(cls,action,**parameters):
        cls.serial+=1;request={"action":action,"workspace":str(cls.workspace),"request_id":"active-test-%d"%cls.serial,**parameters}
        response=worker.execute(request)
        if not response.get("ok"):raise AssertionError(response)
        return response["result"]
    def test_saved_proposal_recovery_no_fft_and_coherent_tamper_is_refused(self):
        before=list((self.workspace/"requests").iterdir())
        value=self.call("analysis_candidates",object_id=self.mapped["object_id"],budget_windows=8,budget_fft_pixels=5120,candidate_scales=[16],max_candidates=4)
        self.assertTrue(value["recommended_action_ids"]);self.assertEqual(value["new_fft_count"],0)
        restored=self.call("result",query_request_id=value["request_id"]);self.assertEqual(restored["object_id"],value["object_id"])
        fft_requests=[json.loads(p.read_text(encoding="utf-8")) for p in (self.workspace/"requests").iterdir()]
        self.assertEqual(sum(p["parameters"]["action"]=="fft" for p in fft_requests),4)
        directory=self.workspace/"objects"/value["object_id"]
        self.assertEqual(worker.read_json(directory/"analysis-candidates.json")["actions"],value["actions"])
        manifest=directory/"object.json";journal=self.workspace/"requests"/(value["request_id"]+".json")
        saved_manifest,saved_journal=manifest.read_bytes(),journal.read_bytes()
        metadata=json.loads(saved_manifest);metadata["actions"][0]["heuristic_score"]+=1
        manifest.write_bytes(worker.canonical(metadata));record=json.loads(saved_journal)
        record["object_manifest_sha256"]=worker.sha_file(manifest);record["response"]={"ok":True,"state":"completed","backend":worker.BACKEND,"request_id":value["request_id"],**metadata}
        journal.write_bytes(worker.canonical(record))
        try:
            refused=worker.execute({"workspace":str(self.workspace),"action":"get","object_id":value["object_id"]})
            self.assertFalse(refused["ok"]);self.assertEqual(refused["error"]["code"],"CORRUPT_OBJECT")
        finally:manifest.write_bytes(saved_manifest);journal.write_bytes(saved_journal)


if __name__=="__main__":unittest.main()
