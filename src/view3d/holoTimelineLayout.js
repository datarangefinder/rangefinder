import { timelineYearPosition } from '../core/TimelineViewport.js';

/**
 * Build a compact, deterministic event layout for the in-world hologram.
 * The scene consumes screen-neutral positions so the same model can drive
 * both the canvas texture and the pickable 3D markers.
 */
export function buildHologramTimelineModel(events, focusZ, options = {}) {
  const viewport = options.viewport;
  const range = Math.max(1, options.range ?? 120);
  const maxEvents = Math.max(1, options.maxEvents ?? 36);
  const laneCount = Math.max(1, options.laneCount ?? 3);
  const minZ = focusZ - range;
  const maxZ = focusZ + range;

  const visibleEvents = events
    .filter(event => viewport
      ? Number.isFinite(event?.year) && event.year >= viewport.minYear && event.year <= viewport.maxYear
      : Number.isFinite(event?._z) && event._z >= minZ && event._z <= maxZ)
    .sort((a, b) => (
      (viewport ? a.year - b.year : a._z - b._z)
      || b.importance - a.importance
      || String(a.id).localeCompare(String(b.id))
    ))
    .slice(0, maxEvents);

  const eventCountsAtZ = new Map();
  const rows = visibleEvents.map((event) => {
    const coordinate = viewport ? event.year : event._z;
    const occupiedLanes = eventCountsAtZ.get(coordinate) ?? 0;
    eventCountsAtZ.set(coordinate, occupiedLanes + 1);

    return {
      event,
      position: viewport ? timelineYearPosition(event.year, viewport) : (event._z - minZ) / (maxZ - minZ),
      lane: occupiedLanes % laneCount,
      isSelected: event.id === options.selectedEventId,
    };
  });

  return {
    range: { minZ, maxZ, focusZ, span: maxZ - minZ, viewport },
    rows,
  };
}

/**
 * A Three.js plane faces +Z by default. The observer is behind the projected
 * timeline (negative Z), so rotate its readable face back toward the camera.
 */
export function getHologramStagePose() {
  const panelScale = 2.4;
  const frameHeight = getHologramPanelLayout().panelHeight + 0.15;
  const panelY = getObservationBaySpec().floorY + 0.3 + frameHeight * panelScale / 2;
  return {
    cameraDistance: 15.5,
    characterX: 5.3,
    // Raise the observer and shoulder camera with the monitor to preserve their framing.
    characterY: -2 + (panelY - 3),
    characterZOffset: -11.0,
    panelX: -2.2,
    panelY,
    panelZOffset: 14.0,
    panelScale,
    panelRotationY: Math.PI - 0.23,
    terminalViewYawBias: 0.1,
  };
}

/** Terminal mode holds its physical stage in place while its archive time changes. */
export function getTerminalStageZ(mode, timelineZ, fixedTerminalZ) {
  return mode === 'timeline' ? fixedTerminalZ : timelineZ;
}

/** Returning to the terminal always clears any residual walking offset. */
export function getTerminalTravelState() {
  return {
    observerTravel: 0,
    cameraTravel: 0,
    observerTravelTarget: 0,
    observerStrafe: 0,
    observerStrafeTarget: 0,
  };
}

/** Preserve the terminal framing when entering movement, then ease into the travel rig. */
export function getModeViewYawBias(mode, terminalViewYawBias, moveCameraBlend = 0) {
  const blend = Math.max(0, Math.min(1, moveCameraBlend));
  if (mode === 'timeline') return terminalViewYawBias;
  if (mode === 'move') return terminalViewYawBias * (1 - blend);
  return 0;
}

/** A near-FPS third-person rig that sits beside the helmet, not behind the torso. */
export function getCloseTpsCameraSpec() {
  return {
    // Lifted over the shoulder line: close to the helmet, but with the torso
    // below the camera's frame instead of occupying the lower left corner.
    sideOffset: -1.55,
    behindHelmet: 1.55,
    headHeight: 3.55,
    pitchLift: 0.45,
  };
}

/** Movement keeps the observer mostly behind the helmet instead of at its side. */
export function getMoveTpsCameraSpec() {
  return {
    sideOffset: -0.45,
    behindHelmet: 3.6,
    headHeight: 4.1,
    pitchLift: 0.34,
  };
}

/** Grow the monitor directly after the brand splash, keeping the original expansion duration. */
export function getHologramOpeningProgress(elapsed, delay = 0, duration = 0.95) {
  if (elapsed <= delay) return 0;
  const progress = Math.min(1, (elapsed - delay) / duration);
  return 1 - (1 - progress) ** 3;
}

/** Keep controls and the room behind the original monitor opening sequence. */
export function getHologramBootPresentation(openProgress) {
  const progress = Math.max(0, Math.min(1, openProgress));
  return {
    showTerminal: progress > 0,
    showEnvironment: progress > 0,
    showHud: progress >= 0.86,
  };
}

