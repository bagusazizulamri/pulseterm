"""LRCLIB API integration for accurate synchronized and word-level lyrics."""

import re
import logging
from typing import Optional, List, Dict, Any
import httpx
try:
    import yaml
except ImportError:
    yaml = None

logger = logging.getLogger(__name__)

LRCLIB_BASE_URL = "https://lrclib.net/api"
USER_AGENT = "MetroList-Reborn/1.0 (https://github.com/bagusazizulamri/pulseterm)"

TIME_TAG_RE = re.compile(r"\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]")
WORD_TAG_RE = re.compile(r"<(\d{1,2}):(\d{2}(?:\.\d{1,3})?)>")


def _tag_to_ms(min_str: str, sec_str: str) -> int:
    try:
        return int(float(min_str) * 60000 + float(sec_str) * 1000)
    except (ValueError, TypeError):
        return 0


def parse_enhanced_lrc(synced_lrc: str, lyricsfile_yaml: Optional[str] = None) -> List[Dict[str, Any]]:
    """Parse standard or Enhanced LRC into list of timed line dicts with optional word timings.
    
    Returns:
        [
            {
                "text": "Dewi, aku mohon",
                "start": 12340,
                "end": 17500,
                "words": [
                    {"word": "Dewi,", "start": 12340, "end": 13100},
                    {"word": "aku", "start": 13100, "end": 13800},
                    {"word": "mohon", "start": 13800, "end": 17500}
                ]
            },
            ...
        ]
    """
    # 1. Parse line endpoints from lyricsfile YAML if provided
    yaml_lines_map: Dict[int, Dict[str, Any]] = {}
    if lyricsfile_yaml and yaml is not None:
        try:
            data = yaml.safe_load(lyricsfile_yaml)
            if isinstance(data, dict):
                raw_lines = data.get("lines") or []
                for idx, yl in enumerate(raw_lines):
                    if isinstance(yl, dict):
                        text = str(yl.get("text") or "").strip()
                        s_ms = int(yl.get("start_ms") or 0)
                        e_ms = int(yl.get("end_ms") or 0)
                        if text:
                            yaml_lines_map[s_ms] = {"text": text, "start": s_ms, "end": e_ms}
        except Exception as e:
            logger.debug("Failed to parse lyricsfile YAML: %s", e)

    parsed: List[Dict[str, Any]] = []
    if not synced_lrc:
        # If no syncedLyrics text, construct from yaml_lines_map
        for s_ms in sorted(yaml_lines_map.keys()):
            parsed.append({
                "text": yaml_lines_map[s_ms]["text"],
                "start": yaml_lines_map[s_ms]["start"],
                "end": yaml_lines_map[s_ms]["end"],
                "words": None
            })
        return parsed

    raw_lines = synced_lrc.strip().split("\n")
    for rl in raw_lines:
        m = TIME_TAG_RE.match(rl)
        if not m:
            continue
        line_start = _tag_to_ms(m.group(1), m.group(2))
        content = rl[m.end():].strip()
        if not content:
            continue

        # Check for word-level <mm:ss.xx> tags (Enhanced LRC)
        word_matches = list(WORD_TAG_RE.finditer(content))
        words: List[Dict[str, Any]] = []
        if word_matches:
            for idx, wm in enumerate(word_matches):
                w_start = _tag_to_ms(wm.group(1), wm.group(2))
                next_pos = word_matches[idx + 1].start() if idx + 1 < len(word_matches) else len(content)
                w_text = content[wm.end():next_pos].strip()
                w_end = (
                    _tag_to_ms(word_matches[idx + 1].group(1), word_matches[idx + 1].group(2))
                    if idx + 1 < len(word_matches)
                    else 0
                )
                if w_text:
                    words.append({"word": w_text, "start": w_start, "end": w_end})
            clean_text = re.sub(r"\s+", " ", WORD_TAG_RE.sub("", content)).strip()
        else:
            clean_text = re.sub(r"\s+", " ", content).strip()

        if not clean_text:
            continue

        # Match end timestamp from YAML if available, otherwise 0
        line_end = 0
        if line_start in yaml_lines_map:
            line_end = yaml_lines_map[line_start].get("end") or 0

        parsed.append({
            "text": clean_text,
            "start": line_start,
            "end": line_end,
            "words": words if words else None
        })

    # Fill in line_end for consecutive lines if missing
    for i in range(len(parsed)):
        if parsed[i]["end"] <= parsed[i]["start"]:
            if i + 1 < len(parsed):
                next_s = parsed[i + 1]["start"]
                parsed[i]["end"] = min(next_s, parsed[i]["start"] + 8000)
            else:
                parsed[i]["end"] = parsed[i]["start"] + 5000

        # Close out the last word in words list if needed
        if parsed[i]["words"]:
            last_word = parsed[i]["words"][-1]
            if last_word.get("end", 0) <= last_word.get("start", 0):
                last_word["end"] = parsed[i]["end"]

    return parsed


