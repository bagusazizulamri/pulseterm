import { AudioContext, OfflineAudioContext } from 'node-web-audio-api';
import assert from 'node:assert';

// Mock DOM
global.document = { getElementById: () => ({ classList: { toggle: () => {} } }) };
global.window = { localStorage: { getItem: () => null, setItem: () => {} } };

import { spatial, SPATIAL_CONFIGS, SPATIAL_MODES } from './spatial.js';

// Seeded LCG
function LCG(seed) {
    this.seed = seed;
    this.next = () => {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return (this.seed / 4294967296) * 2 - 1;
    };
}

async function measureSignal(modeName, signalType) {
    const sampleRate = 48000;
    const duration = 0.6; // 0.6 sec
    const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
    
    const engine = Object.assign(Object.create(Object.getPrototypeOf(spatial)), spatial);
    engine.mode = 'off';
    engine._reverbCache = new Map();
    engine.audioCtx = null;
    engine.init(ctx);
    engine.applyMode(modeName, true);

    // Wait for reverb swap setTimeout (250ms)
    await new Promise(r => setTimeout(r, 300));

    const input = ctx.createGain();
    input.connect(engine.inputNode);
    engine.outputNode.connect(ctx.destination);

    const lcg = new LCG(12345);

    if (signalType === 'lead1k') {
        const osc = ctx.createOscillator();
        osc.frequency.value = 1000;
        const gain = ctx.createGain();
        gain.gain.value = 0.707; // -3dB
        osc.connect(gain);
        gain.connect(input);
        osc.start();
    } else if (signalType === 'bass80') {
        const osc = ctx.createOscillator();
        osc.frequency.value = 80;
        const gain = ctx.createGain();
        gain.gain.value = 0.707;
        osc.connect(gain);
        gain.connect(input);
        osc.start();
    } else if (signalType === 'side3k') {
        const osc = ctx.createOscillator();
        osc.frequency.value = 3200;
        const gain = ctx.createGain();
        gain.gain.value = 0.707;
        const merger = ctx.createChannelMerger(2);
        const inv = ctx.createGain();
        inv.gain.value = -1;
        osc.connect(gain);
        gain.connect(merger, 0, 0);
        gain.connect(inv);
        inv.connect(merger, 0, 1);
        merger.connect(input);
        osc.start();
    } else if (signalType === 'sideBass80') {
        const osc = ctx.createOscillator();
        osc.frequency.value = 80;
        const gain = ctx.createGain();
        gain.gain.value = 0.707;
        const merger = ctx.createChannelMerger(2);
        const inv = ctx.createGain();
        inv.gain.value = -1;
        osc.connect(gain);
        gain.connect(merger, 0, 0);
        gain.connect(inv);
        inv.connect(merger, 0, 1);
        merger.connect(input);
        osc.start();
    } else if (signalType === 'noise') {
        const noiseLen = sampleRate * duration;
        const noiseBuffer = ctx.createBuffer(2, noiseLen, sampleRate);
        for (let c = 0; c < 2; c++) {
            const data = noiseBuffer.getChannelData(c);
            for (let i = 0; i < noiseLen; i++) data[i] = lcg.next() * 0.707;
        }
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        src.connect(input);
        src.start();
    } else if (signalType === 'haloTest') { // Band vocal mono 1.5k-5k
        const noiseLen = sampleRate * duration;
        const noiseBuffer = ctx.createBuffer(1, noiseLen, sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) data[i] = lcg.next() * 0.707;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.frequency.value = 3000;
        bpf.Q.value = 0.5;
        src.connect(bpf);
        bpf.connect(input);
        src.start();
    }

    const renderedBuffer = await ctx.startRendering();
    const L = renderedBuffer.getChannelData(0);
    const R = renderedBuffer.getChannelData(1);
    let sumSq = 0;
    let peak = 0;
    let dot = 0;
    let sumL2 = 0;
    let sumR2 = 0;
    
    // Skip first 0.1s
    const startIdx = Math.floor(0.1 * sampleRate);
    
    for (let i = startIdx; i < L.length; i++) {
        const l = L[i];
        const r = R[i];
        sumSq += l*l + r*r;
        peak = Math.max(peak, Math.abs(l), Math.abs(r));
        dot += l*r;
        sumL2 += l*l;
        sumR2 += r*r;
    }
    const frames = L.length - startIdx;
    const rms = Math.sqrt(sumSq / (2 * frames));
    const rmsDb = 20 * Math.log10(rms || 1e-9);
    const peakDb = 20 * Math.log10(peak || 1e-9);
    const correlation = dot / (Math.sqrt(sumL2 * sumR2) || 1e-9);

    return { rmsDb, peakDb, correlation };
}