export function getHologramIlluminationProgress(openProgress) {
  const progress = Math.max(0, Math.min(1, openProgress));
  return progress * progress * (3 - 2 * progress);
}

export function getCharacterRimLightProgress(elapsed, delay = 2.1, duration = 0.6) {
  if (elapsed <= delay) return 0;
  const progress = Math.min(1, (elapsed - delay) / duration);
  return progress * progress * (3 - 2 * progress);
}

/** A calm, global luminance pulse that never shifts the terminal geometry. */
export function getHologramBrightnessPulse(elapsed) {
  return 0.94 + 0.06 * ((Math.sin(elapsed * 1.6) + 1) / 2);
}

/** Optical balance for a readable, emissive terminal that remains holographic. */
export function getHologramPanelOptics() {
  return {
    backplateOpacity: 1,
    canvasOpacity: 0.99,
    hasOuterProjection: false,
  };
}

/** A cinematic wide terminal with a compact status column on its right edge. */
export function getHologramPanelLayout(mode = 'timeline', expansionProgress = 1, moveTimelineWidth = 55_960) {
  const expansion = mode === 'move' ? Math.max(0, Math.min(1, expansionProgress)) : 0;
  // Only the time axis grows; the margins and observation log keep their normal size.
  const expandedTimelineWidth = moveTimelineWidth;
  const expandedCanvasWidth = expandedTimelineWidth + (1440 - 1030);
  const canvasWidth = 1792 + (expandedCanvasWidth - 1792) * expansion;
  const terminalPanelWidth = 13.6 * (1792 / 1440);
  const panelWidth = 13.6 * (canvasWidth / 1440);
  const addedWidth = canvasWidth - 1440;
  const addedHeight = 256;
  return {
    canvasWidth,
    canvasHeight: 640 + addedHeight,
    panelWidth,
    // Preserve the terminal anchor at the start and ease toward the wide archive's center.
    panelOffsetX: expansion === 1 ? 0 : -(terminalPanelWidth - 13.6) / 2 * (1 - expansion),
    panelHeight: 6.0 * (1 + addedHeight / 640),
    timelineLeft: 70,
    timelineWidth: 1030 + addedWidth,
    statusLeft: 1180 + addedWidth,
    statusWidth: 180,
    dividerX: 1140 + addedWidth,
    gridTop: 80,
    gridBottom: 550 + addedHeight,
    axisY: 365 + addedHeight / 2,
  };
}

/** Normal observation steers time; observer movement steers only camera distance. */
export function getWheelInteraction(mode) {
  return mode === 'move' ? 'travel' : 'timeline';
}

/** Allow enough retreat to view the wide monitor from a distance. */
export function adjustObserverTravel(currentTravel, deltaY, { fast = false, minTravel = -300 } = {}) {
  if (!Number.isFinite(deltaY)) return currentTravel;
  const distance = Math.max(0, 7 - currentTravel);
  const step = Math.abs(deltaY) * 0.012 * (fast ? 100 : 1);
  // Preserve backward motion and use its exact inverse when approaching.
  // Subtracting a distance-scaled step could otherwise cross the whole gap at once.
  const nextDistance = deltaY >= 0
    ? distance + step * Math.max(1, distance / 40)
    : distance <= 40 + step ? Math.max(0, distance - step) : distance / (1 + step / 40);
  return Math.max(minTravel, Math.min(7, 7 - nextDistance));
}

/** Forward and backward travel share the same fixed shoulder-camera distance. */
export function getObserverFollowStep(observerTravel, _cameraTravel, targetTravel, dt) {
  const safeDt = Math.max(0, dt);
  const observerProgress = Math.min(1, safeDt * 7);
  const nextObserverTravel = observerTravel
    + (targetTravel - observerTravel) * observerProgress;

  return {
    observerTravel: nextObserverTravel,
    cameraTravel: nextObserverTravel,
  };
}

/** Positive lateral travel follows the monitor's time axis toward screen-right. */
export function getObserverStrafeOffset(distance = 0) {
  const angle = getHologramStagePose().panelRotationY;
  return { x: Math.cos(angle) * distance, z: -Math.sin(angle) * distance };
}

/** A restrained head/camera rise-and-fall is active only while travel is in progress. */
export function getWalkHeadMotion(elapsed, travelGap) {
  const intensity = Math.min(1, Math.abs(travelGap) / 0.45);
  if (intensity < 0.025) {
    return { headOffset: 0, cameraOffset: 0, bodyOffset: 0 };
  }

  const step = Math.sin(elapsed * (6 + intensity * 3));
  return {
    headOffset: step * 0.06 * intensity,
    cameraOffset: step * 0.025 * intensity,
    bodyOffset: Math.abs(step) * 0.018 * intensity,
  };
}

/** The rear walking camera appears only when the camera trails the observer. */
export function getMoveCameraBlend(travelGap) {
  return Math.min(1, Math.max(0, travelGap) / 0.5);
}

