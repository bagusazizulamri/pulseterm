import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
from typing import Optional
from ytmusicapi import YTMusic
from config import YTMUSIC_HEADER, CACHE_DIR
from models import Song, SearchResult

_cls_cache = {}

FILTER_MAP = {
    "all": None, "song": "songs", "songs": "songs",
    "video": "videos", "videos": "videos",
    "album": "albums", "albums": "albums",
    "artist": "artists", "artists": "artists",
    "playlist": "playlists", "playlists": "playlists",
    "podcast": "podcasts", "podcasts": "podcasts",
    "episode": "episodes", "episodes": "episodes",
}

def get_ytmusic():
    global _cls_cache
    if "default" not in _cls_cache:
        try:
            auth_file = os.path.join(CACHE_DIR, "auth.json")
            if os.path.exists(auth_file):
                _cls_cache["default"] = YTMusic(auth_file)
            else:
                _cls_cache["default"] = YTMusic()
        except Exception:
            _cls_cache["default"] = YTMusic()
    return _cls_cache["default"]

def clear_cache():
    global _cls_cache
    _cls_cache = {}

def extract_video_id(url_or_id: str) -> str:
    if "youtube.com" in url_or_id or "youtu.be" in url_or_id:
        if "v=" in url_or_id:
            return url_or_id.split("v=")[1].split("&")[0]
        if "youtu.be/" in url_or_id:
            return url_or_id.split("youtu.be/")[1].split("?")[0]
    return url_or_id

def extract_playlist_id(url_or_id: str) -> Optional[str]:
    if not url_or_id or not isinstance(url_or_id, str):
        return None
    s = url_or_id.strip()
    if "list=" in s:
        m = re.search(r'[?&]list=([a-zA-Z0-9_-]+)', s)
        if m:
            return m.group(1)
    s = s.strip("\"' \t\r\n")
    if re.match(r'^(PL|VL|RD|OLAK|UU|FL|TL|LM|CLAK|RMM)[a-zA-Z0-9_-]+$', s):
        return s
    return None

def _ytdlp_cmd():
    exe = shutil.which("yt-dlp")
    if exe:
        return [exe]
    cand = os.path.join(os.path.dirname(sys.executable), "yt-dlp")
    if os.path.exists(cand):
        return [cand]
    return [sys.executable, "-m", "yt_dlp"]

def _anames(artists) -> str:
    if not artists:
        return ""
    out = []
    for a in artists:
        if isinstance(a, dict):
            out.append(a.get("name", ""))
        elif isinstance(a, str):
            out.append(a)
    return ", ".join([x for x in out if x])

def _hd_url(url: str) -> str:
    if not url or not isinstance(url, str):
        return ""
    if "googleusercontent.com" in url or "ggpht.com" in url:
        if "=w" in url or "=s" in url:
            url = re.sub(r'=w\d+-h\d+[^?]*', '=w800-h800-l90-rj', url)
            url = re.sub(r'=s\d+[^?]*', '=s800', url)
        else:
            url += "=w800-h800-l90-rj"
    return url

def _thumb(item) -> str:
    try:
        th = item.get("thumbnails") if isinstance(item, dict) else None
        if th and isinstance(th, list):
            for t in reversed(th):
                if isinstance(t, dict) and t.get("url"):
                    return _hd_url(t["url"])
    except Exception:
        pass
    return ""

def _aname(album) -> str:
    if not album:
        return ""
    if isinstance(album, dict):
        return album.get("name", "")
    if isinstance(album, list) and album:
        f = album[0]
        return f.get("name", "") if isinstance(f, dict) else str(f)
    return str(album)

def _dur(item) -> int:
    if isinstance(item, dict):
        if isinstance(item.get("duration_seconds"), int):
            return item["duration_seconds"]
        d = item.get("duration")
        if isinstance(d, int):
            return d
        if isinstance(d, str) and ":" in d:
            try:
                t = 0
                for p in d.split(":"):
                    t = t * 60 + int(p)
                return t
            except Exception:
                return 0
    return 0

