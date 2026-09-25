"""Continuing-playlist recommendations.

When the user clicks a single track we keep the lane going by appending
recommended songs that share at least one genre tag or one vibe tag with the
seed track. Tags come from a lightweight keyword profiler over
title/artist/album text; candidates come from YouTube Music's own
watch-playlist + related rails (already vibe-adjacent), re-ranked and
strictly filtered so every returned track matches the seed on genre or vibe.
"""
import re

GENRE_KEYWORDS = {
    "dangdut": ["dangdut", "koplo", "campursari", "keroncong", "pop jawa", "tarling"],
    "k-pop": ["k-pop", "kpop", "korean", "exo", "bts", "blackpink", "twice", "seventeen",
              "stray kids", "nct", "aespa", "itzy", "txt", "enhypen", "bigbang",
              "girls generation", "snsd", "super junior", "shinee", "tvxq", "2pm",
              "ikon", "got7", "boa", "psy"],
    "j-pop": ["j-pop", "jpop", "anime", "city pop", "vocaloid", "japan", "japanese",
              "yoasobi", "kenshi yonezu", "sakanaction"],
    "pop": ["pop"],
    "rock": ["rock", "grunge"],
    "indie": ["indie", "bedroom pop"],
    "alternative": ["alternative"],
    "metal": ["metal", "metalcore", "deathcore", "hardcore", "screamo"],
    "punk": ["punk", "pop punk", "emo"],
    "hip-hop": ["hip hop", "hip-hop", "rap", "trap", "drill", "boom bap", "phonk",
                "gd x taeyang", "g-dragon", "taeyang"],
    "r&b": ["r&b", "rnb", "soul", "neo soul", "slow jam"],
    "jazz": ["jazz", "bossa", "swing", "bebop", "fusion"],
    "blues": ["blues"],
    "funk": ["funk", "disco", "boogie"],
    "edm": ["edm", "house", "techno", "trance", "dubstep", "drum and bass", "dnb",
            "hardstyle", "big room", "future bass", "tropical house", "deep house"],
    "lofi": ["lo-fi", "lofi", "chillhop", "chill beats", "study beats"],
    "ambient": ["ambient", "drone", "soundscape", "new age"],
    "classical": ["classical", "klasik", "orchestra", "symphony", "opera", "baroque"],
    "acoustic": ["acoustic", "akustik", "unplugged", "folk", "singer-songwriter", "country"],
    "reggae": ["reggae", "ska", "dub", "dancehall"],
    "latin": ["latin", "reggaeton", "salsa", "bachata"],
    "soundtrack": ["ost", "soundtrack", "score", "theme song", "opening", "ending"],
    "gospel": ["gospel", "rohani", "worship", "pujian", "qasidah", "nasyid", "sholawat"],
}

VIBE_KEYWORDS = {
    "chill": ["chill", "relax", "santai", "santuy", "calm", "tenang", "lofi", "lounge",
              "coffee", "kopi", "morning", "pagi", "study", "belajar", "focus", "fokus",
              "sleep", "tidur", "rain", "hujan", "night drive"],
    "mellow": ["mellow", "soft", "slow", "pelan", "ballad", "balada", "sentimental",
               "melankolis", "melancholy", "galau", "sedih", "sad", "heartbreak",
               "patah hati", "rindu", "bucin"],
    "romantic": ["romantic", "romantis", "love", "cinta", "kasih", "sayang", "wedding"],
    "happy": ["happy", "ceria", "bahagia", "fun", "feel good", "feel-good", "summer",
              "road trip", "liburan", "holiday"],
    "energetic": ["energetic", "energetik", "semangat", "upbeat", "anthem", "pump",
                  "workout", "gym", "running", "dance", "joget", "party", "pesta",
                  "club", "hype", "festival"],
    "party": ["party", "pesta", "club", "dugem", "dancefloor", "remix", "funkot",
              "breakbeat"],
    "night": ["night", "malam", "midnight", "tengah malam", "after hours", "late night",
              "city lights", "drive"],
    "heavy": ["heavy", "keras", "distortion", "mosh", "scream", "growl", "dark", "gelap",
              "aggressive", "agresif"],
    "groovy": ["groovy", "groove", "funky", "swagger"],
    "epic": ["epic", "cinematic", "orchestral", "anthemic", "grand", "megah", "kolosal"],
}

_TOKEN_RE = re.compile(r"[a-z0-9&+/\-]+")
_STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at", "with",
    "tanpa", "yang", "dan", "atau", "dari", "untuk", "dengan", "di", "ke", "lagu",
    "official", "music", "video", "lyric", "lyrics", "lirik", "audio", "feat",
    "ft", "version", "versi",
})


