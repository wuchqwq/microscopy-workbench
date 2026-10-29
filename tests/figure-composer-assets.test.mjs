import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {resolveComposition} from '../lib/figure_composer_assets.mjs';
import {makeFigureRecipe} from '../ui/image-panel/figure-export.mjs';
import {renderCompositionSVG} from '../ui/image-panel/figure-composer.mjs';

const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),F='f'.repeat(32),P='d'.repeat(32),T='e'.repeat(32);
const clone=v=>structuredClone(v),sha=v=>createHash('sha256').update(v).digest('hex');
function crc(bytes){let v=0xffffffff;for(const b of bytes){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return (v^0xffffffff)>>>0;}
function png(width=96,height=96){
 const chunk=(type,data)=>{const name=Buffer.from(type),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),8+data.length);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;
 const rows=Buffer.alloc((width+1)*height,73);for(let y=0;y<height;y++)rows[y*(width+1)]=0;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function fixture(){
 const bytes=png(),digest=sha(bytes),calls=[],cal={calibration_id:C,revision:1,status:'active',coordinate_domain:'real_space',source:'user_statement_not_independently_verified',xy_scale:{x:.02,y:-.03,unit:'nm'}};
 const bar={visible:true,length:.2,unit:'nm',source_length_pixels:10,image_endpoints_xyxy:[12,83,22,83],axis:'x',signed_scale:.02,calibration_id:C,provenance:cal.source,display_only:true};
 const panel={domain:'spatial_pixels',source_object_id:F,source_rect_xyxy:[0,0,96,96],image_rect_xyxy:[0,0,96,96]};
 const source={object_id:A,kind:'view',parent_object_id:F,dtype:'uint16',shape_yx:[96,96],axes:['y','x'],array_domain:'spatial',files_sha256:{'data.npy':'1'.repeat(64),'preview.png':digest},annotations:[],panels:[panel],xy_calibration:cal,scale_bar:bar,display:{gamma:1,display_range:[0,255],max_size:128,upscale:false,interpolation:'lanczos',scale_bar:true}};
 const base={...clone(source),object_id:B,parent_object_id:A,scale_bar:{visible:false},display:{...source.display,scale_bar:false}};
 const frame={object_id:F,kind:'frame',parent_object_id:T,source_object_id:T,frame_index:0,dtype:'uint16',shape_yx:[96,96],axes:['y','x'],files_sha256:{'data.npy':'1'.repeat(64)},xy_calibration:clone(cal)};
 const profile={object_id:P,parent_object_id:A,kind:'profile',request_id:'saved-profile',dtype:'uint16',component:'raw',coordinate_space:'source_pixels',scientific_grid_identity:{source_grid_object_id:F,shape_yx:[96,96],dtype:'uint16',array_sha256:'1'.repeat(64),source_rect_xyxy:[0,0,96,96],coordinate_space:'source_pixels'},xy_calibration:clone(cal),points:[[1,2],[3,2]],distance_unit:'pixel',physical_distance_unit:'nm',sampling:{interpolation:'nearest',line_width:1,sample_count:3,tie_rule:'floor(array_index+0.5)'},samples:{coordinates_xy:[[1,2],[2,2],[3,2]],sampled_coordinates_xy:[[1,2],[2,2],[3,2]],indices_xy:[[1,2],[2,2],[3,2]],value:[11,12,13],distance:[0,1,2],physical_distance:[0,.02,.04]},files_sha256:{'profile.npy':'2'.repeat(64),'profile.csv':'3'.repeat(64)}};
 const objects=new Map([[A,source],[B,base],[F,frame],[T,{object_id:T,kind:'tiff_source'}],[P,profile]]),states=new Map();
 for(const object of [source,base])states.set(object.object_id,{object:clone(object),effective_display:clone(object.display),frame_identity:{frame_object_id:F,frame_index:0,source_object_id:T},clean_png_base64:bytes.toString('base64'),clean_png_sha256:digest});
 const image={kind:'image',title:'saved image',source_object_id:A,recipe:makeFigureRecipe(states.get(A),{preset:'real-space',mode:'analysis',scaleBar:true}),asset:{object_id:B,clean_png_sha256:digest},scale_bar:clone(bar)};
 const line={kind:'profile',title:'saved profile',object_id:P,scientific_grid_identity:clone(profile.scientific_grid_identity),xy_calibration:clone(cal)};
 const recipe={schema:'microscopy-figure-composition-v1',layout:'1x3',font_pt:8,slots:[image,line,clone(image)]};
 const ports={async readState(id){calls.push(['state',id]);assert.ok(states.has(id),'missing saved image');return clone(states.get(id));},async readObject(id){calls.push(['object',id]);assert.ok(objects.has(id),'missing saved object');return clone(objects.get(id));},write(){assert.fail('resolver must never write');}};
 return {recipe,ports,states,objects,calls,source,base,profile,image,line,bytes};
}

test('hydrates every slot in saved order using only bounded read ports and retains source/science records',async()=>{
 const f=fixture(),before=clone(f.recipe),panels=await resolveComposition(f.recipe,f.ports);
 assert.equal(panels.length,3);assert.deepEqual(panels.map(p=>p.slot.kind),['image','profile','image']);assert.deepEqual(panels.map(p=>p.slot),before.slots);
 assert.equal(panels[0].state.object.object_id,A);assert.equal(panels[0].clean_png_base64,f.bytes.toString('base64'));assert.deepEqual(panels[0].scale_bar,f.source.scale_bar);
 assert.deepEqual(panels[1].profile,f.profile);assert.deepEqual(f.recipe,before);assert.deepEqual(f.calls,[['state',A],['state',B],['object',P]]);
 panels[0].state.object.xy_calibration.xy_scale.x=99;assert.equal(f.source.xy_calibration.xy_scale.x,.02,'hydrated edits cannot mutate provider records');
});

test('rejects malformed IDs, hashes, hidden fields, sizes and all late slots before any provider read',async()=>{
 for(const mutate of [r=>r.slots[2].source_object_id='../private',r=>r.slots[2].asset.clean_png_sha256='bad',r=>r.slots[2].asset.path='/private/data.png',r=>r.slots[2].recipe.display_recipe.gamma=NaN,r=>r.slots[1].scientific_grid_identity.array_sha256='bad',r=>r.slots.push(clone(r.slots[0])),r=>r.slots[0].recipe.limitation='x'.repeat(512*1024),r=>r.font_pt=Infinity]){
  const f=fixture();mutate(f.recipe);await assert.rejects(resolveComposition(f.recipe,f.ports));assert.deepEqual(f.calls,[]);
 }
});

test('refuses missing records and wrong image/profile response identities or kinds, never silently dropping a slot',async()=>{
 for(const change of ['missing','identity','kind','profile-id','profile-kind']){
  const f=fixture();if(change==='missing')f.states.delete(B);if(change==='identity')f.states.get(B).object.object_id=T;if(change==='kind')f.states.get(B).object.kind='frame';if(change==='profile-id')f.objects.get(P).object_id=T;if(change==='profile-kind')f.objects.get(P).kind='statistics';
  await assert.rejects(resolveComposition(f.recipe,f.ports));
 }
});

test('source recipe cannot substitute scientific anchors, grid, calibration, frame or display controls',async()=>{
 for(const mutate of [r=>r.slots[0].recipe.source.calibration.revision++,r=>r.slots[0].recipe.source.frame.frame_index++,r=>r.slots[0].recipe.source.grid={forged:true},r=>r.slots[0].recipe.display_recipe.gamma=2,r=>r.slots[0].recipe.source.anchors.push({annotation_id:'foreign',kind:'point',anchor:null,status:'hypothesized'})]){
  const f=fixture();mutate(f.recipe);await assert.rejects(resolveComposition(f.recipe,f.ports));
 }
});

test('clean base must match saved digest, scientific payload, mapping, frame, display and ancestry',async()=>{
 for(const change of ['hash','payload','mapping','frame','display','unrelated','unbound-file','annotated-png']){
  const f=fixture(),s=f.states.get(B);
  if(change==='hash')s.clean_png_sha256='0'.repeat(64);
  if(change==='payload')s.object.files_sha256['data.npy']='4'.repeat(64);
  if(change==='mapping')s.object.panels[0].source_rect_xyxy=[0,0,95,96];
  if(change==='frame')s.frame_identity.frame_index=1;
  if(change==='display')s.effective_display.gamma=2;
  if(change==='unrelated')s.object.parent_object_id=T;
  if(change==='unbound-file')s.object.files_sha256['preview.png']='0'.repeat(64);
  if(change==='annotated-png')s.object.annotations=[{annotation_id:'mark',kind:'text',status:'hypothesized',anchor:null}];
  await assert.rejects(resolveComposition(f.recipe,f.ports),undefined,change);
 }
});

test('malformed/oversized PNGs and maps outside actual IHDR dimensions are refused',async()=>{
 for(const change of ['format','oversized','dimensions','mapping']){
  const f=fixture(),s=f.states.get(B);let raw;
  if(change==='format')raw=Buffer.from('not a scientific PNG');
  if(change==='oversized')raw=Buffer.alloc(2*1024*1024+1);
  if(change==='dimensions')raw=png(2049,1);
  if(change==='mapping'){s.object.panels[0].image_rect_xyxy=[0,0,97,96];f.states.get(A).object.panels[0].image_rect_xyxy=[0,0,97,96];f.recipe.slots[0].recipe=makeFigureRecipe(f.states.get(A),f.recipe.slots[0].recipe.preferences);}
  if(raw){s.clean_png_base64=raw.toString('base64');s.clean_png_sha256=sha(raw);s.object.files_sha256['preview.png']=sha(raw);f.recipe.slots[0].asset.clean_png_sha256=sha(raw);}
  await assert.rejects(resolveComposition(f.recipe,f.ports),undefined,change);
 }
});

test('ordinary complex64 component profiles retain their complex source grid and explicit real value dtype',async()=>{
 const f=fixture();
 for(const id of [A,B,F]){f.objects.get(id).dtype='complex64';const state=f.states.get(id);if(state){state.object.dtype='complex64';state.object.display.component='imag';state.effective_display.component='imag';}}
 f.profile.dtype='complex64';f.profile.component='imag';f.profile.value_dtype='float32';f.profile.scientific_grid_identity.dtype='complex64';
 f.line.scientific_grid_identity=clone(f.profile.scientific_grid_identity);f.image.recipe=makeFigureRecipe(f.states.get(A),f.image.recipe.preferences);f.recipe.slots=[f.image,f.line,clone(f.image)];
 const before=clone(f.profile),panels=await resolveComposition(f.recipe,f.ports);assert.equal(panels[1].profile.dtype,'complex64');assert.equal(panels[1].profile.value_dtype,'float32');assert.equal(panels[1].profile.component,'imag');assert.deepEqual(f.profile,before);
 assert.doesNotThrow(()=>renderCompositionSVG({recipe:f.recipe,panels}));
});
test('profile values, finite sampling, exact grid/calibration and actual saved input bindings are required',async()=>{
 for(const change of ['values','coordinates','indices','wrong-in-bounds-index','sampled-coordinate','count','calibration','grid','unit','component','input-grid','input-calibration','missing-npy']){
  const f=fixture(),p=f.objects.get(P);
  if(change==='values')p.samples.value[1]=Infinity;
  if(change==='coordinates')p.samples.coordinates_xy.pop();
  if(change==='indices')p.samples.indices_xy[1]=[100,2];
  if(change==='wrong-in-bounds-index')p.samples.indices_xy[1]=[3,2];
  if(change==='sampled-coordinate')p.samples.sampled_coordinates_xy[1]=[3,2];
  if(change==='count')p.sampling.sample_count=4097;
  if(change==='calibration')p.xy_calibration.revision++;
  if(change==='grid')p.scientific_grid_identity.array_sha256='4'.repeat(64);
  if(change==='unit')p.physical_distance_unit='Angstrom';
  if(change==='component')p.component='amplitude';
  if(change==='input-grid')p.scientific_grid_identity.source_grid_object_id=T,f.recipe.slots[1].scientific_grid_identity=clone(p.scientific_grid_identity);
  if(change==='input-calibration')p.xy_calibration.revision++,f.recipe.slots[1].xy_calibration=clone(p.xy_calibration);
  if(change==='missing-npy')delete p.files_sha256['profile.npy'];
  await assert.rejects(resolveComposition(f.recipe,f.ports),undefined,change);
 }
});

test('pixel-only saved profiles remain valid without invented calibration or physical axis',async()=>{
 const f=fixture();f.objects.get(P).xy_calibration=null;f.objects.get(P).samples.physical_distance=null;f.objects.get(P).physical_distance_unit=null;
 f.recipe.slots[1].xy_calibration=null;
 // Use a profile-only composition so calibration on another image is irrelevant.
 f.recipe.slots=[clone(f.recipe.slots[1]),clone(f.recipe.slots[1]),clone(f.recipe.slots[1])];
 f.objects.get(A).xy_calibration=null;
 const panels=await resolveComposition(f.recipe,f.ports);assert.equal(panels[0].profile.samples.physical_distance,null);assert.equal(panels[0].profile.physical_distance_unit,null);
});

test('a four-panel composition retains explicit FFT components and reciprocal-axis profile units',async()=>{
 const f=fixture(),panel={domain:'frequency',source_object_id:A,fft_shape_yx:[96,96],fft_rect_xyxy:[0,0,96,96],image_rect_xyxy:[0,0,96,96]};
 const display={gamma:1,display_range:[0,20],max_size:128,upscale:false,interpolation:'lanczos',representation:'log_amplitude',frequency_rect:[0,0,96,96],spectrum_axes:false,spectrum_filter:null};
 for(const [id,kind]of [[A,'fft'],[B,'fft_view']]){
  const s=f.states.get(id);Object.assign(s.object,{kind,dtype:'complex128',array_domain:'frequency',axes:['fy','fx'],panels:[clone(panel)],display:clone(display),scale_bar:null});if(id===B)s.object.spectrum_object_id=A;s.effective_display=clone(display);f.objects.set(id,clone(s.object));
 }
 const p=f.objects.get(P);Object.assign(p,{dtype:'complex128',component:'amplitude',coordinate_space:'frequency_cycles_per_pixel',points:[[0,0],[2/96,0]],distance_unit:'cycles/pixel',physical_distance_unit:'cycles/nm'});
 Object.assign(p.scientific_grid_identity,{source_grid_object_id:A,dtype:'complex128',source_rect_xyxy:null,coordinate_space:'frequency_cycles_per_pixel'});
 p.samples={coordinates_xy:[[0,0],[1/96,0],[2/96,0]],sampled_coordinates_xy:[[0,0],[1/96,0],[2/96,0]],indices_xy:[[48,48],[49,48],[50,48]],value:[11,12,13],distance:[0,1/96,2/96],physical_distance:[0,1/96/.02,2/96/.02]};
 const image={...clone(f.image),recipe:makeFigureRecipe(f.states.get(A),{preset:'diffraction',mode:'figure'}),scale_bar:null};
 const profile={...clone(f.line),scientific_grid_identity:clone(p.scientific_grid_identity)};
 f.recipe.layout='2x2';f.recipe.slots=[image,profile,clone(image),clone(profile)];
 const panels=await resolveComposition(f.recipe,f.ports);assert.equal(panels.length,4);assert.equal(panels[1].profile.component,'amplitude');assert.equal(panels[1].profile.physical_distance_unit,'cycles/nm');assert.equal(panels[1].profile.samples.value[0],11);
});

test('scale bars must bind an authoritative visible saved record and its exact sourced calibration',async()=>{
 for(const change of ['length','unit','calibration','hidden']){
  const f=fixture();if(change==='length')f.recipe.slots[0].scale_bar.length=123;if(change==='unit')f.recipe.slots[0].scale_bar.unit='electrons';if(change==='calibration')f.recipe.slots[0].scale_bar.calibration_id=T;if(change==='hidden')f.recipe.slots[0].scale_bar.visible=false;
  await assert.rejects(resolveComposition(f.recipe,f.ports));
 }
 const f=fixture();f.recipe.slots[0].scale_bar=null;const panels=await resolveComposition(f.recipe,f.ports);assert.equal(panels[0].scale_bar,null);
});

test('cyclic or excessive ancestry is bounded rather than treated as a matching source',async()=>{
 const f=fixture();f.states.get(B).object.parent_object_id=T;f.objects.set(T,{object_id:T,kind:'context',parent_object_id:T});
 await assert.rejects(resolveComposition(f.recipe,f.ports));assert.ok(f.calls.length<=64);
});
