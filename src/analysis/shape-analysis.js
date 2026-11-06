const RAD = Math.PI / 180;
const R = 6371008.8;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const hullLength = (points) => {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const hull = [];
  for (const point of points) {
    while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
    hull.push(point);
  }
  const bottom = hull.length;
  for (let i = points.length - 2; i >= 0; i--) {
    const point = points[i];
    while (hull.length > bottom && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
    hull.push(point);
  }
  if (hull.length < 4) return NaN;
  hull.pop();
  let perimeter = 0;
  for (let i = 0; i < hull.length; i++) perimeter += Math.hypot(hull[(i + 1) % hull.length][0] - hull[i][0], hull[(i + 1) % hull.length][1] - hull[i][1]);
  return perimeter;
};
export const shapeDescriptors = (geometry, area, perimeter, vertices) => {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type) || !(area > 0) || !(perimeter > 0) || !(vertices >= 3)) return null;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const first = polygons?.[0]?.[0]?.[0];
  if (!Array.isArray(first) || !Number.isFinite(first[0]) || !Number.isFinite(first[1])) return null;
  const lon0 = first[0];
  const lat0 = first[1];
  const scaleX = Math.cos(lat0 * RAD) * R * RAD;
  const scaleY = R * RAD;
  const points = [];
  let total = 0;
  let mx = 0;
  let my = 0;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring)) return null;
      const ringPoints = [];
      for (const p of ring) {
        if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
        const lon = ((p[0] - lon0 + 180) % 360 + 360) % 360 - 180;
        ringPoints.push([lon * scaleX, (p[1] - lat0) * scaleY]);
      }
      if (ringPoints.length < 4) return null;
      const end = ringPoints.length > 1 && ringPoints[0][0] === ringPoints.at(-1)[0] && ringPoints[0][1] === ringPoints.at(-1)[1] ? ringPoints.length - 1 : ringPoints.length;
      if (end < 3) return null;
      for (let i = 0; i < end; i++) {
        const a = ringPoints[i];
        const b = ringPoints[(i + 1) % end];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const x = (a[0] + b[0]) / 2;
        const y = (a[1] + b[1]) / 2;
        mx += length * x;
        my += length * y;
        xx += length * x * x;
        yy += length * y * y;
        xy += length * x * y;
        total += length;
        if (ring === polygon[0]) points.push(a);
      }
    }
  }
  if (!total || points.length < 3) return null;
  const hullPerimeter = hullLength(points);
  if (!(hullPerimeter > 0)) return null;
  mx /= total;
  my /= total;
  xx = Math.max(0, xx / total - mx * mx);
  yy = Math.max(0, yy / total - my * my);
  xy = xy / total - mx * my;
  const trace = xx + yy;
  const delta = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy);
  const major = Math.max(0, (trace + delta) / 2);
  const minor = Math.max(0, (trace - delta) / 2);
  const elongation = Math.sqrt(major / Math.max(1e-8, minor));
  const compactness = perimeter / (2 * Math.sqrt(Math.PI * area));
  const concavity = perimeter / hullPerimeter;
  if (![compactness, concavity, elongation].every((value) => Number.isFinite(value) && value > 0)) return null;
  return [Math.log(Math.max(1, compactness)), Math.log(Math.max(1, concavity)), Math.log(Math.max(1, elongation)), Math.log1p(10 * vertices / perimeter)];
};
export const shapeReason = (code) => ["Combinación poco habitual", "Poca compacidad", "Contorno irregular", "Muy alargada", "Exceso de vértices"][code] || "Combinación poco habitual";
