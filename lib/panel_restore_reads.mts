// One restore attempt reuses its already-qualified immutable provider replies.
// Nothing survives the attempt. The same provider must freshly re-read every
// retained reply before commit; its existing file/hash/identity checks still run.
export class PanelRestoreReads<T> {
 private readonly records=new Map<string,T>();private readonly inflight=new Map<string,Promise<T>>();private bytes=0;
 constructor(private readonly provider:(id:string)=>Promise<T>,private readonly equal:(left:T,right:T)=>boolean,private readonly limits={records:128,bytes:32*1024*1024}){}
 async read(id:string):Promise<T>{
  if(this.records.has(id))return structuredClone(this.records.get(id)!);
  const pending=this.inflight.get(id);if(pending)return structuredClone(await pending);
  const request=(async()=>{const value=await this.provider(id),bytes=Buffer.byteLength(JSON.stringify(value));
   // A large/long graph keeps the old uncached path rather than skipping checks.
   if(this.records.size<this.limits.records&&this.bytes+bytes<=this.limits.bytes){this.records.set(id,structuredClone(value));this.bytes+=bytes;}
   return value;
  })();this.inflight.set(id,request);
  try{return await request;}finally{this.inflight.delete(id);}
 }
 async verify():Promise<void>{
  for(const [id,expected]of this.records){const actual=await this.provider(id);if(!this.equal(expected,actual))throw Object.assign(new Error('Provider reference changed during restore qualification; working state was retained'),{status:409});}
 }
}
