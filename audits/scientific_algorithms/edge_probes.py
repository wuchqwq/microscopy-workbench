"""Supplementary independent failures and coordinate controls; immutable r1 output."""
import argparse
import math
from pathlib import Path

import numpy as np

from main_probes import Audit, ROOT, sha, worker


class Edges(Audit):
    def shifted_impulse(self):
        results=[]
        for n,x,y in ((64,0,0),(64,25,20),(63,0,0),(63,25,20)):
            a=np.zeros((n,n));a[y,x]=1.
            f=self.source(f"impulse-{n}-{x}-{y}",a)
            fft=self.call("fft",object_id=f["object_id"],window="none",subtract_mean=False)
            peaks=self.call("peaks",object_id=fft["object_id"],threshold_rel=1.,max_peaks=12,refinement="none")
            entry=dict(shape=n,position_xy=[x,y],expected_peak_count=0,
                       amplitude_peak_to_peak=float(np.ptp(np.abs(self.array(fft)))),
                       returned_peaks=len(peaks["peak_table"]),quality=peaks["peak_quality"],
                       peak_vectors=[p["frequency_cycles_per_pixel"] for p in peaks["peak_table"]],
                       fft_id=fft["object_id"],peaks_id=peaks["object_id"])
            if n==63 and x==25:
                field=self.call("spatial_field",object_id=f["object_id"],window_sizes=[63],stride_xy=[63,63],
                                max_windows=1,coordinate_domain="pixel",window="none",subtract_mean=False,
                                max_peaks=12,peak_options={"threshold_rel":1.,"refinement":"none"},max_size=256)
                entry["field_status"]=field["samples"][0]["status"]
                entry["field_family_count"]=field["samples"][0]["features"]["family_count"]
                entry["field_id"]=field["object_id"]
            results.append(entry)
        assert results[0]["returned_peaks"]==0 and results[1]["returned_peaks"]>0
        assert results[3]["returned_peaks"]==4 and results[3]["field_status"]=="valid"
        return dict(classification="numerical_error",finding="A03",results=results,
                    analytic_truth="DFT of delta at (x0,y0) is exp(-2pi i (kx*x0/Nx+ky*y0/Ny)); its magnitude is exactly one everywhere regardless of position.",
                    implication="Floating-point plateau noise becomes four peaks and a valid two-family field in the odd-size control. No crystalline periodicity exists.",
                    proposed_change="Explicit versioned numerical prominence/roundoff qualification; keep original detector results. Do not tune a scientific SNR threshold to these fixtures.",
                    test_code_sha256=sha(__file__))

    def rotations(self):
        y,x=np.indices((64,64));a=np.cos(2*np.pi*(5*x+3*y)/64+.2)
        results=[]
        for name,data,q in (("original",a,[5/64,3/64]),("x_reflected",a[:,::-1],[-5/64,3/64]),
                            ("ccw_array_rotation",np.rot90(a),[3/64,-5/64])):
            f=self.source(name,data)
            fft=self.call("fft",object_id=f["object_id"],window="none",subtract_mean=True)
            p=self.call("peaks",object_id=fft["object_id"],threshold_rel=.1,refinement="none",max_peaks=8)
            coords=[r["frequency_cycles_per_pixel"] for r in p["peak_table"]]
            assert min(math.dist(q,c) for c in coords)<1e-12
            results.append(dict(transform=name,expected=q,actual=coords))
        return dict(classification="verified_math",results=results,truth="Array b[y,x]=a[x,N-1-y] gives q_b=(q_y,-q_x); x mirror gives (-q_x,q_y).",test_code_sha256=sha(__file__))

    def reciprocal_gpa_guard(self):
        y,x=np.indices((64,64));f=self.source("reciprocal-for-gpa",np.cos(2*np.pi*x/8)+np.cos(2*np.pi*y/8))
        c=self.call("calibrate",object_id=f["object_id"],scope="image",coordinate_domain="reciprocal_space",declare_reciprocal=True,
                    xy_scale={"x":.02,"y":-.03,"unit":"1/nm"},source_text="Synthetic reciprocal-domain negative control")
        fft=self.call("fft",object_id=c["object_id"],window="none",subtract_mean=True)
        self.n+=1
        req=dict(action="gpa",workspace=str(self.out/"workspace"),request_id=f"independent-audit-{self.n}",
                 object_id=fft["object_id"],g_vectors=[[.125,0.],[0.,.125]],mask_sigma=.014,reference_rect=[20,20,44,44],
                 reference_mode="fixed_g",reference_text="Intentionally inappropriate source",source_domain="real_space_lattice",
                 source_domain_text="Intentionally contrary declaration for admission test")
        result=worker.execute(req);self.requests.append(dict(request=req,response=result))
        assert not result["ok"] and result["error"]["code"]=="UNSUPPORTED_OPERATION"
        # The selected reciprocal calibration can reject at the first FFT-domain
        # guard, before the more specific parent diffraction-image guard.
        assert "real-image external FFT" in result["error"]["message"] or "diffraction-intensity" in result["error"]["message"]
        return dict(classification="verified_guard",response=result,test_code_sha256=sha(__file__))


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--output",type=Path,default=ROOT/"analysis/scientific-algorithms-edge-r1")
    a=Edges(parser.parse_args().output)
    for name in ("shifted_impulse","rotations","reciprocal_gpa_guard"):
        a.run(name,getattr(a,name))
    raise SystemExit(int(any(row["execution"]!="PASS" for row in a.rows)))
