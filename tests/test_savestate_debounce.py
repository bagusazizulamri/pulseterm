"""Save-state coalescing contract: hot setters debounce, structural writes remain immediate.

Goal: a volume slider drag burst settles on a single fsync instead of one per `input` event.
"""
import os
import sys
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DB_PATH', '/tmp/pulseterm-savestate-test.sqlite')
os.environ['SESSION_CACHE'] = '/tmp/pulseterm-savestate-test-session.json'

from api.player import PlayerManager, _save_lock, _save_pending, _save_timer


class SaveStateDebounceTests(unittest.TestCase):
    def setUp(self):
        if os.path.exists(os.environ['SESSION_CACHE']):
            os.remove(os.environ['SESSION_CACHE'])
        self.mgr = PlayerManager()

    def test_volume_burst_collapses_to_single_write(self):
        # Patch _save_state_sync so we can count the number of actual disk writes
        # without depending on filesystem timing.
        with patch.object(self.mgr, '_save_state_sync') as sync_write:
            for v in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
                self.mgr.volume = v
            # The debounce window has not elapsed yet.
            self.assertEqual(sync_write.call_count, 0)
            # Wait long enough for the trailing timer to fire.
            time.sleep(0.7)
            self.assertEqual(sync_write.call_count, 1)

    def test_position_burst_collapses_to_single_write(self):
        with patch.object(self.mgr, '_save_state_sync') as sync_write:
            for p in range(0, 60):
                self.mgr.position = p
            self.assertEqual(sync_write.call_count, 0)
            time.sleep(0.7)
            self.assertEqual(sync_write.call_count, 1)

    def test_structural_write_remains_immediate(self):
        # Setter for shuffle is cold (rare, explicit user toggle) — must remain
        # synchronous so the next page reload sees the new state.
        with patch.object(self.mgr, '_save_state_sync') as sync_write:
            self.mgr.shuffle = True
            self.assertEqual(sync_write.call_count, 1)

    def test_flush_pending_save_writes_immediately(self):
        with patch.object(self.mgr, '_save_state_sync') as sync_write:
            self.mgr.volume = 0.5  # debounced
            self.assertEqual(sync_write.call_count, 0)
            self.mgr.flush_pending_save()
            self.assertEqual(sync_write.call_count, 1)
            # A second flush with no pending work is a no-op.
            self.mgr.flush_pending_save()
            self.assertEqual(sync_write.call_count, 1)


if __name__ == '__main__':
    unittest.main()
