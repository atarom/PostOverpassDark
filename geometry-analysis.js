import { createNumericHistogram } from "./numeric-histogram.js";
const R = 6371008.8;
const RAD = Math.PI / 180;
const MODES = [{ key: "length", label: "Longitud", unit: "m" }, { key: "area", label: "Superficie", unit: "m²" }, { key: "perimeter", label: "Perímetro", unit: "m" }, { key: "vertices", label: "Vértices", unit: "" }];
const format = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const validPoint = (point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[1]) <= 90;
const distance = (a, b) => {
  if (!validPoint(a) || !validPoint(b)) return NaN;
  const latA = a[1] * RAD;
  const latB = b[1] * RAD;
  const dLat = latB - latA;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h))));
};
const pathLength = (points, closed = false) => {
  if (!Array.isArray(points) || points.length < 2) return NaN;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[i - 1], points[i]);
    if (!Number.isFinite(d)) return NaN;
    total += d;
  }
  if (closed && (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1])) {
    const last = distance(points.at(-1), points[0]);
    if (!Number.isFinite(last)) return NaN;
    total += last;
  }
  return total;
};
const ringArea = (ring) => {
  if (!Array.isArray(ring) || ring.length < 3) return NaN;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!validPoint(a) || !validPoint(b)) return NaN;
    let lon = (b[0] - a[0]) * RAD;
    lon = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    sum += lon * (2 + Math.sin(a[1] * RAD) + Math.sin(b[1] * RAD));
  }
  return Math.abs(sum * R * R / 2);
};
const ringVertices = (points) => Array.isArray(points) && points.length ? points.length - (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1] ? 1 : 0) : 0;
const polygonMetrics = (rings) => {
  if (!Array.isArray(rings) || !rings.length) return { area: NaN, perimeter: NaN, vertices: NaN };
  let area = 0;
  let perimeter = 0;
  let vertices = 0;
  for (let i = 0; i < rings.length; i++) {
    const a = ringArea(rings[i]);
    const p = pathLength(rings[i], true);
    const v = ringVertices(rings[i]);
    if (!Number.isFinite(a) || !Number.isFinite(p) || v < 3) return { area: NaN, perimeter: NaN, vertices: NaN };
    area += i === 0 ? a : -a;
    perimeter += p;
    vertices += v;
  }
  return { area: Math.max(0, area), perimeter, vertices };
};
export const geometryMetrics = (geometry) => {
  const result = { length: NaN, area: NaN, perimeter: NaN, vertices: NaN };
  if (!geometry || typeof geometry !== "object") return result;
  const { type, coordinates } = geometry;
  if (type === "Point" && validPoint(coordinates)) result.vertices = 1;
  if (type === "MultiPoint" && Array.isArray(coordinates) && coordinates.length && coordinates.every(validPoint)) result.vertices = coordinates.length;
  if (type === "LineString" || type === "MultiLineString") {
    const lines = type === "LineString" ? [coordinates] : coordinates;
    if (!Array.isArray(lines) || !lines.length) return result;
    let length = 0;
    let vertices = 0;
    for (const line of lines) {
      const value = pathLength(line);
      if (!Number.isFinite(value)) return result;
      length += value;
      vertices += ringVertices(line);
    }
    result.length = length;
    result.vertices = vertices;
  }
  if (type === "Polygon" || type === "MultiPolygon") {
    const polygons = type === "Polygon" ? [coordinates] : coordinates;
    if (!Array.isArray(polygons) || !polygons.length) return result;
    let area = 0;
    let perimeter = 0;
    let vertices = 0;
    for (const polygon of polygons) {
      const item = polygonMetrics(polygon);
      if (!Number.isFinite(item.area) || !Number.isFinite(item.perimeter)) return result;
      area += item.area;
      perimeter += item.perimeter;
      vertices += item.vertices;
    }
    result.area = area;
    result.perimeter = perimeter;
    result.vertices = vertices;
  }
  if (type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    const totals = { length: 0, area: 0, perimeter: 0, vertices: 0 };
    const counts = { length: 0, area: 0, perimeter: 0, vertices: 0 };
    for (const part of geometry.geometries) {
      const item = geometryMetrics(part);
      for (const mode of MODES) if (Number.isFinite(item[mode.key])) { totals[mode.key] += item[mode.key]; counts[mode.key]++; }
    }
    for (const mode of MODES) if (counts[mode.key]) result[mode.key] = totals[mode.key];
  }
  return result;
};
const lowerBound = (list, target) => {
  let low = 0;
  let high = list.length;
  while (low < high) { const mid = (low + high) >>> 1; if (list[mid] < target) low = mid + 1; else high = mid; }
  return low;
};
const upperBound = (list, target) => {
  let low = 0;
  let high = list.length;
  while (low < high) { const mid = (low + high) >>> 1; if (list[mid] <= target) low = mid + 1; else high = mid; }
  return low;
};
export const createGeometryAnalysis = ({ anchor, onChange }) => {
  const details = document.createElement("details");
  details.className = "analysis-box pod-geometry";
  const summary = document.createElement("summary");
  summary.textContent = "Geometría";
  const body = document.createElement("div");
  body.className = "analysis-body";
  const tabs = document.createElement("div");
  tabs.className = "pod-geometry-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Tipo de medida geométrica");
  const panel = document.createElement("div");
  panel.id = "podGeometryPanel";
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-label", "Distribución geométrica");
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.setAttribute("aria-label", "Activar Geometría");
  summary.classList.add("pod-filter-summary");
  summary.prepend(enabled);
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Restablecer";
  const status = document.createElement("div");
  status.className = "pod-geometry-status";
  const statusLine = document.createElement("div");
  statusLine.className = "pod-geometry-statusline";
  statusLine.append(status, resetButton);
  const hiddenAnchor = document.createElement("input");
  hiddenAnchor.type = "hidden";
  hiddenAnchor.value = "length";
  const minLabel = document.createElement("label");
  const minOutput = document.createElement("output");
  minLabel.append("Mínimo ", minOutput);
  const minInput = document.createElement("input");
  minInput.type = "range";
  const maxLabel = document.createElement("label");
  const maxOutput = document.createElement("output");
  maxLabel.append("Máximo ", maxOutput);
  const maxInput = document.createElement("input");
  maxInput.type = "range";
  panel.append(statusLine, hiddenAnchor, minLabel, minInput, maxLabel, maxInput);
  body.append(tabs, panel);
  details.append(summary, body);
  anchor.closest("details").after(details);
  let collection = { features: [] };
  let metrics = null;
  let histogramSource = { features: [] };
  let sorted = {};
  let rangeState = {};
  let mode = "length";
  let frame = 0;
  const buttons = MODES.map((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pod-geometry-tab";
    button.id = `podGeomTab${index}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", panel.id);
    button.textContent = ["Long.", "Sup.", "Perím.", "Vért."][index];
    button.title = entry.label;
    button.setAttribute("aria-label", entry.label);
    tabs.append(button);
    return button;
  });
  const ensureMetrics = () => {
    if (metrics) return;
    const features = collection.features || [];
    metrics = Object.fromEntries(MODES.map(({ key }) => [key, new Float64Array(features.length).fill(NaN)]));
    for (let i = 0; i < features.length; i++) {
      const item = geometryMetrics(features[i]?.geometry);
      for (const entry of MODES) metrics[entry.key][i] = item[entry.key];
    }
    histogramSource = { features: Array.from({ length: features.length }, (_, i) => i) };
  };
  const getSorted = () => {
    ensureMetrics();
    if (!sorted[mode]) sorted[mode] = Array.from(metrics[mode]).filter(Number.isFinite).sort((a, b) => a - b);
    return sorted[mode];
  };
  const histogram = createNumericHistogram({ anchor: hiddenAnchor, minInput, maxInput, getCollection: () => histogramSource, getValue: (index, key) => metrics?.[key]?.[index] ?? NaN, formatter: format, onRange: () => { updateOutputs(); updateStatus(); emitFrame(); } });
  const options = () => ({ geometryEnabled: Boolean(enabled.checked && metrics && getSorted().length), geometryValues: metrics?.[mode] || null, geometryMode: mode, geometryMin: Number(minInput.value), geometryMax: Number(maxInput.value) });
  const emit = () => onChange?.();
  const emitFrame = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(emit); };
  const selectedMode = () => MODES.find((entry) => entry.key === mode);
  const display = (value) => `${format.format(value)}${selectedMode().unit ? " " + selectedMode().unit : ""}`;
  const updateOutputs = () => {
    minOutput.textContent = display(Number(minInput.value));
    maxOutput.textContent = display(Number(maxInput.value));
    if (metrics) rangeState[mode] = [Number(minInput.value), Number(maxInput.value)];
  };
  const updateStatus = () => {
    const list = getSorted();
    const inside = upperBound(list, Number(maxInput.value)) - lowerBound(list, Number(minInput.value));
    status.textContent = `${format.format(list.length)} geometrías medibles · ${format.format(inside)} en el rango`;
  };
  const syncMode = () => {
    buttons.forEach((button, i) => {
      const active = MODES[i].key === mode;
      button.classList.toggle("on", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    hiddenAnchor.value = mode;
    const list = getSorted();
    const min = list[0] ?? 0;
    const max = list.at(-1) ?? 0;
    const range = rangeState[mode] || [min, max];
    for (const input of [minInput, maxInput]) {
      input.min = String(min);
      input.max = String(max);
      input.step = mode === "vertices" ? "1" : "any";
      input.disabled = !list.length || max === min;
    }
    minInput.value = String(Math.max(min, Math.min(max, range[0])));
    maxInput.value = String(Math.max(min, Math.min(max, range[1])));
    if (Number(minInput.value) > Number(maxInput.value)) maxInput.value = minInput.value;
    enabled.disabled = !list.length;
    if (!list.length) enabled.checked = false;
    updateOutputs();
    updateStatus();
    histogram.refresh();
  };
  buttons.forEach((button, i) => {
    button.onclick = () => {
      mode = MODES[i].key;
      ensureMetrics();
      syncMode();
      emit();
    };
    button.onkeydown = (event) => {
      let next;
      if (event.key === "ArrowRight") next = (i + 1) % buttons.length;
      else if (event.key === "ArrowLeft") next = (i + buttons.length - 1) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[next].click();
      buttons[next].focus();
    };
  });
  details.addEventListener("toggle", () => {
    if (!details.open) return;
    ensureMetrics();
    syncMode();
    emit();
  });
  enabled.onchange = emit;
  const sliderInput = (left) => {
    if (Number(minInput.value) > Number(maxInput.value)) {
      if (left) maxInput.value = minInput.value;
      else minInput.value = maxInput.value;
    }
    updateOutputs();
    updateStatus();
    histogram.redraw();
    emitFrame();
  };
  minInput.oninput = () => sliderInput(true);
  maxInput.oninput = () => sliderInput(false);
  const reset = (notify = false) => {
    cancelAnimationFrame(frame);
    enabled.checked = false;
    rangeState = {};
    if (metrics && details.open) syncMode();
    if (notify) emit();
  };
  resetButton.onclick = () => reset(true);
  const setData = (next) => {
    cancelAnimationFrame(frame);
    collection = next?.type === "FeatureCollection" && Array.isArray(next.features) ? next : { features: [] };
    metrics = null;
    sorted = {};
    rangeState = {};
    enabled.checked = false;
    histogram.clear();
    if (details.open) { ensureMetrics(); syncMode(); }
    else status.textContent = "Abre el grupo para calcular las medidas.";
  };
  setData(null);
  return { options, reset, setData };
};
