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
        eqLowDb: 0.0,
        sideWidth: 0.5,
        sideEqPresence: 0.0,
        sideAirDb: 0.0,
        sideHpHz: 180,
        sideReverbSend: 0.0
    },
    studio: {
        name: 'STUDIO',
        label: 'Studio Monitors 3D',
        azimuthDeg: 35,
        radius: 1.5,
        dryMix: 0.35,
        roomGain: 0.02,
        reverbDuration: 0.35,
        decayTau: 0.10,
        predelay: 0.012,
        cutoffFreq: 5000,
        makeupDb: 0.0,
        eqHighDb: 3.0,
        eqLowDb: 1.5,
        sideWidth: 0.62,
        sideEqPresence: 2.0,
        sideAirDb: 1.0,
        sideHpHz: 180,
        sideReverbSend: 0.05
    },
    wide: {
        name: 'WIDE',
        label: 'Wide 3D Stage',
        azimuthDeg: 55,
        radius: 1.5,
        dryMix: 0.20,
        roomGain: 0.08,
        reverbDuration: 0.50,
        decayTau: 0.15,
        predelay: 0.018,
        cutoffFreq: 5500,
        makeupDb: -1.0, // Retuned to avoid clipping
        eqHighDb: 3.5,
        eqLowDb: 2.0,
        sideWidth: 0.80,
        sideEqPresence: 3.5,
        sideAirDb: 2.0,
        sideHpHz: 180,
        sideReverbSend: 0.10
    },
    concert: {
        name: 'CONCERT',
        label: 'Concert Hall',
        azimuthDeg: 45,
        radius: 2.0,
        dryMix: 0.10,
        roomGain: 0.15,
        reverbDuration: 0.75,
        decayTau: 0.22,
        predelay: 0.024,
        cutoffFreq: 4500,
        makeupDb: -0.5,
        eqHighDb: 2.5,
        eqLowDb: 1.5,
        sideWidth: 0.70,
        sideEqPresence: 2.0,
        sideAirDb: 1.5,
        sideHpHz: 180,
        sideReverbSend: 0.18
    }
};

class SpatialAudioEngine {
    constructor() {
        this.audioCtx = null;
        this.inputNode = null;
        this.outputNode = null;
        this.directGain = null;
        this.spatialBus = null;
        this.splitter = null;
        this.midGain = null;
        this.sideLGain = null;
        this.sideRGain = null;
        this.centerPanner = null;
        this.leftPanner = null;
        this.rightPanner = null;
        this.highShelf = null;
        this.lowShelf = null;
        this.mode = 'off';
        this._reverbCache = new Map();
        
        this._isSpatialBusConnected = false;
        this._idleTimeout = null;
        this._reverbChangeId = 0;
        
        this.loadState();
    }

