import test from 'node:test';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {DesktopCloseCoordinator} from '../lib/desktop_lifecycle.mjs';
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
test('native open preload sends only its fixed no-argument intent, without a file or generic IPC capability',()=>{
 let bridge;const sent=[];const electron={contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'workbenchDesktop');bridge=value;}},ipcRenderer:{on(){},send(...args){sent.push(args);}}};
 new vm.Script(readFileSync(path.join(root,'tools/desktop_preload.cjs'),'utf8')).runInNewContext({exports:{},require:name=>{assert.equal(name,'electron');return electron;}});
 assert.deepEqual(Object.keys(bridge).sort(),['onAction','openImage','reviewImage','stopImageReview']);assert.equal(Object.isFrozen(bridge),true);bridge.openImage('/not-forwarded/private.tiff',{arbitrary:'ignored'});bridge.reviewImage({approved:true});bridge.stopImageReview('arbitrary');assert.deepEqual(sent,[['mwb:open-image'],['mwb:review-image'],['mwb:stop-image-review']]);
});
test('native open validates the owned main frame, serializes pickers, selects image first and preserves the old workspace on cancel/refused close',async()=>{
 const app=new EventEmitter(),ipcMain=new EventEmitter(),pickers=[],reports=[];let owned,backendCount=0,closeCount=0;
 Object.assign(app,{setName(){},setPath(){},whenReady:async()=>{},quit(){},exit(){assert.fail('Unexpected startup failure');}});
 class Window extends EventEmitter {constructor(){super();owned=this;this.destroyed=false;this.webContents=new EventEmitter();Object.assign(this.webContents,{id:1,mainFrame:{},getURL:()=>this.url,send:(_channel,payload)=>queueMicrotask(()=>ipcMain.emit('mwb:action-result',{sender:this.webContents,senderFrame:this.webContents.mainFrame},{id:payload.id,ok:false,error:'Unapplied question retained'})),setWindowOpenHandler(){},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}});}async loadURL(url){this.url=url;}show(){}focus(){}setEnabled(){}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}}
 class Backend {constructor(){backendCount++;this.ready=Promise.resolve({url:'http://127.0.0.1:12456/#'+'b'.repeat(48),node:process.version});}async queryDiscard(){return null;}async status(){assert.fail('Renderer refusal must keep the existing workspace');}async close(){closeCount++;}abnormalDetach(){}async abnormalDrain(){}}
 const config={node:process.execPath,workspace:root,python:process.execPath,source:path.join(root,'public.tiff')};
 const electron={app,ipcMain,BrowserWindow:Window,Menu:{buildFromTemplate:items=>items,setApplicationMenu(){}},dialog:{showOpenDialog(options){return new Promise(resolve=>pickers.push({options,resolve}));},async showMessageBox(_window,options){reports.push(options);return {response:0};},showErrorBox(){assert.fail('Unexpected startup error');}}};
 const source=readFileSync(path.join(root,'tools/desktop_main.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/const electronModule = 'electron', electron = await import\(electronModule\);/,'const electron = __electron;').replaceAll('import.meta.url',JSON.stringify(new URL('../tools/desktop_main.mjs',import.meta.url).href));
 const context=vm.createContext({...desktopContracts,DesktopCloseCoordinator,DesktopBackendClient:Backend,path,fileURLToPath,URL,existsSync:()=>true,mkdirSync(){},readDesktopOptions:()=>config,__electron:electron,process:{env:{},argv:[],stdout:{write(){}},on(){}},setTimeout,clearTimeout,queueMicrotask,AggregateError});new vm.Script(source).runInContext(context);
 const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};await settle();const owner={sender:owned.webContents,senderFrame:owned.webContents.mainFrame},original=owned;
 for(const event of [{sender:{},senderFrame:owner.senderFrame},{sender:owner.sender,senderFrame:{}}])ipcMain.emit('mwb:open-image',event);
 ipcMain.emit('mwb:open-image',owner,{path:'/not-admitted'});assert.equal(pickers.length,0);
 ipcMain.emit('mwb:open-image',owner);ipcMain.emit('mwb:open-image',owner);assert.equal(pickers.length,1);assert.match(pickers[0].options.title,/只读原始图像/);assert.deepEqual([...pickers[0].options.properties],['openFile']);pickers[0].resolve({canceled:true,filePaths:[]});await settle();assert.equal(owned,original);assert.equal(original.destroyed,false);
 ipcMain.emit('mwb:open-image',owner);pickers[1].resolve({canceled:false,filePaths:[config.source]});await settle();assert.equal(pickers.length,3);assert.match(pickers[2].options.title,/分析结果.*工作区/);assert.ok(pickers[2].options.properties.includes('openDirectory'));pickers[2].resolve({canceled:true,filePaths:[]});await settle();assert.equal(original.destroyed,false);assert.equal(closeCount,0);
 ipcMain.emit('mwb:open-image',owner);pickers[3].resolve({canceled:false,filePaths:[config.source]});await settle();pickers[4].resolve({canceled:false,filePaths:[root]});await settle();assert.equal(backendCount,1);assert.equal(closeCount,0);assert.equal(original.destroyed,false);assert.ok(reports.some(r=>/Unapplied question/.test(r.detail??'')));
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


async function discardClientHarness(){
 const child=new EventEmitter(),commands=[],timers=new Map();let timerId=0;Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),exitCode:null});child.stdin.on('data',chunk=>commands.push(JSON.parse(chunk.toString())));
 let source=readFileSync(process.env.DESKTOP_CLIENT_UNDER_TEST??path.join(root,'lib/desktop_backend_client.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export class DesktopBackendClient','class DesktopBackendClient').replaceAll('import.meta.url',JSON.stringify(new URL('../lib/desktop_backend_client.mjs',import.meta.url).href));source+='\nglobalThis.__Client=DesktopBackendClient;';
 const context=vm.createContext({...desktopContracts,spawn:()=>child,fileURLToPath,URL,Buffer,setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id),process:{env:{},stderr:{write(){}}}});new vm.Script(source).runInContext(context);const client=new context.__Client({node:process.execPath,workspace:root,python:process.execPath}),reply=value=>child.stdout.write(JSON.stringify(value)+'\n');reply({type:'ready',schema_version:1,node:process.version,url:'http://127.0.0.1:12345/#'+'a'.repeat(48)});await client.ready;
 return {client,commands,timers,reply,breakPipe(){child.stdin.emit('error',new Error('pipe lost after submission'));},async settle(){for(let i=0;i<8;i++)await Promise.resolve();},finish(){child.exitCode=1;child.emit('exit',1,null);}};
}
const desktopClean={schema_version:1,status:'clean',dirty:false,working_revision:18,can_close:true,recovery_available:false,unresolved_request_id:null};
test('desktop discard wait uses a bounded restore budget and timeout retains original identity before any second mutation',async()=>{
 const h=await discardClientHarness(),original=h.client.discard(17);original.catch(()=>{});try{await h.settle();const timer=[...h.timers.values()][0];assert.equal(timer.ms,desktopContracts.DESKTOP_RESTORE_WAIT_MS);assert.ok(timer.ms>130000);const rejected=assert.rejects(original,/command_id=1/);timer.callback();await rejected;await assert.rejects(h.client.discard(17),/Original discard command_id=1/);await assert.rejects(h.client.close(17),/Original discard command_id=1/);assert.deepEqual(h.commands.map(c=>c.action),['discard']);}finally{h.finish();}
});
test('desktop late original query rejects mismatches and query failures without unlocking or replaying discard',async()=>{
 const h=await discardClientHarness(),original=h.client.discard(17);original.catch(()=>{});try{await h.settle();const rejected=assert.rejects(original,/command_id=1/);[...h.timers.values()][0].callback();await rejected;
 const outcome=state=>({workspace_analysis:desktopClean,discard_operation:{command_id:1,expected_working_revision:17,state}});
 let query=h.client.queryDiscard();await h.settle();let command=h.commands.at(-1);assert.equal(command.action,'query-discard');assert.equal(command.original_id,1);assert.equal(command.expected_working_revision,17);h.reply({id:command.id,ok:true,state:{...outcome('completed'),discard_operation:{command_id:2,expected_working_revision:17,state:'completed'}}});await assert.rejects(query,/mismatched/);await assert.rejects(h.client.close(17),/Original discard/);
 query=h.client.queryDiscard();await h.settle();command=h.commands.at(-1);const queryFailure=assert.rejects(query,/Stopped waiting/);[...h.timers.values()].find(t=>t.ms===15000).callback();await queryFailure;await assert.rejects(h.client.discard(17),/Original discard/);
 for(const state of ['running','unknown']){query=h.client.queryDiscard();await h.settle();command=h.commands.at(-1);h.reply({id:command.id,ok:true,state:outcome(state)});assert.equal((await query).operation.state,state);await assert.rejects(h.client.discard(17),/Original discard/);}
 h.reply({id:1,ok:true,state:{workspace_analysis:desktopClean}});query=h.client.queryDiscard();await h.settle();command=h.commands.at(-1);h.reply({id:command.id,ok:true,state:outcome('completed')});const result=await query;assert.equal(result.operation.command_id,1);assert.equal(result.operation.state,'completed');assert.equal(result.status.dirty,false);assert.equal(h.commands.filter(c=>c.action==='discard').length,1);assert.equal(h.commands.filter(c=>c.action==='close').length,0);await assert.rejects(h.client.discard(17),/Original discard/);assert.throws(()=>h.client.acknowledgeDiscard(2,17),/verified terminal/);h.client.acknowledgeDiscard(1,17);assert.equal(await h.client.queryDiscard(),null);
 }finally{h.finish();}
});

