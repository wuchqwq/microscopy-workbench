"""Read-only ROI summaries of saved fixed-g bands, not a new GPA engine."""
import numpy as np

GOAL = "peak_roi_comparison"
KEYS = {"goal", "roi_rect", "reference_rect", "reference_text"}


def information(value, api):
    api.need(set(value) <= KEYS, "Peak comparison accepts only ROI, reference rectangle and reference_text")
    for key in ("roi_rect", "reference_rect"):
        rect = value.get(key)
        api.need(type(rect) is list and len(rect) == 4 and all(type(v) is int and v >= 0 for v in rect)
                 and rect[2] > rect[0] and rect[3] > rect[1], key + " requires local half-open XYXY pixel indices")
    text = value.get("reference_text")
    api.need(type(text) is str and 1 <= len(text.strip()) <= 2000, "Describe the actual reference or explicit working assumption")
    return value


def summarize(arrays, seed, info, api):
    h, w = seed["shape_yx"]
    regions = {}
    for name in ("roi_rect", "reference_rect"):
        x0,y0,x1,y1 = info[name]
        api.need(x1 <= w and y1 <= h, name + " exceeds saved local FFT grid")
        regions[name] = (slice(y0,y1), slice(x0,x1))
    peaks = []
    for index, vector in enumerate(seed["parameters"]["g_vectors"]):
        summaries = {}
        for name, region in regions.items():
            amplitude = arrays["amplitude"][index][region]
            phase = arrays["phase_demodulated_wrapped"][index][region]
            valid = arrays["valid_phase"][index][region] & ~arrays["low_amplitude"][index][region]
            count = int(valid.sum())
            # Fixed, stated summary guards, not statistical confidence.
            enough = count >= 9 and count / valid.size >= .9
            mean = float(amplitude[valid].mean()) if count else None
            z = np.sum(amplitude[valid] * np.exp(1j*phase[valid])) if count else 0j
            weight = float(amplitude[valid].sum()) if count else 0.
            coherence = float(abs(z)/weight) if weight > 0 else 0.
            amplitude_admitted = enough and mean is not None and mean > 0
            admitted = amplitude_admitted and coherence >= .9
            summaries[name] = dict(pixel_count=int(valid.size), valid_count=count, invalid_count=int(valid.size)-count,
                low_amplitude_count=int(arrays["low_amplitude"][index][region].sum()),
                mean_band_amplitude=mean, amplitude_weighted_phase_coherence=coherence,
                circular_phase_rad=float(np.angle(z)) if admitted else None,
                amplitude_status="observed" if amplitude_admitted else "insufficient_evidence",
                status="observed" if admitted else "insufficient_evidence",
                reason=None if admitted else "insufficient_valid_support_or_incoherent_phase")
        roi, ref = summaries["roi_rect"], summaries["reference_rect"]
        admitted = all(v["status"] == "observed" for v in summaries.values())
        delta = float(np.angle(np.exp(1j*(roi["circular_phase_rad"]-ref["circular_phase_rad"])))) if admitted else None
        peaks.append(dict(band_id=seed["object_id"]+":band:"+str(index), band_index=index,
            g_cycles_per_pixel=vector, sign_convention="exact saved requested g; no conjugate reassignment",
            regions=summaries, phase_difference_wrapped_rad=delta,
            amplitude_ratio=roi["mean_band_amplitude"]/ref["mean_band_amplitude"] if all(v["amplitude_status"] == "observed" for v in summaries.values()) else None,
            status="observed" if admitted else "insufficient_evidence"))
    return dict(status="observed" if all(p["status"] == "observed" for p in peaks) else "insufficient_evidence",
        peaks=peaks, roi_rect=info["roi_rect"], reference_rect=info["reference_rect"], reference_text=info["reference_text"],
        source_dependency=seed["input_dependency"], filter_parameters=seed["parameters"],
        validity_semantics="Conservative inherited joint/two-band reference-connected GPA valid_phase AND per-band not-low-amplitude. A bad second band can suppress coverage of the first; not independent per-peak admission.",
        coordinate_convention="local FFT input grid; half-open XYXY pixel centres; shared saved demodulation gauge",
        phase_semantics="amplitude-weighted circular ROI minus reference phase, wrapped to [-pi, pi]; no unwrapping or local plane removal",
        summary_guards={"minimum_valid_pixels":9,"minimum_valid_fraction":.9,"minimum_phase_coherence":.9,"statistical_confidence":False},
        physical_strain_admitted=False, material_dislocation_confirmed=False,
        limitations=["Saved-band increment only: ingress still requires two-direction fixed_g GPA, valid filter support and reference-connected edge guards; these are adapter limits, not universal HRTEM requirements",
          "Filtered band amplitudes are not raw sinusoid amplitudes; ratios compare the same filter and band",
          "Wrapped phase changes may reflect contrast or imaging transfer, not physical displacement; no local frequency or strain inference",
          "Low-amplitude and invalid pixels are excluded explicitly; partial support can bias a regional mean; uncertainty is not calibrated"])


def propose(workspace, seeds, info, api):
    api.need(len(seeds) == 1, "Saved-band peak comparison selects exactly one fixed_g GPA record")
    seed = seeds[0]
    directory = workspace.root / "objects" / seed["object_id"]
    arrays = api.gpa._arrays(directory, seed, api)
    report = summarize(arrays, seed, info, api)
    return {"actions": [], "decision": {"status": report["status"],
        "reason": "Read-only per-peak comparison of saved bands; no science dispatch", "peak_comparison": report,
        "reused_input_cost": {"new_fft_pixels":0, "new_gpa_band_pixels":0,
            "summary_pixels":2*sum((info[k][2]-info[k][0])*(info[k][3]-info[k][1]) for k in ("roi_rect","reference_rect")),
            "semantics":"Read/summary work only, observed wall time recorded; no method-call reservation or numerical rerun"}}}


def readable(report):
    lines = ["Saved-band ROI comparison / 已保存频带ROI比较（条件性图像证据）", "Status: "+report["status"],
             "ROI: %s; reference: %s" % (report["roi_rect"], report["reference_rect"]), report["reference_text"]]
    for p in report["peaks"]:
        lines.append("Band %d, g=%s: %s; wrapped phase change=%s rad; amplitude ratio=%s" %
                     (p["band_index"], p["g_cycles_per_pixel"], p["status"], p["phase_difference_wrapped_rad"], p["amplitude_ratio"]))
    return "\n".join(lines + [report["phase_semantics"]] + report["limitations"]) + "\n"