def _word_hit(keyword: str, padded: str) -> bool:
    """Word-boundary match so 'pop' never fires inside 'popular'.

    Hyphens also act as separators: artist "EXO-K" must match keyword "exo".
    """
    key = re.sub(r"[^a-z0-9&+/\- ]+", " ", (keyword or "").lower()).strip()
    if not key:
        return False
    if " " in key:
        return " {} ".format(key) in padded
    if "-" in key:
        parts = [p for p in key.split("-") if p]
        if parts and all(re.search(r"(?<![a-z0-9&+/]){}(?![a-z0-9&+/])".format(re.escape(p)), padded) for p in parts):
            return True
    norm_padded = re.sub(r"[-/]", " ", padded)
    return re.search(r"(?<![a-z0-9&+]){}(?![a-z0-9&+])".format(re.escape(key)),
                     norm_padded) is not None


def _text(seed) -> str:
    if isinstance(seed, dict):
        parts = [seed.get("title", ""), seed.get("artist", ""), seed.get("album", ""),
                 seed.get("contextName", "")]
    else:
        parts = [getattr(seed, "title", ""), getattr(seed, "artist", ""),
                 getattr(seed, "album", "")]
    return " ".join(p for p in parts if p).lower()


def _tokens(text: str) -> set:
    return {t for t in _TOKEN_RE.findall(text or "") if t and t not in _STOPWORDS}


def _order_lane(order, pos, ctx_len):
    """Sanitize an order permutation against the current context length."""
    clean = [i for i in (order or []) if isinstance(i, int) and 0 <= i < ctx_len]
    if not clean:
        return [], 0
    try:
        pos = int(pos or 0)
    except (TypeError, ValueError):
        pos = 0
    pos = max(0, min(pos, len(clean) - 1))
    return clean, pos


def clean_title(title: str) -> str:
    """Normalize title to strip remaster, live, official tags for deduplication."""
    t = re.sub(r'[\(\[\{].*?(remaster|official|video|audio|version|deluxe|live|edit|feat|ft\.).*?[\)\]\}]', '', title or '', flags=re.I)
    t = re.sub(r'-(?:\s*remaster(?:ed)?|\s*live|\s*radio edit|\s*single version).*$', '', t, flags=re.I)
    t = re.sub(r'[^\w\s]', '', t)
    return ' '.join(t.lower().split())


def rank_candidates(seed_prof: dict, seed_tokens: set, seed_artist: set, cands,
                    limit: int = 15, exclude: set = None, seed_title: str = "",
                    seed_artist_name: str = "", seed_is_video: bool = False):
    """Rank candidates with Spotify-style artist diversity and duplicate prevention."""
    try:
        limit = max(1, int(limit or 15))
    except (TypeError, ValueError):
        limit = 15
    ranked = []
    for order, cand in enumerate(cands or []):
        if not isinstance(cand, dict):
            continue
        if exclude and cand.get("videoId") in exclude:
            continue
        if not seed_is_video and is_video_track(cand):
            continue
        scored = score_candidate(seed_prof, seed_tokens, seed_artist, cand)
        if not scored:
            continue
        score, reason, _ = scored
        item = dict(cand)
        item["reason"] = reason
        ranked.append((-score, order, item))

    # Diversity & deduplication selection (Spotify model):
    seen_titles = set()
    if seed_title:
        st = clean_title(seed_title)
        if st:
            seen_titles.add(st)

    artist_counts = {}
    if seed_artist_name:
        artist_counts[seed_artist_name.lower().strip()] = 1

    selected = []
    deferred = []

    # Sort primarily by score, tiebreak by original source order
    ranked.sort(key=lambda x: (x[0], x[1]))

    for _, order, item in ranked:
        title = item.get("title", "")
        ct = clean_title(title)
        if ct and ct in seen_titles:
            continue

        art = (item.get("artist") or "").lower().strip()
        count = artist_counts.get(art, 0)
        # Cap at 2 tracks per artist in a single batch to prevent artist fatigue
        if count >= 2:
            deferred.append(item)
            continue

        if ct:
            seen_titles.add(ct)
        artist_counts[art] = count + 1
        selected.append(item)
        if len(selected) >= limit:
            break

    # If slots are still open, backfill from deferred pool
    if len(selected) < limit and deferred:
        for item in deferred:
            ct = clean_title(item.get("title", ""))
            if ct and ct in seen_titles:
                continue
            if ct:
                seen_titles.add(ct)
            selected.append(item)
            if len(selected) >= limit:
                break

    # Anti-clustering: reorder so adjacent tracks are not from the same artist
    diversified = []
    pool = list(selected)
    last_art = seed_artist_name.lower().strip() if seed_artist_name else None

    while pool:
        idx = next((i for i, item in enumerate(pool) if (item.get("artist") or "").lower().strip() != last_art), 0)
        chosen = pool.pop(idx)
        diversified.append(chosen)
        last_art = (chosen.get("artist") or "").lower().strip()

    return diversified


