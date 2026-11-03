// Analysis CLI: imports no browser, Panel, Electron or UI test controller.
import {isDirectInvocation} from '../lib/runtime/direct_entry.mjs';
import {CLI_EXIT,CLI_HELP,cliError,parseCliArgs,runCli} from '../lib/workbench_cli.mjs';
if(isDirectInvocation(import.meta.url)){
 let command=process.argv[2]??'help',requestId:string|null=null;const controller=new AbortController();
 const interrupt=()=>controller.abort();process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 try{const options=parseCliArgs(process.argv.slice(2));command=options.command;requestId=options.request_id??null;
  if(command==='help')process.stdout.write(CLI_HELP);
  else {const response=await runCli(options,{signal:controller.signal});process.stdout.write(JSON.stringify(response)+'\n');process.exitCode=CLI_EXIT[response.status];}
 }catch(error){const response=cliError(command,error,requestId);process.stdout.write(JSON.stringify(response)+'\n');process.exitCode=CLI_EXIT[response.status];}
 finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
}
