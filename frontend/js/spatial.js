import { calculatePannerCoordinates, generateSyntheticReverbIR } from './eq-core.js';

export const SPATIAL_MODES = ['off', 'studio', 'wide', 'concert'];

export const SPATIAL_CONFIGS = {
    off: {
        name: 'OFF', label: 'Stereo (Bypass)', sideAzDeg: 0, sideElev: 0, radius: 1.5,
        dryMix: 1.0, roomGain: 0.0, reverbDuration: 0.3, decayTau: 0.1, predelay: 0.015, cutoffFreq: 5000,
        makeupDb: 0.0, eqHighDb: 0.0, eqLowDb: 0.0, sideWidth: 0.5, sideEqPresence: 0.0, sideAirDb: 0.0, sideHpHz: 180, sideReverbGain: 0.0,
        midGain: 0.5, midBodyDb: -100, haloDb: -100, haloAzDeg: 90, haloElev: 0, haloDelayL: 0.011, haloDelayR: 0.019, erDb: -100
    },
    studio: {
        name: 'STUDIO', label: 'Studio Monitors 3D', sideAzDeg: 65, sideElev: 0.15, radius: 1.5,
        dryMix: 0.45, roomGain: 0.02, reverbDuration: 0.35, decayTau: 0.10, predelay: 0.012, cutoffFreq: 5000,
        makeupDb: -4, eqHighDb: 0.5, eqLowDb: 3.5, sideWidth: 1.3, sideEqPresence: 2.0, sideAirDb: 0.5, sideHpHz: 180, sideReverbGain: 0.05,
        midGain: 1.2, midBodyDb: 0, haloDb: -15, haloAzDeg: 80, haloElev: 0.22, haloDelayL: 0.011, haloDelayR: 0.019, erDb: -24
    },
    wide: {
        name: 'WIDE', label: 'Wide 3D Stage', sideAzDeg: 95, sideElev: 0.25, radius: 1.5,
        dryMix: 0.35, roomGain: 0.08, reverbDuration: 0.50, decayTau: 0.15, predelay: 0.018, cutoffFreq: 5500,
        makeupDb: -5, eqHighDb: 0.5, eqLowDb: 4.5, sideWidth: 1.4, sideEqPresence: 2.5, sideAirDb: 1.0, sideHpHz: 180, sideReverbGain: 0.10,
        midGain: 1.2, midBodyDb: 0, haloDb: -13, haloAzDeg: 100, haloElev: 0.37, haloDelayL: 0.011, haloDelayR: 0.019, erDb: -20
    },
    concert: {
        name: 'CONCERT', label: 'Concert Hall', sideAzDeg: 105, sideElev: 0.25, radius: 2.0,
        dryMix: 0.25, roomGain: 0.15, reverbDuration: 0.75, decayTau: 0.22, predelay: 0.024, cutoffFreq: 4500,
        makeupDb: -5, eqHighDb: 0.5, eqLowDb: 5, sideWidth: 1.5, sideEqPresence: 2.0, sideAirDb: 1.0, sideHpHz: 180, sideReverbGain: 0.18,
        midGain: 1.2, midBodyDb: 0, haloDb: -13, haloAzDeg: 110, haloElev: 0.50, haloDelayL: 0.011, haloDelayR: 0.019, erDb: -18
    }
};

