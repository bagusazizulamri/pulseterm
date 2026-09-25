// PulseTerm — Minimalist TUI Audio Player Visualizer Engine
// High-performance spectrum analyzer, oscilloscope & ASCII visualizer
// Designed with authentic terminal aesthetics (no AI-slop)

import { equalizer } from './equalizer.js';

class TerminalVisualizer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.miniEl = null;
        this.audio = null;
        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.freqArray = null;
        this.animId = null;
        this.miniTimer = null;
        this.active = false;
        this.mode = 'cava'; // 'cava', 'wave', 'vu', 'ascii'
        this.modes = ['cava', 'wave', 'vu', 'ascii'];
        this.peaks = new Array(32).fill(0);
        this.peakHold = new Array(32).fill(0);
        this.simPhase = 0;
        this.crtEnabled = localStorage.getItem('pulseterm_crt') === 'true';
    }

    init(audioElement) {
        this.audio = audioElement;
        this.canvas = document.getElementById('visualizer-canvas');
        this.miniEl = document.getElementById('player-mini-viz');

        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        this.applyCrt(this.crtEnabled);
        this.startMiniViz();
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = (rect.width || 600) * dpr;
        this.canvas.height = (rect.height || 220) * dpr;
    }

    tryInitWebAudio() {
        if (this.analyser) return true;
        try {
            const eqAnalyser = equalizer.getAnalyser();
            const eqCtx = equalizer.getAudioContext();
            if (eqAnalyser && eqCtx) {
                this.audioCtx = eqCtx;
                this.analyser = eqAnalyser;
                this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
                this.freqArray = new Uint8Array(this.analyser.frequencyBinCount);
                return true;
            }
        } catch (e) {
            console.debug('Equalizer analyser binding notice:', e);
        }

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return false;
            this.audioCtx = new AudioContextClass();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.freqArray = new Uint8Array(this.analyser.frequencyBinCount);

            // Connect if allowed without muting
            if (this.audio && !this.source) {
                try {
                    this.source = this.audioCtx.createMediaElementSource(this.audio);
                    this.source.connect(this.analyser);
                    this.analyser.connect(this.audioCtx.destination);
                } catch (e) {
                    console.debug('MediaElementSource not allowed or tainted, using synthesis fallback', e);
                }
            }
            return true;
        } catch (e) {
            console.debug('AudioContext not available', e);
            return false;
        }
    }

    togglePanel() {
        const overlay = document.getElementById('visualizer-drawer');
        if (!overlay) return;
        const isHidden = overlay.classList.toggle('hidden');
        if (!isHidden) {
            this.start();
            this.resize();
        } else {
            this.stop();
        }
        const btn = document.getElementById('viz-toggle-btn');
        if (btn) btn.classList.toggle('active', !isHidden);
    }

    cycleMode() {
        const idx = this.modes.indexOf(this.mode);
        this.mode = this.modes[(idx + 1) % this.modes.length];
        const label = document.getElementById('viz-mode-label');
        if (label) label.textContent = this.mode.toUpperCase();
    }

    toggleCrt() {
        this.crtEnabled = !this.crtEnabled;
        localStorage.setItem('pulseterm_crt', String(this.crtEnabled));
        this.applyCrt(this.crtEnabled);
        return this.crtEnabled;
    }

    applyCrt(enable) {
        document.body.classList.toggle('crt-active', enable);
        const btn = document.getElementById('crt-toggle-btn');
        if (btn) btn.textContent = enable ? '[CRT: ON]' : '[CRT: OFF]';
    }

    start() {
        if (this.active) return;
        this.active = true;
        this.tryInitWebAudio();
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
        const loop = () => {
            if (!this.active) return;
            this.draw();
            this.animId = requestAnimationFrame(loop);
        };
        this.animId = requestAnimationFrame(loop);
    }

    stop() {
        this.active = false;
        if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
    }

    getFrequencies(numBands = 32) {
        const bands = new Array(numBands).fill(0);
        const isPlaying = this.audio && !this.audio.paused && this.audio.currentTime > 0;
        
        let hasRealData = false;
        if (this.analyser && isPlaying) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i];
            if (sum > 10) {
                hasRealData = true;
                const step = Math.floor(this.dataArray.length / numBands);
                for (let b = 0; b < numBands; b++) {
                    let avg = 0;
                    for (let s = 0; s < step; s++) avg += this.dataArray[b * step + s] || 0;
                    bands[b] = (avg / step) / 255;
                }
            }
        }

        // High fidelity procedural spectrum synthesizer when audio is playing but CORS prevents direct raw FFT
        if (!hasRealData && isPlaying) {
            this.simPhase += 0.08 * (this.audio.playbackRate || 1);
            const t = this.simPhase;
            const vol = this.audio.volume || 0.8;
            for (let b = 0; b < numBands; b++) {
                const oct = b / numBands;
                const bass = Math.sin(t * 2.2 + b * 0.3) * 0.4 + Math.cos(t * 1.1) * 0.3;
                const mid = Math.sin(t * 4.5 + b * 0.7) * 0.35 + Math.sin(t * 2.9 + b) * 0.25;
                const treble = Math.sin(t * 7.1 + b * 1.5) * 0.3 * (1 - oct * 0.5);
                
                let val = (bass * (1 - oct) + mid * 0.7 + treble * oct) * vol;
                val = Math.max(0.04, Math.min(0.98, Math.abs(val) + (Math.sin(t * 12 + b * 2) > 0.85 ? 0.2 : 0)));
                bands[b] = val;
            }
        }

        // Peak drop calculations
        for (let b = 0; b < numBands; b++) {
            const cur = bands[b];
            if (cur >= this.peaks[b]) {
                this.peaks[b] = cur;
                this.peakHold[b] = 12; // frames to hold
            } else {
                if (this.peakHold[b] > 0) {
                    this.peakHold[b]--;
                } else {
                    this.peaks[b] = Math.max(0, this.peaks[b] - 0.025);
                }
            }
        }

        return bands;
    }

    draw() {
        if (!this.canvas || !this.ctx) return;
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        const style = getComputedStyle(document.body);
        const primaryColor = style.getPropertyValue('--seal').trim() || '#00ff66';
        const lineColor = style.getPropertyValue('--line').trim() || '#222';
        const inkColor = style.getPropertyValue('--ink').trim() || '#fff';

        if (this.mode === 'cava') {
            this.drawCava(ctx, w, h, primaryColor, lineColor);
        } else if (this.mode === 'wave') {
            this.drawWave(ctx, w, h, primaryColor, lineColor);
        } else if (this.mode === 'vu') {
            this.drawVU(ctx, w, h, primaryColor, lineColor, inkColor);
        } else if (this.mode === 'ascii') {
            this.drawAscii(ctx, w, h, primaryColor, inkColor);
        }
    }

    drawCava(ctx, w, h, primaryColor, lineColor) {
        const numBars = 32;
        const bands = this.getFrequencies(numBars);
        const gap = 4 * (window.devicePixelRatio || 1);
        const barWidth = (w - (numBars - 1) * gap) / numBars;
        const numBlocks = 18;
        const blockGap = 2 * (window.devicePixelRatio || 1);
        const blockHeight = (h - 24 - (numBlocks - 1) * blockGap) / numBlocks;

        for (let i = 0; i < numBars; i++) {
            const x = i * (barWidth + gap);
            const val = bands[i];
            const activeBlocks = Math.floor(val * numBlocks);
            const peakBlock = Math.min(numBlocks - 1, Math.floor(this.peaks[i] * numBlocks));

            for (let b = 0; b < numBlocks; b++) {
                const y = h - 16 - (b + 1) * (blockHeight + blockGap);
                if (b <= activeBlocks) {
                    ctx.fillStyle = primaryColor;
                    ctx.globalAlpha = 0.85 + (b / numBlocks) * 0.15;
                    ctx.fillRect(x, y, barWidth, blockHeight);
                } else {
                    ctx.fillStyle = lineColor;
                    ctx.globalAlpha = 0.2;
                    ctx.fillRect(x, y, barWidth, blockHeight);
                }
            }

            // Peak indicator line
            if (peakBlock > 0) {
                const peakY = h - 16 - (peakBlock + 1) * (blockHeight + blockGap);
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.95;
                ctx.fillRect(x, peakY, barWidth, 2 * (window.devicePixelRatio || 1));
            }
        }
        ctx.globalAlpha = 1.0;
    }

    drawWave(ctx, w, h, primaryColor, lineColor) {
        const bands = this.getFrequencies(64);
        const isPlaying = this.audio && !this.audio.paused;

        // Draw grid
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = 0; y <= h; y += 30) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();

        // Center line
        const midY = h / 2;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        
        const pts = 64;
        const dx = w / pts;
        ctx.moveTo(0, midY);

        for (let i = 0; i <= pts; i++) {
            const x = i * dx;
            const amp = isPlaying ? (bands[i % bands.length] - 0.5) * (h * 0.65) : 0;
            const y = midY + amp * Math.sin(i * 0.4 + this.simPhase * 2);
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    drawVU(ctx, w, h, primaryColor, lineColor, inkColor) {
        const bands = this.getFrequencies(32);
        const leftVal = (bands[2] + bands[6] + bands[10]) / 3 || 0;
        const rightVal = (bands[4] + bands[8] + bands[12]) / 3 || 0;

        const leftPeak = Math.max(...bands.slice(0, 16));
        const rightPeak = Math.max(...bands.slice(16, 32));

        const barH = 26 * (window.devicePixelRatio || 1);
        const top1 = h * 0.32;
        const top2 = h * 0.62;
        const labelW = 48 * (window.devicePixelRatio || 1);
        const meterW = w - labelW - 30;

        ctx.font = `${11 * (window.devicePixelRatio || 1)}px ui-monospace, "SF Mono", Monaco, Menlo, monospace`;
        ctx.fillStyle = inkColor;

        // Channel L
        ctx.fillText('CH 1 [L]', 10, top1 + barH * 0.7);
        this._renderVUMeterBar(ctx, labelW, top1, meterW, barH, leftVal, leftPeak, primaryColor, lineColor);

        // Channel R
        ctx.fillText('CH 2 [R]', 10, top2 + barH * 0.7);
        this._renderVUMeterBar(ctx, labelW, top2, meterW, barH, rightVal, rightPeak, primaryColor, lineColor);
    }

    _renderVUMeterBar(ctx, x, y, width, height, val, peak, primaryColor, lineColor) {
        const segments = 30;
        const segW = (width - (segments - 1) * 3) / segments;

        for (let s = 0; s < segments; s++) {
            const segX = x + s * (segW + 3);
            const ratio = s / segments;
            if (ratio <= val) {
                if (ratio > 0.85) ctx.fillStyle = '#ef4444'; // Red clip
                else if (ratio > 0.70) ctx.fillStyle = '#f59e0b'; // Amber warning
                else ctx.fillStyle = primaryColor;
                ctx.globalAlpha = 0.9;
            } else {
                ctx.fillStyle = lineColor;
                ctx.globalAlpha = 0.25;
            }
            ctx.fillRect(segX, y, segW, height);
        }
        ctx.globalAlpha = 1.0;
    }

    drawAscii(ctx, w, h, primaryColor, inkColor) {
        const bands = this.getFrequencies(28);
        const chars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        const lineStr = bands.map(b => chars[Math.min(chars.length - 1, Math.floor(b * chars.length))]).join(' ');

        ctx.font = `${18 * (window.devicePixelRatio || 1)}px ui-monospace, "SF Mono", Monaco, Menlo, monospace`;
        ctx.fillStyle = primaryColor;
        ctx.textAlign = 'center';
        ctx.fillText(lineStr, w / 2, h / 2);

        ctx.font = `${11 * (window.devicePixelRatio || 1)}px ui-monospace, "SF Mono", Monaco, Menlo, monospace`;
        ctx.fillStyle = inkColor;
        ctx.globalAlpha = 0.6;
        ctx.fillText('[ ASCII SPECTRUM // 32-CH BANDS ]', w / 2, h / 2 + 34);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1.0;
    }

    startMiniViz() {
        const chars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        if (this.miniTimer) clearInterval(this.miniTimer);

        this.miniTimer = setInterval(() => {
            if (!this.miniEl) {
                this.miniEl = document.getElementById('player-mini-viz');
                if (!this.miniEl) return;
            }

            const isPlaying = this.audio && !this.audio.paused && this.audio.currentTime > 0;
            if (!isPlaying) {
                this.miniEl.textContent = '[ ░░░░░░░░ ]';
                return;
            }

            const bands = this.getFrequencies(8);
            const str = bands.map(b => chars[Math.min(chars.length - 1, Math.floor(b * chars.length))]).join('');
            this.miniEl.textContent = `[ ${str} ]`;
        }, 80);
    }
}

export const visualizer = new TerminalVisualizer();