def _from_item(item: dict):
    rt = item.get("resultType", "")
    vt = item.get("videoType", "")
    is_vid = (rt == "video") or (bool(vt) and vt != "MUSIC_VIDEO_TYPE_ATV")
    if rt == "song":
        return Song(video_id=item.get("videoId", ""), title=item.get("title", ""), artist=_anames(item.get("artists")), album=_aname(item.get("album")), thumbnail=_thumb(item), duration=_dur(item), video_type=vt or "MUSIC_VIDEO_TYPE_ATV", result_type="song", is_video=False)
    if rt == "video":
        return Song(video_id=item.get("videoId", ""), title=item.get("title", ""), artist=_anames(item.get("artists")), thumbnail=_thumb(item), duration=_dur(item), video_type=vt or "MUSIC_VIDEO_TYPE_OMV", result_type="video", is_video=True)
    if rt == "playlist":
        return Song(video_id=item.get("playlistId", item.get("browseId", "")), title=item.get("title", ""), artist=item.get("author", "") or "", album="playlist", thumbnail=_thumb(item), duration=0, result_type="playlist", is_video=False)
    if rt == "artist":
        return Song(video_id=item.get("browseId", ""), title=item.get("artist", item.get("title", "")), artist="artist", thumbnail=_thumb(item), duration=0, result_type="artist", is_video=False)
    if rt == "album":
        return Song(video_id=item.get("browseId", ""), title=item.get("title", ""), artist=_anames(item.get("artists")), album="album", thumbnail=_thumb(item), duration=_dur(item), result_type="album", is_video=False)
    vid = item.get("videoId") or item.get("browseId") or item.get("playlistId") or ""
    if vid:
        return Song(video_id=vid, title=item.get("title", vid), artist=_anames(item.get("artists")), thumbnail=_thumb(item), duration=_dur(item), video_type=vt, result_type=rt or ("video" if is_vid else "song"), is_video=is_vid)
    return None

async def search(query: str, filter_type: str = "all", limit: int = 40) -> SearchResult:
    query = (query or "").strip()
    if not query:
        return SearchResult(results=[], query="")
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        ytf = FILTER_MAP.get((filter_type or "all").lower(), None)
        lim = max(1, min(100, int(limit or 40)))
        if ytf is None:
            res = await loop.run_in_executor(None, lambda: yt.search(query, limit=lim))
        else:
            res = await loop.run_in_executor(None, lambda: yt.search(query, filter=ytf, limit=lim))
        songs = []
        for it in res or []:
            if not isinstance(it, dict):
                continue
            s = _from_item(it)
            if s is not None:
                songs.append(s)
        return SearchResult(results=songs, query=query)
    except Exception:
        return SearchResult(results=[], query=query)

async def search_suggestions(query: str):
    query = (query or "").strip()
    if not query:
        return []
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: yt.get_search_suggestions(query))
    except Exception:
        return []

async def browse_artist(artist_id: str) -> SearchResult:
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(None, lambda: yt.get_artist(artist_id))
        songs = []
        for key in ("songs", "albums", "singles", "videos"):
            sec = res.get(key)
            items = sec.get("results", []) if isinstance(sec, dict) else (sec or [])
            for it in items:
                if not isinstance(it, dict):
                    continue
                if it.get("videoId"):
                    a = it.get("artists")
                    an = a[0].get("name", "") if isinstance(a, list) and a and isinstance(a[0], dict) else _anames(a)
                    songs.append(Song(video_id=it["videoId"], title=it.get("title", ""), artist=an, thumbnail=_thumb(it), duration=_dur(it)))
        return SearchResult(results=songs, query=artist_id)
    except Exception:
        return SearchResult(results=[], query=artist_id)

async def browse_artist_full(artist_id: str) -> dict:
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: yt.get_artist(artist_id))
    except Exception:
        return {}

async def get_album(album_id: str) -> SearchResult:
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(None, lambda: yt.get_album(album_id))
        songs = []
        for t in (res or {}).get("tracks", []) or []:
            if not isinstance(t, dict) or not t.get("videoId"):
                continue
            songs.append(Song(video_id=t.get("videoId", ""), title=t.get("title", ""), artist=_anames(t.get("artists")), album=(res or {}).get("title", ""), thumbnail=_thumb(t) or _thumb(res), duration=_dur(t)))
        return SearchResult(results=songs, query=album_id)
    except Exception:
        return SearchResult(results=[], query=album_id)

