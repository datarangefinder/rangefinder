import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBeaconLayout } from '../src/view3d/beaconLayout.js';

const event = (id, importance = 3) => ({ id, title: id, year: 2000, importance });
const point = (x, id, extra = {}) => ({ x, y: 420, event: event(id), ...extra });
const viewport = { width: 800, height: 600 };

test('groups crowded anchors and preserves every member', () => {
  const groups = buildBeaconLayout([point(220, 'a'), point(226, 'b'), point(600, 'c')], viewport);
  assert.deepEqual(groups.map(group => group.events.map(ev => ev.id)), [['a', 'b'], ['c']]);
  assert.ok(groups[0].x >= 220 && groups[0].x <= 226);
});

test('unfolds individual beacons when approaching spreads their projected positions', () => {
  const far = buildBeaconLayout([point(220, 'a'), point(225, 'b')], viewport);
  const near = buildBeaconLayout([point(220, 'a'), point(400, 'b')], viewport);
  assert.equal(far.length, 1);
  assert.equal(near.length, 2);
});

test('keeps a selected event as the visible representative of its group', () => {
  const groups = buildBeaconLayout([
    point(220, 'a', { event: event('a', 5) }),
    point(225, 'b', { isSelected: true, event: event('b', 1) }),
  ], viewport);
  assert.equal(groups[0].event.id, 'b');
  assert.equal(groups[0].isSelected, true);
});

test('omits offscreen or behind-camera anchors without inventing positions', () => {
  const groups = buildBeaconLayout([
    point(-30, 'left'), point(220, 'behind', { visible: false }),
    point(900, 'right'), point(300, 'visible'), point(NaN, 'invalid'),
  ], viewport);
  assert.deepEqual(groups.flatMap(group => group.events.map(ev => ev.id)), ['visible']);
});

test('keeps labels inside narrow viewports and separates overlapping labels', () => {
  const groups = buildBeaconLayout(Array.from({ length: 12 }, (_, i) => point(14 + i * 25, String(i))), {
    width: 320, height: 500,
  });
  assert.equal(groups.flatMap(group => group.events).length, 12);
  for (const group of groups) {
    assert.ok(group.labelX >= 12);
    assert.ok(group.labelX + group.labelWidth <= 308);
    assert.ok(group.headY >= 132);
    assert.ok(group.headY < group.anchorY);
  }
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const a = groups[i], b = groups[j];
    assert.ok(Math.abs(a.headY - b.headY) >= 58
      || a.labelX + a.labelWidth + 8 <= b.labelX
      || b.labelX + b.labelWidth + 8 <= a.labelX);
  }
});

test('returns no beacons for an empty timeline', () => {
  assert.deepEqual(buildBeaconLayout([], viewport), []);
});
