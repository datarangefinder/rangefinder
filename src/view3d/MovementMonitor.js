import * as THREE from 'three';

const CLIP_PLANES = [
  p => p.w + p.x, p => p.w - p.x,
  p => p.w + p.y, p => p.w - p.y,
  p => p.w + p.z, p => p.w - p.z,
];

function clipPolygon(points) {
  for (const distance of CLIP_PLANES) {
    const next = [];
    if (!points.length) break;
    let previous = points.at(-1);
    let before = distance(previous);
    for (const point of points) {
      const after = distance(point);
      if ((before >= 0) !== (after >= 0)) next.push(previous.clone().lerp(point, before / (before - after)));
      if (after >= 0) next.push(point);
      previous = point;
      before = after;
    }
    points = next;
  }
  return points;
}

function clipLine(start, end) {
  for (const distance of CLIP_PLANES) {
    const a = distance(start), b = distance(end);
    if (a < 0 && b < 0) return [];
    if ((a >= 0) !== (b >= 0)) {
      const hit = start.clone().lerp(end, a / (a - b));
      if (a < 0) start = hit;
      else end = hit;
    }
  }
  return [start, end];
}

function normalized(point) {
  return [point.x, point.y, point.z].map(value => Math.max(-1, Math.min(1, value / point.w)));
}

/** Double-precision CPU clipping keeps huge world coordinates out of the GPU vertex shader. */
export function projectMovementMonitor(camera, surface, layout) {
  camera.updateMatrixWorld();
  surface.updateWorldMatrix(true, false);
  const transform = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .multiply(surface.matrixWorld);
  const point = (x, y, z = 0) => new THREE.Vector4(x, y, z, 1).applyMatrix4(transform);
  const halfW = layout.panelWidth / 2, halfH = layout.panelHeight / 2;
  const corners = [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]];
  const polygon = clipPolygon(corners.map(([x, y]) => point(x, y))).filter(p => p.w > 1e-10);
  const vertices = [];
  for (let i = 1; i + 1 < polygon.length; i++) {
    for (const p of [polygon[0], polygon[i], polygon[i + 1]]) vertices.push(...normalized(p));
  }
  const lines = [];
  const addLine = (a, b) => {
    const clipped = clipLine(a, b);
    if (clipped.every(p => p.w > 1e-10)) for (const p of clipped) lines.push(...normalized(p));
  };
  for (let i = 0; i < corners.length; i++) {
    const [x, y] = corners[i], [nextX, nextY] = corners[(i + 1) % corners.length];
    addLine(point(x, y, 0.02), point(nextX, nextY, 0.02));
  }
  const axisX = x => -halfW + x / layout.canvasWidth * layout.panelWidth;
  const axisY = layout.panelHeight * (0.5 - layout.axisY / layout.canvasHeight);
  addLine(point(axisX(layout.timelineLeft), axisY, 0.14),
    point(axisX(layout.timelineLeft + layout.timelineWidth), axisY, 0.14));
  return { vertices, lines };
}

/** A single opaque, steady monitor face with perspective and normal character occlusion. */
export class MovementMonitor {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    const material = color => new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Vector3(...color) } },
      vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }',
      side: THREE.DoubleSide,
      depthTest: true, depthWrite: true, transparent: false, toneMapped: false,
    });
    const geometry = () => {
      const result = new THREE.BufferGeometry();
      result.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3)
        .setUsage(THREE.DynamicDrawUsage));
      result.setDrawRange(0, 0);
      return result;
    };
    this.face = new THREE.Mesh(geometry(), material([0.012, 0.12, 0.19]));
    this.lines = new THREE.LineSegments(geometry(), material([0.15, 0.75, 0.85]));
    this.lines.material.depthWrite = false;
    this.lines.renderOrder = 1;
    this.face.frustumCulled = false;
    this.lines.frustumCulled = false;
    this.group.add(this.face, this.lines);
    scene.add(this.group);
  }

  setVisible(visible) { this.group.visible = visible; }

  update(camera, surface, layout) {
    const projected = projectMovementMonitor(camera, surface, layout);
    for (const [object, points] of [[this.face, projected.vertices], [this.lines, projected.lines]]) {
      object.geometry.attributes.position.array.set(points);
      object.geometry.attributes.position.needsUpdate = true;
      object.geometry.setDrawRange(0, points.length / 3);
    }
  }

  dispose() {
    for (const object of [this.face, this.lines]) {
      object.geometry.dispose();
      object.material.dispose();
    }
    this.group.removeFromParent();
  }
}
