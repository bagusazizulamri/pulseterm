import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from dataclasses import asdict, is_dataclass

from config import APP_PORT, APP_HOST, CORS_ORIGINS, CACHE_DIR
from database import (init_db, get_playlists, get_playlist_songs,
    create_playlist, add_song_to_playlist, remove_song_from_playlist,
    delete_playlist, add_history, get_history, clear_history,
    save_setting, get_setting, add_search_history, get_search_history,
    clear_search_history, get_liked, liked_ids, is_liked, set_liked,
    get_cached_lyrics, cache_lyrics)
from api import music, recommend, stream
from api.player import PlayerManager
from models import Song

import asyncio
import httpx
from fastapi import WebSocket, WebSocketDisconnect

player_mgr = PlayerManager()

class RealtimeHub:
    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

hub = RealtimeHub()

def broadcast_state():
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(hub.broadcast({"type": "status", "data": player_mgr.get_status()}))
    except RuntimeError:
        pass

_proxy_client: httpx.AsyncClient = None

def get_proxy_client() -> httpx.AsyncClient:
    global _proxy_client
    if _proxy_client is None or _proxy_client.is_closed:
        limits = httpx.Limits(max_keepalive_connections=30, max_connections=100, keepalive_expiry=60.0)
        _proxy_client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(30.0, connect=10.0, read=None),
            limits=limits,
        )
    return _proxy_client

# Seed of the lane the continuing playlist is extending. Stored server-side so
# background "keep it going" calls reuse the exact song the user clicked, not
# whatever happens to be current when the request arrives.
_continue_seed = {"video_id": "", "song": None}

frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    player_mgr.load_state()
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(os.path.join(frontend_dir, "assets"), exist_ok=True)
    get_proxy_client()
    yield
    global _proxy_client
    if _proxy_client is not None and not _proxy_client.is_closed:
        await _proxy_client.aclose()

app = FastAPI(title="PulseTerm", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

os.makedirs(os.path.join(frontend_dir, "assets"), exist_ok=True)

def _ser(obj):
    if is_dataclass(obj):
        return asdict(obj)
    if isinstance(obj, list):
        return [_ser(x) for x in obj]
    return obj

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}

@app.get("/api/search")
async def search(q: str = Query(..., min_length=1), type: str = Query("all"), limit: int = Query(40, ge=1, le=100)):
    results = await music.search(q, type, limit=limit)
    await add_search_history(q)
    return {"success": True, "data": {"results": _ser(results.results), "query": results.query}}

@app.get("/api/search/history")
async def get_search_hist():
    return {"success": True, "data": await get_search_history()}

@app.delete("/api/search/history")
async def clear_search_hist():
    await clear_search_history()
    return {"success": True}

@app.get("/api/search/suggestions")
async def suggestions(q: str = Query(...)):
    return {"success": True, "data": await music.search_suggestions(q)}

@app.get("/api/artist/{artist_id}")
async def browse_artist(artist_id: str):
    full = await music.browse_artist_full(artist_id)
    res = await music.browse_artist(artist_id)
    return {"success": True, "data": {"results": _ser(res.results), "query": artist_id,
        "name": full.get("name", ""), "description": full.get("description", ""),
        "thumbnails": full.get("thumbnails", []), "subs": full.get("subs", "")}}

@app.get("/api/album/{album_id}")
async def get_album(album_id: str):
    res = await music.get_album(album_id)
    return {"success": True, "data": {"results": _ser(res.results), "query": album_id}}

@app.get("/api/playlist/{playlist_id}")
async def get_playlist(playlist_id: str):
    res = await music.get_playlist(playlist_id)
    return {"success": True, "data": {"results": _ser(res.results), "query": playlist_id, "name": getattr(res, "name", "") or getattr(res, "title", "") or playlist_id}}

