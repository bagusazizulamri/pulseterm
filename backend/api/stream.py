"""Resolve and cache direct audio URLs via yt-dlp.

A stream URL is expensive to resolve (~3-13s) but cheap to reuse until it expires.
Everything that touches playback goes through get_stream_url_async(), which caches by
video id, collapses concurrent requests for the same track, and bounds how many yt-dlp
processes may run at once.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import re
import shutil
import subprocess
import time
from config import CACHE_DIR

# A video id is 11 url-safe characters; anything else is treated as a query/url.
_ID_RE = re.compile(r'^[A-Za-z0-9_-]{11}$')
_EXPIRE_RE = re.compile(r'[?&]expire=(\d+)')

OFFLINE_DIR = os.path.join(CACHE_DIR, "offline")

_url_cache = {}       # video_id -> (url, expires_at)
_locks = {}           # video_id -> asyncio.Lock (single flight)
_semaphore = None     # bounds concurrent yt-dlp processes
_stats = {"hits": 0, "misses": 0, "errors": 0, "forced": 0, "resolves": 0}

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# Audio format prioritization:
# Priority 1: High-fidelity Opus Fullband 48kHz (itag 251, ~160kbps VBR) - transparent studio quality
# Priority 2: WebM/Opus alternatives (itag 250/249)
# Priority 3: AAC-LC M4A (itag 140, ~128kbps, 44.1kHz)
YTDLP_EXTRACTOR_ARGS = []
YTDLP_FORMAT = "bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best"

MAX_PARALLEL_RESOLVES = 4
RESOLVE_TIMEOUT = 30
DEFAULT_TTL = 4 * 3600


def _sem():
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(MAX_PARALLEL_RESOLVES)
    return _semaphore


_URL_CACHE_MAX = 500
_LOCK_CACHE_MAX = 500
_lock_loop = None


def _lock(video_id):
    global _lock_loop
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not _lock_loop:
        # Locks are bound to their event loop; a server restart/reload must
        # not reuse (or evict based on) locks from a dead loop.
        _locks.clear()
        _lock_loop = loop
    lock = _locks.get(video_id)
    if lock is None:
        if len(_locks) >= _LOCK_CACHE_MAX:
            # Only evict idle locks. Evicting a contended lock would break
            # single-flight and spawn duplicate yt-dlp resolves.
            for key, candidate in list(_locks.items()):
                try:
                    locked = candidate.locked()
                except Exception:
                    locked = True
                if not locked:
                    _locks.pop(key, None)
                    break
            else:
                # Every tracked lock is currently contended; keep them all and
                # accept one extra entry rather than breaking mutual exclusion.
                pass
        if video_id not in _locks:
            _locks[video_id] = asyncio.Lock()
        lock = _locks[video_id]
    return lock


def _ytdlp_cmd():
    exe = shutil.which("yt-dlp")
    if exe:
        return [exe]
    cand = os.path.join(os.path.dirname(sys.executable), "yt-dlp")
    if os.path.exists(cand):
        return [cand]
    return [sys.executable, "-m", "yt_dlp"]


def _run(args, timeout):
    return subprocess.run(_ytdlp_cmd() + list(args), capture_output=True, text=True, timeout=timeout)


def target_of(video_id):
    """Build the yt-dlp target string for an id, url, or free-text query."""
    v = str(video_id or "").strip()
    if _ID_RE.match(v):
        return "https://music.youtube.com/watch?v=" + v
    if v.startswith("http"):
        return v
    return "ytsearch:" + v


def expiry_of(url):
    """googlevideo URLs carry an `expire` epoch; renew a minute early."""
    try:
        m = _EXPIRE_RE.search(url or "")
    except TypeError:
        m = None
    if m:
        try:
            return float(m.group(1)) - 60
        except (TypeError, ValueError):
            pass
    return time.time() + DEFAULT_TTL


def offline_path(video_id):
    """Path of a downloaded copy, or '' when the track is not kept offline."""
    if not video_id or not isinstance(video_id, str):
        return ""
    video_id = video_id.strip()
    if not video_id:
        return ""
    for ext in ("m4a", "webm", "mp3", "opus"):
        p = os.path.join(OFFLINE_DIR, video_id + "." + ext)
        if os.path.exists(p) and os.path.getsize(p) > 0:
            return p
    return ""


_ydl_singleton = None
_meta_cache = {}  # video_id -> dict(codec, bitrate, sampleRate, formatId, tier, qualityLabel)


def _parse_meta(data):
    if not isinstance(data, dict):
        return {
            "codec": "opus",
            "bitrate": 160,
            "sampleRate": 48000,
            "formatId": "251",
            "ext": "webm",
            "tier": "HQ",
            "qualityLabel": "[HQ · OPUS · 160K · 48KHZ]"
        }
    acodec = str(data.get("acodec") or "opus").lower()
    abr = data.get("abr")
    asr = data.get("asr")
    fid = str(data.get("format_id") or "251")
    ext = str(data.get("ext") or "webm").lower()

    is_opus = "opus" in acodec or ext == "webm" or fid in ("251", "250", "249")
    codec_name = "OPUS" if is_opus else ("AAC" if ("mp4a" in acodec or "aac" in acodec) else acodec.upper())

    bitrate_kbps = round(abr) if abr else (160 if is_opus else 128)
    sample_rate_hz = asr or (48000 if is_opus else 44100)
    tier = "HQ" if (is_opus or bitrate_kbps >= 160) else "SQ"
    quality_label = f"[{tier} · {codec_name} · {bitrate_kbps}K · {sample_rate_hz//1000}KHZ]"

    return {
        "codec": codec_name.lower(),
        "bitrate": bitrate_kbps,
        "sampleRate": sample_rate_hz,
        "formatId": fid,
        "ext": ext,
        "tier": tier,
        "qualityLabel": quality_label
    }


def _get_ydl():
    global _ydl_singleton
    if _ydl_singleton is None:
        try:
            import yt_dlp
            from yt_dlp.extractor.youtube import YoutubeIE, YoutubeSearchIE, YoutubeTabIE
            ydl_opts = {
                "format": YTDLP_FORMAT,
                "quiet": True,
                "no_warnings": True,
                "extract_flat": False,
                "js_runtimes": {"node": {}},
                "socket_timeout": 8,
                "retries": 2,
                "nocheckcertificate": True,
            }
            inst = yt_dlp.YoutubeDL(ydl_opts)
            inst._ies = {
                'Youtube': YoutubeIE(inst),
                'YoutubeSearch': YoutubeSearchIE(inst),
                'YoutubeTab': YoutubeTabIE(inst),
            }
            _ydl_singleton = inst
        except Exception:
            _ydl_singleton = None
    return _ydl_singleton


def _extract(video_id):
    """Fast in-process yt-dlp resolver with subprocess fallback."""
    _stats["resolves"] += 1
    target = target_of(video_id)
    # Fast path: persistent in-process yt_dlp avoids Python interpreter spawn & extractor reload overhead
    try:
        ydl = _get_ydl()
        if ydl is not None:
            info = ydl.extract_info(target, download=False)
            if info:
                url = info.get("url")
                if url and isinstance(url, str) and url.startswith("http"):
                    _meta_cache[video_id] = _parse_meta(info)
                    return url
                formats = info.get("formats") or []
                for f in reversed(formats):
                    f_url = f.get("url")
                    if f_url and isinstance(f_url, str) and f_url.startswith("http"):
                        if f.get("acodec") != "none" or f.get("vcodec") == "none":
                            _meta_cache[video_id] = _parse_meta(f)
                            return f_url
    except Exception:
        pass

    # Fallback path: CLI subprocess
    try:
        args = ["--get-url", "-f", YTDLP_FORMAT, "--no-warnings", "--no-playlist",
                "--no-progress", "--socket-timeout", "8",
                "--retries", "2", "--fragment-retries", "2",
                "--user-agent", UA]
        for ea in YTDLP_EXTRACTOR_ARGS:
            args += ["--extractor-args", ea]
        args.append(target)
        r = _run(args, RESOLVE_TIMEOUT)
        for line in (r.stdout or "").splitlines():
            line = line.strip()
            if line.startswith("http"):
                _meta_cache[video_id] = _parse_meta({"format_id": "251", "acodec": "opus", "abr": 160, "asr": 48000, "ext": "webm"})
                return line
    except Exception:
        pass
    return ""


def resolve_blocking(video_id):
    """Cache-aware, blocking resolve (kept for scripts and tests)."""
    if not video_id or not isinstance(video_id, str):
        return ""
    video_id = video_id.strip()
    if not video_id or (video_id.startswith(("PL", "VL", "RD", "OLAK", "UC", "MPREb_")) and not _ID_RE.match(video_id)):
        return ""
    hit = _url_cache.get(video_id)
    if hit and hit[1] > time.time():
        return hit[0]
    url = _extract(video_id)
    if url:
        if len(_url_cache) >= _URL_CACHE_MAX:
            _url_cache.pop(next(iter(_url_cache)), None)
        _url_cache[video_id] = (url, expiry_of(url))
    return url


async def get_stream_url_async(video_id, force=False):
    """Direct URL for video_id: cached, single-flight, and bounded in parallelism."""
    if not video_id or not isinstance(video_id, str):
        return ""
    video_id = video_id.strip()
    if not video_id or (video_id.startswith(("PL", "VL", "RD", "OLAK", "UC", "MPREb_")) and not _ID_RE.match(video_id)):
        return ""
    now = time.time()
    hit = _url_cache.get(video_id)
    if hit and not force:
        if hit[1] > now:
            _stats["hits"] += 1
            return hit[0]
    if force:
        _stats["forced"] += 1
    else:
        _stats["misses"] += 1

    async with _lock(video_id):
        # Another waiter may have filled the cache while we queued.
        hit = _url_cache.get(video_id)
        if hit and not force and hit[1] > time.time():
            _stats["hits"] += 1
            return hit[0]
        try:
            async with _sem():
                loop = asyncio.get_running_loop()
                url = await loop.run_in_executor(None, _extract, video_id)
        except Exception:
            _stats["errors"] += 1
            url = ""
        if not url:
            _stats["errors"] += 1
            return ""
        if len(_url_cache) >= _URL_CACHE_MAX:
            now_exp = time.time()
            expired = [k for k, (_, exp) in _url_cache.items() if exp <= now_exp]
            for k in expired:
                _url_cache.pop(k, None)
            while len(_url_cache) >= _URL_CACHE_MAX:
                _url_cache.pop(next(iter(_url_cache)), None)
        _url_cache[video_id] = (url, expiry_of(url))
        return url


async def get_stream_info_async(video_id, force=False):
    """Resolve stream URL with audio codec, bitrate, and quality telemetry."""
    url = await get_stream_url_async(video_id, force=force)
    meta = _meta_cache.get(video_id) or _parse_meta(None)
    return {
        "url": url,
        "direct": url,
        "codec": meta["codec"],
        "bitrate": meta["bitrate"],
        "sampleRate": meta["sampleRate"],
        "formatId": meta["formatId"],
        "ext": meta["ext"],
        "tier": meta["tier"],
        "qualityLabel": meta["qualityLabel"]
    }


def get_stream_url(video_id):
    """Back-compat sync wrapper."""
    return resolve_blocking(video_id)


def cache_stats():
    now = time.time()
    live = sum(1 for _, (_, exp) in _url_cache.items() if exp > now)
    return {**_stats, "cached": live, "tracked": len(_url_cache),
            "offline": len(_offline_ids())}


def _offline_ids():
    if not os.path.isdir(OFFLINE_DIR):
        return []
    out = []
    for name in os.listdir(OFFLINE_DIR):
        stem = os.path.splitext(name)[0]
        if _ID_RE.match(stem):
            out.append(stem)
    return out


def list_offline():
    return sorted(set(_offline_ids()))


def download_song(video_id, force=False):
    """Download the best audio track to cache/offline/<id>.<ext> for offline playback."""
    os.makedirs(OFFLINE_DIR, exist_ok=True)
    existing = offline_path(video_id)
    if existing and not force:
        return existing
    out_tmpl = os.path.join(OFFLINE_DIR, video_id + ".%(ext)s")
    try:
        _run(["-f", "bestaudio/best", "-x", "--audio-format", "m4a",
              "--no-warnings", "--no-playlist", "--no-progress",
              "--user-agent", UA, "-o", out_tmpl, target_of(video_id)], 300)
    except Exception:
        return ""
    return offline_path(video_id)


async def download_song_async(video_id, force=False):
    loop = asyncio.get_running_loop()
    async with _sem():
        return await loop.run_in_executor(None, download_song, video_id, force)


def remove_offline(video_id):
    p = offline_path(video_id)
    if p and os.path.exists(p):
        os.remove(p)
    return True


async def prepare(video_ids):
    """Warm the cache for upcoming tracks. Returns {videoId: proxy_url}."""
    ids = [v.strip() for v in (video_ids or []) if isinstance(v, str) and v.strip()][:8]
    results = await asyncio.gather(*[get_stream_url_async(v) for v in ids], return_exceptions=True)
    return {v: ("" if isinstance(r, Exception) or not r else "/api/player/audio/" + v)
            for v, r in zip(ids, results)}
