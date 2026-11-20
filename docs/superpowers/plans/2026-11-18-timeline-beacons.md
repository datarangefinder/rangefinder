# Timeline beacons Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Make timeline events readable and selectable from the far movement view.

**Architecture:** A pure screen-space layout groups crowded projected event anchors and assigns non-overlapping labels. A small DOM renderer displays stable luminous beacons and accessible group choices. Scene3D projects the anchors each frame and keeps its selection path.

**Tech Stack:** Existing Three.js, HTML/CSS, Node test runner; no new dependencies.

**Spec:** ../specs/2026-11-18-timeline-beacons-design.md

## Global Constraints

- Fixed readable text and diamond sizes; no position animation.
- Timeline positions, camera controls, categories and 2D mode retain existing behavior.
- Escape or an outside click closes the group picker. All event text uses textContent.

## Review Focus

- Dense events: labels group rather than overlap; every member remains selectable.
- Near/far travel: projected spacing automatically splits or merges groups.
- Narrow windows and edges: labels stay inside the viewport.
- Selected events: selection remains highlighted within a group.
- Mode/boot changes: no orphan controls visible in 2D or during boot.

### Task 1: Screen-space layout

Files: create src/view3d/beaconLayout.js and test/beaconLayout.test.js.

Interface: buildBeaconLayout(points, {width, height}) consumes projected {x, y, event, isSelected, visible} points and returns groups with events, event, isSelected, x, anchorY, headY, labelX and labelWidth.

- [x] Write and run failing tests for grouping, unfolding, selection, viewport clipping and label collisions.
- [x] Implement the pure layout and pass the tests.

### Task 2: Live beacons

Files: create src/view3d/HologramBeacons.js; modify Scene3D.js and style.css.

- [x] Add native event buttons, fixed-size diamond heads, stems, names and dates.
- [x] Project the monitor's timeline anchors into the layer each frame; replace the tiny baked-in event cards and sphere markers.
- [x] Route singles and group members to the existing selection method; preserve selection while travelling.
- [x] Verify far/near movement, grouped selection, terminal restore, and 2D hiding in the app.
- [x] Run npm test and npm run build; capture the final app preview.

Verification: npm test passed 49/49; npm run build succeeded. Existing Three.js vendor chunk size warning remains. Self-review: checked clipping, label collision, picker height, keyboard/outside dismissal, wheel forwarding over labels, and hidden controls in 2D. No git checkout is present, so no branch or commit operations apply.

UI evidence: far retreat shows seven readable beacons instead of microscopic points; the solar group opens four choices and Earth selection highlights its beacon. At a closer 1-billion-year view, the Moon and Late Heavy Bombardment appear individually. The 135-event group stays in a 300 px scrollable picker entirely inside the viewport. 2D hides the layer. Browser console: no errors. Preview: artifacts/timeline-beacons-far.jpg.

Follow-up: restored the original terminal round markers, canvas cards and selectable 3D spheres. Beacons now run only in movement mode. npm test: 49/49 passed; npm run build succeeded. UI confirmed terminal → movement beacon → terminal original marker. Preview: artifacts/terminal-original-markers.jpg.
