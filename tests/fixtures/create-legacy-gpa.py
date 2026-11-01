"""Generate a genuine old saved GPA fixture, using the supplied frozen source.

The new implementation never writes or removes an assessment to fake history.
CLI: old-source-directory new-output-directory. Synthetic data only.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import tifffile

repo, root = map(lambda p: Path(p).resolve(), sys.argv[1:])
assert not root.exists()
root.mkdir()
sys.path.insert(0, str(repo))
from tools import image_workspace as worker

counter = 0
requests = []
def call(action, **args):
    global counter
    counter += 1
    request = dict(action=action, workspace=str(root/'images'), request_id=f'legacy-gpa-{counter}', **args)
    reply = worker.execute(request)
    requests.append(dict(request=request, response=reply))
    assert reply['ok'], reply
    return reply['result']

y, x = np.indices((256, 256))
pixels = (2 + np.cos(2*np.pi*x/8) + .7*np.cos(2*np.pi*y/8)).astype('float32')
source = root/'synthetic.tiff'
tifffile.imwrite(source, pixels, metadata=None)
opened = call('open', source_path=str(source))
frame = call('frame', object_id=opened['object_id'], frame_index=0)
fft = call('fft', object_id=frame['object_id'], window='none', subtract_mean=True)
gpa = call('gpa', object_id=fft['object_id'], source_domain='real_space_lattice',
           source_domain_text='Synthetic isolated unstrained carriers; history fixture only',
           g_vectors=[[.125, 0], [0, .125]], mask_sigma=.018, reference_rect=[92, 92, 116, 116],
           reference_mode='fixed_g', reference_text='Analytic carrier translation gauge')
view = call('gpa_view', object_id=gpa['object_id'], component='exx', max_size=512)
read = call('gpa_read', object_id=gpa['object_id'], points=[[128, 128]])
for saved in (gpa, view, read):
    assert 'evidence_assessment' not in saved
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
report = dict(source_repo=str(repo), source_sha=subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip(),
              source_modules={name:sha(repo/name) for name in ['tools/image_workspace.py', 'tools/image_gpa.py', 'tools/image_gpa_core.py']},
              synthetic_source_sha256=sha(source), requests=requests,
              original_files_sha256={str(p.relative_to(root/'images')):sha(p) for p in (root/'images').rglob('*') if p.is_file()})
(root/'legacy-producer.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(dict(result='PASS', calls=counter, legacy_gpa=gpa['object_id'], source_sha=report['source_sha'])))
