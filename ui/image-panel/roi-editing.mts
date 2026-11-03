// Display-coordinate interaction only. Callers map qualified anchors through
// their existing scientific panel and publish edits with the existing lease.
export type RectangleHandle='nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'move';
export type Rectangle=readonly [number,number,number,number];
export interface RectangleResizeHandle {handle:Exclude<RectangleHandle,'move'>;point:readonly [number,number];}
export interface RectangleHitOptions {scale?:number;radius?:number;}

const handles:readonly Exclude<RectangleHandle,'move'>[]=['nw','n','ne','e','se','s','sw','w'];
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
function rectangle(value:readonly number[]):Rectangle|null {
 if(value.length!==4||!value.every(Number.isFinite))return null;
 const [a,b,c,d]=value,left=Math.min(a,c),top=Math.min(b,d),right=Math.max(a,c),bottom=Math.max(b,d);
 return left<right&&top<bottom&&Number.isFinite(right-left)&&Number.isFinite(bottom-top)?[left,top,right,bottom]:null;
}

export function rectangleHandles(value:readonly number[]):readonly RectangleResizeHandle[] {
 const box=rectangle(value);if(!box)return [];
 const [left,top,right,bottom]=box,x=left+(right-left)/2,y=top+(bottom-top)/2;
 if(![x,y].every(Number.isFinite))return [];
 const points:readonly (readonly [number,number])[]=[[left,top],[x,top],[right,top],[right,y],[right,bottom],[x,bottom],[left,bottom],[left,y]];
 return handles.map((handle,index)=>({handle,point:points[index]}));
}

function hitParameters(value:readonly number[],point:readonly number[],{scale=1,radius=8}:RectangleHitOptions):{box:Rectangle;reach:number}|null {
 const box=rectangle(value);if(!box||point.length!==2||!point.every(Number.isFinite)||!Number.isFinite(scale)||scale<=0||!Number.isFinite(radius)||radius<0)return null;
 const reach=radius/scale;if(!Number.isFinite(reach))return null;
 return {box,reach};
}
function resizeHandle(box:Rectangle,point:readonly number[],reach:number):Exclude<RectangleHandle,'move'>|null {
 // Screen-sized targets can otherwise cover an entire small ROI. Preserve a
 // central body target without changing anchors or making a selected body
 // outrank another overlapping ROI. Extremely small handles still overlap;
 // zooming in is needed to distinguish all eight targets comfortably.
 const [left,top,right,bottom]=box,cx=left+(right-left)/2,cy=top+(bottom-top)/2;
 const halfWidth=Math.min((right-left)/4,reach/2),halfHeight=Math.min((bottom-top)/4,reach/2);
 if(point[0]>=left&&point[0]<=right&&point[1]>=top&&point[1]<=bottom&&Math.abs(point[0]-cx)<=halfWidth&&Math.abs(point[1]-cy)<=halfHeight)return null;
 let nearest:RectangleResizeHandle|null=null,distance=Infinity;
 for(const candidate of rectangleHandles(box)){
  const d=Math.hypot(point[0]-candidate.point[0],point[1]-candidate.point[1]);
  if(d<distance){nearest=candidate;distance=d;}
 }
 return nearest&&distance<=reach?nearest.handle:null;
}

// Only selected resize controls should receive priority over ordinary paint
// order. A null result deliberately leaves body/label picking to the caller.
export function rectangleResizeHandleHitTest(value:readonly number[],point:readonly number[],options:RectangleHitOptions={}):Exclude<RectangleHandle,'move'>|null {
 const hit=hitParameters(value,point,options);return hit?resizeHandle(hit.box,point,hit.reach):null;
}

export function rectangleHitTest(value:readonly number[],point:readonly number[],options:RectangleHitOptions={}):RectangleHandle|null {
 const hit=hitParameters(value,point,options);if(!hit)return null;
 const handle=resizeHandle(hit.box,point,hit.reach);if(handle)return handle;
 const [left,top,right,bottom]=hit.box,reach=hit.reach;
 return point[0]>=left-reach&&point[0]<=right+reach&&point[1]>=top-reach&&point[1]<=bottom+reach?'move':null;
}

export function editRectangle(value:readonly number[],delta:readonly number[],handle:RectangleHandle,bounds:readonly number[],minSize:readonly number[]):Rectangle|null {
 const original=rectangle(value),support=rectangle(bounds);
 // A gesture may constrain a valid ROI at its known panel boundary, but must
 // not repair malformed or outside-view scientific anchors by clipping them.
 if(!original||!support||bounds[0]!==support[0]||bounds[1]!==support[1]||bounds[2]!==support[2]||bounds[3]!==support[3]||delta.length!==2||!delta.every(Number.isFinite)||minSize.length!==2||!minSize.every(v=>Number.isFinite(v)&&v>0)||handle!=='move'&&!handles.includes(handle))return null;
 const [left,top,right,bottom]=original,[minX,minY,maxX,maxY]=support,[minWidth,minHeight]=minSize;
 if(left<minX||top<minY||right>maxX||bottom>maxY||minWidth>maxX-minX||minHeight>maxY-minY)return null;
 const [dx,dy]=delta;
 if(handle==='move'){
  const x=clamp(dx,minX-left,maxX-right),y=clamp(dy,minY-top,maxY-bottom);
  const result:Rectangle=[left+x,top+y,right+x,bottom+y];return result.every(Number.isFinite)?result:null;
 }
 let x0=left,y0=top,x1=right,y1=bottom;
 if(handle.includes('w')){if(right-minWidth<minX)return null;x0=clamp(left+dx,minX,right-minWidth);}
 if(handle.includes('e')){if(left+minWidth>maxX)return null;x1=clamp(right+dx,left+minWidth,maxX);}
 if(handle.includes('n')){if(bottom-minHeight<minY)return null;y0=clamp(top+dy,minY,bottom-minHeight);}
 if(handle.includes('s')){if(top+minHeight>maxY)return null;y1=clamp(bottom+dy,top+minHeight,maxY);}
 const result:Rectangle=[x0,y0,x1,y1];return result.every(Number.isFinite)&&x0<x1&&y0<y1?result:null;
}
