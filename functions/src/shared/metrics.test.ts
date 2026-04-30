// Pure-function tests for metrics.ts
// Runnable with: npx tsx functions/src/shared/metrics.test.ts
// (Requires tsx; no test framework configured in functions/.)

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
    buildProvestBlock,
    ivrVerdict,
    probTouch,
    touchAlertLevel,
    touchAlertPrefix,
} from './metrics';

test('probTouch — symmetric 16Δ returns 32', () => {
    assert.equal(probTouch(-0.16, 0.16), 32);
});

test('probTouch — clamps at 100 for 50Δ', () => {
    assert.equal(probTouch(-0.50, 0.50), 100);
});

test('probTouch — clamps at 100 for extreme delta', () => {
    assert.equal(probTouch(-0.60, 0.10), 100);
});

test('probTouch — uses max side not average', () => {
    // 10Δ put, 30Δ call → should use 30Δ → 60
    assert.equal(probTouch(-0.10, 0.30), 60);
});

test('touchAlertLevel — normal below 30', () => {
    assert.equal(touchAlertLevel(-0.25, 0.29), 'normal');
});

test('touchAlertLevel — yellow at 30-40', () => {
    assert.equal(touchAlertLevel(-0.31, 0.20), 'yellow');
    assert.equal(touchAlertLevel(-0.20, 0.39), 'yellow');
});

test('touchAlertLevel — orange at 40-50', () => {
    assert.equal(touchAlertLevel(-0.45, 0.10), 'orange');
    assert.equal(touchAlertLevel(0.10, 0.49), 'orange');
});

test('touchAlertLevel — red at 50+', () => {
    assert.equal(touchAlertLevel(-0.55, 0.10), 'red');
    assert.equal(touchAlertLevel(-0.99, 0.05), 'red');
});

test('touchAlertLevel — exact boundaries', () => {
    assert.equal(touchAlertLevel(-0.30, 0), 'yellow');
    assert.equal(touchAlertLevel(-0.40, 0), 'orange');
    assert.equal(touchAlertLevel(-0.50, 0), 'red');
});

test('touchAlertPrefix returns correct emoji label', () => {
    assert.equal(touchAlertPrefix('normal'), '');
    assert.equal(touchAlertPrefix('yellow'), '[🟡 WATCH]');
    assert.equal(touchAlertPrefix('orange'), '[🟠 WARN]');
    assert.equal(touchAlertPrefix('red'), '[🔴 ADJUST]');
});

test('ivrVerdict buckets', () => {
    assert.equal(ivrVerdict(0), 'low');
    assert.equal(ivrVerdict(29), 'low');
    assert.equal(ivrVerdict(30), 'preferred');
    assert.equal(ivrVerdict(49), 'preferred');
    assert.equal(ivrVerdict(50), 'ideal');
    assert.equal(ivrVerdict(99), 'ideal');
});

test('buildProvestBlock — 7 lines in fixed order', () => {
    const block = buildProvestBlock({
        pop: 86.0,
        probTouch: 32,
        compositeScore: 0.72,
        profileName: 'Neutral',
        wings: 10,
        minDelta: 11,
        maxDelta: 24,
        shortPutDelta: -0.16,
        shortCallDelta: 0.16,
        vix: 22.0,
        ticker: 'SPX',
        ivRank: 58,
        dte: 28,
        dteManagement: 14,
        putIv: 0.185,
        callIv: 0.162,
    });
    const lines = block.split('\n');
    assert.equal(lines.length, 7);
    assert.match(lines[0], /^P —/);
    assert.match(lines[1], /^R —/);
    assert.match(lines[2], /^O —/);
    assert.match(lines[3], /^V —/);
    assert.match(lines[4], /^E —/);
    assert.match(lines[5], /^S —/);
    assert.match(lines[6], /^T —/);
});

test('buildProvestBlock — symmetric notation when deltas equal', () => {
    const block = buildProvestBlock({
        pop: 85, probTouch: 32, compositeScore: 0.5,
        profileName: 'Neutral', wings: 10, minDelta: 11, maxDelta: 24,
        shortPutDelta: -0.16, shortCallDelta: 0.16,
        vix: 20, ticker: 'SPX', ivRank: 45, dte: 30, dteManagement: 14,
    });
    assert.match(block, /symmetric/);
});

test('buildProvestBlock — asymmetric tilt reports signed diff', () => {
    const block = buildProvestBlock({
        pop: 85, probTouch: 32, compositeScore: 0.5,
        profileName: 'Neutral', wings: 10, minDelta: 11, maxDelta: 24,
        shortPutDelta: -0.24, shortCallDelta: 0.16, // put is richer
        vix: 20, ticker: 'SPX', ivRank: 45, dte: 30, dteManagement: 14,
    });
    assert.match(block, /asymmetric \(tilt \+8\)/);
});

test('buildProvestBlock — skew unavailable when IVs missing', () => {
    const block = buildProvestBlock({
        pop: 85, probTouch: 32, compositeScore: 0.5,
        profileName: 'Neutral', wings: 10, minDelta: 11, maxDelta: 24,
        shortPutDelta: -0.16, shortCallDelta: 0.16,
        vix: 20, ticker: 'SPX', ivRank: 45, dte: 30, dteManagement: 14,
    });
    assert.match(block, /S — skew unavailable/);
});

test('buildProvestBlock — put skew reports vol pts', () => {
    const block = buildProvestBlock({
        pop: 85, probTouch: 32, compositeScore: 0.5,
        profileName: 'Neutral', wings: 10, minDelta: 11, maxDelta: 24,
        shortPutDelta: -0.16, shortCallDelta: 0.16,
        vix: 20, ticker: 'SPX', ivRank: 45, dte: 30, dteManagement: 14,
        putIv: 0.20, callIv: 0.17,
    });
    assert.match(block, /put skew \+3 vol pts vs call/);
});
