import test from 'node:test';
import assert from 'node:assert/strict';
import * as roiEditing from '../ui/image-panel/roi-editing.mjs';
const {rectangleHandles,rectangleHitTest,editRectangle}=roiEditing;
import {hitMark} from '../ui/image-panel/viewer-state.mjs';

const box=[20,30,80,90],bounds=[0,0,100,120];
const points=[['nw',[20,30]],['n',[50,30]],['ne',[80,30]],['e',[80,60]],['se',[80,90]],['s',[50,90]],['sw',[20,90]],['w',[20,60]]];

test('rectangle exposes all four corner and four edge handles without changing its anchors',()=>{
 const original=Object.freeze([80,90,20,30]);
 assert.deepEqual(rectangleHandles(original),points.map(([handle,point])=>({handle,point})));
 assert.deepEqual(original,[80,90,20,30]);
 for(const [handle,point] of points)assert.equal(rectangleHitTest(original,point),handle);
 assert.equal(rectangleHitTest(box,[50,60]),'move');
});

test('handle targeting uses screen-pixel radius and body selection does not extend arbitrarily beyond the ROI',()=>{
 assert.equal(rectangleHitTest(box,[80+3,30],{scale:2,radius:8}),'ne');
 assert.equal(rectangleHitTest(box,[80+5,30],{scale:2,radius:8}),null);
 assert.equal(rectangleHitTest(box,[30,29],{scale:2,radius:8}),'move');
 assert.equal(rectangleHitTest(box,[30,24],{scale:2,radius:8}),null);
 assert.equal(rectangleHitTest(box,[80+5,30],{scale:1,radius:8}),'ne');
});

test('small ROI centers remain move targets instead of being swallowed by resize hit radii',()=>{
 const original=Object.freeze([20,30,30,40]);
 for(const scale of [.25,1,4,16])assert.equal(rectangleHitTest(original,[25,35],{scale}),'move',`scale ${scale}`);
 assert.equal(rectangleHitTest(original,[23,33]),'move','the center reserves a nonzero interior move area');
 assert.equal(rectangleHitTest([0,0,200,10],[100,5]),'move','a narrow ROI also remains movable from its center');
 assert.deepEqual(original,[20,30,30,40],'hit testing does not change scientific coordinates');
});

test('selected resize picking has no body fallback and permits ordinary overlap selection away from handles',()=>{
 const picked=roiEditing.rectangleResizeHandleHitTest;
 assert.equal(typeof picked,'function','an explicit handle-only pick must not promote the whole selected body');
 assert.equal(picked(box,[50,60]),null);assert.equal(rectangleHitTest(box,[50,60]),'move');
 for(const [handle,point]of points)assert.equal(picked(box,point),handle);
 const lower={annotation_id:'selected',kind:'rectangle',coordinates:[20,30,80,90]},upper={annotation_id:'other',kind:'rectangle',coordinates:[10,20,100,110]};
 assert.equal(picked(lower.coordinates,[20,30]),'nw','a visible selected handle can be tested before a later ROI body or label');
 assert.equal(hitMark([lower,upper],[20,30]).mark.annotation_id,'other','ordinary picking still retains paint order; the caller opts into handle priority');
 assert.equal(picked(lower.coordinates,[50,60]),null);assert.equal(hitMark([lower,upper],[50,60]).mark.annotation_id,'other','selecting another overlapping body remains possible');
});

test('handle-only picking retains CSS pixel reach and abstains on invalid or center targets',()=>{
 const picked=roiEditing.rectangleResizeHandleHitTest;assert.equal(typeof picked,'function');
 assert.equal(picked(box,[83,30],{scale:2,radius:8}),'ne');assert.equal(picked(box,[85,30],{scale:2,radius:8}),null);
 assert.equal(picked(box,[85,30],{scale:1,radius:8}),'ne');
 const tiny=[0,0,4,4];assert.equal(picked(tiny,[2,2]),null);assert.equal(rectangleHitTest(tiny,[2,2]),'move');
 for(const [handle,point]of [['nw',[0,0]],['n',[2,0]],['ne',[4,0]],['e',[4,2]],['se',[4,4]],['s',[2,4]],['sw',[0,4]],['w',[0,2]]])assert.equal(picked(tiny,point),handle,'exact handle centers remain defined even though their screen hit regions overlap');
 for(const bad of [[0,0,0,4],[0,0,NaN,4],[0,0,4]])assert.equal(picked(bad,[0,0]),null);
 for(const options of [{scale:0},{scale:NaN},{radius:-1},{radius:Infinity}])assert.equal(picked(box,[20,30],options),null);
 assert.equal(picked(box,[NaN,30]),null);
});

test('each resize handle moves only its intended sides and leaves the opposite sides fixed',()=>{
 const expected={nw:[25,23,80,90],n:[20,23,80,90],ne:[20,23,85,90],e:[20,30,85,90],se:[20,30,85,83],s:[20,30,80,83],sw:[25,30,80,83],w:[25,30,80,90]};
 for(const [handle,result] of Object.entries(expected))assert.deepEqual(editRectangle(box,[5,-7],handle,bounds,[1,1]),result,handle);
 assert.deepEqual(box,[20,30,80,90]);
});

