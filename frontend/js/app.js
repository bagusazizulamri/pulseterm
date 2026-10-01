import { search, searchSuggestions, getSearchHistory, browseArtist, getAlbum, getYtPlaylist, getLyrics, createPlaylist, addToPlaylist, removeFromPlaylist, deletePlaylist, getPlaylists, importYtPlaylist, getHistory, clearHistory, getLikedSongs, getSettings, saveSettings, prepareStreams } from './api.js';
import { player, togglePlay, nextSong, prevSong, toggleQueue, removeFromQueue, clearQueue, toggleLyrics, closeNowPlaying } from './player.js';
import { visualizer } from './visualizer.js';
import { equalizer } from './equalizer.js';
import { spatial } from './spatial.js?v=11';

let currentPage = 'home';
let searchResults = [];
let searchFilter = 'all';
let searchTimer = null;
let detailContext = null;

const pageTitles = { home: 'Home', search: 'Search', library: 'Library', playlists: 'Playlists' };
const THEME_LIST = ['maclight', 'ytsoft', 'oled', 'cyberpunk', 'nordic', 'light', 'liquidglass', 'softdark'];

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function showToast(message, actionLabel = '', action = null) {
    if (player && typeof player.showToast === 'function') {
        player.showToast(message, actionLabel, action);
    }
}
window.showToast = showToast;

async function navigate(page) {
    if (!page) page = 'home';
    currentPage = page;
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isActive = btn.dataset.page === currentPage;
        btn.classList.toggle('active', isActive);
        const cursor = btn.querySelector('.nav-cursor');
        if (cursor) cursor.textContent = isActive ? '▶' : ' ';
    });
    if (window.location.hash !== '#' + page) {
        try { history.replaceState(null, '', '#' + page); } catch { window.location.hash = '#' + page; }
    }
    await renderPage(page);
}

