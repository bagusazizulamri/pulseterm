import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    EQ_FREQUENCIES,
    EQ_PRESETS,
    SPECTRAL_ARCHETYPES,
    analyzeAndCompensate,
    classifySpectralProfile,
    mapGenresToPreset,
    mapProfileToPreset,
    detectPresetLocal
} from '../../frontend/js/eq-core.js';
import { spatial } from '../../frontend/js/spatial.js';
import { OfflineAudioContext } from 'node-web-audio-api';

describe('T9: Normal Mode Flat Verification (No Excessive Bass)', () => {
    test('Normal mode (Spatial OFF, EQ Flat) yields 0.00 dB response across frequencies', async () => {
        const sampleRate = 48000;
        const duration = 0.4;
        const freqs = [32, 64, 100, 125, 150, 200, 500, 1000, 4000, 16000];

        for (const freq of freqs) {
            const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
            
            // Build flat EQ filters
            const preampNode = ctx.createGain();
            preampNode.gain.value = 1.0;
            let prev = preampNode;
            EQ_FREQUENCIES.forEach((f, idx) => {
                const filter = ctx.createBiquadFilter();
                filter.frequency.value = f;
                if (idx === 0) filter.type = 'lowshelf';
                else if (idx === 9) filter.type = 'highshelf';
                else {
                    filter.type = 'peaking';
                    filter.Q.value = 1.414;
                }
                filter.gain.value = 0;
                prev.connect(filter);
                prev = filter;
            });

            // Spatial in OFF mode
            const spatialEngine = Object.assign(Object.create(Object.getPrototypeOf(spatial)), spatial);
            spatialEngine.audioCtx = null;
            spatialEngine.inputNode = null;
            spatialEngine.mode = 'off';
            spatialEngine._reverbCache = new Map();
            spatialEngine.init(ctx);
            spatialEngine.applyMode('off', true);

            prev.connect(spatialEngine.inputNode);
            spatialEngine.outputNode.connect(ctx.destination);

            const osc = ctx.createOscillator();
            osc.frequency.value = freq;
            const oscGain = ctx.createGain();
            oscGain.gain.value = 0.5;
            osc.connect(oscGain);
            oscGain.connect(preampNode);
            osc.start();

            const rendered = await ctx.startRendering();
            const l = rendered.getChannelData(0);
            let sum = 0, count = 0;
            const start = Math.floor(sampleRate * 0.15);
            for (let i = start; i < l.length; i++) {
                sum += l[i] * l[i];
                count++;
            }
            const rms = Math.sqrt(sum / count);
            const inRms = 0.5 / Math.SQRT2;
            const gainDb = 20 * Math.log10(rms / inRms);

            // Confirm true flat response without previous +6.7 dB hump (within 0.2 dB window leakage tolerance)
            assert(Math.abs(gainDb) < 0.2, `Freq ${freq}Hz deviated from 0 dB: got ${gainDb.toFixed(3)} dB`);
        }
    });
});

describe('T9: Presets Definition Quality', () => {
    test('Pop Upbeat has punchy bass, scoop at 250Hz, crisp air', () => {
        const p = EQ_PRESETS.pop_upbeat;
        assert.ok(p, 'pop_upbeat preset must exist');
        assert.ok(p.gains[1] >= 2.5, '64Hz punch must be >= +2.5 dB');
        assert.ok(p.gains[3] <= 0.0, '250Hz mud must be carved <= 0.0 dB');
        assert.ok(p.gains[9] >= 3.0, '16kHz air must be >= +3.0 dB');
    });

    test('Sad Ballad has intimate vocal presence and warm acoustic body', () => {
        const p = EQ_PRESETS.sad_ballad;
        assert.ok(p, 'sad_ballad preset must exist');
        assert.ok(p.gains[6] >= 2.5, '2kHz vocal presence must be >= +2.5 dB');
        assert.ok(p.gains[4] >= 1.0, '500Hz acoustic warmth must be >= +1.0 dB');
        assert.ok(p.gains[9] <= 1.5, '16kHz air must remain soft & non-fatiguing');
    });

    test('Metal has punchy kick and tamed harsh cymbals', () => {
        const p = EQ_PRESETS.metal;
        assert.ok(p, 'metal preset must exist');
        assert.ok(p.gains[1] >= 3.0, '64Hz kick punch must be >= +3.0 dB');
        assert.ok(p.gains[8] <= 2.0, '8kHz harshness must be tamed <= +2.0 dB');
    });

    test('Standard Pop preset is clean without +4dB mud bump', () => {
        const p = EQ_PRESETS.pop;
        assert.ok(p.gains[3] < 3.0, '250Hz must not have bloated +4dB bump');
        assert.ok(p.gains[4] < 3.0, '500Hz must not have bloated +4dB bump');
    });
});

