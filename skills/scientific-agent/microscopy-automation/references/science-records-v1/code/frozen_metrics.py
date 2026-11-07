"""Truth-side metrics. No Gaussian coefficients are physical truth."""
import math


def stability_gate(base, refined, threshold=0.1):
    if threshold != 0.1:
        raise ValueError("Historical 10% threshold must remain frozen")
    if not math.isfinite(base) or not math.isfinite(refined):raise ValueError('Nonfinite numerical gate effect')
    ratio = abs(refined-base)/max(abs(base), 1e-12)
    return dict(base_effect=float(base), refined_effect=float(refined),
                relative_change=float(ratio), sign_stable=base*refined > 0,
                gate_pass=abs(base) > 1e-12 and base*refined > 0 and ratio <= threshold)


def summarize_sites(truth, raw, fitted, statuses, request_flags=None):
    n = len(truth)
    if not n or not all(len(x) == n for x in (raw, fitted, statuses)):
        raise ValueError("Every preregistered site must be present")
    if not all(math.isfinite(x) for x in [*truth, *raw]):
        raise ValueError("Unavailable/nonfinite raw or truth is a fatal evidence failure")
    if request_flags is None: request_flags=[s != 'NOT_REQUESTED_ROUTE_S0' for s in statuses]
    if len(request_flags)!=n or any(type(x) is not bool for x in request_flags):
        raise ValueError('Exact audited actual S2 request flags required')
    for s,requested,value in zip(statuses,request_flags,fitted):
        if s=='CONDITIONAL_POINT_ESTIMATE' and (not requested or value is None or not math.isfinite(value)):
            raise ValueError('Accepted S2 requires actual request and finite original-journal value')
        if s=='NOT_REQUESTED_ROUTE_S0' and requested:
            raise ValueError('Requested S2 cannot be relabelled as not requested')
    accepted = [s == "CONDITIONAL_POINT_ESTIMATE" and v is not None and math.isfinite(v)
                for s, v in zip(statuses, fitted)]
    selected = [v if good else r for v, r, good in zip(fitted, raw, accepted)]

    def error(estimate, subset=None):
        indices = list(range(n)) if subset is None else subset
        e = [estimate[i]-truth[i] for i in indices]
        return dict(n=len(e), signed_errors=e, absolute_errors=[abs(x) for x in e],
                    mae=sum(abs(x) for x in e)/len(e) if e else None,
                    rmse=math.sqrt(sum(x*x for x in e)/len(e)) if e else None)

    subset = [i for i, good in enumerate(accepted) if good]
    unknowns = [{"site":i, "status":s if s != "CONDITIONAL_POINT_ESTIMATE" else "UNKNOWN_INVALID_ACCEPTED_VALUE"}
                for i, (s, good) in enumerate(zip(statuses, accepted)) if not good and s != "NOT_REQUESTED_ROUTE_S0"]
    s0, hybrid = error(raw), error(selected)
    return dict(sites=n, accepted=len(subset), coverage=len(subset)/n,
                requested=sum(request_flags),
                not_requested=sum(not x for x in request_flags),
                unknowns=unknowns, s0=s0, hybrid=hybrid,
                conditional_s2=error(fitted, subset), s0_on_accepted_subset=error(raw, subset),
                hybrid_minus_s0_mae=hybrid["mae"]-s0["mae"],
                physical_classification="UNKNOWN", occupancy_truth="UNDEFINED_NOT_SCORED")
