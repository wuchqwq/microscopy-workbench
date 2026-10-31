"""Independent analytic evidence admission, not a diffsims execution claim."""
from copy import deepcopy
import math
from pathlib import Path
import sys
from types import SimpleNamespace
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from crystallography.general_evidence import assess_side, _overall, simulation_conditions, _receipt_journal
from crystallography.reflection_compare import compare


TRANSFORM = {"rotation_deg": 0., "scale": 1., "translation_inv_angstrom": [0., 0.],
             "flip_y": False, "basis": "Independent analytic common Cartesian projection; no fit"}
TOLERANCE = .001


def measurements(vectors):
    calibration = {"calibration_id": "a"*32, "revision": 1, "status": "active",
                   "source": "user_statement_not_independently_verified", "coordinate_domain": "real_space",
                   "xy_scale": {"x": 1., "y": -1., "unit": "angstrom"}}
    dependency = {key: calibration[key] for key in ("calibration_id", "revision", "status", "source", "coordinate_domain")}
    return [{"object_id": f"{index+1:032x}", "request_id": f"analytic-{index}", "source_object_id": "b"*32,
             "measurement_domain": "reciprocal_space", "coordinate_space": "frequency_cycles_per_pixel",
             "points": [[0., 0.], [x, -y]], "dc_reference_point_index": 0,
             "physical_vector_xy": [x, y], "physical_frequency_unit": "cycles/angstrom",
             "xy_calibration": deepcopy(calibration), "calibration_dependency": deepcopy(dependency)}
            for index, (x, y) in enumerate(vectors)]


def table(vectors, hkls=None):
    return {"reflections": {"coordinates_inv_angstrom": [[x, y, 0.] for x, y in vectors],
                            "hkl": hkls or [[index+1, 0, 0] for index in range(len(vectors))],
                            "kinematic_intensity": [1.]*len(vectors),
                            "reciprocal_convention": "cycles_per_angstrom_no_2pi",
                            "coordinates_frame": "rotated laboratory xyz; beam +z; raster columns +x, rows +y"}}


def assessment(vectors, predictions=None, **kwargs):
    observed = measurements(vectors)
    result = compare(observed, table(predictions or vectors), TRANSFORM, TOLERANCE, "real_space_fft")
    return assess_side(result, observed, TOLERANCE, **kwargs)


class GeneralEvidenceAdmission(unittest.TestCase):
    def test_bcc_110_families_are_conditionally_compatible_without_fcc_model(self):
        # Conventional BCC a=2 A along[001]:110 and1-10 have q=(.5,+/-.5).
        result = assessment([[.5, .5], [.5, -.5]])
        self.assertEqual(result["status"], "compatible")
        self.assertEqual(result["direction_evidence"]["noncollinear_direction_family_count"], 2)
        self.assertEqual(result["independent_validation"], "NOT_VALIDATED")

    def test_hcp_hexagonal_reciprocal_geometry_is_not_forced_cubic(self):
        # a1=(2,0),a2=(-1,sqrt3): inverse transpose yields these no2pi vectors.
        q = [[.5, 1/(2*math.sqrt(3))], [0., 1/math.sqrt(3)]]
        self.assertEqual(assessment(q)["status"], "compatible")

    def test_ordered_two_element_geometry_does_not_assert_chemistry_or_intensity(self):
        # CsCl conventional a=4:100 and010 reciprocal positions, irrespective
        # of atomic-scattering intensity. Actual scattering is tested separately.
        result = assessment([[.25, 0.], [0., .25]])
        self.assertEqual(result["status"], "compatible")
        self.assertFalse(result["intensity_comparison_performed"])

    def test_wrong_candidate_retains_conditional_incompatibility(self):
        result = assessment([[.25, 0.], [0., .25]], [[.3, 0.], [0., .3]])
        self.assertEqual(result["status"], "incompatible")

    def test_one_direction_friedel_and_harmonics_are_insufficient(self):
        for q in ([[.25, 0.]], [[.25, 0.], [-.25, 0.]], [[.25, 0.], [.5, 0.], [-.25, 0.]]):
            with self.subTest(vectors=q):
                result = assessment(q)
                self.assertEqual(result["status"], "insufficient_evidence")
                self.assertLess(result["direction_evidence"]["noncollinear_direction_family_count"], 2)

    def test_projection_hkl_ambiguity_does_not_become_unique_evidence(self):
        observed = measurements([[.25, 0.], [0., .25]])
        simulation = table([[.25, 0.], [0., .25], [.25, 0.]], [[1,0,0], [0,1,0], [1,0,1]])
        result = compare(observed, simulation, TRANSFORM, TOLERANCE, "real_space_fft")
        self.assertEqual(assess_side(result, observed, TOLERANCE)["status"], "insufficient_evidence")

    def test_low_quality_unknown_scale_and_missing_child_do_not_prove_a_candidate(self):
        q = [[.25, 0.], [0., .25]]
        self.assertEqual(assessment(q, quality_ready=False)["status"], "insufficient_evidence")
        self.assertEqual(assess_side(None, measurements(q), TOLERANCE, physical_ready=False)["status"], "insufficient_evidence")
        self.assertEqual(assess_side(None, measurements(q), TOLERANCE)["status"], "insufficient_evidence")

    def test_multiple_candidate_projection_matches_remain_unresolved(self):
        result = _overall([{"label":"BCC candidate", "status":"compatible"},
                           {"label":"ordered candidate", "status":"compatible"}])
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(len(result["compatible_candidate_labels"]), 2)

    def test_same_experiment_scientific_conditions_are_fixed_but_raster_display_is_not(self):
        parameters = {"voltage_kv": 200., "reciprocal_radius_inv_angstrom": 1., "max_excitation_error_inv_angstrom": .02,
                      "scattering_params": "lobato", "shape_factor": "lorentzian", "shape_factor_width": .02,
                      "minimum_intensity_relative": 1e-12, "debye_waller_factors": {}, "with_direct_beam": False,
                      "size": 64, "sigma_pixels": 1.}
        a = {"parameters": parameters}
        b = {"parameters": {**parameters, "size": 128, "sigma_pixels": 2.}}
        fixed = simulation_conditions({"a": a, "b": b})
        self.assertNotIn("size", fixed)
        self.assertEqual(fixed["voltage_kv"], 200.)
        for key, value in (("voltage_kv", 100.), ("reciprocal_radius_inv_angstrom", .8),
                           ("max_excitation_error_inv_angstrom", .01), ("scattering_params", "other")):
            with self.subTest(parameter=key):
                bad = {"parameters": {**parameters, key:value}}
                with self.assertRaisesRegex(ValueError, "identical scientific simulation"):
                    simulation_conditions({"a": a, "bad": bad})

    def test_historical_unknown_child_survives_live_journal_completion_without_replay(self):
        from crystallography.structure_tools import canonical,sha
        with tempfile.TemporaryDirectory(prefix="public-crystal-unknown-receipt-") as temporary:
            root=Path(temporary);(root/"requests").mkdir();evidence=root/"evidence";evidence.mkdir()
            parameters={"workspace":str(root),"action":"compare","request_id":"saved-child"}
            prepared={"request_id":"saved-child","state":"prepared","parameters":parameters}
            raw=canonical(prepared)+b"\n";(evidence/"unknown-child-00.json").write_bytes(raw)
            live=root/"requests/saved-child.json";live.write_bytes(raw)
            receipt={"state":"unknown","request_id":"saved-child","journal_state":"prepared",
                     "original_parameters":parameters,"journal_sha256":sha(raw),"unknown_journal_snapshot_file":"unknown-child-00.json"}
            self.assertEqual(_receipt_journal(SimpleNamespace(root=root),evidence,receipt),prepared)
            live.write_bytes(canonical({**prepared,"state":"completed","response":{"object_id":"c"*32}})+b"\n")
            before=live.read_bytes()
            self.assertEqual(_receipt_journal(SimpleNamespace(root=root),evidence,receipt),prepared)
            self.assertEqual(live.read_bytes(),before,"Historical recovery must not modify or replay the live child")


