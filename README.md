# PulseTerm

A browser-based music player with a retro terminal-inspired interface and a focus on local playback, keyboard control, synchronized lyrics, and real-time audio processing.

## Highlights

* **Terminal-Like UI**: Browser-based player with a retro terminal-inspired interface rather than a traditional command-line TUI. Includes monospace typography, ASCII-style borders and telemetry, CRT scanlines, keyboard-first navigation, and customizable themes (MAC Light, YouTube Soft, OLED, Cyberpunk, Nordic, Liquid Glass, Soft Dark).

* **Studio Audio DSP (48 kHz Opus)**:

  * **10-Band EQ**: 32 Hz–16 kHz bands with preamp control, harmonic bass enhancement, and 14 built-in presets.
  * **SmartEQ** — a 3-stage adaptive EQ system that uses track metadata and measured audio characteristics:

    1. **Metadata → Archetype**: Uses genre, vibe, and artist/title metadata to select an initial spectral profile. Matching uses word boundaries across a collection of 200+ artists and songs covering genres such as K-Pop, J-Pop, Metal, Hip-Hop, R&B, and EDM.
    2. **Spectral Reclassification**: After approximately 1.8 seconds of playback, SmartEQ analyzes 20 FFT frames using an 8192-point FFT and compares the measured octave-band distribution with the initial profile. A different profile can be selected when the measured spectrum does not match the initial classification.
    3. **Spectral Compensation**: Applies limited frequency boosts or cuts based on the difference between the measured spectrum and the selected target profile. Three-point smoothing and gain limits are used to reduce abrupt or excessive corrections. The UI reports the detected adjustment with hints such as `+PUNCH`, `+VOCAL`, `+AIR`, `TAME HARSH`, and `BALANCED`.
    4. **Air Eligibility Gating**: Not every song may receive an airy boost — especially airy vocal. Before touching 8 kHz/16 kHz, SmartEQ (and Perfect Tune) checks whether the track actually has usable high-frequency content. The boost is held (`AIR HELD …`) when the track is lo-fi / noise-floor only, intentionally rolled-off (vintage/lo-fi/cassette), already harsh or sibilant at 8 kHz, or has no vocal presence at 2 kHz (drops/instrumentals). Even when eligible, the 16 kHz boost is capped per archetype (e.g. ballad/metal ≈ +1.0 dB, pop/EDM up to +3.0 dB).
  * **Perfect Tune**: Performs an 8192-point FFT analysis before EQ processing and uses a reference spectral curve with a -4.5 dB/oct target tilt to determine initial gain adjustments.
  * **Binaural Spatial Audio**: Uses Mid/Side processing, HRTF-based panning, synthetic stereo convolution reverb, and RMS-based loudness matching. Available modes are `OFF`, `STUDIO`, `WIDE`, and `CONCERT`.
  * **Lookahead Limiter**: AudioWorklet-based limiter with approximately 5 ms lookahead and a -1.0 dBFS ceiling. A compressor-based fallback is available for processing paths where the limiter is not used.

* **Synced Multi-Script Lyrics**: Timed lyrics with automatic secondary-script conversion for supported languages:

  * Japanese → Romaji
  * Korean → Romaja
  * Chinese → Pinyin
  * Cyrillic → Latin transliteration

* **Local & Lightweight**: Designed for personal/local use with no external CDN dependencies. Uses SQLite in WAL mode for local application data and is intended to keep resource usage low during normal playback.

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

> `p` controls Previous Track outside the EQ panel and Perfect Tune while the EQ panel is active.

---

## Tech Stack

* **Backend**: Python 3.12, FastAPI, Uvicorn, SQLite + aiosqlite (WAL mode), ytmusicapi, yt-dlp.
* **Audio**: Web Audio API — BiquadFilter, AudioWorklet, ConvolverNode, and HRTF Panner.
* **Frontend**: Vanilla ES6 Modules + CSS.
* **Build**: No frontend build step, npm, or JavaScript framework required.

---

## License

GPL-3.0