@app.get("/api/lyrics/{video_id}")
async def get_lyrics(video_id: str, timed: int = 0, refresh: int = 0):
    """Lyrics from cache when possible; `timed=1` adds per-line timings and romanization."""
    import json as _json
    cached = None if refresh else await get_cached_lyrics(video_id)
    if cached is None:
        data = await music.get_song_lyrics_full(video_id)
        await cache_lyrics(video_id, data.get("plain", ""), _json.dumps(data.get("synced", [])))
        cached = {"plain": data.get("plain", ""), "synced": _json.dumps(data.get("synced", []))}
    try:
        synced = _json.loads(cached.get("synced") or "[]")
    except Exception:
        synced = []

    # Upgrade old cached lyrics without romanization
    if synced and not any("roman" in x for x in synced if isinstance(x, dict)):
        try:
            from api.translit import enrich_lyrics
            enriched = enrich_lyrics({"plain": cached.get("plain", ""), "synced": synced})
            synced = enriched.get("synced", synced)
            has_roman = enriched.get("has_roman", False)
            script = enriched.get("script", "latin")
            script_label = enriched.get("script_label", "Latin")
            await cache_lyrics(video_id, cached.get("plain", ""), _json.dumps(synced))
        except Exception:
            has_roman = False
            script = "latin"
            script_label = "Latin"
    else:
        has_roman = any(bool(x.get("roman")) for x in synced if isinstance(x, dict))
        script = next((x.get("script") for x in synced if isinstance(x, dict) and x.get("roman")), "latin")
        script_label = "Romaja" if script == "korean" else ("Romaji" if script == "japanese" else ("Pinyin" if script == "chinese" else ("Translit" if script == "cyrillic" else "Latin")))

    out = {
        "lyrics": cached.get("plain", ""),
        "hasRoman": has_roman,
        "script": script,
        "scriptLabel": script_label
    }
    if timed:
        out["synced"] = synced
    return {"success": True, "data": out}

@app.get("/api/song/{video_id}")
async def get_song(video_id: str):
    song = await music.get_song_details(video_id)
    return {"success": True, "data": _ser(song) if song else None}

@app.get("/api/trending")
async def trending():
    return {"success": True, "data": _ser((await music.get_home()).get("trending", []))}

@app.get("/api/player/stream-url/{video_id}")
async def get_stream(video_id: str, refresh: int = 0):
    info = await stream.get_stream_info_async(video_id, force=bool(refresh))
    if not info or not info.get("url"):
        return {"success": False, "error": "Could not resolve stream URL", "data": {"url": "", "videoId": video_id}}
    # Same-origin proxied URL (avoids googlevideo CORS/302 issues in browser).
    proxy = "/api/player/audio/" + video_id
    return {"success": True, "data": {
        "url": proxy,
        "videoId": video_id,
        "direct": info["url"],
        "offline": bool(stream.offline_path(video_id)),
        "codec": info.get("codec", "opus"),
        "bitrate": info.get("bitrate", 160),
        "sampleRate": info.get("sampleRate", 48000),
        "formatId": info.get("formatId", "251"),
        "tier": info.get("tier", "HQ"),
        "qualityLabel": info.get("qualityLabel", "[HQ · OPUS · 160K · 48KHZ]")
    }}


@app.post("/api/player/prepare")
async def prepare_streams(body: dict = None):
    """Warm the URL cache for tracks that are about to play."""
    ids = body.get("videoIds") if isinstance(body, dict) else None
    if not isinstance(ids, list):
        ids = []
    return {"success": True, "data": await stream.prepare(ids)}


@app.get("/api/player/stats")
async def stream_stats():
    return {"success": True, "data": stream.cache_stats()}