async function openLikedSongsLane() {
    await navigate('library');
    const el = document.querySelector('.item-grid') || document.querySelector('[data-lane="liked"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.openLikedSongsLane = openLikedSongsLane;

async function openHistoryLane() {
    await navigate('library');
    const el = document.querySelector('.list') || document.getElementById('clear-hist-btn');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.openHistoryLane = openHistoryLane;

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
        document.getElementById('detail-play')?.addEventListener('click', () => player.play(songs, 0, { contextName: r.data.name || item.title, isPlaylist: true }));
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
                await player.play(songs, i, { contextName: r.data.name || item.title, isPlaylist: true });
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
    content.innerHTML = '<div class="page-header"><h1>┌─ PULSETERM AUDIO ARCHIVE ─┐</h1></div><div class="empty-state"><span class="label">[BUFFER: FETCHING]</span><p>Polling telemetry, trending tracks and recommended playlists…</p></div>';
    let trending = [];
    let recPlaylists = { lanes: [] };

    // Parallel fetch for snappy UI loading
    const [tRes, pRes, hres] = await Promise.all([
        fetch('/api/trending').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/recommended/playlists').then(r => r.json()).catch(() => ({ success: false })),
        getHistory().catch(() => ({ success: false, data: [] }))
    ]);

    if (tRes && tRes.success) trending = tRes.data || [];
    if (pRes && pRes.success && pRes.data) recPlaylists = pRes.data;
    const history = hres && hres.success ? hres.data : [];

    let secIndex = 1;
    let html = '<div class="page-header"><h1>┌─ PULSETERM AUDIO ARCHIVE ─┐</h1></div>';

    // 01: Trending Tracks
    if (trending.length > 0) {
        const secStr = String(secIndex++).padStart(2, '0');
        html += '<div class="eyebrow">[ ' + secStr + ' // TRENDING TRACKS · YOUTUBE MUSIC ]</div><div class="item-grid">';
        trending.slice(0, 14).forEach(item => { html += renderCard(item); });
        html += '</div>';
    }

    // 02: Recommended Playlists (Smart taste telemetry based on top played songs & genres)
    if (recPlaylists.lanes && recPlaylists.lanes.length > 0) {
        const secStr = String(secIndex++).padStart(2, '0');
        html += '<div class="eyebrow">[ ' + secStr + ' // RECOMMENDED PLAYLISTS · TASTE PROFILE TELEMETRY ]</div>';
        html += '<div class="recommend-lanes-container">';
        recPlaylists.lanes.forEach(lane => {
            if (!lane.playlists || !lane.playlists.length) return;
            html += '<div class="recommend-lane" data-genre="' + esc(lane.genre) + '">' +
                '<div class="lane-header">' +
                    '<div class="lane-title">◈ ' + esc(lane.label || lane.displayName) + '</div>' +
                    (lane.reason ? '<div class="lane-reason">' + esc(lane.reason) + '</div>' : '') +
                '</div>' +
                '<div class="item-grid">';
            lane.playlists.forEach(pl => { html += renderCard(pl); });
            html += '</div></div>';
        });
        html += '</div>';
    }

    // 03: Recent Playback Buffer
    if (history && history.length > 0) {
        const secStr = String(secIndex++).padStart(2, '0');
        html += '<div class="eyebrow">[ ' + secStr + ' // RECENT PLAYBACK BUFFER ]</div><div class="list">';
        history.slice(0, 8).forEach((item, i) => {
            const isPlaying = player.currentSong && player.currentSong.videoId === item.video_id;
            html += '<div class="list-item' + (isPlaying ? ' is-playing' : '') + '" data-hist="' + i + '" data-video-id="' + esc(item.video_id) + '"><span class="rank">' + (isPlaying ? '▶' : '[' + String(i + 1).padStart(2, '0') + ']') + '</span>' +
                '<div class="list-info"><div class="list-title">' + esc(item.title) + '</div>' +
                '<div class="list-artist">' + esc(item.artist) + '</div></div></div>';
        });
        html += '</div>';
    }

    if (!history.length && !trending.length && (!recPlaylists.lanes || !recPlaylists.lanes.length)) {
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

    // TUI Built-in commands
    const lowerQ = q.toLowerCase();
    if (lowerQ === ':reload' || lowerQ === ':refresh' || lowerQ === 'reload' || lowerQ === 'refresh') {
        if (input) { input.value = ''; input.blur(); }
        // #5 cosmetic: mode-aware toast. Modern → "Buffer refreshed
        // (audio uninterrupted)", Retro tetap ">> BUFFER REFRESHED...".
        showModernToast('>> BUFFER REFRESHED (AUDIO UNINTERRUPTED)');
        await navigate(currentPage);
        return;
    }

    if (lowerQ.startsWith(':zoom') || lowerQ.startsWith(':scale')) {
        const parts = lowerQ.split(/\s+/);
        const arg = parts[1];
        if (input) { input.value = ''; input.blur(); }
        if (!arg || arg === 'reset' || arg === 'default') {
            setUiScale(1.0);
        } else if (arg === 'in' || arg === '+') {
            changeUiScale(0.05);
        } else if (arg === 'out' || arg === '-') {
            changeUiScale(-0.05);
        } else {
            const val = parseFloat(arg.replace('%', ''));
            if (!isNaN(val)) {
                const s = val > 2 ? val / 100 : val;
                setUiScale(s);
            }
        }
        return;
    }

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
    let html = '<div class="page-header"><h1>┌─ LOCAL PLAYLIST REGISTRY ─┐</h1>' +
        '<div style="display:flex;gap:8px;">' +
        '<button id="import-yt-pl-btn" class="tui-btn">[⇣ IMPORT YOUTUBE]</button>' +
        '<button id="new-pl-btn" class="tui-btn">[+ NEW PLAYLIST]</button>' +
        '</div></div>';
    if (pls.length === 0) {
        html += '<div class="empty-state"><span class="label">[REGISTRY: VOID]</span><h3>NO PLAYLISTS INITIALIZED</h3><p>Create a custom playlist or import one from YouTube to bundle audio streams.</p></div>';
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
    const ib = document.getElementById('import-yt-pl-btn');
    if (ib) ib.addEventListener('click', openImportPlaylistModal);
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
        card.addEventListener('click', async (e) => {
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

            // Direct play when clicking the play icon overlay on a playlist or album card
            if (kind === 'playlist' && e.target.closest('.card-play-overlay')) {
                try {
                    const r = await fetch('/api/playlist/' + encodeURIComponent(vid)).then(x => x.json());
                    if (r?.success && r.data?.results?.length) {
                        const songs = r.data.results.map(s => ({
                            videoId: s.videoId || s.video_id,
                            title: s.title,
                            artist: s.artist || '',
                            album: s.album || '',
                            thumbnail: s.thumbnail || '',
                            duration: s.duration || 0
                        }));
                        await player.play(songs, 0, { contextName: r.data.name || card.dataset.title, isPlaylist: true });
                        return;
                    }
                } catch (err) {
                    console.debug('Direct playlist play error:', err);
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
            await player.play([song], 0, { isSingleSong: true });
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
        await player.play([{ videoId: item.video_id, title: item.title, artist: item.artist }], 0, { isSingleSong: true });
    }
}

async function promptNewPlaylist() {
    // #14+ PulseTerm: ganti native prompt() dengan <dialog> modal biar
    // konsisten dengan IMPORT PLAYLIST modal. Fallback ke prompt()
    // kalau DOM element tidak ada (mis. legacy page).
    const modal = document.getElementById('create-playlist-modal');
    if (!modal) {
        const name = prompt('Input playlist identifier:');
        if (name) {
            await createPlaylist(name);
            renderPlaylists(document.getElementById('page-content'));
        }
        return;
    }
    openCreatePlaylistModal();
}

function openCreatePlaylistModal() {
    const modal = document.getElementById('create-playlist-modal');
    if (!modal) return;
    const nameInput = document.getElementById('create-name-input');
    const errorEl = document.getElementById('create-error');
    const submitBtn = document.getElementById('create-submit-btn');
    if (nameInput) nameInput.value = '';
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
    }
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '[+ CREATE]';
    }
    modal.showModal();
    if (nameInput) nameInput.focus();
}

async function handleCreatePlaylist() {
    const modal = document.getElementById('create-playlist-modal');
    const nameInput = document.getElementById('create-name-input');
    const errorEl = document.getElementById('create-error');
    const submitBtn = document.getElementById('create-submit-btn');

    const raw = (nameInput?.value || '').trim();
    if (!raw) {
        if (errorEl) {
            errorEl.textContent = 'Playlist identifier cannot be empty.';
            errorEl.classList.remove('hidden');
        }
        if (nameInput) nameInput.focus();
        return;
    }
    // Backend (main.py:886) sudah truncate >120, tapi tampilkan feedback
    // upfront.
    const name = raw.length > 120 ? raw.slice(0, 120) : raw;

    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
    }
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '[CREATING...]';
    }

    try {
        const res = await createPlaylist(name);
        if (res && res.success) {
            modal?.close();
            const created = res.data?.name || name;
            // #5 cosmetic: mode-aware toast untuk umpan balik sukses.
            showModernToast(`[✓ PLAYLIST: ${created}]`);
            await renderPlaylists(document.getElementById('page-content'));
        } else {
            const errMsg = res?.error || 'Failed to create playlist.';
            if (errorEl) {
                errorEl.textContent = errMsg;
                errorEl.classList.remove('hidden');
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '[+ CREATE]';
            }
            if (nameInput) nameInput.focus();
        }
    } catch (e) {
        if (errorEl) {
            errorEl.textContent = `Failed to create playlist: ${e?.message || e}`;
            errorEl.classList.remove('hidden');
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '[+ CREATE]';
        }
        if (nameInput) nameInput.focus();
    }
}

let _importSpinnerInterval = null;

function openImportPlaylistModal() {
    const modal = document.getElementById('import-playlist-modal');
    if (!modal) return;
    const urlInput = document.getElementById('import-url-input');
    const nameInput = document.getElementById('import-name-input');
    const statusEl = document.getElementById('import-status');
    const errorEl = document.getElementById('import-error');
    const submitBtn = document.getElementById('import-submit-btn');

    if (urlInput) urlInput.value = '';
    if (nameInput) nameInput.value = '';
    if (statusEl) statusEl.classList.add('hidden');
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
    }
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '[⇣ IMPORT PLAYLIST]';
    }
    if (_importSpinnerInterval) {
        clearInterval(_importSpinnerInterval);
        _importSpinnerInterval = null;
    }

    modal.showModal();
    if (urlInput) urlInput.focus();
}

async function handleImportPlaylist() {
    const modal = document.getElementById('import-playlist-modal');
    const urlInput = document.getElementById('import-url-input');
    const nameInput = document.getElementById('import-name-input');
    const statusEl = document.getElementById('import-status');
    const statusText = document.getElementById('import-status-text');
    const spinner = modal?.querySelector('.import-spinner');
    const errorEl = document.getElementById('import-error');
    const submitBtn = document.getElementById('import-submit-btn');

    const url = (urlInput?.value || '').trim();
    const customName = (nameInput?.value || '').trim();

    if (!url) {
        if (errorEl) {
            errorEl.textContent = 'Please enter a valid YouTube playlist URL or ID.';
            errorEl.classList.remove('hidden');
        }
        if (urlInput) urlInput.focus();
        return;
    }

    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
    }
    if (statusEl) statusEl.classList.remove('hidden');
    if (statusText) statusText.textContent = 'Resolving playlist & fetching track metadata...';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '[IMPORTING...]';
    }

    const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinIdx = 0;
    if (_importSpinnerInterval) clearInterval(_importSpinnerInterval);
    _importSpinnerInterval = setInterval(() => {
        spinIdx = (spinIdx + 1) % spinnerChars.length;
        if (spinner) spinner.textContent = spinnerChars[spinIdx];
    }, 80);

    try {
        const res = await importYtPlaylist(url, customName);
        if (_importSpinnerInterval) {
            clearInterval(_importSpinnerInterval);
            _importSpinnerInterval = null;
        }

        if (res && res.success && res.data) {
            const count = res.data.count || (res.data.songs ? res.data.songs.length : 0);
            const plName = res.data.name || 'PLAYLIST';
            modal?.close();
            // #4 cosmetic: ganti bracket retro dengan mode-aware toast.
            // Modern → "✓ Imported: ${plName} (${count} tracks)"
            // Retro → "[✓ IMPORTED: ${plName} (${count} TRACKS)]" (apa adanya).
            showModernToast(`[✓ IMPORTED: ${plName} (${count} TRACKS)]`);
            const content = document.getElementById('page-content');
            if (content && currentPage === 'playlists') {
                await renderPlaylists(content);
            }
        } else {
            const errMsg = res?.error || 'Failed to import playlist. Please verify the URL.';
            if (errorEl) {
                errorEl.textContent = errMsg;
                errorEl.classList.remove('hidden');
            }
            if (statusEl) statusEl.classList.add('hidden');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '[⇣ IMPORT PLAYLIST]';
            }
        }
    } catch (err) {
        if (_importSpinnerInterval) {
            clearInterval(_importSpinnerInterval);
            _importSpinnerInterval = null;
        }
        if (errorEl) {
            errorEl.textContent = err?.message || 'Network error occurred during import.';
            errorEl.classList.remove('hidden');
        }
        if (statusEl) statusEl.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '[⇣ IMPORT PLAYLIST]';
        }
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
        if (songs.length > 0) player.play(songs, 0, { contextName: pl.name, isPlaylist: true });
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
                await player.play(songs, i, { contextName: pl.name, isPlaylist: true });
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

