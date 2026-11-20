import assert from 'node:assert/strict';
import test from 'node:test';
import * as hologramLayout from '../src/view3d/holoTimelineLayout.js';
import {
  buildHologramTimelineModel,
  adjustNeckLook,
  getNeckLookLimits,
  getObservationBaySpec,
  getHologramMarkerY,
  getHologramStagePose,
  getModeViewYawBias,
  getTerminalStageZ,
  getHelmetAssemblySpec,
  getCloseTpsCameraSpec,
  getObserverLightingSpec,
  getTpsHeadTracking,
  shouldMirrorSelectionToHologram,
  shouldRefreshHologram,
  supportsNeckLook,
} from '../src/view3d/holoTimelineLayout.js';

test('places in-range events in chronological order and distributes equal dates across lanes', () => {
  const model = buildHologramTimelineModel([
    { id: 'late', _z: 60, importance: 3 },
    { id: 'same-b', _z: 50, importance: 4 },
    { id: 'same-a', _z: 50, importance: 5 },
    { id: 'out-of-range', _z: 90, importance: 5 },
  ], 50, { range: 20, maxEvents: 8 });

  assert.deepEqual(model.rows.map(row => row.event.id), ['same-a', 'same-b', 'late']);
  assert.notEqual(model.rows[0].lane, model.rows[1].lane);
  assert.ok(model.rows.every(row => row.position >= 0 && row.position <= 1));
});

test('returns an empty row list when no events are in range', () => {
  const model = buildHologramTimelineModel([
    { id: 'out-of-range', _z: 150, importance: 5 },
  ], 50, { range: 20 });

  assert.deepEqual(model.rows, []);
});

test('marks the selected event so the hologram can keep its focus accent', () => {
  const model = buildHologramTimelineModel([
    { id: 'first', _z: 45, importance: 3 },
    { id: 'selected', _z: 50, importance: 5 },
  ], 50, { range: 20, selectedEventId: 'selected' });

  assert.deepEqual(
    model.rows.map(row => [row.event.id, row.isSelected]),
    [['first', false], ['selected', true]],
  );
});

test('faces the hologram toward an observer positioned behind its timeline plane', () => {
  const { panelRotationY } = getHologramStagePose();

  assert.ok(Math.cos(panelRotationY) < 0, 'the visible canvas face points back toward the camera');
});

test('places the projected timeline to the screen-right of the observer composition', () => {
  const {
    cameraDistance, characterX, characterZOffset, panelScale, panelX, panelY, panelZOffset,
    terminalViewYawBias,
  } = getHologramStagePose();

  assert.ok(panelX < 0, 'negative world X projects to the right from the shoulder camera');
  assert.ok(panelX > -3.5, 'the terminal retains a readable margin at narrow desktop widths');
  assert.ok(characterX > 0, 'positive world X holds the observer at the left edge');
  assert.ok(characterX <= 5.5, 'the close shoulder remains visible rather than entirely off-screen');
  assert.ok(cameraDistance >= 15, 'the complete terminal is visible from the shoulder view');
  assert.ok(characterZOffset <= -11, 'the observer occupies the close shoulder foreground');
  assert.ok(panelScale >= 2.3 && panelScale <= 2.5, 'the terminal uses the full observation window without clipping its title');
  assert.ok(panelY >= 3, 'the terminal sits high enough for an upward-looking view');
  assert.ok(
    panelZOffset >= 13.8 && panelZOffset <= 14.2,
    'the terminal is set just far enough back to keep its observation menu in frame',
  );
  assert.ok(
    terminalViewYawBias >= 0.07 && terminalViewYawBias <= 0.14,
    'the terminal view leaves the monitor observation menu visible at screen-right',
  );
});

