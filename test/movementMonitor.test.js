import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Scene3D } from '../src/view3d/Scene3D.js';
import { getHologramPanelLayout, getHologramStagePose } from '../src/view3d/holoTimelineLayout.js';
import { projectMovementMonitor } from '../src/view3d/MovementMonitor.js';

function giantArchive(strafeDelta = 0) {
  const view = new Scene3D({}, null);
  view.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2e9);
  view.interactionMode = 'move';
  view._calibrateMoveArchiveScale();
  view.cameraTravel = 7;
  const layout = getHologramPanelLayout('move', 1, view.moveTimelineWidth);
  const pose = getHologramStagePose();
  // The recent-history end of the gigantic archive, where the reported flicker is most severe.
  view.observerStrafe = layout.panelWidth * pose.panelScale / 2 - 20 + strafeDelta;
  view._updateCamera();
  const surface = new THREE.Group();
  surface.position.set(pose.panelX, pose.panelY, pose.panelZOffset);
  surface.rotation.y = pose.panelRotationY;
  surface.scale.setScalar(pose.panelScale);
  surface.updateMatrixWorld(true);
  return { view, surface, layout };
}

test('clips the gigantic monitor to bounded screen coordinates before sending vertices to the GPU', () => {
  const { view, surface, layout } = giantArchive();
  assert.ok(layout.panelWidth > 1e7);
  const projected = projectMovementMonitor(view.camera, surface, layout);
  assert.ok(projected.vertices.length >= 9, 'a visible single surface remains at the recent-history edge');
  assert.equal(projected.vertices.length % 9, 0);
  assert.ok(projected.vertices.every(value => Number.isFinite(value) && Math.abs(value) <= 1.000001));
  assert.ok(projected.lines.length > 0);
  assert.ok(projected.lines.every(value => Number.isFinite(value) && Math.abs(value) <= 1.000001));
});

test('tiny movement at the end of the archive does not make triangles disappear or jump', () => {
  const base = giantArchive();
  const before = projectMovementMonitor(base.view.camera, base.surface, base.layout);
  assert.ok(before.vertices.length > 0);
  for (const delta of [-0.0001, 0.0001]) {
    const shifted = giantArchive(delta);
    const after = projectMovementMonitor(shifted.view.camera, shifted.surface, shifted.layout);
    assert.equal(after.vertices.length, before.vertices.length);
    assert.ok(after.vertices.every((value, index) => Math.abs(value - before.vertices[index]) < 0.001));
  }
});

test('the flat surface keeps perspective so the farther edge is smaller', () => {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1000);
  camera.position.z = 15;
  camera.lookAt(0, 0, 0);
  const surface = new THREE.Group();
  surface.rotation.y = 0.4;
  const projected = projectMovementMonitor(camera, surface, {
    panelWidth: 10, panelHeight: 5, axisY: 150, canvasHeight: 300,
    timelineLeft: 0, timelineWidth: 1000, canvasWidth: 1000,
  });
  assert.equal(projected.vertices.length, 18);
  const points = Array.from({ length: projected.vertices.length / 3 }, (_, i) => projected.vertices.slice(i * 3, i * 3 + 3));
  const leftX = Math.min(...points.map(point => point[0]));
  const rightX = Math.max(...points.map(point => point[0]));
  const height = x => {
    const ys = points.filter(point => Math.abs(point[0] - x) < 1e-6).map(point => point[1]);
    return Math.max(...ys) - Math.min(...ys);
  };
  assert.ok(Math.abs(height(leftX) - height(rightX)) > 0.05, 'perspective is preserved instead of making a screen-aligned rectangle');
});