@app.api_route("/api/player/audio/{video_id}", methods=["GET", "HEAD"])
async def proxy_audio(video_id: str, request: Request):
    import httpx
    from fastapi.responses import StreamingResponse

    # A downloaded copy is the cheapest source and seeks instantly.
    local = stream.offline_path(video_id)
    if local and request.method in ("GET", "HEAD"):
        import mimetypes
        mtype = mimetypes.guess_type(local)[0] or "audio/mp4"
        return FileResponse(local, media_type=mtype, filename=os.path.basename(local),
                            headers={"Cache-Control": "no-cache", "Accept-Ranges": "bytes"})

    range_header = request.headers.get("range")
    is_head = request.method == "HEAD"
    upstream = None
    client = get_proxy_client()

    # Two attempts: an expired googlevideo URL answers 403, so re-resolve once.
    for attempt in (1, 2):
        url = await stream.get_stream_url_async(video_id, force=(attempt == 2))
        if not url:
            break
        headers = {"User-Agent": stream.UA}
        if is_head:
            headers["Range"] = "bytes=0-0"
        elif range_header:
            headers["Range"] = range_header
        try:
            upstream = await client.send(client.build_request("GET", url, headers=headers), stream=True)
        except Exception as e:
            return JSONResponse({"success": False, "error": "Upstream fetch failed: " + str(e)[:200]}, status_code=502)
        if upstream.status_code in (200, 206, 416):
            break
        if attempt == 2 or upstream.status_code not in (403, 410):
            body = await upstream.aread()
            await upstream.aclose()
            return JSONResponse({"success": False, "error": "Upstream status " + str(upstream.status_code)}, status_code=502)
        await upstream.aclose()

    if upstream is None:
        return JSONResponse({"success": False, "error": "Could not resolve stream URL"}, status_code=502)

    # Range beyond the end of the track: tell the player the real size.
    if upstream.status_code == 416:
        cr = upstream.headers.get("content-range", "")
        await upstream.aclose()
        return Response(status_code=416, headers={"Content-Range": cr} if cr else None)

    ctype = upstream.headers.get("content-type", "audio/webm")
    resp_headers = {"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"}
    content_range = upstream.headers.get("content-range")
    if content_range:
        resp_headers["Content-Range"] = content_range
    if is_head:
        # Report the full track length, taken from "bytes 0-0/total".
        total = None
        if content_range and "/" in content_range:
            total = content_range.split("/")[-1]
        if total and total.isdigit():
            resp_headers["Content-Length"] = total
        await upstream.aclose()
        return Response(status_code=200 if upstream.status_code != 206 else 206,
                        media_type=ctype, headers=resp_headers)

    length = upstream.headers.get("content-length")
    if length:
        resp_headers["Content-Length"] = length

    async def gen():
        try:
            async for chunk in upstream.aiter_bytes(chunk_size=131072):
                yield chunk
        finally:
            try:
                await upstream.aclose()
            except Exception:
                pass

    return StreamingResponse(gen(), status_code=206 if upstream.status_code == 206 else 200,
                             media_type=ctype, headers=resp_headers)

@app.get("/api/player/status")
async def player_status():
    return {"success": True, "data": player_mgr.get_status()}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        await websocket.send_json({"type": "status", "data": player_mgr.get_status()})
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type") if isinstance(data, dict) else None
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "sync":
                await hub.broadcast({"type": "status", "data": player_mgr.get_status()})
    except (WebSocketDisconnect, Exception):
        hub.disconnect(websocket)


def _to_songs(items):
    out = []
    for s in items or []:
        if isinstance(s, Song):
            out.append(s)
            continue
        if not isinstance(s, dict):
            continue
        d = dict(s)
        if "videoId" in d and "video_id" not in d:
            d["video_id"] = d.pop("videoId")
        try:
            out.append(Song(**{k: v for k, v in d.items() if k in Song.__dataclass_fields__}))
        except Exception:
            continue
    return out


@app.post("/api/player/play")
async def play_song(body: dict = None):
    body = body or {}
    songs = _to_songs(body.get("songs"))
    if songs:
        try:
            idx = int(body.get("index") or 0)
        except (TypeError, ValueError):
            idx = 0
        idx = max(0, min(idx, len(songs) - 1))
        player_mgr.set_context(songs, idx, name=body.get("name", ""),
                               shuffle=body.get("shuffle"), order=body.get("order"))
        seed_song = songs[idx] if 0 <= idx < len(songs) else songs[0]
        _continue_seed["video_id"] = seed_song.video_id
        _continue_seed["song"] = _seed_dict(seed_song)
    elif body.get("song"):
        one = _to_songs([body["song"]])
        if one:
            player_mgr.set_context(one, 0, name=body.get("name", ""))
            _continue_seed["video_id"] = one[0].video_id
            _continue_seed["song"] = _seed_dict(one[0])
    player_mgr.is_playing = True
    broadcast_state()
    return {"success": True, "data": player_mgr.get_status()}


@app.post("/api/player/current")
async def set_current(body: dict = None):
    """Tell the mirror which track actually started playing."""
    body = body if isinstance(body, dict) else {}
    song = body.get("song") if isinstance(body.get("song"), dict) else None
    if song:
        player_mgr.set_current(song)
        broadcast_state()
    return {"success": True, "data": player_mgr.get_status()}


@app.post("/api/player/order")
async def set_order(body: dict = None):
    body = body if isinstance(body, dict) else {}
    player_mgr.set_order(body.get("order"), body.get("pos"))
    broadcast_state()
    return {"success": True, "data": player_mgr.get_status()}


@app.post("/api/player/context/remove")
async def remove_context_track(body: dict = None):
    body = body if isinstance(body, dict) else {}
    try:
        index = int(body.get("index", -1))
    except (TypeError, ValueError):
        index = -1
    player_mgr.remove_context_item(index)
    broadcast_state()
    return {"success": True, "data": player_mgr.upcoming()}


