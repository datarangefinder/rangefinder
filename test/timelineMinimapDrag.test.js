import test from 'node:test';
import assert from 'node:assert/strict';
import { Timeline2D } from '../src/view2d/Timeline2D.js';
import { state } from '../src/core/StateManager.js';
import { YEAR_MIN, YEAR_MAX } from '../src/core/TimeScale.js';
import { getTimelineWindow, MAX_TIMELINE_SPAN } from '../src/core/TimelineViewport.js';

function makeTimeline(t) {
  const handlers = new Map();
  const windowHandlers = new Map();
  const previousWindow = globalThis.window;
  const previousState = state.state;
  globalThis.window = { addEventListener: (type, handler) => windowHandlers.set(type, handler) };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    state.update(previousState);
  });
  const captures = new Set();
  const canvas = {
    style: {}, title: '',
    addEventListener: (type, handler) => handlers.set(type, handler),
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => captures.delete(id),
  };
  const timeline = Object.assign(Object.create(Timeline2D.prototype), {
    canvas, width: 1000, height: 700, MM_H: 60, MM_Y: 630,
    viewCenterYear: -6e9, viewSpanYears: 2e9,
    isDragging: false, activePointerId: null, dragMode: null,
    pinRects: [], hoveredEvent: null,
  });
  timeline._bindEvents();
  const fire = (type, x, y = 650, extra = {}) => {
    assert.equal(typeof handlers.get(type), 'function', `${type} is bound to the canvas`);
    handlers.get(type)({
      clientX: x, clientY: y, button: 0, pointerId: 7,
      preventDefault() {}, ...extra,
    });
  };
  return { timeline, fire, captures, windowHandlers };
}

test('pressing and releasing the bottom bar does not jump to another year', t => {
  const { timeline, fire } = makeTimeline(t);
  const before = timeline.viewCenterYear;
  fire('pointerdown', 800);
  assert.equal(timeline.viewCenterYear, before);
  fire('pointermove', 802);
  fire('pointerup', 800);
  assert.equal(timeline.viewCenterYear, before);
  assert.equal(timeline.isDragging, false);
});

test('dragging anywhere on the bottom bar moves a large range without changing zoom or the grab offset', t => {
  const { timeline, fire, captures } = makeTimeline(t);
  fire('pointerdown', 800);
  assert.equal(captures.has(7), true, 'the drag continues if the pointer leaves the canvas');
  fire('pointermove', 900);
  const expected = -6e9 + 100 / 952 * MAX_TIMELINE_SPAN;
  assert.ok(Math.abs(timeline.viewCenterYear - expected) < 0.001);
  assert.equal(timeline.viewSpanYears, 2e9);
  assert.equal(state.state.currentYear, timeline.viewCenterYear);
  fire('pointerup', 900);
  assert.equal(captures.has(7), false);
  const releasedYear = timeline.viewCenterYear;
  fire('pointermove', 950);
  assert.equal(timeline.viewCenterYear, releasedYear, 'hovering after release does not keep scrolling');
});

test('bottom-bar dragging stops at both history boundaries without leaving blank time', t => {
  const { timeline, fire } = makeTimeline(t);
  fire('pointerdown', 500);
  fire('pointermove', -10000);
  assert.equal(getTimelineWindow(timeline.viewCenterYear, timeline.viewSpanYears).minYear, YEAR_MIN);
  fire('pointermove', 10000);
  assert.equal(getTimelineWindow(timeline.viewCenterYear, timeline.viewSpanYears).maxYear, YEAR_MAX);
  fire('pointerup', 10000);
  assert.equal(timeline.isDragging, false);
});

test('pin clicks still select details and dragging the timeline still pans without selecting a pin', t => {
  const { timeline, fire } = makeTimeline(t);
  const event = { id: 'clickable-pin' };
  timeline.pinRects = [{ ev: event, x: 400, y: 200, r: 14 }];
  state.selectEvent(null);
  fire('pointerdown', 400, 200);
  fire('pointerup', 400, 200);
  assert.equal(state.state.selectedEvent, event);

  state.selectEvent(null);
  fire('pointerdown', 400, 200);
  fire('pointermove', 500, 200);
  fire('pointerup', 500, 200);
  assert.ok(Math.abs(timeline.viewCenterYear - (-6e9 - 100 / 952 * 2e9)) < 0.001);
  assert.equal(state.state.selectedEvent, null);
});

test('canceling a drag or leaving 2D mode releases the bar', t => {
  const { timeline, fire, captures, windowHandlers } = makeTimeline(t);
  fire('pointerdown', 500);
  fire('pointermove', 600);
  fire('pointercancel', 600);
  assert.equal(timeline.isDragging, false);
  assert.equal(captures.size, 0);
  fire('pointerdown', 600);
  timeline.stop();
  assert.equal(timeline.isDragging, false);
  assert.equal(captures.size, 0);
  fire('pointerdown', 600);
  windowHandlers.get('blur')();
  assert.equal(timeline.isDragging, false);
  assert.equal(captures.size, 0);
});
