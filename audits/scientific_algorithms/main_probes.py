"""Independent A/B/F audit probes. Synthetic inputs; no production truth generator.

Run from repository: .venv/bin/python audits/scientific_algorithms/main_probes.py
Uses an exclusive output directory; it never overwrites original run evidence.
PASS means the stated numerical/limitation observation reproduced, not material accuracy.
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools import image_workspace as worker
from tools import image_peaks, image_domain_compare as compare
from tools import image_discovery_core as discovery
from tools import image_method_policy as policy


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dft(data, hann=False, subtract=False):
    """Definition of finite DFT, no FFT/fftshift/fftfreq/hanning calls."""
    a = np.array(data, dtype=float)
    if subtract:
        # Explicit arithmetic mean independent of the worker implementation.
        a -= math.fsum(a.ravel().tolist()) / a.size
    h, w = a.shape
    if hann:
        wy = .5 - .5 * np.cos(2 * np.pi * np.arange(h) / (h - 1))
        wx = .5 - .5 * np.cos(2 * np.pi * np.arange(w) / (w - 1))
        a = wy[:, None] * a * wx[None, :]
    ey = np.exp(-2j * np.pi * np.outer(np.arange(h) - h // 2, np.arange(h)) / h)
    ex = np.exp(-2j * np.pi * np.outer(np.arange(w) - w // 2, np.arange(w)) / w)
    return ey @ a @ ex.T


class Audit:
    def __init__(self, out):
        self.out = out.resolve()
        self.out.mkdir(parents=True, exist_ok=False)
        self.n = 0
        self.requests = []
        self.sources = {}
        self.rows = []

    def call(self, action, **parameters):
        self.n += 1
        req = dict(action=action, workspace=str(self.out / "workspace"),
                   request_id=f"independent-audit-{self.n}", **parameters)
        result = worker.execute(req)
        self.requests.append(dict(request=req, response=result))
        if not result["ok"]:
            raise RuntimeError(result)
        return result["result"]

    def source(self, name, data):
        p = self.out / (name + ".tiff")
        # The ordinary TIFF importer explicitly supports float32/uint16.
        tifffile.imwrite(p, np.asarray(data, dtype=np.float32), photometric="minisblack")
        self.sources[str(p)] = sha(p)
        obj = self.call("open", source_path=str(p))
        return self.call("frame", object_id=obj["object_id"], frame_index=0)

    def array(self, obj):
        return np.load(Path(obj["manifest_path"]).parent / "data.npy")

    def run(self, name, fn):
        start = time.monotonic()
        try:
            value = fn()
            row = dict(probe=name, execution="PASS", **value)
        except Exception:
            row = dict(probe=name, execution="FAIL", traceback=traceback.format_exc())
        row["elapsed_seconds"] = time.monotonic() - start
        self.rows.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
        self.save()

    def save(self):
        payload = dict(source_sha=subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                       git_tree=subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True).strip(),
                       python=platform.python_version(), platform=platform.platform(),
                       versions={x: importlib.metadata.version(x) for x in ("numpy", "scipy", "tifffile", "scikit-image")},
                       cases=self.rows, source_file_sha256=self.sources,
                       original_sources_unchanged=all(sha(p) == h for p, h in self.sources.items()),
                       request_count=len(self.requests), test_code_sha256=sha(__file__))
        (self.out / "summary.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        (self.out / "requests.json").write_text(json.dumps(self.requests, indent=2, ensure_ascii=False) + "\n")

    def fft_definition(self):
        errors = []
        for shape in ((33, 41), (32, 40)):
            y, x = np.indices(shape)
            a = 4 + 1.7 * np.cos(2*np.pi*(5.25*x/shape[1]+3.1*y/shape[0])+.3)
            full = np.pad(a, ((4, 3), (3, 2)), constant_values=-3.)
            f = self.source("dft-"+str(shape[0]), full)
            for window, sub in (("none", False), ("none", True), ("hann", False), ("hann", True)):
                obj = self.call("fft", object_id=f["object_id"], rect=[3,4,3+shape[1],4+shape[0]],
                                window=window, subtract_mean=sub, max_size=128)
                error = float(np.max(np.abs(self.array(obj)-dft(a.astype(np.float32), window=="hann", sub))))
                assert error < 2e-10
                assert obj["frequency_axes"][0]["value_at_index_zero"] == -(shape[0]//2)/shape[0]
                errors.append(dict(shape=list(shape), window=window, subtract_mean=sub, max_abs_error=error,
                                   fft_object_id=obj["object_id"], fft_sha256=obj["files_sha256"]["data.npy"]))
        return dict(classification="verified_math", independent_oracle="explicit negative-exponent finite DFT and cosine Hann formula", results=errors)

    def calibration(self):
        y,x=np.indices((64,64))
        f=self.source("metric", np.cos(2*np.pi*(5*x+3*y)/64))
        out=[]
        for sx,sy in ((.02,-.03),(-.02,.03),(.2,-.3)):
            cal=self.call("calibrate", object_id=f["object_id"], scope="image", xy_scale={"x":sx,"y":sy,"unit":"nm"}, source_text="Synthetic audit truth, no instrument claim")
            ff=self.call("fft", object_id=cal["object_id"], window="none", subtract_mean=True)
            m=self.call("measure", object_id=ff["object_id"], points=[[0.,0.],[5/64,3/64]])
            expected=[5/64/sx,3/64/sy]
            np.testing.assert_allclose(m["physical_vector_xy"], expected, atol=1e-14)
            assert abs(m["d_spacing"]-1/math.hypot(*expected)) < 1e-13
            delta=self.call("measure", object_id=ff["object_id"], points=[[1/64,1/64],[6/64,4/64]])
            assert delta["d_spacing"] is None and delta["period"] is not None
            out.append(dict(scale=[sx,sy], vector=m["physical_vector_xy"], period=m["d_spacing"],
                            angle=m["physical_angle_degrees"], expected=expected, non_dc_d_spacing=delta["d_spacing"]))
        raw=self.call("fft", object_id=f["object_id"], window="none", subtract_mean=True)
        m=self.call("measure", object_id=raw["object_id"], points=[[0.,0.],[5/64,3/64]])
        assert m["d_spacing"] is None
        return dict(classification="verified_math", results=out, missing_scale_period=m["d_spacing"],
                    limitation="Incorrect but finite user scale is accepted as an assumption; provenance does not verify metrology.")

    def peaks_and_alias(self):
        y,x=np.indices((64,64))
        a=np.cos(2*np.pi*(.625*x+.125*y))
        aliased=np.cos(2*np.pi*(-.375*x+.125*y))
        alias_error=float(np.max(np.abs(a-aliased)))
        assert alias_error < 1e-12
        f=self.source("aliased-grating",a)
        ff=self.call("fft",object_id=f["object_id"],window="none",subtract_mean=True)
        peaks=self.call("peaks",object_id=ff["object_id"],max_peaks=8,refinement="none",threshold_rel=.1)
        vectors=[p["frequency_cycles_per_pixel"] for p in peaks["peak_table"]]
        assert any(np.linalg.norm(np.array(q)-[-.375,.125])<1e-12 for q in vectors)
        windows=[]
        for n in (48,96):
            yy,xx=np.indices((n,n))
            data=np.cos(2*np.pi*(10.3/96*xx+6.2/96*yy))+0.7*np.cos(2*np.pi*(10.9/96*xx+6.2/96*yy))
            frame=self.source("mixed-"+str(n),data)
            for win in ("none","hann"):
                fft=self.call("fft",object_id=frame["object_id"],window=win,subtract_mean=True)
                p=self.call("peaks",object_id=fft["object_id"],max_peaks=12,threshold_rel=.15)
                windows.append(dict(shape=n,window=win,returned=len(p["peak_table"]),
                                    vectors=[v["frequency_cycles_per_pixel"] for v in p["peak_table"]],
                                    uncertainty=[v["localization_uncertainty_bins"] for v in p["peak_table"]]))
        impulse=np.zeros((64,64));impulse[20,25]=1
        rows,_,_=image_peaks.detect(dft(impulse),{},worker.need)
        # Direct DFT roundoff can break an exactly-flat plateau; test exact transform too.
        exact_phase=np.exp(-2j*np.pi*((x-32)*25+(y-32)*20)/64)
        exact_rows,_,_=image_peaks.detect(np.ones((64,64),dtype=np.complex128),{},worker.need)
        assert len(exact_rows)==0
        noise_rows,_,_=image_peaks.detect(dft(np.random.default_rng(801).normal(size=(64,64))),{"threshold_rel":.9},worker.need)
        return dict(classification="method_limit", alias_samples_max_error=alias_error, alias_peak_vectors=vectors,
                    true_continuous_period_pixels=1/math.hypot(.625,.125), sampled_period_pixels=1/math.hypot(-.375,.125),
                    unresolved_mixture_windows=windows, exact_flat_fft_peak_count=len(exact_rows),
                    floating_dft_impulse_peak_count=len(rows), noise_peak_count=len(noise_rows),
                    meaning="Aliasing is unidentifiable from samples alone; high relative-amplitude peaks are not lattice evidence. Finite windows mix the two analytic carriers.")

    def field_scope(self):
        y,x=np.indices((64,160))
        a=2*np.cos(2*np.pi*x/8)+np.cos(2*np.pi*y/8)
        f=self.source("same-periods",a)
        opts=dict(object_id=f["object_id"], window="none", subtract_mean=True,max_peaks=8,
                  peak_options={"threshold_rel":.1,"refinement":"none"},max_size=256)
        at=self.call("spatial_atlas",rects=[[0,0,64,64],[32,0,96,64],[96,0,160,64]],**opts)
        pixel=self.call("local_signature_compare",object_id=at["object_id"],reference_index=0,target_indices=[1,2],
                        angles_degrees=[0.],coordinate_domain="pixel",tolerance=.001)
        physical=self.call("local_signature_compare",object_id=at["object_id"],reference_index=0,target_indices=[1,2],
                           angles_degrees=[0.],coordinate_domain="physical",tolerance=.001)
        assert all(r["status"]=="compatible_signature" for r in pixel["relations"])
        assert all(r["status"]=="incompatible" for r in physical["relations"])
        # Full provider path for a known gap: no continuity may be inferred.
        sf=self.call("spatial_field",window_sizes=[64],stride_xy=[96,64],max_windows=2,coordinate_domain="pixel",**opts)
        dm=self.call("domain_map",object_id=sf["object_id"],angles_degrees=[0.],tolerance=.001,max_size=256)
        assert all(e["status"]=="unknown" for e in dm["edges"])
        return dict(classification="output_semantics_error", finding="A02", pixel_statuses=[r["status"] for r in pixel["relations"]],
                    physical_relations=physical["relations"], expected_without_scale="not_comparable/insufficient_evidence, not incompatible",
                    overlap_pixels=32*64, independence="Two overlapping or nonadjacent compatible ROIs do not prove a connected material domain",
                    gap_edges=[{k:e[k] for k in ("sample_indices","status","independence")} for e in dm["edges"]],
                    original_comparison_id=physical["object_id"])

    def contrast_false_boundary(self):
        # Same carrier positions everywhere, only transfer/amplitudes change.
        y,x=np.indices((64,128))
        amp=np.where(x<64,1.,.01)
        data=np.cos(2*np.pi*8*x/64)+np.cos(2*np.pi*8*y/64)+amp*np.cos(2*np.pi*(5*x+7*y)/64)
        f=self.source("contrast-only-change",data)
        sf=self.call("spatial_field",object_id=f["object_id"],window_sizes=[64],stride_xy=[64,64],max_windows=2,
                     coordinate_domain="pixel",window="none",subtract_mean=True,max_peaks=12,
                     peak_options={"threshold_rel":.1,"refinement":"none"},max_size=256)
        dm=self.call("domain_map",object_id=sf["object_id"],angles_degrees=[0.],tolerance=.001,max_size=256)
        counts=[s["features"]["family_count"] for s in sf["samples"]]
        assert counts==[3,2]
        assert dm["edges"][0]["status"]=="unknown"
        return dict(classification="verified_guard_with_method_limit",carrier_frequencies_unchanged=True,
                    detected_family_counts=counts, edge_status=dm["edges"][0]["status"],
                    orientation_status=dm["edges"][0]["orientation"]["status"],
                    meaning="Thresholded signature changes can reflect image transfer/amplitude, not structure; partial match remains unknown.")

    def rank_and_chain(self):
        def entry(q):
            return dict(families=[dict(family_id=str(i),vector_xy=v,measurement_object_ids=[str(i)]) for i,v in enumerate(q)],quality={"detection_truncated":False})
        near=entry([[.1,0.],[.2,1e-9]])
        rank=compare.noncollinear(near["families"])
        result=compare.compare_families(near,near,[0.],1e-10)
        assert rank and result["status"]=="compatible_signature"
        # Connected-neighbor compatibility is not transitive global compatibility.
        a=entry([[.10,0.],[0.,.17]])
        b=entry([[.108,0.],[0.,.178]])
        c=entry([[.116,0.],[0.,.186]])
        statuses=[compare.compare_families(l,r,[0.],.01)["status"] for l,r in ((a,b),(b,c),(a,c))]
        assert statuses==["compatible_signature","compatible_signature","incompatible"]
        return dict(classification="method_limit",near_collinear_angle_deg=math.degrees(math.atan2(1e-9,.2)),
                    near_collinear_status=result["status"], chain_pair_statuses=statuses,
                    meaning="Feature quality uses floating-point rank, not angular resolvability. Domain connected components establish local links only, not common orientation of every member.")

    def discovery_limits(self):
        y,x=np.indices((256,256))
        base=np.cos(2*np.pi*x/8)+np.cos(2*np.pi*y/8)+.6*np.cos(2*np.pi*(x+y)/11)
        dip=base*(1-.9*np.exp(-((x-88)**2+(y-88)**2)/(2*10**2)))
        noise=np.random.default_rng(802).normal(size=(256,256))
        blob=np.exp(-((x-128)**2+(y-128)**2)/(2*30**2))
        records=[]
        for name,data in (("constant",np.ones_like(base)),("clean",base),("amplitude_dip",dip),("noise",noise),("smooth_aperiodic_blob",blob)):
            out=discovery.propose(data,(64,),4)
            records.append(dict(name=name,quality=out["quality"],candidate_count=len(out["candidates"]),
                                rects=[c["rect"] for c in out["candidates"]], physical_conclusion=out["physical_conclusion"],stop=out["stop_reason"]))
            assert out["physical_conclusion"] is None
        assert records[0]["candidate_count"]==0 and records[3]["candidate_count"]==0
        # Affine intensity invariance checks proxy implementation, not physical validity.
        p=discovery.propose(dip,(64,),4);q=discovery.propose(-3*dip+12,(64,),4)
        np.testing.assert_allclose([r["score"] for r in p["observations"]],[r["score"] for r in q["observations"]],atol=1e-12)
        return dict(classification="method_limit",controls=records,contrast_sign_invariance=True,
                    historical_primary_benchmark="Preserve examples/discovery/primary-comparison.csv; this different formula is not its rerun and does not replace misses.")

    def method_stops(self):
        rows=[]
        for name,seed,top,info,budget,attempts in (
            ("no_evidence",[],None,{}, {},[]),
            ("unknown_request",[],None,{}, {},[{"kind":"gpa","state":"unknown","request_id":"original-unknown"}]),
            ("conflicting_topology_retained",[],{"report":{"status":"inconsistent","loop_groups":[{"status":"inconsistent"}]}},{}, {},[])):
            p=policy.propose(seed,top,info,budget,attempts)
            assert p["actions"][0]["kind"] in ("stop","request_information")
            assert not p["decision"]["material_defect_confirmed"]
            rows.append(dict(name=name,decision=p["decision"],action=p["actions"][0]))
        return dict(classification="verified_guard",results=rows,
                    comparison_scope="No new speed/success-rate benchmark; active strategy superiority remains NOT_TESTED.")

    def reciprocal_fft(self):
        y,x=np.indices((64,64));f=self.source("declared-reciprocal",np.cos(2*np.pi*x/8)+np.cos(2*np.pi*y/8))
        cal=self.call("calibrate",object_id=f["object_id"],scope="image",coordinate_domain="reciprocal_space",
                      declare_reciprocal=True,xy_scale={"x":.02,"y":-.03,"unit":"1/nm"},source_text="Synthetic scalar diffraction image declaration for negative test")
        fft=self.call("fft",object_id=cal["object_id"],window="none",subtract_mean=True)
        return dict(classification="scope_probe",input_domain="reciprocal",fft_domain=fft["array_domain"],
                    fft_object_id=fft["object_id"],calibration_domain=fft.get("xy_calibration",{}).get("coordinate_domain"),
                    physical_frequency_axes=fft.get("physical_frequency_axes"),
                    meaning="Second transform is mathematically possible but is not the spatial-image lattice FFT; downstream source-domain guards must reject crystallographic misuse.")


def main():
    p=argparse.ArgumentParser();p.add_argument("--output",type=Path,default=ROOT/"analysis/scientific-algorithms-main-r1")
    args=p.parse_args();a=Audit(args.output)
    for name in ("fft_definition","calibration","peaks_and_alias","field_scope","contrast_false_boundary","rank_and_chain","discovery_limits","method_stops","reciprocal_fft"):
        a.run(name,getattr(a,name))
    assert all(sha(path)==h for path,h in a.sources.items())
    return int(any(row["execution"]!="PASS" for row in a.rows))


if __name__=="__main__":
    raise SystemExit(main())
