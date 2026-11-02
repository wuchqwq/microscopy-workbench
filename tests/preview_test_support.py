"""Fixture clients explicitly acknowledge previews only AFTER receiving results.

This is not provider-side auto-release. Fault/no-delivery tests must not use it.
Only rendered references actually present in a delivered response are followed.
"""
import hashlib


def acknowledge_received_previews(worker, workspace, delivered):
    records=[delivered];refs=set()
    def collect(value):
        if type(value) is list:
            for item in value:collect(item)
        elif type(value) is dict:
            for key,item in value.items():
                if (key in ('view_object_id','overview_object_id','render_base_object_id','roi_object_id') or key.endswith('_view_object_id')) and type(item) is str and worker.OBJECT_ID.fullmatch(item):
                    refs.add(item)
                elif type(item) in (dict,list):collect(item)
    collect(delivered)
    seen=set()
    while refs-seen:
        if len(seen)>100:raise AssertionError('Fixture render-reference budget exceeded')
        ident=next(iter(refs-seen));seen.add(ident)
        reply=worker.execute(dict(workspace=str(workspace),action='get',object_id=ident))
        if reply.get('ok'):
            records.append(reply['result']);collect(reply['result'])
    for record in records:
        ref=record.get('preview_execution')
        if type(ref) is not dict:continue
        ident='received-'+hashlib.sha256((ref['request_id']+':'+ref['object_id']).encode()).hexdigest()[:48]
        reply=worker.execute(dict(workspace=str(workspace),action='preview_acknowledge',request_id=ident,
                                 preview_request_id=ref['request_id'],object_id=ref['object_id']))
        if not reply.get('ok'):raise AssertionError(reply)
