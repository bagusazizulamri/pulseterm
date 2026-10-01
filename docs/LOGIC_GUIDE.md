# PulseTerm — Logic & Typing Guide (untuk AI model apa pun)

> Tujuan: hasil kode seragam meski ganti model AI. Patuhi pola di bawah.
> Checkpoint: tag `pre-refactor-checkpoint-2026-10-01` → commit `302d107a568f55a8e0726674333d4999d94bacb2` (branch `main`, working tree clean, 2026-10-01).
> Restore: `git checkout pre-refactor-checkpoint-2026-10-01` (read-only) atau `git checkout -b <nama> pre-refactor-checkpoint-2026-10-01` (kerja baru).

## 1. Peta repo
- `backend/main.py` (~1026 baris): FastAPI app, lifespan, 60 route, WS `/ws`, static mount `/`, `/css`, `/js`.
- `backend/api/music.py`: katalog ytmusicapi. `backend/api/stream.py`: resolve/cache URL yt-dlp. `backend/api/player.py`: state context+queue. `backend/api/recommend.py`: genre+vibe profiler. `backend/api/lrclib.py`: lirik. `backend/api/translit.py`: JA/KO/ZH/Cyr.
- `backend/database/__init__.py`: aiosqlite, WAL. `backend/models/__init__.py`: dataclass. `backend/config.py`: env.
- `frontend/js/api.js`: wrapper fetch. `app.js`: shell. `player.js`: transport (2111 LOC). `eq-core.js`: math murni. `equalizer.js`: graph Web Audio. `spatial.js`: M/S+HRTF. `visualizer.js`: HUD. `modern.js`: UI alt. `router.js`: hash route. `limiter_worklet.js`: AudioWorklet.
- Test backend: `tests/test_*.py` (unittest). Test DSP: `tests/frontend/t*.test.mjs` (`node --test`).

## 2. Command
- Backend run: `uvicorn main:app` dari `backend/` (atau `./run.sh`, `./manage.sh start`).
- Backend test: `python -m pytest tests/ -x -q` (style file: unittest + `httpx.ASGITransport`).
- Frontend DSP test: `node --test tests/frontend/`.
- Env: `APP_PORT=3000`, `DB_PATH=music.db`, `SESSION_CACHE=session_cache.json`. Test pakai `DB_PATH=/tmp/*.sqlite` (lihat `tests/test_api.py:8`).

## 3. Kontrak API (JANGAN ubah)
- Envelope sukses: `{"success": True, "data": ...}`. Gagal: `{"success": False, "error": "..."}` (+ `data` kadang ada).
- Proxy error pakai `JSONResponse({"success": False, ...}, status_code=400/502)`.
- Handler POST terima `body: dict = None`, baris pertama: `body = body if isinstance(body, dict) else {}`.
- String input: `str(body.get("k", "") or "")`. Strip bila URL/query.
- Int input (pola `_safe_int` / try-except):
  ```python
  try: duration = max(0, int(body.get("duration", 0) or 0))
  except (TypeError, ValueError): duration = 0
  ```
- Limit: `max(1, min(100, int(limit or 20)))`.
- video_id valid: `re.fullmatch(r"[A-Za-z0-9_-]{11}", str(vid))`. Gagal → `{"success": False, "error": "Invalid video id"}` (400 di proxy).
- Frontend wrapper (`frontend/js/api.js`) return `{success:false, data:null}` saat catch. Fungsi: `apiGet/apiPost/apiPut/apiDelete`, `API_BASE=''`.

## 4. Bentuk data kanonis
- Song backend (snake): `{video_id, title, artist, album, thumbnail, duration:int>=0}`. Dataclass `Song` (`models/__init__.py:5`): + `url, lyrics, auto_added:false, reason:"", video_type:"", result_type:"song", is_video:false`.
- Song JSON ke frontend (camel): `{videoId, title, artist, thumbnail, duration}`. Konversi di batas main.py (`_to_songs`, `_seed_dict`, `_norm_recommend_input`). Jangan campur di dalam modul.
- `Playlist{id:int, name:str, is_local:bool=True, created_at:str, songs:list}`. `PlayerState{current_song, is_playing:bool, position:int, volume:float, queue:list, queue_index:int=-1}`.
- Settings: `TOGGLE_KEYS=("shuffle","skipSilence","normalize","gapless")`, `NUMBER_KEYS=("volume","crossfade","sleepMinutes","speed")`, `TEXT_KEYS=("theme","repeat","lastContext")`. Default (`main.py:925`): `{theme:"dark", volume:0.8, shuffle:False, repeat:"none", crossfade:0.0, sleepMinutes:0, speed:1.0, skipSilence:False, normalize:False, gapless:True}`.
- EQ: `EQ_FREQUENCIES=[32,64,125,250,500,1000,2000,4000,8000,16000]`. Array `gains` SELALU panjang 10. Preset: `{name, label, gains[10], preamp:float}`. Hint UI bahasa Indonesia (`EQ_HINTS`).
- Rekomendasi: `{seed:{videoId}, tracks:[song...]}`. Cap konteks 300 (`player.py`).

