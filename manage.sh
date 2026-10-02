#!/bin/bash
# PulseTerm - Minimalist Terminal-Like Audio Player Service Manager
# Usage: ./manage.sh [start|stop|restart|status|logs]
#
# Anti-crash lintas-service:
#   1. Stale-PID detection: PID di server.pid dicek apakah (a) proses hidup, dan
#      (b) cwd proses benar-benar project ini. Stale PID otomatis dibersihkan.
#   2. pkill pada fall-back stop() menggunakan path absolut project sendiri,
#      sehingga TIDAK menyentuh service lain (Tatap) yang juga menjalankan
#      `backend/main.py` dari path berbeda.
#   3. start() menolak jalan bila port sudah diikat proses LAIN (non-PulseTerm).
#   4. start() menulis PID uvicorn langsung ke server.pid (reliable untuk stop).
#   5. status() memverifikasi tiga hal: PID hidup, port listen, /api/health.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$APP_DIR/server.pid"
LOG_FILE="/tmp/pulseterm.log"
PORT="${APP_PORT:-3000}"
HOST="${APP_HOST:-0.0.0.0}"
PROJECT_PATTERN="$APP_DIR/venv/bin/python backend/main.py"

is_listening() {
    ss -tlnp 2>/dev/null | grep -qE ":${PORT}[[:space:]]"
}

port_owner_pid() {
    ss -tlnp 2>/dev/null | awk -v p=":${PORT}[[:space:]]" '$0 ~ p' \
        | grep -oE 'pid=[0-9]+' | head -n1 | cut -d= -f2
}

pid_is_ours() {
    local pid="$1"
    [ -n "$pid" ] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    local cwd
    cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null) || return 1
    [ "$cwd" = "$APP_DIR" ] || return 1
    return 0
}

live_pid() {
    if [ -f "$PID_FILE" ]; then
        local p; p=$(cat "$PID_FILE" 2>/dev/null)
        if pid_is_ours "$p"; then echo "$p"; return 0; fi
    fi
    local p
    p=$(ps -eo pid,cmd | awk -v pat="$PROJECT_PATTERN" \
        '$0 ~ pat && $0 !~ /awk/ {print $1; exit}')
    if pid_is_ours "$p"; then echo "$p"; return 0; fi
    return 1
}

clear_stale_pid() {
    [ -f "$PID_FILE" ] || return 0
    local p; p=$(cat "$PID_FILE" 2>/dev/null)
    if ! pid_is_ours "$p"; then
        rm -f "$PID_FILE"
        echo "[cleanup] Stale PID file removed (was: ${p:-empty})."
    fi
}

start() {
    clear_stale_pid
    local existing; existing=$(live_pid)
    if [ -n "$existing" ]; then
        echo "Server is already running (PID: $existing, port: $PORT)."
        return 0
    fi

    if is_listening; then
        local owner; owner=$(port_owner_pid)
        echo "ERROR: Port $PORT sudah digunakan oleh PID ${owner:-?} (bukan PulseTerm)."
        echo "       Jalankan dengan APP_PORT lain, mis: APP_PORT=3010 ./manage.sh start"
        return 1
    fi

    echo "Starting PulseTerm on port $PORT..."
    cd "$APP_DIR" || { echo "ERROR: cannot cd $APP_DIR"; return 1; }

    setsid env APP_PORT="$PORT" APP_HOST="$HOST" \
        "$APP_DIR/venv/bin/python" "$APP_DIR/backend/main.py" \
        > "$LOG_FILE" 2>&1 &
    local PID=$!
    disown "$PID" 2>/dev/null || true

    local attempts=0
    while [ $attempts -lt 20 ]; do
        if kill -0 "$PID" 2>/dev/null && is_listening; then break; fi
        sleep 0.5
        attempts=$((attempts+1))
    done

    if kill -0 "$PID" 2>/dev/null && is_listening; then
        echo "$PID" > "$PID_FILE"
        echo "Server started! PID: $PID"
        echo "Access at: http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
        return 0
    fi

    echo "ERROR: Failed to start PulseTerm. Tail log:"
    tail -n 40 "$LOG_FILE" 2>/dev/null
    rm -f "$PID_FILE"
    return 1
}

stop() {
    clear_stale_pid
    local pid; pid=$(live_pid)

    if [ -n "$pid" ]; then
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null
        local i=0
        while kill -0 "$pid" 2>/dev/null && [ $i -lt 20 ]; do
            sleep 0.2; i=$((i+1))
        done
        if kill -0 "$pid" 2>/dev/null; then
            echo "[warn] PID $pid tidak merespons SIGTERM, kirim SIGKILL."
            kill -9 -- -"$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
        fi
        rm -f "$PID_FILE"
        echo "Server stopped (PID $pid)."
        return 0
    fi

    local killed
    killed=$(pkill -f "$PROJECT_PATTERN" 2>/dev/null && echo yes || echo no)
    if [ "$killed" = "yes" ]; then
        rm -f "$PID_FILE"
        echo "Process killed via pattern (project-scoped)."
    else
        echo "No running PulseTerm process found."
    fi
}

restart() {
    stop
    sleep 1
    start
}

status() {
    clear_stale_pid
    local pid; pid=$(live_pid)
    if [ -z "$pid" ]; then
        echo "Server is not running."
        if is_listening; then
            local owner; owner=$(port_owner_pid)
            echo "Note: port $PORT saat ini dipakai PID ${owner:-?} (bukan PulseTerm)."
        fi
        return 1
    fi
    echo "Server is running (PID: $pid, port: $PORT)"
    if is_listening; then
        echo -n "Health: "
        curl -s --max-time 3 "http://127.0.0.1:$PORT/api/health" || echo "(health endpoint tidak merespons)"
        echo
    else
        echo "Health: PORT NOT LISTENING (ada masalah)"
    fi
}

case "$1" in
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    status)  status ;;
    logs)    tail -n 50 "$LOG_FILE" 2>/dev/null || echo "(no log)" ;;
    *)       echo "Usage: $0 {start|stop|restart|status|logs}"; exit 1 ;;
esac
