import type {FigureState,FigurePreferences,FigureRecipe,ScaleBarRecord} from './figure-contracts.mjs';
import type {DisplayPanel,CalibrationView} from './presentation-contracts.mjs';
import type {BrowserDocument,BrowserElement,BrowserBlobConstructor,BrowserURL,BrowserImageConstructor,BrowserTextEncoderConstructor,BlobPort} from './browser-ports.mjs';
export type {FigureState,FigurePreferences,FigureRecipe,ScaleBarRecord} from './figure-contracts.mjs';
declare const document:BrowserDocument;declare const Image:BrowserImageConstructor;declare const Blob:BrowserBlobConstructor;declare const URL:BrowserURL;declare const TextEncoder:BrowserTextEncoderConstructor;
declare function setTimeout(callback:()=>void,ms:number):unknown;
interface DisplayInput extends Readonly<Record<string,unknown>> {readonly gamma?:number;readonly display_range?:readonly number[];readonly max_size?:number;readonly upscale?:boolean;readonly interpolation?:string;readonly representation?:string;readonly spectrum_axes?:boolean;readonly display_preset?:unknown;readonly display_preset_revision?:unknown;readonly frequency_rect?:readonly number[]|null;readonly spectrum_filter?:{readonly smooth_sigma_bins?:number;readonly background_sigma_bins?:number}|null;readonly scale_bar?:boolean;readonly component?:string;}
export interface DisplayParameters {gamma:number;display_range:number[];max_size:number;upscale:boolean;interpolation:string;scale_bar?:boolean;component?:string;representation?:string;spectrum_axes?:boolean;spectrum_filter?:unknown;frequency_rect?:readonly number[];}
// Figure artifacts reuse a saved scalar rendering. Enlarging PNG adds no data.
import {layoutAnnotations,renderAnnotationsSVG} from './annotation-presentation.mjs';
import {equalRecords} from './viewer-state.mjs';
const enc=new TextEncoder(),copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
export function recipeIdentity(state:FigureState){const calibration=state.object.xy_calibration??state.object.calibration_record??state.object.calibration??null;return {panels:copy(state.object.panels??[]),frame:state.frame_identity??null,anchors:(state.object.annotations??[]).map(m=>({annotation_id:m.annotation_id,kind:m.kind,anchor:m.anchor??null,status:m.status})),grid:state.object.scientific_grid_identity??null,calibration:calibration?Object.fromEntries(['calibration_id','revision','status','coordinate_domain','xy_scale','scale','unit','dc_index_xy'].filter(k=>(calibration as Readonly<Record<string,unknown>>)[k]!==undefined).map(k=>[k,copy((calibration as Readonly<Record<string,unknown>>)[k])])):null};}
// Only authoritative display controls are replayed; renderer provenance is
// retained in display_recipe but is never sent back as processing parameters.
export function figureDisplayParameters(display:DisplayInput|null|undefined,panels:readonly DisplayPanel[]|null|undefined){
 const bad=():never=>{throw new Error('图面配方缺少完整、有效的显示参数；请从原图版本重新导出');};
 if(!display||typeof display!=='object'||Array.isArray(display)||!Array.isArray(panels)||!panels!.length)bad();
 const {gamma,display_range:range,max_size:maximum,upscale,interpolation}=display!;
 if(!Number.isFinite(gamma)||gamma!<.05||gamma!>20||!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]>range[1]||!Number.isSafeInteger(maximum)||maximum!<32||maximum!>1024||typeof upscale!=='boolean'||!['nearest','lanczos'].includes(interpolation as string))bad();
 const params:DisplayParameters={gamma:gamma!,display_range:copy(range) as number[],max_size:maximum!,upscale:upscale!,interpolation:interpolation!},spectral=panels!.every(p=>p.domain==='frequency');
 if(panels!.some(p=>p.domain==='frequency')&&!spectral)bad();
 if(spectral){
  if(display!.component!==undefined)bad();
  if(!['log_amplitude','amplitude','power'].includes(display!.representation as string)||display!.scale_bar!==undefined||display!.spectrum_axes!==undefined&&typeof display!.spectrum_axes!=='boolean'||display!.spectrum_axes===true&&maximum!<256||display!.display_preset!=null&&(display!.display_preset!=='fft_detail'||display!.display_preset_revision!==2))bad();
  const full=[0,0,panels![0].fft_shape_yx?.[1],panels![0].fft_shape_yx?.[0]],rect=display!.frequency_rect===null?full:display!.frequency_rect??panels![0].fft_rect_xyxy??full,shape=panels![0].fft_shape_yx;
  if(panels!.length!==1||!Array.isArray(shape)||shape.length!==2||!shape.every(v=>Number.isSafeInteger(v)&&v>0)||!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isSafeInteger(v)&&v>=0)||rect[0]>=rect[2]||rect[1]>=rect[3]||rect[2]>shape[1]||rect[3]>shape[0])bad();
  const filter=display!.spectrum_filter??null;
  if(filter!==null&&(typeof filter!=='object'||Array.isArray(filter)||Object.keys(filter).some(k=>!['smooth_sigma_bins','background_sigma_bins'].includes(k))||!Number.isFinite(filter.smooth_sigma_bins!)||filter.smooth_sigma_bins!<0||filter.smooth_sigma_bins!>4||!Number.isFinite(filter.background_sigma_bins!)||filter.background_sigma_bins!<1||filter.background_sigma_bins!>64||filter.background_sigma_bins!<=filter.smooth_sigma_bins!))bad();
  Object.assign(params,{representation:display!.representation,spectrum_axes:display!.spectrum_axes??false,spectrum_filter:copy(filter),frequency_rect:copy(rect)});
 }else{
  if(!panels!.every(p=>['spatial_pixels','source_array_indices'].includes(p.domain))||typeof display!.scale_bar!=='boolean'||['representation','spectrum_filter','spectrum_axes','frequency_rect'].some(k=>display![k]!==undefined))bad();
  params.scale_bar=display!.scale_bar;
  if(display!.component!==undefined){if(!['real','imag','amplitude','power'].includes(display!.component as string))bad();params.component=display!.component;}
 }
 return params;
}
export function makeFigureRecipe(state:FigureState,preferences:FigurePreferences):FigureRecipe{return {schema:'mcp-dm-figure-v1',source_object_id:state.object.object_id,source:recipeIdentity(state),display_recipe:copy(state.effective_display??state.object.display??{}),preferences:copy(preferences),annotations:(state.object.annotations??[]).filter(m=>m.annotation_id).map(m=>({annotation_id:m.annotation_id,presentation:copy(m.presentation??{})})),limitation:'Display recipe only. Enlarged PNG adds no measured resolution. Scientific arrays, anchors and confirmation states are unchanged.'};}
export function readFigureRecipe(value:FigureRecipe|null|undefined,state:FigureState){
 if(!value||value.schema!=='mcp-dm-figure-v1'||!equalRecords(value.source,recipeIdentity(state)))throw new Error('图面配方的科学锚点、标定或网格与当前图不一致；请先打开原图版本');
 if(!/^[a-f0-9]{32}$/.test(value.source_object_id??''))throw new Error('图面配方缺少原始显示版本');
 figureDisplayParameters(value.display_recipe,value.source.panels);
 if(!Array.isArray(value.annotations)||value.annotations.length>128||!value.preferences||!['real-space','diffraction','multi-domain'].includes(value.preferences.preset as string)||!['analysis','figure'].includes(value.preferences.mode as string))throw new Error('无效的图面配方');
 const known=new Set((state.object.annotations??[]).map(m=>m.annotation_id)),seen=new Set();
 if(value.annotations.length!==known.size)throw new Error('无效的图面配方：缺少完整或含重复的标签样式引用');
 return value.annotations.map(m=>{if(!known.has(m.annotation_id)||seen.has(m.annotation_id)||!m.presentation||typeof m.presentation!=='object'||Array.isArray(m.presentation))throw new Error('无效或重复的标签引用');seen.add(m.annotation_id);return {annotation_id:m.annotation_id,presentation:copy(m.presentation)};});
}
export function figureScaleBar(record:ScaleBarRecord|null|undefined){if(!record?.visible||!Array.isArray(record.image_endpoints_xyxy)||!Number.isFinite(record.length)||(record.length as number)<=0||typeof record.unit!=='string')return null;const [x,y,x1]=record.image_endpoints_xyxy;if(![x,y,x1].every(Number.isFinite))return null;return {x,y,length:x1-x,label:`${record.length} ${record.unit}`,color:'#fff'};}
export function figureDimensions(width:number,height:number,columns='single'){const outWidth=Math.round((columns==='double'?180:85)/25.4*300),outHeight=Math.round(outWidth*height/width);if(width<=0||height<=0||outHeight>8192||outWidth*outHeight>16000000)throw new Error('图面尺寸超过导出上限');return {width:outWidth,height:outHeight,width_mm:columns==='double'?180:85,dpi:300};}
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// Small store-only ZIP: no compression dependency, bounded public figure files.
export function figureZip(files:Readonly<Record<string,string|Uint8Array>>){let offset=0;const locals:Uint8Array[]=[],central:Uint8Array[]=[];for(const [name,input]of Object.entries(files)){if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw new Error('Invalid figure filename');const data=typeof input==='string'?enc.encode(input):input,n=enc.encode(name),crc=crc32(data),head=new Uint8Array(30+n.length),v=new DataView(head.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);head.set(n,30);locals.push(head,data);const c=new Uint8Array(46+n.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,n.length,true);d.setUint32(42,offset,true);c.set(n,46);central.push(c);offset+=head.length+data.length;}
 const centralSize=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);return new Blob([...locals,...central,end],{type:'application/zip'});}
