"""Finite analytic window/domain observations; no specimen accuracy claims."""
import copy
import hashlib
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
import image_spatial_domains as domains


class SpatialDomains(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix="public-spatial-domains-")
        cls.root=Path(cls.temp.name);cls.workspace=cls.root/"workspace";cls.n=0
        y,x=np.indices((128,192))
        a=2*np.cos(2*np.pi*10*x/64+.7)+np.cos(2*np.pi*10*y/64-.3)
        b=2*np.cos(2*np.pi*(8*x+6*y)/64+.2)+np.cos(2*np.pi*(-6*x+8*y)/64+.4)
        cls.values=np.where(x<128,a,b).astype(np.float32)
        cls.source=cls.root/"public-analytic-two-orientations.tiff"
        tifffile.imwrite(cls.source,cls.values,photometric="minisblack")
        cls.source_hash=worker.sha_file(cls.source)
        cls.frame=cls.call("frame",object_id=cls.call("open",source_path=str(cls.source))["object_id"],frame_index=0)
        cls.calibrated=cls.call("calibrate",object_id=cls.frame["object_id"],scope="image",xy_scale={"x":.02,"y":-.03,"unit":"nm"},source_text="Public synthetic signed XY sampling; not an instrument calibration")
        cls.options={"window_sizes":[64,128],"stride_xy":[64,64],"max_windows":8,"coordinate_domain":"pixel","max_size":256,
                     "window":"none","subtract_mean":True,"max_peaks":12,"peak_options":{"refinement":"none","threshold_rel":.15}}
        cls.field=cls.call("spatial_field",object_id=cls.frame["object_id"],**cls.options)

    @classmethod
    def tearDownClass(cls):
        assert worker.sha_file(cls.source)==cls.source_hash
        cls.temp.cleanup()

    @classmethod
    def call(cls,action,ok=True,**parameters):
        cls.n+=1
        request={"action":action,"workspace":str(cls.workspace),**parameters}
        if action not in ("get","result"):request.setdefault("request_id","spatial-domain-test-%d"%cls.n)
        response=worker.execute(request)
        if bool(response["ok"])!=ok:raise AssertionError(response)
        return response["result"] if ok else response

    def arrays(self):
        return {str(p):worker.sha_file(p) for p in self.workspace.glob("objects/*/*.npy")}

    def test_analytic_vectors_signed_dtype_multiscale_and_cost(self):
        field=self.field
        self.assertEqual(field["sample_count"],8)
        self.assertEqual(field["new_fft_count"],8)
        self.assertEqual(field["costs"]["worker_processes"],1)
        self.assertEqual(field["sampling_plan"]["fft_pixels"],6*64**2+2*128**2)
        self.assertEqual(field["samples"][0]["center_xy"],[31.5,31.5])
        self.assertEqual(field["samples"][0]["source_array"]["dtype"],"float32")
        for sample in field["samples"][:6]:
            expected={(10/64,0.),(0.,10/64)} if sample["rect_xyxy"][0]<128 else {(8/64,6/64),(6/64,-8/64)}
            actual={tuple(r["vector_xy"]) for r in sample["features"]["families"]}
            self.assertEqual(actual,expected)
            self.assertTrue(all(m["d_spacing"] is None for m in sample["measurements"]))

    def test_orientation_graph_is_not_rotation_normalized_and_mixed_coarse_is_unknown(self):
        before=self.arrays()
        result=self.call("domain_map",object_id=self.field["object_id"],angles_degrees=[36.86989764584402],tolerance=.003,max_size=256)
        self.assertEqual(self.arrays().keys(),before.keys()|{str(Path(result["manifest_path"]).parent/n) for n in ("sampled-support.npy","unknown-support.npy")})
        self.assertTrue(all(worker.sha_file(p)==v for p,v in before.items()))
        edge=next(e for e in result["edges"] if e["sample_indices"]==[1,2])
        self.assertEqual(edge["status"],"different")
        self.assertEqual(edge["orientation"]["status"],"incompatible")
        self.assertEqual(edge["lattice_geometry"]["status"],"compatible_signature")
        self.assertEqual(edge["boundary_band_xyxy"],[64,0,192,64])
        labels={i:d["domain_id"] for d in result["domains"] for i in d["sample_indices"]}
        self.assertEqual(labels[0],labels[1]);self.assertNotEqual(labels[1],labels[2])
        self.assertIn(7,result["unknown_sample_indices"])
        # This particular coarse finite window is already masked by the
        # ordinary detector's completeness check; it must remain unresolved.
        coarse=result["samples"][7]
        self.assertEqual(coarse["domain_status"],"unknown")
        self.assertTrue(coarse["invalid_reasons"] or coarse["domain_unknown_reason"])
        self.assertFalse(result["fft_recomputed"])
        self.assertEqual(self.call("get",object_id=result["object_id"])["edges"],result["edges"])

    def test_preflight_count_pixels_and_numeric_types_create_no_children(self):
        for change in ({"max_windows":1},{"window_sizes":[[64]]},{"stride_xy":[0,64]},{"window_sizes":[64,64]},
                       {"window_sizes":[256]},{"coordinate_domain":"fake"},{"measurement_overrides":[{"sample_index":0,"measurement_object_ids":["0"*32]}]}):
            before=set(self.workspace.glob("requests/*.json"))
            result=self.call("spatial_field",ok=False,object_id=self.frame["object_id"],**{**self.options,**change})
            self.assertFalse(result["ok"])
            self.assertEqual(len(set(self.workspace.glob("requests/*.json"))-before),1,"Preflight may create its parent failed journal, never a child")

    def test_revision_uses_original_fft_and_original_request_recovers_same_object(self):
        first=self.field["samples"][0]
        changed=self.call("remeasure",object_id=first["fft_object_id"],measurement_object_id=first["measurement_object_ids"][0],
                          points=[[0.,0.],[.16,.01]],source_text="Synthetic manual point correction; not a measured specimen")
        ids=[changed["object_id"],*first["measurement_object_ids"][1:]]
        old_hashes={s["fft_object_id"]:s["fft_array_sha256"] for s in self.field["samples"]}
        revised=self.call("spatial_field",object_id=self.frame["object_id"],previous_field_id=self.field["object_id"],
                          measurement_overrides=[{"sample_index":0,"measurement_object_ids":ids}],request_id="recover-spatial-field",**self.options)
        self.assertEqual(revised["new_fft_count"],0);self.assertEqual(revised["reused_fft_count"],8)
        self.assertEqual({s["fft_object_id"]:s["fft_array_sha256"] for s in revised["samples"]},old_hashes)
        self.assertEqual(revised["samples"][0]["measurement_object_ids"],ids)
        for a,b in zip(self.field["samples"][1:],revised["samples"][1:]):self.assertEqual(a["measurement_object_ids"],b["measurement_object_ids"])
        count=len(list(self.workspace.glob("objects/*")))
        recovered=self.call("result",query_request_id="recover-spatial-field")
        self.assertEqual(recovered["object_id"],revised["object_id"])
        self.assertEqual(len(list(self.workspace.glob("objects/*"))),count)
        conflict=self.call("spatial_field",ok=False,object_id=self.frame["object_id"],request_id="recover-spatial-field",**self.options)
        self.assertEqual(conflict["error"]["code"],"REQUEST_CONFLICT")

    def test_physical_signed_vectors_and_unknown_calibration(self):
        physical=self.call("spatial_field",object_id=self.calibrated["object_id"],**{**self.options,"window_sizes":[64],"coordinate_domain":"physical"})
        self.assertEqual(physical["coordinate_unit"],"cycles/nm")
        expected={(10/64/.02,0.),(0.,10/64/-.03)}
        # Canonical antipodal representative changes the signed negative y.
        vectors={tuple(f["vector_xy"]) for f in physical["samples"][0]["features"]["families"]}
        self.assertEqual(vectors,{(abs(a),abs(b)) for a,b in expected})
        missing=self.call("spatial_field",object_id=self.frame["object_id"],**{**self.options,"window_sizes":[64],"coordinate_domain":"physical"})
        self.assertTrue(all(not s["validity_mask"]["reciprocal_vectors"] and s["features"]["shortest_period"] is None for s in missing["samples"]))

    def test_saved_dependency_tampering_is_rejected(self):
        target=self.workspace/"objects"/self.field["batches"][0]["atlas_object_id"] /"atlas-observations.json"
        original=target.read_bytes()
        try:
            target.write_bytes(b'{}\n')
            result=self.call("get",ok=False,object_id=self.field["object_id"])
            self.assertEqual(result["error"]["code"],"CORRUPT_OBJECT")
        finally:target.write_bytes(original)

    def test_phase_translation_assignment_and_support_gaps_are_not_phase_boundaries(self):
        # Finite opposite vectors are invariant to phase translation; no rank
        # labels participate in the existing antipodal assignment.
        left={"families":[{"family_id":"anything","vector_xy":[.1,.2],"measurement_object_ids":["a"]},{"family_id":"other","vector_xy":[.2,-.1],"measurement_object_ids":["b"]}],"quality":{"detection_truncated":False}}
        right=copy.deepcopy(left);right["families"].reverse()
        self.assertEqual(domains.comparison.compare_families(left,right,[0],1e-10)["status"],"compatible_signature")
        # Explicit mask semantics: unsampled region and unusable support stay
        # unknown; this is not interpolation of a candidate material label.
        s=[{"rect_xyxy":[0,0,4,4],"status":"valid"},{"rect_xyxy":[2,0,6,4],"status":"ambiguous"}]
        coverage,unknown=domains._supports(s,(4,8))
        self.assertEqual(int(coverage.sum()),24)
        self.assertTrue(np.all(unknown[:,2:]==1));self.assertTrue(np.all(unknown[:,:2]==0))

    def test_finite_cross_scale_geometry_masks_coarse_partial_superposition(self):
        # Pure geometry unit: explicitly supplied wave vectors with independent
        # analytic truth. It is not a fake saved provider or an FFT acceptance.
        left=copy.deepcopy(self.field["samples"][0]);right=copy.deepcopy(self.field["samples"][2])
        left.update(sample_index=0,grid_xy=[0,0],rect_xyxy=[0,0,64,64])
        right.update(sample_index=1,grid_xy=[1,0],rect_xyxy=[64,0,128,64])
        large=copy.deepcopy(left)
        large.update(sample_index=2,scale_pixels=128,grid_xy=[0,0],rect_xyxy=[0,0,128,128],status="valid")
        families=copy.deepcopy(left["features"]["families"]+right["features"]["families"])
        for i,family in enumerate(families):family["family_id"]="union-family-%d"%i
        large["features"]["families"]=families;large["features"]["family_count"]=4
        large["quality"]["detection_truncated"]=False
        parent={**self.field,"samples":[left,right,large]}
        class ExplicitGeometry:
            def object(_,ident):return parent,Path(self.field["manifest_path"]).parent
        with patch.object(domains.feature,"preview_plan",return_value={"width":256,"height":256,"panels":[],"hotspots":[]}):
            result,_=domains._domain_result(ExplicitGeometry(),{"object_id":parent["object_id"],"angles_degrees":[0],"tolerance":1e-12,"max_size":256},worker)
        self.assertEqual(result["unknown_sample_indices"],[2])
        self.assertEqual(result["cross_scale_evidence"][0]["finer_sample_indices"],[0,1])
        self.assertNotIn(2,[i for d in result["domains"] for i in d["sample_indices"]])

    def test_unsampled_gap_does_not_connect_equal_signatures(self):
        left=copy.deepcopy(self.field["samples"][0]);right=copy.deepcopy(left)
        left.update(sample_index=0,scale_pixels=32,grid_xy=[0,0],rect_xyxy=[0,0,32,32])
        right.update(sample_index=1,scale_pixels=32,grid_xy=[1,0],rect_xyxy=[64,0,96,32])
        parent={**self.field,"samples":[left,right]}
        class ExplicitGeometry:
            def object(_,ident):return parent,Path(self.field["manifest_path"]).parent
        with patch.object(domains.feature,"preview_plan",return_value={"width":256,"height":256,"panels":[],"hotspots":[]}):
            result,_=domains._domain_result(ExplicitGeometry(),{"object_id":parent["object_id"],"angles_degrees":[0],"tolerance":1e-12,"max_size":256},worker)
        self.assertEqual(result["edges"][0]["status"],"unknown")
        self.assertIn("Unsampled gap",result["edges"][0]["orientation"]["reason"])
        self.assertEqual(len(result["domains"]),2)
        self.assertEqual(result["boundary_bands"],[])
        self.assertFalse(result["interpolated"])

    def test_revision_preflight_reserves_domain_wrapper_level(self):
        # Unit-check the exact ancestry budget, separately from real immutable
        # revision recovery above. Six predecessors allow revision seven;
        # seven predecessors must be refused before any child submission.
        plan=self.field["sampling_plan"]
        for depth,allowed in ((6,True),(7,False)):
            history={}
            for i in range(depth):
                ident=("%032x"%(i+1))
                history[ident]={"object_id":ident,"kind":"spatial_field","parent_object_id":self.frame["object_id"],
                                "sampling_plan":plan,"previous_field_id":("%032x"%i) if i else None}
            class ValidatedHistory:
                def object(_,ident):return history[ident],self.root
            request={"object_id":self.frame["object_id"],"previous_field_id":"%032x"%depth}
            with patch.object(domains.automation,"run_child",side_effect=AssertionError("No child may run in preflight")):
                if allowed:self.assertEqual(domains._previous(ValidatedHistory(),request,plan,worker)["object_id"],request["previous_field_id"])
                else:
                    with self.assertRaises(worker.WorkspaceError) as caught:domains._previous(ValidatedHistory(),request,plan,worker)
                    self.assertEqual(caught.exception.code,"BUDGET_EXCEEDED")

    def test_occupied_partial_child_is_not_adopted_or_replayed(self):
        parent_id="spatial-parent-with-conflict"
        child=domains.automation.child_request_id(parent_id,"batch-0")
        self.call("view",object_id=self.frame["object_id"],request_id=child,max_size=256)
        failed=self.call("spatial_field",ok=False,object_id=self.frame["object_id"],request_id=parent_id,**self.options)
        self.assertEqual(failed["error"]["code"],"REQUEST_CONFLICT")
        before=(len(list(self.workspace.glob("requests/*"))),len(list(self.workspace.glob("objects/*"))))
        query=self.call("result",ok=False,query_request_id=parent_id)
        self.assertFalse(query["partial_results"]["automatic_retry"])
        self.assertEqual(query["partial_results"]["inspection_error"]["code"],"CORRUPT_OBJECT")
        self.assertEqual(before,(len(list(self.workspace.glob("requests/*"))),len(list(self.workspace.glob("objects/*")))))

    def test_export_handoff_reuses_only_completed_f1a_dependency_qualification(self):
        reader=worker.Workspace(str(self.workspace),False)
        qualified,_=reader.object(self.field["object_id"])
        self.assertEqual(reader._spatial_export_snapshots[self.field["object_id"]],qualified)
        with patch.object(domains,"validate_references",side_effect=AssertionError("Do not repeat already-qualified F1a graph during provenance collection")),patch.object(reader,"object",wraps=reader.object) as normal:
            provenance=reader.export_provenance(self.field["object_id"])
        self.assertEqual(provenance["objects"][self.field["object_id"]],qualified)
        self.assertIn(self.frame["object_id"],[call.args[0] for call in normal.call_args_list],"Other provenance objects still use their ordinary full reader")
        # A new Workspace has no inherited qualification; a fresh operation
        # cannot obtain the handoff from a process-global cache or stat key.
        fresh=worker.Workspace(str(self.workspace),False)
        self.assertFalse(hasattr(fresh,"_spatial_export_snapshots"))
        output=self.root/"public-f1a-export"
        result=self.call("export",object_id=self.field["object_id"],output_dir=str(output))
        self.assertEqual((output/"spatial-field.csv").read_bytes(),Path(self.field["table_path"]).read_bytes())
        for name,digest in result["exported_files_sha256"].items():self.assertEqual(worker.sha_file(output/name),digest)

    def test_export_handoff_rereads_own_payload_and_rejects_changed_metadata_snapshot(self):
        reader=worker.Workspace(str(self.workspace),False)
        reader.object(self.field["object_id"])
        payload=Path(self.field["table_path"]);old=payload.read_bytes()
        try:
            payload.write_bytes(old+b"\n")
            with self.assertRaises(worker.WorkspaceError) as caught:reader.export_provenance(self.field["object_id"])
            self.assertEqual(caught.exception.code,"CORRUPT_OBJECT")
        finally:payload.write_bytes(old)
        manifest=Path(self.field["manifest_path"])
        journal=self.workspace/"requests"/(self.field["request_id"]+".json")
        original_manifest,original_journal=manifest.read_bytes(),journal.read_bytes()
        try:
            changed=worker.read_json(manifest);changed["costs"]["compute_seconds"]+=1
            manifest.write_bytes(worker.canonical(changed)+b"\n")
            log=worker.read_json(journal);log["response"]={"ok":True,"state":"completed","backend":worker.BACKEND,"request_id":changed["request_id"],**changed}
            log["object_manifest_sha256"]=worker.sha_file(manifest)
            journal.write_bytes(worker.canonical(log)+b"\n")
            # Own record is internally coherent, yet differs from the exact
            # dependency-qualified record, so snapshot handoff must refuse it.
            self.assertEqual(reader._object_record(self.field["object_id"])[0],changed)
            with self.assertRaises(worker.WorkspaceError) as caught:reader.export_provenance(self.field["object_id"])
            self.assertEqual(caught.exception.code,"CORRUPT_OBJECT")
            self.assertIn("changed after dependency qualification",str(caught.exception))
        finally:
            manifest.write_bytes(original_manifest);journal.write_bytes(original_journal)
        try:
            changed_log=worker.read_json(journal)
            changed_log["parameters"]["max_windows"]=31
            changed_log["parameters_sha256"]=hashlib.sha256(worker.canonical(changed_log["parameters"])).hexdigest()
            journal.write_bytes(worker.canonical(changed_log)+b"\n")
            # The unchanged response/manifest alone is insufficient: preserve
            # the exact creator journal qualified by the earlier full read.
            self.assertEqual(reader._object_record(self.field["object_id"])[0],reader._spatial_export_snapshots[self.field["object_id"]])
            with self.assertRaises(worker.WorkspaceError) as caught:reader.export_provenance(self.field["object_id"])
            self.assertEqual(caught.exception.code,"CORRUPT_OBJECT")
        finally:journal.write_bytes(original_journal)


if __name__=="__main__":unittest.main()