test('keeps the monitor and its outer frame slightly above the floor in terminal and movement modes', () => {
  const pose = getHologramStagePose();
  const floorY = -4;
  for (const mode of ['timeline', 'move']) {
    for (const progress of [0, 0.5, 1]) {
      const layout = hologramLayout.getHologramPanelLayout(mode, progress);
      const frameBottom = pose.panelY - (layout.panelHeight + 0.15) * pose.panelScale / 2;
      assert.ok(frameBottom - floorY >= 0.2, 'the lowest part of the frame clears the floor');
      assert.ok(frameBottom - floorY <= 0.6, 'the monitor hovers only a little above the floor');
    }
  }
});

test('keeps the terminal stage fixed while scrolling its timeline contents', () => {
  assert.equal(
    getTerminalStageZ('timeline', 720, 120),
    120,
    'terminal mode keeps the observation floor still while the archive time changes',
  );
  assert.equal(
    getTerminalStageZ('move', 720, 120),
    720,
    'movement mode remains attached to the active world position',
  );
});

test('restores the observer and camera to the terminal position', () => {
  assert.deepEqual(hologramLayout.getTerminalTravelState(), {
    observerTravel: 0,
    cameraTravel: 0,
    observerTravelTarget: 0,
    observerStrafe: 0,
    observerStrafeTarget: 0,
  });
});

test('starts movement mode with the terminal camera framing', () => {
  const terminalBias = 0.28;

  assert.equal(getModeViewYawBias('timeline', terminalBias, 0), terminalBias);
  assert.equal(
    getModeViewYawBias('move', terminalBias, 0),
    terminalBias,
    'movement begins with the same off-axis monitor composition as terminal mode',
  );
  assert.equal(getModeViewYawBias('move', terminalBias, 1), 0);
  assert.equal(
    getModeViewYawBias('move', terminalBias, hologramLayout.getMoveCameraBlend(-1)),
    terminalBias,
    'a forward camera lead keeps the terminal-mode viewing angle',
  );
});

test('pulses hologram brightness without moving its screen lines', () => {
  assert.equal(typeof hologramLayout.getHologramBrightnessPulse, 'function');
  assert.equal(hologramLayout.getHologramBrightnessPulse(0), 0.97);
  assert.ok(hologramLayout.getHologramBrightnessPulse(Math.PI / 3.2) > 0.99);
  assert.ok(hologramLayout.getHologramBrightnessPulse((3 * Math.PI) / 3.2) < 0.95);
});

test('opens the monitor immediately after the short name splash without holding a white line', () => {
  const opening = hologramLayout.getHologramOpeningProgress;
  assert.equal(opening(0), 0);
  assert.ok(opening(1 / 60) > 0, 'the first animation frame starts growing the monitor');
  let previous = 0;
  for (let elapsed = 0; elapsed < 0.95; elapsed += 1 / 60) {
    const progress = opening(elapsed);
    assert.ok(progress >= previous && progress - previous < 0.06, 'the monitor unfolds continuously');
    previous = progress;
  }
  assert.equal(opening(0.95), 1);
  assert.deepEqual(hologramLayout.getHologramBootPresentation(0), {
    showTerminal: false, showEnvironment: false, showHud: false,
  });
  assert.deepEqual(hologramLayout.getHologramBootPresentation(1), {
    showTerminal: true, showEnvironment: true, showHud: true,
  });
});

test('uses a luminous opaque backplate that blocks the horizon grid', () => {
  assert.equal(typeof hologramLayout.getHologramPanelOptics, 'function');
  const optics = hologramLayout.getHologramPanelOptics();

  assert.equal(optics.backplateOpacity, 1);
  assert.ok(optics.canvasOpacity >= 0.98);
  assert.equal(optics.hasOuterProjection, false);
});

test('uses a wide terminal while keeping the observation log narrow', () => {
  assert.equal(typeof hologramLayout.getHologramPanelLayout, 'function');
  const layout = hologramLayout.getHologramPanelLayout();

  assert.ok(layout.panelWidth / layout.panelHeight > 1.8);
  assert.ok(layout.statusWidth / layout.canvasWidth < 0.15);
});