@app.get("/api/player/queue")
async def get_queue():
    return {"success": True, "data": {"userQueue": [s.__dict__ for s in player_mgr.user_queue],
                                      "upcoming": player_mgr.upcoming(),
                                      "contextName": player_mgr.context_name,
                                      "history": [s.__dict__ for s in player_mgr.history[-20:]],
                                      "autoContinue": player_mgr.auto_continue,
                                      "autoIds": player_mgr.auto_ids,
                                      "recReasons": player_mgr.rec_reasons,
                                      "context": [s.__dict__ for s in player_mgr.context],
                                      "order": list(player_mgr._order),
                                      "orderPos": player_mgr._order_pos}}


@app.post("/api/player/queue")
async def queue_add(body: dict = None):
    body = body if isinstance(body, dict) else {}
    song = body.get("song") if isinstance(body.get("song"), dict) else None
    if body.get("action") == "next":
        player_mgr.play_next(song)
    else:
        player_mgr.add_to_queue(song)
    broadcast_state()
    return {"success": True, "data": player_mgr.upcoming()}


@app.delete("/api/player/queue")
async def queue_remove(kind: str = "user", index: int = -1):
    if kind not in ("user", "context"):
        kind = "user"
    try:
        index = int(index)
    except (TypeError, ValueError):
        index = -1
    if index < 0:
        player_mgr.clear_user_queue()
    elif kind == "user":
        player_mgr.remove_user_item(index)
    else:
        player_mgr.remove_context_item(index)
    broadcast_state()
    return {"success": True, "data": player_mgr.upcoming()}


@app.put("/api/player/queue")
async def queue_reorder(body: dict = None):
    body = body if isinstance(body, dict) else {}
    kind = body.get("kind", "user")
    if kind not in ("user", "context"):
        kind = "user"
    try:
        frm = int(body.get("from", 0))
    except (TypeError, ValueError):
        frm = 0
    try:
        to = int(body.get("to", 0))
    except (TypeError, ValueError):
        to = 0
    player_mgr.reorder(kind, frm, to)
    broadcast_state()
    return {"success": True, "data": player_mgr.upcoming()}

@app.get("/api/player/offline")
async def offline_list():
    return {"success": True, "data": stream.list_offline()}


@app.post("/api/player/offline/{video_id}")
async def offline_save(video_id: str, force: int = 0):
    path = await stream.download_song_async(video_id, force=bool(force))
    if not path:
        return {"success": False, "error": "Download failed"}
    return {"success": True, "data": {"videoId": video_id, "file": os.path.basename(path),
                                      "size": os.path.getsize(path)}}


@app.delete("/api/player/offline/{video_id}")
async def offline_remove(video_id: str):
    stream.remove_offline(video_id)
    return {"success": True, "data": stream.list_offline()}







def _seed_dict(song):
    if song is None:
        return {}
    if hasattr(song, "__dict__"):
        d = dict(song.__dict__)
    elif isinstance(song, dict):
        d = dict(song)
    else:
        return {}
    try:
        duration = max(0, int(d.get("duration", 0) or 0))
    except (TypeError, ValueError):
        duration = 0
    is_vid = bool(d.get("isVideo") or d.get("is_video") or d.get("resultType") == "video" or d.get("result_type") == "video")
    vt = str(d.get("videoType") or d.get("video_type") or "")
    if vt and vt != "MUSIC_VIDEO_TYPE_ATV":
        is_vid = True
    return {
        "videoId": str(d.get("videoId") or d.get("video_id") or ""),
        "title": str(d.get("title", "") or ""),
        "artist": str(d.get("artist", "") or ""),
        "album": str(d.get("album", "") or ""),
        "thumbnail": str(d.get("thumbnail", "") or ""),
        "duration": duration,
        "isVideo": is_vid,
        "is_video": is_vid,
        "videoType": vt,
        "resultType": "video" if is_vid else "song",
    }


