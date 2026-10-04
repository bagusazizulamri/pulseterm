// =========================================================
// PulseTerm — Modern Liquid Glass Interface Engine
// Handles UI Mode switching, reactive bracket removal,
// and adaptive switcher rendering for both TUI & Modern modes.
// Crash-proof, debounced, zero infinite-loop mutations.
//
// Performance model:
//   • MutationObserver records are filtered: high-frequency
//     telemetry writes (clock, VU meters, mini-viz, lyric
//     word fills) never trigger a sweep.
//   • Sweeps are scoped to the mutated subtrees instead of
//     re-querying the whole document, and coalesced into one
//     requestAnimationFrame.
//   • Self-induced mutations are discarded via takeRecords()
//     instead of disconnect()/re-observe() on every pass.
//   • The observer is fully disconnected while in Retro TUI.
// =========================================================

const SVG_ATTRS = 'width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
    home: `<svg ${SVG_ATTRS} ${STROKE}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    search: `<svg ${SVG_ATTRS} ${STROKE}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    library: `<svg ${SVG_ATTRS} ${STROKE}><path d="m16 6 4 14"></path><path d="M12 6v14"></path><path d="M8 8v12"></path><path d="M4 4v16"></path></svg>`,
    playlists: `<svg ${SVG_ATTRS} ${STROKE}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    play: `<svg ${SVG_ATTRS} fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`,
    pause: `<svg ${SVG_ATTRS} fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    prev: `<svg ${SVG_ATTRS} ${STROKE}><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>`,
    next: `<svg ${SVG_ATTRS} ${STROKE}><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`
};

const STORAGE_KEY = 'pulseterm_ui_mode';

// Live regions rewritten by app.js / player.js / equalizer.js.
const OBSERVED_IDS = [
    'page-content', 'player-bar', 'queue-panel', 'equalizer-panel',
    'now-playing', 'settings-panel', 'visualizer-drawer', 'top-bar',
    'toast', 'context-menu'
];

// High-frequency telemetry. Text rewrites inside these never carry
// TUI bracket labels, so they must not wake the cleaner (they fire
// several times per second while audio plays).
const NOISY_SELECTOR = [
    '#current-time', '#total-time', '#now-playback-time',
    '#player-mini-viz', '.tui-mini-viz', '[id^="sidebar-vu"]',
    '.player-clock', '.seek-tooltip', '.viz-telemetry', '.lrc-word', 'canvas'
].join(',');

// Past this many distinct mutated roots a full-document sweep is cheaper.
const MAX_SCOPED_ROOTS = 32;

// Kept uppercase by smartTitle().
const ACRONYMS = new Set([
    'EQ', 'DSP', 'HQ', 'SQ', 'UI', 'TUI', 'CRT', 'DPI', 'OLED', 'EDM', 'R', 'B',
    'YT', 'AI', 'LRC', 'BPM', 'DB', 'ID', 'URL', 'API', 'VU', 'OK', 'FX', 'MP3', 'OPUS', 'AAC'
]);

/**
 * Convert a TUI-style bracketed label into a friendly Title-Case form.
 * Hoisted to module scope so it is allocated once, not per lookup.
 */