## 5. Pola backend (wajib tiru)
- Import antar modul: `sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))` lalu `from config import ...`. Jangan ubah jadi relative import tanpa refactor semua file.
- DB: `aiosqlite.connect(DB_PATH)` per fungsi, `db.row_factory=aiosqlite.Row`, return `[dict(r) ...]`. PRAGMA saat init: `journal_mode=WAL, synchronous=NORMAL, cache_size=-64000, temp_store=MEMORY`. Tabel: `playlists, playlist_songs, history, settings, search_history, liked, lyrics_cache`. `set_liked` = toggle (ada→delete return False).
- Cache modul: dict + cap 500 (`_URL_CACHE_MAX`, `_LOCK_CACHE_MAX`). Stats: `{hits, misses, errors, forced, resolves}`. TTL default 4 jam; baca `expire=` dari URL.
- Stream (`stream.py`): single-flight `asyncio.Lock` per id (evict hanya lock idle), `Semaphore(4)` untuk yt-dlp, timeout 30 dtk. Format: `bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best` (itag 251 dulu).
- Player (`player.py`): model dua lapis context + user queue. `_order` = permutasi, `_order_pos` pointer. `set_current`: pop user queue bila lagu dari sana; lagu asing → index konteks tetap. `append_recommendations`: cap 300 (JANGAN reset `_order` ke `range()` — bug F4). `save_state`: tulis atomik `os.replace()+fsync`.
- Rekomendasi (`recommend.py`): match batas kata (`_word_hit`, hyphen = separator), filter genre keras (iris non-kosong bila dua sisi punya genre), `is_video_track` tolak OMV/UGC bila seed audio, diversity ≤2 per artis, reorder anti-cluster. Cache threshold saat ini `len(tracks)>=5` (rencana turun ke >=2 — F5).
- Lirik: LRCLIB tolak mismatch script JA, skor durasi, parse Enhanced LRC `<mm:ss.xx>`. Translit chain: cutlet→pykakasi (JA), pypinyin (ZH), dekomposisi Jamo (KO), ISO 9 (Cyr). Batch 20 baris.
- Realtime: `RealtimeHub.broadcast` tiap perubahan transport (rencana: queue per koneksi — F1).
- Log: pakai `logging.getLogger("pulseterm.<modul>")`. JANGAN `print()` (sisa di `recommend.py:608,656,683` mau dihapus).

## 6. Pola frontend (wajib tiru)
- ES module murni (`"type":"module"`), tanpa bundler/framework/CDN. `eq-core.js` MURNI: data + fungsi tanpa DOM/AudioContext (bisa jalan di `node`). `equalizer.js` wiring graph. Jangan campur.
- Fungsi murni di `eq-core.js`: `analyzeAndCompensate, classifySpectralProfile, computeTuneCorrections, assessAirEligibility, refineAirCompensation, AIR_POLICY_BY_ARCHETYPE`. T11 (`t11-ballad-benchmark`) = regression lock — jangan ubah output untuk 6 window lagu Lee Haeri tanpa update test eksplisit.
- Air gating: boost 8k/16k HANYA bila eligible. Bila tidak: offset 16k ≤0 + hint `AIR HELD` (JANGAN klaim `+AIR`).
- `spatial.js`: split dry/bass/spatial, bass tetap mono. `limiter_worklet.js`: lookahead ~5ms, ceiling -1.0 dBFS, release ~80ms.
- `player.js` export `{player, formatTime}`. `modern.js` set global `switchUiMode/getUiMode` (order-dependen — hati-hati).

## 7. Aturan AI (DO / DO NOT)
- DO: validasi di trust boundary; clamp int; envelope tetap; stdlib dulu; diff terkecil; hapus kode mati; satu test runnable untuk logika non-trivial.
- DO NOT: tambah dependensi baru; ubah envelope; ubah panjang array gains; ubah kontrak WS; reset `_order` diam-diam; `print()` baru; framework CSS/JS baru; abstraksi sekali-pakai (interface/factory/config untuk nilai tetap).
- Sederhanakan sengaja → komentar `ponytail:` berisi plafon + upgrade path.
- Test: backend tiru `test_api.py` (setUp `ASGITransport`, tearDown `aclose`); frontend tiru `t10-air-gating.test.mjs` (`node:test` + `assert/strict`).

## 8. Prompt tempel untuk model lain
```
Ikuti docs/LOGIC_GUIDE.md secara ketat.
Kontrak: envelope {success,data,error}; video_id regex ^[A-Za-z0-9_-]{11}$;
gains EQ panjang 10; Song backend snake_case, JSON camelCase.
Pola int: try max(0,int(...)) except → 0. POST body: dict|None → {}.
DB aiosqlite per-fungsi + Row→dict. Log via logging, bukan print.
eq-core.js murni (no DOM). Air ineligible → offset 16k≤0 + hint AIR HELD.
Jangan tambah dependensi. Diff minimal + satu test untuk logika non-trivial.
```

