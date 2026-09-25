"""Playback state mirror.

The browser owns playback; this class keeps a durable copy so a reloaded page (or a
second tab) can pick up the queue, the track that was playing, and the position.

The queue follows the Spotify model: a context (album, playlist, search result) plus a
user queue that always plays first.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import json
from typing import Optional
from models import Song
from config import SESSION_CACHE


def _as_song(item):
    if isinstance(item, Song):
        return item
    if isinstance(item, dict):
        d = dict(item)
        if "videoId" in d and "video_id" not in d:
            d["video_id"] = d.pop("videoId")
        if not d.get("video_id"):
            return None
        d.setdefault("title", d["video_id"])
        try:
            return Song(**{k: v for k, v in d.items() if k in Song.__dataclass_fields__})
        except Exception:
            return None
    return None


class PlayerManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            inst = super().__new__(cls)
            inst._context = []
            inst._context_name = ""
            inst._context_index = -1
            inst._current = None
            inst._order = []
            inst._order_pos = 0
            inst._user_queue = []
            inst._history = []
            inst._is_playing = False
            inst._position = 0
            inst._volume = 0.8
            inst._muted = False
            inst._shuffle = False
            inst._repeat = "none"
            inst._settings = {}
            inst._auto_continue = True
            inst._auto_ids = []
            inst._rec_reasons = {}
            cls._instance = inst
        return cls._instance

    # ---------- persistence ----------

    def load_state(self):
        try:
            if os.path.exists(SESSION_CACHE):
                with open(SESSION_CACHE, "r") as f:
                    st = json.load(f)
                self._context = [s for s in (_as_song(x) for x in st.get("context", [])) if s]
                self._context_name = st.get("context_name", "")
                try:
                    self._context_index = int(st.get("context_index", -1))
                except (TypeError, ValueError):
                    self._context_index = -1
                if not 0 <= self._context_index < len(self._context):
                    self._context_index = -1
                self._current = _as_song(st.get("current")) if st.get("current") else None
                if self._context_index < 0:
                    self._current = None
                raw_order = st.get("order", [])
                self._order = [i for i in raw_order
                               if isinstance(i, int) and 0 <= i < len(self._context)]
                try:
                    self._order_pos = int(st.get("order_pos", 0))
                except (TypeError, ValueError):
                    self._order_pos = 0
                if self._order:
                    self._order_pos = max(0, min(self._order_pos, len(self._order) - 1))
                else:
                    self._order_pos = 0
                self._user_queue = [s for s in (_as_song(x) for x in st.get("user_queue", [])) if s]
                self._history = [s for s in (_as_song(x) for x in st.get("history", [])) if s]
                try:
                    self._volume = max(0.0, min(1.0, float(st.get("volume", 0.8))))
                except (TypeError, ValueError):
                    self._volume = 0.8
                self._muted = bool(st.get("muted", False))
                self._shuffle = bool(st.get("shuffle", False))
                raw_repeat = st.get("repeat", "none")
                self._repeat = raw_repeat if raw_repeat in ("none", "all", "one") else "none"
                try:
                    self._position = max(0, int(st.get("position", 0) or 0))
                except (TypeError, ValueError):
                    self._position = 0
                self._is_playing = False  # never auto-resume audio without a user gesture
                raw_settings = st.get("settings", {})
                self._settings = dict(raw_settings) if isinstance(raw_settings, dict) else {}
                self._auto_continue = bool(st.get("auto_continue", True))
                raw_auto = st.get("auto_ids") or []
                self._auto_ids = [x for x in raw_auto if isinstance(x, str) and x]
                raw_reasons = st.get("rec_reasons") or {}
                self._rec_reasons = {str(k): str(v) for k, v in raw_reasons.items()} if isinstance(raw_reasons, dict) else {}
                self.refresh_auto_markers()
        except Exception:
            pass

    def save_state(self):
        try:
            state = {
                "context": [s.__dict__ for s in self._context],
                "context_name": self._context_name,
                "context_index": self._context_index,
                "current": self._current.__dict__ if self._current else None,
                "order": self._order,
                "order_pos": self._order_pos,
                "user_queue": [s.__dict__ for s in self._user_queue],
                "history": [s.__dict__ for s in self._history[-40:]],
                "volume": self._volume,
                "muted": self._muted,
                "shuffle": self._shuffle,
                "repeat": self._repeat,
                "position": self._position,
                "settings": self._settings,
                "auto_continue": self._auto_continue,
                "auto_ids": list(self._auto_ids),
                "rec_reasons": dict(self._rec_reasons),
            }
            d = os.path.dirname(os.path.abspath(SESSION_CACHE))
            if d:
                os.makedirs(d, exist_ok=True)
            tmp = SESSION_CACHE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(state, f)
                f.flush()
                try:
                    os.fsync(f.fileno())
                except Exception:
                    pass
            os.replace(tmp, SESSION_CACHE)
        except Exception:
            pass

    # ---------- context ----------

    def set_context(self, songs, index=0, name="", shuffle=None, order=None):
        self._context = [s for s in (_as_song(x) for x in (songs or [])) if s]
        self._context_name = name or ""
        try:
            index = int(index or 0)
        except (TypeError, ValueError):
            index = 0
        self._context_index = index if 0 <= index < len(self._context) else -1
        if shuffle is not None:
            self._shuffle = bool(shuffle)
        if order:
            clean = [i for i in order if isinstance(i, int) and 0 <= i < len(self._context)]
            self._order = clean or list(range(len(self._context)))
        else:
            self._order = list(range(len(self._context)))
        if self._context_index in self._order:
            self._order_pos = self._order.index(self._context_index)
        else:
            self._order_pos = 0
        if self._context_index >= 0:
            self._current = self._context[self._context_index]
            if not self._history:
                self._history = [self._current]
        # A brand-new lane drops previous auto markers; they belonged to the old seed.
        self._auto_ids = []
        self._rec_reasons = {}
        self.save_state()

    def refresh_auto_markers(self):
        """Keep auto flags consistent with the current context contents."""
        live = {s.video_id for s in self._context}
        self._auto_ids = [v for v in self._auto_ids if v in live]
        self._rec_reasons = {k: v for k, v in self._rec_reasons.items() if k in live}


    def set_order(self, order, pos=None):
        clean = [i for i in (order or []) if isinstance(i, int) and 0 <= i < len(self._context)]
        if clean:
            self._order = clean
            try:
                p = int(pos) if pos is not None else self._order_pos
            except (TypeError, ValueError):
                p = self._order_pos
            self._order_pos = max(0, min(p, len(self._order) - 1))
            # Current must follow the reported order position, else later
            # next()/upcoming() calls diverge from what the client shows.
            ci = self._order[self._order_pos]
            self._context_index = ci
            if 0 <= ci < len(self._context):
                self._current = self._context[ci]
        self.save_state()

    def set_context_index(self, pos_in_order):
        try:
            pos_in_order = int(pos_in_order)
        except (TypeError, ValueError):
            self.save_state()
            return
        if 0 <= pos_in_order < len(self._order):
            self._order_pos = pos_in_order
            self._context_index = self._order[pos_in_order]
        self.save_state()

    @property
    def context(self):
        return self._context

    @property
    def context_name(self):
        return self._context_name

    @property
    def context_index(self):
        return self._context_index

    @property
    def order(self):
        return self._order

    @property
    def order_pos(self):
        return self._order_pos

    @property
    def current_song(self) -> Optional[Song]:
        if self._current is not None:
            return self._current
        if 0 <= self._context_index < len(self._context):
            return self._context[self._context_index]
        return self._history[-1] if self._history else None

    def set_current(self, song):
        """The client tells us which track actually started (context track or user queue item)."""
        s = _as_song(song)
        if s is not None:
            self._current = s
            queue_match = next((i for i, queued in enumerate(self._user_queue) if queued.video_id == s.video_id), None)
            if queue_match is not None:
                self._user_queue.pop(queue_match)
            context_index = next((i for i, item in enumerate(self._context) if item.video_id == s.video_id), None)
            if context_index is not None and context_index in self._order:
                self._context_index = context_index
                self._order_pos = self._order.index(context_index)
            else:
                # Unknown/user-lane track: leave the context pointer alone so
                # upcoming() still shows the context tail after the detour.
                pass
            if not self._history or self._history[-1].video_id != s.video_id:
                self._history.append(s)
                self._history = self._history[-50:]
            self.note_auto_consumed(s.video_id)
            self.save_state()
        return self._current


    @property
    def auto_continue(self):
        return self._auto_continue

    @auto_continue.setter
    def auto_continue(self, val):
        self._auto_continue = bool(val)
        self.save_state()

    @property
    def auto_ids(self):
        return list(self._auto_ids)

    @property
    def rec_reasons(self):
        return dict(self._rec_reasons)

    def append_recommendations(self, tracks):
        """Append recommendation tracks after the current context tail."""
        added = []
        live = {s.video_id for s in self._context}
        live.update(s.video_id for s in self._user_queue)
        if self._current:
            live.add(self._current.video_id)
        for item in tracks or []:
            song = _as_song(item)
            if not song or song.video_id in live:
                continue
            live.add(song.video_id)
            self._context.append(song)
            self._order.append(len(self._context) - 1)
            if song.video_id not in self._auto_ids:
                self._auto_ids.append(song.video_id)
            reason = item.get("reason") if isinstance(item, dict) else ""
            if reason:
                self._rec_reasons[song.video_id] = reason
            added.append(song)
        # Cap the lane so a runaway client/seed cannot grow context unbounded.
        MAX_CONTEXT = 300
        if len(self._context) > MAX_CONTEXT:
            self._context = self._context[-MAX_CONTEXT:]
            self._order = list(range(len(self._context)))
            if self._current:
                try:
                    self._context_index = next(i for i, s in enumerate(self._context)
                                               if s.video_id == self._current.video_id)
                except StopIteration:
                    self._context_index = len(self._context) - 1
            else:
                self._context_index = len(self._context) - 1
            self._order_pos = self._order.index(self._context_index)
            self.refresh_auto_markers()
        self.save_state()
        return added

    def note_auto_consumed(self, video_id):
        if video_id and video_id in self._auto_ids:
            self._auto_ids = [v for v in self._auto_ids if v != video_id]


    # ---------- user queue ----------

    def play_next(self, song):
        s = _as_song(song)
        if s:
            # A manual "play next" is a detour, not a lane change: playing it
            # must not consume context position when the queue drains.
            self._user_queue.insert(0, s)
            self.save_state()
        return self._user_queue

    def add_to_queue(self, song):
        s = _as_song(song)
        if s:
            self._user_queue.append(s)
            self.save_state()
        return self._user_queue

    def remove_user_item(self, index):
        if 0 <= index < len(self._user_queue):
            self._user_queue.pop(index)
            self.save_state()
        return self._user_queue

    def remove_context_item(self, order_position):
        """Remove one upcoming entry from the context order without disturbing current."""
        if self._order_pos < order_position < len(self._order):
            self._order.pop(order_position)
            self.refresh_auto_markers()
            self.save_state()
        return self._order

    def clear_user_queue(self):
        self._user_queue = []
        self.save_state()

    def clear_upcoming(self):
        """Drop everything that has not played yet."""
        self._user_queue = []
        if self._context:
            keep = self._order[: self._order_pos + 1]
            self._order = keep
            self.refresh_auto_markers()
        self.save_state()

    def reorder(self, kind, from_index, to_index):
        if kind == "user":
            lst = self._user_queue
        else:
            # reordering the context: move the entry inside the playback order
            if not (0 <= from_index < len(self._order) and 0 <= to_index < len(self._order)):
                return self._order
            item = self._order.pop(from_index)
            self._order.insert(to_index, item)
            if self._context_index in self._order:
                self._order_pos = self._order.index(self._context_index)
            self.save_state()
            return self._order
        if 0 <= from_index < len(lst) and 0 <= to_index < len(lst):
            item = lst.pop(from_index)
            lst.insert(to_index, item)
            self.save_state()
        return lst

    @property
    def user_queue(self):
        return self._user_queue

    def upcoming(self):
        """User queue first, then the rest of the context in playback order."""
        out = [{"kind": "user", "index": i, "song": s.__dict__} for i, s in enumerate(self._user_queue)]
        for pos in range(self._order_pos + 1, len(self._order)):
            ci = self._order[pos]
            if 0 <= ci < len(self._context):
                song = dict(self._context[ci].__dict__)
                vid = song.get("video_id")
                if vid in self._rec_reasons:
                    song["autoAdded"] = True
                    song["reason"] = self._rec_reasons.get(vid, "")
                out.append({"kind": "context", "index": pos, "song": song})
        return out

    @property
    def history(self):
        return self._history

    # ---------- transport ----------

    def next_song(self, manual=True):
        if self._repeat == "one" and not manual:
            return self.current_song
        if self._user_queue:
            nxt = self._user_queue.pop(0)
            self._current = nxt
            if not self._history or self._history[-1].video_id != nxt.video_id:
                self._history.append(nxt)
                self._history = self._history[-50:]
            self.save_state()
            return nxt
        if self._order:
            # The position denotes the last context track started, not the last
            # user-queue track, so a queued insertion does not consume context.
            npos = self._order_pos + 1
            if npos >= len(self._order):
                if self._repeat == "all":
                    npos = 0
                else:
                    return None
            self._order_pos = npos
            self._context_index = self._order[npos]
            cur = self._context[self._context_index]
            self._current = cur
            if cur:
                if not self._history or self._history[-1].video_id != cur.video_id:
                    self._history.append(cur)
                    self._history = self._history[-50:]
                self.note_auto_consumed(cur.video_id)
            self.save_state()
            return cur
        return None

    def prev_song(self):
        if len(self._history) > 1:
            self._history.pop()
            prev = self._history[-1]
            self._current = prev
            if prev.video_id in [s.video_id for s in self._context]:
                self._context_index = [s.video_id for s in self._context].index(prev.video_id)
                if self._context_index in self._order:
                    self._order_pos = self._order.index(self._context_index)
                else:
                    # Keep the pointer valid for upcoming(): point at the slot
                    # just before the next known context entry.
                    nxt = next((p for p, ci in enumerate(self._order)
                                if ci > self._context_index), len(self._order))
                    self._order_pos = max(-1, nxt - 1)
            self.save_state()
            return prev
        return self.current_song

    @property
    def is_playing(self):
        return self._is_playing

    @is_playing.setter
    def is_playing(self, val):
        self._is_playing = bool(val)
        self.save_state()

    @property
    def position(self):
        return self._position

    @position.setter
    def position(self, val):
        try:
            self._position = max(0, int(val or 0))
        except (TypeError, ValueError):
            self._position = 0
        self.save_state()

    @property
    def volume(self):
        return self._volume

    @volume.setter
    def volume(self, val):
        try:
            self._volume = max(0.0, min(1.0, float(val)))
        except (TypeError, ValueError):
            self._volume = 0.8
        if self._volume > 0:
            self._muted = False
        self.save_state()

    @property
    def muted(self):
        return self._muted

    @muted.setter
    def muted(self, val):
        self._muted = bool(val)
        self.save_state()

    @property
    def shuffle(self):
        return self._shuffle

    @shuffle.setter
    def shuffle(self, val):
        self._shuffle = bool(val)
        self.save_state()

    @property
    def repeat(self):
        return self._repeat

    @repeat.setter
    def repeat(self, val):
        self._repeat = val if val in ("none", "all", "one") else "none"
        self.save_state()

    def get_setting(self, key, default=None):
        return self._settings.get(key, default)

    def set_setting(self, key, value):
        self._settings[key] = value
        self.save_state()
        return self._settings

    def get_status(self):
        return {
            "currentSong": self.current_song.__dict__ if self.current_song else None,
            "isPlaying": self._is_playing,
            "position": self._position,
            "volume": self._volume,
            "muted": self._muted,
            "queueIndex": self._context_index,
            "queueLength": len(self._context),
            "context": [s.__dict__ for s in self._context],
            "order": self._order,
            "orderPos": self._order_pos,
            "contextName": self._context_name,
            "shuffle": self._shuffle,
            "repeat": self._repeat,
            "userQueue": [s.__dict__ for s in self._user_queue],
            "upcoming": self.upcoming(),
            "history": [s.__dict__ for s in self._history[-20:]],
            "settings": self._settings,
            "autoContinue": self._auto_continue,
            "autoIds": list(self._auto_ids),
            "recReasons": dict(self._rec_reasons),
        }
