import * as THREE from 'three';
import { getHelmetAssemblySpec } from './holoTimelineLayout.js';

// Helmet assemblies are retained for source-level rollback. The live scene
// currently uses the rotating 3D smiley head below.
export function buildClassicHelmet() {
  const group = new THREE.Group();
  group.name = 'helmet-classic';
  const spec = getHelmetAssemblySpec();
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x16283a, metalness: 0.9, roughness: 0.55,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x66859a, metalness: 0.95, roughness: 0.5,
  });
  const visorMaterial = new THREE.MeshStandardMaterial({
    color: 0x061923, emissive: 0x002838, emissiveIntensity: 0.2,
    metalness: 0.7, roughness: 0.08, transparent: true, opacity: 0.94,
  });

  const shell = new THREE.Mesh(new THREE.SphereGeometry(
    spec.shell.radius, spec.shell.widthSegments, spec.shell.heightSegments,
  ), shellMaterial);
  shell.scale.set(0.92, 1.03, 0.98);
  group.add(shell);

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16), visorMaterial);
  visor.scale.set(spec.visor.scaleX, spec.visor.scaleY, spec.visor.scaleZ);
  visor.position.z = spec.visor.offsetZ;
  group.add(visor);

  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 24), trimMaterial);
  frame.scale.y = 0.82;
  frame.position.z = spec.visor.offsetZ + 0.16;
  group.add(frame);

  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), shellMaterial);
  chin.scale.set(0.94, 0.5, 0.55);
  chin.position.set(0, -0.4, 0.32);
  group.add(chin);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(
    spec.collar.radius, spec.collar.tube, 8, 24,
  ), trimMaterial);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.48;
  group.add(collar);

  for (const side of [-1, 1]) {
    const module = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.2, 12), trimMaterial);
    module.rotation.z = Math.PI / 2;
    module.position.set(side * 0.54, -0.03, -0.04);
    group.add(module);
  }
  return group;
}

function surfacePoint(azimuth, y, offset = 0) {
  const radius = Math.sqrt(Math.max(0, 1 - (y / 0.65) ** 2));
  return new THREE.Vector3(
    (0.572 + offset) * radius * Math.sin(azimuth),
    y,
    (0.665 + offset) * radius * Math.cos(azimuth),
  );
}

/** A curved patch follows the shell instead of floating in front of it. */
function surfacePatch(pointAt, columns = 48, rows = 16) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const v = row / rows;
      const point = pointAt(u, v);
      positions.push(point.x, point.y, point.z);
      uvs.push(u, v);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        const b = a + 1;
        const d = a + columns + 1;
        indices.push(a, b, d, b, d + 1, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedPlate(width, height, depth, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.008,
    bevelSize: 0.008, bevelSegments: 2, steps: 1, curveSegments: 6,
  });
}

