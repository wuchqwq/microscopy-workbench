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

// A failed original is terminal, but is never a claim that nothing ran.
// Accept this only from the provider's strict original-result decoder.
export interface ImageOriginalFailure {schema_version:1;kind:'image_original_failure';provider:'external-image-workspace';request_id:string;state:'failed';automatic_retry:false;original_failure:Record<string,unknown>;}
export function readImageOriginalFailure(value:unknown,requestId:unknown):ImageOriginalFailure|null {
 if(!row(value)||value.schema_version!==1||value.kind!=='image_original_failure'||value.provider!=='external-image-workspace'||!id(requestId)||value.request_id!==requestId||value.state!=='failed'||value.automatic_retry!==false||!row(value.original_failure))return null;
 const receipt=value.original_failure;
 if(receipt.schema_version!==1||receipt.request_id!==requestId||!row(receipt.parameters)||receipt.parameters.request_id!==requestId||!['statistics','calibrate'].includes(String(receipt.parameters.action))||!['parameters_sha256','journal_sha256'].every(key=>typeof receipt[key]==='string'&&/^[a-f0-9]{64}$/.test(receipt[key] as string))||!['INVALID_ARGUMENT','BUDGET_EXCEEDED','PROVIDER_FAILURE'].includes(String(receipt.error_code)))return null;
 return value as unknown as ImageOriginalFailure;
}
export function imageOriginalFailureFromError(error:unknown,tool:unknown,requestId:unknown):ImageOriginalFailure|null {
 if(tool!=='image_result'||!row(error)||!row(error.diagnostic))return null;const d=error.diagnostic;
 if(d.provider!=='external-image-workspace'||d.phase!=='response_validation'||d.request_id!==requestId||d.provider_reported_state!=='failed'||d.submission_state!=='provider_reported_failure')return null;
 return readImageOriginalFailure({schema_version:1,kind:'image_original_failure',provider:'external-image-workspace',request_id:requestId,state:'failed',automatic_retry:false,original_failure:d.original_failure},requestId);
}
