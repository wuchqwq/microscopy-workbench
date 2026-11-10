// Explicit test-fixture preparation only. It creates an initial workspace
// reference to an already saved view; no GUI/scientific workflow pass is claimed.
import path from 'node:path';import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createImagePanel} from './image_panel.mjs';
const options=Object.fromEntries(process.argv.slice(2).reduce<string[][]>((all,value,index,array)=>index%2?all:[...all,[value,array[index+1]!]],[]));
if(!path.isAbsolute(options['--input']??'')||!path.isAbsolute(options['--python']??''))throw Error('Explicit absolute fixture receipt and Python required');
const receipt=JSON.parse(readFileSync(options['--input'],'utf8')) as {cases:{workspace:string;view_object_id:string;case:string}[]};
for(const input of receipt.cases){
 if(!path.isAbsolute(input.workspace)||existsSync(path.join(input.workspace,'analysis-workspace')))throw Error('Fixture already initialized; inspect rather than replay preparation');
 let panel:Awaited<ReturnType<typeof createImagePanel>>|undefined;
 try{panel=await createImagePanel({workspace:input.workspace,python:options['--python'],object_id:input.view_object_id});const state=panel.state();await panel.close({abnormal:false});panel=undefined;
  writeFileSync(path.join(input.workspace,'native-preparation.json'),JSON.stringify({status:'INITIAL_REFERENCE_PREPARED_NOT_GUI_VALIDATED',case:input.case,workspace:input.workspace,view_object_id:input.view_object_id,frame_identity:state.frame_identity,normal_helper_close:true,scope:'No scientific comparison, GUI actions, model request or independent research inference'},null,2)+'\n',{flag:'wx'});
 }finally{await panel?.close();}
}
process.stdout.write(JSON.stringify({status:'PREPARED_NOT_GUI_VALIDATED',cases:receipt.cases.length})+'\n');
