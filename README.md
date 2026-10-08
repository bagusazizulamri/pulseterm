# PulseTerm

A keyboard-centric music player with a retro terminal aesthetic and modern liquid glass modes, featuring real-time audio DSP, synchronized romanized lyrics, and portable desktop support.

---

## Highlights

* **Terminal & Modern Dual UI**: Monospace typography, ASCII-style telemetry, CRT scanlines, and high-contrast colorways (MAC Light, YouTube Soft, OLED, Cyberpunk, Nordic, Liquid Glass, Soft Dark). Fully responsive across all desktop resolutions, split-screen snap layouts, and narrow aspect ratios.
* **Studio Audio DSP**:
  * **10-Band EQ & SmartEQ**: 32 Hz–16 kHz equalizer with preamp control, adaptive archetype matching, and dynamic spectral compensation.
  * **Perfect Tune**: Reference-curve spectral adjustment based on real-time FFT measurement.
  * **Spatial Audio & Limiter**: Binaural M/S processing, HRTF panning, synthetic convolution reverb, and lookahead limiter protection.
* **Synchronized & Romanized Lyrics**: Timed line-by-line lyrics (LRCLIB & YouTube) with secondary script transliteration (Japanese Romaji, Korean Romaja, Chinese Pinyin, Cyrillic) and translation fallback.
* **Windows Portable Edition**: Zero-install standalone desktop application powered by Microsoft Edge WebView2 with bundled Python runtime, automatic background service lifecycle, dynamic DWM window border/titlebar theme synchronization, and high-DPI PerMonitorV2 support.
* **Fast & Self-Contained**: Multi-layer stream caching (RAM L1 + persistent SQLite L2), continuous streaming audio proxy, SQLite WAL storage, and zero CDN dependencies.

---

## Quick Start

### Option A: Windows Portable (Pre-bundled)
1. Download or extract `PulseTerm-Windows-Portable.zip`.
2. Run `PulseTerm.exe`. The backend service and WebView2 desktop window start and stop automatically with no installation required.

### Option B: Linux / macOS / Manual Run
```bash
# Clone repository
git clone https://github.com/bagusazizulamri/pulseterm.git
cd pulseterm

# Setup & install dependencies
chmod +x setup.sh manage.sh
./setup.sh

# Start service
./manage.sh start
```
Open **http://localhost:3000** in your browser.

Service controls:
```bash
./manage.sh [start | stop | restart | status]
```

### Building the Windows Portable App
From Linux/WSL with Go and Python installed:
```bash
chmod +x scripts/build_windows_portable.sh
./scripts/build_windows_portable.sh
```
Output will be generated in `dist/PulseTerm-Portable/` and packaged as `dist/PulseTerm-Windows-Portable.zip`.

---

## Keybindings

| Key       | Action                | Key   | Action                     |
| --------- | --------------------- | ----- | -------------------------- |
| `Space`   | Play / Pause          | `e`   | Toggle Equalizer           |
| `n`       | Next track            | `x`   | Cycle Spatial Audio mode   |
| `p`       | Previous track        | `a`   | Toggle Auto-EQ             |
| `←` / `→` | Seek ±5s              | `p`   | Perfect Tune *(EQ panel)*  |
| `↑` / `↓` | Volume ±5%            | `l`   | Toggle Lyrics              |
| `m`       | Toggle Mute           | `v`   | Toggle CAVA visualizer     |
| `s`       | Toggle Shuffle        | `c`   | Toggle CRT scanlines       |
| `r`       | Cycle Repeat          | `q`   | Toggle Queue               |
| `/`       | Search command prompt | `t`   | Cycle color theme          |
| `1`–`4`   | Switch tab            | `Esc` | Close active panel / modal |
| `?`       | Show help             |       |                            |

> `p` controls Previous Track outside the EQ panel and triggers Perfect Tune while the EQ panel is active.

---

## Tech Stack

* **Desktop Shell**: Go native launcher, Microsoft Edge WebView2, Windows DWM theme integration, embedded PE32+ resource manifest and multi-resolution icon.
* **Backend**: Python 3.12, FastAPI, Uvicorn, SQLite + aiosqlite (WAL mode), ytmusicapi, yt-dlp, LRCLIB.
* **Audio Engine**: Web Audio API — BiquadFilter, AudioWorklet, ConvolverNode, and HRTF Panner.
* **Frontend**: Vanilla ES6 Modules + CSS (no node build step or JS framework required).

---

## License

GPL-3.0