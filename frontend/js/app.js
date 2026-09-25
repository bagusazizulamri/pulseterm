import { search, searchSuggestions, getSearchHistory, browseArtist, getAlbum, getYtPlaylist, getLyrics, createPlaylist, addToPlaylist, removeFromPlaylist, deletePlaylist, getPlaylists, getHistory, clearHistory, getLikedSongs, getSettings, saveSettings, prepareStreams } from './api.js';
import { player, togglePlay, nextSong, prevSong, toggleQueue, removeFromQueue, clearQueue, toggleLyrics, closeNowPlaying } from './player.js';
import { visualizer } from './visualizer.js';
import { equalizer } from './equalizer.js';

let currentPage = 'home';
let searchResults = [];
let searchFilter = 'all';
let searchTimer = null;
let detailContext = null;

const pageTitles = { home: 'Home', search: 'Search', library: 'Library', playlists: 'Playlists' };
const THEME_LIST = ['dark', 'amber', 'oled', 'cyberpunk', 'nordic', 'light'];

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function navigate(page) {
    if (!page) page = 'home';
    currentPage = page;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === currentPage));
    if (window.location.hash !== '#' + page) {
        try { history.replaceState(null, '', '#' + page); } catch { window.location.hash = '#' + page; }
    }
    await renderPage(page);
}

async function openRemoteItem(item) {
    const kind = item.album === 'artist' ? 'artist' : item.album === 'album' ? 'album' : item.album === 'playlist' ? 'playlist' : '';
    if (!kind) return false;
    const content = document.getElementById('page-content');
    const endpoint = kind === 'artist' ? '/api/artist/' : kind === 'album' ? '/api/album/' : '/api/playlist/';
    detailContext = { kind, id: item.videoId, title: item.title };
    content.innerHTML = '<div class="page-header"><button class="tui-btn" id="detail-back">[◀ RETURN]</button><h1>┌─ ' + esc(item.title) + ' ─┐</h1></div><p class="empty-state"><span class="label">[STATUS: BUFFERING]</span> Opening ' + kind + '…</p>';
    document.getElementById('detail-back')?.addEventListener('click', () => { detailContext = null; renderSearch(content); renderSearchResults(); });
    try {
        const r = await fetch(endpoint + encodeURIComponent(item.videoId)).then(x => x.json());
        if (!r.success || !r.data) throw new Error('Could not load ' + kind);
        const songs = (r.data.results || []).map(s => ({ videoId: s.videoId || s.video_id, title: s.title, artist: s.artist, album: s.album, thumbnail: s.thumbnail, duration: s.duration }));
        content.innerHTML = '<div class="page-header"><button class="tui-btn" id="detail-back">[◀ RETURN]</button><h1>┌─ ' + esc(r.data.name || item.title) + ' ─┐</h1><button class="tui-btn" id="detail-play">[▶ PLAY ALL]</button></div>' +
            (r.data.description ? '<p class="search-results-info">INFO: ' + esc(r.data.description) + '</p>' : '') +
            '<div class="list" id="detail-list"></div>';
        document.getElementById('detail-back')?.addEventListener('click', () => { detailContext = null; renderSearch(content); renderSearchResults(); });
        document.getElementById('detail-play')?.addEventListener('click', () => player.play(songs, 0, { contextName: r.data.name || item.title }));
        const list = document.getElementById('detail-list');
        songs.forEach((song, i) => {
            const isPlaying = player.currentSong && player.currentSong.videoId === song.videoId;
            const row = document.createElement('div'); row.className = 'list-item' + (isPlaying ? ' is-playing' : ''); row.dataset.videoId = song.videoId; row.dataset.title = song.title; row.dataset.artist = song.artist;
            row.innerHTML = '<span class="rank">' + (isPlaying ? '▶' : '[' + String(i + 1).padStart(2, '0') + ']') + '</span><div class="list-info"><div class="list-title"></div><div class="list-artist"></div></div><span class="list-duration">' + (song.duration ? Math.floor(song.duration / 60) + ':' + String(song.duration % 60).padStart(2, '0') : '') + '</span>';
            row.querySelector('.list-title').textContent = song.title; row.querySelector('.list-artist').textContent = song.artist || '';
            row.addEventListener('pointerenter', () => {
                if (song.videoId) prepareStreams([song.videoId]).catch(() => {});
            }, { once: true });
            row.addEventListener('click', async () => {
                list.querySelectorAll('.list-item').forEach((item, idx) => {
                    const active = idx === i;
                    item.classList.toggle('is-playing', active);
                    const rank = item.querySelector('.rank');
                    if (rank) rank.textContent = active ? '▶' : '[' + String(idx + 1).padStart(2, '0') + ']';
                });
                await player.play(songs, i, { contextName: r.data.name || item.title });
            });
            list.appendChild(row);
        });
    } catch (e) {
        content.innerHTML = '<div class="page-header"><button class="tui-btn" id="detail-back">[◀ RETURN]</button><h1>┌─ ' + esc(item.title) + ' ─┐</h1></div><div class="empty-state"><h3>ERR: COULD NOT OPEN ' + kind.toUpperCase() + '</h3><p>' + esc(e.message) + '</p></div>';
        document.getElementById('detail-back')?.addEventListener('click', () => { detailContext = null; renderSearch(content); renderSearchResults(); });
    }
    return true;
}

