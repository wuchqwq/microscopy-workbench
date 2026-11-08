// New dedicated public synthetic workspace; launches the existing Electron UI.
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {launchDesktop} from './desktop_launcher.mjs';
import {publicResearchDirectory} from '../lib/desktop_public_research.mjs';
const [run]=process.argv.slice(2),python=process.env.MICROSCOPY_PYTHON;
if(!run||!python||!path.isAbsolute(python))throw Error('Usage: MICROSCOPY_PYTHON=ABS node dist/tools/desktop_public_research.mjs NEW_EXTERNAL_DIRECTORY');
publicResearchDirectory(run,path.join(run,'workspace'));mkdirSync(run);
for(const d of ['workspace','profile','tmp','cache'])mkdirSync(path.join(run,d));
const source=path.join(run,'public-synthetic.tiff');
Object.assign(process.env,{TMPDIR:path.join(run,'tmp'),TMP:path.join(run,'tmp'),TEMP:path.join(run,'tmp'),XDG_CACHE_HOME:path.join(run,'cache'),MWB_DESKTOP_PROFILE:path.join(run,'profile'),MWB_PUBLIC_RESEARCH_RUN:run});
const generated=spawnSync(python,['-B','-c',"import numpy as np,tifffile,sys; y,x=np.mgrid[:64,:64]; a=(np.where(x<32,100,300)+(y%2)*20).astype(np.uint16); tifffile.imwrite(sys.argv[1],a,metadata=None,photometric='minisblack')",source]);
if(generated.status!==0)throw Error('Public fixture creation failed');
process.exitCode=await launchDesktop(['--workspace',path.join(run,'workspace'),'--source',source,'--python',python]);
