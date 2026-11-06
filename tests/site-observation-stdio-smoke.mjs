// Five predeclared scalar-answer cases through the compiled MCP. No fit/FFT.
// Preserve full inputs, responses, source hashes and original-ID restart recovery.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {StdioImageClient} from '../tools/image_panel.mjs';

const output=process.argv[2];
assert.ok(output&&path.isAbsolute(output)&&!existsSync(output),'Supply a fresh absolute evidence directory');
mkdirSync(output,{recursive:true});
const cases=[
 {name:'brighter',target:7,refs:[5,5,5],modality:'haadf',signal_kind:'stored_scalar',direction:'above_or_equal_to_all_references',next:'inspect_local_profile'},
 {name:'conflicting',target:7,refs:[2,7,11],modality:'haadf',signal_kind:'stored_scalar',direction:'references_straddle_target',next:'inspect_reference_comparability'},
 {name:'empty_expected',target:0,refs:[6,6,6],modality:'haadf',signal_kind:'raw_counts',direction:'below_or_equal_to_all_references',next:'inspect_local_profile'},
 {name:'signed_derived',target:-4,refs:[-2,-2,-2],modality:'idpc',signal_kind:'derived_scalar',direction:'below_or_equal_to_all_references',next:'inspect_local_profile'},
 {name:'unknown_channel',target:1,refs:[1,1,1],modality:'unknown',signal_kind:'unknown',direction:'equal_to_all_references',next:'request_acquisition_context'},
];
const spec={scope:'Small analytic scalar-answer transport checks, no physical STEM or calibrated significance',
 shape_yx:[72,80],rect:[24,25,31,32],refs:[[4,5,11,12],[46,8,53,15],[52,50,59,57]],expected_position_xy:[26.75,28.25],cases};
writeFileSync(path.join(output,'predeclared-cases.json'),JSON.stringify(spec,null,2)+'\n',{flag:'wx'});
const python=process.env.MICROSCOPY_PYTHON??'python';
const generated=spawnSync(python,['-B','-X','utf8','-c',
 `import json,sys,numpy as np,tifffile\nfrom pathlib import Path\np=Path(sys.argv[1]);s=json.loads((p/'predeclared-cases.json').read_text())\nfor c in s['cases']:\n a=np.full(s['shape_yx'],3,dtype=np.float32)\n for r,v in zip([s['rect'],*s['refs']],[c['target'],*c['refs']]):\n  x0,y0,x1,y1=r;a[y0:y1,x0:x1]=v\n a[28,33]=100\n tifffile.imwrite(p/(c['name']+'.tiff'),a,photometric='minisblack',metadata=None)`,output],
 {encoding:'utf8',windowsHide:true});
