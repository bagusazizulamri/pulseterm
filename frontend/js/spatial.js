import { calculatePannerCoordinates, generateSyntheticReverbIR } from './eq-core.js';

export const SPATIAL_MODES = ['off', 'studio', 'wide', 'concert'];

export const SPATIAL_CONFIGS = {
    off: {
        name: 'OFF', label: 'Stereo (Bypass)', sideAzDeg: 0, sideElev: 0, radius: 1.5,
        dryMix: 1.0, roomGain: 0.0, reverbDuration: 0.3, decayTau: 0.1, predelay: 0.015, cutoffFreq: 5000,
        makeupDb: 0.0, eqHighDb: 0.0, sideWidth: 0.5, sideEqPresence: 0.0, sideAirDb: 0.0, sideHpHz: 180, sideReverbGain: 0.0,
        midGain: 0.5, midBodyDb: -100, haloDb: -100, haloAzDeg: 90, haloElev: 0, haloDelayL: 0.011, haloDelayR: 0.019, erDb: -100,
        bassMonoDb: -1.0
    },
    studio: {
        name: 'STUDIO', label: 'Studio Monitors 3D', sideAzDeg: 55, sideElev: 0.15, radius: 1.5,
        dryMix: 0.55, roomGain: 0.018, reverbDuration: 0.40, decayTau: 0.10, predelay: 0.012, cutoffFreq: 5000,
        makeupDb: -7, eqHighDb: 0.5, sideWidth: 1.30, sideEqPresence: 8.5, sideAirDb: 0.5, sideHpHz: 180, sideReverbGain: 0.04,
        midGain: 1.10, midBodyDb: 0, haloDb: -14, haloAzDeg: 80, haloElev: 0.22, haloDelayL: 0.013, haloDelayR: 0.023, erDb: -23,
        bassMonoDb: -2.0
    },
    wide: {
        name: 'WIDE', label: 'Wide 3D Stage', sideAzDeg: 75, sideElev: 0.25, radius: 1.5,
        dryMix: 0.32, roomGain: 0.10, reverbDuration: 0.65, decayTau: 0.18, predelay: 0.018, cutoffFreq: 5500,
        makeupDb: -10, eqHighDb: 0.5, sideWidth: 1.80, sideEqPresence: 10.0, sideAirDb: 1.0, sideHpHz: 180, sideReverbGain: 0.12,
        midGain: 1.10, midBodyDb: 0, haloDb: -10, haloAzDeg: 100, haloElev: 0.37, haloDelayL: 0.015, haloDelayR: 0.025, erDb: -18,
        bassMonoDb: -2.5
    },
    concert: {
        name: 'CONCERT', label: 'Concert Hall', sideAzDeg: 90, sideElev: 0.25, radius: 2.0,
        dryMix: 0.22, roomGain: 0.20, reverbDuration: 0.95, decayTau: 0.28, predelay: 0.024, cutoffFreq: 4500,
        makeupDb: -12, eqHighDb: 0.5, sideWidth: 2.00, sideEqPresence: 9.5, sideAirDb: 1.0, sideHpHz: 180, sideReverbGain: 0.22,
        midGain: 1.05, midBodyDb: 0, haloDb: -8, haloAzDeg: 110, haloElev: 0.50, haloDelayL: 0.017, haloDelayR: 0.029, erDb: -16,
        bassMonoDb: -3.0
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

    _setParam(param, val, t, tc = 0.1, immediate = false) {
        if (param && Number.isFinite(val)) {
            if (immediate && typeof param.setValueAtTime === 'function') {
                const now = this.audioCtx ? this.audioCtx.currentTime : 0;
                if (typeof param.cancelScheduledValues === 'function') {
                    param.cancelScheduledValues(now);
                }
                param.setValueAtTime(val, now);
            } else if (typeof param.setTargetAtTime === 'function') {
                param.setTargetAtTime(val, t, tc);
            } else if ('value' in param) {
                param.value = val;
            }
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

            // Master limiter: DynamicsCompressor sebagai brick-wall safety net.
            // Threshold -8 dB → output tidak pernah exceed -2 dBFS (ratio 12:1).
            // Ratio 12:1 + knee 0 dB = near-brick-wall. Attack 1ms menahan
            // transient peak. Goal-aligned: izinkan peak clipping ringan
            // (≤-2 dBFS) supaya separasi & width tetap agresif.
            this.masterLimiter = this.audioCtx.createDynamicsCompressor();
            this.masterLimiter.threshold.value = -14;
            this.masterLimiter.knee.value = 0;
            this.masterLimiter.ratio.value = 20;
            this.masterLimiter.attack.value = 0.001;
            this.masterLimiter.release.value = 0.15;

            const isOff = this.mode === 'off';

            // Direct clean bypass node for Spatial OFF (pure 0.00 dB flat passthrough).
            // Mode off: bypassGain=1 langsung ke outputNode (pure stereo, no limiter / no coloration).
            // Mode aktif: bypassGain=0, wetOutGain=1 via spatialSink -> masterLimiter -> wetOutGain -> outputNode.
            this.bypassGain = this.audioCtx.createGain();
            this.bypassGain.gain.value = isOff ? 1.0 : 0.0;
            this.inputNode.connect(this.bypassGain);
            this.bypassGain.connect(this.outputNode);

            // Active spatial path sink (dry + bass + wet -> masterLimiter -> wetOutGain -> outputNode)
            this.spatialSink = this.audioCtx.createGain();

            this.directGain = this.audioCtx.createGain();
            this.directGain.gain.value = isOff ? 0.0 : (SPATIAL_CONFIGS[this.mode]?.dryMix || 0.0);
            this.directGain.connect(this.spatialSink);

            // Clean Phase Bass Management
            // spatialBusHPF keeps HRTF from muddying bass
            
            // Spatial HRTF gets High-Pass
            this.spatialBusHPF = this.audioCtx.createBiquadFilter();
            this.spatialBusHPF.type = 'highpass';
            this.spatialBusHPF.frequency.value = 150;
            this.spatialBusHPF.Q.value = 0.707;

            // Dry Path gets High-Pass
            this.dryHPF = this.audioCtx.createBiquadFilter();
            this.dryHPF.type = 'highpass';
            this.dryHPF.frequency.value = 150;
            this.dryHPF.Q.value = 0.707;

            this.inputNode.connect(this.dryHPF);
            this.dryHPF.connect(this.directGain);

            // Mono Bass gets Low-Pass
            this.bassLPF = this.audioCtx.createBiquadFilter();
            this.bassLPF.type = 'lowpass';
            this.bassLPF.frequency.value = 150;
            this.bassLPF.Q.value = 0.707;
            this.bassLPF.channelCount = 1;
            this.bassLPF.channelCountMode = 'explicit';
            
            const bassMonoDb = SPATIAL_CONFIGS[this.mode]?.bassMonoDb;
            const bassMonoLinear = (!isOff && bassMonoDb !== undefined)
                ? Math.pow(10, bassMonoDb / 20)
                : 0.0;
            this.bassMonoGain = this.audioCtx.createGain();
            this.bassMonoGain.gain.value = bassMonoLinear;
            this.inputNode.connect(this.bassLPF);
            this.bassLPF.connect(this.bassMonoGain);
            this.bassMonoGain.connect(this.spatialSink);

            this.spatialBus = this.audioCtx.createGain();
            this.spatialBus.gain.value = isOff ? 0.0 : 1.0;
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

            // Early Reflections: 5 nodes default. Lebih banyak nodes = richer room.
            // Concert mode override ke 7 nodes untuk hall yang lebih luas.
            const erDelays = [0.011, 0.017, 0.023, 0.031, 0.043];
            const erGains = [0.32, 0.24, 0.19, 0.14, 0.11];
            const erAzimuths = [-60, 60, -120, 120, 180];
            const erNodeCount = 5;
            
            this.erMasterGain = this.audioCtx.createGain();
            this.erMasterGain.gain.value = 0.0;

            this.erNodes = [];
            for (let i = 0; i < erNodeCount; i++) {
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

            this.makeupGain = this.audioCtx.createGain();
            this.makeupGain.gain.value = 1.0;

            this.centerPanner.connect(this.highShelf);
            this.leftPanner.connect(this.highShelf);
            this.rightPanner.connect(this.highShelf);
            this.haloPannerL.connect(this.highShelf);
            this.haloPannerR.connect(this.highShelf);
            this.erMasterGain.connect(this.highShelf);
            this.reverbWetGain.connect(this.highShelf);
            this.sideReverbGain.connect(this.highShelf);

            // Chain: highShelf → makeupGain → spatialSink → masterLimiter → wetOutGain → outputNode.
            // Limiter menahan peak pada active spatial path saja. Mode OFF bypassGain
            // terhubung langsung ke outputNode tanpa compression/coloration.
            this.highShelf.connect(this.makeupGain);
            this.makeupGain.connect(this.spatialSink);

            this.spatialSink.connect(this.masterLimiter);

            this.wetOutGain = this.audioCtx.createGain();
            this.wetOutGain.gain.value = isOff ? 0.0 : 1.0;
            this.masterLimiter.connect(this.wetOutGain);
            this.wetOutGain.connect(this.outputNode);

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
            this.spatialBus.connect(this.spatialBusHPF);
            this.spatialBusHPF.connect(this.splitter);
            this.spatialBusHPF.connect(this.convolver);
            this._isSpatialBusConnected = true;
        }
    }

    _disconnectSpatialBuses() {
        if (this._isSpatialBusConnected && this.spatialBus) {
            this.spatialBus.disconnect();
            this.spatialBusHPF.disconnect();
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
            this._setParam(this.bypassGain?.gain, 1.0, t, tc, force);
            this._setParam(this.wetOutGain?.gain, 0.0, t, tc, force);
            this._setParam(this.spatialBus?.gain, 0.0, t, tc, force);
            this._setParam(this.directGain?.gain, 0.0, t, tc, force);
            this._setParam(this.bassMonoGain?.gain, 0.0, t, tc, force);

            this._setParam(this.highShelf?.gain, 0.0, t, tc, force);
            
            this._setParam(this.makeupGain?.gain, 1.0, t, tc, force);
            this._setParam(this.reverbWetGain?.gain, 0.0, t, tc, force);
            this._setParam(this.sideReverbGain?.gain, 0.0, t, tc, force);
            
            this._setParam(this.midGain?.gain, 0.5, t, tc, force);
            this._setParam(this.midBodyGain?.gain, 0.0, t, tc, force);
            this._setParam(this.sideLGain?.gain, 0.5, t, tc, force);
            this._setParam(this.sideRGain?.gain, 0.5, t, tc, force);
            this._setParam(this.sideEqL?.gain, 0.0, t, tc, force);
            this._setParam(this.sideEqR?.gain, 0.0, t, tc, force);
            this._setParam(this.sideAirL?.gain, 0.0, t, tc, force);
            this._setParam(this.sideAirR?.gain, 0.0, t, tc, force);

            this._setParam(this.haloGainL?.gain, 0.0, t, tc, force);
            this._setParam(this.haloGainR?.gain, 0.0, t, tc, force);
            this._setParam(this.erMasterGain?.gain, 0.0, t, tc, force);
        } else {
            this._setParam(this.bypassGain?.gain, 0.0, t, tc, force);
            this._setParam(this.wetOutGain?.gain, 1.0, t, tc, force);
            this._setParam(this.spatialBus?.gain, 1.0, t, tc, force);
            this._setParam(this.directGain?.gain, cfg.dryMix, t, tc, force);
            // Bass mono: cfg.bassMonoDb (-1.0..-3.0 dB) → linear attenuation.
            // BUG FIX: sebelumnya hard-coded -1.0 LINEAR (= negasi fasa 180°),
            // bukan -1.0 dB. Convert via Math.pow(10, db/20).
            const bassMonoLinear = cfg.bassMonoDb !== undefined
                ? Math.pow(10, cfg.bassMonoDb / 20)
                : Math.pow(10, -1.0 / 20);
            this._setParam(this.bassMonoGain?.gain, bassMonoLinear, t, tc, force);


            
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
                this._setParam(this.erMasterGain?.gain, erLinear, t, tc, force);
            }

            this._setParam(this.highShelf?.gain, cfg.eqHighDb, t, tc, force);
            
            
            const dbToLinear = Math.pow(10, cfg.makeupDb / 20);
            this._setParam(this.makeupGain?.gain, dbToLinear, t, tc, force);

            this._setParam(this.midGain?.gain, cfg.midGain, t, tc, force);
            const midBodyLinear = Math.pow(10, cfg.midBodyDb / 20);
            this._setParam(this.midBodyGain?.gain, midBodyLinear, t, tc, force);
            
            this._setParam(this.sideLGain?.gain, cfg.sideWidth, t, tc, force);
            this._setParam(this.sideRGain?.gain, cfg.sideWidth, t, tc, force);
            this._setParam(this.sideEqL?.gain, cfg.sideEqPresence, t, tc, force);
            this._setParam(this.sideEqR?.gain, cfg.sideEqPresence, t, tc, force);
            this._setParam(this.sideAirL?.gain, cfg.sideAirDb, t, tc, force);
            this._setParam(this.sideAirR?.gain, cfg.sideAirDb, t, tc, force);
            
            const haloLinear = Math.pow(10, cfg.haloDb / 20);
            this._setParam(this.haloGainL?.gain, haloLinear, t, tc, force);
            this._setParam(this.haloGainR?.gain, haloLinear, t, tc, force);

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