async function renderPage(page) {
    const content = document.getElementById('page-content');
    if (!content) return;
    switch (page) {
        case 'home': await renderHome(content); break;
        case 'search': renderSearch(content); break;
        case 'library': await renderLibrary(content); break;
        case 'playlists': await renderPlaylists(content); break;
        default: content.innerHTML = '<div class="empty-state"><span class="label">[PULSETERM TUI]</span><h3>NO TRACK QUEUED</h3><p>Press [/] to search or select a track below.</p></div>';
    }
}

async function renderHome(content) {
    content.innerHTML = '<div class="page-header"><h1>┌─ PULSETERM AUDIO ARCHIVE ─┐</h1></div><div class="empty-state"><span class="label">[BUFFER: FETCHING]</span><p>Polling telemetry, trending tracks and recent plays…</p></div>';
    let trending = [];
    try {
        const t = await fetch('/api/trending').then(r => r.json());
        if (t.success) trending = t.data || [];
    } catch {}
    const hres = await getHistory();
    const history = hres.success ? hres.data : [];
    let html = '<div class="page-header"><h1>┌─ PULSETERM AUDIO ARCHIVE ─┐</h1></div>';
    if (trending.length > 0) {
        html += '<div class="eyebrow">[ 01 // TRENDING TRACKS · YOUTUBE MUSIC ]</div><div class="item-grid">';
        trending.slice(0, 14).forEach(item => { html += renderCard(item); });
        html += '</div>';
    }
    if (history && history.length > 0) {
        const secNum = trending.length > 0 ? '02' : '01';
        html += '<div class="eyebrow">[ ' + secNum + ' // RECENT PLAYBACK BUFFER ]</div><div class="list">';
        history.slice(0, 8).forEach((item, i) => {
            const isPlaying = player.currentSong && player.currentSong.videoId === item.video_id;
            html += '<div class="list-item' + (isPlaying ? ' is-playing' : '') + '" data-hist="' + i + '" data-video-id="' + esc(item.video_id) + '"><span class="rank">' + (isPlaying ? '▶' : '[' + String(i + 1).padStart(2, '0') + ']') + '</span>' +
                '<div class="list-info"><div class="list-title">' + esc(item.title) + '</div>' +
                '<div class="list-artist">' + esc(item.artist) + '</div></div></div>';
        });
        html += '</div>';
    }
    if (!history.length && !trending.length) {
        html += '<div class="empty-state"><span class="label">[PULSETERM AUDIO ENGINE]</span><h3>BUFFER EMPTY</h3><p>Type a song, artist, or album in the field above [/], then press Enter.</p></div>';
    }
    content.innerHTML = html;
    content.querySelectorAll('[data-hist]').forEach(el => el.addEventListener('click', () => playFromHistory(parseInt(el.dataset.hist))));
    bindCardClicks();
}

function renderSearch(content) {
    content.innerHTML = '<div class="page-header"><h1>┌─ SEARCH ENGINE QUERY BUFFER ─┐</h1></div>' +
        '<div class="search-page"><div class="search-filters" id="search-filters">' +
        '<button class="filter-btn active" data-f="all">[ALL]</button>' +
        '<button class="filter-btn" data-f="song">[SONGS]</button>' +
        '<button class="filter-btn" data-f="artist">[ARTISTS]</button>' +
        '<button class="filter-btn" data-f="playlist">[PLAYLISTS]</button>' +
        '<button class="filter-btn" data-f="album">[ALBUMS]</button></div>' +
        '<div class="quick-tags">' +
        '<span class="quick-tag-label">QUICK QUERY:</span>' +
        '<button class="quick-tag-btn" onclick="window.quickSearch(\'Indonesian Hits\')">Indonesian Hits</button>' +
        '<button class="quick-tag-btn" onclick="window.quickSearch(\'Pop\')">Pop</button>' +
        '<button class="quick-tag-btn" onclick="window.quickSearch(\'Lofi Chill\')">Lofi Chill</button>' +
        '<button class="quick-tag-btn" onclick="window.quickSearch(\'Rock\')">Rock</button>' +
        '<button class="quick-tag-btn" onclick="window.quickSearch(\'Synthwave\')">Synthwave</button>' +
        '<button class="quick-tag-btn" onclick="window.quickSearch(\'Jazz Lounge\')">Jazz</button>' +
        '<button class="quick-tag-btn" onclick="window.quickSearch(\'Acoustic Folk\')">Acoustic</button>' +
        '</div>' +
        '<div id="search-suggestions-container"><div class="empty-state"><span class="label">[QUERY: READY]</span><p>Type a song, artist, or album, or select a quick query chip above.</p></div></div></div>';
    content.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => setSearchFilter(b.dataset.f, b)));
    bindSuggestions();
    if (searchResults.length > 0) renderSearchResults();
}