def profile(text_or_seed) -> dict:
    """Return {'genres': [...], 'vibes': [...], 'tokens': [...]} for a track."""
    text = text_or_seed.lower() if isinstance(text_or_seed, str) else _text(text_or_seed)
    padded = " {} ".format(re.sub(r"[^a-z0-9&+/\- ]+", " ", text))
    genres = [g for g, keys in GENRE_KEYWORDS.items()
              if any(_word_hit(k, padded) for k in keys)]
    vibes = [v for v, keys in VIBE_KEYWORDS.items()
             if any(_word_hit(k, padded) for k in keys)]
    return {"genres": genres, "vibes": vibes, "tokens": sorted(_tokens(text))}


def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def is_video_track(item: dict) -> bool:
    """Return True if item represents a video (OMV, UGC, live) rather than an audio track (ATV)."""
    if not isinstance(item, dict):
        return False
    if item.get("isVideo") is True or item.get("is_video") is True:
        return True
    rt = item.get("resultType") or item.get("result_type") or ""
    if rt == "video":
        return True
    if rt == "song":
        return False
    vt = item.get("videoType") or item.get("video_type") or ""
    if vt:
        return vt != "MUSIC_VIDEO_TYPE_ATV"
    title = (item.get("title") or "").lower()
    for marker in ("(official music video)", "[official music video]", "(official video)",
                   "[official video]", "(live video)", "[live video]", "(lyric video)",
                   "[lyric video]", "(mv)", "[mv]", "(live at ", "[live at "):
        if marker in title:
            return True
    return False


def _norm_song(item: dict, fallback_artist: str = "") -> dict:
    artists = item.get("artists") or item.get("artist") or fallback_artist or ""
    if isinstance(artists, list):
        artists = ", ".join(a.get("name", "") if isinstance(a, dict) else str(a) for a in artists)
    album = item.get("album")
    if isinstance(album, dict):
        album = album.get("name", "")
    duration = item.get("duration_seconds") or item.get("duration") or 0
    if isinstance(duration, str) and ":" in duration:
        try:
            total = 0
            for part in duration.split(":"):
                part = part.strip()
                if not part.isdigit():
                    raise ValueError("bad duration part")
                total = total * 60 + int(part)
            duration = total
        except Exception:
            duration = 0
    try:
        duration = int(duration or 0)
    except (TypeError, ValueError):
        duration = 0
    thumbs = item.get("thumbnail") or item.get("thumbnails") or ""
    if isinstance(thumbs, list):
        thumbs = next((t.get("url", "") for t in reversed(thumbs)
                       if isinstance(t, dict) and t.get("url")), "")
    vid = item.get("videoId") or item.get("video_id") or ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", str(vid)):
        return {"videoId": "", "title": "", "artist": "", "album": "",
                "thumbnail": "", "duration": 0}
    is_vid = is_video_track(item)
    return {
        "videoId": vid,
        "title": item.get("title") or "",
        "artist": artists if isinstance(artists, str) else str(artists),
        "album": album if isinstance(album, str) else "",
        "thumbnail": thumbs if isinstance(thumbs, str) else "",
        "duration": max(0, duration),
        "videoType": item.get("videoType") or item.get("video_type") or ("MUSIC_VIDEO_TYPE_OMV" if is_vid else "MUSIC_VIDEO_TYPE_ATV"),
        "resultType": item.get("resultType") or item.get("result_type") or ("video" if is_vid else "song"),
        "is_video": is_vid,
        "isVideo": is_vid,
    }


