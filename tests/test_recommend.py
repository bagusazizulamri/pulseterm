import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from api import recommend


class RecommendProfileTests(unittest.TestCase):
    def test_same_genre_matches(self):
        seed = recommend.profile({"title": "Dangdut Koplo Night", "artist": "Via Vallen"})
        cand = {"title": "Koplo Party", "artist": "Nella Kharisma", "album": ""}
        scored = recommend.score_candidate(seed, set(seed["tokens"]),
                                            recommend._tokens("Via Vallen"), cand)
        self.assertIsNotNone(scored)
        self.assertIn("dangdut", scored[1])

    def test_same_vibe_matches(self):
        seed = recommend.profile({"title": "Rainy Night Drive", "artist": "Keshi"})
        cand = {"title": "Midnight City Lights", "artist": "Joji", "album": ""}
        scored = recommend.score_candidate(seed, set(seed["tokens"]),
                                            recommend._tokens("Keshi"), cand)
        self.assertIsNotNone(scored)
        self.assertIn("vibe", scored[1])

    def test_unrelated_rejected(self):
        seed = recommend.profile({"title": "Dangdut Koplo Night", "artist": "Via Vallen"})
        cand = {"title": "Classical Symphony No 5", "artist": "Beethoven", "album": ""}
        self.assertIsNone(recommend.score_candidate(seed, set(seed["tokens"]),
                                                    recommend._tokens("Via Vallen"), cand))

    def test_hyphen_artist_matches_keyword(self):
        # "EXO-K" must match keyword "exo"; hyphens are separators.
        self.assertTrue(recommend._word_hit("exo", " mama exo-k "))
        seed = recommend.profile({"title": "MAMA", "artist": "EXO-K"})
        self.assertIn("k-pop", seed["genres"])
        scored = recommend.score_candidate({**seed, "album": ""}, set(seed["tokens"]),
                                            recommend._tokens("EXO-K"),
                                            {"title": "Growl", "artist": "EXO", "album": ""})
        self.assertIsNotNone(scored)
        self.assertIn("k-pop", scored[1])

    def test_pop_does_not_match_popular(self):
        seed = recommend.profile({"title": "Pop Hits", "artist": "Pop Star"})
        cand = {"title": "Popular Song", "artist": "Someone", "album": ""}
        self.assertIsNone(recommend.score_candidate(seed, set(seed["tokens"]),
                                                    recommend._tokens("Pop Star"), cand))

    def test_rank_filters_and_excludes(self):
        seed = recommend.profile({"title": "LoFi Chill Night", "artist": "A"})
        seed_tokens = set(seed["tokens"])
        seed_artist = recommend._tokens("A")
        cands = [
            {"videoId": "AAAAAAAAAAA", "title": "Chill Night Beats", "artist": "B", "album": ""},
            {"videoId": "BBBBBBBBBBB", "title": "Heavy Metal Scream", "artist": "C", "album": ""},
            "not-a-dict",
        ]
        ranked = recommend.rank_candidates(seed_prof=seed, seed_tokens=seed_tokens,
                                           seed_artist=seed_artist, cands=cands,
                                           limit="bad", exclude={"AAAAAAAAAAA"})
        self.assertEqual(ranked, [])

    def test_rail_fallback_accepts_same_rail_only(self):
        sp = {"genres": [], "vibes": [], "tokens": ["x"], "album": "", "rail": "watch"}
        same = recommend.score_candidate(sp, {"x"}, {"y"},
                                         {"videoId": "AAAAAAAAAAA", "title": "Q",
                                          "artist": "Z", "album": "", "source": "watch"})
        self.assertIsNotNone(same)
        self.assertIn("same lane", same[1])
        other = recommend.score_candidate(sp, {"x"}, {"y"},
                                          {"videoId": "BBBBBBBBBBB", "title": "Q",
                                           "artist": "Z", "album": "", "source": "related"})
        self.assertIsNone(other)

    def test_recommendations_rejects_bad_id_without_network(self):
        import asyncio
        with patch("api.music.get_ytmusic") as yt:
            yt.side_effect = AssertionError("must not touch network")
            out = asyncio.run(recommend.get_recommendations("not-a-video-id"))
        self.assertEqual(out, [])

    def test_is_video_track_detection(self):
        self.assertFalse(recommend.is_video_track({"videoType": "MUSIC_VIDEO_TYPE_ATV"}))
        self.assertFalse(recommend.is_video_track({"resultType": "song"}))
        self.assertFalse(recommend.is_video_track({"is_video": False}))
        self.assertTrue(recommend.is_video_track({"videoType": "MUSIC_VIDEO_TYPE_OMV"}))
        self.assertTrue(recommend.is_video_track({"videoType": "MUSIC_VIDEO_TYPE_UGC"}))
        self.assertTrue(recommend.is_video_track({"resultType": "video"}))
        self.assertTrue(recommend.is_video_track({"is_video": True}))
        self.assertTrue(recommend.is_video_track({"title": "Artist - Hit Song (Official Music Video)"}))

    def test_song_seed_filters_out_videos_in_ranking(self):
        seed = recommend.profile({"title": "Hit Song", "artist": "Pop Star"})
        seed_tokens = set(seed["tokens"])
        seed_artist = recommend._tokens("Pop Star")
        cands = [
            {"videoId": "AAAAAAAAAAA", "title": "Good Pop Track", "artist": "Pop Star",
             "album": "", "videoType": "MUSIC_VIDEO_TYPE_ATV", "resultType": "song"},
            {"videoId": "BBBBBBBBBBB", "title": "Official Music Video", "artist": "Pop Star",
             "album": "", "videoType": "MUSIC_VIDEO_TYPE_OMV", "resultType": "video"},
        ]
        # When seed is a song (seed_is_video=False):
        ranked = recommend.rank_candidates(seed_prof=seed, seed_tokens=seed_tokens,
                                           seed_artist=seed_artist, cands=cands,
                                           seed_is_video=False)
        video_ids = [t["videoId"] for t in ranked]
        self.assertIn("AAAAAAAAAAA", video_ids)
        self.assertNotIn("BBBBBBBBBBB", video_ids)

        # When seed is a video (seed_is_video=True):
        ranked_vid = recommend.rank_candidates(seed_prof=seed, seed_tokens=seed_tokens,
                                               seed_artist=seed_artist, cands=cands,
                                               seed_is_video=True)
        video_ids_vid = [t["videoId"] for t in ranked_vid]
        self.assertIn("BBBBBBBBBBB", video_ids_vid)


if __name__ == '__main__':
    unittest.main()
