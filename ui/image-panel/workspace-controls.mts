import type {BrowserDocument} from './browser-ports.mjs';

export interface AnalysisSaveState {
 schema_version:1;status:'new'|'legacy'|'clean'|'dirty'|'saving'|'save_unknown'|'recovery_available';
 working_revision:number;save_id:string|null;saved_revision:number|null;recovery_available:boolean;unresolved_request_id:string|null;
 unresolved_save_id?:string|null;dirty?:boolean;
}
export interface WorkspaceControlState {workspace_analysis?:AnalysisSaveState;}
interface Options<S extends WorkspaceControlState> {
 document:BrowserDocument;getState:()=>S|undefined;read:()=>Promise<S>;
 command:(body:Readonly<Record<string,unknown>>)=>Promise<S>;
 settle:()=>Promise<void>;prepare?:()=>Promise<void>;install:(state:S,action:'save'|'query-save'|'discard'|'recover')=>Promise<void>;
 localDirty:()=>boolean;blocked:()=>boolean;requestId:()=>string;
 onError:(message:string)=>void;onMessage:(message:string)=>void;
 interactionVersion?:()=>string|number;onRestoreLock?:(locked:boolean)=>void;prepareRestore?:()=>Promise<void>;onRestoreConflict?:(state:S)=>void;
}
export function analysisStatusText(state:AnalysisSaveState|undefined,localDirty=false):string {
 if(!state)return '保存状态尚未核对';
 if(state.unresolved_request_id)return '原请求结果待核对 · 编辑保留';
 if(state.status==='saving')return '正在保存分析工作区';
 if(state.status==='save_unknown')return '保存结果待核对 · 请查询原保存';
 if(state.status==='legacy')return '旧版恢复记录 · 尚无明确保存点';
 if(localDirty||state.dirty||state.status==='dirty')return '工作区有未保存修改'+(state.recovery_available?' · 恢复记录另行保留':'');
 if(state.status==='new')return '新工作区 · 尚未明确保存';
 if(state.recovery_available)return '已打开保存版本 · 有未保存恢复记录';
 return '分析工作区已保存';
}