async def get_song_lyrics(video_id: str) -> str:
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        def _f():
            watch = yt.get_watch_playlist(videoId=video_id)
            lid = (watch or {}).get("lyrics")
            if not lid:
                return ""
            r = yt.get_lyrics(lid)
            if r is None:
                return ""
            if isinstance(r, dict):
                return r.get("lyrics", "") or r.get("text", "") or ""
            for attr in ("lyrics", "text"):
                if hasattr(r, attr):
                    v = getattr(r, attr)
                    if isinstance(v, str) and v:
                        return v
                    if isinstance(v, list):
                        parts = []
                        for ln in v:
                            parts.append(ln.get("text", "") if isinstance(ln, dict) else str(ln))
                        j = "\n".join([p for p in parts if p])
                        if j:
                            return j
            return str(r)
        return await loop.run_in_executor(None, _f)
    except Exception:
        return ""

async def get_playlist(playlist_id: str) -> SearchResult:
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        try:
            res = await loop.run_in_executor(None, lambda: yt.get_playlist(playlist_id, limit=None))
        except Exception:
            res = await loop.run_in_executor(None, lambda: yt.get_playlist(playlist_id, limit=300))
        songs = []
        for t in (res or {}).get("tracks", []) or []:
            if not isinstance(t, dict) or not t.get("videoId"):
                continue
            songs.append(Song(
                video_id=t.get("videoId", ""),
                title=t.get("title", ""),
                artist=_anames(t.get("artists")),
                album=(res or {}).get("title", "") or "",
                thumbnail=_thumb(t),
                duration=_dur(t)
            ))
        title = (res or {}).get("title") or playlist_id
        return SearchResult(results=songs, query=playlist_id, name=title)
    except Exception:
        return SearchResult(results=[], query=playlist_id)

async def import_youtube_playlist(url_or_id: str, custom_name: str = "") -> dict:
    playlist_id = extract_playlist_id(url_or_id)
    raw = (url_or_id or "").strip()
    if not playlist_id and not raw.startswith("http"):
        raise ValueError("Invalid YouTube playlist URL or ID")

    canonical_url = raw if raw.startswith("http") else f"https://www.youtube.com/playlist?list={playlist_id}"
    playlist_title = (custom_name or "").strip()
    tracks = []

    # Tier 1: Try ytmusicapi
    if playlist_id:
        try:
            yt = get_ytmusic()
            loop = asyncio.get_running_loop()
            res = None
            try:
                res = await loop.run_in_executor(None, lambda: yt.get_playlist(playlist_id, limit=None))
            except Exception:
                res = await loop.run_in_executor(None, lambda: yt.get_playlist(playlist_id, limit=500))

            if res and isinstance(res, dict) and res.get("tracks"):
                if not playlist_title:
                    playlist_title = res.get("title") or "Imported Playlist"
                for t in res.get("tracks", []):
                    if not isinstance(t, dict):
                        continue
                    vid = t.get("videoId")
                    if not vid:
                        continue
                    tracks.append({
                        "video_id": vid,
                        "title": t.get("title") or "Unknown Title",
                        "artist": _anames(t.get("artists")) or res.get("author") or "Unknown Artist",
                        "thumbnail": _thumb(t) or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                        "duration": _dur(t)
                    })
        except Exception:
            # ytmusicapi failed, proceed to Tier 2
            pass

    # Tier 2: Fallback to yt-dlp if no tracks found via ytmusicapi
    if not tracks:
        loop = asyncio.get_running_loop()
        def _fetch_ytdlp():
            cmd = _ytdlp_cmd() + [
                "--flat-playlist",
                "-J",
                "--no-warnings",
                "--no-check-certificates",
                canonical_url
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr or "yt-dlp extraction failed")
            return json.loads(proc.stdout)

        try:
            data = await loop.run_in_executor(None, _fetch_ytdlp)
            if data and isinstance(data, dict):
                if not playlist_title:
                    playlist_title = data.get("title") or "Imported Playlist"
                entries = data.get("entries") or []
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    vid = entry.get("id")
                    if not vid or len(vid) != 11:
                        continue
                    t_title = entry.get("title") or ""
                    if t_title in ("[Private video]", "[Deleted video]"):
                        continue

                    thumb = ""
                    th_list = entry.get("thumbnails")
                    if isinstance(th_list, list) and th_list:
                        for th in reversed(th_list):
                            if isinstance(th, dict) and th.get("url"):
                                thumb = th["url"]
                                break
                    if not thumb:
                        thumb = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"

                    artist = entry.get("uploader") or entry.get("channel") or "Unknown Artist"
                    dur = entry.get("duration")
                    try:
                        dur = max(0, int(dur or 0))
                    except (TypeError, ValueError):
                        dur = 0

                    tracks.append({
                        "video_id": vid,
                        "title": t_title or "Unknown Title",
                        "artist": artist,
                        "thumbnail": thumb,
                        "duration": dur
                    })
        except Exception as e:
            if not tracks:
                raise RuntimeError(f"Could not import playlist: {e}")

    if not tracks:
        raise ValueError("Playlist contains no playable tracks or is private.")

    if not playlist_title:
        playlist_title = "Imported Playlist"

    return {
        "name": playlist_title,
        "tracks": tracks
    }