def _norm_recommend_input(item):
    if item is None:
        return None
    if hasattr(item, "__dict__"):
        d = dict(item.__dict__)
    elif isinstance(item, dict):
        d = dict(item)
    else:
        return None
    vid = str(d.get("videoId") or d.get("video_id") or "")
    if not vid:
        return None
    try:
        duration = max(0, int(d.get("duration", 0) or 0))
    except (TypeError, ValueError):
        duration = 0
    return {
        "video_id": vid,
        "title": str(d.get("title", "") or vid),
        "artist": str(d.get("artist", "") or ""),
        "album": str(d.get("album", "") or ""),
        "thumbnail": str(d.get("thumbnail", "") or ""),
        "duration": duration,
        "auto_added": True,
        "reason": str(d.get("reason", "") or ""),
    }


@app.get("/api/recommendations/{video_id}")
async def recommendations(video_id: str, limit: int = 10):
    seed = None
    if _continue_seed.get("video_id") == video_id and _continue_seed.get("song"):
        seed = _seed_dict(_continue_seed["song"])
    try:
        limit = max(1, min(25, int(limit or 10)))
    except (TypeError, ValueError):
        limit = 10
    tracks = await recommend.get_recommendations(video_id, seed=seed, limit=limit)
    return {"success": True, "data": {"seed": seed or {"videoId": video_id}, "tracks": tracks}}


@app.get("/api/recommended/playlists")
async def recommended_playlists():
    data = await recommend.get_recommended_playlists()
    return {"success": True, "data": data}


@app.get("/api/player/continue")
async def continue_state():
    return {"success": True, "data": {"enabled": player_mgr.auto_continue}}


@app.post("/api/player/continue")
async def continue_toggle(body: dict = None):
    body = body if isinstance(body, dict) else {}
    if "enabled" in body:
        player_mgr.auto_continue = bool(body["enabled"])
    return {"success": True, "data": {"enabled": player_mgr.auto_continue}}


@app.post("/api/player/extend")
async def extend_context(body: dict = None):
    """Append genre/vibe-matched recommendations after the context tail."""
    body = body if isinstance(body, dict) else {}
    try:
        limit = max(1, min(50, int(body.get("limit", 20) or 20)))
    except (TypeError, ValueError):
        limit = 20
    seed = body.get("seed") if isinstance(body.get("seed"), dict) else {}
    seed_vid = seed.get("videoId") or seed.get("video_id") or ""
    current = player_mgr.current_song
    if not seed_vid:
        if player_mgr.context:
            tail = player_mgr.context[-1]
            seed_vid = tail.video_id
            seed = _seed_dict(tail)
        elif current:
            seed_vid = current.video_id
            seed = _seed_dict(current)
    if not seed_vid:
        return {"success": False, "error": "No seed track"}
    exclude = {s.video_id for s in player_mgr.context}
    exclude.update(s.video_id for s in player_mgr.user_queue)
    if current:
        exclude.add(current.video_id)
    for item in player_mgr.history[-50:]:
        exclude.add(item.video_id)
    tracks = await recommend.get_recommendations(seed_vid, seed=seed, limit=limit,
                                                 exclude=exclude)
    # If the provided seed returned no tracks because all candidates are exhausted,
    # fallback to the tail track of the context or the current song
    if not tracks and player_mgr.context:
        tail = player_mgr.context[-1]
        if tail.video_id != seed_vid:
            tail_seed = _seed_dict(tail)
            tracks = await recommend.get_recommendations(tail.video_id, seed=tail_seed,
                                                         limit=limit, exclude=exclude)
            if tracks:
                seed = tail_seed
                seed_vid = tail.video_id
    if not tracks and current and current.video_id != seed_vid:
        cur_seed = _seed_dict(current)
        tracks = await recommend.get_recommendations(current.video_id, seed=cur_seed,
                                                     limit=limit, exclude=exclude)
        if tracks:
            seed = cur_seed
            seed_vid = current.video_id
    added = player_mgr.append_recommendations([_norm_recommend_input(t) for t in tracks])
    return {"success": True, "data": {
        "added": [s.__dict__ for s in added],
        "seed": seed or {"videoId": seed_vid},
        "status": player_mgr.get_status(),
    }}


@app.post("/api/player/pause")
async def pause_playback():
    player_mgr.is_playing = False
    broadcast_state()
    return {"success": True, "data": player_mgr.get_status()}

@app.post("/api/player/toggle")
async def toggle_playback(body: dict = None):
    body = body if isinstance(body, dict) else {}
    if "isPlaying" in body:
        # Explicit sync from the client (authoritative); bare calls flip.
        player_mgr.is_playing = bool(body["isPlaying"])
    else:
        player_mgr.is_playing = not player_mgr.is_playing
    broadcast_state()
    return {"success": True, "data": player_mgr.get_status()}

