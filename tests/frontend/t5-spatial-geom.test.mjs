import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePannerCoordinates } from '../../frontend/js/eq-core.js';

test('T5: calculatePannerCoordinates maintains constant sphere radius and correct forward/lateral axes', () => {
    const R = 1.5;

    // Center (0 deg)
    const center = calculatePannerCoordinates(0, R);
    assert.equal(center.x, 0);
    assert.equal(center.y, 0);
    assert.equal(center.z, -1.5);
    const rCenter = Math.hypot(center.x, center.y, center.z);
    assert(Math.abs(rCenter - R) < 1e-4, 'Radius must be constant 1.5m');

    // Studio (+-30 deg)
    const leftStudio = calculatePannerCoordinates(-30, R);
    const rightStudio = calculatePannerCoordinates(30, R);
    assert(leftStudio.x < 0, 'Left speaker must have negative X');
    assert(rightStudio.x > 0, 'Right speaker must have positive X');
    assert.equal(leftStudio.x, -rightStudio.x);
    assert.equal(leftStudio.z, rightStudio.z);
    assert(leftStudio.z < 0, 'Speakers must be in front (-Z)');
    assert(Math.abs(Math.hypot(leftStudio.x, leftStudio.y, leftStudio.z) - R) < 1e-4);
    assert(Math.abs(Math.hypot(rightStudio.x, rightStudio.y, rightStudio.z) - R) < 1e-4);

    // Wide (+-45 deg)
    const leftWide = calculatePannerCoordinates(-45, R);
    const rightWide = calculatePannerCoordinates(45, R);
    assert(Math.abs(Math.abs(leftWide.x) - Math.abs(leftWide.z)) < 1e-3, 'At 45 deg, |x| must equal |z|');
    assert(Math.abs(Math.hypot(leftWide.x, leftWide.y, leftWide.z) - R) < 1e-4);

    // Concert (+-40 deg)
    const leftConcert = calculatePannerCoordinates(-40, R);
    assert(Math.abs(Math.hypot(leftConcert.x, leftConcert.y, leftConcert.z) - R) < 1e-4);
});
