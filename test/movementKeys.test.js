import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene3D } from '../src/view3d/Scene3D.js';
import * as THREE from 'three';
import { state } from '../src/core/StateManager.js';
import { getCloseTpsCameraSpec, getHologramStagePose } from '../src/view3d/holoTimelineLayout.js';
import { buildSmileyHead } from '../src/view3d/helmetModels.js';

function makeKeyboardScene(t) {
  const windowHandlers = new Map();
  const documentHandlers = new Map();
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousState = state.state;
  globalThis.window = { addEventListener: (type, handler) => windowHandlers.set(type, handler) };
  globalThis.document = { addEventListener: (type, handler) => documentHandlers.set(type, handler), activeElement: null };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    state.update(previousState);
  });
  const view = new Scene3D({ addEventListener() {} }, null);
  view._running = true;
  view.interactionMode = 'move';
  view.moveTravelMin = -1e12;
  view._bindEvents();
  const key = (type, name, extra = {}) => {
    let prevented = false;
    const handler = windowHandlers.get(type);
    assert.equal(typeof handler, 'function', `${type} is bound`);
    handler({ key: name, shiftKey: false, target: {}, preventDefault() { prevented = true; }, ...extra });
    return prevented;
  };
  const tick = (frames = 1) => { for (let i = 0; i < frames; i++) view._updateKeyboardMovement(1 / 60); };
  return { view, key, tick, windowHandlers, documentHandlers };
}

test('holding up/down moves and repeats, releasing stops, and opposing arrows cancel', t => {
  const { view, key, tick } = makeKeyboardScene(t);
  assert.equal(key('keydown', 'ArrowDown'), true);
  assert.ok(view.observerTravelTarget < 0, 'a quick key tap works even before the next animation frame');
  tick();
  const first = view.observerTravelTarget;
  assert.ok(first < 0);
  tick(30);
  assert.ok(view.observerTravelTarget < first);
  key('keydown', 'ArrowUp');
  const both = view.observerTravelTarget;
  tick(30);
  assert.equal(view.observerTravelTarget, both);
  key('keyup', 'ArrowDown');
  tick();
  assert.ok(view.observerTravelTarget > both);
  key('keyup', 'ArrowUp');
  const stopped = view.observerTravelTarget;
  tick(30);
  assert.equal(view.observerTravelTarget, stopped);
  key('keydown', 'ArrowDown');
  key('keyup', 'ArrowDown');
  const firstTap = view.observerTravelTarget;
  key('keydown', 'ArrowDown');
  key('keyup', 'ArrowDown');
  assert.ok(view.observerTravelTarget < firstTap, 'consecutive quick taps are not lost');
});

test('left/right strafe while preserving the view direction, and Shift arrows use fast travel', t => {
  const { view, key, tick } = makeKeyboardScene(t);
  const initialLook = { yaw: view.camAngleY, pitch: view.camAngleX };
  key('keydown', 'ArrowLeft');
  assert.ok(view.observerStrafeTarget < 0, 'a short left tap moves sideways immediately');
  tick(120);
  const left = view.observerStrafeTarget;
  assert.ok(left < -1.44, 'holding left continues moving sideways');
  assert.deepEqual({ yaw: view.camAngleY, pitch: view.camAngleX }, initialLook);
  key('keyup', 'ArrowLeft');
  key('keydown', 'ArrowRight');
  tick(120);
  assert.ok(Math.abs(view.observerStrafeTarget) < 1e-8, 'equal left/right input returns to the same position');
  assert.deepEqual({ yaw: view.camAngleY, pitch: view.camAngleX }, initialLook);
  key('keyup', 'ArrowRight');
  const stopped = view.observerStrafeTarget;
  tick(60);
  assert.equal(view.observerStrafeTarget, stopped);
  key('keydown', 'ArrowRight', { shiftKey: true });
  assert.ok(Math.abs(view.observerStrafeTarget - 144) < 1e-8, 'Shift accelerates lateral movement too');
  key('keyup', 'ArrowRight');
  view.observerTravelTarget = 0;
  key('keydown', 'ArrowDown', { shiftKey: true });
  tick();
  assert.equal(view.observerTravelTarget, -144);
});

test('the person and camera translate together along the monitor without turning toward its center', () => {
  const view = new Scene3D({}, null);
  view.interactionMode = 'move';
  view.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);
  view.character = new THREE.Group();
  view.characterBaseX = 4.6636;
  view.characterZOffset = -11.6364;
  view._updateCharacterPosition(0);
  view._updateCamera();
  const beforeCamera = view.camera.position.clone();
  const relativePosition = view.camera.position.clone().sub(view.character.position);
  const beforeRotation = view.camera.quaternion.clone();
  view.observerStrafe = 10;
  view._updateCharacterPosition(0);
  view._updateCamera();
  assert.ok(view.camera.position.clone().sub(view.character.position).distanceTo(relativePosition) < 1e-10);
  assert.ok(view.camera.quaternion.angleTo(beforeRotation) < 1e-7, 'strafe preserves camera heading');
  const movement = view.camera.position.clone().sub(beforeCamera);
  assert.ok(Math.abs(movement.length() - 10) < 1e-10);
  assert.ok(Math.abs(movement.dot(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0),
    getHologramStagePose().panelRotationY))) < 1e-10, 'strafe stays parallel to the archive');
});

