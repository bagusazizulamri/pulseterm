import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLimiterGain } from '../../frontend/js/eq-core.js';

test('T8: computeLimiterGain applies brickwall clamp and exponential release', () => {
    const threshold = Math.pow(10, -1.0 / 20); // ~0.89125
    const releaseAlpha = 1.0 - Math.exp(-1.0 / (0.080 * 48000));

    // 1. Below threshold peak: gain stays 1.0
    let gain = 1.0;
    gain = computeLimiterGain(0.5, threshold, gain, releaseAlpha);
    assert.equal(gain, 1.0);

    // 2. High peak overshoot (+6 dBFS = 2.0 linear amplitude): instant attenuation
    const peakOvershoot = 2.0;
    gain = computeLimiterGain(peakOvershoot, threshold, gain, releaseAlpha);
    const expectedTarget = threshold / 2.0; // ~0.4456
    assert(Math.abs(gain - expectedTarget) < 1e-4, `Expected instant cut to ~${expectedTarget}, got ${gain}`);

    // Verify limited output peak does not exceed threshold
    const outputPeak = peakOvershoot * gain;
    assert(outputPeak <= threshold + 1e-6, `Output peak ${outputPeak} exceeds threshold ${threshold}`);

    // 3. Smooth release when signal returns to normal (0.1)
    let previousGain = gain;
    for (let i = 0; i < 480; i++) { // 10ms of samples
        gain = computeLimiterGain(0.1, threshold, gain, releaseAlpha);
        assert(gain >= previousGain, 'Gain should recover during release');
        previousGain = gain;
    }
    assert(gain > expectedTarget, 'Gain must have recovered towards 1.0');
});
