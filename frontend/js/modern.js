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

            // 4. Run deep content cleaner safely
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
        } catch (err) {
            console.error('[ModernUI] Restore error:', err);
        }
    }

    cleanModernContent() {
        if (!this.isModern || this.isCleaning) return;
        this.isCleaning = true;

        // Disconnect observer temporarily to prevent ANY recursive mutations
        if (this.observer) {
            this.observer.disconnect();
        }

        try {
            // 1. Clean Top Bar & Badges
            document.querySelectorAll(`
                .top-bar-actions .tui-badge,
                .top-bar-actions .tui-btn,
                #player-state-badge,
                #player-audio-quality,
                .eq-action-buttons .tui-btn,
                .eq-state-badge,
                .tui-clear-btn,
                .drawer-head-actions .tui-btn,
                .drawer-head button.tui-btn
            `).forEach(el => {
                if (el.children.length === 0) {
                    const text = el.textContent.trim();
                    if (text.startsWith('[') && text.endsWith(']')) {
                        let cleaned = text.slice(1, -1).trim();
                        if (cleaned === 'CLOSE ×' || cleaned === '✕') cleaned = '✕';
                        else if (cleaned === 'HELP: ?') cleaned = 'Shortcuts';
                        else if (cleaned === 'CONFIG') cleaned = 'Settings';
                        else if (cleaned === 'VIZ: CAVA') cleaned = 'Visualizer';
                        if (el.textContent !== cleaned) el.textContent = cleaned;
                    }
                }
            });

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

            // 4. Clean Filter Buttons ([ALL], [SONGS], etc.)
            document.querySelectorAll('.filter-btn, .search-filters button').forEach(btn => {
                const current = btn.textContent.trim();
                if (current.startsWith('[') && current.endsWith(']')) {
                    const text = current.slice(1, -1).trim();
                    const cleaned = text.charAt(0) + text.slice(1).toLowerCase();
                    if (btn.textContent !== cleaned) btn.textContent = cleaned;
                }
            });

            // 5. Clean Specific Buttons
            const backBtn = document.getElementById('detail-back');
            if (backBtn && backBtn.textContent.includes('RETURN')) backBtn.textContent = '← Back';

            const playAllBtn = document.getElementById('detail-play');
            if (playAllBtn && playAllBtn.textContent.includes('PLAY ALL')) playAllBtn.textContent = '▶ Play All';

            const purgeHistBtn = document.getElementById('clear-hist-btn');
            if (purgeHistBtn && purgeHistBtn.textContent.includes('PURGE')) purgeHistBtn.textContent = 'Clear History';

            const newPlBtn = document.getElementById('new-pl-btn');
            if (newPlBtn && newPlBtn.textContent.includes('NEW PLAYLIST')) newPlBtn.textContent = '+ New Playlist';

            // 6. Clean Track Ranks ([01] -> 1)
            document.querySelectorAll('.rank').forEach(r => {
                const current = r.textContent.trim();
                if (current.startsWith('[') && current.endsWith(']')) {
                    const num = parseInt(current.slice(1, -1), 10);
                    if (!isNaN(num) && r.textContent !== String(num)) {
                        r.textContent = String(num);
                    }
                }
            });

            // 7. Clean Status Labels
            document.querySelectorAll('.label, .empty-state .label').forEach(lbl => {
                const current = lbl.textContent.trim();
                if (current.startsWith('[') && current.endsWith(']')) {
                    const cleaned = current.slice(1, -1).trim();
                    if (lbl.textContent !== cleaned) lbl.textContent = cleaned;
                }
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
                if (this.isModern && !this.isCleaning) {
                    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
                    this.animFrameId = requestAnimationFrame(() => {
                        this.cleanModernContent();
                    });
                }
            });
        }

        // Only observe main dynamic content container, never document.body characterData!
        const target = document.getElementById('page-content') || document.body;
        if (target) {
            this.observer.observe(target, {
                childList: true,
                subtree: true
            });
        }
    }
}

// Instantiate engine safely
if (typeof window !== 'undefined') {
    window.modernUiEngine = new ModernUiEngine();
}

export default ModernUiEngine;
