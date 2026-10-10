"""Concurrent permanent Save and mutable draft requests compare the same checkpoint."""
import json, os, subprocess, time, uuid

assert os.environ.get('PGDATABASE') == 'cloud_test' and os.environ.get('PGHOST') == 'localhost', 'Use only the hosted fixture database'
owner = '0x8888888888888888888888888888888888888888'
headers = f"SET ROLE anon; SELECT cloud_test_headers('{owner}');"

def sql(value):
    result = subprocess.run(['psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', value], capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr[-2000:]
    return result.stdout.strip()

def start(name, query):
    process_env = dict(os.environ, PGAPPNAME=name)
    return subprocess.Popen(['psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-c', query], env=process_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

for order in ['save-first', 'draft-first']:
    project, client, save_nonce, draft_nonce = [str(uuid.uuid4()) for _ in range(4)]
    base = {'version': 1, 'snapshot': {'id': project, 'title': 'Baseline', 'updatedAt': 1,
        'settings': {'width': 640, 'height': 360, 'fps': 30}, 'tracks': [{'id': 'v', 'kind': 'video', 'name': 'Video', 'hidden': False, 'muted': False}], 'clips': []}, 'media': []}
    saved = json.loads(json.dumps(base)); saved['snapshot']['title'] = 'Permanent choice'
    live = json.loads(json.dumps(base)); live['snapshot']['settings']['background'] = '#ffffff'
    quoted = lambda document: "'" + json.dumps(document, separators=(',', ':')).replace("'", "''") + "'::jsonb"
    setup = sql(headers + f"SELECT editor_cloud_save('{project}',{quoted(base)},0,'{uuid.uuid4()}'); SELECT editor_cloud_draft_open('{owner}','{project}','{client}');")
    writer = json.loads(setup.splitlines()[-1])['writerId']
    control_name, save_name, draft_name = [f'checkpoint-race-{kind}-{order}' for kind in ['barrier', 'saved', 'live']]
    control = start(control_name, f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('editor-cloud:{owner}',0)); SELECT pg_sleep(4); COMMIT;")
    processes = []
    try:
        deadline = time.monotonic() + 3
        while sql(f"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='{control_name}' AND wait_event='PgSleep');") != 't':
            assert control.poll() is None and time.monotonic() < deadline, 'Fixture barrier did not acquire the owner lock'
            time.sleep(.05)
        calls = [
            ('save', save_name, headers + f"SELECT editor_cloud_checkpoint_save('{owner}','{project}',{quoted(saved)},1,0,'{save_nonce}');"),
            ('draft', draft_name, headers + f"SELECT editor_cloud_draft_save('{owner}','{project}','{writer}',1,{quoted(live)},0,1,'{draft_nonce}');"),
        ]
        if order == 'draft-first': calls.reverse()
        processes = [(kind, start(name, query)) for kind, name, query in calls]
        deadline = time.monotonic() + 3
        while sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name IN ('{save_name}','{draft_name}') AND wait_event_type='Lock' AND wait_event='advisory';") != '2':
            assert control.poll() is None and all(process.poll() is None for _, process in processes) and time.monotonic() < deadline, 'Both mutations must wait for the same owner lock'
            time.sleep(.05)
        control.communicate(timeout=8); assert control.returncode == 0
        outcomes = {}
        for kind, process in processes:
            output, error = process.communicate(timeout=12)
            outcomes[kind] = (process.returncode, output, error)
        winners = [kind for kind, result in outcomes.items() if result[0] == 0]
        assert len(winners) == 1, outcomes
        for kind, result in outcomes.items():
            if kind != winners[0]: assert 'PT409' in result[2], result
        checkpoint = json.loads(sql(headers + f"SELECT editor_cloud_draft_load('{owner}','{project}');").splitlines()[-1])
        assert checkpoint['draftRevision'] == 1
        if winners[0] == 'save':
            assert checkpoint['headRevision'] == checkpoint['anchorRevision'] == 2 and checkpoint['document'] == saved
            repeated = json.loads(sql(calls[next(i for i, call in enumerate(calls) if call[0] == 'save')][2]).splitlines()[-1])
            assert repeated['revision'] == 2 and repeated['draftRevision'] == 1
        else:
            assert checkpoint['headRevision'] == checkpoint['anchorRevision'] == 1 and checkpoint['document'] == live
            merged = json.loads(json.dumps(live)); merged['snapshot']['title'] = saved['snapshot']['title']
            result = json.loads(sql(headers + f"SELECT editor_cloud_checkpoint_save('{owner}','{project}',{quoted(merged)},1,1,'{uuid.uuid4()}');").splitlines()[-1])
            assert result['revision'] == result['draftRevision'] == 2
            checkpoint = json.loads(sql(headers + f"SELECT editor_cloud_draft_load('{owner}','{project}');").splitlines()[-1])
            assert checkpoint['document'] == merged
        assert sql(f"SELECT count(*) FROM editor_cloud_revisions WHERE wallet_address='{owner}' AND project_id='{project}';") == '2'
    finally:
        for process in [control, *[process for _, process in processes]]:
            if process.poll() is None: process.kill(); process.communicate(timeout=5)
        sql(f"DELETE FROM editor_cloud_projects WHERE wallet_address='{owner}' AND id='{project}';")
print('Concurrent permanent Save and mutable draft: both contend on the owner lock, one checkpoint wins, exact replay and merged recovery passed')
