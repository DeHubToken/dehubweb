import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import stage_server


class StageServerTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(stage_server.app)
        self.env = patch.dict(os.environ, {'DUB_WORKER_SECRET': 'test-only'})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_conversion_requires_worker_authorization(self):
        self.assertEqual(self.client.post('/recordings', json={}).status_code, 403)

    def test_conversion_returns_the_completed_result(self):
        with patch.object(stage_server.recordings, 'convert', return_value={'ok': True, 'durationSeconds': 1207.7}):
            response = self.client.post('/recordings', json={'input': {'sourceUrl': 'https://media.test/source', 'uploadUrl': 'https://media.test/upload'}}, headers={'Authorization': 'Bearer test-only'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['durationSeconds'], 1207.7)

    def test_video_jobs_do_not_enter_the_stage_queue(self):
        response = self.client.post('/jobs', json={'input': {'sourceKind': 'video'}}, headers={'Authorization': 'Bearer test-only'})
        self.assertEqual(response.status_code, 400)
