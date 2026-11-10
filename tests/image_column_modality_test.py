"""Modality admission only; zero-count fixtures need no optimizer or simulation."""
import tempfile
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import numpy as np
import tifffile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as api, image_column_model as model


class ModalityAdmission(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="s2-modality-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "images"
        self.serial = 0
        source = self.root / "zero-counts.tiff"
        tifffile.imwrite(source, np.zeros((64, 64), np.uint16), metadata=None)
        opened = self.call("open", source_path=str(source))
        self.frame = self.call("frame", object_id=opened["object_id"], frame_index=0)

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, **args):
        self.serial += 1
        request = dict(action=action, workspace=str(self.workspace), **args)
        if action not in ("get", "result"):
            request["request_id"] = "modality-%d" % self.serial
        reply = api.execute(request)
        self.assertTrue(reply["ok"], reply)
        return reply["result"]

    def arguments(self):
        return dict(object_id=self.frame["object_id"], rect=[18,18,23,23],
            reference_comparison=dict(reference_rects=[[42,42,47,47]], source_text="Explicit synthetic same-class prior"),
            geometry=dict(site_centers_xy=[[20,20],[44,44]], supplied_columns_xy=[[20,20],[44,44]],
                          sigma_pixels=1, source_text="Fixed synthetic geometry"),
            count_interpretation=dict(model="independent_poisson_counts", source_text="Synthetic original counts"))

    def test_missing_or_unsupported_modality_keeps_raw_baseline_without_fit_or_svd(self):
        with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("No fit")), \
             patch.object(model, "minimize", side_effect=AssertionError("No optimizer")), \
             patch.object(np.linalg, "svd", side_effect=AssertionError("No design analysis")):
            for modality in (None, "unknown", "idpc", "abf", "bf", "ptychography_reconstruction"):
                args = self.arguments()
                if modality is not None:
                    args["acquisition_context"] = dict(modality=modality, source_text="Explicit fixture channel")
                result = self.call("column_fit", **args)
                self.assertEqual(result["column_fit_version"], 3)
                self.assertEqual(result["raw_baseline"]["statistics"]["mean"], 0)
                self.assertEqual(result["fit_calls"], 0)
                self.assertEqual([s["status"] for s in result["sites"]], ["UNKNOWN_UNSUPPORTED_MODALITY"]*2)
                self.assertEqual(result["whole_comparison"]["failed_site_indices"], [0, 1])
                self.assertEqual(self.call("result", query_request_id=result["request_id"])["object_id"], result["object_id"])

    def test_declared_adf_passes_modality_but_zero_counts_still_abstain_without_optimizer(self):
        for modality in ("haadf", "adf"):
            args = self.arguments()
            args["acquisition_context"] = dict(modality=modality, source_text="Caller declared synthetic channel")
            with patch.object(model, "minimize", side_effect=AssertionError("No optimizer")):
                result = self.call("column_fit", **args)
                self.assertEqual(result["fit_calls"], 2)
                self.assertEqual(result["optimizer_calls"], 0)
                self.assertEqual([s["status"] for s in result["sites"]], ["UNKNOWN_ZERO_COUNTS"]*2)
                self.assertFalse(result["assumptions"]["verified"])

    def test_declared_haadf_does_not_turn_normalized_intensity_into_poisson_counts(self):
        args = self.arguments()
        args["acquisition_context"] = dict(modality="haadf", source_text="abTEM normalized expectation, no dose supplied")
        args["count_interpretation"] = dict(model="normalized_abtem_intensity", source_text="No dose or Poisson sampling model")
        with patch.object(model, "fit_linear_poisson", side_effect=AssertionError("No fit")):
            result = self.call("column_fit", **args)
            self.assertEqual(result["fit_calls"], 0)
            self.assertEqual([s["status"] for s in result["sites"]], ["UNKNOWN_UNSUPPORTED_NOISE"]*2)


if __name__ == "__main__":
    unittest.main()
