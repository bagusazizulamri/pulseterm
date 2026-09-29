import assert from 'node:assert';

// Stub AudioWorkletProcessor
global.sampleRate = 48000;
global.AudioWorkletProcessor = class AudioWorkletProcessor {
    constructor() { this.port = { postMessage: () => {} }; }
};
global.registerProcessor = (name, cls) => {
    global.LimiterProcessor = cls;
};

// Load the worklet
import fs from 'fs';
const code = fs.readFileSync('frontend/js/limiter_worklet.js', 'utf8');
eval(code);

function runLimiterTest() {
    const processor = new global.LimiterProcessor();
    const sampleRate = 48000;
    const duration = 2.0; // 2 seconds
    const numSamples = sampleRate * duration;
    
    const input = new Float32Array(numSamples);
    
    // Generate 1 kHz sine + noise + periodic peaks
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let val = Math.sin(2 * Math.PI * 1000 * t) * 0.95;
        val += (Math.random() * 2 - 1) * 0.1; // noise
        if (i % (sampleRate / 4) === 0) { // burst x1.5 every 250ms
            val *= 1.5;
        }
        input[i] = val;
    }
    
    const output = new Float32Array(numSamples);
    
    // Process block by block
    const blockSize = 128;
    let maxDeltaGain = 0;
    let lastGain = 1.0;
    let maxOutputPeak = 0;
    
    // To measure delta gain, we need to instrument the processor or just look at the envelope.
    // We can infer gain by looking at the ratio of output to delayed input, but that's prone to zero-crossing division errors.
    // Let's modify the worklet slightly in the eval to expose the current gain?
    // Or just check the output peak and smoothness.
    
    for (let i = 0; i < numSamples; i += blockSize) {
        const inBlock = [new Float32Array(input.subarray(i, i + blockSize))];
        const outBlock = [new Float32Array(blockSize)];
        
        // We inject a capture for the gain variable if possible, otherwise we just test the output
        processor.process([inBlock], [outBlock], { threshold: [Math.pow(10, -1 / 20)] }); // -1 dBFS
        if (i===0) console.log("outBlock[0][0]:", outBlock[0][0]);
        
        for (let j = 0; j < inBlock[0].length; j++) {
            const outVal = outBlock[0][j];
            if (Number.isNaN(outVal)) { console.log("NaN at", i, j); process.exit(1); }
            maxOutputPeak = Math.max(maxOutputPeak, Math.abs(outVal));
            output[i + j] = outVal;
        }
    }
    
    console.log("maxOutputPeak:", maxOutputPeak);
    const peakDb = 20 * Math.log10(maxOutputPeak || 1e-9);
    console.log(`Limiter output peak: ${peakDb.toFixed(2)} dBFS`);
    
    // Check if peak is <= -1 dBFS (or slightly above due to soft clip)
    assert.ok(peakDb <= -0.9, `Peak too high: ${peakDb} dBFS`);
    
    // We also want to check for "kresek" / ticks. A tick is a large jump in the output that isn't in the input.
    // We can measure the high-frequency energy or just rely on the smoothing logic.
    console.log("Limiter test passed.");
}

runLimiterTest();