async def fetch_lrclib(title: str, artist: str, duration: int = 0) -> Optional[Dict[str, Any]]:
    """Fetch synchronized lyrics from LRCLIB.
    
    Tries exact match first via GET /api/get, then search fallback if needed.
    """
    clean_title = re.sub(r"\s*[\(\[](?:official|music|video|audio|lyrics|lyric|remastered|feat\..*?)[\)\]]", "", title, flags=re.IGNORECASE).strip()
    clean_artist = artist.strip()

    if not clean_title:
        return None

    headers = {"User-Agent": USER_AGENT}
    try:
        import certifi
        ssl_verify = certifi.where()
    except Exception:
        ssl_verify = True

    async with httpx.AsyncClient(timeout=6.0, headers=headers, verify=ssl_verify) as client:
        # 1. Exact match attempt
        params = {
            "track_name": clean_title,
            "artist_name": clean_artist,
        }
        if duration > 0:
            params["duration"] = str(int(duration))

        try:
            resp = await client.get(f"{LRCLIB_BASE_URL}/get", params=params)
            if resp.status_code == 200:
                data = resp.json()
                synced_lrc = data.get("syncedLyrics") or ""
                lyricsfile = data.get("lyricsfile") or ""
                plain = data.get("plainLyrics") or ""
                if synced_lrc or lyricsfile:
                    synced = parse_enhanced_lrc(synced_lrc, lyricsfile)
                    if synced:
                        plain_text = plain or "\n".join(x["text"] for x in synced)
                        is_jp_lyrics = bool(re.search(r'[\u3040-\u309F\u30A0-\u30FF]', plain_text))
                        is_jp_query = bool(re.search(r'[\u3040-\u309F\u30A0-\u30FF]', clean_title + " " + clean_artist))
                        # Prevent K-Pop Japanese version mismatch
                        if not (is_jp_lyrics and not is_jp_query and "japanese" not in clean_title.lower()):
                            return {
                                "plain": plain_text,
                                "synced": synced,
                                "source": "lrclib",
                                "has_word_sync": bool(data.get("hasWordSync")) or any(bool(x.get("words")) for x in synced)
                            }
        except Exception as e:
            logger.debug("LRCLIB /get failed: %s", e)

        # 2. Search fallback
        try:
            q = f"{clean_artist} {clean_title}".strip()
            resp = await client.get(f"{LRCLIB_BASE_URL}/search", params={"q": q})
            if resp.status_code == 200:
                results = resp.json()
                if isinstance(results, list) and results:
                    # Filter candidates with synced lyrics
                    candidates = [c for c in results if c.get("syncedLyrics") or c.get("lyricsfile")]
                    if not candidates:
                        candidates = results

                    # Filter out Japanese mismatch
                    is_jp_query = bool(re.search(r'[\u3040-\u309F\u30A0-\u30FF]', clean_title + " " + clean_artist))
                    if not is_jp_query and "japanese" not in clean_title.lower():
                        valid_c = []
                        for c in candidates:
                            c_plain = c.get("plainLyrics") or ""
                            if not bool(re.search(r'[\u3040-\u309F\u30A0-\u30FF]', c_plain)):
                                valid_c.append(c)
                        if valid_c:
                            candidates = valid_c

                    best = candidates[0]

                    best = candidates[0]
                    if duration > 0:
                        def score_candidate(c):
                            score = abs((c.get("duration") or 0) - duration)
                            c_title = (c.get("trackName") or "").lower()
                            q_title = clean_title.lower()
                            if "japanese" in c_title and "japanese" not in q_title:
                                score += 500
                            if "inst" in c_title and "inst" not in q_title:
                                score += 500
                            return score
                        candidates.sort(key=score_candidate)
                        best = candidates[0]

                    synced_lrc = best.get("syncedLyrics") or ""
                    lyricsfile = best.get("lyricsfile") or ""
                    plain = best.get("plainLyrics") or ""
                    if synced_lrc or lyricsfile:
                        synced = parse_enhanced_lrc(synced_lrc, lyricsfile)
                        if synced:
                            return {
                                "plain": plain or "\n".join(x["text"] for x in synced),
                                "synced": synced,
                                "source": "lrclib",
                                "has_word_sync": bool(best.get("hasWordSync")) or any(bool(x.get("words")) for x in synced)
                            }
                    elif plain:
                        return {
                            "plain": plain,
                            "synced": [],
                            "source": "lrclib",
                            "has_word_sync": False
                        }
        except Exception as e:
            logger.debug("LRCLIB /search failed: %s", e)

    return None
