#!/bin/bash
# PulseTerm - Minimalist TUI Audio Player Service Manager
# Usage: ./manage.sh [start|stop|restart|status]

APP_DIR="/home/b-ict/metrolist-reborn"
PID_FILE="$APP_DIR/server.pid"
LOG_FILE="/tmp/pulseterm.log"
PORT="${APP_PORT:-3000}"

start() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Server is already running (PID: $(cat $PID_FILE))"
        return
    fi
    echo "Starting PulseTerm on port $PORT..."
    cd "$APP_DIR"
    source venv/bin/activate
    setsid env APP_PORT=$PORT APP_HOST=0.0.0.0 "$APP_DIR/venv/bin/python" backend/main.py > "$LOG_FILE" 2>&1 &
    PID=$!
    disown $PID 2>/dev/null || true
    echo $PID > "$PID_FILE"
    sleep 2
    if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Server started! PID: $(cat $PID_FILE)"
        echo "Access at: http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
    else
        echo "Failed to start. Check: $LOG_FILE"
        cat "$LOG_FILE"
    fi
}

stop() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        kill $PID 2>/dev/null
        rm "$PID_FILE"
        echo "Server stopped."
    else
        echo "No PID file found. Searching for running process..."
        pkill -f "python3 backend/main.py" 2>/dev/null && echo "Process killed." || echo "No running process found."
    fi
}

restart() {
    stop
    sleep 1
    start
}

status() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Server is running (PID: $(cat $PID_FILE))"
        curl -s http://localhost:3000/api/health 2>/dev/null || echo "Health check failed"
    else
        echo "Server is not running."
    fi
}

case "$1" in
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    status)  status ;;
    *)       echo "Usage: $0 {start|stop|restart|status}"; exit 1 ;;
esac