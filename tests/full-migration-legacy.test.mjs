// Opt-in continuation of the public R2/R3 workspace made by the exact frozen
// JavaScript smokes. Reuses their saved science; no numerical oracle is repeated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const fixtureRoot=process.env.MICROSCOPY_LEGACY_FIXTURE;
const here=fileURLToPath(new URL('../',import.meta.url));
const compiledRoot=process.env.MICROSCOPY_COMPILED_PLUGIN_ROOT??(path.basename(path.resolve(here))==='dist'?here:path.join(here,'dist'));
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');

test('frozen public R2/R3 workspace continues through a relocated compiled plugin without FFT replay',{
 skip:fixtureRoot?false:'Set MICROSCOPY_LEGACY_FIXTURE to the retained frozen-JS public fixture directory',timeout:420000,
},async t=>{
 assert.ok(path.isAbsolute(fixtureRoot));
 const saved=read(path.join(fixtureRoot,'legacy-fixture.json'));
 assert.equal(saved.baseline,'3790b3d57e427010f0a5cbfce8a31143a7883eef');
 assert.equal(saved.format,1);
 const within=relative=>{const file=path.resolve(fixtureRoot,relative);assert.ok(file.startsWith(path.resolve(fixtureRoot)+path.sep));return file;};
 const domain=read(within(saved.reports.domain)),field=read(within(saved.reports.field));
 assert.equal(domain.result,'PASS');assert.equal(field.result,'PASS');
 const workspace=within(saved.workspace),configuration=within(saved.configuration),settings=read(configuration);
 const immutable=()=>{for(const [file,digest]of Object.entries(saved.immutable_files))assert.equal(hash(within(file)),digest,'Frozen historical file changed: '+file);};
 const fftIds=()=>readdirSync(path.join(workspace,'objects')).filter(id=>read(path.join(workspace,'objects',id,'object.json')).kind==='fft').sort();
 immutable();assert.deepEqual(fftIds(),[...saved.fft_ids].sort());
 assert.ok(existsSync(path.join(compiledRoot,'.mcp.json')),'Build the final runtime before this acceptance');
 const runTag=randomUUID().replaceAll('-','').slice(0,12),run=within('compiled-run-'+runTag),installed=path.join(run,'copied plugin with spaces');
 mkdirSync(run);cpSync(compiledRoot,installed,{recursive:true});
 assert.equal(existsSync(path.join(installed,'node_modules')),false,'The copied runtime must be independent of compiler dependencies');
 const plugin=read(path.join(installed,'.codex-plugin','plugin.json'));
 for(const relative of [plugin.skills,plugin.mcpServers])assert.ok(existsSync(path.resolve(installed,relative)));
 const entry=read(path.join(installed,'.mcp.json')).mcpServers.microscopy_workbench;
 assert.equal(entry.command,'node');assert.equal(entry.cwd,'.');
 const serverPath=path.resolve(installed,entry.args[0]);assert.ok(serverPath.startsWith(installed+path.sep));assert.ok(existsSync(serverPath));
 const {StdioImageClient,createImagePanel}=await import(pathToFileURL(path.join(installed,'tools','image_panel.mjs')).href);
 const {readImageMeasurements}=await import(pathToFileURL(path.join(installed,'lib','image_measurement_records.mjs')).href);
 const {readFigureRecipe,recipeIdentity}=await import(pathToFileURL(path.join(installed,'ui','image-panel','figure-export.mjs')).href);
 const previous=process.env.MICROSCOPY_PLUGIN_CONFIG,previousCwd=process.cwd();process.env.MICROSCOPY_PLUGIN_CONFIG=configuration;
 const clients=[];let panel;
 const makeClient=()=>{const client=new StdioImageClient({workspace,python:settings.python,serverPath});clients.push(client);return client;};
 const report={scope:'Frozen public synthetic R2/R3 -> copied compiled package -> actual MCP/Python/Panel HTTP',checks:[],not_tested:['browser gestures','real specimen accuracy','model workflow','GMS'],started_utc:new Date().toISOString()};
 try{
  // An unrelated cwd prevents the copied runtime from finding source-tree assets.
  process.chdir(run);
  const client=makeClient();await client.rpc('initialize');
  const schema=(await client.rpc('tools/list')).result.tools;
  assert.deepEqual(schema,read(within(saved.schema)),'The complete frozen MCP tool schema changed');
  const definitions=new Map(schema.map(tool=>[tool.name,tool]));
  const argsFromJournal=(name,requestId)=>{
   const parameters=read(path.join(workspace,'requests',requestId+'.json')).parameters,allowed=definitions.get(name).inputSchema.properties;
   return Object.fromEntries(Object.entries(parameters).filter(([key])=>Object.hasOwn(allowed,key)));
  };
  for(const context of saved.contexts){
   const historical=(await client.tool('analysis_read',{analysis_id:context.analysis_id,revision:context.current.context.revision})).data;
   assert.deepEqual(historical.context,context.current.context);
   for(const original of context.requests)assert.deepEqual((await client.tool('analysis_read',{analysis_id:context.analysis_id,request_id:original.request_id})).data,original.response);
  }
  for(const original of saved.original_requests)assert.deepEqual((await client.tool('image_result',{request_id:original.request_id})).data,original.response);
  const unknown=(await client.rpc('tools/call',{name:'image_result',arguments:{request_id:'never-submitted-frozen-original'}})).result;
  assert.deepEqual(unknown,saved.unknown_original_request,'Unknown original requests must keep their old error contract');
  const joint=(await client.tool('image_info',{object_id:domain.r2.joint_object_id})).data;
  assert.equal(joint.kind,'joint_observations');
  for(const id of [field.references.comparison_field,field.references.r2_field])assert.equal((await client.tool('image_info',{object_id:id})).data.field_schema_version,1);
  report.checks.push('Complete frozen schemas, immutable context history/original mutation requests, original scientific requests, R2 observations and R3 feature fields restored');

  const region=domain.regions[1],measurement=region.measurements[0].measurement_object_id;
  const table=readImageMeasurements({workspace,objectId:region.view_object_id});
  assert.ok(table.entries.some(row=>row.object_id===measurement),'Saved measurement is absent from the verified metadata projection');
  const oldMeasure=(await client.tool('image_info',{object_id:measurement})).data;
  const points=structuredClone(oldMeasure.points);points[1][0]+=.0002;
  const revisionArgs={request_id:'full-ts-'+runTag+'-remeasure',object_id:region.view_object_id,measurement_object_id:measurement,points,source_text:'Public synthetic migration continuation; no phase or experimental interpretation.'};
  const revised=(await client.tool('image_remeasure',revisionArgs)).data;
  assert.equal(revised.remeasurement.previous_measurement_object_id,measurement);
  const objectCount=readdirSync(path.join(workspace,'objects')).length;
  assert.equal((await client.tool('image_remeasure',revisionArgs)).data.object_id,revised.object_id);
  assert.equal(readdirSync(path.join(workspace,'objects')).length,objectCount,'Original-ID recovery repeated the revision');
  const previousAtlas=(await client.tool('image_info',{object_id:domain.references.revised_atlas})).data;
  const overrides=previousAtlas.regions.filter(row=>row.measurement_object_ids.length).map(row=>({region_index:row.region_index,measurement_object_ids:row.measurement_object_ids.map((id,index)=>row.region_index===1&&index===0?revised.object_id:id)}));
  const atlas=(await client.tool('image_spatial_atlas',{...argsFromJournal('image_spatial_atlas','revised-domain-atlas'),request_id:'full-ts-'+runTag+'-atlas',previous_atlas_id:previousAtlas.object_id,measurement_overrides:overrides})).data;
  assert.deepEqual(atlas.regions.map(row=>row.fft_object_id),previousAtlas.regions.map(row=>row.fft_object_id));
  assert.ok(atlas.regions.every(row=>row.fft_reused));
  const hypotheses=(await client.tool('image_local_signature_compare',{...argsFromJournal('image_local_signature_compare','revised-domain-hypotheses'),request_id:'full-ts-'+runTag+'-hypotheses',object_id:atlas.object_id})).data;
  const latest=(await client.tool('analysis_read',{analysis_id:domain.references.context})).data;
  const promoted=(await client.tool('analysis_update',{analysis_id:domain.references.context,expected_revision:latest.context.revision,request_id:'full-ts-'+runTag+'-context',reason:'Public migration continuation of the exact frozen references.',selections:{atlas:{provider:'image',object_id:atlas.object_id},domain_hypotheses:{provider:'image',object_id:hypotheses.object_id}}})).data;
  assert.equal(promoted.context.slots.domain_hypotheses.dependsOn.atlas,promoted.context.fingerprints.atlas);
  const exported=(await client.tool('image_export',{request_id:'full-ts-'+runTag+'-export',object_id:field.references.comparison_field,output_dir:path.join(run,'field-export')})).data;
  for(const [name,digest]of Object.entries(exported.exported_files_sha256))assert.equal(hash(path.join(exported.output_dir,name)),digest);
  report.checks.push('Old measurement revised and original-ID recovered once; corrected atlas/hypotheses/context continued with the same FFT objects; old feature field exported with matching file hashes');

  const figure=saved.figures[0],recipe=read(within(figure.recipe)),oldState=read(within(figure.state)),panelClient=makeClient();
  panel=await createImagePanel({workspace,python:settings.python,object_id:figure.source_object_id,client:panelClient});
  assert.deepEqual(recipeIdentity(panel.state()),recipeIdentity(oldState));
  readFigureRecipe(recipe,panel.state());
  const origin=panel.url.split('/#')[0],headers={'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'};
  const restored=await fetch(origin+'/api/action',{method:'POST',headers,body:JSON.stringify({expected_object_id:panel.state().object.object_id,draft_revision:panel.state().edit_state.draft_revision,action:'restore-figure-display',params:{recipe}})}),restoredState=await restored.json();
  assert.equal(restored.status,200,JSON.stringify(restoredState));readFigureRecipe(recipe,restoredState);
  for(const asset of ['/','/app.mjs','/figure-export.mjs','/coordinates.mjs'])assert.equal((await fetch(origin+asset)).status,200,'Copied Panel asset missing: '+asset);
  report.checks.push('Frozen Figure scientific identity/recipe restored through copied Panel HTTP; compiled browser entry assets served');
  immutable();assert.deepEqual(fftIds(),[...saved.fft_ids].sort());
  report.checks.push('Every pre-existing scientific/source/context/recipe byte hash is unchanged and no additional FFT exists');
  report.result='PASS';report.fft_count=saved.fft_ids.length;report.historical_files_checked=Object.keys(saved.immutable_files).length;report.completed_utc=new Date().toISOString();
  t.diagnostic('PASS: frozen R2/R3 history, original requests, export, revision/atlas/context continuation and Figure restoration through copied compiled runtime; old hashes/FFT set unchanged. Browser gestures and real specimens NOT_TESTED.');
 }catch(error){report.result='FAIL';report.error=error.stack;throw error;}
 finally{
  await panel?.close();for(const client of clients)await client.close();
  process.chdir(previousCwd);
  if(previous===undefined)delete process.env.MICROSCOPY_PLUGIN_CONFIG;else process.env.MICROSCOPY_PLUGIN_CONFIG=previous;
  writeFileSync(path.join(run,'compatibility-report.json'),JSON.stringify(report,null,2)+'\n');
 }
});