function bindSuggestions() {
    const input = document.getElementById('search-input');
    const box = document.getElementById('search-suggestions-container');
    if (!input || !box) return;
    let seq = 0;
    input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = input.value.trim();
        if (q.length < 2) return;
        searchTimer = setTimeout(async () => {
            const current = ++seq;
            const r = await searchSuggestions(q);
            if (current !== seq || input.value.trim() !== q || searchResults.length) return;
            const values = r?.success ? (r.data || []) : [];
            if (!values.length) return;
            box.innerHTML = '<div class="suggestion-list"></div>';
            const list = box.querySelector('.suggestion-list');
            values.slice(0, 6).forEach(value => {
                const text = typeof value === 'string' ? value : (value?.text || value?.query || '');
                if (!text) return;
                const b = document.createElement('button'); b.className = 'suggestion-item'; b.textContent = `> ${text}`;
                b.addEventListener('click', () => { input.value = text; doSearch(); }); list.appendChild(b);
            });
        }, 250);
    });
    input.addEventListener('focus', () => { searchResults = []; });
}

async function doSearch() {
    const input = document.getElementById('search-input');
    const q = input ? input.value.trim() : '';
    if (!q) return;
    if (currentPage !== 'search') await navigate('search');
    const container = document.getElementById('search-suggestions-container');
    if (container) container.innerHTML = '<div class="empty-state"><span class="label">[QUERY: IN-PROGRESS]</span><p>Scanning YouTube Music frequency indices…</p></div>';
    try {
        const results = await search(q, searchFilter);
        const raw = results.success ? (results.data.results || []) : [];
        searchResults = raw.map(s => ({
            videoId: s.videoId || s.video_id || '',
            title: s.title || '',
            artist: s.artist || '',
            thumbnail: s.thumbnail || '',
            duration: s.duration || 0,
            album: s.album || '',
            isVideo: Boolean(s.is_video || s.isVideo || s.result_type === 'video' || s.resultType === 'video'),
            is_video: Boolean(s.is_video || s.isVideo || s.result_type === 'video' || s.resultType === 'video'),
        }));
    } catch { searchResults = []; }
    renderSearchResults();
}

function setSearchFilter(type, btn) {
    searchFilter = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const input = document.getElementById('search-input');
    if (input && input.value.trim()) doSearch();
}

function renderSearchResults() {
    const container = document.getElementById('search-suggestions-container');
    if (!container) return;
    if (searchResults.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="label">[QUERY: ZERO-MATCH]</span><h3>NO MATCHING ENTRIES</h3><p>Verify search tokens or try searching artist name directly.</p></div>';
        return;
    }
    let html = '<div class="search-results-info">>> QUERY COMPLETED: ' + searchResults.length + ' ENTRIES LOADED</div><div class="item-grid">';
    searchResults.forEach(item => { html += renderCard(item); });
    html += '</div>';
    container.innerHTML = html;
    bindCardClicks();
}

async function renderLibrary(content) {
    const hres = await getHistory();
    const history = hres.success ? hres.data : [];
    const lres = await getLikedSongs();
    const liked = lres.success ? lres.data : [];
    let html = '<div class="page-header"><h1>┌─ SAVED AUDIO REPOSITORY ─┐</h1><button id="clear-hist-btn" class="tui-btn">[PURGE HISTORY]</button></div>';
    if (liked.length) {
        html += '<div class="eyebrow">[ 01 // FAVORITE CHANNELS · LIKED ]</div><div class="item-grid">';
        liked.forEach(s => { html += renderCard({ ...s, videoId: s.videoId || s.video_id }); });
        html += '</div>';
    }
    if (history && history.length > 0) {
        html += '<div class="eyebrow">[ 02 // PLAYBACK LOG · HISTORY ]</div><div class="list">';
        history.forEach((item, i) => {
            const isPlaying = player.currentSong && player.currentSong.videoId === item.video_id;
            html += '<div class="list-item' + (isPlaying ? ' is-playing' : '') + '" data-hist="' + i + '" data-video-id="' + esc(item.video_id) + '"><span class="rank">' + (isPlaying ? '▶' : '[' + String(i + 1).padStart(2, '0') + ']') + '</span>' +
                '<div class="list-info"><div class="list-title">' + esc(item.title) + '</div>' +
                '<div class="list-artist">' + esc(item.artist) + '</div></div></div>';
        });
        html += '</div>';
    } else {
        html += '<div class="empty-state"><span class="label">[REPOSITORY: CLEAN]</span><h3>NO AUDIO HISTORY LOGGED</h3><p>All played audio frames will be indexed here automatically.</p></div>';
    }
    content.innerHTML = html;
    content.querySelectorAll('[data-hist]').forEach(el => el.addEventListener('click', () => playFromHistory(parseInt(el.dataset.hist))));
    const cb = document.getElementById('clear-hist-btn');
    if (cb) cb.addEventListener('click', async () => { await clearHistory(); renderLibrary(content); });
    bindCardClicks();
}

