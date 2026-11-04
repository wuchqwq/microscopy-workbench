import type {BrowserDocument,BrowserElement} from './browser-ports.mjs';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
interface Options {document:BrowserDocument;read:()=>Promise<unknown>;show:(id:string,inputReference?:Readonly<Record<string,unknown>>)=>Promise<unknown>;error:(text:string)=>void;onOpen?:()=>BrowserElement|null;recordProof?:(record:Row)=>Promise<void>;proofBlocked?:()=>boolean;}
export function executionHistoryLabel(value:unknown):string {const r=row(value);if(r.qualification!=='validated')return r.execution_status==='completed'?'执行完成 · 原来源尚无法核对':'来源尚无法核对';return ({completed:'执行完成',unknown:'原请求结果未知',not_submitted:'已确认未提交',unavailable:'记录无法核对'} as Record<string,string>)[String(r.status)]??'状态未知';}
export class ExecutionHistoryPanel {
 private returnFocus:BrowserElement|null=null;
 constructor(private readonly options:Options){const d=options.document;
  const open=d.getElementById('open-execution-history');if(open)open.onclick=()=>this.open().catch(error=>options.error((error as Error).message));
  const close=d.getElementById('close-execution-history');if(close)close.onclick=()=>d.getElementById('execution-history-dialog')?.close();
  d.getElementById('execution-history-dialog')?.addEventListener('cancel',event=>{event.preventDefault();d.getElementById('execution-history-dialog')?.close();});
  d.getElementById('execution-history-dialog')?.addEventListener('close',()=>{this.returnFocus?.focus();this.returnFocus=null;});
 }
 private element(tag:string,value:string){const el=this.options.document.createElement(tag);el.textContent=value;return el;}
 async open(){const d=this.options.document;this.returnFocus=this.options.onOpen?.()??d.activeElement??d.getElementById('open-execution-history');const response=row(await this.options.read());if(response.schema_version!==1||response.read_only!==true||!Array.isArray(response.records))throw new Error('执行历史没有返回可核对的只读清单。');
  const body=d.getElementById('execution-history-rows')!;body.replaceChildren();
  for(const value of response.records){const record=row(value),input=row(record.input_snapshot),recipe=row(input.recipe),tr=this.element('tr','');
   tr.append(this.element('td',executionHistoryLabel(record)),this.element('td',`浮点选区 [${Array.isArray(input.float_roi_xyxy)?input.float_roi_xyxy.join(', '):'未知'}]\n实际处理范围 [${Array.isArray(input.processing_rect_xyxy)?input.processing_rect_xyxy.join(', '):'未知'}]`),this.element('td',`窗函数：${String(recipe.window??'未知')}\n去均值：${recipe.subtract_mean===true?'是':recipe.subtract_mean===false?'否':'未知'}`));
   const actions=this.element('td',''),qualified=record.status==='completed'&&record.qualification==='validated';
   for(const [label,target]of [['查看原空间输入',input.source_view_object_id],['查看 FFT',record.fft_object_id]])if(qualified&&id(target)){const button=this.element('button',label as string);button.onclick=async()=>{try{await this.options.show(target as string,label==='查看 FFT'?{kind:'execution',request_id:record.request_id}:undefined);d.getElementById('execution-history-dialog')!.close();}catch(error){const status=d.getElementById('execution-history-status');if(status)status.textContent=(error as Error).message;this.options.error((error as Error).message);}};actions.append(button);}
   if(this.options.recordProof&&(record.execution_status==='completed'||record.status==='completed')&&id(record.fft_object_id)&&typeof record.input_relative_path==='string'&&typeof record.input_sha256==='string'){const proof=this.element('button','记录输入证明');proof.disabled=Boolean(this.options.proofBlocked?.());proof.onclick=async()=>{try{await this.options.recordProof!(record);const status=d.getElementById('execution-history-status');if(status)status.textContent='输入证明操作已读回；在“显示与高级设置 → 诊断与原请求恢复”查看核对结果，再明确采用和保存。原执行资格不变。';}catch(error){const status=d.getElementById('execution-history-status');if(status)status.textContent=(error as Error).message;this.options.error((error as Error).message);}};actions.append(proof);}
   const details=this.element('details','');details.append(this.element('summary','请求与来源'),this.element('pre',JSON.stringify(record,null,2)));actions.append(details);tr.append(actions);body.append(tr);
  }
  d.getElementById('execution-history-empty')!.hidden=response.records.length>0;d.getElementById('execution-history-dialog')!.showModal();d.getElementById('close-execution-history')!.focus();
 }
}
