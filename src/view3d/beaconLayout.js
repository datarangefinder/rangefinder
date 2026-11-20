const LABEL_WIDTH = 144;
const LABEL_GAP = 10;
const LANE_STEP = 62;

function summarize(points) {
  const representative = [...points].sort((a, b) => Number(!!b.isSelected) - Number(!!a.isSelected)
    || (b.event.importance ?? 0) - (a.event.importance ?? 0))[0];
  return {
    points,
    events: points.map(point => point.event).sort((a, b) => a.year - b.year || String(a.id).localeCompare(String(b.id))),
    event: representative.event,
    isSelected: points.some(point => point.isSelected),
    x: (points[0].x + points.at(-1).x) / 2,
    anchorY: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

/** Keep world anchors accurate while sizing labels in CSS pixels, independently of distance. */
export function buildBeaconLayout(points, { width, height }) {
  if (width < 60 || height < 260) return [];
  const visible = points.filter(point => point.visible !== false && point.event
    && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 12 && point.x <= width - 12 && point.y >= 198 && point.y <= height - 65)
    .sort((a, b) => a.x - b.x || String(a.event.id).localeCompare(String(b.event.id)));
  const groups = [];
  for (const point of visible) {
    const previous = groups.at(-1);
    if (previous && point.x - previous[0].x <= 52) previous.push(point);
    else groups.push([point]);
  }

  // If every available label lane is occupied, merge neighbours and lay out again.
  // This handles narrow windows and dates that project onto the very same pixel.
  while (groups.length) {
    const placed = [];
    let collision = -1;
    for (let i = 0; i < groups.length; i++) {
      const group = summarize(groups[i]);
      group.labelWidth = Math.min(LABEL_WIDTH, width - 24);
      group.labelX = Math.max(12, Math.min(width - 12 - group.labelWidth, group.x - group.labelWidth / 2));
      let fits = false;
      for (let lane = 0; lane < 4; lane++) {
        group.headY = Math.max(172, group.anchorY - 76 - lane * LANE_STEP);
        fits = placed.every(other => Math.abs(other.headY - group.headY) >= LANE_STEP
          || other.labelX + other.labelWidth + LABEL_GAP <= group.labelX
          || group.labelX + group.labelWidth + LABEL_GAP <= other.labelX);
        if (fits) break;
      }
      if (!fits) { collision = i; break; }
      placed.push(group);
    }
    if (collision < 0) return placed;
    groups[collision - 1].push(...groups[collision]);
    groups.splice(collision, 1);
  }
  return [];
}