/** Rounded shell, wraparound face shield and square ear housings from the sketch. */
export function buildReferenceHelmet() {
  const group = new THREE.Group();
  group.name = 'helmet-reference';
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x59636e, metalness: 0.38, roughness: 0.48,
  });
  const rubberMaterial = new THREE.MeshStandardMaterial({
    color: 0x080e15, metalness: 0.05, roughness: 0.8,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d8b96, metalness: 0.65, roughness: 0.36,
  });
  const visorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x9cd7e8, emissive: 0xb6eaff, emissiveIntensity: 0.85,
    metalness: 0.25, roughness: 0.15,
    clearcoat: 1, clearcoatRoughness: 0.08,
  });

  const shellGeometry = new THREE.SphereGeometry(1, 64, 40);
  const vertices = shellGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    vertices.setXYZ(i,
      vertices.getX(i) * 0.57,
      Math.max(-0.51, Math.min(0.60, vertices.getY(i) * 0.65)),
      vertices.getZ(i) * 0.665,
    );
  }
  shellGeometry.computeVertexNormals();
  group.add(new THREE.Mesh(shellGeometry, shellMaterial));

  // Narrow the face end vertically while keeping the ear-side attachment intact.
  const visorPoint = (u, v, offset = 0.015) => {
    const azimuth = (u - 0.5) * 3.05;
    const side = Math.abs(azimuth) / 1.525;
    const frontInset = 0.10 * (1 - side);
    const bottom = -0.40 + 0.32 * side ** 1.5 + frontInset;
    const top = 0.26 - 0.06 * side - frontInset;
    return surfacePoint(azimuth, bottom + (top - bottom) * v, offset);
  };
  const visor = new THREE.Mesh(surfacePatch(visorPoint), visorMaterial);
  visor.name = 'wraparound-visor';
  group.add(visor);

  const border = [];
  for (let i = 0; i <= 48; i++) border.push(visorPoint(i / 48, 0));
  for (let i = 1; i <= 12; i++) border.push(visorPoint(1, i / 12));
  for (let i = 47; i >= 0; i--) border.push(visorPoint(i / 48, 1));
  for (let i = 11; i > 0; i--) border.push(visorPoint(0, i / 12));
  const seal = new THREE.Mesh(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(border, true), 160, 0.018, 6, true,
  ), rubberMaterial);
  group.add(seal);

  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.54, -0.025, -0.11);
    ear.rotation.y = side * Math.PI / 2;
    ear.add(new THREE.Mesh(roundedPlate(0.25, 0.25, 0.045, 0.055), trimMaterial));
    group.add(ear);

    // Small unlit fastening tabs at the rear corners.
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.18, 0.09), trimMaterial);
    latch.position.set(side * 0.43, -0.035, -0.45);
    latch.rotation.y = side * -0.35;
    group.add(latch);
  }

  const neckSeal = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.39, 0.12, 48), rubberMaterial);
  neckSeal.position.y = -0.51;
  group.add(neckSeal);

  // Non-emissive lettering follows the rear shell; no rear light or headlamp.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d6dde1';
  ctx.font = '500 116px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('D R F', 256, 96);
  const markingTexture = new THREE.CanvasTexture(canvas);
  markingTexture.colorSpace = THREE.SRGBColorSpace;
  const marking = new THREE.Mesh(surfacePatch((u, v) => (
    surfacePoint(Math.PI + (u - 0.5) * 1.25, -0.075 + v * 0.27, 0.004)
  ), 32, 8), new THREE.MeshStandardMaterial({
    map: markingTexture, transparent: true, depthWrite: false,
    roughness: 0.65, metalness: 0, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  group.add(marking);
  return group;
}

function createSmileyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  // Only facial features go on this transparent layer. The sphere owns the
  // yellow skin, so there is no colored disc ending partway around the head.
  for (const x of [128, 384]) {
    ctx.save();
    ctx.translate(x, 288);
    ctx.scale(1, 0.62);
    const blush = ctx.createRadialGradient(0, 0, 4, 0, 0, 45);
    blush.addColorStop(0, 'rgba(249, 128, 98, 0.8)');
    blush.addColorStop(0.6, 'rgba(249, 139, 105, 0.55)');
    blush.addColorStop(1, 'rgba(249, 139, 105, 0)');
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = '#61401d';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  for (const x of [176, 336]) {
    ctx.beginPath();
    ctx.moveTo(x - 27, 221);
    ctx.quadraticCurveTo(x, 172, x + 27, 221);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(177, 307);
  ctx.quadraticCurveTo(256, 344, 335, 307);
  ctx.quadraticCurveTo(256, 402, 177, 307);
  ctx.closePath();
  ctx.fillStyle = '#70451e';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The smile faces local +Z, so neck rotation keeps it looking toward the archive. */
export function buildSmileyHead(texture = createSmileyTexture()) {
  const group = new THREE.Group();
  group.name = 'head-smiley';
  const shellGeometry = new THREE.SphereGeometry(0.6, 48, 32);
  const positions = shellGeometry.attributes.position;
  const colors = [];
  const lightDirection = new THREE.Vector3(-0.35, 0.8, 0.5).normalize();
  const warmYellow = new THREE.Color(0xf1ad27);
  const paleYellow = new THREE.Color(0xffee83);
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).normalize();
    const blend = (point.dot(lightDirection) + 1) / 2;
    const smoothBlend = blend * blend * (3 - 2 * blend);
    color.lerpColors(warmYellow, paleYellow, smoothBlend);
    colors.push(color.r, color.g, color.b);
  }
  shellGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // One continuous, softly shaded surface stays legible in the dark scene.
  const shell = new THREE.Mesh(shellGeometry, new THREE.MeshBasicMaterial({
    vertexColors: true, toneMapped: false,
  }));
  shell.name = 'smiley-shell';
  group.add(shell);

  const faceGeometry = surfacePatch((u, v) => {
    const x = (u - 0.5) * 1.12;
    const y = (v - 0.5) * 1.12;
    return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, 0.36 - x * x - y * y)) + 0.008);
  }, 48, 32);
  const face = new THREE.Mesh(faceGeometry, new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    toneMapped: false,
  }));
  face.name = 'smiley-face';
  group.add(face);
  group.add(buildSmileyGlasses());
  return group;
}

function buildSmileyGlasses() {
  const group = new THREE.Group();
  group.name = 'smiley-glasses';
  const frameMaterial = new THREE.MeshBasicMaterial({ color: 0x20232a, toneMapped: false });
  const lensMaterial = new THREE.MeshBasicMaterial({
    color: 0xcceeff, transparent: true, opacity: 0.07, depthWrite: false, toneMapped: false,
  });
  // Keep the round lenses on a plane in front of the face, like real glasses.
  const frontPoint = (x, y) => new THREE.Vector3(x, y, 0.74);
  const addFrame = (name, points, closed = false, thickness = 0.014) => {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points, closed), closed ? 64 : 40, thickness, 8, closed,
    ), frameMaterial);
    mesh.name = name;
    group.add(mesh);
  };

  for (const side of [-1, 1]) {
    const centerX = side * 0.175;
    const rim = Array.from({ length: 64 }, (_, i) => {
      const angle = i / 64 * Math.PI * 2;
      return frontPoint(centerX + Math.cos(angle) * 0.145, 0.105 + Math.sin(angle) * 0.125);
    });
    addFrame(side < 0 ? 'glasses-left-rim' : 'glasses-right-rim', rim, true);

    const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 48), lensMaterial);
    lens.scale.set(0.14, 0.12, 1);
    lens.position.set(centerX, 0.105, 0.735);
    lens.name = side < 0 ? 'glasses-left-lens' : 'glasses-right-lens';
    group.add(lens);

    addFrame(side < 0 ? 'glasses-left-temple' : 'glasses-right-temple', [
      frontPoint(side * 0.32, 0.105),
      new THREE.Vector3(side * 0.49, 0.10, 0.65),
      new THREE.Vector3(side * 0.61, 0.07, 0.35),
      new THREE.Vector3(side * 0.605, 0.02, -0.10),
      new THREE.Vector3(side * 0.575, -0.045, -0.24),
    ], false, 0.012);
  }
  addFrame('glasses-bridge', [
    frontPoint(-0.03, 0.105), frontPoint(0, 0.145), frontPoint(0.03, 0.105),
  ], false, 0.012);
  return group;
}
