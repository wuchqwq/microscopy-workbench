// Real owned Panel HTTP/MCP + controlled read-only metadata; not Python numerics
// or browser acceptance. test:gpa separately exercises real saved GPA objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {projectGpaEvidence,gpaEvidenceModel,renderGpaEvidence} from '../ui/image-panel/gpa-evidence.mjs';
import {createImagePanel} from '../tools/image_panel.mjs';
import {ImagePanelManager} from '../lib/image_panel_mcp.mjs';
import {prepareOwnedPanelRegistration} from '../lib/panel_ownership.mjs';

const A='a'.repeat(32),B='b'.repeat(32),P='c'.repeat(32);
const assessment=()=>({semantics_version:1,numerical_field_status:'computed_conditional',
 material_strain_status:'insufficient_evidence',material_strain_validated:null,
 reason_codes:['single_domain_displacement_origin_not_independently_established',
  'signal_and_model_uncertainty_not_quantified','band_limited_field_cannot_exclude_out_of_band_deformation'],
 spatial_transfer:{model:'small phase, constant amplitude, isolated carrier; 1D interior derivative',
  frequency_unit:'cycles/pixel',aperture_sigma_cycles_per_pixel:[.012,.012],aperture_cutoff_cycles_per_pixel:[.036,.036],
  nominal_untruncated_gaussian_real_space_fwhm_pixels:[31,31],response_samples:[{modulation_period_pixels:32,
   phase_gain_per_reflection:[.03,.03],central_difference_gain_1d:.99,first_order_strain_gain_1d_per_reflection:[.0297,.0297]}],
  scope:'Analytic approximation, not measured resolution or uncertainty'}});
const view=()=>({object_id:A,kind:'gpa_view',gpa_object_id:B,coordinate_domain:'physical_cartesian_nm',
 material_strain_verified:false,interpretation_status:'hypothesized',evidence_assessment:assessment(),
 annotations:[],panels:[{domain:'source_array_indices',source_object_id:A,source_rect_xyxy:[0,0,32,32],image_rect_xyxy:[0,0,32,32]}],
 display:{component:'exx'}});
class Element {
 constructor(tag='section'){this.tagName=tag;this.children=[];this.textContent='';this.hidden=false;}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}
 set innerHTML(_){assert.fail('Provider text cannot become HTML');}
}
const document={createElement:tag=>new Element(tag)};
const contents=node=>[node.textContent,...node.children.map(contents)].join('\n');

