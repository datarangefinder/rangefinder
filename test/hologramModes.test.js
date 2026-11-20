import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Scene3D } from '../src/view3d/Scene3D.js';
import { getHologramPanelLayout } from '../src/view3d/holoTimelineLayout.js';
import { state } from '../src/core/StateManager.js';
import { MAX_TIMELINE_SPAN } from '../src/core/TimelineViewport.js';

function makeView() {
  const view = new Scene3D({}, null);
  const layout = getHologramPanelLayout('timeline');
  view.hologram = new THREE.Group();
  view.holoSurface = new THREE.Group();
  view.holoSurface.position.x = layout.panelOffsetX;
  view.holoPanelLayout = layout;
  view.holoMesh = new THREE.Mesh(new THREE.PlaneGeometry(layout.panelWidth, layout.panelHeight));
  view.holoBackplate = new THREE.Mesh(new THREE.PlaneGeometry());
  view.holoFrame = new THREE.LineSegments(new THREE.BufferGeometry());
  view.holoCanvas = { width: layout.canvasWidth, height: layout.canvasHeight };
  view.holoTexture = new THREE.CanvasTexture(view.holoCanvas);
  view.holoMat = { uniforms: { map: { value: view.holoTexture }, edgeWidthX: { value: 0.025 } } };
  view.renderer = { capabilities: { maxTextureSize: 16384 } };
  view.holoTimelineModel = { rows: [] };
  view._updateVisiblePins = () => {};
  view._renderHologramTimeline = () => {};
  return view;
}

test('keeps the monitor folded for its opening animation without a separate white boot line', t => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0 }) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const view = new Scene3D({}, null);
  view.scene = new THREE.Scene();
  view._buildHologram();
  assert.ok(view.hologram.scale.y < view.hologram.scale.x * 0.02,
    'the short brand splash must not replace the monitor opening animation');
  assert.equal(view.holoSurface.children.some(child => child.isLine && !child.isLineSegments), false,
    'the brand title replaces the separate white line');
  assert.equal(view.holoMesh.geometry.parameters.height, getHologramPanelLayout().panelHeight);
});

test('starts movement with the enlarged terminal surface, expands on travel and restores it on reentry', () => {
  const view = makeView();
  const terminal = getHologramPanelLayout('timeline');
  const expanded = getHologramPanelLayout('move');
  assert.ok(terminal.panelHeight > 7.2, 'the terminal reaches farther above and below its old frame');
  view.observerTravel = -20;
  view.cameraTravel = -19;
  view.observerTravelTarget = -20;
  view.observerStrafe = 10;
  view.observerStrafeTarget = 12;
  view.setInteractionMode('move');
  assert.deepEqual(view.holoPanelLayout, terminal, 'entering movement keeps the terminal size and anchor');
  assert.equal(view.observerTravel, 0);
  assert.equal(view.cameraTravel, 0);
  assert.equal(view.observerTravelTarget, 0);
  assert.equal(view.observerStrafe, 0);
  assert.equal(view.observerStrafeTarget, 0);

  view._handleWheel({ deltaY: 120, preventDefault() {} });
  assert.deepEqual(view.holoPanelLayout, terminal, 'the first wheel input does not jump to the wide surface');
  view._updateHologramExpansion(0.1);
  assert.ok(view.holoPanelLayout.panelWidth > terminal.panelWidth);
  assert.ok(view.holoPanelLayout.panelWidth < expanded.panelWidth, 'intermediate frames have intermediate widths');
  const expansionGeometry = view.holoMesh.geometry;
  const expansionTexture = view.holoTexture;
  let previousWidth = view.holoPanelLayout.panelWidth;
  for (let frame = 0; frame < 120; frame++) {
    view._updateHologramExpansion(1 / 60);
    const width = view.holoPanelLayout.panelWidth;
    assert.ok(width >= previousWidth && width - previousWidth < expanded.panelWidth / 25, 'the frame widens continuously');
    assert.equal(view.holoMesh.geometry, expansionGeometry, 'animation reuses geometry instead of rebuilding it every frame');
    assert.equal(view.holoTexture, expansionTexture, 'animation reuses its texture allocation');
    assert.ok(Math.abs(view.holoPanelLayout.canvasWidth / width
      - terminal.canvasWidth / terminal.panelWidth) < 1e-8, 'text keeps the same logical pixel density while expanding');
    const drawnWidth = view.holoMesh.geometry.parameters.width * view.holoMesh.scale.x;
    assert.ok(Math.abs(drawnWidth - width) < 1e-8, 'the visible edge follows the animated layout');
    previousWidth = width;
  }
  assert.equal(view.holoPanelLayout.panelWidth, expanded.panelWidth, 'travel finishes at the wider monitor size');
  assert.ok(view.holoPanelLayout.panelWidth > 520, 'movement has twice the previous time-axis length');
  assert.ok(view.holoCanvas.width <= view.renderer.capabilities.maxTextureSize, 'the wider canvas respects the GPU texture limit');
  assert.equal(view.holoMesh.geometry.parameters.height, terminal.panelHeight, 'expanding the width keeps the taller frame');
  assert.ok(view.observerTravelTarget < 0);
  const expandedGeometry = view.holoMesh.geometry;
  view._handleWheel({ deltaY: 120, preventDefault() {} });
  assert.equal(view.holoMesh.geometry, expandedGeometry, 'subsequent travel does not rebuild the surface');

  view.setInteractionMode('timeline');
  assert.deepEqual(view.holoPanelLayout, terminal);
  assert.equal(view.holoMesh.geometry.parameters.height, terminal.panelHeight);
  view.setInteractionMode('move');
  assert.deepEqual(view.holoPanelLayout, terminal, 'movement starts at terminal size again');
  view._handleWheel({ deltaY: 120, preventDefault() {} });
  view._updateHologramExpansion(0.2);
  view.setInteractionMode('timeline');
  view._updateHologramExpansion(0.5);
  assert.deepEqual(view.holoPanelLayout, terminal, 'leaving movement cancels an unfinished expansion');
  view.setInteractionMode('move');
  assert.deepEqual(view.holoPanelLayout, terminal, 'reentering movement from 2D also restores the initial surface');
});

