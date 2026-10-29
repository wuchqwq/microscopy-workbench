import type {FigureState,FigureObject,FigurePreferences,FigureBase,CompositionRecipe,CompositionSlot,CompositionPanel,ImageSlot,ProfileSlot,SpatialSource} from './figure-contracts.mjs';
import type {ProfileResult} from './data-probe-contracts.mjs';
import type {FigureMark} from './figure-contracts.mjs';
import type {AnnotationLegend,Box} from './presentation-contracts.mjs';
import type {BrowserDocument,BrowserBlobConstructor,BrowserURL,BrowserImageConstructor,BrowserTextEncoderConstructor,BrowserEnvironment,BlobPort} from './browser-ports.mjs';
export type {CompositionRecipe,CompositionSlot,CompositionPanel,ImageSlot,ProfileSlot} from './figure-contracts.mjs';
declare const document:BrowserDocument;declare const Image:BrowserImageConstructor;declare const Blob:BrowserBlobConstructor;declare const URL:BrowserURL;declare const TextEncoder:BrowserTextEncoderConstructor;declare function atob(value:string):string;declare const crypto:{subtle:{digest(name:string,bytes:Uint8Array):Promise<ArrayBuffer>}};
interface ResolvedImage {slot:ImageSlot;state:FigureState;marks:FigureMark[];base64:string;width:number;height:number;bytes:Uint8Array;spatialSource:SpatialSource|null;}
interface ResolvedProfile {slot:ProfileSlot;profile:ProfileResult;plot:ReturnType<typeof profilePlot>;spatialSource?:never;state?:never;}
type ResolvedPanel=ResolvedImage|ResolvedProfile;
interface ROIOutline {roi_slot:number;source_rect_xyxy:readonly number[];coordinates:readonly number[];}
interface PanelBox extends Box {font:number;}
interface LegendLayout {rows:{entry:AnnotationLegend;lines:string[];y:number}[];width:number;fontSize:number;padding:number;textX:number;textWidth:number;lineHeight:number;height:number;}
// Presentation-only composition of immutable saved views and profile records.
// The provider remains authoritative; layout never invokes a scientific tool.
import {makeFigureRecipe,readFigureRecipe,recipeIdentity,figureDisplayParameters,figureScaleBar,figureZip,pngDpi} from './figure-export.mjs';
import {layoutAnnotations,renderAnnotationsSVG} from './annotation-presentation.mjs';
import {transformCoordinates,coordinateSpace} from './coordinates.mjs';
import {profilePlot,profileTicks,profileTickLabels} from './data-probes.mjs';
import {equalRecords} from './viewer-state.mjs';

