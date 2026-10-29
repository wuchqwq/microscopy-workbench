// Pure presentation checks with saved evidence fixtures; no browser or numerical
// correspondence qualification is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {correspondenceEvidenceText,renderSequenceEvidence} from '../ui/image-panel/sequence-evidence.mjs';

const declared={source:'user_statement_not_independently_verified',source_text:'Synthetic common-grid declaration'};
const numerical={source:'bounded_numerical_estimate',source_text:null};

test('identical VERIFIED statuses retain distinct declaration, numerical and reference evidence',()=>{
  for(const method of ['identity','translation'])assert.match(correspondenceEvidenceText({frame_index:1,status:'VERIFIED',method,basis:declared},0),/用户声明.*未独立验证/);
  assert.match(correspondenceEvidenceText({frame_index:1,status:'VERIFIED',method:'estimate',basis:numerical},0),/有限范围数值对应.*按设定阈值接受/);
  assert.match(correspondenceEvidenceText({frame_index:0,status:'VERIFIED',method:'reference_identity',basis:declared},0),/参考帧.*无跨帧推断/);
  assert.match(correspondenceEvidenceText({frame_index:0,status:'VERIFIED'},0),/参考帧/,'legacy joint records still identify their explicit reference index');
});

test('missing basis never upgrades VERIFIED to independent or numerical verification',()=>{
  for(const method of [undefined,'identity','translation','estimate'])assert.match(correspondenceEvidenceText({frame_index:1,status:'VERIFIED',method},0),/依据未知/);
  assert.match(correspondenceEvidenceText(),/依据未知/,'absent frame and reference indices cannot identify a reference');
  for(const status of ['AMBIGUOUS','UNMATCHED','OUT_OF_VIEW','INCOMPATIBLE'])assert.match(correspondenceEvidenceText({frame_index:1,status,basis:numerical},0),/未接受对应/);
});

function fixture(){
  const doc={createElement(tag){return {tag,textContent:'',children:[],attributes:{},listeners:{},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,fn){this.listeners[name]=fn;}};}};
  return {...doc.createElement('details'),ownerDocument:doc};
}
const textOf=element=>[element.textContent,...element.children.map(textOf)].join(' ');

test('saved frame basis is visible beside navigation and observations without changing statuses or science',async()=>{
  const evidence={reference_index:0,frame_observations:[
    {frame_index:0,status:'VERIFIED',method:'reference_identity',basis:declared,view_object_id:'reference-view'},
    {frame_index:1,status:'VERIFIED',method:'identity',basis:declared,reason:'Declaration accepted for coordinate processing',view_object_id:'declared-view'},
    {frame_index:2,status:'VERIFIED',method:'estimate',basis:numerical},
    {frame_index:3,status:'AMBIGUOUS',method:'estimate',basis:numerical},
    {frame_index:4,status:'VERIFIED'},
  ],observations:[{frame_index:1,status:'observed',frequency_cycles_per_pixel:[0.1,-0.2],residual_cycles_per_pixel:0.001,d_spacing:4,d_spacing_unit:'px'}]};
  const original=structuredClone(evidence),container=fixture(),shown=[];
  renderSequenceEvidence(container,evidence,{show:id=>shown.push(id)});
  const [_summary,note,navigation,scroll]=container.children,table=scroll.children[0],cells=table.children[1].children[0].children;
  assert.match(note.textContent,/不证明物理同一性或连续结构/);
  assert.match(textOf(navigation.children[0]),/VERIFIED.*参考帧/);
  assert.match(textOf(navigation.children[1]),/VERIFIED.*用户声明.*未独立验证/);
  assert.match(navigation.children[1].title,/Synthetic common-grid declaration.*Declaration accepted/);
  assert.match(textOf(navigation.children[2]),/VERIFIED.*有限范围数值对应/);
  assert.match(textOf(navigation.children[3]),/AMBIGUOUS.*未接受对应/);
  assert.match(textOf(navigation.children[4]),/VERIFIED.*依据未知/);
  assert.equal(cells[1].textContent,'observed');
  assert.match(cells[2].textContent,/用户声明.*未独立验证/);
  await navigation.children[1].children[1].listeners.click();
  assert.deepEqual(shown,['declared-view'],'navigation only opens the existing saved view');
  assert.deepEqual(evidence,original,'presentation preserves authoritative statuses and evidence');
});

test('clearing joint evidence removes the saved table',()=>{
  const container=fixture();renderSequenceEvidence(container,{frame_observations:[]});
  assert.equal(container.hidden,false);assert.ok(container.children.length);
  renderSequenceEvidence(container,null);
  assert.equal(container.hidden,true);assert.deepEqual(container.children,[]);
});
