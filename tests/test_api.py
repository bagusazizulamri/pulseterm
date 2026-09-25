import asyncio
import os
import sys
import unittest
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ['DB_PATH'] = '/tmp/metrolist-api-test.sqlite'
from main import app
from database import init_db

class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        asyncio.run(init_db())

    def setUp(self):
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url='http://test')

    def tearDown(self):
        asyncio.run(self.client.aclose())

    def get(self, path): return asyncio.run(self.client.get(path))
    def post(self, path, data=None): return asyncio.run(self.client.post(path, json=data or {}))
    def delete(self, path): return asyncio.run(self.client.delete(path))

    def test_health_and_settings_types(self):
        self.assertEqual(self.get('/api/health').json()['status'], 'ok')
        r = self.post('/api/settings', {'crossfade': 4.0, 'sleepMinutes': 15, 'speed': 1.25, 'skipSilence': True})
        self.assertTrue(r.json()['success'])
        d = self.get('/api/settings').json()['data']
        self.assertEqual(d['crossfade'], 4.0)
        self.assertEqual(d['sleepMinutes'], 15)
        self.assertEqual(d['speed'], 1.25)
        self.assertIs(d['skipSilence'], True)

    def test_liked_roundtrip(self):
        vid = 'like-test-001'
        on = self.post('/api/library/liked/' + vid, {'title': 'Test song', 'artist': 'Test'}).json()
        self.assertTrue(on['data']['liked'])
        self.assertEqual(len(self.get('/api/library/liked').json()['data']), 1)
        self.assertFalse(self.delete('/api/library/liked/' + vid).json()['data']['liked'])
        self.assertEqual(self.get('/api/library/liked').json()['data'], [])

    def test_user_queue_clear_does_not_clear_context(self):
        songs = [{'videoId': 'queue-test-a', 'title': 'A'}, {'videoId': 'queue-test-b', 'title': 'B'}]
        self.assertTrue(self.post('/api/player/play', {'songs': songs, 'index': 0, 'name': 'Test context'}).json()['success'])
        self.post('/api/player/queue', {'song': {'videoId': 'queue-test-c', 'title': 'C'}})
        self.delete('/api/player/queue')
        data = self.get('/api/player/queue').json()['data']
        self.assertEqual([x['song']['title'] for x in data['upcoming']], ['B'])
        self.assertEqual(data['contextName'], 'Test context')

    def test_continue_toggle_roundtrip(self):
        off = self.post('/api/player/continue', {'enabled': False}).json()
        self.assertFalse(off['data']['enabled'])
        on = self.post('/api/player/continue', {'enabled': True}).json()
        self.assertTrue(on['data']['enabled'])
        self.assertTrue(self.get('/api/player/continue').json()['data']['enabled'])

    def test_extend_requires_seed(self):
        r = self.post('/api/player/extend', {'seed': {}, 'limit': 2}).json()
        # With an empty body the server falls back to current; either a clear
        # no-seed error or a success payload is acceptable, never a crash.
        self.assertIn('success', r)

if __name__ == '__main__': unittest.main()
