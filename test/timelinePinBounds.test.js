import test from 'node:test';
import assert from 'node:assert/strict';
import { Timeline2D } from '../src/view2d/Timeline2D.js';
import { YEAR_MIN, YEAR_MAX } from '../src/core/TimeScale.js';
import { getTimelineWindow, MAX_TIMELINE_SPAN } from '../src/core/TimelineViewport.js';

function makeTimeline(width = 1000, height = 700) {
  return Object.assign(Object.create(Timeline2D.prototype), {
    width, height, MM_H: 60, MM_Y: height - 70,
    _viewWindow: getTimelineWindow(0, MAX_TIMELINE_SPAN),
    _pinOpacity: 1, hoveredEvent: null,
    db: { query: () => [
      { id: 'first', year: YEAR_MIN, category: 'astronomy', importance: 5 },
      { id: 'last', year: YEAR_MAX, category: 'future', importance: 5 },
      { id: 'outside', year: YEAR_MAX + 1, category: 'future', importance: 5 },
    ] },
  });
}

test('keeps pin centers inside the inset plot while allowing their circles to overhang', () => {
  const ctx = {
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillText() {},
  };
  for (const [width, height] of [[1000, 700], [500, 300]]) {
    const timeline = makeTimeline(width, height);
    timeline._drawPins(ctx, width, height);
    assert.deepEqual(timeline.pinRects.map(pin => pin.ev.id), ['first', 'last']);
    const [first, last] = timeline.pinRects;
    assert.equal(first.x, 24);
    assert.equal(last.x, width - 24);
    assert.ok(timeline.pinRects.every(pin => pin.y >= 24 && pin.y <= timeline.MM_Y - 24));
    assert.equal(first.r, 14, 'the existing circular marker size is preserved');
    assert.ok(first.x - first.r < 24, 'the radius may extend outside the center boundary');
    assert.ok(last.x + last.r > width - 24);
  }
});

test('uses the same inset year mapping for minimap dots and clicks', () => {
  const timeline = makeTimeline();
  assert.equal(timeline._yearToMiniX(YEAR_MIN, timeline.width), 24);
  assert.equal(timeline._yearToMiniX(YEAR_MAX, timeline.width), timeline.width - 24);
  for (const year of [YEAR_MIN, -4_600_000_000, 2025, YEAR_MAX]) {
    const x = timeline._yearToMiniX(year, timeline.width);
    assert.ok(Math.abs(timeline._miniXToYear(x) - year) < 0.0001);
  }
  assert.equal(timeline._miniXToYear(0), YEAR_MIN);
  assert.equal(timeline._miniXToYear(timeline.width), YEAR_MAX);
});
