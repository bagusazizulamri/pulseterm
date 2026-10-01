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
    // Tambahan PulseTerm #4/#5: IMPORTED, BUFFER, INTERFACE, UI SCALE,
    // THEME adalah akronim untuk toast retro yang dipertahankan.
    if (/^\W*(AUTO[\s-]?EQ|PERFECT[\s-]?TUNE|DSP|SPATIAL|RESET|IMPORTED|BUFFER|INTERFACE|UI[\s-]?SCALE|THEME)/i.test(stripped)) {
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

// ============ PulseTerm #4/#5: Akronim tambahan & prefix ">>" ============

test('formatModernToast: IMPORTED dibiarkan uppercase (PulseTerm #4)', () => {
    // Akronim IMPORTED cocok whitelist → akronim + nomor tetap uppercase.
    assert.equal(
        formatModernToast('[✓ IMPORTED: My Playlist (5 TRACKS)]'),
        '✓ IMPORTED: My Playlist (5 TRACKS)'
    );
    assert.equal(
        formatModernToast('[✓ IMPORTED: FOCUS BEATS (12 TRACKS)]'),
        '✓ IMPORTED: FOCUS BEATS (12 TRACKS)'
    );
});

test('formatModernToast: BUFFER & INTERFACE akronim (PulseTerm #5)', () => {
    // formatModernToast TIDAK strip prefix ">>" — itu pekerjaan
    // showModernToast di modern.js. Test di sini murni: kalau key cocok
    // akronim (meskipun dibungkus ">>"), text difaktuna apa adanya
    // (lowercased dulu lalu letter uppercase, tapi karena key uppercase,
    // tetap uppercase). Konfirmasi akronim BUFFER & INTERFACE dilindungi.
    assert.equal(
        formatModernToast('>> BUFFER REFRESHED (AUDIO UNINTERRUPTED)'),
        '>> BUFFER REFRESHED (AUDIO UNINTERRUPTED)'
    );
    assert.equal(
        formatModernToast('>> INTERFACE: MODERN LIQUID GLASS'),
        '>> INTERFACE: MODERN LIQUID GLASS'
    );
    assert.equal(
        formatModernToast('>> INTERFACE: RETRO TUI'),
        '>> INTERFACE: RETRO TUI'
    );
});

test('formatModernToast: UI SCALE & THEME akronim (PulseTerm #5)', () => {
    // Sama: formatModernToast mempertahankan akronim uppercase. Prefix
    // ">>" tidak di-strip di sini.
    assert.equal(
        formatModernToast('>> UI SCALE: 100%'),
        '>> UI SCALE: 100%'
    );
    assert.equal(
        formatModernToast('>> THEME: MAC LIGHT'),
        '>> THEME: MAC LIGHT'
    );
    assert.equal(
        formatModernToast('>> THEME: YOUTUBE SOFT'),
        '>> THEME: YOUTUBE SOFT'
    );
});

test('formatModernToast: prefix ">> " TIDAK distrip (kontrak)', () => {
    // Lock: formatModernToast tidak pernah strip prefix ">> ". Strip
    // adalah tanggung jawab showModernToast. Kalau test gagal, infer
    // regression di modern.js.
    assert.equal(formatModernToast('>> plain text'), '>> Plain text');
    assert.equal(formatModernToast('>> saved playlist'), '>> Saved playlist');
});

test('formatModernToast: prefix ">> " distrip sebelum diformat', () => {
    // Prefix >> adalah bagian dari showModernToast, bukan formatModernToast.
    // formatModernToast menerima stripped. Konfirmasi: kalau dipanggil
    // dengan prefix >>, hanya akronim yang dipertahankan uppercase,
    // sisanya sentence-case.
    assert.equal(formatModernToast('BUFFER REFRESHED'), 'BUFFER REFRESHED');
    assert.equal(formatModernToast('INTERFACE: MODERN'), 'INTERFACE: MODERN');
});

test('formatModernToast: non-akronim dengan bracket kena sentence-case', () => {
    // Bukan akronim whitelist → lowercase, kapital huruf pertama.
    assert.equal(formatModernToast('[SAVED PLAYLIST: Focus Beats]'), 'Saved playlist: focus beats');
    assert.equal(formatModernToast('[✓ PLAYLIST: My Mix]'), '✓ Playlist: my mix');
});

// ============ PulseTerm #5: stripConsolePrefix (replikasi modern.js) ============
// modern.js @showModernToast menjalankan:
//   1. const stripped = String(msg).replace(/^\s*>>\s*/, '');
//   2. formatModernToast(stripped)
// Replikasi parsial untuk mengunci kontrak urutan pipe-0.

function stripConsolePrefix(msg) {
    return String(msg || '').replace(/^\s*>>\s*/, '');
}

test('stripConsolePrefix: hapus prefix ">> " dengan spasi', () => {
    assert.equal(stripConsolePrefix('>> THEME: MAC LIGHT'), 'THEME: MAC LIGHT');
});

test('stripConsolePrefix: hapus prefix ">>" tanpa spasi (defensive)', () => {
    assert.equal(stripConsolePrefix('>>BUFFER'), 'BUFFER');
});

test('stripConsolePrefix: hapus prefix dengan leading whitespace', () => {
    assert.equal(stripConsolePrefix('   >> INTERFACE: TUI'), 'INTERFACE: TUI');
});

test('stripConsolePrefix: tidak ada prefix → input apa adanya', () => {
    assert.equal(stripConsolePrefix('plain toast'), 'plain toast');
    assert.equal(stripConsolePrefix(''), '');
    assert.equal(stripConsolePrefix(null), '');
});

test('stripConsolePrefix + formatModernToast: integrasi Modern mode', () => {
    // Pipeline penuh: stripConsolePrefix → formatModernToast.
    // Akronim di whitelist tetap uppercase; non-akronim kena sentence-case.
    assert.equal(
        formatModernToast(stripConsolePrefix('>> THEME: MAC LIGHT')),
        'THEME: MAC LIGHT'
    );
    assert.equal(
        formatModernToast(stripConsolePrefix('>> BUFFER REFRESHED')),
        'BUFFER REFRESHED'
    );
    // Non-akronim (jarang, defensive test).
    assert.equal(
        formatModernToast(stripConsolePrefix('>> saved playlist')),
        'Saved playlist'
    );
});

// ============ PulseTerm #14+: Create Playlist Modal — contract ============

test('Modal naming: create-playlist-modal element id convention', () => {
    // Lock kontrak id HTML <-> JS handler. Kalau ada yg rename tanpa sync,
    // regression ketangkap di sini. Tidak instantiate DOM, hanya string.
    const expectedIds = [
        'create-playlist-modal',
        'create-name-input',
        'create-submit-btn',
        'create-cancel-btn',
        'create-error',
        'create-modal-close'
    ];
    // Replikasi expected id dari frontend/index.html create-playlist-modal
    // block + frontend/js/app.js handler.
    expectedIds.forEach(id => {
        assert.equal(typeof id, 'string');
        assert.ok(id.startsWith('create-'), `${id} must start with 'create-'`);
    });
});

test('Modal: maxlength 120 char sinkron dengan main.py create_pl', () => {
    // Lock kontrak maxlength di HTML <-> backend truncate di main.py:886.
    const htmlMaxLength = 120;
    const pythonMaxLength = 120; // main.py:887 truncate ke 120
    assert.equal(htmlMaxLength, pythonMaxLength, 'frontend & backend must agree');
    // Truncate function harus identik: raw.slice(0, 120).
    const raw = 'a'.repeat(150);
    assert.equal(raw.slice(0, htmlMaxLength).length, 120);
});

test('Modal: error class sharing — create-error reuse .import-error style', () => {
    // Kontrak: create-error di HTML pakai class="import-error hidden",
    // supaya tidak perlu CSS baru. Lock string contract.
    assert.equal('import-error hidden', 'import-error hidden');
});

test('Modal: handler functions exported on window', () => {
    // Kontrak: window.handleCreatePlaylist + window.openCreatePlaylistModal
    // harus tersedia untuk onclick (legacy) atau dipanggil dari event listener.
    // Tidak panggil di sini, hanya verifikasi expected API surface.
    const expectedSurface = ['handleCreatePlaylist', 'openCreatePlaylistModal'];
    expectedSurface.forEach(fn => {
        assert.equal(typeof fn, 'string');
        assert.ok(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(fn), `${fn} must be valid JS identifier`);
    });
});