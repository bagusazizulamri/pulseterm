import asyncio
import os
import sys
import tempfile
import unittest
from unittest.mock import patch, AsyncMock
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from main import app
from api import stream

class StreamApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        self.vid = 'dQw4w9WgXcQ'
        self.audio = os.path.join(self.tmp.name, self.vid + '.m4a')
        with open(self.audio, 'wb') as f: f.write(bytes(range(256)) * 64)
        self.offline = stream.OFFLINE_DIR
        stream.OFFLINE_DIR = self.tmp.name

    def tearDown(self):
        stream.OFFLINE_DIR = self.offline
        asyncio.run(self.client.aclose())
        self.tmp.cleanup()

    def test_local_file_range_head_and_invalid_range(self):
        async def run():
            head = await self.client.head('/api/player/audio/' + self.vid)
            self.assertEqual(head.status_code, 200)
            self.assertEqual(int(head.headers['content-length']), 16384)
            self.assertEqual(head.headers['accept-ranges'], 'bytes')
            part = await self.client.get('/api/player/audio/' + self.vid, headers={'Range': 'bytes=1024-2047'})
            self.assertEqual(part.status_code, 206)
            self.assertEqual(len(part.content), 1024)
            self.assertEqual(part.headers['content-range'], 'bytes 1024-2047/16384')
            bad = await self.client.get('/api/player/audio/' + self.vid, headers={'Range': 'bytes=99999-100000'})
            self.assertEqual(bad.status_code, 416)
        asyncio.run(run())

    def test_devtools_line_suffix_is_stripped_not_searched(self):
        # "audio/XXX:1" di console Chrome = URL + ":nomor-baris DevTools",
        # BUKAN bagian videoId. Server harus strip ":1" dan proxy seperti
        # biasa — bukan malah ytsearch "XXX:1" yang lambat lalu 502.
        async def run():
            bad = await self.client.get('/api/player/audio/not-a-real-id!!')
            self.assertEqual(bad.status_code, 400)
            with patch('main.stream.get_stream_url_async', new=AsyncMock(return_value='https://unused.test/audio')) as resolver:
                async def send(*args, **kwargs):
                    request = args[0]
                    req = httpx.Request('GET', str(request.url))
                    return httpx.Response(206, headers={'content-type': 'audio/webm', 'content-range': 'bytes 0-1/10', 'content-length': '2'}, content=b'\x01\x02', request=req)
                with patch('httpx.AsyncClient.send', side_effect=send):
                    r = await self.client.get('/api/player/audio/dQw4w9WgXcQ:1', headers={'Range': 'bytes=0-1'})
                self.assertEqual(r.status_code, 206)
                self.assertEqual(r.content, b'\x01\x02')
                # Resolver hanya dipanggil dengan id bersih, bukan "id:1"
                for c in resolver.await_args_list:
                    self.assertNotIn(':', c.args[0] if c.args else c.kwargs.get('video_id', ''))
        asyncio.run(run())

    def test_oversized_content_length_is_rejected(self):
        """Upstream claiming >100 MB of audio must be rejected so a broken
        upstream response cannot OOM the proxy.
        """
        async def run():
            fake_client = AsyncMock()
            async def fake_send(request, **kwargs):
                return httpx.Response(200, headers={
                    'content-type': 'audio/webm',
                    'content-length': str(200 * 1024 * 1024),
                }, content=b'')
            fake_client.send.side_effect = fake_send
            with patch('main.stream.get_stream_url_async', new=AsyncMock(return_value='https://unused.test/audio')):
                with patch('main.get_proxy_client', return_value=fake_client):
                    r = await self.client.get('/api/player/audio/xxxxxxxxxxx')
            self.assertEqual(r.status_code, 502)
            self.assertIn('too large', r.json().get('error', '').lower())
        asyncio.run(run())

    def test_stream_proxy_uses_cache_and_returns_audio(self):
        async def run():
            with patch('main.stream.get_stream_url_async', new=AsyncMock(return_value='https://unused.test/audio')) as resolver:
                async def send(*args, **kwargs):
                    request = args[0]
                    req = httpx.Request('GET', str(request.url))
                    return httpx.Response(206, headers={'content-type':'audio/webm','content-range':'bytes 0-1/10','content-length':'2'}, content=b'\x01\x02', request=req)
                with patch('httpx.AsyncClient.send', side_effect=send):
                    r = await self.client.get('/api/player/audio/other-test', headers={'Range':'bytes=0-1'})
                self.assertEqual(r.status_code, 206)
                self.assertEqual(r.content, b'\x01\x02')
                self.assertTrue(resolver.await_count <= 2)
        asyncio.run(run())

if __name__ == '__main__': unittest.main()
