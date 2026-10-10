import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
from fastapi import HTTPException
import access
from media_host import upload


class HostingTests(unittest.TestCase):
    def test_provider_link_is_private_to_one_file_and_expires(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(access, 'DATA', Path(directory)), patch.dict(os.environ, {'MABOROSHI_MEDIA_SECRET': 's' * 40}):
            path = Path(directory) / 'runs' / ('a' * 32) / 'input.mp4'
            path.parent.mkdir(parents=True)
            path.write_bytes(b'video')
            parsed = urlparse(upload(path))
            self.assertEqual(parsed.netloc, 'live.dehub.io')
            query = parse_qs(parsed.query)
            relative = 'a' * 32 + '/input.mp4'
            expires = int(query['expires'][0])
            sig = query['signature'][0]
            self.assertEqual(access.resolve_media(relative, expires, sig), path)
            for file, expiry, signature in [(relative, expires, 'bad'), (relative, 1, sig), ('../private.env', expires, sig), (relative, expires + 1, sig)]:
                with self.assertRaises(HTTPException):
                    access.resolve_media(file, expiry, signature)

    def test_cannot_sign_outside_job_storage(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(access, 'DATA', Path(directory)):
            with self.assertRaises(ValueError):
                upload(Path(directory) / 'provider-settings.json')
