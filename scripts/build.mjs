// Build once in the source checkout. Installed packages need only Node/Python.
import {cpSync,existsSync,mkdirSync,readdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.join(root,'dist'),staging=path.join(root,'.build','runtime');
// These are fixed children of this checkout, never caller-provided paths.
for(const target of [output,staging]){
 if(path.dirname(target)!==root&&path.dirname(target)!==path.join(root,'.build'))throw new Error('Invalid build directory');
 rmSync(target,{recursive:true,force:true});
}
const tsc=path.join(root,'node_modules','typescript','bin','tsc');
const run=args=>{const result=spawnSync(process.execPath,[tsc,...args],{cwd:root,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)throw new Error('TypeScript compilation failed');};
try{
 run(['-p','tsconfig.shared.json']);
 run(['-p','tsconfig.types.json']);
 run(['-p','tsconfig.node.json','--outDir',staging]);
 // Unmigrated JS passes through byte-for-byte; migrated .mts has exactly one
 // emitted implementation. Never copy a checkout compatibility shim over it.
 const shims=new Set(['server.mjs','tools/plugin_server.mjs']);
 const copy=(relative)=>{
  const source=path.join(root,relative);
  if(!existsSync(source))return;
  for(const entry of readdirSync(source,{withFileTypes:true})){
   const next=path.join(relative,entry.name),portable=next.split(path.sep).join('/');
   if(entry.isSymbolicLink())throw new Error('Linked package asset: '+portable);
   if(entry.isDirectory()) {if(entry.name!=='__pycache__')copy(next);}
   else if(!/\.(?:mts|ts|pyc)$/.test(entry.name)&&!shims.has(portable)) {mkdirSync(path.dirname(path.join(staging,next)),{recursive:true});cpSync(path.join(root,next),path.join(staging,next));}
  }
 };
 for(const directory of ['lib','tools','ui','crystallography','examples','capture_schemas','skills','.codex-plugin','.agents','docs','tests'])copy(directory);
 for(const entry of readdirSync(root,{withFileTypes:true})){
  if(entry.isFile()&&!shims.has(entry.name)&&(/\.(?:mjs|md|json)$/.test(entry.name)||entry.name.startsWith('requirements')||entry.name==='LICENSE')){
   if(entry.name.startsWith('tsconfig')||entry.name==='package-lock.json')continue;
   cpSync(path.join(root,entry.name),path.join(staging,entry.name));
  }
 }
 // The standalone runtime has no build/install dependency or nested dist path.
 const metadata=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
 delete metadata.devDependencies;
 metadata.scripts={start:'node server.mjs',inspect:'node tools/researcher_inspector.mjs'};
 writeFileSync(path.join(staging,'package.json'),JSON.stringify(metadata,null,2)+'\n');
 writeFileSync(path.join(staging,'BUILD.json'),JSON.stringify({format:1,typescript:'5.9.3',migrated:['server.mts','tools/plugin_server.mts','lib/runtime/schema.mts','lib/runtime/contracts.mts','lib/runtime/tool_registry.mts','lib/runtime/stdio_mcp_server.mts','ui/image-panel/coordinates.mts']},null,2)+'\n');
 renameSync(staging,output);
 console.log('Built dist/: standalone ESM runtime, Python workers, Panel, manifests and Skills.');
}catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
