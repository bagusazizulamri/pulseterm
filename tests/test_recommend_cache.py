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