let currentUiScale = 1.0;

function updateResponsiveZoom() {
    const scale = currentUiScale || 1.0;
    const effectiveW = window.innerWidth / scale;
    const effectiveH = window.innerHeight / scale;
    document.documentElement.classList.toggle('layout-compact-rail', effectiveW < 1260);
    document.documentElement.classList.toggle('layout-compact-player-bar', effectiveW < 1320);
    document.documentElement.classList.toggle('layout-stacked-player', effectiveW < 880 || effectiveH < 560);
}

function setUiScale(scale, notify = true) {
    const numericScale = Math.min(1.40, Math.max(0.70, Math.round(Number(scale) * 100) / 100));
    currentUiScale = numericScale;
    window.currentUiScale = numericScale;
    
    // Apply zoom to documentElement for full page element scaling
    document.documentElement.style.zoom = numericScale;
    document.documentElement.style.setProperty('--ui-scale', String(numericScale));
    
    // Update responsive layout classes for zoomed coordinate system
    updateResponsiveZoom();
    
    // Update label & slider
    const label = document.getElementById('zoom-value-label');
    if (label) label.textContent = `${Math.round(numericScale * 100)}%`;
    
    const slider = document.getElementById('zoom-slider');
    if (slider) slider.value = Math.round(numericScale * 100);
    
    // Update active preset button
    document.querySelectorAll('.zoom-preset-btn').forEach(btn => {
        const btnScale = parseFloat(btn.dataset.scale);
        btn.classList.toggle('active', Math.abs(btnScale - numericScale) < 0.02);
    });
    
    localStorage.setItem('pulseterm_zoom', String(numericScale));
    setLocalSettings({ uiScale: numericScale });
    if (notify) {
        // #5 cosmetic: mode-aware toast. Modern → "UI scale: 100%",
        // Retro tetap ">> UI SCALE: 100%".
        showModernToast(`>> UI SCALE: ${Math.round(numericScale * 100)}%`);
    }
}

