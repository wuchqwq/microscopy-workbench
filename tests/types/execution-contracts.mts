import {ExecutionCoordinator} from '../../lib/runtime/execution_coordinator.mjs';
import type {ExecutionWait,WorkerLifecycle,WorkerState,WaitState,ExecutionReceipt,ProviderRequestId,ProviderScope} from '../../lib/runtime/execution_coordinator.mjs';
import type {RPCRequestId} from '../../lib/runtime/contracts.mjs';
const coordinator=new ExecutionCoordinator();
const spec={operation:'fixture',requestId:'before-submit',parameters:{source_ref:'public',points:[[1,2]]},resourceKeys:['provider-owned'],timeoutMs:1000};
const lifecycle: WorkerLifecycle<{saved:string}>={result:Promise.resolve({saved:'object'}),closed:Promise.resolve()};
const waiting=coordinator.invoke(spec,{start:parameters=>{
  const source: string=parameters.source_ref;
  // @ts-expect-error accepted parameters are recursively frozen, including nested point arrays
  parameters.points[0][0]=7;
  return lifecycle;
}});
const typed: ExecutionWait<{saved:string}>=waiting;
// @ts-expect-error generic result inference must follow the provider result
const wrongResult: Promise<number>=waiting;
// @ts-expect-error a returned result promise is not the worker lifecycle contract
coordinator.invoke(spec,{start:()=>({result:Promise.resolve('missing close')})});
// @ts-expect-error invoke never substitutes the query port
coordinator.invoke(spec,{query:()=>lifecycle});
coordinator.recover({...spec,resourceKeys:[]},{query:()=>lifecycle});
// @ts-expect-error recovery requires an original request identity, not an inspection null
coordinator.recover({...spec,requestId:null,resourceKeys:[]},{query:()=>lifecycle});
// @ts-expect-error recovery cannot carry a write resource
coordinator.recover({...spec,resourceKeys:['write']},{query:()=>lifecycle});
// @ts-expect-error recovery never substitutes an invoke/start port
coordinator.recover({...spec,resourceKeys:[]},{start:()=>lifecycle});
const worker: WorkerState='running',waiter: WaitState='cancelled';
// @ts-expect-error cancellation is a waiter state, not a worker-result/lifetime state
const falselyClosed: WorkerState=waiter;
declare const observation: ExecutionReceipt;
// @ts-expect-error the observation is a snapshot, not a mutable authority
observation.closed=true;
// @ts-expect-error the original provider identity is not an arbitrary JSON-RPC wire ID
const providerFromRPC: ProviderRequestId='transport-1' as RPCRequestId;
// @ts-expect-error provider/workspace/session scope cannot omit workspace
const incompleteScope: ProviderScope={provider:'image',session:'session'};
void [typed,wrongResult,worker,falselyClosed,providerFromRPC,incompleteScope];