async def get_home() -> dict:
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        secs = await loop.run_in_executor(None, lambda: yt.get_home(limit=4))
        trending = []
        for sec in secs or []:
            if not isinstance(sec, dict):
                continue
            for it in (sec or {}).get("contents", []) or []:
                if not isinstance(it, dict):
                    continue
                vid = it.get("videoId")
                pid = it.get("playlistId")
                bid = it.get("browseId")
                if vid:
                    vt = it.get("videoType", "")
                    is_vid = bool(vt) and vt != "MUSIC_VIDEO_TYPE_ATV"
                    trending.append(Song(
                        video_id=vid,
                        title=it.get("title", ""),
                        artist=_anames(it.get("artists")) or it.get("description", "") or "",
                        album=it.get("album") or "",
                        thumbnail=_thumb(it),
                        duration=_dur(it),
                        video_type=vt,
                        result_type="video" if is_vid else "song",
                        is_video=is_vid,
                    ))
                elif pid:
                    trending.append(Song(
                        video_id=pid,
                        title=it.get("title", ""),
                        artist=it.get("description", "") or "Playlist",
                        album="playlist",
                        thumbnail=_thumb(it),
                        duration=0,
                        result_type="playlist",
                        is_video=False,
                    ))
                elif bid:
                    kind = "artist" if bid.startswith("UC") else "album"
                    trending.append(Song(
                        video_id=bid,
                        title=it.get("title", ""),
                        artist=it.get("description", "") or kind.capitalize(),
                        album=kind,
                        thumbnail=_thumb(it),
                        duration=0,
                        result_type=kind,
                        is_video=False,
                    ))
        return {"likedSongs": [], "recentlyPlayed": [], "trending": trending[:24]}
    except Exception:
        return {"likedSongs": [], "recentlyPlayed": [], "trending": []}

async def get_song_details(video_id: str) -> Optional[Song]:
    video_id = (video_id or "").strip()
    if not video_id:
        return None
    try:
        yt = get_ytmusic()
        loop = asyncio.get_running_loop()
        def _f():
            watch = yt.get_watch_playlist(videoId=video_id)
            trs = ((watch or {}) if isinstance(watch, dict) else {}).get("tracks", []) or []
            for t in trs:
                if isinstance(t, dict) and t.get("videoId") == video_id:
                    return t
            first = next((t for t in trs if isinstance(t, dict) and t.get("videoId")), None)
            return first
        track = await loop.run_in_executor(None, _f)
        if not track:
            r = await search(video_id, "songs")
            if r.results:
                s = r.results[0]
                return Song(video_id=video_id, title=s.title, artist=s.artist, duration=s.duration, thumbnail=s.thumbnail)
            return None
        a = track.get("artists")
        if isinstance(a, list) and a and isinstance(a[0], dict):
            an = ", ".join([x.get("name", "") for x in a])
        elif isinstance(a, str):
            an = a
        else:
            an = _anames(track.get("artists"))
        vt = track.get("videoType", "")
        is_vid = bool(vt) and vt != "MUSIC_VIDEO_TYPE_ATV"
        return Song(video_id=video_id, title=track.get("title", video_id), artist=an, thumbnail=_thumb(track), duration=_dur(track), video_type=vt, result_type="video" if is_vid else "song", is_video=is_vid)
    except Exception:
        return None


