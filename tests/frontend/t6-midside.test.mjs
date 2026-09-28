import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMidSideMatrix, getMidSideGains } from '../../frontend/js/eq-core.js';

test('T6: Mid/Side matrix maintains mono invariance and widens stereo', () => {
    // 1. Mono input invariant across any width
    for (const w of [0, 0.5, 1.0, 1.25, 1.5, 2.0]) {
        const { lPrime, rPrime, S } = computeMidSideMatrix(1.0, 1.0, w);
        assert.equal(S, 0, 'Side must be 0 for mono input');
        assert.equal(lPrime, 1.0, `lPrime must be 1.0 at w=${w}`);
        assert.equal(rPrime, 1.0, `rPrime must be 1.0 at w=${w}`);

        const { a, b } = getMidSideGains(w);
        const lP = a * 1.0 + b * 1.0;
        const rP = b * 1.0 + a * 1.0;
        assert.equal(lP, 1.0);
        assert.equal(rP, 1.0);
    }

    // 2. Pure stereo (L=1, R=0) with w=1.0 is identity
    {
        const { lPrime, rPrime } = computeMidSideMatrix(1.0, 0.0, 1.0);
        assert.equal(lPrime, 1.0);
        assert.equal(rPrime, 0.0);

        const { a, b } = getMidSideGains(1.0);
        assert.equal(a, 1.0);
        assert.equal(b, 0.0);
    }

    // 3. Pure side signal (L=1, R=-1) with w=1.25 is boosted by exactly 25%
    {
        const { lPrime, rPrime, M } = computeMidSideMatrix(1.0, -1.0, 1.25);
        assert.equal(M, 0, 'Mid must be 0 for out-of-phase side signal');
        assert.equal(lPrime, 1.25, 'Left side should be scaled to 1.25');
        assert.equal(rPrime, -1.25, 'Right side should be scaled to -1.25');

        const { a, b } = getMidSideGains(1.25);
        const lP = a * 1.0 + b * (-1.0);
        const rP = b * 1.0 + a * (-1.0);
        assert.equal(lP, 1.25);
        assert.equal(rP, -1.25);
    }
});
