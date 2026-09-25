import os
from dotenv import load_dotenv

load_dotenv()

APP_PORT = int(os.getenv("APP_PORT", "3000"))
APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
DATABASE_PATH = os.getenv("DB_PATH", "music.db")
YTMUSIC_HEADER = os.getenv("YTMUSIC_HEADER", "PulseTerm/1.0")
SESSION_CACHE = os.getenv("SESSION_CACHE", "session_cache.json")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

UPLOAD_DIR = "uploads"
MAX_FILE_SIZE = 100 * 1024 * 1024

CACHE_DIR = "cache"
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

def get_session_header():
    return {
        "User-Agent": YTMUSIC_HEADER,
    }