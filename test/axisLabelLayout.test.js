import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAxisLabelLayout } from '../src/view3d/axisLabelLayout.js';

test('keeps year labels at their projected timeline positions independent of monitor texture resolution', () => {
  const points = [
    { key: '-7000000000', label: '70億年前', x: 240, y: 400, visible: true },
    { key: '-6800000000', label: '68億年前', x: 600, y: 405, visible: true },
  ];
  const labels = buildAxisLabelLayout(points, { width: 800, height: 600 });
  assert.deepEqual(labels.map(({ key, label, x, y }) => ({ key, label, x, y })), points.map(({ visible, ...point }) => point));
});

test('omits hidden or overlapping year labels without moving their date anchors', () => {
  const labels = buildAxisLabelLayout([
    { key: 'a', label: '70億年前', x: 200, y: 400 },
    { key: 'b', label: '69億年前', x: 220, y: 400 },
    { key: 'c', label: '68億年前', x: 420, y: 400 },
    { key: 'd', label: '67億年前', x: 600, y: 400, visible: false },
    { key: 'e', label: '66億年前', x: 900, y: 400 },
  ], { width: 800, height: 600 });
  assert.deepEqual(labels.map(label => [label.key, label.x]), [['a', 200], ['c', 420]]);
});