class SpatialAudioEngine {
    constructor() {
        this.audioCtx = null;
        this.inputNode = null;
        this.outputNode = null;
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
            this.inputNode = this.audioCtx.createGain();
            this.outputNode = this.audioCtx.createGain();

            this.directGain = this.audioCtx.createGain();
            this.directGain.gain.value = this.mode === 'off' ? 1.0 : SPATIAL_CONFIGS[this.mode].dryMix;
            this.inputNode.connect(this.directGain);
            this.directGain.connect(this.outputNode);

            this.spatialBus = this.audioCtx.createGain();
            this.spatialBus.gain.value = this.mode === 'off' ? 0.0 : 1.0;
            this.inputNode.connect(this.spatialBus);
            this._isSpatialBusConnected = false; // BUG 1 FIXED

            this.splitter = this.audioCtx.createChannelSplitter(2);

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

            this.midGain = this.audioCtx.createGain();
            this.sideLGain = this.audioCtx.createGain();
            this.sideRGain = this.audioCtx.createGain();
            this.midGain.gain.value = 0.5;
            this.sideLGain.gain.value = 0.5;
            this.sideRGain.gain.value = 0.5;

            this.splitter.connect(this.midGain, 0);
            this.splitter.connect(this.midGain, 1);

            this.invertL = this.audioCtx.createGain();
            this.invertL.gain.value = -1.0;
            this.splitter.connect(this.invertL, 0);

            this.invertR = this.audioCtx.createGain();
            this.invertR.gain.value = -1.0;
            this.splitter.connect(this.invertR, 1);

            this.splitter.connect(this.sideLGain, 0);
            this.invertR.connect(this.sideLGain);
            this.splitter.connect(this.sideRGain, 1);
            this.invertL.connect(this.sideRGain);

            // Side HPF
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

            // Side Presence
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

            // Side Air
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

            // Mid Body
            this.midBodyHPF = this.audioCtx.createBiquadFilter();
            this.midBodyHPF.type = 'highpass';
            this.midBodyHPF.frequency.value = 200;
            this.midBodyLPF = this.audioCtx.createBiquadFilter();
            this.midBodyLPF.type = 'lowpass';
            this.midBodyLPF.frequency.value = 1200;
            this.midBodyGain = this.audioCtx.createGain();
            this.midBodyGain.gain.value = 0.0;
            this.midGain.connect(this.midBodyHPF);
            this.midBodyHPF.connect(this.midBodyLPF);
            this.midBodyLPF.connect(this.midBodyGain);

            // Halo Vocal Decorrelation
            this.haloHPF = this.audioCtx.createBiquadFilter();
            this.haloHPF.type = 'highpass';
            this.haloHPF.frequency.value = 1200;
            this.haloLPF = this.audioCtx.createBiquadFilter();
            this.haloLPF.type = 'lowpass';
            this.haloLPF.frequency.value = 6000;
            
            this.midGain.connect(this.haloHPF);
            this.haloHPF.connect(this.haloLPF);

            this.haloDelayL = this.audioCtx.createDelay(0.1);
            this.haloDelayL.delayTime.value = 0.011;
            this.haloDelayR = this.audioCtx.createDelay(0.1);
            this.haloDelayR.delayTime.value = 0.019;

            this.haloAllpassL = this.audioCtx.createBiquadFilter();
            this.haloAllpassL.type = 'allpass';
            this.haloAllpassL.frequency.value = 1800;
            this.haloAllpassL.Q.value = 0.7;
            this.haloAllpassR = this.audioCtx.createBiquadFilter();
            this.haloAllpassR.type = 'allpass';
            this.haloAllpassR.frequency.value = 2600;
            this.haloAllpassR.Q.value = 0.7;

            this.haloGainL = this.audioCtx.createGain();
            this.haloGainL.gain.value = 0.0;
            this.haloGainR = this.audioCtx.createGain();
            this.haloGainR.gain.value = 0.0;

            this.haloLPF.connect(this.haloDelayL);
            this.haloDelayL.connect(this.haloAllpassL);
            this.haloAllpassL.connect(this.haloGainL);

            this.haloLPF.connect(this.haloDelayR);
            this.haloDelayR.connect(this.haloAllpassR);
            this.haloAllpassR.connect(this.haloGainR);

            // Early Reflections
            this.erSum = this.audioCtx.createGain();
            this.erSum.gain.value = 0.5;
            this.splitter.connect(this.erSum, 0);
            this.splitter.connect(this.erSum, 1);

            const erDelays = [0.011, 0.017, 0.023, 0.031];
            const erGains = [0.35, 0.25, 0.20, 0.15];
            const erAzimuths = [-45, 45, -135, 135];
            
            this.erMasterGain = this.audioCtx.createGain();
            this.erMasterGain.gain.value = 0.0;

            this.erNodes = [];
            for (let i = 0; i < 4; i++) {
                const delay = this.audioCtx.createDelay(0.1);
                delay.delayTime.value = erDelays[i];
                const gain = this.audioCtx.createGain();
                gain.gain.value = erGains[i];
                const panner = this._createHRTFPanner(0, 0, 0);
                
                this.erSum.connect(delay);
                delay.connect(gain);
                gain.connect(panner);
                panner.connect(this.erMasterGain);
                
                this.erNodes.push({ delay, gain, panner, az: erAzimuths[i] });
            }

            // HRTF Panners
            this.centerPanner = this._createHRTFPanner(0, 0, -1.0);
            this.leftPanner = this._createHRTFPanner(-1.0, 0, -1.0);
            this.rightPanner = this._createHRTFPanner(1.0, 0, -1.0);
            this.haloPannerL = this._createHRTFPanner(-1.0, 0.5, -0.5);
            this.haloPannerR = this._createHRTFPanner(1.0, 0.5, -0.5);

            this.midGain.connect(this.centerPanner);
            this.midBodyGain.connect(this.centerPanner);
            this.sideAirL.connect(this.leftPanner);
            this.sideAirR.connect(this.rightPanner);
            this.haloGainL.connect(this.haloPannerL);
            this.haloGainR.connect(this.haloPannerR);

            // Reverb
            this.convolver = this.audioCtx.createConvolver();
            this.reverbWetGain = this.audioCtx.createGain();
            this.reverbWetGain.gain.value = 0.0;
            
            this.sideConvolver = this.audioCtx.createConvolver();
            this.sideReverbGain = this.audioCtx.createGain();
            this.sideReverbGain.gain.value = 0.0;
            
            this.sideMerger = this.audioCtx.createChannelMerger(2);
            this.sideAirL.connect(this.sideMerger, 0, 0);
            this.sideAirR.connect(this.sideMerger, 0, 1);
            this.sideMerger.connect(this.sideConvolver);
            this.sideConvolver.connect(this.sideReverbGain);

            this.convolver.connect(this.reverbWetGain);

            // Master EQ
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
            this.haloPannerL.connect(this.lowShelf);
            this.haloPannerR.connect(this.lowShelf);
            this.erMasterGain.connect(this.lowShelf);
            this.reverbWetGain.connect(this.lowShelf);
            this.sideReverbGain.connect(this.lowShelf);

            this.lowShelf.connect(this.highShelf);
            this.highShelf.connect(this.makeupGain);
            this.makeupGain.connect(this.outputNode);

            this._connectSpatialBuses();
            this.applyMode(this.mode, true);
            return true;
        } catch (e) {
            console.warn('Spatial Audio Engine init failed:', e);
            return false;
        }
    }

    _connectSpatialBuses() {
        if (!this._isSpatialBusConnected && this.spatialBus) {
            this.spatialBus.connect(this.splitter);
            this.spatialBus.connect(this.convolver);
            this._isSpatialBusConnected = true;
        }
    }

    _disconnectSpatialBuses() {
        if (this._isSpatialBusConnected && this.spatialBus) {
            this.spatialBus.disconnect();
            this._isSpatialBusConnected = false;
        }
    }

    _createHRTFPanner(x, y, z) {
        const panner = this.audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 0;
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
            sampleRate, cfg.reverbDuration, cfg.decayTau, cfg.predelay, cfg.cutoffFreq
        );
        const buffer = this.audioCtx.createBuffer(2, left.length, sampleRate);
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
        this._reverbCache.set(cacheKey, buffer);
        return buffer;
    }

    applyMode(modeName, force = false) {
        if (!SPATIAL_MODES.includes(modeName)) modeName = 'off';
        if (this.mode === modeName && !force) return;
        this.mode = modeName;

        try { localStorage.setItem('pulseterm_spatial_mode', this.mode); } catch {}

        if (!this.audioCtx || !this.spatialBus) return;

        const cfg = SPATIAL_CONFIGS[this.mode];
        const t = this.audioCtx.currentTime + 0.01;
        const tc = 0.05;
        this._reverbChangeId++;

        clearTimeout(this._idleTimeout);
        if (this.mode === 'off') {
            this._idleTimeout = setTimeout(() => {
                if (this.mode === 'off') {
                    this._disconnectSpatialBuses();
                }
            }, 1000);
        } else {
            this._connectSpatialBuses();
        }

        if (this.mode === 'off') {
            this._setParam(this.spatialBus.gain, 0.0, t, tc);
            this._setParam(this.directGain.gain, 1.0, t, tc);
            this._setParam(this.highShelf?.gain, 0.0, t, tc);
            this._setParam(this.lowShelf?.gain, 0.0, t, tc);
            this._setParam(this.makeupGain?.gain, 1.0, t, tc);
            this._setParam(this.reverbWetGain?.gain, 0.0, t, tc);
            this._setParam(this.sideReverbGain?.gain, 0.0, t, tc);
            
            this._setParam(this.midGain?.gain, 0.5, t, tc);
            this._setParam(this.midBodyGain?.gain, 0.0, t, tc);
            this._setParam(this.sideLGain?.gain, 0.5, t, tc);
            this._setParam(this.sideRGain?.gain, 0.5, t, tc);
            this._setParam(this.sideEqL?.gain, 0.0, t, tc);
            this._setParam(this.sideEqR?.gain, 0.0, t, tc);
            this._setParam(this.sideAirL?.gain, 0.0, t, tc);
            this._setParam(this.sideAirR?.gain, 0.0, t, tc);

            this._setParam(this.haloGainL?.gain, 0.0, t, tc);
            this._setParam(this.haloGainR?.gain, 0.0, t, tc);
            this._setParam(this.erMasterGain?.gain, 0.0, t, tc);
        } else {
            this._setParam(this.spatialBus.gain, 1.0, t, tc);
            this._setParam(this.directGain.gain, cfg.dryMix, t, tc);
            
            if (this.centerPanner) {
                if (this.centerPanner.positionZ) {
                    this._setParam(this.centerPanner.positionX, 0, t, tc);
                    this._setParam(this.centerPanner.positionY, 0, t, tc);
                    this._setParam(this.centerPanner.positionZ, -cfg.radius, t, tc);
                } else {
                    this.centerPanner.setPosition(0, 0, -cfg.radius);
                }
            }

            const { x: sx, z: sz } = calculatePannerCoordinates(cfg.sideAzDeg, cfg.radius);
            if (this.leftPanner && this.rightPanner) {
                if (this.leftPanner.positionX) {
                    this._setParam(this.leftPanner.positionX, -sx, t, tc);
                    this._setParam(this.leftPanner.positionY, cfg.sideElev, t, tc);
                    this._setParam(this.leftPanner.positionZ, sz, t, tc);
                    this._setParam(this.rightPanner.positionX, sx, t, tc);
                    this._setParam(this.rightPanner.positionY, cfg.sideElev, t, tc);
                    this._setParam(this.rightPanner.positionZ, sz, t, tc);
                } else {
                    this.leftPanner.setPosition(-sx, cfg.sideElev, sz);
                    this.rightPanner.setPosition(sx, cfg.sideElev, sz);
                }
            }

            const { x: hx, z: hz } = calculatePannerCoordinates(cfg.haloAzDeg, cfg.radius);
            if (this.haloPannerL && this.haloPannerR) {
                if (this.haloPannerL.positionX) {
                    this._setParam(this.haloPannerL.positionX, -hx, t, tc);
                    this._setParam(this.haloPannerL.positionY, cfg.haloElev, t, tc);
                    this._setParam(this.haloPannerL.positionZ, hz, t, tc);
                    this._setParam(this.haloPannerR.positionX, hx, t, tc);
                    this._setParam(this.haloPannerR.positionY, cfg.haloElev, t, tc);
                    this._setParam(this.haloPannerR.positionZ, hz, t, tc);
                } else {
                    this.haloPannerL.setPosition(-hx, cfg.haloElev, hz);
                    this.haloPannerR.setPosition(hx, cfg.haloElev, hz);
                }
            }

            if (this.erNodes && this.erNodes.length > 0) {
                this.erNodes.forEach(node => {
                    const { x: ex, z: ez } = calculatePannerCoordinates(node.az, cfg.radius);
                    if (node.panner.positionX) {
                        this._setParam(node.panner.positionX, ex, t, tc);
                        this._setParam(node.panner.positionY, 0.5, t, tc);
                        this._setParam(node.panner.positionZ, ez, t, tc);
                    } else {
                        node.panner.setPosition(ex, 0.5, ez);
                    }
                });
                const erLinear = Math.pow(10, cfg.erDb / 20);
                this._setParam(this.erMasterGain?.gain, erLinear, t, tc);
            }

            this._setParam(this.highShelf?.gain, cfg.eqHighDb, t, tc);
            this._setParam(this.lowShelf?.gain, cfg.eqLowDb, t, tc);
            
            const dbToLinear = Math.pow(10, cfg.makeupDb / 20);
            this._setParam(this.makeupGain?.gain, dbToLinear, t, tc);

            this._setParam(this.midGain?.gain, cfg.midGain, t, tc);
            const midBodyLinear = Math.pow(10, cfg.midBodyDb / 20);
            this._setParam(this.midBodyGain?.gain, midBodyLinear, t, tc);
            
            this._setParam(this.sideLGain?.gain, cfg.sideWidth, t, tc);
            this._setParam(this.sideRGain?.gain, cfg.sideWidth, t, tc);
            this._setParam(this.sideEqL?.gain, cfg.sideEqPresence, t, tc);
            this._setParam(this.sideEqR?.gain, cfg.sideEqPresence, t, tc);
            this._setParam(this.sideAirL?.gain, cfg.sideAirDb, t, tc);
            this._setParam(this.sideAirR?.gain, cfg.sideAirDb, t, tc);
            
            const haloLinear = Math.pow(10, cfg.haloDb / 20);
            this._setParam(this.haloGainL?.gain, haloLinear, t, tc);
            this._setParam(this.haloGainR?.gain, haloLinear, t, tc);

            if (this.haloDelayL && this.haloDelayL.delayTime.value !== cfg.haloDelayL) {
                this.haloDelayL.delayTime.value = cfg.haloDelayL;
            }
            if (this.haloDelayR && this.haloDelayR.delayTime.value !== cfg.haloDelayR) {
                this.haloDelayR.delayTime.value = cfg.haloDelayR;
            }

            if (this.convolver && this.reverbWetGain) {
                const newBuffer = this._getReverbBuffer(cfg);
                if (newBuffer) {
                    if (this.convolver.buffer !== newBuffer) {
                        const curId = this._reverbChangeId;
                        this._setParam(this.reverbWetGain.gain, 0.0, t, 0.05);
                        this._setParam(this.sideReverbGain.gain, 0.0, t, 0.05);
                        
                        setTimeout(() => {
                            if (this._reverbChangeId === curId) {
                                this.convolver.buffer = newBuffer;
                                if (this.sideConvolver) this.sideConvolver.buffer = newBuffer;
                                
                                const tNext = this.audioCtx.currentTime + 0.05;
                                this._setParam(this.reverbWetGain.gain, cfg.roomGain, tNext, 0.1);
                                this._setParam(this.sideReverbGain.gain, cfg.sideReverbGain, tNext, 0.1);
                            }
                        }, 250);
                    } else {
                        this._setParam(this.reverbWetGain.gain, cfg.roomGain, t, tc);
                        this._setParam(this.sideReverbGain.gain, cfg.sideReverbGain, t, tc);
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