test('desktop pipe loss retains submitted discard and never permits a fresh discard or close',async()=>{
 const h=await discardClientHarness(),original=h.client.discard(17);const rejected=assert.rejects(original,/pipe lost/);try{await h.settle();h.breakPipe();await rejected;await assert.rejects(h.client.discard(17),/Original discard/);await assert.rejects(h.client.close(17),/Original discard/);assert.equal(h.commands.length,1);}finally{h.finish();}
});
test('desktop close wait timeout retains its original identity and refuses repeated close or discard',async()=>{
 const h=await discardClientHarness(),original=h.client.close(17);const rejected=assert.rejects(original,/command_id=1/);try{await h.settle();[...h.timers.values()][0].callback();await rejected;await assert.rejects(h.client.close(17),/Original close command_id=1/);await assert.rejects(h.client.discard(17),/Original close command_id=1/);assert.deepEqual(h.commands.map(c=>c.action),['close']);}finally{h.finish();}
});
test('desktop explicitly refused HTTP close permits a later deliberate close with a new exact revision',async()=>{
 const h=await discardClientHarness(),original=h.client.close(17);const rejected=assert.rejects(original,/revision changed/);try{await h.settle();h.reply({id:1,ok:false,code:'DESKTOP_WORKSPACE_REFUSED',error:'revision changed'});await rejected;const next=h.client.close(18);next.catch(()=>{});await h.settle();assert.deepEqual(h.commands.map(c=>[c.action,c.expected_working_revision]),[['close',17],['close',18]]);h.finish();await assert.rejects(next,/exited/);}finally{h.finish();}
});

