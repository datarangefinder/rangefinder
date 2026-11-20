import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Scene3D } from '../src/view3d/Scene3D.js';
import { buildSmileyHead } from '../src/view3d/helmetModels.js';
import { getHologramStagePose } from '../src/view3d/holoTimelineLayout.js';

function makeView() {
  const view = new Scene3D({}, null);
  view.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  const characterY = getHologramStagePose().characterY;
  view.camera.position.set(0, characterY + 2.02, 3);
  view.camera.lookAt(0, characterY + 2.02, 0);
  view.character = new THREE.Group();
  view.character.position.y = characterY;
  const head = new THREE.Group();
  head.position.y = 2.02;
  head.add(buildSmileyHead(new THREE.Texture()));
  view.character.add(head);
  view.charParts = {
    head,
    lArm: new THREE.Object3D(), rArm: new THREE.Object3D(),
    lLeg: new THREE.Object3D(), rLeg: new THREE.Object3D(),
  };
  view.tpsHeadTracking = { headYaw: 0, headPitch: 0 };
  view.pointerInsideCanvas = true;
  return view;
}

test('hovers the round head, ignoring transparent face corners, dragging and leaving the canvas', () => {
  const view = makeView();
  view._updateHeadHover();
  assert.equal(view.headHovered, true);
  view.charParts.head.rotation.y = 2.5;
  view._updateHeadHover();
  assert.equal(view.headHovered, true, 'turning the head does not cancel the hover');

  view.charParts.head.rotation.y = 0;
  const transparentCorner = new THREE.Vector3(0.54, view.character.position.y + 2.02 + 0.56, 0.008)
    .project(view.camera);
  view.mouse.set(transparentCorner.x, transparentCorner.y);
  view._updateHeadHover();
  assert.equal(view.headHovered, false, 'an invisible corner of the face layer is not a hover target');

  view.mouse.set(0, 0);
  view.isDragging = true;
  view._updateHeadHover();
  assert.equal(view.headHovered, false);
  view.isDragging = false;
  view.pointerInsideCanvas = false;
  view._updateHeadHover();
  assert.equal(view.headHovered, false);
});

test('smoothly turns toward the camera on hover and returns to the timeline after leaving', () => {
  const view = makeView();
  view.camera.position.set(-2, view.character.position.y + 3, -3);
  view.camera.lookAt(0, view.character.position.y + 2.02, 0);
  view.camera.updateMatrixWorld();
  const head = view.charParts.head;
  view._animateCharacter(1 / 60);
  const firstRotation = head.quaternion.angleTo(new THREE.Quaternion());
  assert.ok(firstRotation > 0 && firstRotation < 0.5, 'the turn starts without snapping');

  for (let i = 0; i < 120; i++) view._animateCharacter(1 / 60);
  head.updateWorldMatrix(true, false);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  const towardCamera = view.camera.position.clone().sub(head.getWorldPosition(new THREE.Vector3())).normalize();
  assert.ok(forward.angleTo(towardCamera) < 0.02, 'the smile faces the camera');
  assert.equal(view.headHovered, true);

  view.pointerInsideCanvas = false;
  for (let i = 0; i < 120; i++) view._animateCharacter(1 / 60);
  assert.ok(head.quaternion.angleTo(new THREE.Quaternion()) < 0.02, 'the head looks back at the timeline');
});
