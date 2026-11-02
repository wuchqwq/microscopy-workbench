"""Test-only fresh inputs + bounded launch plans; NEVER invokes a tested Agent.
Run after code+Skills freeze. Assessor truth stays outside public/ and prompts.
"""
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
import numpy as np
import tifffile
import qualify_route_a_agent as launcher

def dump(p,v): p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--repository',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 p.add_argument('--python',required=True);p.add_argument('--codex',required=True);p.add_argument('--node',required=True)
 p.add_argument('--expected-head',required=True);p.add_argument('--model',default='gpt-6.1-sol')
 a=p.parse_args();repo=a.repository.resolve();out=a.output.resolve()
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
 if head!=a.expected_head: raise ValueError('Frozen HEAD mismatch')
 # Freeze production+Skills, allowing this uncommitted test-only helper.
 status=subprocess.check_output(['git','status','--porcelain','--','lib','python','ui','skills','tools'],cwd=repo,text=True)
 if status.strip(): raise ValueError('Production or Skills have uncommitted changes')
 out.mkdir(parents=True,exist_ok=False);(out/'public').mkdir();(out/'assessor').mkdir()
 skills={s:launcher.sha(repo/s) for s in launcher.SKILLS}
 production={s:launcher.sha(repo/s) for s in subprocess.check_output(['git','ls-files','lib','ui','skills','tools'],cwd=repo,text=True).splitlines() if (repo/s).is_file()}
 dump(out/'assessor'/'freeze.json',{'head':head,'skills':skills,'production_files_sha256':production,'model_requested':a.model,'GUI':'NOT_TESTED'})
 records=[]
 for i,label in enumerate(('u38','u81','u24')):
  # Fresh independent periods/seeds, distinct from #69's 256-pixel templates.
  seed=867031+97*i;qs=[(.0793,.0271),(-.0417,.1069)] if i!=1 else [(.0937,-.0523),(.0967,-.0509)]
  y,x=np.indices((224,240));contrast=.009 if i==1 else .19;ideal=320*(1+sum(contrast*np.cos(2*np.pi*(qx*x+qy*y)+.37*i) for qx,qy in qs))
  arr=np.random.default_rng(seed).poisson(ideal).astype('float32');source=out/'public'/(label+'.tiff')
  tifffile.imwrite(source,arr,metadata=None,photometric='minisblack')
  task={'schema_version':1,'task_id':label,'source_path':str(source),'source_sha256':launcher.sha(source),'frame_index':0,
   'question':'检查这幅公开合成图像中值得关注的局部纹理与周期性，给出有依据的有限分析、可续接记录和仍未知的部分。',
   'material_context':'公开合成图像；材料身份与物理解释未提供。','declared_calibration':None,'structure_candidates':[],'comparison_conditions':None,
   'budget':{'maximum_roi_supports':2,'maximum_distinct_ffts':3,'maximum_simulations':1,'maximum_science_calls':16}}
  dump(out/'public'/(label+'.json'),task)
  config=out/'public'/(label+'-config.json');dump(config,{'schema_version':1,'python':a.python,'workspace_root':str(out/('workspace-'+label)),'structures':False})
  records.append({'label':label,'seed':seed,'fractional_contrast':contrast,'frequencies_cycles_per_pixel':qs,'task':str(out/'public'/(label+'.json')),'config':str(config)})
 dump(out/'assessor'/'truth.json',records)
 setup=subprocess.run([a.node,str(repo/'dist/tools/prepare_resumable_blind.mjs'),str(out)],cwd=repo,check=True,capture_output=True,text=True)
 (out/'assessor'/'setup-stdout.txt').write_text(setup.stdout)
 refs=launcher.read_json(out/'public'/'handoffs.json');commands=[]
 # Actual write tools deliberately remain advertised in all three cases.
 for i,r in enumerate(records):
  entry=('image','panel','continue')[i];args=['--repository',str(repo),'--config',r['config'],'--task',r['task'],'--output',str(out/('run-'+r['label'])),'--codex',a.codex,'--node',a.node,'--model',a.model,'--timeout','900','--entry',entry,'--uncoached']
  if i: args+=['--panel-id',refs[r['label']]['panel_id']]
  if i==2: args+=['--continuation',str(out/'public'/'continuation.json')]
  commands.append([a.python,str(repo/'tools/qualify_route_a_agent.py'),*args,'--run-model'])
  # Plans are separate directories; actual runs remain unexecuted.
  dry=args.copy();dry[dry.index('--output')+1]=str(out/('plan-'+r['label']))
  launcher.main([*dry,'--dry-run'])
 dump(out/'assessor'/'run-commands.json',commands)
 print('PREPARED ONLY; inspect assessor/run-commands.json. No Agent executed.')
if __name__=='__main__':main()