assert.equal(generated.status,0,generated.stderr||generated.error?.message);
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const workspace=path.join(output,'workspace');
const connect=()=>new StdioImageClient({workspace,python});
let client=connect(),serial=0;
const records=[];
const call=async(name,args={},read=false)=>{
 const parameters={...args,...(!read?{request_id:'site-loop-'+(++serial)}:{})};
 appendFileSync(path.join(output,'calls.jsonl'),JSON.stringify({phase:'before',tool:name,parameters})+'\n');
 try{
  const reply=await client.tool(name,parameters);
  appendFileSync(path.join(output,'calls.jsonl'),JSON.stringify({phase:'after',tool:name,parameters,result:reply.data})+'\n');
  if(reply.png)writeFileSync(path.join(output,'delivered-'+(parameters.request_id??name)+'-'+serial+'.png'),Buffer.from(reply.png,'base64'));
  return reply.data;
 }catch(error){appendFileSync(path.join(output,'calls.jsonl'),JSON.stringify({phase:'error',tool:name,parameters,error:String(error)})+'\n');throw error;}
};
try{
 await client.rpc('initialize');
 for(const c of cases){
  const source=path.join(output,c.name+'.tiff'),sourceHash=hash(source);
  const opened=await call('image_open',{source_path:source});
  const frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});
  const discovery=await call('image_discovery',{object_id:frame.object_id,entry:'manual',selection_origin:'agent',regions:[{rect:spec.rect,reason:'Inspect an expected location; it has not been detected'}]});
  const stats=await call('image_statistics',{object_id:frame.object_id,rect:spec.rect,reference_comparison:{reference_rects:spec.refs,source_text:'All three predeclared analytic references; not independently verified physical equivalents'}});
  const context={question:'What raw evidence supports a directional difference and what should be checked next?',statistics_id:stats.object_id,
   expected_position_xy:spec.expected_position_xy,position_source_text:'Predeclared expected coordinate; nearest bright pixel is outside the ROI',
   modality:c.modality,signal_kind:c.signal_kind,signal_source_text:'Analytic scalar fixture; raw_counts is a caller declaration, not acquisition or Poisson verification'};
  const review=await call('image_discovery_review',{object_id:discovery.object_id,candidate_id:discovery.candidates[0].candidate_id,evidence_ids:[stats.object_id],observation_text:'Compare every reference and retain unresolved causes',site_context:context});
  const site=review.site_observation;
  assert.equal(site.raw_observation.target_mean,c.target);
  assert.deepEqual(site.raw_observation.references.map(r=>r.target_minus_reference),c.refs.map(r=>c.target-r));
  assert.equal(site.comparison.direction,c.direction);assert.equal(site.next_step.kind,c.next);
  assert.deepEqual(site.context.expected_position_xy,spec.expected_position_xy);assert.equal(site.measured_position_xy,null);
  assert.equal(site.physical_conclusion,null);assert.equal(site.s2_dispatched,false);
  if(c.name==='conflicting')assert.equal(site.raw_observation.target_minus_reference_median,0);
  const exported=await call('image_export',{object_id:review.object_id,output_dir:path.join(output,'export-'+c.name)});
  assert.equal(hash(path.join(exported.output_dir,'site-observation.json')),hash(path.join(workspace,'objects',review.object_id,'site-observation.json')));
  assert.equal(hash(source),sourceHash);
  records.push({case:c.name,source_sha256:sourceHash,frame:frame.object_id,statistics:stats.object_id,
   review:review.object_id,request_id:review.request_id,site_observation:site,export:exported});
 }
 // Snapshot ALL object and request bytes before a fresh provider process reads them.
 const snapshot=()=>Object.fromEntries(['objects','requests'].flatMap(folder=>readdirSync(path.join(workspace,folder),{recursive:true,withFileTypes:true}).filter(e=>e.isFile())
  .map(e=>{const p=path.join(e.parentPath,e.name);return [path.relative(workspace,p),hash(p)];})));
 const before=snapshot();
 await client.close();client=connect();await client.rpc('initialize');
 for(const record of records){
  const recovered=await call('image_result',{request_id:record.request_id},true);
  const inspected=await call('image_info',{object_id:record.review},true);
  assert.deepEqual(recovered.site_observation,record.site_observation);assert.deepEqual(inspected.site_observation,record.site_observation);
 }
 assert.deepEqual(snapshot(),before,'Readback must not rewrite original objects/journals');
 const kinds=readdirSync(path.join(workspace,'objects')).map(id=>JSON.parse(readFileSync(path.join(workspace,'objects',id,'object.json'),'utf8')).kind);
 assert.equal(kinds.filter(k=>['fft','gpa','column_fit'].includes(k)).length,0);
 writeFileSync(path.join(output,'results.json'),JSON.stringify({status:'PASS',cases:records,restart_recovery:true,immutable_readback:true,
   scientific_calls:{fft:0,gpa:0,s2:0},physical_validation:'NOT_TESTED',human_gui:'NOT_TESTED',scope:spec.scope},null,2)+'\n',{flag:'wx'});
 console.log('PASS: five predeclared cases, complete raw reference evidence, actual MCP save/export/restart recovery, no FFT/GPA/S2.');
}catch(error){writeFileSync(path.join(output,'failure.json'),JSON.stringify({status:'FAIL',error:String(error),stack:error.stack},null,2)+'\n',{flag:'wx'});throw error;}
finally{await client.close();}
