import {closeBlocked} from './desktop_contracts.mjs';
import type {DesktopAction,DesktopActionReply,DesktopWorkspaceStatus,DesktopDiscardQuery,DesktopDiscardOperation} from './desktop_contracts.mjs';
export interface DesktopClosePorts {
 action:(action:DesktopAction)=>Promise<DesktopActionReply>;
 status:()=>Promise<DesktopWorkspaceStatus>;
 queryDiscard?:()=>Promise<DesktopDiscardQuery|null>;
 resumeClose?:()=>Promise<boolean|null>;
 acknowledgeDiscard?:(operation:DesktopDiscardOperation)=>void;
 freezeInput?:(frozen:boolean)=>void;
 choose:(state:DesktopWorkspaceStatus)=>Promise<'save'|'discard'|'cancel'>;
 discard:(revision:number)=>Promise<DesktopWorkspaceStatus>;
 close:(revision:number)=>Promise<void>;
 error:(message:string)=>Promise<void>;
}
// Both the native window X and File/Exit use this exact serialized path.
export class DesktopCloseCoordinator {
 private pending:Promise<boolean>|null=null;
 constructor(private readonly ports:DesktopClosePorts){}
 request():Promise<boolean>{return this.pending??=(this.run().finally(()=>{this.pending=null;}));}
 private async run():Promise<boolean>{
  try{
   this.ports.freezeInput?.(true);
   // An earlier close may already have committed and stopped HTTP listening.
   // Query its receipt before renderer work/status; never submit close again.
   const resumed=await this.ports.resumeClose?.();if(resumed!==undefined&&resumed!==null)return resumed;
   const prior=await this.ports.queryDiscard?.();if(prior){
    const operation=prior.operation,identity='原丢弃操作 command_id='+operation.command_id;
    if(['running','unknown'].includes(operation.state))throw new Error(identity+' 仍在执行或结果未知；窗口保持打开，请稍后查询原操作，不会重复提交。');
    const local=await this.ports.action('inspect-close-state');
    if(!local.ok||local.working_revision!==prior.status.working_revision)throw new Error(identity+' 已返回，但当前界面或本地编辑尚未与权威状态一致。请用“显示与高级设置 → 诊断与原请求恢复 → 检查 Agent 结果”读回；新草稿保留，不自动关闭。');
    if(!this.ports.acknowledgeDiscard)throw new Error(identity+' 缺少终态核对，窗口保持打开。');this.ports.acknowledgeDiscard(operation);
    throw new Error(identity+(operation.state==='completed'?' 已完成并核对。':' 已明确失败并核对；失败不等于未执行。')+'窗口保持打开；下一次明确退出才重新核对关闭条件，不自动重放。');
   }
   const prepared=await this.ports.action('prepare-close');if(!prepared.ok)throw new Error(prepared.error??'工作编辑尚未可靠提交；窗口保持打开。');
   let status=await this.ports.status();
   if(closeBlocked(status))throw new Error('科学任务或保存结果仍待核对。请等待或查询原请求 '+(status.unresolved_request_id??'')+'；窗口保持打开。');
   if(status.dirty||status.recovery_available||!status.can_close){
    const choice=await this.ports.choose(status);if(choice==='cancel')return false;
    if(choice==='save'){
     const saved=await this.ports.action('save');if(!saved.ok)throw new Error(saved.error??'保存失败，编辑仍保留。');
     status=await this.ports.status();
    }else status=await this.ports.discard(status.working_revision);
   }
   if(!status.can_close||status.dirty||status.recovery_available||closeBlocked(status))throw new Error('工作区仍有修改、恢复草稿或未知结果；窗口保持打开。');
   await this.ports.close(status.working_revision);return true;
  }catch(error){await this.ports.error(error instanceof Error?error.message:String(error));return false;}finally{this.ports.freezeInput?.(false);}
 }
}
