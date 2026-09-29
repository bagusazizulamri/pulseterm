import { calculatePannerCoordinates, generateSyntheticReverbIR } from './eq-core.js';

export const SPATIAL_MODES = ['off', 'studio', 'wide', 'concert'];

export const SPATIAL_CONFIGS = {
    off: {
        name: 'OFF',
        label: 'Stereo (Bypass)',
        azimuthDeg: 0,
        radius: 1.5,
        dryMix: 1.0,
        roomGain: 0.0,
        reverbDuration: 0.3,
        decayTau: 0.1,
        predelay: 0.015,
        cutoffFreq: 5000,
        makeupDb: 0.0,
        eqHighDb: 0.0,
        eqLowDb: 0.0
    },
    studio: {
        name: 'STUDIO',
        label: 'Studio Monitors 3D',
        azimuthDeg: 35,       // Standard monitor azimuth
        radius: 1.5,
        dryMix: 0.35,         // 35% original stereo clarity
        roomGain: 0.02,       // Very dry, no mud
        reverbDuration: 0.35,
        decayTau: 0.10,
        predelay: 0.012,
        cutoffFreq: 5000,
        makeupDb: 0.5,        // Gain makeup
        eqHighDb: 3.5,        // Restore treble
        eqLowDb: 2.0          // Restore bass
    },
    wide: {
        name: 'WIDE',
        label: 'Wide 3D Stage',
        azimuthDeg: 55,       // Ultra-wide
        radius: 1.5,
        dryMix: 0.20,         // Less dry, more 3D
        roomGain: 0.08,       // Out-of-head immersive spatialization
        reverbDuration: 0.50,
        decayTau: 0.15,
        predelay: 0.018,
        cutoffFreq: 5500,
        makeupDb: 1.0,
        eqHighDb: 4.5,        // Extra treble for extreme width
        eqLowDb: 2.5
    },
    concert: {
        name: 'CONCERT',
        label: 'Concert Hall',
        azimuthDeg: 45,       // Grand concert hall
        radius: 2.0,
        dryMix: 0.10,         // Mostly wet
        roomGain: 0.15,       // Lush acoustic hall reflections
        reverbDuration: 0.75,
        decayTau: 0.22,
        predelay: 0.024,
        cutoffFreq: 4500,
        makeupDb: 1.5,
        eqHighDb: 3.0,
        eqLowDb: 2.0
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

        // Splitter
        this.splitter = null;
        
        // Mid-Side nodes
        this.midGain = null;
        this.sideLGain = null;
        this.sideRGain = null;

        // 3D Panners
        this.centerPanner = null;
        this.leftPanner = null;
        this.rightPanner = null;

        // HRTF Compensation EQ
        this.highShelf = null;
        this.lowShelf = null;

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

            // Direct stereo bypass / Dry blend bus
            this.directGain = this.audioCtx.createGain();
            this.directGain.gain.value = this.mode === 'off' ? 1.0 : SPATIAL_CONFIGS[this.mode].dryMix;
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
            // Mid = (L + R) * 0.5
            // SideL = (L - R) * 0.5
            // SideR = (R - L) * 0.5
            this.midGain = this.audioCtx.createGain();
            this.sideLGain = this.audioCtx.createGain();
            this.sideRGain = this.audioCtx.createGain();

            this.midGain.gain.value = 0.5;
            this.sideLGain.gain.value = 0.5;
            this.sideRGain.gain.value = 0.5;

            // Connect Mid (L+R)
            this.splitter.connect(this.midGain, 0); // L -> Mid
            this.splitter.connect(this.midGain, 1); // R -> Mid

            // Connect Side Left (L-R)
            this.splitter.connect(this.sideLGain, 0); // L -> SideL (positive)
            
            // To subtract R, we need a phase inversion. 
            // Web Audio API doesn't have a direct phase invert without a DelayNode or custom Gain.
            // Let's create phase invert nodes for Side L and Side R.
            this.invertL = this.audioCtx.createGain();
            this.invertL.gain.value = -1.0;
            this.splitter.connect(this.invertL, 0); // L -> invertL

            this.invertR = this.audioCtx.createGain();
            this.invertR.gain.value = -1.0;
            this.splitter.connect(this.invertR, 1); // R -> invertR

            // SideL = L + (-R)
            this.invertR.connect(this.sideLGain);
            
            // SideR = R + (-L)
            this.splitter.connect(this.sideRGain, 1); // R -> SideR (positive)
            this.invertL.connect(this.sideRGain); // -L -> SideR

            // Binaural HRTF Panners (Center, Left, Right)
            this.centerPanner = this._createHRTFPanner(0, 0, -1.0);
            this.leftPanner = this._createHRTFPanner(-1.0, 0, -1.0);
            this.rightPanner = this._createHRTFPanner(1.0, 0, -1.0);

            this.midGain.connect(this.centerPanner);
            this.sideLGain.connect(this.leftPanner);
            this.sideRGain.connect(this.rightPanner);

            // Reverb Network
            this.convolver = this.audioCtx.createConvolver();
            this.reverbWetGain = this.audioCtx.createGain();
            this.reverbWetGain.gain.value = 0.0;
            
            // Send Side and Mid to convolver
            this.spatialBus.connect(this.convolver);
            this.convolver.connect(this.reverbWetGain);

            // HRTF Compensation EQ
            this.highShelf = this.audioCtx.createBiquadFilter();
            this.highShelf.type = 'highshelf';
            this.highShelf.frequency.value = 4000;
            this.highShelf.gain.value = 0.0;

            this.lowShelf = this.audioCtx.createBiquadFilter();
            this.lowShelf.type = 'lowshelf';
            this.lowShelf.frequency.value = 150;
            this.lowShelf.gain.value = 0.0;

            this.makeupGain = this.audioCtx.createGain();
            this.makeupGain.gain.value = 1.0;

            // Connect Panners -> EQ -> Makeup -> Output
            this.centerPanner.connect(this.lowShelf);
            this.leftPanner.connect(this.lowShelf);
            this.rightPanner.connect(this.lowShelf);
            this.reverbWetGain.connect(this.lowShelf);

            this.lowShelf.connect(this.highShelf);
            this.highShelf.connect(this.makeupGain);
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
        panner.rolloffFactor = 1;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        panner.coneOuterGain = 1;

        if (panner.positionX) {
            panner.positionX.value = x;
            panner.positionY.value = y;
            panner.positionZ.value = z;
        } else if (panner.setPosition) {
            panner.setPosition(x, y, z);
        }
        return panner;
    }

    applyMode(modeName, force = false) {
        if (this.mode === modeName && !force) return;
        if (!SPATIAL_MODES.includes(modeName)) modeName = 'off';
        this.mode = modeName;

        try { localStorage.setItem('pulseterm_spatial_mode', this.mode); } catch {}

        if (!this.audioCtx || !this.spatialBus) return; // Not initialized yet

        const cfg = SPATIAL_CONFIGS[this.mode];
        const t = this.audioCtx.currentTime + 0.05; // 50ms fade

        if (this.mode === 'off') {
            this.spatialBus.gain.setTargetAtTime(0.0, t, 0.1);
            this.directGain.gain.setTargetAtTime(1.0, t, 0.1);
            if (this.reverbWetGain) this.reverbWetGain.gain.setTargetAtTime(0.0, t, 0.1);
            if (this.highShelf) this.highShelf.gain.setTargetAtTime(0.0, t, 0.1);
            if (this.lowShelf) this.lowShelf.gain.setTargetAtTime(0.0, t, 0.1);
        } else {
            this.spatialBus.gain.setTargetAtTime(1.0, t, 0.1);
            this.directGain.gain.setTargetAtTime(cfg.dryMix, t, 0.1);

            const { x, z } = calculatePannerCoordinates(cfg.azimuthDeg, cfg.radius);
            
            // Center stays at (0, 0, -radius)
            if (this.centerPanner) {
                if (this.centerPanner.positionZ) {
                    this.centerPanner.positionX.setTargetAtTime(0, t, 0.1);
                    this.centerPanner.positionZ.setTargetAtTime(-cfg.radius, t, 0.1);
                } else {
                    this.centerPanner.setPosition(0, 0, -cfg.radius);
                }
            }

            if (this.leftPanner && this.rightPanner) {
                if (this.leftPanner.positionX) {
                    this.leftPanner.positionX.setTargetAtTime(-x, t, 0.1);
                    this.leftPanner.positionZ.setTargetAtTime(z, t, 0.1);
                    
                    this.rightPanner.positionX.setTargetAtTime(x, t, 0.1);
                    this.rightPanner.positionZ.setTargetAtTime(z, t, 0.1);
                } else {
                    this.leftPanner.setPosition(-x, 0, z);
                    this.rightPanner.setPosition(x, 0, z);
                }
            }

            // Update EQ Compensation
            if (this.highShelf) this.highShelf.gain.setTargetAtTime(cfg.eqHighDb, t, 0.1);
            if (this.lowShelf) this.lowShelf.gain.setTargetAtTime(cfg.eqLowDb, t, 0.1);

            // Reverb
            if (this.convolver && this.reverbWetGain) {
                const buffer = this._getReverbBuffer(cfg);
                if (buffer) {
                    this.convolver.buffer = buffer;
                    this.reverbWetGain.gain.setTargetAtTime(cfg.roomGain, t, 0.1);
                } else {
                    this.reverbWetGain.gain.setTargetAtTime(0.0, t, 0.1);
                }
            }
        }

        // Makeup gain
        if (this.makeupGain) {
            const dbToLinear = Math.pow(10, cfg.makeupDb / 20);
            this.makeupGain.gain.setTargetAtTime(dbToLinear, t, 0.1);
        }
    }

    cycleMode() {
        const idx = SPATIAL_MODES.indexOf(this.mode);
        const nextMode = SPATIAL_MODES[(idx + 1) % SPATIAL_MODES.length];
        this.applyMode(nextMode);

        const btn = document.getElementById('spatial-panel-btn');
        if (btn) {
            btn.textContent = `[SPATIAL: ${SPATIAL_CONFIGS[nextMode].name}]`;
            btn.classList.toggle('active', nextMode !== 'off');
        }
        return nextMode;
    }

    loadState() {
        try {
            const stored = localStorage.getItem('pulseterm_spatial_mode');
            if (stored && SPATIAL_MODES.includes(stored)) {
                this.mode = stored;
            }
        } catch {}
    }
}

export const spatial = new SpatialAudioEngine();
window.spatial = spatial; // For global access from inline handlers