test('bounded metadata copy preserves all saved assessment values, without mutating the provider',()=>{
 const value=view(),before=JSON.stringify(value),output=projectGpaEvidence(value);
 assert.deepEqual(output.evidence_assessment,value.evidence_assessment);assert.notEqual(output.evidence_assessment,value.evidence_assessment);
 assert.equal(output.material_strain_verified,false);assert.equal(output.interpretation_status,'hypothesized');assert.equal(output.gpa_object_id,B);
 assert.equal(JSON.stringify(value),before);
 output.evidence_assessment.reason_codes.push('local-copy');assert.equal(JSON.stringify(value),before);
});
test('legacy absent assessment is not backfilled and valid_tensor never grants physical validation',()=>{
 const value=view();delete value.evidence_assessment;value.valid_tensor=true;const before=JSON.stringify(value);
 assert.equal(Object.hasOwn(projectGpaEvidence(value),'evidence_assessment'),false);
 const model=gpaEvidenceModel(value);assert.equal(model.status,'not_recorded');assert.equal(model.assessment,undefined);
 const host=new Element();renderGpaEvidence(host,value,document);assert.match(contents(host),/未记录/);assert.match(contents(host),/不能从 valid_tensor/);
 assert.equal(JSON.stringify(value),before);
});
test('conditional numerical, unverified material and analytic bandwidth appear separately',()=>{
 const value=view(),model=gpaEvidenceModel(value),host=new Element();assert.equal(model.status,'available');renderGpaEvidence(host,value,document);
 assert.match(contents(host),/数值层/);assert.match(contents(host),/物理层/);assert.match(contents(host),/带宽层/);
 assert.match(contents(host),/材料应变未验证/);assert.match(contents(host),/不能排除带宽之外/);assert.match(contents(host),/不是实测空间分辨率/);
 assert.match(contents(host),/aperture_sigma_cycles_per_pixel/);
});
test('missing physical metric stays explicit, not converted to physical strain by the Panel',()=>{
 const value=view();value.coordinate_domain='image_coordinate';value.evidence_assessment.reason_codes.push('physical_xy_calibration_missing');
 const host=new Element();renderGpaEvidence(host,value,document);assert.match(contents(host),/缺少物理 XY 标定/);
 assert.equal(projectGpaEvidence(value).coordinate_domain,'image_coordinate');
});
test('bounded unknown semantics and contradicting true flags are visible but never validated by this renderer',()=>{
 for(const edit of [v=>v.evidence_assessment.semantics_version=2,v=>v.material_strain_verified=true,v=>v.evidence_assessment.material_strain_validated=true]){
  const value=view();edit(value);const before=JSON.stringify(value),model=gpaEvidenceModel(value);
  assert.equal(model.status,'unavailable');assert.match(model.headline,/未识别或不一致/);
  assert.deepEqual(model.assessment,value.evidence_assessment);assert.equal(JSON.stringify(value),before);
 }
});
test('oversized, cyclic or non-finite metadata is explicitly unavailable, never silently truncated or called legacy',()=>{
 for(const invalid of [null,{many:Array(33).fill(0)},{bad:NaN},{big:'x'.repeat(2049)},(()=>{const x={};x.self=x;return x;})()]){
  const value={...view(),evidence_assessment:invalid},output=projectGpaEvidence(value);
  assert.equal(Object.hasOwn(output,'evidence_assessment'),false);assert.equal(output.evidence_assessment_projection.status,'unavailable');
  assert.equal(gpaEvidenceModel({...value,...output}).status,'unavailable');
  const panelObject={...value,...output};delete panelObject.evidence_assessment;
  const host=new Element();renderGpaEvidence(host,panelObject,document);assert.match(contents(host),/暂不可用/);assert.doesNotMatch(contents(host),/未记录 GPA/);
 }
});
test('provider text stays text and non-GPA navigation clears the previous diagnostic card',()=>{
 const value=view(),host=new Element();value.evidence_assessment.spatial_transfer.scope='<img src=x onerror=bad>';
 renderGpaEvidence(host,value,document);assert.match(contents(host),/<img src=x onerror=bad>/);assert.equal(host.hidden,false);
 renderGpaEvidence(host,{object_id:B,kind:'view',evidence_assessment:assessment()},document);
 assert.equal(host.hidden,true);assert.equal(host.children.length,0);assert.deepEqual(projectGpaEvidence({kind:'view',evidence_assessment:assessment()}),{});
});
test('actual owned Panel -> HTTP -> image_panel_current preserves exact provider assessment and static module; reads create no science',async()=>{
 const workspace=mkdtempSync(path.join(tmpdir(),'gpa-panel-evidence-')),supplied=view(),before=JSON.stringify(supplied),calls=[];
 const client={async rpc(method){return{result:method==='tools/list'?{tools:[{name:'image_info',inputSchema:{}}]}:{}};},
  async tool(name,args){calls.push(name);assert.equal(name,'image_info');assert.equal(args.object_id,A);return{data:structuredClone(supplied),png:'iVBORw0KGgo='};},async close(){}};
 const owned=prepareOwnedPanelRegistration({workspace,panel_id:P});let panel;
 try{
  panel=await createImagePanel({workspace,python:process.execPath,object_id:A,client,panel_id:P,
   helper_session_id:owned.helper_session_id,panel_generation:owned.generation,journalDirectory:owned.journalDirectory});owned.publish(panel);
  const origin=panel.url.split('/#')[0],response=await fetch(origin+'/api/state',{headers:{'X-Panel-Token':panel.token}});
  assert.equal(response.status,200);const state=await response.json();
  assert.deepEqual(state.object.evidence_assessment,supplied.evidence_assessment);assert.equal(state.object.material_strain_verified,false);
  assert.equal((await fetch(origin+'/gpa-evidence.mjs')).status,200);
  const html=await (await fetch(origin)).text();assert.match(html,/id="gpa-evidence"/);
  const manager=new ImagePanelManager({workspace,python:process.execPath,inspect(){assert.fail('Current read does not re-run science');}});
  const result=await manager.call('image_panel_current',{panel_id:P}),data=JSON.parse(result.content.find(c=>c.type==='text').text);
  assert.deepEqual(data.view.object.evidence_assessment,supplied.evidence_assessment);assert.equal(data.view.object.gpa_object_id,B);
  assert.equal(JSON.stringify(supplied),before);assert.ok(calls.every(n=>n==='image_info'));
 }finally{if(panel)await owned.close(panel);rmSync(workspace,{recursive:true,force:true});}
});
test('existing ResearchWorkspace renderer wires the GPA card instead of leaving it as an unused helper',()=>{
 const source=readFileSync(new URL('../ui/image-panel/research-workspace.mjs',import.meta.url),'utf8');
 assert.match(source,/renderGpaEvidence\(/);assert.match(source,/gpa-evidence/);
});

test('malformed known-version diagnostics remain exact but are not rendered as recognized evidence',()=>{
 for(const edit of [a=>a.reason_codes={},a=>a.reason_codes=[{bad:true}],a=>a.spatial_transfer='broken',a=>a.spatial_transfer={}]){
  const value=view();edit(value.evidence_assessment);const before=structuredClone(value);
  assert.deepEqual(projectGpaEvidence(value).evidence_assessment,value.evidence_assessment);
  const model=gpaEvidenceModel(value);
  assert.equal(model.status,'unavailable');assert.deepEqual(model.assessment,value.evidence_assessment);
  assert.deepEqual(value,before);
 }
});
test('malformed outer verification flag cannot silently disappear and look like an ordinary known assessment',()=>{
 const value=view();value.material_strain_verified='true';const output=projectGpaEvidence(value);
 assert.equal(output.evidence_assessment_projection?.status,'unavailable');
 assert.equal(output.evidence_assessment_projection?.reason,'invalid_outer_evidence_fields');
 assert.deepEqual(output.evidence_assessment,value.evidence_assessment);
 assert.equal(gpaEvidenceModel({...output,kind:value.kind}).status,'unavailable');
});
test('unchanged evidence rendering retains an expanded detail; navigation resets it',()=>{
 const value=view(),host=new Element();renderGpaEvidence(host,value,document);
 const detail=host.children.find(n=>n.tagName==='details');detail.open=true;
 renderGpaEvidence(host,structuredClone(value),document);
 assert.equal(host.children.find(n=>n.tagName==='details'),detail);
 assert.equal(detail.open,true);
 renderGpaEvidence(host,{...value,object_id:B},document);
 assert.notEqual(host.children.find(n=>n.tagName==='details'),detail);
 renderGpaEvidence(host,{kind:'view'},document);assert.equal(host.hidden,true);assert.equal(host.children.length,0);
});
