# PulseTerm // Minimalist TUI Audio Player

A high-performance, lightweight terminal-style YouTube Music audio player. Built with an authentic TUI monospace aesthetic, zero tracking, zero bloat, CAVA spectrum analyzer, and 10-band DSP parametric equalizer with genre presets.

## Tech Stack

- **Backend**: Python 3.12 + FastAPI + Uvicorn + SQLite WAL
- **Audio Engine**: Web Audio API (BiquadFilterNode DSP chain, DynamicsCompressor limiter)
- **YouTube Audio**: ytmusicapi + yt-dlp + Stream proxying
- **Database**: SQLite via aiosqlite
- **Frontend**: Vanilla ES6 Modules + Pure CSS (zero frontend frameworks)
- **Visualizer**: High-performance canvas CAVA / Oscilloscope / VU / ASCII

## Features

- **TUI & Terminal Aesthetics**: Authentic ASCII borders, CRT scanline raster mode, and teletext lyrics overlay.
- **10-Band DSP Parametric Equalizer**: 32Hz to 16kHz faders with Pre-amp headroom and Bass Booster controls.
- **Genre Presets**: Flat, Bass Boost, Rock, Pop, Electronic/EDM, Hip-Hop, R&B, Jazz, Classical, Acoustic, Dance, Metal, Vocal, and Treble Boost.
- **Anti-Clipping Studio Limiter**: Built-in dynamics limiter prevents digital distortion on high bass boosts.
- **Instant Deck Swapping & Crossfade**: Smooth gapless transitions between tracks.
- **YouTube Music Streaming**: Fast search across songs, artists, albums, and playlists.
- **Queue & Playlist Management**: Reorderable playback buffer and custom local playlist registry.
- **Full Keyboard Navigation**: Command-line hotkeys for mouse-free operation.
- **Privacy First**: Zero tracking, zero analytics, zero external CDNs.

## Quick Start

```bash
# Run setup
chmod +x setup.sh
./setup.sh

# Start server
./manage.sh start
```

Access at **http://localhost:3000**

### Service Management

```bash
./manage.sh start    # Start server
./manage.sh stop     # Stop server
./manage.sh restart  # Restart server
./manage.sh status   # Check status
```

## Keyboard Shortcuts

- `Space` - Play / Pause
- `1, 2, 3, 4` - Quick switch: Home, Search, Library, Playlists
- `/` - Focus search command prompt
- `e` - Toggle 10-Band DSP Equalizer panel
- `v` - Toggle CAVA spectrum visualizer HUD
- `c` - Toggle CRT scanline raster effect
- `q` - Toggle playback queue buffer drawer
- `l` - Toggle teletext lyrics overlay
- `n / p` - Next track / Previous track
- `← / →` - Seek backward / forward 5 seconds
- `↑ / ↓` - Volume up / down
- `m` - Toggle mute
- `s` - Toggle shuffle mode
- `r` - Cycle repeat mode (none / all / one)
- `t` - Cycle terminal color themes
- `Esc` - Dismiss active drawer or modal
- `?` - Show command keymap

## License

GPL-3.0