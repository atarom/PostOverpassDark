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
  const field = (text, control) => {
    const label = document.createElement("label");
    label.className = "pod-spatial-field";
    label.append(text, control);
    body.append(label);
    return label;
  };
  const mode = document.createElement("select");
  for (const [value, label] of [["auto", "Automático · Rareza"], ["manual", "Manual · k-NN + IQR"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }
  field("Modo", mode);
  const slider = (title, min, max, step, value) => {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const output = document.createElement("output");
    output.textContent = String(value);
    const caption = document.createElement("span");
    caption.className = "pod-spatial-caption";
    caption.append(title, " ", output);
    const label = field(caption, input);
    return { input, output, label };
  };
  const rarity = slider("Rareza mínima", 0, 100, .1, 70);
  const neighbors = slider("Vecinos", 2, 50, 1, 20);
  const sensitivity = slider("Sensibilidad IQR", .5, 4, .1, 1.5);
  const display = document.createElement("select");
  for (const [value, label] of [["all", "Todos · Resaltar raros"], ["isolated", "Solo aislados"], ["normal", "Solo agrupados"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    display.append(option);
  }
  field("Mostrar", display);
  const state = document.createElement("div");
  state.className = "pod-spatial-state";
  state.setAttribute("role", "status");
  const progress = document.createElement("div");
  progress.className = "pod-spatial-progress";
  progress.hidden = true;
  const bar = document.createElement("progress");
  bar.max = 100;
  bar.value = 0;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancelar";
  progress.append(bar, cancel);
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Calcular aislamiento";
  retry.className = "pod-spatial-retry";
  retry.hidden = true;
  const stats = document.createElement("div");
  stats.className = "pod-spatial-stats";
  const hint = document.createElement("div");
  hint.className = "pod-spatial-hint";
  hint.textContent = "Rareza: ordena candidatos por consistencia e intensidad del aislamiento. En 100 no quedan candidatos. No implica un error OSM.";
  const anchorInput = document.createElement("input");
  anchorInput.type = "hidden";
  anchorInput.value = "score";
  const lower = document.createElement("input");
  const upper = document.createElement("input");
  for (const control of [lower, upper]) {
    control.type = "range";
    control.min = "0";
    control.max = "100";
    control.step = "any";
    control.disabled = true;
  }
  const histogramHolder = document.createElement("div");
  histogramHolder.className = "pod-spatial-histogram";
  histogramHolder.append(anchorInput, lower, upper);
  body.append(state, progress, retry, stats, histogramHolder, hint);
  details.append(summary, body);
  anchor.after(details);
  let collection = null;
  let coords = null;
  let pointIndices = [];
  let worker = null;
  let ready = false;
  let busy = false;
  let scores = null;
  let cutoff = NaN;
  let timer = 0;
  let progressTimer = 0;
  let requestId = 0;
  let histogramSource = { features: [] };
  let combinations = 0;
  let sortedScores = null;
  let rarityFrame = 0;
  const histogram = createNumericHistogram({ anchor: anchorInput, minInput: lower, maxInput: upper, getCollection: () => histogramSource, getValue: (index) => scores?.[pointIndices[index]], onRange: () => {} });
  const automatic = () => mode.value === "auto";
  const threshold = () => automatic() ? Number(rarity.input.value) : cutoff;
  const options = () => ({ spatialEnabled: Boolean(enabled.checked && scores), spatialDisplay: display.value, spatialScores: scores, spatialThreshold: threshold(), spatialMethod: automatic() ? "auto" : "knn" });
  const emit = () => onChange?.(options());
  const rarityDisplay = () => { rarity.output.textContent = format.format(Number(rarity.input.value)); };
  const emitRarity = () => {
    cancelAnimationFrame(rarityFrame);
    rarityFrame = requestAnimationFrame(() => { rarityFrame = 0; updateStats(); emit(); });
  };
  const controls = () => {
    rarity.label.hidden = !automatic();
    neighbors.label.hidden = automatic();
    sensitivity.label.hidden = automatic();
    hint.textContent = automatic() ? "Rareza: ordena candidatos por consistencia e intensidad del aislamiento. En 100 no quedan candidatos. No implica un error OSM." : "Distancia al k-ésimo vecino y umbral Q3 + IQR. No implica un error OSM.";
  };
  const stopIndicator = () => {
    clearTimeout(progressTimer);
    progress.hidden = true;
    bar.value = 0;
  };
  const stopWorker = () => {
    worker?.terminate();
    worker = null;
    ready = false;
    busy = false;
    stopIndicator();
  };
  const clearResults = (notify = true) => {
    cancelAnimationFrame(rarityFrame);
    rarityFrame = 0;
    sortedScores = null;
    scores = null;
    cutoff = NaN;
    combinations = 0;
    stats.textContent = "";
    histogram.clear();
    if (notify) emit();
  };
  const countIsolated = () => {
    if (!sortedScores) return 0;
    const limit = threshold();
    let low = 0;
    let high = sortedScores.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (sortedScores[middle] <= limit) low = middle + 1;
      else high = middle;
    }
    return sortedScores.length - low;
  };
  const updateStats = (elapsed = null) => {
    if (!scores) return;
    const isolated = countIsolated();
    const total = pointIndices.length;
    const suffix = automatic() ? ` · ${combinations} ajustes` : ` · Límite ${format.format(cutoff)} m`;
    stats.textContent = `${format.format(isolated)} aislados de ${format.format(total)} (${format.format(isolated / total * 100)} %)${suffix}`;
    if (elapsed !== null) state.textContent = `${format.format(total)} geometrías · ${format.format(elapsed)} ms`;
  };
  const refreshHistogram = () => {
    let maximum = automatic() ? 100 : 0;
    if (!automatic()) for (const index of pointIndices) if (scores[index] > maximum) maximum = scores[index];
    maximum = Math.max(1, maximum);
    lower.max = upper.max = String(maximum);
    lower.value = "0";
    upper.value = String(maximum);
    lower.disabled = upper.disabled = false;
    histogramSource = { features: Array.from({ length: pointIndices.length }, (_, i) => i) };
    histogram.refresh();
  };
  const complete = (result) => {
    if (result.request !== requestId) return;
    busy = false;
    stopIndicator();
    const mapped = new Float64Array(collection.features.length).fill(NaN);
    for (let i = 0; i < pointIndices.length; i++) mapped[pointIndices[i]] = result.scores[i];
    scores = mapped;
    sortedScores = Float64Array.from(pointIndices, (index) => mapped[index]).sort();
    cutoff = result.threshold;
    combinations = result.combinations;
    retry.hidden = true;
    refreshHistogram();
    updateStats(result.elapsed);
    emit();
  };
  const startWorker = () => {
    if (!coords || worker) return;
    worker = new Worker(new URL("./spatial-isolation-worker.js", import.meta.url), { type: "module" });
    const current = worker;
    current.onmessage = ({ data }) => {
      if (current !== worker) return;
      if (data.type === "ready") { ready = true; launch(); }
      if (data.type === "progress" && data.request === requestId) {
        const progressFraction = data.completed / Math.max(1, data.total);
        bar.value = Math.round(data.stage === "Buscando vecinos" ? progressFraction * 80 : 80 + progressFraction * 20);
        if (!progress.hidden) state.textContent = `${data.stage}… ${format.format(data.completed)} / ${format.format(data.total)}`;
      }
      if (data.type === "result") complete(data);
      if (data.type === "error") {
        stopWorker();
        retry.hidden = false;
        state.textContent = `Error: ${data.message}`;
      }
    };
    current.onerror = () => {
      if (current !== worker) return;
      stopWorker();
      retry.hidden = false;
      state.textContent = "No se pudo calcular el aislamiento.";
    };
    current.postMessage({ type: "load", buffer: coords.slice().buffer });
  };
  const launch = () => {
    clearTimeout(timer);
    if (!coords || !(details.open || enabled.checked) || busy) return;
    if (!worker) { startWorker(); return; }
    if (!ready) return;
    busy = true;
    retry.hidden = true;
    const request = ++requestId;
    state.textContent = "Calculando aislamiento…";
    progressTimer = setTimeout(() => { if (busy && request === requestId) progress.hidden = false; }, 180);
    worker.postMessage({ type: "calc", request, settings: currentSettings() });
  };
  const currentSettings = () => ({ mode: mode.value, k: Number(neighbors.input.value), sensitivity: Number(sensitivity.input.value), rarity: Number(rarity.input.value) });
  const restart = () => {
    clearTimeout(timer);
    requestId++;
    stopWorker();
    clearResults();
    if (details.open || enabled.checked) timer = setTimeout(launch, 140);
  };
  const cancelCalculation = () => {
    clearTimeout(timer);
    requestId++;
    stopWorker();
    clearResults();
    state.textContent = "Cálculo cancelado.";
    retry.hidden = !coords;
  };
  const setData = (next) => {
    clearTimeout(timer);
    requestId++;
    stopWorker();
    collection = next?.features ? next : null;
    coords = null;
    pointIndices = [];
    clearResults(false);
    retry.hidden = true;
    if (!collection) { state.textContent = "Ejecuta una consulta para analizar."; return; }
    const points = [];
    for (let i = 0; i < collection.features.length; i++) {
      const point = representativePoint(collection.features[i]?.geometry);
      if (!valid(point)) continue;
      pointIndices.push(i);
      points.push(point[0], point[1]);
    }
    if (pointIndices.length < 3) { state.textContent = "Se necesitan al menos 3 geometrías válidas."; return; }
    coords = new Float64Array(points);
    state.textContent = `${format.format(pointIndices.length)} geometrías disponibles`;
    if (details.open || enabled.checked) launch();
  };
  const reset = () => {
    enabled.checked = false;
    mode.value = "auto";
    neighbors.input.value = "20";
    sensitivity.input.value = "1.5";
    rarity.input.value = "70";
    display.value = "all";
    for (const control of [neighbors, sensitivity]) control.output.textContent = control.input.value;
    rarityDisplay();
    controls();
    restart();
  };
  rarity.input.addEventListener("input", () => {
    rarityDisplay();
    if (automatic() && scores) emitRarity();
  });
  for (const control of [neighbors, sensitivity]) control.input.addEventListener("input", () => {
    control.output.textContent = control.input.value;
    if (!automatic()) restart();
  });
  mode.addEventListener("change", () => { controls(); restart(); });
  display.addEventListener("change", emit);
  enabled.addEventListener("change", () => { if (enabled.checked && !scores) launch(); emit(); });
  details.addEventListener("toggle", () => { if (details.open && !scores && !busy && retry.hidden) launch(); });
  cancel.addEventListener("click", cancelCalculation);
  retry.addEventListener("click", () => { retry.hidden = true; launch(); });
  controls();
  return { setData, reset, options };
};
