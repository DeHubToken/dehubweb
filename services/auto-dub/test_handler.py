"""Exercise timing and voice isolation without downloading speech weights."""
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import numpy as np

sys.modules.setdefault('torch', MagicMock())
import handler


class DubTests(unittest.TestCase):
    def test_original_audio_never_enters_dub_track(self):
        original = np.full(handler.SR * 5, 0.8, dtype=np.float32)
        lines = [{'start': 1, 'end': 2, 'text': 'Hello', 'speaker': 'a'}]
        with patch.object(handler, 'synth', return_value=np.full(handler.SR, 0.25, dtype=np.float32)):
            speech, spoken = handler.render(original, lines, {'a': 'speaker.wav'}, 'en', '')
        self.assertEqual(spoken, 1)
        self.assertTrue(np.all(speech[:handler.SR] == 0))
        self.assertTrue(np.all(speech[2 * handler.SR:] == 0))
        self.assertAlmostEqual(float(speech[handler.SR]), 0.25)

    def test_each_speaker_uses_their_own_reference(self):
        lines = [{'start': 0, 'end': 1, 'text': 'Hi', 'speaker': 'a'}, {'start': 2, 'end': 3, 'text': 'Hi', 'speaker': 'b'}]
        with patch.object(handler, 'synth', return_value=np.zeros(100)) as synth:
            handler.render(np.zeros(handler.SR * 4), lines, {'a': 'a.wav', 'b': 'b.wav'}, 'es', '')
        self.assertEqual([call.args[1] for call in synth.call_args_list], ['a.wav', 'b.wav'])

    def test_insufficient_attributable_speech_uses_stock(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, voice = handler.build_reference(np.ones(handler.SR * 20), [{'start': 1, 'end': 2}], tmp)
        self.assertIsNone(path)
        self.assertEqual(voice, 'stock')

    def test_short_lines_do_not_merge_across_speakers(self):
        lines = [{'start': 0, 'end': 1, 'text': 'one', 'speaker': 'a'}, {'start': 1.1, 'end': 2, 'text': 'two', 'speaker': 'b'}]
        self.assertEqual(len(handler.merge_lines(lines)), 2)

    def test_callback_identifies_the_attempt(self):
        job = {'callbackUrl': 'https://example.test/callback', 'dubId': 'dub', 'jobId': 'attempt', 'secret': 'test'}
        with patch.object(handler.requests, 'post', return_value=MagicMock(ok=True)) as post:
            handler.report(job, {'ok': True, 'path': 'dub/attempt.m4a'})
        self.assertEqual(post.call_args.kwargs['json']['jobId'], 'attempt')


if __name__ == '__main__':
    unittest.main()
