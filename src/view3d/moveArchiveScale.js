import * as THREE from 'three';
import { MAX_TIMELINE_SPAN } from '../core/TimelineViewport.js';

/** Preserve a point along the time axis when resize recalibrates the monitor's physical width. */
export function remapArchiveStrafe(value, from, to, worldScale) {
  const oldLeft = -from.panelWidth / 2 + from.timelineLeft / from.canvasWidth * from.panelWidth;
  const oldWidth = from.timelineWidth / from.canvasWidth * from.panelWidth;
  const position = (value / worldScale - oldLeft) / oldWidth;
  return (-to.panelWidth / 2 + (to.timelineLeft + position * to.timelineWidth) / to.canvasWidth * to.panelWidth) * worldScale;
}

function intersectArchiveCenter(camera, surface, depth = 0) {
  camera.updateMatrixWorld();
  surface.updateWorldMatrix(true, false);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal,
    surface.localToWorld(new THREE.Vector3(0, 0, depth)));
  // Avoid unprojecting a near point beside a very distant camera: subtraction loses precision.
  const ray = new THREE.Ray(camera.getWorldPosition(new THREE.Vector3()),
    camera.getWorldDirection(new THREE.Vector3()));
  const hit = ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return null;
  return surface.worldToLocal(hit).x;
}

/** Limit lateral travel by the monitor edges in the neutral, forward-looking view. */
export function getArchiveStrafeBounds(camera, surface, layout) {
  const centerX = intersectArchiveCenter(camera, surface);
  if (centerX === null) return null;
  const scale = surface.getWorldScale(new THREE.Vector3()).x;
  return {
    min: (-layout.panelWidth / 2 - centerX) * scale,
    max: (layout.panelWidth / 2 - centerX) * scale,
  };
}

/** Read the year at the forward sightline on the same plane as the visible time axis. */
export function getArchiveFocusYear(camera, surface, layout, archive) {
  const centerX = intersectArchiveCenter(camera, surface, 0.14);
  if (centerX === null) return null;
  const axisLeft = -layout.panelWidth / 2 + layout.timelineLeft / layout.canvasWidth * layout.panelWidth;
  const axisWidth = layout.timelineWidth / layout.canvasWidth * layout.panelWidth;
  const position = Math.max(0, Math.min(1, (centerX - axisLeft) / axisWidth));
  return archive.minYear + position * archive.spanYears;
}

/** Intersect a horizontal screen band with the archive's time-axis plane. */
export function intersectTimelineBand(camera, surface, layout, { left = 0.13, right = 0.91 } = {}) {
  camera.updateMatrixWorld();
  surface.updateWorldMatrix(true, false);
  const inverse = surface.matrixWorld.clone().invert();
  // Use the nearby point on the axis; after strafing, the original center may be behind the camera.
  const nearbyX = camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).x;
  const center = new THREE.Vector3(nearbyX,
    layout.panelHeight * (0.5 - layout.axisY / layout.canvasHeight), 0.14)
    .applyMatrix4(surface.matrixWorld);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center);
  const screenY = center.clone().project(camera).y;
  const raycaster = new THREE.Raycaster();
  const coordinates = [left, right].map(fraction => {
    raycaster.setFromCamera(new THREE.Vector2(fraction * 2 - 1, screenY), camera);
    const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? hit.applyMatrix4(inverse).x : NaN;
  });
  if (!coordinates.every(Number.isFinite)) return null;
  const leftX = Math.min(...coordinates);
  const rightX = Math.max(...coordinates);
  return { leftX, rightX, span: rightX - leftX };
}

/** Use the closest neutral camera, keeping a 2,000-year reference band across screen sizes. */
export function calibrateMoveTimelineWidth(camera, surface, layout) {
  const band = intersectTimelineBand(camera, surface, layout);
  if (!band || band.span <= 0) return layout.timelineWidth;
  return band.span * MAX_TIMELINE_SPAN / 2000 * layout.canvasWidth / layout.panelWidth;
}

/** Generate ticks only for the part of the enormous archive that is actually on screen. */
export function getVisibleArchiveWindow(camera, surface, layout, archive) {
  const band = intersectTimelineBand(camera, surface, layout, { left: 0, right: 1 });
  if (!band) return archive;
  const axisWidth = layout.timelineWidth / layout.canvasWidth * layout.panelWidth;
  const axisLeft = -layout.panelWidth / 2 + layout.timelineLeft / layout.canvasWidth * layout.panelWidth;
  const yearAt = x => archive.minYear + (x - axisLeft) / axisWidth * archive.spanYears;
  const minYear = Math.max(archive.minYear, yearAt(band.leftX));
  const maxYear = Math.min(archive.maxYear, yearAt(band.rightX));
  if (maxYear <= minYear) return null;
  return { minYear, maxYear, centerYear: (minYear + maxYear) / 2, spanYears: maxYear - minYear };
}
