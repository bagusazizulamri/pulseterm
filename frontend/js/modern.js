// =========================================================
// PulseTerm — Modern Liquid Glass Interface Engine
// Completely separate script powering the modern UI experience
// with zero TUI brackets, modern typography & fluid aesthetics.
// =========================================================

const SVG_ICONS = {
    home: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    library: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"></path><path d="M12 6v14"></path><path d="M8 8v12"></path><path d="M4 4v16"></path></svg>`,
    playlists: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    play: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`,
    pause: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    prev: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>`,
    next: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`,
    shuffle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>`,
    repeat: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`,
    queue: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    lyrics: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`
};

class ModernUiEngine {
    constructor() {
        this.mode = 'tui';
        this.observer = null;
        this.isModern = false;
        this.init();
    }

    init() {
        // 1. Check URL parameters (?ui=modern or ?ui=tui)
        const params = new URLSearchParams(window.location.search);
        const urlMode = params.get('ui');
        const savedMode = localStorage.getItem('pulseterm_ui_mode');

        if (urlMode === 'modern' || (!urlMode && savedMode === 'modern')) {
            this.mode = 'modern';
        } else {
            this.mode = 'tui';
        }

        // Clean URL parameter without reload if user used ?ui=
        if (urlMode) {
            params.delete('ui');
            const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
            window.history.replaceState({}, '', cleanUrl);
        }

        // 2. Attach global hooks
        window.switchUiMode = (m) => this.setMode(m);
        window.getUiMode = () => this.mode;

        // 3. Apply mode
        this.apply(this.mode, true);

        // 4. Setup DOM observer for reactive bracket removal
        this.setupObserver();

        // 5. Update UI Switcher in settings panel when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindControls());
        } else {
            this.bindControls();
        }
    }

    setMode(newMode) {
        if (newMode !== 'modern' && newMode !== 'tui') return;
        this.mode = newMode;
        localStorage.setItem('pulseterm_ui_mode', newMode);
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
            if (!quiet && window.player && typeof window.player.showToast === 'function') {
                window.player.showToast('>> INTERFACE: MODERN LIQUID GLASS');
            }
        } else {
            body.classList.remove('ui-mode-modern');
            html.classList.remove('ui-mode-modern');
            this.restoreToTui();
            if (!quiet && window.player && typeof window.player.showToast === 'function') {
                window.player.showToast('>> INTERFACE: RETRO TUI');
            }
        }

        this.updateSwitcherButtons();
    }

    bindControls() {
        this.injectSwitcherInSettings();
        if (this.isModern) {
            this.transformToModern();
        }
    }

    injectSwitcherInSettings() {
        const settingsContent = document.querySelector('#settings-panel .settings-content');
        if (!settingsContent) return;

        let existing = document.getElementById('modern-ui-mode-switcher');
        if (!existing) {
            const group = document.createElement('div');
            group.id = 'modern-ui-mode-switcher';
            group.className = 'setting-group ui-mode-setting-card';
            group.innerHTML = `
                <label>Interface Experience Mode</label>
                <div class="ui-mode-choice-wrap">
                    <button type="button" id="ui-mode-tui-btn" class="ui-mode-btn ${this.mode === 'tui' ? 'active' : ''}" onclick="window.switchUiMode('tui')">
                        <span class="mode-icon">⌨</span>
                        <div class="mode-desc">
                            <strong>Retro TUI</strong>
                            <small>Terminal monospace & ASCII aesthetics</small>
                        </div>
                    </button>
                    <button type="button" id="ui-mode-modern-btn" class="ui-mode-btn ${this.mode === 'modern' ? 'active' : ''}" onclick="window.switchUiMode('modern')">
                        <span class="mode-icon">✦</span>
                        <div class="mode-desc">
                            <strong>Modern Liquid Glass</strong>
                            <small>Clean frosted glass & modern typography</small>
                        </div>
                    </button>
                </div>
            `;

            // Insert at the top of settings-content after drawer-head
            const head = settingsContent.querySelector('.drawer-head');
            if (head && head.nextSibling) {
                settingsContent.insertBefore(group, head.nextSibling);
            } else {
                settingsContent.prepend(group);
            }
        }
        this.updateSwitcherButtons();
    }

    updateSwitcherButtons() {
        const tuiBtn = document.getElementById('ui-mode-tui-btn');
        const modernBtn = document.getElementById('ui-mode-modern-btn');
        if (tuiBtn) tuiBtn.classList.toggle('active', this.mode === 'tui');
        if (modernBtn) modernBtn.classList.toggle('active', this.mode === 'modern');
    }

    transformToModern() {
        // Modernize Navigation Rail Icons
        const navBtns = document.querySelectorAll('.rail-nav .nav-btn');
        navBtns.forEach(btn => {
            const page = btn.dataset.page;
            const badge = btn.querySelector('.key-badge');
            if (badge && page && SVG_ICONS[page]) {
                badge.setAttribute('data-original', badge.textContent);
                badge.innerHTML = SVG_ICONS[page];
                badge.classList.add('is-modern-icon');
            }
        });

        // Modernize Top Bar badges & labels
        this.cleanBrackets();

        // Modernize Drawer Titles
        document.querySelectorAll('.drawer-head h2, .drawer-head h3').forEach(h => {
            if (!h.hasAttribute('data-original-title')) {
                h.setAttribute('data-original-title', h.textContent);
            }
            const orig = h.getAttribute('data-original-title');
            if (orig.includes('CONFIG // SYSTEM PREFERENCES')) {
                h.textContent = 'System Preferences';
            } else if (orig.includes('PLAYBACK QUEUE BUFFER')) {
                h.textContent = 'Playback Queue';
            } else if (orig.includes('10-BAND DSP EQUALIZER')) {
                h.textContent = '10-Band Equalizer';
            } else if (orig.includes('AUDIO SPECTRUM ANALYZER')) {
                h.textContent = 'Audio Spectrum Analyzer';
            }
        });

        // Modernize Search Button
        const searchGo = document.querySelector('.search-go');
        if (searchGo) {
            searchGo.textContent = 'Search';
        }

        // Modernize Brand subtitle
        const tuiSub = document.querySelector('.tui-sub');
        if (tuiSub) {
            tuiSub.textContent = 'LIQUID AUDIO';
        }
    }

    restoreToTui() {
        // Restore Navigation Badges
        document.querySelectorAll('.rail-nav .key-badge').forEach(badge => {
            const orig = badge.getAttribute('data-original');
            if (orig) {
                badge.textContent = orig;
                badge.classList.remove('is-modern-icon');
            }
        });

        // Restore Drawer Titles
        document.querySelectorAll('.drawer-head h2, .drawer-head h3').forEach(h => {
            const orig = h.getAttribute('data-original-title');
            if (orig) h.textContent = orig;
        });

        // Restore Search Button
        const searchGo = document.querySelector('.search-go');
        if (searchGo) {
            searchGo.textContent = '[EXEC]';
        }

        // Restore Brand Subtitle
        const tuiSub = document.querySelector('.tui-sub');
        if (tuiSub) {
            tuiSub.textContent = 'TUI AUDIO CORE';
        }
    }

    cleanBrackets() {
        if (!this.isModern) return;

        // Select elements likely containing TUI brackets
        const targets = document.querySelectorAll(`
            .top-bar-actions .tui-badge,
            .top-bar-actions .tui-btn,
            #player-state-badge,
            #player-audio-quality,
            .eq-action-buttons .tui-btn,
            .eq-state-badge,
            .tui-clear-btn,
            .drawer-head-actions .tui-btn,
            .drawer-head button.tui-btn
        `);

        targets.forEach(el => {
            // Check if element has child elements
            if (el.children.length === 0) {
                const text = el.textContent.trim();
                if (text.startsWith('[') && text.endsWith(']')) {
                    let cleaned = text.slice(1, -1).trim();
                    if (cleaned === 'CLOSE ×') cleaned = '✕';
                    else if (cleaned === '✕') cleaned = '✕';
                    else if (cleaned === 'HELP: ?') cleaned = 'Shortcuts';
                    else if (cleaned === 'CONFIG') cleaned = 'Settings';
                    else if (cleaned === 'VIZ: CAVA') cleaned = 'Visualizer';
                    el.textContent = cleaned;
                }
            }
        });
    }

    setupObserver() {
        if (this.observer) this.observer.disconnect();

        this.observer = new MutationObserver(() => {
            if (this.isModern) {
                this.cleanBrackets();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
}

// Instantiate engine once DOM is available
if (typeof window !== 'undefined') {
    window.modernUiEngine = new ModernUiEngine();
}

export default ModernUiEngine;
