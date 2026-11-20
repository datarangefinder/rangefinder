# Holographic Timeline Design

## Intent

Make the default 3D view feel like an in-world terminal: a suited observer is
seen from behind while a persistent, cyan, semi-transparent timeline floats in
front of them. The user reads and explores history through that projected
interface, rather than travelling through a tunnel of pins.

## Goals

- Keep the existing event dataset, category filters, era jumps, 2D mode, and
  mouse/scroll controls.
- Replace the 3D tunnel as the primary visual with a layered holographic
  timeline: a time ruler, grouped era bands, event nodes, and an event detail
  layer.
- Keep the character at the left edge of the composition and put the timeline
  at a visible perspective angle in front/right of it.
- Animate scan lines, a subtle flicker, and small depth-separated panels so
  the UI feels projected, not like a flat webpage.
- Have scrolling update the persistent timeline window; selecting a visible
  event reveals details without hiding the timeline.

## Non-goals

- Recreate Dead Space assets, its exact UI, or copyrighted visual elements.
- Add external models, textures, dependencies, or a new data format.
- Change the 2D timeline experience.

## Constraints

- Continue using Three.js 0.170 and the existing canvas texture mechanism.
- Preserve the application in Japanese and preserve keyboard/mouse behavior.
- Use the active category filter when sourcing visible events.
- Draw a bounded number of cards/nodes so the 3D view remains responsive.

## Approaches

1. **Persistent in-world hologram (selected).** Replace the tunnel with a
   floating terminal whose canvas texture renders time bands and event nodes;
   use a separate, depth-offset detail panel for the selected event. This best
   matches the supplied references and maintains the app's existing data flow.
2. **Tunnel plus enlarged popup.** Keep the world tunnel and make the existing
   selection board bigger. It retains the current navigation metaphor, but
   does not make the timeline itself look like a game menu.

The user chose approach 1.

## Design

`Scene3D` remains responsible for camera, input, and animation. A small pure
layout module turns the filtered events around the camera's current Z value
into stable hologram rows. `Scene3D` uses that model to draw the main timeline
canvas and to raycast/click the corresponding in-world event markers.

The scene becomes a dark observation bay: the character stays in the left
foreground, a low ambient grid provides depth, and the large hologram floats
ahead and right. The hologram has three layers: the persistent timeline
surface, a slim side/status panel, and a detail card raised in front when an
event is selected. The application HUD is visually reduced so it does not
compete with the projected interface.
