#!/usr/bin/env node
// Read-only local capability inspection; does not start a scientific calculation.
import {createScienceRuntime} from '../lib/science/create_science_runtime.mjs';
const valid=new Set(['all','image','gpa','topology','domains','structure','ptyrad_cli','ptyrad_engine','phasefield_pde']);
const args=process.argv.slice(2);
if(args.length>2||args.some(a=>a.startsWith('-')&&a!=='--no-probe')){
  console.error('Usage: npm run doctor -- [capability] [--no-probe]');
  process.exitCode=2;
}else{
  const capability=args.find(a=>a!=='--no-probe')||'all';
  if(!valid.has(capability)){console.error('Unknown capability: '+capability);process.exitCode=2;}
  else{
    const runtime=createScienceRuntime();
    try{
      const reply=await runtime.registry.call('science_capabilities',{
        capability,probe_dependencies:!args.includes('--no-probe'),
      }) as {content?:ReadonlyArray<{type:string;text?:string}>};
      const raw=reply.content?.find(x=>x.type==='text')?.text;
      if(!raw)throw new Error('Missing capability report');
      const report=JSON.parse(raw) as {capabilities:Array<{status:string;capability:string}>};
      console.log(JSON.stringify(report,null,2));
      if(capability!=='all'&&report.capabilities.some(x=>['tool_not_registered','dependencies_unavailable','not_registered'].includes(x.status))){
        process.exitCode=1;
      }
    }catch(error){
      console.error('Capability inspection failed: '+String(error));process.exitCode=1;
    }finally{runtime.close();}
  }
}