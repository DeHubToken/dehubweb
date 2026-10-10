import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
import access
import mask_review
import seedance_bridge
import server

WALLET = '0x' + '1' * 40
OTHER = '0x' + '2' * 40
IDENT = 'a' * 32


class HostedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.patch_data = patch.object(access, 'DATA', Path(self.temp.name))
        self.patch_data.start(); self.addCleanup(self.patch_data.stop)
        self.env = patch.dict(os.environ, {
            'MABOROSHI_MEDIA_SECRET': 's' * 40, 'REPLICATE_API_TOKEN': 'test', 'ENHANCOR_API_KEY': 'test',
            'INTERNAL_SERVICE_SECRET': 'test', 'MABOROSHI_PREPARE_MICROS': '1000000',
            'MABOROSHI_DRAFT_MICROS_PER_SECOND': '500000', 'MABOROSHI_HD_MICROS_PER_SECOND': '1000000',
        })
        self.env.start(); self.addCleanup(self.env.stop)
        server.app.dependency_overrides[server.owner] = lambda: WALLET
        self.addCleanup(server.app.dependency_overrides.clear)
        self.client = TestClient(server.app)
        with access.database() as db:
            db.execute('INSERT INTO jobs (id,wallet,created,state,stage,status,mode,subject,seconds) VALUES (?,?,?,?,?,?,?,?,?)',
                (IDENT, WALLET, int(time.time()), 'uploaded', '', 'Saved', 'depth', 'person', 5))
        self.folder = access.DATA / 'runs' / IDENT
        self.folder.mkdir(parents=True)
        (self.folder / 'upload.mp4').write_bytes(b'test')

    def test_other_account_cannot_read_or_spend_on_job(self):
        server.app.dependency_overrides[server.owner] = lambda: OTHER
        self.assertEqual(self.client.get(f'/jobs/{IDENT}').status_code, 404)
        self.assertEqual(self.client.get('/jobs').json()['jobs'], [])
        with patch('access.debit') as debit:
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/prepare', data={'price_micros': 1000000}).status_code, 404)
            debit.assert_not_called()

    def test_client_must_accept_current_quote_and_double_click_is_idempotent(self):
        with patch('access.debit') as debit, patch.object(server.executor, 'submit') as submit:
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/prepare', data={'price_micros': 1}).status_code, 409)
            debit.assert_not_called()
            for _ in range(2):
                self.assertEqual(self.client.post(f'/jobs/{IDENT}/prepare', data={'price_micros': 1000000}).status_code, 200)
            debit.assert_called_once(); submit.assert_called_once()

    def test_missing_configuration_never_charges(self):
        with patch.dict(os.environ, {'ENHANCOR_API_KEY': ''}), patch('access.debit') as debit:
            self.assertFalse(self.client.get('/health').json()['ready'])
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/prepare', data={'price_micros': 1000000}).status_code, 503)
            debit.assert_not_called()

    def test_draft_requires_exact_input_review_and_reference(self):
        access.update(IDENT, state='prepared')
        for name in mask_review.FILES:
            (self.folder / name).write_bytes(b'prepared')
        with patch('access.debit') as debit:
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/draft', data={'price_micros': 2500000}).status_code, 409)
            fingerprint = mask_review.fingerprint(self.folder)
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/review', data={'approved': 'true', 'fingerprint': fingerprint}).status_code, 200)
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/draft', data={'price_micros': 2500000}).status_code, 400)
            access.update(IDENT, reference='reference.png')
            (self.folder / 'seedance-input.mp4').write_bytes(b'changed audio')
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/draft', data={'price_micros': 2500000}).status_code, 409)
            debit.assert_not_called()

    def test_hd_requires_completed_draft(self):
        with patch('access.debit') as debit:
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/hd', data={'price_micros': 5000000}).status_code, 409)
            debit.assert_not_called()

    def test_video_reference_included_in_quote(self):
        row = access.job(IDENT)
        row['reference_seconds'] = 3.2
        self.assertEqual(access.price(row, 'draft'), 4500000)

    def test_verified_session_identity_is_required(self):
        server.app.dependency_overrides.clear()
        self.assertEqual(self.client.get('/jobs').status_code, 401)
        response = Mock(status_code=401)
        with patch('access.requests.get', return_value=response):
            self.assertEqual(self.client.get('/jobs', headers={'x-dehub-token': 'fake', 'x-wallet-address': WALLET}).status_code, 401)

    def test_uncertain_provider_submission_cannot_be_repeated(self):
        (self.folder / 'audio-manifest.json').write_text('{}')
        (self.folder / 'seedance-input.mp4').write_bytes(b'prepared')
        with patch('mask_review.require_approved'), patch('seedance_bridge.credential', return_value='test'), \
             patch('seedance_bridge.setting', return_value='https://example.org'), \
             patch('seedance_bridge.upload', return_value='https://example.org/input'), \
             patch('seedance_bridge.requests.post', side_effect=TimeoutError('unknown outcome')) as post:
            with self.assertRaises(TimeoutError): seedance_bridge.submit(self.folder, 'prompt', 'reference.png')
            with self.assertRaises(ValueError): seedance_bridge.submit(self.folder, 'prompt', 'reference.png')
            post.assert_called_once()

    def test_setup_token_is_single_use_and_never_returned(self):
        with patch.object(access, 'SETTINGS', access.DATA / 'provider-settings.json'), patch.dict(os.environ, {
            'MABOROSHI_SETUP_TOKEN': 'setup-test', 'MABOROSHI_SETUP_EXPIRES': str(int(time.time()) + 60),
        }):
            data = {'replicate': 'r' * 30, 'enhancor': 'e' * 30}
            self.assertEqual(self.client.post('/configure', data=data).status_code, 403)
            result = self.client.post('/configure', data=data, headers={'x-setup-token': 'setup-test'})
            self.assertEqual(result.status_code, 200)
            self.assertNotIn('r' * 30, result.text)
            self.assertEqual(self.client.post('/configure', data=data, headers={'x-setup-token': 'setup-test'}).status_code, 403)


if __name__ == '__main__':
    unittest.main()
