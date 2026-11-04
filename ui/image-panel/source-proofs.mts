import type {BrowserDocument} from './browser-ports.mjs';

type Row=Readonly<Record<string,unknown>>;
const row=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
export interface SourceProofUiOptions {
 document:BrowserDocument;getState:()=>Row;blocked:()=>boolean;repairBlocked:()=>boolean;pending:()=>string|null;
 record:()=>Promise<void>;read:()=>Promise<void>;query:()=>Promise<void>;adopt:(proof:Row,replaceProofId?:string)=>Promise<void>;
 error:(text:string)=>void;
}
// Display only the last explicit check. Rendering never discovers or issues a
// proof, and a verified provider object is separate from workspace adoption.
export class SourceProofPanel {
 constructor(private readonly options:SourceProofUiOptions){
  for(const [id,action]of [['record-source-proof',options.record],['read-source-proofs',options.read],['query-source-proof',options.query]] as const){const button=this.el(id);if(button)button.onclick=()=>this.run(action);}
  const replace=this.el('replace-source-proof');if(replace)replace.onchange=()=>this.render();
 }
 private el(id:string){return this.options.document.getElementById(id);}
 private async run(action:()=>Promise<void>){try{await action();}catch(error){this.options.error((error as Error).message);}finally{this.render();}}
 render(){
  const state=this.options.getState(),model=row(state.source_proofs),records=Array.isArray(model.records)?model.records:[],pending=this.options.pending(),blocked=this.options.blocked(),repairBlocked=this.options.repairBlocked(),tools=Array.isArray(state.tools)?state.tools:[],available=tools.some(tool=>row(tool).name==='image_source_proof'),object=row(state.object),panels=Array.isArray(object.panels)?object.panels:[];
  const replace=this.el('replace-source-proof'),selected=replace?.value??'',refs=Array.isArray(model.references)?model.references:[];if(replace){replace.replaceChildren();const add=(value:string,text:string)=>{const option=this.options.document.createElement('option');option.value=value;option.textContent=text;replace.append(option);};add('','新增引用（须先处理草稿）');for(const raw of refs){const ref=row(raw);if(typeof ref.object_id==='string')add(ref.object_id,'明确替换 '+ref.object_id.slice(0,12)+'…');}replace.value=refs.some(ref=>row(ref).object_id===selected)?selected:'';replace.disabled=repairBlocked||Boolean(pending);}const replaceId=replace?.value||undefined;
  const mint=this.el('record-source-proof'),read=this.el('read-source-proofs'),query=this.el('query-source-proof');if(mint)mint.disabled=!available||panels.length!==1||row(panels[0]).domain!=='spatial_pixels'||repairBlocked||Boolean(pending);if(read)read.disabled=Boolean(pending)||!available;if(query){query.hidden=!pending;query.disabled=!pending;}
  const status=this.el('source-proof-status');if(status)status.textContent=pending?'证明操作尚未确认；只查询原请求，不自动重发。':!available?'当前 provider 未提供来源证明工具。':'证明记录、采用到工作分析和 Ctrl+S 保存分别处理；不涵盖未应用草稿。新对象版本须明确核对当前准确根，不自动继承旧证明。下方显示上次核对结果。';
  const content=this.el('source-proof-records');if(!content)return;content.replaceChildren();
  for(const raw of records){const proof=row(raw),entry=this.options.document.createElement('div'),text=this.options.document.createElement('p'),purpose=proof.purpose==='fft_input'?'FFT 输入证明':proof.purpose==='saved_source'?'保存来源证明':'来源／输入证明',status=proof.status==='verified'?'上次核对通过':proof.status==='revoked'?'已撤回':'当前不可用',sameRoot=proof.root_object_id===object.object_id;text.textContent=purpose+' · '+status+' · '+(proof.adopted?'已采用为工作引用，保存状态见工作区':'已记录，未采用')+(proof.basis==='retrospective'?' · 回溯证明，原资格不变':'')+(proof.purpose==='saved_source'&&!sameRoot?' · 当前对象不同；原证明不授予新对象相同资格':'')+(proof.reason?' · '+String(proof.reason):'');entry.append(text);
   if(proof.status==='verified'&&proof.eligible_for_exact_scope===true&&!proof.adopted&&typeof proof.manifest_sha256==='string'){const adopt=this.options.document.createElement('button');adopt.id='adopt-source-proof-'+String(proof.proof_object_id);adopt.textContent=replaceId?'明确替换所选证明引用':'采用此证明到工作分析';adopt.disabled=(replaceId?repairBlocked:blocked)||Boolean(pending)||proof.purpose==='saved_source'&&!sameRoot;adopt.onclick=()=>this.run(()=>this.options.adopt(proof,replaceId));entry.append(adopt);}content.append(entry);
  }
 }
}
