// Public synthetic fixtures exercise the compiled protocol and serialized JS.
// The renderer stub below is not a WebGL or real 3Dmol acceptance test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createStructureViewer,validateStructureSnapshot,inspectRendererContacts,STRUCTURE_CONTACT_POLICY} from '../tools/structure_viewer.mjs';
import {attachStructureViewer} from '../lib/structure_viewer_client.mjs';

const objectId='a'.repeat(32);
const source=()=>({object_id:objectId,symbols:['Cu','Cu'],positions_angstrom:[[0,0,0],[1,0,0]],cell_angstrom:[[3,0,0],[1,4,0],[0,1,5]],pbc:[true,true,true]});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assetFixture(){
 const root=mkdtempSync(path.join(tmpdir(),'structure-viewer-test-')),pkg=path.join(root,'3dmol');
 mkdirSync(path.join(pkg,'build'),{recursive:true});
 writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'3dmol',version:'2.5.5',license:'BSD-3-Clause'}));
 writeFileSync(path.join(pkg,'LICENSE'),'Synthetic protocol-test license fixture');
 const assetPath=path.join(pkg,'build','3Dmol-min.js');writeFileSync(assetPath,'/* Synthetic local asset; browser ports are stubbed in this test. */');
 return {root,assetPath,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
function browserHarness(data,token,{renderer=true}={}){
 const nodes=Object.fromEntries(['camera-state','contact-state','viewer-status','contact-summary','display-mode','reset','summary','message'].map(id=>[id,{textContent:'',value:'atoms',disabled:true,onchange:null,onclick:null}]));
 let atoms=[],view=[1,2,3,4],rendered=0,resize;
 const model={addAtoms:rows=>{atoms.push(...rows.map((row,index)=>({...row,index})));},setCrystMatrix:()=>{},assignBonds:()=>{atoms.forEach((row,index)=>{row.bonds=[1-index];row.bondOrder=[1];});},selectedAtoms:()=>atoms,removeAtoms:()=>{atoms=[];}};
 const viewer={addModel:()=>model,setStyle:()=>{},addUnitCell:()=>{},addArrow:()=>{},zoomTo:()=>{},render:()=>{rendered++;},getView:()=>view,setView:value=>{view=value;},setViewChangeCallback:()=>{},resize:()=>{}};
 const stored=new Map(),requests=[],history=[];
 const sandbox={document:{getElementById:id=>nodes[id]},location:{hash:'#'+token,pathname:'/'},sessionStorage:{setItem:(key,value)=>stored.set(key,value),getItem:key=>stored.get(key)??null},history:{replaceState:(...args)=>history.push(args)},window:{addEventListener:(_event,callback)=>{resize=callback;}},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>data};}};
 if(renderer)sandbox.$3Dmol={createViewer:()=>viewer,Matrix3:class{}};
 return {context:vm.createContext(sandbox),nodes,requests,history,rendered:()=>rendered,resize:()=>resize?.()};
}

test('structure snapshots retain bounded geometry and separate proper display rotation',()=>{
 const input=source(),before=structuredClone(input),checked=validateStructureSnapshot(input);
 assert.equal(checked.cell_display,'full_cell');assert.deepEqual(checked.periodic_cell_axes,[0,1,2]);
 checked.positions_angstrom[0][0]=99;assert.deepEqual(input,before,'validation returns an independent display copy');
 const slab=validateStructureSnapshot({...source(),cell_angstrom:[[3,0,0],[1,4,0],[0,0,0]],pbc:[true,true,false]});
 assert.equal(slab.cell_display,'declared_periodic_vectors_only');assert.deepEqual(slab.periodic_cell_axes,[0,1]);
 assert.throws(()=>validateStructureSnapshot({...source(),cell_angstrom:[[3,0,0],[1,0,0],[0,0,0]],pbc:[true,true,false]}),/independent/);
 const orientation={orientation_id:'b'.repeat(32),rotation_matrix_cartesian:[[0,-1,0],[1,0,0],[0,0,1]],source_coordinates_sha256:'c'.repeat(64),initial_orientation_applied:true,scientific_source_coordinates_modified:false,display_coordinates_transformed:true,convention:'Synthetic proper rotation'};
 assert.deepEqual(validateStructureSnapshot({...source(),display_orientation:orientation}).display_orientation,orientation);
 assert.throws(()=>validateStructureSnapshot({...source(),display_orientation:{...orientation,rotation_matrix_cartesian:[[1,0,0],[0,1,0],[0,0,-1]]}}),/right-handed/);
 assert.throws(()=>validateStructureSnapshot({...source(),positions_angstrom:[[NaN,0,0],[1,0,0]]}),/Finite bounded/);
 assert.throws(()=>validateStructureSnapshot({...source(),extra:true}),/Unexpected/);
});

