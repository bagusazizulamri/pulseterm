#!/usr/bin/env bash
# ==============================================================================
# PulseTerm - Windows Portable App Build & Packaging Script
# Bundles:
# 1. Native Go PE32+ Launcher with Edge WebView2 integration
# 2. Embedded multi-resolution icon & Windows PerMonitorV2 manifest
# 3. Fully bundled Python embedded runtime + all backend dependencies (wheels)
# 4. Lifecycle management: auto-start backend on open, auto-stop on window close
# 5. Native PulseTerm border styling for desktop window frame
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PORTABLE_DIR="$DIST_DIR/PulseTerm-Portable"
LAUNCHER_SRC="$ROOT_DIR/windows/launcher"
ASSETS_DIR="$ROOT_DIR/assets"
WINDOWS_DIR="$ROOT_DIR/windows"
CACHE_DIR="$ROOT_DIR/.cache_bundle"

mkdir -p "$CACHE_DIR"

echo "========================================================"
echo " Building PulseTerm Windows Portable App (Edge WebView2)"
echo "========================================================"

# Step 1: Generate multi-resolution ICO icon
echo "[1/6] Generating multi-resolution ICO icon..."
python3 "$ROOT_DIR/scripts/build_icon.py" "$ASSETS_DIR/app.ico"

# Step 2: Ensure rsrc tool is available and compile resource section
RSRC_BIN="$HOME/go/bin/rsrc"
if [ ! -f "$RSRC_BIN" ]; then
    echo "[2/6] Installing rsrc tool via Go..."
    go install github.com/akavel/rsrc@latest
fi

echo "[2/6] Compiling Windows Resource section (.syso with manifest & icon)..."
"$RSRC_BIN" \
    -manifest "$WINDOWS_DIR/app.manifest" \
    -ico "$ASSETS_DIR/app.ico" \
    -arch amd64 \
    -o "$LAUNCHER_SRC/rsrc.syso"

# Step 3: Build Windows Native GUI Executable (.exe) with WebView2
echo "[3/6] Compiling PulseTerm.exe (Windows GUI x86-64 with Edge WebView2)..."
cd "$LAUNCHER_SRC"
GOOS=windows GOARCH=amd64 go build \
    -ldflags "-H=windowsgui -s -w" \
    -o "$DIST_DIR/PulseTerm.exe" \
    .

rm -f "$LAUNCHER_SRC/rsrc.syso"
cd "$ROOT_DIR"

# Step 4: Prepare Python 3.12 Embedded Runtime
PYTHON_ZIP="$CACHE_DIR/python-3.12.3-embed-amd64.zip"
if [ ! -f "$PYTHON_ZIP" ]; then
    echo "[4/6] Downloading Python 3.12 embeddable zip for Windows..."
    curl -sL "https://www.python.org/ftp/python/3.12.3/python-3.12.3-embed-amd64.zip" -o "$PYTHON_ZIP"
fi

# Step 5: Assemble Portable Distribution Directory
echo "[5/6] Assembling portable distribution bundle at $PORTABLE_DIR..."
rm -rf "$PORTABLE_DIR"
mkdir -p "$PORTABLE_DIR"

# Copy primary executable & fallback script
cp "$DIST_DIR/PulseTerm.exe" "$PORTABLE_DIR/"
cp "$WINDOWS_DIR/PulseTerm.cmd" "$PORTABLE_DIR/"

# Setup Python Runtime
RUNTIME_DIR="$PORTABLE_DIR/runtime"
mkdir -p "$RUNTIME_DIR"
unzip -q "$PYTHON_ZIP" -d "$RUNTIME_DIR"

# Enable import site and add site-packages & backend to python312._pth
cat << 'EOF' > "$RUNTIME_DIR/python312._pth"
python312.zip
.
site-packages
..\backend

import site
EOF

# Install/Bundle Windows pip dependencies into runtime/site-packages
echo "[5/6] Bundling Python dependencies into runtime/site-packages..."
mkdir -p "$RUNTIME_DIR/site-packages"
"$ROOT_DIR/venv/bin/pip" install \
    --platform win_amd64 \
    --python-version 312 \
    --only-binary=:all: \
    --target "$RUNTIME_DIR/site-packages" \
    fastapi uvicorn aiosqlite python-multipart aiofiles python-dotenv requests httpx pykakasi pypinyin yt-dlp ytmusicapi pyyaml deep-translator \
    --quiet

