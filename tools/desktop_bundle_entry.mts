// Electron's packaged main entry; ordinary Node remains the scientific helper.
import {fileURLToPath} from 'node:url';
import {bundledDesktopArguments} from '../lib/desktop_bundle.mjs';
if(!process.versions.electron)throw Error('Open the application with its Electron executable');
const root=fileURLToPath(new URL('../../',import.meta.url)),user=process.argv.slice((process as NodeJS.Process&{defaultApp?:boolean}).defaultApp?2:1);
process.env.PYTHONNOUSERSITE='1';delete process.env.PYTHONPATH;delete process.env.PYTHONHOME;
process.argv=[process.execPath,fileURLToPath(import.meta.url),...bundledDesktopArguments(root,user)];
await import('./desktop_main.mjs');
