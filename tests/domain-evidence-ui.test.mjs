import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDomainEvidence} from '../ui/image-panel/domain-evidence.mjs';
function fixture(){const doc={createElement(tag){return {tag,textContent:'',children:[],listeners:{},style:{},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},setAttribute(){},addEventListener(k,fn){this.listeners[k]=fn;}};}};return {...doc.createElement('details'),ownerDocument:doc};}
const text=node=>[node.textContent,...node.children.map(text)].join(' ');
test('saved ROI/FFT navigation and partial evidence never compute or promote candidates',async()=>{
 const evidence={kind:'local_signature_compare',object_id:'saved',overview_object_id:'overview',coordinate_unit:'cycles/pixel',tolerance:.01,reference_index:0,
 source_entries:[{index:1,index_kind:'frame_index',geometry_status:'admitted',measurements:[{}],view_object_id:'fft',mapping_evidence:{frame_index:1,status:'VERIFIED',method:'identity',basis:{source:'user_statement_not_independently_verified'}}}],
 relations:[{target_index:1,status:'partial_match',candidates:[{angle_degrees:30,matched_pairs:[{}],max_residual:.001,unmatched_reference_family_ids:[],unmatched_target_family_ids:['extra'],accepted_descriptive_match:false}]}]};
 const before=structuredClone(evidence),container=fixture(),shown=[];
 renderDomainEvidence(container,evidence,{show:id=>shown.push(id)});
 assert.match(text(container),/用户声明.*未独立验证/);assert.match(text(container),/不确定性未知/);assert.match(text(container),/partial_match/);assert.match(text(container),/0 \/ 1/);
 await container.children[3].children[1].children[2].listeners.click();assert.deepEqual(shown,['fft']);assert.deepEqual(evidence,before);
 renderDomainEvidence(container,null);assert.equal(container.hidden,true);
});


test('field hotspot uses saved FFT and exact rendered mapping; masked values remain unknown',async()=>{
 const field={kind:'feature_field',object_id:'field',coordinate_domain:'physical',overview_object_id:'overview',
 field_image:{width:400,height:200,hotspots:[{sample_index:0,rect_xyxy:[40,20,120,100],view_object_id:'saved-fft'}]},
 samples:[{sample_index:0,center_xy:[63.5,31.5],status:'insufficient_evidence',features:{family_count:null,shortest_period:null,families:[]},invalid_reasons:['missing independent scale']}]};
 const before=structuredClone(field),container=fixture(),seen=[];
 renderDomainEvidence(container,field,{show:id=>seen.push(id),png:'aGVsbG8='});
 const map=container.children[3],hotspot=map.children[1];
 assert.deepEqual(hotspot.style,{left:'10%',top:'10%',width:'20%',height:'40%'});
 await hotspot.listeners.click();assert.deepEqual(seen,['saved-fft']);
 assert.match(text(container),/insufficient_evidence/);assert.match(text(container),/— nm/);
 assert.deepEqual(field,before);
});