describe('T9: Dynamic Spectral Deficiency Compensation', () => {
    test('Compensates muffled pop track by dynamically boosting air frequencies', () => {
        // Track where 8k and 16k are heavily rolled off (-8 dB below target tilt)
        const muffledTrack = EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.2) - (i >= 8 ? 8 : 0));
        const res = analyzeAndCompensate(muffledTrack, 'pop_upbeat');
        assert.ok(res.offsets[8] > 1.0, 'Should boost 8kHz air');
        assert.ok(res.offsets[9] > 1.5, 'Should boost 16kHz shimmer');
        assert.ok(res.hint.includes('+AIR'), `Hint should indicate +AIR, got ${res.hint}`);
    });

    test('Compensates thin metal mix and tames piercing cymbals', () => {
        // Track lacking 64Hz kick (-6 dB) and harsh in 8k/16k (+6 dB)
        const harshMetal = EQ_FREQUENCIES.map((_, i) => -20 + (i - 5) * (-4.5) + (i === 1 ? -6 : 0) + (i >= 8 ? 6 : 0));
        const res = analyzeAndCompensate(harshMetal, 'metal');
        assert.ok(res.offsets[1] > 1.0, 'Should reinforce 64Hz kick drum attack');
        assert.ok(res.offsets[8] < 0, 'Should tame 8kHz harsh cymbal hiss');
        assert.ok(res.hint.includes('+PUNCH') || res.hint.includes('TAME HARSH'), `Hint should indicate punch or tame harsh: ${res.hint}`);
    });
});

describe('T9: J-Music and K-Music Mapping & Profiling', () => {
    test('Maps J-Pop Upbeat (YOASOBI - Idol) to pop_upbeat', () => {
        const preset = mapProfileToPreset(['j-pop'], ['energetic'], { title: 'Idol', artist: 'YOASOBI' });
        assert.equal(preset, 'pop_upbeat');
    });

    test('Maps K-Pop Upbeat (NewJeans - Super Shy) to pop_upbeat', () => {
        const preset = mapProfileToPreset(['k-pop'], ['energetic'], { title: 'Super Shy', artist: 'NewJeans' });
        assert.equal(preset, 'pop_upbeat');
    });

    test('Maps Sad/Mellow (Bernadya - Satu Bulan) to sad_ballad', () => {
        const preset = mapProfileToPreset(['pop'], ['mellow'], { title: 'Satu Bulan', artist: 'Bernadya' });
        assert.equal(preset, 'sad_ballad');
    });

    test('Maps Emotional Ballad (Adele - Someone Like You) to sad_ballad', () => {
        const preset = mapProfileToPreset([], ['mellow'], { title: 'Someone Like You', artist: 'Adele' });
        assert.equal(preset, 'sad_ballad');
    });

    test('Maps J-Metal (BABYMETAL) to metal', () => {
        const preset = mapProfileToPreset(['j-pop', 'metal'], [], { title: 'Gimme Chocolate', artist: 'BABYMETAL' });
        assert.equal(preset, 'metal');
    });

    test('Maps City Pop (Miki Matsubara - Stay With Me) to rnb', () => {
        const preset = mapProfileToPreset(['j-pop'], ['groovy'], { title: 'Stay With Me', artist: 'Miki Matsubara' });
        assert.equal(preset, 'rnb');
    });

    test('Maintains backward compatibility for mapGenresToPreset', () => {
        assert.equal(mapGenresToPreset(['k-pop', 'pop']), 'pop');
        assert.equal(mapGenresToPreset(['metal', 'rock']), 'metal');
    });
});

