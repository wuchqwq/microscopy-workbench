// Read-only composition of registered tool contracts and configured Python checks.
// A discovered tool or importable dependency is not an executed scientific result.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tool} from '../runtime/schema.mjs';
import type {RegistryModule,ToolDefinition} from '../runtime/contracts.mjs';
import type {Environment} from '../../tools/plugin_server.mjs';

type Capability = 'image'|'gpa'|'topology'|'domains'|'structure'|'ptyrad_cli'|'ptyrad_engine'|'phasefield_pde';
type ProbeKind = 'image'|'gpa'|'structure'|'ptyrad_cli';
interface Check {name:string;status:string;version?:string;reason?:string;}
interface ProbeResult {ok:boolean;kind:string;checks?:Check[];error?:string;meaning?:string;}
interface Definition {
  tools: readonly string[];
  provider: string;
  probe?: ProbeKind;
  summary: string;
}
export interface CapabilityModuleOptions {
  listTools: () => readonly ToolDefinition[];
  env?: Environment;
  probeScript?: string;
}
const CATALOG: Readonly<Record<Capability,Definition>>={
  image:{tools:['image_open','image_frame','image_fft','image_statistics','image_profile'],provider:'microscopy-core',
    probe:'image',summary:'Scientific scalar image observations; tool registration does not qualify a particular file or ROI.'},
  gpa:{tools:['image_gpa','image_gpa_view','image_gpa_read'],provider:'microscopy-core',
    probe:'gpa',summary:'Classical single-domain geometric phase analysis of a qualified existing unwindowed FFT; not ptychographic wave phase.'},
  topology:{tools:['image_topology'],provider:'microscopy-core',
    probe:'gpa',summary:'Conditional projected winding from saved fixed_g GPA; not a unique 3D Burgers vector or proven dislocation.'},
  domains:{tools:['image_spatial_field','image_domain_map','image_feature_field'],provider:'microscopy-core',
    probe:'image',summary:'Bounded sampled reciprocal-geometry fields and candidate domains, not automatic phase identification.'},
  structure:{tools:['structure_open','structure_orient','structure_simulate','structure_compare'],provider:'optional microscopy-core structures',
    probe:'structure',summary:'Optional ASE/diffsims structure comparisons; image geometry and physical admission still require explicit evidence.'},
  ptyrad_cli:{tools:[],provider:'standalone ptyrad-reconstruction Skill',
    probe:'ptyrad_cli',summary:'Independent CPU disk/rotation/phase-stack diagnostic scripts; NOT an MCP tool or a GPU reconstruction engine.'},
  ptyrad_engine:{tools:[],provider:'external PtyRAD environment',
    summary:'PtyRAD GPU reconstruction is external; no registered automatic reconstruction runner in this provider.'},
  phasefield_pde:{tools:[],provider:'not implemented',
    summary:'Material phase-field PDE solvers (such as Cahn-Hilliard) are not registered in this repository.'},
};
const keys=Object.keys(CATALOG) as Capability[];
const script=fileURLToPath(new URL('../../tools/science_dependency_probe.py',import.meta.url));
function configuredPython(kind:ProbeKind, env:Environment):string|null{
  if(kind==='structure'){
    if(!env.MICROSCOPY_STRUCTURE_WORKSPACE)return null;
    return env.MICROSCOPY_STRUCTURE_PYTHON||env.MICROSCOPY_PYTHON||'python3';
  }
  if(kind==='ptyrad_cli')return env.MICROSCOPY_PTYRAD_PYTHON||null;
  return env.MICROSCOPY_PYTHON||'python3';
}
function probeEnvironment(kind:ProbeKind):NodeJS.ProcessEnv{
  if(kind==='structure')return {...process.env,PYTHONHOME:'',PYTHONPATH:'',PYTHONNOUSERSITE:'1',
    PYTHONDONTWRITEBYTECODE:'1',MPLBACKEND:'Agg',NUMBA_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'};
  return {...process.env,PYTHONDONTWRITEBYTECODE:'1'};
}
async function probePython(python:string,kind:ProbeKind,probeScript:string,signal?:AbortSignal):Promise<ProbeResult>{
  if(signal?.aborted)return {ok:false,kind,error:'cancelled_before_probe'};
  return new Promise(resolve=>{
    let done=false,stdout='',stderr='';
    let timer:NodeJS.Timeout|undefined;
    let child:ReturnType<typeof spawn>;
    const finish=(result:ProbeResult)=>{
      if(done)return;done=true;
      if(timer)clearTimeout(timer);
      signal?.removeEventListener('abort',onAbort);
      resolve(result);
    };
    const stop=(reason:string)=>{child?.kill();finish({ok:false,kind,error:reason});};
    const onAbort=()=>stop('cancelled');
    try{
      child=spawn(python,['-B',probeScript,kind],{
        stdio:['ignore','pipe','pipe'],windowsHide:true,env:probeEnvironment(kind),
      });
      signal?.addEventListener('abort',onAbort,{once:true});
      timer=setTimeout(()=>stop('probe_timeout_15s'),15000);
      child.stdout?.on('data',(chunk:Buffer)=>{
        stdout+=chunk.toString('utf8');
        if(stdout.length>65536)stop('probe_output_limit');
      });
      child.stderr?.on('data',(chunk:Buffer)=>{
        stderr+=chunk.toString('utf8');
        if(stderr.length>65536)stop('probe_error_limit');
      });
      child.once('error',(error:Error)=>finish({ok:false,kind,error:'python_spawn_failed: '+error.message.slice(0,160)}));
      child.once('close',code=>{
        if(done)return;
        if(code!==0){finish({ok:false,kind,error:'probe_exit_'+code+': '+stderr.slice(0,200)});return;}
        try{
          const response:unknown=JSON.parse(stdout);
          if(!response||typeof response!=='object'||typeof (response as ProbeResult).ok!=='boolean'
            ||(response as ProbeResult).kind!==kind){finish({ok:false,kind,error:'malformed_probe_result'});return;}
          finish(response as ProbeResult);
        }catch{finish({ok:false,kind,error:'invalid_probe_json'});}
      });
    }catch(error){finish({ok:false,kind,error:'python_spawn_failed: '+String(error).slice(0,160)});}
  });
}
export function createScienceCapabilitiesModule({listTools,env=process.env,probeScript=script}:CapabilityModuleOptions):RegistryModule{
  const definition=tool('science_capabilities',
    'Read only: list registered microscopy calculations and optionally probe the configured Python imports/versions. Registration, dependency readiness, actual calculation and physical validation are separate.',
    {capability:{type:'string',enum:['all',...keys]},probe_dependencies:{type:'boolean'}},[]);
  return {id:'science-capabilities',enabled:true,instructions:'science_capabilities reports actual tool registration and optional Python dependency checks. It never runs scientific calculations or validates material claims; use the original provider tool for execution.',
    tools:[{definition,contract:{
      backend:'scientific-capability-discovery',
      inputs:['Declared capability name and optional dependency probe request'],
      outputs:['Registered tool names, missing tools and import/version checks with explicit readiness limits'],
      effects:{kind:'inspect',sourceMutation:false,requestId:'none'},
      gates:['Live registry names, not hard-coded claims of scientific qualification',
        'Read-only bounded subprocess checks in configured Python; optional modules never treated as installed automatically'],
      execution:{resourceKeys:[],serialization:'No provider science worker or journal is used',
        budgets:['At most four unique Python import probes, 15 seconds each, 64 KiB output cap'],
        cancellation:'Only the isolated dependency probe is cancelled; no scientific worker or request is touched'},
      recovery:{method:'Repeat a read-only capability inspection; scientific requests have their own provider result IDs',
        scope:'Current provider configuration and present Python environments',tool:null,idField:null}},
      execute:async(input,{signal}={})=>{
        const args=input as {capability?:Capability|'all';probe_dependencies?:boolean};
        const selected=args.capability&&args.capability!=='all'?[args.capability]:keys;
        const advertised=new Set(listTools().map(x=>x.name));
        const kinds=[...new Set(selected.map(k=>CATALOG[k].probe).filter((k):k is ProbeKind=>Boolean(k)))];
        const probes=new Map<ProbeKind,ProbeResult>();
        if(args.probe_dependencies===true){
          await Promise.all(kinds.map(async kind=>{
            const python=configuredPython(kind,env);
            probes.set(kind,python
              ? await probePython(python,kind,probeScript,signal)
              : {ok:false,kind,error:'python_not_configured'});
          }));
        }
        const capabilities=selected.map(key=>{
          const item=CATALOG[key],registered=item.tools.filter(x=>advertised.has(x));
          const missing=item.tools.filter(x=>!advertised.has(x));
          const isExternal=item.tools.length===0;
          const probe=item.probe?probes.get(item.probe):undefined;
          let status:string;
          if(isExternal)status=key==='ptyrad_cli'?'external_cli_only':'not_registered';
          else if(missing.length)status='tool_not_registered';
          else if(!args.probe_dependencies)status='registered_not_probed';
          else status=probe?.ok?'dependencies_checked':'dependencies_unavailable';
          if(isExternal&&key==='ptyrad_cli'&&probe?.ok)status='external_cli_dependencies_checked';
          return {capability:key,provider:item.provider,status,registered_tools:registered,missing_tools:missing,
            ...(probe?{dependency_probe:probe}:{}),summary:item.summary};
        });
        const result={schema_version:1,kind:'read_only_capability_inspection',capabilities,
          caution:'Tool presence and package imports do NOT establish scientific input qualification, successful execution, GPU access or physical validity.'};
        return {content:[{type:'text',text:JSON.stringify(result)}]};
      },
    }]};
}