async function renderPlaylists(content) {
    const pres = await getPlaylists();
    const pls = pres.success ? pres.data : [];
    let html = '<div class="page-header"><h1>┌─ LOCAL PLAYLIST REGISTRY ─┐</h1><button id="new-pl-btn" class="tui-btn">[+ NEW PLAYLIST]</button></div>';
    if (pls.length === 0) {
        html += '<div class="empty-state"><span class="label">[REGISTRY: VOID]</span><h3>NO PLAYLISTS INITIALIZED</h3><p>Create a custom playlist to bundle audio streams.</p></div>';
    } else {
        html += '<div class="item-grid">';
        pls.forEach(pl => {
            const n = pl.songs ? pl.songs.length : 0;
            html += '<div class="item-card" data-pl="' + pl.id + '">' +
                '<div class="cover-wrap"><div class="cover cover-fallback">[PLAYLIST]</div><div class="card-play-overlay"><span class="play-icon">▶</span><span class="play-text">OPEN</span></div></div>' +
                '<div class="card-title">' + esc(pl.name) + '</div><div class="card-subtitle"><span class="tui-state-badge">[PL]</span> ' + n + ' tracks</div></div>';
        });
        html += '</div>';
    }
    content.innerHTML = html;
    const nb = document.getElementById('new-pl-btn');
    if (nb) nb.addEventListener('click', promptNewPlaylist);
    content.querySelectorAll('[data-pl]').forEach(el => el.addEventListener('click', () => openPlaylist(parseInt(el.dataset.pl))));
}

function renderCard(item) {
    const vid = item.videoId || item.video_id || '';
    const isVid = Boolean(item.isVideo || item.is_video || item.resultType === 'video' || item.result_type === 'video');
    const kind = item.album === 'playlist' || item.resultType === 'playlist' || item.result_type === 'playlist' ? 'playlist'
               : item.album === 'artist' || item.resultType === 'artist' || item.result_type === 'artist' ? 'artist'
               : item.album === 'album' || item.resultType === 'album' || item.result_type === 'album' ? 'album'
               : '';
    const badgeText = kind ? `[${kind.toUpperCase()}]` : (isVid ? '[VIDEO]' : '[SONG]');
    const durStr = item.duration ? ` · ${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}` : '';

    return '<div class="item-card" data-video-id="' + esc(vid) + '" data-title="' + esc(item.title) + '" data-artist="' + esc(item.artist) + '" data-thumbnail="' + esc(item.thumbnail || '') + '" data-duration="' + (item.duration || 0) + '" data-kind="' + esc(kind) + '" data-is-video="' + (isVid ? 'true' : 'false') + '">' +
        '<div class="cover-wrap">' +
            (item.thumbnail ? '<img class="cover" src="' + esc(item.thumbnail) + '" alt="' + esc(item.title) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '<div class="cover cover-fallback">[NO IMG]</div>') +
            '<div class="card-play-overlay"><span class="play-icon">▶</span><span class="play-text">' + (kind ? 'OPEN' : 'PLAY') + '</span></div>' +
        '</div>' +
        '<div class="card-title" title="' + esc(item.title) + '">' + esc(item.title) + '</div>' +
        '<div class="card-subtitle"><span class="tui-state-badge">' + badgeText + '</span> ' + esc(item.artist || vid || 'Various') + durStr + '</div>' +
        '</div>';
}

function bindCardClicks() {
    document.querySelectorAll('.item-card[data-video-id]').forEach(card => {
        card.addEventListener('pointerenter', () => {
            const vid = card.dataset.videoId;
            if (vid && vid.length === 11) prepareStreams([vid]).catch(() => {});
        }, { once: true });
        card.addEventListener('click', async () => {
            const vid = card.dataset.videoId;
            if (!vid) return;

            let kind = card.dataset.kind || '';
            if (!kind) {
                if (vid.startsWith('PL') || vid.startsWith('VLPL') || vid.startsWith('RD') || vid.startsWith('OLAK')) {
                    kind = 'playlist';
                } else if (vid.startsWith('UC')) {
                    kind = 'artist';
                } else if (vid.startsWith('MPREb_')) {
                    kind = 'album';
                }
            }

            if (kind && await openRemoteItem({ videoId: vid, title: card.dataset.title, album: kind })) {
                return;
            }

            const source = searchResults.find(s => s.videoId === vid);
            if (source && await openRemoteItem(source)) return;

            if (vid.length !== 11) {
                if (await openRemoteItem({ videoId: vid, title: card.dataset.title, album: 'playlist' })) {
                    return;
                }
            }

            const isVid = card.dataset.isVideo === 'true';
            const song = {
                videoId: vid,
                title: card.dataset.title,
                artist: card.dataset.artist,
                thumbnail: card.dataset.thumbnail,
                duration: parseInt(card.dataset.duration) || 0,
                isVideo: isVid,
                is_video: isVid,
            };
            await player.play([song], 0);
        });
        card.addEventListener('contextmenu', e => {
            e.preventDefault();
            const song = {
                videoId: card.dataset.videoId,
                title: card.dataset.title,
                artist: card.dataset.artist,
                thumbnail: card.dataset.thumbnail,
                duration: Number(card.dataset.duration) || 0,
                isVideo: card.dataset.isVideo === 'true',
                is_video: card.dataset.isVideo === 'true',
            };
            player.showContextMenu(song, e.clientX, e.clientY);
        });
    });
}

