# Timeline beacons

The user selected the “光の柱” comparison and requested implementation. Keep each beacon attached to its event's projected timeline position, with a fixed readable screen size. Show a calm luminous stem, diamond, short event title and date. Selected events get stronger light; no moving or waving lines.

Approaches considered: light pillars with names (selected), constant-size rings (less readable without selection), and grouped count cards (use only when events collide). Nearby events unfold as the observer approaches; crowded groups expose an accessible event picker on click. Preserve camera, travel, timeline scale, categories, 2D mode, and event detail behavior.

Implementation choice: project event positions from Three.js into a pointer-transparent HTML layer. Use native buttons for the heads and labels, and a small list for grouped events. This keeps names legible at any camera distance without changing physical monitor dimensions. Reuse the existing event selection path. Hide the layer in 2D and during terminal boot.

User correction: light pillars are for movement mode only. Terminal mode retains the original round markers, event cards and raycast selection. Returning to terminal mode hides the beacon layer and rebuilds the original markers; entering movement clears those markers and enables the beacons.