test('ROI body translation preserves its exact fractional width and height and stops at the known panel boundary',()=>{
 const original=[20.25,30.5,80.75,90.125],before=structuredClone(original);
 assert.deepEqual(editRectangle(original,[3.5,-2.25],'move',bounds,[1,1]),[23.75,28.25,84.25,87.875]);
 assert.deepEqual(editRectangle(original,[-500,500],'move',bounds,[1,1]),[0,60.375,60.5,120]);
 assert.deepEqual(original,before);
 // Moving a legitimate subpixel ROI must not silently enlarge its support.
 assert.deepEqual(editRectangle([2,3,2.25,3.5],[1,1],'move',bounds,[1,1]),[3,4,3.25,4.5]);
});

test('resize never crosses its opposite edge and stops at the requested source-pixel minimum',()=>{
 assert.deepEqual(editRectangle(box,[1000,0],'w',bounds,[1,1]),[79,30,80,90]);
 assert.deepEqual(editRectangle(box,[-1000,0],'e',bounds,[1,1]),[20,30,21,90]);
 assert.deepEqual(editRectangle(box,[0,1000],'n',bounds,[1,1]),[20,89,80,90]);
 assert.deepEqual(editRectangle(box,[0,-1000],'s',bounds,[1,1]),[20,30,80,31]);
 assert.deepEqual(editRectangle(box,[-1000,-1000],'nw',bounds,[2,3]),[0,0,80,90]);
 assert.deepEqual(editRectangle(box,[1000,1000],'se',bounds,[2,3]),[20,30,100,120]);
});

test('reversed drag origin has the same normalized edit geometry and does not reorder unrelated records',()=>{
 assert.deepEqual(editRectangle([80,90,20,30],[5,-7],'nw',bounds,[1,1]),[25,23,80,90]);
 const records=[{annotation_id:'A',coordinates:[...box]},{annotation_id:'B',coordinates:[5,5,10,10]}],before=structuredClone(records);
 const moved=editRectangle(records[0].coordinates,[5,5],'move',bounds,[1,1]);assert.deepEqual(moved,[25,35,85,95]);assert.deepEqual(records,before);
});

test('malformed or outside-panel original anchors abstain instead of being repaired by clipping',()=>{
 for(const bad of [[0,0,0,10],[0,0,10],[-1,0,10,10],[0,0,101,10],[0,0,10,121],[0,0,NaN,10],[0,0,Infinity,10],[-1e308,0,1e308,10]])assert.equal(editRectangle(bad,[1,1],'move',bounds,[1,1]),null);
 assert.equal(editRectangle(box,[1,1],'move',[100,120,0,0],[1,1]),null);
 assert.equal(editRectangle(box,[NaN,0],'move',bounds,[1,1]),null);
 assert.equal(editRectangle(box,[0,0],'unknown',bounds,[1,1]),null);
 for(const minimum of [[0,1],[1,-1],[1,Infinity],[1],[101,1]])assert.equal(editRectangle(box,[1,1],'e',bounds,minimum),null);
 assert.equal(editRectangle([0,0,0.25,0.5],[0,0],'w',bounds,[1,1]),null,'cannot make a one-pixel width while preserving a fixed opposite edge outside the available support');
});

test('invalid hit-test inputs and degenerate rectangles never produce selectable handles',()=>{
 for(const bad of [[1,2,1,4],[1,2,3],[NaN,2,3,4],[-1e308,0,1e308,1]]){assert.deepEqual(rectangleHandles(bad),[]);assert.equal(rectangleHitTest(bad,[2,3]),null);}
 for(const options of [{scale:0},{scale:-1},{scale:NaN},{scale:Infinity},{radius:-1},{radius:Infinity}])assert.equal(rectangleHitTest(box,[50,60],options),null);
 assert.equal(rectangleHitTest(box,[NaN,40]),null);assert.equal(rectangleHitTest(box,[50]),null);
});

test('multiple overlapping ROIs select the frontmost eligible rectangle from its interior',()=>{
 const a={annotation_id:'ROI 1',kind:'rectangle',coordinates:[10,10,90,90]},b={annotation_id:'ROI 2',kind:'rectangle',coordinates:[25,25,75,75]},c={annotation_id:'ROI 3',kind:'rectangle',coordinates:[30,30,70,70]};
 const records=[a,b,c],before=structuredClone(records);
 assert.equal(hitMark(records,[50,50]).mark.annotation_id,'ROI 3');
 assert.equal(hitMark([a,b,{...c,status:'retracted'}],[50,50]).mark.annotation_id,'ROI 2');
 assert.equal(hitMark([a,{...b,visibility:'outside_view'},{...c,status:'retracted'}],[50,50]).mark.annotation_id,'ROI 1');
 assert.equal(hitMark([a,{...b,presentation:{geometry_visible:false}},{...c,coordinates:[50,50,50,50]}],[50,50]).mark.annotation_id,'ROI 1');
 assert.equal(hitMark(records,[15,50]).mark.annotation_id,'ROI 1');assert.equal(hitMark(records,[150,150]),null);assert.deepEqual(records,before);
});

test('rectangle body selection preserves existing point and line targeting and retraction rules',()=>{
 const roi={annotation_id:'ROI',kind:'rectangle',coordinates:box},peak={annotation_id:'peak',kind:'point',coordinates:[50,60]},line={annotation_id:'line',kind:'line',coordinates:[0,10,100,10]};
 assert.deepEqual(hitMark([roi,peak],[50,60]),{mark:peak,handle:0});
 assert.deepEqual(hitMark([roi,line],[30,10]),{mark:line,handle:-1});
 assert.deepEqual(hitMark([roi,line],[0,10]),{mark:line,handle:0});
 assert.equal(hitMark([roi,{...peak,status:'retracted'}],[50,60]).mark.annotation_id,'ROI');
});