def _lyric_line_text(line):
    if isinstance(line, dict):
        return line.get("text", "")
    if hasattr(line, "text"):
        val = getattr(line, "text")
        return val if isinstance(val, str) else ""
    return str(line)


def _lyric_line_time(line, key):
    if isinstance(line, dict):
        return line.get(key)
    return getattr(line, key, None)


async def get_song_lyrics_full(video_id: str, title: str = "", artist: str = "", duration: int = 0) -> dict:
    """Return {'plain': str, 'synced': [{text, start, end, words?}]} for a track.

    Tries LRCLIB first for community-vetted word-accurate / enhanced synced lyrics,
    falling back to YouTube Music timed lyrics.
    """
    try:
        from api.lrclib import fetch_lrclib

        raw = None
        # 1. Try LRCLIB if title is provided
        if title:
            try:
                lrc = await fetch_lrclib(title, artist, duration)
                if lrc and lrc.get("synced"):
                    raw = lrc
            except Exception as e:
                logger.debug("LRCLIB lookup failed: %s", e)

        # 2. Fallback to YouTube Music if no synced lyrics from LRCLIB
        if not raw or not raw.get("synced"):
            yt = get_ytmusic()
            loop = asyncio.get_running_loop()

            def _fetch():
                try:
                    watch = yt.get_watch_playlist(videoId=video_id)
                except Exception:
                    return {"plain": "", "synced": []}
                lyrics_id = ((watch or {}) if isinstance(watch, dict) else {}).get("lyrics")
                synced = []
                plain = ""

                if lyrics_id:
                    try:
                        timed = yt.get_lyrics(lyrics_id, timestamps=True)
                    except Exception:
                        timed = None
                    lines = None
                    if isinstance(timed, dict):
                        lines = timed.get("lyrics")
                    elif timed is not None:
                        lines = getattr(timed, "lyrics", None)
                    if isinstance(lines, list) and lines:
                        for ln in lines:
                            text = _lyric_line_text(ln)
                            try:
                                start = int(_lyric_line_time(ln, "start_time") or 0)
                            except (TypeError, ValueError):
                                start = 0
                            try:
                                end = int(_lyric_line_time(ln, "end_time") or 0)
                            except (TypeError, ValueError):
                                end = 0
                            if text:
                                synced.append({"text": text, "start": start, "end": end})
                    if synced:
                        plain = "\n".join(x["text"] for x in synced)
                    else:
                        try:
                            res = yt.get_lyrics(lyrics_id)
                            if isinstance(res, dict):
                                plain = res.get("lyrics", "") or ""
                            elif res is not None:
                                val = getattr(res, "lyrics", None)
                                plain = val if isinstance(val, str) else ""
                        except Exception:
                            plain = ""

                # If YT provided metadata but we still had no title, try LRCLIB as second chance
                extracted_title = ""
                extracted_artist = ""
                if not synced and isinstance(watch, dict) and watch.get("tracks"):
                    first_track = watch["tracks"][0]
                    if isinstance(first_track, dict):
                        extracted_title = first_track.get("title") or ""
                        artists = first_track.get("artists") or []
                        if isinstance(artists, list) and artists:
                            extracted_artist = artists[0].get("name", "") if isinstance(artists[0], dict) else str(artists[0])

                return {
                    "plain": plain or "",
                    "synced": synced,
                    "extracted_title": extracted_title,
                    "extracted_artist": extracted_artist
                }

            yt_res = await loop.run_in_executor(None, _fetch)

            # If YT has synced lyrics, use them; otherwise try extracted metadata with LRCLIB if available
            if yt_res.get("synced"):
                raw = {"plain": yt_res.get("plain", ""), "synced": yt_res.get("synced", [])}
            elif yt_res.get("extracted_title") and not raw:
                try:
                    lrc = await fetch_lrclib(yt_res["extracted_title"], yt_res.get("extracted_artist", ""), duration)
                    if lrc and (lrc.get("synced") or lrc.get("plain")):
                        raw = lrc
                except Exception:
                    pass

            if not raw:
                raw = {"plain": yt_res.get("plain", ""), "synced": yt_res.get("synced", [])}

        try:
            from api.translit import enrich_lyrics
            return enrich_lyrics(raw)
        except Exception:
            return raw
    except Exception:
        return {"plain": "", "synced": []}
