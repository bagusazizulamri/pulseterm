import asyncio
import os
import sys
import unittest
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ['DB_PATH'] = '/tmp/pulseterm-validate-test.sqlite'
from main import app, _validate_song_input
from database import init_db, delete_playlist, set_liked


async def _post(client, path, data=None):
    r = await client.post(path, json=data or {})
    return r.json()


async def _post_form(client, path, data=None):
    # Untuk endpoint yang ambil `name` via Query (lihat backend/main.py
    # create_pl()), pakai params=, bukan json=. Tanpa ini FastAPI balikin
    # 422 'field required' dan test_playlist_add_* gagal.
    r = await client.post(path, params=data or {})
    return r.json()


async def _delete(client, path):
    await client.delete(path)


class ValidateSongUnitTests(unittest.TestCase):
    """Unit test _validate_song_input — PulseTerm #11."""

    @classmethod
    def setUpClass(cls):
        asyncio.run(init_db())

    def test_valid_11char_id_passes(self):
        s = _validate_song_input({'videoId': 'abcDEFgh123', 'title': 'Hi', 'artist': 'A'})
        self.assertIsNotNone(s)
        self.assertEqual(s['video_id'], 'abcDEFgh123')
        self.assertEqual(s['duration'], 0)

    def test_snake_case_video_id_accepted(self):
        s = _validate_song_input({'video_id': 'xyz-_abc123'})
        self.assertIsNotNone(s)
        self.assertEqual(s['video_id'], 'xyz-_abc123')

    def test_invalid_short_or_empty_rejected(self):
        self.assertIsNone(_validate_song_input({'videoId': 'short'}))
        self.assertIsNone(_validate_song_input({'videoId': ''}))
        self.assertIsNone(_validate_song_input({}))

    def test_invalid_long_id_rejected(self):
        self.assertIsNone(_validate_song_input({'videoId': 'a' * 12}))

    def test_invalid_chars_rejected(self):
        self.assertIsNone(_validate_song_input({'videoId': 'abc def gh1'}))
        self.assertIsNone(_validate_song_input({'videoId': 'abc/def/gh1'}))
        self.assertIsNone(_validate_song_input({'videoId': 'abc!defgh12'}))

    def test_non_dict_input_rejected(self):
        self.assertIsNone(_validate_song_input(None))
        self.assertIsNone(_validate_song_input('string'))
        self.assertIsNone(_validate_song_input(123))

    def test_duration_clamped_nonneg(self):
        self.assertEqual(_validate_song_input({'videoId': 'abcDEFgh123', 'duration': -5})['duration'], 0)
        self.assertEqual(_validate_song_input({'videoId': 'abcDEFgh123', 'duration': 'abc'})['duration'], 0)
        self.assertEqual(_validate_song_input({'videoId': 'abcDEFgh123', 'duration': 210})['duration'], 210)

    def test_string_fields_truncated_to_200(self):
        s = _validate_song_input({'videoId': 'abcDEFgh123', 'title': 'A' * 500, 'artist': 'B' * 500})
        self.assertEqual(len(s['title']), 200)
        self.assertEqual(len(s['artist']), 200)

    def test_thumbnail_truncated_to_500(self):
        s = _validate_song_input({'videoId': 'abcDEFgh123', 'thumbnail': 'http://x.com/' + 'y' * 1000})
        self.assertEqual(len(s['thumbnail']), 500)

    def test_album_field_included(self):
        s = _validate_song_input({'videoId': 'abcDEFgh123', 'album': 'Best Of'})
        self.assertEqual(s['album'], 'Best Of')


class ValidateSongEndpointTests(unittest.TestCase):
    """Integration: endpoint tolak input song invalid (PulseTerm #11)."""

    @classmethod
    def setUpClass(cls):
        asyncio.run(init_db())

    def setUp(self):
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url='http://test')

    def tearDown(self):
        asyncio.run(self.client.aclose())

    def test_playlist_add_rejects_invalid_id(self):
        async def _t():
            r = await _post_form(self.client, '/api/playlists', {'name': 'ValidateTest1'})
            self.assertIn('data', r, f'create playlist failed: {r}')
            pid = r['data']['id']
            try:
                r = await _post(self.client, f'/api/playlists/{pid}/songs', {'videoId': 'short'})
                self.assertFalse(r['success'])
                self.assertIn('Invalid video id', r['error'])
            finally:
                await delete_playlist(pid)
        asyncio.run(_t())

    def test_playlist_add_accepts_valid_id(self):
        async def _t():
            r = await _post_form(self.client, '/api/playlists', {'name': 'ValidateTest2'})
            self.assertIn('data', r, f'create playlist failed: {r}')
            pid = r['data']['id']
            try:
                r = await _post(self.client, f'/api/playlists/{pid}/songs',
                                {'videoId': 'validID1234', 'title': 'OK'})
                self.assertTrue(r['success'])
                self.assertEqual(len(r['data']), 1)
            finally:
                await delete_playlist(pid)
        asyncio.run(_t())

    def test_history_rejects_invalid_id(self):
        async def _t():
            r = await _post(self.client, '/api/library/history', {'videoId': 'bad', 'title': 'X'})
            self.assertFalse(r['success'])
            self.assertIn('Invalid video id', r['error'])
        asyncio.run(_t())

    def test_liked_path_rejects_invalid_id(self):
        async def _t():
            r = await _post(self.client, '/api/library/liked/bad', {'title': 'X'})
            self.assertFalse(r['success'])
            self.assertIn('Invalid video id', r['error'])
        asyncio.run(_t())

    def test_liked_path_accepts_valid_id(self):
        async def _t():
            r = await _post(self.client, '/api/library/liked/likedID1234', {'title': 'OK'})
            self.assertTrue(r['success'])
            # cleanup
            await _delete(self.client, '/api/library/liked/likedID1234')
        asyncio.run(_t())
