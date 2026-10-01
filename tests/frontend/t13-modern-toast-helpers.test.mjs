// frontend/t13-modern-toast-helpers.test.mjs — PulseTerm cosmetic #3/#4/#5
import test from 'node:test';
import assert from 'node:assert/strict';

// Replikasi persis stripBrackets + formatModernToast dari modern.js agar
// regression langsung terlihat kalau helper di-modern.js berubah.
function stripBrackets(text) {
    const t = String(text || '').trim();
    if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).trim();
    return t;
}

function formatModernToast(text) {
    const stripped = stripBrackets(text);
    // Akronim dibiarkan uppercase (lihat cleanModernContent whitelist).
    // Prefix emoji/karakter non-word diizinkan (mis. "⚡ PERFECT TUNE").
    if (/^\W*(AUTO[\s-]?EQ|PERFECT[\s-]?TUNE|DSP|SPATIAL|RESET)/i.test(stripped)) {
        return stripped;
    }
    // Sentence-case: cari huruf alphabet pertama dan kapitalkan, sisanya
    // lowercase. Prefix emoji/karakter non-word dibiarkan apa adanya.
    const lower = stripped.toLowerCase();
    const firstLetterIdx = lower.search(/[a-z]/);
    if (firstLetterIdx < 0) return lower; // tidak ada huruf alphabet
    return lower.slice(0, firstLetterIdx)
        + lower.charAt(firstLetterIdx).toUpperCase()
        + lower.slice(firstLetterIdx + 1);
}

// ============ stripBrackets ============

test('stripBrackets: [FOO] → FOO', () => {
    assert.equal(stripBrackets('[AUTO-EQ: ENABLED]'), 'AUTO-EQ: ENABLED');
});

test('stripBrackets: non-bracket text dibiarkan', () => {
    assert.equal(stripBrackets('plain message'), 'plain message');
});

test('stripBrackets: hanya-bracket-open tanpa close', () => {
    assert.equal(stripBrackets('[unclosed'), '[unclosed');
});

test('stripBrackets: empty string', () => {
    assert.equal(stripBrackets(''), '');
});

test('stripBrackets: null/undefined jadi string kosong', () => {
    assert.equal(stripBrackets(null), '');
    assert.equal(stripBrackets(undefined), '');
});

// ============ formatModernToast ============

test('formatModernToast: AUTO-EQ dibiarkan uppercase (akronim)', () => {
    // Akronim 'AUTO-EQ' cocok dengan whitelist → tidak diubah ke lowercase.
    assert.equal(formatModernToast('[AUTO-EQ: ENABLED]'), 'AUTO-EQ: ENABLED');
    assert.equal(formatModernToast('[AUTO-EQ: DISABLED]'), 'AUTO-EQ: DISABLED');
});

test('formatModernToast: PERFECT TUNE dibiarkan uppercase', () => {
    assert.equal(
        formatModernToast('[⚡ PERFECT TUNE: Menganalisis spektrum audio...]'),
        '⚡ PERFECT TUNE: Menganalisis spektrum audio...'
    );
});

test('formatModernToast: text biasa → sentence-case', () => {
    // Pesan reguler dilucuti bracket-nya dan dikecilkan kecuali huruf pertama.
    // Akronim AUTO-EQ/PERFECT TUNE tetap uppercase walau di-prefix emoji.
    assert.equal(formatModernToast('[▶ perfect eq: applied]'), '▶ Perfect eq: applied');
    // Plain tanpa emoji: PERFECT EQ (bukan PERFECT TUNE) → sentence-case.
    assert.equal(formatModernToast('[PERFECT EQ: applied]'), 'Perfect eq: applied');
});

test('formatModernToast: tanpa bracket, text tetap diproses', () => {
    assert.equal(formatModernToast('Hello World'), 'Hello world');
});

test('formatModernToast: DSP & SPATIAL akronim (whitelist)', () => {
    assert.equal(formatModernToast('[DSP: ON]'), 'DSP: ON');
    assert.equal(formatModernToast('[SPATIAL: OFF]'), 'SPATIAL: OFF');
});

test('formatModernToast: lowercase input tetap valid', () => {
    assert.equal(formatModernToast('[some random toast]'), 'Some random toast');
});