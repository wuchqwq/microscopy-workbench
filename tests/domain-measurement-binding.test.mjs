// Actual Node Panel HTTP -> stdio MCP -> independent Python regression.
// Opt in with MICROSCOPY_RUN_DOMAIN_BINDING_TEST=1 and MICROSCOPY_PYTHON.
// This tests immutable annotation binding, not a browser pointer gesture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';
import {readImageMeasurements,writeMeasurementLink} from '../lib/image_measurement_records.mjs';

const enabled=process.env.MICROSCOPY_RUN_DOMAIN_BINDING_TEST==='1';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');

test('corrected-view aliases remain bound across moves; forged and ambiguous aliases grant no relationship',
 {skip:enabled?false:'Set MICROSCOPY_RUN_DOMAIN_BINDING_TEST=1 for actual independent Python/MCP/Panel execution',timeout:420000},async t=>{
 const directory=mkdtempSync(path.join(tmpdir(),'domain-measurement-binding-'));
 const workspace=path.join(directory,'workspace'),source=path.join(directory,'public-32-square.tiff');
 let client,panel;
 try{
  const candidate=process.env.MICROSCOPY_PYTHON??process.env.DM_IMAGE_PYTHON??process.env.DM_TEST_PYTHON??(process.platform==='win32'?'python':'python3');
  // Use one real worker process for the immutable fixture. Each execute call
  // still writes its ordinary request journal and scientific object; only the
  // Python/import startup is shared. Actual later edits use Panel -> stdio MCP.
  const fixtureStarted=Date.now();
  const fixture=spawnSync(candidate,['-B','-c',String.raw`import sys,json,time,numpy as np,tifffile
sys.path.insert(0,sys.argv[2])
import image_workspace as worker
number=0
def call(action,**parameters):
 global number
 number+=1
 response=worker.execute(dict(action=action,workspace=sys.argv[3],request_id='domain-binding-'+str(number),**parameters))
 if not response.get('ok'): raise RuntimeError(json.dumps(response))
 print('fixture '+str(number)+' '+action+' complete',file=sys.stderr,flush=True)
 return response['result']
y,x=np.indices((32,32))
a=np.rint(20000+4000*np.cos(2*np.pi*x/8)+2500*np.cos(2*np.pi*y/16)).astype(np.uint16)
tifffile.imwrite(sys.argv[1],a,photometric='minisblack')
opened=call('open',source_path=sys.argv[1])
frame=call('frame',object_id=opened['object_id'],frame_index=0)
calibrated=call('calibrate',object_id=frame['object_id'],scope='image',xy_scale=dict(x=.02,y=-.03,unit='nm'),source_text='Independent synthetic sampling; not instrument calibration')
fft=call('fft',object_id=calibrated['object_id'],window='none',subtract_mean=True)
point=[.125,0]
other_point=[0,.0625]
def mark(ident,coordinates,measurement=None):
 value=dict(annotation_id=ident,kind='point',source_object_id=fft['object_id'],coordinate_space='frequency_cycles_per_pixel',coordinates=coordinates,text=ident,status='hypothesized',color='cyan')
 if measurement: value['presentation']=dict(label=dict(measurement_object_id=measurement,measurement_kind='period'))
 return value
original_view=call('annotate',object_id=fft['object_id'],annotations=[mark('peak-old',point),mark('peak-other',other_point)])
measured=call('measure',object_id=original_view['object_id'],coordinate_space='frequency_cycles_per_pixel',points=[[0,0],point])
other=call('measure',object_id=original_view['object_id'],coordinate_space='frequency_cycles_per_pixel',points=[[0,0],other_point])
corrected=call('annotate',object_id=original_view['object_id'],annotations=[mark('atlas-reflection-1',point,measured['object_id'])])
negative_views=[]
for annotations in [[mark('forged-alias',point,other['object_id'])],[mark('wrong-coordinate-alias',[.1875,.03125],measured['object_id'])],[mark('ambiguous-a',point,measured['object_id']),mark('ambiguous-b',point,measured['object_id'])]]:
 negative_views.append(call('annotate',object_id=original_view['object_id'],annotations=annotations)['object_id'])
print(json.dumps(dict(python=sys.executable,fft=fft,originalView=original_view,measured=measured,other=other,corrected=corrected,negativeViews=negative_views)))`,source,fileURLToPath(new URL('../tools/',import.meta.url)),workspace],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,windowsHide:true});
  assert.equal(fixture.status,0,[fixture.error?.message,fixture.stderr,fixture.stdout].filter(Boolean).join('\n'));
  t.diagnostic(`Persisted real-worker fixture completed in ${Date.now()-fixtureStarted} ms`);
  const {python,fft,originalView,measured,other,corrected,negativeViews}=JSON.parse(fixture.stdout);
  const sourceHash=hash(source);
  assert.ok(path.isAbsolute(python));
  const fftPath=path.join(workspace,'objects',fft.object_id,'data.npy'),fftHash=hash(fftPath);
  // Exercise the stronger historical case: a real persisted creation link
  // still names the original peak ID. The link must remain immutable.
  for(const [measurement,id]of [[measured,'peak-old'],[other,'peak-other']])writeMeasurementLink(workspace,{
   measurement_object_id:measurement.object_id,input_object_id:originalView.object_id,annotation_id:id,measurement_kind:'dc_to_peak',name:id});
  const oldManifest=path.join(workspace,'objects',measured.object_id,'object.json');
  const oldLink=path.join(workspace,'measurement-links',measured.object_id+'.json');
  const originalManifestHash=hash(oldManifest),originalLinkHash=hash(oldLink);
  const alias='atlas-reflection-1';
  const entries=id=>readImageMeasurements({workspace,objectId:id}).entries;
  const before=entries(corrected.object_id).find(row=>row.object_id===measured.object_id);
  assert.equal(before.annotation_id,alias);assert.equal(before.annotation_matches_current,true);assert.equal(before.status,'current');
  client=new StdioImageClient({workspace,python});
  panel=await createImagePanel({workspace,python,object_id:corrected.object_id,client});
  const send=async(action,params={},status=200)=>{
   const origin=panel.url.split('/#')[0],response=await fetch(origin+'/api/action',{method:'POST',
    headers:{'X-Panel-Token':panel.token,Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({expected_object_id:panel.state().object.object_id,draft_revision:panel.state().edit_state.draft_revision,action,params})});
   const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;
  };
  const selection=id=>{
   const current=panel.state().object,annotation=current.annotations.find(row=>row.annotation_id===id);
   assert.ok(annotation);const bound=current.panels.find(p=>p.source_object_id===annotation.anchor.source_object_id&&p.domain==='frequency');
   assert.ok(bound);return {...annotation.anchor,kind:annotation.kind,panel:bound};
  };

  await t.test('immutable corrected view authorizes only its alias and allows two later Panel remeasurements',async()=>{
   let previous=measured;
   for(const moved of [[.125,.03125],[.09375,.03125]]){
    await send('edit',{updates:[{annotation_id:alias,coordinates:moved}],auto_commit:true});
    const row=entries(panel.state().object.object_id).find(value=>value.object_id===previous.object_id);
    assert.equal(row.annotation_id,alias);assert.equal(row.status,'needs_remeasurement');assert.equal(row.annotation_matches_current,false);
    assert.deepEqual(row.points,previous.points,'old scientific endpoints never follow the moved mark');
    const response=await send('measure',{selection:selection(alias),annotation_id:alias,measurement_object_id:previous.object_id});
    const revised=response.last_operation;
    assert.notEqual(revised.object_id,previous.object_id);assert.deepEqual(revised.points,[[0,0],moved]);
    assert.ok(Math.abs(revised.d_spacing-1/Math.hypot(moved[0]/.02,moved[1]/-.03))<1e-12);
    const table=entries(panel.state().object.object_id);
    const saved=table.find(value=>value.object_id===revised.object_id);
    assert.ok(saved);assert.equal(saved.remeasurement.previous_measurement_object_id,previous.object_id);
    assert.equal(saved.previous_measurement_object_id,previous.object_id);
    assert.equal(table.find(value=>value.object_id===previous.object_id).status,'historical');
    assert.equal(saved.annotation_id,alias);assert.equal(saved.status,'current');
    // Browser numeric-label saving uses the new immutable result reference.
    if(previous.object_id===measured.object_id)await send('edit',{updates:[{annotation_id:alias,presentation:{label:{measurement_object_id:revised.object_id,measurement_kind:'period'}},presentation_replace:true}],auto_commit:true});
    previous=saved;
   }
   assert.equal(hash(oldManifest),originalManifestHash);assert.equal(hash(oldLink),originalLinkHash);
  });

  for(const scenario of [
   {name:'forged label for a different measurement cannot bind an unrelated anchor',id:'forged-alias',measurement:other,viewId:negativeViews[0]},
   {name:'wrong coordinates with no exact immutable alias predecessor grant no binding',id:'wrong-coordinate-alias',measurement:measured,viewId:negativeViews[1]},
   {name:'two matching aliases remain ambiguous instead of selecting a winner',id:'ambiguous-a',measurement:measured,viewId:negativeViews[2]},
  ])await t.test(scenario.name,async()=>{
   const row=entries(scenario.viewId).find(value=>value.object_id===scenario.measurement.object_id);
   assert.ok(row);assert.notEqual(row.annotation_id,scenario.id);assert.equal(row.annotation_matches_current,false);
   if(scenario.id==='ambiguous-a')assert.notEqual(row.annotation_id,'ambiguous-b');
   await send('show',{object_id:scenario.viewId});
   const requestsBefore=readdirSync(path.join(workspace,'requests')).sort(),objectsBefore=readdirSync(path.join(workspace,'objects')).sort();
   const refused=await send('measure',{selection:selection(scenario.id),annotation_id:scenario.id,measurement_object_id:scenario.measurement.object_id},409);
   assert.match(JSON.stringify(refused),/Original measurement is not bound to this annotation\/source/);
   assert.deepEqual(readdirSync(path.join(workspace,'requests')).sort(),requestsBefore,'rejected binding cannot submit a new measurement');
   assert.deepEqual(readdirSync(path.join(workspace,'objects')).sort(),objectsBefore);
  });
  assert.equal(hash(oldManifest),originalManifestHash);assert.equal(hash(oldLink),originalLinkHash);
  assert.equal(hash(source),sourceHash);assert.equal(hash(fftPath),fftHash);
  const journals=readdirSync(path.join(workspace,'requests')).map(file=>JSON.parse(readFileSync(path.join(workspace,'requests',file),'utf8')));
  assert.equal(journals.filter(row=>row.parameters.action==='fft').length,1);
  assert.equal(journals.filter(row=>row.parameters.action==='remeasure').length,2);
 }finally{
  if(panel)await panel.close();else await client?.close();
  // This test owns one mkdtemp child only; never recursively delete a computed
  // workspace outside that exact temporary parent.
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith('domain-measurement-binding-'));
  rmSync(directory,{recursive:true,force:true});
 }
});
