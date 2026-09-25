const API_BASE = '';

async function apiGet(endpoint) {
    try {
        const res = await fetch(API_BASE + endpoint);
        const data = await res.json();
        return data;
    } catch (e) {
        console.error('API Error:', e);
        return { success: false, data: null };
    }
}

async function apiPost(endpoint, body = {}) {
    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        return data;
    } catch (e) {
        console.error('API Error:', e);
        return { success: false, data: null };
    }
}

async function apiDelete(endpoint) {
    try {
        const res = await fetch(API_BASE + endpoint, { method: 'DELETE' });
        return await res.json();
    } catch (e) {
        console.error('API Error:', e);
        return { success: false };
    }
}

async function apiPut(endpoint, body = {}) {
    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        console.error('API Error:', e);
        return { success: false, data: null };
    }
}

// Search
export async function search(q, type = 'all', limit = 40) {
    return apiGet(`/api/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`);
}

export async function searchSuggestions(q) {
    return apiGet(`/api/search/suggestions?q=${encodeURIComponent(q)}`);
}

export async function getSearchHistory() {
    return apiGet('/api/search/history');
}

export async function browseArtist(id) {
    return apiGet(`/api/artist/${id}`);
}

export async function getAlbum(id) {
    return apiGet(`/api/album/${id}`);
}

export async function getYtPlaylist(id) {
    return apiGet(`/api/playlist/${id}`);
}

export async function getSongDetails(id) {
    return apiGet(`/api/song/${id}`);
}

const _streamUrlCache = new Map();

export async function getStreamUrl(id) {
    if (!id) return { success: false, data: null };
    const hit = _streamUrlCache.get(id);
    if (hit && hit.expires > Date.now()) {
        return hit.result;
    }
    const result = await apiGet(`/api/player/stream-url/${id}`);
    if (result?.success && result.data?.url) {
        _streamUrlCache.set(id, { result, expires: Date.now() + 3 * 3600 * 1000 });
    }
    return result;
}

export async function prepareStreams(videoIds) {
    return apiPost('/api/player/prepare', { videoIds });
}

export async function getRecommendations(id, limit = 10) {
    return apiGet(`/api/recommendations/${encodeURIComponent(id)}?limit=${limit}`);
}

export async function getContinueState() {
    return apiGet('/api/player/continue');
}

export async function setContinueEnabled(enabled) {
    return apiPost('/api/player/continue', { enabled: !!enabled });
}

export async function extendQueue(seed, limit = 15) {
    return apiPost('/api/player/extend', { seed, limit });
}

export async function getLyrics(id, timed = true) {
    return apiGet(`/api/lyrics/${encodeURIComponent(id)}?timed=${timed ? 1 : 0}`);
}

export async function getQueue() {
    return apiGet('/api/player/queue');
}

export async function addQueue(song, action = 'add') {
    return apiPost('/api/player/queue', { song, action });
}

export async function deleteQueue(kind = 'user', index = -1) {
    return apiDelete(`/api/player/queue?kind=${encodeURIComponent(kind)}&index=${index}`);
}

export async function reorderQueue(kind, from, to) {
    return apiPut('/api/player/queue', { kind, from, to });
}

export async function setCurrentSong(song) {
    return apiPost('/api/player/current', { song });
}

export async function setQueueOrder(order, pos) {
    return apiPost('/api/player/order', { order, pos });
}

export async function removeContextTrack(index) {
    return apiPost('/api/player/context/remove', { index });
}

export async function getOfflineTracks() {
    return apiGet('/api/player/offline');
}

export async function downloadOffline(id) {
    return apiPost(`/api/player/offline/${encodeURIComponent(id)}`);
}

export async function removeOffline(id) {
    return apiDelete(`/api/player/offline/${encodeURIComponent(id)}`);
}

export async function toggleLiked(id, song) {
    return apiPost(`/api/library/liked/${encodeURIComponent(id)}`, song);
}

export async function getLikedIds() {
    return apiGet('/api/library/liked/ids');
}

export async function getPlayerStatus() {
    return apiGet('/api/player/status');
}

export async function playSongs(songs, index, options = {}) {
    return apiPost('/api/player/play', { songs, index, ...options });
}

export async function pause() {
    return apiPost('/api/player/pause');
}

export async function togglePlay() {
    return apiPost('/api/player/toggle');
}

export async function nextSong() {
    return apiPost('/api/player/next');
}

export async function prevSong() {
    return apiPost('/api/player/prev');
}

export async function seek(position) {
    return apiPost('/api/player/position', { position });
}

export async function setVolume(vol, muted = false) {
    return apiPost('/api/player/volume', { volume: vol, muted });
}

export async function setShuffle(shuffle) {
    return apiPost('/api/player/shuffle', { shuffle });
}

export async function setRepeat(repeat) {
    return apiPost('/api/player/repeat', { repeat });
}

// Playlists
export async function getPlaylists() {
    return apiGet('/api/playlists');
}

export async function createPlaylist(name) {
    return apiPost(`/api/playlists?name=${encodeURIComponent(name)}`);
}

export async function addToPlaylist(playlistId, songData) {
    return apiPost(`/api/playlists/${playlistId}/songs`, songData);
}

export async function deletePlaylist(id) {
    return apiDelete(`/api/playlists/${id}`);
}

export async function removeFromPlaylist(playlistId, songId) {
    return apiDelete(`/api/playlists/${playlistId}/songs/${songId}`);
}

// Library
export async function getHistory() {
    return apiGet('/api/library/history');
}

export async function clearHistory() {
    return apiDelete('/api/library/history');
}

export async function getLikedSongs() {
    return apiGet('/api/library/liked');
}

// Settings
export async function getSettings() {
    return apiGet('/api/settings');
}

export async function saveSettings(data) {
    return apiPost('/api/settings', data);
}