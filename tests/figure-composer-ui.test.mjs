// Actual composer event handlers with a minimal DOM/API shim. Deferred File.text
// and resolver Promises exercise UI ordering; this is not browser/backend QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as composer from '../ui/image-panel/figure-composer.mjs';
const copy=value=>JSON.parse(JSON.stringify(value)),id=n=>n.toString(16).padStart(32,'0');
const source=readFileSync(new URL('../ui/image-panel/app.mjs',import.meta.url),'utf8'),start=source.indexOf('let composition='),end=source.indexOf("$('view-forward').onclick",start);
assert.ok(start>=0&&end>start,'test must execute the actual composer handlers');
function profile(n){return {kind:'profile',object_id:id(n),scientific_grid_identity:{source_object_id:id(99),array_sha256:'a'.repeat(64)},xy_calibration:null,component:'raw',distance_unit:'pixel',physical_distance_unit:null,samples:{coordinates_xy:[[0,0],[1,0]],indices_xy:[[0,0],[1,0]],distance:[0,1],physical_distance:null,value:[7,9]}};}
function harness(count=3,layout='1x3'){
 class E{constructor(){this.children=[];this.value='';this.textContent='';this.files=[];this.attributes={};this.parentNode={append(){}};}replaceChildren(){this.children=[];}append(...values){this.children.push(...values);}setAttribute(key,value){this.attributes[key]=value;}}
 const elements=new Map(),$=key=>{if(!elements.has(key))elements.set(key,new E());return elements.get(key);},catalog=new Map(Array.from({length:4},(_,i)=>{const p=profile(i+1);return [p.object_id,p];}));let resolverGate=null;const calls=[],messages=[];
 const recipe={schema:'microscopy-figure-composition-v1',layout,font_pt:8,slots:[...catalog.values()].slice(0,count).map((p,i)=>composer.makeProfileSlot(p,'current '+i))};
 const panels=value=>value.slots.map(slot=>({slot:copy(slot),profile:copy(catalog.get(slot.object_id))}));
 const sandbox={...composer,$,console,URL,Blob,JSON,document:{createElement:()=>new E()},dataProbes:{profile:profile(4)},message:value=>messages.push(value),api:async(route,body)=>{assert.equal(route,'/api/composition/resolve');calls.push(copy(body));if(resolverGate)await resolverGate;return {panels:panels(body.composition)};}};
 vm.runInNewContext(source.slice(start,end)+"\nglobalThis.prepare=(recipe,panels)=>{composition=recipe;compositionPanels=panels;compositionRevision++;renderComposition();};globalThis.inspect=()=>({composition,compositionRevision,compositionWorking});globalThis.cleanup=()=>{if(compositionPreviewURL)URL.revokeObjectURL(compositionPreviewURL);};",sandbox,{filename:'ui/image-panel/app.mjs#composer'});
 sandbox.prepare(copy(recipe),panels(recipe));
 return {$,calls,messages,recipe:()=>copy(sandbox.inspect().composition),working:()=>sandbox.inspect().compositionWorking,close:()=>sandbox.cleanup(),setResolverGate:value=>{resolverGate=value;},async importFile(file){$('composer-import').files=file?[file]:[];await $('composer-import').onchange();},editTitle(index,text){const input=$('composer-slots').children[index].children[1];input.value=text;input.oninput();}};
}
test('a title edited while File.text is pending survives the older imported layout',async()=>{
 const h=harness();let release;const incoming=h.recipe();incoming.slots[0].title='old import';const text=new Promise(resolve=>{release=resolve;});
 try{const waiting=h.importFile({size:100,text:()=>text});assert.equal(h.working(),true);h.editTitle(0,'newer user edit');release(JSON.stringify(incoming));await waiting;
  assert.equal(h.recipe().slots[0].title,'newer user edit');assert.match(h.$('composer-status').textContent,/载入期间图版已变化/);assert.equal(h.working(),false);
 }finally{h.close();}
});
test('a title edited while the resolver is pending survives the older imported response',async()=>{
 const h=harness();let release;h.setResolverGate(new Promise(resolve=>{release=resolve;}));const incoming=h.recipe();incoming.slots[0].title='old response';
 try{const waiting=h.importFile({size:100,text:async()=>JSON.stringify(incoming)});for(let i=0;i<8;i++)await Promise.resolve();assert.equal(h.calls.length,1);h.editTitle(1,'newer response-time edit');release();await waiting;
  assert.equal(h.recipe().slots[1].title,'newer response-time edit');assert.match(h.$('composer-status').textContent,/载入期间图版已变化/);assert.equal(h.working(),false);
 }finally{h.close();}
});
test('profile capacity and changed layout never silently truncate a fourth saved slot',()=>{
 for(const layout of ['2x2','1x3']){const h=harness(4,layout);try{assert.equal(h.$('composer-add-profile').disabled,true);assert.equal(h.$('composer-add-image').disabled,true);assert.equal(h.recipe().slots.length,4);assert.equal(h.$('composer-export').disabled,layout==='1x3');if(layout==='1x3')assert.match(h.$('composer-status').textContent,/已加入 4 幅.*需要 3 幅/);}finally{h.close();}}
 const h=harness(3);try{assert.equal(h.$('composer-add-profile').disabled,false);assert.equal(h.$('composer-export').disabled,false);}finally{h.close();}
});