def score_candidate(seed_profile: dict, seed_tokens: set, seed_artist: set, cand: dict):
    """Score a candidate; None when it shares no lane at all with the seed."""
    if not isinstance(cand, dict):
        return None
    seed_profile = seed_profile or {}
    seed_tokens = set(seed_tokens or [])
    seed_artist = set(seed_artist or [])
    prof = profile(cand)
    genre_hit = [g for g in prof["genres"] if g in (seed_profile.get("genres") or [])]
    vibe_hit = [v for v in prof["vibes"] if v in (seed_profile.get("vibes") or [])]
    cand_artist = set(_tokens(cand.get("artist", "")))
    cand_tokens = set(prof["tokens"])
    same_artist = bool(seed_artist and cand_artist and (seed_artist & cand_artist))

    cand_source = cand.get("source") or ""
    cand_genres = set(prof["genres"])
    seed_genres = set(seed_profile.get("genres") or [])

    # Check for hard genre conflict if both have explicit genres and zero overlap
    if cand_genres and seed_genres and not (cand_genres & seed_genres):
        return None

    if not genre_hit and not vibe_hit and not same_artist:
        seed_rail = seed_profile.get("rail") or ""
        # If seed explicitly pinned a rail (e.g. unit test fallback)
        if seed_rail:
            if cand_source != seed_rail:
                return None
            score = 1.0
            title_overlap = len((seed_tokens - seed_artist) & (cand_tokens - cand_artist))
            score += min(3.0, float(title_overlap))
            return score, "same lane: " + str(seed_rail), prof

        # YouTube Music's ML-generated watch/related rails are naturally vibe-adjacent
        if cand_source in ("watch", "related"):
            score = 2.0
            title_overlap = len((seed_tokens - seed_artist) & (cand_tokens - cand_artist))
            score += min(2.0, float(title_overlap))
            return score, "same lane: " + str(cand_source), prof

        return None

    score = len(genre_hit) * 3.0 + len(vibe_hit) * 2.0
    if same_artist:
        score += 1.5
    title_overlap = len((seed_tokens - seed_artist) & (cand_tokens - cand_artist))
    score += min(2.0, float(title_overlap))
    seed_album = ((seed_profile.get("album") or "") if isinstance(seed_profile, dict) else "")
    seed_album = seed_album.lower() if isinstance(seed_album, str) else ""
    cand_album = cand.get("album") or ""
    if cand_album and seed_album and isinstance(cand_album, str) and cand_album.lower() == seed_album:
        score += 2.0
    reasons = []
    if genre_hit:
        reasons.append("genre: " + ", ".join(genre_hit))
    if vibe_hit:
        reasons.append("vibe: " + ", ".join(vibe_hit))
    if same_artist:
        reasons.append("same artist lane")
    return score, "; ".join(reasons), prof




import asyncio
import time

_REC_CACHE = {}  # video_id -> (expires_at, tracks)
_REC_CACHE_MAX = 200


def _cache_get(video_id, limit, exclude=None):
    hit = _REC_CACHE.get(video_id)
    if hit and hit[0] > time.time():
        tracks = hit[1]
        if exclude:
            tracks = [t for t in tracks if t.get("videoId") not in exclude]
        if tracks:
            return tracks[:limit]
    return None


def _cache_put(video_id, tracks, ttl=7200):
    while len(_REC_CACHE) >= _REC_CACHE_MAX:
        oldest = min(_REC_CACHE.items(), key=lambda kv: kv[1][0])[0]
        _REC_CACHE.pop(oldest, None)
    _REC_CACHE[video_id] = (time.time() + ttl, list(tracks))