function changeUiScale(delta) {
    setUiScale(currentUiScale + delta, true);
}

window.currentUiScale = currentUiScale;
window.setUiScale = setUiScale;
window.changeUiScale = changeUiScale;
window.updateResponsiveZoom = updateResponsiveZoom;
window.addEventListener('resize', updateResponsiveZoom);

// =========================================================================
// Dual-Layer Settings Engine: Local-First (0ms sync) + SQLite DB Fallback Sync
// =========================================================================
const SETTINGS_STORAGE_KEY = 'pulseterm_settings';

function getLocalSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    const theme = localStorage.getItem('pulseterm_theme');
    const zoom = parseFloat(localStorage.getItem('pulseterm_zoom'));
    if (theme || !isNaN(zoom)) {
        return {
            theme: theme || 'maclight',
            uiScale: !isNaN(zoom) ? zoom : 1.0,
        };
    }
    return null;
}

function setLocalSettings(data) {
    if (!data || typeof data !== 'object') return {};
    try {
        const existing = getLocalSettings() || {};
        const merged = { ...existing, ...data };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
        if (merged.theme) localStorage.setItem('pulseterm_theme', merged.theme);
        if (merged.uiScale) localStorage.setItem('pulseterm_zoom', String(merged.uiScale));
        return merged;
    } catch {
        return data;
    }
}

