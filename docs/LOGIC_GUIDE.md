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
- Rekomendasi (`recommend.py`): match batas kata (`_word_hit`, hyphen = separator), filter genre keras (iris non-kosong bila dua sisi punya genre), `is_video_track` tolak OMV/UGC bila seed audio, diversity ≤2 per artis, reorder anti-cluster. Cache threshold saat ini `len(tracks)>=5` (rencana turun ke >=2 — F5). Artis dinormalisasi via `normalize_artist()` (drop `- Topic`, split `,&/feat./ft.`, dedupe case-insensitive) — dipakai untuk diversity cap dan same-artist match.
- Lirik: LRCLIB tolak mismatch script JA, skor durasi, parse Enhanced LRC `<mm:ss.xx>`. Translit chain: cutlet→pykakasi (JA), pypinyin (ZH), dekomposisi Jamo (KO), ISO 9 (Cyr). Batch 20 baris.
- Realtime: `RealtimeHub.broadcast` coalesced (satu `_pending` + satu `_flush_task` per loop tick). `broadcast()` pakai `asyncio.gather(*[send], return_exceptions=True)` supaya klien lambat tidak menghambat klien lain.
- Log: pakai `logging.getLogger("pulseterm.<modul>")`. JANGAN `print()`.

## 6. Pola frontend (wajib tiru)
- ES module murni (`"type":"module"`), tanpa bundler/framework/CDN. `eq-core.js` MURNI: data + fungsi tanpa DOM/AudioContext (bisa jalan di `node`). `equalizer.js` wiring graph. Jangan campur.
- Fungsi murni di `eq-core.js`: `analyzeAndCompensate, classifySpectralProfile, computeTuneCorrections, assessAirEligibility, refineAirCompensation, AIR_POLICY_BY_ARCHETYPE, normalize_artist`.
- Toast mode-aware: pakai `equalizer._toast(msg)` (lihat `frontend/js/equalizer.js`). Di Modern mode helper otomatis memanggil `ModernUiEngine.formatModernToast()` — bracket `[…]` dihilangkan dan akronim AUTO-EQ/PERFECT TUNE/DSP/SPATIAL dipertahankan uppercase (lihat §7 smartEQ + §6 whitespace & retro-bracket). JANGAN panggil `window.player.showToast(...)` langsung dari equalizer.js supaya toast konsisten lintas mode UI.

## 7. smartEQ — Pipeline & invariant (WAJIB patuhi)

**Pipeline 4 lapis** (urutan eksekusi `analyzeAndCompensate`):

1. **Defect calc** (`rawDefect[i]`):
   ```
   expectedRel = (i - 5) * arch.targetTilt      // pink-noise slope 4.5 dB/oct
   actualRel   = bandDb[i] - bandDb[5]
   defect      = (expectedRel - actualRel) * arch.priorities[i] * 0.35
   rawDefect[i] = clamp(defect, arch.maxCut, arch.maxBoost)
   ```
2. **3-point smoothing** (`smoothed[i]`):
   ```
   i=0:   0.75·r[0] + 0.25·r[1]
   i=9:   0.75·r[9] + 0.25·r[8]
   else:  0.25·r[i-1] + 0.5·r[i] + 0.25·r[i+1]
   ```
   **INVARIAN**: setelah smoothing, **WAJIB** di-clamp lagi ke
   `[-maxCut, maxBoost]` per band. BUG LAMA: smoothing membuat 250Hz
   muddy "naik" dari cut ke boost karena bleeding dari tetangga.
3. **AIR gating** (`assessAirEligibility`):
   - `NO AIR CONTENT` / `ROLLED-OFF` / `NO SHIMMER` / `HARSH` / `SIBILANT`
     / `NO VOCAL` → boost 16k = 0, 8k ≤ 0.5
   - `THIN` (16kHz 4..6dB di atas noise, nada tipis) → boost 16k = 0,
     8k ≤ 0.5 (micro-lift saja)
   - Eligible → cap 16k ke `arch.airMaxBoost`, 8k ke `airMaxBoost + 0.5`
4. **Merge with base** + telemetry hint:
   ```
   finalGains[i] = clamp(baseGains[i] + smoothed[i], -12, +12)
   ```
   Saat air blocked: `finalGains[9] ≤ blockedTotalCap`,
   `finalGains[8] ≤ blockedTotalCap + 1.0`.

**Anti-mud guard (250Hz)**: bila `smoothed[2]` (125Hz) > 1.5 dan
`smoothed[3]` (250Hz) > 0.5, cap `smoothed[3]` ke 0 (125Hz sudah hangat,
250 jangan ditambah lagi — ballad/jazz/rnb rentan boxy). Berlaku di
SEMUA archetype kecuali `metal` & `electronic` (lowMid sengaja di-cut).

**Vocal-proximity guard (8k/16k)**: bila `presDev > 2.0` (vokal sudah
hadir kuat di 2kHz), kurangi `finalGains[8]` & `[9]` sebesar
`min(1.5, (presDev - 2.0) * 0.5)`. Vokal kuat = kurang butuh air extra.

