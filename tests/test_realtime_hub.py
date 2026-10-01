"""RealtimeHub coalescing contract.

Rapid setter calls (volume slider drag, seek bar scrub) used to enqueue one
broadcast task per call. A slow WebSocket client could pile up hundreds of
stale sends and delay every other connected client. The hub must coalesce
to a single broadcast per loop tick and only carry the latest payload.
"""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DB_PATH', '/tmp/pulseterm-realtime-test.sqlite')

from main import RealtimeHub


class _FakeWS:
    """Minimal WebSocket stand-in for hub.broadcast."""
    def __init__(self, delay=0.0):
        self.received = []
        self.delay = delay
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, data):
        if self.delay:
            await asyncio.sleep(self.delay)
        self.received.append(data)


class RealtimeHubCoalesceTests(unittest.TestCase):
    def test_burst_coalesces_to_one_broadcast(self):
        async def run():
            hub = RealtimeHub()
            ws = _FakeWS()
            await hub.connect(ws)
            # 50 rapid setters, each should coalesce into one broadcast.
            for i in range(50):
                hub.schedule_broadcast({"type": "status", "data": {"v": i}})
            # Let the event loop drain.
            await asyncio.sleep(0.05)
            # Only ONE message should reach the client, with the LAST value.
            self.assertEqual(len(ws.received), 1)
            self.assertEqual(ws.received[0]["data"]["v"], 49)
        asyncio.run(run())

    def test_two_distinct_ticks_deliver_two_messages(self):
        async def run():
            hub = RealtimeHub()
            ws = _FakeWS()
            await hub.connect(ws)
            hub.schedule_broadcast({"type": "status", "data": {"v": 1}})
            await asyncio.sleep(0.02)
            hub.schedule_broadcast({"type": "status", "data": {"v": 2}})
            await asyncio.sleep(0.02)
            self.assertEqual(len(ws.received), 2)
            self.assertEqual([m["data"]["v"] for m in ws.received], [1, 2])
        asyncio.run(run())

    def test_slow_client_does_not_delay_others(self):
        async def run():
            hub = RealtimeHub()
            slow = _FakeWS(delay=0.05)
            fast = _FakeWS()
            await hub.connect(slow)
            await hub.connect(fast)
            hub.schedule_broadcast({"type": "status", "data": {"v": 1}})
            await asyncio.sleep(0.03)
            hub.schedule_broadcast({"type": "status", "data": {"v": 2}})
            # Wait long enough for both ticks to flush. The fast client must
            # receive BOTH messages; the slow client may still be on its first
            # send because we use concurrent gather now.
            await asyncio.sleep(0.20)
            self.assertGreaterEqual(len(fast.received), 2)
            # Slow client gets at least one before being timed out by the test;
            # the point is the FAST client isn't blocked behind the slow one.
            self.assertGreaterEqual(len(slow.received), 1)
            # Fast must have both v=1 and v=2.
            self.assertEqual([m["data"]["v"] for m in fast.received[:2]], [1, 2])
        asyncio.run(run())


if __name__ == '__main__':
    unittest.main()
