import json
import math
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import av
from fastapi import HTTPException
from fastapi.testclient import TestClient

import access
import kie_bridge
import mask_review
import server
from providers import ProviderFailed
from test_remake import fixture

WALLET = '0x' + '1' * 40
IDENT = 'c' * 32


class KieTariffTests(unittest.TestCase):
    def test_one_pass_tariffs_cover_input_plus_output_and_keep_a_margin(self):
        for renderer, cost in (('wan', 80000), ('seedance-direct', 190000)):
            for seconds in (3, 5, 10, 14.1, 15):
                row = {'renderer': renderer, 'seconds': seconds, 'reference_seconds': 0}
                quote = access.price(row, 'draft')
                output = max(4 if renderer == 'seedance-direct' else 2, math.ceil(seconds))
                self.assertGreaterEqual(quote * .75, (seconds + output) * cost)
            for stage in ('prepare', 'hd'):
                with self.assertRaises(HTTPException): access.price(row, stage)
            for seconds in (2.9, 15.01):
                with self.assertRaises(HTTPException): access.price({**row, 'seconds': seconds}, 'draft')
        self.assertEqual(access.price({'renderer': 'wan', 'seconds': 10, 'reference_seconds': 0}, 'draft'), 2450000)
        self.assertEqual(access.price({'renderer': 'seedance-direct', 'seconds': 10, 'reference_seconds': 0}, 'draft'), 5550000)
        with patch.dict(os.environ, {'MABOROSHI_WAN_MICROS_PER_SECOND': '200000'}):
            with self.assertRaises(HTTPException): access.price({'renderer': 'wan', 'seconds': 10, 'reference_seconds': 0}, 'draft')


class KieBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        fixture(self.folder / 'upload.mp4')

    def test_provider_input_fits_reference_video_limits(self):
        seconds = kie_bridge.provider_input(self.folder / 'upload.mp4', self.folder / 'kie-input.mp4')
        self.assertAlmostEqual(seconds, 6, delta=.1)
        with av.open(str(self.folder / 'kie-input.mp4')) as media:
            stream = media.streams.video[0]
            self.assertTrue(409600 <= stream.width * stream.height <= 927408)
            self.assertFalse(media.streams.audio)

    def test_submission_sends_one_fixed_task_and_is_never_repeated(self):
        with patch('kie_bridge.require_approved'), patch('kie_bridge.upload', return_value='https://example.org/input'), \
             patch('kie_bridge.call', side_effect=TimeoutError('uncertain')) as call:
            with self.assertRaises(TimeoutError): kie_bridge.submit(self.folder, 'Replace person', 'reference.png', renderer='wan')
            self.assertEqual(call.call_args.args, ('kie',))
            self.assertEqual(call.call_args.kwargs['model'], 'wan')
            self.assertEqual(call.call_args.kwargs['input']['duration'], 6)
            with self.assertRaises(ValueError): kie_bridge.submit(self.folder, 'Replace person', 'reference.png', renderer='wan')
            call.assert_called_once()

    def test_longer_render_is_fitted_and_gets_the_original_audio(self):
        longer = self.folder / 'longer.mp4'
        fixture(longer)
        (self.folder / 'source.mp4').write_bytes((self.folder / 'upload.mp4').read_bytes())
        with av.open(str(longer)) as media:
            frames = sum(1 for _ in media.decode(video=0))
        self.assertEqual(frames, 144)
        fitted = kie_bridge.fit_duration(longer, self.folder / 'upload.mp4', self.folder / 'fitted.mp4')
        with av.open(str(fitted)) as media:
            self.assertEqual(sum(1 for _ in media.decode(video=0)), 144)
        with patch('kie_bridge.call', return_value={'status': 'COMPLETED', 'result': 'https://example.org/r.mp4'}), \
             patch('kie_bridge.requests.get', return_value=Mock(content=longer.read_bytes())):
            kie_bridge.wait_and_finish(self.folder, 'task')
        with av.open(str(self.folder / 'final-preview.mp4')) as media:
            self.assertTrue(media.streams.audio)

    def test_failed_task_is_reported_as_unbilled(self):
        with patch('kie_bridge.call', return_value={'status': 'FAILED'}):
            with self.assertRaises(ProviderFailed): kie_bridge.wait_and_finish(self.folder, 'task')


class KieHostedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        for patcher in (patch.object(access, 'DATA', Path(self.temp.name)), patch('providers.ready', return_value=True),
                        patch.dict(os.environ, {'MABOROSHI_MEDIA_SECRET': 's' * 40, 'INTERNAL_SERVICE_SECRET': 'test',
                                                'MABOROSHI_PREPARE_MICROS': '1000000', 'MABOROSHI_DRAFT_MICROS_PER_SECOND': '160000',
                                                'MABOROSHI_HD_MICROS_PER_SECOND': '850000'})):
            patcher.start(); self.addCleanup(patcher.stop)
        server.app.dependency_overrides[server.owner] = lambda: WALLET
        self.addCleanup(server.app.dependency_overrides.clear)
        self.client = TestClient(server.app)
        with access.database() as db:
            db.execute('INSERT INTO jobs (id,wallet,created,state,stage,status,mode,subject,seconds,renderer,reference) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                (IDENT, WALLET, int(time.time()), 'prepared', '', 'Saved', 'depth', 'person', 10, 'wan', 'reference.png'))
        self.folder = access.DATA / 'runs' / IDENT
        self.folder.mkdir(parents=True)
        (self.folder / 'upload.mp4').write_bytes(b'test')
        (self.folder / 'seedance-input.mp4').write_bytes(b'test')
        (self.folder / 'workflow-mode.json').write_text('{"mode":"one_pass"}')
        mask_review.review(self.folder, True, 'Reviewed source', mask_review.fingerprint(self.folder))

    def test_wan_has_one_render_quote_and_no_preparation_or_hd(self):
        quote = self.client.get(f'/jobs/{IDENT}/checkout/draft')
        self.assertEqual(quote.status_code, 200)
        self.assertEqual((quote.json()['renderer'], quote.json()['price_micros']), ('wan', 2450000))
        self.assertEqual(set(self.client.get(f'/jobs/{IDENT}').json()['quotes']), {'draft'})
        for stage in ('prepare', 'hd'):
            self.assertEqual(self.client.get(f'/jobs/{IDENT}/checkout/{stage}').status_code, 400)

    def test_failed_provider_render_is_refunded_but_uncertain_one_is_kept(self):
        with patch('kie_bridge.submit', return_value='task'), patch('kie_bridge.wait_and_finish', side_effect=ProviderFailed('x')), \
             patch('access.refund', return_value=True) as refund:
            (self.folder / 'submission-attempted.json').write_text('{}')
            server.run_stage(IDENT, 'draft')
            refund.assert_called_once_with(IDENT, 'draft')
            self.assertEqual(access.job(IDENT)['state'], 'failed')
        access.update(IDENT, state='prepared')
        with patch('kie_bridge.submit', return_value='task'), patch('kie_bridge.wait_and_finish', side_effect=TimeoutError('x')), \
             patch('access.refund') as refund:
            server.run_stage(IDENT, 'draft')
            refund.assert_not_called()
            self.assertEqual(access.job(IDENT)['state'], 'attention')


if __name__ == '__main__':
    unittest.main()