test('the person and shoulder camera retain their height relative to the raised monitor while moving', () => {
  const pose = getHologramStagePose();
  const monitorLift = pose.panelY - 3;
  const view = new Scene3D({}, null);
  view.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);
  view.character = new THREE.Group();
  view.character.scale.setScalar(1.55);
  view.charParts = Object.fromEntries(['head', 'lArm', 'rArm', 'lLeg', 'rLeg']
    .map(name => [name, new THREE.Object3D()]));
  view.character.add(view.charParts.head);

  for (const mode of ['timeline', 'move']) {
    view.interactionMode = mode;
    for (const travel of [0, -300, 7]) {
      view.observerTravel = view.cameraTravel = travel;
      for (const bodyOffset of [0, 0.04, 0]) {
        view.walkHeadMotion = { bodyOffset, headOffset: 0, cameraOffset: 0.01 };
        view._updateCamera();
        view._animateCharacter();
        assert.ok(Math.abs(view.character.position.y - (-2 + monitorLift + bodyOffset)) < 1e-10,
          'the person rises by exactly the monitor lift, including after walking');
        assert.ok(Math.abs(view.camera.position.y - view.character.position.y
          - getCloseTpsCameraSpec().headHeight - 0.01) < 1e-10,
        'the shoulder camera keeps the same height relative to the person');
      }
    }
  }
});

test('typing, focus loss, stopping, and leaving movement mode never leave a key held', t => {
  const { view, key, tick, windowHandlers, documentHandlers } = makeKeyboardScene(t);
  assert.equal(key('keydown', 'ArrowDown', { target: { tagName: 'INPUT' } }), false);
  tick();
  assert.equal(view.observerTravelTarget, 0);
  key('keydown', 'ArrowDown');
  tick();
  windowHandlers.get('blur')();
  const blurred = view.observerTravelTarget;
  tick(30);
  assert.equal(view.observerTravelTarget, blurred);
  key('keydown', 'ArrowDown');
  tick();
  documentHandlers.get('focusin')({ target: { tagName: 'TEXTAREA' } });
  const focused = view.observerTravelTarget;
  tick(30);
  assert.equal(view.observerTravelTarget, focused);
  key('keydown', 'ArrowDown');
  const beforeStop = view.observerTravelTarget;
  view.stop();
  view._running = true;
  tick(30);
  assert.equal(view.observerTravelTarget, beforeStop);
  view.interactionMode = 'timeline';
  assert.equal(key('keydown', 'ArrowDown'), false);
  tick(30);
  assert.equal(view.observerTravelTarget, beforeStop);
});

test('holding Shift flashes the smiley in both 3D modes and release or focus loss restores yellow', t => {
  const { view, key, windowHandlers, documentHandlers } = makeKeyboardScene(t);
  view.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);
  view.character = new THREE.Group();
  view.charParts = Object.fromEntries(['head', 'lArm', 'rArm', 'lLeg', 'rLeg']
    .map(name => [name, new THREE.Object3D()]));
  view.charParts.head.add(buildSmileyHead(new THREE.Texture()));
  view.character.add(view.charParts.head);
  const shell = view.charParts.head.getObjectByName('smiley-shell');
  const glasses = view.charParts.head.getObjectByName('glasses-left-rim');
  const normalShellColor = shell.material.color.clone();
  const normalGlassesColor = glasses.material.color.clone();
  const animate = () => {
    view._updateKeyboardMovement(1 / 60);
    view._updateCamera();
    view._animateCharacter(1 / 60);
  };
  for (const mode of ['timeline', 'move']) {
    view.interactionMode = mode;
    key('keydown', 'Shift', { shiftKey: true });
    for (let i = 0; i < 15; i++) animate();
    assert.ok(shell.material.color.g < 0.5 && shell.material.color.r >= 0.9,
      'the yellow shell changes to a warm red/orange');
    for (let i = 0; i < 15; i++) animate();
    assert.ok(shell.material.color.g > 0.99 && shell.material.color.b > 0.99,
      'the flash cycles back to yellow while Shift remains held');
    assert.ok(glasses.material.color.equals(normalGlassesColor), 'the glasses keep their dark frames');
    key('keyup', 'Shift');
    animate();
    assert.ok(shell.material.color.equals(normalShellColor));
  }
  for (const cancel of [
    () => windowHandlers.get('blur')(),
    () => documentHandlers.get('focusin')({ target: { tagName: 'INPUT' } }),
    () => view.stop(),
  ]) {
    view._running = true;
    key('keydown', 'Shift', { shiftKey: true });
    for (let i = 0; i < 15; i++) animate();
    cancel();
    animate();
    assert.ok(shell.material.color.equals(normalShellColor), 'flashing never stays stuck after leaving the view');
  }
});
