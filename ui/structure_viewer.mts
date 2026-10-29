import type {BrowserRendererGlobal,ContactPolicy,InspectContacts,RendererLibrary,ViewerDocument,ViewerElements,ViewerFetch,ViewerHistory,ViewerLocation,ViewerStorage,ViewerWindow,ViewerAPIResponse,ViewerContacts} from '../lib/structure_browser_contracts.mjs';
// These describe native browser ports without adding DOM globals to Node checks.
declare const document:ViewerDocument,location:ViewerLocation,sessionStorage:ViewerStorage,history:ViewerHistory,window:ViewerWindow,globalThis:BrowserRendererGlobal,$3Dmol:RendererLibrary,fetch:ViewerFetch;
// Self-contained after type erasure: the server serializes the compiled function
// with its existing explicit policy/inspector inputs to the same /viewer.mjs URL.
export async function structureViewerBrowser(CONTACT_POLICY:ContactPolicy,inspectContacts:InspectContacts):Promise<void>{
const $=<Id extends keyof ViewerElements>(id:Id)=>document.getElementById(id) as ViewerElements[Id],key='mcp-dm-structure-view-token',hash=location.hash.slice(1);
if(hash){sessionStorage.setItem(key,hash);history.replaceState(null,'',location.pathname);}const token=sessionStorage.getItem(key);
try{
 const response=await fetch('/api/structure',{headers:{'X-Viewer-Token':token}}),rawData=await response.json();if(!response.ok)throw new Error((rawData as {error?:string}).error??'读取结构失败');
 // The same owned loopback server creates this response only from its validated
 // presentation snapshot. This transport type does not qualify scientific data.
 const data=rawData as ViewerAPIResponse;
 if(!globalThis.$3Dmol?.createViewer)throw new Error('本地 3Dmol.js 未就绪；不将二维投影冒充三维显示');
 const structure=data.structure,viewer=$3Dmol.createViewer('viewer',{backgroundColor:'white'}),model=viewer.addModel();
 const renderAtoms=()=>structure.symbols.map((elem,i)=>({elem,x:structure.positions_angstrom[i][0],y:structure.positions_angstrom[i][1],z:structure.positions_angstrom[i][2],serial:i+1,bonds:[],bondOrder:[]}));
 model.addAtoms(renderAtoms());
 viewer.setStyle({},{sphere:{scale:.35}});
 if(structure.cell_drawn){const [a,b,c]=structure.cell_angstrom;model.setCrystMatrix(new $3Dmol.Matrix3(a[0],b[0],c[0],a[1],b[1],c[1],a[2],b[2],c[2]));viewer.addUnitCell(model,{box:{color:'#65747d'},alabel:'a',blabel:'b',clabel:'c'});}
 else for(const axis of structure.periodic_cell_axes){const v=structure.cell_angstrom[axis];viewer.addArrow({start:{x:0,y:0,z:0},end:{x:v[0],y:v[1],z:v[2]},radius:.035,color:['#c94c4c','#32894a','#3e66b7'][axis]});}
 viewer.zoomTo();viewer.render();const initial=viewer.getView();
 const camera=()=>{$('camera-state').textContent=JSON.stringify({camera_only:true,translation_zoom_quaternion:viewer.getView(),scientific_coordinates_changed:false});};viewer.setViewChangeCallback(camera);camera();
 let mode:'atoms'|'contacts'='atoms',contacts:ViewerContacts={state:'not_computed',contact_count:null},attempted=false;
 const status=()=>{
  const contactState={...contacts,active_contact_count:mode==='contacts'?contacts.contact_count:0,representation:mode,policy:CONTACT_POLICY,scientific_coordinates_changed:false};
  $('contact-state').textContent=JSON.stringify(contactState);
  $('viewer-status').textContent=JSON.stringify({state:'rendered',renderer:data.renderer,object_id:structure.object_id,atom_count:structure.atom_count,cell_drawn:structure.cell_drawn,cell_display:structure.cell_display,periodic_cell_axes:structure.periodic_cell_axes,pbc:structure.pbc,snapshot_sha256:data.snapshot_sha256,camera_only:true,scientific_coordinates_changed:false,initial_orientation:structure.display_orientation??null,representation:mode,geometric_contacts:contactState});
  $('contact-summary').textContent=contacts.state==='refused'?'几何近邻未启用：'+contacts.reason:mode==='contacts'?'几何近邻球棍 · '+contacts.contact_count+' 条（仅当前快照）':contacts.state==='ready'?'原子显示 · 已计算的 '+contacts.contact_count+' 条几何近邻未显示。':'默认只显示原子，尚未计算几何近邻。';
 };
 $('display-mode').value='atoms';$('display-mode').disabled=false;
 $('display-mode').onchange=()=>{
  const savedView=viewer.getView().slice();let changedGraph=false;
  try{
   const requested=$('display-mode').value;if(!['atoms','contacts'].includes(requested))throw new Error('未知显示模式');
   if(requested==='contacts'&&!attempted){
    attempted=true;
    if(structure.atom_count>CONTACT_POLICY.atom_budget)throw new Error('最多为 '+CONTACT_POLICY.atom_budget+' 个原子显示几何近邻；整组不显示，不截断。');
    if(typeof model.assignBonds!=='function'||typeof model.selectedAtoms!=='function'||typeof model.removeAtoms!=='function')throw new Error('当前本地 3Dmol 组件不提供所需的几何近邻接口');
    changedGraph=true;model.assignBonds();
    contacts={state:'ready',contact_count:inspectContacts(model.selectedAtoms({}),structure,CONTACT_POLICY)};
   }
   mode=requested==='contacts'&&contacts.state==='ready'?'contacts':'atoms';
   viewer.setStyle({},mode==='contacts'?{sphere:{scale:.23},stick:{radius:.12,singleBonds:true}}:{sphere:{scale:.35}});
  }catch(error){
   // Discard the complete renderer-only graph on refusal; never truncate it.
   if(changedGraph){model.removeAtoms(model.selectedAtoms({}));model.addAtoms(renderAtoms());}
   contacts={state:'refused',contact_count:(error as {contact_count?:number}).contact_count??null,reason:(error as Error).message};mode='atoms';viewer.setStyle({},{sphere:{scale:.35}});
  }finally{ $('display-mode').value=mode;viewer.setView(savedView);viewer.render();camera();status(); }
 };
 $('reset').onclick=()=>{viewer.setView(initial);viewer.render();camera();};window.addEventListener('resize',()=>{viewer.resize();viewer.render();});
 $('summary').textContent=structure.atom_count+' 个原子 · Å · '+(structure.cell_drawn?'有三维晶胞':structure.periodic_cell_axes.length?'仅 '+structure.periodic_cell_axes.length+' 个已知周期方向':'无三维晶胞');
 status();
 $('message').textContent=structure.display_orientation?.initial_orientation_applied?'已将指定晶带轴取向应用于独立显示副本；后续拖转只改变相机，不改变模拟取向。':structure.display_orientation?'此三维视图未应用所请求的旧 Cartesian 显示旋转；不能将当前视角当作指定方向。':'只读三维显示已就绪。相机旋转不代表已把结构按某个晶带轴定向。';
}catch(error){$('message').textContent=(error as Error).message;$('viewer-status').textContent=JSON.stringify({state:'not_rendered',interactive_3d:false,error:(error as Error).message});}
}
