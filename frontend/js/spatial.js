// PulseTerm — Minimalist 3D Binaural Spatial Audio Engine
// Zero-Bloat, Native Web Audio API HRTF Spatializer (Apple Music Spatialize Stereo style)

export const SPATIAL_MODES = ['off', 'studio', 'wide', 'concert'];

export const SPATIAL_CONFIGS = {
    off: {
        name: 'OFF',
        label: 'Stereo (Bypass)',
        centerDist: 1.0,
        sideWidth: 1.0,
        roomGain: 0.0,
        roomDelay: 0.015,
        cutoffFreq: 8000
    },
    studio: {
        name: 'STUDIO',
        label: 'Studio Monitors 3D',
        centerDist: 1.2,      // Front phantom center speaker
        sideWidth: 1.3,       // Natural 30-degree studio acoustic spread
        roomGain: 0.12,       // Subtle acoustic room crossfeed
        roomDelay: 0.014,     // 14ms early reflection
        cutoffFreq: 6500      // High-frequency absorption by room air
    },
    wide: {
        name: 'WIDE',
        label: 'Wide 3D Stage',
        centerDist: 1.1,      // Intimate center vocals
        sideWidth: 2.2,       // Ultra-wide spherical lateral separation
        roomGain: 0.18,       // Out-of-head immersive spatialization
        roomDelay: 0.020,     // 20ms early reflection
        cutoffFreq: 8000      // Crisp 360-degree air extension
    },
    concert: {
        name: 'CONCERT',
        label: 'Concert Hall',
        centerDist: 1.8,      // Distant grand front stage
        sideWidth: 2.5,       // Enveloping stadium diffusion
        roomGain: 0.32,       // Lush acoustic hall reflections
        roomDelay: 0.035,     // 35ms hall reflections
        cutoffFreq: 5000      // Warm acoustic hall roll-off
    }
};

class SpatialAudioEngine {
    constructor() {
        this.audioCtx = null;
        this.inputNode = null;
        this.outputNode = null;

        // Routing buses
        this.directGain = null;
        this.spatialBus = null;

        // Mid-Side & 3D Panners
        this.splitter = null;
        this.midPanner = null;
        this.leftPanner = null;
        this.rightPanner = null;

        // Room Reflections / Crossfeed
        this.roomDelay = null;
        this.roomFilter = null;
        this.roomGain = null;

        // State
        this.mode = 'off';
        this.loadState();
    }

