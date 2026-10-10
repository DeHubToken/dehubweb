import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import providers


class ProviderTests(unittest.TestCase):
    def test_preparation_recovers_saved_prediction_without_resubmitting(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'audio-prediction.json').write_text(json.dumps({'id': 'original', 'status': 'processing'}))
            with patch('providers.time.sleep'), patch('providers.call', return_value={'id': 'original', 'status': 'succeeded', 'output': {}}) as call:
                providers.prediction('audio', folder / 'audio.wav', folder)
                call.assert_called_once_with('prediction', request_id='original')

    def test_uncertain_preparation_never_submits_again(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'audio-attempted.json').write_text('{}')
            with patch('providers.call') as call:
                with self.assertRaises(ValueError):
                    providers.prediction('audio', folder / 'audio.wav', folder)
                call.assert_not_called()
