// PulseTerm — Minimalist TUI Audio Player Equalizer Engine
// 10-Band Parametric Audio DSP with Genre Presets & Anti-Clipping Dynamics Limiter

import { spatial } from './spatial.js?v=11';
import { getGenre } from './api.js';
import { mapGenresToPreset, mapProfileToPreset, detectPresetLocal, bandPowerDb, computeTuneCorrections, analyzeAndCompensate, classifySpectralProfile, SPECTRAL_ARCHETYPES } from './eq-core.js';

export { EQ_FREQUENCIES, EQ_LABELS, EQ_HINTS, EQ_PRESETS, SPECTRAL_ARCHETYPES } from './eq-core.js';
import { EQ_FREQUENCIES, EQ_LABELS, EQ_HINTS, EQ_PRESETS } from './eq-core.js';

export const GENRE_RULES = [
    { preset: 'metal', words: ['metal', 'metalcore', 'deathcore', 'slipknot', 'metallica', 'megadeth', 'avenged', 'soad', 'pantera', 'iron maiden', 'bmth', 'rammstein', 'architect', 'lorna shore', 'bad omens'] },
    { preset: 'rock', words: ['rock', 'grunge', 'nirvana', 'muse', 'queen', 'linkin park', 'green day', 'arctic monkeys', 'oasis', 'foo fighters', 'paramore', 'rhcp', 'strokes', 'radiohead', 'weezer'] },
    { preset: 'electronic', words: ['edm', 'house', 'techno', 'trance', 'dubstep', 'dnb', 'drum and bass', 'avicii', 'skrillex', 'garrix', 'tiesto', 'marshmello', 'alan walker', 'remix', 'club', 'dance'] },
    { preset: 'hiphop', words: ['hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'eminem', 'drake', 'kendrick', 'kanye', 'travis scott', 'post malone', '2pac', 'snoop'] },
    { preset: 'rnb', words: ['r&b', 'rnb', 'soul', 'neo soul', 'sza', 'frank ocean', 'brent faiyaz', 'giveon', 'caesar'] },
    { preset: 'jazz', words: ['jazz', 'bossa', 'swing', 'bebop', 'miles davis', 'coltrane', 'bill evans'] },
    { preset: 'classical', words: ['classical', 'symphony', 'orchestra', 'bach', 'beethoven', 'mozart', 'chopin', 'ost', 'soundtrack', 'zimmer'] },
    { preset: 'acoustic', words: ['acoustic', 'akustik', 'unplugged', 'folk', 'guitar', 'fingerstyle', 'piano'] },
    { preset: 'vocal', words: ['podcast', 'speech', 'interview', 'acapella', 'vocal'] },
    { preset: 'bass_boost', words: ['dangdut', 'koplo', 'funkot', 'breakbeat', 'bass boost', 'phonk'] },
    { preset: 'pop', words: ['pop', 'k-pop', 'kpop', 'j-pop', 'jpop', 'bts', 'blackpink', 'twice', 'newjeans', 'yoasobi', 'taylor swift', 'ariana', 'dua lipa', 'billie eilish'] },
];

class TerminalEqualizer {
    constructor() {
        this.audioCtx = null;
        this.filters = [];
        this.preampNode = null;
        this.compressor = null;
        this.limiterNode = null;
        this.analyser = null;
        this.inputNode = null;

        // Deck routing
        this.sourceA = null;
        this.sourceB = null;
        this.deckGainA = null;
        this.deckGainB = null;
        this.attachedDeckA = null;
        this.attachedDeckB = null;

        // State
        this.enabled = true;
        this.currentPreset = 'flat';
        this.gains = [...EQ_PRESETS.flat.gains];
        this.preamp = 0;
        this.bassBoost = 0; // extra 0-8 dB bass boost
        this.manualPreset = 'flat';
        this.manualGains = [...EQ_PRESETS.flat.gains];
        this.manualPreamp = 0;
        this.manualBassBoost = 0;
        this.isOpen = false;
        this.autoMode = false;
        this.lastTunedHint = '';
        this._autoToken = 0;
        this._genreCache = new Map();
        this.tuneAnalyser = null;
        this._isTuning = false;

        this.loadState();
    }

    initAudioContext() {
        if (this.audioCtx) return true;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return false;
            try {
                this.audioCtx = new AudioContextClass({ latencyHint: 'playback', sampleRate: 48000 });
            } catch {
                this.audioCtx = new AudioContextClass();
            }

            // Input bus
            this.inputNode = this.audioCtx.createGain();
            this.inputNode.gain.value = 1;

            // Pre-amp gain
            this.preampNode = this.audioCtx.createGain();
            this.preampNode.gain.value = this._dbToGain(this.enabled ? this.preamp : 0);

            // Connect input -> preamp
            this.inputNode.connect(this.preampNode);

            // Dedicated pre-EQ analyser for Perfect Tune (not connected to destination)
            this.tuneAnalyser = this.audioCtx.createAnalyser();
            this.tuneAnalyser.fftSize = 8192;
            this.tuneAnalyser.smoothingTimeConstant = 0;
            this.inputNode.connect(this.tuneAnalyser);

            // Create 10-band biquad filters
            this.filters = [];
            let prevNode = this.preampNode;

            EQ_FREQUENCIES.forEach((freq, idx) => {
                const filter = this.audioCtx.createBiquadFilter();
                filter.frequency.value = freq;

                if (idx === 0) {
                    filter.type = 'lowshelf';
                } else if (idx === EQ_FREQUENCIES.length - 1) {
                    filter.type = 'highshelf';
                } else {
                    filter.type = 'peaking';
                    filter.Q.value = 1.414; // Standard 1-octave bandwidth
                }

                filter.gain.value = this.enabled ? this._calculateBandGain(idx) : 0;
                prevNode.connect(filter);
                prevNode = filter;
                this.filters.push(filter);
            });

            // Dynamics compressor acts as a transparent fallback limiter
            this.compressor = this.audioCtx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-1.0, this.audioCtx.currentTime);
            this.compressor.knee.setValueAtTime(6.0, this.audioCtx.currentTime);
            this.compressor.ratio.setValueAtTime(12.0, this.audioCtx.currentTime);
            this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
            this.compressor.release.setValueAtTime(0.15, this.audioCtx.currentTime);

            // Native 3D Spatial Audio processing
            spatial.init(this.audioCtx);
            prevNode.connect(spatial.inputNode);
            spatial.outputNode.connect(this.compressor);

            // Analyser for visualizer CAVA
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;

            this.compressor.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);

            // True Peak Lookahead Limiter (AudioWorklet) with graceful fallback
            if (this.audioCtx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
                const workletUrl = new URL('./limiter_worklet.js', import.meta.url).href;
                this.audioCtx.audioWorklet.addModule(workletUrl)
                    .then(() => {
                        console.log('Limiter worklet loaded successfully from', workletUrl);
                        if (!this.audioCtx || this.limiterNode) return;
                        try {
                            const limiter = new AudioWorkletNode(this.audioCtx, 'brickwall-limiter');
                            spatial.outputNode.disconnect(this.compressor);
                            spatial.outputNode.connect(limiter);
                            limiter.connect(this.analyser);
                            this.limiterNode = limiter;
                        } catch(err) {
                            console.warn('Failed to construct limiter worklet', err);
                            this.compressor.threshold.value = -2;
                            this.compressor.knee.value = 0;
                            this.compressor.ratio.value = 20;
                            this.compressor.attack.value = 0.001;
                            this.compressor.release.value = 0.1;
                        }
                    })
                    .catch(e => {
                        console.warn('Limiter worklet failed to load from', workletUrl, e);
                        // Fallback DynamicsCompressor (already set up in compressor node, but we tighten it)
                        this.compressor.threshold.value = -2;
                        this.compressor.knee.value = 0;
                        this.compressor.ratio.value = 20;
                        this.compressor.attack.value = 0.001;
                        this.compressor.release.value = 0.1;
                    });
            }

            return true;
        } catch (e) {
            console.warn('Equalizer Web Audio initialization failed:', e);
            return false;
        }
    }

    _dbToGain(db) {
        return Math.pow(10, db / 20);
    }

    _calculateBandGain(idx) {
        let base = Number(this.gains[idx]) || 0;
        if (this.bassBoost > 0) {
            // Distribute bass boost dynamically to 32Hz, 64Hz, 125Hz
            if (idx === 0) base += this.bassBoost;
            else if (idx === 1) base += this.bassBoost * 0.8;
            else if (idx === 2) base += this.bassBoost * 0.4;
        }
        return Math.max(-12, Math.min(12, base));
    }

    _listenForUserGesture() {
        if (this._gestureListenerAttached) return;
        this._gestureListenerAttached = true;
        const onGesture = async () => {
            window._pulseterm_interacted = true;
            ['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
                window.removeEventListener(evt, onGesture, true);
            });
            this._gestureListenerAttached = false;
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                try { await this.audioCtx.resume(); } catch {}
            }
        };
        ['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
            window.addEventListener(evt, onGesture, { capture: true, passive: true });
        });
    }

    async resume() {
        if (!this.audioCtx) this.initAudioContext();
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            const hasGesture = Boolean(window._pulseterm_interacted || navigator.userActivation?.hasBeenActive || navigator.userActivation?.isActive);
            if (hasGesture) {
                try {
                    await this.audioCtx.resume();
                } catch (e) {
                    this._listenForUserGesture();
                }
            } else {
                this._listenForUserGesture();
            }
        }
    }

    attachMediaElements(deckA, deckB) {
        if (!this.initAudioContext()) return;

        if (deckA && deckA !== this.attachedDeckA) {
            try {
                if (!this.sourceA) {
                    this.sourceA = this.audioCtx.createMediaElementSource(deckA);
                    this.deckGainA = this.audioCtx.createGain();
                    this.deckGainA.gain.value = 1;
                    this.sourceA.connect(this.deckGainA);
                    this.deckGainA.connect(this.inputNode);
                    this.attachedDeckA = deckA;
                }
            } catch (e) {
                console.debug('Equalizer deckA connect notice:', e);
            }
        }

        if (deckB && deckB !== this.attachedDeckB) {
            try {
                if (!this.sourceB) {
                    this.sourceB = this.audioCtx.createMediaElementSource(deckB);
                    this.deckGainB = this.audioCtx.createGain();
                    this.deckGainB.gain.value = 1;
                    this.sourceB.connect(this.deckGainB);
                    this.deckGainB.connect(this.inputNode);
                    this.attachedDeckB = deckB;
                }
            } catch (e) {
                console.debug('Equalizer deckB connect notice:', e);
            }
        }
    }

    getGainForElement(el) {
        if (!el) return null;
        if (el === this.attachedDeckA) return this.deckGainA;
        if (el === this.attachedDeckB) return this.deckGainB;
        return null;
    }

    resetGains() {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        if (this.deckGainA) {
            try {
                this.deckGainA.gain.cancelScheduledValues(now);
                this.deckGainA.gain.setValueAtTime(1, now);
            } catch {}
        }
        if (this.deckGainB) {
            try {
                this.deckGainB.gain.cancelScheduledValues(now);
                this.deckGainB.gain.setValueAtTime(1, now);
            } catch {}
        }
    }

    getAnalyser() {
        if (!this.audioCtx) this.initAudioContext();
        return this.analyser;
    }

    getAudioContext() {
        if (!this.audioCtx) this.initAudioContext();
        return this.audioCtx;
    }

    applyPreset(presetKey, options = {}) {
        const preset = EQ_PRESETS[presetKey];
        if (!preset) return;
        const isAuto = Boolean(options.isAuto);
        const tau = typeof options.tau === 'number' ? options.tau : (isAuto ? 0.5 : 0.02);

        this.currentPreset = presetKey;
        this.gains = [...preset.gains];
        this.preamp = preset.preamp || 0;
        this.bassBoost = 0;

        if (!isAuto) {
            this.manualPreset = presetKey;
            this.manualGains = [...preset.gains];
            this.manualPreamp = preset.preamp || 0;
            this.manualBassBoost = 0;
        }

        this.applyFilters({ tau });
        this.updateUI();
        this.saveState();
    }

    setBandGain(index, val) {
        val = Math.max(-12, Math.min(12, Math.round(Number(val) * 10) / 10));
        this.gains[index] = val;
        this.currentPreset = 'custom';
        this.manualPreset = 'custom';
        this.manualGains = [...this.gains];
        this.applyFilters({ tau: 0.02 });
        this.updateUI();
        this.saveState();
    }

    setPreamp(val) {
        this.preamp = Math.max(-6, Math.min(6, Math.round(Number(val) * 10) / 10));
        this.manualPreamp = this.preamp;
        this.applyFilters({ tau: 0.02 });
        this.updateUI();
        this.saveState();
    }

    setBassBoost(val) {
        this.bassBoost = Math.max(0, Math.min(8, Math.round(Number(val) * 10) / 10));
        this.manualBassBoost = this.bassBoost;
        this.applyFilters({ tau: 0.02 });
        this.updateUI();
        this.saveState();
    }

    toggleBypass() {
        this.enabled = !this.enabled;
        this.applyFilters();
        this.updateUI();
        this.saveState();
        return this.enabled;
    }

    autoDetectPreset(song) {
        if (!song) return 'perfect';
        const cacheKey = song.id || song.videoId || `${song.title || ''}_${song.artist || ''}`;
        if (cacheKey && this._genreCache.has(cacheKey)) {
            return this._genreCache.get(cacheKey);
        }
        return detectPresetLocal(song);
    }

    toggleAutoMode() {
        this.autoMode = !this.autoMode;
        if (!this.autoMode) {
            this.currentPreset = this.manualPreset || 'flat';
            this.gains = [...(this.manualGains || EQ_PRESETS.flat.gains)];
            this.preamp = this.manualPreamp ?? 0;
            this.bassBoost = this.manualBassBoost ?? 0;
            this.lastTunedHint = '';
            this.applyFilters({ tau: 0.05 });
        }
        this.saveState();
        this.updateUI();
        if (this.autoMode && window.player?.currentSong) {
            this.onTrackChange(window.player.currentSong);
        }
        this._toast(this.autoMode ? '[AUTO-EQ: ENABLED]' : '[AUTO-EQ: DISABLED]');
        return this.autoMode;
    }

    async onTrackChange(song) {
        if (!this.autoMode || !this.enabled || !song) return;
        const token = ++this._autoToken;
        const cacheKey = song.id || song.videoId || `${song.title || ''}_${song.artist || ''}`;
        let presetKey = null;

        if (cacheKey && this._genreCache.has(cacheKey)) {
            presetKey = this._genreCache.get(cacheKey);
        } else {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);
            try {
                const res = await getGenre(
                    { title: song.title || '', artist: song.artist || '', album: song.album || '' },
                    { signal: controller.signal }
                );
                clearTimeout(timeoutId);
                if (res && res.success && res.data) {
                    presetKey = mapProfileToPreset(res.data.genres || [], res.data.vibes || [], song);
                }
            } catch (e) {
                clearTimeout(timeoutId);
            }
            if (!presetKey) {
                presetKey = mapProfileToPreset([], [], song);
            }
            if (cacheKey && presetKey) {
                this._genreCache.set(cacheKey, presetKey);
            }
        }

        if (token !== this._autoToken || !this.autoMode || !this.enabled) return;
        this.applyPreset(presetKey, { isAuto: true, tau: 0.4 });
        this.lastTunedHint = `AUTO (${EQ_PRESETS[presetKey]?.name || presetKey.toUpperCase()})`;
        this.updateUI();

        // Dynamically analyze the real-time audio spectrum of this track to fill deficient frequencies
        this._scheduleSpectralCalibration(presetKey, token);
    }

    async _scheduleSpectralCalibration(archetypeKey, token) {
        if (!this.tuneAnalyser) return;
        // Wait ~1.8 seconds after track load for audio decoding and steady-state playback
        await new Promise(r => setTimeout(r, 1800));
        if (token !== this._autoToken || !this.autoMode || !this.enabled) return;

        // Verify player is actively playing and not crossfading
        if (!window.player?.isPlaying || window.player?.crossfadeStarted) {
            for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 600));
                if (token !== this._autoToken || !this.autoMode || !this.enabled) return;
                if (window.player?.isPlaying && !window.player?.crossfadeStarted) break;
            }
            if (!window.player?.isPlaying || window.player?.crossfadeStarted) return;
        }

        const fftSize = this.tuneAnalyser.fftSize;
        const binCount = this.tuneAnalyser.frequencyBinCount;
        const sampleRate = this.audioCtx?.sampleRate || 48000;
        const floatData = new Float32Array(binCount);

        // Accumulate linear power across 20 frames (~1.0 second, 50ms intervals)
        const frames = 20;
        const bandAccumPower = new Float64Array(10).fill(0);
        let validFrames = 0;

        for (let f = 0; f < frames; f++) {
            if (token !== this._autoToken || !this.autoMode || !this.enabled || !window.player?.isPlaying || window.player?.crossfadeStarted) break;
            this.tuneAnalyser.getFloatFrequencyData(floatData);

            for (let b = 0; b < 10; b++) {
                const fc = EQ_FREQUENCIES[b];
                const bandDb = bandPowerDb(floatData, sampleRate, fftSize, fc);
                bandAccumPower[b] += Math.pow(10, bandDb / 10);
            }
            validFrames++;
            await new Promise(r => setTimeout(r, 50));
        }

        if (token !== this._autoToken || !this.autoMode || !this.enabled || validFrames < 8) return;

        const avgBandDb = Array.from(bandAccumPower).map(sumP => {
            const avgP = sumP / validFrames;
            return 10 * Math.log10(Math.max(avgP, 1e-12));
        });

        // Ensure track is not in a silent intro (< -85 dBFS at 1kHz)
        if (avgBandDb[5] < -85) return;

        // Phase 2: Spectral Reclassification
        // If metadata gave us a weak guess (flat/pop), use the ACTUAL measured
        // audio spectrum to determine the real genre archetype.
        const reclassifiedKey = classifySpectralProfile(avgBandDb, archetypeKey);
        const effectiveArchetype = reclassifiedKey || archetypeKey;

        // If reclassified, also re-apply the base preset first for a smooth transition
        if (effectiveArchetype !== archetypeKey) {
            if (token !== this._autoToken || !this.autoMode || !this.enabled) return;
            this.applyPreset(effectiveArchetype, { isAuto: true, tau: 0.3 });
        }

        // Phase 3: Spectral deficiency filling relative to the (potentially reclassified) archetype
        const calResult = analyzeAndCompensate(avgBandDb, effectiveArchetype);
        const { gains, hint } = calResult;

        if (token !== this._autoToken || !this.autoMode || !this.enabled) return;
        this.gains = [...gains];
        this.lastTunedHint = `AUTO·${hint}`;
        this.applyFilters({ tau: 0.3 });
        this.updateUI();

        // Refinement pass: kalau snapshot pertama jatuh di zona abu-abu vokal
        // recessed (confidence LOW — mis. intro piano dulu baru vokal masuk,
        // atau ballad yang vokalnya di-mix ke dalam), ukur ulang ~8 detik
        // kemudian saat vokal sudah masuk penuh. refineAirCompensation() lalu
        // menggabungkan kedua snapshot: vokal telat masuk -> air dibuka kembali.
        if (calResult.airConfidence === 'LOW') {
            const laterToken = token;
            setTimeout(async () => {
                if (laterToken !== this._autoToken || !this.autoMode || !this.enabled) return;
                if (!this.tuneAnalyser || !window.player?.isPlaying || window.player?.crossfadeStarted) return;
                try {
                    const fft2 = this.tuneAnalyser.fftSize;
                    const sr2 = this.audioCtx?.sampleRate || 48000;
                    const data2 = new Float32Array(this.tuneAnalyser.frequencyBinCount);
                    const acc2 = new Float64Array(10).fill(0);
                    let valid2 = 0;
                    for (let f = 0; f < frames; f++) {
                        if (laterToken !== this._autoToken || !this.autoMode || !this.enabled) return;
                        this.tuneAnalyser.getFloatFrequencyData(data2);
                        for (let b = 0; b < 10; b++) {
                            const bd = bandPowerDb(data2, sr2, fft2, EQ_FREQUENCIES[b]);
                            acc2[b] += Math.pow(10, bd / 10);
                        }
                        valid2++;
                        await new Promise(r => setTimeout(r, 50));
                    }
                    if (valid2 < 8) return;
                    const laterDb = Array.from(acc2).map(sumP => 10 * Math.log10(Math.max(sumP / valid2, 1e-12)));
                    if (laterDb[5] < -85) return;
                    const laterArch = classifySpectralProfile(laterDb, effectiveArchetype) || effectiveArchetype;
                    const laterResult = analyzeAndCompensate(laterDb, laterArch);
                    const { refineAirCompensation } = await import('./eq-core.js');
                    const merged = refineAirCompensation(calResult, laterResult);
                    if (laterToken !== this._autoToken || !this.autoMode || !this.enabled) return;
                    this.gains = [...merged.gains];
                    this.lastTunedHint = `AUTO·${merged.hint}`;
                    this.applyFilters({ tau: 0.5 });
                    this.updateUI();
                } catch {}
            }, 8000);
        }
    }

    _toast(msg) {
        // #5 cosmetic: mode-aware toast helper. Di Modern hilangkan
        // bracket + sentence-case via modernUiEngine, di Retro biarkan
        // apa adanya. Delegate ke shared window.showModernToast supaya
        // mode-detection tidak diduplikasi di tiap module.
        if (!msg) return;
        if (typeof window.showModernToast === 'function') {
            window.showModernToast(msg);
            return;
        }
        // Fallback kalau modern.js belum load (early script).
        if (window.player?.showToast) window.player.showToast(msg);
    }

    async perfectTune() {
        this.initAudioContext();
        this.resume();

        if (this._isTuning) return;
        if (window.player?.crossfadeStarted) {
            this._toast('[⚡ PERFECT TUNE: Tunggu crossfade selesai]');
            return;
        }

        if (!this.tuneAnalyser || !window.player?.isPlaying) {
            this._toast('[⚡ PERFECT TUNE: Putar lagu terlebih dahulu]');
            return;
        }

        this._isTuning = true;
        this._toast('[⚡ PERFECT TUNE: Menganalisis spektrum audio...]');

        try {
            const fftSize = this.tuneAnalyser.fftSize;
            const binCount = this.tuneAnalyser.frequencyBinCount;
            const sampleRate = this.audioCtx.sampleRate || 48000;
            const floatData = new Float32Array(binCount);

            // Accumulate 25 frames over ~1.25s (50ms interval)
            const frames = 25;
            const bandAccumPower = new Float64Array(10).fill(0);
            let validFrames = 0;

            for (let f = 0; f < frames; f++) {
                if (!window.player?.isPlaying || window.player?.crossfadeStarted) break;
                this.tuneAnalyser.getFloatFrequencyData(floatData);

                // Accumulate octave linear power for each of the 10 bands
                for (let b = 0; b < 10; b++) {
                    const fc = EQ_FREQUENCIES[b];
                    const bandDb = bandPowerDb(floatData, sampleRate, fftSize, fc);
                    bandAccumPower[b] += Math.pow(10, bandDb / 10);
                }
                validFrames++;
                await new Promise(r => setTimeout(r, 50));
            }

            if (validFrames < 5) {
                this._toast('[⚡ PERFECT TUNE: Analisis dibatalkan]');
                return;
            }

            // Average power per band and convert to dB
            const avgBandDb = Array.from(bandAccumPower).map(sumP => {
                const avgP = sumP / validFrames;
                return 10 * Math.log10(Math.max(avgP, 1e-12));
            });

            // Reject if silent or too low (level at 1 kHz < -90 dBFS)
            if (avgBandDb[5] < -90) {
                this._toast('[⚡ Level sinyal terlalu rendah untuk Perfect Tune]');
                return;
            }

            const { gains, preamp, hint } = computeTuneCorrections(avgBandDb);

            this.gains = [...gains];
            this.preamp = preamp;
            this.currentPreset = 'perfect';
            this.bassBoost = 0;
            this.lastTunedHint = hint;

            this.manualPreset = 'perfect';
            this.manualGains = [...this.gains];
            this.manualPreamp = this.preamp;
            this.manualBassBoost = 0;

            this.applyFilters({ tau: 0.1 });
            this.updateUI();
            this.saveState();

            this._toast(`[⚡ PERFECT EQ: ${hint}]`);
        } finally {
            this._isTuning = false;
        }
    }

    applyFilters(options = {}) {
        if (!this.audioCtx || !this.filters.length) return;
        this.resume();

        const time = this.audioCtx.currentTime;
        const tau = typeof options.tau === 'number' ? options.tau : 0.02;

        // Preamp
        const targetPreamp = this.enabled ? this._dbToGain(this.preamp) : 1;
        if (this.preampNode) {
            this.preampNode.gain.setTargetAtTime(targetPreamp, time, tau);
        }

        // 10 bands
        this.filters.forEach((filter, idx) => {
            const targetGain = this.enabled ? this._calculateBandGain(idx) : 0;
            filter.gain.setTargetAtTime(targetGain, time, tau);
        });
    }

    getAsciiCurve() {
        const blocks = [' ', ' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        return this.gains.map(g => {
            const normalized = Math.max(0, Math.min(8, Math.round((g + 12) / 24 * 8)));
            return blocks[normalized];
        }).join('');
    }

    render() {
        const container = document.getElementById('equalizer-container');
        if (!container) return;

        const isSpatialActive = window.spatial && window.spatial.mode !== 'off';
        const spatialLabel = window.spatial ? (isSpatialActive ? `[SPATIAL: ${window.spatial.mode.toUpperCase()}]` : '[SPATIAL: OFF]') : '[SPATIAL: OFF]';

        let html = `
            <div class="eq-body">
                <div class="eq-control-deck">
                    <div class="eq-telemetry-row">
                        <div class="eq-curve-wrap">
                            <span class="eq-meta-tag">SPECTRUM:</span>
                            <span class="eq-ascii-curve">[ ${this.getAsciiCurve()} ]</span>
                        </div>
                        <div class="eq-profile-wrap">
                            <span class="eq-meta-tag">PROFILE:</span>
                            <span class="eq-preset-indicator font-bold">${this.getPresetDisplayName()}</span>
                        </div>
                        <span class="eq-state-badge ${this.enabled ? 'is-active' : 'is-bypassed'}">${this.enabled ? '[DSP: ACTIVE]' : '[DSP: BYPASSED]'}</span>
                    </div>
                    <div class="eq-action-buttons">
                        <button id="eq-power-btn" onclick="equalizer.toggleBypass()" class="tui-btn ${this.enabled ? '' : 'btn-danger'}" title="Toggle EQ DSP bypass">${this.enabled ? '[EQ: ENABLED]' : '[EQ: BYPASS]'}</button>
                        <button id="eq-perfect-btn" onclick="equalizer.perfectTune()" class="tui-btn eq-perfect-btn" title="Instant Real-Time Spectral Perfect Tune" style="display: ${window.expPerfectTuneEnabled !== false ? 'inline-block' : 'none'}">[⚡ PERFECT TUNE]</button>
                        <button id="eq-auto-btn" onclick="equalizer.toggleAutoMode()" class="tui-btn ${this.autoMode ? 'active' : ''}" title="Toggle Auto-EQ per song change">${this.autoMode ? '[AUTO: ON]' : '[AUTO: OFF]'}</button>
                        <button id="spatial-panel-btn" onclick="spatial.cycleMode()" class="tui-btn spatial-toggle-btn ${isSpatialActive ? 'active' : ''}" title="Cycle 3D Spatial Audio Mode (X)" style="display: ${window.expSpatialEnabled !== false ? 'inline-block' : 'none'}">${spatialLabel}</button>
                        <button onclick="equalizer.applyPreset('flat')" class="tui-btn" title="Reset all bands to 0dB">[RESET FLAT]</button>
                    </div>
                </div>

                <div class="eq-macro-deck">
                    <div class="eq-macro-box">
                        <div class="eq-macro-head">
                            <span>PRE-AMP GAIN:</span>
                            <span id="eq-preamp-val" class="eq-val-accent">${this.preamp >= 0 ? '+' : ''}${this.preamp.toFixed(1)}dB</span>
                        </div>
                        <input type="range" id="eq-preamp-slider" min="-6" max="6" step="0.5" value="${this.preamp}" title="Master pre-amp trim (-6dB to +6dB)">
                    </div>
                    <div class="eq-macro-box">
                        <div class="eq-macro-head">
                            <span>BASS BOOST DSP:</span>
                            <span id="eq-bassboost-val" class="eq-val-accent">+${this.bassBoost.toFixed(1)}dB</span>
                        </div>
                        <input type="range" id="eq-bassboost-slider" min="0" max="8" step="0.5" value="${this.bassBoost}" title="Harmonic bass boost (0dB to +8dB)">
                    </div>
                </div>

                <div class="eq-presets-ribbon">
                    <div class="eq-section-title">┌─ GENRES & SOUND PROFILES ─────────────────────────────────────────┐</div>
                    <div class="eq-presets-chips">
        `;

        Object.keys(EQ_PRESETS).forEach(key => {
            const p = EQ_PRESETS[key];
            const isActive = this.currentPreset === key;
            html += `<button class="tui-btn eq-chip ${isActive ? 'active' : ''}" data-preset="${key}">[${p.name}]</button>`;
        });

        html += `
                    </div>
                </div>

                <div class="eq-rack-section">
                    <div class="eq-section-title">┌─ 10-BAND GRAPHIC EQUALIZER FREQUENCY RESPONSE ───────────────────┐</div>
                    <div class="eq-rack">
                        <div class="eq-scale">
                            <span>+12</span>
                            <span>+6</span>
                            <span> 0</span>
                            <span>-6</span>
                            <span>-12</span>
                        </div>
                        <div class="eq-faders">
        `;

        this.gains.forEach((gain, idx) => {
            const freq = EQ_LABELS[idx];
            const hint = EQ_HINTS[idx] || { type: 'mid', label: '', role: '', desc: '' };
            const displayGain = (gain >= 0 ? '+' : '') + gain.toFixed(1);
            html += `
                <div class="eq-fader-channel" data-band="${idx}">
                    <span class="eq-fader-val" id="eq-val-${idx}">${displayGain}</span>
                    <div class="eq-fader-track">
                        <input type="range" class="eq-slider-vertical" id="eq-slider-${idx}" min="-12" max="12" step="0.5" value="${gain}">
                    </div>
                    <span class="eq-fader-freq">${freq}</span>
                    <span class="eq-fader-hint type-${hint.type}" title="${hint.role} (${freq}): ${hint.desc}">${hint.label}</span>
                </div>
            `;
        });

        html += `
                        </div>
                    </div>
                    <div class="eq-fader-legend">
                        <span class="eq-legend-item"><span class="eq-legend-dot" style="background:#3b82f6;"></span>BASS (32Hz–125Hz)</span>
                        <span class="eq-legend-item"><span class="eq-legend-dot" style="background:#f59e0b;"></span>MID (250Hz–500Hz)</span>
                        <span class="eq-legend-item"><span class="eq-legend-dot" style="background:#10b981;"></span>VOCAL (1kHz–2kHz)</span>
                        <span class="eq-legend-item"><span class="eq-legend-dot" style="background:#8b5cf6;"></span>TREBLE (4kHz–16kHz)</span>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.bindEvents();
    }

    bindEvents() {
        const container = document.getElementById('equalizer-container');
        if (!container) return;

        // Preset buttons
        container.querySelectorAll('[data-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPreset(btn.dataset.preset);
            });
        });

        // 10 Faders
        for (let i = 0; i < 10; i++) {
            const slider = document.getElementById(`eq-slider-${i}`);
            const valSpan = document.getElementById(`eq-val-${i}`);
            if (slider && valSpan) {
                slider.addEventListener('input', () => {
                    const val = parseFloat(slider.value);
                    valSpan.textContent = (val >= 0 ? '+' : '') + val.toFixed(1);
                    this.setBandGain(i, val);
                });
            }
        }

        // Preamp slider
        const preampSlider = document.getElementById('eq-preamp-slider');
        const preampVal = document.getElementById('eq-preamp-val');
        if (preampSlider && preampVal) {
            preampSlider.addEventListener('input', () => {
                const val = parseFloat(preampSlider.value);
                preampVal.textContent = (val >= 0 ? '+' : '') + val.toFixed(1) + 'dB';
                this.setPreamp(val);
            });
        }

        // Bass boost slider
        const bassSlider = document.getElementById('eq-bassboost-slider');
        const bassVal = document.getElementById('eq-bassboost-val');
        if (bassSlider && bassVal) {
            bassSlider.addEventListener('input', () => {
                const val = parseFloat(bassSlider.value);
                bassVal.textContent = '+' + val.toFixed(1) + 'dB';
                this.setBassBoost(val);
            });
        }
    }

    updateUI() {
        // Update header badge on top bar
        const topBtn = document.getElementById('eq-toggle-btn');
        if (topBtn) {
            if (!this.enabled) {
                topBtn.textContent = '[EQ: BYPASS]';
                topBtn.classList.remove('active');
            } else if (this.autoMode) {
                topBtn.textContent = `[EQ: AUTO·${this.getPresetDisplayName()}]`;
                topBtn.classList.add('active');
            } else {
                topBtn.textContent = `[EQ: ${this.getPresetDisplayName()}]`;
                topBtn.classList.toggle('active', this.currentPreset !== 'flat');
            }
        }

        // Update power button
        const powerBtn = document.getElementById('eq-power-btn');
        if (powerBtn) {
            powerBtn.textContent = this.enabled ? '[EQ: ENABLED]' : '[EQ: BYPASS]';
            powerBtn.classList.toggle('btn-danger', !this.enabled);
        }

        // Update Auto-EQ buttons across UI
        document.querySelectorAll('#eq-auto-btn, #eq-auto-toggle-btn').forEach(btn => {
            btn.textContent = this.autoMode ? '[AUTO: ON]' : '[AUTO: OFF]';
            btn.classList.toggle('active', this.autoMode);
        });

        // Update presets active states
        document.querySelectorAll('.eq-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.preset === this.currentPreset);
        });

        spatial.updateUI();

        // Update values & curve
        const curveEl = document.querySelector('.eq-ascii-curve');
        if (curveEl) curveEl.textContent = `[ ${this.getAsciiCurve()} ]`;

        const presetInd = document.querySelector('.eq-preset-indicator');
        if (presetInd) presetInd.textContent = this.getPresetDisplayName();

        const badge = document.querySelector('.eq-state-badge');
        if (badge) {
            badge.className = `eq-state-badge ${this.enabled ? 'is-active' : 'is-bypassed'}`;
            badge.textContent = this.enabled ? '[DSP: ACTIVE]' : '[DSP: BYPASSED]';
        }

        // Sliders
        for (let i = 0; i < 10; i++) {
            const slider = document.getElementById(`eq-slider-${i}`);
            const valSpan = document.getElementById(`eq-val-${i}`);
            if (slider) slider.value = this.gains[i];
            if (valSpan) valSpan.textContent = (this.gains[i] >= 0 ? '+' : '') + this.gains[i].toFixed(1);
        }

        const preampSlider = document.getElementById('eq-preamp-slider');
        const preampVal = document.getElementById('eq-preamp-val');
        if (preampSlider) preampSlider.value = this.preamp;
        if (preampVal) preampVal.textContent = (this.preamp >= 0 ? '+' : '') + this.preamp.toFixed(1) + 'dB';

        const bassSlider = document.getElementById('eq-bassboost-slider');
        const bassVal = document.getElementById('eq-bassboost-val');
        if (bassSlider) bassSlider.value = this.bassBoost;
        if (bassVal) bassVal.textContent = '+' + this.bassBoost.toFixed(1) + 'dB';
    }

    getPresetDisplayName() {
        if (!this.enabled) return 'BYPASS';
        if (this.autoMode && this.lastTunedHint) {
            return this.lastTunedHint.replace(/^AUTO \((.+)\)$/, '$1');
        }
        if (this.currentPreset === 'perfect') return this.lastTunedHint || 'PERFECT';
        if (this.currentPreset === 'custom') return 'CUSTOM';
        const p = EQ_PRESETS[this.currentPreset];
        return p ? p.name : 'FLAT';
    }

    togglePanel() {
        const panel = document.getElementById('equalizer-panel');
        if (!panel) return;
        this.isOpen = panel.classList.toggle('hidden') === false;
        if (this.isOpen) {
            this.initAudioContext();
            this.resume();
            this.render();
            this.updateUI();
        }
    }

    closePanel() {
        const panel = document.getElementById('equalizer-panel');
        if (panel) panel.classList.add('hidden');
        this.isOpen = false;
    }

    saveState() {
        try {
            const data = {
                enabled: this.enabled,
                preset: this.manualPreset || 'flat',
                gains: this.manualGains || [...EQ_PRESETS.flat.gains],
                preamp: this.manualPreamp ?? 0,
                bassBoost: this.manualBassBoost ?? 0,
                autoMode: this.autoMode
            };
            localStorage.setItem('pulseterm_eq', JSON.stringify(data));
        } catch {}
    }

    loadState() {
        try {
            const raw = localStorage.getItem('pulseterm_eq');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (typeof data.enabled === 'boolean') this.enabled = data.enabled;
            if (data.preset && (EQ_PRESETS[data.preset] || data.preset === 'custom')) {
                this.currentPreset = data.preset;
                this.manualPreset = data.preset;
            }
            if (Array.isArray(data.gains) && data.gains.length === 10) {
                this.gains = data.gains.map(g => Number(g) || 0);
                this.manualGains = [...this.gains];
            }
            if (Number.isFinite(data.preamp)) {
                this.preamp = data.preamp;
                this.manualPreamp = data.preamp;
            }
            if (Number.isFinite(data.bassBoost)) {
                this.bassBoost = data.bassBoost;
                this.manualBassBoost = data.bassBoost;
            }
            if (typeof data.autoMode === 'boolean') this.autoMode = data.autoMode;
        } catch {}
    }
}

export const equalizer = new TerminalEqualizer();
window.equalizer = equalizer;
window.toggleEqualizer = () => equalizer.togglePanel();
