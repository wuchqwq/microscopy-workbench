// Optional local, read-only 3Dmol.js presentation of a fixed ASE snapshot.
// No structure engine, remote model download or scientific-coordinate mutation.
// Documented component APIs: https://3dmol.org/doc/GLViewer.html and
// https://3dmol.org/doc/GLModel.html. The optional package is BSD-3-Clause.
import http from 'node:http';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync,openSync,writeFileSync,fsyncSync,closeSync,linkSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {AddressInfo} from 'node:net';
import type {BinaryLike} from 'node:crypto';
import type {CartesianCell,NumericMatrix3,DisplayOrientation,StructureCoordinates,StructureSnapshot,StructureObjectId,ViewerClosureRecord,ViewerRenderer} from '../lib/structure_contracts.mjs';
import type {ContactPolicy} from '../lib/structure_browser_contracts.mjs';
import {structureViewerBrowser} from '../ui/structure_viewer.mjs';
const fields=(value:unknown)=>value as Record<string,unknown>;
const test=(pattern:RegExp,value:unknown)=>pattern.test(value as string);
const errorMessage=(error:unknown)=>(error as Error).message;
export interface CreateStructureViewerOptions {structure:unknown;assetPath:string;port?:number;onClosed?:(record:ViewerClosureRecord)=>void;}
export interface StructureViewerHandle {
 url:string;token:string;server:http.Server;renderer:ViewerRenderer;object_id:StructureObjectId;snapshot_sha256:string;
 close(requestId?:string):Promise<void>;
}


