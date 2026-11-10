// Explicit recovery exit reuses owned-backend EOF/drain. It is never Save,
// Don't Save, a scientific retry, or permission to force-kill any process.
export interface RecoveryExitPorts {
 confirm:()=>Promise<boolean>;
 freeze:(frozen:boolean)=>void;
 owned:()=>boolean;
 drain:()=>Promise<void>;
 exit:()=>void;
 error:(message:string)=>Promise<void>;
}
export async function exitWithRecovery(ports:RecoveryExitPorts):Promise<boolean>{
 ports.freeze(true);
 try{
  if(!await ports.confirm())return false;
  if(!ports.owned())throw Error('工作区身份已变化；未停止另一后台。');
  await ports.drain();
  if(!ports.owned())throw Error('原后台已排空，但窗口身份已变化；没有关闭另一窗口。');
  ports.exit();return true;
 }catch(error){await ports.error('恢复退出尚未完成：'+(error instanceof Error?error.message:String(error))+' 已写入记录保留；没有重发科学请求或强制结束进程。');return false;}
 finally{ports.freeze(false);}
}
