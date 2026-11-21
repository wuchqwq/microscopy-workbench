import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readTone,defaultTone,colorAt,palettes} from '../ui/image-panel/display-tone.mjs';
import {tonePixels} from '../ui/image-panel/viewer-render.mjs';
import {figureDisplayParameters} from '../ui/image-panel/figure-export.mjs';
test('canonical palettes match Python; invalid fields, colors and NaN refuse',()=>{
 assert.deepEqual(palettes,JSON.parse(readFileSync(new URL('../tools/display_colormaps.json',import.meta.url))));
 for(const raw of [{brightness:NaN},{contrast:-1},{contrast:5},{reverse:1},{colormap:'jet'},{colors:['#fff','#ffffff']},{unexpected:true},'invalid',[]])assert.throws(()=>readTone(raw));
});
test('independent normalized 256-step gradient crossed with brightness/contrast/gamma has <=1 final level error',()=>{
 const input=new Uint8ClampedArray(Array.from({length:256},(_,i)=>[i,i,i,255]).flat());
 for(const brightness of [-.2,0,.2])for(const contrast of [0,.5,1,2])for(const gamma of [.5,1,2])for(const colormap of ['gray','custom','viridis','cividis','magma']){
  const t=readTone({brightness,contrast,colormap,colors:['#123456','#fedcba']}),actual=tonePixels(input,{gamma,tone:t});
  for(let i=0;i<256;i++){
   const u=Math.min(1,Math.max(0,(i/255-.5)*contrast+.5+brightness)),z=u**(1/gamma);
   let rgb;
   if(colormap==='gray')rgb=[z*255,z*255,z*255];
   else{const stops=colormap==='custom'?['#123456','#fedcba']:palettes[colormap],q=z*(stops.length-1),a=Math.floor(q),b=Math.min(a+1,stops.length-1);rgb=[1,3,5].map(j=>parseInt(stops[a].slice(j,j+2),16)*(1-q+a)+parseInt(stops[b].slice(j,j+2),16)*(q-a));}
   rgb.forEach((v,k)=>assert.ok(Math.abs(actual[i*4+k]-Math.round(v))<=1));assert.equal(actual[i*4+3],255);
  }
 }
 assert.equal(input[255*4],255,'source unchanged');
});
test('unchanged applied palette bytes are copied exactly, no double tone; reverse endpoints',()=>{
 const t=readTone({colormap:'magma',brightness:.2}),input=new Uint8ClampedArray([12,89,213,255]);
 assert.deepEqual(tonePixels(input,{oldGamma:2,gamma:2,oldTone:t,tone:t,range:[0,1],low:0,high:1}),input);
 assert.deepEqual(colorAt(0,readTone({colormap:'custom',colors:['#123456','#abcdef'],reverse:true})),[171,205,239]);
});
test('figure restore retains validated display tone separate from scientific parameters',()=>{
 const tone=readTone({colormap:'cividis'}),display={gamma:1,display_range:[0,1],max_size:512,upscale:false,interpolation:'nearest',scale_bar:false,tone};
 assert.deepEqual(figureDisplayParameters(display,[{domain:'spatial_pixels'}]).tone,tone);
 assert.throws(()=>figureDisplayParameters({...display,tone:{brightness:9}},[{domain:'spatial_pixels'}]));
});

test('historical figures without tone and new explicit default tone are canonically compatible',()=>{
 const old={gamma:1,display_range:[0,255],max_size:512,upscale:false,interpolation:'nearest',scale_bar:false};
 assert.deepEqual(figureDisplayParameters(old,[{domain:'spatial_pixels'}]),figureDisplayParameters({...old,tone:defaultTone},[{domain:'spatial_pixels'}]));
});

test('slider DOM retains arbitrary valid saved precision and covers the full gamma contract',()=>{
 const html=readFileSync(new URL('../ui/image-panel/index.html',import.meta.url),'utf8');
 for(const name of ['brightness','contrast','gamma'])assert.match(html,new RegExp('id="'+name+'"[^>]*step="any"'));
 assert.match(html,/id="gamma"[^>]*min="0.05"[^>]*max="20"/);
});

test('three-point custom position is exact, nonuniform, reversible and strictly validated',()=>{
 const t=readTone({colormap:'custom',colors:['#000000','#ff0000','#ffffff'],positions:[0,.25,1]});
 assert.deepEqual(colorAt(.25,t),[255,0,0]);assert.deepEqual(colorAt(.125,t),[127.5,0,0]);assert.deepEqual(colorAt(.625,t),[255,127.5,127.5]);
 assert.deepEqual(colorAt(.75,{...t,reverse:true}),[255,0,0]);
 assert.deepEqual(figureDisplayParameters({gamma:1,display_range:[0,1],max_size:512,upscale:false,interpolation:'nearest',scale_bar:false,tone:t},[{domain:'spatial_pixels'}]).tone,t);
 for(const positions of [[0,1],[0,0,1],[0,1,1],[.1,.5,1],[0,.5,.9],[0,NaN,1],[0,Infinity,1],null])assert.throws(()=>readTone({...t,positions}));
 assert.equal(readTone({colormap:'custom',colors:['#000000','#ffffff']}).positions,undefined,'old palettes keep even interpolation');
});

test('dialog image preview stays in document flow instead of inheriting absolute scientific canvas positioning',()=>{
 const css=readFileSync(new URL('../ui/image-panel/style.css',import.meta.url),'utf8');assert.match(css,/#tone-dialog #tone-preview\{[^}]*position:static/);
});

test('native middle-position range includes every provider-valid interior value, without legacy 1%-99% clamping',()=>{
 const html=readFileSync(new URL('../ui/image-panel/index.html',import.meta.url),'utf8'),tag=html.match(/<input id="tone-mid-position"[^>]*>/)?.[0];assert.ok(tag);
 const min=Number(tag.match(/min="([^"]+)"/)[1]),max=Number(tag.match(/max="([^"]+)"/)[1]);assert.equal(min,0);assert.equal(max,1);assert.match(tag,/step="any"/);
 for(const mid of [.001,.999,Number.MIN_VALUE,1-Number.EPSILON]){const tone=readTone({colormap:'custom',colors:['#102040','#f04010','#f8f0a0'],positions:[0,mid,1]});assert.equal(Math.max(min,Math.min(max,mid)),mid);assert.equal(tone.positions[1],mid);}
 for(const mid of [0,1])assert.throws(()=>readTone({colormap:'custom',colors:['#102040','#f04010','#f8f0a0'],positions:[0,mid,1]}),'endpoint coincidence is refused, never silently moved');
});
