import { featureTags, numericValue } from "../analysis/analysis.js";
import { shapeReason } from "../analysis/shape-analysis.js";
import { createIdsExporter } from "../export/ids-export.js";
import { getOsmReference } from "../export/osm-identifiers.js";
const HEIGHT = 48;
const OVERSCAN = 5;
const format = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const fallback = (tags) => tags.leisure === "swimming_pool" ? "Piscina" : tags.building ? "Edificio" : tags.highway ? "Vía" : tags.waterway ? "Curso de agua" : tags.natural ? "Elemento natural" : tags.amenity || tags.shop || "Elemento OSM";
const labelOf = (feature) => {
  const p = feature?.properties || {};
  const tags = featureTags(feature);
  const name = tags.name || tags["name:ca"] || tags["name:es"] || tags.ref || fallback(tags);
  const reference = getOsmReference(feature);
  const type = reference?.type || p.osm_type || p.type || "";
  const id = reference?.id ?? p.osm_id ?? p.id ?? feature.id ?? "";
  const ref = String(id).includes("/") ? String(id) : type && id !== "" ? `${type}/${id}` : String(id);
  return { name: String(name), ref };
};
const readPreference = (key) => { try { return localStorage.getItem(`postoverpassdark:results-${key}`); } catch { return null; } };
const savePreference = (key, value) => { try { localStorage.setItem(`postoverpassdark:results-${key}`, String(value)); } catch {} };
export const createResultsList = ({ container, controller, getIds }) => {
  const app = container.closest(".app");
  const mapbox = app.querySelector(".mapbox");
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./results-panel.css", import.meta.url).href;
  document.head.append(stylesheet);
  const panel = document.createElement("aside");
  panel.id = "podResultsPanel";
  panel.className = "pod-results-panel";
  panel.setAttribute("aria-labelledby", "podResultsTitle");
  panel.hidden = true;
  const heading = document.createElement("div");
  heading.className = "pod-results-head";
  const title = document.createElement("strong");
  title.id = "podResultsTitle";
  title.textContent = "Elementos";
  const amount = document.createElement("span");
  amount.className = "pod-results-amount";
  amount.setAttribute("aria-live", "polite");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.title = "Ocultar elementos";
  close.setAttribute("aria-label", close.title);
  const viewLock = document.createElement("button");
  viewLock.type = "button";
  viewLock.className = "pod-results-view-lock";
  viewLock.setAttribute("aria-label", "Bloquear zoom y centrado automáticos");
  viewLock.setAttribute("aria-pressed", "false");
  viewLock.title = "Bloquear zoom y centrado automáticos";
  viewLock.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path class="pod-lock-open" d="M8 11V7a4 4 0 0 1 8 0"/><path class="pod-lock-closed" d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/></svg>';
  heading.append(title, amount, viewLock, close);
  const body = document.createElement("div");
  body.className = "pod-results-body";
  const actions = document.createElement("div");
  actions.className = "pod-results-actions";
  actions.hidden = true;
  const hint = document.createElement("span");
  hint.textContent = "Selecciona para localizar";
  viewLock.onclick = () => {
    const locked = viewLock.getAttribute("aria-pressed") !== "true";
    viewLock.setAttribute("aria-pressed", String(locked));
    viewLock.title = locked ? "Activar zoom y centrado automáticos" : "Bloquear zoom y centrado automáticos";
    hint.textContent = locked ? "Vista bloqueada" : "Selecciona para localizar";
    controller.setResultViewLocked(locked);
  };
  const all = document.createElement("button");
  all.type = "button";
  all.textContent = "⛶ Todos";
  all.title = "Deseleccionar y mostrar todos los elementos cargados";
  actions.append(hint, all);
  const sortBar = document.createElement("div");
  sortBar.className = "pod-results-sort";
  sortBar.hidden = true;
  const metricLabel = document.createElement("label");
  metricLabel.textContent = "Ordenar por ";
  const metric = document.createElement("select");
  metric.setAttribute("aria-label", "Característica para ordenar");
  metricLabel.append(metric);
  const metricName = document.createElement("span");
  metricName.className = "pod-results-sort-name";
  const directionLabel = document.createElement("label");
  directionLabel.textContent = "Orden ";
  const direction = document.createElement("select");
  direction.setAttribute("aria-label", "Sentido de ordenación");
  for (const [value, label] of [["asc", "Menor → mayor"], ["desc", "Mayor → menor"], ["original", "Original"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    direction.append(option);
  }
  directionLabel.append(direction);
  sortBar.append(metricLabel, metricName, directionLabel);
  const scroller = document.createElement("div");
  scroller.className = "pod-results-scroller";
  scroller.setAttribute("aria-label", "Lista de entidades");
  const upper = document.createElement("div");
  const lower = document.createElement("div");
  upper.className = lower.className = "pod-results-spacer";
  upper.setAttribute("aria-hidden", "true");
  lower.setAttribute("aria-hidden", "true");
  const empty = document.createElement("div");
  empty.className = "pod-results-empty";
  empty.textContent = "Ejecuta una consulta para ver sus elementos.";
  scroller.append(upper, empty, lower);
  body.append(actions, sortBar, scroller);
  panel.append(heading, body);
  const resizer = document.createElement("div");
  resizer.className = "pod-results-resizer";
  resizer.hidden = true;
  resizer.tabIndex = 0;
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-controls", panel.id);
  resizer.setAttribute("aria-label", "Ajustar anchura de elementos");
  resizer.title = "Arrastra para ajustar la anchura; doble clic para restaurar";
  app.insertBefore(panel, mapbox);
  app.insertBefore(resizer, mapbox);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pod-results-toggle";
  toggle.setAttribute("aria-controls", panel.id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15m3-11h5m-5 4h5m-5 4h5"/></svg>';
  (mapbox.querySelector(".pod-sidebar-control") || mapbox).append(toggle);
  const desktop = matchMedia("(min-width: 1050px)");
  let manualOpen = false;
  let dismissed = false;
  let filterActive = false;
  let desiredWidth = Math.max(240, Number(readPreference("width")) || 300);
  let dragging = null;
  const visible = () => !panel.hidden;
  const syncWidth = () => {
    app.style.setProperty("--pod-results-width", `${Math.round(desiredWidth)}px`);
    const max = Math.max(240, app.clientWidth - (app.classList.contains("pod-sidebar-hidden") ? 328 : 656));
    resizer.setAttribute("aria-valuemin", "240");
    resizer.setAttribute("aria-valuemax", String(max));
    resizer.setAttribute("aria-valuenow", String(Math.round(Math.max(240, Math.min(max, desiredWidth)))));
  };
  let collection = null;
  let opts = {};
  let entries = [];
  let scan = 0;
  let paint = 0;
  let first = -1;
  let last = -1;
  let selected = null;
  const idsExporter = createIdsExporter({ getIds });
  const modeNames = { length: "Longitud", area: "Superficie", perimeter: "Perímetro", vertices: "Vértices", shape: "Forma" };
  const availableMetrics = () => [
    ...(opts.geometryEnabled && opts.geometryValues ? [{ key: "geometry", label: opts.geometryMode === "shape" ? { anomaly: "Forma · Anomalías", compactness: "Forma · Compacidad", irregularity: "Forma · Irregularidad" }[opts.geometryShapeType] || "Forma" : modeNames[opts.geometryMode] || "Geometría" }] : []),
    ...(opts.numericEnabled && opts.numericKey ? [{ key: "numeric", label: opts.numericKey }] : []),
    ...(opts.spatialEnabled && opts.spatialScores ? [{ key: "spatial", label: opts.spatialMethod === "auto" ? "Aislamiento · Rareza" : opts.spatialMethod === "distance" ? "Aislamiento · Distancia mínima" : "Aislamiento · Distancia" }] : [])
  ];
  const selectedMetric = () => availableMetrics().find(({ key }) => key === metric.value)?.key || "";
  const getMetricValue = (index, key = selectedMetric()) => {
    if (key === "geometry") return opts.geometryValues?.[index] ?? NaN;
    if (key === "spatial") return opts.spatialScores?.[index] ?? NaN;
    if (key === "numeric") return numericValue(featureTags(collection?.features[index])[opts.numericKey]);
    return NaN;
  };
  const syncSort = () => {
    const choices = availableMetrics();
    const previous = metric.value;
    metric.replaceChildren(...choices.map(({ key, label }) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      return option;
    }));
    if (choices.some(({ key }) => key === previous)) metric.value = previous;
    sortBar.hidden = !collection || !choices.length;
    metricLabel.hidden = choices.length < 2;
    metricName.hidden = choices.length !== 1;
    metricName.textContent = choices.length === 1 ? `Por: ${choices[0].label}` : "";
  };
  const sortEntries = () => {
    const key = selectedMetric();
    if (!key || direction.value === "original") entries.sort((a, b) => a - b);
    else {
      const values = new Map(entries.map((index) => [index, getMetricValue(index, key)]));
      const sign = direction.value === "desc" ? -1 : 1;
      entries.sort((a, b) => {
        const firstValue = values.get(a);
        const secondValue = values.get(b);
        const firstValid = Number.isFinite(firstValue);
        const secondValid = Number.isFinite(secondValue);
        if (firstValid !== secondValid) return firstValid ? -1 : 1;
        return firstValid && secondValid ? (firstValue - secondValue) * sign || a - b : a - b;
      });
    }
    scroller.scrollTop = 0;
    first = last = -1;
    render();
  };
  const displayMeasure = (index) => {
    const key = selectedMetric();
    const val = getMetricValue(index, key);
    if (!Number.isFinite(val)) return "";
    if (key === "geometry") {
      if (opts.geometryMode === "shape") return opts.geometryShapeType === "anomaly" ? `${format.format(val)} %` : format.format(val);
      return `${format.format(val)}${opts.geometryMode === "area" ? " m²" : opts.geometryMode === "vertices" ? "" : " m"}`;
    }
    if (key === "spatial") {
      if (opts.spatialMethod === "distance") {
        const meters = opts.spatialDistances?.[index];
        return Number.isFinite(meters) ? meters >= 1000 ? `${format.format(meters / 1000)} km` : `${format.format(meters)} m` : "";
      }
      return `${format.format(val)}${opts.spatialMethod === "auto" ? " %" : " m"}`;
    }
    return format.format(val);
  };
  const makeRow = (pos) => {
    const index = entries[pos];
    const { name, ref } = labelOf(collection.features[index]);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "pod-result-row";
    row.dataset.position = String(pos);
    row.setAttribute("aria-pressed", String(index === selected));
    row.title = ref ? `${name} · ${ref}` : name;
    const info = document.createElement("span");
    info.className = "pod-result-info";
    const strong = document.createElement("span");
    strong.className = "pod-result-title";
    strong.textContent = name;
    const id = document.createElement("span");
    id.className = "pod-result-id";
    id.textContent = ref;
    if (opts.geometryEnabled && opts.geometryMode === "shape" && opts.geometryShapeType === "anomaly") {
      const reason = shapeReason(opts.geometryReasons?.[index] || 0);
      id.textContent = `${ref} · ${reason}`;
      row.title = `${name} · ${ref} · ${reason}`;
    }
    info.append(strong, id);
    const measure = document.createElement("span");
    measure.className = "pod-result-measure";
    measure.textContent = displayMeasure(index);
    row.append(info, measure);
    const item = document.createElement("div");
    item.className = "pod-result-item";
    item.append(row);
    const reference = getOsmReference(collection.features[index]);
    if (filterActive && reference?.type && reference?.id) {
      const purge = document.createElement("button");
      purge.type = "button";
      purge.className = "pod-result-purge";
      purge.dataset.purgePosition = String(pos);
      purge.title = `Purgar ${ref} de POD (no modifica OSM)`;
      purge.setAttribute("aria-label", purge.title);
      purge.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="m9 9 6 6m0-6-6 6"/></svg>';
      item.append(purge);
    }
    return item;
  };
  const render = (focus = -1) => {
    cancelAnimationFrame(paint);
    paint = 0;
    if (!visible() || !entries.length) return;
    const start = Math.max(0, Math.floor(scroller.scrollTop / HEIGHT) - OVERSCAN);
    const end = Math.min(entries.length, Math.ceil((scroller.scrollTop + (scroller.clientHeight || HEIGHT * 5)) / HEIGHT) + OVERSCAN);
    if (first !== start || last !== end || focus >= 0) {
      const top = scroller.scrollTop;
      const nodes = [];
      for (let i = start; i < end; i++) nodes.push(makeRow(i));
      upper.style.height = `${start * HEIGHT}px`;
      lower.style.height = `${(entries.length - end) * HEIGHT}px`;
      scroller.replaceChildren(upper, ...nodes, lower);
      scroller.scrollTop = top;
      first = start;
      last = end;
    } else {
      for (const row of scroller.querySelectorAll(".pod-result-row")) row.setAttribute("aria-pressed", String(entries[Number(row.dataset.position)] === selected));
    }
    upper.style.height = `${start * HEIGHT}px`;
    lower.style.height = `${(entries.length - end) * HEIGHT}px`;
    if (focus >= 0) scroller.querySelector(`[data-position="${focus}"]`)?.focus({ preventScroll: true });
  };
  const schedulePaint = () => { if (!paint) paint = requestAnimationFrame(() => render()); };
  const resetRows = (message = "") => {
    entries = [];
    scroller.scrollTop = 0;
    first = last = -1;
    upper.style.height = lower.style.height = "0px";
    empty.textContent = message;
    scroller.replaceChildren(upper, ...(message ? [empty] : []), lower);
  };
  const calculate = () => {
    resetRows("Calculando…");
    amount.textContent = "…";
    const source = controller.getResultSource();
    let position = 0;
    let count = 0;
    const step = () => {
      const end = Math.min(source.length, position + 4500);
      for (; position < end; position++) if (controller.isResultMatch(source[position])) {
        count++;
        entries.push(source[position].get("podIndex"));
      }
      if (position < source.length) scan = requestAnimationFrame(step);
      else {
        scan = 0;
        amount.textContent = count.toLocaleString("es-ES");
        if (visible()) {
          if (count) sortEntries();
          else resetRows("Ningún elemento coincide con los filtros.");
        }
      }
    };
    scan = requestAnimationFrame(step);
  };
  const refresh = (next = opts) => {
    opts = next || {};
    syncSort();
    cancelAnimationFrame(scan);
    scan = 0;
    actions.hidden = !collection;
    const active = Boolean(collection && controller.hasResultFilter());
    if (active !== filterActive) { dismissed = false; filterActive = active; }
    title.textContent = active ? "Elementos filtrados" : "Elementos";
    setVisible(manualOpen || (active && !dismissed));
    if (!collection) {
      amount.textContent = "";
      resetRows("Ejecuta una consulta para ver sus elementos.");
      if (selected !== null) { controller.clearResultSelection(); selected = null; }
      idsExporter.refresh();
      return;
    }
    if (selected !== null && !controller.isSelectedResultMatch()) { controller.clearResultSelection(); selected = null; }
    idsExporter.refresh();
    if (visible()) calculate();
    else {
      amount.textContent = "…";
      resetRows();
    }
  };
  const setData = (next, nextOpts) => {
    cancelAnimationFrame(scan);
    collection = next?.features ? next : null;
    filterActive = false;
    dismissed = false;
    direction.value = "asc";
    selected = null;
    idsExporter.setData(Boolean(collection));
    refresh(nextOpts);
  };
  const clear = () => {
    cancelAnimationFrame(scan);
    cancelAnimationFrame(paint);
    scan = paint = 0;
    collection = null;
    selected = null;
    filterActive = dismissed = false;
    setVisible(manualOpen);
    idsExporter.setData(false);
    actions.hidden = sortBar.hidden = true;
    title.textContent = "Elementos";
    amount.textContent = "";
    resetRows("Ejecuta una consulta para ver sus elementos.");
  };
  const setVisible = (open) => {
    const changed = visible() !== open;
    panel.hidden = !open;
    resizer.hidden = !open || !desktop.matches;
    app.classList.toggle("pod-results-visible", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = open ? "Ocultar elementos" : "Mostrar elementos";
    toggle.setAttribute("aria-label", toggle.title);
    syncWidth();
    if (changed) requestAnimationFrame(() => controller.map?.updateSize());
  };
  const resizeTo = (value, persist = false) => {
    const max = Math.max(240, app.clientWidth - (app.classList.contains("pod-sidebar-hidden") ? 328 : 656));
    desiredWidth = Math.max(240, Math.min(max, Math.round(value)));
    syncWidth();
    if (persist) savePreference("width", desiredWidth);
  };
  const hide = () => { manualOpen = false; dismissed = filterActive; refresh(); };
  toggle.onclick = () => {
    if (visible()) hide();
    else { manualOpen = !filterActive; dismissed = false; refresh(); }
  };
  close.onclick = () => { hide(); toggle.focus(); };
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); hide(); toggle.focus(); } });
  desktop.addEventListener("change", () => { setVisible(visible()); schedulePaint(); });
  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !desktop.matches) return;
    event.preventDefault();
    dragging = { id: event.pointerId, x: event.clientX, width: panel.getBoundingClientRect().width };
    resizer.setPointerCapture(event.pointerId);
    app.classList.add("pod-results-resizing");
  });
  resizer.addEventListener("pointermove", (event) => { if (dragging?.id === event.pointerId) resizeTo(dragging.width + event.clientX - dragging.x); });
  const finishResize = (event) => {
    if (dragging?.id !== event.pointerId) return;
    dragging = null;
    app.classList.remove("pod-results-resizing");
    savePreference("width", desiredWidth);
    if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
  };
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) resizer.addEventListener(name, finishResize);
  resizer.addEventListener("keydown", (event) => {
    const width = panel.getBoundingClientRect().width;
    const step = event.shiftKey ? 60 : 24;
    if (event.key === "ArrowLeft") resizeTo(width - step, true);
    else if (event.key === "ArrowRight") resizeTo(width + step, true);
    else if (event.key === "Home") resizeTo(240, true);
    else if (event.key === "End") resizeTo(Infinity, true);
    else return;
    event.preventDefault();
  });
  resizer.addEventListener("dblclick", () => resizeTo(300, true));
  new ResizeObserver(() => { if (visible()) schedulePaint(); }).observe(scroller);
  new ResizeObserver(() => { syncWidth(); controller.map?.updateSize(); }).observe(mapbox);
  addEventListener("resize", syncWidth);
  metric.addEventListener("change", () => { if (!scan && visible()) sortEntries(); });
  direction.addEventListener("change", () => { if (!scan && visible()) sortEntries(); });
  scroller.addEventListener("scroll", schedulePaint, { passive: true });
  scroller.addEventListener("click", (event) => {
    const purge = event.target.closest(".pod-result-purge");
    if (purge) {
      const index = entries[Number(purge.dataset.purgePosition)];
      if (filterActive && index !== undefined) controller.requestResultPurge(index);
      return;
    }
    const row = event.target.closest(".pod-result-row");
    if (!row) return;
    const index = entries[Number(row.dataset.position)];
    if (index === undefined) return;
    selected = controller.selectResult(index);
    idsExporter.refresh();
    render();
    if (selected !== null && !desktop.matches) { hide(); toggle.focus(); }
  });
  scroller.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const row = event.target.closest(".pod-result-row");
    if (!row || !entries.length) return;
    event.preventDefault();
    const current = Number(row.dataset.position);
    const pos = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : Math.max(0, Math.min(entries.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    scroller.scrollTop = Math.max(0, Math.min((entries.length - 1) * HEIGHT, pos * HEIGHT - scroller.clientHeight / 2));
    render(pos);
  });
  all.onclick = () => { controller.clearResultSelection(true); selected = null; idsExporter.refresh(); render(); };
  const clearSelected = () => { selected = null; render(); };
  setVisible(false);
  return { refresh, setData, clear, clearSelected };
};
