import type {BrowserDocument} from './browser-ports.mjs';

export function installDesktopCanvasLayout(document:BrowserDocument){
 const get=(id:string)=>document.getElementById(id)!;
 const sidebar=document.querySelector('.workbench-sidebar')!;
 const strip=get('desktop-toolstrip'),groups=get('desktop-workflow-groups'),toggle=get('desktop-tools-toggle');
 const canvas=get('desktop-canvas-tools'),quick=get('desktop-quick-actions');
 document.body.classList.add('desktop-canvas-layout');
 canvas.append(sidebar.querySelector('.selection-palette')!,sidebar.querySelector('.zoom-control')!);
 for(const id of ['fft','gpa-entry','compare-fft-source','calibration-entry','diffraction-tool-entry','open-cif-candidates','toggle-properties','open-results'])quick.append(get(id));
 groups.append(...sidebar.querySelectorAll('.sidebar-group, .sidebar-connection'));
 strip.hidden=false;
 get('desktop-scale').hidden=false;
 document.querySelector('.desktop-save-label')!.hidden=false;
 toggle.onclick=()=>{
  groups.hidden=!groups.hidden;
  toggle.setAttribute('aria-expanded',String(!groups.hidden));
 };
}

export function renderDesktopScanContext(document:BrowserDocument,value:Readonly<Record<string,unknown>>|undefined){
 const get=(id:string)=>document.getElementById(id)!;
 const entry=get('desktop-scan-position'),section=get('desktop-scan-context');
 const shape=value?.scan_shape_yx,roi=value?.scan_roi_y0_y1_x0_x1_exclusive;
 const valid=Array.isArray(shape)&&shape.length===2&&shape.every(n=>Number.isSafeInteger(n)&&n>0)&&
  Array.isArray(roi)&&roi.length===4&&roi.every(n=>Number.isSafeInteger(n)&&n>=0)&&
  roi[0]<roi[1]&&roi[2]<roi[3]&&roi[1]<=shape[0]&&roi[3]<=shape[1];
 entry.hidden=section.hidden=!valid;
 if(!valid){section.open=false;return;}
 const [height,width]=shape,[y0,y1,x0,x1]=roi;
 get('desktop-scan-bounds').textContent=`${height} 行 × ${width} 列 · Y [${y0}, ${y1}) · X [${x0}, ${x1})`;
 const region=get('desktop-scan-roi').style;
 region.left=(100*x0/width)+'%';region.top=(100*y0/height)+'%';
 region.width=(100*(x1-x0)/width)+'%';region.height=(100*(y1-y0)/height)+'%';
}
