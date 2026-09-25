import {
    getStreamUrl, playSongs as apiPlaySongs, pause as apiPause,
    setVolume as apiSetVolume, setShuffle as apiSetShuffle,
    setRepeat as apiSetRepeat, prepareStreams, getLyrics,
    getQueue, addQueue, deleteQueue, reorderQueue,
    setCurrentSong, setQueueOrder, removeContextTrack, getOfflineTracks,
    downloadOffline, removeOffline, toggleLiked, getLikedIds,
    getPlayerStatus, getPlaylists, addToPlaylist,
    getContinueState, setContinueEnabled, extendQueue,
} from './api.js';
import { equalizer } from './equalizer.js';

const player = {
    audio: null,
    preloadAudio: null,
    currentSongs: [],       // source context, stays in its original order
    playOrder: [],          // stable permutation; shuffle never reshuffles on next()
    orderPos: -1,
    currentIndex: -1,       // source-context index
    currentSong: null,
    currentKind: 'context',
    userQueue: [],
    history: [],
    contextName: '',
    isPlaying: false,
    isLoading: false,
    queueVisible: false,
    repeatMode: 'none',
    shuffleMode: false,
    volume: 0.8,
    muted: false,
    lastVolume: 0.8,
    playToken: 0,
    errorRetry: 0,
    seekCommitTimer: null,
    volumeCommitTimer: null,
    sleepTimer: null,
    crossfade: 0,
    sleepFadeTimer: null,
    nowPlayingVisible: false,
    lyrics: [],
    activeLyric: -1,
    likedIds: new Set(),
    offlineIds: new Set(),
    autoContinue: true,
    autoIds: new Set(),
    recReasons: {},
    continueSeed: null,
    continueBusy: false,
    continueNotice: '',
    toastTimer: null,
    pendingUndo: null,

    init() {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.volume = this.volume;
        this.audio.removeAttribute('crossorigin');
        this.preloadAudio = new Audio();
        this.preloadAudio.preload = 'auto';
        this.preloadAudio.removeAttribute('crossorigin');
        this._bindActiveAudio();
        equalizer.initAudioContext();
        equalizer.attachMediaElements(this.audio, this.preloadAudio);
        /*
        this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audio.addEventListener('progress', () => this.onBuffered());
        this.audio.addEventListener('ended', () => this.onEnded());
        this.audio.addEventListener('loadedmetadata', () => this.onMetaLoaded());
        this.audio.addEventListener('waiting', () => this.setStatus('Buffering…'));
        this.audio.addEventListener('playing', () => { this.setStatus(''); this.isPlaying = true; this.updatePlayerUI(); });
        this.audio.addEventListener('pause', () => { this.isPlaying = false; this.updatePlayerUI(); });
        this.audio.addEventListener('error', () => this.onError());
        */
        this.loadState();
        this.bindEvents();
        this.installMediaSession();
        this.hydrate();
        this.refreshContinueState();
        this.updatePlayerUI();
        this.refreshLiked();
        this.refreshOffline();
        this.checkAutoResume();
    },

    _norm(list) {
        return (list || []).map(s => ({
            videoId: s.videoId || s.video_id || '',
            title: s.title || 'Unknown',
            artist: s.artist || '',
            album: s.album || '',
            thumbnail: s.thumbnail || '',
            duration: Number(s.duration) || 0,
            autoAdded: !!(s.autoAdded || s.auto_added),
            reason: s.reason || '',
        })).filter(s => s.videoId);
    },

    _bindActiveAudio() {
        if (this.boundAudio && this.boundHandlers) {
            for (const [event, handler] of Object.entries(this.boundHandlers)) this.boundAudio.removeEventListener(event, handler);
        }
        this.boundAudio = this.audio;
        this.boundHandlers = {
            timeupdate: () => this.onTimeUpdate(),
            progress: () => this.onBuffered(),
            ended: () => this.onEnded(),
            loadedmetadata: () => this.onMetaLoaded(),
            waiting: () => this.setStatus('Buffering…'),
            playing: () => {
                this.setStatus('');
                this.isPlaying = true;
                this.updatePlayerUI();
                this.savePlaybackSession();
            },
            pause: () => {
                this.isPlaying = false;
                this.updatePlayerUI();
                if (!this.isLoading) this.clearPlaybackSession();
            },
            error: () => this.onError(),
        };
        for (const [event, handler] of Object.entries(this.boundHandlers)) this.audio.addEventListener(event, handler);
    },

    _shuffleOrder(length, currentIndex = 0) {
        if (!length) return [];
        const rest = Array.from({ length }, (_, i) => i).filter(i => i !== currentIndex);
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        return [currentIndex, ...rest];
    },

    async play(songs, index = 0, options = {}) {
        songs = this._norm(songs);
        try { index = Number(index) || 0; } catch { index = 0; }
        if (!songs.length || !Number.isInteger(index) || index < 0 || index >= songs.length) return;
        const seed = songs[index] || null;
        if (options.preserveContext && this.currentSongs.length) {
            this.currentSong = songs[index];
            this.currentKind = options.kind || 'user';
            if (options.kind === 'user' || this.currentKind === 'user') this._adoptContinueSeed(seed);
            // A manual "play next / add" starts a user-lane detour; continuing
            // recommendations still follow the last clicked context track.
        } else {
            this.currentSongs = songs;
            this.contextName = options.contextName || '';
            this.currentIndex = index;
            this.playOrder = this.shuffleMode ? this._shuffleOrder(songs.length, index) : songs.map((_, i) => i);
            this.orderPos = this.playOrder.indexOf(index);
            this.currentKind = 'context';
            // The clicked track must become current BEFORE _start(): otherwise
            // `this.currentSong || songs[index]` keeps resolving to the
            // previous track (e.g. MAMA) and every click replays the old song.
            this.currentSong = songs[index];
            this._adoptContinueSeed(seed);
            this._scheduleContinue(seed);
        }
        return this._start(this.currentSong, options);
    },

    _adoptContinueSeed(seed) {
        if (!seed?.videoId) return;
        this.continueSeed = { ...seed };
    },

    _scheduleContinue(seed) {
        if (!this.autoContinue || !seed?.videoId) return;
        clearTimeout(this.continueTimer);
        this.continueTimer = setTimeout(() => this._extendContinuing(seed), 900);
    },

    async _extendContinuing(seed) {
        if (!this.autoContinue || this.continueBusy || !seed?.videoId) return;
        // Only top up when the tail is short so a long album/playlist is untouched.
        const remaining = Math.max(0, this.playOrder.length - (this.orderPos + 1));
        if (remaining > 3) return;
        this.continueBusy = true;
        try {
            const isVid = Boolean(seed.isVideo || seed.is_video);
            const res = await extendQueue({
                videoId: seed.videoId, title: seed.title, artist: seed.artist,
                album: seed.album || '', thumbnail: seed.thumbnail || '',
                duration: seed.duration || 0,
                isVideo: isVid,
                is_video: isVid,
            }, 15);
            const added = res?.success ? (res.data?.added || []) : [];
            if (added.length) this._mergeContinuing(res.data?.status || null, added);
            else if (res?.success) this._noteContinueEmpty();
        } catch {
            // Quiet failure: the lane simply ends instead of interrupting playback.
        } finally {
            this.continueBusy = false;
        }
    },

    _mergeContinuing(status, added) {
        const normed = this._norm(added);
        if (!normed.length && !(status && typeof status === 'object')) return;
        for (const song of normed) {
            song.autoAdded = true;
            if (this.currentSongs.some(s => s.videoId === song.videoId)) continue;
            if (this.userQueue.some(s => s.videoId === song.videoId)) continue;
            if (this.history.some(s => s.videoId === song.videoId)) continue;
            this.currentSongs.push(song);
            this.playOrder.push(this.currentSongs.length - 1);
            this.autoIds.add(song.videoId);
            if (song.reason) this.recReasons[song.videoId] = song.reason;
        }
        if (status && typeof status === 'object') this._applyServerQueue(status);
        this.continueNotice = 'Continuing the ' + (this._laneLabel(this.continueSeed) || 'lane');
        this.saveState();
        this.updatePlayerUI();
        this.updateQueueUI();
        this.prepareNext();
    },

    _noteContinueEmpty() {
        // Keep the message truthful: no genre/vibe match was found, so stop.
        this.continueNotice = '';
        this.updateQueueUI();
    },

    _laneLabel(seed) {
        if (!seed || typeof seed !== 'object') return '';
        const tags = String(seed.reason || '').replace(/^genre:\s*/i, '').split(';')[0].trim();
        if (tags) return tags;
        return seed.artist || seed.album || '';
    },

    _applyServerQueue(status) {
        if (!status || typeof status !== 'object') return;
        const ctx = this._norm(status.context || []);
        if (ctx.length >= this.currentSongs.length) {
            const posId = this.currentSong?.videoId;
            this.currentSongs = ctx;
            const cleanOrder = Array.isArray(status.order)
                ? status.order.filter(i => Number.isInteger(i) && i >= 0 && i < ctx.length)
                : [];
            this.playOrder = cleanOrder.length ? cleanOrder : ctx.map((_, i) => i);
            if (posId) {
                const idx = ctx.findIndex(s => s.videoId === posId);
                this.currentIndex = idx;
                this.orderPos = idx >= 0 ? this.playOrder.indexOf(idx) : 0;
                if (this.orderPos < 0) this.orderPos = 0;
            }
        }
        const reasons = status.recReasons || status.rec_reasons || {};
        this.autoIds = new Set(status.autoIds || status.auto_ids || [...this.autoIds]);
        if (typeof reasons === 'object' && reasons !== null) Object.assign(this.recReasons, reasons);
        for (const track of this.currentSongs) {
            if (this.autoIds.has(track.videoId)) track.autoAdded = true;
            if (this.recReasons[track.videoId]) track.reason = this.recReasons[track.videoId];
        }
    },

    async refreshContinueState() {
        try {
            const res = await getContinueState();
            if (res?.success && res.data && typeof res.data === 'object') {
                if (typeof res.data.enabled === 'boolean') this.autoContinue = res.data.enabled;
            }
        } catch {}
        this.updateContinueUI();
    },

    async setAutoContinue(enabled) {
        this.autoContinue = !!enabled;
        try { await setContinueEnabled(this.autoContinue); } catch {}
        if (!this.autoContinue) {
            clearTimeout(this.continueTimer);
            this.continueNotice = '';
        } else if (this.currentSong) {
            this._adoptContinueSeed(this.currentSong);
            this._scheduleContinue(this.currentSong);
        }
        this.saveState();
        this.updateContinueUI();
        this.updateQueueUI();
        this.showToast(this.autoContinue ? 'Continuing playlist on' : 'Continuing playlist off');
    },

    updateContinueUI() {
        const btn = document.getElementById('continue-btn');
        if (btn) {
            btn.classList.toggle('on', this.autoContinue);
            btn.setAttribute('aria-pressed', String(this.autoContinue));
            btn.title = this.autoContinue ? 'Continuing playlist on' : 'Continuing playlist off';
        }
    },

    async _start(song, options = {}) {
        if (!song?.videoId) return;
        const token = ++this.playToken;
        const resumeAt = Number(options.position) || 0;
        const shouldExtendHistory = !options.fromHistory && (!this.history.length || this.history[this.history.length - 1].videoId !== song.videoId);
        this.currentSong = song;
        equalizer.attachMediaElements(this.audio, this.preloadAudio);
        equalizer.resetGains();
        await equalizer.resume();

        // INSTANT DECK SWAP: If preloadAudio already buffered this track, play immediately with zero delay
        const isPreloadReady = this.preloadAudio &&
                               this.preloadAudio.dataset.videoId === song.videoId &&
                               this.preloadAudio.src &&
                               resumeAt === 0 &&
                               !options.refresh;

        if (isPreloadReady) {
            try {
                const oldAudio = this.audio;
                oldAudio.pause();
                oldAudio.removeAttribute('src');
                delete oldAudio.dataset.videoId;
                oldAudio.load();

                this.audio = this.preloadAudio;
                this.preloadAudio = oldAudio;
                this._bindActiveAudio();

                this.audio.volume = this.muted ? 0 : this.volume;
                this.audio.playbackRate = Number(this.playbackRate) || 1;

                equalizer.resetGains();
                await equalizer.resume();

                await this.audio.play();
                if (token !== this.playToken) { this.audio.pause(); return; }

                this.isPlaying = true;
                this.isLoading = false;
                this.setStatus('');
                this.errorRetry = 0;
                if (shouldExtendHistory) this.history = [...this.history, song].slice(-50);
                this._saveHistory(song);
                setCurrentSong(song).catch(() => {});
                this.saveState();
                this.updatePlayerUI();
                this.updateMediaSession();
                this.loadLyrics(song);

                // Prepare next track immediately into the newly available preload deck
                this.prepareNext();
                this.scheduleCrossfade();

                if (this.autoContinue && (this.currentSong || this.continueSeed) && this.playOrder.length - (this.orderPos + 1) <= 3) {
                    this._scheduleContinue(this.currentSong || this.continueSeed);
                }
                return;
            } catch (e) {
                console.debug('Instant deck swap fallback to resolve:', e);
            }
        }

        if (this.audio) this.audio.pause();
        this.isLoading = true;
        this.isPlaying = false;
        this.errorRetry = 0;
        this.updatePlayerUI();
        this.setStatus('Resolving audio…');
        // Fire-and-forget: tell the server the new context in the background
        // instead of blocking first-byte on a roundtrip that changes nothing
        // about which URL we are about to resolve.
        apiPlaySongs(this.currentSongs, Math.max(0, this.currentIndex), {
            name: this.contextName, shuffle: this.shuffleMode, order: this.playOrder,
        }).catch(() => {});
        // Warm the next tracks NOW, in parallel with the current resolve.
        this.prepareNext();
        try {
            const result = await getStreamUrl(song.videoId);
            if (token !== this.playToken) return;
            const url = result?.success && result.data?.url;
            if (!url) throw new Error(result?.error || 'Stream could not be resolved');
            this.audio.pause();
            this.audio.src = url;
            this.audio.volume = this.muted ? 0 : this.volume;
            this.audio.playbackRate = Number(this.playbackRate) || 1;
            this.audio.load();
            if (resumeAt > 0) {
                await new Promise((resolve, reject) => {
                    const done = () => { cleanup(); resolve(); };
                    const fail = () => { cleanup(); reject(new Error('Audio metadata unavailable')); };
                    const cleanup = () => { this.audio.removeEventListener('loadedmetadata', done); this.audio.removeEventListener('error', fail); };
                    this.audio.addEventListener('loadedmetadata', done, { once: true });
                    this.audio.addEventListener('error', fail, { once: true });
                });
                if (token !== this.playToken) return;
                if (Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.min(resumeAt, Math.max(0, this.audio.duration - 1));
            }
            await this.audio.play();
            if (token !== this.playToken) { this.audio.pause(); return; }
            this.isPlaying = true;
            this.isLoading = false;
            this.setStatus('');
            this.errorRetry = 0;
            if (shouldExtendHistory) this.history = [...this.history, song].slice(-50);
            this._saveHistory(song);
            setCurrentSong(song).catch(() => {});
            this.saveState();
            this.updatePlayerUI();
            this.updateMediaSession();
            this.loadLyrics(song);
            // prepareNext() already ran in parallel before the resolve; run it
            // again now that orderPos is settled so the preload target is exact.
            this.prepareNext();
            this.scheduleCrossfade();
            // Top up the auto-continue lane after the stream actually starts, so
            // the orderPos is settled and the remaining count is accurate.
            if (this.autoContinue && (this.currentSong || this.continueSeed) && this.playOrder.length - (this.orderPos + 1) <= 3) {
                this._scheduleContinue(this.currentSong || this.continueSeed);
            }
        } catch (e) {
            if (token !== this.playToken) return;
            this.isLoading = false;
            this.isPlaying = false;
            if (e.name === 'NotAllowedError') {
                console.info('Auto-resume paused waiting for user gesture.');
                this.setStatus('▶ SESSION RESTORED · PRESS SPACE TO RESUME');
                this.updatePlayerUI();
                const unlock = async (evt) => {
                    window._pulseterm_interacted = true;
                    cleanupUnlock();
                    // If user pressed Space or clicked an interactive button, let the regular handler deal with it
                    if (evt?.type === 'keydown' && (evt.code === 'Space' || evt.key === ' ' || evt.key === 'Spacebar')) {
                        return;
                    }
                    if (evt?.target && evt.target.closest && evt.target.closest('#play-btn, .play-btn, input, textarea, button, a, .list-item')) {
                        return;
                    }
                    // For background clicks, resume session
                    if (this.currentSong?.videoId === song.videoId && !this.isPlaying) {
                        await this.resume();
                    }
                };
                const cleanupUnlock = () => {
                    ['pointerdown', 'keydown', 'touchstart'].forEach(type => {
                        window.removeEventListener(type, unlock, true);
                    });
                };
                ['pointerdown', 'keydown', 'touchstart'].forEach(type => {
                    window.addEventListener(type, unlock, { capture: true, passive: true });
                });
                return;
            }
            console.error('Playback failed:', e);
            this.setStatus('Could not play this track. ' + (e?.message || 'Try again.'));
            this.updatePlayerUI();
        }
    },

    async hydrate() {
        try {
            const res = await getPlayerStatus();
            const s = res?.success && res.data;
            if (!s || this.currentSongs.length) return;
            const reasons = (s.recReasons || s.rec_reasons || {});
            const auto = new Set(s.autoIds || s.auto_ids || []);
            this.currentSongs = this._norm(s.context || []).map(song => ({
                ...song,
                autoAdded: auto.has(song.videoId),
                reason: (typeof reasons === 'object' && reasons !== null ? reasons[song.videoId] : '') || song.reason || '',
            }));
            this.autoIds = auto;
            this.recReasons = (typeof reasons === 'object' && reasons !== null) ? { ...reasons } : {};
            if (typeof s.autoContinue === 'boolean') this.autoContinue = s.autoContinue;
            this.contextName = s.contextName || '';
            this.currentIndex = Number.isInteger(s.queueIndex) ? s.queueIndex : -1;
            if (this.currentIndex < -1 || this.currentIndex >= this.currentSongs.length) this.currentIndex = -1;
            const cleanOrder = Array.isArray(s.order) ? s.order.filter(i => Number.isInteger(i) && i >= 0 && i < this.currentSongs.length) : [];
            this.playOrder = cleanOrder.length ? cleanOrder : this.currentSongs.map((_, i) => i);
            this.orderPos = Number.isInteger(s.orderPos) ? Math.max(0, Math.min(s.orderPos, Math.max(0, this.playOrder.length - 1))) : Math.max(0, this.playOrder.indexOf(this.currentIndex));
            if (this.playOrder.length && !Number.isInteger(this.playOrder[this.orderPos])) this.orderPos = 0;
            this.userQueue = this._norm(s.userQueue || []);
            this.history = this._norm(s.history || []);
            this.savedPosition = Math.max(0, Number(s.position) || 0);
            this.shuffleMode = !!s.shuffle;
            this.repeatMode = s.repeat || 'none';
            this.setVolume(Number.isFinite(s.volume) ? s.volume : this.volume, false);
            this.currentSong = s.currentSong ? this._norm([s.currentSong])[0] : null;
            if (this.currentSong) {
                this._adoptContinueSeed(this.currentSong);
                this.updatePlayerUI();
                this.setStatus('Ready to resume');
            }
            this.updateContinueUI();
            this.updateQueueUI();
        } catch (e) { console.debug('No server playback state', e); }
    },

    savePlaybackSession() {
        if (!this.currentSong?.videoId || !this.isPlaying) return;
        try {
            const session = {
                videoId: this.currentSong.videoId,
                title: this.currentSong.title || '',
                artist: this.currentSong.artist || '',
                thumbnail: this.currentSong.thumbnail || '',
                duration: Number(this.currentSong.duration) || 0,
                position: Number(this.audio?.currentTime) || Number(this.savedPosition) || 0,
                isPlaying: true,
                savedAt: Date.now()
            };
            sessionStorage.setItem('pulseterm_resume_session', JSON.stringify(session));
        } catch {}
    },

    clearPlaybackSession() {
        try {
            sessionStorage.removeItem('pulseterm_resume_session');
        } catch {}
    },

    async checkAutoResume() {
        try {
            const raw = sessionStorage.getItem('pulseterm_resume_session');
            if (!raw) return;
            sessionStorage.removeItem('pulseterm_resume_session');
            const session = JSON.parse(raw);
            if (!session || !session.videoId || !session.isPlaying) return;

            const now = Date.now();
            const elapsed = (now - Number(session.savedAt || now)) / 1000;
            // Only auto-resume if page reloaded within the last 60 seconds
            if (elapsed < 0 || elapsed > 60) return;

            let songToPlay = (this.currentSong && this.currentSong.videoId === session.videoId) ? this.currentSong : null;
            if (!songToPlay) {
                songToPlay = this.currentSongs.find(s => s.videoId === session.videoId);
            }
            if (!songToPlay) {
                songToPlay = {
                    videoId: session.videoId,
                    title: session.title || 'Audio Stream',
                    artist: session.artist || '',
                    thumbnail: session.thumbnail || '',
                    duration: session.duration || 0
                };
            }

            // Compensate for reload duration (e.g. 0.5s - 3s)
            const resumePos = Math.max(0, Number(session.position || 0) + (elapsed < 6 ? elapsed : 0));
            this.savedPosition = resumePos;
            this.currentSong = songToPlay;
            this.updatePlayerUI();
            this.setStatus('Restoring audio session…');

            await this._start(songToPlay, { position: resumePos, fromHistory: true, resume: true });
            this.showToast('Audio session restored');
        } catch (e) {
            console.debug('Auto-resume failed:', e);
        }
    },

    applyRemoteStatus(status) {
        if (!status || typeof status !== 'object') return;
        // Ignore remote status updates for 2 seconds after explicit local user interaction
        if (Date.now() - (this.lastUserActionTime || 0) < 2000) return;
        if (typeof status.isPlaying === 'boolean' && status.isPlaying !== this.isPlaying) {
            this.isPlaying = status.isPlaying;
            if (this.isPlaying && this.audio?.paused && this.currentSong) {
                this.audio.play().catch(() => {});
            } else if (!this.isPlaying && this.audio && !this.audio.paused) {
                this.audio.pause();
            }
            this.updatePlayerUI();
        }
        if (status.currentSong && status.currentSong.videoId && status.currentSong.videoId !== this.currentSong?.videoId) {
            this._start(status.currentSong, { position: status.position || 0, fromHistory: true }).catch(() => {});
        }
        this._applyServerQueue(status);
        this.updateQueueUI();
    },

    async resume() {
        await equalizer.resume();
        equalizer.resetGains();
        if (this.currentSong && this.audio?.src && this.audio.paused) {
            try {
                await this.audio.play();
                this.isPlaying = true;
                this.setStatus('');
                this.updatePlayerUI();
                return;
            } catch (e) {
                console.debug('Direct audio.play() in resume failed:', e);
            }
        }
        if (this.currentSong && this.audio?.src) {
            try {
                await this.audio.play();
                this.isPlaying = true;
                this.setStatus('');
                this.updatePlayerUI();
            } catch {
                await this._start(this.currentSong, { position: this.audio.currentTime || 0 });
            }
        } else if (this.currentSong) {
            const saved = Number(this.savedPosition) || 0;
            if (saved > 0) await this._start(this.currentSong, { position: saved, fromHistory: true });
            else await this._start(this.currentSong, { fromHistory: true });
        }
    },

    async toggle() {
        this.lastUserActionTime = Date.now();
        await equalizer.resume();
        equalizer.resetGains();

        if (!this.currentSong) {
            if (this.currentSongs && this.currentSongs.length) {
                await this.play(this.currentSongs, 0);
            } else if (this.history && this.history.length) {
                await this.play([this.history[0]], 0);
            }
            return;
        }

        const isCurrentlyPlaying = (this.audio && !this.audio.paused) || this.isPlaying;
        if (isCurrentlyPlaying) {
            if (this.audio) {
                this.audio.pause();
            }
            this.isPlaying = false;
            apiPause().catch(() => {});
        } else {
            await this.resume();
            if (this.audio && !this.audio.paused) {
                this.isPlaying = true;
            }
            fetch('/api/player/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPlaying: true }) }).catch(() => {});
        }
        setCurrentSong(this.currentSong).catch(() => {});
        this.saveState();
        this.updatePlayerUI();
    },

    async reportToggle() {
        try {
            await fetch('/api/player/current', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ song: this.currentSong }) });
        } catch {}
    },

    async next(manual = true) {
        if (this.repeatMode === 'one' && !manual && this.audio) {
            this.audio.currentTime = 0;
            await this.audio.play().catch(() => {});
            return;
        }
        let song = null;
        if (this.userQueue.length) {
            song = this.userQueue.shift();
            this.currentKind = 'user';
            this.updateQueueUI();
            this.saveState();
            this.currentSong = song;
            if (manual) this.history = [...this.history, song].slice(-50);
            await this._start(song);
            return;
        }
        if (!this.playOrder.length) return;
        let pos = this.orderPos + 1;
        if (pos >= this.playOrder.length) {
            if (this.autoContinue && this.continueSeed && !manual) {
                await this._extendContinuing(this.continueSeed);
                if (this.orderPos + 1 < this.playOrder.length) pos = this.orderPos + 1;
            }
            if (pos >= this.playOrder.length) {
                if (this.repeatMode !== 'all') { this.isPlaying = false; this.updatePlayerUI(); return; }
                pos = 0;
            }
        }
        this.orderPos = pos;
        this.currentIndex = this.playOrder[pos];
        song = (Number.isInteger(this.currentIndex) && this.currentIndex >= 0 && this.currentIndex < this.currentSongs.length) ? this.currentSongs[this.currentIndex] : null;
        if (!song) { this.isPlaying = false; this.updatePlayerUI(); return; }
        this.currentKind = 'context';
        setQueueOrder(this.playOrder, this.orderPos).catch(() => {});
        this.currentSong = song;
        if (song?.autoAdded) this.autoIds.delete(song.videoId);
        // Evolve the seed with the playlist flow (Spotify Radio model)
        if (song) this._adoptContinueSeed(song);
        await this._start(song);
        if (this.autoContinue && this.playOrder.length - (this.orderPos + 1) <= 3) {
            this._scheduleContinue(song || this.continueSeed);
        }
    },

    async prev() {
        if (this.audio && this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
        if (this.history.length > 1) {
            const currentId = this.currentSong?.videoId;
            const idx = this.history.map(s => s.videoId).lastIndexOf(currentId);
            const target = idx > 0 ? this.history[idx - 1] : this.history[this.history.length - 2];
            if (target) {
                this.history = this.history.slice(0, Math.max(1, idx));
                const contextIdx = this.currentSongs.findIndex(s => s.videoId === target.videoId);
                if (contextIdx >= 0) {
                    this.currentIndex = contextIdx;
                    this.orderPos = this.playOrder.indexOf(contextIdx);
                    if (this.orderPos < 0) this.orderPos = 0;
                    this.currentKind = 'context';
                    this.currentSong = target;
                    await this._start(target, { fromHistory: true });
                } else {
                    this.currentKind = 'user';
                    this.currentSong = target;
                    await this._start(target, { fromHistory: true });
                }
                return;
            }
        }
        if (this.currentKind === 'context' && this.orderPos > 0) {
            this.orderPos--;
            this.currentIndex = this.playOrder[this.orderPos];
            if (!Number.isInteger(this.currentIndex) || this.currentIndex < 0 || this.currentIndex >= this.currentSongs.length) { this.audio.currentTime = 0; return; }
            await this.play(this.currentSongs, this.currentIndex, { contextName: this.contextName });
        } else if (this.audio) this.audio.currentTime = 0;
    },

    onEnded() { this.next(false); },

    async onError() {
        if (!this.currentSong || this.isLoading) return;
        const position = this.audio?.currentTime || 0;
        if (this.errorRetry < 2) {
            this.errorRetry++;
            this.setStatus('Refreshing stream…');
            await this._start(this.currentSong, { position, refresh: true });
            return;
        }
        this.isPlaying = false;
        this.isLoading = false;
        this.setStatus('Stream failed. ');
        this.showToast('Stream failed', 'retry', () => { this.errorRetry = 0; this._start(this.currentSong); });
        this.updatePlayerUI();
    },

    getNextTrack() {
        if (this.repeatMode === 'one' && this.currentSong) {
            return this.currentSong;
        }
        if (this.userQueue.length) {
            return this.userQueue[0];
        }
        if (this.playOrder.length) {
            const nextPos = this.orderPos + 1;
            if (nextPos < this.playOrder.length) {
                const idx = this.playOrder[nextPos];
                return (Number.isInteger(idx) && idx >= 0 && idx < this.currentSongs.length) ? this.currentSongs[idx] : null;
            } else if (this.repeatMode === 'all' && this.playOrder.length > 0) {
                const idx = this.playOrder[0];
                return (Number.isInteger(idx) && idx >= 0 && idx < this.currentSongs.length) ? this.currentSongs[idx] : null;
            }
        }
        return null;
    },

    async prepareNext() {
        const next = this.getNextTrack();
        let ids = [];
        if (this.userQueue.length) {
            ids = this.userQueue.slice(0, 3).map(s => s.videoId);
        }
        if (this.playOrder.length && this.orderPos + 1 < this.playOrder.length) {
            const upcomingContextIds = this.playOrder.slice(this.orderPos + 1, this.orderPos + 4)
                .map(i => (Number.isInteger(i) && i >= 0 && i < this.currentSongs.length) ? this.currentSongs[i]?.videoId : null)
                .filter(Boolean);
            ids = [...ids, ...upcomingContextIds].slice(0, 4);
        }
        if (next?.videoId && !ids.includes(next.videoId)) {
            ids.unshift(next.videoId);
        }
        if (!ids.length) return;

        // Warm up backend URL cache in parallel
        prepareStreams(ids).catch(() => {});

        // Preload immediate next track into preloadAudio element
        if (next?.videoId && this.preloadAudio) {
            try {
                const res = await getStreamUrl(next.videoId);
                if (res?.success && res.data?.url) {
                    if (this.preloadAudio.dataset.videoId !== next.videoId) {
                        this.preloadAudio.dataset.videoId = next.videoId;
                        this.preloadAudio.src = res.data.url;
                        this.preloadAudio.preload = 'auto';
                        this.preloadAudio.load();
                    }
                }
            } catch {}
        }
    },

    async scheduleCrossfade() {
        if (!this.crossfade || !this.audio || !Number.isFinite(this.audio.duration) || !this.isPlaying) return;
        const remain = this.audio.duration - this.audio.currentTime;
        if (remain > this.crossfade + 1) {
            clearTimeout(this.crossfadeTimer);
            this.crossfadeTimer = setTimeout(() => this.scheduleCrossfade(), Math.max(500, (remain - this.crossfade) * 1000));
            return;
        }
        if (this.crossfadeStarted || this.audio.duration - this.audio.currentTime > this.crossfade + .5) return;
        this.crossfadeStarted = true;
        const nextPos = this.orderPos + 1;
        const nextIdx = this.playOrder[nextPos];
        const next = this.userQueue[0] || (nextPos < this.playOrder.length && Number.isInteger(nextIdx) && nextIdx >= 0 && nextIdx < this.currentSongs.length ? this.currentSongs[nextIdx] : null);
        if (!next) { this.crossfadeStarted = false; return; }
        let targetUrl = this.preloadAudio?.dataset.videoId === next.videoId ? (this.preloadAudio.currentSrc || this.preloadAudio.src) : '';
        if (!targetUrl) {
            const warmed = await getStreamUrl(next.videoId);
            targetUrl = warmed?.success ? warmed.data?.url : '';
        }
        if (!targetUrl || !this.audioContextClass()) { this.crossfadeStarted = false; return; }
        try {
            equalizer.attachMediaElements(this.audio, this.preloadAudio);
            const outgoingGain = equalizer.getGainForElement(this.audio);
            const incomingGain = equalizer.getGainForElement(this.preloadAudio);
            if (!outgoingGain || !incomingGain) { this.crossfadeStarted = false; return; }
            this.activeCrossfadeGain = incomingGain;
            if (this.preloadAudio.src !== targetUrl) this.preloadAudio.src = targetUrl;
            const ctx = equalizer.getAudioContext();
            const now = ctx.currentTime;
            outgoingGain.gain.setValueAtTime(1, now);
            incomingGain.gain.setValueAtTime(0, now);
            await this.preloadAudio.play();
            const start = ctx.currentTime;
            outgoingGain.gain.linearRampToValueAtTime(0, start + this.crossfade);
            incomingGain.gain.linearRampToValueAtTime(1, start + this.crossfade);
            setTimeout(() => {
                if (this.preloadAudio.paused) return;
                const old = this.audio;
                this.audio = this.preloadAudio;
                this.preloadAudio = old;
                this._bindActiveAudio();
                if (this.userQueue.length) {
                    this.currentSong = this.userQueue.shift();
                    this.currentKind = 'user';
                } else if (this.orderPos + 1 < this.playOrder.length) {
                    this.orderPos++;
                    this.currentIndex = this.playOrder[this.orderPos];
                    this.currentSong = (Number.isInteger(this.currentIndex) && this.currentIndex >= 0 && this.currentIndex < this.currentSongs.length) ? this.currentSongs[this.currentIndex] : null;
                    this.currentKind = 'context';
                } else {
                    this.crossfadeStarted = false;
                    this.isPlaying = false;
                    this.updatePlayerUI();
                    return;
                }
                if (this.currentSong) {
                    if (!this.history.length || this.history[this.history.length - 1].videoId !== this.currentSong.videoId) this.history = [...this.history, this.currentSong].slice(-50);
                    setCurrentSong(this.currentSong).catch(() => {});
                    this._saveHistory(this.currentSong);
                }
                this.preloadAudio.pause(); this.preloadAudio.removeAttribute('src'); delete this.preloadAudio.dataset.videoId; this.preloadAudio.load();
                equalizer.resetGains();
                this.crossfadeStarted = false;
                this.isPlaying = true;
                this.updatePlayerUI(); this.saveState(); this.loadLyrics(this.currentSong); this.prepareNext();
            }, this.crossfade * 1000);
        } catch (e) {
            console.debug('Crossfade unavailable; continuing without it', e);
            this.crossfadeStarted = false;
        }
    },

    audioContextClass() { return window.AudioContext || window.webkitAudioContext || null; },

    setSleepTimer(minutes) {
        clearTimeout(this.sleepTimer); clearInterval(this.sleepFadeTimer);
        this.sleepTimer = null; this.sleepFadeTimer = null;
        const mins = Number(minutes) || 0;
        if (!mins) { this.showToast('Sleep timer off'); return; }
        this.sleepTimer = setTimeout(() => {
            let step = 0;
            const initial = this.audio?.volume ?? this.volume;
            this.sleepFadeTimer = setInterval(() => {
                step++;
                if (!this.audio || step >= 10) {
                    clearInterval(this.sleepFadeTimer); this.audio?.pause(); this.isPlaying = false; this.updatePlayerUI(); this.showToast('Sleep timer ended'); return;
                }
                this.audio.volume = initial * (1 - step / 10);
            }, 500);
        }, mins * 60 * 1000);
        this.showToast('Sleep timer · ' + mins + ' minutes');
    },

    onTimeUpdate() {
        if (!this.audio) return;
        const duration = this.audio.duration;
        const current = this.audio.currentTime;
        if (Number.isFinite(duration) && duration > 0) {
            const fill = document.getElementById('progress-fill');
            if (fill) fill.style.width = ((current / duration) * 100) + '%';
            const bar = document.getElementById('progress-bar');
            if (bar) bar.setAttribute('aria-valuenow', String(Math.round(current / duration * 100)));
            const c = document.getElementById('current-time');
            if (c) c.textContent = formatTime(current);
            const t = document.getElementById('total-time');
            if (t) t.textContent = formatTime(duration);
            this.updateMediaPosition();
            this.updateActiveLyric(current * 1000);
        }
        this.savedPosition = current;
        if (this.isPlaying && this.currentSong) {
            const now = Date.now();
            if (!this._lastSessionSave || now - this._lastSessionSave > 600) {
                this._lastSessionSave = now;
                this.savePlaybackSession();
            }
        }
        if (!this.positionSaveTimer) {
            this.positionSaveTimer = setTimeout(() => {
                this.positionSaveTimer = null;
                this.saveState();
                fetch('/api/player/position', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: Math.floor(this.audio?.currentTime || 0) }) }).catch(() => {});
            }, 5000);
        }
    },

    onBuffered() {
        const el = document.getElementById('progress-buffered');
        if (!el || !this.audio?.duration || !this.audio.buffered.length) return;
        const end = this.audio.buffered.end(this.audio.buffered.length - 1);
        el.style.width = Math.min(100, end / this.audio.duration * 100) + '%';
    },

    onMetaLoaded() {
        const t = document.getElementById('total-time');
        if (t && this.audio?.duration) t.textContent = formatTime(this.audio.duration);
    },

    seekTo(e) {
        if (!this.audio?.duration) return;
        const bar = document.getElementById('progress-bar');
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.audio.currentTime = ratio * this.audio.duration;
        bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
        this.savedPosition = this.audio.currentTime;
        clearTimeout(this.seekCommitTimer);
        this.seekCommitTimer = setTimeout(() => {
            fetch('/api/player/position', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: Math.floor(this.audio.currentTime) }) }).catch(() => {});
        }, 250);
    },

    setVolume(vol, persist = true) {
        vol = Math.max(0, Math.min(1, Number(vol) || 0));
        this.volume = vol;
        if (vol > 0) { this.lastVolume = vol; this.muted = false; }
        if (this.audio) this.audio.volume = this.muted ? 0 : vol;
        const slider = document.getElementById('volume-slider');
        if (slider) slider.value = vol * 100;
        const slider2 = document.getElementById('settings-volume');
        if (slider2) slider2.value = vol * 100;
        const readout = document.getElementById('vol-readout');
        if (readout) readout.textContent = Math.round(vol * 100) + '%';
        const shell = document.getElementById('sidebar');
        if (shell) shell.dataset.volume = vol === 0 ? 'off' : vol > .5 ? 'high' : 'low';
        if (persist) {
            clearTimeout(this.volumeCommitTimer);
            this.volumeCommitTimer = setTimeout(() => {
                apiSetVolume(this.volume).catch(() => {});
                this.saveState();
            }, 400);
        }
        this.updateMediaSession();
    },

    toggleMute() {
        this.muted = !this.muted;
        if (!this.muted && this.volume === 0) this.volume = this.lastVolume || .8;
        if (this.audio) this.audio.volume = this.muted ? 0 : this.volume;
        const slider = document.getElementById('volume-slider');
        if (slider) slider.value = this.muted ? 0 : this.volume * 100;
        clearTimeout(this.volumeCommitTimer);
        this.volumeCommitTimer = setTimeout(() => {
            apiSetVolume(this.volume, this.muted).catch(() => {});
            this.saveState();
        }, 200);
    },

    async setShuffle(enabled) {
        const on = !!enabled;
        if (on === this.shuffleMode) return;
        this.shuffleMode = on;
        const current = this.currentIndex;
        const rest = this.currentSongs.map((_, i) => i).filter(i => i !== current);
        if (on) {
            for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
            this.playOrder = current >= 0 ? [current, ...rest] : rest;
            this.orderPos = current >= 0 ? 0 : -1;
        } else {
            this.playOrder = this.currentSongs.map((_, i) => i);
            this.orderPos = current >= 0 ? this.playOrder.indexOf(current) : -1;
            if (this.orderPos < 0) this.orderPos = 0;
        }
        // Preserve tracks already placed in the user queue; only the context order changes.
        setQueueOrder(this.playOrder, this.orderPos).catch(() => {});
        apiSetShuffle(on).catch(() => {});
        this.saveState(); this.updatePlayerUI(); this.updateQueueUI();
        this.prepareNext();
        this.showToast(on ? 'Shuffle on' : 'Shuffle off');
    },

    async setRepeat(mode) {
        this.repeatMode = ['none', 'all', 'one'].includes(mode) ? mode : 'none';
        apiSetRepeat(this.repeatMode).catch(() => {});
        this.saveState(); this.updatePlayerUI();
        this.prepareNext();
    },

    setPlaybackSpeed(speed) {
        const rate = Math.max(.5, Math.min(2, Number(speed) || 1));
        this.playbackRate = rate;
        if (this.audio) this.audio.playbackRate = rate;
        if (this.preloadAudio) this.preloadAudio.playbackRate = rate;
        this.saveState(); this.updateMediaPosition();
    },

    async loadLyrics(song) {
        this.lyrics = [];
        this.activeLyric = -1;
        const box = document.getElementById('lyrics-lines');
        if (box) box.innerHTML = '<p class="lyrics-empty">Looking for lyrics…</p>';
        if (!song?.videoId) return;
        try {
            const res = await getLyrics(song.videoId, true);
            if (this.currentSong?.videoId !== song.videoId) return;
            this.lyrics = res?.success ? (res.data?.synced || []) : [];
            if (!this.lyrics.length && res?.data?.lyrics) this.plainLyrics = res.data.lyrics.split('\n');
            else this.plainLyrics = [];
            this.renderLyrics();
        } catch { if (box) box.innerHTML = '<p class="lyrics-empty">Lyrics are unavailable for this track.</p>'; }
    },

    renderLyrics() {
        const box = document.getElementById('lyrics-lines');
        if (!box) return;
        if (!this.lyrics.length && this.plainLyrics?.length) {
            box.innerHTML = this.plainLyrics.map(() => '<p class="lyric-line plain-lyric"></p>').join('');
            box.querySelectorAll('.plain-lyric').forEach((el, i) => { el.textContent = this.plainLyrics[i] || ''; });
            return;
        }
        if (!this.lyrics.length) { box.innerHTML = '<p class="lyrics-empty">Lyrics are not available for this track.</p>'; return; }
        box.innerHTML = this.lyrics.map((l, i) => '<p class="lyric-line" data-lyric="' + i + '"></p>').join('');
        box.querySelectorAll('.lyric-line').forEach((el, i) => { el.textContent = this.lyrics[i].text || ''; });
        this.updateActiveLyric(this.audio?.currentTime * 1000 || 0);
    },

    updateActiveLyric(ms) {
        if (!this.lyrics.length) return;
        let found = -1;
        for (let i = 0; i < this.lyrics.length; i++) {
            const l = this.lyrics[i];
            if (ms >= (Number(l.start) || 0) && ms < (Number(l.end) || (Number(l.start) || 0) + 10000)) found = i;
        }
        if (found < 0 || found === this.activeLyric) return;
        this.activeLyric = found;
        const box = document.getElementById('lyrics-lines');
        if (!box) return;
        box.querySelectorAll('.lyric-line').forEach((el, i) => el.classList.toggle('active', i === found));
        box.querySelector('.lyric-line.active')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },

    async refreshLiked() {
        try { const r = await getLikedIds(); if (r?.success) this.likedIds = new Set(r.data || []); } catch {}
        this.updateLikeButton();
    },

    async toggleLike() {
        if (!this.currentSong) return;
        const s = this.currentSong;
        const r = await toggleLiked(s.videoId, { title: s.title, artist: s.artist, album: s.album, thumbnail: s.thumbnail, duration: s.duration });
        if (!r?.success) { this.showToast('Could not update liked songs'); return; }
        if (r.data.liked) this.likedIds.add(s.videoId); else this.likedIds.delete(s.videoId);
        this.updateLikeButton();
        this.showToast(r.data.liked ? 'Saved to liked songs' : 'Removed from liked songs', 'undo', () => this.toggleLike());
    },

    updateLikeButton() {
        const b = document.getElementById('like-btn');
        if (!b) return;
        const liked = !!this.currentSong && this.likedIds.has(this.currentSong.videoId);
        b.classList.toggle('active', liked);
        b.setAttribute('aria-label', liked ? 'Remove from liked songs' : 'Add to liked songs');
    },

    async refreshOffline() {
        try { const r = await getOfflineTracks(); if (r?.success) this.offlineIds = new Set(r.data || []); } catch {}
    },

    async saveOffline(song = this.currentSong) {
        if (!song?.videoId) return;
        this.showToast('Downloading for offline…');
        const r = await downloadOffline(song.videoId);
        if (r?.success) { this.offlineIds.add(song.videoId); this.showToast('Saved for offline'); }
        else this.showToast(r?.error || 'Download failed');
    },

    async removeOfflineTrack(song = this.currentSong) {
        if (!song?.videoId) return;
        await removeOffline(song.videoId);
        this.offlineIds.delete(song.videoId);
        this.showToast('Removed offline copy');
    },

    async queueAction(song, action = 'add') {
        if (!song?.videoId) return;
        const was = this.userQueue.slice();
        const r = await addQueue(song, action);
        if (!r?.success) { this.showToast('Could not update queue'); return; }
        if (action === 'next') this.userQueue.unshift(song); else this.userQueue.push(song);
        this.updateQueueUI(); this.saveState();
        this.showToast(action === 'next' ? 'Playing next' : 'Added to queue', 'undo', async () => {
            this.userQueue = was; this.saveState(); await deleteQueue('user', action === 'next' ? 0 : this.userQueue.length); this.updateQueueUI();
        });
        this.prepareNext();
    },

    async removeQueueItem(kind, index) {
        if (kind === 'user') {
            try { index = Number(index) || 0; } catch { index = 0; }
            if (!Number.isInteger(index) || index < 0 || index >= this.userQueue.length) return;
            const removed = this.userQueue.splice(index, 1)[0];
            await deleteQueue(kind, index);
            this.updateQueueUI(); this.saveState();
            if (removed) this.showToast('Removed from queue', 'undo', () => this.queueAction(removed, 'add'));
        } else {
            try { index = Number(index) || 0; } catch { index = -1; }
            const orderPosition = index;
            if (Number.isInteger(orderPosition) && orderPosition > this.orderPos && orderPosition < this.playOrder.length) {
                const removedContextIndex = this.playOrder.splice(orderPosition, 1)[0];
                this.orderPos = this.playOrder.indexOf(this.currentIndex);
                if (this.orderPos < 0) this.orderPos = 0;
                await removeContextTrack(orderPosition).catch(() => {});
                await setQueueOrder(this.playOrder, this.orderPos);
                this.showToast('Removed from queue', 'undo', () => {
                    this.playOrder.splice(Math.min(orderPosition, this.playOrder.length), 0, removedContextIndex);
                    this.orderPos = this.playOrder.indexOf(this.currentIndex);
                    if (this.orderPos < 0) this.orderPos = 0;
                    setQueueOrder(this.playOrder, this.orderPos); this.updateQueueUI();
                });
                this.updateQueueUI(); this.saveState();
                this.prepareNext();
            }
        }
    },

    async reorder(kind, from, to) {
        try { from = Number(from) || 0; to = Number(to) || 0; } catch { from = 0; to = 0; }
        if (!Number.isInteger(from) || !Number.isInteger(to)) return;
        if (kind === 'user') {
            if (from < 0 || from >= this.userQueue.length) return;
            to = Math.max(0, Math.min(to, this.userQueue.length - 1));
            const [s] = this.userQueue.splice(from, 1);
            this.userQueue.splice(to, 0, s);
            await reorderQueue('user', from, to).catch(() => {});
        } else {
            if (from < 0 || from >= this.playOrder.length) return;
            to = Math.max(0, Math.min(to, this.playOrder.length - 1));
            const [idx] = this.playOrder.splice(from, 1);
            this.playOrder.splice(to, 0, idx);
            this.orderPos = this.playOrder.indexOf(this.currentIndex);
            if (this.orderPos < 0) this.orderPos = 0;
            setQueueOrder(this.playOrder, this.orderPos).catch(() => {});
        }
        this.updateQueueUI(); this.saveState();
        this.prepareNext();
    },

    async clearQueue() {
        const old = this.userQueue.slice();
        const oldOrder = this.playOrder.slice();
        const oldPos = this.orderPos;
        this.userQueue = [];
        await deleteQueue('user', -1);
        this.updateQueueUI(); this.saveState();
        this.showToast('Queue cleared', 'undo', async () => {
            this.userQueue = old; this.playOrder = oldOrder; this.orderPos = oldPos; this.saveState();
            for (const song of old) await addQueue(song, 'add');
            this.updateQueueUI();
        });
    },

    async playQueueRow(row) {
        if (!row || !row.song) return;
        if (row.kind === 'user') {
            const idx = Number(row.index);
            const song = this.userQueue[idx] || row.song;
            this.userQueue.splice(0, idx + 1);
            this.currentKind = 'user';
            this.currentSong = song;
            this.history = [...this.history, song].slice(-50);
            this.updateQueueUI();
            this.saveState();
            await this._start(song);
        } else if (row.kind === 'context') {
            const pos = Number(row.index);
            if (pos >= 0 && pos < this.playOrder.length) {
                this.orderPos = pos;
                this.currentIndex = this.playOrder[pos];
                const song = (Number.isInteger(this.currentIndex) && this.currentIndex >= 0 && this.currentIndex < this.currentSongs.length)
                    ? this.currentSongs[this.currentIndex]
                    : row.song;
                this.currentKind = 'context';
                setQueueOrder(this.playOrder, this.orderPos).catch(() => {});
                this.currentSong = song;
                this.history = [...this.history, song].slice(-50);
                if (song?.autoAdded) this.autoIds.delete(song.videoId);
                if (song) this._adoptContinueSeed(song);
                this.updateQueueUI();
                this.saveState();
                await this._start(song);
                if (this.autoContinue && this.playOrder.length - (this.orderPos + 1) <= 3) {
                    this._scheduleContinue(song || this.continueSeed);
                }
            }
        }
    },

    async updateQueueUI() {
        const list = document.getElementById('queue-list');
        if (!list) return;
        list.replaceChildren();
        if (this.currentSong) {
            const curLi = document.createElement('li');
            curLi.className = 'queue-item active is-now-playing';
            const grip = document.createElement('span'); grip.className = 'queue-grip'; grip.textContent = '▶';
            const no = document.createElement('span'); no.className = 'q-rank'; no.textContent = 'NOW';
            const info = document.createElement('div'); info.className = 'list-info';
            const title = document.createElement('div'); title.className = 'list-title'; title.textContent = this.currentSong.title || 'Unknown';
            const artist = document.createElement('div'); artist.className = 'q-artist'; artist.textContent = (this.currentSong.artist || '') + ' · [ACTIVE STREAM]';
            info.append(title, artist);
            const menu = document.createElement('button'); menu.className = 'q-menu icon-btn'; menu.type = 'button'; menu.textContent = '···'; menu.setAttribute('aria-label', 'Track actions');
            menu.addEventListener('click', e => { e.stopPropagation(); this.showContextMenu(this.currentSong, e.clientX, e.clientY); });
            const spacer = document.createElement('span');
            curLi.append(grip, no, info, menu, spacer);
            list.appendChild(curLi);
        }
        if (this.continueNotice && this.autoContinue) {
            const note = document.createElement('li');
            note.className = 'queue-continue-note';
            note.textContent = this.continueNotice;
            list.appendChild(note);
        }
        const contextUpcoming = this.playOrder.slice(this.orderPos + 1).map((ci, orderPos) => ({ kind: 'context', index: this.orderPos + 1 + orderPos, song: (Number.isInteger(ci) && ci >= 0 && ci < this.currentSongs.length) ? this.currentSongs[ci] : null })).filter(x => x.song);
        const rows = [
            ...this.userQueue.map((song, i) => ({ kind: 'user', index: i, song })),
            ...contextUpcoming,
        ];
        if (!rows.length) {
            const empty = document.createElement('li'); empty.className = 'queue-empty'; empty.textContent = this.currentSong ? (this.autoContinue ? 'Finding the same lane…' : 'No upcoming tracks') : 'Queue is empty'; list.appendChild(empty);
            this._renderContinueToggle(list);
            return;
        }
        rows.forEach((row, i) => {
            const li = document.createElement('li');
            li.className = 'queue-item' + (row.song?.autoAdded ? ' is-auto' : ''); li.dataset.kind = row.kind; li.dataset.index = row.index;
            li.draggable = true; li.tabIndex = 0;
            if (row.song?.autoAdded) li.title = row.song?.reason ? 'Auto-continued · ' + row.song.reason : 'Auto-continued match';
            const grip = document.createElement('span'); grip.className = 'queue-grip'; grip.textContent = '··'; grip.setAttribute('aria-hidden', 'true');
            const no = document.createElement('span'); no.className = 'q-rank'; no.textContent = String(i + 1).padStart(2, '0');
            const info = document.createElement('div'); info.className = 'list-info';
            const title = document.createElement('div'); title.className = 'list-title'; title.textContent = row.song.title;
            const artist = document.createElement('div'); artist.className = 'q-artist'; artist.textContent = row.song.artist || '';
            info.append(title, artist);
            if (row.song?.autoAdded) {
                const badge = document.createElement('span'); badge.className = 'auto-badge'; badge.textContent = 'auto · ' + (this._laneLabel({ reason: row.song.reason }) || 'same lane');
                info.appendChild(badge);
            }
            const menu = document.createElement('button'); menu.className = 'q-menu icon-btn'; menu.type = 'button'; menu.textContent = '···'; menu.setAttribute('aria-label', 'Track actions');
            menu.addEventListener('click', e => { e.stopPropagation(); this.showContextMenu(row.song, e.clientX, e.clientY); });
            const remove = document.createElement('button'); remove.className = 'q-remove icon-btn'; remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove from queue');
            remove.addEventListener('click', e => { e.stopPropagation(); this.removeQueueItem(row.kind, row.index); });
            li.append(grip, no, info, menu, remove);

            li.addEventListener('pointerenter', () => {
                if (row.song?.videoId) prepareStreams([row.song.videoId]).catch(() => {});
            }, { once: true });
            li.addEventListener('click', e => {
                if (e.target.closest('.q-menu') || e.target.closest('.q-remove') || e.target.closest('.queue-grip')) return;
                this.playQueueRow(row);
            });

            li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify({ kind: row.kind, index: row.index })); e.dataTransfer.effectAllowed = 'move'; });
            li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drop-target'); });
            li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
            li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('drop-target'); try { const from = JSON.parse(e.dataTransfer.getData('text/plain')); if (from.kind === row.kind) this.reorder(row.kind, from.index, row.index); } catch {} });
            li.addEventListener('keydown', e => { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); this.reorder(row.kind, row.index, Math.max(0, row.index - 1)); } if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); this.reorder(row.kind, row.index, row.index + 1); } });
            list.appendChild(li);
        });
        this._renderContinueToggle(list);
    },

    _renderContinueToggle(list) {
        const wrap = document.createElement('li');
        wrap.className = 'queue-continue-toggle';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-btn' + (this.autoContinue ? ' on' : '');
        btn.setAttribute('aria-pressed', String(this.autoContinue));
        btn.textContent = this.autoContinue ? 'continuing · on' : 'continuing · off';
        btn.addEventListener('click', () => this.setAutoContinue(!this.autoContinue));
        const hint = document.createElement('span');
        hint.className = 'continue-hint';
        hint.textContent = 'auto-adds the same genre or vibe';
        wrap.append(btn, hint);
        list.appendChild(wrap);
    },

    showContextMenu(song, x, y) {
        const menu = document.getElementById('context-menu');
        if (!menu || !song) return;
        menu.replaceChildren();
        const actions = [
            ['Play next', () => this.queueAction(song, 'next')],
            ['Add to queue', () => this.queueAction(song, 'add')],
            [this.offlineIds.has(song.videoId) ? 'Remove offline copy' : 'Save offline', () => this.offlineIds.has(song.videoId) ? this.removeOfflineTrack(song) : this.saveOffline(song)],
            [this.likedIds.has(song.videoId) ? 'Remove from liked' : 'Add to liked', () => this.toggleLikeFor(song)],
            ['Copy track link', () => navigator.clipboard?.writeText('https://music.youtube.com/watch?v=' + encodeURIComponent(song.videoId))],
        ];
        actions.forEach(([label, fn]) => { const b = document.createElement('button'); b.textContent = label; b.setAttribute('role', 'menuitem'); b.addEventListener('click', () => { menu.classList.add('hidden'); fn(); }); menu.appendChild(b); });
        getPlaylists().then(r => {
            if (!r?.success || !r.data?.length || menu.classList.contains('hidden')) return;
            const sep = document.createElement('div'); sep.className = 'context-divider'; menu.appendChild(sep);
            r.data.forEach(playlist => {
                const b = document.createElement('button'); b.textContent = 'Add to ' + playlist.name; b.setAttribute('role', 'menuitem');
                b.addEventListener('click', async () => {
                    menu.classList.add('hidden');
                    const result = await addToPlaylist(playlist.id, { video_id: song.videoId, title: song.title, artist: song.artist || '', thumbnail: song.thumbnail || '', duration: song.duration || 0 });
                    this.showToast(result?.success ? 'Added to ' + playlist.name : 'Could not add to playlist');
                });
                menu.appendChild(b);
            });
        }).catch(() => {});
        menu.style.left = Math.min(x, innerWidth - 230) + 'px'; menu.style.top = Math.min(y, innerHeight - 250) + 'px';
        menu.classList.remove('hidden'); menu.querySelector('button')?.focus();
    },

    async toggleLikeFor(song) {
        const r = await toggleLiked(song.videoId, { title: song.title, artist: song.artist, album: song.album, thumbnail: song.thumbnail, duration: song.duration });
        if (r?.success) { r.data.liked ? this.likedIds.add(song.videoId) : this.likedIds.delete(song.videoId); this.updateLikeButton(); this.showToast(r.data.liked ? 'Saved to liked songs' : 'Removed from liked songs'); }
    },

    showToast(message, actionLabel = '', action = null) {
        const toast = document.getElementById('toast');
        const msg = document.getElementById('toast-message');
        const btn = document.getElementById('toast-action');
        if (!toast || !msg) return;
        msg.textContent = message;
        btn.classList.toggle('hidden', !actionLabel);
        btn.textContent = actionLabel || '';
        btn.onclick = action || null;
        toast.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.add('hidden'), action ? 6000 : 3200);
    },

    async toggleNowPlaying() {
        this.nowPlayingVisible = !this.nowPlayingVisible;
        const panel = document.getElementById('now-playing');
        if (panel) panel.classList.toggle('hidden', !this.nowPlayingVisible);
        if (this.currentSong) this.loadLyrics(this.currentSong);
    },

    installMediaSession() {
        if (!('mediaSession' in navigator)) return;
        const handlers = {
            play: () => this.toggle(), pause: () => this.toggle(),
            previoustrack: () => this.prev(), nexttrack: () => this.next(),
            seekbackward: d => { this.audio.currentTime = Math.max(0, this.audio.currentTime - (d.seekOffset || 10)); },
            seekforward: d => { this.audio.currentTime = Math.min(this.audio.duration || Infinity, this.audio.currentTime + (d.seekOffset || 10)); },
            seekto: d => { if (Number.isFinite(d.seekTime)) this.audio.currentTime = d.seekTime; },
            stop: () => { this.audio.pause(); this.audio.currentTime = 0; this.isPlaying = false; this.updatePlayerUI(); },
        };
        for (const [name, fn] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(name, fn); } catch {} }
    },

    updateMediaSession() {
        if (!('mediaSession' in navigator) || !this.currentSong) return;
        const s = this.currentSong;
        try {
            navigator.mediaSession.metadata = new MediaMetadata({ title: s.title || 'Unknown', artist: s.artist || '', album: s.album || this.contextName || '', artwork: s.thumbnail ? [{ src: s.thumbnail, sizes: '512x512', type: 'image/jpeg' }] : [] });
            navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
            this.updateMediaPosition();
        } catch {}
    },

    updateMediaPosition() {
        if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !Number.isFinite(this.audio?.duration)) return;
        try { navigator.mediaSession.setPositionState({ duration: this.audio.duration, playbackRate: this.audio.playbackRate || 1, position: Math.min(this.audio.currentTime, this.audio.duration) }); } catch {}
    },

    setStatus(message) {
        const el = document.getElementById('player-status');
        if (el) { el.textContent = message || ''; el.classList.toggle('visible', !!message); }
    },

    updatePlayerUI() {
        const title = document.getElementById('player-title');
        const artist = document.getElementById('player-artist');
        const cover = document.getElementById('player-cover');
        const playBtn = document.getElementById('play-btn');
        if (this.currentSong) {
            if (title) title.textContent = this.currentSong.title || 'Unknown';
            if (artist) artist.textContent = this.currentSong.artist || '';
            if (cover) { if (this.currentSong.thumbnail) { cover.src = this.currentSong.thumbnail; cover.style.display = 'block'; } else { cover.removeAttribute('src'); cover.style.display = 'none'; } }
            if (playBtn) { playBtn.dataset.state = this.isPlaying ? 'playing' : 'paused'; playBtn.setAttribute('aria-label', this.isPlaying ? 'Pause' : 'Play'); }
            document.body.classList.toggle('playing', this.isPlaying);
            const nTitle = document.getElementById('now-title'); if (nTitle) nTitle.textContent = this.currentSong.title;
            const nArtist = document.getElementById('now-artist'); if (nArtist) nArtist.textContent = this.currentSong.artist || '';
            const nCover = document.getElementById('now-cover'); if (nCover && this.currentSong.thumbnail) nCover.src = this.currentSong.thumbnail;
        } else {
            if (title) title.textContent = 'Nothing playing';
            if (artist) artist.textContent = '';
            if (playBtn) playBtn.dataset.state = 'paused';
        }
        const badge = document.getElementById('player-state-badge');
        if (badge) badge.textContent = this.currentSong ? (this.isPlaying ? '[PLAYING]' : '[PAUSED]') : '[IDLE]';
        const repeat = document.getElementById('repeat-btn');
        if (repeat) {
            repeat.dataset.state = this.repeatMode;
            repeat.textContent = this.repeatMode === 'none' ? '[REP: OFF]' : (this.repeatMode === 'all' ? '[REP: ALL]' : '[REP: ONE]');
        }
        const shuffle = document.getElementById('shuffle-btn'); if (shuffle) shuffle.classList.toggle('on', this.shuffleMode);
        const vizTrack = document.getElementById('viz-now-playing');
        if (vizTrack) vizTrack.textContent = this.currentSong ? `>> ${this.currentSong.title} — ${this.currentSong.artist}` : '';
        document.querySelectorAll('.list-item[data-video-id]').forEach(el => {
            const active = this.currentSong && el.dataset.videoId === this.currentSong.videoId;
            el.classList.toggle('is-playing', !!active);
        });
        this.updateContinueUI();
        this.updateLikeButton();
        this.updateQueueUI();
        this.updateMediaSession();
    },

    loadState() {
        try {
            const rawState = localStorage.getItem('pulseterm_player') || localStorage.getItem('metrolist_player');
            const saved = JSON.parse(rawState || '{}');
            if (!saved || typeof saved !== 'object') return;
            this.currentSongs = this._norm(saved.songs || []);
            this.currentIndex = Number.isInteger(saved.index) ? saved.index : -1;
            if (this.currentIndex < -1 || this.currentIndex >= this.currentSongs.length) this.currentIndex = -1;
            const cleanOrder = Array.isArray(saved.order) ? saved.order.filter(i => Number.isInteger(i) && i >= 0 && i < this.currentSongs.length) : [];
            this.playOrder = cleanOrder.length ? cleanOrder : this.currentSongs.map((_, i) => i);
            this.orderPos = Number.isInteger(saved.orderPos) ? Math.max(0, Math.min(saved.orderPos, Math.max(0, this.playOrder.length - 1))) : Math.max(0, this.playOrder.indexOf(this.currentIndex));
            this.userQueue = this._norm(saved.userQueue || []);
            this.history = this._norm(saved.history || []);
            this.contextName = saved.contextName || '';
            this.currentSong = (saved.currentSong && saved.currentSong.videoId) ? this._norm([saved.currentSong])[0] : (this.currentSongs[this.currentIndex] || null);
            this.setVolume(Number.isFinite(saved.volume) ? saved.volume : .8, false);
            this.repeatMode = ['none', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'none';
            this.shuffleMode = !!saved.shuffle;
            this.muted = !!saved.muted;
            this.lastVolume = Number.isFinite(saved.lastVolume) ? saved.lastVolume : this.volume;
            this.savedPosition = Math.max(0, Number(saved.position) || 0);
            this.crossfade = Math.max(0, Math.min(12, Number(saved.crossfade) || 0));
            this.playbackRate = Math.max(.5, Math.min(2, Number(saved.playbackRate) || 1));
            this.autoContinue = saved.autoContinue !== false;
            this.autoIds = new Set(Array.isArray(saved.autoIds) ? saved.autoIds : []);
            this.recReasons = (saved.recReasons && typeof saved.recReasons === 'object') ? saved.recReasons : {};
            this.continueSeed = (saved.continueSeed && saved.continueSeed.videoId) ? saved.continueSeed : null;
        } catch {}
    },

    saveState() {
        try { localStorage.setItem('pulseterm_player', JSON.stringify({ songs: this.currentSongs, index: this.currentIndex, order: this.playOrder, orderPos: this.orderPos, userQueue: this.userQueue, history: this.history.slice(-50), currentSong: this.currentSong, contextName: this.contextName, volume: this.volume, muted: this.muted, lastVolume: this.lastVolume, repeat: this.repeatMode, shuffle: this.shuffleMode, position: this.audio?.currentTime || this.savedPosition || 0, crossfade: this.crossfade, playbackRate: this.playbackRate || 1, autoContinue: this.autoContinue, autoIds: [...this.autoIds], recReasons: this.recReasons, continueSeed: this.continueSeed })); } catch {}
    },

    async _saveHistory(song) {
        if (!song?.videoId) return;
        try { await fetch('/api/library/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_id: song.videoId, title: song.title, artist: song.artist, duration: song.duration || 0 }) }); } catch {}
    },

    bindEvents() {
        const bar = document.getElementById('progress-bar');
        if (bar) {
            bar.addEventListener('click', e => this.seekTo(e));
            bar.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); this.audio.currentTime = Math.max(0, Math.min(this.audio.duration || 0, this.audio.currentTime + (e.key === 'ArrowRight' ? 5 : -5))); } });
        }
        const vol = document.getElementById('volume-slider');
        if (vol) vol.addEventListener('input', e => this.setVolume(e.target.value / 100));
        const menu = document.getElementById('context-menu');
        document.addEventListener('click', e => { if (!menu?.contains(e.target)) menu?.classList.add('hidden'); });
        document.addEventListener('contextmenu', e => {
            const card = e.target.closest('.item-card[data-video-id]');
            const row = e.target.closest('.list-item[data-video-id]');
            const el = card || row;
            if (!el) return;
            e.preventDefault();
            this.showContextMenu({ videoId: el.dataset.videoId, title: el.dataset.title, artist: el.dataset.artist, thumbnail: el.dataset.thumbnail, duration: Number(el.dataset.duration) || 0 }, e.clientX, e.clientY);
        });
        const onUnload = () => {
            this.saveState();
            if (this.isPlaying && this.currentSong) this.savePlaybackSession();
            else this.clearPlaybackSession();
        };
        window.addEventListener('beforeunload', onUnload);
        window.addEventListener('pagehide', onUnload);
    },
};

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60), sec = Math.floor(seconds % 60);
    return m + ':' + String(sec).padStart(2, '0');
}

export function togglePlay() { return player.toggle(); }
export function nextSong() { return player.next(); }
export function prevSong() { return player.prev(); }
export function toggleQueue() {
    player.queueVisible = !player.queueVisible;
    const panel = document.getElementById('queue-panel');
    if (panel) panel.classList.toggle('hidden', !player.queueVisible);
    if (player.queueVisible) player.updateQueueUI();
}
export function removeFromQueue(index) { return player.removeQueueItem('user', index); }
export function clearQueue() { return player.clearQueue(); }
export function toggleLyrics() { return player.toggleNowPlaying(); }
export function closeNowPlaying() { player.nowPlayingVisible = false; document.getElementById('now-playing')?.classList.add('hidden'); }
export { player, formatTime };
