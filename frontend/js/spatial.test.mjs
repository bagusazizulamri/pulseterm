import { AudioContext, OfflineAudioContext } from 'node-web-audio-api';
import fs from 'fs';

// Mock DOM
global.document = { getElementById: () => ({ classList: { toggle: () => {} } }) };
global.window = { localStorage: { getItem: () => null, setItem: () => {} } };

import { spatial, SPATIAL_CONFIGS, SPATIAL_MODES } from './spatial.js';

async function measureMode(modeName) {
    const sampleRate = 48000;
    const duration = 2.0; // 2 seconds
    const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
    
    // Create engine instance manually to avoid global state issues between runs
    const engine = Object.assign(Object.create(Object.getPrototypeOf(spatial)), spatial);
    engine.mode = 'off';
    engine._reverbCache = new Map();
    engine.init(ctx);
    engine.applyMode(modeName, true);
    console.log("Mode:", modeName, "makeupGain:", engine.makeupGain.gain.value);

    // Create test signals
    const oscLead = ctx.createOscillator();
    oscLead.frequency.value = 1000;
    const gainLead = ctx.createGain();
    gainLead.gain.value = Math.pow(10, -3 / 20); // -3 dBFS
    
    const oscBass = ctx.createOscillator();
    oscBass.frequency.value = 80;
    const gainBass = ctx.createGain();
    gainBass.gain.value = Math.pow(10, -3 / 20);

    const oscBacking = ctx.createOscillator();
    oscBacking.frequency.value = 3200;
    const gainBacking = ctx.createGain();
    gainBacking.gain.value = Math.pow(10, -3 / 20);
    // Backing is Side channel (L=-R). We use a merger.
    const mergerBacking = ctx.createChannelMerger(2);
    const invR = ctx.createGain();
    invR.gain.value = -1.0;
    
    oscBacking.connect(gainBacking);
    gainBacking.connect(mergerBacking, 0, 0);
    gainBacking.connect(invR);
    invR.connect(mergerBacking, 0, 1);

    // Noise for stereo RMS / correlation
    const noiseLen = sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(2, noiseLen, sampleRate);
    for (let c = 0; c < 2; c++) {
        const data = noiseBuffer.getChannelData(c);
        for (let i = 0; i < noiseLen; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }
    }
    const srcNoise = ctx.createBufferSource();
    srcNoise.buffer = noiseBuffer;
    
    // Halo test: bandpass noise 1.5-5kHz mono
    const haloNoiseBuffer = ctx.createBuffer(1, noiseLen, sampleRate);
    const hdata = haloNoiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
        hdata[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const srcHalo = ctx.createBufferSource();
    srcHalo.buffer = haloNoiseBuffer;
    const haloBPF = ctx.createBiquadFilter();
    haloBPF.type = 'bandpass';
    haloBPF.frequency.value = 3000;
    haloBPF.Q.value = 0.5;
    srcHalo.connect(haloBPF);
    
    // Connect to engine input (one at a time to measure separately, we will use multiple offline contexts)
    // Wait, it's easier to run multiple OfflineAudioContexts to measure independently.
}

async function measureSignal(modeName, signalType) {
    const sampleRate = 48000;
    const duration = 0.5; // 0.5 sec is enough
    const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
    
    // Fresh engine
    const engine = Object.assign(Object.create(Object.getPrototypeOf(spatial)), spatial);
    engine.mode = 'off';
    engine._reverbCache = new Map();
    engine.audioCtx = null;
    engine.init(ctx);
    engine.applyMode(modeName, true);
    console.log("Mode:", modeName, "makeupGain:", engine.makeupGain.gain.value);

    const input = ctx.createGain();
    input.connect(engine.inputNode);
    engine.outputNode.connect(ctx.destination);

    if (signalType === 'lead1k') {
        const osc = ctx.createOscillator();
        osc.frequency.value = 1000;
        const gain = ctx.createGain();
        gain.gain.value = 0.707; // ~ -3dB
        osc.connect(input);
        osc.start();
    } else if (signalType === 'bass80') {
        const osc = ctx.createOscillator();
        osc.frequency.value = 80;
        const gain = ctx.createGain();
        gain.gain.value = 0.707;
        osc.connect(input);
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
    } else if (signalType === 'noise') {
        const noiseLen = sampleRate * duration;
        const noiseBuffer = ctx.createBuffer(2, noiseLen, sampleRate);
        for (let c = 0; c < 2; c++) {
            const data = noiseBuffer.getChannelData(c);
            for (let i = 0; i < noiseLen; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.707;
            }
        }
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        src.connect(input);
        src.start();
    } else if (signalType === 'haloTest') {
        const noiseLen = sampleRate * duration;
        const noiseBuffer = ctx.createBuffer(1, noiseLen, sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.707;
        }
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
    
    // Calculate RMS and Peak
    const L = renderedBuffer.getChannelData(0);
    const R = renderedBuffer.getChannelData(1);
    let sumSq = 0;
    let peak = 0;
    let dot = 0;
    let sumL2 = 0;
    let sumR2 = 0;
    
    // Skip first 0.1s to allow filters/delays to settle
    const startIdx = Math.floor(0.4 * sampleRate);
    
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
    const signals = ['lead1k', 'bass80', 'side3k', 'noise', 'haloTest'];
    const results = {};
    
    for (const mode of SPATIAL_MODES) {
        results[mode] = {};
        for (const sig of signals) {
            results[mode][sig] = await measureSignal(mode, sig);
        }
    }
    
    console.log("=== Measurement Results (dBFS) ===");
    console.table(results);
    
    // Print summary
    console.log("\n--- Validation ---");
    const offLead = results.off.lead1k.rmsDb;
    const offBass = results.off.bass80.rmsDb;
    const offNoise = results.off.noise.rmsDb;
    
    for (const mode of ['studio', 'wide', 'concert']) {
        const leadDiff = results[mode].lead1k.rmsDb - offLead;
        const bassDiff = results[mode].bass80.rmsDb - offBass;
        const sideDiff = results[mode].side3k.rmsDb - results.off.side3k.rmsDb;
        const noiseDiff = results[mode].noise.rmsDb - offNoise;
        const peak = Math.max(results[mode].lead1k.peakDb, results[mode].noise.peakDb);
        const haloCorrel = results[mode].haloTest.correlation;
        const offHaloCorrel = results.off.haloTest.correlation;
        
        console.log(`Mode: ${mode.toUpperCase()}`);
        console.log(`  Lead 1k diff: ${leadDiff.toFixed(2)} dB (Target: ±1 dB)`);
        console.log(`  Bass 80 diff: ${bassDiff.toFixed(2)} dB (Target: ±1 dB)`);
        console.log(`  Side 3k diff: ${sideDiff.toFixed(2)} dB (Target: +2..+5 dB)`);
        console.log(`  Noise RMS diff: ${noiseDiff.toFixed(2)} dB (Target: <= 1 dB)`);
        console.log(`  Max Peak: ${peak.toFixed(2)} dB (Target: <= -1 dBFS)`);
        console.log(`  Halo Correl: ${haloCorrel.toFixed(3)} (Off: ${offHaloCorrel.toFixed(3)}, Target: Lower than off)`);
    }
}

runTests().catch(console.error);
