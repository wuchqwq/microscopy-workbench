"""Public synthetic actual worker chains; no browser/model/scientific certification."""
import copy
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import tifffile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker


class ResumableObservation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="resumable-observation-")
        cls.root = Path(cls.tmp.name)
        cls.workspace = cls.root / "images"
        cls.source = cls.root / "public.tiff"
        tifffile.imwrite(cls.source, np.arange(64*64, dtype=np.float32).reshape(64,64), metadata=None)
        cls.serial = 0
        cls.opened = cls.call("open", source_path=str(cls.source))
        cls.frame = cls.call("frame", object_id=cls.opened["object_id"], frame_index=0)
        cls.view = cls.call("view", object_id=cls.frame["object_id"], max_size=128)
        cls.input = dict(kind="rectangle",status="hypothesized",coordinates=[8,8,40,40],
                         coordinate_space="source_pixels",source_object_id=cls.frame["object_id"],
                         annotation_id="explicit-roi",purpose="resumable_observation",
                         selection_origin="agent",note="Inspect this supplied support; physical cause remains unknown")
        cls.saved = cls.call("annotate", object_id=cls.view["object_id"], annotations=[cls.input])
        cls.protected = {p:p.read_bytes() for p in cls.root.rglob("*") if p.is_file()}

    @classmethod
    def tearDownClass(cls):
        try:
            for p, raw in cls.protected.items():
                assert p.read_bytes() == raw, str(p)
        finally:
            cls.tmp.cleanup()

    @classmethod
    def execute(cls, action, **kwargs):
        cls.serial += 1
        request = dict(action=action,workspace=str(cls.workspace),**kwargs)
        if action not in ("get","result"):
            request["request_id"] = "intent-test-%d" % cls.serial
        return worker.execute(request)

    @classmethod
    def call(cls, action, **kwargs):
        response = cls.execute(action, **kwargs)
        if not response.get("ok"):
            raise AssertionError(response)
        return response["result"]

    def mark(self, record):
        return record["annotations"][0]

    def edit(self, **kwargs):
        return self.call("annotate",object_id=self.saved["object_id"],updates=[dict(annotation_id="explicit-roi",**kwargs)])

    def test_saved_intent_is_caller_reported_and_recoverable(self):
        for record in (self.saved,self.call("get",object_id=self.saved["object_id"]),
                       self.call("result",query_request_id=self.saved["request_id"])):
            mark=self.mark(record)
            self.assertEqual(mark["purpose"],"resumable_observation")
            self.assertEqual(mark["observation_contract_version"],1)
            self.assertEqual(mark["selection_origin"],"agent")
            self.assertEqual(mark["selection_origin_basis"],"caller_reported_not_authenticated")
            self.assertEqual(mark["status"],"hypothesized")

    def test_missing_id_actor_and_invalid_actor_are_not_saved(self):
        for change in ({"annotation_id":None},{"selection_origin":None},{"selection_origin":"authenticated_agent"}):
            mark={**self.input,**change}
            if change.get("annotation_id",1) is None: mark.pop("annotation_id")
            if change.get("selection_origin",1) is None: mark.pop("selection_origin")
            before=set((self.workspace/"objects").glob("*/object.json"))
            response=self.execute("annotate",object_id=self.view["object_id"],annotations=[mark])
            self.assertFalse(response["ok"],response)
            self.assertEqual(set((self.workspace/"objects").glob("*/object.json")),before)

    def test_note_limit_is_utf16_units_not_codepoints(self):
        for note in ("x"*999,"x"*1000,"😀"*500):
            record=self.call("annotate",object_id=self.view["object_id"],annotations=[{**self.input,"note":note}])
            self.assertEqual(self.mark(record)["note"],note)
        for note,length in (("x"*1001,1001),("😀"*501,1002)):
            response=self.execute("annotate",object_id=self.view["object_id"],annotations=[{**self.input,"note":note}])
            self.assertFalse(response["ok"])
            self.assertIn("actual_length=%d"%length,response["error"]["message"])
            self.assertIn("limit=1000 UTF-16",response["error"]["message"])

    def test_layout_and_preview_preserve_original_selection(self):
        for record in (self.edit(color="orange"),self.edit(text="Renamed display label"),
                       self.edit(presentation={"label":{"offset":[2,3]}}),
                       self.call("view",object_id=self.saved["object_id"],gamma=1.4,max_size=256)):
            mark=self.mark(record)
            self.assertEqual(mark["selection_origin"],"agent")
            self.assertEqual(mark["anchor"],self.mark(self.saved)["anchor"])
            self.assertEqual(mark["note"],self.input["note"])
            self.assertEqual(mark["observation_contract_version"],1)

    def test_scientific_revision_without_actor_is_unspecified(self):
        for record in (self.edit(coordinates=[9,8,41,40]),self.edit(note="A revised scientific observation")):
            self.assertEqual(self.mark(record)["selection_origin"],"unspecified")
        same=self.edit(note=self.input["note"])
        self.assertEqual(self.mark(same)["selection_origin"],"agent")
        explicit=self.edit(coordinates=[9,8,41,40],selection_origin="researcher")
        self.assertEqual(self.mark(explicit)["selection_origin"],"researcher")

    def test_sparse_and_replacement_inherit_intent_not_actor(self):
        replacement={k:v for k,v in self.input.items() if k not in ("purpose","selection_origin")}
        revised=self.call("annotate",object_id=self.saved["object_id"],annotations=[{**replacement,"note":"Revised with omitted actor"}])
        self.assertEqual(self.mark(revised)["purpose"],"resumable_observation")
        self.assertEqual(self.mark(revised)["selection_origin"],"unspecified")
        legacy=self.call("annotate",object_id=self.view["object_id"],annotations=[replacement])
        for key in ("purpose","selection_origin","observation_contract_version","selection_origin_basis"):
            self.assertNotIn(key,self.mark(legacy))
        upgraded=self.call("annotate",object_id=legacy["object_id"],updates=[dict(annotation_id="explicit-roi",purpose="resumable_observation",selection_origin="unspecified")])
        self.assertEqual(self.mark(upgraded)["selection_origin"],"unspecified")

    def test_old_anonymous_and_codepoint_budget_reproject_without_upgrading(self):
        # New worker legacy contract remains supported. Separately retained frozen-worker
        # originals are read/recovered/reprojected by the formal MCP smoke.
        old={k:v for k,v in self.input.items() if k not in ("purpose","selection_origin","annotation_id")}
        for note in ("x"*2048,"😀"*2048):
            saved=self.call("annotate",object_id=self.view["object_id"],annotations=[{**old,"note":note}])
            shown=self.call("view",object_id=saved["object_id"],gamma=1.1,max_size=128)
            self.assertEqual(self.mark(shown)["note"],note)
            for key in ("annotation_id","purpose","selection_origin","observation_contract_version"):
                self.assertNotIn(key,self.mark(shown))


if __name__ == "__main__":
    unittest.main()
