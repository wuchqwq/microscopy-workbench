// Executes the actual compiled native main entry with an Electron port.
// This checks wiring/ownership/freezing; it is not Cocoa or real worker evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {DesktopCloseCoordinator} from '../lib/desktop_lifecycle.mjs';
import {exitWithRecovery} from '../lib/desktop_recovery_exit.mjs';
import * as contracts from '../lib/desktop_contracts.mjs';

async function fixture(response){
 const app=new EventEmitter(),ipcMain=new EventEmitter(),trace=[];let menus,owned,entered,finish,quit;
 const started=new Promise(r=>entered=r),waiting=new Promise(r=>finish=r),done=new Promise(r=>quit=r);
 Object.assign(app,{setName(){},setPath(){},whenReady:async()=>{},quit(){trace.push('quit');quit();},exit(){assert.fail('startup failure');}});
 class Window extends EventEmitter{
  constructor(){super();owned=this;this.enabled=true;this.destroyed=false;this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{},getURL:()=>this.url,send(){trace.push('renderer-action');},setWindowOpenHandler(){},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}});}
  async loadURL(url){this.url=url;}show(){}focus(){}setEnabled(v){this.enabled=v;trace.push('enabled:'+v);}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;trace.push('destroy');}
 }
 class Backend{constructor(){this.ready=Promise.resolve({url:'http://127.0.0.1:12345/#'+'a'.repeat(48),node:process.version});}async abnormalDrain(){trace.push('drain');entered();await waiting;trace.push('drained');}async status(){assert.fail('recovery exit cannot claim Save/normal close');}async queryDiscard(){assert.fail('no discard');}async close(){assert.fail('no implicit normal close');}}
 const config={node:process.execPath,workspace:path.dirname(process.execPath),source:'/public/small.tiff',python:process.execPath};
 const electron={app,ipcMain,BrowserWindow:Window,Menu:{buildFromTemplate:items=>(menus=items),setApplicationMenu(){}},dialog:{async showMessageBox(_w,options){trace.push('dialog');assert.match(options.detail,/这不是保存成功/);assert.equal(options.defaultId,1);return {response};},showErrorBox(){assert.fail('startup error');}}};
 const text=readFileSync(new URL('../tools/desktop_main.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/const electronModule = 'electron', electron = await import\(electronModule\);/,'const electron = __electron;').replaceAll('import.meta.url',JSON.stringify(new URL('../tools/desktop_main.mjs',import.meta.url).href));
 const ctx=vm.createContext({...contracts,DesktopCloseCoordinator,exitWithRecovery,DesktopBackendClient:Backend,path,fileURLToPath,URL,existsSync:()=>true,mkdirSync(){},readDesktopOptions:()=>config,__electron:electron,process:{env:{},argv:[],platform:'darwin',stdout:{write(){}},on(){}},setTimeout,clearTimeout,queueMicrotask,AggregateError});new vm.Script(text).runInContext(ctx);
 for(let n=0;n<30;n++)await Promise.resolve();
 return {app,trace,started,done,finish,owned:()=>owned,menus:()=>menus};
}
test('native recovery exit freezes canvas after its enabled confirmation sheet and fences normal quit',async()=>{
 const h=await fixture(0);h.menus()[0].submenu.find(x=>x.label==='保留恢复记录并退出…').click();await h.started;assert.equal(h.owned().enabled,false);h.menus()[2].submenu.find(x=>x.label==='FFT').click();h.app.emit('before-quit',{preventDefault(){}});await Promise.resolve();assert.equal(h.trace.includes('renderer-action'),false);h.finish();await h.done;assert.equal(h.owned().destroyed,true);assert.ok(h.trace.indexOf('drained')<h.trace.indexOf('destroy'));assert.equal(h.trace.filter(x=>x==='drain').length,1);
});
test('native recovery confirmation cancellation leaves parent enabled and backend untouched',async()=>{
 const h=await fixture(1);h.menus()[0].submenu.find(x=>x.label==='保留恢复记录并退出…').click();for(let n=0;n<50;n++)await Promise.resolve();assert.equal(h.owned().enabled,true);assert.equal(h.owned().destroyed,false);assert.equal(h.trace.includes('drain'),false);assert.equal(h.trace.includes('quit'),false);
});
