import { featureTags, numericValue } from "./analysis.js";
const HEIGHT = 48;
const OVERSCAN = 5;
const format = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const fallback = (tags) => tags.leisure === "swimming_pool" ? "Piscina" : tags.building ? "Edificio" : tags.highway ? "Vía" : tags.waterway ? "Curso de agua" : tags.natural ? "Elemento natural" : tags.amenity || tags.shop || "Elemento OSM";
const labelOf = (feature) => {
  const p = feature?.properties || {};
  const tags = featureTags(feature);
  const name = tags.name || tags["name:ca"] || tags["name:es"] || tags.ref || fallback(tags);
  const type = { W: "way", R: "relation", N: "node" }[p.osm_type] || p.osm_type || p.type || "";
  const id = p.osm_id ?? p.id ?? feature.id ?? "";
  const ref = String(id).includes("/") ? String(id) : type && id !== "" ? `${type}/${id}` : String(id);
  return { name: String(name), ref };
};
export const createResultsList = ({ container, controller }) => {
  const details = document.createElement("details");
  details.className = "analysis-box pod-results";
  details.hidden = true;
  const heading = document.createElement("summary");
  const title = document.createElement("span");
  title.textContent = "Resultados filtrados";
  const amount = document.createElement("span");
  amount.className = "pod-results-amount";
  heading.append(title, amount);
  const body = document.createElement("div");
  body.className = "pod-results-body";
  const actions = document.createElement("div");
  actions.className = "pod-results-actions";
  const hint = document.createElement("span");
  hint.textContent = "Selecciona para localizar";
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
  scroller.setAttribute("aria-label", "Lista de entidades filtradas");
  const upper = document.createElement("div");
  const lower = document.createElement("div");
  upper.className = lower.className = "pod-results-spacer";
  upper.setAttribute("aria-hidden", "true");
  lower.setAttribute("aria-hidden", "true");
  scroller.append(upper, lower);
  body.append(actions, sortBar, scroller);
  details.append(heading, body);
  container.append(details);
  let collection = null;
  let opts = {};
  let entries = [];
  let scan = 0;
  let countTimer = 0;
  let paint = 0;
  let first = -1;
  let last = -1;
  let selected = null;
  const modeNames = { length: "Longitud", area: "Superficie", perimeter: "Perímetro", vertices: "Vértices" };
  const availableMetrics = () => [
    ...(opts.geometryEnabled && opts.geometryValues ? [{ key: "geometry", label: modeNames[opts.geometryMode] || "Geometría" }] : []),
    ...(opts.numericEnabled && opts.numericKey ? [{ key: "numeric", label: opts.numericKey }] : [])
  ];
  const selectedMetric = () => availableMetrics().find(({ key }) => key === metric.value)?.key || "";
  const getMetricValue = (index, key = selectedMetric()) => {
    if (key === "geometry") return opts.geometryValues?.[index] ?? NaN;
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
    sortBar.hidden = !choices.length;
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
    if (key === "geometry") return `${format.format(val)}${opts.geometryMode === "area" ? " m²" : opts.geometryMode === "vertices" ? "" : " m"}`;
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
    info.append(strong, id);
    const measure = document.createElement("span");
    measure.className = "pod-result-measure";
    measure.textContent = displayMeasure(index);
    row.append(info, measure);
    return row;
  };
  const render = (focus = -1) => {
    cancelAnimationFrame(paint);
    paint = 0;
    const start = Math.max(0, Math.floor(scroller.scrollTop / HEIGHT) - OVERSCAN);
    const end = Math.min(entries.length, Math.ceil((scroller.scrollTop + (scroller.clientHeight || HEIGHT * 5)) / HEIGHT) + OVERSCAN);
    if (first !== start || last !== end || focus >= 0) {
      const nodes = [];
      for (let i = start; i < end; i++) nodes.push(makeRow(i));
      scroller.replaceChildren(upper, ...nodes, lower);
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
  const calculate = (collect) => {
    if (collect) {
      entries = [];
      scroller.scrollTop = 0;
      first = last = -1;
      scroller.replaceChildren(upper, lower);
    }
    amount.textContent = " · Calculando…";
    const source = controller.getResultSource();
    let position = 0;
    let count = 0;
    const step = () => {
      const end = Math.min(source.length, position + 4500);
      for (; position < end; position++) if (controller.isResultMatch(source[position])) {
        count++;
        if (collect) entries.push(source[position].get("podIndex"));
      }
      if (position < source.length) scan = requestAnimationFrame(step);
      else {
        scan = 0;
        amount.textContent = ` · ${count.toLocaleString("es-ES")}`;
        if (collect && details.open) {
          sortEntries();
          if (!count) {
            const empty = document.createElement("div");
            empty.className = "pod-results-empty";
            empty.textContent = "Ningún elemento coincide con los filtros.";
            scroller.append(empty);
          }
        }
      }
    };
    scan = requestAnimationFrame(step);
  };
  const refresh = (next = opts) => {
    opts = next || {};
    syncSort();
    cancelAnimationFrame(scan);
    clearTimeout(countTimer);
    scan = countTimer = 0;
    const active = Boolean(collection && controller.hasResultFilter());
    details.hidden = !active;
    if (!active) {
      details.open = false;
      amount.textContent = "";
      entries = [];
      scroller.replaceChildren(upper, lower);
      first = last = -1;
      if (selected !== null) { controller.clearResultSelection(); selected = null; }
      return;
    }
    if (selected !== null && !controller.isSelectedResultMatch()) { controller.clearResultSelection(); selected = null; }
    if (details.open) calculate(true);
    else {
      amount.textContent = " · …";
      entries = [];
      scroller.replaceChildren(upper, lower);
      first = last = -1;
      countTimer = setTimeout(() => { countTimer = 0; if (!details.open) calculate(false); }, 160);
    }
  };
  const setData = (next, nextOpts) => {
    cancelAnimationFrame(scan);
    clearTimeout(countTimer);
    collection = next?.features ? next : null;
    direction.value = "asc";
    selected = null;
    details.open = false;
    refresh(nextOpts);
  };
  const clear = () => {
    cancelAnimationFrame(scan);
    clearTimeout(countTimer);
    cancelAnimationFrame(paint);
    scan = paint = countTimer = 0;
    collection = null;
    entries = [];
    selected = null;
    details.open = false;
    details.hidden = true;
    amount.textContent = "";
    first = last = -1;
    scroller.replaceChildren(upper, lower);
  };
  details.addEventListener("toggle", () => { if (collection) refresh(opts); });
  metric.addEventListener("change", () => { if (!scan) sortEntries(); });
  direction.addEventListener("change", () => { if (!scan) sortEntries(); });
  scroller.addEventListener("scroll", schedulePaint, { passive: true });
  scroller.addEventListener("click", (event) => {
    const row = event.target.closest(".pod-result-row");
    if (!row) return;
    const index = entries[Number(row.dataset.position)];
    if (index === undefined) return;
    selected = controller.selectResult(index);
    render();
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
  all.onclick = () => { controller.clearResultSelection(true); selected = null; render(); };
  return { refresh, setData, clear };
};
