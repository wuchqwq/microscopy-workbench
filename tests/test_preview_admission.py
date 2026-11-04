"""Preview admission and historical integrity; no new numerical algorithm tests."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import tifffile
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import image_workspace as worker

class PowerLoss(BaseException):
    pass

class PreviewAdmission(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.workspace=self.root/'workspace'
        self.source=self.root/'public.tiff';tifffile.imwrite(self.source,np.arange(1024,dtype='float32').reshape(32,32),metadata=None)
        self.n=0
        self.source_object=self.ok('open',source_path=str(self.source))
        self.frame=self.ok('frame',object_id=self.source_object['object_id'],frame_index=0)
        self.frame_id=self.frame['object_id']
    def tearDown(self):
        self.tmp.cleanup()
    def req(self,action,**args):
        self.n+=1;return {'workspace':str(self.workspace),'action':action,**({'request_id':f'p-{self.n}'} if action not in ('get','result') else {}),**args}
    def ok(self,action,**args):
        reply=worker.execute(self.req(action,**args));self.assertTrue(reply['ok'],reply);return reply['result']
    def objects(self):
        return list((self.workspace/'objects').glob('*/object.json'))
    def invoke_process(self,request):
        p=subprocess.run([sys.executable,'-B',worker.__file__],input=json.dumps(request),capture_output=True,text=True)
        return json.loads(p.stdout)
    def test_completed_lost_response_blocks_new_id_size_and_explicit_result_allows_new_intent(self):
        first=self.ok('view',object_id=self.frame_id,max_size=512)
        original={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in self.workspace.rglob('*') if p.is_file()}
        count=len(self.objects())
        for size in (32,512,1024):
            reply=worker.execute(self.req('view',object_id=self.frame_id,max_size=size))
            self.assertFalse(reply['ok']);self.assertEqual(reply['error']['code'],'PREVIEW_OUTCOME_UNRESOLVED',reply)
        self.assertEqual(len(self.objects()),count)
        for p,digest in original.items():self.assertEqual(hashlib.sha256(Path(p).read_bytes()).hexdigest(),digest)
        recovered=self.ok('result',query_request_id=first['request_id']);self.assertEqual(first,recovered)
        second=self.ok('view',object_id=first['object_id'],max_size=1024)
        self.assertNotEqual(first['object_id'],second['object_id'])
        third=self.ok('view',object_id=self.frame_id,resolved_preview={'request_id':second['request_id'],'object_id':second['object_id']},gamma=1.1)
        self.assertNotEqual(third['object_id'],second['object_id'])
    def test_reservation_without_dispatch_stays_unknown_across_processes_and_reads_work(self):
        request=self.req('view',object_id=self.frame_id,_preview_phase='reserve');reply=worker.execute(request)
        self.assertTrue(reply['ok']);count=len(self.objects())
        old=self.invoke_process(self.req('result',query_request_id=request['request_id']))
        self.assertEqual(old['state'],'unknown');self.assertFalse(old['automatic_retry'])
        new=self.invoke_process(self.req('view',object_id=self.frame_id,max_size=64))
        self.assertFalse(new['ok']);self.assertEqual(new['error']['code'],'PREVIEW_OUTCOME_UNRESOLVED')
        self.assertEqual(len(self.objects()),count);self.ok('get',object_id=self.frame_id)
        duplicate=worker.execute(request);self.assertEqual(duplicate['error']['code'],'INCOMPLETE_REQUEST')
    def test_prepared_journal_after_crash_does_not_dispatch_again(self):
        request=self.req('view',object_id=self.frame_id)
        original=worker.Workspace.action
        def crash(ws,action,*args):
            if action=='view':raise PowerLoss()
            return original(ws,action,*args)
        with patch.object(worker.Workspace,'action',crash):
            with self.assertRaises(PowerLoss):worker.execute(request)
        path=self.workspace/'requests'/(request['request_id']+'.json');before=path.read_bytes()
        recovered=self.invoke_process(self.req('result',query_request_id=request['request_id']))
        self.assertEqual(recovered['state'],'unknown')
        repeated=self.invoke_process(request);self.assertEqual(repeated['state'],'unknown')
        other=self.invoke_process(self.req('view',object_id=self.frame_id));self.assertEqual(other['error']['code'],'PREVIEW_OUTCOME_UNRESOLVED')
        self.assertEqual(path.read_bytes(),before)
    def test_confirmed_abort_before_dispatch_allows_new_id_but_old_id_never_replays(self):
        request=self.req('view',object_id=self.frame_id)
        reservation=worker.execute({**request,'_preview_phase':'reserve'})['preview_admission']
        aborted=worker.execute({**request,'_preview_phase':'abort','_preview_ticket':reservation['ticket']})
        self.assertEqual(aborted['preview_admission']['phase'],'not_submitted')
        result=worker.execute(self.req('result',query_request_id=request['request_id']))
        self.assertEqual(result['state'],'not_submitted');self.assertFalse(result['automatic_retry'])
        self.assertFalse(worker.execute(request)['ok'])
        self.ok('view',object_id=self.frame_id)
    def test_two_actual_processes_have_one_winner(self):
        requests=[self.req('view',object_id=self.frame_id,max_size=size) for size in (512,1024)]
        processes=[subprocess.Popen([sys.executable,'-B',worker.__file__],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in requests]
        for process,request in zip(processes,requests):process.stdin.write(json.dumps(request));process.stdin.close();process.stdin=None
        replies=[json.loads(p.communicate(timeout=30)[0]) for p in processes]
        self.assertEqual(sum(r['ok'] for r in replies),1,replies)
        self.assertEqual(sum(json.loads(p.read_text()).get('kind')=='view' for p in self.objects()),1)
    def test_no_ttl_pid_or_unsafe_ack_unlocks_reserved_intent(self):
        request=self.req('view',object_id=self.frame_id)
        worker.execute({**request,'_preview_phase':'reserve'})
        for ack in [{'request_id':request['request_id']},{'request_id':request['request_id'],'object_id':self.frame_id}]:
            reply=worker.execute(self.req('view',object_id=self.frame_id,resolved_preview=ack))
            self.assertEqual(reply['error']['code'],'PREVIEW_OUTCOME_UNRESOLVED')
    def test_original_parameter_conflict_and_unrelated_frame_are_preserved(self):
        original=self.ok('view',object_id=self.frame_id,max_size=512)
        changed=worker.execute(self.req('view',object_id=self.frame_id,max_size=1024,request_id=original['request_id']))
        self.assertEqual(changed['error']['code'],'REQUEST_CONFLICT')
        other=self.ok('frame',object_id=self.source_object['object_id'],frame_index=0)
        refused=worker.execute(self.req('view',object_id=other['object_id']))
        self.assertEqual(refused['error']['code'],'PREVIEW_OUTCOME_UNRESOLVED')
        distinct=self.root/'other.tiff';tifffile.imwrite(distinct,np.ones((32,32),dtype='float32'),metadata=None)
        opened=self.ok('open',source_path=str(distinct));frame=self.ok('frame',object_id=opened['object_id'],frame_index=0)
        self.ok('view',object_id=frame['object_id'])

    def test_composition_cannot_create_preview_while_original_unknown(self):
        original=self.req('view',object_id=self.frame_id,_preview_phase='reserve');worker.execute(original)
        count=lambda:sum(json.loads(p.read_text()).get('kind')=='view' for p in self.objects())
        before=count()
        discovery=worker.execute(self.req('discovery',object_id=self.frame_id,entry='manual',selection_origin='agent',regions=[{'rect':[0,0,32,32],'reason':'Controlled test choice'}],max_size=64))
        self.assertFalse(discovery['ok'],discovery);self.assertEqual(count(),before)
        self.assertEqual(self.invoke_process(self.req('result',query_request_id=original['request_id']))['state'],'unknown')

    def test_corrupt_not_submitted_intent_and_conflicting_fence_fail_closed(self):
        original=self.req('view',object_id=self.frame_id,_preview_phase='reserve');worker.execute(original)
        root=self.workspace/'preview-admission-v1/intents';path=root/(original['request_id']+'.json')
        for corrupt in [dict(version=1,state='not_submitted'),{**json.loads(path.read_text()),'state':'not_submitted'}]:
            path.write_text(json.dumps(corrupt));(root/(original['request_id']+'.dispatch')).write_text(json.dumps({'version':1,'request_id':original['request_id'],'state':'dispatched'}))
            reply=worker.execute(self.req('view',object_id=self.frame_id));self.assertFalse(reply['ok']);self.assertEqual(reply['error']['code'],'PREVIEW_ADMISSION_CORRUPT')
            self.assertEqual(worker.execute(self.req('result',query_request_id=original['request_id']))['state'],'unknown')

    def test_explicit_acknowledgement_allows_composition_without_new_preview_delivery(self):
        first=self.ok('view',object_id=self.frame_id)
        ack=self.ok('preview_acknowledge',preview_request_id=first['request_id'],object_id=first['object_id'])
        self.assertFalse(ack['scientific_object_created']);self.assertTrue(ack['operational_receipt'])
        self.assertEqual(self.ok('result',query_request_id=ack['request_id']),ack)
        discovery=self.ok('discovery',object_id=self.frame_id,entry='manual',selection_origin='agent',regions=[{'rect':[0,0,32,32],'reason':'Controlled acknowledged source'}],max_size=64)
        self.assertEqual(discovery['kind'],'discovery')

    def test_unknown_cannot_be_acknowledged(self):
        original=self.req('view',object_id=self.frame_id,_preview_phase='reserve');worker.execute(original)
        reply=worker.execute(self.req('preview_acknowledge',preview_request_id=original['request_id'],object_id=self.frame_id))
        self.assertFalse(reply['ok']);self.assertEqual(reply['error']['code'],'PREVIEW_OUTCOME_UNRESOLVED')

    def test_ack_request_ids_cannot_collide_with_scientific_requests(self):
        first=self.ok('view',object_id=self.frame_id)
        bad=worker.execute(self.req('preview_acknowledge',preview_request_id=first['request_id'],object_id=first['object_id'],request_id=first['request_id']))
        self.assertEqual(bad['error']['code'],'REQUEST_CONFLICT')
        ack=self.ok('preview_acknowledge',preview_request_id=first['request_id'],object_id=first['object_id'])
        other=worker.execute(self.req('context',object_id=self.frame_id,metadata={'source_text':'new caller note'},request_id=ack['request_id']))
        self.assertEqual(other['error']['code'],'REQUEST_CONFLICT')
        self.assertEqual(self.ok('result',query_request_id=ack['request_id']),ack)

    def test_ack_id_reserved_before_marker_prevents_interleaved_scientific_write(self):
        first=self.ok('view',object_id=self.frame_id)
        request=self.req('preview_acknowledge',preview_request_id=first['request_id'],object_id=first['object_id'])
        original=worker.preview_admission._write;interleaved=[]
        def observed(path,value,api,exclusive=False):
            if path.parent.name=='acknowledged' and not interleaved:
                interleaved.append(worker.execute(self.req('context',request_id=request['request_id'],object_id=self.frame_id,metadata={'source_text':'conflicting operation'})))
            return original(path,value,api,exclusive)
        with patch.object(worker.preview_admission,'_write',observed):reply=worker.execute(request)
        self.assertTrue(reply['ok'],reply);self.assertEqual(interleaved[0]['error']['code'],'REQUEST_CONFLICT')
        self.assertEqual(self.ok('result',query_request_id=request['request_id']),reply['result'])

    def test_missing_single_resource_claim_cannot_turn_an_existing_source_into_first_use(self):
        original=self.req('view',object_id=self.frame_id,_preview_phase='reserve');worker.execute(original)
        root=self.workspace/'preview-admission-v1';intent=json.loads((root/'intents'/(original['request_id']+'.json')).read_text())
        (root/'resources'/(intent['resource_key']+'.json')).unlink()
        reply=worker.execute(self.req('view',object_id=self.frame_id))
        self.assertFalse(reply['ok']);self.assertEqual(reply['error']['code'],'PREVIEW_ADMISSION_CORRUPT')
        self.assertEqual(self.ok('get',object_id=self.frame_id)['object_id'],self.frame_id)

    def test_losing_global_request_id_race_does_not_poison_unused_preview_resource(self):
        request=self.req('view',object_id=self.frame_id)
        original=worker.preview_admission._write;interleaved=[]
        def competing_request(path,value,api,exclusive=False):
            if path.parent.name=='requests' and value.get('state')=='preview_reserved' and not interleaved:
                competing=self.ok('context',request_id=request['request_id'],object_id=self.frame_id,
                                  metadata={'source_text':'Independent scheduling regression'})
                journal=path.read_bytes()
                interleaved.append((competing,journal))
            return original(path,value,api,exclusive)
        with patch.object(worker.preview_admission,'_write',competing_request):
            losing=worker.execute(request)
        self.assertEqual(losing['error']['code'],'REQUEST_CONFLICT',losing)
        self.assertEqual((self.workspace/'requests'/(request['request_id']+'.json')).read_bytes(),interleaved[0][1])
        self.assertEqual(list((self.workspace/'preview-admission-v1/resources').iterdir()),[])
        fresh=self.ok('view',object_id=self.frame_id)
        self.assertEqual(fresh['kind'],'view')
        self.assertEqual((self.workspace/'requests'/(request['request_id']+'.json')).read_bytes(),interleaved[0][1])

    def test_composition_rejection_names_blocking_preview_not_nonexistent_child(self):
        first=self.ok('view',object_id=self.frame_id)
        request=self.req('discovery',object_id=self.frame_id,entry='manual',selection_origin='agent',
                         regions=[{'rect':[0,0,32,32],'reason':'Controlled receipt recovery'}])
        failed=worker.execute(request)
        self.assertEqual(failed['error']['code'],'BATCH_CHILD_FAILED')
        message=failed['error']['message']
        self.assertIn('child preview was not reserved or dispatched',message)
        self.assertIn('Do not query this nonexistent child ID',message)
        self.assertIn('image_preview_acknowledge',message)
        self.assertIn(first['request_id'],message)
        child=worker.automation.child_request_id(request['request_id'],'context-view')
        self.assertFalse((self.workspace/'requests'/(child+'.json')).exists())
        journal=self.workspace/'requests'/(request['request_id']+'.json');before=journal.read_bytes()
        self.ok('preview_acknowledge',preview_request_id=first['request_id'],object_id=first['object_id'])
        revised=self.ok('discovery',object_id=self.frame_id,entry='manual',selection_origin='agent',
                        regions=[{'rect':[0,0,32,32],'reason':'Controlled receipt recovered'}])
        self.assertEqual(revised['kind'],'discovery')
        self.assertEqual(journal.read_bytes(),before)
        self.assertEqual(worker.execute(self.req('result',query_request_id=request['request_id'])),failed)

    def test_resolved_preview_rerender_requires_latest_receipt_for_composition(self):
        first=self.ok('view',object_id=self.frame_id)
        second=self.ok('view',object_id=self.frame_id,
                       resolved_preview={'request_id':first['request_id'],'object_id':first['object_id']})
        self.ok('preview_acknowledge',preview_request_id=first['request_id'],object_id=first['object_id'])
        request=self.req('discovery',object_id=self.frame_id,entry='manual',selection_origin='agent',
                         regions=[{'rect':[0,0,32,32],'reason':'Stale receipt must not resolve newer preview'}])
        failed=worker.execute(request)
        self.assertFalse(failed['ok'])
        self.assertIn('preview_request_id='+second['request_id'],failed['error']['message'])
        self.assertIn('object_id='+second['object_id'],failed['error']['message'])
        self.ok('preview_acknowledge',preview_request_id=second['request_id'],object_id=second['object_id'])
        self.assertEqual(self.ok('discovery',object_id=self.frame_id,entry='manual',selection_origin='agent',
                                regions=[{'rect':[0,0,32,32],'reason':'Latest receipt known'}])['kind'],'discovery')

    def test_unknown_composition_rejection_never_suggests_acknowledging_unknown(self):
        request=self.req('view',object_id=self.frame_id,_preview_phase='reserve')
        worker.execute(request)
        failed=worker.execute(self.req('discovery',object_id=self.frame_id,entry='manual',selection_origin='agent',
                                      regions=[{'rect':[0,0,32,32],'reason':'Unknown preview remains fenced'}]))
        self.assertIn('child preview was not reserved or dispatched',failed['error']['message'])
        self.assertIn('Unknown originals cannot be acknowledged',failed['error']['message'])
        self.assertNotIn('preview_request_id=',failed['error']['message'])
        self.assertEqual(worker.execute(self.req('result',query_request_id=request['request_id']))['state'],'unknown')

    def test_existing_child_journal_never_claims_child_was_not_dispatched(self):
        parent={'request_id':'controlled-existing-parent'}
        child=worker.automation.child_request_id(parent['request_id'],'context-view')
        self.ok('view',object_id=self.frame_id,request_id=child)
        journal=self.workspace/'requests'/(child+'.json');before=journal.read_bytes()
        ws=worker.Workspace(str(self.workspace),True)
        failure={'ok':False,'error':{'code':'PREVIEW_OUTCOME_UNRESOLVED','message':'Controlled conflicting response'}}
        with patch.object(worker,'_execute',return_value=failure):
            with self.assertRaises(worker.WorkspaceError) as caught:
                worker.automation.run_child(ws,parent,'context-view','view',object_id=self.frame_id)
        self.assertNotIn('child preview was not reserved or dispatched',str(caught.exception))
        self.assertIn('Query original child ID',str(caught.exception))
        self.assertEqual(journal.read_bytes(),before)

    def test_absence_alone_never_proves_unknown_child_was_not_dispatched(self):
        parent={'request_id':'controlled-unknown-parent'}
        ws=worker.Workspace(str(self.workspace),True)
        failure={'ok':False,'state':'unknown','error':{'code':'INCOMPLETE_REQUEST','message':'Controlled unknown'}}
        with patch.object(worker,'_execute',return_value=failure):
            with self.assertRaises(worker.WorkspaceError) as caught:
                worker.automation.run_child(ws,parent,'context-view','view',object_id=self.frame_id)
        self.assertNotIn('child preview was not reserved or dispatched',str(caught.exception))
        self.assertIn('do not replay unknown work',str(caught.exception))

if __name__=='__main__':unittest.main()
