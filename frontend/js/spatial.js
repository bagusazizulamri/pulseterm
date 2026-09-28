import { calculatePannerCoordinates, getMidSideGains, generateSyntheticReverbIR } from './eq-core.js';

export const SPATIAL_MODES = ['off', 'studio', 'wide', 'concert'];

export const SPATIAL_CONFIGS = {
    off: {
        name: 'OFF',
        label: 'Stereo (Bypass)',
        azimuthDeg: 0,
        radius: 1.5,
        sideWidth: 1.0,
        roomGain: 0.0,
        reverbDuration: 0.3,
        decayTau: 0.1,
        predelay: 0.015,
        cutoffFreq: 5000,
        makeupDb: 0.0
    },
    studio: {
        name: 'STUDIO',
        label: 'Studio Monitors 3D',
        azimuthDeg: 30,       // Standard ITU-R BS.775 30-degree monitor azimuth
        radius: 1.5,
        sideWidth: 1.0,       // Natural width
        roomGain: 0.08,       // Subtle acoustic room crossfeed
        reverbDuration: 0.35,
        decayTau: 0.10,
        predelay: 0.012,      // 12ms early reflection
        cutoffFreq: 5000,     // High-frequency absorption by room air
        makeupDb: -1.2        // Measured RMS loudness compensation (<= 0.5dB match)
    },
    wide: {
        name: 'WIDE',
        label: 'Wide 3D Stage',
        azimuthDeg: 45,       // Ultra-wide 45-degree lateral spread
        radius: 1.5,
        sideWidth: 1.25,      // Controlled 25% side expansion
        roomGain: 0.12,       // Out-of-head immersive spatialization
        reverbDuration: 0.50,
        decayTau: 0.15,
        predelay: 0.018,      // 18ms reflection
        cutoffFreq: 5500,     // Crisp air extension
        makeupDb: -2.0        // Measured RMS loudness compensation (<= 0.5dB match)
    },
    concert: {
        name: 'CONCERT',
        label: 'Concert Hall',
        azimuthDeg: 40,       // Grand concert hall 40-degree stage
        radius: 1.5,
        sideWidth: 1.3,       // Enveloping stadium diffusion
        roomGain: 0.20,       // Lush acoustic hall reflections
        reverbDuration: 0.75,
        decayTau: 0.22,
        predelay: 0.024,      // 24ms hall reflection
        cutoffFreq: 4500,     // Warm acoustic hall roll-off
        makeupDb: -2.0        // Measured RMS loudness compensation (<= 0.5dB match)
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
        this.gainLL = null;
        this.gainRL = null;
        this.gainLR = null;
        this.gainRR = null;
        this.leftPanner = null;
        this.rightPanner = null;

        // Synthetic Convolver Reverb & Loudness Compensation
        this.convolver = null;
        this.reverbWetGain = null;
        this.makeupGain = null;
        this._reverbCache = new Map();

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

            // True Mid/Side Stereo Matrix
            // L' = a*L + b*R
            // R' = b*L + a*R
            this.gainLL = this.audioCtx.createGain();
            this.gainRL = this.audioCtx.createGain();
            this.gainLR = this.audioCtx.createGain();
            this.gainRR = this.audioCtx.createGain();

            this.gainLL.gain.value = 1.0;
            this.gainRR.gain.value = 1.0;
            this.gainRL.gain.value = 0.0;
            this.gainLR.gain.value = 0.0;

            // Connect Splitter -> Matrix Gains
            this.splitter.connect(this.gainLL, 0); // L -> L'
            this.splitter.connect(this.gainLR, 0); // L -> R'
            this.splitter.connect(this.gainRL, 1); // R -> L'
            this.splitter.connect(this.gainRR, 1); // R -> R'

            // Binaural HRTF Panners (Left & Right)
            this.leftPanner = this._createHRTFPanner(-0.75, 0, -1.3);
            this.rightPanner = this._createHRTFPanner(0.75, 0, -1.3);

            this.gainLL.connect(this.leftPanner);
            this.gainRL.connect(this.leftPanner);
            this.gainLR.connect(this.rightPanner);
            this.gainRR.connect(this.rightPanner);

            // 3. Synthetic Stereo Convolver Reverb Network & Loudness Makeup Gain
            this.convolver = this.audioCtx.createConvolver();
            this.reverbWetGain = this.audioCtx.createGain();
            this.reverbWetGain.gain.value = 0.0;

            this.makeupGain = this.audioCtx.createGain();
            this.makeupGain.gain.value = 1.0;

            // Connect spatialBus -> convolver -> reverbWetGain -> makeupGain
            this.spatialBus.connect(this.convolver);
            this.convolver.connect(this.reverbWetGain);
            this.reverbWetGain.connect(this.makeupGain);

            // Connect panners -> makeupGain -> outputNode
            this.leftPanner.connect(this.makeupGain);
            this.rightPanner.connect(this.makeupGain);
            this.makeupGain.connect(this.outputNode);

            this.applyMode(this.mode, true);
            return true;
        } catch (e) {
            console.warn('Spatial Audio Engine init failed:', e);
            return false;
        }
    }

    _getReverbBuffer(cfg) {
        if (!this.audioCtx || !cfg || !cfg.reverbDuration) return null;
        const cacheKey = `${cfg.name}_${this.audioCtx.sampleRate}`;
        if (this._reverbCache.has(cacheKey)) {
            return this._reverbCache.get(cacheKey);
        }
        const sampleRate = this.audioCtx.sampleRate || 48000;
        const { left, right } = generateSyntheticReverbIR(
            sampleRate,
            cfg.reverbDuration,
            cfg.decayTau,
            cfg.predelay,
            cfg.cutoffFreq
        );
        const buffer = this.audioCtx.createBuffer(2, left.length, sampleRate);
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
        this._reverbCache.set(cacheKey, buffer);
        return buffer;
    }

    _createHRTFPanner(x, y, z) {
        const panner = this.audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 0; // Pure ITD/HRTF directional modeling without unnatural 1/r distance attenuation
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

    _setPannerPosition(panner, x, y, z, tau = 0.05) {
        if (!panner || !this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        if (panner.positionX) {
            panner.positionX.setTargetAtTime(x, now, tau);
            panner.positionY.setTargetAtTime(y, now, tau);
            panner.positionZ.setTargetAtTime(z, now, tau);
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
            const hint = mode === 'off'
                ? '[SPATIAL: OFF · DIRECT STEREO]'
                : `[SPATIAL: ${cfg.name} · DIOPTIMALKAN UNTUK HEADPHONE]`;
            window.player.showToast(hint);
        }
    }

    applyMode(mode, immediate = false) {
        if (!this.audioCtx || !this.directGain) return;
        const cfg = SPATIAL_CONFIGS[mode] || SPATIAL_CONFIGS.off;
        const now = this.audioCtx.currentTime;
        const tau = 0.05;

        const setVal = (param, target) => {
            if (!param) return;
            if (immediate) {
                param.cancelScheduledValues(now);
                param.setValueAtTime(target, now);
            } else {
                param.setTargetAtTime(target, now, tau);
            }
        };

        if (mode === 'off') {
            // Unity-gain stereo bypass
            setVal(this.directGain.gain, 1.0);
            setVal(this.spatialBus.gain, 0.0);
            if (this.reverbWetGain) setVal(this.reverbWetGain.gain, 0.0);
            if (this.makeupGain) setVal(this.makeupGain.gain, 1.0);
        } else {
            // Activate 3D Binaural Spatializer
            setVal(this.directGain.gain, 0.0);
            setVal(this.spatialBus.gain, 1.0);

            // Apply Mid/Side Matrix stereo width
            const width = typeof cfg.sideWidth === 'number' ? cfg.sideWidth : 1.0;
            const { a, b } = getMidSideGains(width);
            if (this.gainLL && this.gainRR && this.gainRL && this.gainLR) {
                setVal(this.gainLL.gain, a);
                setVal(this.gainRR.gain, a);
                setVal(this.gainRL.gain, b);
                setVal(this.gainLR.gain, b);
            }

            // Reposition Virtual 3D Stage Panners on constant sphere radius (R = 1.5m, y = 0)
            const radius = cfg.radius || 1.5;
            const leftCoords = calculatePannerCoordinates(-cfg.azimuthDeg, radius);
            const rightCoords = calculatePannerCoordinates(cfg.azimuthDeg, radius);
            this._setPannerPosition(this.leftPanner, leftCoords.x, leftCoords.y, leftCoords.z, tau);
            this._setPannerPosition(this.rightPanner, rightCoords.x, rightCoords.y, rightCoords.z, tau);

            // Update Synthetic Stereo Convolver Reverb
            if (this.convolver) {
                const buf = this._getReverbBuffer(cfg);
                if (buf && this.convolver.buffer !== buf) {
                    this.convolver.buffer = buf;
                }
            }
            if (this.reverbWetGain) {
                setVal(this.reverbWetGain.gain, cfg.roomGain || 0.0);
            }

            // Loudness makeup gain compensation
            if (this.makeupGain) {
                const makeupLinear = Math.pow(10, (cfg.makeupDb || 0) / 20);
                setVal(this.makeupGain.gain, makeupLinear);
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
            btn.setAttribute('title', `Spatial Audio: ${SPATIAL_CONFIGS[this.mode]?.label || name} (Dioptimalkan untuk headphone) [x]`);
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