async function playFromHistory(index) {
    const hres = await getHistory();
    const history = hres.success ? hres.data : [];
    if (history[index]) {
        const item = history[index];
        await player.play([{ videoId: item.video_id, title: item.title, artist: item.artist }], 0);
    }
}

async function promptNewPlaylist() {
    const name = prompt('Input playlist identifier:');
    if (name) {
        await createPlaylist(name);
        renderPlaylists(document.getElementById('page-content'));
    }
}

async function openPlaylist(id) {
    const pres = await getPlaylists();
    const pls = pres.success ? pres.data : [];
    const pl = pls.find(p => p.id === id);
    if (!pl) return;
    const content = document.getElementById('page-content');
    const rawSongs = pl.songs || [];
    const songs = rawSongs.map(s => ({
        videoId: s.video_id || s.videoId,
        title: s.title,
        artist: s.artist || '',
        thumbnail: s.thumbnail || '',
        duration: s.duration || 0,
        dbId: s.id
    }));

    let html = '<div class="page-header">' +
        '<button class="tui-btn" id="pl-detail-back">[◀ RETURN]</button>' +
        '<h1>┌─ PLAYLIST: ' + esc(pl.name) + ' ─┐</h1>' +
        '<div class="header-actions">' +
        (songs.length > 0 ? '<button class="tui-btn" id="pl-detail-play">[▶ PLAY ALL]</button>' : '') +
        '<button class="tui-btn btn-danger" id="pl-detail-delete">[✕ DELETE PLAYLIST]</button>' +
        '</div>' +
        '</div>';

    if (songs.length === 0) {
        html += '<div class="empty-state"><span class="label">[PLAYLIST: EMPTY]</span><h3>NO TRACKS IN THIS PLAYLIST</h3><p>Search songs and click [...] -> "Add to ' + esc(pl.name) + '" to bundle audio streams.</p></div>';
    } else {
        html += '<div class="eyebrow">[ ' + String(songs.length).padStart(2, '0') + ' // TRACKS IN REGISTRY ]</div>' +
            '<div class="list" id="pl-track-list"></div>';
    }

    content.innerHTML = html;

    document.getElementById('pl-detail-back')?.addEventListener('click', () => renderPlaylists(content));
    document.getElementById('pl-detail-delete')?.addEventListener('click', async () => {
        if (confirm('Delete playlist "' + pl.name + '"?')) {
            await deletePlaylist(id);
            renderPlaylists(content);
        }
    });
    document.getElementById('pl-detail-play')?.addEventListener('click', () => {
        if (songs.length > 0) player.play(songs, 0, { contextName: pl.name });
    });

    const list = document.getElementById('pl-track-list');
    if (list) {
        songs.forEach((song, i) => {
            const isPlaying = player.currentSong && player.currentSong.videoId === song.videoId;
            const row = document.createElement('div');
            row.className = 'list-item' + (isPlaying ? ' is-playing' : '');
            row.dataset.videoId = song.videoId;
            row.dataset.index = i;

            const durStr = song.duration ? (Math.floor(song.duration / 60) + ':' + String(song.duration % 60).padStart(2, '0')) : '';
            row.innerHTML = '<span class="rank">' + (isPlaying ? '▶' : '[' + String(i + 1).padStart(2, '0') + ']') + '</span>' +
                '<div class="list-info">' +
                '<div class="list-title">' + esc(song.title) + '</div>' +
                '<div class="list-artist">' + esc(song.artist) + '</div>' +
                '</div>' +
                '<div class="list-meta-actions">' +
                (durStr ? '<span class="list-duration">' + durStr + '</span>' : '') +
                '<button class="icon-btn q-remove" title="Remove track from playlist" aria-label="Remove">×</button>' +
                '</div>';

            const removeBtn = row.querySelector('.q-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (song.dbId) {
                        await removeFromPlaylist(id, song.dbId);
                        openPlaylist(id);
                    }
                });
            }

            row.addEventListener('pointerenter', () => {
                if (song.videoId) prepareStreams([song.videoId]).catch(() => {});
            }, { once: true });

            row.addEventListener('click', async () => {
                list.querySelectorAll('.list-item').forEach((item, idx) => {
                    const active = idx === i;
                    item.classList.toggle('is-playing', active);
                    const rank = item.querySelector('.rank');
                    if (rank) rank.textContent = active ? '▶' : '[' + String(idx + 1).padStart(2, '0') + ']';
                });
                await player.play(songs, i, { contextName: pl.name });
            });

            list.appendChild(row);
        });
    }
}