describe('T9: Spectral Reclassification from Real Audio', () => {
    test('Reclassifies K-Pop Pure Pop (glossy, punchy) from flat to pop_upbeat', () => {
        const kpopPure = [18, 22, 14, 8, 4, 0, -3, -6, -9, -12];
        assert.equal(classifySpectralProfile(kpopPure, 'flat'), 'pop_upbeat');
    });

    test('Reclassifies K-Pop Semi Hip-Hop (808 sub-bass) from flat to hiphop', () => {
        const kpopHipHop = [28, 22, 12, 6, 3, 0, -3, -7, -9, -13];
        assert.equal(classifySpectralProfile(kpopHipHop, 'flat'), 'hiphop');
    });

    test('Reclassifies Metal (distorted guitar wall) from flat to metal', () => {
        const metalSpectrum = [19, 23, 13, 7, 4, 0, -1, -5, -8, -13];
        assert.equal(classifySpectralProfile(metalSpectrum, 'flat'), 'metal');
    });

    test('Reclassifies Sad Ballad (warm vocal, subdued bass/highs) from flat to sad_ballad', () => {
        const sadSpectrum = [14, 15, 12, 11, 6, 0, -4, -10, -15, -21];
        assert.equal(classifySpectralProfile(sadSpectrum, 'flat'), 'sad_ballad');
    });

    test('Reclassifies EDM (extreme sub + extreme highs) from flat to electronic', () => {
        const edmSpectrum = [30, 28, 14, 3, -2, 0, -3, -5, -6, -8];
        assert.equal(classifySpectralProfile(edmSpectrum, 'flat'), 'electronic');
    });

    test('Reclassifies Rock (guitar crunch, moderate bass) from flat to rock', () => {
        const rockSpectrum = [17, 20, 14, 9, 5, 0, -1, -4, -7, -11];
        assert.equal(classifySpectralProfile(rockSpectrum, 'flat'), 'rock');
    });

    test('Preserves high-confidence metadata hint (never overrides strong metal→something else)', () => {
        const kpopPure = [18, 22, 14, 8, 4, 0, -3, -6, -9, -12];
        assert.equal(classifySpectralProfile(kpopPure, 'metal'), 'metal');
        assert.equal(classifySpectralProfile(kpopPure, 'hiphop'), 'hiphop');
        assert.equal(classifySpectralProfile(kpopPure, 'sad_ballad'), 'sad_ballad');
    });
});

describe('T9: K-Pop Subgenre Differentiation', () => {
    test('TWICE, IVE, aespa, LE SSERAFIM, ILLIT map to pop_upbeat', () => {
        const groups = [
            { title: 'Fancy', artist: 'TWICE' },
            { title: 'I AM', artist: 'IVE' },
            { title: 'Supernova', artist: 'aespa' },
            { title: 'Perfect Night', artist: 'LE SSERAFIM' },
            { title: 'Magnetic', artist: 'ILLIT' },
        ];
        for (const s of groups) {
            const p = mapProfileToPreset([], [], s);
            assert.equal(p, 'pop_upbeat', `${s.artist} - ${s.title} should be pop_upbeat, got ${p}`);
        }
    });

    test('Stray Kids, NCT 127, BIGBANG, ATEEZ map to hiphop', () => {
        const groups = [
            { title: "God's Menu", artist: 'Stray Kids' },
            { title: 'Kick It', artist: 'NCT 127' },
            { title: 'BANG BANG BANG', artist: 'BIGBANG' },
            { title: 'Guerrilla', artist: 'ATEEZ' },
        ];
        for (const s of groups) {
            const p = mapProfileToPreset([], [], s);
            assert.equal(p, 'hiphop', `${s.artist} - ${s.title} should be hiphop, got ${p}`);
        }
    });
});

describe('T9: Expanded Metal Band Coverage', () => {
    test('Architects, Polyphia, Periphery, Avenged Sevenfold map to metal', () => {
        const bands = [
            { title: 'Animals', artist: 'Architects' },
            { title: 'Playing God', artist: 'Polyphia' },
            { title: 'Marigold', artist: 'Periphery' },
            { title: 'Hail to the King', artist: 'Avenged Sevenfold' },
            { title: 'Psychosocial', artist: 'Slipknot' },
        ];
        for (const s of bands) {
            const p = mapProfileToPreset([], [], s);
            assert.equal(p, 'metal', `${s.artist} - ${s.title} should be metal, got ${p}`);
        }
    });
});