export const STRUCTURE_VIEWER_VERSION='2.5.5';
export const STRUCTURE_CONTACT_POLICY=Object.freeze({engine:'3Dmol.js GLModel.assignBonds',atom_budget:512,undirected_contact_budget:8192,radius_policy:'3Dmol radius lookup sum + 0.25 angstrom; missing entries use component fallback 1.6 angstrom',fallback_radius_angstrom:1.6,minimum_distance_squared_angstrom2:.5,periodic_images:false,valence_constraints:false,bond_order_inferred:false,dft_calculation:false});
// Inspect the mature renderer's graph only; never calculate replacement bonds.
// It is a private presentation copy, not the hash-bound scientific snapshot.
export function inspectRendererContacts(atoms:unknown,structure:StructureSnapshot,policy:ContactPolicy=STRUCTURE_CONTACT_POLICY):number{
 if(!Array.isArray(atoms)||atoms.length!==structure.atom_count||atoms.length>policy.atom_budget)throw new Error('Geometric contacts require at most '+policy.atom_budget+' atoms');
 const rows=atoms.map((rawAtom:unknown,i)=>{
  const atom=rawAtom as Record<string,unknown>;
  const position=structure.positions_angstrom[i];
  if(atom.index!==i||atom.elem!==structure.symbols[i]||atom.x!==position[0]||atom.y!==position[1]||atom.z!==position[2])throw new Error('Renderer changed the fixed atomic coordinates or identity');
  if(!Array.isArray(atom.bonds)||!Array.isArray(atom.bondOrder)||atom.bonds.length!==atom.bondOrder.length||atom.bonds.length>=atoms.length)throw new Error('Invalid bounded renderer contact graph');
  const neighbors=new Set<number>();
  atom.bonds.forEach((other:unknown,j:number)=>{if(!Number.isInteger(other)||(other as number)<0||(other as number)>=atoms.length||other===i||neighbors.has(other as number)||(atom.bondOrder as unknown[])[j]!==1)throw new Error('Invalid renderer contact identity/order');neighbors.add(other as number);});
  return neighbors;
 });
 let directed=0;rows.forEach((neighbors,i)=>{directed+=neighbors.size;for(const other of neighbors)if(!rows[other].has(i))throw new Error('Renderer contact graph is not symmetric');});
 const count=directed/2;
 if(count>policy.undirected_contact_budget){const error:Error & {contact_count?:number}=new Error('几何近邻共 '+count+' 条，超过 '+policy.undirected_contact_budget+' 条上限；整组不显示，不截断。');error.contact_count=count;throw error;}
 return count;
}
const elements=new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));
const sha=(bytes:BinaryLike)=>createHash('sha256').update(bytes).digest('hex');
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e6;
const own=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k)));
function require(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function volume(c:readonly (readonly number[])[]):number{return c[0][0]*(c[1][1]*c[2][2]-c[1][2]*c[2][1])-c[0][1]*(c[1][0]*c[2][2]-c[1][2]*c[2][0])+c[0][2]*(c[1][0]*c[2][1]-c[1][1]*c[2][0]);}
function periodicAxes(cell:CartesianCell,pbc:readonly boolean[]):number[]{
 const basis:number[][]=[],axes:number[]=[];
 for(let i=0;i<3;i++)if(pbc[i]){
  const norm=Math.hypot(...cell[i]);require(norm>0,'A periodic cell direction needs its actual nonzero vector');
  let v=cell[i].map(x=>x/norm);for(const b of basis){const dot=v.reduce((s,x,j)=>s+x*b[j],0);v=v.map((x,j)=>x-dot*b[j]);}
  const residual=Math.hypot(...v);require(residual>1e-12,'Declared periodic cell vectors must be independent');basis.push(v.map(x=>x/residual));axes.push(i);
 }
 return axes;
}
function displayOrientation(value:unknown):DisplayOrientation|undefined{
 if(value===undefined)return undefined;
 require(own(value,['orientation_id','rotation_matrix_cartesian','source_coordinates_sha256','initial_orientation_applied','scientific_source_coordinates_modified','display_coordinates_transformed','convention','requested_rotation_deg_xyz','reason']),'Unexpected display orientation fields');
 require(value.scientific_source_coordinates_modified===false&&typeof value.initial_orientation_applied==='boolean'&&typeof value.display_coordinates_transformed==='boolean','Explicit display-copy orientation semantics required');
 if(value.initial_orientation_applied){
  const m=value.rotation_matrix_cartesian;require(typeof value.orientation_id==='string'&&/^[a-f0-9]{32}$/.test(value.orientation_id)&&typeof value.source_coordinates_sha256==='string'&&/^[a-f0-9]{64}$/.test(value.source_coordinates_sha256),'Bound orientation/source identities required');
  require(Array.isArray(m)&&m.length===3&&m.every((row:unknown)=>Array.isArray(row)&&row.length===3&&row.every((x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1+1e-12)),'Finite orientation matrix required');
  const matrix=m as NumericMatrix3;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)require(Math.abs(matrix[i].reduce((s,x,k)=>s+x*matrix[j][k],0)-(i===j?1:0))<=1e-10,'Orientation matrix must be orthonormal');
  require(Math.abs(volume(matrix)-1)<=1e-10&&value.display_coordinates_transformed===true,'Orientation must be right-handed and applied to the display copy');
 }else require(value.display_coordinates_transformed===false&&typeof value.reason==='string'&&value.reason.length<=256&&Array.isArray(value.requested_rotation_deg_xyz)&&value.requested_rotation_deg_xyz.length===3&&value.requested_rotation_deg_xyz.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=360),'An unapplied legacy display direction must be explicit');
 require(typeof value.convention==='string'&&value.convention.length<=256,'Orientation convention required');return JSON.parse(JSON.stringify(value)) as DisplayOrientation;
}
export function validateStructureSnapshot(value:unknown):StructureSnapshot{
 require(own(value,['object_id','symbols','positions_angstrom','cell_angstrom','pbc','occupancy','display_orientation']),'Unexpected structure snapshot fields');
 require(typeof value.object_id==='string'&&/^[a-f0-9]{32}$/.test(value.object_id),'An explicit saved structure object_id is required');
 require(Array.isArray(value.symbols)&&value.symbols.length>=1&&value.symbols.length<=4096&&value.symbols.every((s:unknown)=>typeof s==='string'&&elements.has(s)),'Need 1..4096 valid element symbols');
 require(Array.isArray(value.positions_angstrom)&&value.positions_angstrom.length===value.symbols.length&&value.positions_angstrom.every((p:unknown)=>Array.isArray(p)&&p.length===3&&p.every(finite)),'Finite bounded Cartesian positions in angstrom required');
 require(Array.isArray(value.cell_angstrom)&&value.cell_angstrom.length===3&&value.cell_angstrom.every((p:unknown)=>Array.isArray(p)&&p.length===3&&p.every(finite)),'Three finite bounded cell vectors in angstrom required');
 require(Array.isArray(value.pbc)&&value.pbc.length===3&&value.pbc.every((v:unknown)=>typeof v==='boolean'),'Three explicit periodic boundary flags required');
 const determinant=volume(value.cell_angstrom as CartesianCell),hasCell=Number.isFinite(determinant)&&determinant!==0,periodic=periodicAxes(value.cell_angstrom as CartesianCell,value.pbc as boolean[]),orientation=displayOrientation(value.display_orientation);
 // Copy only typed scientific data. Never interpolate it into HTML or script.
 // Occupancy metadata stays in the ASE scientific object; these presentation
 // spheres do not encode partial occupancy or infer chemistry/bonds.
 const copy=JSON.parse(JSON.stringify({object_id:value.object_id,symbols:value.symbols,positions_angstrom:value.positions_angstrom,cell_angstrom:value.cell_angstrom,pbc:value.pbc})) as StructureCoordinates;
 return {...copy,...(orientation?{display_orientation:orientation}:{}),coordinate_unit:'angstrom',cell_vectors:'rows in the same Cartesian frame as atom positions',cell_drawn:hasCell,cell_display:hasCell?'full_cell':periodic.length?'declared_periodic_vectors_only':'none',periodic_cell_axes:periodic,atom_count:copy.symbols.length};
}
function ordinary(file:unknown,maxBytes:number):Buffer{
 require(typeof file==='string'&&path.isAbsolute(file),'An absolute configured local file is required');
 const stat=lstatSync(file);require(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maxBytes,'Expected a bounded ordinary local file');
 return readFileSync(realpathSync(file));
}
export function read3DmolAsset(assetPath:unknown){
 require(typeof assetPath==='string'&&path.isAbsolute(assetPath)&&path.basename(assetPath)==='3Dmol-min.js','Configure the independent 3dmol/build/3Dmol-min.js dependency');
 const bytes=ordinary(assetPath,8*1024*1024),directory=path.dirname(path.dirname(assetPath)),pkg=fields(JSON.parse(ordinary(path.join(directory,'package.json'),64*1024).toString('utf8')));
 require(path.basename(path.dirname(assetPath))==='build'&&pkg.name==='3dmol'&&pkg.version===STRUCTURE_VIEWER_VERSION&&pkg.license==='BSD-3-Clause','Expected pinned BSD-3-Clause 3dmol@'+STRUCTURE_VIEWER_VERSION);
 const license=ordinary(path.join(directory,'LICENSE'),64*1024);
 return {bytes,license,sha256:sha(bytes),name:'3Dmol.js',version:pkg.version,license_id:pkg.license};
}
const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mcp-dm · ASE 结构</title><link rel="stylesheet" href="/viewer.css"></head><body><header><strong>ASE 结构快照 · 3Dmol.js</strong><label>显示 <select id="display-mode" disabled><option value="atoms">原子</option><option value="contacts">几何近邻球棍</option></select></label><button id="reset">重置相机</button><span id="summary"></span></header><p>拖动旋转，滚轮缩放。只改变显示，不修改原子坐标、晶胞或模拟取向。</p><div id="viewer" aria-label="只读三维原子结构"></div><p id="message" role="status">正在加载本地 3Dmol.js…</p><p id="contact-summary" role="status">默认只显示原子，尚未计算几何近邻。</p><p id="contact-policy">几何近邻按 3Dmol 半径表之和 + 0.25 Å 连接（缺项用组件默认 1.6 Å），排除距离² &lt; 0.5 Å²；仅当前快照，不跨周期边界。不判定键级、共价性，也不是 DFT。</p><details><summary>来源与相机状态</summary><pre id="viewer-status"></pre><pre id="contact-state"></pre><pre id="camera-state"></pre><a href="/LICENSE-3Dmol.txt">3Dmol.js · BSD-3-Clause</a></details><script src="/3Dmol-min.js"></script><script type="module" src="/viewer.mjs"></script></body></html>';
const css=':root{font-family:system-ui,sans-serif;background:#f4f5f6;color:#202a33}body{margin:0;padding:12px}header{display:flex;align-items:center;gap:16px;flex-wrap:wrap}button,select{padding:7px 12px;cursor:pointer}p,summary,label{font-size:13px}#viewer{position:relative;height:calc(100vh - 270px);min-height:320px;width:100%;background:white}pre{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}#message{color:#34596b}#contact-policy{color:#52606a;font-size:12px}';
const script='('+structureViewerBrowser.toString()+')('+JSON.stringify(STRUCTURE_CONTACT_POLICY)+','+inspectRendererContacts.toString()+');';