const LABEL_MAP = Object.freeze({
    // Buttons / actions
    'NEW PLAYLIST': 'New Playlist',
    'CLEAR HISTORY': 'Clear History',
    'PURGE HISTORY': 'Purge History',
    'CLEAR ALL': 'Clear All',
    'COMMIT CONFIG TO FLASH': 'Commit Config',
    'CREATE': 'Create',
    '+ CREATE': 'Create',
    '+ CREATE NEW PLAYLIST': 'Create Playlist',
    '+ ADD': 'Add',
    '+ ADD TO QUEUE': 'Add to Queue',
    'DELETE PLAYLIST': 'Delete Playlist',
    'SAVE': 'Save',
    'CANCEL': 'Cancel',
    'BROWSE': 'Browse',
    'IMPORT': 'Import',
    'EXPORT': 'Export',
    'YES': 'Yes',
    'NO': 'No',
    'OK': 'OK',
    'CONFIRM': 'Confirm',
    'DONE': 'Done',
    'PURGE': 'Purge',
    'OPEN': 'Open',
    'SEARCH': 'Search',
    'EXEC': 'Search',
    'CLOSE ×': 'Close',
    'CLOSE ESC': 'Close',
    'UNDO': 'Undo',
    'LOAD': 'Load',
    'PLAYING': 'Playing',
    'PAUSED': 'Paused',
    'IDLE': 'Idle',
    'SHUF': 'Shuffle',
    'QUEUE': 'Queue',
    'LYRICS': 'Lyrics',
    'AUTOPLAY': 'Autoplay',
    'HELP: ?': 'Shortcuts',
    // Theme
    'MAC LIGHT': 'Mac Light',
    'YOUTUBE SOFT': 'YouTube Soft',
    'OLED MONO': 'OLED Mono',
    'CYBERPUNK': 'Cyberpunk',
    'TOKYO SLATE': 'Tokyo Slate',
    'SOLARIZED': 'Solarized',
    'MAC LIQUID GLASS': 'Mac Liquid Glass',
    'SOFT DARK': 'Soft Dark',
    // Zoom / DPI
    '85% COMPACT': '85% Compact',
    '90% CONDENSED': '90% Condensed',
    '100% STANDARD': '100% Standard',
    '110% LARGE': '110% Large',
    '120% HI-DPI': '120% Hi-DPI',
    '+ ZOOM IN': 'Zoom In',
    '- ZOOM OUT': 'Zoom Out',
    '100% RESET': '100% Reset',
    // Viz / EQ / DSP
    'VIZ: CAVA': 'Visualizer',
    'CRT: OFF': 'CRT Off',
    'CRT: ON': 'CRT On',
    'EQ: FLAT': 'EQ Flat',
    'EQ: ENABLED': 'EQ On',
    'EQ: BYPASS': 'EQ Off',
    'DSP: ACTIVE': 'DSP Active',
    'DSP: BYPASSED': 'DSP Bypassed',
    'REP: OFF': 'Repeat Off',
    'REP: ALL': 'Repeat All',
    'REP: ONE': 'Repeat One',
    'SPATIAL: OFF': 'Spatial Off',
    'SPATIAL: ON': 'Spatial On',
    'FOLLOW: ON': 'Follow On',
    'FOLLOW: OFF': 'Follow Off',
    'SCRIPT: DUAL': 'Dual',
    'SCRIPT: ROMAN': 'Roman',
    'AUTO: OFF': 'Auto Off',
    'AUTO: ON': 'Auto On',
    'AUTO-EQ: DISABLED': 'Auto-EQ Off',
    'AUTO-EQ: ENABLED': 'Auto-EQ On',
    '⚡ PERFECT TUNE': '⚡ Perfect Tune',
    // Headers / sections
    'ALL': 'All',
    'ALBUMS': 'Albums',
    'ARTISTS': 'Artists',
    'SONGS': 'Songs',
    'PLAYLIST': 'Playlist',
    'PLAYLISTS': 'Playlists',
    // Status
    'ACTIVE STREAM': 'Active Stream',
    'BUFFER: FETCHING': 'Buffering',
    'QUERY: IN-PROGRESS': 'Searching',
    'QUERY: READY': 'Ready',
    'QUERY: ZERO-MATCH': 'No results',
    'REGISTRY: VOID': 'Empty',
    'REPOSITORY: CLEAN': 'Up to date',
    'PLAYLIST: EMPTY': 'No tracks yet',
    // Toast action / control
    'CONFIG': 'Settings',
    'STATUS: IDLE': 'Idle',
    'STATUS: BUFFERING': 'Buffering',
    'STATUS: ERROR': 'Error',
    'PULSETERM AUDIO ENGINE': 'PulseTerm Audio',
    'PULSETERM TUI': 'PulseTerm TUI',
    'NO IMG': 'No image',
    'PL': 'Playlist',
    'SONG': 'Song',
    'ONE': 'One',
    'NONE': 'None',
    'FLAT': 'Flat',
    'RESET FLAT': 'Reset',
    'CREATING...': 'Creating...',
    'IMPORTING...': 'Importing...',
    'IMPORT PLAYLIST FROM YOUTUBE': 'Import from YouTube',
    'AUDIO QUALITY': 'Audio Quality',
    'FOLLOW LYRICS': 'Follow',
});

// Page / drawer heading rewrites (substring match on the raw TUI title).
const HEADING_MAP = [
    ['PULSETERM AUDIO ARCHIVE', 'Featured & Trending'],
    ['SEARCH ENGINE QUERY BUFFER', 'Search Music'],
    ['SAVED AUDIO REPOSITORY', 'Your Library'],
    ['LOCAL PLAYLIST REGISTRY', 'Your Playlists'],
    ['CONFIG // SYSTEM PREFERENCES', 'System Preferences'],
    ['PLAYBACK QUEUE BUFFER', 'Playback Queue'],
    ['10-BAND DSP EQUALIZER', '10-Band Equalizer'],
    ['10-BAND EQUALIZER', 'Equalizer & Audio Lab'],
    ['AUDIO SPECTRUM ANALYZER', 'Audio Visualizer'],
    ['COMMAND KEYMAP', 'Keyboard Shortcuts'],
];

const PLAYER_GLYPHS = Object.freeze({
    '[◀◀]': '‹‹', '[▶▶]': '››', '[SHUF]': 'Shuffle',
    '[AUTOPLAY]': 'Autoplay', '[QUEUE]': 'Queue', '[LYRICS]': 'Lyrics'
});

const TEXT_BUTTONS = [
    ['detail-back', 'RETURN', '← Back'],
    ['pl-detail-back', 'RETURN', '← Back'],
    ['detail-play', 'PLAY ALL', '▶ Play All'],
    ['pl-detail-play', 'PLAY ALL', '▶ Play All'],
    ['clear-hist-btn', 'PURGE', 'Clear History'],
    ['new-pl-btn', 'NEW PLAYLIST', '+ New Playlist'],
    ['pl-detail-delete', 'DELETE PLAYLIST', 'Delete Playlist'],
    ['search-clear-btn', '✕', '✕'],
    ['viz-expand-btn', 'EXPAND', 'Expand'],
    ['continue-btn', 'AUTOPLAY', 'Autoplay'],
    ['shuffle-btn', 'SHUF', 'Shuffle'],
];

// Pills keep uppercase styling (CSS) — brackets only are stripped.
const BADGE_SELECTOR = [
    '.top-bar-actions .tui-badge:not(#eq-toggle-btn):not(#spatial-toggle-btn)', '#player-audio-quality',
    '.eq-state-badge', '.eq-chip', '.suggestion-item', '#toast-action'
].join(',');