# Copy Application Core (Backend, Frontend, Assets)
mkdir -p "$PORTABLE_DIR/backend"
cp -r "$ROOT_DIR/backend/api" "$PORTABLE_DIR/backend/"
cp -r "$ROOT_DIR/backend/database" "$PORTABLE_DIR/backend/"
cp -r "$ROOT_DIR/backend/models" "$PORTABLE_DIR/backend/"
cp "$ROOT_DIR/backend/main.py" "$PORTABLE_DIR/backend/"
cp "$ROOT_DIR/backend/config.py" "$PORTABLE_DIR/backend/"
cp "$ROOT_DIR/backend/requirements.txt" "$PORTABLE_DIR/backend/"

mkdir -p "$PORTABLE_DIR/frontend"
cp -r "$ROOT_DIR/frontend/css" "$PORTABLE_DIR/frontend/"
cp -r "$ROOT_DIR/frontend/js" "$PORTABLE_DIR/frontend/"
cp -r "$ROOT_DIR/frontend/assets" "$PORTABLE_DIR/frontend/"
cp "$ROOT_DIR/frontend/index.html" "$PORTABLE_DIR/frontend/"

mkdir -p "$PORTABLE_DIR/assets"
cp "$ASSETS_DIR/app.ico" "$PORTABLE_DIR/assets/"

# Create isolated local data & cache directories
mkdir -p "$PORTABLE_DIR/data/webview2"
mkdir -p "$PORTABLE_DIR/cache"

# Step 6: Create README instructions inside package
cat << 'EOF' > "$PORTABLE_DIR/README-PORTABLE.txt"
========================================================
 PulseTerm - Windows Portable Edition (Edge WebView2)
 Minimalist TUI Audio Player
========================================================

FITUR PORTABLE EDISI INI:
- Zero Install / Fully Self-Contained: Sudah include Python 3.12
  runtime dan semua modul backend (FastAPI, yt-dlp, ytmusicapi, dll).
- Native Edge WebView2: Berjalan di window aplikasi native desktop
  dengan render performa tinggi dan isolasi data lokal.
- Auto Lifecycle: Service backend otomatis aktif saat PulseTerm.exe dibuka,
  dan otomatis mati / bersih saat jendela ditutup.
- Icon Resmi & Manifest: Icon monogram PulseTerm terpasang pada file exe
  dan taskbar dengan scaling High-DPI modern.

CARA MENGGUNAKAN:
1. Double-click "PulseTerm.exe" untuk menjalankan aplikasi.
2. Selesai! Tidak memerlukan instalasi Python terpisah.

SHORTCUT TOMBOL KUNCI (KEYBINDINGS):
- Space    : Play / Pause
- n / p    : Next / Previous track
- e        : Buka / Tutup Equalizer (10-Band + SmartEQ)
- l        : Tampilkan Synced Lyrics
- v        : Tampilkan CAVA Visualizer HUD
- t        : Ganti Color Theme (MAC Light, OLED, Soft Dark, Cyberpunk, dll)
- 1 s/d 4  : Berpindah halaman navigasi (Home, Search, Library, Playlists)
- ?        : Bantuan lengkap

========================================================
EOF

# Step 7: Create Portable ZIP distribution archive
echo "[6/6] Creating distribution archive PulseTerm-Windows-Portable.zip..."
cd "$DIST_DIR"
rm -f "PulseTerm-Windows-Portable.zip"
zip -rq "PulseTerm-Windows-Portable.zip" "PulseTerm-Portable"
cd "$ROOT_DIR"

echo "========================================================"
echo " BUILD SUCCESSFUL!"
echo " Executable : $PORTABLE_DIR/PulseTerm.exe"
echo " Runtime Dir: $PORTABLE_DIR/runtime"
echo " Bundle Dir : $PORTABLE_DIR"
echo " Zip Archive: $DIST_DIR/PulseTerm-Windows-Portable.zip"
echo "========================================================"
