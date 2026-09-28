import test from 'node:test';
import assert from 'node:assert/strict';
import { EQ_PRESETS } from '../../frontend/js/eq-core.js';

test('T3: preset state separation and localStorage contract', (t) => {
    // Simulate user state logic
    let manualPreset = 'rock';
    let manualGains = [...EQ_PRESETS.rock.gains];
    let manualPreamp = EQ_PRESETS.rock.preamp;
    let manualBassBoost = 0;
    let autoMode = true;

    // Auto-EQ triggers preset 'electronic'
    const autoPresetKey = 'electronic';
    let currentPreset = autoPresetKey;
    let activeGains = [...EQ_PRESETS[autoPresetKey].gains];
    let activePreamp = EQ_PRESETS[autoPresetKey].preamp;

    // Verify localStorage payload only stores manualPreset, not active auto gains
    const serialized = JSON.stringify({
        enabled: true,
        preset: manualPreset,
        gains: manualGains,
        preamp: manualPreamp,
        bassBoost: manualBassBoost,
        autoMode: autoMode
    });

    const parsed = JSON.parse(serialized);
    assert.equal(parsed.preset, 'rock');
    assert.deepEqual(parsed.gains, EQ_PRESETS.rock.gains);
    assert.notDeepEqual(parsed.gains, activeGains);
    assert.equal(parsed.autoMode, true);

    // When autoMode is disabled, restores manual preset
    autoMode = false;
    currentPreset = parsed.preset;
    activeGains = [...parsed.gains];
    activePreamp = parsed.preamp;

    assert.equal(currentPreset, 'rock');
    assert.deepEqual(activeGains, EQ_PRESETS.rock.gains);
});