def _collect(yt, video_id, seed, limit):
    """Blocking collection of raw candidates from YouTube Music rails."""
    cands, seen = [], set()

    seed_is_video = is_video_track(seed)

    watch = None
    related_id = None
    try:
        watch = yt.get_watch_playlist(videoId=video_id, limit=max(30, limit * 3))
    except Exception:
        watch = None

    # If seed video status was not explicitly marked, detect from watch playlist tracks
    if not seed_is_video and not seed.get("isVideo") and not seed.get("is_video"):
        for t in ((watch or {}) if isinstance(watch, dict) else {}).get("tracks", []) or []:
            if isinstance(t, dict) and t.get("videoId") == video_id:
                if is_video_track(t):
                    seed_is_video = True
                break

    def push(item, source):
        if not isinstance(item, dict):
            return
        vid = item.get("videoId") or item.get("video_id")
        if not vid or vid == video_id or vid in seen:
            return
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", str(vid)):
            return
        cand_is_vid = is_video_track(item)
        # FOCUS ON SONG ONLY: If the seed track is NOT a video, reject any video!
        if not seed_is_video and cand_is_vid:
            return
        seen.add(vid)
        song = _norm_song(item, fallback_artist=seed.get("artist", ""))
        if song["videoId"]:
            song["source"] = source
            cands.append(song)

    for t in ((watch or {}) if isinstance(watch, dict) else {}).get("tracks", []) or []:
        if isinstance(t, dict):
            push(t, "watch")
    try:
        related_id = (watch or {}).get("related") if isinstance(watch, dict) else None
    except Exception:
        related_id = None
    if related_id:
        try:
            related = yt.get_song_related(related_id) or []
        except Exception:
            related = []
        for section in related:
            if not isinstance(section, dict):
                continue
            for item in section.get("contents", []) or []:
                if isinstance(item, dict) and item.get("videoId"):
                    push(item, "related")
    seed_prof = profile(seed)
    queries = []
    for g in seed_prof["genres"][:2]:
        artist = (seed.get("artist", "") or "").strip()
        queries.append("{} {}".format(artist, g).strip())
    for v in seed_prof["vibes"][:2]:
        anchor = seed_prof["genres"][0] if seed_prof["genres"] else "songs"
        queries.append("{} {}".format(v, anchor))
    if not queries and (seed.get("artist") or "").strip():
        queries.append(seed["artist"].strip())
    for q in queries[:3]:
        try:
            res = yt.search(q, filter="songs", limit=20)
        except Exception:
            continue
        for item in res or []:
            if isinstance(item, dict):
                push(item, "search:" + q)
    # Last resort: tags learned from the rails themselves, so a seed like
    # "Song X" by an unknown artist still inherits the lane's shared tags.
    if not queries:
        lane_genres, lane_vibes = _lane_tags(cands)
        if lane_genres or lane_vibes:
            seed_prof["genres"] = sorted(set(seed_prof["genres"]) | set(lane_genres))
            seed_prof["vibes"] = sorted(set(seed_prof["vibes"]) | set(lane_vibes))
    seed["__lane_profile__"] = {"genres": seed_prof["genres"], "vibes": seed_prof["vibes"]}
    return cands


def _lane_tags(cands):
    """Most common genre/vibe tags across raw rail candidates."""
    from collections import Counter
    genres, vibes = Counter(), Counter()
    for cand in cands[:20]:
        prof = profile(cand)
        genres.update(prof["genres"])
        vibes.update(prof["vibes"])
    top_genres = [g for g, n in genres.most_common(2) if n >= 2]
    top_vibes = [v for v, n in vibes.most_common(2) if n >= 2]
    return top_genres, top_vibes


async def get_recommendations(video_id: str, seed: dict = None, limit: int = 15,
                              exclude: set = None):
    """Matched recommendations for a seed track (empty list when nothing matches)."""
    from api import music as music_api

    video_id = (video_id or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        return []
    try:
        limit = max(1, min(50, int(limit or 20)))
    except (TypeError, ValueError):
        limit = 20
    exclude = set(exclude or [])
    cached = _cache_get(video_id, limit, exclude)
    if cached is not None:
        return cached
    seed = dict(seed or {})
    if not seed.get("videoId"):
        seed["videoId"] = video_id
    if not seed.get("title"):
        try:
            detail = await music_api.get_song_details(video_id)
            if detail:
                seed.setdefault("title", detail.title)
                seed.setdefault("artist", detail.artist)
                seed.setdefault("thumbnail", detail.thumbnail)
                seed.setdefault("duration", detail.duration)
        except Exception:
            pass
    if not seed.get("title") and not seed.get("artist"):
        return []
    seed_prof = profile(seed)
    seed_prof["album"] = seed.get("album") or ""
    loop = asyncio.get_running_loop()
    yt = music_api.get_ytmusic()
    cands = await loop.run_in_executor(None, _collect, yt, video_id, seed, limit)
    lane = seed.get("__lane_profile__") or {}
    if lane.get("genres") or lane.get("vibes"):
        seed_prof["genres"] = sorted(set(seed_prof["genres"]) | set(lane.get("genres", [])))
        seed_prof["vibes"] = sorted(set(seed_prof["vibes"]) | set(lane.get("vibes", [])))
    if not seed_prof["genres"] and not seed_prof["vibes"]:
        # Tag-less seed (e.g. "MAMA" by "EXO-K"): the watch rail itself is the
        # lane. Mark it so same-rail candidates pass the filter honestly.
        seed_prof["rail"] = "watch"
    seed_tokens = set(seed_prof["tokens"])
    seed_artist = _tokens(seed.get("artist", ""))
    seed_is_video = is_video_track(seed)
    tracks = rank_candidates(seed_prof, seed_tokens, seed_artist, cands,
                             limit=limit, exclude=exclude,
                             seed_title=seed.get("title", ""),
                             seed_artist_name=seed.get("artist", ""),
                             seed_is_video=seed_is_video)
    _cache_put(video_id, tracks)
    return tracks