function applyThemeClass(themeName) {
    const validTheme = THEME_LIST.includes(themeName) ? themeName : 'maclight';
    const classes = Array.from(document.body.classList).filter(c => !c.startsWith('theme-'));
    classes.push('theme-' + validTheme);
    document.body.className = classes.join(' ');
}

function applySettings(d, syncInputs = true) {
    if (!d || typeof d !== 'object') return;

    // 1. UI Zoom Scale
    const scale = parseFloat(d.uiScale ?? d.zoom);
    if (!isNaN(scale) && scale >= 0.70 && scale <= 1.40) {
        setUiScale(scale, false);
    }

    // 2. Theme
    const themeToApply = d.theme && THEME_LIST.includes(d.theme) ? d.theme : (d.theme || 'maclight');
    applyThemeClass(themeToApply);
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === themeToApply);
    });

    // 3. Audio & Playback Parameters
    if (typeof d.volume === 'number' && Number.isFinite(d.volume)) {
        player.setVolume(d.volume);
    }
    if (d.repeat && ['none', 'all', 'one'].includes(d.repeat)) {
        player.repeatMode = d.repeat;
        const rb = document.getElementById('repeat-btn');
        if (rb) {
            rb.dataset.state = player.repeatMode;
            rb.textContent = player.repeatMode === 'none' ? '[REP: OFF]' : (player.repeatMode === 'all' ? '[REP: ALL]' : '[REP: ONE]');
        }
    }
    if (typeof d.shuffle !== 'undefined') {
        player.setShuffle(Boolean(d.shuffle)).catch(() => {});
        const sb = document.getElementById('shuffle-btn');
        if (sb) sb.classList.toggle('on', player.shuffleMode);
    }
    if (typeof d.crossfade !== 'undefined') {
        player.crossfade = Number(d.crossfade) || 0;
        const cfLabel = document.getElementById('crossfade-value');
        if (cfLabel) cfLabel.textContent = player.crossfade + 's';
    }
    if (typeof d.speed !== 'undefined') {
        player.setPlaybackSpeed(Number(d.speed) || 1);
    }
    if (Number(d.sleepMinutes) > 0) {
        player.setSleepTimer(Number(d.sleepMinutes));
    }
    
    if (typeof d.queueLimit !== 'undefined') {
        player.setQueueLimit(Number(d.queueLimit) || 20);
    }
    
    // Experimental Features Check
    if (typeof d.expSpatial !== 'undefined') {
        window.expSpatialEnabled = d.expSpatial;
        const navBtn = document.getElementById('spatial-toggle-btn');
        const eqBtn = document.getElementById('spatial-panel-btn');
        if (navBtn) navBtn.style.display = d.expSpatial ? 'inline-block' : 'none';
        if (eqBtn) eqBtn.style.display = d.expSpatial ? 'inline-block' : 'none';
        
        // Turn off if disabled
        if (!d.expSpatial && window.spatial && window.spatial.mode !== 'off') {
            window.spatial.setMode('off');
        }
    } else {
        window.expSpatialEnabled = true; // default true if not set
    }
    
    if (typeof d.expPerfectTune !== 'undefined') {
        window.expPerfectTuneEnabled = d.expPerfectTune;
        const perfectBtn = document.getElementById('eq-perfect-btn');
        if (perfectBtn) perfectBtn.style.display = d.expPerfectTune ? 'inline-block' : 'none';
    } else {
        window.expPerfectTuneEnabled = true; // default true if not set
    }

    // 4. Update Form Inputs if Settings Panel exists
    if (syncInputs) {
        const sh = document.getElementById('settings-shuffle'); if (sh) sh.checked = Boolean(player.shuffleMode);
        const rp = document.getElementById('settings-repeat'); if (rp) rp.value = player.repeatMode;
        const cf = document.getElementById('settings-crossfade'); if (cf) cf.value = player.crossfade;
        const sp = document.getElementById('settings-speed'); if (sp) sp.value = player.audio?.playbackRate || 1;
        
        const sl = document.getElementById('settings-sleep'); if (sl) sl.value = String(d.sleepMinutes || 0);
        const ql = document.getElementById('settings-queue-limit'); if (ql) ql.value = String(player.queueLimit || 20);
        const sv = document.getElementById('settings-volume'); if (sv) sv.value = Math.round((player.volume ?? 0.8) * 100);
        
        const expSpatialEl = document.getElementById('settings-exp-spatial');
        if (expSpatialEl) expSpatialEl.checked = d.expSpatial !== false;
        
        const expPerfectTuneEl = document.getElementById('settings-exp-perfect-tune');
        if (expPerfectTuneEl) expPerfectTuneEl.checked = d.expPerfectTune !== false;

    }

    const vol = player.volume ?? 0.8;
    const vReadout = document.getElementById('vol-readout');
    if (vReadout) vReadout.textContent = Math.round(vol * 100) + '%';
}