async function deletePlaylistItem(id) {
    await deletePlaylist(id);
    renderPlaylists(document.getElementById('page-content'));
}

function initRealtime() {
    try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'status' && msg.data) {
                    player.applyRemoteStatus(msg.data);
                }
            } catch (e) {
                console.debug('WS parse error', e);
            }
        };
        ws.onclose = () => {
            setTimeout(initRealtime, 3000);
        };
        setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 25000);
    } catch (e) {
        console.debug('WS init error', e);
    }
}

async function init() {
    player.init();
    equalizer.initAudioContext();
    equalizer.updateUI();
    visualizer.init(player.audio);
    initRealtime();
    await renderPage('home');

    // Seek bar hover scrub tooltip
    const pBar = document.getElementById('progress-bar');
    const tooltip = document.getElementById('seek-tooltip');
    if (pBar && tooltip) {
        pBar.addEventListener('mousemove', e => {
            const rect = pBar.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const duration = player.audio?.duration || 0;
            if (duration > 0) {
                const target = ratio * duration;
                const m = Math.floor(target / 60);
                const s = String(Math.floor(target % 60)).padStart(2, '0');
                tooltip.textContent = `${m}:${s}`;
                tooltip.style.left = `${e.clientX - rect.left}px`;
                tooltip.classList.remove('hidden');
            }
        });
        pBar.addEventListener('mouseleave', () => {
            tooltip.classList.add('hidden');
        });
    }

    // Search input clear button listener
    const sInput = document.getElementById('search-input');
    const sClear = document.getElementById('search-clear-btn');
    if (sInput && sClear) {
        sInput.addEventListener('input', () => {
            sClear.classList.toggle('hidden', !sInput.value);
        });
    }

    const localTheme = localStorage.getItem('pulseterm_theme') || localStorage.getItem('metrolist_theme');
    let themeToApply = localTheme || 'dark';
    try {
        const settings = await getSettings();
        if (settings.success && settings.data) {
            const d = settings.data;
            if (d.theme) themeToApply = d.theme;
            document.body.className = 'theme-' + themeToApply;
            document.querySelectorAll('.theme-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.theme === themeToApply);
            });
            player.setVolume(Number.isFinite(d.volume) ? d.volume : .8);
            player.repeatMode = ['none', 'all', 'one'].includes(d.repeat) ? d.repeat : 'none';
            await player.setShuffle(!!d.shuffle);
            player.crossfade = Number(d.crossfade) || 0;
            player.setPlaybackSpeed(Number(d.speed) || 1);
            if (Number(d.sleepMinutes) > 0) player.setSleepTimer(Number(d.sleepMinutes));
            const rb = document.getElementById('repeat-btn');
            if (rb) {
                rb.dataset.state = player.repeatMode;
                rb.textContent = player.repeatMode === 'none' ? '[REP: OFF]' : (player.repeatMode === 'all' ? '[REP: ALL]' : '[REP: ONE]');
            }
            const sb = document.getElementById('shuffle-btn');
            if (sb) sb.classList.toggle('on', player.shuffleMode);
            const sh = document.getElementById('settings-shuffle'); if (sh) sh.checked = player.shuffleMode;
            const rp = document.getElementById('settings-repeat'); if (rp) rp.value = player.repeatMode;
            const cf = document.getElementById('settings-crossfade'); if (cf) cf.value = player.crossfade;
            const sp = document.getElementById('settings-speed'); if (sp) sp.value = player.audio.playbackRate;
            const sl = document.getElementById('settings-sleep'); if (sl) sl.value = String(d.sleepMinutes || 0);
            const cfLabel = document.getElementById('crossfade-value'); if (cfLabel) cfLabel.textContent = player.crossfade + 's';
        }
    } catch {}

    const vol = player.volume ?? 0.8;
    const vReadout = document.getElementById('vol-readout');
    if (vReadout) vReadout.textContent = Math.round(vol * 100) + '%';
}

const REPEAT_ORDER = ['none', 'all', 'one'];
function cycleRepeat() {
    const cur = player.repeatMode || 'none';
    const nxt = REPEAT_ORDER[(REPEAT_ORDER.indexOf(cur) + 1) % REPEAT_ORDER.length];
    player.setRepeat(nxt);
    const btn = document.getElementById('repeat-btn');
    if (btn) {
        btn.dataset.state = nxt;
        btn.textContent = nxt === 'none' ? '[REP: OFF]' : (nxt === 'all' ? '[REP: ALL]' : '[REP: ONE]');
    }
}

