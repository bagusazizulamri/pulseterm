import asyncio
import os
import tempfile
import unittest
from unittest.mock import patch

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from api.player import PlayerManager
from api import stream

class PlayerManagerTests(unittest.TestCase):
    def setUp(self):
        PlayerManager._instance = None
        self.p = PlayerManager()
        self.songs = [
            {"videoId": "aaaaaaaaaaa", "title": "A", "artist": "Artist"},
            {"videoId": "bbbbbbbbbbb", "title": "B", "artist": "Artist"},
            {"videoId": "ccccccccccc", "title": "C", "artist": "Artist"},
        ]
        self.p.set_context(self.songs, 0, name="Album")

    def test_user_queue_precedes_context_and_clear_preserves_context(self):
        self.p.add_to_queue({"videoId": "ddddddddddd", "title": "D"})
        self.p.clear_user_queue()
        self.assertEqual([s.video_id for s in self.p.context], ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"])
        self.assertEqual([x["song"]["video_id"] for x in self.p.upcoming()], ["bbbbbbbbbbb", "ccccccccccc"])

    def test_current_report_consumes_queue_item_once(self):
        self.p.add_to_queue({"videoId": "ddddddddddd", "title": "D"})
        self.p.set_current({"videoId": "ddddddddddd", "title": "D"})
        self.assertEqual(self.p.user_queue, [])
        self.assertEqual(self.p.current_song.video_id, "ddddddddddd")
        self.assertEqual([s.video_id for s in self.p.history][-1], "ddddddddddd")

    def test_next_user_then_context(self):
        self.p.play_next({"videoId": "ddddddddddd", "title": "D"})
        self.assertEqual(self.p.next_song().video_id, "ddddddddddd")
        self.assertEqual(self.p.next_song().video_id, "bbbbbbbbbbb")

    def test_remove_context_upcoming(self):
        self.p.remove_context_item(1)
        self.assertEqual([x["song"]["video_id"] for x in self.p.upcoming()], ["ccccccccccc"])

    def test_append_recommendations_marks_auto(self):
        added = self.p.append_recommendations([
            {"video_id": "ddddddddddd", "title": "D", "artist": "Artist", "reason": "genre: pop"},
            {"video_id": "aaaaaaaaaaa", "title": "A dup", "artist": "Artist"},
        ])
        self.assertEqual([s.video_id for s in added], ["ddddddddddd"])
        self.assertIn("ddddddddddd", self.p.auto_ids)
        upcoming = self.p.upcoming()
        auto_rows = [x for x in upcoming if x["song"].get("video_id") == "ddddddddddd"]
        self.assertTrue(auto_rows and auto_rows[0]["song"].get("autoAdded"))

    def test_set_current_unknown_track_keeps_context_pointer(self):
        self.p.set_current({"videoId": "ddddddddddd", "title": "D"})
        self.assertEqual(self.p._context_index, 0)
        self.assertEqual([x["song"]["video_id"] for x in self.p.upcoming()], ["bbbbbbbbbbb", "ccccccccccc"])

    def test_set_current_context_track_moves_pointer(self):
        self.p.set_current({"videoId": "ccccccccccc", "title": "C"})
        self.assertEqual(self.p._context_index, 2)
        self.assertEqual(self.p.upcoming(), [])

    def test_set_order_rejects_garbage(self):
        before = (list(self.p._order), self.p._order_pos, self.p._context_index)
        self.p.set_order(["x", -1, 99], "bad")
        self.assertEqual((list(self.p._order), self.p._order_pos, self.p._context_index), before)

    def test_new_context_clears_stale_auto_markers(self):
        self.p.append_recommendations([{"video_id": "ddddddddddd", "title": "D"}])
        self.assertTrue(self.p.auto_ids)
        self.p.set_context([{"videoId": "eeeeeeeeeee", "title": "E"}], 0, name="New")
        self.assertEqual(self.p.auto_ids, [])
        self.assertEqual(self.p.rec_reasons, {})

class StreamTests(unittest.TestCase):
    def setUp(self):
        stream._url_cache.clear()
        stream._stats.update({"hits": 0, "misses": 0, "errors": 0, "forced": 0, "resolves": 0})

    def test_expiry_uses_googlevideo_expire(self):
        import time
        exp = int(time.time()) + 300
        self.assertEqual(stream.expiry_of(f"https://x.test/play?expire={exp}"), exp - 60)

    def test_parallel_requests_single_flight(self):
        calls = []
        def fake(_video_id):
            calls.append(_video_id)
            return "https://googlevideo.test/play?expire=1999999999"
        async def run():
            with patch.object(stream, "_extract", side_effect=fake):
                return await asyncio.gather(*[stream.get_stream_url_async("aaaaaaaaaaa") for _ in range(8)])
        urls = asyncio.run(run())
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(set(urls)), 1)

if __name__ == '__main__':
    unittest.main()