test('renderer contacts validate fixed atom identity, symmetry and whole-graph limits',()=>{
 const structure=validateStructureSnapshot(source());
 const atoms=structure.symbols.map((elem,index)=>({elem,index,x:structure.positions_angstrom[index][0],y:0,z:0,bonds:[1-index],bondOrder:[1]}));
 assert.equal(inspectRendererContacts(atoms,structure),1);
 assert.throws(()=>inspectRendererContacts([{...atoms[0],x:1},atoms[1]],structure),/fixed atomic coordinates/);
 assert.throws(()=>inspectRendererContacts([atoms[0],{...atoms[1],bonds:[],bondOrder:[]}],structure),/not symmetric/);
 assert.throws(()=>inspectRendererContacts(atoms,structure,{...STRUCTURE_CONTACT_POLICY,undirected_contact_budget:0}),error=>error.contact_count===1);
});

test('compiled viewer serves owned snapshot and self-contained browser module',async()=>{
 const fixture=assetFixture(),input=source(),before=structuredClone(input);
 let handle;
 try{
  handle=await createStructureViewer({structure:input,assetPath:fixture.assetPath});
  const origin=new URL(handle.url).origin;
  assert.equal((await fetch(origin+'/api/structure')).status,403);
  assert.equal((await fetch(origin+'/api/structure',{headers:{Origin:'https://example.invalid','X-Viewer-Token':handle.token}})).status,403);
  const response=await fetch(origin+'/api/structure',{headers:{Origin:origin,'X-Viewer-Token':handle.token}}),data=await response.json();
  assert.equal(data.read_only,true);assert.equal(data.snapshot_sha256,hash(data.structure));
  assert.equal(data.structure.object_id,objectId);
  const script=await (await fetch(origin+'/viewer.mjs')).text();
  assert.doesNotMatch(script,/\b(?:import|export)\s/,'serialized browser code has no module dependency');
  const browser=browserHarness(data,handle.token);await vm.runInContext(script,browser.context,{timeout:1000});
  assert.equal(JSON.parse(browser.nodes['viewer-status'].textContent).state,'rendered');
  assert.equal(browser.requests[0].options.headers['X-Viewer-Token'],handle.token);assert.equal(browser.history.length,1);
  browser.nodes['display-mode'].value='contacts';browser.nodes['display-mode'].onchange();
  assert.equal(JSON.parse(browser.nodes['contact-state'].textContent).active_contact_count,1);
  browser.nodes.reset.onclick();browser.resize();assert.ok(browser.rendered()>=3);
  const absent=browserHarness(data,handle.token,{renderer:false});await vm.runInContext(script,absent.context,{timeout:1000});
  assert.equal(JSON.parse(absent.nodes['viewer-status'].textContent).state,'not_rendered');
  assert.deepEqual(input,before,'protocol and camera interactions never mutate input coordinates');
 }finally{if(handle)await handle.close();fixture.cleanup();}
});

test('viewer closure requires same-origin token and exact saved snapshot',async()=>{
 const fixture=assetFixture();let handle,record;
 try{
  handle=await createStructureViewer({structure:source(),assetPath:fixture.assetPath,onClosed:value=>{record=value;}});
  const origin=new URL(handle.url).origin,body=JSON.stringify({request_id:'original-close',object_id:handle.object_id,snapshot_sha256:handle.snapshot_sha256});
  assert.equal((await fetch(origin+'/api/close')).status,405);
  assert.equal((await fetch(origin+'/api/close',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body})).status,403);
  const ack=await fetch(origin+'/api/close',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Viewer-Token':handle.token},body});
  assert.equal((await ack.json()).request_id,'original-close');await handle.close();
  assert.equal(record.request_id,'original-close');assert.equal(record.object_id,objectId);assert.equal(record.snapshot_sha256,handle.snapshot_sha256);
 }finally{if(handle)await handle.close();fixture.cleanup();}
});

test('optional viewer attachment preserves completed science and pre-launch cancellation',async()=>{
 const data={backend:'external-structure-workspace',state:'completed',kind:'view',object_id:objectId,structure_object_id:'b'.repeat(32),request_id:'saved-science'};
 const result={content:[{type:'text',text:JSON.stringify(data)},{type:'image',mimeType:'image/png',data:'preserved'}]};
 const absent=await attachStructureViewer(result);assert.equal(JSON.parse(absent.content[0].text).interactive_3d,'NOT_CONFIGURED');
 const signal=AbortSignal.abort();const cancelled=await attachStructureViewer(result,{assetPath:'unused',signal});
 const parsed=JSON.parse(cancelled.content[0].text);assert.equal(parsed.state,'completed');assert.equal(parsed.viewer_state,'cancelled_before_launch');assert.deepEqual(cancelled.content[1],result.content[1]);
});
