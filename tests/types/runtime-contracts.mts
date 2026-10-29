import {ToolRegistry,checkSchema} from '../../lib/runtime/tool_registry.mjs';
import {tool} from '../../lib/runtime/schema.mjs';
import type {ArgumentSchema,SchemaClause,ToolInputSchema} from '../../lib/runtime/schema.mjs';
import type {RegistryModule,ToolContract,ToolHandler,ToolResult,RuntimePort,RPCRequestId} from '../../lib/runtime/contracts.mjs';

const definition=tool('typed_fixture','Typed fixture',{n:{type:'number'}},['n']);
const root: ToolInputSchema=definition.inputSchema;
const contract: ToolContract={backend:'fixture',inputs:[],outputs:[],effects:{kind:'inspect',sourceMutation:false,requestId:'none'},gates:[],
 execution:{resourceKeys:[],serialization:'fixture',budgets:[],cancellation:'fixture'},recovery:{method:'fixture',scope:'fixture',tool:null,idField:null}};
const handler: ToolHandler<ToolResult>=(_args,{signal})=>({content:[{type:'text',text:signal?.aborted?'waiting stopped':'fixture'}]});
const registryModule: RegistryModule={id:'fixture',enabled:true,instructions:'',tools:[{definition,contract,execute:handler}]};
const registry=new ToolRegistry().register(registryModule);
// @ts-expect-error the TS registration API requires a checked module contract
registry.register({id:'invalid',enabled:false,tools:[],instructions:''});
const runtime: RuntimePort={registry,close:()=>registry.close()};
const nullableArray: ArgumentSchema={type:['array','null'],items:{type:'number'}};
const nullableObject: ArgumentSchema={type:['object','null'],properties:{value:{type:'number'}}};
const mixedContainer: ArgumentSchema={type:['array','object','null'],properties:{},items:{type:'number'}};
const partial: SchemaClause={minimum:1,not:{enum:[2]}};
// @ts-expect-error a combinator clause with an explicit array type still needs items
const missingClauseItems: SchemaClause={type:'array'};
const rpcId: RPCRequestId='transport-1';
void [root,runtime,nullableArray,nullableObject,mixedContainer,partial,rpcId,missingClauseItems];

// @ts-expect-error tool inputs are always root objects with explicit properties
const scalarRoot: ToolInputSchema={type:'number'};
// @ts-expect-error array schemas require their recursively checked item schema
const missingItems: ArgumentSchema={type:'array'};
// @ts-expect-error nullable array schemas still require items
const missingNullableItems: ArgumentSchema={type:['array','null']};
// @ts-expect-error object schemas require properties, including nullable ones
const missingProperties: ArgumentSchema={type:['object','null']};
// @ts-expect-error combining both container types requires both field contracts
const mixedMissingItems: ArgumentSchema={type:['array','object'],properties:{}};
// @ts-expect-error read-only request identity policy has no completed state
const wrongPolicy: ToolContract['effects']={kind:'inspect',sourceMutation:false,requestId:'completed'};
// @ts-expect-error a successfully typed handler result needs valid content variants
const wrongResult: ToolHandler<ToolResult>=()=>({content:[{type:'text',data:'not text'}]});
// @ts-expect-error module composition requires explicit enablement
const disabled: RegistryModule={...registryModule,enabled:false};
// @ts-expect-error RPC transport identifiers are strings or numbers, never provider argument objects
const wrongRPCId: RPCRequestId={request_id:'provider-original'};

declare const externalSchema: unknown;
checkSchema(externalSchema,false,0,true);
// @ts-expect-error a partial combinator schema does not promise a type field
const falselyRequiredType: ArgumentSchema=externalSchema;
declare const externalRoot: unknown;
checkSchema(externalRoot);
const checkedRoot: ToolInputSchema=externalRoot;
const outcome=registry.call('typed_fixture',{});
// @ts-expect-error old dynamic JS handler outputs have not been runtime-qualified
const falselyQualified: Promise<ToolResult>=outcome;
void [scalarRoot,missingItems,missingNullableItems,missingProperties,mixedMissingItems,wrongPolicy,wrongResult,disabled,wrongRPCId,falselyRequiredType,checkedRoot,falselyQualified];

// Stdio supports custom synchronous registries as well as the concrete async registry.
const synchronousRuntime: RuntimePort={registry:{listTools:()=>[definition],call:()=>({content:[]})},close:()=>{}};
void synchronousRuntime;
