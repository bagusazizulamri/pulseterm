import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    EQ_FREQUENCIES,
    analyzeAndCompensate,
    computeTuneCorrections,
    assessAirEligibility,
    AIR_POLICY_BY_ARCHETYPE
} from '../../frontend/js/eq-core.js';

const pink = (extra = {}) => EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.5) + (extra[i] ?? 0));

describe('T10: Air eligibility — tidak semua lagu boleh di-airy', () => {
    test('Lo-fi / noise floor (16kHz di bawah floor) -> AIR HELD, offset 16k = 0', () => {
        const lofi = pink({ 9: -40 }); // 16kHz ~ -78 dBFS, tinggal hiss
        const check = assessAirEligibility(lofi);
        assert.equal(check.eligible, false);
        assert.equal(check.reason, 'NO AIR CONTENT');
        const res = analyzeAndCompensate(lofi, 'pop_upbeat');
        assert.equal(res.airEligible, false);
        assert.ok(res.offsets[9] <= 0, `offset 16k harus ditahan, got ${res.offsets[9]}`);
        assert.ok(!res.hint.includes('+AIR'), `hint tidak boleh klaim +AIR, got ${res.hint}`);
        assert.ok(res.hint.includes('AIR HELD'), `hint harus jujur AIR HELD, got ${res.hint}`);
    });

    test('Vintage roll-off disengaja (16kHz -35dB rel 1kHz) -> dihormati, tidak dikoreksi', () => {
        const rolled = pink({ 8: -10, 9: -17 }); // airRel = -18-17 = -35
        const check = assessAirEligibility(rolled);
        assert.equal(check.eligible, false);
        assert.equal(check.reason, 'ROLLED-OFF');
        const res = analyzeAndCompensate(rolled, 'pop');
        assert.ok(res.offsets[9] <= 0);
    });

    test('Lagu harsh/sibilant (8kHz panas, 16kHz ketinggalan) -> air ditahan', () => {
        const harsh = pink({ 8: 8, 9: 2 });
        const check = assessAirEligibility(harsh);
        assert.equal(check.eligible, false, JSON.stringify(check));
        const res = analyzeAndCompensate(harsh, 'metal');
        assert.ok(res.offsets[8] <= 0.5 && res.offsets[9] <= 0);
        assert.ok(!res.hint.includes('+AIR'), `got ${res.hint}`);
    });

    test('Vokal absen di 2kHz (drop/instrumental scooped) -> airy vocal tidak relevan', () => {
        // extra -6dB di 2kHz => presDev = -6.0 < ambang -4.0 => NO VOCAL
        const noVocal = pink({ 6: -6 });
        const check = assessAirEligibility(noVocal);
        assert.equal(check.eligible, false);
        assert.equal(check.reason, 'NO VOCAL');
        const res = analyzeAndCompensate(noVocal, 'electronic');
        assert.equal(res.airEligible, false);
        assert.ok(!res.hint.includes('+AIR'), `got ${res.hint}`);
    });

    test('Lagu pop modern yang sehat & muffled -> tetap boleh +AIR', () => {
        const muffled = EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.2) - (i >= 8 ? 8 : 0));
        const check = assessAirEligibility(muffled, 'pop_upbeat');
        assert.equal(check.eligible, true);
        const res = analyzeAndCompensate(muffled, 'pop_upbeat');
        assert.equal(res.airEligible, true);
        assert.ok(res.offsets[9] > 1.5, `got ${res.offsets[9]}`);
        assert.ok(res.hint.includes('+AIR'), `got ${res.hint}`);
    });

    test('Ballad intim dibatasi: boost 16k max +1.0 walau eligible', () => {
        const muffled = EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.2) - (i >= 8 ? 8 : 0));
        const res = analyzeAndCompensate(muffled, 'sad_ballad');
        assert.ok(res.offsets[9] <= AIR_POLICY_BY_ARCHETYPE.sad_ballad.airMaxBoost + 1e-9,
            `ballad air harus <= 1.0, got ${res.offsets[9]}`);
    });

    test('Base preset airy dipangkas saat diblokir (pop_upbeat total 16k <= 2.0)', () => {
        const lofi = pink({ 9: -40 });
        const res = analyzeAndCompensate(lofi, 'pop_upbeat');
        assert.ok(res.gains[9] <= AIR_POLICY_BY_ARCHETYPE.pop_upbeat.blockedTotalCap + 1e-9,
            `total 16k harus <= 2.0, got ${res.gains[9]}`);
    });

    test('Perfect Tune: lo-fi tidak diberi +AIR', () => {
        const lofi = pink({ 9: -40 });
        const res = computeTuneCorrections(lofi);
        assert.equal(res.airEligible, false);
        assert.ok(res.gains[9] <= 0, `got ${res.gains[9]}`);
        assert.ok(!res.hint.includes('+AIR'), `got ${res.hint}`);
    });
});
