import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Scene3D } from '../src/view3d/Scene3D.js';
import { getHologramPanelLayout, getHologramStagePose, getObserverStrafeOffset, adjustObserverTravel } from '../src/view3d/holoTimelineLayout.js';
import { calibrateMoveTimelineWidth, intersectTimelineBand, getVisibleArchiveWindow, remapArchiveStrafe } from '../src/view3d/moveArchiveScale.js';
import { getTimelineWindow, getTimelineTicks, MAX_TIMELINE_SPAN } from '../src/core/TimelineViewport.js';
import { state } from '../src/core/StateManager.js';

function closestStage(aspect) {
  const pose = getHologramStagePose();
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 2e9);
  Scene3D.prototype._updateCamera.call({ camera, interactionMode: 'move', cameraTravel: 7,
    camCurrentZ: 0, terminalStageZ: 0, camAngleY: 0, camAngleX: 0.15 });
  camera.updateMatrixWorld();
  const surface = new THREE.Group();
  surface.position.set(pose.panelX, pose.panelY, pose.panelZOffset);
  surface.rotation.y = pose.panelRotationY;
  surface.scale.setScalar(pose.panelScale);
  surface.updateMatrixWorld(true);
  return { camera, surface };
}

test('movement reports the year straight ahead and ignores neck rotation without moving the archive focus', t => {
  const previousState = state.state;
  t.after(() => state.update(previousState));
  const { camera, surface } = closestStage(16 / 9);
  const view = new Scene3D({}, null);
  view.camera = camera;
  view.interactionMode = 'move';
  view.observerTravel = view.cameraTravel = view.observerTravelTarget = 7;
  view.moveSurfaceExpanded = true;
  view.holoPanelLayout = getHologramPanelLayout('move', 1, 8e9);
  const archive = getTimelineWindow(0, MAX_TIMELINE_SPAN);
  view.holoTimelineModel = { range: { viewport: archive }, rows: [] };

  // Put the year 2000 under the neutral sightline on the same plane as the drawn axis.
  camera.updateMatrixWorld();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld),
    surface.localToWorld(new THREE.Vector3(0, 0, 0.14)));
  const ray = new THREE.Ray(camera.position, camera.getWorldDirection(new THREE.Vector3()));
  const startX = surface.worldToLocal(ray.intersectPlane(plane, new THREE.Vector3())).x;
  const layout = view.holoPanelLayout;
  const yearX = -layout.panelWidth / 2 + (layout.timelineLeft
    + (2000 - archive.minYear) / archive.spanYears * layout.timelineWidth) / layout.canvasWidth * layout.panelWidth;
  view.observerStrafe = (yearX - startX) * getHologramStagePose().panelScale;
  const focusBefore = state.state.currentYear;
  view._updateMovementFocusYear();
  assert.equal(state.state.movementFocusYear, 2000);
  for (const [yaw, pitch] of [[0.45, 0.4], [-0.9, -0.1]]) {
    view.camAngleY = yaw;
    view.camAngleX = pitch;
    view._updateMovementFocusYear();
    assert.equal(state.state.movementFocusYear, 2000, 'looking around leaves the forward year unchanged');
  }
  const unitsPerYear = layout.timelineWidth / layout.canvasWidth * layout.panelWidth
    * getHologramStagePose().panelScale / archive.spanYears;
  view.observerStrafe += unitsPerYear * 100;
  view._updateMovementFocusYear();
  assert.equal(state.state.movementFocusYear, 2100, 'sideways travel updates the forward year');
  assert.equal(state.state.currentYear, focusBefore, 'reading the forward year never pans or rebuilds the archive');
  view.observerStrafe = 1e12;
  view._updateMovementFocusYear();
  assert.equal(state.state.movementFocusYear, archive.maxYear, 'monitor margins clamp to the archive endpoint');
  view.interactionMode = 'timeline';
  view._updateMovementFocusYear();
  assert.equal(state.state.movementFocusYear, null, 'leaving movement clears the movement-only readout');
});

test('calibrates the closest 13%-91% screen band to 2000 years at multiple aspect ratios', () => {
  for (const aspect of [16 / 9, 1.9, 4 / 3]) {
    const { camera, surface } = closestStage(aspect);
    const width = calibrateMoveTimelineWidth(camera, surface, getHologramPanelLayout('move'));
    const layout = getHologramPanelLayout('move', 1, width);
    const band = intersectTimelineBand(camera, surface, layout);
    assert.ok(band && Math.abs(band.span / (layout.timelineWidth / layout.canvasWidth * layout.panelWidth)
      * MAX_TIMELINE_SPAN - 2000) < 0.01, 'the reference band spans 2000 years');
    assert.ok(layout.panelWidth > 1_000_000, 'the whole archive is physically enormous');
    const visible = getVisibleArchiveWindow(camera, surface, layout, getTimelineWindow(0, MAX_TIMELINE_SPAN));
    const ticks = getTimelineTicks(visible, 1280);
    assert.ok(visible.spanYears > 2000 && visible.spanYears < 4000);
    assert.ok(ticks.length >= 4 && ticks.length <= 12);
    assert.equal(new Set(ticks.map(tick => tick.label)).size, ticks.length, 'fine year labels do not round to identical billion-year values');
  }
});

