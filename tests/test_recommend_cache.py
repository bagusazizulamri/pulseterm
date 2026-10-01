"""Recommend cache threshold contract.

Goal: niche tracks (3 vibe matches) hit the cache instead of re-resolving
ytmusicapi every "extend" click.
"""
import os
import sys
import unittest
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DB_PATH', '/tmp/pulseterm-rec-cache-test.sqlite')

from api import recommend


class RecommendCacheThresholdTests(unittest.TestCase):
    def setUp(self):
        recommend._REC_CACHE.clear()

    def test_three_tracks_hit_cache(self):
        vid = 'aaaaaaaaaaa'
        recommend._REC_CACHE[vid] = (time.time() + 600, [
            {'videoId': f'b{i:011d}'} for i in range(3)
        ])
        out = recommend._cache_get(vid, limit=10)
        self.assertEqual(len(out), 3)

    def test_single_track_with_no_exclude_hits(self):
        vid = 'bbbbbbbbbbb'
        recommend._REC_CACHE[vid] = (time.time() + 600, [{'videoId': 'c0000000000'}])
        self.assertEqual(len(recommend._cache_get(vid, limit=10)), 1)

    def test_expired_cache_misses(self):
        vid = 'cccccccccc0'
        recommend._REC_CACHE[vid] = (time.time() - 1, [{'videoId': 'd0000000000'}])
        self.assertIsNone(recommend._cache_get(vid, limit=10))

    def test_exclude_filter_applies(self):
        vid = 'ddddddddddd'
        recommend._REC_CACHE[vid] = (time.time() + 600, [
            {'videoId': 'e0000000000'},
            {'videoId': 'e0000000001'},
            {'videoId': 'e0000000002'},
        ])
        out = recommend._cache_get(vid, limit=10, exclude={'e0000000000'})
        self.assertEqual(len(out), 2)
        self.assertTrue(all(t['videoId'] != 'e0000000000' for t in out))


if __name__ == '__main__':
    unittest.main()


class ArtistNormalizeTests(unittest.TestCase):
    """Quick win #10 — artist normalization for recommendation diversity."""

    def test_topic_suffix_dropped(self):
        self.assertEqual(recommend.normalize_artist("Adele - Topic"), "Adele")
        self.assertEqual(recommend.normalize_artist("Adele, Topic"), "Adele")
        self.assertEqual(recommend.normalize_artist("ADELE - topic"), "ADELE")

    def test_duplicate_names_collapsed(self):
        self.assertEqual(recommend.normalize_artist("Adele, Adele"), "Adele")
        self.assertEqual(recommend.normalize_artist("Adele & Adele & Adele"), "Adele")

    def test_case_only_difference_collapses(self):
        # Lowercasing is the caller's job; normalize_artist preserves casing,
        # but two different casings of the same name should still dedupe.
        out = recommend.normalize_artist("Adele, adele")
        self.assertIn("Adele", out)
        self.assertNotIn("adele", out)

    def test_feat_split_kept(self):
        # "Adele feat. John Legend" should NOT be deduped to "Adele"
        out = recommend.normalize_artist("Adele feat. John Legend")
        self.assertIn("Adele", out)
        self.assertIn("John Legend", out)

    def test_empty_and_garbage(self):
        self.assertEqual(recommend.normalize_artist(""), "")
        self.assertEqual(recommend.normalize_artist(None), "")
        self.assertEqual(recommend.normalize_artist(",,,"), "")

    def test_diversity_cap_uses_normalized_key(self):
        """Same artist under five surface forms must collapse to ≤ 2 picks."""
        seed_prof = {"genres": [], "vibes": [], "tokens": ["song"], "rail": "watch"}
        cands = [
            {"videoId": f"v{i}", "title": f"Song {i}", "artist": a, "source": "watch"}
            for i, a in enumerate([
                "Adele", "adele", "Adele, Adele", "Adele - Topic", "Adele"
            ], start=1)
        ]
        # Mix in a non-Adele pick so cap actually has to fire instead of just
        # bottoming out from "not enough cands".
        cands.append({"videoId": "v6", "title": "Other Tune", "artist": "Drake", "source": "watch"})
        out = recommend.rank_candidates(seed_prof, set(), set(), cands,
                                        limit=10, seed_title="", seed_artist_name="Adele")
        artists = [recommend.normalize_artist(c.get("artist", "")).lower() for c in out]
        # At most two Adele variants survive (the cap)
        self.assertLessEqual(artists.count("adele"), 2,
                             f"diversity cap broken: {artists}")

    def test_same_artist_match_uses_normalized_seed(self):
        """Seed 'Adele, Adele' must still match a candidate 'adele' (no other lane)."""
        # Empty seed profile so only same_artist can score the candidate.
        # Source "playlist" so the watch/related rail branch is skipped.
        seed_prof = {"genres": [], "vibes": [], "tokens": [], "rail": ""}
        seed_tokens = set()
        seed_artist = recommend._tokens(recommend.normalize_artist("Adele, Adele"))
        # Title with no genre keyword; artist in lowercase but a different
        # surface form ("Adele, Adele" → tokens {"adele"}; cand "adele" → tokens {"adele"})
        cand = {"title": "Quiet Ballad", "artist": "adele", "source": "playlist"}
        out = recommend.score_candidate(seed_prof, seed_tokens, seed_artist, cand)
        self.assertIsNotNone(out, "normalized seed must still match candidate")
        _, reason, _ = out
        self.assertIn("same artist lane", reason)
