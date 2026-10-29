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
 // Business sources are all checked TypeScript. Only documented startup/test
 // bootstraps remain JS. Never copy a source startup shim over emitted code.
 const shims=new Set(['server.mjs','science-server.mjs','tools/plugin_server.mjs']);
 const javascriptExceptions=new Set([...shims,'tools/smoke_sequence_plugin.mjs','tools/smoke_domain_plugin.mjs','tools/smoke_feature_field.mjs']);
 const sourceAudit=relative=>{
  for(const entry of readdirSync(path.join(root,relative),{withFileTypes:true})){
   const next=path.join(relative,entry.name),portable=next.split(path.sep).join('/');
   if(entry.isDirectory())sourceAudit(next);
   else if(entry.isFile()&&/\.[cm]?js$/.test(entry.name)&&!javascriptExceptions.has(portable))throw new Error('Unchecked business JavaScript: '+portable);
  }
 };
 for(const directory of ['lib','tools','ui'])sourceAudit(directory);
 for(const entry of readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&/\.[cm]?js$/.test(entry.name)&&!javascriptExceptions.has(entry.name))throw new Error('Unchecked root JavaScript: '+entry.name);
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
 const migrated=[];
 const inventory=relative=>{
  for(const entry of readdirSync(path.join(root,relative),{withFileTypes:true})){
   const next=path.join(relative,entry.name);
   if(entry.isDirectory())inventory(next);
   else if(entry.isFile()&&entry.name.endsWith('.mts'))migrated.push(next.split(path.sep).join('/'));
  }
 };
 for(const directory of ['lib','tools','ui'])inventory(directory);
 for(const entry of readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.mts'))migrated.push(entry.name);
 migrated.sort();
 for(const source of migrated)if(!existsSync(path.join(staging,source.replace(/\.mts$/,'.mjs'))))throw new Error('Migrated runtime module was not emitted: '+source);
 writeFileSync(path.join(staging,'BUILD.json'),JSON.stringify({format:1,typescript:'5.9.3',migrated},null,2)+'\n');
 renameSync(staging,output);
 console.log('Built dist/: standalone ESM runtime, Python workers, Panel, manifests and Skills.');
}catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
