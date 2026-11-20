import assert from 'node:assert/strict';
import test from 'node:test';
import { HUD, shouldShowDetailPanel, getTimelineRangeReadout } from '../src/ui/HUD.js';
import { state } from '../src/core/StateManager.js';
import { YEAR_MIN, YEAR_MAX } from '../src/core/TimeScale.js';
import { MAX_TIMELINE_SPAN, MIN_TIMELINE_SPAN } from '../src/core/TimelineViewport.js';

test('opens the DOM detail panel only in 2D timeline mode', () => {
  assert.equal(shouldShowDetailPanel('2d'), true);
  assert.equal(shouldShowDetailPanel('3d'), false);
});

test('shows the visible left, center and right years rather than the stale focus for a full view', () => {
  const readout = getTimelineRangeReadout(YEAR_MIN, MAX_TIMELINE_SPAN);
  assert.deepEqual(readout.map(item => item.year), [YEAR_MIN, (YEAR_MIN + YEAR_MAX) / 2, YEAR_MAX]);
  assert.deepEqual(readout.map(item => item.position), ['left', 'center', 'right']);
  assert.equal(readout[0].text, '138億年前');
  assert.match(readout[1].text, /^69(?:\.0)?億年前$/);
  assert.equal(readout[2].text, '西暦3000年');
  assert.deepEqual(getTimelineRangeReadout(YEAR_MAX, MAX_TIMELINE_SPAN), readout,
    'the complete visible range stays the same even when the stored focus changes');
});

test('updates all three years when panning and zooming, including at the timeline boundary', () => {
  const boundary = getTimelineRangeReadout(YEAR_MIN, 1e9);
  assert.deepEqual(boundary.map(item => item.year), [YEAR_MIN, YEAR_MIN + 5e8, YEAR_MIN + 1e9]);
  const panned = getTimelineRangeReadout(2000, 100);
  assert.deepEqual(panned.map(item => item.year), [1950, 2000, 2050]);
  const zoomed = getTimelineRangeReadout(2000, 10);
  assert.deepEqual(zoomed.map(item => item.year), [1995, 2000, 2005]);
});

test('keeps left, middle and right dates distinct in a two-day view across New Year', () => {
  const readout = getTimelineRangeReadout(2025, MIN_TIMELINE_SPAN);
  assert.equal(readout[0].text, '2024/12/31 00:00');
  assert.equal(readout[1].text, '2025/1/1 00:00');
  assert.equal(readout[2].text, '2025/1/2 00:00');
});

test('only movement replaces the middle HUD year with the year directly ahead', t => {
  const previousState = state.state;
  const previousDocument = globalThis.document;
  t.after(() => {
    state.update(previousState);
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const values = Object.fromEntries(['left', 'center', 'right'].map(position => [`era-year-${position}`, {}]));
  globalThis.document = { getElementById: id => values[id] };
  state.update({ mode: 'move', currentYear: YEAR_MIN, timelineSpanYears: MAX_TIMELINE_SPAN, movementFocusYear: 2000 });
  HUD.prototype._updateEraIndicator.call({}, YEAR_MIN);
  assert.equal(values['era-year-left'].textContent, '138億年前');
  assert.equal(values['era-year-center'].textContent, '西暦2000年');
  assert.equal(values['era-year-right'].textContent, '西暦3000年');
  state.update({ movementFocusYear: -6_900_000_123 });
  HUD.prototype._updateEraIndicator.call({}, YEAR_MIN);
  assert.equal(values['era-year-center'].textContent, '6,900,000,123年前', 'fine movement retains a readable exact year');
  for (const mode of ['3d', '2d']) {
    state.update({ mode });
    HUD.prototype._updateEraIndicator.call({}, YEAR_MIN);
    assert.match(values['era-year-center'].textContent, /^69(?:\.0)?億年前$/, 'other modes keep the visible-range midpoint');
  }
});
