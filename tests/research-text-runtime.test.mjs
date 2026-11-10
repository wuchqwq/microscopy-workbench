// Process-option tests only: no host spawn, credentials, profile or model.
import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {textHostProcess} from '../lib/research_text_runtime.mjs';
const root=path.resolve('analysis/public-runtime-options');
test('default-existing auth omits CODEX_HOME and keeps controlled runtime paths local',()=>{
 let reads=0;const inherited={PATH:'/system/bin',HOME:'/user-home',LANG:'en_US.UTF-8',get CODEX_HOME(){reads++;throw Error('Do not inspect profile selection');},get OPENAI_API_KEY(){reads++;throw Error('Do not inspect credentials');},get CODEX_ACCESS_TOKEN(){reads++;throw Error('Do not inspect credentials');}};
 const settings=textHostProcess(root,true,undefined,inherited);assert.equal(reads,0);assert.equal(settings.codex_home,null);assert.equal(settings.auth_source,'official_default_existing');assert.equal(Object.hasOwn(settings.process.env,'CODEX_HOME'),false);assert.equal(Object.hasOwn(settings.process.env,'OPENAI_API_KEY'),false);
 assert.equal(settings.process.env.HOME,'/user-home');assert.equal(settings.process.cwd,path.join(root,'model-cwd'));for(const k of ['TMPDIR','TMP','TEMP'])assert.equal(settings.process.env[k],path.join(root,'tmp'));assert.equal(settings.process.env.XDG_CACHE_HOME,path.join(root,'cache'));
});
test('external runtime remains explicit and inherited env is unchanged',()=>{
 const inherited={PATH:'/system/bin',CODEX_HOME:'/unselected-home'},before={...inherited};const selected=path.join(root,'selected');assert.equal(textHostProcess(root,false,selected,inherited).process.env.CODEX_HOME,selected);assert.equal(textHostProcess(root,false,undefined,inherited).process.env.CODEX_HOME,path.join(root,'codex-home'));assert.deepEqual(inherited,before);
});
test('ambiguous default auth and home override are refused before environment access',()=>{
 assert.throws(()=>textHostProcess(root,true,path.join(root,'other'),new Proxy({},{get(){throw Error('unexpected env access');}})),/cannot also select/);
});
test('runtime directory and selected external home must be absolute',()=>{
 assert.throws(()=>textHostProcess('relative',false,undefined,{}),/Absolute/);assert.throws(()=>textHostProcess(root,false,'relative',{}),/absolute/);
});