async function syncSettingsWithServer(localSettings) {
    try {
        const res = await getSettings();
        if (res?.success && res.data) {
            const server = res.data;
            if (!localSettings) {
                // Layer 2 Fallback: Local storage was empty (cache wiped / first visit) -> restore from DB
                setLocalSettings(server);
                applySettings(server);
            } else {
                // Dual layer merge: retain local overrides while syncing server defaults
                const merged = setLocalSettings(server);
                applySettings(merged);
            }
        }
    } catch (e) {
        console.debug('Background settings DB sync notice:', e);
    }
}

async function init() {
    // LAYER 1 (Early 0ms): Apply theme and UI zoom before DOM renders to prevent any visual flash
    const localSettings = getLocalSettings();
    applySettings(localSettings || { theme: localStorage.getItem('pulseterm_theme') || 'maclight' });

    player.init();
    equalizer.initAudioContext();
    equalizer.updateUI();
    visualizer.init(player.audio);
    initRealtime();

    // LAYER 1 (Player bound): Re-apply settings to player instance
    if (localSettings) {
        applySettings(localSettings);
    }

    // LAYER 2: Background sync with SQLite database (non-blocking)
    syncSettingsWithServer(localSettings);

    // Non-blocking home render
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

    // YouTube playlist import modal handlers
    const importModal = document.getElementById('import-playlist-modal');
    const importSubmitBtn = document.getElementById('import-submit-btn');
    const importCancelBtn = document.getElementById('import-cancel-btn');
    const importUrlInput = document.getElementById('import-url-input');
    const importNameInput = document.getElementById('import-name-input');

    if (importSubmitBtn) {
        importSubmitBtn.addEventListener('click', handleImportPlaylist);
    }
    if (importCancelBtn && importModal) {
        importCancelBtn.addEventListener('click', () => importModal.close());
    }
    [importUrlInput, importNameInput].forEach(inp => {
        inp?.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleImportPlaylist();
            }
        });
    });

    // #14+ PulseTerm: Create playlist modal handlers (paralel dengan
    // import modal). Enter key submit, Esc/close tutup, error tampil
    // inline tanpa menutup modal.
    const createModal = document.getElementById('create-playlist-modal');
    const createSubmitBtn = document.getElementById('create-submit-btn');
    const createCancelBtn = document.getElementById('create-cancel-btn');
    const createNameInput = document.getElementById('create-name-input');

    if (createSubmitBtn) {
        createSubmitBtn.addEventListener('click', handleCreatePlaylist);
    }
    if (createCancelBtn && createModal) {
        createCancelBtn.addEventListener('click', () => createModal.close());
    }
    if (createNameInput) {
        createNameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCreatePlaylist();
            }
        });
    }
    // Reset state kalau modal ditutup (Esc / backdrop / close-esc) supaya
    // buka berikutnya bersih.
    if (createModal) {
        createModal.addEventListener('close', () => {
            if (createNameInput) createNameInput.value = '';
            const errEl = document.getElementById('create-error');
            if (errEl) {
                errEl.classList.add('hidden');
                errEl.textContent = '';
            }
            if (createSubmitBtn) {
                createSubmitBtn.disabled = false;
                createSubmitBtn.textContent = '[+ CREATE]';
            }
        });
    }
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
    const currentThemeClass = Array.from(document.body.classList).find(c => c.startsWith('theme-'));
    const current = (currentThemeClass || '').replace('theme-', '') || 'maclight';
    const idx = THEME_LIST.indexOf(current);
    const nextTheme = THEME_LIST[(idx + 1) % THEME_LIST.length];
    window.setTheme(nextTheme);
    const names = { maclight: "MAC LIGHT", ytsoft: "YOUTUBE SOFT", oled: "OLED MONO", cyberpunk: "CYBERPUNK", nordic: "TOKYO SLATE", light: "SOLARIZED", liquidglass: "MAC LIQUID GLASS", softdark: "SOFT DARK" };
    // #5 cosmetic: mode-aware toast. Modern → "Theme: mac light",
    // Retro tetap ">> THEME: MAC LIGHT".
    showModernToast(`>> THEME: ${names[nextTheme] || nextTheme.toUpperCase()}`);
}

