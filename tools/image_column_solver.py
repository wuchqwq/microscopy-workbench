"""Versioned S2 stopping configuration; likelihood and scientific gate unchanged.

Version 1 is retained only to validate original v1/v2 saved evidence.
Version 2 tightens relative objective stopping after a bounded deterministic
comparison exposed ftol termination before the independent gradient gate.
"""
HISTORICAL_SOLVER = dict(method="L-BFGS-B", maxiter=200, maxfun=800, maxls=20,
                         ftol=1e-11, gtol=1e-7, projected_gradient_limit=5e-6,
                         singular_ratio_floor=1e-10, mean_floor=1e-12)
CONFIGURATION_VERSION = 2
CONFIGURATION_ID = "fixed_geometry_s2_lbfgsb_ftol_1e-13_v2"
SOLVER = dict(HISTORICAL_SOLVER, ftol=1e-13)