test('Shift speeds up both directions while allowing retreat far enough to view the gigantic archive', () => {
  const options = { minTravel: -1e9 };
  const normal = adjustObserverTravel(0, 120, options);
  const fast = adjustObserverTravel(0, 120, { ...options, fast: true });
  assert.ok(Math.abs(fast / normal - 100) < 1e-10);
  assert.ok(adjustObserverTravel(-1000, -120, { ...options, fast: true })
    > adjustObserverTravel(-1000, -120, options));
  let travel = 0;
  for (let i = 0; i < 24; i++) travel = adjustObserverTravel(travel, 120, { ...options, fast: true });
  assert.equal(travel, options.minTravel);
  assert.equal(adjustObserverTravel(travel, 120, { ...options, fast: true }), options.minTravel);
  assert.equal(adjustObserverTravel(6, -120, { ...options, fast: true }), 7, 'forward motion never crosses the monitor');
});

test('fast forward exactly reverses a backward step instead of jumping to the closest position', () => {
  for (const fast of [false, true]) {
    const options = { fast, minTravel: -1e12 };
    for (const start of [6, 0, -20, -1000, -1e6, -1e9]) {
      for (const delta of [1, 120, 720]) {
        const back = adjustObserverTravel(start, delta, options);
        const returned = adjustObserverTravel(back, -delta, options);
        assert.ok(Math.abs(returned - start) < Math.max(1e-8, Math.abs(start) * 1e-12),
          `return to ${start} after reversing ${delta} wheel units, fast=${fast}`);
      }
    }
  }
  const next = adjustObserverTravel(-1e6, -120, { fast: true, minTravel: -1e12 });
  assert.ok(next > -1e6 && next < -1e5, 'one fast step approaches gradually from a distant position');
});

test('lateral travel preserves the visible time scale even far from the original monitor center', () => {
  const { camera, surface } = closestStage(16 / 9);
  const width = calibrateMoveTimelineWidth(camera, surface, getHologramPanelLayout('move'));
  const layout = getHologramPanelLayout('move', 1, width);
  const archive = getTimelineWindow(0, MAX_TIMELINE_SPAN);
  const initial = getVisibleArchiveWindow(camera, surface, layout, archive);
  const initialPosition = camera.position.clone();
  const tangent = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0),
    getHologramStagePose().panelRotationY);
  for (const distance of [-1e6, 1e6]) {
    camera.position.copy(initialPosition).addScaledVector(tangent, distance);
    camera.updateMatrixWorld();
    const moved = getVisibleArchiveWindow(camera, surface, layout, archive);
    assert.ok(moved && Math.abs(moved.spanYears - initial.spanYears) < 0.1,
      'moving sideways retains the distance to the monitor and its visible year span');
    assert.ok(Math.abs(moved.centerYear - initial.centerYear) > 1e6, 'the visible years actually move across the archive');
  }
});

test('resizing preserves the observed year position instead of leaving the recent-history end of the monitor', () => {
  const oldLayout = getHologramPanelLayout('move', 1, 8e9);
  const newLayout = getHologramPanelLayout('move', 1, 5e9);
  const scale = getHologramStagePose().panelScale;
  const worldAt = (position, layout) => (-layout.panelWidth / 2
    + (layout.timelineLeft + position * layout.timelineWidth) / layout.canvasWidth * layout.panelWidth) * scale;
  for (const position of [0, 0.5, 0.9999999, 1]) {
    assert.ok(Math.abs(remapArchiveStrafe(worldAt(position, oldLayout), oldLayout, newLayout, scale)
      - worldAt(position, newLayout)) < 1e-6, 'the same point in history stays in front of the camera');
  }
});

test('sideways movement stops with the neutral sightline at either monitor edge, even at high speed', () => {
  for (const aspect of [16 / 9, 4 / 3]) {
    for (const travel of [7, -300, -1e8]) {
      for (const progress of [0, 0.5, 1]) {
        const { camera } = closestStage(aspect);
        const view = new Scene3D({}, null);
        view.camera = camera;
        view.interactionMode = 'move';
        view.moveSurfaceExpanded = true;
        view.observerTravel = view.cameraTravel = view.observerTravelTarget = travel;
        view.holoPanelLayout = getHologramPanelLayout('move', progress, 8e9);
        const pose = getHologramStagePose();
        const surface = new THREE.Group();
        surface.rotation.y = pose.panelRotationY;
        surface.position.set(pose.panelX, pose.panelY, view.camCurrentZ + pose.panelZOffset);
        const offset = getObserverStrafeOffset(view.holoPanelLayout.panelOffsetX * pose.panelScale);
        surface.position.x += offset.x;
        surface.position.z += offset.z;
        surface.scale.setScalar(pose.panelScale);

        for (const sign of [1, -1]) {
          view._strafeObserver(sign * 1e16, true);
          view.observerStrafe = view.observerStrafeTarget;
          view._updateCamera();
          camera.updateMatrixWorld();
          surface.updateMatrixWorld(true);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld), surface.position);
          const ray = new THREE.Ray(camera.position, camera.getWorldDirection(new THREE.Vector3()));
          const hit = ray.intersectPlane(plane, new THREE.Vector3());
          const hitX = hit && surface.worldToLocal(hit).x;
          const edge = sign * view.holoPanelLayout.panelWidth / 2;
          assert.ok(hit && Math.abs(hitX - edge) < Math.max(1e-5, Math.abs(edge) * 1e-10),
            `the neutral sightline stops at edge ${sign}, travel=${travel}, progress=${progress}`);
          const target = view.observerStrafeTarget;
          view.camAngleY = 0.4;
          view._strafeObserver(sign * 1e16, true);
          assert.equal(view.observerStrafeTarget, target, 'looking sideways does not move the boundary');
          view.camAngleY = 0;
          view._strafeObserver(-sign * 120);
          assert.ok(sign * (view.observerStrafeTarget - target) < 0, 'reversing moves away from the edge immediately');
        }
      }
    }
  }
});
