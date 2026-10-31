import { originalPostpassGeoJSON } from "./response.js";
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./data-viewer.css", import.meta.url).href;
document.head.append(stylesheet);
const PAGE_SIZE = 51200;
const FEATURES_PER_PAGE = 10;
const yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0));
export const createDataViewer = ({ data, dataView, dataOutput, copyButton, getGeo }) => {
  const tools = dataView.parentElement;
  tools.classList.add("pod-data-tools");
  const showButton = document.createElement("button");
  showButton.type = "button";
  showButton.textContent = "Mostrar";
  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.textContent = "Descargar";
  copyButton.textContent = "Copiar todo";
  tools.insertBefore(showButton, copyButton);
  tools.append(downloadButton);
  const meta = document.createElement("div");
  meta.className = "pod-data-meta";
  meta.setAttribute("aria-live", "polite");
  dataOutput.before(meta);
  const pager = document.createElement("div");
  pager.className = "pod-data-pager";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "Anterior";
  const pagination = document.createElement("span");
  pagination.setAttribute("aria-live", "polite");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Siguiente";
  pager.append(previous, pagination, next);
  dataOutput.after(pager);
  const message = document.createElement("div");
  message.className = "pod-data-meta";
  message.setAttribute("role", "status");
  message.hidden = true;
  pager.after(message);
  const processing = document.createElement("div");
  processing.className = "ov pod-data-ov";
  processing.hidden = true;
  const box = document.createElement("div");
  box.className = "ot";
  box.setAttribute("role", "status");
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "×";
  dismiss.title = "Ocultar el indicador (la operación continúa)";
  dismiss.setAttribute("aria-label", dismiss.title);
  const progress = document.createElement("pre");
  box.append(dismiss, progress);
  processing.append(box);
  document.body.append(processing);
  let active = null;
  let generation = 0;
  const views = { raw: { shown: false, page: 0, content: "" }, geojson: { shown: false, page: 0, content: "" } };
  const mode = () => dataView.value;
  const geoFeatures = () => Array.isArray(getGeo()?.features) ? getGeo().features : [];
  const geoText = () => originalPostpassGeoJSON(getGeo());
  const pages = (key) => key === "raw" ? Math.max(1, Math.ceil((data.raw || "").length / PAGE_SIZE)) : geoText() !== null ? Math.max(1, Math.ceil(geoText().length / PAGE_SIZE)) : Math.max(1, Math.ceil(geoFeatures().length / FEATURES_PER_PAGE));
  const available = (key) => key === "geojson" ? Boolean(getGeo()) : Boolean(data[key]);
  const resetMessage = () => { message.hidden = true; message.textContent = ""; };
  const feedback = (text, error = false) => {
    message.textContent = text;
    message.hidden = false;
    message.style.color = error ? "var(--d)" : "var(--ok)";
  };
  const cancel = () => {
    generation++;
    if (active) {
      active.abort.abort();
      active.worker?.terminate();
      active = null;
    }
    processing.hidden = true;
    for (const node of [showButton, copyButton, downloadButton, previous, next]) node.disabled = false;
  };
  const run = async (label, action) => {
    if (active) return;
    resetMessage();
    const job = { abort: new AbortController(), worker: null, id: ++generation };
    active = job;
    for (const node of [showButton, copyButton, downloadButton, previous, next]) node.disabled = true;
    const timer = setTimeout(() => {
      if (active === job && document.getElementById("ov")?.hidden !== false) {
        progress.textContent = label;
        processing.hidden = false;
      }
    }, 1000);
    try {
      await action(job);
    } catch (error) {
      if (!job.abort.signal.aborted) feedback(error?.message || String(error), true);
    } finally {
      clearTimeout(timer);
      if (job.worker) { job.worker.terminate(); job.worker = null; }
      if (active === job) {
        active = null;
        processing.hidden = true;
        for (const node of [showButton, copyButton, downloadButton, previous, next]) node.disabled = false;
        sync();
      }
    }
  };
  const workerResult = (job, worker, expected) => new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Operación cancelada", "AbortError"));
    job.abort.signal.addEventListener("abort", abort, { once: true });
    const settle = (fn, value) => {
      job.abort.signal.removeEventListener("abort", abort);
      fn(value);
    };
    worker.onmessage = ({ data: response }) => {
      if (response.action === "error") settle(reject, Error(response.message));
      else if (response.action === expected) settle(resolve, response);
    };
    worker.onerror = (event) => { event.preventDefault(); settle(reject, Error("No se pudo procesar el GeoJSON")); };
  });
  const createWorker = (job) => {
    if (typeof Worker !== "function") throw Error("Este navegador no admite el procesamiento en segundo plano");
    const worker = new Worker(new URL("./data-export-worker.js", import.meta.url));
    job.worker = worker;
    return worker;
  };
  const geoBlob = async (job) => {
    const geo = getGeo();
    if (!geo || !Array.isArray(geo.features)) throw Error("No hay GeoJSON disponible");
    const worker = createWorker(job);
    const complete = workerResult(job, worker, "blob");
    complete.catch(() => {});
    const metadata = {};
    for (const key of Object.keys(geo)) if (key !== "features") metadata[key] = geo[key];
    worker.postMessage({ action: "begin", meta: metadata });
    for (let i = 0; i < geo.features.length; i += 64) {
      if (job.abort.signal.aborted) throw new DOMException("Operación cancelada", "AbortError");
      worker.postMessage({ action: "batch", features: geo.features.slice(i, i + 64) });
      if (i % 512 === 0) await yieldTask();
    }
    worker.postMessage({ action: "finish" });
    const result = await complete;
    if (job.abort.signal.aborted) throw new DOMException("Operación cancelada", "AbortError");
    return result.blob;
  };
  const blobFor = (job, key) => key === "geojson" ? geoText() !== null ? Promise.resolve(new Blob([geoText()], { type: "application/geo+json;charset=utf-8" })) : geoBlob(job) : Promise.resolve(new Blob([data[key] || ""], { type: "text/plain;charset=utf-8" }));
  const filename = (key) => {
    if (key === "geojson") return "datos.geojson";
    if (key === "raw") return /^\s*</.test(data.raw) ? "respuesta.xml" : /^\s*[\[{]/.test(data.raw) ? "respuesta.json" : "respuesta.txt";
    return /^\s*(?:SELECT|WITH|EXPLAIN)\b/i.test(data.query) ? "consulta.sql" : "consulta.ql";
  };
  const sync = () => {
    const key = mode();
    const exists = available(key);
    const isQuery = key === "query";
    const state = views[key];
    showButton.hidden = isQuery || !exists;
    showButton.textContent = state?.shown ? "Ocultar" : "Mostrar";
    showButton.setAttribute("aria-pressed", String(Boolean(state?.shown)));
    copyButton.disabled = !exists || Boolean(active);
    downloadButton.disabled = !exists || Boolean(active);
    meta.hidden = isQuery || !exists;
    if (!meta.hidden) meta.textContent = key === "raw" ? `Respuesta original · ${(data.raw || "").length.toLocaleString("es-ES")} caracteres` : `GeoJSON · ${geoFeatures().length.toLocaleString("es-ES")} entidades`;
    pager.hidden = isQuery || !exists || !state?.shown || pages(key) <= 1;
    if (!pager.hidden) {
      pagination.textContent = `Página ${state.page + 1} de ${pages(key).toLocaleString("es-ES")}`;
      previous.disabled = Boolean(active) || state.page <= 0;
      next.disabled = Boolean(active) || state.page >= pages(key) - 1;
    }
  };
  const display = () => {
    const key = mode();
    const state = views[key];
    if (key === "query") dataOutput.textContent = data.query || "Sin datos.";
    else if (!available(key)) dataOutput.textContent = "Sin datos.";
    else if (!state.shown) dataOutput.textContent = "Pulsa «Mostrar» para consultar una vista previa. Copiar y Descargar incluyen los datos completos.";
    else dataOutput.textContent = state.content;
    dataOutput.scrollTop = 0;
    sync();
  };
  const paintRaw = () => {
    const state = views.raw;
    const start = state.page * PAGE_SIZE;
    state.content = (data.raw || "").slice(start, start + PAGE_SIZE);
    display();
  };
  const paintGeo = (page) => {
    const source = geoText();
    if (source !== null) {
      views.geojson.page = page;
      views.geojson.shown = true;
      views.geojson.content = source.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      if (mode() === "geojson") display();
      return;
    }
    return run("Preparando vista previa GeoJSON…", async (job) => {
      const features = geoFeatures();
      const start = page * FEATURES_PER_PAGE;
      const worker = createWorker(job);
      const complete = workerResult(job, worker, "preview");
      worker.postMessage({ action: "preview", features: features.slice(start, start + FEATURES_PER_PAGE) });
      const result = await complete;
      if (job.abort.signal.aborted) return;
      views.geojson.page = page;
      views.geojson.shown = true;
      views.geojson.content = `Entidades ${start + 1}–${Math.min(start + FEATURES_PER_PAGE, features.length)} de ${features.length}\n\n${result.text || "Sin entidades."}`;
      if (mode() === "geojson") display();
    });
  };
  const show = () => {
    if (active) return;
    resetMessage();
    const key = mode();
    if (key === "query") return display();
    const state = views[key];
    if (!state.shown || !state.content) return display();
    display();
  };
  const togglePreview = () => {
    const key = mode();
    if (key === "query" || !available(key) || active) return;
    const state = views[key];
    if (state.shown) { state.shown = false; display(); return; }
    if (key === "raw") { state.shown = true; paintRaw(); }
    else void paintGeo(state.page);
  };
  const changePage = (delta) => {
    const key = mode();
    if (key === "query" || active || !views[key]?.shown) return;
    const state = views[key];
    const page = Math.max(0, Math.min(pages(key) - 1, state.page + delta));
    if (page === state.page) return;
    if (key === "raw") { state.page = page; paintRaw(); }
    else void paintGeo(page);
  };
  const copy = () => run("Preparando datos para copiar…", async (job) => {
    if (!navigator.clipboard?.write && !navigator.clipboard?.writeText) throw Error("Portapapeles no disponible");
    const key = mode();
    if (!available(key)) return;
    if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
      const blob = blobFor(job, key).then((part) => new Blob([part], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    } else {
      const blob = await blobFor(job, key);
      if (job.abort.signal.aborted) return;
      await navigator.clipboard.writeText(await blob.text());
    }
    if (!job.abort.signal.aborted) feedback("Datos completos copiados.");
  });
  const download = () => run("Preparando archivo para descargar…", async (job) => {
    const key = mode();
    if (!available(key)) return;
    const blob = await blobFor(job, key);
    if (job.abort.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename(key);
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    feedback("Descarga preparada.");
  });
  const resetPreview = (key) => {
    cancel();
    if (views[key]) views[key] = { shown: false, page: 0, content: "" };
    resetMessage();
  };
  const reset = () => {
    cancel();
    for (const key of Object.keys(views)) views[key] = { shown: false, page: 0, content: "" };
    resetMessage();
  };
  showButton.addEventListener("click", togglePreview);
  previous.addEventListener("click", () => changePage(-1));
  next.addEventListener("click", () => changePage(1));
  downloadButton.addEventListener("click", () => void download());
  dismiss.addEventListener("click", () => { processing.hidden = true; });
  sync();
  return { show, copy, reset, resetPreview };
};