test('native complete close attempt blocks new canvas, Open, Save, analysis and window actions while discard waits',async()=>{
 const app=new EventEmitter(),ipcMain=new EventEmitter(),actions=[],dialogs=[],enabled=[];let menus,owned,finishRestore,discardEntered,exited;const waiting=new Promise(resolve=>finishRestore=resolve),entered=new Promise(resolve=>discardEntered=resolve),done=new Promise(resolve=>exited=resolve);let closeCount=0,localD=0;
 Object.assign(app,{setName(){},setPath(){},whenReady:async()=>{},quit(){exited();},exit(){throw new Error('Unexpected startup failure');}});
 class Contents extends EventEmitter{constructor(){super();this.mainFrame={};this.session={setPermissionRequestHandler(){},setPermissionCheckHandler(){}};}getURL(){return this.url??'';}setWindowOpenHandler(){}reloadIgnoringCache(){}send(channel,value){actions.push(value.action);queueMicrotask(()=>ipcMain.emit('mwb:action-result',{sender:this,senderFrame:this.mainFrame},{id:value.id,ok:true}));}}
 class Window extends EventEmitter{constructor(){super();this.webContents=new Contents();this.enabled=true;owned=this;}async loadURL(url){this.webContents.url=url;}show(){}focus(){}isDestroyed(){return Boolean(this.destroyed);}setEnabled(value){this.enabled=value;enabled.push(value);}destroy(){this.destroyed=true;}attemptEdit(){if(this.enabled)localD++;}}
 class Backend{constructor(){this.ready=Promise.resolve({url:'http://127.0.0.1:12345/#'+'a'.repeat(48),node:process.version});}async queryDiscard(){return null;}async status(){return {...desktopClean,dirty:true,can_close:false,working_revision:17};}async discard(){discardEntered();await waiting;return desktopClean;}async close(){closeCount++;}abnormalDetach(){}async abnormalDrain(){}}
 const config={node:process.execPath,workspace:root,source:path.join(root,'public.tiff'),python:process.execPath},electron={app,ipcMain,BrowserWindow:Window,Menu:{buildFromTemplate:items=>(menus=items),setApplicationMenu(){}},dialog:{async showMessageBox(_window,options){dialogs.push(options);owned.enabled=true;return {response:1};},showErrorBox(){throw new Error('Unexpected startup failure');},async showOpenDialog(){throw new Error('Open must be guarded during closing');}}};
 const source=readFileSync(path.join(root,'tools/desktop_main.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/const electronModule = 'electron', electron = await import\(electronModule\);/,'const electron = __electron;').replaceAll('import.meta.url',JSON.stringify(new URL('../tools/desktop_main.mjs',import.meta.url).href));
 const context=vm.createContext({...desktopContracts,DesktopCloseCoordinator,DesktopBackendClient:Backend,path,fileURLToPath,URL,existsSync:()=>true,mkdirSync(){},readDesktopOptions:()=>config,__electron:electron,process:{env:{},argv:[],stdout:{write(){}},on(){}},setTimeout,clearTimeout,queueMicrotask,AggregateError});new vm.Script(source).runInContext(context);for(let i=0;i<16;i++)await Promise.resolve();
 menus[0].submenu.at(-1).click();await entered;assert.equal(owned.enabled,false);owned.attemptEdit();for(const [menu,label]of [[0,'打开图像…'],[0,'保存分析工作区'],[2,'FFT'],[3,'平铺图像窗口']])menus[menu].submenu.find(item=>item.label===label).click();await Promise.resolve();assert.equal(localD,0);assert.deepEqual(actions,['prepare-close']);assert.equal(dialogs.length,1);finishRestore();await done;assert.equal(closeCount,1);assert.deepEqual(enabled,[false,false,true]);assert.equal(owned.destroyed,true);
});

test('desktop lifecycle DTO strips ROI drafts, notes and PNG extras without rejecting the Panel response',()=>{
 const state={...desktopClean,private_notes:'controlled fixture note',window_drafts:{one:{reason:'controlled fixture reason'}},active_window_draft:{selection:[1,2,3,4]},png_base64:'controlled fixture image bytes'},projected=desktopContracts.readWorkspaceStatus({workspace_analysis:state});assert.deepEqual(projected,desktopClean);for(const key of ['private_notes','window_drafts','active_window_draft','png_base64'])assert.equal(Object.hasOwn(projected,key),false,key);assert.equal(Object.hasOwn(state,'window_drafts'),true);for(const status of [['clean'],null,{value:'clean'}])assert.throws(()=>desktopContracts.readWorkspaceStatus({workspace_analysis:{...desktopClean,status}}),/Invalid authoritative/);
});

test('malformed backend mutation reply IDs never resolve or clear an original close intent',async()=>{
 for(const bad of [{id:[1],ok:false,code:'DESKTOP_WORKSPACE_REFUSED',error:'bad ID'},{id:'1',ok:false,code:'DESKTOP_WORKSPACE_REFUSED',error:'bad ID'},{id:1,ok:'true',state:{workspace_analysis:desktopClean}}]){const h=await discardClientHarness(),original=h.client.close(17),rejected=assert.rejects(original,/Invalid backend operation reply/);try{await h.settle();h.reply(bad);await rejected;await assert.rejects(h.client.close(17),/Original close command_id=1/);assert.equal(h.commands.length,1);}finally{h.finish();}}
});