window.navigate = navigate;
window.doSearch = doSearch;
window.setSearchFilter = setSearchFilter;
window.playFromHistory = playFromHistory;
window.promptNewPlaylist = promptNewPlaylist;
window.openImportPlaylistModal = openImportPlaylistModal;
window.openCreatePlaylistModal = openCreatePlaylistModal;
window.handleCreatePlaylist = handleCreatePlaylist;
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
window.cycleCrt = () => visualizer.toggleCrt();
window.cycleTheme = cycleTheme;
window.player = player;
window.spatial = spatial;
window.visualizer = visualizer;

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
    const themeName = THEME_LIST.includes(t) ? t : 'maclight';
    applyThemeClass(themeName);
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === themeName || b === btn);
    });
    setLocalSettings({ theme: themeName });
    saveSettings({ theme: themeName }).catch(() => {});
};

window.savePlayerSettings = function() {
    const activeThemeBtn = document.querySelector('.theme-btn.active');
    const currentThemeClass = Array.from(document.body.classList).find(c => c.startsWith('theme-'));
    const theme = activeThemeBtn?.dataset.theme || (currentThemeClass ? currentThemeClass.replace('theme-', '') : 'maclight');
    const vol = Number(document.getElementById('settings-volume')?.value || 80) / 100;
    const shuffle = Boolean(document.getElementById('settings-shuffle')?.checked);
    const repeat = document.getElementById('settings-repeat')?.value || 'none';
    const crossfade = Number(document.getElementById('settings-crossfade')?.value || 0);
    const speed = Number(document.getElementById('settings-speed')?.value || 1);
    
    const sleepMinutes = Number(document.getElementById('settings-sleep')?.value || 0);
    const queueLimit = Number(document.getElementById('settings-queue-limit')?.value || 20);
    
    const expSpatial = Boolean(document.getElementById('settings-exp-spatial')?.checked);
    const expPerfectTune = Boolean(document.getElementById('settings-exp-perfect-tune')?.checked);

    const newSettings = { theme, volume: vol, shuffle, repeat, crossfade, speed, sleepMinutes, queueLimit, expSpatial, expPerfectTune };

    // 1. Layer 1: Optimistic Local-First write (0ms)
    setLocalSettings(newSettings);
    applySettings(newSettings);
    player.saveState();
    document.getElementById('settings-panel')?.classList.add('hidden');

    // 2. Layer 2: Background sync with SQLite database
    saveSettings(newSettings).catch(e => console.debug('Settings DB sync notice:', e));
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

    // Browser Hard Reload (Ctrl+Shift+R, Cmd+Shift+R, Shift+F5, Ctrl+F5) -> allow browser native reload
    const isHardReload = ((e.key === 'r' || e.key === 'R') && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
                         (e.key === 'F5' && (e.shiftKey || e.ctrlKey));
    if (isHardReload) {
        return;
    }

    // In-App Soft Reload: F5, Ctrl+R, Cmd+R, Ctrl+L (terminal screen refresh)
    const isSoftReload = (e.key === 'F5' && !e.shiftKey && !e.ctrlKey) ||
                         ((e.key === 'r' || e.key === 'R') && (e.ctrlKey || e.metaKey) && !e.shiftKey) ||
                         ((e.key === 'l' || e.key === 'L') && (e.ctrlKey || e.metaKey));
    if (isSoftReload) {
        e.preventDefault();
        // #5 cosmetic: mode-aware toast. Modern → "View buffer refreshed
        // (audio uninterrupted)", Retro tetap ">> VIEW BUFFER...".
        showModernToast('>> VIEW BUFFER REFRESHED (AUDIO UNINTERRUPTED)');
        navigate(currentPage);
        return;
    }

    // UI Scale & Zoom shortcuts: Ctrl + / Ctrl - / Ctrl 0
    if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
            e.preventDefault();
            changeUiScale(0.05);
            return;
        }
        if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
            e.preventDefault();
            changeUiScale(-0.05);
            return;
        }
        if (e.key === '0' || e.code === 'Numpad0') {
            e.preventDefault();
            setUiScale(1.0);
            return;
        }
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
        equalizer.closePanel();
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

    // Single-key toggles (disallow when Ctrl / Meta / Alt is held)
    if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
    }
    const key = e.key.toLowerCase();
    if (key === 'm') { e.preventDefault(); player.toggleMute(); return; }
    if (key === 's') {
        e.preventDefault();
        player.setShuffle(!player.shuffleMode);
        const btn = document.getElementById('shuffle-btn');
        if (btn) btn.classList.toggle('on', player.shuffleMode);
        return;
    }
    if (key === 'r') {
        e.preventDefault();
        if (player.nowPlayingVisible && player.lyricsData?.hasRoman) {
            player.cycleRomanMode();
        } else {
            cycleRepeat();
        }
        return;
    }
    if (key === 'v') { e.preventDefault(); visualizer.togglePanel(); return; }
    if (key === 'e') { e.preventDefault(); equalizer.togglePanel(); return; }
    if (key === 'a') {
        const eqPanel = document.getElementById('equalizer-panel');
        if (eqPanel && !eqPanel.classList.contains('hidden')) {
            e.preventDefault();
            equalizer.toggleAutoMode();
            return;
        }
    }
    if (key === 'p') {
        e.preventDefault();
        const eqPanel = document.getElementById('equalizer-panel');
        if (eqPanel && !eqPanel.classList.contains('hidden')) {
            equalizer.perfectTune();
        } else {
            player.prev();
        }
        return;
    }
    if (key === 'x') { e.preventDefault(); if(window.expSpatialEnabled !== false) { spatial.cycleMode(); } return; }
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
