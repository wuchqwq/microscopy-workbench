// Explicit browser acceptance over the retained frozen-JS public fixture.
// Playwright is supplied by MICROSCOPY_PLAYWRIGHT_MODULE; the plugin has no
// browser-test dependency. No FFT, scientific algorithm or UI override lives here.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const fixtureRoot=process.env.MICROSCOPY_LEGACY_FIXTURE;
const playwrightModule=process.env.MICROSCOPY_PLAYWRIGHT_MODULE;
const here=fileURLToPath(new URL('../',import.meta.url));
const compiledRoot=process.env.MICROSCOPY_COMPILED_PLUGIN_ROOT??(path.basename(path.resolve(here))==='dist'?here:path.join(here,'dist'));
assert.ok(fixtureRoot&&path.isAbsolute(fixtureRoot),'Set MICROSCOPY_LEGACY_FIXTURE to the retained public frozen-JS fixture');
assert.ok(playwrightModule&&(path.isAbsolute(playwrightModule)||playwrightModule.startsWith('file:')),'Set MICROSCOPY_PLAYWRIGHT_MODULE to an installed Playwright module');
const {chromium}=await import(playwrightModule.startsWith('file:')?playwrightModule:pathToFileURL(playwrightModule).href);
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const saved=read(path.join(fixtureRoot,'legacy-fixture.json'));
assert.equal(saved.baseline,'3790b3d57e427010f0a5cbfce8a31143a7883eef');assert.equal(saved.format,1);
const within=relative=>{const file=path.resolve(fixtureRoot,relative);assert.ok(file.startsWith(path.resolve(fixtureRoot)+path.sep));return file;};
const workspace=within(saved.workspace),configuration=within(saved.configuration),settings=read(configuration),figure=saved.figures[0];
const immutable=()=>{for(const [file,digest]of Object.entries(saved.immutable_files))assert.equal(hash(within(file)),digest,'Frozen historical file changed: '+file);};
const fftIds=()=>readdirSync(path.join(workspace,'objects')).filter(id=>read(path.join(workspace,'objects',id,'object.json')).kind==='fft').sort();
immutable();assert.deepEqual(fftIds(),[...saved.fft_ids].sort());
assert.ok(existsSync(path.join(compiledRoot,'BUILD.json')),'Build the final TypeScript runtime first');
const run=within('browser-run-'+randomUUID().replaceAll('-','').slice(0,12)),installed=path.join(run,'copied plugin with spaces');
mkdirSync(run);cpSync(compiledRoot,installed,{recursive:true});
assert.equal(existsSync(path.join(installed,'node_modules')),false);
const build=read(path.join(installed,'BUILD.json'));
assert.ok(build.migrated.includes('ui/image-panel/app.mts'),'The browser entry must be emitted TypeScript');
const entry=read(path.join(installed,'.mcp.json')).mcpServers.microscopy_workbench;
assert.equal(entry.command,'node');assert.equal(entry.cwd,'.');
const serverPath=path.resolve(installed,entry.args[0]);assert.ok(serverPath.startsWith(installed+path.sep));assert.ok(existsSync(serverPath));
const {StdioImageClient,createImagePanel}=await import(pathToFileURL(path.join(installed,'tools','image_panel.mjs')).href);
const {readFigureRecipe}=await import(pathToFileURL(path.join(installed,'ui','image-panel','figure-export.mjs')).href);
const previousConfig=process.env.MICROSCOPY_PLUGIN_CONFIG,previousCwd=process.cwd();
process.env.MICROSCOPY_PLUGIN_CONFIG=configuration;
const report={scope:'Real Chromium over copied compiled ESM and the frozen public synthetic workspace',checks:[],page_errors:[],failed_modules:[],api_failures:[],console_errors:[],not_tested:['human visual acceptance','real specimen accuracy','model workflow','GMS'],started_utc:new Date().toISOString()};
const modules=new Set();let client,panel,browser,context,page,failure;
const until=async(check,label,timeout=150000)=>{const started=Date.now();while(!await check()){if(Date.now()-started>timeout)throw new Error('Timed out: '+label);await new Promise(resolve=>setTimeout(resolve,50));}};
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
function zipEntries(bytes){
 const files={};let offset=0;
 while(offset+30<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){
  assert.equal(bytes.readUInt16LE(offset+8),0,'The bounded Figure ZIP uses stored entries');
  const crc=bytes.readUInt32LE(offset+14),size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8'),start=offset+30+nameLength+extraLength;
  assert.match(name,/^[A-Za-z0-9_.-]+$/);assert.equal(Object.hasOwn(files,name),false);assert.ok(start+size<=bytes.length);
  const data=bytes.subarray(start,start+size);assert.equal(crc32(data),crc,'ZIP CRC mismatch: '+name);files[name]=data;offset=start+size;
 }
 assert.equal(bytes.readUInt32LE(offset),0x02014b50);
 const end=bytes.length-22;assert.equal(bytes.readUInt32LE(end),0x06054b50);assert.equal(bytes.readUInt32LE(end+16),offset);assert.equal(bytes.readUInt16LE(end+10),Object.keys(files).length);
 return files;
}
function pngSize(bytes){assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.subarray(12,16).toString(),'IHDR');return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];}
try{
 process.chdir(run); // The copied runtime must not resolve assets from source cwd.
 client=new StdioImageClient({workspace,python:settings.python,serverPath});
 panel=await createImagePanel({workspace,python:settings.python,object_id:figure.source_object_id,client});
 browser=await chromium.launch({headless:process.env.MICROSCOPY_BROWSER_HEADLESS!=='0',...(process.env.MICROSCOPY_CHROMIUM_EXECUTABLE?{executablePath:process.env.MICROSCOPY_CHROMIUM_EXECUTABLE}:{})});
 context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>report.page_errors.push(error.message));
 page.on('console',event=>{if(event.type()==='error'&&!event.location().url?.endsWith('/favicon.ico')){const text=event.text(),url=event.location().url,prior=report.console_errors.find(row=>row.text===text&&row.url===url);if(prior)prior.occurrences++;else report.console_errors.push({text,url,occurrences:1});}});
 page.on('response',response=>{const url=new URL(response.url());if(url.pathname.endsWith('.mjs')){if(response.status()===200)modules.add(url.pathname);else report.failed_modules.push({path:url.pathname,status:response.status()});}if(url.pathname.startsWith('/api/')&&response.status()>=400)report.api_failures.push({path:url.pathname,status:response.status()});});
 page.on('requestfailed',request=>{if(request.url().includes('.mjs'))report.failed_modules.push({url:request.url(),error:request.failure()?.errorText});});
 page.on('dialog',dialog=>dialog.dismiss());
 const idle=()=>page.waitForFunction(()=>{try{const value=JSON.parse(document.getElementById('performance-data').textContent);return !value.busy&&!value.dirty&&!value.gesture_active&&value.queued_edits===0;}catch{return false;}},null,{timeout:150000});
 const rendered=async()=>{
  await page.waitForFunction(()=>{const canvas=document.getElementById('base-canvas');return canvas.width>=32&&canvas.height>=32&&document.getElementById('metadata').textContent.includes('object_id');});
  await idle();
  const pixels=await page.locator('#base-canvas').evaluate(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,values=new Set();let visible=0;for(let n=0;n<data.length;n+=Math.max(4,Math.floor(data.length/4096/4)*4)){if(data[n+3])visible++;values.add(data[n]);}const r=canvas.getBoundingClientRect();return {visible,levels:values.size,width:r.width,height:r.height};});
  assert.ok(pixels.visible>0&&pixels.levels>2&&pixels.width>20&&pixels.height>20,'The compiled browser must paint the saved PNG into a visible canvas');
 };
 const renderPoint=async(fx,fy)=>{
  const mapping=panel.state().object.panels[0].image_rect_xyxy;
  return page.locator('#canvas').evaluate((canvas,{mapping,fx,fy})=>{const r=canvas.getBoundingClientRect(),v=document.getElementById('viewport').getBoundingClientRect(),x=r.left+(mapping[0]+(mapping[2]-mapping[0])*fx)*r.width/canvas.width,y=r.top+(mapping[1]+(mapping[3]-mapping[1])*fy)*r.height/canvas.height;if(x<=v.left||x>=v.right||y<=v.top||y>=v.bottom)throw new Error('Gesture target is outside the visible source mapping');return {x,y};},{mapping,fx,fy});
 };
 await page.goto(panel.url,{waitUntil:'domcontentloaded'});await rendered();
 for(const name of ['app','coordinates','viewer-state','viewer-render','annotation-presentation','figure-export','measurement-workspace','data-probes','user-workflow','figure-composer','sequence-evidence','domain-evidence'])assert.ok(modules.has('/'+name+'.mjs'),'Compiled browser module did not load: '+name);
 assert.equal(panel.state().object.object_id,figure.source_object_id);
 report.checks.push('Real Chromium loaded every compiled browser business module from the copied plugin and painted the saved scientific display');

 const originalObject=panel.state().object.object_id,stage=page.locator('#image-stage'),beforeZoom=await stage.getAttribute('style'),viewBox=await page.locator('#viewport').boundingBox();
 await page.mouse.move(viewBox.x+viewBox.width/2,viewBox.y+viewBox.height/2);await page.mouse.wheel(0,-160);
 await page.waitForFunction(value=>document.getElementById('image-stage').getAttribute('style')!==value,beforeZoom);
 const beforePan=await stage.getAttribute('style');await page.locator('[data-mode="pan"]').click();
 const middle=await renderPoint(.5,.5);await page.mouse.move(middle.x,middle.y);await page.mouse.down();await page.mouse.move(middle.x+24,middle.y+16,{steps:4});await page.mouse.up();
 await page.waitForFunction(value=>document.getElementById('image-stage').getAttribute('style')!==value,beforePan);assert.equal(panel.state().object.object_id,originalObject);
 await page.locator('#fit').click();await page.locator('[data-mode="rectangle"]').click();
 const start=await renderPoint(.23,.32),end=await renderPoint(.34,.46);
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});
 await until(()=>panel.state().edit_state.gesture_active,'real pointer gesture lease');await page.mouse.up();
 await until(()=>panel.state().selection?.kind==='rectangle'&&!panel.state().edit_state.gesture_active&&!panel.state().draft_persistence.pending,'ROI gesture and coalesced persistence');
 const roi=structuredClone(panel.state().selection),journal=path.join(panel.journal,'current-selection.json');assert.deepEqual(read(journal).selection,roi);
 await page.locator('#toggle-settings').click();const gamma=page.locator('#gamma'),oldGamma=await gamma.inputValue();
 // The inspector animates and its advanced range is below the scroll fold.
 // Native keyboard input must target a visible, focused control.
 await gamma.scrollIntoViewIfNeeded();await gamma.focus();
 const toneSignature=()=>page.locator('#base-canvas').evaluate(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,values=[];for(let n=0;n<data.length;n+=Math.max(4,Math.floor(data.length/1024/4)*4))values.push(data[n]);return values.join(',');});
 const originalTone=await toneSignature();await gamma.press(Number(oldGamma)<2.9?'ArrowRight':'ArrowLeft');assert.notEqual(await gamma.inputValue(),oldGamma);
 await until(async()=>await toneSignature()!==originalTone,'real Gamma canvas preview');
 await until(()=>panel.state().edit_state.dirty&&!panel.state().draft_persistence.pending,'display draft persisted');assert.equal(read(journal).edit_state.dirty,true);assert.equal(panel.state().object.object_id,originalObject);
 await page.locator('#discard-local').click();await until(()=>!panel.state().edit_state.dirty&&!panel.state().draft_persistence.pending,'explicit local draft discard');await idle();assert.equal(await gamma.inputValue(),oldGamma);
 report.checks.push('Actual wheel zoom, pointer pan and ROI gesture retained source coordinates; draft/gesture state reached the journal and an explicit discard preserved the saved image');

 await page.locator('#figure-options').click();await page.locator('#import-figure').setInputFiles(within(figure.recipe));
 await page.waitForFunction(()=>document.getElementById('figure-export-status').textContent.includes('已恢复底图显示'),null,{timeout:150000});await idle();
 readFigureRecipe(read(within(figure.recipe)),panel.state());
 await page.locator('#figure-dialog [aria-label="关闭出图设置"]').click();
 if(await page.locator('#figure-mode').getAttribute('aria-pressed')==='true')await page.locator('#figure-mode').click();
 await page.locator('#fit').click();await page.locator('[data-mode="point"]').click();const markPoint=await renderPoint(.43,.53);await page.mouse.click(markPoint.x,markPoint.y);
 await until(()=>panel.state().selection?.kind==='point'&&!panel.state().edit_state.gesture_active,'point selected through real browser gesture');
 if(!await page.locator('body').evaluate(body=>body.classList.contains('properties-open')))await page.locator('#toggle-properties').click();
 const markId=await page.locator('#mark-id').inputValue(),markText='TS public browser mark';await page.locator('#mark-text').fill(markText);await page.locator('#save-mark').click();
 await until(()=>panel.state().object.annotations?.some(mark=>mark.annotation_id===markId&&mark.text===markText),'saved public annotation');await idle();
 const mark=structuredClone(panel.state().object.annotations.find(mark=>mark.annotation_id===markId)),markedObject=panel.state().object.object_id,objectCount=readdirSync(path.join(workspace,'objects')).length;
 await page.reload({waitUntil:'domcontentloaded'});await rendered();
 assert.equal(panel.state().object.object_id,markedObject);assert.equal(readdirSync(path.join(workspace,'objects')).length,objectCount,'Browser recovery created scientific objects');
 if(!await page.locator('body').evaluate(body=>body.classList.contains('properties-open')))await page.locator('#toggle-properties').click();
 await page.locator('#existing').selectOption(markId);assert.equal(await page.locator('#mark-text').inputValue(),markText);assert.deepEqual(panel.state().object.annotations.find(value=>value.annotation_id===markId).anchor,mark.anchor);
 report.checks.push('Frozen Figure recipe imported through the browser; one new hypothesized annotation saved and recovered after a real page reload with its exact scientific anchor');

 await page.locator('#figure-options').click();const downloadWait=page.waitForEvent('download',{timeout:150000});await page.locator('#export-figure').click();const download=await downloadWait;
 assert.equal(download.suggestedFilename(),'microscopy-figure.zip');const zipFile=path.join(run,'microscopy-figure.zip');await download.saveAs(zipFile);assert.equal(await download.failure(),null);
 const files=zipEntries(readFileSync(zipFile));assert.deepEqual(Object.keys(files),['clean.png','annotations.svg','annotated.png','figure.json']);
 for(const [name,data]of Object.entries(files))writeFileSync(path.join(run,name),data);
 const recipe=JSON.parse(files['figure.json'].toString('utf8')),cleanSize=pngSize(files['clean.png']),annotatedSize=pngSize(files['annotated.png']);
 assert.equal(recipe.schema,'mcp-dm-figure-v1');assert.deepEqual(cleanSize,annotatedSize);assert.deepEqual(cleanSize,[recipe.export.width,recipe.export.height]);assert.equal(recipe.export.dpi,300);
 assert.notEqual(createHash('sha256').update(files['clean.png']).digest('hex'),createHash('sha256').update(files['annotated.png']).digest('hex'),'Saved annotation should appear in the real raster export');
 assert.deepEqual(recipe.source.anchors.find(value=>value.annotation_id===markId).anchor,mark.anchor);
 const svg=await page.evaluate(text=>{const document=new DOMParser().parseFromString(text,'image/svg+xml'),root=document.documentElement;return {invalid:Boolean(document.querySelector('parsererror')),unsafe:Boolean(document.querySelector('script,foreignObject')),text:root.textContent,width:root.getAttribute('width'),viewBox:root.getAttribute('viewBox')};},files['annotations.svg'].toString('utf8'));
 assert.equal(svg.invalid,false);assert.equal(svg.unsafe,false);assert.ok(svg.text.includes(markText));assert.equal(svg.width,'85mm');
 // The frozen SVG serializer publishes three decimal display coordinates;
 // the editable recipe retains the full layout value. This is display format,
 // not a scientific coordinate or numerical acceptance tolerance.
 assert.deepEqual(svg.viewBox.split(/\s+/).map(Number),recipe.export.viewBox.map(value=>Math.round(value*1000)/1000));
 await idle();await page.locator('#figure-dialog [aria-label="关闭出图设置"]').click();await page.screenshot({path:path.join(run,'compiled-panel.png')});
 report.checks.push('Real browser downloaded the four-file Figure ZIP; CRCs, SVG parsing/text/mapping, actual clean/annotated PNGs and the saved 300 dpi recipe agree');
 assert.deepEqual(report.page_errors,[]);assert.deepEqual(report.failed_modules,[]);assert.deepEqual(report.api_failures,[]);
 immutable();assert.deepEqual(fftIds(),[...saved.fft_ids].sort());
 report.checks.push('Every frozen historical file SHA remains identical and the exact 20-FFT set is unchanged');
 report.loaded_modules=[...modules].sort();report.historical_files_checked=Object.keys(saved.immutable_files).length;report.fft_count=saved.fft_ids.length;report.result='PASS';
}catch(error){failure=error;report.result='FAIL';report.error=error.stack;try{await page?.screenshot({path:path.join(run,'failed-panel.png')});}catch{}}
finally{
 for(const close of [()=>context?.close(),()=>browser?.close(),()=>panel?.close(),()=>client?.close()])try{await close();}catch(error){if(!failure){failure=error;report.result='FAIL';report.error=error.stack;}}
 process.chdir(previousCwd);if(previousConfig===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previousConfig;
 report.completed_utc=new Date().toISOString();writeFileSync(path.join(run,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
}
if(failure)throw failure;
console.log(JSON.stringify({result:report.result,checks:report.checks.length,page_errors:report.page_errors.length,compiled_modules:report.loaded_modules.length,historical_files_checked:report.historical_files_checked,fft_count:report.fft_count}));