class GeneralFrozenObservationBindings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Reuse the public analytic fixture and real provider, not PNG values or
        # a mocked object table. This is metadata-binding coverage, not another
        # scattering-engine qualification or an image interpretation claim.
        from test_twin_observations import TwinObservations
        TwinObservations.setUpClass()
        cls.addClassCleanup(TwinObservations.doClassCleanups)
        cls.fixture = TwinObservations
        cls.serial = 0

    def frozen(self, atlas=None):
        from crystallography.general_evidence import _freeze_inputs
        from crystallography.twin_observations import load_domains
        cls = type(self);cls.serial += 1
        fixture = cls.fixture
        request = {"image_workspace": str(fixture.workspace), "domains": fixture.references(atlas or fixture.atlas),
                   "current_spatial_image_object_id": fixture.calibrated["object_id"]}
        evidence = load_domains(request["image_workspace"], request["domains"], request["current_spatial_image_object_id"])
        output = fixture.root / ("frozen-general-metadata-" + str(cls.serial));output.mkdir()
        receipts = _freeze_inputs(SimpleNamespace(root=fixture.root), request, output, evidence, {})
        raw = {row["original_path"]:(output/row["file"]).read_bytes() for row in receipts}
        import json
        saved = {path:json.loads(value) for path,value in raw.items()}
        return request,evidence,saved,raw

    def test_real_provider_metadata_recovers_without_reopening_the_image_workspace(self):
        from crystallography.general_evidence import _validate_frozen_observations
        request,evidence,saved,raw = self.frozen()
        _validate_frozen_observations(request,evidence,saved,raw)

    def test_changed_in_memory_points_cannot_replace_frozen_original_measurements(self):
        from crystallography.general_evidence import _validate_frozen_observations
        request,evidence,saved,raw = self.frozen()
        # All frozen manifest/journal bytes stay valid. A numerical table alone
        # cannot redefine the original measurement even if separately rehashed.
        measured = evidence["domains"][0]["measurements"][0]
        measured["points"][1][0] += .01
        scale=measured["xy_calibration"]["xy_scale"]
        measured["physical_vector_xy"] = [measured["points"][1][0]/scale["x"],measured["points"][1][1]/scale["y"]]
        with self.assertRaisesRegex(ValueError,"frozen original measurements"):
            _validate_frozen_observations(request,evidence,saved,raw)

    def test_aggregate_quality_cannot_promote_truncated_real_provider_observations(self):
        from crystallography.general_evidence import _validate_frozen_observations
        fixture = type(self).fixture
        atlas = fixture.call("spatial_atlas",object_id=fixture.calibrated["object_id"],rects=fixture.rects,
                             window="none",subtract_mean=True,max_size=256,max_peaks=2,
                             peak_options={"refinement":"none","threshold_rel":.1})
        request,evidence,saved,raw = self.frozen(atlas)
        self.assertFalse(evidence["domains"][0]["evidence_quality_ready"])
        evidence["domains"][0]["evidence_quality_ready"] = True
        evidence["domains"][0]["evidence_quality_reasons"] = []
        with self.assertRaisesRegex(ValueError,"quality was promoted"):
            _validate_frozen_observations(request,evidence,saved,raw)


if __name__ == "__main__":
    unittest.main()
