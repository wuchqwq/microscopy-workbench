// Research intent is workspace metadata, never a measured observation or a
// provider instruction. References bind the saved context without copying it.
export interface ResearchQuestion {
 version:1;text:string;context_object_id:string;frame_object_id:string;recorded_utc:string;
}
export function readResearchQuestion(value:unknown):ResearchQuestion|undefined {
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid research question');
 const v=value as Record<string,unknown>,id=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
 if(Object.keys(v).sort().join(',')!=='context_object_id,frame_object_id,recorded_utc,text,version'||v.version!==1||
    typeof v.text!=='string'||!v.text.trim()||v.text.length>2000||!id(v.context_object_id)||!id(v.frame_object_id)||
    typeof v.recorded_utc!=='string'||!Number.isFinite(Date.parse(v.recorded_utc))||new Date(v.recorded_utc).toISOString()!==v.recorded_utc)
  throw new Error('Invalid versioned research question or exact context');
 return {...v} as unknown as ResearchQuestion;
}
