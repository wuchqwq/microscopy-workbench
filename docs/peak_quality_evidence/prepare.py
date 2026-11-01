import json,hashlib,subprocess
from pathlib import Path
out=Path(__file__).parent
base=Path('/Volumes/External SSD/mircograph/fft-controlled-noise-20261102/analysis/controlled-noise')
raw=[json.loads(x) for x in (base/'raw-v3/raw.jsonl').read_text().splitlines()]
saved=[json.loads(x) for x in (base/'public-subset-r2/results.jsonl').read_text().splitlines()]
def choose(case,window='hann'):
 return next(x for x in raw if x.get('case')==case and x.get('seed')==100 and x['window']==window and x['refinement']=='quadratic' and x.get('roi_xyxy')==[0,0,128,128])
def obs(case,window='hann'):
 r=choose(case,window)
 return {k:r[k] for k in ['roi_xyxy','window','subtract_mean','refinement','parameters']}|{'peak_table':r['diagnostic_peaks'],'peak_quality':r['diagnostic_quality'],'calibration':None,'source_ref':'image-A'}
a=obs('weak'); b=obs('near_doublet'); c=[obs('off_bin','hann'),obs('off_bin','none')]
d=next(x for x in saved if x.get('case')=='two' and x.get('seed')==100 and x['window']=='hann' and x['refinement']=='quadratic')
def scrub(x):
 if isinstance(x,dict):return {k:scrub(v) for k,v in x.items() if 'object_id' not in k and 'measurement_id' not in k}
 if isinstance(x,list):return [scrub(v) for v in x]
 return x
packet={'instructions':'For each case, return a concise Chinese report plus proposed_calls (do not execute calls). Use only supplied observations; case identifiers are arbitrary. These are snapshot tasks, not a request to inspect other files or find fixture provenance.',
 'cases':[
 {'id':'A','request':'请给出这块ROI可报告的周期和方向，说明能否给出物理间距、SNR、定位误差，并提出仍可讨论的解释。','observations':a},
 {'id':'B','request':'有人提出单一周期，也有人提出两个很近的周期。请比较这两种解释，说明精化坐标能解决什么，选择至多一个后续图像分析动作。','observations':b},
 {'id':'C','request':'同一图像同一ROI得到下面两个处理结果。请总结证据强度和差别。','observations':c},
 {'id':'D','request':'请解释这个结构特征结果，说明它支持什么材料结论。','observations':{'source_ref':'image-D','status':d['public_status'],'features':scrub(d['public_features']),'invalid_reasons':d['public_invalid_reasons'],'measurements':scrub(d['public_measurements']),'peak_observation':obs('two')}},
 {'id':'E','request':'前一次操作超时了，请继续把结果接回工作台。','observations':{'operation':'image_spatial_atlas','request_id':'req-pending-01','transport':'timeout','outcome':'unknown','known_result_object_id':None,'advertised_tools':{'image_result':{'request_id':'string'},'image_info':{'object_id':'string'},'image_spatial_atlas':{'request_id':'string','object_id':'string','rects':'array'}}}}
 ]}
(out/'packet.json').write_text(json.dumps(packet,ensure_ascii=False,indent=2)+'\n')
oldroot=Path('/Volumes/External SSD/mircograph/fft-dc-contrast-fix-20261102')
paths=['skills/scientific-agent/microscopy-automation/SKILL.md','skills/scientific-agent/microscopy-automation/references/automation-scope.md']
(out/'baseline-guidance.md').write_text('\n\n'.join((oldroot/p).read_text() for p in paths))
newpaths=paths+['skills/scientific-agent/microscopy-automation/references/peak-quality.md']
(out/'updated-guidance.md').write_text('\n\n'.join(Path(p).read_text() for p in newpaths))
rubric={'evaluation':'Root manual semantic review; 5 cases, two fresh agents, same model. No repeat until preferred outcome. Not a reliability estimate or live tool execution.',
 'rules':{'A':['pixel-domain reporting continues','no invented physical calibration/SNR/probability/localization interval','candidate discussion remains possible'],
 'B':['sub-bin localization not proof of two-peak resolution','retain unresolved alternative','no ground-truth frequency recovery claim'],
 'C':['same-image contrast called correlated sensitivity, not independent experiments','differences and processing cost retained'],
 'D':['numerical valid not material confirmation','finite image-geometry candidate scope'],
 'E':['query original request_id','no new side-effect request or invented result']},
 'hidden_mapping':{'A':'weak_poisson_d500_seed100','B':'near_doublet_poisson_d500_seed100','C':'off_bin_poisson_d500_seed100','D':'two_poisson_d500_seed100','E':'synthetic timeout snapshot; not actual provider execution'},
 'sources':{'raw':hashlib.sha256((base/'raw-v3/raw.jsonl').read_bytes()).hexdigest(),'saved':hashlib.sha256((base/'public-subset-r2/results.jsonl').read_bytes()).hexdigest()},
 'exclusion':'No source filenames, seeds, scene truth or grading rubric are supplied to either evaluated agent. IDs aliased only in snapshot evidence.'}
(out/'rubric-private.json').write_text(json.dumps(rubric,ensure_ascii=False,indent=2)+'\n')
(out/'frozen-input-hashes.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.name in ['packet.json','baseline-guidance.md','updated-guidance.md','rubric-private.json']},indent=2)+'\n')
