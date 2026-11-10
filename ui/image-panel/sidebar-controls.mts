import type {BrowserDocument,BrowserElement} from './browser-ports.mjs';
// Layout preference only. No source, selection, science or saved-result mutation.
export function installSidebarControls(document:BrowserDocument){
 const toggle=document.getElementById('toggle-sidebar'),resizer=document.getElementById('sidebar-resizer');if(!toggle||!resizer)return;
 let width=144,collapsed=false,drag:{pointer:number;x:number;width:number}|null=null;
 const apply=()=>{const value=collapsed?46:width;const style=document.body.style as unknown as {setProperty?:(key:string,value:string)=>void};if(style.setProperty)style.setProperty('--tools',value+'px');else document.body.setAttribute('style','--tools:'+value+'px');document.body.classList.toggle('sidebar-collapsed',collapsed);toggle.textContent=collapsed?'›':'‹';toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'展开工具栏':'折叠工具栏');toggle.title=collapsed?'展开工具名称':'折叠为图标栏';resizer.setAttribute('aria-valuenow',String(value));resizer.setAttribute('aria-valuetext',collapsed?'图标栏':value+' 像素');};
 toggle.onclick=()=>{collapsed=!collapsed;apply();};
 resizer.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();collapsed=false;drag={pointer:event.pointerId,x:event.clientX,width};resizer.setPointerCapture(event.pointerId);apply();};
 resizer.onpointermove=event=>{if(!drag||drag.pointer!==event.pointerId)return;width=Math.max(132,Math.min(280,drag.width+event.clientX-drag.x));apply();};
 resizer.onpointerup=resizer.onpointercancel=()=>{drag=null;};
 resizer.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();if(event.key==='Home')collapsed=true;else if(event.key==='End')collapsed=false;else{collapsed=false;width=Math.max(132,Math.min(280,width+(event.key==='ArrowRight'?12:-12)));}apply();};
 const icons:Record<string,string>={'open-cif-candidates':'CIF',fft:'FFT','live-fft':'Live','roi-statistics':'Σ','view-statistics':'Σ▣','line-profile':'∿',measure:'↔','known-length-entry':'尺','open-results':'≡','open-science-parameters':'⚙','apply-roi':'▣','measure-angle':'∠','set-diffraction-center':'⊕','length-tool-entry':'↔','angle-tool-entry':'∠','diffraction-tool-entry':'⊕'};
 for(const [id,icon]of Object.entries(icons)){const el=document.getElementById(id);if(!el)continue;el.setAttribute('data-command-icon',icon);if(!el.title)el.title=el.textContent??id;if(!['measure','view-statistics'].includes(id))el.setAttribute('aria-label',el.textContent??id);}
 apply();
}
