import {closeBlocked} from './desktop_contracts.mjs';
import type {DesktopAction,DesktopActionReply,DesktopWorkspaceStatus} from './desktop_contracts.mjs';
export interface DesktopClosePorts {
 action:(action:DesktopAction)=>Promise<DesktopActionReply>;
 status:()=>Promise<DesktopWorkspaceStatus>;
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
  }catch(error){await this.ports.error(error instanceof Error?error.message:String(error));return false;}
 }
}
