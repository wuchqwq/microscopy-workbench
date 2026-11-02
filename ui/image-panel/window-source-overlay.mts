import {transformCoordinates} from './coordinates.mjs';
import type {WireSpatialPanel,Rectangle} from './coordinates.mjs';
import type {BrowserDocument,BrowserElement} from './browser-ports.mjs';

export interface SourceWindowOutline {
 readonly window_id:string;readonly label:string;readonly coordinates:Rectangle;
 readonly line_style:'solid'|'dashed'|'dotted';
}
type Row=Readonly<Record<string,unknown>>;
const row=(value:unknown):value is Row=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const objectId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const windowId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const rectangle=(value:unknown,integer=false):value is Rectangle=>Array.isArray(value)&&value.length===4&&value.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e7&&(!integer||Number.isSafeInteger(n)))&&value[0]<value[2]&&value[1]<value[3];
const inside=(inner:Rectangle,outer:Rectangle)=>inner[0]>=outer[0]&&inner[1]>=outer[1]&&inner[2]<=outer[2]&&inner[3]<=outer[3];

function spatialPanel(object:unknown,collection:unknown):WireSpatialPanel|null {
 if(!row(object)||!objectId(object.object_id)||object.array_domain==='frequency'||!row(collection)||collection.schema_version!==1||!objectId(collection.frame_object_id)||!Array.isArray(object.panels)||object.panels.length!==1)return null;
 const panel=object.panels[0];
 if(!row(panel)||panel.domain!=='spatial_pixels'||panel.source_object_id!==collection.frame_object_id||!rectangle(panel.source_rect_xyxy)||!rectangle(panel.image_rect_xyxy))return null;
 return {domain:'spatial_pixels',source_object_id:panel.source_object_id as string,source_rect_xyxy:panel.source_rect_xyxy,image_rect_xyxy:panel.image_rect_xyxy};
}

// Presentation of an already recorded integer processing window. This creates
// neither scientific selections nor annotations and never reconstructs an
// unrecorded floating-point ROI from the FFT's processing support.
export function sourceWindowOutlines(object:unknown,collection:unknown):readonly SourceWindowOutline[] {
 const panel=spatialPanel(object,collection);if(!panel||!row(collection)||!Array.isArray(collection.windows)||collection.windows.length>5)return [];
 const ids=new Set<string>();for(const entry of collection.windows){if(!row(entry)||!windowId(entry.window_id)||ids.has(entry.window_id))return [];ids.add(entry.window_id);}
 const result:SourceWindowOutline[]=[],styles:SourceWindowOutline['line_style'][]=['solid','dashed','dotted'];
 for(const entry of collection.windows){
  if(!row(entry)||entry.role!=='fft'||typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>120||!row(entry.source_reference))continue;
  const source=entry.source_reference;
  if(!objectId(entry.object_id)||!objectId(source.input_view_object_id)||!objectId(source.raw_fft_object_id)||source.frame_object_id!==collection.frame_object_id||!rectangle(source.processing_rect_xyxy,true)||!inside(source.processing_rect_xyxy,panel.source_rect_xyxy)||!['same','different','unknown'].includes(String(source.calibration_relation)))continue;
  try{
   const mapped=transformCoordinates(source.processing_rect_xyxy,panel,{edges:true,inverse:true});
   if(!rectangle(mapped)||!inside(mapped,panel.image_rect_xyxy))continue;
   result.push({window_id:entry.window_id as string,label:entry.title.trim()+' 计算区域',coordinates:[mapped[0]!,mapped[1]!,mapped[2]!,mapped[3]!],line_style:styles[result.length%styles.length]!});
  }catch{/* Unqualified rendering geometry remains absent, never clipped. */}
 }
 return result;
}

export function createSourceOverlay(document:BrowserDocument,object:unknown,collection:unknown,imageSize:readonly number[],scale:number):BrowserElement|null {
 if(imageSize.length!==2||!imageSize.every(n=>Number.isFinite(n)&&n>0&&n<=1e7)||!Number.isFinite(scale)||scale<1e-6||scale>1e4)return null;
 const panel=spatialPanel(object,collection),width=imageSize[0]!,height=imageSize[1]!;
 if(!panel||!inside(panel.image_rect_xyxy,[0,0,width,height]))return null;
 const outlines=sourceWindowOutlines(object,collection);if(!outlines.length)return null;
 const layer=document.createElement('div');layer.className='window-source-overlay';
 const namespace='http://www.w3.org/2000/svg',svg=document.createElementNS(namespace,'svg');svg.setAttribute('class','window-source-svg');svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','FFT 整数计算区域；不是当前选区或原始浮点 ROI');
 const fontSize=11/scale,gap=3/scale,clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
 for(const [index,outline]of outlines.entries()){
  const [x0,y0,x1,y1]=outline.coordinates,group=document.createElementNS(namespace,'g');group.setAttribute('class',`window-source-outline window-source-outline-${index}`);group.setAttribute('data-window-id',outline.window_id);
  const rect=document.createElementNS(namespace,'rect');rect.setAttribute('class','window-source-region');rect.setAttribute('x',x0);rect.setAttribute('y',y0);rect.setAttribute('width',x1-x0);rect.setAttribute('height',y1-y0);rect.setAttribute('fill','none');rect.setAttribute('stroke','currentColor');rect.setAttribute('stroke-width',1.5);rect.setAttribute('vector-effect','non-scaling-stroke');
  if(outline.line_style!=='solid')rect.setAttribute('stroke-dasharray',outline.line_style==='dashed'?'7 4':'2 3');
  const text=document.createElementNS(namespace,'text');text.setAttribute('class','window-source-label');text.setAttribute('x',clamp(x0+gap,0,Math.max(0,width-gap)));text.setAttribute('y',clamp(index%2?y1+fontSize+gap:y0-gap,Math.min(fontSize+gap,height),Math.max(Math.min(fontSize+gap,height),height-gap)));text.setAttribute('font-size',fontSize);text.setAttribute('fill','currentColor');text.textContent=outline.label;
  group.append(rect,text);svg.append(group);
 }
 layer.append(svg);return layer;
}