    init(audioCtx) {
        if (this.audioCtx && this.inputNode) return true;
        if (!audioCtx) return false;
        this.audioCtx = audioCtx;

        try {
            // Master I/O
            this.inputNode = this.audioCtx.createGain();
            this.inputNode.gain.value = 1.0;

            this.outputNode = this.audioCtx.createGain();
            this.outputNode.gain.value = 1.0;

            // Direct stereo bypass bus
            this.directGain = this.audioCtx.createGain();
            this.directGain.gain.value = this.mode === 'off' ? 1.0 : 0.0;
            this.inputNode.connect(this.directGain);
            this.directGain.connect(this.outputNode);

            // Spatial processing bus
            this.spatialBus = this.audioCtx.createGain();
            this.spatialBus.gain.value = this.mode === 'off' ? 0.0 : 1.0;
            this.inputNode.connect(this.spatialBus);

            // Channel Splitter (0: Left, 1: Right)
            this.splitter = this.audioCtx.createChannelSplitter(2);
            this.spatialBus.connect(this.splitter);

            // Configure Native Web Audio Listener at origin looking down -Z
            const listener = this.audioCtx.listener;
            if (listener.positionX) {
                listener.positionX.setValueAtTime(0, this.audioCtx.currentTime);
                listener.positionY.setValueAtTime(0, this.audioCtx.currentTime);
                listener.positionZ.setValueAtTime(0, this.audioCtx.currentTime);
                listener.forwardX.setValueAtTime(0, this.audioCtx.currentTime);
                listener.forwardY.setValueAtTime(0, this.audioCtx.currentTime);
                listener.forwardZ.setValueAtTime(-1, this.audioCtx.currentTime);
                listener.upX.setValueAtTime(0, this.audioCtx.currentTime);
                listener.upY.setValueAtTime(1, this.audioCtx.currentTime);
                listener.upZ.setValueAtTime(0, this.audioCtx.currentTime);
            } else if (listener.setPosition) {
                listener.setPosition(0, 0, 0);
                listener.setOrientation(0, 0, -1, 0, 1, 0);
            }

            // 1. Mid Channel Matrix: (L + R) * 0.5
            const midGainL = this.audioCtx.createGain();
            const midGainR = this.audioCtx.createGain();
            midGainL.gain.value = 0.5;
            midGainR.gain.value = 0.5;
            this.splitter.connect(midGainL, 0);
            this.splitter.connect(midGainR, 1);

            const midSum = this.audioCtx.createGain();
            midGainL.connect(midSum);
            midGainR.connect(midSum);

            // Center Virtual Panner (HRTF)
            this.midPanner = this._createHRTFPanner(0, 0, -1.2);
            midSum.connect(this.midPanner);
            this.midPanner.connect(this.outputNode);

            // 2. Left & Right Virtual Panners (HRTF)
            this.leftPanner = this._createHRTFPanner(-1.4, 0.1, -0.6);
            this.rightPanner = this._createHRTFPanner(1.4, 0.1, -0.6);

            this.splitter.connect(this.leftPanner, 0);
            this.splitter.connect(this.rightPanner, 1);

            this.leftPanner.connect(this.outputNode);
            this.rightPanner.connect(this.outputNode);

            // 3. Early Reflection & Room Crossfeed Network
            this.roomDelay = this.audioCtx.createDelay(0.1);
            this.roomDelay.delayTime.value = 0.015;

            this.roomFilter = this.audioCtx.createBiquadFilter();
            this.roomFilter.type = 'lowpass';
            this.roomFilter.frequency.value = 6500;

            this.roomGain = this.audioCtx.createGain();
            this.roomGain.gain.value = 0.0;

            // Connect spatial audio into room reflection network
            this.spatialBus.connect(this.roomDelay);
            this.roomDelay.connect(this.roomFilter);
            this.roomFilter.connect(this.roomGain);
            this.roomGain.connect(this.outputNode);

            this.applyMode(this.mode, true);
            return true;
        } catch (e) {
            console.warn('Spatial Audio Engine init failed:', e);
            return false;
        }
    }

    _createHRTFPanner(x, y, z) {
        const panner = this.audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 1;
        panner.coneInnerAngle = 360;

        if (panner.positionX) {
            panner.positionX.setValueAtTime(x, this.audioCtx.currentTime);
            panner.positionY.setValueAtTime(y, this.audioCtx.currentTime);
            panner.positionZ.setValueAtTime(z, this.audioCtx.currentTime);
        } else if (panner.setPosition) {
            panner.setPosition(x, y, z);
        }
        return panner;
    }

