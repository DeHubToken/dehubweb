"""A delayed request with an older transaction timestamp cannot cross a fence."""
import json,os,subprocess,time,uuid

assert os.environ.get('PGDATABASE')=='cloud_test' and os.environ.get('PGHOST')=='localhost', 'Use only the hosted fixture database'
owner='0x9999999999999999999999999999999999999999'
project=str(uuid.uuid4());client=str(uuid.uuid4());nonce=str(uuid.uuid4())
document={'version':1,'snapshot':{'id':project,'title':'Older transaction','updatedAt':1,
    'settings':{'width':640,'height':360,'fps':30},'tracks':[{'id':'v','kind':'video','name':'Video','hidden':False,'muted':False}],'clips':[]},'media':[]}
payload=json.dumps(document,separators=(',',':')).replace("'","''")
headers=f"SET ROLE anon; SELECT cloud_test_headers('{owner}');"
def sql(value):
    result=subprocess.run(['psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-c',value],capture_output=True,text=True,timeout=20)
    if result.returncode:raise RuntimeError(result.stderr[-2000:])
    return result.stdout.strip()
setup=sql(headers+f"SELECT editor_cloud_save('{project}','{payload}'::jsonb,0,'{uuid.uuid4()}'); SELECT editor_cloud_draft_open('{owner}','{project}','{client}');")
writer=json.loads(setup.splitlines()[-1])['writerId']
args=f"'{owner}','{project}','{writer}',1,'{payload}'::jsonb,0,1,'{nonce}'"
process_env=dict(os.environ);process_env['PGAPPNAME']='editor-draft-fence-older-request'
older=subprocess.Popen(['psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',
    'BEGIN;'+headers+f"SELECT pg_sleep(8); SELECT editor_cloud_draft_save({args}); COMMIT;"],
    env=process_env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    deadline=time.monotonic()+6
    while True:
        sleeping=sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='editor-draft-fence-older-request' AND xact_start IS NOT NULL AND wait_event='PgSleep');")
        if sleeping=='t':break
        assert older.poll() is None and time.monotonic()<deadline,'Older transaction did not start its bounded sleep'
        time.sleep(.1)
    result=json.loads(sql(headers+f"SELECT editor_cloud_draft_resolve({args});").splitlines()[-1]);assert result['status']=='fenced',result
    _output,error=older.communicate(timeout=12)
    assert older.returncode and '42501' in error,'Delayed original request crossed the fence'
    assert sql(f"SELECT expires_at='-infinity'::timestamptz FROM editor_cloud_draft_clients WHERE writer_id='{writer}';")=='t'
    assert sql(f"SELECT count(*) FROM editor_cloud_drafts WHERE owner_wallet='{owner}' AND project_id='{project}';")=='0'
    print('Older transaction timestamp, explicit fencing and delayed original rejection passed')
finally:
    if older.poll() is None:older.kill();older.communicate(timeout=5)
    sql(f"DELETE FROM editor_cloud_projects WHERE wallet_address='{owner}' AND id='{project}';")
