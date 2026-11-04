// One restore attempt reuses its already-qualified immutable provider replies.
// Nothing survives the attempt. The same provider must freshly re-read every
// retained reply before commit; its existing file/hash/identity checks still run.
export class PanelRestoreReads<T> {
 private readonly records=new Map<string,{value:T;read:()=>Promise<T>}>();private readonly inflight=new Map<string,Promise<T>>();private bytes=0;
 constructor(private readonly provider:(id:string)=>Promise<T>,private readonly equal:(left:T,right:T)=>boolean,private readonly limits={records:128,bytes:32*1024*1024}){}
 read(id:string):Promise<T>{return this.readVariant('object:'+id,()=>this.provider(id));}
 // The caller supplies a complete immutable request key and the same qualified
 // reader needed for fresh verification, including every bundled ancestor check.
 // Qualified variants never share the ordinary object-ID namespace.
 readQualified(key:string,provider:()=>Promise<T>):Promise<T>{return this.readVariant('qualified:'+key,provider);}
 private async readVariant(key:string,provider:()=>Promise<T>):Promise<T>{
  if(this.records.has(key))return structuredClone(this.records.get(key)!.value);
  const pending=this.inflight.get(key);if(pending)return structuredClone(await pending);
  const request=(async()=>{const value=await provider(),bytes=Buffer.byteLength(JSON.stringify(value));
   // A large/long graph keeps the old uncached path rather than skipping checks.
   if(this.records.size<this.limits.records&&this.bytes+bytes<=this.limits.bytes){this.records.set(key,{value:structuredClone(value),read:provider});this.bytes+=bytes;}
   return value;
  })();this.inflight.set(key,request);
  try{return await request;}finally{this.inflight.delete(key);}
 }
 async verify():Promise<void>{
  for(const {value,read}of this.records.values()){const actual=await read();if(!this.equal(value,actual))throw Object.assign(new Error('Provider reference changed during restore qualification; working state was retained'),{status:409});}
 }
}
