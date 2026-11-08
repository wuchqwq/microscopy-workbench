// Synthetic public file/journal fixtures. These tests do not run Codex, a model,
// Electron, HTTP, image decoding or a numerical algorithm.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync,readdirSync,symlinkSync,unlinkSync} from 'node:fs';
import {hostTurnWireInput,prepareResearchHostImage,HOST_IMAGE_LIMIT_BYTES} from '../lib/research_host_input.mjs';
import {createSyntheticHost,awaitHostState} from '../lib/research_host_demo.mjs';
import {fixture,ownerFor,approvedFor} from './research-host-input-fixture.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),F='1'.repeat(32),V='2'.repeat(32);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SUYAAAAASUVORK5CYII=','base64');
test('prepared display input pins original source/frame/grid and leaves every fixture file unchanged',t=>{
 const f=fixture(t),files=readdirSync(f.workspace,{recursive:true}).filter(n=>!readdirSync(f.workspace,{recursive:true}).some(other=>other.startsWith(n+path.sep))).map(n=>path.join(f.workspace,n));
 const before=files.map(file=>[file,sha(readFileSync(file))]);const input=prepareResearchHostImage(f.options);
 assert.deepEqual(input.images,[f.image]);assert.equal(input.text,f.options.text);
 const wire=hostTurnWireInput(input),binding=JSON.parse(wire[1].text.split('\n').at(-1));
 assert.equal(binding.view_manifest_sha256,f.options.view_sha256);assert.equal(binding.frame_id,F);assert.equal(binding.original_request_id,'public-view');assert.equal(binding.coordinate_space,'source_pixels');assert.match(binding.meaning,/Display PNG, not scientific array or independent experiment/);
 assert.deepEqual(wire[0],{type:'text',text:f.options.text});assert.deepEqual(wire[2],{type:'image',url:'data:image/png;base64,'+png.toString('base64')});assert.equal(JSON.stringify(wire).includes(f.workspace),false);
 assert.deepEqual(files.map(file=>[file,sha(readFileSync(file))]),before);
});
test('plain text compatibility and strict typed input refuse URLs, unbounded text and excess images',t=>{
 const f=fixture(t);assert.deepEqual(hostTurnWireInput('Exact text'),[{type:'text',text:'Exact text'}]);
 for(const input of [{text:' '},{text:'x'.repeat(8193)},{text:'x',images:null},{text:'x',images:[{path:'https://example.test/image.png',sha256:f.image.sha256}]},{text:'x',images:Array(3).fill(f.image)},{text:'x',images:[{...f.image,url:'https://example.test'}]},{text:'x',unknown:true}])assert.throws(()=>hostTurnWireInput(input));
 assert.throws(()=>prepareResearchHostImage({...f.options,text:undefined}));
});
test('wrong frame/hash, uncommitted journal, altered arrays and unsupported displays abstain',t=>{
 const f=fixture(t);
 assert.throws(()=>prepareResearchHostImage({...f.options,frame_id:'3'.repeat(32)}),/frame/);
 assert.throws(()=>prepareResearchHostImage({...f.options,view_sha256:'0'.repeat(64)}),/manifest/);
 for(const kind of ['annotate','fft_view']){const view={...f.view,kind};const hash=f.put(view);assert.throws(()=>prepareResearchHostImage({...f.options,view_sha256:hash}),/single spatial/);}
 f.put(f.view);writeFileSync(path.join(f.workspace,'objects',F,'data.npy'),'changed');assert.throws(()=>prepareResearchHostImage(f.options),/array hash/);
});
test('uncommitted journal and changed selected PNG cannot be supplied as image evidence',t=>{
 const f=fixture(t),request=path.join(f.workspace,'requests','public-view.json'),original=readFileSync(request);
 const journal=JSON.parse(original);journal.state='unknown';writeFileSync(request,JSON.stringify(journal));assert.throws(()=>prepareResearchHostImage(f.options),/Uncommitted/);writeFileSync(request,original);
 writeFileSync(f.file,Buffer.concat([png,Buffer.from('changed')]));assert.throws(()=>prepareResearchHostImage(f.options),/SHA-256/);
 assert.throws(()=>hostTurnWireInput({text:'x',images:[f.image]}),/SHA-256/);
});
test('PNG signature and byte/pixel budgets reject even caller-matched hashes',t=>{
 const f=fixture(t);
 for(const bytes of [Buffer.alloc(24),Buffer.alloc(HOST_IMAGE_LIMIT_BYTES+1),(()=>{const b=Buffer.from(png);b.writeUInt32BE(65536,16);b.writeUInt32BE(65536,20);return b;})()]){writeFileSync(f.file,bytes);assert.throws(()=>hostTurnWireInput({text:'x',images:[{path:f.file,sha256:sha(bytes)}]}),/PNG|display budget/);}
});
test('synthetic transport snapshots image bytes and refuses a changed file before any new turn',async t=>{
 const f=fixture(t),wire=[],host=createSyntheticHost(process.execPath,'early-final',{onWire:(direction,message)=>{if(direction==='send')wire.push(message);}});
 try{
  await host.connect();
  const prepared=prepareResearchHostImage(f.options),approved=await approvedFor(ownerFor(f),prepared,host);await host.startTurn(approved);await awaitHostState(host,s=>s.turn_state==='completed');
  const sent=wire.filter(m=>m.method==='turn/start');assert.equal(sent.length,1);assert.deepEqual(sent[0].params.input,hostTurnWireInput(prepared));
  const snapshot=host.snapshot();writeFileSync(f.file,'changed');await assert.rejects(host.startTurn(prepared));assert.deepEqual(host.snapshot(),snapshot);assert.equal(wire.filter(m=>m.method==='turn/start').length,1);
 }finally{assert.equal(await host.close(),true);}
});