function cycleTheme() {
    const current = document.body.className.replace('theme-', '') || 'dark';
    const idx = THEME_LIST.indexOf(current);
    const nextTheme = THEME_LIST[(idx + 1) % THEME_LIST.length];
    window.setTheme(nextTheme);
}

window.navigate = navigate;
window.doSearch = doSearch;
window.setSearchFilter = setSearchFilter;
window.playFromHistory = playFromHistory;
window.promptNewPlaylist = promptNewPlaylist;
window.openPlaylist = openPlaylist;
window.deletePlaylistItem = deletePlaylistItem;
window.toggleQueue = toggleQueue;
window.removeFromQueue = removeFromQueue;
window.clearQueue = clearQueue;
window.toggleLyrics = toggleLyrics;
window.closeNowPlaying = closeNowPlaying;
window.toggleVisualizer = () => visualizer.togglePanel();
window.cycleVisualizerMode = () => visualizer.cycleMode();
window.toggleCrt = () => visualizer.toggleCrt();
window.cycleTheme = cycleTheme;

window.clearSearch = () => {
    const sInput = document.getElementById('search-input');
    const sClear = document.getElementById('search-clear-btn');
    if (sInput) {
        sInput.value = '';
        sInput.focus();
    }
    if (sClear) sClear.classList.add('hidden');
};

window.quickSearch = (q) => {
    const sInput = document.getElementById('search-input');
    const sClear = document.getElementById('search-clear-btn');
    if (sInput) {
        sInput.value = q;
        if (sClear) sClear.classList.remove('hidden');
        doSearch();
    }
};

window.toggleVisualizerExpand = () => {
    const v = document.getElementById('visualizer-drawer');
    const btn = document.getElementById('viz-expand-btn');
    if (v) {
        const isExp = v.classList.toggle('expanded');
        if (btn) btn.textContent = isExp ? '[COLLAPSE ▼]' : '[EXPAND ▲]';
        visualizer.resize();
    }
};

window.setSleepTimer = async minutes => {
    const value = Number(minutes) || 0;
    await saveSettings({ sleepMinutes: value });
    player.setSleepTimer(value);
};
window.togglePlay = togglePlay;
window.nextSong = nextSong;
window.prevSong = prevSong;
window.cycleRepeat = cycleRepeat;
window.toggleContinue = function() { player.setAutoContinue(!player.autoContinue); };
window.setRepeat = cycleRepeat;
window.toggleShuffle = function() {
    player.setShuffle(!player.shuffleMode);
    const btn = document.getElementById('shuffle-btn');
    if (btn) btn.classList.toggle('on', player.shuffleMode);
};
window.toggleLike = function() { player.toggleLike(); };
window.toggleSettings = function() { document.getElementById('settings-panel').classList.toggle('hidden'); };
window.setTheme = function(t, btn) {
    const themeName = THEME_LIST.includes(t) ? t : 'dark';
    document.body.className = 'theme-' + themeName;
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === themeName || b === btn);
    });
    localStorage.setItem('pulseterm_theme', themeName);
    saveSettings({ theme: themeName }).catch(() => {});
};
window.savePlayerSettings = async function() {
    const activeThemeBtn = document.querySelector('.theme-btn.active');
    const theme = activeThemeBtn?.dataset.theme || (document.body.className.replace('theme-', '') || 'dark');
    const vol = document.getElementById('settings-volume').value / 100;
    const shuffle = document.getElementById('settings-shuffle').checked;
    const repeat = document.getElementById('settings-repeat').value;
    const crossfade = Number(document.getElementById('settings-crossfade')?.value || 0);
    const speed = Number(document.getElementById('settings-speed')?.value || 1);
    const sleepMinutes = Number(document.getElementById('settings-sleep')?.value || 0);
    localStorage.setItem('pulseterm_theme', theme);
    await saveSettings({ theme, volume: vol, shuffle, repeat, crossfade, speed, sleepMinutes });
    player.setVolume(vol);
    await player.setRepeat(repeat);
    await player.setShuffle(shuffle);
    player.crossfade = crossfade;
    player.setPlaybackSpeed(speed);
    player.setSleepTimer(sleepMinutes);
    player.saveState();
    document.getElementById('settings-panel').classList.add('hidden');
};

function isEditingText(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
        const type = (el.type || 'text').toLowerCase();
        return ['text', 'search', 'password', 'email', 'url', 'number', 'tel'].includes(type);
    }
    return false;
}

let activeNavIndex = -1;

function getTrackElements() {
    return Array.from(document.querySelectorAll('#page-content .list-item, #page-content .item-card'));
}