const BADGE_SPECIALS = Object.freeze({
    'CLOSE ×': '✕', '✕': '✕', 'CLOSE ESC': 'Close', 'HELP: ?': 'Shortcuts',
    'CONFIG': 'Settings', 'VIZ: CAVA': 'Visualizer', 'UNDO': 'Undo'
});

// Buttons get Title-Case labels.
const BUTTON_SELECTOR = [
    '.top-bar-actions .tui-btn', '.eq-action-buttons .tui-btn',
    '.tui-clear-btn', '.drawer-head-actions .tui-btn'
].join(',');

const PRETTY_SELECTOR = [
    '.filter-btn', '.search-filters button', '.quick-tag-btn', '#eq-auto-btn',
    '#eq-auto-toggle-btn', '#spatial-panel-btn', '#eq-perfect-btn',
    '.zoom-preset-btn', '.theme-btn'
].join(',');

const SWEEP_SELECTOR = [
    '.tui-btn', '.btn', '.action-btn', '.toggle-btn', '.spatial-toggle-btn',
    '.tui-clear-btn', '.btn-danger', '.drawer-head-actions button',
    '.viz-actions button', '.zoom-stepper-row button', '.zoom-presets-grid button',
    '.setting-group button', '.search-filters button', '.quick-tags button',
    '.nav-text', '.save-btn', '.lyrics-head-actions .tui-btn'
].join(',');

const LABEL_SELECTOR = [
    '.label', '.empty-state .label', '.eyebrow-label', '.cover-zoom-prompt',
    '.cover-fallback', '.tui-state-badge', '.card-subtitle .tui-state-badge',
    '.artwork-meta-footer #artwork-spec-label'
].join(',');

const isBracketed = (t) => t.length > 1 && t.charCodeAt(0) === 91 /* [ */ && t.charCodeAt(t.length - 1) === 93 /* ] */;
const capitalize = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const stripFrame = (t) => t.replace(/^[┌─\s]+/, '').replace(/[─┐\s]+$/, '').replace(/─+/g, '').trim();

