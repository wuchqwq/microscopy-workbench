import test from 'node:test';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import * as desktopContracts from '../lib/desktop_contracts.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readDesktopOptions,researcherArguments,panelAddress,isOwnedDesktopDocument,readWorkspaceStatus,desktopSecurityPreferences,desktopAction} from '../lib/desktop_contracts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));

test('desktop help runs under ordinary Node without loading Electron or creating scientific state',()=>{
 const working=mkdtempSync(path.join(tmpdir(),'mwb-desktop-help-'));
 try{const result=spawnSync(process.execPath,[path.join(root,'tools/desktop_launcher.mjs'),'--help'],{cwd:working,encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/desktop:install/);assert.match(result.stdout,/development-machine prototype/);assert.equal(existsSync(path.join(working,'objects')),false);assert.equal(existsSync(path.join(working,'researcher-inspector')),false);}finally{rmSync(working,{recursive:true,force:true});}
});
test('desktop path arguments preserve Chinese, spaces, quotes and metacharacters without a shell',()=>{
 const working=mkdtempSync(path.join(tmpdir(),'mwb desktop 中文-'));
 try{const python=path.join(working,'python scientific.exe'),source=path.join(working,'原始 [ROI] $data.tiff'),workspace=path.join(working,'工作 区');writeFileSync(python,'fixture');writeFileSync(source,'fixture');mkdirSync(workspace);
  const parsed=readDesktopOptions(['--python',python,'--workspace',workspace,'--source',source,'--frame','2'],process.execPath);
  assert.equal(parsed.node,process.execPath);assert.equal(parsed.source,source);assert.deepEqual(researcherArguments(parsed),['--workspace',workspace,'--python',python,'--source',source,'--frame','2']);
 }finally{rmSync(working,{recursive:true,force:true});}
});
test('desktop launch rejects ambiguous selectors and unapproved options',()=>{
 for(const args of [['--node','relative'],['--workspace','relative'],['--python',process.execPath,'--python',process.execPath],['--frame','0'],['--frame','1.1'],['--dataset','65'],['--source',process.execPath,'--shell','powershell'],['--plane-axes','0,0','--plane-indices','*,*'],['--plane-axes','0,1','--plane-indices','0,*'],['--component','guess']])assert.throws(()=>readDesktopOptions(args,process.execPath),undefined,JSON.stringify(args));
});
test('explicit DM plane selectors retain original axes and indices',()=>{
 const parsed=readDesktopOptions(['--plane-axes','1,2','--plane-indices','0,*,*'],process.execPath);assert.deepEqual(parsed.plane_axes,[1,2]);assert.deepEqual(parsed.plane_indices,[0,null,null]);
 assert.deepEqual(researcherArguments({...parsed,workspace:path.dirname(process.execPath),python:process.execPath}).slice(-4),['--plane-axes','1,2','--plane-indices','0,*,*']);
});
test('only exact local owned capability URLs qualify',()=>{
 const token='a'.repeat(48),url='http://127.0.0.1:12345/#'+token;assert.deepEqual(panelAddress(url),{url,origin:'http://127.0.0.1:12345',token});
 for(const value of ['http://localhost:12345/#'+token,'https://127.0.0.1:12345/#'+token,'http://127.0.0.1:12345/other#'+token,'http://user@127.0.0.1:12345/#'+token,'http://127.0.0.1:12345/?token=x#'+token,'file:///C:/a','http://127.0.0.1:12345/#oops'])assert.throws(()=>panelAddress(value));
});
test('native close fails closed without the actual versioned save contract',()=>{
 const state={schema_version:1,status:'dirty',dirty:true,working_revision:3,can_close:false,recovery_available:false,unresolved_request_id:null};assert.deepEqual(readWorkspaceStatus({workspace_analysis:state}),state);
 for(const value of [{},{workspace_analysis:{...state,schema_version:2}},{workspace_analysis:{...state,status:'invented'}},{workspace_analysis:{...state,dirty:undefined}},{workspace_analysis:{...state,can_close:undefined}},{workspace_analysis:{...state,working_revision:NaN}},{workspace_analysis:{...state,unresolved_request_id:42}}])assert.throws(()=>readWorkspaceStatus(value));
});
test('capability removal by the existing app remains trusted only at exact owned document',()=>{
 const address=panelAddress('http://127.0.0.1:23456/#'+'f'.repeat(48));
 assert.equal(isOwnedDesktopDocument(address.url,address),true);assert.equal(isOwnedDesktopDocument(address.origin+'/',address),true);
 for(const target of [address.origin+'/help',address.origin+'/?x=1',address.origin+'/#wrong','http://127.0.0.1:23457/','https://example.com/'])assert.equal(isOwnedDesktopDocument(target,address),false);
});
test('renderer permissions and bridge expose no arbitrary file, shell or generic IPC access',()=>{
 assert.deepEqual(desktopSecurityPreferences,{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false});
 assert.equal(desktopAction('fft'),'fft');for(const value of ['shell','read-file','send','invoke','execute','save-as',null,{}])assert.equal(desktopAction(value),null);
 const preload=readFileSync(path.join(root,'tools/desktop_preload.cjs'),'utf8');assert.match(preload,/exposeInMainWorld\('workbenchDesktop'/);assert.match(preload,/onAction\(callback\)/);assert.doesNotMatch(preload,/exposeInMainWorld\('(?:ipcRenderer|fs|require)'/);
});
test('Electron ready is scheduled after ESM entry completion instead of awaited at top level',()=>{
 const source=readFileSync(path.join(root,'tools/desktop_main.mjs'),'utf8');assert.match(source,/app\.whenReady\(\)\.then\(async/);assert.doesNotMatch(source,/await app\.whenReady\(\)/);
});


// Executes the actual emitted main entry with a native API port. No Electron,
// window, provider or user workspace is started by this lifecycle regression.
test('desktop startup refusal exits nonzero after its owned backend drain',async()=>{
 const trace=[],app=new EventEmitter(),ipcMain=new EventEmitter();let finished;const exited=new Promise(resolve=>finished=resolve),config={node:process.execPath,workspace:path.dirname(process.execPath),python:process.execPath,source:path.join(path.dirname(process.execPath),'public.tiff')};
 Object.assign(app,{setName(){},setPath(){},whenReady:async()=>{},quit(){trace.push('quit');finished(0);},exit(code){trace.push('exit:'+code);finished(code);}});
 const failure=Object.assign(new Error('EEXIST: unpublished or foreign helper claim retained without replacement'),{code:'EEXIST'});
 class Backend {constructor(){this.ready=Promise.reject(failure);}async abnormalDrain(){trace.push('drain');}abnormalDetach(){trace.push('detach');}}
 const electron={app,ipcMain,Menu:{buildFromTemplate:items=>items,setApplicationMenu(){}},dialog:{showErrorBox(title,detail){trace.push('error-box');assert.match(title,/启动失败/);assert.match(detail,/PANEL_CLAIM_RETAINED/);assert.match(detail,/保留/);},showMessageBox:async()=>({response:0})}};
 const source=readFileSync(path.join(root,'tools/desktop_main.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/const electronModule = 'electron', electron = await import\(electronModule\);/,'const electron = __electron;').replaceAll('import.meta.url',JSON.stringify(new URL('../tools/desktop_main.mjs',import.meta.url).href));
 const context=vm.createContext({...desktopContracts,path,fileURLToPath,existsSync:()=>true,mkdirSync(){},DesktopBackendClient:Backend,DesktopCloseCoordinator:class{},readDesktopOptions:()=>config,__electron:electron,process:{env:{},argv:[],stdout:{write(){}},on(){}},setTimeout,clearTimeout,AggregateError});
 new vm.Script(source,{filename:'actual-compiled-desktop-main-startup.mjs'}).runInContext(context);
 let timer;const code=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Desktop startup failure did not terminate')),3000);})]).finally(()=>clearTimeout(timer));
 assert.equal(code,1,'startup refusal must propagate failure to the ordinary Node launcher');assert.ok(trace.indexOf('drain')<trace.indexOf('exit:1'));assert.equal(trace.includes('quit'),false);
});


test('desktop startup diagnostics are bounded fixed messages and never arbitrary source or capability data',()=>{
 const secret='http://127.0.0.1:12345/#'+'a'.repeat(48)+' data:image/png;base64,private C:/private/sample.tiff';
 for(const error of [new Error(secret),Object.assign(new Error(secret),{code:'EEXIST'}),{code:'PANEL_CLAIM_RETAINED',message:secret}]){const reply=desktopContracts.desktopStartupError(error);assert.equal(reply.type,'startup_error');assert.ok(reply.message.length<512);assert.equal(reply.message.includes(secret),false);assert.doesNotMatch(JSON.stringify(reply),/base64|C:\/private|127\.0\.0\.1/);assert.deepEqual(desktopContracts.readDesktopStartupError(reply),reply);}
 const known=desktopContracts.desktopStartupError(Object.assign(new Error('EEXIST: unpublished or foreign helper claim retained without replacement'),{code:'EEXIST'}));assert.equal(known.code,'PANEL_CLAIM_RETAINED');assert.match(known.message,/不会自动解锁/);
 for(const bad of [{...known,message:secret},{...known,code:'SHELL'},{...known,schema_version:2},{...known,extra:secret}])assert.throws(()=>desktopContracts.readDesktopStartupError(bad),/bounded/);
});

test('ordinary Node backend reports a structured startup error and a nonzero exit without starting science',()=>{
 const result=spawnSync(process.execPath,[path.join(root,'tools/desktop_backend.mjs'),'--unsupported','not-a-source'],{cwd:root,encoding:'utf8',timeout:10000});assert.equal(result.status,1,result.stderr);const lines=result.stdout.trim().split('\n');assert.equal(lines.length,1);const failure=desktopContracts.readDesktopStartupError(JSON.parse(lines[0]));assert.equal(failure.code,'STARTUP_FAILED');assert.doesNotMatch(result.stdout,/not-a-source|request_id|base64|token/);
});

test('desktop backend client preserves the structured startup refusal instead of a generic exit message',async()=>{
 const child=new EventEmitter();Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),exitCode:null});
 let source=readFileSync(path.join(root,'lib/desktop_backend_client.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export class DesktopBackendClient','class DesktopBackendClient').replaceAll('import.meta.url',JSON.stringify(new URL('../lib/desktop_backend_client.mjs',import.meta.url).href));source+='\nglobalThis.__Client=DesktopBackendClient;';
 const context=vm.createContext({...desktopContracts,spawn:()=>child,fileURLToPath,URL,Buffer,setTimeout,clearTimeout,process:{env:{},stderr:{write(){}}}});new vm.Script(source).runInContext(context);const client=new context.__Client({node:process.execPath,workspace:root,python:process.execPath});
 const received=assert.rejects(client.ready,error=>error.code==='PANEL_CLAIM_RETAINED'&&/保留/.test(error.message)&&!error.message.includes('query original scientific'));
 try{child.stdout.write(JSON.stringify(desktopContracts.desktopStartupError(Object.assign(new Error('EEXIST: unpublished or foreign helper claim retained without replacement'),{code:'EEXIST'})))+'\n');await received;}finally{child.exitCode=1;child.emit('exit',1,null);}
});
