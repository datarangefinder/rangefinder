/** Keep readable screen-sized dates on their true time-axis anchors. */
export function buildAxisLabelLayout(points, { width, height }) {
  const labels = [];
  let previousRight = -Infinity;
  for (const point of [...points].sort((a, b) => a.x - b.x)) {
    if (point.visible === false || !point.label
      || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.y < 80 || point.y > height - 44) continue;
    const halfWidth = [...point.label].length * 5;
    const left = point.x - halfWidth;
    const right = point.x + halfWidth;
    if (left < 12 || right > width - 12 || left < previousRight + 16) continue;
    labels.push(point);
    previousRight = right;
  }
  return labels;
}
