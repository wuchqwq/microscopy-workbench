"""Opt-in scientific support contact, with immutable legacy-map readback.

Pure rectangle/vector fixtures are independent geometry checks, not provider
qualification. The separate real-worker fixture uses actual TIFF/FFT records.
"""
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


class ContactGeometry(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="public-domain-contact-geometry-")
        self.directory=Path(self.temp.name)
        (self.directory/"object.json").write_bytes(b"{}\n")

    def tearDown(self):self.temp.cleanup()

    def sample(self,index,rect,scale=32,status="valid",vectors=((.125,0.),(0.,.125))):
        return {"sample_index":index,"scale_pixels":scale,"grid_xy":[index,0],"rect_xyxy":rect,
                "status":status,"features":{"families":[{"family_id":str(i),"vector_xy":list(v),"measurement_object_ids":[]} for i,v in enumerate(vectors)]},
                "quality":{"detection_truncated":False}}

    def result(self,samples,policy=domains.CONTACT_NEIGHBORS):
        parent={"object_id":"a"*32,"kind":"field_extend","samples":samples,"sampling_plan":{},
                "source_context":{"shape_yx":[128,128]},"coordinate_domain":"pixel","coordinate_unit":"cycles/pixel",
                "period_unit":"pixel","overview_object_id":"b"*32,"coverage":{}}
        class GeometryOnly:
            def object(_,ident):return parent,self.directory
        request={"object_id":parent["object_id"],"angles_degrees":[0],"tolerance":1e-12,"max_size":256,"neighbor_policy":policy}
        with patch.object(domains.feature,"preview_plan",return_value={"width":256,"height":256,"panels":[],"hotspots":[]}):
            return domains._domain_result(GeometryOnly(),request,worker)[0]

    def test_offset_shared_edge_and_overlap_connect_without_center_alignment(self):
        for right,relation,area,edge in (([32,8,64,40],"shared_edge",0,24),([16,8,48,40],"overlap",384,0)):
            samples=[self.sample(0,[0,0,32,32]),self.sample(1,right)]
            self.assertEqual(self.result(samples,domains.LEGACY_NEIGHBORS)["edges"],[])
            result=self.result(samples)
            self.assertEqual(result["neighbor_policy"],domains.CONTACT_NEIGHBORS)
            self.assertEqual(len(result["domains"]),1)
            contact=result["edges"][0]
            self.assertEqual((contact["support_relation"],contact["overlap_area_pixels"],contact["shared_edge_pixels"]),(relation,area,edge))
            self.assertEqual(contact["status"],"compatible")
            self.assertIn("correlated",contact["independence"])

    def test_corner_and_other_scale_do_not_connect_and_gaps_stay_unknown(self):
        for right,scale in (([32,32,64,64],32),([32,0,48,16],16)):
            result=self.result([self.sample(0,[0,0,32,32]),self.sample(1,right,scale)])
            self.assertEqual(result["edges"],[]);self.assertEqual(len(result["domains"]),2)
        gap=self.result([self.sample(0,[0,0,32,32]),self.sample(1,[40,0,72,32])])
        self.assertEqual(gap["edges"][0]["status"],"unknown")
        self.assertEqual(gap["edges"][0]["support_relation"],"gap_unknown")
        self.assertEqual(gap["boundary_bands"],[]);self.assertEqual(len(gap["domains"]),2)

    def test_masked_and_partial_evidence_stay_unknown_but_different_support_is_a_band(self):
        for target in (self.sample(1,[32,8,64,40],status="ambiguous"),
                       self.sample(1,[32,8,64,40],vectors=((.125,0.),))):
            result=self.result([self.sample(0,[0,0,32,32]),target])
            self.assertEqual(result["edges"][0]["status"],"unknown")
            self.assertEqual(result["boundary_bands"],[])
        result=self.result([self.sample(0,[0,0,32,32]),self.sample(1,[32,8,64,40],vectors=((.2,.05),(.05,-.2)))])
        self.assertEqual(result["edges"][0]["status"],"different")
        self.assertEqual(result["boundary_bands"][0]["rect_xyxy"],[0,0,64,40])
        self.assertIsNone(result["boundary_bands"][0]["localization_uncertainty"])


class RealWorkerCompatibility(unittest.TestCase):
    def test_default_f1a_and_f4_maps_remain_readable_without_science_changes(self):
        with tempfile.TemporaryDirectory(prefix="public-domain-contact-worker-") as temp:
            root=Path(temp);workspace=root/"workspace";n=0
            y,x=np.indices((64,96))
            values=(np.cos(2*np.pi*x/8+.3)+.8*np.cos(2*np.pi*y/8-.2)).astype(np.float32)
            source=root/"public-contact-cosines.tiff";tifffile.imwrite(source,values,photometric="minisblack")
            source_hash=worker.sha_file(source)
            def call(action,**parameters):
                nonlocal n
                n+=1;request={"action":action,"workspace":str(workspace),**parameters}
                if action not in ("get","result"):request["request_id"]="contact-worker-%d"%n
                response=worker.execute(request)
                self.assertTrue(response["ok"],response)
                return response["result"]
            frame=call("frame",object_id=call("open",source_path=str(source))["object_id"],frame_index=0)
            field=call("spatial_field",object_id=frame["object_id"],rect=[0,0,32,32],window_sizes=[32],stride_xy=[32,32],max_windows=1,
                       coordinate_domain="pixel",window="none",subtract_mean=True,max_peaks=8,max_size=256,
                       peak_options={"threshold_rel":.15,"refinement":"none"})
            initial=call("domain_map",object_id=field["object_id"],angles_degrees=[0],tolerance=.003,max_size=256)
            extended=call("field_extend",object_id=field["object_id"],rects=[[32,8,64,40]],source_text="Public synthetic offset support")
            legacy=call("domain_map",object_id=extended["object_id"],angles_degrees=[0],tolerance=.003,max_size=256)
            saved={p:worker.sha_file(p) for row in (initial,legacy) for p in Path(row["manifest_path"]).parent.iterdir() if p.is_file()}
            arrays={p:worker.sha_file(p) for p in workspace.glob("objects/*/data.npy")}
            fft_count=sum(json.loads(p.read_text(encoding="utf-8"))["kind"]=="fft" for p in workspace.glob("objects/*/object.json"))
            contact=call("domain_map",object_id=extended["object_id"],angles_degrees=[0],tolerance=.003,max_size=256,neighbor_policy=domains.CONTACT_NEIGHBORS)
            self.assertEqual(legacy["edges"],[])
            self.assertEqual(contact["edges"][0]["support_relation"],"shared_edge")
            self.assertEqual(contact["edges"][0]["status"],"compatible")
            for old in (initial,legacy):
                reread=call("get",object_id=old["object_id"])
                self.assertEqual(reread["edges"],old["edges"])
                self.assertNotIn("neighbor_policy",reread)
                self.assertEqual(reread["algorithm_version"],domains.ALGORITHM)
            self.assertEqual(call("get",object_id=contact["object_id"])["edges"],contact["edges"])
            self.assertTrue(all(worker.sha_file(path)==digest for path,digest in {**saved,**arrays}.items()))
            self.assertEqual(worker.sha_file(source),source_hash)
            self.assertEqual(sum(json.loads(p.read_text(encoding="utf-8"))["kind"]=="fft" for p in workspace.glob("objects/*/object.json")),fft_count)


if __name__=="__main__":unittest.main()
