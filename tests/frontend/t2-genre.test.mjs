import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapGenresToPreset, detectPresetLocal } from '../../frontend/js/eq-core.js';

describe('T2: mapGenresToPreset', () => {
    test('priority and mapping checks', () => {
        assert.equal(mapGenresToPreset(['k-pop', 'pop']), 'pop');
        assert.equal(mapGenresToPreset(['metal', 'rock']), 'metal');
        assert.equal(mapGenresToPreset(['dangdut']), 'bass_boost');
        assert.equal(mapGenresToPreset([]), 'flat');
        assert.equal(mapGenresToPreset(['lofi']), 'flat');
        assert.equal(mapGenresToPreset(['pop', 'edm']), 'electronic');
    });
});

describe('T2: detectPresetLocal word-boundary safety', () => {
    test('prevents false-positive substring matches', () => {
        // "Lost - Coldplay" should NOT match "ost" in classical
        assert.notEqual(detectPresetLocal({ title: "Lost", artist: "Coldplay" }), 'classical');

        // "Therapy Session" should NOT match "rap" in hiphop
        assert.notEqual(detectPresetLocal({ title: "Therapy Session", artist: "NF" }), 'hiphop');

        // "Popular Song" should NOT match "pop"
        assert.notEqual(detectPresetLocal({ title: "Popular Song", artist: "Mika" }), 'pop');

        // "Rocket Man" should NOT match "rock"
        assert.notEqual(detectPresetLocal({ title: "Rocket Man", artist: "Elton John" }), 'rock');
    });

    test('correctly identifies authentic keywords and artists', () => {
        assert.equal(detectPresetLocal({ title: "One", artist: "Metallica" }), 'metal');
        assert.equal(detectPresetLocal({ title: "Lose Yourself", artist: "Eminem" }), 'hiphop');
    });

    test('fallback behavior for unknown or null song', () => {
        assert.equal(detectPresetLocal({ title: "Song XYZ", artist: "Unknown Artist" }), 'flat');
        assert.equal(detectPresetLocal(null), 'perfect');
    });
});
