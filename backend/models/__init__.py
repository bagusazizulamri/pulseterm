from dataclasses import dataclass, field
from typing import Optional

@dataclass
class Song:
    video_id: str
    title: str
    artist: str = ""
    album: str = ""
    thumbnail: str = ""
    duration: int = 0
    url: str = ""
    lyrics: Optional[str] = None
    auto_added: bool = False
    reason: str = ""
    video_type: str = ""
    result_type: str = "song"
    is_video: bool = False

@dataclass
class Playlist:
    id: int
    name: str
    is_local: bool = True
    created_at: str = ""
    songs: list = field(default_factory=list)

@dataclass
class SearchResult:
    results: list = field(default_factory=list)
    query: str = ""

@dataclass
class PlayerState:
    current_song: Optional[Song] = None
    is_playing: bool = False
    position: int = 0
    volume: float = 1.0
    queue: list = field(default_factory=list)
    queue_index: int = -1