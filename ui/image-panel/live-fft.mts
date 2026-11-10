// One opt-in, debounced preview lane over the existing journalled FFT action.
// Completed results remain immutable; changing input never adopts an old reply.
export class LiveFftInputChanged extends Error {}
export interface LiveFftInput {key:string;label:string;body:Readonly<Record<string,unknown>>;}
export interface LiveFftResult {request_id:string;object_id:string;png_base64:string;source_view_object_id:string;float_roi_xyxy:readonly number[];processing_rect_xyxy:readonly number[];}
export interface LiveFftState {enabled:boolean;status:'off'|'waiting'|'running'|'stale'|'ready'|'error';message:string;result:LiveFftResult|null;canPin:boolean;}
interface Options {input:()=>LiveFftInput|null;execute:(input:LiveFftInput)=>Promise<LiveFftResult>;changed:(state:LiveFftState)=>void;schedule:(callback:()=>void,ms:number)=>unknown;cancel:(id:unknown)=>void;}
export class LiveFftPreview {
 private enabled=false;private blocked=false;private running=false;private timer:unknown=null;private key='';private resultKey='';private result:LiveFftResult|null=null;private generation=0;private status:LiveFftState['status']='off';private message='实时更新已关闭';
 constructor(private readonly options:Options){}
 setEnabled(value:boolean){this.enabled=value;this.blocked=false;this.generation++;this.key='';this.cancel();if(!value){this.status='off';this.message='实时更新已关闭；已完成的结果仍保留';this.emit();}else this.sync();}
 private cancel(){if(this.timer!==null){this.options.cancel(this.timer);this.timer=null;}}
 private emit(){this.options.changed({enabled:this.enabled,status:this.status,message:this.message,result:this.result,canPin:this.enabled&&!this.blocked&&!this.running&&this.status==='ready'&&this.resultKey===this.key&&Boolean(this.result)});}
 sync(){
  if(!this.enabled||this.blocked)return;const input=this.options.input(),key=input?.key??'';if(key===this.key)return;this.key=key;this.generation++;this.cancel();
  this.status=this.result?'stale':'waiting';this.message=input?'选区已改变，等待更新；现有频谱仍对应此前输入':'请选择空间图像中的矩形 ROI；此前频谱保留';this.emit();if(input&&!this.running)this.queue();
 }
 private queue(){this.cancel();this.timer=this.options.schedule(()=>{this.timer=null;void this.run();},350);}
 private async run(){
  if(!this.enabled||this.blocked||this.running)return;const input=this.options.input();if(!input||input.key!==this.key){this.key='';this.sync();return;}
  const generation=this.generation;this.running=true;this.status='running';this.message='正在更新 '+input.label+'；旧频谱不会作为新选区结果';this.emit();
  try{const result=await this.options.execute(input);if(!result||typeof result.request_id!=='string'||typeof result.object_id!=='string'||typeof result.png_base64!=='string')throw Error('实时频谱返回缺少原请求或保存图像');
   if(this.enabled&&generation===this.generation&&this.options.input()?.key===input.key){this.result=result;this.resultKey=input.key;this.status='ready';this.message='已更新 · '+input.label;}
  }catch(error){if(error instanceof LiveFftInputChanged&&this.options.input()?.key!==input.key){this.key='';}else if(this.enabled){this.blocked=true;this.status='error';this.message='实时更新已暂停：'+(error as Error).message+'。保留原请求；请先核对，不自动重试。';}}
  finally{this.running=false;if(this.enabled&&!this.blocked){const latest=this.options.input();if(latest?.key!==input.key||generation!==this.generation){this.key=latest?.key??'';this.status=this.result?'stale':'waiting';this.message='旧回包未替换新选区；等待最新输入';if(latest)this.queue();}}this.emit();}
 }
 currentResult():LiveFftResult|null{return this.enabled&&!this.blocked&&!this.running&&this.status==='ready'&&this.resultKey===this.options.input()?.key?this.result:null;}
}
