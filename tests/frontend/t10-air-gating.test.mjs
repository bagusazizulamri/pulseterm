import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    EQ_FREQUENCIES,
    analyzeAndCompensate,
    computeTuneCorrections,
    assessAirEligibility,
    refineAirCompensation,
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

    test('Vokal absen total (scooped dalam) -> NO VOCAL final, bukan abu-abu', () => {
        // extra -8dB di 2kHz => presDev = -8.0 < ambang -6.0 => NO VOCAL final
        const noVocal = pink({ 6: -8 });
        const check = assessAirEligibility(noVocal);
        assert.equal(check.eligible, false);
        assert.equal(check.reason, 'NO VOCAL');
        assert.equal(check.confidence, 'HIGH');
        const res = analyzeAndCompensate(noVocal, 'electronic');
        assert.equal(res.airEligible, false);
        assert.ok(!res.hint.includes('+AIR'), `got ${res.hint}`);
        assert.ok(!res.hint.includes('check again'), `vonis final tidak boleh check-again, got ${res.hint}`);
    });

    test('Vokal recessed ballad (Lee Haeri style, 2kHz -5dB) -> abu-abu, bukan vonis', () => {
        // Ballad intim: vokal di-mix agak ke dalam + reverb tebal.
        // extra -5dB di 2kHz => presDev = -5.0 -> zona abu-abu -6..-4
        const recessed = pink({ 6: -5 });
        const check = assessAirEligibility(recessed, 'sad_ballad');
        assert.equal(check.eligible, false);
        assert.equal(check.reason, 'NO VOCAL?');
        assert.equal(check.confidence, 'LOW');
        const res = analyzeAndCompensate(recessed, 'sad_ballad');
        assert.ok(res.hint.includes('check again'), `harus ada penanda ukur-ulang, got ${res.hint}`);
    });

    test('Refinement: intro piano (abu-abu) -> verse vokal masuk -> air dibuka kembali', () => {
        // Snapshot 1 (detik 1.8): intro piano muffled, vokal belum masuk penuh
        // (2kHz recessed -5dB + top-end keroll-off 8dB -> butuh +AIR tapi vokal abu-abu)
        const intro = EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.2) - (i >= 8 ? 8 : 0) + (i === 6 ? -5 : 0));
        const first = analyzeAndCompensate(intro, 'sad_ballad');
        assert.equal(first.airEligible, false);
        assert.equal(first.airConfidence, 'LOW');
        // Snapshot 2 (detik ~10): verse ballad penuh muffled, vokal present
        const verse = EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.2) - (i >= 8 ? 8 : 0));
        const later = analyzeAndCompensate(verse, 'sad_ballad');
        assert.equal(later.airEligible, true);
        assert.ok(later.offsets[9] > 0, `sanity: verse muffled harus butuh air, got ${later.offsets[9]}`);
        const merged = refineAirCompensation(first, later);
        assert.equal(merged.airEligible, true, 'air harus dibuka kembali saat vokal masuk');
        assert.ok(merged.offsets[9] > 0, `offset 16k harus hidup lagi, got ${merged.offsets[9]}`);
    });

    test('Refinement: verse intim -> drop kasar -> ikut kondisi terbaru (tahan)', () => {
        const verse = pink({});
        const first = analyzeAndCompensate(verse, 'electronic');
        assert.equal(first.airEligible, true);
        const drop = pink({ 8: 8, 9: 2 }); // drop kasar sibilant
        const later = analyzeAndCompensate(drop, 'electronic');
        assert.equal(later.airEligible, false);
        const merged = refineAirCompensation(first, later);
        assert.equal(merged.airEligible, false, 'harus ikut kondisi terbaru yang kasar');
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
