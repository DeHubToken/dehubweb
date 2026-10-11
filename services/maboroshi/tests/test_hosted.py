import os
import io
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import requests
from fastapi.testclient import TestClient
from PIL import Image
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
            'MABOROSHI_MEDIA_SECRET': 's' * 40,
            'INTERNAL_SERVICE_SECRET': 'test', 'MABOROSHI_PREPARE_MICROS': '1000000',
            'MABOROSHI_DRAFT_MICROS_PER_SECOND': '500000', 'MABOROSHI_HD_MICROS_PER_SECOND': '1000000',
        })
        self.env.start(); self.addCleanup(self.env.stop)
        self.provider = patch('providers.ready', return_value=True)
        self.provider.start(); self.addCleanup(self.provider.stop)
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
        with patch('providers.ready', return_value=False), patch('access.debit') as debit:
            self.assertFalse(self.client.get('/health').json()['ready'])
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/prepare', data={'price_micros': 1000000}).status_code, 503)
            debit.assert_not_called()

    def test_draft_requires_exact_input_review_and_reference(self):
        access.update(IDENT, state='prepared')
        for name in mask_review.FILES:
            (self.folder / name).write_bytes(b'prepared')
        with patch('access.debit') as debit:
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/draft', data={'price_micros': 5000000}).status_code, 409)
            fingerprint = mask_review.fingerprint(self.folder)
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/review', data={'approved': 'true', 'fingerprint': fingerprint}).status_code, 200)
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/draft', data={'price_micros': 5000000}).status_code, 400)
            access.update(IDENT, reference='reference.png')
            (self.folder / 'seedance-input.mp4').write_bytes(b'changed audio')
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/draft', data={'price_micros': 5000000}).status_code, 409)
            debit.assert_not_called()

    def test_hd_requires_completed_draft(self):
        with patch('access.debit') as debit:
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/hd', data={'price_micros': 5000000}).status_code, 409)
            debit.assert_not_called()

    def test_video_reference_included_in_quote(self):
        row = access.job(IDENT)
        row['reference_seconds'] = 3.2
        self.assertEqual(access.price(row, 'draft'), 7000000)

    def test_character_can_be_saved_before_preparation_without_starting_or_charging(self):
        image = io.BytesIO()
        Image.new('RGB', (32, 32), 'blue').save(image, format='PNG')
        with patch('access.debit') as debit, patch.object(server.executor, 'submit') as submit:
            response = self.client.post(f'/jobs/{IDENT}/references', data={'prompt': 'Use this character'},
                files={'reference': ('character.png', image.getvalue(), 'image/png')})
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data['state'], 'uploaded')
            self.assertTrue(data['hasReference'])
            self.assertEqual(data['references']['reference']['kind'], 'image')
            self.assertIn('signature=', data['references']['reference']['url'])
            self.assertEqual(self.client.get(data['references']['reference']['url'].replace(access.PUBLIC, '')).status_code, 200)
            debit.assert_not_called(); submit.assert_not_called()
        server.app.dependency_overrides[server.owner] = lambda: OTHER
        self.assertEqual(self.client.get(f'/jobs/{IDENT}').status_code, 404)

    def test_processing_references_cannot_be_replaced_and_failures_keep_source(self):
        access.update(IDENT, state='running', stage='prepare')
        self.assertEqual(self.client.post(f'/jobs/{IDENT}/references', data={'prompt': 'Changed'}).status_code, 409)
        access.update(IDENT, state='failed')
        self.assertIn('upload.mp4', self.client.get(f'/jobs/{IDENT}').json()['files'])

    def test_verified_session_identity_is_required(self):
        server.app.dependency_overrides.clear()
        self.assertEqual(self.client.get('/jobs').status_code, 401)
        response = Mock(status_code=401)
        with patch('access.requests.get', return_value=response):
            self.assertEqual(self.client.get('/jobs', headers={'x-dehub-token': 'fake', 'x-wallet-address': WALLET}).status_code, 401)

    def test_uncertain_provider_submission_cannot_be_repeated(self):
        (self.folder / 'audio-manifest.json').write_text('{}')
        (self.folder / 'seedance-input.mp4').write_bytes(b'prepared')
        with patch('mask_review.require_approved'), \
             patch('seedance_bridge.upload', return_value='https://example.org/input'), \
             patch('seedance_bridge.call', side_effect=TimeoutError('unknown outcome')) as post:
            with self.assertRaises(TimeoutError): seedance_bridge.submit(self.folder, 'prompt', 'reference.png')
            with self.assertRaises(ValueError): seedance_bridge.submit(self.folder, 'prompt', 'reference.png')
            post.assert_called_once()

    def test_no_customer_key_setup_or_configuration(self):
        result = self.client.get('/setup', follow_redirects=False)
        self.assertEqual(result.status_code, 308)
        self.assertEqual(result.headers['location'], 'https://dehub.io/creator/maboroshi')
        self.assertEqual(self.client.post('/configure', data={'replicate': 'test'}).status_code, 404)
        self.assertEqual(self.client.get('/static/setup.html').status_code, 404)

    def test_checkout_identifies_the_authenticated_wallet_without_charging(self):
        with patch('access.debit') as debit:
            self.assertEqual(self.client.get('/session').json(), {'wallet': WALLET})
            quote = self.client.get(f'/jobs/{IDENT}/checkout/prepare').json()
            self.assertEqual(quote['wallet'], WALLET)
            self.assertEqual(quote['price_micros'], 1000000)
            self.assertIsNone(quote['payment_ref'])
            debit.assert_not_called()

    def test_transfer_payment_retries_keep_the_same_receipt_and_never_debit_credits(self):
        tx_hash = '0x' + '4' * 64
        row = access.job(IDENT)
        with patch('access.requests.post', side_effect=requests.Timeout) as post:
            with self.assertRaises(Exception): access.debit(row, 'prepare', 1000000, tx_hash)
            self.assertIn('maboroshi-provider', post.call_args.args[0])
        self.assertEqual(self.client.get(f'/jobs/{IDENT}/checkout/prepare').json()['payment_ref'], tx_hash)
        with patch('access.requests.post') as post:
            with self.assertRaises(Exception): access.debit(row, 'prepare', 1000000, 'credits')
            post.assert_not_called()
        confirmed = Mock(status_code=200)
        confirmed.json.return_value = {'debited': True}
        with patch('access.requests.post', return_value=confirmed) as post:
            access.debit(row, 'prepare', 1000000, tx_hash)
            self.assertEqual(post.call_args.kwargs['json']['key'], f'maboroshi:{IDENT}:prepare')
            self.assertEqual(post.call_args.kwargs['json']['wallet'], WALLET)

    def test_rejected_payment_can_choose_another_source_and_refund_uses_its_actual_ledger(self):
        row = access.job(IDENT)
        with patch('access.requests.post', return_value=Mock(status_code=402)):
            with self.assertRaises(Exception): access.debit(row, 'prepare', 1000000, 'credits')
        self.assertIsNone(access.payment_reference(row, 'prepare'))
        reply = Mock(status_code=200)
        reply.json.return_value = {'debited': True, 'refunded': True}
        with patch('access.requests.post', return_value=reply) as post:
            access.debit(row, 'prepare', 1000000, '0x' + '4' * 64)
            self.assertTrue(access.refund(IDENT, 'prepare'))
            self.assertEqual(post.call_args.kwargs['json']['operation'], 'payment_refund')

    def test_only_production_web_origin_can_read_checkout_with_session_header(self):
        allowed = self.client.options(f'/jobs/{IDENT}/checkout/prepare', headers={
            'Origin': 'https://dehub.io', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-dehub-token'})
        self.assertEqual(allowed.headers.get('access-control-allow-origin'), 'https://dehub.io')
        denied = self.client.options(f'/jobs/{IDENT}/checkout/prepare', headers={
            'Origin': 'https://evil.test', 'Access-Control-Request-Method': 'GET'})
        self.assertNotIn('access-control-allow-origin', denied.headers)


if __name__ == '__main__':
    unittest.main()