const SCHEMA='microscopy-figure-composition-v1',ID=/^[a-f0-9]{32}$/,SHA=/^[a-f0-9]{64}$/,MAX_JSON=512*1024,MAX_PNG=2*1024*1024;
const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T,record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail: (message:string)=>never=(message)=>{throw new Error(message);};
const fields=(value:unknown,allowed:readonly string[])=>{if(!record(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('图版配方含未知字段或无效记录');};
const xml=(value:unknown)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'�').replace(/[&<>"']/g,c=>(({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'} as Record<string,string>)[c]));
const number=(value:number)=>String(Math.round(value*1000)/1000);
function boundedJSON(value:unknown){let text;try{text=JSON.stringify(value);}catch{fail('图版配方不是有效 JSON');}if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_JSON)fail('图版配方超过大小上限');return text;}
function validateSlot<T extends CompositionSlot>(slot:T):T{
 if(!record(slot)||!['image','profile'].includes(slot.kind)||typeof slot.title!=='string'||[...slot.title].length>80)fail('子图类型或标题无效（标题最多 80 字）');
 if(slot.kind==='image'){
  fields(slot,['kind','title','source_object_id','recipe','asset','scale_bar']);fields(slot.asset,['object_id','clean_png_sha256']);
  if(!ID.test(slot.source_object_id??'')||!ID.test(slot.asset.object_id??'')||!SHA.test(slot.asset.clean_png_sha256??''))fail('子图缺少保存对象或干净底图校验');
  const recipe=slot.recipe;if(!record(recipe)||recipe.schema!=='mcp-dm-figure-v1'||recipe.source_object_id!==slot.source_object_id||!record(recipe.source)||!Array.isArray(recipe.source.anchors)||!Array.isArray(recipe.annotations)||recipe.annotations.length>128||!record(recipe.preferences))fail('子图缺少完整保存视图配方');
  figureDisplayParameters(recipe.display_recipe,recipe.source.panels);
  if(!['real-space','diffraction','multi-domain'].includes(recipe.preferences.preset as string)||!['analysis','figure'].includes(recipe.preferences.mode as string)||slot.scale_bar!==null&&!record(slot.scale_bar))fail('子图样式或比例尺记录无效');
 }else{
  fields(slot,['kind','title','object_id','scientific_grid_identity','xy_calibration']);
  if(!ID.test(slot.object_id??'')||!record(slot.scientific_grid_identity)||slot.xy_calibration!==null&&!record(slot.xy_calibration))fail('剖面缺少保存结果、科学网格或标定引用');
 }
 boundedJSON(slot);return slot;
}
export function validateComposition(recipe:CompositionRecipe):CompositionRecipe{
 fields(recipe,['schema','layout','font_pt','slots','roiOutlines','showLegend']);
 const count=recipe.layout==='2x2'?4:recipe.layout==='1x3'?3:null;
 if(recipe.schema!==SCHEMA||count===null||typeof recipe.font_pt!=='number'||!Number.isFinite(recipe.font_pt)||recipe.font_pt<7||recipe.font_pt>12||!Array.isArray(recipe.slots)||recipe.slots.length!==count)fail('图版需要完整的 2×2（4 图）或 1×3（3 图）布局与 7–12 pt 字号');
 for(const key of ['roiOutlines','showLegend'])if(recipe[key as keyof CompositionRecipe]!==undefined&&typeof recipe[key as keyof CompositionRecipe]!=='boolean')fail('图版显示开关必须是明确布尔值');
 recipe.slots.forEach(validateSlot);return JSON.parse(boundedJSON(recipe));
}
export function defaultCompositionTitle(value:{kind?:string;profile?:ProfileResult;object?:FigureObject;panels?:FigureObject['panels'];source_shape_yx?:readonly number[]}|null|undefined,{role}:{role?:string}={}){
 if(value?.kind==='profile'||value?.profile?.kind==='profile')return 'Intensity profile';
 const object=(value as Partial<FigureState>|null|undefined)?.object??value??{},panels=(object as FigureObject).panels??[];
 if((object as FigureObject).kind==='profile')return 'Intensity profile';
 if(['fft','fft_view'].includes((object as FigureObject).kind as string)||panels.some(panel=>panel.domain==='frequency'))return 'FFT';
 if(role==='ROI'||/^ROI\s*\[/u.test(role??''))return 'ROI';
 if(panels.length===1&&panels[0].domain==='spatial_pixels'){
  const rect=panels![0].source_rect_xyxy,shape=(object as FigureObject).source_shape_yx;
  if(Array.isArray(rect)&&Array.isArray(shape)&&shape.length===2)return equalRecords(rect,[0,0,shape[1],shape[0]])?'Original':'ROI';
  if(Array.isArray(rect)&&(rect[0]>0||rect[1]>0))return 'ROI';
 }
 if(['原图','全帧（新显示）','Original'].includes(role as string)||(object as FigureObject).kind==='frame')return 'Original';
 return 'Image';
}
export function makeImageSlot(state:FigureState,preferences:FigurePreferences,base:FigureBase,title=''):ImageSlot{
 if(!state?.object||!base||!equalRecords(base.panels,state.object.panels))fail('干净底图与保存视图的坐标映射不一致');
 const slot:ImageSlot={kind:'image',title:title.trim()?title:defaultCompositionTitle(state),source_object_id:state.object.object_id,recipe:makeFigureRecipe(state,preferences),asset:{object_id:base.object_id,clean_png_sha256:base.clean_png_sha256},scale_bar:base.scale_bar?.visible===true?copy(base.scale_bar):null};
 return copy(validateSlot(slot));
}
export function makeProfileSlot(profile:ProfileResult,title=''):ProfileSlot{
 if(profile?.kind!=='profile')fail('请选择已保存的剖面结果');profilePlot(profile);
 return copy(validateSlot({kind:'profile',title:title.trim()?title:defaultCompositionTitle(profile),object_id:profile.object_id!,scientific_grid_identity:profile.scientific_grid_identity,xy_calibration:profile.xy_calibration??null}));
}
function pngData(base64:unknown){
 if(typeof base64!=='string'||!base64.length||base64.length>Math.ceil(MAX_PNG/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))fail('干净底图编码无效或超过 2 MiB');
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 if(bytes.length<33||bytes.length>MAX_PNG||bytes.subarray(0,8).join(',')!=='137,80,78,71,13,10,26,10'||String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')fail('图版仅接受已核对的 PNG 底图');
 const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20);
 if(!width||!height||width>2048||height>2048||width*height>1048576)fail('保存底图尺寸超过有界显示范围');
 return {bytes,width,height};
}
function hydrate(recipe:CompositionRecipe,panels:readonly CompositionPanel[]):ResolvedPanel[]{
 if(!Array.isArray(panels)||panels.length!==recipe.slots.length)fail('图版解析必须返回全部槽位，不能丢弃子图');
 return recipe.slots.map((slot,index)=>{
  const panel:CompositionPanel=panels[index];if(!record(panel)||!equalRecords(panel.slot,slot))fail('图版槽位的解析顺序或保存引用不匹配');
  if(slot.kind==='profile'){
   const profile=panel.profile!;
   if(profile?.kind!=='profile'||profile.object_id!==slot.object_id||!equalRecords(profile.scientific_grid_identity,slot.scientific_grid_identity)||!equalRecords(profile.xy_calibration??null,slot.xy_calibration))fail('剖面保存记录、网格或标定与图版不一致');
   return {slot,profile,plot:profilePlot(profile)};
  }
  const state=panel.state!;
  if(state?.object?.object_id!==slot.source_object_id||!equalRecords(recipeIdentity(state),slot.recipe.source))fail('保存图像的科学身份或标定与图版不一致');
  const updates=readFigureRecipe(slot.recipe,state),styles=new Map(updates.map(value=>[value.annotation_id,value.presentation]));
  if(!equalRecords(panel.scale_bar??null,slot.scale_bar))fail('比例尺与保存的图版引用不一致');
  const data=pngData(panel.clean_png_base64),mappings=state.object.panels??[];
  if(mappings.some(p=>!Array.isArray(p.image_rect_xyxy)||p.image_rect_xyxy[0]<0||p.image_rect_xyxy[1]<0||p.image_rect_xyxy[2]>data.width||p.image_rect_xyxy[3]>data.height))fail('底图尺寸与科学坐标映射不一致');
  const marks=(state.object.annotations??[]).map(mark=>{
   let value:{-readonly[K in keyof FigureMark]:FigureMark[K]}={...copy(mark),presentation:copy(styles.get(mark.annotation_id)??mark.presentation??{})};
   if(mark.anchor){const matches=mappings.filter(p=>p.source_object_id===mark.anchor!.source_object_id&&coordinateSpace(p)===mark.anchor!.coordinate_space);if(matches.length!==1)return {...value,visibility:'outside_view'};value.coordinates=transformCoordinates(mark.anchor.coordinates,matches[0],{edges:['rectangle','polygon'].includes(mark.kind),inverse:true});}
   return value;
  });
  let spatialSource:SpatialSource|null=null;
  if(panel.spatial_source!==undefined){
   const source=panel.spatial_source;fields(source,['object_id','shape_yx','dtype','array_sha256','frame_identity']);
   if(!ID.test(source.object_id??'')||!SHA.test(source.array_sha256??'')||typeof source.dtype!=='string'||!Array.isArray(source.shape_yx)||source.shape_yx.length!==2||!source.shape_yx.every(v=>Number.isSafeInteger(v)&&v>0)||source.shape_yx[0]*source.shape_yx[1]>4194304||!ID.test(source.frame_identity?.source_object_id??'')||!Number.isSafeInteger(source.frame_identity?.frame_index)||source.frame_identity.frame_index!<0||!equalRecords(source.frame_identity,state.frame_identity)||source.object_id!==state.frame_identity?.frame_object_id||mappings.length!==1||mappings[0].domain!=='spatial_pixels'||mappings[0].source_object_id!==source.object_id)fail('ROI 轮廓缺少同一原始科学帧的完整证据');
   const rect=mappings[0].source_rect_xyxy;
   if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isSafeInteger)||rect[0]<0||rect[1]<0||rect[0]>=rect[2]||rect[1]>=rect[3]||rect[2]>source.shape_yx[1]||rect[3]>source.shape_yx[0]||state.object.source_shape_yx!==undefined&&!equalRecords(source.shape_yx,state.object.source_shape_yx))fail('ROI 轮廓的源矩形与保存帧尺寸不一致');
   spatialSource=copy(source);
  }
  return {slot,state,marks,base64:panel.clean_png_base64!,spatialSource,...data};
 });
}
function sourceROIOutlines(resolved:readonly ResolvedPanel[],enabled:boolean){
 const result=new Map<number,ROIOutline[]>();if(!enabled)return result;
 for(const [originalIndex,original]of resolved.entries()){
  const source=original.spatialSource,panel=original.state?.object?.panels?.[0];
  if(!source||!equalRecords(panel!.source_rect_xyxy,[0,0,source.shape_yx[1],source.shape_yx[0]]))continue;
  const calibration=original.state!.object.xy_calibration??original.state!.object.calibration_record??null;
  for(const [roiIndex,roi]of resolved.entries()){
   if(roiIndex===originalIndex||!roi.spatialSource||!equalRecords(roi.spatialSource,source)||!equalRecords(roi.state!.object.xy_calibration??roi.state!.object.calibration_record??null,calibration))continue;
   const rect=roi.state!.object.panels![0].source_rect_xyxy;if(equalRecords(rect,panel!.source_rect_xyxy))continue;
   const coordinates=transformCoordinates(rect!,panel!,{edges:true,inverse:true});
   if(!result.has(originalIndex))result.set(originalIndex,[]);result.get(originalIndex)!.push({roi_slot:roiIndex,source_rect_xyxy:copy(rect!),coordinates});
  }
 }
 return result;
}
export function compositionDimensions(layout:string,fontPt=8){
 const columns=layout==='2x2'?2:layout==='1x3'?3:null;if(!columns||!Number.isFinite(fontPt)||fontPt<7||fontPt>12)fail('无效的图版布局或字号');
 const width=Math.round(180/25.4*300),margin=24,gap=24,font=fontPt*300/72,cellWidth=(width-2*margin-(columns-1)*gap)/columns,bodyHeight=Math.round(cellWidth*.8),headerHeight=Math.ceil(font*1.7),rows=layout==='2x2'?2:1,height=Math.ceil(2*margin+rows*(bodyHeight+headerHeight)+(rows-1)*gap);
 if(width*height>6000000)fail('图版超过 6 百万像素导出预算');
 return {width,height,dpi:300,width_mm:180,height_mm:height/300*25.4,columns,rows,margin,gap,font,cellWidth,bodyHeight,headerHeight};
}
// Conservative Arial widths keep all legend words at the common figure font.
// This affects the presentation footer only, never labels or scientific anchors.
const legendTextWidth=(text:string,font:number)=>[...text].reduce((sum,char)=>sum+(/\s/.test(char)?.34:/[ilI1.,'|]/.test(char)?.3:/[MW@]/.test(char)?1:/[^\x00-\x7f]/.test(char)?1:.64)*font,0);
function wrapLegend(text:unknown,width:number,font:number){
 const lines=[];let current='';
 for(const word of String(text).trim().split(/\s+/u)){
  if(legendTextWidth(word,font)>width){
   if(current){lines.push(current);current='';}
   for(const char of word){if(current&&legendTextWidth(current+char,font)>width){lines.push(current);current='';}current+=char;}
  }else if(current&&legendTextWidth(current+' '+word,font)>width){lines.push(current);current=word;}
  else current+=(current?' ':'')+word;
 }
 if(current)lines.push(current);return lines.length?lines:[''];
}
export function compositionLegendLayout(entries:readonly AnnotationLegend[],{width,fontSize}:{width?:number;fontSize?:number}={}){
 if(!Array.isArray(entries)||!Number.isFinite(width)||!Number.isFinite(fontSize)||fontSize!<=0||width!<fontSize!*4)fail('图例版面无效');
 const padding=fontSize!*.35,textX=padding+fontSize!*1.05,textWidth=width!-padding-textX,lineHeight=fontSize!*1.18,gap=fontSize!*.22;let y=padding;
 const rows=entries.map(entry=>{const lines=wrapLegend(entry.label,textWidth,fontSize!),row={entry,lines,y};y+=lines.length*lineHeight+gap;return row;});
 const occupied=rows.length?Math.min(width!,textX+Math.max(...rows.flatMap(row=>row.lines.map(line=>legendTextWidth(line,fontSize!))))+padding):0;
 return {rows,width:occupied,fontSize:fontSize!,padding,textX,textWidth,lineHeight,height:rows.length?y-gap+padding:0};
}
function legendSVG(model:LegendLayout){
 const {width,height,fontSize:font,padding,textX,lineHeight}=model;let svg=`<rect width="${number(width)}" height="${number(height)}" rx="3" fill="#11151b" fill-opacity="0.78"/>`;
 model.rows.forEach(({entry,lines,y},index)=>{
  // Reuse the same shape renderer as annotation legends. Text wraps below it
  // without reducing the font or deleting candidate/confirmation wording.
  const symbol={id:'legend-'+index,mark:{kind:'point',text:'',status:entry.status??''},coordinates:[padding+font*.36,y+font*.52],shape:entry.shape,color:entry.color,lineWidth:.9,radius:font*.31,dash:entry.dash??[],geometryVisible:true,label:{visible:false,text:''}};
  svg+=renderAnnotationsSVG({items:[symbol],legend:[],width,height,scale:1,mode:'figure'},{includeRoot:false,figureLayout:{legend:false}});
  svg+=`<text data-part="legend-label" x="${number(textX)}" y="${number(y+font)}" fill="#f1f4f5" font-size="${number(font)}"><title>${xml(entry.label)}</title>${lines.map((line,i)=>`<tspan x="${number(textX)}" dy="${i?number(lineHeight):'0'}">${xml(line)}</tspan>`).join('')}</text>`;
 });return svg;
}
function imageSVG(panel:ResolvedImage,box:PanelBox,index:number,{showLegend=true,outlines=[]}:{showLegend?:boolean;outlines?:readonly ROIOutline[]}={}){
 const {width,height,marks,slot}=panel,prefs=slot.recipe.preferences,baseScale=Math.min(box.width/width,box.height/height),probe=layoutAnnotations(marks,{...prefs,width,height,mode:'figure',scale:baseScale});
 const legend=compositionLegendLayout(showLegend&&prefs.legend?probe.legend:[],{width:box.width,fontSize:box.font}),legendHeight=legend.height;
 if(legendHeight>box.height*.65)fail('子图图例超过当前版面；请使用更简洁的保存图面');
 const available=box.height-legendHeight,scale=Math.min(box.width/width,available/height),x=box.x+(box.width-width*scale)/2,y=box.y+(available-height*scale)/2;
 const exportMarks=marks.map(mark=>({...mark,presentation:{...mark.presentation,label:{...mark.presentation?.label,font_size:box.font}}}));
 const annotations=layoutAnnotations(exportMarks,{...prefs,width,height,mode:'figure',scale});
 const bar=prefs.scaleBar?figureScaleBar(slot.scale_bar):null;
 const overlay=renderAnnotationsSVG(annotations,{includeRoot:false,figureLayout:{legend:false,scaleBar:bar,fontSize:box.font/scale}});
 const roiSVG=outlines.map(outline=>{const [left,top,right,bottom]=outline.coordinates,geometry=`x="${number(left)}" y="${number(top)}" width="${number(right-left)}" height="${number(bottom-top)}"`;return `<g data-part="source-roi-outline" data-roi-slot="${outline.roi_slot}"><title>${xml('ROI '+String.fromCharCode(97+outline.roi_slot))}</title><rect ${geometry} fill="none" stroke="#11151b" stroke-width="${number(4/scale)}"/><rect ${geometry} fill="none" stroke="#79d9ee" stroke-width="${number(2/scale)}"/><text x="${number(left+box.font*.18/scale)}" y="${number(top+box.font/scale)}" fill="#79d9ee" stroke="#11151b" stroke-width="${number(1/scale)}" paint-order="stroke fill" font-size="${number(box.font/scale)}">${String.fromCharCode(97+outline.roi_slot)}</text></g>`;}).join('');
 let result=`<g data-part="saved-image" data-source-object-id="${slot.source_object_id}" transform="translate(${number(x)} ${number(y)}) scale(${number(scale)})"><image width="${width}" height="${height}" href="data:image/png;base64,${panel.base64}"/>${roiSVG}${overlay}</g>`;
 if(legendHeight)result+=`<g data-part="panel-legend" transform="translate(${number(box.x)} ${number(box.y+box.height-legendHeight)})">${legendSVG(legend)}</g>`;
 return result;
}
function profileSVG(panel:ResolvedProfile,box:PanelBox){
 const model=panel.plot,range=model.range,fs=box.font;
 if(!range)return `<text x="${number(box.x+fs)}" y="${number(box.y+fs*2)}" font-size="${number(fs)}">没有有限的保存采样值</text>`;
 const yTicks=profileTicks(range.ymin,range.ymax,4),yLabels=profileTickLabels(yTicks),yLabelWidth=Math.max(...yLabels.map(value=>[...value].length))*.62;
 const left=box.x+fs*Math.max(3.6,yLabelWidth+.5),right=box.x+box.width-fs*.6,top=box.y+fs*1.4,bottom=box.y+box.height-fs*2.4;
 if(right<=left||bottom<=top)fail('剖面坐标轴超出版面预算');
 const px=(value:number)=>range.xmax===range.xmin?(left+right)/2:left+(value-range.xmin)/(range.xmax-range.xmin)*(right-left),py=(value:number)=>range.ymax===range.ymin?(top+bottom)/2:bottom-(value-range.ymin)/(range.ymax-range.ymin)*(bottom-top);
 let body=`<g data-part="saved-profile" data-result-object-id="${panel.slot.object_id}"><path d="M ${number(left)} ${number(top)} V ${number(bottom)} H ${number(right)}" fill="none" stroke="#273849" stroke-width="1.5"/>`;
 const xTicks=profileTicks(range.xmin,range.xmax,4),xLabels=profileTickLabels(xTicks);
 for(const [index,value]of xTicks.entries()){const x=px(value),anchor=xTicks.length===1?'middle':index===0?'start':index===xTicks.length-1?'end':'middle';body+=`<path d="M ${number(x)} ${number(bottom)} v 6" stroke="#273849"/><text x="${number(x)}" y="${number(bottom+fs*1.25)}" text-anchor="${anchor}" font-size="${number(fs)}">${xml(xLabels[index])}</text>`;}
 for(const [index,value]of yTicks.entries()){const y=py(value);body+=`<path d="M ${number(left-6)} ${number(y)} h 6" stroke="#273849"/><text x="${number(left-fs*.3)}" y="${number(y+fs*.3)}" text-anchor="end" font-size="${number(fs)}">${xml(yLabels[index])}</text>`;}
 for(const segment of model.segments){const points=segment.map(([x,y])=>[range.xmax===range.xmin?(left+right)/2:left+(x-64)/476*(right-left),range.ymax===range.ymin?(top+bottom)/2:bottom-(158-y)/136*(bottom-top)]);body+=`<polyline data-part="profile-values" points="${points.map(point=>point.map(number).join(',')).join(' ')}" fill="none" stroke="#207b91" stroke-width="2"/>`;}
 body+=`<text x="${number((left+right)/2)}" y="${number(box.y+box.height-fs*.25)}" text-anchor="middle" font-size="${number(fs)}">${xml('距离 ('+(model.xLabel??'未知单位')+')')}</text><text x="${number(left)}" y="${number(box.y+fs*.9)}" font-size="${number(fs)}">${xml((model.yLabel??'数值')+'（单位未标定）')}</text></g>`;
 return body;
}
export function renderCompositionSVG({recipe,panels}:{recipe:CompositionRecipe;panels:readonly CompositionPanel[]}){
 const validated=validateComposition(recipe),resolved=hydrate(validated,panels),dimensions=compositionDimensions(validated.layout,validated.font_pt),d=dimensions;
 const outlines=sourceROIOutlines(resolved,validated.roiOutlines===true),outlineCount=[...outlines.values()].reduce((total,values)=>total+values.length,0);
 let content=`<rect width="${d.width}" height="${d.height}" fill="#ffffff"/>`;
 resolved.forEach((panel,index)=>{
  const x=d.margin+(index%d.columns)*(d.cellWidth+d.gap),y=d.margin+Math.floor(index/d.columns)*(d.bodyHeight+d.headerHeight+d.gap),clip='panel-'+index;
  const title=panel.slot.title.trim()?panel.slot.title:defaultCompositionTitle(panel.slot.kind==='profile'?(panel as ResolvedProfile).profile:(panel as ResolvedImage).state);
  content+=`<defs><clipPath id="${clip}"><rect x="${number(x)}" y="${number(y)}" width="${number(d.cellWidth)}" height="${d.headerHeight+d.bodyHeight}"/></clipPath></defs><g data-composition-slot="${index}" clip-path="url(#${clip})"><title>${xml(title)}</title><text data-part="panel-heading" x="${number(x)}" y="${number(y+d.font*1.15)}" font-size="${number(d.font)}" font-weight="600">${String.fromCharCode(97+index)}${title?'  '+xml(title):''}</text>`;
  const box={x,y:y+d.headerHeight,width:d.cellWidth,height:d.bodyHeight,font:d.font};content+=panel.slot.kind==='image'?imageSVG(panel as ResolvedImage,box,index,{showLegend:validated.showLegend!==false,outlines:outlines.get(index)??[]}):profileSVG(panel as ResolvedProfile,box);content+='</g>';
 });
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="180mm" height="${number(d.height_mm)}mm" viewBox="0 0 ${d.width} ${d.height}" font-family="Arial, Helvetica, sans-serif" fill="#17222e" role="img" aria-label="Microscopy figure composition"><metadata>${xml(JSON.stringify(validated))}</metadata>${content}</svg>`;
 return {svg,recipe:validated,...dimensions,roi_outline_count:outlineCount,roi_outline_diagnostics:validated.roiOutlines===true?(outlineCount?'verified_saved_source':'no_verified_original_roi_pair'):'disabled'};
}
async function verifyAssets(recipe:CompositionRecipe,panels:readonly CompositionPanel[]){
 if(!(globalThis as typeof globalThis & BrowserEnvironment).crypto?.subtle)fail('当前浏览器缺少安全的底图校验能力');
 for(let index=0;index<recipe.slots.length;index++)if(recipe.slots[index].kind==='image'){
  const bytes=pngData(panels[index].clean_png_base64).bytes,digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
  if(digest!==(recipe.slots[index] as ImageSlot).asset.clean_png_sha256)fail('干净底图 SHA-256 与保存配方不一致');
 }
}
export async function buildCompositionBundle({recipe,panels}:{recipe:CompositionRecipe;panels:readonly CompositionPanel[]}){
 const rendered=renderCompositionSVG({recipe,panels});await verifyAssets(rendered.recipe,panels);
 const image=new Image(),url=URL.createObjectURL(new Blob([rendered.svg],{type:'image/svg+xml'}));
 try{
  image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=rendered.width;canvas.height=rendered.height;const ctx=canvas.getContext('2d');if(!ctx)fail('浏览器不能创建图版画布');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<BlobPort>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('图版 PNG 导出失败')),'image/png')),bytes=pngDpi(new Uint8Array(await blob.arrayBuffer()),300);
  const files={'composition.svg':rendered.svg,'composition.png':bytes,'composition.json':JSON.stringify(rendered.recipe,null,2)};return {blob:figureZip(files),files,recipe:rendered.recipe};
 }finally{URL.revokeObjectURL(url);}
}
