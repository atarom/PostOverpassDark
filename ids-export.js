import { getIdentifier } from "./ids-to-pod.js";
const TYPES = ["node", "way", "rel"];
const NAMES = { node: "node", way: "way", rel: "relation" };
const PREFIX = { node: "n", way: "w", rel: "r" };
const PRESETS = [
  ["markdown", "Markdown OSM"],
  ["ids", "IDs por tipo"],
  ["overpass", "Overpass QL"],
  ["urls", "URLs OSM"],
  ["history", "Historial OSM"],
  ["josm", "JOSM"],
  ["json", "JSON"],
  ["csv", "CSV"],
  ["html", "HTML"]
];
const LINK_PRESETS = new Set(["markdown", "urls", "history", "html"]);
const EXTENSIONS = { markdown: "md", ids: "txt", overpass: "txt", urls: "txt", history: "txt", josm: "txt", json: "json", csv: "csv", html: "html" };
const STORE = "pod-ids-export-v1";
const MAX_SAMPLE = 60;
const MAX_CHARS = 12000;
const defaults = { origin: "filtered", preset: "markdown", domain: "www.openstreetmap.org", node: true, way: true, rel: true };
const optionsFromStorage = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!stored || typeof stored !== "object") return { ...defaults };
    return {
      origin: ["all", "filtered", "selected"].includes(stored.origin) ? stored.origin : defaults.origin,
      preset: PRESETS.some(([key]) => key === stored.preset) ? stored.preset : defaults.preset,
      domain: ["www.openstreetmap.org", "osm.org"].includes(stored.domain) ? stored.domain : defaults.domain,
      node: typeof stored.node === "boolean" ? stored.node : true,
      way: typeof stored.way === "boolean" ? stored.way : true,
      rel: typeof stored.rel === "boolean" ? stored.rel : true
    };
  } catch { return { ...defaults }; }
};
export const collectIds = (features, enabled = { node: true, way: true, rel: true }) => {
  const sets = { node: new Set(), way: new Set(), rel: new Set() };
  let omitted = 0;
  for (const feature of features) {
    const item = getIdentifier(feature);
    if (!item) { omitted++; continue; }
    if (enabled[item.type]) sets[item.type].add(item.id);
  }
  const groups = Object.fromEntries(TYPES.map((type) => [type, [...sets[type]].sort((a, b) => a - b)]));
  return { groups, count: TYPES.reduce((count, type) => count + groups[type].length, 0), omitted };
};
export const formatIds = (groups, preset, domain = "www.openstreetmap.org") => {
  const present = TYPES.filter((type) => groups[type]?.length);
  if (!present.length) return "";
  const url = (type, id) => `https://${domain}/${NAMES[type]}/${id}`;
  if (preset === "ids") return present.map((type) => `${NAMES[type]}:\n${groups[type].join(",")}`).join("\n");
  if (preset === "overpass") return `(\n${present.map((type) => `${type}(id:${groups[type].join(",")});`).join("\n")}\n);`;
  if (preset === "josm") return present.flatMap((type) => groups[type].map((id) => `${PREFIX[type]}${id}`)).join(",");
  if (preset === "json") return `{${present.map((type) => `${JSON.stringify(NAMES[type])}:[${groups[type].join(",")}]`).join(",")}}`;
  if (preset === "csv") return `type,id\n${present.flatMap((type) => groups[type].map((id) => `${NAMES[type]},${id}`)).join("\n")}`;
  if (preset === "markdown") return present.flatMap((type) => groups[type].map((id) => `[${NAMES[type]}/${id}](${url(type, id)})`)).join("\n");
  if (preset === "urls") return present.flatMap((type) => groups[type].map((id) => url(type, id))).join("\n");
  if (preset === "history") return present.flatMap((type) => groups[type].map((id) => `${url(type, id)}/history`)).join("\n");
  if (preset === "html") return present.flatMap((type) => groups[type].map((id) => `<a href="${url(type, id)}">${NAMES[type]}/${id}</a>`)).join("\n");
  throw Error("Preset de IDs no reconocido");
};
export const createIdsExporter = ({ getAllFeatures, getFilteredFeatures, getSelectedFeatures }) => {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./ids-export.css", import.meta.url).href;
  document.head.append(stylesheet);
  const button = document.createElement("button");
  button.type = "button";
  button.id = "exportIdsBtn";
  button.className = "action-button pod-ids-button";
  button.textContent = "IDs";
  button.title = "Exportar identificadores OSM";
  button.setAttribute("aria-label", "Exportar identificadores OSM");
  button.disabled = true;
  const tools = document.getElementById("josmTools");
  if (tools) tools.after(button);
  const dialog = document.createElement("dialog");
  dialog.className = "pod-ids-dialog";
  dialog.setAttribute("aria-labelledby", "podIdsTitle");
  const head = document.createElement("div");
  head.className = "pod-ids-head";
  const title = document.createElement("h2");
  title.id = "podIdsTitle";
  title.textContent = "Exportar IDs";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "pod-ids-close";
  close.textContent = "×";
  close.title = "Cerrar";
  close.setAttribute("aria-label", "Cerrar");
  head.append(title, close);
  const fields = document.createElement("div");
  fields.className = "pod-ids-fields";
  const makeSelect = (labelText, choices) => {
    const label = document.createElement("label");
    label.textContent = labelText;
    const select = document.createElement("select");
    for (const [value, name] of choices) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = name;
      select.append(option);
    }
    label.append(select);
    return { label, select };
  };
  const origin = makeSelect("Origen", [["filtered", "Resultados filtrados"], ["all", "Todos los cargados"], ["selected", "Elemento seleccionado"]]);
  const preset = makeSelect("Preset", PRESETS);
  fields.append(origin.label, preset.label);
  const types = document.createElement("fieldset");
  types.className = "pod-ids-types";
  const legend = document.createElement("legend");
  legend.textContent = "Tipos OSM";
  types.append(legend);
  const checkboxes = {};
  for (const [type, labelText] of [["node", "Nodos"], ["way", "Vías"], ["rel", "Relaciones"]]) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    label.append(checkbox, document.createTextNode(labelText));
    types.append(label);
    checkboxes[type] = checkbox;
  }
  const domain = makeSelect("Dominio para los enlaces", [["www.openstreetmap.org", "www.openstreetmap.org"], ["osm.org", "osm.org"]]);
  domain.label.classList.add("pod-ids-domain");
  const controls = document.createElement("div");
  controls.className = "pod-ids-controls";
  controls.append(fields, types, domain.label);
  const resultHead = document.createElement("div");
  resultHead.className = "pod-ids-result-head";
  const caption = document.createElement("label");
  caption.textContent = "Vista previa";
  caption.htmlFor = "podIdsPreview";
  const count = document.createElement("span");
  count.className = "pod-ids-count";
  resultHead.append(caption, count);
  const preview = document.createElement("textarea");
  preview.id = "podIdsPreview";
  preview.readOnly = true;
  preview.spellcheck = false;
  preview.wrap = "off";
  const note = document.createElement("div");
  note.className = "pod-ids-note";
  const footer = document.createElement("div");
  footer.className = "pod-ids-footer";
  const message = document.createElement("div");
  message.className = "pod-ids-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "pod-ids-actions";
  const makeButton = (text, primary = false) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    if (primary) element.className = "pri";
    actions.append(element);
    return element;
  };
  const copy = makeButton("Copiar", true);
  const download = makeButton("Descargar");
  const dismiss = makeButton("Cerrar");
  footer.append(message, actions);
  dialog.append(head, controls, resultHead, preview, note, footer);
  document.body.append(dialog);
  const saved = optionsFromStorage();
  origin.select.value = saved.origin;
  preset.select.value = saved.preset;
  domain.select.value = saved.domain;
  for (const type of TYPES) checkboxes[type].checked = saved[type];
  let hasData = false;
  let cache = null;
  let busy = false;
  let revision = 0;
  const notify = (text, error = false) => { message.textContent = text; message.classList.toggle("err", error); };
  const current = () => ({ origin: origin.select.value, preset: preset.select.value, domain: domain.select.value, ...Object.fromEntries(TYPES.map((type) => [type, checkboxes[type].checked])) });
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(current())); } catch {} };
  const syncButtons = () => { copy.disabled = download.disabled = busy || !cache?.count; };
  const refresh = () => {
    if (!dialog.open) return;
    revision++;
    notify("");
    domain.label.hidden = !LINK_PRESETS.has(preset.select.value);
    const options = current();
    const source = options.origin === "all" ? getAllFeatures() : options.origin === "selected" ? getSelectedFeatures() : getFilteredFeatures();
    cache = collectIds(source, options);
    const sample = Object.fromEntries(TYPES.map((type) => [type, cache.groups[type].slice(0, MAX_SAMPLE)]));
    const shortened = TYPES.some((type) => cache.groups[type].length > MAX_SAMPLE);
    const sampleText = formatIds(sample, options.preset, options.domain);
    preview.value = sampleText.slice(0, MAX_CHARS);
    if (!cache.count) preview.value = "No hay identificadores OSM para esta selección.";
    note.textContent = shortened || sampleText.length > MAX_CHARS ? "Vista previa limitada. Copiar y Descargar incluyen todos los IDs." : "";
    count.textContent = `${cache.count.toLocaleString("es-ES")} IDs${cache.omitted ? ` · ${cache.omitted.toLocaleString("es-ES")} sin identificador válido` : ""}`;
    syncButtons();
  };
  const open = () => { if (!hasData) return; dialog.showModal(); refresh(); };
  const finish = () => { busy = false; syncButtons(); };
  const getBlob = () => new Blob([formatIds(cache.groups, preset.select.value, domain.select.value)], { type: "text/plain;charset=utf-8" });
  const copyAll = async () => {
    if (!cache?.count || busy) return;
    busy = true;
    syncButtons();
    const job = revision;
    try {
      if (!navigator.clipboard?.write && !navigator.clipboard?.writeText) throw Error("Portapapeles no disponible");
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") await navigator.clipboard.write([new ClipboardItem({ "text/plain": getBlob() })]);
      else await navigator.clipboard.writeText(await getBlob().text());
      if (job === revision) notify(`${cache.count.toLocaleString("es-ES")} IDs copiados.`);
    } catch (error) { if (job === revision) notify(`No se pudieron copiar los IDs: ${error.message || String(error)}`, true); }
    finally { finish(); }
  };
  const downloadAll = () => {
    if (!cache?.count || busy) return;
    busy = true;
    syncButtons();
    try {
      const blob = getBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `postoverpassdark-ids-${preset.select.value}.${EXTENSIONS[preset.select.value]}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      notify(`${cache.count.toLocaleString("es-ES")} IDs preparados para descargar.`);
    } catch (error) { notify(`No se pudo generar el archivo: ${error.message || String(error)}`, true); }
    finally { finish(); }
  };
  button.addEventListener("click", open);
  close.addEventListener("click", () => dialog.close());
  dismiss.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { cache = null; preview.value = ""; note.textContent = ""; notify(""); });
  for (const element of [origin.select, preset.select, domain.select, ...Object.values(checkboxes)]) element.addEventListener("change", () => { persist(); refresh(); });
  copy.addEventListener("click", () => void copyAll());
  download.addEventListener("click", downloadAll);
  return {
    setData: (loaded) => { hasData = Boolean(loaded); button.disabled = !hasData; if (!hasData && dialog.open) dialog.close(); },
    refresh
  };
};
