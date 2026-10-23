"""Speaker assignment, caption lines and the job contract, without weights."""
import time
import unittest
from unittest.mock import MagicMock, patch

import engine
import handler


def word(start, end, text, segment=0):
    return {"start": start, "end": end, "word": text, "segment": segment}


class SegmentTests(unittest.TestCase):
    def test_speaker_change_splits_a_line(self):
        words = [word(0, 0.4, " Hi"), word(0.5, 0.9, " there"), word(1.0, 1.4, " hello")]
        engine.assign_speakers(words, [(0, 0.95, 0), (0.95, 2, 1)])
        segs = engine.build_segments(words)
        self.assertEqual([(s["text"], s["speaker"]) for s in segs], [("Hi there", "speaker_0"), ("hello", "speaker_1")])

    def test_word_between_turns_keeps_a_nearby_speaker(self):
        words = [word(0, 0.5, " a"), word(3.0, 3.2, " b"), word(9, 9.5, " c")]
        engine.assign_speakers(words, [(0, 0.6, 2), (3.5, 4, 1)])
        self.assertEqual([w["speaker"] for w in words], ["speaker_2", "speaker_1", "speaker_1"])

    def test_a_few_stray_seconds_join_the_voice_around_them(self):
        words = [word(i, i + 0.8, " a") for i in range(100)]
        for w in words:
            w["speaker"] = "speaker_0"
        words[40]["speaker"] = "speaker_7"
        words[99]["speaker"] = "speaker_3"
        engine.absorb_minor_speakers(words)
        self.assertEqual({w["speaker"] for w in words}, {"speaker_0"})

    def test_a_real_guest_keeps_their_label(self):
        host = [dict(word(i, i + 0.8, " h"), speaker="speaker_0") for i in range(600)]
        guest = [dict(word(600 + i, 600 + i + 0.8, " g"), speaker="speaker_1") for i in range(25)]
        words = host + guest
        engine.absorb_minor_speakers(words)
        self.assertEqual(words[-1]["speaker"], "speaker_1")

    def test_a_short_clip_with_two_voices_keeps_both(self):
        words = [dict(word(0, 2, " hi"), speaker="speaker_0"), dict(word(2.5, 4, " yo"), speaker="speaker_1")]
        engine.absorb_minor_speakers(words)
        self.assertEqual([w["speaker"] for w in words], ["speaker_0", "speaker_1"])

    def test_long_lines_and_pauses_split(self):
        words = [word(i * 0.5, i * 0.5 + 0.4, f" w{i}") for i in range(20)]
        words.append(word(20, 20.3, " late"))
        segs = engine.build_segments(words)
        self.assertTrue(all(s["end"] - s["start"] <= engine.MAX_SEGMENT_S for s in segs))
        self.assertEqual(segs[-1]["text"], "late")

    def test_whisper_segment_boundary_is_kept(self):
        segs = engine.build_segments([word(0, 0.3, " One.", 0), word(0.35, 0.6, " Two.", 1)])
        self.assertEqual([s["text"] for s in segs], ["One.", "Two."])

    def test_no_speaker_without_diarization(self):
        segs = engine.build_segments([word(0, 0.3, "日本")])
        self.assertNotIn("speaker", segs[0])
        self.assertEqual(segs[0]["words"][0]["word"], "日本")

    def test_cjk_words_join_without_spaces(self):
        segs = engine.build_segments([word(0, 0.2, "こん"), word(0.2, 0.4, "にちは")])
        self.assertEqual(segs[0]["text"], "こんにちは")


class JobTests(unittest.TestCase):
    def test_expired_job_reports_without_working(self):
        job = {"jobId": "j", "callbackUrl": "https://example.test/cb", "secret": "s", "mediaUrl": "https://x", "startBy": time.time() - 1}
        with patch.object(handler, "process") as process, patch.object(handler.requests, "post", return_value=MagicMock(ok=True)) as post:
            out = handler.handler({"input": job})
        process.assert_not_called()
        self.assertFalse(out["ok"])
        self.assertEqual(post.call_args.kwargs["json"]["jobId"], "j")

    def test_callback_carries_identity_and_result(self):
        job = {"jobId": "j", "kind": "video", "ref": "42", "callbackUrl": "https://example.test/cb", "secret": "s", "mediaUrl": "https://x"}
        result = {"language": "en", "segments": [{"start": 0, "end": 1, "text": "hi"}], "text": "hi"}
        with patch.object(handler, "process", return_value=result), patch.object(handler.requests, "post", return_value=MagicMock(ok=True)) as post:
            handler.handler({"input": job})
        body = post.call_args.kwargs["json"]
        self.assertEqual((body["action"], body["secret"], body["kind"], body["ref"], body["ok"]), ("complete", "s", "video", "42", True))
        self.assertEqual(body["segments"][0]["text"], "hi")

    def test_failure_is_reported(self):
        job = {"jobId": "j", "callbackUrl": "https://example.test/cb", "secret": "s", "mediaUrl": "https://x"}
        with patch.object(handler, "process", side_effect=RuntimeError("audio too short")), patch.object(handler.requests, "post", return_value=MagicMock(ok=True)) as post:
            handler.handler({"input": job})
        self.assertEqual(post.call_args.kwargs["json"]["error"], "RuntimeError: audio too short")

    def test_plain_http_media_is_refused(self):
        with self.assertRaises(RuntimeError):
            handler.process({"mediaUrl": "http://example.test/a.mp4"})


if __name__ == "__main__":
    unittest.main()