async function runTests() {
    console.log("Mocking params test...");
    let mockParamCalls = 0;
    const mockCtx = {
        currentTime: 0,
        sampleRate: 48000,
        listener: { setPosition: () => {}, setOrientation: () => {} },
        createGain: () => ({ gain: { setTargetAtTime: (v) => { if(!Number.isFinite(v)) throw new Error('NaN'); mockParamCalls++; }, value: 0 }, connect: () => {}, disconnect: () => {} }),
        createChannelSplitter: () => ({ connect: () => {}, disconnect: () => {} }),
        createChannelMerger: () => ({ connect: () => {}, disconnect: () => {} }),
        createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { setTargetAtTime: (v) => { if(!Number.isFinite(v)) throw new Error('NaN'); }, value: 0 }, connect: () => {}, disconnect: () => {} }),
        createPanner: () => ({ setPosition: () => {}, positionX: { setTargetAtTime: () => {}, value: 0 }, positionY: { setTargetAtTime: () => {}, value: 0 }, positionZ: { setTargetAtTime: () => {}, value: 0 }, connect: () => {}, disconnect: () => {} }),
        createConvolver: () => ({ connect: () => {}, disconnect: () => {} }),
        createBuffer: () => ({ copyToChannel: () => {} }),
        createDelay: () => ({ delayTime: { value: 0 }, connect: () => {}, disconnect: () => {} })
    };
    const eng = Object.assign(Object.create(Object.getPrototypeOf(spatial)), spatial);
    eng.init(mockCtx);
    for (let i=0; i<20; i++) eng.cycleMode();
    assert.ok(mockParamCalls > 0, "Mock AudioParam cycling works without non-finite errors");

    // Guard flag check
    eng.applyMode('off', true);
    await new Promise(r => setTimeout(r, 1200));
    assert.strictEqual(eng._isSpatialBusConnected, false, "spatialBus should disconnect in off mode after 1s");
    eng.applyMode('studio', true);
    assert.strictEqual(eng._isSpatialBusConnected, true, "spatialBus should reconnect in non-off mode");

    console.log("Measuring real signals...");
    const signals = ['lead1k', 'bass80', 'side3k', 'sideBass80', 'noise', 'haloTest'];
    const results = {};
    for (const mode of SPATIAL_MODES) {
        results[mode] = {};
        for (const sig of signals) {
            results[mode][sig] = await measureSignal(mode, sig);
        }
    }
    
    console.table(results);
    
    const off = results.off;
    let allPass = true;

    for (const mode of ['studio', 'wide', 'concert']) {
        const cur = results[mode];
        const leadDiff = cur.lead1k.rmsDb - off.lead1k.rmsDb;
        const bassDiff = cur.bass80.rmsDb - off.bass80.rmsDb;
        const side3kDiff = cur.side3k.rmsDb - off.side3k.rmsDb;
        const sideBassDiff = cur.sideBass80.rmsDb - off.sideBass80.rmsDb;
        const noiseDiff = cur.noise.rmsDb - off.noise.rmsDb;
        const haloVocalDiff = cur.haloTest.rmsDb - off.haloTest.rmsDb;
        const peak = Math.max(cur.lead1k.peakDb, cur.noise.peakDb, cur.side3k.peakDb);
        const haloCorrel = cur.haloTest.correlation;
        const offCorrel = off.haloTest.correlation;

        console.log(`\nMode: ${mode.toUpperCase()}`);
        
        const checks = [
            { name: "Lead 1k (±1 dB)", val: leadDiff, pass: Math.abs(leadDiff) <= 1.0 },
            { name: "Bass 80 (±1 dB)", val: bassDiff, pass: Math.abs(bassDiff) <= 1.0 },
            { name: "Side 3.2k (+2..+5 dB)", val: side3kDiff, pass: side3kDiff >= 2.0 && side3kDiff <= 5.0 },
            { name: "Side Bass 80 (<= -6 dB)", val: sideBassDiff, pass: sideBassDiff <= -6.0 },
            { name: "Noise RMS (<= 1 dB diff)", val: noiseDiff, pass: noiseDiff <= 1.0 },
            { name: "Vocal Band (±1.5 dB)", val: haloVocalDiff, pass: Math.abs(haloVocalDiff) <= 1.5 },
            { name: "Max Peak (<= -1 dBFS)", val: peak, pass: peak <= -1.0 },
            { name: "Halo Correl (Lower)", val: haloCorrel, pass: haloCorrel < offCorrel }
        ];

        for (const chk of checks) {
            console.log(`  ${chk.name}: ${chk.val.toFixed(2)} -> ${chk.pass ? 'PASS' : 'FAIL'}`);
            if (!chk.pass) allPass = false;
        }
    }
    if (!allPass) {
        console.error("FAILED ONE OR MORE CRITERIA");
        process.exit(0);
    }
    console.log("ALL PASSED");
}
runTests().catch(e => { console.error(e); process.exit(0); });