test('expands movement-mode display area without stretching its contents vertically or horizontally', () => {
  const terminal = hologramLayout.getHologramPanelLayout('timeline');
  const movement = hologramLayout.getHologramPanelLayout('move');

  const previousTimelineWidth = 27_980;
  assert.equal(movement.timelineWidth, previousTimelineWidth * 2, 'each year occupies twice the previous time-axis length');
  const previousYearLength = previousTimelineWidth * 13.6 / 1440;
  const yearLength = movement.timelineWidth / movement.canvasWidth * movement.panelWidth;
  assert.ok(Math.abs(yearLength - previousYearLength * 2) < 1e-10,
    'the time-axis distance doubles in world space with the same all-history period');
  assert.equal(movement.panelHeight, terminal.panelHeight, 'travel keeps the enlarged terminal height');
  assert.ok(Math.abs(movement.canvasHeight / movement.panelHeight - terminal.canvasHeight / terminal.panelHeight) < 1e-10,
    'both modes keep text and round markers at the original vertical pixel density');
  assert.ok(Math.abs(movement.canvasWidth / movement.panelWidth - terminal.canvasWidth / terminal.panelWidth) < 1e-10,
    'text retains the same number of pixels per unit of physical monitor width');
  assert.equal(movement.statusWidth, terminal.statusWidth);
  assert.equal(movement.canvasWidth - movement.statusLeft, terminal.canvasWidth - terminal.statusLeft,
    'the observation log stays a normal-sized column at the extended right edge');
  assert.ok(movement.timelineWidth > terminal.timelineWidth * 8);
});

test('extends the terminal left while keeping its right edge and content density fixed', () => {
  const terminal = hologramLayout.getHologramPanelLayout('timeline');
  const movement = hologramLayout.getHologramPanelLayout('move');
  // The readable plane's negative X edge is the left edge of its canvas.
  const offset = terminal.panelOffsetX ?? 0;
  assert.ok(offset - terminal.panelWidth / 2 < -9, 'the left edge reaches into the marked empty space');
  assert.ok(Math.abs(offset + terminal.panelWidth / 2 - 6.8) < 1e-10,
    'the right edge stays at the original local +6.8 position');
  assert.ok(Math.abs(terminal.canvasWidth / terminal.panelWidth - 1440 / 13.6) < 1e-10);
  assert.equal(terminal.canvasHeight, 896);
  assert.equal(movement.panelOffsetX ?? 0, 0);
});

test('places a narrow rim light behind the observer silhouette', () => {
  assert.equal(typeof hologramLayout.getCharacterRimLightSpec, 'function');
  const light = hologramLayout.getCharacterRimLightSpec();

  assert.ok(light.offsetZ > 0);
  assert.ok(light.height > 3);
  assert.ok(light.width < 0.25);
  assert.ok(light.intensity < 2);
});

test('keeps the observer free of an overhead head light', () => {
  const lighting = getObserverLightingSpec();

  assert.equal(lighting.hasHeadLight, false);
  assert.equal(lighting.hasRimLight, false);
});

test('uses a smooth-back full-face helmet assembly for the observer', () => {
  const helmet = getHelmetAssemblySpec();

  assert.ok(helmet.shell.widthSegments >= 24);
  assert.ok(helmet.shell.heightSegments >= 16);
  assert.ok(helmet.visor.scaleX >= 0.9);
  assert.ok(helmet.visor.scaleY >= 0.8);
  assert.ok(helmet.collar.radius < helmet.shell.radius);
  assert.equal(helmet.rearBeacons, 0);
});

test('sends the wheel to observer travel only in move mode', () => {
  assert.equal(typeof hologramLayout.getWheelInteraction, 'function');
  assert.equal(hologramLayout.getWheelInteraction('timeline'), 'timeline');
  assert.equal(hologramLayout.getWheelInteraction('move'), 'travel');
  assert.ok(hologramLayout.adjustObserverTravel(0, -120) > 0);
  assert.equal(hologramLayout.adjustObserverTravel(7, -120), 7);
});