@app.post("/api/player/next")
async def nxt():
    nxt_song = player_mgr.next_song(manual=True)
    broadcast_state()
    return {"success": True, "data": {"song": nxt_song.__dict__ if nxt_song else None,
                                      "status": player_mgr.get_status()}}

@app.post("/api/player/prev")
async def prv():
    back = player_mgr.prev_song()
    broadcast_state()
    return {"success": True, "data": {"song": back.__dict__ if back else None,
                                      "status": player_mgr.get_status()}}

@app.post("/api/player/position")
async def seek(body: dict = None):
    body = body if isinstance(body, dict) else {}
    try:
        player_mgr.position = max(0, int(body.get("position", 0) or 0))
    except (TypeError, ValueError):
        player_mgr.position = 0
    return {"success": True}


@app.post("/api/player/volume")
async def volume(body: dict = None):
    body = body if isinstance(body, dict) else {}
    if "muted" in body:
        player_mgr.muted = body["muted"]
    if "volume" in body:
        try:
            player_mgr.volume = max(0.0, min(1.0, float(body["volume"])))
        except (TypeError, ValueError):
            pass
    broadcast_state()
    return {"success": True, "data": {"volume": player_mgr.volume, "muted": player_mgr.muted}}


@app.post("/api/player/shuffle")
async def shuffle(body: dict = None):
    body = body if isinstance(body, dict) else {}
    player_mgr.shuffle = body.get("shuffle", False)
    broadcast_state()
    return {"success": True, "data": player_mgr.get_status()}


@app.post("/api/player/repeat")
async def repeat(body: dict = None):
    body = body if isinstance(body, dict) else {}
    player_mgr.repeat = body.get("repeat", "none")
    broadcast_state()
    return {"success": True, "data": player_mgr.get_status()}

@app.get("/api/playlists")
async def playlists():
    pls = await get_playlists()
    out = []
    for pl in pls:
        out.append({**pl, "songs": await get_playlist_songs(pl["id"])})
    return {"success": True, "data": out}

@app.post("/api/playlists")
async def create_pl(name: str = Query(...)):
    name = (name or "").strip()
    if not name:
        return {"success": False, "error": "Missing playlist name"}
    if len(name) > 120:
        name = name[:120]
    pid = await create_playlist(name)
    pls = await get_playlists()
    match = [p for p in pls if p["id"] == pid]
    return {"success": True, "data": match[0] if match else {"id": pid, "name": name}}

@app.post("/api/playlists/{playlist_id}/songs")
async def add_to_playlist(playlist_id: int, body: dict = None):
    body = body if isinstance(body, dict) else {}
    vid = str(body.get("video_id", body.get("videoId", "")) or "")
    if not vid:
        return {"success": False, "error": "Missing video_id"}
    try:
        duration = max(0, int(body.get("duration", 0) or 0))
    except (TypeError, ValueError):
        duration = 0
    await add_song_to_playlist(playlist_id, {
        "video_id": vid,
        "title": str(body.get("title", "") or ""),
        "artist": str(body.get("artist", "") or ""),
        "thumbnail": str(body.get("thumbnail", "") or ""),
        "duration": duration,
    })
    return {"success": True, "data": await get_playlist_songs(playlist_id)}

@app.delete("/api/playlists/{playlist_id}/songs/{song_id}")
async def remove_from_playlist(playlist_id: int, song_id: int):
    await remove_song_from_playlist(song_id)
    return {"success": True, "data": await get_playlist_songs(playlist_id)}

@app.delete("/api/playlists/{playlist_id}")
async def delete_pl(playlist_id: int):
    await delete_playlist(playlist_id)
    return {"success": True}

@app.get("/api/library/history")
async def library_history():
    return {"success": True, "data": await get_history()}

@app.post("/api/library/history")
async def library_history_add(body: dict = None):
    body = body if isinstance(body, dict) else {}
    vid = str(body.get("video_id", body.get("videoId", "")) or "")
    title = str(body.get("title", "") or "")
    artist = str(body.get("artist", "") or "")
    try:
        duration = max(0, int(body.get("duration", 0) or 0))
    except (TypeError, ValueError):
        duration = 0
    if not vid:
        return {"success": False, "error": "Missing video_id"}
    await add_history(vid, title, artist, duration)
    return {"success": True}

@app.delete("/api/library/history")
async def clear_hist():
    await clear_history()
    return {"success": True}

