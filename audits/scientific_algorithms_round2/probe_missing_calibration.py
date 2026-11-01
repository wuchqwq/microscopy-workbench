"""Follow-up of round-one A02, same unchanged main; NOT a new defect.

Run independently. Reuses transport only, not numerical truth. Identical
integer-period image carriers analytically have identical pixel geometry;
without a length calibration their physical compatibility is unavailable.
"""
from pathlib import Path
import sys
import time

import numpy as np

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from probe_gpa_uncertainty import Audit, ROOT


def check(a):
    y,x=np.indices((64,160))
    image=2*np.cos(2*np.pi*x/8)+np.cos(2*np.pi*y/8)
    frame=a.source('same-unstrained-carriers',image)
    atlas=a.call('spatial_atlas',object_id=frame['object_id'],rects=[[0,0,64,64],[96,0,160,64]],
                 window='none',subtract_mean=True,max_peaks=8,
                 peak_options={'threshold_rel':.1,'refinement':'none'},max_size=256)
    outputs={}
    for domain in ('pixel','physical'):
        result=a.call('local_signature_compare',object_id=atlas['object_id'],reference_index=0,
                      target_indices=[1],angles_degrees=[0.],coordinate_domain=domain,tolerance=.001)
        outputs[domain]=dict(object_id=result['object_id'],relations=result['relations'],files_sha256=result['files_sha256'])
    assert outputs['pixel']['relations'][0]['status']=='compatible_signature'
    assert outputs['physical']['relations'][0]['status']=='incompatible'
    return dict(classification='confirmed_historical_A02_excessive_negative_interpretation',
                expectation='physical not_comparable / insufficient_evidence; no metric to test incompatibility',outputs=outputs)


if __name__=='__main__':
    a=Audit(ROOT/'analysis'/('algorithm-audit-round2-missing-calibration-'+str(time.time_ns())))
    a.run('missing_calibration',lambda:check(a))
    print('EVIDENCE_DIR='+str(a.out))
    sys.exit(any(r['execution']!='PASS' for r in a.rows))