    _setPannerPosition(panner, x, y, z, duration = 0.08) {
        if (!panner || !this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        if (panner.positionX) {
            panner.positionX.cancelScheduledValues(now);
            panner.positionY.cancelScheduledValues(now);
            panner.positionZ.cancelScheduledValues(now);
            panner.positionX.linearRampToValueAtTime(x, now + duration);
            panner.positionY.linearRampToValueAtTime(y, now + duration);
            panner.positionZ.linearRampToValueAtTime(z, now + duration);
        } else if (panner.setPosition) {
            panner.setPosition(x, y, z);
        }
    }

    cycleMode() {
        const currentIdx = SPATIAL_MODES.indexOf(this.mode);
        const nextMode = SPATIAL_MODES[(currentIdx + 1) % SPATIAL_MODES.length];
        this.setMode(nextMode);
        return this.mode;
    }

    setMode(mode) {
        if (!SPATIAL_CONFIGS[mode]) mode = 'off';
        this.mode = mode;
        this.applyMode(mode);
        this.saveState();
        this.updateUI();

        if (window.player?.showToast) {
            const cfg = SPATIAL_CONFIGS[mode];
            const hint = mode === 'off' ? '[SPATIAL: OFF · DIRECT STEREO]' : `[SPATIAL: ${cfg.name} · ${cfg.label.toUpperCase()}]`;
            window.player.showToast(hint);
        }
    }

    applyMode(mode, immediate = false) {
        if (!this.audioCtx || !this.directGain) return;
        const cfg = SPATIAL_CONFIGS[mode] || SPATIAL_CONFIGS.off;
        const now = this.audioCtx.currentTime;
        const ramp = immediate ? 0.005 : 0.06;

        if (mode === 'off') {
            // Pure bit-perfect stereo bypass
            this.directGain.gain.cancelScheduledValues(now);
            this.directGain.gain.linearRampToValueAtTime(1.0, now + ramp);

            this.spatialBus.gain.cancelScheduledValues(now);
            this.spatialBus.gain.linearRampToValueAtTime(0.0, now + ramp);

            if (this.roomGain) {
                this.roomGain.gain.cancelScheduledValues(now);
                this.roomGain.gain.linearRampToValueAtTime(0.0, now + ramp);
            }
        } else {
            // Activate 3D Binaural Spatializer
            this.directGain.gain.cancelScheduledValues(now);
            this.directGain.gain.linearRampToValueAtTime(0.0, now + ramp);

            this.spatialBus.gain.cancelScheduledValues(now);
            this.spatialBus.gain.linearRampToValueAtTime(1.0, now + ramp);

            // Reposition Virtual 3D Stage Panners
            this._setPannerPosition(this.midPanner, 0, 0, -cfg.centerDist, ramp);
            this._setPannerPosition(this.leftPanner, -cfg.sideWidth, 0.15, -0.6, ramp);
            this._setPannerPosition(this.rightPanner, cfg.sideWidth, 0.15, -0.6, ramp);

            // Early Reflection & Room Acoustics
            if (this.roomGain && this.roomDelay && this.roomFilter) {
                this.roomDelay.delayTime.cancelScheduledValues(now);
                this.roomDelay.delayTime.linearRampToValueAtTime(cfg.roomDelay, now + ramp);

                this.roomFilter.frequency.cancelScheduledValues(now);
                this.roomFilter.frequency.linearRampToValueAtTime(cfg.cutoffFreq, now + ramp);

                this.roomGain.gain.cancelScheduledValues(now);
                this.roomGain.gain.linearRampToValueAtTime(cfg.roomGain, now + ramp);
            }
        }
    }

    updateUI() {
        const btns = document.querySelectorAll('#spatial-toggle-btn, .spatial-toggle-btn');
        btns.forEach(btn => {
            const isOff = this.mode === 'off';
            const name = (SPATIAL_CONFIGS[this.mode]?.name || this.mode).toUpperCase();
            btn.textContent = isOff ? '[SPATIAL: OFF]' : `[SPATIAL: ${name}]`;
            btn.classList.toggle('active', !isOff);
            btn.setAttribute('title', `Spatial Audio Mode: ${SPATIAL_CONFIGS[this.mode]?.label || name} (Press x)`);
        });

        // Synchronize Modern Apple-style Studio controls
        const modernPill = document.getElementById('modern-spatial-pill');
        if (modernPill) {
            const isOff = this.mode === 'off';
            const name = (SPATIAL_CONFIGS[this.mode]?.name || this.mode).toUpperCase();
            modernPill.innerHTML = isOff ? '<span>✦ SPATIAL AUDIO</span>' : `<span>✦ SPATIAL: ${name}</span>`;
            modernPill.classList.toggle('active', !isOff);
            modernPill.classList.toggle('modern-spatial-active', !isOff);
        }
        const segmentedBtns = document.querySelectorAll('#modern-spatial-segmented .popover-segmented-btn');
        segmentedBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.spatialMode === this.mode);
        });
    }

    saveState() {
        try {
            localStorage.setItem('pulseterm_spatial', this.mode);
        } catch {}
    }

    loadState() {
        try {
            const stored = localStorage.getItem('pulseterm_spatial');
            if (stored && SPATIAL_CONFIGS[stored]) {
                this.mode = stored;
            }
        } catch {}
    }
}

export const spatial = new SpatialAudioEngine();
window.spatial = spatial;
