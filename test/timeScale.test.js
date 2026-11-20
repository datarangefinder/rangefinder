import assert from 'node:assert/strict';
import test from 'node:test';
import { YEAR_MAX, YEAR_MIN, getEra, yearToLabel, yearToZ, zToYear } from '../src/core/TimeScale.js';

test('maps equal calendar intervals to equal timeline distances', () => {
  const midpoint = (YEAR_MIN + YEAR_MAX) / 2;

  assert.equal(yearToZ(YEAR_MIN), 0);
  assert.equal(yearToZ(midpoint), 600);
  assert.equal(yearToZ(YEAR_MAX), 1200);
  assert.equal(zToYear(600), midpoint);
});

test('includes the Big Bang before Earth formation', () => {
  assert.equal(getEra(-13_800_000_000).name, '宇宙誕生');
  assert.ok(yearToZ(-4_600_000_000) > 0);
});

test('labels the Big Bang as 138 hundred-million years ago', () => {
  assert.equal(yearToLabel(-13_800_000_000), '138億年前');
});

test('keeps sub-year navigation within the same era through the end of its last year', () => {
  assert.equal(getEra(2024.5).name, '現代');
  assert.equal(getEra(2025).name, '未来');
});
