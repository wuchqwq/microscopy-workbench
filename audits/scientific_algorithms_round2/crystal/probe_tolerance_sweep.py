"""Predeclared deterministic tolerance sweep over unchanged wrong-scale source.
Usage: python this.py /absolute/main/raw /absolute/controls/raw
The five bounds were fixed before executing the sweep, not tuned to its outcomes.
"""
import hashlib,json,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[3];BASE=pathlib.Path(sys.argv[1]).resolve();CONTROL=pathlib.Path(sys.argv[2]).resolve()
OUT=ROOT/'analysis'/('algorithm-audit-round2-crystal-sweep-'+time.strftime('%Y%m%d-%H%M%S'));OUT.mkdir(parents=True,exist_ok=False)
TOLERANCES=[.003,.03,.06,.061,.08]
def read(n):return json.loads(next((CONTROL/'calls').glob(f'{n:03d}-*.input.json')).read_text())
requests={'general_compare':read(14),'twin_compare':read(15)}
truth=json.loads((BASE/'analytic_truth.json').read_text())
expected=max((q[0]**2+q[1]**2)**.5 for q in truth['q_parent'])/11
report={'source':'same previously saved source, wrong-scale10pct wrappers, FFTs, measurements, candidate simulations, rotation23deg; only tolerance changes','predeclared_tolerances':TOLERANCES,'independent_true_correspondence_max_residual_inv_angstrom':expected,'rows':[]}
(OUT/'preregistration.json').write_text(json.dumps(report,indent=2)+'\n')
for action in requests:
 for j,tol in enumerate(TOLERANCES):
  req={**requests[action],'request_id':f'r2-sweep-{action}-{j:02d}','max_residual_inv_angstrom':tol}
  stem=OUT/(action+f'-{j:02d}')
  stem.with_suffix('.input.json').write_text(json.dumps(req,indent=2)+'\n')
  p=subprocess.run([sys.executable,'-B',str(ROOT/'tools/structure_worker.py')],input=json.dumps(req),capture_output=True,text=True,cwd=ROOT,timeout=180)
  stem.with_suffix('.stdout.json').write_text(p.stdout);stem.with_suffix('.stderr.txt').write_text(p.stderr)
  r=json.loads(p.stdout);assert r.get('ok'),r;r=r['result']
  row={'action':action,'tolerance':tol,'status':r['status'],'object_id':r['object_id'],'request_id':r['request_id']}
  if action=='general_compare':row['candidates']=[{'label':c['label'],'status':c['status'],'sides':[{'status':s['status'],'reason':s['reason'],'matched':len(s['matched']),'unmatched':len(s['unmatched_experimental']),'direction_family_count':s['direction_evidence']['noncollinear_direction_family_count']} for s in c['sides']]} for c in r['candidate_pairs']]
  else:row['projected_relation']=r['projected_relation']
  report['rows'].append(row);print(action,tol,r['status'],flush=True)
report['file_sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir() if p.is_file()}
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print('RETAINED',OUT,flush=True)
