// Invoke the real canvas bindings with a small DOM port, then run the real
// Panel HTTP and provider stages on the existing HAADF candidate fixture.
import assert from 'node:assert/strict';
import {mkdirSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {ResearchContinuation} from '../ui/image-panel/research-continuation.mjs';
import {readAnalysisWorkspaceResumeSnapshot} from '../lib/analysis_workspace.mjs';
import {StdioImageClient,createImagePanel} from '../tools/image_panel.mjs';

const [fixture,workspace]=process.argv.slice(2),python=process.env.MICROSCOPY_PYTHON;
assert.ok([fixture,workspace,python].every(value=>value&&path.isAbsolute(value)));
mkdirSync(workspace);
class Element {
 constructor(){this.children=[];this.textContent='';this.value='';this.open=false;}
 addEventListener(){}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 showModal(){this.open=true;}
 close(){this.open=false;}
}
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const document={getElementById:el,createElement:()=>new Element()};
const client=new StdioImageClient({workspace,python});
const call=async(name,args)=>(await client.tool(name,args)).data;
let panel,selection,dispatch,modes=[],errors=[];
try {
 const opened=await call('image_open',{source_path:fixture,request_id:'stem-file'});
 const frame=await call('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'stem-frame'});
 const frameView=await call('image_preview',{object_id:frame.object_id,request_id:'stem-preview'});
 const other=await call('image_frame',{object_id:opened.object_id,frame_index:0,request_id:'other-frame-reopen'});
 const otherView=await call('image_preview',{object_id:other.object_id,request_id:'other-view'});
 const start=options=>createImagePanel({workspace,python,object_id:frameView.object_id,...options});
 panel=await start();
 const request=async(route,body,expected=200)=>{
  const origin=new URL(panel.url).origin,state=panel.state(),headers={'X-Panel-Token':panel.token,Connection:'close'};
  const response=await fetch(origin+route,body?{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify({...body,expected_object_id:state.object.object_id,draft_revision:state.edit_state.draft_revision})}:{headers});
  const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));return value;
 };
 const createUI=()=>new ResearchContinuation({document,getState:()=>({...panel.state(),selection}),
  read:()=>request('/api/research-continuation'),preview:()=>assert.fail('No supplementary preview needed'),
  show:()=>assert.fail('Canvas roles do not change view'),pick:mode=>modes.push(mode),error:error=>errors.push(error),
  run:async(action,params)=>{
   dispatch={action,params};
   return request('/api/action',{action,params});
  }});
 createUI();
 const pick=(kind,coordinates)=>({kind,coordinates,coordinate_space:'source_pixels',source_object_id:frame.object_id,panel:frameView.panels[0]});
 await el('stem-canvas-rectangle').onclick();
 selection=pick('rectangle',[20.25,20.25,24.75,24.75]);
 await el('stem-canvas-target').onclick();
 selection=pick('rectangle',[4.25,4.25,8.75,8.75]);await el('stem-canvas-reference').onclick();
 selection=pick('rectangle',[40.25,40.25,44.75,44.75]);await el('stem-canvas-reference').onclick();
 await el('stem-canvas-point').onclick();
 selection=pick('point',[22.25,22.5]);await el('stem-canvas-expected').onclick();
 assert.deepEqual(modes,['rectangle','point']);
 assert.match(el('stem-canvas-summary').textContent,/22.25, 22.5/);
 assert.equal(el('research-continuation-dialog').open,false);
 await request('/api/action',{action:'show',params:{object_id:otherView.object_id}});
 selection={...selection,source_object_id:other.object_id,panel:otherView.panels[0]};
 await el('stem-canvas-expected').onclick();
 assert.match(errors.pop(),/另一源图/);
 await request('/api/action',{action:'show',params:{object_id:frameView.object_id}});
 for(const [id,value]of Object.entries({
  'research-finite-question':'Compare original pixels at the given position',
  'research-position-reason':'Original caller coordinates on public synthetic contrast, no peak snap',
  'research-reference-reason':'Two supplied same-size references on the same frame',
  'research-site-modality':'haadf','research-site-signal':'stored_scalar',
  'research-signal-reason':'Public synthetic scalar fixture, no count or occupancy claim',
 })) el(id).value=value;
 await el('open-research-continuation').onclick();
 await el('research-run-stem').onclick();
 assert.deepEqual(errors,[]);
 const catalog=await request('/api/research-continuation'),entry=catalog.records.find(row=>row.kind==='discovery_review'&&row.record.site_observation);
 assert.ok(entry);
 assert.deepEqual(entry.record.site_observation.context.expected_position_xy,[22.25,22.5]);
 const study=catalog.studies.find(row=>row.input.canvas_roles);
 assert.deepEqual(study.input.canvas_roles,dispatch.params.input.canvas_roles);
 assert.deepEqual(study.input.researcher_input.reference_rects,[[4,4,9,9],[40,40,45,45]]);
 const invalid=structuredClone(dispatch);
 invalid.params.input.canvas_roles[1].input_view_object_id=otherView.object_id;
 assert.match((await request('/api/action',invalid,409)).error,/视图与源帧不一致/);
 await request('/api/workspace',{action:'save',save_id:'saved-stem-study',expected_working_revision:panel.state().workspace_analysis.working_revision});
 const before=readdirSync(path.join(workspace,'objects')).sort();
 await panel.close();panel=null;
 panel=await start({analysis_restore:readAnalysisWorkspaceResumeSnapshot(workspace)});
 const recovered=await request('/api/research-continuation');
 assert.deepEqual(recovered.studies.find(row=>row.study_id===study.study_id).input.canvas_roles,study.input.canvas_roles);
 assert.equal(recovered.records.find(row=>row.object_id===entry.object_id).record.request_id,entry.record.request_id);
 assert.deepEqual(readdirSync(path.join(workspace,'objects')).sort(),before);
 console.log(JSON.stringify({result:'PASS',frame:frame.object_id,target:study.input.researcher_input.target_rect,refs:study.input.researcher_input.reference_rects,
  expected:entry.record.site_observation.context.expected_position_xy,result_id:entry.object_id,study_id:study.study_id,reopened:true,native_gestures:'NOT_TESTED'}));
} finally {
 if(panel)await panel.close();
 await client.close();
}
