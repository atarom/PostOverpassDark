const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./numeric-histogram.css", import.meta.url).href;
document.head.append(stylesheet);
const BIN_COUNT = 48;
const format = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 8 });
const limit = (value, min, max) => Math.min(max, Math.max(min, value));
export const createNumericHistogram = ({ anchor, minInput, maxInput, getCollection, getValue, onRange }) => {
  const root = document.createElement("section");
  root.className = "pod-histogram";
  root.hidden = true;
  const head = document.createElement("div");
  head.className = "pod-histogram-head";
  const title = document.createElement("strong");
  title.textContent = "Distribución";
  const count = document.createElement("span");
  head.append(title, count);
  const canvas = document.createElement("canvas");
  canvas.className = "pod-histogram-canvas";
  canvas.height = 110;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Distribución numérica. Selecciona un intervalo arrastrando sobre el gráfico o utiliza los controles de mínimo y máximo.");
  const axis = document.createElement("div");
  axis.className = "pod-histogram-axis";
  const first = document.createElement("span");
  const last = document.createElement("span");
  axis.append(first, last);
  const hint = document.createElement("div");
  hint.className = "pod-histogram-hint";
  hint.textContent = "Arrastra para filtrar · Doble clic para restablecer";
  root.append(head, canvas, axis, hint);
  anchor.after(root);
  let source = null;
  let selectedKey = "";
  let lower = 0;
  let upper = 1;
  let total = 0;
  let peak = 0;
  let bins = new Uint32Array(BIN_COUNT);
  let start = null;
  const bounds = () => [Number(minInput.min), Number(maxInput.max)];
  const ratio = (event) => {
    const rect = canvas.getBoundingClientRect();
    return limit((event.clientX - rect.left) / (rect.width || 1), 0, 1);
  };
  const actual = (fraction) => lower + fraction * (upper - lower);
  const redraw = () => {
    if (root.hidden) return;
    const width = Math.round(canvas.getBoundingClientRect().width);
    if (!width) return;
    const height = Math.round(canvas.getBoundingClientRect().height);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * pixelRatio);
    if (canvas.width !== pixelsWide || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = pixelsWide;
      canvas.height = Math.round(height * pixelRatio);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a1410";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#32483a";
    ctx.lineWidth = 1;
    for (const mark of [0.25, 0.5, 0.75]) {
      const y = Math.round((height - 3) * (1 - mark)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    const span = upper - lower;
    const selectedLow = span > 0 ? limit((+minInput.value - lower) / span, 0, 1) : 0;
    const selectedHigh = span > 0 ? limit((+maxInput.value - lower) / span, 0, 1) : 1;
    const left = selectedLow * width;
    const right = selectedHigh * width;
    for (let i = 0; i < BIN_COUNT; i++) {
      const x0 = Math.round(i * width / BIN_COUNT);
      const x1 = Math.round((i + 1) * width / BIN_COUNT);
      const barHeight = peak ? Math.max(1, Math.round(bins[i] / peak * (height - 10))) : 0;
      if (!barHeight) continue;
      ctx.fillStyle = (i + 0.5) / BIN_COUNT >= selectedLow && (i + 0.5) / BIN_COUNT <= selectedHigh ? "#8ac6a3" : "#45614e";
      ctx.fillRect(x0 + 1, height - barHeight - 2, Math.max(1, x1 - x0 - 2), barHeight);
    }
    ctx.strokeStyle = "#bee4bb";
    for (const x of [left, right]) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
    }
  };
  const refresh = () => {
    const collection = getCollection();
    const key = anchor.value;
    const [min, max] = bounds();
    const active = !minInput.disabled && Boolean(key) && Array.isArray(collection?.features) && Number.isFinite(min) && Number.isFinite(max);
    root.hidden = !active;
    if (!active) return;
    if (source !== collection || selectedKey !== key || lower !== min || upper !== max) {
      source = collection;
      selectedKey = key;
      lower = min;
      upper = max;
      total = 0;
      bins = new Uint32Array(BIN_COUNT);
      const span = upper - lower;
      for (const feature of collection.features) {
        const value = getValue(feature, key);
        if (!Number.isFinite(value)) continue;
        const index = span > 0 ? limit(Math.floor((value - lower) / span * BIN_COUNT), 0, BIN_COUNT - 1) : 0;
        bins[index]++;
        total++;
      }
      peak = Math.max(0, ...bins);
      count.textContent = `${format.format(total)} valores`;
      first.textContent = format.format(lower);
      last.textContent = format.format(upper);
    }
    requestAnimationFrame(redraw);
  };
  const setRange = (a, b) => {
    const low = limit(Math.min(a, b), lower, upper);
    const high = limit(Math.max(a, b), lower, upper);
    minInput.value = String(low);
    maxInput.value = String(high);
    onRange();
    redraw();
  };
  const setBrush = (current) => {
    if (start === null) return;
    const a = Math.min(start, current);
    const b = Math.max(start, current);
    const extent = upper - lower;
    if (Math.abs(b - a) < 1 / BIN_COUNT) {
      const midpoint = (a + b) / 2;
      const index = limit(Math.floor(midpoint * BIN_COUNT), 0, BIN_COUNT - 1);
      setRange(lower + index / BIN_COUNT * extent, lower + (index + 1) / BIN_COUNT * extent);
    } else setRange(actual(a), actual(b));
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || upper <= lower) return;
    start = ratio(event);
    canvas.setPointerCapture(event.pointerId);
    setBrush(start);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (start !== null) setBrush(ratio(event));
    else if (total) {
      const index = limit(Math.floor(ratio(event) * BIN_COUNT), 0, BIN_COUNT - 1);
      const begin = actual(index / BIN_COUNT);
      const end = actual((index + 1) / BIN_COUNT);
      canvas.title = `${format.format(begin)} – ${format.format(end)}: ${format.format(bins[index])} objetos`;
    }
  });
  const finish = (event) => {
    if (start === null) return;
    if (event.type === "pointerup") setBrush(ratio(event));
    start = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  canvas.addEventListener("lostpointercapture", () => { start = null; });
  canvas.addEventListener("dblclick", () => setRange(lower, upper));
  new ResizeObserver(redraw).observe(canvas);
  return { refresh, redraw, clear: () => { root.hidden = true; source = null; selectedKey = ""; start = null; } };
};
