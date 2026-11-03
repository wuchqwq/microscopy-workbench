import test from 'node:test';
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
