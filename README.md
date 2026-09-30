# PulseTerm

> Minimalist, lightweight web YouTube Music player with a terminal-like UI style, studio-grade Web Audio DSP, 3D Spatial Audio, and synchronized multi-script lyrics. Zero telemetry, zero bloat.

---

## Screenshots

| Dashboard & Taste Profiler | 10-Band Equalizer & DSP | Synced Teletext Lyrics |
| :---: | :---: | :---: |
| ![Dashboard](docs/screenshots/home.png) | ![Equalizer](docs/screenshots/equalizer.png) | ![Lyrics](docs/screenshots/lyrics.png) |

---

## Highlights

- **Terminal-Like UI Style**: Browser-based web player designed with a retro terminal aesthetic (not a pure command-line/curses TUI app)—featuring monospace typography, ASCII borders/telemetry, CRT scanlines, keyboard-first navigation, and customizable color themes (MAC Light, YouTube Soft, OLED, Cyberpunk, Nordic, Liquid Glass, Soft Dark).
- **Studio Audio DSP (48 kHz Opus)**:
  - **10-Band Parametric EQ**: 32 Hz–16 kHz bands with preamp trim, harmonic bass enhancement, and 14 calibrated presets.
  - **SmartEQ** — a 3-phase adaptive equalizer that combines metadata-driven spectral targeting with real-time audio analysis:
    1. **Metadata → Archetype Selection**: Maps genre, vibe, and artist/title metadata to a spectral archetype containing target tilt, per-band priorities, and base gains. Uses word-boundary matching across 200+ artists and songs spanning K-Pop, J-Pop, Metal, Hip-Hop, R&B, EDM, and more.
    2. **Real-Time Spectral Reclassification**: After ~1.8 s of playback, analyzes 20 consecutive 8192-point FFT frames and computes octave-band power. If the measured spectral profile disagrees with the metadata-derived archetype, SmartEQ automatically reclassifies the audio.
    3. **Dynamic Spectral Compensation**: Compares each octave band against the selected archetype's target spectral tilt, then applies bounded boosts to under-represented frequencies and cuts to over-represented frequencies. Three-point smoothing and gain clamps prevent excessive correction. Diagnostic hints such as `+PUNCH`, `+VOCAL`, `+AIR`, `TAME HARSH`, and `BALANCED` expose the current spectral correction.
  - **Perfect Tune**: Pre-EQ 8192-point FFT spectral analysis using a pink-noise-derived reference curve with a -4.5 dB/oct target tilt, followed by automatic gain staging.
  - **3D Binaural Spatial Audio**: Mid/Side processing with HRTF-based panning, synthetic stereo convolution reverb, and RMS-normalized loudness matching across `OFF`, `STUDIO`, `WIDE`, and `CONCERT` modes.
  - **Brickwall Lookahead Limiter**: 5 ms lookahead AudioWorklet limiter with a -1.0 dBFS ceiling and a transparent compressor fallback for unsupported processing paths.
- **Synced Multi-Script Lyrics**: Real-time timed lyrics with automatic dual-script Romanization:
  - Japanese (Romaji), Korean (Romaja), Chinese (Pinyin), Cyrillic.
- **Privacy & Performance**: Personal/local use, zero external CDN dependencies, SQLite WAL storage, <1% CPU footprint.

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/bagusazizulamri/pulseterm.git
cd pulseterm

# Setup & install
chmod +x setup.sh manage.sh
./setup.sh

# Start service
./manage.sh start
```

Open **http://localhost:3000** in your browser.

```bash
./manage.sh [start | stop | restart | status]
```

---

## Keybindings

| Key | Action | Key | Action |
| :--- | :--- | :--- | :--- |
| `Space` | Play / Pause | `e` | Toggle Equalizer panel |
| `n` / `p` | Next / Prev track *(or Perfect Tune when EQ open)* | `x` | Cycle Spatial Audio mode |
| `←` / `→` | Seek ±5s | `a` | Toggle Auto-EQ *(in EQ panel)* |
| `↑` / `↓` | Volume ±5% | `p` | Perfect Tune *(in EQ panel)* |
| `m` | Toggle Mute | `l` | Toggle Lyrics overlay |
| `s` | Toggle Shuffle | `v` | Toggle CAVA visualizer |
| `r` | Cycle Repeat (none / all / one) | `c` | Toggle CRT scanlines |
| `/` | Search command prompt | `q` | Toggle Queue drawer |
| `1`–`4` | Switch tab (Home / Search / Library / Playlists) | `t` | Cycle color theme |
| `Esc` | Close active panel or modal | `?` | Show help modal |

---

## Tech Stack

- **Backend**: Python 3.12, FastAPI, Uvicorn, SQLite (aiosqlite WAL), ytmusicapi, yt-dlp.
- **Audio Engine**: Web Audio API (BiquadFilter, AudioWorklet brickwall limiter, ConvolverNode, HRTF Panner).
- **Frontend**: Vanilla ES6 Modules + Pure CSS (no build tools, no npm, no frameworks).

---

## License

GPL-3.0