**Vocal-formant (soprano) priority**: untuk archetype `pop_upbeat` &
`sad_ballad`, weight `priorities[6]` (2kHz) ≥ `priorities[5]` (1kHz).
Vokal wanita formant di 2.5-4kHz — boost 1kHz menambah "chest" maskulin.

**Adaptive preamp (smartEQ)**: preamp akhir =
`arch.preamp - 0.5 * max(0, maxOffset - 1.0)` supaya total gain tidak
melebihi budget saat offset kompensasi besar. Versi Perfect Tune:
`preamp = -(maxGain*0.6 + (sumPos>10 ? 1.0 : 0))`.

**Hint telemetry** (JANGAN klaim `+AIR` saat air ditahan):
- eligible + thin: `+AIR (thin)`
- eligible + bass+treble naik: `+PUNCH · +AIR`
- eligible + treble naik saja: `+AIR`
- eligible + bass naik saja: `+PUNCH`
- eligible + mid naik saja: `+VOCAL`
- eligible + treble turun: `TAME HARSH`
- eligible + bass turun: `TIGHT BASS`
- else eligible: `BALANCED`
- blocked: `<bass/mid/trebleMod> · AIR HELD` atau `TIGHT BASS` /
  `TAME HARSH` sesuai arah mod. Suffix ` (check again…)` bila
  `airConfidence === 'LOW'`.

**Dynamics safety**: bila `Σ positive gains > 8dB` lintas band, scale
global -1.5dB untuk cegah IS-clipping. Berlaku untuk semua archetype.

**Regression lock**: T11 (`t11-ballad-benchmark`) = Lee Haeri
"I Hate That I Miss You" 6 window. PERUBAHAN smartEQ WAJIB lulus semua
test T11 (B1..B5) tanpa modifikasi band number. Boleh ubah threshold
`AIR_GATING.*` / `SPECTRAL_ARCHETYPES.*` asal 5 test T11 tetap hijau.
T9 (`t9-smart-autoeq`) = preset shape + 2 dynamic test.
T10 (`t10-air-gating`) = boundary AIR GATING.

**Backlog saran review smartEQ** (lihat sesi review #smartEQ):
- #1 smoothing clamp → WAJIB (muddy protection)
- #2 anti-mud 250Hz → WAJIB
- #4 targetTilt flat → WAJIB (flat jangan nge-boost besar-besaran)
- #6 vocal-proximity 8k/16k → WAJIB
- #8 adaptive preamp → WAJIB
- #3 1-2kHz harsh detection → NICE
- #7 computeTuneCorrections clamp konsisten → NICE
- #9 adaptive smoothing → NICE
- #10 dynamics safety Σ positive → NICE
- #11 live recording detection → BACKLOG
- #13 refinement cache module-level → NICE
- #14 formant shift wanita → NICE (setelah #6 selesai)

- `spatial.js`: split dry/bass/spatial, bass tetap mono. `limiter_worklet.js`: lookahead ~5ms, ceiling -1.0 dBFS, release ~80ms.
- `player.js` export `{player, formatTime}`. `modern.js` set global `switchUiMode/getUiMode` (order-dependen — hati-hati).

## 7. Aturan AI (DO / DO NOT)
- DO: validasi di trust boundary; clamp int; envelope tetap; stdlib dulu; diff terkecil; hapus kode mati; satu test runnable untuk logika non-trivial.
- DO NOT: tambah dependensi baru; ubah envelope; ubah panjang array gains; ubah kontrak WS; reset `_order` diam-diam; `print()` baru; framework CSS/JS baru; abstraksi sekali-pakai (interface/factory/config untuk nilai tetap).
- Sederhanakan sengaja → komentar `ponytail:` berisi plafon + upgrade path.
- Test: backend tiru `test_api.py` (setUp `ASGITransport`, tearDown `aclose`); frontend tiru `t10-air-gating.test.mjs` (`node:test` + `assert/strict`).
- Toast UI konsisten lintas mode: panggil `equalizer._toast(msg)` (atau helper mode-aware lain) daripada `window.player.showToast` langsung di equalizer.js. Lihat §6.

## 9. Prompt tempel untuk model lain
```
Ikuti docs/LOGIC_GUIDE.md secara ketat.
Kontrak: envelope {success,data,error}; video_id regex ^[A-Za-z0-9_-]{11}$;
gains EQ panjang 10; Song backend snake_case, JSON camelCase.
Pola int: try max(0,int(...)) except → 0. POST body: dict|None → {}.
DB aiosqlite per-fungsi + Row→dict. Log via logging, bukan print.
eq-core.js murni (no DOM). Air ineligible → offset 16k≤0 + hint AIR HELD.

smartEQ pipeline: defect → smooth → CLAMP lagi ke ±maxCut/maxBoost →
AIR gate → merge base → preamp adaptif → hint.
Anti-mud 250Hz: cap 250 ke 0 bila 125 > 1.5. Vocal-proximity: kurangi
8k/16k saat presDev > 2.0. Regression lock T11 (Lee Haeri 6 window).

Jangan tambah dependensi. Diff minimal + satu test untuk logika non-trivial.
```

