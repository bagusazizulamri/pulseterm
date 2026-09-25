"""Polyglot Non-Latin Lyrics Romanization Engine for PulseTerm.

Supports:
- Japanese: Romaji (Hepburn Romanization via pykakasi)
- Korean: Romaja (Revised Romanization of Korean via Hangul Jamo decomposition)
- Chinese: Pinyin (Hànyǔ Pīnyīn with tones via pypinyin)
- Cyrillic: Translit (ISO 9 / GOST standard transliteration)
"""
import re

_kakasi_instance = None


def _get_kakasi():
    global _kakasi_instance
    if _kakasi_instance is None:
        try:
            import pykakasi
            _kakasi_instance = pykakasi.kakasi()
        except Exception:
            _kakasi_instance = None
    return _kakasi_instance


# Revised Romanization of Korean tables
_HANGUL_INITIALS = [
    'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '',
    'j', 'jj', 'ch', 'k', 't', 'p', 'h'
]
_HANGUL_VOWELS = [
    'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe',
    'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'
]
_HANGUL_FINALS = [
    '', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lg', 'lm', 'lb', 'ls',
    'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't',
    'p', 'h'
]

_CYRILLIC_MAP = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z',
    'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R',
    'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'Є': 'Ye', 'є': 'ye', 'І': 'I', 'і': 'i', 'Ї': 'Yi', 'ї': 'yi', 'Ґ': 'G', 'ґ': 'g'
}


def _romanize_korean_text(text: str) -> str:
    res = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            s_idx = code - 0xAC00
            res.append(_HANGUL_INITIALS[s_idx // 588] + _HANGUL_VOWELS[(s_idx % 588) // 28] + _HANGUL_FINALS[s_idx % 28])
        else:
            res.append(ch)
    return ''.join(res)


def romanize_line(text: str, default_cjk_script: str = "japanese") -> dict:
    """Romanize a single line if it contains non-Latin scripts.

    Returns dict with {roman, script, scriptLabel} or None if already Latin/numeric.
    """
    if not text or not isinstance(text, str) or not text.strip():
        return None

    # 1. Korean (Hangul)
    if re.search(r'[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]', text):
        roman = _romanize_korean_text(text)
        return {"roman": roman, "script": "korean", "scriptLabel": "Romaja"}

    # 2. Japanese Kana (Hiragana / Katakana)
    if re.search(r'[\u3040-\u309F\u30A0-\u30FF]', text):
        k = _get_kakasi()
        if k is not None:
            conv = k.convert(text)
            roman = ' '.join([item['hepburn'] for item in conv if item['hepburn']])
            roman = re.sub(r'\s+', ' ', roman).strip()
            return {"roman": roman, "script": "japanese", "scriptLabel": "Romaji"}

    # 3. Chinese Hanzi / Japanese Kanji without Kana
    if re.search(r'[\u4E00-\u9FFF]', text):
        if default_cjk_script == "chinese":
            try:
                import pypinyin
                conv = pypinyin.pinyin(text, style=pypinyin.Style.TONE)
                roman = ' '.join([c[0] for c in conv if c and c[0]])
                return {"roman": roman, "script": "chinese", "scriptLabel": "Pinyin"}
            except Exception:
                pass
        else:
            k = _get_kakasi()
            if k is not None:
                conv = k.convert(text)
                roman = ' '.join([item['hepburn'] for item in conv if item['hepburn']])
                roman = re.sub(r'\s+', ' ', roman).strip()
                return {"roman": roman, "script": "japanese", "scriptLabel": "Romaji"}

    # 4. Cyrillic
    if re.search(r'[\u0400-\u04FF]', text):
        roman = ''.join([_CYRILLIC_MAP.get(ch, ch) for ch in text])
        return {"roman": roman, "script": "cyrillic", "scriptLabel": "Translit"}

    return None


def enrich_lyrics(lyrics_data: dict) -> dict:
    """Enrich lyrics data dict with romanized counterparts.

    Input: {"plain": str, "synced": list[dict(text, start, end)]}
    Output: {"plain": str, "synced": list[dict(text, roman, script, start, end)],
             "has_roman": bool, "script": str, "script_label": str}
    """
    if not isinstance(lyrics_data, dict):
        return {"plain": "", "synced": [], "has_roman": False, "script": "latin", "script_label": "Latin"}

    plain = lyrics_data.get("plain", "") or ""
    synced = lyrics_data.get("synced", []) or []

    # Detect primary non-Latin script across whole song
    full_text = plain + " " + " ".join([ln.get("text", "") for ln in synced if isinstance(ln, dict)])

    primary_script = "latin"
    script_label = "Latin"
    default_cjk = "japanese"

    if re.search(r'[\uAC00-\uD7AF\u1100-\u11FF]', full_text):
        primary_script = "korean"
        script_label = "Romaja"
    elif re.search(r'[\u3040-\u309F\u30A0-\u30FF]', full_text):
        primary_script = "japanese"
        script_label = "Romaji"
        default_cjk = "japanese"
    elif re.search(r'[\u4E00-\u9FFF]', full_text):
        primary_script = "chinese"
        script_label = "Pinyin"
        default_cjk = "chinese"
    elif re.search(r'[\u0400-\u04FF]', full_text):
        primary_script = "cyrillic"
        script_label = "Translit"

    has_any_roman = False
    enriched_synced = []

    for item in synced:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        start = item.get("start", 0)
        end = item.get("end", 0)
        r = romanize_line(text, default_cjk_script=default_cjk)
        if r:
            has_any_roman = True
            enriched_synced.append({
                "text": text,
                "roman": r["roman"],
                "script": r["script"],
                "start": start,
                "end": end
            })
        else:
            enriched_synced.append({
                "text": text,
                "roman": "",
                "script": "latin",
                "start": start,
                "end": end
            })

    # Also handle plain lyrics fallback
    plain_roman_lines = []
    if plain:
        for line in plain.splitlines():
            r = romanize_line(line, default_cjk_script=default_cjk)
            if r:
                has_any_roman = True
                plain_roman_lines.append(r["roman"])
            else:
                plain_roman_lines.append(line)

    return {
        "plain": plain,
        "synced": enriched_synced,
        "has_roman": has_any_roman,
        "script": primary_script,
        "script_label": script_label,
        "plain_roman": "\n".join(plain_roman_lines) if has_any_roman else ""
    }