    _setParam(param, val, t, tc = 0.1) {
        if (param && Number.isFinite(val)) {
            param.setTargetAtTime(val, t, tc);
        } else if (!param) {
            // silent fail for missing nodes
        } else {
            console.warn('SpatialAudioEngine: Invalid non-finite value for AudioParam', val);
        }
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
            this._isSpatialBusConnected = true;

            // Channel Splitter (0: Left, 1: Right)
            this.splitter = this.audioCtx.createChannelSplitter(2);
            this.spatialBus.connect(this.splitter);

            // Configure Native Web Audio Listener
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

            // M/S Matrix
            this.midGain = this.audioCtx.createGain();
            this.sideLGain = this.audioCtx.createGain();
            this.sideRGain = this.audioCtx.createGain();
            this.midGain.gain.value = 0.5;
            this.sideLGain.gain.value = 0.5;
            this.sideRGain.gain.value = 0.5;

            // Connect Mid
            this.splitter.connect(this.midGain, 0);
            this.splitter.connect(this.midGain, 1);

            // Invert Nodes for Sides
            this.invertL = this.audioCtx.createGain();
            this.invertL.gain.value = -1.0;
            this.splitter.connect(this.invertL, 0);

            this.invertR = this.audioCtx.createGain();
            this.invertR.gain.value = -1.0;
            this.splitter.connect(this.invertR, 1);

            // SideL = L - R
            this.splitter.connect(this.sideLGain, 0);
            this.invertR.connect(this.sideLGain);
            
            // SideR = R - L
            this.splitter.connect(this.sideRGain, 1);
            this.invertL.connect(this.sideRGain);

            // FEATURE a: Side high-pass
            this.sideHpL = this.audioCtx.createBiquadFilter();
            this.sideHpL.type = 'highpass';
            this.sideHpL.frequency.value = 180;
            this.sideHpL.Q.value = 0.707;
            this.sideHpR = this.audioCtx.createBiquadFilter();
            this.sideHpR.type = 'highpass';
            this.sideHpR.frequency.value = 180;
            this.sideHpR.Q.value = 0.707;
            this.sideLGain.connect(this.sideHpL);
            this.sideRGain.connect(this.sideHpR);

            // FEATURE b: Presence (3000 Hz, Q 0.8)
            this.sideEqL = this.audioCtx.createBiquadFilter();
            this.sideEqL.type = 'peaking';
            this.sideEqL.frequency.value = 3000;
            this.sideEqL.Q.value = 0.8;
            this.sideEqL.gain.value = 0.0;
            this.sideEqR = this.audioCtx.createBiquadFilter();
            this.sideEqR.type = 'peaking';
            this.sideEqR.frequency.value = 3000;
            this.sideEqR.Q.value = 0.8;
            this.sideEqR.gain.value = 0.0;
            this.sideHpL.connect(this.sideEqL);
            this.sideHpR.connect(this.sideEqR);

            // FEATURE b: Air (9000 Hz highshelf)
            this.sideAirL = this.audioCtx.createBiquadFilter();
            this.sideAirL.type = 'highshelf';
            this.sideAirL.frequency.value = 9000;
            this.sideAirL.gain.value = 0.0;
            this.sideAirR = this.audioCtx.createBiquadFilter();
            this.sideAirR.type = 'highshelf';
            this.sideAirR.frequency.value = 9000;
            this.sideAirR.gain.value = 0.0;
            this.sideEqL.connect(this.sideAirL);
            this.sideEqR.connect(this.sideAirR);

            // HRTF Panners
            this.centerPanner = this._createHRTFPanner(0, 0, -1.0);
            this.leftPanner = this._createHRTFPanner(-1.0, 0, -1.0);
            this.rightPanner = this._createHRTFPanner(1.0, 0, -1.0);

            this.midGain.connect(this.centerPanner);
            this.sideAirL.connect(this.leftPanner);
            this.sideAirR.connect(this.rightPanner);

            // Reverb Network
            this.convolver = this.audioCtx.createConvolver();
            this.reverbWetGain = this.audioCtx.createGain();
            this.reverbWetGain.gain.value = 0.0;
            this.spatialBus.connect(this.convolver);
            
            // FEATURE c: Side reverb send via ChannelMerger to prevent phase cancellation
            this.sideMerger = this.audioCtx.createChannelMerger(2);
            this.sideSendGain = this.audioCtx.createGain();
            this.sideSendGain.gain.value = 0.0;
            this.sideAirL.connect(this.sideMerger, 0, 0);
            this.sideAirR.connect(this.sideMerger, 0, 1);
            this.sideMerger.connect(this.sideSendGain);
            this.sideSendGain.connect(this.convolver); // Feed into existing stereo convolver
            
            this.convolver.connect(this.reverbWetGain);

            // EQ
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

    _createHRTFPanner(x, y, z) {
        const panner = this.audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 0; // BUG 2: Fix loudness variation
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

    _getReverbBuffer(cfg) {
        if (!this.audioCtx || !cfg || !cfg.reverbDuration) return null;
        const cacheKey = `${cfg.reverbDuration}_${cfg.decayTau}_${cfg.predelay}_${cfg.cutoffFreq}`;
        if (this._reverbCache.has(cacheKey)) return this._reverbCache.get(cacheKey);

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

    applyMode(modeName, force = false) {
        // BUG 6: Validation
        if (!SPATIAL_MODES.includes(modeName)) modeName = 'off';
        if (this.mode === modeName && !force) return;
        this.mode = modeName;

        try { localStorage.setItem('pulseterm_spatial_mode', this.mode); } catch {}

        if (!this.audioCtx || !this.spatialBus) return;

        const cfg = SPATIAL_CONFIGS[this.mode];
        const t = this.audioCtx.currentTime + 0.05;

        // BUG 5: Idle CPU in off mode
        clearTimeout(this._idleTimeout);
        if (this.mode === 'off') {
            this._idleTimeout = setTimeout(() => {
                if (this.mode === 'off' && this._isSpatialBusConnected) {
                    this.spatialBus.disconnect();
                    this._isSpatialBusConnected = false;
                }
            }, 400);
        } else {
            if (!this._isSpatialBusConnected) {
                this.spatialBus.connect(this.splitter);
                this.spatialBus.connect(this.convolver);
                this._isSpatialBusConnected = true;
            }
        }

        if (this.mode === 'off') {
            this._setParam(this.spatialBus.gain, 0.0, t);
            this._setParam(this.directGain.gain, 1.0, t);
            this._setParam(this.highShelf?.gain, 0.0, t);
            this._setParam(this.lowShelf?.gain, 0.0, t);
            this._setParam(this.makeupGain?.gain, 1.0, t);
            this._setParam(this.reverbWetGain?.gain, 0.0, t);
            
            // Backing vocal features bypass
            this._setParam(this.sideLGain?.gain, 0.5, t);
            this._setParam(this.sideRGain?.gain, 0.5, t);
            this._setParam(this.sideEqL?.gain, 0.0, t);
            this._setParam(this.sideEqR?.gain, 0.0, t);
            this._setParam(this.sideAirL?.gain, 0.0, t);
            this._setParam(this.sideAirR?.gain, 0.0, t);
            this._setParam(this.sideSendGain?.gain, 0.0, t);
            
            this._reverbChangeId++;
        } else {
            this._setParam(this.spatialBus.gain, 1.0, t);
            this._setParam(this.directGain.gain, cfg.dryMix, t);
            
            // Center is constant at (0, 0, -radius)
            if (this.centerPanner) {
                if (this.centerPanner.positionZ) {
                    this._setParam(this.centerPanner.positionX, 0, t);
                    this._setParam(this.centerPanner.positionZ, -cfg.radius, t);
                } else {
                    this.centerPanner.setPosition(0, 0, -cfg.radius);
                }
            }

            const { x, z } = calculatePannerCoordinates(cfg.azimuthDeg, cfg.radius);
            if (this.leftPanner && this.rightPanner) {
                if (this.leftPanner.positionX) {
                    this._setParam(this.leftPanner.positionX, -x, t);
                    this._setParam(this.leftPanner.positionZ, z, t);
                    this._setParam(this.rightPanner.positionX, x, t);
                    this._setParam(this.rightPanner.positionZ, z, t);
                } else {
                    this.leftPanner.setPosition(-x, 0, z);
                    this.rightPanner.setPosition(x, 0, z);
                }
            }

            this._setParam(this.highShelf?.gain, cfg.eqHighDb, t);
            this._setParam(this.lowShelf?.gain, cfg.eqLowDb, t);
            
            const dbToLinear = Math.pow(10, cfg.makeupDb / 20);
            this._setParam(this.makeupGain?.gain, dbToLinear, t);

            // Feature d: Backing Vocal Config Setup
            this._setParam(this.midGain?.gain, 0.5, t);
            this._setParam(this.sideLGain?.gain, cfg.sideWidth, t);
            this._setParam(this.sideRGain?.gain, cfg.sideWidth, t);
            this._setParam(this.sideEqL?.gain, cfg.sideEqPresence, t);
            this._setParam(this.sideEqR?.gain, cfg.sideEqPresence, t);
            this._setParam(this.sideAirL?.gain, cfg.sideAirDb, t);
            this._setParam(this.sideAirR?.gain, cfg.sideAirDb, t);
            this._setParam(this.sideSendGain?.gain, cfg.sideReverbSend, t);

            // BUG 4: Prevent clicks on buffer swap
            if (this.convolver && this.reverbWetGain) {
                const newBuffer = this._getReverbBuffer(cfg);
                if (newBuffer) {
                    if (this.convolver.buffer !== newBuffer) {
                        const curId = ++this._reverbChangeId;
                        this._setParam(this.reverbWetGain.gain, 0.0, t, 0.05);
                        setTimeout(() => {
                            if (this._reverbChangeId === curId) {
                                this.convolver.buffer = newBuffer;
                                const tNext = this.audioCtx.currentTime + 0.05;
                                this._setParam(this.reverbWetGain.gain, cfg.roomGain, tNext, 0.1);
                            }
                        }, 60);
                    } else {
                        this._setParam(this.reverbWetGain.gain, cfg.roomGain, t);
                    }
                }
            }
        }
    }

    updateUI() {
        const panelBtn = document.getElementById('spatial-panel-btn');
        const dashBtn = document.getElementById('spatial-toggle-btn');
        const label = `[SPATIAL: ${SPATIAL_CONFIGS[this.mode].name}]`;
        const isActive = this.mode !== 'off';
        
        if (panelBtn) {
            panelBtn.textContent = label;
            panelBtn.classList.toggle('active', isActive);
        }
        if (dashBtn) {
            dashBtn.textContent = label;
            dashBtn.classList.toggle('active', isActive);
        }
    }

    cycleMode() {
        const idx = SPATIAL_MODES.indexOf(this.mode);
        const nextMode = SPATIAL_MODES[(idx + 1) % SPATIAL_MODES.length];
        this.applyMode(nextMode);
        this.updateUI();
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
if (typeof window !== "undefined") window.spatial = spatial;