export function createStructureViewer(options:CreateStructureViewerOptions):Promise<StructureViewerHandle>;
export async function createStructureViewer({structure,assetPath,port=0,onClosed}:Partial<CreateStructureViewerOptions>={}):Promise<StructureViewerHandle>{
 const snapshot=validateStructureSnapshot(structure),asset=read3DmolAsset(assetPath);
 require(Number.isInteger(port)&&port>=0&&port<=65535,'Invalid loopback port');
 const token=randomBytes(24).toString('hex'),snapshotBytes=Buffer.from(JSON.stringify(snapshot)),snapshotHash=sha(snapshotBytes);
 const renderer={name:asset.name,version:asset.version,license:asset.license_id,asset_sha256:asset.sha256,mode:'local WebGL, presentation only; no scientific model edits'};
 let closePromise:Promise<void>|undefined;const close=async (requestId?:string)=>{
  if(!closePromise)closePromise=new Promise<void>((resolve,reject)=>{server.close(error=>{if(error){reject(error);return;}try{onClosed?.({schema_version:1,state:'closed',object_id:snapshot.object_id,snapshot_sha256:snapshotHash,pid:process.pid,request_id:requestId??null,closed_utc:new Date().toISOString()});resolve();}catch(error){reject(error);}});server.closeIdleConnections?.();});
  return closePromise;
 };
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  try{
   const origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
   if(req.headers.host!=='127.0.0.1:'+(server.address() as AddressInfo).port){res.statusCode=403;throw new Error('Invalid Host');}
   if(req.headers.origin&&req.headers.origin!==origin){res.statusCode=403;throw new Error('Cross-origin request refused');}
   const url=new URL(req.url!,origin),supplied=req.headers['x-viewer-token'],authorized=typeof supplied==='string'&&Buffer.byteLength(supplied)===Buffer.byteLength(token)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(token));
   if(url.pathname==='/api/close'&&!url.search){
    if(req.method!=='POST'){res.statusCode=405;throw new Error('Explicit POST required for owned helper closure');}
    if(!authorized||req.headers.origin!==origin){res.statusCode=403;throw new Error('Same-origin viewer token required');}
    const length=Number(req.headers['content-length']);if(!Number.isSafeInteger(length)||length<1||length>512||req.headers['content-type']!=='application/json'){res.statusCode=400;throw new Error('Bounded canonical JSON close request required');}
    let raw='';for await(const part of req){raw+=part.toString('utf8');if(Buffer.byteLength(raw)>512){res.statusCode=413;throw new Error('Close request exceeds budget');}}
    const command:unknown=JSON.parse(raw);require(own(command,['request_id','object_id','snapshot_sha256'])&&Object.keys(command).length===3&&JSON.stringify(command)===raw&&test(/^[A-Za-z0-9_-]{1,64}$/,command.request_id??'')&&command.object_id===snapshot.object_id&&command.snapshot_sha256===snapshotHash,'Close request identity mismatch');
    res.setHeader('Content-Type','application/json');res.setHeader('Connection','close');res.end(JSON.stringify({state:'closing',request_id:command.request_id,object_id:snapshot.object_id,snapshot_sha256:snapshotHash,scientific_data_modified:false}));
    res.once('finish',()=>{close(command.request_id as string).catch(error=>process.stderr.write('Owned viewer close bookkeeping failed: '+errorMessage(error)+'\n'));});return;
   }
   if(req.method!=='GET'){res.statusCode=405;throw new Error('Read-only viewer');}
   const files=new Map<string,[string|Buffer,string]>([['/',[html,'text/html; charset=utf-8']],['/viewer.css',[css,'text/css; charset=utf-8']],['/viewer.mjs',[script,'text/javascript; charset=utf-8']],['/3Dmol-min.js',[asset.bytes,'text/javascript; charset=utf-8']],['/LICENSE-3Dmol.txt',[asset.license,'text/plain; charset=utf-8']]]);
   if(files.has(url.pathname)){const [bytes,type]=files.get(url.pathname)!;res.setHeader('Content-Type',type);res.end(bytes);return;}
   if(url.pathname!=='/api/structure'||url.search){res.statusCode=404;throw new Error('Not found');}
   if(!authorized){res.statusCode=403;throw new Error('Viewer token required');}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({schema_version:1,structure:snapshot,snapshot_sha256:snapshotHash,renderer,read_only:true}));
  }catch(error){if(res.statusCode===200)res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:errorMessage(error)}));}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {url:'http://127.0.0.1:'+(server.address() as AddressInfo).port+'/#'+token,token,server,renderer,object_id:snapshot.object_id,snapshot_sha256:snapshotHash,close};
}
function writeNew(file:unknown,value:unknown){require(typeof file==='string'&&path.isAbsolute(file),'New absolute connection path required');const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp',fd=openSync(temp,'wx');try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}try{linkSync(temp,file);}finally{unlinkSync(temp);}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args:Record<string,string>={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];require(['--snapshot','--asset','--connection-file','--port'].includes(key)&&value&&!Object.hasOwn(args,key),'Usage: --snapshot ABS_JSON --asset ABS_3DMOL_BUNDLE --connection-file ABS_NEW_JSON [--port 0]');args[key]=value;}
 const structure:unknown=JSON.parse(ordinary(args['--snapshot'],2*1024*1024).toString('utf8'));let viewer:Awaited<ReturnType<typeof createStructureViewer>>|undefined;
 try{viewer=await createStructureViewer({structure,assetPath:args['--asset'],port:Number(args['--port']??0),onClosed:record=>writeNew(args['--connection-file']+'.closed.json',record)});writeNew(args['--connection-file'],{schema_version:1,port:(viewer.server.address() as AddressInfo).port,token:viewer.token,pid:process.pid,object_id:viewer.object_id,snapshot_sha256:viewer.snapshot_sha256,renderer:viewer.renderer});}
 catch(error){if(viewer)await viewer.close();throw error;}
 process.stdout.write(JSON.stringify({url:viewer.url,object_id:viewer.object_id,renderer:viewer.renderer})+'\n');let closing=false;const close=async()=>{if(!closing){closing=true;await viewer.close();}};process.on('SIGINT',close);process.on('SIGTERM',close);
}
