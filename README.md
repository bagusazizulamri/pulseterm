# PulseTerm

> Minimalist, lightweight TUI YouTube Music player with studio-grade Web Audio DSP, 3D Spatial Audio, and synchronized multi-script lyrics. Zero telemetry, zero bloat.

---

## 📸 Screenshots

| Dashboard & Taste Profiler | 10-Band Equalizer & DSP | Synced Teletext Lyrics |
| :---: | :---: | :---: |
| ![Dashboard](docs/screenshots/home.png) | ![Equalizer](docs/screenshots/equalizer.png) | ![Lyrics](docs/screenshots/lyrics.png) |

---

## ⚡ Highlights

- **Pure Monospace TUI**: Retro CRT scanlines, ASCII telemetry, and customizable color themes (Dark, Amber, OLED, Cyberpunk, Nordic, Liquid Glass, Soft Dark).
- **Studio Audio DSP (48 kHz Opus)**:
  - **10-Band Parametric EQ**: 32Hz–16kHz faders, preamp trim, harmonic bass boost, and 14 calibrated presets.
  - **Smart Auto-EQ**: Word-boundary genre classification that adapts EQ presets seamlessly on track changes without overwriting user manual settings.
  - **⚡ Perfect Tune**: Pre-EQ 8192-FFT octave spectral analysis with target pink noise tilt (-4.5 dB/oct) and auto gain staging.
  - **3D Binaural Spatial Audio**: True Mid/Side matrix with HRTF panners, synthetic stereo convolver reverb, and RMS-normalized loudness matching (`OFF`, `STUDIO`, `WIDE`, `CONCERT`).
  - **Brickwall Lookahead Limiter**: 5ms lookahead AudioWorklet with -1.0 dBFS ceiling and transparent compressor fallback.
- **Synced Multi-Script Lyrics**: Real-time timed lyrics with automatic dual-script Romanization:
  - 🇯🇵 Japanese (Romaji) · 🇰🇷 Korean (Romaja) · 🇨🇳 Chinese (Pinyin) · 🇷🇺 Cyrillic.
- **Privacy & Performance**: Personal/local use, zero external CDN dependencies, SQLite WAL storage, <1% CPU footprint.

---

## 🚀 Quick Start

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

## ⌨️ Keybindings

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

## 🛠 Tech Stack

- **Backend**: Python 3.12, FastAPI, Uvicorn, SQLite (aiosqlite WAL), ytmusicapi, yt-dlp.
- **Audio Engine**: Web Audio API (BiquadFilter, AudioWorklet brickwall limiter, ConvolverNode, HRTF Panner).
- **Frontend**: Vanilla ES6 Modules + Pure CSS (no build tools, no npm, no frameworks).

---

## 📄 License

GPL-3.0