test('allows movement mode to travel well behind the terminal', () => {
  let travel = 0;
  for (let step = 0; step < 160; step++) {
    travel = hologramLayout.adjustObserverTravel(travel, 120);
  }
  assert.ok(
    travel < -200,
    'continued backward scrolling gets far enough from the tenfold-width monitor',
  );
});

test('keeps the same close camera distance when walking forward or backward', () => {
  const forward = hologramLayout.getObserverFollowStep(0, 0, 6, 0.1);
  const backward = hologramLayout.getObserverFollowStep(0, 0, -6, 0.1);

  assert.equal(
    forward.cameraTravel,
    forward.observerTravel,
    'forward travel keeps the terminal shoulder distance, so the helmet remains visible',
  );
  assert.equal(backward.cameraTravel, backward.observerTravel,
    'backward travel uses the same synchronized shoulder camera as forward travel');
  assert.ok(backward.cameraTravel < 0);
  let observer = 0;
  let camera = 0;
  for (const target of [-20, 6, -8, 0]) {
    for (let frame = 0; frame < 30; frame++) {
      const step = hologramLayout.getObserverFollowStep(observer, camera, target, 1 / 60);
      observer = step.observerTravel;
      camera = step.cameraTravel;
      assert.equal(camera, observer, 'reversing direction never creates camera lag');
      assert.equal(hologramLayout.getMoveCameraBlend(observer - camera), 0);
    }
  }
});

test('keeps terminal and move camera look within a neck-sized range', () => {
  assert.equal(supportsNeckLook('timeline'), true);
  assert.equal(supportsNeckLook('move'), true);

  const limits = getNeckLookLimits();
  assert.deepEqual(
    adjustNeckLook({ yaw: 0, pitch: 0.15 }, -1000, -1000),
    { yaw: limits.yaw, pitch: limits.pitchMax },
  );
  assert.deepEqual(
    adjustNeckLook({ yaw: 0, pitch: 0.15 }, 1000, 1000),
    { yaw: -limits.yaw, pitch: limits.pitchMin },
  );
});

test('allows exactly thirty additional degrees to the right only in movement mode', () => {
  const initial = { yaw: 0, pitch: 0.15 };
  const terminalRight = adjustNeckLook(initial, 1000, 0, 'timeline');
  const moveRight = adjustNeckLook(initial, 1000, 0, 'move');
  assert.ok(Math.abs(terminalRight.yaw - moveRight.yaw - Math.PI / 6) < 1e-12);
  assert.deepEqual(adjustNeckLook(initial, -1000, 0, 'move'),
    adjustNeckLook(initial, -1000, 0, 'timeline'), 'the left limit is unchanged');
  assert.equal(moveRight.pitch, initial.pitch);
  assert.equal(adjustNeckLook(moveRight, 1000, 0, 'move').yaw, moveRight.yaw,
    'further dragging stops at the extended right limit');
});

test('steers the helmet face with a near-FPS shoulder camera', () => {
  const neutralTracking = getTpsHeadTracking(0, 0.15);
  const tracking = getTpsHeadTracking(0.35, 0.3);
  const rightTracking = getTpsHeadTracking(-0.35, 0.3);

  assert.equal(neutralTracking.viewYaw, -0.28);
  assert.ok(Math.abs(tracking.headYaw - 0.07) < 1e-12, 'the head follows the requested neck angle');
  assert.ok(tracking.viewYaw > tracking.headYaw, 'the left glance also reveals a little of the face');
  assert.ok(Math.abs(tracking.cameraStrafe) < 0.5);
  assert.ok(tracking.headPitch > 0);
  assert.ok(tracking.cameraAdvance > 0, 'leftward look moves the close camera diagonally forward');
  assert.ok(tracking.cameraStrafe < 0, 'leftward look moves away from the helmet instead of into it');
  assert.equal(rightTracking.cameraAdvance, 0);
});

