# Movement archive scale implementation plan

**Goal:** At closest approach, the reference band (13%–91% of screen width) spans 2,000 years. Shift + wheel accelerates physical forward/backward travel.

**Architecture:** Keep one linear all-history monitor. Calibrate its physical horizontal scale by intersecting the closest neutral shoulder camera's rays with the monitor plane. Generate crisp year labels for the intersected visible year window, with exact labels at fine scales. Retain synchronized observer/camera travel, terminal entry framing, and smooth expansion.

**Constraints:** Existing Three.js app; no added dependencies. Terminal/2D zoom behavior stays separate. Read-only period display in both immersive modes. Full history remains the movement dataset.

- [x] Add regression tests for the 2,000-year reference band across aspect ratios, visible date ticks, and fast travel/reversal.
- [x] Implement plane-intersection helpers and scale calibration; connect them to movement expansion and resize.
- [x] Extend retreat range for the huge monitor; use distance-aware wheel speed and a 100× Shift multiplier. Preserve the shoulder camera and character tracking.
- [x] Generate dates from the visible part of the archive. Full suite: 75 passing; production build successful. Verified closest and distant views in the app; tested Shift's vertical and horizontally converted wheel events through the real movement handler.
