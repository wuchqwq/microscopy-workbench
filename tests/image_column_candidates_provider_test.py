"""Real immutable provider boundary for append-only HAADF candidate annotations."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import tifffile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker
from tools import image_column_candidates as detector
from preview_test_support import acknowledge_received_previews


class ColumnCandidateProvider(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='column-candidate-provider-')
        self.root = Path(self.temp.name)
        self.workspace = self.root / 'workspace'
        self.serial = 0
        yy, xx = np.indices((64, 80))
        values = np.zeros((64, 80), dtype=np.float32)
        for x, y in ((15, 20), (35, 25), (55, 40)):
            values += np.exp(-((xx-x)**2+(yy-y)**2)/4).astype(np.float32)
        self.input = self.root / 'clear.tif'
        tifffile.imwrite(self.input, values)
        self.source_hash = worker.sha_file(self.input)
        source = self.call('open', source_path=str(self.input))
        self.frame = self.call('frame', object_id=source['object_id'], frame_index=0)
        self.view = self.call('view', object_id=self.frame['object_id'])

    def tearDown(self):
        self.temp.cleanup()

    def call(self, action, ok=True, **args):
        self.serial += 1
        request = dict(action=action, workspace=str(self.workspace), **args)
        if action not in ('get', 'result'):
            request.setdefault('request_id', 'cc-%d' % self.serial)
        response = worker.execute(request)
        self.assertEqual(response['ok'], ok, response)
        if ok:
            acknowledge_received_previews(worker, self.workspace, response['result'])
        return response['result'] if ok else response

    def detect(self, obj=None, **args):
        return self.call('column_candidates', object_id=(obj or self.view)['object_id'], rect=[5, 5, 70, 55],
                         modality='haadf', source_text='Analytic clear bright-peak fixture; not physical STEM validation', **args)

    def test_detect_edit_retract_add_repeat_read_recover_and_export(self):
        result = self.detect()
        self.assertEqual(result['kind'], 'annotate')
        self.assertEqual(len(result['annotations']), 3)
        candidate_ids = [p['annotation_id'] for p in result['annotations']]
        original = [p['anchor']['coordinates'] for p in result['annotations']]
        self.assertEqual(original, [[15, 20], [35, 25], [55, 40]])
        moved = self.call('annotate', object_id=result['object_id'], updates=[dict(annotation_id=candidate_ids[0], coordinates=[17.25, 20.5]), dict(annotation_id=candidate_ids[1], status='retracted')])
        # Add a manual mark with the existing standard immutable annotation API.
        marks = []
        for mark in moved['annotations']:
            item = {k: mark[k] for k in ('annotation_id', 'kind', 'text', 'color', 'status', 'note')}
            item.update(mark['anchor']); marks.append(item)
        marks.append(dict(annotation_id='manual-point', kind='point', coordinates=[45.5, 30], coordinate_space='source_pixels', source_object_id=self.frame['object_id'], status='hypothesized'))
        manual = self.call('annotate', object_id=moved['object_id'], annotations=marks)
        again = self.detect(manual)
        self.assertEqual(again['annotations'], manual['annotations'])
        self.assertEqual(again['column_candidates']['annotation_application']['new_annotation_ids'], [])
        self.assertEqual(len(again['column_candidates']['annotation_application']['suppressed_candidate_ids']), 3)
        # Read, original request recovery, and export must not rerun a detector.
        with patch.object(detector, 'detect', side_effect=AssertionError('Detection must not replay on read')):
            self.assertEqual(self.call('get', object_id=again['object_id'])['annotations'], again['annotations'])
            self.assertEqual(self.call('result', query_request_id=again['request_id'])['object_id'], again['object_id'])
            exported = self.call('export', object_id=again['object_id'], output_dir=str(self.root/'export'))
            self.assertTrue(exported['exported_files_sha256'])
        self.assertEqual(worker.sha_file(self.input), self.source_hash)
        restored = worker.Workspace(str(self.workspace), writable=False).object(again['object_id'])[0]
        self.assertEqual(restored['annotations'], again['annotations'])

    def test_cropped_view_restores_source_xy_and_retains_offscreen_marks(self):
        marked = self.call('annotate', object_id=self.view['object_id'], annotations=[
            dict(annotation_id='outside-crop', kind='point', coordinates=[3,3], coordinate_space='source_pixels', source_object_id=self.frame['object_id']),
            dict(annotation_id='outside-retracted', kind='point', coordinates=[75,50], coordinate_space='source_pixels', source_object_id=self.frame['object_id'], status='retracted')])
        cropped = self.call('view', object_id=marked['object_id'], rect=[10,10,70,55])
        result = self.call('column_candidates', object_id=cropped['object_id'], rect=[12,12,65,50], modality='haadf',source_text='Explicit cropped-source coordinate regression')
        found = result['column_candidates']['candidates']
        self.assertEqual([[p['x'],p['y']] for p in found], [[15,20],[35,25],[55,40]])
        self.assertEqual(result['column_candidates']['provenance']['array_origin_source_xy'], [10,10])
        self.assertEqual(result['column_candidates']['provenance']['source_rect_xyxy'], [12,12,65,50])
        retained = result['annotations'][:2]
        self.assertEqual(retained, cropped['annotations'])
        self.assertEqual(retained[1]['status'], 'retracted')
        again = self.call('column_candidates', object_id=result['object_id'], rect=[12,12,65,50], modality='haadf',source_text='Repeat cropped detection')
        self.assertEqual(again['annotations'], result['annotations'])
        self.assertEqual(again['column_candidates']['annotation_application']['new_annotation_ids'], [])
        self.assertEqual(worker.sha_file(self.input), self.source_hash)

    def test_declared_modality_domain_roi_and_budget_gates(self):
        for fields in [dict(modality='bf'), dict(source_text=''), dict(rect=[-1,0,20,20]), dict(rect=[0,0,100,100])]:
            args=dict(object_id=self.view['object_id'],rect=[5,5,70,55],modality='haadf',source_text='Analytic');args.update(fields)
            self.call('column_candidates', ok=False, **args)
        fft = self.call('fft', object_id=self.frame['object_id'], rect=[0,0,64,64])
        self.call('column_candidates', ok=False, object_id=fft['object_id'],rect=[5,5,50,50],modality='haadf',source_text='Wrong-domain negative')
        marks=[dict(annotation_id='retained-%d'%i,kind='point',coordinates=[1,1],coordinate_space='source_pixels',source_object_id=self.frame['object_id']) for i in range(128)]
        full=self.call('annotate',object_id=self.view['object_id'],annotations=marks)
        self.call('column_candidates',ok=False,object_id=full['object_id'],rect=[5,5,70,55],modality='haadf',source_text='No silent truncation')
        self.assertEqual(len(self.call('get',object_id=full['object_id'])['annotations']),128)
        self.assertEqual(worker.sha_file(self.input), self.source_hash)

if __name__ == '__main__':
    unittest.main()
