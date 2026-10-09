"""Run only in hosted CI against its disposable signed-wallet SQL fixture."""
import copy
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request
import uuid

URL="http://localhost:3000"
OWNER="0x"+"a"*40
EDITOR="0x"+"b"*40
OUTSIDER="0x"+"c"*40
PROJECT=str(uuid.uuid4())
DOCUMENT={"version":1,"snapshot":{"id":PROJECT,"title":"HTTP conflict fixture","updatedAt":1,
    "settings":{"width":1920,"height":1080,"fps":30,"background":"#000000","aspectPreset":"16:9"},
    "tracks":[{"id":"text","kind":"text","name":"Text","hidden":False,"muted":False}],
    "clips":[{"id":"caption","trackId":"text","kind":"text","text":"Keep this","start":0,"duration":5,"trimIn":0}]},"media":[]}

def rpc(name,args,wallet=OWNER,status=200,code=None):
    expires=int(time.time())+3600
    unsigned=f"{wallet}.{expires}"
    # The disposable bootstrap key is fixed; this never uses production credentials.
    session=unsigned+"."+hmac.new(bytes.fromhex("11"*32),unsigned.encode(),hashlib.sha256).hexdigest()
    request=urllib.request.Request(URL+"/rpc/"+name,data=json.dumps(args).encode(),method="POST",
        headers={"Content-Type":"application/json","x-wallet-address":wallet,"x-wallet-session":session})
    start=time.monotonic()
    try:
        response=urllib.request.urlopen(request,timeout=5)
    except urllib.error.HTTPError as error:
        response=error
    with response:
        actual=response.status
        value=json.load(response)
    elapsed=time.monotonic()-start
    assert actual==status,(name,actual,value)
    if code is not None:assert value["code"]==code,(name,value)
    assert elapsed<5,(name,elapsed)
    print(json.dumps({"rpc":name,"status":actual,"code":value.get("code") if isinstance(value,dict) else None,"seconds":round(elapsed,3)}))
    return value

deadline=time.monotonic()+60
while True:
    try:
        with urllib.request.urlopen(URL,timeout=2) as response:
            assert "postgrest/14.1" in response.headers.get("Server","").lower(),response.headers.get("Server")
        break
    except urllib.error.URLError:
        if time.monotonic()>deadline:raise
        time.sleep(0.2)

first_nonce=str(uuid.uuid4())
save={"p_id":PROJECT,"p_document":DOCUMENT,"p_expected_revision":0,"p_request_id":first_nonce}
assert rpc("editor_cloud_save",save)["revision"]==1
assert rpc("editor_cloud_save",save)["revision"]==1
rpc("editor_cloud_save",dict(save,p_request_id=str(uuid.uuid4())),status=409,code="PT409")
shared={**save,"p_owner":OWNER,"p_request_id":str(uuid.uuid4())}
rpc("editor_cloud_edit_save",shared,status=409,code="PT409")
rpc("editor_cloud_restore",{"p_id":PROJECT,"p_revision":1,"p_expected_revision":0,"p_request_id":str(uuid.uuid4())},status=409,code="PT409")
rpc("editor_cloud_set_trash",{"p_id":PROJECT,"p_expected_revision":0,"p_expected_state":0,"p_trashed":True},status=409,code="PT409")

share={"p_id":PROJECT,"p_member":EDITOR,"p_role":"editor","p_expected_state":0}
invitation=rpc("editor_cloud_review_share",share)
rpc("editor_cloud_review_share",dict(share,p_role="viewer"),status=409,code="PT409")
accept={"p_owner":OWNER,"p_id":PROJECT,"p_expected_state":invitation["stateVersion"]}
rpc("editor_cloud_review_accept",dict(accept,p_expected_state=99),EDITOR,409,"PT409")
accepted=rpc("editor_cloud_review_accept",accept,EDITOR)
rpc("editor_cloud_edit_save",dict(shared,p_request_id=str(uuid.uuid4())),EDITOR,409,"PT409")
rpc("editor_cloud_review_leave",dict(accept,p_expected_state=99),EDITOR,409,"PT409")
member=rpc("editor_cloud_review_members",{"p_id":PROJECT})[0]
assert member==accepted,(member,accepted)

thread=rpc("editor_cloud_review_comment",{"p_owner":OWNER,"p_id":PROJECT,"p_comment_id":str(uuid.uuid4()),"p_revision":1,"p_time":0,"p_body":"Keep the text"})
rpc("editor_cloud_review_resolve",{"p_owner":OWNER,"p_id":PROJECT,"p_comment_id":thread["id"],"p_expected_state":99,"p_resolved":True},status=409,code="PT409")
assert rpc("editor_cloud_review_comments",{"p_owner":OWNER,"p_id":PROJECT})==[thread]
rpc("editor_cloud_edit_save",dict(shared,p_request_id=str(uuid.uuid4())),OUTSIDER,401,"42501")
assert len(rpc("editor_cloud_history",{"p_id":PROJECT}))==1
assert rpc("editor_cloud_load",{"p_id":PROJECT})["document"]==DOCUMENT

changed=copy.deepcopy(DOCUMENT);changed["snapshot"]["title"]="Fresh shared edit"
fresh={**shared,"p_document":changed,"p_expected_revision":1,"p_request_id":str(uuid.uuid4())}
assert rpc("editor_cloud_edit_save",fresh,EDITOR)["revision"]==2
assert rpc("editor_cloud_edit_save",fresh,EDITOR)["revision"]==2
assert len(rpc("editor_cloud_history",{"p_id":PROJECT}))==2
assert rpc("editor_cloud_load",{"p_id":PROJECT})["document"]==changed
print("PASS: nine stale conflicts returned HTTP 409 promptly; permission denial, immutable head, member/comment state and save idempotency verified")
