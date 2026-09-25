import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import aiosqlite
from contextlib import asynccontextmanager
from config import DATABASE_PATH, CACHE_DIR

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), DATABASE_PATH)

@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode = WAL;")
        await db.execute("PRAGMA synchronous = NORMAL;")
        await db.execute("PRAGMA cache_size = -64000;")
        await db.execute("PRAGMA temp_store = MEMORY;")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_local INTEGER DEFAULT 1
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS playlist_songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                thumbnail TEXT,
                duration INTEGER DEFAULT 0,
                position INTEGER DEFAULT 0,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                duration INTEGER DEFAULT 0
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS liked (
                video_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT DEFAULT '',
                thumbnail TEXT DEFAULT '',
                duration INTEGER DEFAULT 0,
                liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS lyrics_cache (
                video_id TEXT PRIMARY KEY,
                plain TEXT DEFAULT '',
                synced TEXT DEFAULT '',
                fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()

async def get_playlists():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM playlists ORDER BY created_at DESC") as cur:
            return [dict(r) for r in await cur.fetchall()]

async def get_playlist_songs(playlist_id):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY position, id", (playlist_id,)) as cur:
            return [dict(r) for r in await cur.fetchall()]

async def create_playlist(name):
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("INSERT INTO playlists (name) VALUES (?)", (name,))
        await db.commit()
        return cur.lastrowid

async def add_song_to_playlist(playlist_id, song_data):
    song_data = song_data if isinstance(song_data, dict) else {}
    try:
        playlist_id = int(playlist_id)
    except (TypeError, ValueError):
        return
    vid = str(song_data.get("video_id", song_data.get("videoId", "")) or "")
    if not vid:
        return
    try:
        duration = max(0, int(song_data.get("duration", 0) or 0))
    except (TypeError, ValueError):
        duration = 0
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_songs WHERE playlist_id = ?", (playlist_id,)) as cur:
            row = await cur.fetchone()
            pos = row[0] if row else 0
        await db.execute("INSERT INTO playlist_songs (playlist_id, video_id, title, artist, thumbnail, duration, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (playlist_id, vid, str(song_data.get("title", "") or ""),
             str(song_data.get("artist", "") or ""), str(song_data.get("thumbnail", "") or ""), duration, pos))
        await db.commit()

async def remove_song_from_playlist(song_id):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM playlist_songs WHERE id = ?", (song_id,))
        await db.commit()

async def delete_playlist(playlist_id):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM playlist_songs WHERE playlist_id = ?", (playlist_id,))
        await db.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
        await db.commit()

async def add_history(video_id, title, artist, duration=0):
    video_id = str(video_id or "")
    if not video_id:
        return
    try:
        duration = max(0, int(duration or 0))
    except (TypeError, ValueError):
        duration = 0
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT INTO history (video_id, title, artist, duration) VALUES (?, ?, ?, ?)", (video_id, str(title or ""), str(artist or ""), duration))
        await db.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY played_at DESC LIMIT 200)")
        await db.commit()

async def get_history(limit=50):
    try:
        limit = max(1, min(200, int(limit or 50)))
    except (TypeError, ValueError):
        limit = 50
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM history ORDER BY played_at DESC LIMIT ?", (limit,)) as cur:
            return [dict(r) for r in await cur.fetchall()]

async def clear_history():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM history")
        await db.commit()

async def save_setting(key, value):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
        await db.commit()

async def get_setting(key):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
            row = await cur.fetchone()
            return row["value"] if row else None

async def add_search_history(query):
    q = (query or "").strip()
    if not q:
        return
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM search_history WHERE query = ?", (q,))
        await db.execute("INSERT INTO search_history (query) VALUES (?)", (q,))
        await db.commit()

async def get_search_history(limit=20):
    try:
        limit = max(1, min(100, int(limit or 20)))
    except (TypeError, ValueError):
        limit = 20
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT DISTINCT query FROM search_history ORDER BY searched_at DESC LIMIT ?", (limit,)) as cur:
            return [dict(r)["query"] for r in await cur.fetchall()]

async def clear_search_history():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM search_history")
        await db.commit()


# ============ LIKED ============

async def get_liked():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM liked ORDER BY liked_at DESC") as cur:
            return [dict(r) for r in await cur.fetchall()]

async def liked_ids():
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT video_id FROM liked") as cur:
            return [r[0] for r in await cur.fetchall()]

async def is_liked(video_id):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT 1 FROM liked WHERE video_id = ?", (video_id,)) as cur:
            return await cur.fetchone() is not None

async def set_liked(video_id, song):
    """Insert or drop a like; returns the resulting state."""
    video_id = str(video_id or "")
    if not video_id:
        return False
    song = song if isinstance(song, dict) else {}
    try:
        duration = max(0, int(song.get("duration", 0) or 0))
    except (TypeError, ValueError):
        duration = 0
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT 1 FROM liked WHERE video_id = ?", (video_id,)) as cur:
            exists = await cur.fetchone() is not None
        if exists:
            await db.execute("DELETE FROM liked WHERE video_id = ?", (video_id,))
            await db.commit()
            return False
        await db.execute(
            "INSERT INTO liked (video_id, title, artist, album, thumbnail, duration) VALUES (?, ?, ?, ?, ?, ?)",
            (video_id, str(song.get("title", "") or ""), str(song.get("artist", "") or ""), str(song.get("album", "") or ""),
             str(song.get("thumbnail", "") or ""), duration))
        await db.commit()
        return True

# ============ LYRICS CACHE ============

async def get_cached_lyrics(video_id):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT plain, synced FROM lyrics_cache WHERE video_id = ?", (video_id,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None

async def cache_lyrics(video_id, plain, synced_json):
    video_id = str(video_id or "")
    if not video_id:
        return
    if not isinstance(synced_json, str):
        try:
            import json as _json
            synced_json = _json.dumps(synced_json or "")
        except Exception:
            synced_json = ""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO lyrics_cache (video_id, plain, synced, fetched_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (video_id, str(plain or ""), synced_json or ""))
        await db.commit()
