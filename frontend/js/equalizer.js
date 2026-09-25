// PulseTerm — Minimalist TUI Audio Player Equalizer Engine
// 10-Band Parametric Audio DSP with Genre Presets & Anti-Clipping Dynamics Limiter

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

export const EQ_PRESETS = {
    flat: {
        name: 'FLAT',
        label: 'Flat / Neutral',
        gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        preamp: 0
    },
    bass_boost: {
        name: 'BASS BOOST',
        label: 'Bass Boost',
        gains: [8, 7, 5, 3, 1, 0, 0, 0, 0, 0],
        preamp: -2
    },
    rock: {
        name: 'ROCK',
        label: 'Rock & Alt',
        gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
        preamp: -1
    },
    pop: {
        name: 'POP',
        label: 'Pop & Modern',
        gains: [-1, 1, 3, 4, 4, 3, 1, 0, 2, 3],
        preamp: -1
    },
    electronic: {
        name: 'EDM',
        label: 'Electronic / EDM',
        gains: [6, 5, 3, 0, -2, 1, 2, 3, 5, 5],
        preamp: -2
    },
    hiphop: {
        name: 'HIP-HOP',
        label: 'Hip-Hop & Rap',
        gains: [6, 5, 3, 1, -1, 1, 2, 1, 3, 4],
        preamp: -1.5
    },
    rnb: {
        name: 'R&B',
        label: 'R&B / Soul',
        gains: [4, 6, 3, 0, 1, 2, 2, 1, 2, 3],
        preamp: -1
    },
    jazz: {
        name: 'JAZZ',
        label: 'Jazz & Lounge',
        gains: [3, 2, 1, 2, -1, -1, 0, 1, 3, 4],
        preamp: 0
    },
    classical: {
        name: 'CLASSIC',
        label: 'Classical & Symphony',
        gains: [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
        preamp: 0
    },
    acoustic: {
        name: 'ACOUSTIC',
        label: 'Acoustic & Folk',
        gains: [3, 2, 1, 1, 2, 2, 3, 3, 3, 2],
        preamp: 0
    },
    dance: {
        name: 'DANCE',
        label: 'Dance & Club',
        gains: [5, 6, 4, 1, 0, 0, 2, 3, 4, 2],
        preamp: -1.5
    },
    metal: {
        name: 'METAL',
        label: 'Heavy Metal',
        gains: [5, 4, 2, 0, -2, -2, 1, 4, 5, 4],
        preamp: -1.5
    },
    vocal: {
        name: 'VOCAL',
        label: 'Vocal / Podcast',
        gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
        preamp: 0
    },
    treble_boost: {
        name: 'TREBLE',
        label: 'Treble Boost',
        gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
        preamp: -1
    }
};

class TerminalEqualizer {
    constructor() {
        this.audioCtx = null;
        this.filters = [];
        this.preampNode = null;
        this.compressor = null;
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
        this.isOpen = false;

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

            // Dynamics compressor acts as a studio-grade transparent brickwall limiter
            // to eliminate any digital clipping distortion even with heavy bass boost
            this.compressor = this.audioCtx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-1.0, this.audioCtx.currentTime);
            this.compressor.knee.setValueAtTime(6.0, this.audioCtx.currentTime);
            this.compressor.ratio.setValueAtTime(12.0, this.audioCtx.currentTime);
            this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
            this.compressor.release.setValueAtTime(0.15, this.audioCtx.currentTime);

            prevNode.connect(this.compressor);

            // Analyser for visualizer CAVA
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;

            this.compressor.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);

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

    applyPreset(presetKey) {
        const preset = EQ_PRESETS[presetKey];
        if (!preset) return;
        this.currentPreset = presetKey;
        this.gains = [...preset.gains];
        this.preamp = preset.preamp || 0;
        this.applyFilters();
        this.updateUI();
        this.saveState();
    }

    setBandGain(index, val) {
        val = Math.max(-12, Math.min(12, Math.round(Number(val) * 10) / 10));
        this.gains[index] = val;
        this.currentPreset = 'custom';
        this.applyFilters();
        this.updateUI();
        this.saveState();
    }

    setPreamp(val) {
        this.preamp = Math.max(-6, Math.min(6, Math.round(Number(val) * 10) / 10));
        this.applyFilters();
        this.updateUI();
        this.saveState();
    }

    setBassBoost(val) {
        this.bassBoost = Math.max(0, Math.min(8, Math.round(Number(val) * 10) / 10));
        this.applyFilters();
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

    applyFilters() {
        if (!this.audioCtx || !this.filters.length) return;
        this.resume();

        const time = this.audioCtx.currentTime;
        const rampDuration = 0.05; // 50ms smooth transition to avoid pops

        // Preamp
        const targetPreamp = this.enabled ? this._dbToGain(this.preamp) : 1;
        if (this.preampNode) {
            this.preampNode.gain.cancelScheduledValues(time);
            this.preampNode.gain.linearRampToValueAtTime(targetPreamp, time + rampDuration);
        }

        // 10 bands
        this.filters.forEach((filter, idx) => {
            const targetGain = this.enabled ? this._calculateBandGain(idx) : 0;
            filter.gain.cancelScheduledValues(time);
            filter.gain.linearRampToValueAtTime(targetGain, time + rampDuration);
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

        let html = `
            <div class="eq-body">
                <div class="eq-top-telemetry">
                    <div class="eq-meta-info">
                        <span class="eq-ascii-curve">[ ${this.getAsciiCurve()} ]</span>
                        <span class="tui-dim">PROFILE:</span>
                        <span class="eq-preset-indicator font-bold">${this.getPresetDisplayName()}</span>
                        <span class="eq-state-badge ${this.enabled ? 'is-active' : 'is-bypassed'}">${this.enabled ? '[DSP: ACTIVE]' : '[DSP: BYPASSED]'}</span>
                    </div>
                    <div class="eq-sliders-macro">
                        <div class="eq-macro-group">
                            <label for="eq-preamp-slider">PRE-AMP: <span id="eq-preamp-val">${this.preamp >= 0 ? '+' : ''}${this.preamp.toFixed(1)}dB</span></label>
                            <input type="range" id="eq-preamp-slider" min="-6" max="6" step="0.5" value="${this.preamp}">
                        </div>
                        <div class="eq-macro-group">
                            <label for="eq-bassboost-slider">BASS BOOST: <span id="eq-bassboost-val">+${this.bassBoost.toFixed(1)}dB</span></label>
                            <input type="range" id="eq-bassboost-slider" min="0" max="8" step="0.5" value="${this.bassBoost}">
                        </div>
                    </div>
                </div>

                <div class="eq-presets-ribbon">
                    <span class="eq-ribbon-label">GENRES:</span>
                    <div class="eq-presets-chips">
        `;

        Object.keys(EQ_PRESETS).forEach(key => {
            const p = EQ_PRESETS[key];
            const isActive = this.currentPreset === key;
            html += `<button class="tui-btn eq-chip ${isActive ? 'active' : ''}" data-preset="${key}">${p.name}</button>`;
        });

        html += `
                    </div>
                </div>

                <div class="eq-rack">
                    <div class="eq-scale">
                        <span>+12</span>
                        <span>+6</span>
                        <span>0</span>
                        <span>-6</span>
                        <span>-12</span>
                    </div>
                    <div class="eq-faders">
        `;

        this.gains.forEach((gain, idx) => {
            const freq = EQ_LABELS[idx];
            const displayGain = (gain >= 0 ? '+' : '') + gain.toFixed(1);
            html += `
                <div class="eq-fader-channel" data-band="${idx}">
                    <span class="eq-fader-val" id="eq-val-${idx}">${displayGain}</span>
                    <div class="eq-fader-track">
                        <input type="range" class="eq-slider-vertical" id="eq-slider-${idx}" min="-12" max="12" step="0.5" value="${gain}" orient="vertical">
                    </div>
                    <span class="eq-fader-freq">${freq}</span>
                </div>
            `;
        });

        html += `
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

        // Update presets active states
        document.querySelectorAll('.eq-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.preset === this.currentPreset);
        });

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

        for (let i = 0; i < 10; i++) {
            const slider = document.getElementById(`eq-slider-${i}`);
            const valSpan = document.getElementById(`eq-val-${i}`);
            if (slider) slider.value = this.gains[i];
            if (valSpan) valSpan.textContent = (this.gains[i] >= 0 ? '+' : '') + this.gains[i].toFixed(1);
        }
    }

    getPresetDisplayName() {
        if (!this.enabled) return 'BYPASS';
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
                preset: this.currentPreset,
                gains: this.gains,
                preamp: this.preamp,
                bassBoost: this.bassBoost
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
            if (data.preset && (EQ_PRESETS[data.preset] || data.preset === 'custom')) this.currentPreset = data.preset;
            if (Array.isArray(data.gains) && data.gains.length === 10) {
                this.gains = data.gains.map(g => Number(g) || 0);
            }
            if (Number.isFinite(data.preamp)) this.preamp = data.preamp;
            if (Number.isFinite(data.bassBoost)) this.bassBoost = data.bassBoost;
        } catch {}
    }
}

export const equalizer = new TerminalEqualizer();
window.equalizer = equalizer;
window.toggleEqualizer = () => equalizer.togglePanel();