/** Title-case an ALL-CAPS label while preserving known acronyms. */
function smartTitle(text) {
    const t = String(text || '');
    if (!/[A-Z]/.test(t) || /[a-z]/.test(t)) return t; // not all-caps → leave
    return t
        .replace(/[A-Z][A-Z']*/g, (w) => (ACRONYMS.has(w) ? w : capitalize(w)))
        .replace(/(\d)Khz\b/g, '$1 kHz')
        .replace(/(\d)Hz\b/g, '$1 Hz');
}

class ModernUiEngine {
    constructor() {
        this.mode = 'tui';
        this.observer = null;
        this.observedTargets = [];
        this.isModern = false;
        this.isCleaning = false;
        this.animFrameId = null;
        this.pendingRoots = new Set();
        this.pendingFull = false;
        this.scopeRoots = null;          // null → whole document
        this.cleanedTextNodes = new Set();

        // Attach global hooks immediately
        window.switchUiMode = (m) => this.setMode(m);
        window.getUiMode = () => this.mode;

        this.init();
    }

    init() {
        try {
            // Check URL parameters (?ui=modern or ?ui=tui)
            const params = new URLSearchParams(window.location.search);
            const urlMode = params.get('ui');
            let savedMode = null;
            try { savedMode = localStorage.getItem(STORAGE_KEY); } catch (e) {}

            this.mode = (urlMode === 'modern' || (!urlMode && savedMode === 'modern')) ? 'modern' : 'tui';

            // Immediately persist active mode so page refreshes and reloads remember it
            try { localStorage.setItem(STORAGE_KEY, this.mode); } catch (e) {}

            // Clean URL parameter without reload
            if (urlMode) {
                params.delete('ui');
                const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
                window.history.replaceState({}, '', cleanUrl);
            }

            // Apply mode
            this.apply(this.mode, true);

            // Bind controls when DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.bindControls(), { once: true });
            } else {
                this.bindControls();
            }
        } catch (err) {
            console.error('[ModernUI] Init error:', err);
        }
    }

    setMode(newMode) {
        if (newMode !== 'modern' && newMode !== 'tui') return;
        if (newMode === this.mode && this.isModern === (newMode === 'modern')) return;
        this.mode = newMode;
        try { localStorage.setItem(STORAGE_KEY, newMode); } catch (e) {}
        this.apply(newMode, false);
    }

    apply(mode, quiet = false) {
        this.isModern = (mode === 'modern');
        const body = document.body;
        const html = document.documentElement;

        body.classList.toggle('ui-mode-modern', this.isModern);
        html.classList.toggle('ui-mode-modern', this.isModern);

        if (this.isModern) {
            this.transformToModern();
            this.connectObserver();
            // #5 cosmetic: Di mode tujuan, kalau modern prose
            // "Interface: modern liquid glass", kalau retro ">> INTERFACE:...".
            if (!quiet) this.showModernToast('>> INTERFACE: MODERN LIQUID GLASS');
        } else {
            this.disconnectObserver();
            this.restoreToTui();
            if (!quiet) this.showModernToast('>> INTERFACE: RETRO TUI');
        }

        // Render adaptive selector in settings
        this.renderAdaptiveSelector();
    }

    bindControls() {
        this.renderAdaptiveSelector();
        if (this.isModern) {
            this.transformToModern();
            this.connectObserver();
        }
    }

    renderAdaptiveSelector() {
        const settingsContent = document.querySelector('#settings-panel .settings-content');
        if (!settingsContent) return;

        let container = document.getElementById('ui-mode-selector-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ui-mode-selector-container';
            const head = settingsContent.querySelector('.drawer-head');
            if (head && head.nextSibling) {
                settingsContent.insertBefore(container, head.nextSibling);
            } else {
                settingsContent.prepend(container);
            }
            // One delegated listener instead of inline onclick per render.
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-ui-mode]');
                if (btn) this.setMode(btn.dataset.uiMode);
            });
        }

        // Skip identical re-renders (avoids needless DOM churn + observer wake-ups).
        const renderKey = `${this.isModern ? 'modern' : 'tui'}:${this.mode}`;
        if (container.dataset.renderKey === renderKey) return;
        container.dataset.renderKey = renderKey;

        const isTui = this.mode === 'tui';
        const isMod = this.mode === 'modern';

        // Adaptive rendering: Matches the active UI mode!
        if (this.isModern) {
            // Modern Liquid Glass segmented selector
            container.className = 'setting-group modern-ui-mode-group';
            container.innerHTML = `
                <label class="modern-ui-mode-label" id="ui-mode-label">Interface Experience</label>
                <div class="modern-segmented-control" role="radiogroup" aria-labelledby="ui-mode-label">
                    <button type="button" class="modern-seg-btn ${isTui ? 'active' : ''}" data-ui-mode="tui" role="radio" aria-checked="${isTui}">
                        <span class="seg-icon" aria-hidden="true">⌨</span>
                        <span class="seg-label">Retro TUI</span>
                    </button>
                    <button type="button" class="modern-seg-btn ${isMod ? 'active' : ''}" data-ui-mode="modern" role="radio" aria-checked="${isMod}">
                        <span class="seg-icon" aria-hidden="true">✦</span>
                        <span class="seg-label">Liquid Glass</span>
                    </button>
                </div>
            `;
        } else {
            // Retro TUI terminal toggle group
            container.className = 'setting-group tui-ui-mode-group';
            container.innerHTML = `
                <label>┌─ UI MODE // INTERFACE ENGINE ─────────────────────────┐</label>
                <div class="toggle-group" style="display: flex; gap: 8px; margin-top: 6px;">
                    <button type="button" class="tui-btn ui-mode-choice-btn ${isTui ? 'active' : ''}" data-ui-mode="tui" aria-pressed="${isTui}">
                        ${isTui ? '[•] RETRO TUI' : '[ ] RETRO TUI'}
                    </button>
                    <button type="button" class="tui-btn ui-mode-choice-btn ${isMod ? 'active' : ''}" data-ui-mode="modern" aria-pressed="${isMod}">
                        ${isMod ? '[•] MODERN LIQUID' : '[ ] MODERN LIQUID'}
                    </button>
                </div>
            `;
        }
    }

    transformToModern() {
        try {
            // 1. Navigation Rail Icons
            document.querySelectorAll('.rail-nav .nav-btn').forEach(btn => {
                const page = btn.dataset.page;
                const badge = btn.querySelector('.key-badge');
                if (!badge || !page || !ICONS[page]) return;
                if (!badge.hasAttribute('data-original')) {
                    badge.setAttribute('data-original', badge.textContent);
                }
                if (!badge.classList.contains('is-modern-icon')) {
                    badge.innerHTML = ICONS[page];
                    badge.classList.add('is-modern-icon');
                }
            });

            // 2. Clean Brand Subtitle
            const tuiSub = document.querySelector('.tui-sub');
            if (tuiSub && tuiSub.textContent !== 'LIQUID AUDIO') tuiSub.textContent = 'LIQUID AUDIO';

            // 3. Clean search button
            const searchGo = document.querySelector('.search-go');
            if (searchGo && searchGo.textContent !== 'Search') searchGo.textContent = 'Search';

            // 4. Clean play/pause button glyphs
            const playBtn = document.getElementById('play-btn');
            if (playBtn) {
                const gPlay = playBtn.querySelector('.glyph-play');
                const gPause = playBtn.querySelector('.glyph-pause');
                if (gPlay) this.cleanText(gPlay, '▶');
                if (gPause) this.cleanText(gPause, '❚❚');
            }

            // 5. Run deep content cleaner on the whole document
            this.cleanModernContent(null);
        } catch (err) {
            console.error('[ModernUI] Transform error:', err);
        }
    }

    restoreToTui() {
        try {
            // 1. Restore Navigation Badges
            document.querySelectorAll('.rail-nav .key-badge').forEach(badge => {
                const orig = badge.getAttribute('data-original');
                if (orig) {
                    badge.textContent = orig;
                    badge.classList.remove('is-modern-icon');
                }
            });

            // 2. Restore Brand Subtitle
            const tuiSub = document.querySelector('.tui-sub');
            if (tuiSub) tuiSub.textContent = 'TUI AUDIO CORE';

            // 3. Restore Search Button
            const searchGo = document.querySelector('.search-go');
            if (searchGo) searchGo.textContent = '[EXEC]';

            // 4. Restore drawer titles (legacy attribute from older builds)
            document.querySelectorAll('[data-original-title]').forEach(h => {
                h.textContent = h.getAttribute('data-original-title');
                h.removeAttribute('data-original-title');
            });

            // 5. Restore every node tracked by cleanText() / cleanTextNode()
            this.restoreText(document);

            // 6. Restore current page view if navigate is available
            const activeNav = document.querySelector('.rail-nav .nav-btn.active');
            if (activeNav && window.navigate) {
                window.navigate(activeNav.dataset.page || 'home');
            }
        } catch (err) {
            console.error('[ModernUI] Restore error:', err);
        }
    }

    /**
     * Replace an element's text while remembering the TUI original.
     * If external code rewrote the element since our last pass (e.g.
     * equalizer.js switching "[EQ: FLAT]" → "[EQ: BYPASS]"), the fresh
     * value becomes the new original so restore never shows stale text.
     */
    cleanText(el, cleaned) {
        if (!el || cleaned === undefined) return;
        const current = el.textContent;
        if (current === cleaned) return;
        if (!el.hasAttribute('data-orig-text') || el.__modernOut !== current) {
            try { el.setAttribute('data-orig-text', current); } catch (e) {}
        }
        el.textContent = cleaned;
        el.__modernOut = cleaned;
    }

    /** Same contract as cleanText() but for bare text nodes (mixed content). */
    cleanTextNode(node, cleaned) {
        if (!node || cleaned === undefined || node.nodeValue === cleaned) return;
        if (node.__modernOrig === undefined || node.__modernOut !== node.nodeValue) {
            node.__modernOrig = node.nodeValue;
        }
        node.nodeValue = cleaned;
        node.__modernOut = cleaned;
        this.cleanedTextNodes.add(node);
    }

    restoreText(scope) {
        (scope || document).querySelectorAll('[data-orig-text]').forEach(el => {
            const orig = el.getAttribute('data-orig-text');
            if (orig !== null && el.textContent !== orig) el.textContent = orig;
            el.removeAttribute('data-orig-text');
            el.__modernOut = undefined;
        });
        this.cleanedTextNodes.forEach(node => {
            if (node.isConnected && node.__modernOrig !== undefined && node.nodeValue === node.__modernOut) {
                node.nodeValue = node.__modernOrig;
            }
            node.__modernOrig = undefined;
            node.__modernOut = undefined;
        });
        this.cleanedTextNodes.clear();
    }

    stripBrackets(text) {
        const t = String(text || '').trim();
        if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).trim();
        // Also strip leading "[X] " prefix in mixed strings like "[ONE] Repeat single track".
        const leadingMatch = t.match(/^\[([A-Z][A-Z0-9 +×#.,&\-:/!%_]+)\]\s*/);
        if (leadingMatch) return t.slice(leadingMatch[0].length).trim();
        // Strip trailing " [X]" suffix (rare).
        return t.replace(/\s+\[[A-Z][A-Z0-9 +×#.,&\-:/!%_]+\]\s*$/, '').trim();
    }

    /**
     * Convert a TUI-style bracketed label into a friendly Title-Case form.
     * Phase 2: expanded to ~60 known labels discovered via codebase audit.
     */
    prettyLabel(raw) {
        const t = this.stripBrackets(raw);
        if (LABEL_MAP[t]) return LABEL_MAP[t];
        // Generic fallback: title-case uppercase strings, keeping acronyms.
        return smartTitle(t);
    }

    // #4 cosmetic: format toast message untuk Modern mode. Hilangkan
    // bracket pembungkus dan ubah jadi sentence-case (kecuali Akronim
    // umum AUTO-EQ/PERFECT TUNE/DSP/SPATIAL). Dipakai equalizer.js agar
    // toast AUTO-EQ & PERFECT TUNE konsisten dengan gaya Modern.
    formatModernToast(text) {
        const stripped = this.stripBrackets(text);
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

    // #5 cosmetic (shared): mode-aware toast helper. Di Modern hilangkan
    // bracket + sentence-case via formatModernToast, di Retro biarkan
    // apa adanya. expose ke window agar equalizer.js, app.js, dsb. bisa
    // pakai tanpa duplikasi mode-detection.
    showModernToast(msg) {
        if (!msg) return;
        const fallback = window.showToast
            || (window.player && window.player.showToast);
        if (typeof fallback !== 'function') return;
        if (this.isModern) {
            // Strip leading ">> " prefix gaya console retro, lalu format
            // sentence-case (akronim dipertahankan via formatModernToast).
            const stripped = String(msg).replace(/^\s*>>\s*/, '');
            fallback(this.formatModernToast(stripped));
        } else {
            fallback(msg);
        }
    }

    // ---------------------------------------------------------
    // Scoped query helpers. While a sweep runs, `scopeRoots` holds
    // the mutated subtrees (or null for a full-document pass).
    // ---------------------------------------------------------
    $$(selector) {
        const roots = this.scopeRoots;
        if (!roots) return document.querySelectorAll(selector);
        const out = new Set();
        for (const root of roots) {
            if (root.matches(selector)) out.add(root);
            root.querySelectorAll(selector).forEach(el => out.add(el));
        }
        return out;
    }

    byId(id) {
        const el = document.getElementById(id);
        if (!el || !this.scopeRoots) return el;
        for (const root of this.scopeRoots) {
            if (root.contains(el)) return el;
        }
        return null;
    }

    /** Clean bracketed direct text-node children of an element with icons/inputs. */
    cleanOwnTextNodes(el, transform) {
        for (const node of el.childNodes) {
            if (node.nodeType !== 3) continue;
            const raw = node.nodeValue;
            const trimmed = raw.trim();
            if (!trimmed) continue;
            const out = transform(trimmed);
            if (out && out !== trimmed) {
                // Preserve the surrounding whitespace so inline spacing survives.
                const lead = raw.match(/^\s*/)[0];
                const trail = raw.match(/\s*$/)[0];
                this.cleanTextNode(node, lead + out + trail);
            }
        }
    }

    /**
     * @param {Iterable<Element>|null} roots  Mutated subtrees; null = full document.
     */
    cleanModernContent(roots = null) {
        if (!this.isModern || this.isCleaning) return;
        this.isCleaning = true;

        // Fold in any records queued since the last callback so nothing is lost.
        if (this.observer && roots) {
            const extra = this.collectRoots(this.observer.takeRecords());
            if (extra === null) roots = null;
            else extra.forEach(r => roots.add(r));
        }
        this.scopeRoots = roots ? this.normalizeRoots(roots) : null;

        try {
            this.cleanBadgesAndButtons();
            this.cleanLiveControls();
            this.cleanHeadings();
            // Specific id→label mappings first; the generic sweep would
            // otherwise re-case "[◀ RETURN]" before it can become "← Back".
            this.cleanSpecificButtons();
            this.cleanButtonsAndLabels();
            this.cleanRanksAndLabels();
        } catch (err) {
            console.error('[ModernUI] Clean error:', err);
        } finally {
            this.scopeRoots = null;
            // Discard records produced by our own writes — no disconnect needed.
            if (this.observer) this.observer.takeRecords();
            this.isCleaning = false;
        }
    }

    // 1. Top bar, badges & drawer action buttons (leaf nodes only — nested
    // spans like [MODE: <span>] are skipped to avoid clobbering).
    cleanBadgesAndButtons() {
        this.$$(BADGE_SELECTOR).forEach(el => {
            if (el.children.length) return;
            const text = el.textContent.trim();
            if (isBracketed(text)) {
                let cleaned = this.stripBrackets(text);
                if (BADGE_SPECIALS[cleaned]) cleaned = BADGE_SPECIALS[cleaned];
                else if (/^(PLAYING|PAUSED|IDLE)$/.test(cleaned)) cleaned = capitalize(cleaned);
                this.cleanText(el, cleaned);
            } else if (text.startsWith('> ')) {
                this.cleanText(el, text.slice(2));
            }
        });

        this.$$(BUTTON_SELECTOR).forEach(el => {
            if (el.children.length) return;
            const text = el.textContent.trim();
            if (isBracketed(text)) {
                const inner = this.stripBrackets(text);
                this.cleanText(el, (inner === 'CLOSE ×' || inner === '✕') ? '✕' : this.prettyLabel(text));
            } else if (text.startsWith('> ')) {
                this.cleanText(el, text.slice(2));
            }
        });
    }

    // 1b. Live badges rewritten per-state by player.js / equalizer.js / spatial.js.
    cleanLiveControls() {
        const stateBadge = this.byId('player-state-badge');
        if (stateBadge) {
            const t = this.stripBrackets(stateBadge.textContent);
            if (/^(PLAYING|PAUSED|IDLE)$/i.test(t)) this.cleanText(stateBadge, capitalize(t));
        }
        const qualityBadge = this.byId('player-audio-quality');
        if (qualityBadge) {
            const m = qualityBadge.textContent.trim().match(/^\[(HQ|SQ)\s*·\s*(.+)\]$/);
            if (m) this.cleanText(qualityBadge, `${m[1]} · ${m[2]}`);
        }
        const leaf = (id) => {
            const el = this.byId(id);
            return el && el.children.length === 0 ? el : null;
        };
        const repeatBtn = leaf('repeat-btn');
        if (repeatBtn) {
            const t = this.stripBrackets(repeatBtn.textContent);
            if (/^REP\s*:/.test(t)) this.cleanText(repeatBtn, this.prettyLabel(t));
        }
        const crtBtn = leaf('crt-toggle-btn');
        if (crtBtn) {
            const t = this.stripBrackets(crtBtn.textContent);
            if (/^CRT\s*:\s*(ON|OFF)$/i.test(t)) this.cleanText(crtBtn, /ON$/i.test(t) ? 'CRT On' : 'CRT Off');
        }
        const followBtn = leaf('lyrics-autoscroll-btn');
        if (followBtn) {
            const t = this.stripBrackets(followBtn.textContent);
            if (/^FOLLOW\s*:\s*(ON|OFF)$/i.test(t)) this.cleanText(followBtn, /ON$/i.test(t) ? 'Follow On' : 'Follow Off');
        }
        const romanBtn = leaf('lyrics-roman-btn');
        if (romanBtn) {
            const t = this.stripBrackets(romanBtn.textContent);
            if (/^SCRIPT\s*:/i.test(t)) this.cleanText(romanBtn, smartTitle(t.replace(/^SCRIPT\s*:\s*/i, '')));
        }
        const lyricsBadge = leaf('lyrics-status-badge');
        if (lyricsBadge) {
            const t = this.stripBrackets(lyricsBadge.textContent);
            if (/^STATUS\s*:/i.test(t)) this.cleanText(lyricsBadge, t.replace(/^STATUS\s*:\s*/i, ''));
        }
        // Top-bar "[SPATIAL: OFF]" (spatial.js) → "Spatial Off" — matches the EQ deck button.
        const spatialTop = leaf('spatial-toggle-btn');
        if (spatialTop) {
            const raw = spatialTop.textContent.trim();
            if (isBracketed(raw)) this.cleanText(spatialTop, this.prettyLabel(raw));
        }
        // "[EQ: FLAT]" / "[EQ: AUTO·POP]" / "[EQ: BYPASS]" → "EQ · Flat" …
        const eqToggle = leaf('eq-toggle-btn');
        if (eqToggle) {
            const t = this.stripBrackets(eqToggle.textContent);
            const m = t.match(/^EQ\s*:\s*(.+)$/i);
            if (m) {
                const state = m[1].trim().toUpperCase() === 'BYPASS' ? 'Off' : smartTitle(m[1].trim());
                this.cleanText(eqToggle, `EQ · ${state}`);
            }
        }
    }

    // 2. Page headers, drawer titles, section titles & eyebrows.
    cleanHeadings() {
        this.$$('.page-header h1, .drawer-head h2, .drawer-head h3').forEach(h => {
            if (h.children.length) return;
            const current = h.textContent.trim();
            const hit = HEADING_MAP.find(([needle]) => current.includes(needle));
            let text = hit ? hit[1] : stripFrame(current).replace(/^(\[[A-Z0-9 ]+\]\s*)+/, '');
            // Page h1 can hold user data (playlist titles) — only static drawer titles are re-cased.
            if (!hit && h.tagName !== 'H1') text = smartTitle(text);
            if (text && text !== h.textContent) this.cleanText(h, text);
        });

        // 2b. EQ / deck section titles (┌─ GENRES & SOUND PROFILES ─┐ etc.)
        this.$$('.eq-section-title, .deck-h3').forEach(el => {
            if (el.children.length) return;
            const raw = el.textContent.trim();
            const cleaned = smartTitle(stripFrame(raw));
            if (cleaned && cleaned !== raw) this.cleanText(el, cleaned);
        });

        // 3. Eyebrows ([ 01 // TRENDING TRACKS ]) — CSS renders them uppercase.
        this.$$('.eyebrow').forEach(eb => {
            if (eb.children.length) return;
            let text = eb.textContent.trim();
            if (isBracketed(text)) text = text.slice(1, -1).trim();
            if (text.includes('//')) text = text.split('//').pop().trim();
            if (text.includes('·')) text = text.split('·')[0].trim();
            text = text.toLowerCase().replace(/(?:^|\s)\w/g, c => c.toUpperCase());
            if (eb.textContent !== text) this.cleanText(eb, text);
        });
    }

    // 4. Pretty labels on filters/chips/theme buttons + universal sweep.
    cleanButtonsAndLabels() {
        const handled = new Set();
        this.$$(PRETTY_SELECTOR).forEach(btn => {
            handled.add(btn);
            if (btn.children.length > 0) {
                // e.g. theme buttons: <span class="theme-swatch"></span>[MAC LIGHT]
                this.cleanOwnTextNodes(btn, (t) => (isBracketed(t) ? this.prettyLabel(t) : t));
                return;
            }
            const current = btn.textContent.trim();
            if (isBracketed(current)) {
                const cleaned = this.prettyLabel(current);
                if (cleaned !== current) this.cleanText(btn, cleaned);
            }
        });

        // 4b. Universal bracket-text sweep: catch *all* buttons whose entire
        // visible label is `[X]` and not already covered above.
        this.$$(SWEEP_SELECTOR).forEach(btn => {
            if (handled.has(btn) || btn.children.length > 0) return;
            if (btn.id === 'play-btn' || btn.id === 'repeat-btn') return;
            if (btn.classList.contains('glyph-play') || btn.classList.contains('glyph-pause')) return;
            const current = btn.textContent.trim();
            if (!current) return;
            if (isBracketed(current)) {
                const cleaned = this.prettyLabel(current);
                if (cleaned && cleaned !== current) this.cleanText(btn, cleaned);
            } else if (btn.classList.contains('nav-text')) {
                const cleaned = smartTitle(current);
                if (cleaned !== current) this.cleanText(btn, cleaned);
            }
        });

        // 4c. Settings checkboxes: "<input> [x] Shuffle playback order"
        this.$$('.toggle-group label.check').forEach(lbl => {
            this.cleanOwnTextNodes(lbl, (t) => t.replace(/^\[[x ]\]\s*/i, ''));
        });
        // …and select options: "[ONE] Repeat single track" → "Repeat single track"
        this.$$('.setting-group select option').forEach(opt => {
            const t = opt.textContent.trim();
            if (t.startsWith('[')) {
                const cleaned = this.stripBrackets(t);
                if (cleaned && cleaned !== t) this.cleanText(opt, cleaned);
            }
        });

        // 4d. Settings group captions: drop the "Terminal " jargon prefix.
        this.$$('.setting-group > label').forEach(lbl => {
            if (lbl.closest('#ui-mode-selector-container')) return;
            this.cleanOwnTextNodes(lbl, (t) => t.replace(/^Terminal\s+/i, ''));
        });
    }

    // 5. Specific buttons (dynamic pages + drawers + player bar).
    cleanSpecificButtons() {
        TEXT_BUTTONS.forEach(([id, match, out]) => {
            const el = this.byId(id);
            if (el && el.children.length === 0 && el.textContent.includes(match)) this.cleanText(el, out);
        });

        // Static player-bar buttons that never get rewritten by player.js
        this.$$('#player-bar .player-controls .tui-btn, #player-bar .player-right .tui-btn, #lyrics-toggle').forEach(el => {
            if (el.id === 'play-btn' || el.id === 'repeat-btn' || el.children.length > 0) return;
            const mapped = PLAYER_GLYPHS[el.textContent.trim()];
            if (mapped) this.cleanText(el, mapped);
        });

        // Clean play/pause button glyphs if rendered or rewritten
        const playBtn = this.byId('play-btn');
        if (playBtn) {
            const gPlay = playBtn.querySelector('.glyph-play');
            const gPause = playBtn.querySelector('.glyph-pause');
            if (gPlay && gPlay.textContent.includes('[')) this.cleanText(gPlay, '▶');
            if (gPause && gPause.textContent.includes('[')) this.cleanText(gPause, '❚❚');
        }

        this.$$('.lyrics-head-actions .tui-btn').forEach(el => {
            if (el.children.length === 0 && el.textContent.trim() === '[CLOSE ESC]') this.cleanText(el, 'Close');
        });
    }

    // 6–7. Track ranks ([01] → 1, [SONG] → Song) + status labels.
    cleanRanksAndLabels() {
        this.$$('.rank').forEach(r => {
            const current = r.textContent.trim();
            if (!isBracketed(current)) return;
            const inner = current.slice(1, -1).trim();
            const num = parseInt(inner, 10);
            if (!isNaN(num) && String(num) === inner.replace(/^0+(\d)/, '$1')) {
                this.cleanText(r, String(num));
            } else if (/^(SONG|VIDEO|PL)$/i.test(inner)) {
                this.cleanText(r, capitalize(inner));
            }
        });
        this.$$('.q-rank').forEach(r => {
            const t = r.textContent.trim();
            if (/^0\d$/.test(t)) this.cleanText(r, String(parseInt(t, 10)));
        });

        this.$$(LABEL_SELECTOR).forEach(lbl => {
            if (lbl.children.length > 0) return;
            const current = lbl.textContent.trim();
            if (isBracketed(current)) this.cleanText(lbl, this.stripBrackets(current));
        });
    }

    // ---------------------------------------------------------
    // Observer plumbing
    // ---------------------------------------------------------

    /** Reduce mutation records to the set of element roots worth sweeping. */
    collectRoots(records) {
        const roots = new Set();
        for (const rec of records) {
            if (rec.type === 'attributes') {
                // Self-healing guard: if any external script strips ui-mode-modern, restore it
                if (this.isModern && rec.target === document.body && !document.body.classList.contains('ui-mode-modern')) {
                    document.body.classList.add('ui-mode-modern');
                    document.documentElement.classList.add('ui-mode-modern');
                }
                continue;
            }
            const t = rec.target;
            if (!t || t.nodeType !== 1 || !t.isConnected) continue;
            if (t.closest(NOISY_SELECTOR)) continue;
            roots.add(t);
            if (roots.size > MAX_SCOPED_ROOTS) return null; // signal: full sweep
        }
        return roots;
    }

    /** Drop roots already contained in another root. */
    normalizeRoots(roots) {
        const list = [...roots].filter(r => r.isConnected);
        return list.filter(r => !list.some(o => o !== r && o.contains(r)));
    }

    scheduleClean(roots) {
        if (roots === null) this.pendingFull = true;
        else roots.forEach(r => this.pendingRoots.add(r));
        if (this.animFrameId) return;
        this.animFrameId = requestAnimationFrame(() => {
            this.animFrameId = null;
            const full = this.pendingFull;
            const pending = this.pendingRoots;
            this.pendingFull = false;
            this.pendingRoots = new Set();
            if (full) this.cleanModernContent(null);
            else if (pending.size) this.cleanModernContent(pending);
        });
    }

    connectObserver() {
        if (!this.observer) {
            this.observer = new MutationObserver((records) => {
                if (!this.isModern || this.isCleaning) return;
                const roots = this.collectRoots(records);
                if (roots === null || roots.size) this.scheduleClean(roots);
            });
        }

        // Observe document.body class attribute changes for self-healing
        if (document.body && !this.observedTargets.includes(document.body)) {
            this.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            this.observedTargets.push(document.body);
        }

        // Observe every live region once. observe() is additive, so guard
        // with observedTargets to never stack callbacks on the same node.
        OBSERVED_IDS.forEach(id => {
            const target = document.getElementById(id);
            if (target && !this.observedTargets.includes(target)) {
                this.observer.observe(target, { childList: true, subtree: true });
                this.observedTargets.push(target);
            }
        });
    }

    // Backwards-compatible alias.
    setupObserver() { this.connectObserver(); }

    disconnectObserver() {
        if (this.observer) this.observer.disconnect();
        this.observedTargets = [];
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
        this.pendingRoots.clear();
        this.pendingFull = false;
    }
}

// Instantiate engine safely
if (typeof window !== 'undefined') {
    window.modernUiEngine = new ModernUiEngine();
    // #5 cosmetic (shared): expose mode-aware toast ke window supaya
    // equalizer.js, app.js, dan modul lain cukup panggil 1 fungsi tanpa
    // duplikasi deteksi mode. Modern→formatModernToast, Retro→msg apa
    // adanya. Kalau engine belum siap, no-op (graceful).
    window.showModernToast = (msg) => {
        if (window.modernUiEngine && typeof window.modernUiEngine.showModernToast === 'function') {
            window.modernUiEngine.showModernToast(msg);
        } else if (window.showToast) {
            window.showToast(msg);
        } else if (window.player && window.player.showToast) {
            window.player.showToast(msg);
        }
    };
}

export default ModernUiEngine;
