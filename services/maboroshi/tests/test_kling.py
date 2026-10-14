import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException
import access
import kling_bridge
import mask_review


class KlingTests(unittest.TestCase):
    def test_tariff_covers_provider_processing_and_margin(self):
        with patch.dict(os.environ, {'MABOROSHI_KLING_MICROS_PER_SECOND': '280000', 'MABOROSHI_KLING_OVERHEAD_MICROS': '350000'}):
            for seconds in (3, 5, 10, 14.1, 15):
                row = {'renderer': 'kling', 'seconds': seconds, 'reference_seconds': 0}
                quote = access.price(row, 'draft')
                self.assertGreaterEqual((quote - 350000) * .7, __import__('math').ceil(seconds) * 168000)
            self.assertEqual(access.price({'renderer': 'kling', 'seconds': 10, 'reference_seconds': 0}, 'draft'), 3150000)
            for stage in ('prepare', 'hd'):
                with self.assertRaises(HTTPException): access.price(row, stage)
            for seconds in (2.9, 15.01):
                with self.assertRaises(HTTPException): access.price({**row, 'seconds': seconds}, 'draft')
            with self.assertRaises(HTTPException): access.price({**row, 'reference_seconds': 3}, 'draft')
        with patch.dict(os.environ, {'MABOROSHI_KLING_MICROS_PER_SECOND': '168000'}):
            with self.assertRaises(HTTPException): access.price(row, 'draft')

    def test_review_binds_kling_to_the_exact_original(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'workflow-mode.json').write_text('{"mode":"kling"}')
            for name in ('upload.mp4', 'seedance-input.mp4'): (folder / name).write_bytes(b'original')
            mask_review.review(folder, True, 'Reviewed', mask_review.fingerprint(folder))
            self.assertTrue(mask_review.state(folder)['approved'])
            (folder / 'upload.mp4').write_bytes(b'changed')
            self.assertFalse(mask_review.state(folder)['approved'])

    def test_one_pass_preserves_audio_and_uncertain_submission_is_not_repeated(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            with patch('kling_bridge.require_approved'), patch('kling_bridge.upload', return_value='https://example.org/input'), \
                 patch('kling_bridge.call', side_effect=TimeoutError('uncertain')) as call:
                with self.assertRaises(TimeoutError): kling_bridge.submit(folder, 'Replace person', 'reference.png')
                self.assertTrue(call.call_args.kwargs['input']['keep_audio'])
                self.assertEqual(call.call_args.args, ('kling',))
                with self.assertRaises(ValueError): kling_bridge.submit(folder, 'Replace person', 'reference.png')
                call.assert_called_once()

    def test_completed_result_restores_full_original_audio_without_hd(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'seedance-response.json').write_text(json.dumps({'requestId': 'id', 'status_url': 'status', 'response_url': 'result'}))
            response = Mock(content=b'video')
            with patch('kling_bridge.call', return_value={'status': 'COMPLETED', 'result': 'https://example.org/result.mp4'}) as call, \
                 patch('kling_bridge.requests.get', return_value=response), patch('kling_bridge.finish_preview') as finish:
                kling_bridge.wait_and_finish(folder, 'id')
                finish.assert_called_once_with(folder / 'kling-result.mp4', folder)
                self.assertEqual(call.call_args.args, ('status',))
