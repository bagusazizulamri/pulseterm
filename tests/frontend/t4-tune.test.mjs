import test from 'node:test';
import assert from 'node:assert/strict';
import { bandPowerDb, computeTuneCorrections, EQ_FREQUENCIES } from '../../frontend/js/eq-core.js';

test('T4: bandPowerDb calculates octave power in dB', () => {
    const fftSize = 8192;
    const sampleRate = 48000;
    const numBins = fftSize / 2;

    // 1. Flat spectrum at -20 dBFS everywhere
    const flatDb = new Float32Array(numBins).fill(-20);
    const p1k = bandPowerDb(flatDb, sampleRate, fftSize, 1000);
    assert(Math.abs(p1k - (-20)) < 0.1, `Expected ~ -20 dB, got ${p1k}`);

    // 2. Pure tone at 1000 Hz bin
    const bin1k = Math.round(1000 / (sampleRate / fftSize));
    const toneDb = new Float32Array(numBins).fill(-100);
    toneDb[bin1k] = 0; // 0 dBFS tone
    const pToneInBand = bandPowerDb(toneDb, sampleRate, fftSize, 1000);
    const pToneFar = bandPowerDb(toneDb, sampleRate, fftSize, 8000);
    assert(pToneInBand > pToneFar + 50, `1k tone should have much higher power at 1k band than at 8k band`);
});

test('T4: computeTuneCorrections handles pink noise and spectral skew', () => {
    // 1. Exact pink noise curve (-4.5 dB/octave relative to 1kHz)
    const pinkBands = EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.5));
    const pinkResult = computeTuneCorrections(pinkBands);
    pinkResult.gains.forEach((g, idx) => {
        assert(Math.abs(g) <= 0.5, `Band ${idx} gain should be near 0 dB on pink noise, got ${g}`);
    });

    // 2. Heavy boomy bass excess (+15 dB above pink noise tilt in bass)
    const boomyBands = EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.5) + (i < 3 ? 15 : 0));
    const boomyResult = computeTuneCorrections(boomyBands);
    // Bass bands should be cut (negative correction clamped to -4 dB)
    assert(boomyResult.gains[0] <= -2.5, `Sub-bass should be cut, got ${boomyResult.gains[0]}`);
    assert(boomyResult.hint.includes('CLARITY') || boomyResult.hint.includes('+AIR'), `Hint should reflect corrective reduction`);

    // 3. Gain limits clamped within [-4, +4] dB
    for (const g of boomyResult.gains) {
        assert(g >= -4 && g <= 4, `Gain ${g} exceeded clamp [-4, 4]`);
    }
});
