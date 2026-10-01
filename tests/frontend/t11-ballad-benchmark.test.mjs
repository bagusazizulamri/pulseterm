import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    analyzeAndCompensate,
    classifySpectralProfile,
    refineAirCompensation
} from '../../frontend/js/eq-core.js';

describe('T11: Ballad benchmark — Lee Haeri Hate that I Miss You (lagu asli)', () => {
    // Bands = hasil ukur FFT 8192 asli dari file opus (scratch/ballad-bench).
    // noise/peak = lantai noise 18-20kHz + peak vokal 1.5-4kHz hasil ukur sama.
    // Regression lock: perilaku DSP per window lagu ini tidak boleh berubah diam-diam.
    const LEE = {
        intro:     { bands: [-34.0, -18.1, -20.5, -23.4, -24.1, -31.7, -47.5, -65.7, -72.8, -76.5], noise: -76.6, peakDev: 6.1 },
        verse:     { bands: [-35.7, -30.6, -19.0, -16.6, -10.3, -15.7, -26.8, -36.9, -39.4, -50.7], noise: -58.9, peakDev: 12.9 },
        chorus:    { bands: [-11.0, -7.7, -8.0, -9.0, -12.7, -16.1, -22.6, -33.3, -34.7, -49.5], noise: -54.6, peakDev: 12.6 },
        bridge:    { bands: [-10.0, -7.1, -11.2, -10.3, -15.3, -23.0, -26.4, -33.5, -39.1, -47.8], noise: -55.9, peakDev: 13.3 },
        climax:    { bands: [-11.3, -1.6, -4.6, -11.5, -9.8, -7.3, -20.1, -27.8, -31.7, -38.4], noise: -48.1, peakDev: 8.6 },
        outro:     { bands: [-10.6, -5.9, -5.2, -11.2, -8.3, -15.3, -19.6, -25.4, -27.9, -36.7], noise: -49.0, peakDev: 14.7 }
    };
    const extraOf = (w) => ({ noiseFloorDb: w.noise, peakVocalDb: w.bands[5] - 4.5 + w.peakDev });
    const compOf = (name) => {
        const w = LEE[name];
        return analyzeAndCompensate(w.bands, 'sad_ballad', extraOf(w));
    };

    test('B1 semua window tetap sad_ballad', () => {
        for (const name of Object.keys(LEE)) {
            assert.equal(classifySpectralProfile(LEE[name].bands, 'sad_ballad'), 'sad_ballad', name);
        }
    });

    test('B2 vokal terdeteksi ADA (tidak ada NO VOCAL final di verse/chorus/bridge/climax/outro)', () => {
        for (const name of ['verse', 'chorus', 'bridge', 'climax', 'outro']) {
            const c = compOf(name);
            assert.notEqual(c.airReason, 'NO VOCAL', `${name}: vokal jelas ada, jangan vonis NO VOCAL`);
        }
    });

    test('B3 intro piano -> AIR HELD (bukan +AIR palsu)', () => {
        const c = compOf('intro');
        assert.equal(c.airEligible, false);
        assert.ok(c.hint.includes('AIR HELD'), `got ${c.hint}`);
    });

    test('B4 refinement verse/chorus/climax ke bridge/outro membuka air', () => {
        for (const [a, b] of [['verse', 'bridge'], ['chorus', 'outro'], ['climax', 'bridge']]) {
            const m = refineAirCompensation(compOf(a), compOf(b));
            assert.equal(m.airEligible, true, `refine ${a}->${b} harus membuka air`);
        }
    });

    test('B5 offset 16k ballad selalu <= +1.0 + bridge/outro eligible penuh', () => {
        for (const name of Object.keys(LEE)) {
            assert.ok(compOf(name).offsets[9] <= 1.0 + 1e-9, `${name} off16 > 1.0`);
        }
        assert.equal(compOf('bridge').airEligible, true);
        assert.equal(compOf('outro').airEligible, true);
    });
});
