import {readTone,colorAt} from './display-tone.mjs';
import type {CanvasContext} from './browser-ports.mjs';
import type {RenderedMark} from './presentation-contracts.mjs';
export interface PaintMark extends RenderedMark {readonly arrow_length?:number|null;readonly line_width?:number;readonly arrowhead_size?:number;readonly text?:string;}
export const markColors: Partial<Record<string,string>> & {cyan:string}={white:'#ffffff',cyan:'#45e8ff',orange:'#ff8c32',amber:'#ffba30',green:'#00e060'};
export function tonePixels(source:ArrayLike<number>,{oldGamma=1,gamma=1,range,low,high,oldTone,tone}: {oldGamma?:number;gamma?:number;range?:readonly number[];low?:number;high?:number;oldTone?:unknown;tone?:unknown}={}){
 const result=new Uint8ClampedArray(source),before=readTone(oldTone),after=readTone(tone),adjust=range&&Number.isFinite(low)&&Number.isFinite(high)&&high!>low!&&(low!==range[0]||high!==range[1]);
 if(oldGamma===gamma&&!adjust&&JSON.stringify(before)===JSON.stringify(after))return result;
 if(before.colormap==='gray'&&after.colormap==='gray'){
  const lut=new Uint8ClampedArray(256);
  for(let v=0;v<256;v++){let n=Math.pow(before.reverse?1-v/255:v/255,oldGamma);n=before.contrast===0?.5:(n-.5-before.brightness)/before.contrast+.5;if(adjust)n=Math.max(0,Math.min(1,(range![0]+n*(range![1]-range![0])-low!)/(high!-low!)));n=Math.pow(Math.max(0,Math.min(1,(n-.5)*after.contrast+.5+after.brightness)),1/gamma);lut[v]=255*(after.reverse?1-n:n);}
  for(let i=0;i<result.length;i+=4)for(let c=0;c<3;c++)result[i+c]=lut[result[i+c]];return result;
 }
 const colors=Array.from({length:256},(_,i)=>colorAt(i/255,before)),inverse=new Map<number,number>();
 for(let i=0;i<result.length;i+=4){
  const key=(result[i]<<16)|(result[i+1]<<8)|result[i+2];let raw=inverse.get(key);
  if(raw===undefined){let n=result[i]/255;
   if(before.colormap!=='gray'){let best=Infinity;for(let v=0;v<256;v++){const d=colors[v].reduce((sum,c,k)=>sum+(c-result[i+k])**2,0);if(d<best){best=d;n=v/255;}}}else if(before.reverse)n=1-n;
   n=Math.pow(n,oldGamma);raw=before.contrast===0?.5:(n-.5-before.brightness)/before.contrast+.5;inverse.set(key,raw);
  }
  let n=raw;if(adjust)n=Math.max(0,Math.min(1,(range![0]+n*(range![1]-range![0])-low!)/(high!-low!)));
  n=Math.pow(Math.max(0,Math.min(1,(n-.5)*after.contrast+.5+after.brightness)),1/gamma);
  const rgb=colorAt(n,after);for(let k=0;k<3;k++)result[i+k]=Math.floor(rgb[k]+.5);
 }return result;
}
export function drawMark(ctx: CanvasContext,mark: PaintMark,{selected=false,scale=1,draft=false}: {selected?:boolean;scale?:number;draft?:boolean}={}){
 if(mark.status==='retracted'||mark.visibility==='outside_view')return;
 let c=mark.coordinates;
 if(mark.kind==='arrow'){
  if(mark.arrow_render_coordinates)c=mark.arrow_render_coordinates;
  else if(c?.length===4){const [x0,y0,x1,y1]=c,d=Math.hypot(x1-x0,y1-y0),n=mark.arrow_length===null?1:Math.min(1,(mark.arrow_length??24)/d);c=[x1+(x0-x1)*n,y1+(y0-y1)*n,x1,y1];}
 }
 if(!Array.isArray(c)||c.length<2)return;
 ctx.save();ctx.strokeStyle=ctx.fillStyle=markColors[mark.color as string]??markColors.cyan;ctx.lineWidth=mark.line_width??(mark.kind==='arrow'?3:1);ctx.setLineDash(draft?[4,3]:[]);
 if(mark.kind==='point'){ctx.beginPath();ctx.arc(c[0],c[1],3,0,Math.PI*2);ctx.stroke();}
 else if(mark.kind==='rectangle')ctx.strokeRect(c[0],c[1],c[2]-c[0],c[3]-c[1]);
 else if(mark.kind!=='text'){
  ctx.beginPath();ctx.moveTo(c[0],c[1]);for(let i=2;i<c.length;i+=2)ctx.lineTo(c[i],c[i+1]);if(mark.kind==='polygon')ctx.closePath();ctx.stroke();
  if(mark.kind==='arrow'){const [x0,y0,x1,y1]=c,angle=Math.atan2(y1-y0,x1-x0),size=Math.min(mark.arrowhead_size??6,Math.hypot(x1-x0,y1-y0)/3);ctx.beginPath();ctx.moveTo(x1,y1);for(const a of [-.5,.5])ctx.lineTo(x1-size*Math.cos(angle+a),y1-size*Math.sin(angle+a));ctx.closePath();ctx.fill();}
 }
 if(mark.text){ctx.font='11px system-ui';ctx.fillText(mark.text,c[0]+4,c[1]-4);}
 if(selected){ctx.setLineDash([]);ctx.lineWidth=1/scale;const h=3/scale;for(let i=0;i<mark.coordinates.length;i+=2)ctx.strokeRect(mark.coordinates[i]-h,mark.coordinates[i+1]-h,h*2,h*2);}
 ctx.restore();
}