test('ordinary view rejects inherited annotations, reprojection flags and malformed annotation state',t=>{
 const f=fixture(t);
 for(const extra of [{annotations:[{text:'reprojected scientific-looking mark'}]},{annotation_reprojection:true},{annotations:null},{annotations:'private annotation'},{annotation_reprojection:'unknown'}]){
  const hash=f.put({...f.view,...extra});assert.throws(()=>prepareResearchHostImage({...f.options,view_sha256:hash}),/Annotated or reprojected/);
 }
 const hash=f.put({...f.view,annotations:[],annotation_reprojection:false});assert.doesNotThrow(()=>prepareResearchHostImage({...f.options,view_sha256:hash}));
});

test('panel source must match the verified frame even when the manifest and journal agree',t=>{
 const f=fixture(t),hash=f.put({...f.view,panels:[{...f.view.panels[0],source_object_id:'3'.repeat(32)}]});
 assert.throws(()=>prepareResearchHostImage({...f.options,view_sha256:hash}),/Panel source/);
});

test('source disclosure is a primitive whitelist; unknown provider and panel fields never enter wire text',t=>{
 const f=fixture(t),sentinel='PRIVATE_FIELD_MUST_NOT_LEAVE',hash=f.put({...f.view,private_notes:sentinel,user_context:{path:sentinel},panels:[{...f.view.panels[0],private_notes:sentinel,scientific_context:{path:sentinel}}]});
 const prepared=prepareResearchHostImage({...f.options,view_sha256:hash}),wire=hostTurnWireInput(prepared);
 assert.equal(JSON.stringify(wire).includes(sentinel),false);assert.equal(JSON.stringify(wire).includes(f.workspace),false);assert.equal(prepared.text,f.options.text);
 const description=JSON.parse(wire[1].text.split('\n').at(-1));assert.equal(description.panel,undefined);assert.equal(description.scientific_grid,undefined);assert.equal(description.source_rect_xyxy.length,4);
 for(const source of [{...prepared.source,private_notes:sentinel},{...prepared.source,dtype:sentinel},{...prepared.source,source_rect_xyxy:[0,0,1,sentinel]},{...prepared.source,frame_shape_yx:[1,sentinel]},{...prepared.source,image_rect_xyxy:[0,0,2,1]},{...prepared.source,display_png_sha256:'0'.repeat(64)}])assert.throws(()=>hostTurnWireInput({...prepared,source}));
});

test('invalid or contradictory array/display mapping is refused rather than copied as scientific context',t=>{
 const f=fixture(t);
 for(const panel of [{...f.view.panels[0],source_rect_xyxy:[0,0,2,1]},{...f.view.panels[0],image_rect_xyxy:[0,0,2,1]},{...f.view.panels[0],source_rect_xyxy:[0,0,'private',1]}]){
  const hash=f.put({...f.view,panels:[panel]});assert.throws(()=>prepareResearchHostImage({...f.options,view_sha256:hash}));
 }
 for(const dtype of ['private text','complex64']){const hash=f.put({...f.view,dtype});assert.throws(()=>prepareResearchHostImage({...f.options,view_sha256:hash}));}
});

test('verified image payload survives source overwrite, removal and replacement without a later path read',t=>{
 const f=fixture(t),wire=hostTurnWireInput(prepareResearchHostImage(f.options)),payload=wire.at(-1);
 for(const action of [()=>writeFileSync(f.file,'replacement'),()=>unlinkSync(f.file),()=>symlinkSync(path.join(f.workspace,'objects',F,'data.npy'),f.file)]){
  action();const bytes=Buffer.from(payload.url.split(',')[1],'base64');assert.deepEqual(bytes,png);assert.equal(sha(bytes),f.image.sha256);assert.equal(JSON.stringify(wire).includes(f.file),false);
 }
 assert.throws(()=>hostTurnWireInput({text:'x',images:[f.image]}),/linked/);
});
