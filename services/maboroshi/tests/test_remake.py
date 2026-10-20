import io
import json
import os
import tempfile
import time
import unittest
from fractions import Fraction
from pathlib import Path
from unittest.mock import patch

import av
import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

import access
import mask_review
import remake
import server

WALLET = '0x' + '1' * 40
OTHER = '0x' + '2' * 40
IDENT = 'a' * 32


def fixture(path):
    with av.open(str(path), 'w') as output:
        stream = output.add_stream('libx264', rate=24)
        stream.width, stream.height, stream.pix_fmt = 96, 96, 'yuv420p'
        stream.options = {'crf': '18', 'threads': '1'}
        audio = output.add_stream('aac', rate=44100)
        audio.layout = 'stereo'
        for index in range(144):
            pixels = np.zeros((96, 96, 3), dtype=np.uint8)
            pixels[:, :, index // 48] = 220
            frame = av.VideoFrame.from_ndarray(pixels, format='rgb24')
            frame.pts, frame.time_base = index, Fraction(1, 24)
            for packet in stream.encode(frame): output.mux(packet)
        for packet in stream.encode(): output.mux(packet)
        samples = np.sin(np.arange(44100 * 6) * 2 * np.pi * 440 / 44100).astype(np.float32) * .1
        for index in range(0, len(samples), 1024):
            frame = av.AudioFrame.from_ndarray(np.stack([samples[index:index + 1024]] * 2), format='fltp', layout='stereo')
            frame.sample_rate, frame.pts = 44100, index
            for packet in audio.encode(frame): output.mux(packet)
        for packet in audio.encode(): output.mux(packet)


class RemakeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        task = patch.object(access, 'DATA', Path(self.temp.name)); task.start(); self.addCleanup(task.stop)
        task = patch.dict(os.environ, {'MABOROSHI_MEDIA_SECRET': 's' * 40, 'INTERNAL_SERVICE_SECRET': 'test',
            'MABOROSHI_PREPARE_MICROS': '1000000', 'MABOROSHI_DRAFT_MICROS_PER_SECOND': '160000', 'MABOROSHI_HD_MICROS_PER_SECOND': '850000'})
        task.start(); self.addCleanup(task.stop)
        task = patch('providers.ready', return_value=True); task.start(); self.addCleanup(task.stop)
        with access.database() as db:
            db.execute('INSERT INTO jobs (id,wallet,created,state,stage,status,mode,subject,seconds,renderer,prompt,reference) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                (IDENT, WALLET, int(time.time()), 'prepared', '', 'Saved', 'depth', 'product', 6, 'kling', 'Replace the product with the reference.', 'reference.png'))
        self.folder = access.DATA / 'runs' / IDENT
        self.folder.mkdir(parents=True)
        fixture(self.folder / 'upload.mp4')
        __import__('shutil').copy2(self.folder / 'upload.mp4', self.folder / 'seedance-input.mp4')
        (self.folder / 'workflow-mode.json').write_text('{"mode":"kling"}')
        Image.new('RGB', (96, 96), 'white').save(self.folder / 'reference.png')
        mask_review.review(self.folder, True, 'Reviewed', mask_review.fingerprint(self.folder))
        server.app.dependency_overrides[server.owner] = lambda: WALLET
        self.addCleanup(server.app.dependency_overrides.clear)
        self.client = TestClient(server.app)

    def plan(self, cuts='[2,4]'):
        response = self.client.post(f'/jobs/{IDENT}/remake/plan', data={'cuts': cuts})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_real_cuts_padding_exact_frame_assembly_and_original_audio_packets(self):
        detected = self.client.post(f'/jobs/{IDENT}/remake/scan').json()
        self.assertEqual(detected['cuts'], [2, 4])
        with patch('access.debit') as debit:
            project = self.plan()
            debit.assert_not_called()
        shots = project['remake']['shots']
        self.assertEqual(len(shots), 3)
        for shot in shots:
            self.assertEqual(shot['billableSeconds'], 3)
            self.assertEqual(shot['priceMicros'], 1190000)
            root = access.folder(shot['id'])
            with av.open(str(root / 'upload.mp4')) as video:
                self.assertEqual(sum(1 for _ in video.decode(video=0)), 72)
            remake.finish_shot(root / 'upload.mp4', root)
            access.update(shot['id'], state='complete', stage='draft')
        remake.assemble(access.job(IDENT))
        with av.open(str(self.folder / 'remake-result.mp4')) as video:
            frames = list(video.decode(video=0))
            self.assertEqual(len(frames), 144)
            self.assertEqual([int(frame.to_ndarray(format='rgb24').mean(axis=(0, 1)).argmax()) for frame in (frames[0], frames[48], frames[96])], [0, 1, 2])
        def packets(path):
            with av.open(str(path)) as media:
                return [bytes(packet) for packet in media.demux(audio=0) if packet.dts is not None]
        self.assertEqual(packets(self.folder / 'upload.mp4'), packets(self.folder / 'remake-result.mp4'))

    def test_ownership_payment_isolation_and_duplicate_plan(self):
        project = self.plan()
        self.assertEqual([job['id'] for job in self.client.get('/jobs').json()['jobs']], [IDENT])
        with patch('access.debit') as debit:
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/draft', data={'price_micros': 2030000}).status_code, 409)
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/remake/plan', data={'cuts': '[2,4]'}).status_code, 409)
            debit.assert_not_called()
        server.app.dependency_overrides[server.owner] = lambda: OTHER
        for suffix in ('scan', 'plan', 'assemble', 'collect', 'revise'):
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/remake/{suffix}', data={'shot': 0, 'prompt': 'Revision', 'cuts': '[]'}).status_code, 404)
        self.assertEqual(self.client.get(f'/jobs/{project["remake"]["shots"][0]["id"]}').status_code, 404)

    def test_invalid_cuts_never_create_children_or_charge(self):
        for cuts in ('[4,2]', '[-1]', '[2,2]', '[0.01]', '[6]', '["2"]', '[true]', '[NaN]', '{}', '[1,2,3,4,4.5,5,5.5,5.8]'):
            with patch('access.debit') as debit:
                response = self.client.post(f'/jobs/{IDENT}/remake/plan', data={'cuts': cuts})
                self.assertEqual(response.status_code, 400, (cuts, response.text))
                self.assertFalse((self.folder / 'remake.json').exists())
                debit.assert_not_called()

    def test_revision_keeps_completed_versions_and_does_not_touch_other_shots(self):
        project = self.plan()
        first, second = project['remake']['shots'][:2]
        root = access.folder(first['id'])
        remake.finish_shot(root / 'upload.mp4', root)
        access.update(first['id'], state='complete')
        with patch('access.debit') as debit:
            response = self.client.post(f'/jobs/{IDENT}/remake/revise', data={'shot': 0, 'prompt': 'Make the jacket red.'})
            self.assertEqual(response.status_code, 200, response.text)
            revised = response.json()['remake']['shots']
            self.assertNotEqual(revised[0]['id'], first['id'])
            self.assertEqual(revised[0]['results'][0]['id'], first['id'])
            self.assertEqual(revised[1]['id'], second['id'])
            debit.assert_not_called()
        self.assertEqual(self.client.post(f'/jobs/{IDENT}/remake/assemble').status_code, 409)

    def test_uncertain_submission_only_collects_a_saved_request_without_payment(self):
        first = self.plan()['remake']['shots'][0]
        access.update(first['id'], state='attention', stage='draft')
        (access.folder(first['id']) / 'submission-attempted.json').write_text('{}')
        with patch('access.debit') as debit, patch.object(server.executor, 'submit') as submit:
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/remake/revise', data={'shot': 0, 'prompt': 'Retry'}).status_code, 409)
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/remake/collect', data={'shot': 0}).status_code, 409)
            (access.folder(first['id']) / 'seedance-response.json').write_text('{"requestId":"saved-request"}')
            self.assertEqual(self.client.post(f'/jobs/{IDENT}/remake/collect', data={'shot': 0}).status_code, 200)
            submit.assert_called_once_with(server.run_stage, first['id'], 'draft', True)
            debit.assert_not_called()

    def test_interrupted_plan_resumes_the_saved_cut_list(self):
        original = remake.create_shot
        calls = 0
        def interrupted(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2: raise OSError('Simulated interruption')
            return original(*args, **kwargs)
        with patch('remake.create_shot', side_effect=interrupted):
            with self.assertRaises(OSError): remake.plan(access.job(IDENT), [2, 4])
        first = remake.read(self.folder)['shots'][0]['id']
        self.assertEqual(self.client.post(f'/jobs/{first}/draft', data={'price_micros': 1190000}).status_code, 409)
        project = self.plan()
        self.assertEqual(project['remake']['shots'][0]['id'], first)
        self.assertFalse(project['remake']['building'])
