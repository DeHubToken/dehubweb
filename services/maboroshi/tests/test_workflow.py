import unittest,tempfile,json,time
from pathlib import Path
from unittest.mock import patch,Mock
import mask_review,seedance_bridge

class WorkflowTests(unittest.TestCase):
 def test_mask_changed_invalidates_approval(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)
   for name in mask_review.FILES:(p/name).write_bytes(b'original')
   fingerprint=mask_review.fingerprint(p)
   mask_review.review(p,True,'Entire clip reviewed',fingerprint)
   mask_review.require_approved(p)
   (p/'mask.mp4').write_bytes(b'changed')
   with self.assertRaises(ValueError):mask_review.require_approved(p)
   with self.assertRaises(ValueError):mask_review.review(p,True,'stale',fingerprint)
 def test_existing_submission_not_requeued(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'seedance-response.json').write_text('{}')
   with patch('mask_review.require_approved'),patch('seedance_bridge.call') as post:
    with self.assertRaises(ValueError):seedance_bridge.submit(p,'prompt','reference.png')
    post.assert_not_called()
 def test_edit_draft_self_contained(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'audio-manifest.json').write_text('{}');(p/'seedance-input.mp4').write_bytes(b'approved input')
   response={'requestId':'fake-id','provider':'fal'}
   with patch('mask_review.require_approved'),patch('seedance_bridge.upload',return_value='https://example.org/media'),patch('seedance_bridge.call',return_value=response) as post:
    seedance_bridge.submit(p,'Replace one subject','reference.png')
    payload=post.call_args.kwargs['input']
    self.assertTrue(payload['draft']);self.assertEqual(payload['task'],'editing');self.assertEqual(payload['resolution'],'480p');self.assertEqual(len(payload['video_urls']),1)
    self.assertTrue((p/'generation.json').exists())
 def test_collection_downloads_and_restores(self):
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/'seedance-response.json').write_text(json.dumps({'provider':'fal','status_url':'https://example.org/status','response_url':'https://example.org/result'}))
   response={'status':'COMPLETED','result':'https://example.org/result.mp4','draft_id':'completion-id'}
   media=Mock();media.content=b'video'
   with patch('seedance_bridge.call',return_value=response),patch('seedance_bridge.requests.get',return_value=media),patch('seedance_bridge.finish_preview') as restore:
    seedance_bridge.wait_and_finish(d,'fake-id')
    self.assertEqual((Path(d)/'seedance-result.mp4').read_bytes(),b'video');restore.assert_called_once()
    self.assertEqual(json.loads((Path(d)/'draft.json').read_text())['draft_id'],'completion-id')
 def test_hd_only_reuses_draft(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)
   for name in ['upload.mp4','final-preview.mp4']:(p/name).write_bytes(b'test')
   (p/'generation.json').write_text(json.dumps({'request_id':'draft'}))
   (p/'seedance-request.json').write_text(json.dumps({'draft':True}))
   (p/'draft.json').write_text(json.dumps({'draft_id':'completion-id','completed_at':time.time()}))
   response={'requestId':'hd-id'}
   with patch('seedance_bridge.call',return_value=response) as post:
    self.assertEqual(seedance_bridge.submit_hd(p),'hd-id')
    post.assert_called_once_with('hd',draft_id='completion-id')
    with self.assertRaises(ValueError):seedance_bridge.submit_hd(p)

if __name__=='__main__':unittest.main()
