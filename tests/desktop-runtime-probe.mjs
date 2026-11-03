// Explicit Electron integration probe, not included in Node tests and never
// imported by the headless CLI. No scientific workspace or browser automation.
import {app,BrowserWindow} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {appendFileSync} from 'node:fs';
import {desktopSecurityPreferences} from '../lib/desktop_contracts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.MWB_DESKTOP_PROBE_DIRECTORY)throw new Error('Explicit isolated probe directory required');
const trace=message=>appendFileSync(path.join(path.dirname(process.env.MWB_DESKTOP_PROBE_DIRECTORY),'desktop-security-runtime.trace'),message+'\n');
trace('module loaded');
process.on('uncaughtException',error=>{trace('uncaught: '+error.stack);process.stderr.write(error.stack+'\n');app.exit(1);});
process.on('unhandledRejection',error=>{trace('rejected: '+String(error));process.stderr.write(String(error)+'\n');app.exit(1);});
app.setPath('userData',process.env.MWB_DESKTOP_PROBE_DIRECTORY);
void app.whenReady().then(async()=>{
trace('app ready');
let preloadError=null;
const window=new BrowserWindow({show:false,webPreferences:{...desktopSecurityPreferences,preload:path.join(root,'tools/desktop_preload.cjs')}});
trace('window created');
window.webContents.on('preload-error',(_event,_file,error)=>{preloadError=String(error);});
await window.loadURL('data:text/html,<html><head><meta http-equiv="Content-Security-Policy" content="default-src %27none%27"></head><body>isolated runtime probe</body></html>');
trace('page loaded');
const actual=window.webContents.getLastWebPreferences();
const result={schema_version:1,electron:process.versions.electron,embedded_node:process.versions.node,platform:process.platform,preload_error:preloadError,preferences:Object.fromEntries(Object.keys(desktopSecurityPreferences).map(key=>[key,actual[key]]))};
const ok=preloadError===null&&Object.entries(desktopSecurityPreferences).every(([key,value])=>actual[key]===value);
process.stdout.write(JSON.stringify({...result,ok})+'\n');
window.destroy();app.exit(ok?0:1);
});
