// =========================================================
// PulseTerm — Modern Liquid Glass Interface Engine
// Handles UI Mode switching, reactive bracket removal,
// and adaptive switcher rendering for both TUI & Modern modes.
// Crash-proof, debounced, zero infinite-loop mutations.
// =========================================================

const ICONS = {
    home: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    library: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"></path><path d="M12 6v14"></path><path d="M8 8v12"></path><path d="M4 4v16"></path></svg>`,
    playlists: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    play: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`,
    pause: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    prev: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>`,
    next: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`
};

class ModernUiEngine {
    constructor() {
        this.mode = 'tui';
        this.observer = null;
        this.observedTargets = [];
        this.isModern = false;
        this.isCleaning = false;
        this.animFrameId = null;

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
            const savedMode = localStorage.getItem('pulseterm_ui_mode');

            if (urlMode === 'modern' || (!urlMode && savedMode === 'modern')) {
                this.mode = 'modern';
            } else {
                this.mode = 'tui';
            }

            // Immediately persist active mode so page refreshes and reloads remember it
            try {
                localStorage.setItem('pulseterm_ui_mode', this.mode);
            } catch (e) {}

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
                document.addEventListener('DOMContentLoaded', () => this.bindControls());
            } else {
                this.bindControls();
            }

            // Setup DOM observer
            this.setupObserver();
        } catch (err) {
            console.error('[ModernUI] Init error:', err);
        }
    }

    setMode(newMode) {
        if (newMode !== 'modern' && newMode !== 'tui') return;
        this.mode = newMode;
        try {
            localStorage.setItem('pulseterm_ui_mode', newMode);
        } catch (e) {}
        this.apply(newMode, false);
    }

    apply(mode, quiet = false) {
        this.isModern = (mode === 'modern');
        const body = document.body;
        const html = document.documentElement;

        if (this.isModern) {
            body.classList.add('ui-mode-modern');
            html.classList.add('ui-mode-modern');
            this.transformToModern();
            if (!quiet) {
                const toast = window.showToast || (window.player && window.player.showToast);
                if (typeof toast === 'function') toast('>> INTERFACE: MODERN LIQUID GLASS');
            }
        } else {
            body.classList.remove('ui-mode-modern');
            html.classList.remove('ui-mode-modern');
            this.restoreToTui();
            if (!quiet) {
                const toast = window.showToast || (window.player && window.player.showToast);
                if (typeof toast === 'function') toast('>> INTERFACE: RETRO TUI');
            }
        }

        // Render adaptive selector in settings
        this.renderAdaptiveSelector();
    }

    bindControls() {
        this.renderAdaptiveSelector();
        if (this.isModern) {
            this.transformToModern();
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
        }

        // Adaptive rendering: Matches the active UI mode!
        if (this.isModern) {
            // Modern Liquid Glass segmented selector
            container.className = 'setting-group modern-ui-mode-group';
            container.innerHTML = `
                <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.6rem;">Interface Experience</label>
                <div class="modern-segmented-control">
                    <button type="button" class="modern-seg-btn ${this.mode === 'tui' ? 'active' : ''}" onclick="window.switchUiMode('tui')">
                        <span class="seg-icon">⌨</span>
                        <span class="seg-label">Retro TUI</span>
                    </button>
                    <button type="button" class="modern-seg-btn ${this.mode === 'modern' ? 'active' : ''}" onclick="window.switchUiMode('modern')">
                        <span class="seg-icon">✦</span>
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
                    <button type="button" class="tui-btn ui-mode-choice-btn ${this.mode === 'tui' ? 'active' : ''}" onclick="window.switchUiMode('tui')">
                        ${this.mode === 'tui' ? '[•] RETRO TUI' : '[ ] RETRO TUI'}
                    </button>
                    <button type="button" class="tui-btn ui-mode-choice-btn ${this.mode === 'modern' ? 'active' : ''}" onclick="window.switchUiMode('modern')">
                        ${this.mode === 'modern' ? '[•] MODERN LIQUID' : '[ ] MODERN LIQUID'}
                    </button>
                </div>
            `;
        }
    }

    transformToModern() {
        try {
            // 1. Navigation Rail Icons
            const navBtns = document.querySelectorAll('.rail-nav .nav-btn');
            navBtns.forEach(btn => {
                const page = btn.dataset.page;
                const badge = btn.querySelector('.key-badge');
                if (badge && page && ICONS[page]) {
                    if (!badge.hasAttribute('data-original')) {
                        badge.setAttribute('data-original', badge.textContent);
                    }
                    if (!badge.classList.contains('is-modern-icon')) {
                        badge.innerHTML = ICONS[page];
                        badge.classList.add('is-modern-icon');
                    }
                }
            });

            // 2. Clean Brand Subtitle
            const tuiSub = document.querySelector('.tui-sub');
            if (tuiSub && tuiSub.textContent !== 'LIQUID AUDIO') {
                tuiSub.textContent = 'LIQUID AUDIO';
            }

            // 3. Clean search button
            const searchGo = document.querySelector('.search-go');
            if (searchGo && searchGo.textContent !== 'Search') {
                searchGo.textContent = 'Search';
            }

            // 4. Clean play/pause button glyphs
            const playBtn = document.getElementById('play-btn');
            if (playBtn) {
                const gPlay = playBtn.querySelector('.glyph-play');
                const gPause = playBtn.querySelector('.glyph-pause');
                if (gPlay) this.cleanText(gPlay, '▶');
                if (gPause) this.cleanText(gPause, '❚❚');
            }

            // 5. Run deep content cleaner safely
            this.cleanModernContent();
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

            // 4. Restore drawer titles
            document.querySelectorAll('.drawer-head h2, .drawer-head h3').forEach(h => {
                const orig = h.getAttribute('data-original-title');
                if (orig) h.textContent = orig;
            });

            // 5. Restore current page view if navigate is available
            const activeNav = document.querySelector('.rail-nav .nav-btn.active');
            if (activeNav && window.navigate) {
                window.navigate(activeNav.dataset.page || 'home');
            }

            // 6. Restore every node tracked by cleanText()
            this.restoreText(document);
        } catch (err) {
            console.error('[ModernUI] Restore error:', err);
        }
    }

    cleanText(el, cleaned) {
        if (el && cleaned !== undefined && el.textContent !== cleaned) {
            if (!el.hasAttribute('data-orig-text')) {
                try { el.setAttribute('data-orig-text', el.textContent); } catch (e) {}
            }
            el.textContent = cleaned;
        }
    }

    restoreText(scope) {
        (scope || document).querySelectorAll('[data-orig-text]').forEach(el => {
            const orig = el.getAttribute('data-orig-text');
            if (orig !== null && el.textContent !== orig) el.textContent = orig;
            el.removeAttribute('data-orig-text');
        });
    }

    stripBrackets(text) {
        const t = String(text || '').trim();
        if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).trim();
        return t;
    }

    cleanModernContent() {
        if (!this.isModern || this.isCleaning) return;
        this.isCleaning = true;

        // Stack-safe disconnect: observe() is additive per spec, so drop
        // every stacked target before cleaning to avoid N× callbacks.
        if (this.observer) {
            this.observer.disconnect();
            this.observedTargets = [];
        }

        try {
            // 1. Clean Top Bar & Badges (leaf nodes only — nested spans
            // like [MODE: <span>] are skipped to avoid clobbering).
            document.querySelectorAll(`
                .top-bar-actions .tui-badge,
                .top-bar-actions .tui-btn,
                #player-audio-quality,
                .eq-action-buttons .tui-btn,
                .eq-state-badge,
                .tui-clear-btn,
                .drawer-head-actions .tui-btn,
                .eq-chip,
                .suggestion-item,
                #toast-action
            `).forEach(el => {
                if (el.children.length === 0) {
                    const text = el.textContent.trim();
                    if (text.startsWith('[') && text.endsWith(']')) {
                        let cleaned = this.stripBrackets(text);
                        if (cleaned === 'CLOSE ×' || cleaned === '✕') cleaned = '✕';
                        else if (cleaned === 'CLOSE ESC') cleaned = 'Close';
                        else if (cleaned === 'HELP: ?') cleaned = 'Shortcuts';
                        else if (cleaned === 'CONFIG') cleaned = 'Settings';
                        else if (cleaned === 'VIZ: CAVA') cleaned = 'Visualizer';
                        else if (/^(PLAYING|PAUSED|IDLE)$/.test(cleaned)) cleaned = cleaned.charAt(0) + cleaned.slice(1).toLowerCase();
                        this.cleanText(el, cleaned);
                    } else if (text.startsWith('> ')) {
                        this.cleanText(el, text.slice(2));
                    }
                }
            });

            // 1b. Live badges rewritten per-tick by player.js / equalizer.js.
            const stateBadge = document.getElementById('player-state-badge');
            if (stateBadge) {
                const t = this.stripBrackets(stateBadge.textContent);
                if (/^(PLAYING|PAUSED|IDLE)$/i.test(t)) {
                    this.cleanText(stateBadge, t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
                }
            }
            const qualityBadge = document.getElementById('player-audio-quality');
            if (qualityBadge) {
                const m = qualityBadge.textContent.trim().match(/^\[(HQ|SQ)\s*·\s*(.+)\]$/);
                if (m) this.cleanText(qualityBadge, `${m[1]} · ${m[2]}`);
            }
            const repeatBtn = document.getElementById('repeat-btn');
            if (repeatBtn && repeatBtn.children.length === 0) {
                const t = this.stripBrackets(repeatBtn.textContent);
                const map = { 'REP: OFF': 'Repeat Off', 'REP: ALL': 'Repeat All', 'REP: ONE': 'Repeat One' };
                if (map[t]) this.cleanText(repeatBtn, map[t]);
            }
            const crtBtn = document.getElementById('crt-toggle-btn');
            if (crtBtn && crtBtn.children.length === 0) {
                const t = this.stripBrackets(crtBtn.textContent);
                if (/^CRT\s*:\s*(ON|OFF)$/i.test(t)) this.cleanText(crtBtn, t.split(':')[1].trim() === 'ON' ? 'CRT On' : 'CRT Off');
            }
            const followBtn = document.getElementById('lyrics-autoscroll-btn');
            if (followBtn && followBtn.children.length === 0) {
                const t = this.stripBrackets(followBtn.textContent);
                if (/^FOLLOW\s*:\s*(ON|OFF)$/i.test(t)) this.cleanText(followBtn, t.split(':')[1].trim() === 'ON' ? 'Follow On' : 'Follow Off');
            }
            const romanBtn = document.getElementById('lyrics-roman-btn');
            if (romanBtn && romanBtn.children.length === 0) {
                const t = this.stripBrackets(romanBtn.textContent);
                if (/^SCRIPT\s*:/i.test(t)) this.cleanText(romanBtn, t.replace(/^SCRIPT\s*:\s*/i, ''));
            }
            const lyricsBadge = document.getElementById('lyrics-status-badge');
            if (lyricsBadge && lyricsBadge.children.length === 0) {
                const t = this.stripBrackets(lyricsBadge.textContent);
                if (/^STATUS\s*:/i.test(t)) this.cleanText(lyricsBadge, t.replace(/^STATUS\s*:\s*/i, ''));
            }
            const eqToggle = document.getElementById('eq-toggle-btn');
            if (eqToggle && eqToggle.children.length === 0) {
                const t = this.stripBrackets(eqToggle.textContent);
                if (/^EQ\s*:/i.test(t)) this.cleanText(eqToggle, t.replace(/^EQ\s*:\s*/i, ''));
            }

            // 2. Clean Page Headers & ASCII frames (┌─ ... ─┐)
            document.querySelectorAll('.page-header h1, .drawer-head h2, .drawer-head h3').forEach(h => {
                if (!h.hasAttribute('data-original-title')) {
                    h.setAttribute('data-original-title', h.textContent);
                }
                const current = h.textContent.trim();
                let text = current;
                if (text.includes('PULSETERM AUDIO ARCHIVE')) text = 'Featured & Trending';
                else if (text.includes('SEARCH ENGINE QUERY BUFFER')) text = 'Search Music';
                else if (text.includes('SAVED AUDIO REPOSITORY')) text = 'Your Library';
                else if (text.includes('LOCAL PLAYLIST REGISTRY')) text = 'Your Playlists';
                else if (text.includes('CONFIG // SYSTEM PREFERENCES')) text = 'System Preferences';
                else if (text.includes('PLAYBACK QUEUE BUFFER')) text = 'Playback Queue';
                else if (text.includes('10-BAND DSP EQUALIZER')) text = '10-Band Equalizer';
                else if (text.includes('AUDIO SPECTRUM ANALYZER')) text = 'Audio Visualizer';
                else {
                    text = text.replace(/^[┌─\s]+/, '').replace(/[─┐\s]+$/, '').trim();
                }
                if (h.textContent !== text) h.textContent = text;
            });

            // 3. Clean Eyebrows ([ 01 // TRENDING TRACKS ])
            document.querySelectorAll('.eyebrow').forEach(eb => {
                const current = eb.textContent.trim();
                let text = current;
                if (text.startsWith('[') && text.endsWith(']')) {
                    text = text.slice(1, -1).trim();
                }
                if (text.includes('//')) {
                    const parts = text.split('//');
                    text = parts[parts.length - 1].trim();
                }
                if (text.includes('·')) {
                    text = text.split('·')[0].trim();
                }
                text = text.toLowerCase().replace(/(?:^|\s)\w/g, c => c.toUpperCase());
                if (eb.textContent !== text) eb.textContent = text;
            });

            document.querySelectorAll('.filter-btn, .search-filters button, .quick-tag-btn, #eq-auto-btn, #eq-auto-toggle-btn, #spatial-panel-btn, #eq-perfect-btn, .zoom-preset-btn').forEach(btn => {
                if (btn.children.length > 0) return;
                const current = btn.textContent.trim();
                if (current.startsWith('[') && current.endsWith(']')) {
                    const text = this.stripBrackets(current);
                    // Keep EQ/DSP telemetry uppercase-ish, prettify the rest
                    const cleaned = /^(EQ|DSP|SPATIAL|AUTO|PERFECT|RESET)/i.test(text)
                        ? text
                        : (text.charAt(0) + text.slice(1).toLowerCase());
                    this.cleanText(btn, cleaned);
                }
            });

            // 5. Clean Specific Buttons (dynamic pages + drawers)
            const textBtns = [
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
                ['queue-panel', null, null],
            ];
            textBtns.forEach(([id, match, out]) => {
                if (!match) return;
                const el = document.getElementById(id);
                if (el && el.children.length === 0 && el.textContent.includes(match)) this.cleanText(el, out);
            });
            // Static player-bar buttons that never get rewritten by player.js
            document.querySelectorAll('#player-bar .player-controls .tui-btn, #player-bar .player-right .tui-btn, #lyrics-toggle').forEach(el => {
                if (el.id === 'play-btn' || el.id === 'repeat-btn' || el.children.length > 0) return;
                const t = el.textContent.trim();
                const m = { '[◀◀]': '‹‹', '[▶▶]': '››', '[SHUF]': 'Shuffle', '[AUTOPLAY]': 'Autoplay', '[QUEUE]': 'Queue', '[LYRICS]': 'Lyrics' };
                if (m[t]) this.cleanText(el, m[t]);
            });
            // Clean play/pause button glyphs if rendered or rewritten
            const playBtn = document.getElementById('play-btn');
            if (playBtn) {
                const gPlay = playBtn.querySelector('.glyph-play');
                const gPause = playBtn.querySelector('.glyph-pause');
                if (gPlay && gPlay.textContent.includes('[')) this.cleanText(gPlay, '▶');
                if (gPause && gPause.textContent.includes('[')) this.cleanText(gPause, '❚❚');
            }
            const toastAction = document.getElementById('toast-action');
            if (toastAction && toastAction.children.length === 0) {
                const t = this.stripBrackets(toastAction.textContent);
                if (t === 'UNDO') this.cleanText(toastAction, 'Undo');
            }

            // 6. Clean Track Ranks ([01] -> 1, [SONG]/[VIDEO] -> Song/Video)
            document.querySelectorAll('.rank').forEach(r => {
                const current = r.textContent.trim();
                if (current.startsWith('[') && current.endsWith(']')) {
                    const inner = current.slice(1, -1).trim();
                    const num = parseInt(inner, 10);
                    if (!isNaN(num) && String(num) === inner.replace(/^0+(\d)/, '$1')) {
                        this.cleanText(r, String(num));
                    } else if (/^(SONG|VIDEO|PL)$/i.test(inner)) {
                        this.cleanText(r, inner.charAt(0).toUpperCase() + inner.slice(1).toLowerCase());
                    }
                }
            });
            document.querySelectorAll('.q-rank').forEach(r => {
                const t = r.textContent.trim();
                if (/^0\d$/.test(t)) this.cleanText(r, String(parseInt(t, 10)));
            });

            // 7. Clean Status Labels + eyebrows + fallback covers + misc
            document.querySelectorAll('.label, .empty-state .label, .eyebrow-label, .cover-zoom-prompt, .cover-fallback, .tui-state-badge, .card-subtitle .tui-state-badge').forEach(lbl => {
                if (lbl.children.length > 0) return;
                const current = lbl.textContent.trim();
                if (current.startsWith('[') && current.endsWith(']')) {
                    this.cleanText(lbl, this.stripBrackets(current));
                }
            });
            document.querySelectorAll('.artwork-meta-footer #artwork-spec-label').forEach(lbl => {
                const t = lbl.textContent.trim();
                if (t.startsWith('[') && t.endsWith(']')) this.cleanText(lbl, this.stripBrackets(t));
            });
            document.querySelectorAll('.lyrics-head-actions .tui-btn').forEach(el => {
                if (el.children.length > 0) return;
                const t = el.textContent.trim();
                if (t === '[CLOSE ESC]') this.cleanText(el, 'Close');
            });
        } catch (err) {
            console.error('[ModernUI] Clean error:', err);
        } finally {
            this.isCleaning = false;
            // Reconnect observer safely
            this.setupObserver();
        }
    }

    setupObserver() {
        if (!this.observer) {
            this.observer = new MutationObserver(() => {
                if (this.isModern) {
                    // Self-healing guard: if any external script strips ui-mode-modern, restore it
                    if (document.body && !document.body.classList.contains('ui-mode-modern')) {
                        document.body.classList.add('ui-mode-modern');
                    }
                    if (document.documentElement && !document.documentElement.classList.contains('ui-mode-modern')) {
                        document.documentElement.classList.add('ui-mode-modern');
                    }
                    if (!this.isCleaning) {
                        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
                        this.animFrameId = requestAnimationFrame(() => {
                            this.cleanModernContent();
                        });
                    }
                }
            });
        }

        // Observe document.body class attribute changes for self-healing
        if (document.body && !this.observedTargets.includes(document.body)) {
            this.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            this.observedTargets.push(document.body);
        }

        // Observe every live region once. observe() is additive, so guard
        // with observedTargets — re-calling setupObserver() after each clean
        // must NOT stack another callback on the same node.
        const targets = [
            document.getElementById('page-content'),
            document.getElementById('player-bar'),
            document.getElementById('queue-panel'),
            document.getElementById('equalizer-panel'),
            document.getElementById('now-playing'),
            document.getElementById('settings-panel'),
            document.getElementById('visualizer-drawer'),
            document.getElementById('top-bar'),
        ].filter(Boolean);
        targets.forEach(target => {
            if (!this.observedTargets.includes(target)) {
                this.observer.observe(target, { childList: true, subtree: true });
                this.observedTargets.push(target);
            }
        });
    }

    disconnectObserver() {
        if (this.observer) this.observer.disconnect();
        this.observedTargets = [];
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
    }
}

// Instantiate engine safely
if (typeof window !== 'undefined') {
    window.modernUiEngine = new ModernUiEngine();
}

export default ModernUiEngine;
