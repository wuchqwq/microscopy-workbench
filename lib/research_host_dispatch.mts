// Process-local disclosure capabilities. The trusted Panel/CLI owner supplies a
// synchronous current-state read and calls approve only after explicit review.
// No model, serialized flag or caller-supplied source can manufacture a grant.
import path from 'node:path';
import {recheckJointResearchEvidence} from './research_joint_binding.mjs';
import type {JointResearchEvidence} from './research_joint_binding.mjs';
import {lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readResearchQuestion} from '../ui/image-panel/research-question.mjs';
import {offlineLease} from './research_offline.mjs';
import {readImageProviderRecords} from './image_measurement_records.mjs';
import {recheckPreparedResearchHostImage} from './research_host_input.mjs';
import type {HostTurnInput,HostSnapshot,ResearchHost} from './research_host.mjs';
import type {HostWireInput} from './research_host_input.mjs';
import {readSavedResearchToolBinding} from './research_text_tools.mjs';
import type {TextToolPort,SavedResearchToolBinding} from './research_text_tools.mjs';
declare const approvalBrand:unique symbol;
export interface ApprovedResearchTurn {readonly [approvalBrand]:true;}
export interface ResearchSendReview {
 readonly context_sha256:string;readonly payload_sha256:string;
 readonly wire:readonly HostWireInput[];
}
export interface JointResearchReview extends ResearchSendReview {readonly kind:'image_science_v1';readonly tool_scope_sha256:string;readonly tool_scope:Readonly<Record<string,unknown>>;readonly catalog:TextToolPort['definitions'];readonly evidence_sha256?:string;readonly evidence?:Readonly<Row>;readonly continuation?:Readonly<Row>;}
type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
function need(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
const json=(v:unknown)=>JSON.stringify(v,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const sha=(v:unknown)=>createHash('sha256').update(json(v)).digest('hex');
function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
interface ReviewRecord {prepared:HostTurnInput;binding:string;wire:string;context:string;granted:boolean;joint?:SavedResearchToolBinding;evidence?:JointResearchEvidence;continuation?:{host:ResearchHost;thread:string;turn:string;session:string;context:string;sessionContext:string;parentGrant:Grant};}
interface Grant {owner:object;review:ReviewRecord;host:ResearchHost;session:string;readCurrent:()=>unknown;deadline:number;revoked:boolean;consumed:boolean;turn:string|null;}
const grants=new WeakMap<object,Grant>(),researchHosts=new WeakSet<object>();
function session(s:HostSnapshot){return json({thread:s.thread_id,task:s.task,revision:s.session_revision});}
function capture(prepared:HostTurnInput,readCurrent:()=>unknown){
 const raw=readCurrent();need(row(raw)&&typeof raw.workspace==='string'&&path.isAbsolute(raw.workspace)&&row(raw.panel),'Synchronous current workspace/Panel snapshot required');
 const panel=raw.panel,question=readResearchQuestion(panel.research_question);
 need(question&&row(panel.object)&&row(panel.frame_identity)&&row(panel.edit_state),'Current saved question/source required');
 need(panel.edit_state.dirty===false&&panel.edit_state.gesture_active===false&&panel.pending_result===null&&!panel.source_recheck,'Unsettled Panel input cannot be approved or sent');
 need(!row(panel.last_operation)||!['submitted','unknown'].includes(String(panel.last_operation.state)),'Original scientific outcome remains unresolved');
 const info=lstatSync(raw.workspace);need(info.isDirectory()&&!info.isSymbolicLink(),'Ordinary current workspace required');
 const current=recheckPreparedResearchHostImage(prepared);
 need(path.resolve(raw.workspace)===current.workspace&&realpathSync.native(raw.workspace)===current.workspace,'Current workspace differs from the prepared workspace');
 const source=current.input.source!;
 need(panel.object.object_id===source.view_id&&panel.frame_identity.frame_object_id===source.frame_id&&question.frame_object_id===source.frame_id&&question.text===current.input.text,'Current question or source differs from the prepared input');
 const reader=readImageProviderRecords(current.workspace),context=reader.object(question.context_object_id),frames=reader.lineage(question.context_object_id).frames;
 need(frames.length===1&&frames[0].object_id===source.frame_id,'Question context belongs to another or ambiguous frame');
 const lease=offlineLease({...panel,workspace_analysis:panel.workspace_analysis??{working_revision:0}});
 // Local binding only: no workspace pathname, lease or selection is sent.
 const binding=json({workspace:{path:current.workspace,dev:info.dev,ino:info.ino},question,question_context_sha256:context.manifest_sha256,source,lease,analysis_attached:panel.workspace_analysis!==undefined,selection:panel.selection??null});
 need(Buffer.byteLength(binding)<=64*1024,'Current research binding exceeds budget');
 const after=lstatSync(raw.workspace);need(after.isDirectory()&&!after.isSymbolicLink()&&after.dev===info.dev&&after.ino===info.ino,'Workspace identity changed while checking');
 return {binding,wire:json(current.wire)};
}
function jointScope(prepared:HostTurnInput,tools:SavedResearchToolBinding){
 tools.assertCurrent();const s=prepared.source!,scope=tools.scope,source=tools.source;
 need(scope.input_view_id===s.view_id&&scope.input_manifest_sha256===s.view_manifest_sha256&&scope.frame_id===s.frame_id&&source.frame_id===s.frame_id&&source.manifest_sha256===s.frame_manifest_sha256&&source.array_sha256===s.frame_array_sha256&&json(scope.source_rect_xyxy)===json(s.source_rect_xyxy),'Image and tools do not share the exact saved source');
 return {version:'image_science_v1',scope:tools.scope,catalog:tools.port.definitions,tool_context_sha256:tools.context_sha256};
}
function reviewedCapture(record:ReviewRecord,readCurrent:()=>unknown){
 const current=capture(record.prepared,readCurrent);if(record.evidence){const e=recheckJointResearchEvidence(record.evidence);need(json(e.projection.source)===json(record.prepared.source),'Evidence belongs to another reviewed image/source/range');const wire=JSON.parse(current.wire) as HostWireInput[];wire.push({type:'text',text:'Explicit saved measurement/calibration evidence (not model inference): '+json(e.projection)});current.wire=json(wire);}if(record.continuation){const c=record.continuation,wire=JSON.parse(current.wire) as HostWireInput[];wire.push({type:'text',text:'Explicit user correction on the completed original thread: '+json({thread_id:c.thread,previous_turn_id:c.turn,previous_context_sha256:c.context,session_task_context_sha256:c.sessionContext})});current.wire=json(wire);}return current;
}
function correctionReady(record:ReviewRecord,host:ResearchHost){const c=record.continuation;if(!c)return;const s=host.snapshot(),parent=c.parentGrant;need(parent.host===host&&parent.consumed&&(!parent.revoked||record.granted)&&parent.turn===c.turn&&parent.session===c.session&&parent.review.context===c.context&&c.host===host&&s.connection==='ready'&&s.turn_state==='completed'&&s.thread_id===c.thread&&s.turn_id===c.turn&&session(s)===c.session&&s.task?.context_sha256===c.sessionContext,'Original consumed grant and exact completed thread/turn/session required for explicit correction');}
export function createResearchSendGate({readCurrent}:{readCurrent:()=>unknown}){
 need(typeof readCurrent==='function','Trusted synchronous owner read required');
 const reviews=new WeakMap<object,ReviewRecord>(),owner=Object.freeze({});
 let active:Grant|undefined;
 function approveRecord(review:ResearchSendReview,host:ResearchHost,ttlMs:number,joint:boolean):ApprovedResearchTurn {
  const original=reviews.get(review);need(original&&!original.granted&&Boolean(original.joint)===joint,'Original unapproved review of the correct mode required');
  need(Number.isSafeInteger(ttlMs)&&ttlMs>0&&ttlMs<=300000,'Approval lifetime must be 1..300000 ms');
  const current=reviewedCapture(original,readCurrent),s=host.snapshot();correctionReady(original,host);if(original.joint)need(sha({binding:current.binding,payload:current.wire,joint:jointScope(original.prepared,original.joint)})===original.context,'Joint scope changed');
  need(current.binding===original.binding&&current.wire===original.wire,'Reviewed question/source/revisions changed; review again');
  need(s.connection==='ready'&&['idle','completed','failed','interrupted'].includes(s.turn_state)&&s.thread_id&&Number.isSafeInteger(s.session_revision)&&s.session_revision>0&&s.task?.context_sha256===(original.continuation?.sessionContext??original.context),'Current session is not bound to this exact reviewed research context');
  const handle=Object.freeze({}) as ApprovedResearchTurn;if(active)active.revoked=true;original.granted=true;
  active={owner,review:original,host,session:session(s),readCurrent,deadline:performance.now()+ttlMs,revoked:false,consumed:false,turn:null};grants.set(handle,active);researchHosts.add(host);return handle;
 }
 return Object.freeze({
  review(prepared:HostTurnInput):ResearchSendReview{
   const current=capture(prepared,readCurrent),context=sha({binding:current.binding,payload:current.wire});
   const result=freeze({context_sha256:context,payload_sha256:createHash('sha256').update(current.wire).digest('hex'),wire:JSON.parse(current.wire) as HostWireInput[]});
   reviews.set(result,{prepared,binding:current.binding,wire:current.wire,context,granted:false});return result;
  },
  reviewJoint(prepared:HostTurnInput,originalTools:unknown,evidence?:JointResearchEvidence,continuation?:{host:ResearchHost;originalThreadId:string;originalTurnId:string;previousContextSha256:string}):JointResearchReview {
   const tools=readSavedResearchToolBinding(originalTools),joint=jointScope(prepared,tools),record:ReviewRecord={prepared,binding:'',wire:'',context:'',granted:false,joint:tools,evidence};
   if(continuation){const s=continuation.host.snapshot();need(s.task?.context_sha256&&active&&active.review.joint?.port===tools.port&&active.review.context===continuation.previousContextSha256,'Original immediately previous review context required');record.continuation={host:continuation.host,thread:continuation.originalThreadId,turn:continuation.originalTurnId,session:session(s),context:active.review.context,sessionContext:s.task.context_sha256,parentGrant:active};correctionReady(record,continuation.host);}
   const current=reviewedCapture(record,readCurrent),context=sha({binding:current.binding,payload:current.wire,joint});record.binding=current.binding;record.wire=current.wire;record.context=context;
   const result=freeze({kind:'image_science_v1' as const,context_sha256:context,payload_sha256:createHash('sha256').update(current.wire).digest('hex'),wire:JSON.parse(current.wire) as HostWireInput[],tool_scope_sha256:sha(joint),tool_scope:structuredClone(tools.scope),catalog:structuredClone(tools.port.definitions),...(evidence?{evidence_sha256:evidence.sha256,evidence:structuredClone(evidence.projection)}:{}),...(record.continuation?{continuation:{thread_id:record.continuation.thread,previous_turn_id:record.continuation.turn,previous_context_sha256:record.continuation.context,session_task_context_sha256:record.continuation.sessionContext}}:{})});
   reviews.set(result,record);return result;
  },
  planJoint(review:JointResearchReview,host:ResearchHost){
   const original=reviews.get(review);need(original&&!original.granted&&original.joint,'Original unapproved joint review required');
   const current=reviewedCapture(original,readCurrent),s=host.snapshot();correctionReady(original,host);
   need(current.binding===original.binding&&current.wire===original.wire&&sha({binding:current.binding,payload:current.wire,joint:jointScope(original.prepared,original.joint)})===original.context,'Joint scope changed before planning');
   need(s.connection==='ready'&&s.thread_id&&s.session_revision>0&&s.task?.context_sha256===(original.continuation?.sessionContext??original.context),'Exact original session required');
   return freeze({context_sha256:original.context,payload_sha256:review.payload_sha256,thread_id:s.thread_id,previous_turn_id:original.continuation?.turn??null,session_revision:s.session_revision,evidence_sha256:review.evidence_sha256??null,previous_context_sha256:original.continuation?.context??null,session_task_context_sha256:s.task?.context_sha256??null,action:original.continuation?'same_thread_start_turn':'initial_start_turn'});
  },
  // Call only from the owner's explicit user-approval action, never from model
  // arguments or automatic preparation. A review object is not itself consent.
  approve(review:ResearchSendReview,host:ResearchHost,{ttlMs}:{ttlMs:number}):ApprovedResearchTurn{
   return approveRecord(review,host,ttlMs,false);
  },
  approveJoint(review:JointResearchReview,host:ResearchHost,{ttlMs}:{ttlMs:number}):ApprovedResearchTurn{return approveRecord(review,host,ttlMs,true);},
  recordJointTurn(approved:ApprovedResearchTurn,host:ResearchHost){
   const grant=grants.get(approved),s=host.snapshot();need(grant&&grant===active&&grant.owner===owner&&grant.host===host&&grant.review.joint&&grant.consumed&&!grant.revoked&&session(s)===grant.session&&s.connection==='ready'&&s.thread_id&&s.turn_id&&['running','awaiting_user','completed','failed','interrupted'].includes(s.turn_state),'Original accepted joint-turn receipt required');
   need(grant.turn===null||grant.turn===s.turn_id,'Accepted joint turn cannot be rebound');grant.turn=s.turn_id;
  },
  revoke(approved:ApprovedResearchTurn){const grant=grants.get(approved);need(grant&&grant.owner===owner,'Approval belongs to another authority');grant.revoked=true;},
 });
}
// A failed final check is known NOT dispatched. It is distinct from a transport
// error after stdin.write, whose outcome may be unknown and must not be replayed.
export class ResearchDispatchRefused extends Error {}
export function researchTurnDispatch(input:unknown,host:ResearchHost,jointPort?:TextToolPort){
 // WeakMap lookup and typeof do not consult caller properties or Proxy traps.
 // Never classify an ungranted object and later reread it for serialization.
 const grant=typeof input==='object'&&input!==null?grants.get(input):undefined;
 if(!grant){
  need(!jointPort&&typeof input==='string'&&!researchHosts.has(host),'An original approved research-turn handle is required; unbound diagnostics accept primitive strings only');
  return null;
 }
 const check=(starting:boolean)=>{
  try{
  need(Boolean(jointPort)===Boolean(grant.review.joint)&&(!jointPort||grant.review.joint!.port===jointPort),'Joint tool catalog/adapter mode differs');
  need(grant.host===host&&!grant.revoked&&!grant.consumed&&performance.now()<grant.deadline,'Approval is wrong-host, revoked, consumed or expired');
  const current=reviewedCapture(grant.review,grant.readCurrent),s=host.snapshot();if(!starting)correctionReady(grant.review,host);
  need(grant.host===host&&!grant.revoked&&!grant.consumed&&performance.now()<grant.deadline,'Approval was withdrawn or expired while checking');
  need(s.connection==='ready'&&session(s)===grant.session&&(starting?s.turn_state==='starting':['idle','completed','failed','interrupted'].includes(s.turn_state)),'Session changed before dispatch');
  need(current.binding===grant.review.binding&&current.wire===grant.review.wire,'Current question/source/workspace/revision differs from approved scope');
  if(grant.review.joint)need(sha({binding:current.binding,payload:current.wire,joint:jointScope(grant.review.prepared,grant.review.joint)})===grant.review.context,'Joint scope changed before dispatch');
  }catch(error){grant.revoked=true;throw error;}
 };
 check(false);
 return {wire:JSON.parse(grant.review.wire) as HostWireInput[],commit(){check(true);grant.consumed=true;}};
}
// Test-mode joint callbacks use the same live owner/source checks after the
// one-shot input was accepted. Unknown transport never receives this capability.
export function assertJointResearchCallback(input:ApprovedResearchTurn,host:ResearchHost,port:TextToolPort):void {
 const grant=grants.get(input);need(grant&&grant.host===host&&grant.consumed&&!grant.revoked&&grant.review.joint?.port===port&&session(host.snapshot())===grant.session&&(!grant.turn||host.snapshot().turn_id===grant.turn),'No active exact joint scope');
 const current=reviewedCapture(grant.review,grant.readCurrent);need(current.binding===grant.review.binding&&current.wire===grant.review.wire,'Locked owner scope changed during the turn');jointScope(grant.review.prepared,grant.review.joint);
}
