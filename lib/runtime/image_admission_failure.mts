// Narrow transport metadata for positively proved image admission refusals.
// Text, timeouts, broken pipes and arbitrary provider failures never qualify.
export interface ImageAdmissionFailure {schema_version:1;kind:'image_operation_admission_failure';provider:'external-image-workspace';tool:string;code:string;submission_state:'not_submitted';request_id:string;original_request_id:string|null;automatic_retry:false;}
const codes=new Set(['WORKSPACE_WRITE_CONFLICT','WORKSPACE_METADATA_BUSY','IMAGE_WORKER_NOT_SUBMITTED']);
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value);
const write=(tool:unknown):tool is string=>typeof tool==='string'&&tool.startsWith('image_')&&!['image_info','image_result','image_evidence','image_probe'].includes(tool);
const row=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export function imageAdmissionFailureFromError(error:unknown,tool:unknown,requestId:unknown):ImageAdmissionFailure|null {
 if(!row(error)||!write(tool)||!id(requestId)||typeof error.code!=='string'||!codes.has(error.code)||error.submission_state!=='not_submitted')return null;
 if(error.request_id!==undefined&&error.request_id!==requestId)return null;
 return {schema_version:1,kind:'image_operation_admission_failure',provider:'external-image-workspace',tool,code:error.code,submission_state:'not_submitted',request_id:requestId,original_request_id:id(error.original_request_id)?error.original_request_id:null,automatic_retry:false};
}
export function readImageAdmissionFailure(value:unknown,tool?:unknown,requestId?:unknown):ImageAdmissionFailure|null {
 if(!row(value)||value.schema_version!==1||value.kind!=='image_operation_admission_failure'||value.provider!=='external-image-workspace'||!write(value.tool)||typeof value.code!=='string'||!codes.has(value.code)||value.submission_state!=='not_submitted'||!id(value.request_id)||value.original_request_id!==null&&!id(value.original_request_id)||value.automatic_retry!==false||tool!==undefined&&value.tool!==tool||requestId!==undefined&&value.request_id!==requestId)return null;
 return value as unknown as ImageAdmissionFailure;
}