test('restores the terminal neck range after an extended right glance in movement', () => {
  const view = makeView();
  view.setInteractionMode('move');
  view.camAngleY = -0.52 - Math.PI / 6;
  view.setInteractionMode('timeline');
  assert.equal(view.camAngleY, -0.52);
  assert.equal(view.camAngleX, 0.15);
});

test('flat movement keeps the huge timeline logical and reuses the terminal GPU resources', () => {
  const view = makeView();
  view.moveMonitor = { setVisible() {} };
  view.interactionMode = 'move';
  const geometry = view.holoMesh.geometry;
  const texture = view.holoTexture;
  const storage = view.holoPanelLayout;
  view._setHologramLayout('move', 1);
  assert.equal(view.holoMesh.geometry, geometry, 'the huge movement surface is not allocated as an overlapping 3D plane');
  assert.equal(view.holoTexture, texture);
  assert.ok(view.holoPanelLayout.panelWidth > 500, 'physical time scale remains expanded');
  assert.equal(view.holoCanvas.width, storage.canvasWidth);
});

test('keeps the selected period on mode entry and opens all history on the first forward or backward movement', () => {
  const previous = state.state;
  try {
    for (const deltaY of [-120, 120]) {
      const view = makeView();
      state.setTimelineSpan(100);
      view.setInteractionMode('move');
      assert.equal(state.state.timelineSpanYears, 100, 'entering movement retains the terminal period');
      view._handleWheel({ deltaY: 0, preventDefault() {} });
      assert.equal(state.state.timelineSpanYears, 100, 'zero movement does not open all history');
      view._handleWheel({ deltaY, preventDefault() {} });
      assert.equal(state.state.timelineSpanYears, MAX_TIMELINE_SPAN, 'actual travel immediately opens all history');
      assert.ok(Math.sign(view.observerTravelTarget) === -Math.sign(deltaY));
    }
    const terminal = makeView();
    state.setTimelineSpan(100);
    terminal._handleWheel({ deltaY: 120, preventDefault() {} });
    assert.equal(state.state.timelineSpanYears, 100, 'terminal time scrolling keeps its period');
  } finally {
    state.update({ currentYear: previous.currentYear, timelineSpanYears: previous.timelineSpanYears });
  }
});

test('routes Shift plus wheel to fast physical movement without zooming the movement archive', () => {
  const previous = state.state.timelineSpanYears;
  try {
    const normal = makeView();
    normal.setInteractionMode('move');
    normal._handleWheel({ deltaY: 120, shiftKey: false, preventDefault() {} });
    const fast = makeView();
    fast.setInteractionMode('move');
    fast._handleWheel({ deltaY: 120, shiftKey: true, preventDefault() {} });
    assert.ok(Math.abs(fast.observerTravelTarget / normal.observerTravelTarget - 100) < 1e-10);
    const horizontal = makeView();
    horizontal.setInteractionMode('move');
    horizontal._handleWheel({ deltaY: 0, deltaX: 120, shiftKey: true, preventDefault() {} });
    assert.equal(horizontal.observerTravelTarget, fast.observerTravelTarget,
      'Shift wheel also works when the browser reports it as horizontal scrolling');
    assert.equal(state.state.timelineSpanYears, MAX_TIMELINE_SPAN);
  } finally {
    state.setTimelineSpan(previous);
  }
});
