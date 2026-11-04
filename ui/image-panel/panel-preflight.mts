// Panel-only proof that one exact HTTP batch never reached scientific dispatch.
// Provider admission receipts and scientific request journals remain separate.
export interface PanelActionPreflight {
 schema_version:1;kind:'panel_action_preflight_failure';code:'HISTORICAL_ROI_SOURCE';
 phase:'before_scientific_dispatch';submission_state:'not_submitted';provider_request_id:null;automatic_retry:false;
 action:'mark'|'edit';expected_object_id:string;draft_revision:number;client_batch_id:string;
}
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const keys=['schema_version','kind','code','phase','submission_state','provider_request_id','automatic_retry','action','expected_object_id','draft_revision','client_batch_id'];
export const panelBatchId=(value:unknown):value is string=>typeof value==='string'&&/^panel-action-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function scope(value:unknown){return record(value)&&typeof value.action==='string'&&['mark','edit'].includes(value.action)&&typeof value.expected_object_id==='string'&&/^[a-f0-9]{32}$/.test(value.expected_object_id)&&Number.isSafeInteger(value.draft_revision)&&Number(value.draft_revision)>=0&&panelBatchId(value.client_batch_id)?value:null;}
export function makePanelActionPreflight(input:unknown):PanelActionPreflight|null {
 const value=scope(input);return value?{schema_version:1,kind:'panel_action_preflight_failure',code:'HISTORICAL_ROI_SOURCE',phase:'before_scientific_dispatch',submission_state:'not_submitted',provider_request_id:null,automatic_retry:false,action:value.action as 'mark'|'edit',expected_object_id:value.expected_object_id as string,draft_revision:value.draft_revision as number,client_batch_id:value.client_batch_id as string}:null;
}
export function readPanelActionPreflight(input:unknown,request?:unknown):PanelActionPreflight|null {
 if(!record(input)||Object.keys(input).length!==keys.length||Object.keys(input).some(key=>!keys.includes(key))||input.schema_version!==1||input.kind!=='panel_action_preflight_failure'||input.code!=='HISTORICAL_ROI_SOURCE'||input.phase!=='before_scientific_dispatch'||input.submission_state!=='not_submitted'||input.provider_request_id!==null||input.automatic_retry!==false||!scope(input))return null;
 if(request!==undefined){const expected=scope(request);if(!expected||['action','expected_object_id','draft_revision','client_batch_id'].some(key=>input[key]!==expected[key]))return null;}
 return input as unknown as PanelActionPreflight;
}