export function pngDpi(bytes:Uint8Array,dpi=300){
 const payload=new Uint8Array(9),view=new DataView(payload.buffer),ppm=Math.round(dpi/.0254);view.setUint32(0,ppm);view.setUint32(4,ppm);payload[8]=1;
 const chunk=new Uint8Array(21),data=new DataView(chunk.buffer);data.setUint32(0,9);chunk.set(enc.encode('pHYs'),4);chunk.set(payload,8);data.setUint32(17,crc32(chunk.subarray(4,17)));
 const parts=[bytes.subarray(0,8)];let cursor=8,inserted=false;
 while(cursor+12<=bytes.length){const length=new DataView(bytes.buffer,bytes.byteOffset+cursor,4).getUint32(0),end=cursor+12+length;if(end>bytes.length)throw new Error('Invalid generated PNG');const type=String.fromCharCode(...bytes.subarray(cursor+4,cursor+8));if(!inserted&&(type==='IDAT'||type==='pHYs')){parts.push(chunk);inserted=true;}if(type!=='pHYs')parts.push(bytes.subarray(cursor,end));cursor=end;}
 if(!inserted||cursor!==bytes.length)throw new Error('Invalid generated PNG');const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){result.set(p,at);at+=p.length;}return result;
}
async function png(canvas:BrowserElement){return pngDpi(new Uint8Array(await (await new Promise<BlobPort>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed')),'image/png'))).arrayBuffer()));}
async function decoded(src:string){const image=new Image();image.src=src;await image.decode();return image;}
export async function buildFigureBundle({state,marks,preferences,base64,scaleBar}:{state:FigureState;marks:readonly import('./figure-contracts.mjs').FigureMark[];preferences:FigurePreferences;base64:string;scaleBar?:ScaleBarRecord|null}){
 const image=await decoded('data:image/png;base64,'+base64),width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,ratio=figureDimensions(width,height,preferences.columns).width/width;
 // A common 8pt starting size at the requested 300dpi target. Geometry stays
 // in the exact saved rendering's coordinates for PNG/SVG alignment.
 const fontSize=(Number(preferences.fontPt)||8)*300/72/2.5;
 const exportMarks=marks.map(m=>({...m,presentation:{...m.presentation,label:{...m.presentation?.label,font_size:fontSize}}}));
 const layout=layoutAnnotations(exportMarks,{...preferences,width,height,mode:'figure',scale:ratio/2.5}),legendFont=Math.max(7,(Number(preferences.fontPt)||8)-1)*300/72/ratio;
 // A compact two-column legend lives below the image, never over a peak.
 const footer=preferences.legend&&layout.legend.length?Math.ceil((Math.ceil(layout.legend.length/2)*1.55+3.5)*legendFont):0,size=figureDimensions(width,height+footer,preferences.columns),figureHeight=size.height/ratio;
 const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#11151b';ctx.fillRect(0,0,size.width,size.height);ctx.drawImage(image,0,0,size.width,height*ratio);const clean=await png(canvas);
 const svg=renderAnnotationsSVG({...layout,height:figureHeight},{width,height:figureHeight,figureLayout:{scaleBar:preferences.scaleBar?figureScaleBar(scaleBar):null,legend:preferences.legend,legendFontSize:legendFont,legendX:0,legendY:height+legendFont*.6,legendColumns:2,letter:preferences.letter}});
 // SVG stays editable text/paths; viewBox is the same scientific display map.
 const sized=svg.replace(/<svg\b[^>]*>/,tag=>tag.replace(/\s(?:width|height)="[^"]*"/g,'').replace('<svg',`<svg width="${size.width_mm}mm" height="${size.width_mm*figureHeight/width}mm"`));
 const url=URL.createObjectURL(new Blob([sized],{type:'image/svg+xml'}));try{const overlay=await decoded(url);ctx.drawImage(overlay,0,0,size.width,size.height);}finally{URL.revokeObjectURL(url);}
 const recipe={...makeFigureRecipe(state,preferences),export:{...size,source_render_size:[width,height],viewBox:[0,0,width,figureHeight],legend_footer_pixels:footer,render_object_id:state.figure_base?.object_id??state.object.object_id,clean_render_sha256:state.figure_base?.clean_png_sha256??null},scale_bar:preferences.scaleBar?scaleBar??null:null};
 const files={'clean.png':clean,'annotations.svg':sized,'annotated.png':await png(canvas),'figure.json':JSON.stringify(recipe,null,2)};return {blob:figureZip(files),files,recipe};
}
export function downloadBlob(blob:BlobPort,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
