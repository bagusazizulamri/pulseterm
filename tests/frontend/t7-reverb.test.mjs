import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSyntheticReverbIR } from '../../frontend/js/eq-core.js';

test('T7: generateSyntheticReverbIR produces decorrelated stereo decay with silent predelay', () => {
    const sampleRate = 48000;
    const durationSec = 0.5;
    const decayTau = 0.15;
    const predelaySec = 0.02; // 20ms
    const predelaySamples = Math.floor(sampleRate * predelaySec);

    const { left, right } = generateSyntheticReverbIR(sampleRate, durationSec, decayTau, predelaySec, 5000);

    assert.equal(left.length, Math.floor(sampleRate * durationSec));
    assert.equal(right.length, Math.floor(sampleRate * durationSec));

    // 1. Silent predelay
    for (let i = 0; i < predelaySamples; i++) {
        assert.equal(left[i], 0, `Left sample ${i} should be 0 during predelay`);
        assert.equal(right[i], 0, `Right sample ${i} should be 0 during predelay`);
    }

    // 2. Decorrelated stereo (channels are not equal)
    let identicalCount = 0;
    for (let i = predelaySamples; i < left.length; i++) {
        if (Math.abs(left[i] - right[i]) < 1e-6) identicalCount++;
    }
    assert(identicalCount < (left.length - predelaySamples) * 0.05, 'Left and Right must be decorrelated');

    // 3. Exponential decay: early energy vs late energy
    const activeSamples = left.length - predelaySamples;
    const half = Math.floor(activeSamples / 2);
    let earlyEnergy = 0;
    let lateEnergy = 0;

    for (let i = 0; i < half; i++) {
        earlyEnergy += left[predelaySamples + i] ** 2;
    }
    for (let i = half; i < activeSamples; i++) {
        lateEnergy += left[predelaySamples + i] ** 2;
    }

    assert(earlyEnergy > lateEnergy * 3, `Early energy (${earlyEnergy}) must decay significantly towards late (${lateEnergy})`);
});
