import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    analyzeAndCompensate,
    classifySpectralProfile
} from '../../frontend/js/eq-core.js';

// Skenario: smartEQ baru (de1a6db+) menambahkan #1 smoothing clamp,
// #2 anti-mud 250Hz, #6 vocal-proximity 8k/16k. TUJUAN test ini:
// pastikan vokal ballad (Lee Haeri "I Hate That I Miss You") tetap
// BULAT dan BERBODY seperti aslinya setelah smartEQ.
//
// Indikator "vokal bulat":
// - 125Hz (vokal warmth fundamental, ~110-160Hz) tidak di-cut
// - 250Hz (chest resonance vokal wanita ~200-300Hz) tidak muddy
// - 500Hz-1kHz (vokal body utama) tetap hadir (boost atau netral)
// - 2kHz (presence vokal) tidak hilang
// - 8k/16k tidak di-boost berlebihan (vokal sudah punya presence kuat)

// Band riil FFT 8192 dari file asli (sumber sama dgn T11).
const LEE = {
    verse:     { bands: [-35.7, -30.6, -19.0, -16.6, -10.3, -15.7, -26.8, -36.9, -39.4, -50.7], noise: -58.9, peakDev: 12.9 },
    chorus:    { bands: [-11.0, -7.7, -8.0, -9.0, -12.7, -16.1, -22.6, -33.3, -34.7, -49.5], noise: -54.6, peakDev: 12.6 },
    bridge:    { bands: [-10.0, -7.1, -11.2, -10.3, -15.3, -23.0, -26.4, -33.5, -39.1, -47.8], noise: -55.9, peakDev: 13.3 },
    climax:    { bands: [-11.3, -1.6, -4.6, -11.5, -9.8, -7.3, -20.1, -27.8, -31.7, -38.4], noise: -48.1, peakDev: 8.6 },
    outro:     { bands: [-10.6, -5.9, -5.2, -11.2, -8.3, -15.3, -19.6, -25.4, -27.9, -36.7], noise: -49.0, peakDev: 14.7 }
};

const extraOf = (w) => ({ noiseFloorDb: w.noise, peakVocalDb: w.bands[5] - 4.5 + w.peakDev });
const compOf = (name) => analyzeAndCompensate(LEE[name].bands, 'sad_ballad', extraOf(LEE[name]));

describe('T12: Lee Haeri ballad — vokal tetap bulat & berbody', () => {
    test('V1 125Hz warmth (fundamental vokal) tidak di-cut drastis', () => {
        for (const name of Object.keys(LEE)) {
            const c = compOf(name);
            assert.ok(c.gains[2] >= -1.5, `${name} 125Hz harus >= -1.5dB, got ${c.gains[2]}`);
        }
    });

    test('V2 250Hz chest resonance tidak muddy (anti-mud #2)', () => {
        for (const name of Object.keys(LEE)) {
            const c = compOf(name);
            assert.ok(c.gains[3] <= 1.0, `${name} 250Hz anti-mud <= +1.0dB, got ${c.gains[3]}`);
        }
    });

    test('V3 500-1kHz body vokal (mid) tetap hadir', () => {
        for (const name of Object.keys(LEE)) {
            const c = compOf(name);
            const midAvg = (c.gains[4] + c.gains[5]) / 2;
            assert.ok(midAvg >= -1.0, `${name} 500-1kHz >= -1.0dB avg, got ${midAvg.toFixed(2)}`);
        }
    });

    test('V4 2kHz presence vokal tidak hilang', () => {
        for (const name of Object.keys(LEE)) {
            const c = compOf(name);
            assert.ok(c.gains[6] >= -2.0, `${name} 2kHz presence >= -2.0dB, got ${c.gains[6]}`);
        }
    });

    test('V5 8k/16k air tidak berlebihan (vocal-proximity #6)', () => {
        for (const name of Object.keys(LEE)) {
            const c = compOf(name);
            assert.ok(c.gains[8] <= 3.0, `${name} 8kHz <= +3.0dB, got ${c.gains[8]}`);
            assert.ok(c.gains[9] <= 2.0, `${name} 16kHz <= +2.0dB, got ${c.gains[9]}`);
        }
    });

    test('V6 chest warmth total (125+250+500) >= -3dB', () => {
        for (const name of Object.keys(LEE)) {
            const c = compOf(name);
            const chest = c.gains[2] + c.gains[3] + c.gains[4];
            assert.ok(chest >= -3.0, `${name} chest total >= -3.0dB, got ${chest.toFixed(2)}`);
        }
    });

    test('V7 smartEQ vs flat baseline: 125Hz drop <= 2dB', () => {
        for (const name of Object.keys(LEE)) {
            const tuned = compOf(name).gains[2];
            const flat = analyzeAndCompensate(LEE[name].bands, 'flat').gains[2];
            assert.ok(tuned - flat >= -2.0,
                `${name} tuned=${tuned}, flat=${flat}, drop=${(tuned-flat).toFixed(2)}`);
        }
    });

    test('V8 sad_ballad tetap diklasifikasikan untuk semua window', () => {
        for (const name of Object.keys(LEE)) {
            assert.equal(classifySpectralProfile(LEE[name].bands, 'sad_ballad'), 'sad_ballad');
        }
    });

    test('V9 hint telegraphy jujur (no fake +AIR thin)', () => {
        for (const name of ['chorus', 'bridge', 'outro']) {
            const c = compOf(name);
            assert.ok(c.hint && c.hint.length > 0, `${name}: hint kosong`);
            assert.ok(!c.hint.includes('+AIR (thin)'),
                `${name}: Lee Haeri vokal kuat, tidak boleh +AIR (thin)`);
        }
    });
});
