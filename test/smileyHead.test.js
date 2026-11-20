import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSmileyHead } from '../src/view3d/helmetModels.js';
import { Scene3D } from '../src/view3d/Scene3D.js';
import { getHologramStagePose } from '../src/view3d/holoTimelineLayout.js';

function seesSmile(head, position) {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.copy(position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  head.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(), camera);
  return raycaster.intersectObject(head, true).some(hit => hit.object.name === 'smiley-face');
}

test('puts the smile on the front of the head rather than facing every camera', () => {
  const head = buildSmileyHead(new THREE.Texture());
  assert.equal(seesSmile(head, new THREE.Vector3(0, 0, 3)), true);
  assert.equal(seesSmile(head, new THREE.Vector3(0, 0, -3)), false,
    'a shoulder camera behind the observer sees the back of the head');
});

test('turns the smile with the neck instead of keeping it pointed at the camera', () => {
  const neck = new THREE.Group();
  neck.add(buildSmileyHead(new THREE.Texture()));
  assert.equal(seesSmile(neck, new THREE.Vector3(0, 0, 3)), true);
  neck.rotation.y = Math.PI / 2;
  assert.equal(seesSmile(neck, new THREE.Vector3(0, 0, 3)), false);
  assert.equal(seesSmile(neck, new THREE.Vector3(3, 0, 0)), true);
});

test('shows part of the smaller smiley profile in the shoulder view when looking left', () => {
  const view = {
    camera: new THREE.PerspectiveCamera(55, 1.2, 0.1, 2000),
    camCurrentZ: 0, terminalStageZ: 0, cameraTravel: 0,
    interactionMode: 'timeline', camAngleY: 0.45, camAngleX: 0.15,
  };
  Scene3D.prototype._updateCamera.call(view);
  view.camera.updateMatrixWorld();
  const neck = new THREE.Group();
  // Current observer anchor, with the requested 70% head size in world units.
  neck.position.set(4.6636038969, getHologramStagePose().characterY + 2.02 * 1.55, -11.6363961031);
  neck.scale.setScalar(0.54684);
  neck.rotation.y = view.tpsHeadTracking.headYaw;
  neck.add(buildSmileyHead(new THREE.Texture()));
  neck.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  let profilePixels = 0;
  for (let x = -0.99; x <= -0.5; x += 0.05) {
    for (let y = -0.99; y <= 0.1; y += 0.05) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), view.camera);
      const surface = raycaster.intersectObject(neck, true)
        .find(hit => !hit.object.name.endsWith('-lens'));
      if (surface?.object.name === 'smiley-face' && surface.uv
        && Math.hypot(surface.uv.x - 0.5, surface.uv.y - 0.5) < 0.44) profilePixels++;
    }
  }
  assert.ok(profilePixels > 0, 'the left edge includes a visible cheek/face instead of only the back of the head');
});
