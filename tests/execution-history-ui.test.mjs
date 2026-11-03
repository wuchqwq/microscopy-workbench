import test from 'node:test';
import assert from 'node:assert/strict';
import {ExecutionHistoryPanel,executionHistoryLabel} from '../ui/image-panel/execution-history.mjs';
test('opening exploratory history is read-only and retains exact float input independently of saved analysis',async()=>{
 let reads=0;const shown=[],elements=new Map();class Element{constructor(){this.children=[];this.listeners={};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}addEventListener(name,fn){this.listeners[name]=fn;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}focus(){}}
 const document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),activeElement:null};
 const original={source_view_object_id:'a'.repeat(32),float_roi_xyxy:[2.25,3.125,22.75,31.5],processing_rect_xyxy:[2,3,23,32],annotation_id:null,recipe:{window:'hann',subtract_mean:true}},record={request_id:'original-request',status:'completed',qualification:'validated',fft_object_id:'b'.repeat(32),input_snapshot:original};
 const panel=new ExecutionHistoryPanel({document,read:async()=>{reads++;return {schema_version:1,read_only:true,records:[structuredClone(record)]};},show:async id=>shown.push(id),error:text=>{throw Error(text);}});
 await panel.open();assert.equal(reads,1);assert.deepEqual(shown,[]);assert.equal(elements.get('execution-history-dialog').open,true);const tr=elements.get('execution-history-rows').children[0];assert.match(tr.children[1].textContent,/2.25, 3.125, 22.75, 31.5/);assert.match(tr.children[1].textContent,/2, 3, 23, 32/);
 const sourceButton=tr.children[3].children[0];await sourceButton.onclick();assert.deepEqual(shown,['a'.repeat(32)]);assert.deepEqual(record.input_snapshot,original);
});
test('unknown/unqualified executions are not presented as successfully validated history',()=>{assert.equal(executionHistoryLabel({status:'completed',qualification:'unavailable'}),'来源尚无法核对');assert.equal(executionHistoryLabel({status:'unknown',qualification:'validated'}),'原请求结果未知');});