@app.get("/api/library/liked")
async def liked_songs():
    return {"success": True, "data": await get_liked()}


@app.get("/api/library/liked/ids")
async def liked_ids_route():
    return {"success": True, "data": await liked_ids()}


@app.post("/api/library/liked/{video_id}")
async def toggle_liked(video_id: str, body: dict = None):
    body = body if isinstance(body, dict) else {}
    try:
        duration = max(0, int(body.get("duration", 0) or 0))
    except (TypeError, ValueError):
        duration = 0
    song = {
        "title": str(body.get("title", "") or ""),
        "artist": str(body.get("artist", "") or ""),
        "album": str(body.get("album", "") or ""),
        "thumbnail": str(body.get("thumbnail", "") or ""),
        "duration": duration,
    }
    state = await set_liked(video_id, song)
    return {"success": True, "data": {"videoId": video_id, "liked": state}}


@app.delete("/api/library/liked/{video_id}")
async def unlike(video_id: str):
    if await is_liked(video_id):
        await set_liked(video_id, {})
    return {"success": True, "data": {"videoId": video_id, "liked": False}}


# Settings kept in a plain key/value table. Types are declared once, here,
# so the client can send `{ "crossfade": 6 }` and read back a number.
TOGGLE_KEYS = ("shuffle", "skipSilence", "normalize", "gapless")
NUMBER_KEYS = ("volume", "crossfade", "sleepMinutes", "speed")
TEXT_KEYS = ("theme", "repeat", "lastContext")

SETTINGS_DEFAULTS = {"theme": "dark", "volume": 0.8, "shuffle": False, "repeat": "none",
                     "crossfade": 0.0, "sleepMinutes": 0, "speed": 1.0,
                     "skipSilence": False, "normalize": False, "gapless": True}


@app.get("/api/settings")
async def get_settings():
    out = dict(SETTINGS_DEFAULTS)
    for key, default in SETTINGS_DEFAULTS.items():
        raw = await get_setting(key)
        if raw is None:
            continue
        try:
            if isinstance(default, bool):
                out[key] = raw == "true"
            elif isinstance(default, (int, float)):
                out[key] = float(raw) if isinstance(default, float) else int(raw)
            else:
                out[key] = raw
        except Exception:
            out[key] = default
    return {"success": True, "data": out}


@app.post("/api/settings")
async def update_settings(body: dict = None):
    body = body if isinstance(body, dict) else {}
    for key in TOGGLE_KEYS:
        if key in body:
            await save_setting(key, "true" if body[key] else "false")
    for key in NUMBER_KEYS:
        if key in body:
            try:
                float(body[key])
            except (TypeError, ValueError):
                continue
            await save_setting(key, str(body[key]))
    for key in TEXT_KEYS:
        if key in body:
            await save_setting(key, str(body[key]))
    if "volume" in body:
        player_mgr.volume = body["volume"]
    if "shuffle" in body:
        player_mgr.shuffle = body["shuffle"]
    if "repeat" in body:
        player_mgr.repeat = body["repeat"]
    settings = await get_settings()
    return {"success": True, "data": settings["data"]}

app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")

FAVICON_PATH = os.path.join(frontend_dir, "assets", "favicon.svg")


@app.get("/favicon.ico")
async def favicon():
    if os.path.exists(FAVICON_PATH):
        return FileResponse(FAVICON_PATH, media_type="image/svg+xml")
    return Response(status_code=204)


@app.get("/")
async def root():
    return FileResponse(os.path.join(frontend_dir, "index.html"))

@app.get("/css/{path:path}")
async def serve_css(path: str):
    base = os.path.realpath(os.path.join(frontend_dir, "css"))
    fp = os.path.realpath(os.path.join(base, path))
    if fp == base or not fp.startswith(base + os.sep):
        return Response(status_code=404)
    if os.path.isfile(fp):
        return FileResponse(fp)
    return FileResponse(os.path.join(frontend_dir, "index.html"))

@app.get("/js/{path:path}")
async def serve_js(path: str):
    base = os.path.realpath(os.path.join(frontend_dir, "js"))
    fp = os.path.realpath(os.path.join(base, path))
    if fp == base or not fp.startswith(base + os.sep):
        return Response(status_code=404)
    if os.path.isfile(fp):
        return FileResponse(fp)
    return FileResponse(os.path.join(frontend_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=APP_HOST, port=APP_PORT)
