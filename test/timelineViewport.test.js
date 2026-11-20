import assert from 'node:assert/strict';
import test from 'node:test';
import * as viewport from '../src/core/TimelineViewport.js';
import { buildHologramTimelineModel } from '../src/view3d/holoTimelineLayout.js';

test('limits maximum magnification to a 48-hour window even across New Year', () => {
  const window = viewport.getTimelineWindow(2025, 0);
  assert.equal(window.endTime - window.startTime, 48 * 60 * 60 * 1000);
  assert.equal(viewport.formatTimelineSpan(window.spanYears), '2日（48時間）');
  assert.equal(viewport.clampTimelineSpan(Infinity), 13_800_003_000);
});

test('maps a six-hour separation to one eighth of the two-day screen', () => {
  const window = viewport.getTimelineWindow(2025, 0);
  const a = viewport.timelineYearAtPosition(0.25, window);
  const b = viewport.timelineYearAtPosition(0.375, window);
  assert.ok(Math.abs(viewport.timelineYearPosition(b, window) - viewport.timelineYearPosition(a, window) - 0.125) < 1e-6);
});

test('generates readable hour ticks for a two-day window', () => {
  const window = viewport.getTimelineWindow(2025, 0);
  const ticks = viewport.getTimelineTicks(window, 1100);
  assert.ok(ticks.length >= 5 && ticks.length <= 12);
  assert.ok(ticks.some(tick => tick.label.includes('00:00')));
  assert.ok(ticks.every(tick => Number.isFinite(tick.position) && tick.position >= 0 && tick.position <= 1));
});

test('covers the whole expanded movement timeline instead of truncating its year ticks after the first hundred', () => {
  const window = viewport.getTimelineWindow(0, viewport.MAX_TIMELINE_SPAN);
  for (const width of [27_980, 55_960]) {
    const ticks = viewport.getTimelineTicks(window, width);
    assert.ok(ticks.length > 1 && ticks.length <= 100, 'tick generation remains bounded');
    assert.ok(ticks[0].position < 0.05, 'years reach the left of the monitor');
    assert.ok(ticks.at(-1).position > 0.95, 'years reach the right of the monitor');
    assert.ok(ticks.some(tick => tick.position > 0.45 && tick.position < 0.55),
      'year labels remain present around the camera-facing middle');
    assert.ok(ticks.every(tick => tick.label.length > 0));
  }
});

test('keeps hour ticks distinct even before the calendar date range', () => {
  const window = viewport.getTimelineWindow(-13_800_000_000, 0);
  const ticks = viewport.getTimelineTicks(window, 1100);
  assert.ok(ticks.length >= 4);
  assert.ok(ticks.every(tick => tick.label.includes(':00')));
  assert.equal(new Set(ticks.map(tick => tick.label)).size, ticks.length);
});

test('places sub-day events by time rather than their rounded world coordinates', () => {
  const window = viewport.getTimelineWindow(2025, 0);
  const model = buildHologramTimelineModel([
    { id: 'a', year: viewport.timelineYearAtPosition(0.25, window), _z: 1200, importance: 3 },
    { id: 'b', year: viewport.timelineYearAtPosition(0.75, window), _z: 1200, importance: 3 },
    { id: 'outside', year: 2026, _z: 1200, importance: 5 },
  ], 1200, { viewport: window });
  assert.deepEqual(model.rows.map(row => row.event.id), ['a', 'b']);
  assert.ok(Math.abs(model.rows[0].position - 0.25) < 1e-6);
  assert.ok(Math.abs(model.rows[1].position - 0.75) < 1e-6);
});
