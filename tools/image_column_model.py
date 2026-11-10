"""Fixed S2 likelihood and geometry from the bounded comparison.

Source run baseline-comparison-execution-v1, research commit c9fc6bd.
Source SHA256 87c0cf265e2b663e01aea622ec4b7b032930d765ea7b45697f50bb5d9088d210.
Admission/resource guards live in image_column_fit.py before these functions.
Solver stopping configuration v2 tightens only ftol; scientific gate unchanged.
No separate two-Poisson confidence diagnostic is imported or exposed.
"""
if __package__:
    from .image_column_solver import SOLVER
else:
    from image_column_solver import SOLVER

import numpy as np
from scipy.special import ndtr, xlogy
from scipy.optimize import minimize

def gaussian_pixels(pixels, centers, sigma):
    p=np.asarray(pixels,dtype=float);c=np.asarray(centers,dtype=float)
    lo=(p[:,None,:]-.5-c[None,:,:])/sigma
    hi=(p[:,None,:]+.5-c[None,:,:])/sigma
    return np.prod(ndtr(hi)-ndtr(lo),axis=2)

def background_basis(pixels):
    p=np.asarray(pixels,dtype=float)
    lo=np.min(p,axis=0);extent=np.maximum(np.max(p,axis=0)-lo,1)
    u,v=((p-lo)/extent).T
    return np.column_stack([(1-u)*(1-v),u*(1-v),(1-u)*v,u*v])

def poisson_objective(x,A,y,scale):
    mu=np.maximum(scale*(A@x),1e-12)
    loss=float(np.sum(mu-xlogy(y,mu))/scale)
    grad=A.T@(1-y/mu)
    return loss,grad

def fit_linear_poisson(y,design,maxiter=SOLVER["maxiter"],maxfun=SOLVER["maxfun"]):
    y=np.asarray(y,dtype=float).ravel();B=np.asarray(design,dtype=float)
    if B.ndim!=2 or len(y)!=len(B) or not np.isfinite(y).all() or not np.isfinite(B).all() or np.any(y<0) or np.any(B<0):
        raise ValueError('Poisson inputs must be finite nonnegative arrays with matching rows')
    if np.sum(y)==0:
        return dict(status='UNKNOWN_ZERO_COUNTS',evaluations=0,iterations=0,mu=np.zeros_like(y),coefficients=None)
    masses=np.sum(B,axis=0)
    if np.any(masses<=0):
        return dict(status='UNKNOWN_ZERO_DESIGN_COLUMN',evaluations=0,iterations=0,mu=None,coefficients=None)
    A=B/masses
    singular=np.linalg.svd(A,compute_uv=False)
    if singular[-1]<=1e-10*singular[0]:
        return dict(status='UNKNOWN_NONIDENTIFIABLE_DESIGN',evaluations=0,iterations=0,mu=None,coefficients=None,
                    smallest_singular_ratio=float(singular[-1]/singular[0]))
    scale=max(float(np.sum(y)),1.)
    x0=np.full(A.shape[1],1/A.shape[1])
    evaluations=0
    last_x=x0.copy()
    def objective(x):
        nonlocal evaluations,last_x
        evaluations+=1;last_x=x.copy()
        if evaluations>maxfun:
            raise RuntimeError('FROZEN_EVALUATION_LIMIT')
        return poisson_objective(x,A,y,scale)
    try:
        opt=minimize(objective,x0,jac=True,method=SOLVER['method'],bounds=[(0,None)]*len(x0),
                     options=dict(maxiter=maxiter,maxfun=maxfun,maxls=SOLVER["maxls"],ftol=SOLVER["ftol"],gtol=SOLVER["gtol"]))
        x=opt.x;message=str(opt.message);success=bool(opt.success);iterations=int(opt.nit)
    except RuntimeError as e:
        if str(e)!='FROZEN_EVALUATION_LIMIT':raise
        x=last_x;message=str(e);success=False;iterations=None
    loss,gradient=poisson_objective(x,A,y,scale)
    pg=gradient.copy();pg[(x<=1e-10)&(gradient>0)]=0
    projected_gradient=float(np.max(np.abs(pg)))
    mu=np.maximum(scale*(A@x),1e-12)
    deviance=float(2*np.sum(xlogy(y,y/mu)-(y-mu)))
    converged=success and projected_gradient<=5e-6
    return dict(status='CONDITIONAL_POINT_ESTIMATE' if converged else 'UNKNOWN_NOT_CONVERGED',
                optimizer_success=success,message=message,evaluations=evaluations,iterations=iterations,
                projected_gradient=projected_gradient,deviance=deviance,
                design_condition=float(singular[0]/singular[-1]),
                coefficients=(scale*x/masses).tolist(),mu=mu,
                confidence_interval=None,physical_classification='UNKNOWN',
                limitations=['fixed supplied geometry/width','reference and model uncertainty uncalibrated',
                             'deviance is descriptive, not a chi-square p-value'])

def selected_centers(pixels,center,all_centers,sigma,method):
    """Pure geometry: retain ALL supplied neighbours meeting the mass rule."""
    center=np.asarray(center,dtype=float)
    centers=[center]
    if method=='S2':
        candidates=np.asarray(all_centers,dtype=float)
        candidates=candidates[np.linalg.norm(candidates-center,axis=1)>1e-6]
        # Frozen support rule: retain every neighbour with >=0.5% of its
        # Gaussian integral in the supplied9x9 patch. No intensity selection.
        if len(candidates):
            integrals=gaussian_pixels(pixels,candidates,sigma)
            centers.extend(candidates[np.sum(integrals,axis=0)>=.005])
    elif method!='S1':
        raise ValueError('method must be S1 or S2')
    return np.asarray(centers)