function moveItemSelection(delta) {
    const items = getTrackElements();
    if (!items.length) { activeNavIndex = -1; return; }
    if (activeNavIndex < 0) {
        activeNavIndex = delta > 0 ? 0 : items.length - 1;
    } else {
        activeNavIndex = Math.max(0, Math.min(items.length - 1, activeNavIndex + delta));
    }
    items.forEach((item, i) => {
        item.classList.toggle('keyboard-focus', i === activeNavIndex);
    });
    items[activeNavIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function activateSelectedItem() {
    const items = getTrackElements();
    if (activeNavIndex >= 0 && activeNavIndex < items.length) {
        items[activeNavIndex].click();
    }
}

document.addEventListener('DOMContentLoaded', init);

document.addEventListener('keydown', (e) => {
    const target = e.target;
    const editing = isEditingText(target);

    // If typing inside a text input field:
    if (editing) {
        if (e.key === 'Escape') {
            target.blur();
        } else if (e.key === 'Enter' && target.id === 'search-input') {
            e.preventDefault();
            doSearch();
            target.blur();
        }
        return;
    }

    // Spacebar: immediate play/pause, prevent default, blur active button
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        e.stopPropagation();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        player.toggle();
        return;
    }

    // Slash: focus search prompt
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const sInput = document.getElementById('search-input');
        if (sInput) {
            sInput.focus();
            sInput.select();
        }
        return;
    }

    // Question mark: keyboard cheatsheet dialog
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('shortcut-help')?.showModal();
        return;
    }

    // Escape: dismiss all overlays, drawers, dialogs, and navigation focus
    if (e.key === 'Escape') {
        e.preventDefault();
        document.getElementById('context-menu')?.classList.add('hidden');
        document.getElementById('visualizer-drawer')?.classList.add('hidden');
        document.getElementById('equalizer-panel')?.classList.add('hidden');
        document.getElementById('settings-panel')?.classList.add('hidden');
        document.getElementById('queue-panel')?.classList.add('hidden');
        document.getElementById('shortcut-help')?.close();
        if (player.nowPlayingVisible) closeNowPlaying();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        activeNavIndex = -1;
        getTrackElements().forEach(el => el.classList.remove('keyboard-focus'));
        return;
    }

    // 1..4: Quick tab navigation
    if (e.key === '1') { e.preventDefault(); navigate('home'); return; }
    if (e.key === '2') { e.preventDefault(); navigate('search'); return; }
    if (e.key === '3') { e.preventDefault(); navigate('library'); return; }
    if (e.key === '4') { e.preventDefault(); navigate('playlists'); return; }

    // Track skip
    if (e.key.toLowerCase() === 'n') { e.preventDefault(); player.next(); return; }
    if (e.key.toLowerCase() === 'p') { e.preventDefault(); player.prev(); return; }

    // Seeking (Left / Right) & Track Skip with Shift
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
            e.key === 'ArrowRight' ? player.next() : player.prev();
        } else if (player.audio) {
            const cur = player.audio.currentTime || 0;
            const dur = player.audio.duration || 0;
            player.audio.currentTime = Math.max(0, Math.min(dur, cur + (e.key === 'ArrowRight' ? 5 : -5)));
            player.onTimeUpdate();
        }
        return;
    }

    // Volume (Up / Down)
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!e.altKey && !e.ctrlKey) {
            e.preventDefault();
            player.setVolume(player.volume + (e.key === 'ArrowUp' ? 0.05 : -0.05));
            return;
        }
    }

    // Vim tracklist navigation (j = down, k = up, Enter = activate)
    if (e.key === 'j') { e.preventDefault(); moveItemSelection(1); return; }
    if (e.key === 'k') { e.preventDefault(); moveItemSelection(-1); return; }
    if (e.key === 'Enter') {
        if (activeNavIndex >= 0) {
            e.preventDefault();
            activateSelectedItem();
            return;
        }
    }

    // Single-key toggles
    const key = e.key.toLowerCase();
    if (key === 'm') { e.preventDefault(); player.toggleMute(); return; }
    if (key === 's') {
        e.preventDefault();
        player.setShuffle(!player.shuffleMode);
        const btn = document.getElementById('shuffle-btn');
        if (btn) btn.classList.toggle('on', player.shuffleMode);
        return;
    }
    if (key === 'r') { e.preventDefault(); cycleRepeat(); return; }
    if (key === 'v') { e.preventDefault(); visualizer.togglePanel(); return; }
    if (key === 'e') { e.preventDefault(); equalizer.togglePanel(); return; }
    if (key === 'c') { e.preventDefault(); visualizer.toggleCrt(); return; }
    if (key === 't') { e.preventDefault(); cycleTheme(); return; }
    if (key === 'q') { e.preventDefault(); toggleQueue(); return; }
    if (key === 'l') { e.preventDefault(); toggleLyrics(); return; }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        if (!isEditingText(e.target)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
}, true);
