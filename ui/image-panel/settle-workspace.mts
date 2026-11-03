export interface EditableWindowState {active:string|null;visible:readonly string[];retained:readonly string[];dirty:readonly string[];}
interface Ports {read:()=>Promise<EditableWindowState>;settleCurrent:()=>Promise<void>;activate:(id:string)=>Promise<void>;close:(id:string)=>Promise<void>;}
// Save preparation uses the one existing editor. Hidden working edits must be
// materialized too, or a saved GUI B could still be read by the CLI as A.
export async function settleWorkspaceWindows(ports:Ports):Promise<void>{
 const initial=await ports.read();await ports.settleCurrent();const visited=new Set<string>();
 for(;;){
  const state=await ports.read(),target=state.dirty.find(id=>!visited.has(id));
  if(!target){if(state.dirty.length)throw new Error('仍有窗口工作编辑未能核对；没有发布保存点。');break;}
  if(!state.retained.includes(target)||visited.size>=32)throw new Error('工作窗口引用不完整；编辑保留，没有发布保存点。');
  if(!state.visible.includes(target)&&state.visible.length>=5){const victim=state.active??state.visible[0];if(!victim)throw new Error('无法安全腾出显示位置。');await ports.close(victim);}
  await ports.activate(target);await ports.settleCurrent();visited.add(target);
 }
 // Restore only display preferences after successful preparation. Executed
 // objects and the newly materialized analysis versions remain immutable.
 for(const id of (await ports.read()).visible)if(!initial.visible.includes(id))await ports.close(id);
 for(const id of initial.visible)if(!(await ports.read()).visible.includes(id))await ports.activate(id);
 if(initial.active&&(await ports.read()).active!==initial.active)await ports.activate(initial.active);
 if(!initial.visible.length)for(const id of (await ports.read()).visible)await ports.close(id);
}
