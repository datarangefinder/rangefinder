# Holographic Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3D timeline an always-visible, layered holographic terminal viewed beside a character.

**Architecture:** `holoTimelineLayout.js` creates a deterministic display model from events and a Z-space focus. `Scene3D` queries that model when it renders the large hologram canvas, places pickable in-world markers, and keeps selected-event details in a separate depth layer. The current character and camera are reframed around that terminal.

**Tech Stack:** JavaScript ES modules, Three.js 0.170, Vite 6, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-17-holographic-timeline-design.md`

## Global Constraints

- Use the existing Three.js dependency; add no runtime packages.
- Preserve Japanese UI text, category filtering, era jumps, 2D mode, and existing input affordances.
- Only render a bounded set of event cards/nodes in the 3D terminal.
- The 3D view must not copy copyrighted Dead Space assets or exact UI.

## Review Focus

- No events in the current Z window: keep a usable empty terminal rather than throwing or showing stale detail.
- Category filtering after a timeline is already visible: remove filtered markers and redraw the display model.
- Several events at identical years: assign separate stable lanes so cards do not occupy one coordinate.
- A selected event falls outside the scrolled timeline window: clear its detail layer rather than leave disconnected information.
- Canvas texture and event markers update after resize, scroll, and era jump without a stale camera transform.

### Task 1: Timeline display layout

**Files:**
- Create: `src/view3d/holoTimelineLayout.js`
- Create: `test/holoTimelineLayout.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `buildHologramTimelineModel(events, focusZ, options)` returning `{range, rows}` where every row contains the event, a 0..1 timeline position, and a non-overlapping lane.
- Consumes: event records with `_z`, `importance`, `id`, and `title`.

- [ ] **Step 1: Write the failing layout tests**

```js
test('places in-range events in chronological order and distributes equal dates across lanes', () => {
  const model = buildHologramTimelineModel([
    { id: 'late', _z: 60, importance: 3 },
    { id: 'same-a', _z: 50, importance: 5 },
    { id: 'same-b', _z: 50, importance: 4 },
  ], 50, { range: 20, maxEvents: 8 });

  assert.deepEqual(model.rows.map(row => row.event.id), ['same-a', 'same-b', 'late']);
  assert.notEqual(model.rows[0].lane, model.rows[1].lane);
  assert.ok(model.rows.every(row => row.position >= 0 && row.position <= 1));
});
```

- [ ] **Step 2: Run the layout test to verify it fails**

Run: `npm test -- --test-name-pattern="places in-range"`

Expected: FAIL because the module and test script are not yet present.

- [ ] **Step 3: Implement `buildHologramTimelineModel(events, focusZ, options)`**

Filter by `focusZ ± range`, order by Z then ID, cap to `maxEvents`, expose a normalized Z position, and cycle equal-position records through fixed lanes. Add `node --test` as the `test` package script.

- [ ] **Step 4: Run the layout tests to verify they pass**

Run: `npm test -- --test-name-pattern="places in-range"`

Expected: PASS.

### Task 2: Persistent holographic timeline scene

**Files:**
- Modify: `src/view3d/Scene3D.js`
- Test: `test/holoTimelineLayout.test.js`

**Interfaces:**
- Consumes: `buildHologramTimelineModel(events, focusZ, options)`.
- Produces: an always-visible `hologram` group containing timeline, status, and selection-detail layers plus pickable marker meshes.

- [ ] **Step 1: Extend the failing layout tests for empty and limited windows**

```js
test('returns an empty row list when no events are in range', () => {
  assert.deepEqual(buildHologramTimelineModel([], 50, { range: 20 }).rows, []);
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- --test-name-pattern="empty row list"`

Expected: FAIL because the empty model behavior is not implemented.

- [ ] **Step 3: Refactor the hologram construction and rendering methods in `Scene3D.js`**

Replace `_buildTunnel` with a restrained observation-bay grid/back wall and frame the character left of the terminal. Replace the one-event texture drawing with a timeline renderer that draws era/status labels, a ruler, event nodes/cards, and hover/selection accents. Create marker meshes from the layout rows; use their `userData.event` in `_handleClick`. Keep selected details in a front-most detail layer and hide it when selection is cleared or the event leaves the visible model.

- [ ] **Step 4: Run the targeted layout tests to verify they pass**

Run: `npm test -- --test-name-pattern="empty row list"`

Expected: PASS.

### Task 3: Visual integration and verification

**Files:**
- Modify: `src/style.css`
- Modify: `index.html`
- Modify: `src/view3d/Scene3D.js`

**Interfaces:**
- Consumes: current HUD element IDs and Scene3D controls.
- Produces: HUD hierarchy that supports rather than masks the in-world terminal.

- [ ] **Step 1: Update HUD copy and styling**

Reduce overlay chrome, name the 3D mode as a holographic timeline, and retain accessible buttons and the existing control hint.

- [ ] **Step 2: Run the full unit test suite**

Run: `npm test`

Expected: PASS with all layout tests green.

- [ ] **Step 3: Build the Vite production bundle**

Run: `npm run build`

Expected: exit code 0 and output containing `dist` bundle assets.

- [ ] **Step 4: Manually inspect the running app**

Run: `npm run dev -- --host 127.0.0.1`

Expected: at a desktop viewport, the character is left foreground, the cyan timeline terminal stays visible while scrolling, category filters refresh it, and selecting an event opens only the front detail layer.

## Self-Review

- Spec coverage: Task 1 supplies stable bounded data for timeline rendering; Task 2 creates the projected terminal and keeps existing interaction; Task 3 preserves and subordinates the HUD while checking the final build and visual flow.
- Type consistency: Task 1 exports exactly the model consumed in Task 2.
- Review focus: Task 1 owns empty, cap, and equal-position cases; Task 2 owns selection/filter/render refresh; Task 3 owns viewport and interaction inspection.
- Proportion: the plan specifies interfaces and checks without embedding the implementation.