/** Both immersive modes allow a small, shoulder-mounted head-look motion. */
export function supportsNeckLook(mode) {
  return mode === 'timeline' || mode === 'move';
}

/** Movement adds thirty degrees to the right; other neck limits stay shared. */
export function getNeckLookLimits(mode = 'timeline') {
  return {
    yaw: 0.52,
    yawMin: -0.52 - (mode === 'move' ? Math.PI / 6 : 0),
    yawMax: 0.52,
    pitchMin: -0.1,
    pitchMax: 0.4,
  };
}

/** Apply a mouse drag to the shoulder view without exceeding neck limits. */
export function adjustNeckLook(currentLook, deltaX, deltaY, mode = 'timeline') {
  const limits = getNeckLookLimits(mode);
  const sensitivity = 0.003;
  return {
    yaw: Math.max(limits.yawMin, Math.min(limits.yawMax, currentLook.yaw - deltaX * sensitivity)),
    pitch: Math.max(limits.pitchMin, Math.min(limits.pitchMax, currentLook.pitch - deltaY * sensitivity)),
  };
}

/** Keep the shoulder camera close to its anchor while the head follows its aim. */
export function getTpsHeadTracking(neckYaw, neckPitch, baseYaw = -0.28, basePitch = 0.06) {
  const neutralPitch = 0.15;
  const leftLookAmount = Math.max(0, neckYaw);
  const headYaw = baseYaw + neckYaw;
  const viewYaw = headYaw + leftLookAmount * 0.65;
  return {
    cameraStrafe: leftLookAmount > 0
      ? -leftLookAmount * 0.15
      : neckYaw * 0.8,
    cameraAdvance: leftLookAmount * 1.55,
    viewYaw,
    viewPitch: basePitch + (neckPitch - neutralPitch) * 0.5,
    headYaw,
    headPitch: (neckPitch - neutralPitch) * 0.45,
  };
}

/** Keep the expand action with the other items in the terminal's right-side menu. */
export function getMonitorInteractionControls(panelLayout) {
  return {
    expand2d: {
      action: '2d',
      x: panelLayout.statusLeft,
      y: 520,
      width: panelLayout.statusWidth,
      height: 64,
    },
  };
}

/** A slim cyan emitter sits just behind the observer to trace the shoulder. */
export function getCharacterRimLightSpec() {
  return {
    offsetX: -1.25,
    offsetY: 0.9,
    offsetZ: 1.45,
    width: 0.16,
    height: 3.5,
    intensity: 1.3,
  };
}

/** The terminal remains the only local light source around the observer. */
export function getObserverLightingSpec() {
  return {
    hasRimLight: false,
    hasHeadLight: false,
  };
}

/** A futuristic desk-lamp bar casts a compact pool of light down on the observer. */
export function getCharacterTaskLightSpec() {
  return {
    offsetX: 0.12,
    offsetY: 2.6,
    offsetZ: -0.05,
    width: 0.55,
    depth: 0.28,
    diffuserHeight: 0.14,
    intensity: 3.2,
    distance: 12,
    angle: Math.PI / 7,
    penumbra: 0.82,
  };
}

/** Dimensions for a readable sealed helmet at the shoulder-camera distance. */
export function getHelmetAssemblySpec() {
  return {
    shell: {
      radius: 0.6,
      widthSegments: 24,
      heightSegments: 16,
    },
    visor: {
      offsetZ: 0.44,
      scaleX: 0.96,
      scaleY: 0.85,
      scaleZ: 0.34,
    },
    collar: {
      radius: 0.43,
      tube: 0.1,
    },
    rearBeacons: 0,
  };
}

/** The observation bay is deliberately quiet: a grid floor, no guide rails. */
export function getObservationBaySpec() {
  return {
    floorY: -4,
    gridSize: 1600,
    gridDivisions: 200,
    primaryGridColor: 0x00121f,
    secondaryGridColor: 0x00334d,
    hasFloorRails: false,
  };
}

/** Translate a timeline lane into the vertical Three.js marker coordinate. */
export function getHologramMarkerY(lane) {
  return (lane - 1) * 0.92 - 0.45;
}

/** Avoid stale terminal data when eased time travel settles below redraw distance. */
export function shouldRefreshHologram(currentZ, lastRenderedZ, targetZ) {
  if (!Number.isFinite(lastRenderedZ)) return true;
  const movedSinceRender = Math.abs(currentZ - lastRenderedZ);
  const hasSettled = Math.abs(targetZ - currentZ) <= 0.15;
  return movedSinceRender >= 2 || (hasSettled && movedSinceRender >= 0.05);
}

/** State changes from search or 2D mode need an in-world detail in 3D mode. */
export function shouldMirrorSelectionToHologram(mode, event) {
  return (mode === '3d' || mode === 'move') && Boolean(event);
}

