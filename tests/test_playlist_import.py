import asyncio
import os
import sys
import unittest
from unittest.mock import patch, MagicMock
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ['DB_PATH'] = '/tmp/pulseterm-playlist-import-test.sqlite'

from main import app
from database import init_db, create_playlist, get_playlist_songs, add_songs_to_playlist_batch, delete_playlist
from api.music import extract_playlist_id, import_youtube_playlist

class PlaylistImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        asyncio.run(init_db())

    def setUp(self):
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url='http://test')

    def tearDown(self):
        asyncio.run(self.client.aclose())

    def test_extract_playlist_id_variants(self):
        cases = {
            "https://www.youtube.com/playlist?list=PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr": "PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr",
            "https://music.youtube.com/playlist?list=PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr": "PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr",
            "https://www.youtube.com/watch?v=233pOxCYu9w&list=PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr": "PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr",
            "https://youtu.be/233pOxCYu9w?list=PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr&si=share": "PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr",
            "https://music.youtube.com/playlist?list=OLAK5uy_k1234567890abcdef": "OLAK5uy_k1234567890abcdef",
            "PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr": "PLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr",
            "VLPLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr": "VLPLw3xXmiGk7179fZ_q7f3YgmuD05U7ClHr",
            "OLAK5uy_k1234567890abcdef": "OLAK5uy_k1234567890abcdef",
            "RDCLAK5uy_k1234567890abcdef": "RDCLAK5uy_k1234567890abcdef",
        }
        for url, expected in cases.items():
            actual = extract_playlist_id(url)
            self.assertEqual(actual, expected, f"Failed for {url}: expected {expected}, got {actual}")

        # Invalid cases
        self.assertIsNone(extract_playlist_id(""))
        self.assertIsNone(extract_playlist_id(None))
        self.assertIsNone(extract_playlist_id("not_a_playlist"))

    def test_database_batch_insertion(self):
        async def _test():
            pid = await create_playlist("Batch Test Playlist")
            # video_id harus lulus ^[A-Za-z0-9_-]{11}$ (lihat LOGIC_GUIDE §3).
            # Test pakai ID 11-char valid supaya add_songs_to_playlist_batch
            # tidak skip-nya (skip diam-diam = 'data rusak dibuang').
            tracks = [
                {"video_id": f"abcDEFgh{i:03d}", "title": f"Song {i}", "artist": f"Artist {i}", "thumbnail": f"http://thumb/{i}", "duration": 180 + i}
                for i in range(10)
            ]
            await add_songs_to_playlist_batch(pid, tracks)
            songs = await get_playlist_songs(pid)
            self.assertEqual(len(songs), 10)
            for idx, s in enumerate(songs):
                self.assertEqual(s["video_id"], f"abcDEFgh{idx:03d}")
                self.assertEqual(s["title"], f"Song {idx}")
                self.assertEqual(s["artist"], f"Artist {idx}")
                self.assertEqual(s["position"], idx)
            # Add more to verify position offset calculation
            more_tracks = [
                {"video_id": "abcDEFgh010", "title": "Extra 1", "artist": "Artist Extra", "thumbnail": "", "duration": 200},
                {"video_id": "abcDEFgh011", "title": "Extra 2", "artist": "Artist Extra", "thumbnail": "", "duration": 210}
            ]
            await add_songs_to_playlist_batch(pid, more_tracks)
            all_songs = await get_playlist_songs(pid)
            self.assertEqual(len(all_songs), 12)
            self.assertEqual(all_songs[10]["position"], 10)
            self.assertEqual(all_songs[11]["position"], 11)
            await delete_playlist(pid)

        asyncio.run(_test())

    def test_api_import_validation(self):
        async def _test():
            # Missing URL
            r = await self.client.post('/api/playlists/import', json={})
            res = r.json()
            self.assertFalse(res["success"])
            self.assertIn("Missing", res["error"])

            # Invalid URL
            r = await self.client.post('/api/playlists/import', json={"url": "invalid_url_123"})
            res = r.json()
            self.assertFalse(res["success"])

        asyncio.run(_test())

    def test_api_import_success_mocked(self):
        mock_playlist_data = {
            "name": "Mocked Hits",
            "tracks": [
                # 11-char IDs (LOGIC_GUIDE §3). mockVID1234 (10) & mockVID678 (9)
                # tidak valid, jadi perlu digit final biar persis 11.
                {"video_id": "mockVID123a", "title": "Hit 1", "artist": "Singer A", "thumbnail": "https://img/1.jpg", "duration": 210},
                {"video_id": "mockVID678b", "title": "Hit 2", "artist": "Singer B", "thumbnail": "https://img/2.jpg", "duration": 195}
            ]
        }

        async def _test():
            with patch('api.music.import_youtube_playlist', return_value=mock_playlist_data):
                r = await self.client.post('/api/playlists/import', json={"url": "https://www.youtube.com/playlist?list=PLmock12345"})
                res = r.json()
                self.assertTrue(res["success"])
                data = res["data"]
                self.assertEqual(data["name"], "Mocked Hits")
                self.assertEqual(data["count"], 2)
                self.assertEqual(len(data["songs"]), 2)
                self.assertEqual(data["songs"][0]["video_id"], "mockVID123a")
                self.assertEqual(data["songs"][1]["video_id"], "mockVID678b")

                # Clean up created playlist
                await delete_playlist(data["id"])

        asyncio.run(_test())

if __name__ == '__main__':
    unittest.main()
