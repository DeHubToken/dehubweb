import io
import json
import math
import struct
import unittest
import wave
from unittest.mock import MagicMock, patch

import recordings


class RecordingTests(unittest.TestCase):
    def test_converts_the_entire_audio_to_indexed_aac(self):
        source = io.BytesIO()
        with wave.open(source, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(b''.join(struct.pack('<h', int(2000 * math.sin(i / 20))) for i in range(48000)))
        response = MagicMock()
        response.__enter__.return_value = response
        response.iter_content.return_value = [source.getvalue()]
        uploads = []

        def upload(_url, data, **_kwargs):
            uploads.append(data.read())
            return MagicMock()

        with patch.object(recordings.requests, 'get', return_value=response), patch.object(recordings.requests, 'put', side_effect=upload):
            result = recordings.convert({'sourceUrl': 'https://media.test/source.webm', 'uploadUrl': 'https://media.test/upload'})
        self.assertTrue(result['ok'])
        self.assertAlmostEqual(result['durationSeconds'], 2, delta=0.1)
        self.assertIn(b'ftyp', uploads[0][:32])
        self.assertLess(uploads[0].index(b'moov'), uploads[0].index(b'mdat'))

    def test_rejects_non_https_urls(self):
        with self.assertRaises(ValueError):
            recordings.convert({'sourceUrl': 'file:///etc/passwd', 'uploadUrl': 'https://media.test/upload'})