test('keeps the close TPS camera to the screen-left of the helmet', () => {
  const camera = getCloseTpsCameraSpec();

  assert.ok(
    camera.behindHelmet > 1.4 && camera.behindHelmet <= 1.7,
    'the terminal frame keeps the close shoulder perspective',
  );
  assert.ok(camera.sideOffset <= -1.5, 'the helmet stays on the left edge so it never blocks the monitor');
  assert.ok(camera.headHeight > 3.4 && camera.headHeight < 3.7);
});

test('uses a rear-biased camera rig while moving', () => {
  const terminalCamera = getCloseTpsCameraSpec();
  const moveCamera = hologramLayout.getMoveTpsCameraSpec();

  assert.ok(
    moveCamera.behindHelmet > terminalCamera.behindHelmet + 1
      && moveCamera.behindHelmet <= 4,
    'the walking view pulls back just enough without making the terminal distant',
  );
  assert.ok(Math.abs(moveCamera.sideOffset) < Math.abs(terminalCamera.sideOffset));
  assert.ok(moveCamera.sideOffset < 0, 'movement keeps the same screen-side relationship as terminal mode');
  assert.ok(moveCamera.headHeight >= 4, 'the rear view crops below the shoulders');
});

test('pulls the camera back only while movement has momentum', () => {
  assert.equal(hologramLayout.getMoveCameraBlend(0), 0);
  assert.equal(hologramLayout.getMoveCameraBlend(0.05), 0.1);
  assert.equal(hologramLayout.getMoveCameraBlend(-1), 0, 'a forward camera lead does not reverse the terminal view');
  assert.equal(hologramLayout.getMoveCameraBlend(1), 1, 'only a camera trailing behind enables the rear rig');
});

test('bobs the head only while the observer is walking', () => {
  const idle = hologramLayout.getWalkHeadMotion(0.2, 0);
  const walking = hologramLayout.getWalkHeadMotion(0.2, 0.5);

  assert.deepEqual(idle, { headOffset: 0, cameraOffset: 0, bodyOffset: 0 });
  assert.notEqual(walking.headOffset, 0);
  assert.ok(Math.abs(walking.headOffset) <= 0.08);
  assert.ok(Math.abs(walking.cameraOffset) < Math.abs(walking.headOffset));
});

test('places the 2D expand control below the right-side terminal menu', () => {
  assert.equal(typeof hologramLayout.getMonitorInteractionControls, 'function');
  const panel = hologramLayout.getHologramPanelLayout();
  const controls = hologramLayout.getMonitorInteractionControls(panel);

  assert.equal(controls.expand2d.action, '2d');
  assert.ok(controls.expand2d.x >= panel.statusLeft);
  assert.ok(controls.expand2d.x + controls.expand2d.width <= panel.statusLeft + panel.statusWidth);
  assert.ok(controls.expand2d.y > 478, 'the expand button follows the status items');
  assert.ok(controls.expand2d.y + controls.expand2d.height < panel.canvasHeight - 55);
});

test('keeps the observation-bay floor to a grid without heavy guide rails', () => {
  const bay = getObservationBaySpec();

  assert.equal(bay.hasFloorRails, false);
  assert.ok(bay.gridDivisions > 0);
});

test('refreshes the terminal once a smooth time movement settles', () => {
  assert.equal(shouldRefreshHologram(99.92, 99.7, 100), true);
  assert.equal(shouldRefreshHologram(99.6, 99.7, 100), false);
  assert.equal(shouldRefreshHologram(102, 99.7, 120), true);
});

test('places pick markers in the same vertical order as timeline lanes', () => {
  assert.ok(getHologramMarkerY(0) < getHologramMarkerY(1));
  assert.ok(getHologramMarkerY(1) < getHologramMarkerY(2));
});

test('mirrors an externally selected event into the 3D terminal only', () => {
  assert.equal(shouldMirrorSelectionToHologram('3d', { id: 'EV1' }), true);
  assert.equal(shouldMirrorSelectionToHologram('move', { id: 'EV1' }), true);
  assert.equal(shouldMirrorSelectionToHologram('2d', { id: 'EV1' }), false);
  assert.equal(shouldMirrorSelectionToHologram('3d', null), false);
});

