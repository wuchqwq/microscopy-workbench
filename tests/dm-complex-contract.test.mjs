import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {tmpdir} from 'node:os';
import {imageTools} from '../lib/image_workspace.mjs';
import {parseResearcherArgs} from '../tools/researcher_inspector.mjs';
import {framePreviewRecipe,selectionActionReason} from '../ui/image-panel/user-workflow.mjs';
import {figureDisplayParameters} from '../ui/image-panel/figure-export.mjs';

test('complex preview/CLI component is explicit and old scalar arguments gain no default',()=>{
 assert.deepEqual(imageTools.find(t=>t.name==='image_preview').inputSchema.properties.component.enum,['real','imag','amplitude','power']);
 const old=['--source',path.join(tmpdir(),'source.dm4'),'--workspace',path.join(tmpdir(),'workspace'),'--python',process.execPath];
 assert.ok(!('component' in parseResearcherArgs(old)));assert.equal(parseResearcherArgs([...old,'--component','imag']).component,'imag');
 for(const mode of ['raw','phase','unknown'])assert.throws(()=>parseResearcherArgs([...old,'--component',mode]),/component/);
});
test('saved ordinary complex component survives frame and paper recipe replay without becoming an FFT representation',()=>{
 const panels=[{domain:'spatial_pixels'}],display={gamma:1,display_range:[-24,12],max_size:128,upscale:true,interpolation:'nearest',scale_bar:false,component:'imag'};
 assert.equal(framePreviewRecipe({panels},display).component,'imag');assert.equal(figureDisplayParameters(display,panels).component,'imag');
 const scalar={...display};delete scalar.component;assert.ok(!('component' in framePreviewRecipe({panels},scalar)));assert.ok(!('component' in figureDisplayParameters(scalar,panels)));
 assert.throws(()=>figureDisplayParameters({...display,component:'phase'},panels),/显示参数/);
 const picked={kind:'rectangle',coordinates:[0,0,4,4],panel:panels[0]};assert.match(selectionActionReason('fft',picked,{dtype:'complex64',panels}),/复数/);assert.equal(selectionActionReason('fft',picked,{dtype:'uint16',panels}),'');
});