// These controls only publish/check the application savepoint. Numerical work
// and immutable scientific records remain owned by the existing provider.
export class WorkspaceControls<S extends WorkspaceControlState> {
 private pendingSaveId:string|null=null;private busy=false;
 constructor(private readonly options:Options<S>){
  const bind=(id:string,action:()=>Promise<void>)=>{const element=options.document.getElementById(id);if(element)element.onclick=()=>{void action().catch(error=>options.onError((error as Error).message));};};
  bind('workspace-save',()=>this.save());bind('workspace-query-save',()=>this.querySave());
  bind('workspace-recover',()=>this.recover());bind('workspace-discard',()=>this.discard());
 }
 sync():void {
  const state=this.options.getState()?.workspace_analysis,d=this.options.document;
  const status=d.getElementById('workspace-save-status');if(status)status.textContent=this.busy?'正在核对工作区保存':analysisStatusText(state,this.options.localDirty());
  const save=d.getElementById('workspace-save');if(save)save.disabled=this.busy||!state||this.options.blocked()||['saving','save_unknown'].includes(state.status)||Boolean(state.unresolved_request_id);
  const query=d.getElementById('workspace-query-save');if(query){query.hidden=!this.pendingSaveId&&!['saving','save_unknown'].includes(state?.status??'');query.disabled=this.busy;}
  const recover=d.getElementById('workspace-recover');if(recover){recover.hidden=!state?.recovery_available;recover.disabled=this.busy||this.options.blocked()||['saving','save_unknown'].includes(state?.status??'')||Boolean(state?.unresolved_request_id);}
 }
 private async run(action:()=>Promise<void>):Promise<void>{if(this.busy)throw new Error('工作区操作尚未完成，请先核对原结果。');this.busy=true;this.sync();try{await action();}finally{this.busy=false;this.sync();}}
 async prepareClose():Promise<void>{
  if(this.busy||this.options.blocked())throw new Error('先结束手势或核对原执行请求，工作区保持打开。');
  await (this.options.prepare??this.options.settle)();
 }
 async save():Promise<void>{await this.run(async()=>{
  if(this.options.blocked())throw new Error('当前操作尚未完成；保存不会代替原请求恢复。');
  await this.options.settle();const state=await this.options.read(),analysis=state.workspace_analysis;
  if(!analysis)throw new Error('当前服务不支持明确工作区保存。');
  if(['saving','save_unknown'].includes(analysis.status)||analysis.unresolved_request_id)throw new Error('先等待或查询原请求；不提交另一次保存。');
  // Retain this exact intent if its response is lost. Only query can clear it.
  if(this.pendingSaveId)throw new Error('上次保存结果尚未确认，请查询原保存。');
  this.pendingSaveId=this.options.requestId();
  const result=await this.options.command({action:'save',expected_working_revision:analysis.working_revision,save_id:this.pendingSaveId});
  if(!result.workspace_analysis||!['clean','dirty','recovery_available'].includes(result.workspace_analysis.status)||result.workspace_analysis.save_id!==this.pendingSaveId)throw new Error('保存尚未读回确认；编辑保留，请查询原保存。');
  this.pendingSaveId=null;await this.options.install(result,'save');
  this.options.onMessage(result.workspace_analysis.recovery_available?'当前版本已保存；另有未保存恢复记录，仍需明确处理。':result.workspace_analysis.status==='clean'?'分析工作区已保存并读回。':'所选版本已保存；后续编辑仍未保存。');
 });}
 async querySave():Promise<void>{await this.run(async()=>{
  const current=await this.options.read(),analysis=current.workspace_analysis,id=this.pendingSaveId??analysis?.unresolved_save_id??analysis?.save_id;
  if(!id||!analysis)throw new Error('没有可查询的原保存身份。');
  const result=await this.options.command({action:'query-save',save_id:id,expected_working_revision:analysis.working_revision});
  if(!result.workspace_analysis||result.workspace_analysis.status==='save_unknown'||result.workspace_analysis.status==='saving')throw new Error('原保存结果仍未知；不会自动重放。');
  this.pendingSaveId=null;await this.options.install(result,'query-save');this.options.onMessage('已查询原保存；请查看工作区状态。');
 });}
 async discard():Promise<void>{await this.restore('discard');}
 async recover():Promise<void>{await this.restore('recover');}
 private async restore(action:'discard'|'recover'):Promise<void>{await this.run(async()=>{
  if(this.pendingSaveId||this.options.blocked())throw new Error('原请求尚未核对，保留编辑和工作区。');
  if(action==='recover'&&(this.options.localDirty()||this.options.getState()?.workspace_analysis?.dirty))throw new Error('当前有新编辑或未决请求；先处理当前工作区，再选择恢复。');
  const version=this.options.interactionVersion?.(),initialDirty=this.options.localDirty();
  const changed=()=>this.options.interactionVersion?.()!==version||!initialDirty&&this.options.localDirty();
  this.options.onRestoreLock?.(true);
  try{
   await this.options.prepareRestore?.();const state=await this.options.read(),analysis=state.workspace_analysis;
   if(changed())throw new Error('核对期间出现新编辑；工作内容保留，未提交恢复或丢弃。');
   if(!analysis)throw new Error('工作区保存状态不可用。');
   if(action==='recover'&&!analysis.recovery_available)throw new Error('没有可核对的未保存恢复记录。');
   const result=await this.options.command({action,expected_working_revision:analysis.working_revision});
   if(changed()){this.options.onRestoreConflict?.(result);throw new Error('响应期间出现新编辑；新草稿保留，返回的版本等待核对。');}
   await this.options.install(result,action);this.options.onMessage(action==='discard'?'已回到明确保存版本；探索执行记录仍保留。':'已恢复未保存工作编辑；仍须明确保存。');
  }finally{this.options.onRestoreLock?.(false);}
 });}
}
