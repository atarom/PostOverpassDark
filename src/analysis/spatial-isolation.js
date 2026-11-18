import { createNumericHistogram } from "./numeric-histogram.js";
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./spatial-isolation.css", import.meta.url).href;
document.head.append(stylesheet);
const format = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const valid = (point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[1]) <= 90 && Math.abs(point[0]) <= 180;
const segmentLength = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), b[1] - a[1]);
const lineCenter = (lines) => {
  const segments = [];
  let length = 0;
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    if (!valid(a) || !valid(b)) continue;
    const distance = segmentLength(a, b);
    if (!distance) continue;
    segments.push([a, b, distance]);
    length += distance;
  }
  if (!length) return lines.flat().find(valid) || null;
  let remaining = length / 2;
  for (const [a, b, distance] of segments) {
    if (remaining <= distance) return [a[0] + (b[0] - a[0]) * remaining / distance, a[1] + (b[1] - a[1]) * remaining / distance];
    remaining -= distance;
  }
  return segments.at(-1)[1];
};
const ringCenter = (ring) => {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!valid(a) || !valid(b)) return null;
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    x += (a[0] + b[0]) * cross;
    y += (a[1] + b[1]) * cross;
  }
  return Math.abs(area) > 1e-14 ? { point: [x / (3 * area), y / (3 * area)], area: Math.abs(area) / 2 } : null;
};
const polygonCenter = (polygons) => {
  let total = 0;
  let x = 0;
  let y = 0;
  for (const rings of polygons) for (let i = 0; i < rings.length; i++) {
    const center = ringCenter(rings[i]);
    if (!center) continue;
    const area = center.area * (i === 0 ? 1 : -1);
    total += area;
    x += center.point[0] * area;
    y += center.point[1] * area;
  }
  if (total > 0) return [x / total, y / total];
  return polygons[0]?.[0]?.find(valid) || null;
};
export const representativePoint = (geometry) => {
  if (!geometry) return null;
  const { type, coordinates: c } = geometry;
  if (type === "Point") return valid(c) ? c : null;
  if (type === "MultiPoint") {
    const points = (c || []).filter(valid);
    return points.length ? [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length] : null;
  }
  if (type === "LineString") return lineCenter([c || []]);
  if (type === "MultiLineString") return lineCenter(c || []);
  if (type === "Polygon") return polygonCenter([c || []]);
  if (type === "MultiPolygon") return polygonCenter(c || []);
  if (type === "GeometryCollection") {
    for (const part of geometry.geometries || []) {
      const point = representativePoint(part);
      if (point) return point;
    }
  }
  return null;
};
export const createSpatialIsolation = ({ anchor, onChange }) => {
  const details = document.createElement("details");
  details.className = "analysis-box pod-spatial";
  const summary = document.createElement("summary");
  summary.className = "pod-filter-summary";
  summary.append("Aislamiento espacial");
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.setAttribute("aria-label", "Activar aislamiento espacial");
  summary.prepend(enabled);
  const body = document.createElement("div");
  body.className = "analysis-body pod-spatial-body";
  const addField = (text, node) => {
    const label = document.createElement("label");
    label.className = "pod-spatial-field";
    label.append(text, node);
    body.append(label);
    return label;
  };
  const method = document.createElement("select");
  for (const [id, name] of [["lof", "LOF · Densidad local"], ["knn", "k-NN · Distancia + IQR"], ["dbscan", "DBSCAN · Agrupaciones"]]) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    method.append(option);
  }
  addField("Algoritmo", method);
  const slider = (text, min, max, step, value) => {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const output = document.createElement("output");
    output.textContent = String(value);
    const title = document.createElement("span");
    title.className = "pod-spatial-caption";
    title.append(text, " ", output);
    const label = addField(title, input);
    return { label, input, output };
  };
  const k = slider("Vecinos", 2, 50, 1, 20);
  const sensitivity = slider("Sensibilidad IQR", .5, 4, .1, 1.5);
  const lofThreshold = slider("Umbral LOF (0 = automático)", 0, 5, .05, 0);
  const radius = slider("Radio (m)", 50, 5000, 50, 500);
  const minPoints = slider("Elementos mínimos", 2, 20, 1, 4);
  const display = document.createElement("select");
  for (const [id, label] of [["all", "Todos · Resaltar aislados"], ["isolated", "Solo aislados"], ["normal", "Solo agrupados"]]) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    display.append(option);
  }
  addField("Mostrar", display);
  const state = document.createElement("div");
  state.className = "pod-spatial-state";
  state.setAttribute("role", "status");
  state.textContent = "Despliega el análisis para calcular.";
  const stats = document.createElement("div");
  stats.className = "pod-spatial-stats";
  const hint = document.createElement("div");
  hint.className = "pod-spatial-hint";
  hint.textContent = "Aislamiento calculado sobre puntos representativos. No implica un error OSM.";
  const hiddenAnchor = document.createElement("input");
  hiddenAnchor.type = "hidden";
  hiddenAnchor.value = "score";
  const lower = document.createElement("input");
  const upper = document.createElement("input");
  for (const node of [lower, upper]) { node.type = "range"; node.min = "0"; node.max = "1"; node.step = "any"; node.disabled = true; }
  const histogramHolder = document.createElement("div");
  histogramHolder.className = "pod-spatial-histogram";
  histogramHolder.append(hiddenAnchor, lower, upper);
  body.append(state, stats, histogramHolder, hint);
  details.append(summary, body);
  anchor.after(details);
  let collection = null;
  let worker = null;
  let ready = false;
  let busy = false;
  let queued = false;
  let timer = 0;
  let scores = null;
  let flags = null;
  let pointIndices = [];
  let cutoff = NaN;
  let clusters = 0;
  let count = 0;
  let lastRequest = 0;
  let source = { features: [] };
  let loadedCoords = null;
  const histogram = createNumericHistogram({ anchor: hiddenAnchor, minInput: lower, maxInput: upper, getCollection: () => source, getValue: (index) => scores?.[pointIndices[index]], onRange: () => {} });
  const settings = () => ({ method: method.value, k: Number(k.input.value), sensitivity: Number(sensitivity.input.value), lofThreshold: Number(lofThreshold.input.value), radius: Number(radius.input.value), minPoints: Number(minPoints.input.value) });
  const options = () => ({ spatialEnabled: Boolean(enabled.checked && flags), spatialDisplay: display.value, spatialFlags: flags, spatialScores: scores, spatialMethod: method.value });
  const emit = () => onChange?.(options());
  const showControls = () => {
    const density = method.value === "lof";
    k.label.hidden = method.value === "dbscan";
    sensitivity.label.hidden = method.value === "dbscan";
    lofThreshold.label.hidden = !density;
    radius.label.hidden = method.value !== "dbscan";
    minPoints.label.hidden = method.value !== "dbscan";
    histogramHolder.hidden = method.value === "dbscan";
    sensitivity.input.disabled = density && Number(lofThreshold.input.value) > 0;
  };
  const updateHistogram = () => {
    const sorted = scores ? Array.from(scores).filter(Number.isFinite) : [];
    let max = 1;
    for (const value of sorted) if (value > max) max = value;
    lower.min = upper.min = "0";
    lower.max = upper.max = String(Math.max(.0001, max));
    lower.value = "0";
    upper.value = String(Math.max(.0001, max));
    source = { features: Array.from({ length: pointIndices.length }, (_, i) => i) };
    lower.disabled = upper.disabled = false;
    histogram.refresh();
  };
  const setResult = (result) => {
    busy = false;
    if (result.request !== lastRequest) return;
    if (queued) { queued = false; request(); return; }
    scores = new Float64Array(collection?.features.length || 0).fill(NaN);
    flags = new Int8Array(collection?.features.length || 0).fill(-1);
    for (let i = 0; i < pointIndices.length; i++) {
      scores[pointIndices[i]] = result.scores[i];
      flags[pointIndices[i]] = result.flags[i];
    }
    cutoff = result.cutoff;
    clusters = result.clusters;
    count = result.flags.reduce((sum, value) => sum + value, 0);
    state.textContent = `${format.format(pointIndices.length)} geometrías · ${format.format(result.elapsed)} ms`;
    stats.textContent = `${format.format(count)} aislados (${format.format(100 * count / Math.max(1, pointIndices.length))} %)${method.value === "dbscan" ? ` · ${format.format(clusters)} grupos` : ` · Umbral ${format.format(cutoff)}${method.value === "knn" ? " m" : ""}`}`;
    if (method.value !== "dbscan") updateHistogram();
    emit();
    if (queued) { queued = false; request(); }
  };
  const request = () => {
    clearTimeout(timer);
    if (!(details.open || enabled.checked)) return;
    if (!worker && loadedCoords) startWorker();
    if (!worker || !ready) return;
    if (busy) { queued = true; return; }
    busy = true;
    queued = false;
    lastRequest++;
    state.textContent = "Calculando aislamiento…";
    worker.postMessage({ type: "calc", request: lastRequest, settings: settings() });
  };
  const schedule = () => {
    scores = null;
    flags = null;
    stats.textContent = "";
    histogram.clear();
    emit();
    clearTimeout(timer);
    if (busy) { queued = true; return; }
    timer = setTimeout(request, 140);
  };
  const setData = (next) => {
    clearTimeout(timer);
    worker?.terminate();
    worker = null;
    loadedCoords = null;
    ready = busy = queued = false;
    scores = flags = null;
    pointIndices = [];
    collection = next?.features ? next : null;
    stats.textContent = "";
    histogram.clear();
    if (!collection) { state.textContent = "Ejecuta una consulta para analizar."; return; }
    const coords = [];
    for (let i = 0; i < collection.features.length; i++) {
      const point = representativePoint(collection.features[i]?.geometry);
      if (!valid(point)) continue;
      pointIndices.push(i);
      coords.push(point[0], point[1]);
    }
    if (pointIndices.length < 3) { state.textContent = "Se necesitan al menos 3 geometrías válidas."; return; }
    state.textContent = `${format.format(pointIndices.length)} geometrías disponibles`;
    loadedCoords = new Float64Array(coords);
    if (details.open || enabled.checked) startWorker();
  };
  const startWorker = () => {
    if (worker || !loadedCoords) return;
    worker = new Worker(new URL("./spatial-isolation-worker.js", import.meta.url), { type: "module" });
    const current = worker;
    worker.onmessage = ({ data }) => {
      if (worker !== current) return;
      if (data.type === "ready") { ready = true; request(); }
      if (data.type === "result") setResult(data);
      if (data.type === "error") { busy = false; state.textContent = `Error: ${data.message}`; }
    };
    worker.onerror = () => { if (worker === current) { busy = false; state.textContent = "No se pudo calcular el aislamiento."; } };
    const data = loadedCoords;
    loadedCoords = null;
    worker.postMessage({ type: "load", buffer: data.buffer }, [data.buffer]);
  };
  const reset = () => {
    enabled.checked = false;
    method.value = "lof";
    k.input.value = "20";
    sensitivity.input.value = "1.5";
    lofThreshold.input.value = "0";
    radius.input.value = "500";
    minPoints.input.value = "4";
    display.value = "all";
    for (const control of [k, sensitivity, lofThreshold, radius, minPoints]) control.output.textContent = control.input.value;
    showControls();
    schedule();
  };
  for (const control of [k, sensitivity, lofThreshold, radius, minPoints]) control.input.addEventListener("input", () => { control.output.textContent = control.input.value; showControls(); schedule(); });
  method.addEventListener("change", () => { showControls(); schedule(); });
  display.addEventListener("change", emit);
  enabled.addEventListener("change", () => { if (enabled.checked && !flags) request(); emit(); });
  details.addEventListener("toggle", () => { if (details.open && !flags) request(); });
  showControls();
  return { setData, reset, options };
};
