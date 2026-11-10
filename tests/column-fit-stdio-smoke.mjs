// One actual compiled MCP stdio -> provider handoff on the same unit fixture.
// No Panel/browser, physical simulation, new noise matrix or model training.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {StdioImageClient} from '../tools/image_panel.mjs';
// Invoke the compiled test from the source checkout root, as documented.
const root=path.resolve(process.cwd());
const args=process.argv.slice(2),attempt=args[0];
if(!/^\d+$/.test(attempt??''))throw new Error('Pass a new validation attempt number');
const run=path.join(root,'outputs','conditional-s2-validation');
const workspace=path.join(run,'stdio-'+attempt),source=path.join(run,'transport-counts.tiff');
const summary=path.join(root,'docs','conditional-s2','validation','stdio-attempt-'+attempt+'.json');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const before=hash(source),started=Date.now();
let client,serial=0;
const calls=[];
const python=process.env.MICROSCOPY_PYTHON??'python';
function connect(){return new StdioImageClient({workspace,python});}
try{
 client=connect();await client.rpc('initialize');
 const call=async(name,input={})=>{calls.push(name);return (await client.tool(name,{...input,...(!['image_info','image_result'].includes(name)?{request_id:'s2-stdio-'+attempt+'-'+(++serial)}:{})})).data;};
 const opened=await call('image_open',{source_path:source});
 const frame=await call('image_frame',{object_id:opened.object_id,frame_index:0});
 const rect=[18,18,23,23],references={reference_rects:[[42,42,47,47]],source_text:'Same-class reference in the public integration fixture; caller unverified'};
 const raw=await call('image_statistics',{object_id:frame.object_id,rect,reference_comparison:references});
 const supplied=[];for(const [x,y] of [[20,20],[44,44]])for(const c of [[x,y],[x-4,y],[x+4,y],[x,y-4],[x,y+4],[x+6,y]])supplied.push(c);
 const fitted=await call('image_column_fit',{object_id:frame.object_id,rect,reference_comparison:references,
  geometry:{site_centers_xy:[[20,20],[44,44]],supplied_columns_xy:supplied,sigma_pixels:1,source_text:'Supplied public analytic fixture geometry; no center/width optimization'},
  acquisition_context:{modality:'haadf',source_text:'Declared synthetic HAADF count-model fixture; not material validation'},
  count_interpretation:{model:'independent_poisson_counts',source_text:'The exact Poisson realization reused from the bounded Python integration fixture'}});
 assert.equal(fitted.kind,'column_fit');assert.equal(fitted.fit_calls,2);assert.equal(fitted.optimizer_calls,2);
 const failed=fitted.sites.filter(site=>site.status!=='CONDITIONAL_POINT_ESTIMATE').map(site=>site.site_index);
 assert.equal(fitted.sites[0].status,'CONDITIONAL_POINT_ESTIMATE','The independent primary truth still qualifies in this bounded fixture');
 assert.deepEqual(fitted.whole_comparison.failed_site_indices,failed);
 assert.equal(fitted.whole_comparison.status,failed.length?'UNKNOWN_REQUIRED_SITE':'CONDITIONAL_POINT_ESTIMATE');
 if(failed.length){
  assert.equal(fitted.whole_comparison.central_integral_difference,null);assert.equal(fitted.whole_comparison.fitted_total_mean_difference,null);
  for(const site of fitted.sites.filter(site=>failed.includes(site.site_index)))assert.deepEqual(site.accepted,{central_integral:null,fitted_total_roi_mean:null});
 }
 assert.deepEqual(fitted.raw_baseline.statistics,raw.statistics);
 assert.deepEqual(fitted.raw_baseline.reference_comparison,raw.reference_comparison);
 const original=fitted.request_id;
 await client.close();client=connect();await client.rpc('initialize');
 const recovered=await call('image_result',{request_id:original});assert.deepEqual(recovered.sites,fitted.sites);
 const saved=await call('image_info',{object_id:fitted.object_id});assert.deepEqual(saved.whole_comparison,fitted.whole_comparison);
 const exported=await call('image_export',{object_id:fitted.object_id,output_dir:path.join(run,'export-'+attempt)});
 assert.equal(hash(path.join(run,'export-'+attempt,'column-fit.json')),hash(path.join(workspace,'objects',fitted.object_id,'column-fit.json')));
 const attention=await call('image_discovery',{object_id:frame.object_id,entry:'manual',selection_origin:'agent',regions:[{rect,reason:'Explicit fixed ROI, not a physical classification'}]});
 const review=await call('image_discovery_review',{object_id:attention.object_id,candidate_id:attention.candidates[0].candidate_id,evidence_ids:[fitted.object_id],observation_text:'Stored conditional fit with unknown physical interpretation'});
 assert.equal(review.review_is_scientific_verification,false);assert.equal(review.physical_conclusion,null);
 assert.equal(hash(source),before);
 mkdirSync(path.dirname(summary),{recursive:true});
 writeFileSync(summary,JSON.stringify({status:'PASS',seconds:(Date.now()-started)/1000,calls,fit_calls:2,optimizer_calls:2,source_sha256:before,
  fixture_scope:'Explicit transport-counts.tiff identified by source_sha256; per-site and aggregate eligibility retained; not independent material validation',
  result_kind:fitted.kind,result_id:fitted.object_id,site_statuses:fitted.sites.map(site=>site.status),whole_comparison:fitted.whole_comparison,export_sha256:hash(path.join(run,'export-'+attempt,'column-fit.json')),
  baseline_preserved:true,restart_recovery:true,review_is_verification:false,panel:'NOT_TESTED; no new Panel slot',physical_validation:'NOT_TESTED'},null,2)+'\n',{flag:'wx'});
 console.log('PASS (transport/recovery; failed references retain UNKNOWN): S0 + optional S2 -> actual MCP stdio -> restart recovery -> export -> exact-ROI review; source unchanged.');
}catch(error){
 try{writeFileSync(summary,JSON.stringify({status:'FAIL',seconds:(Date.now()-started)/1000,calls,error:String(error)},null,2)+'\n',{flag:'wx'});}catch{}
 throw error;
}finally{if(client)await client.close();}
