import { $ } from "../core/utils.js";
import { createDataViewer } from "./data-viewer.js";
import { QLEVER_ENDPOINT } from "../core/servers.js";
import { getQLeverTimestamp, describeQLeverTimestamp } from "../query/qlever-timestamp.js";
export const createUI = ({ map, status, dataOutput, dataView, overlay, overlayLog, copyButton }) => {
  const data = { query: "", raw: "" };
  let overlayTimer;
  let previousFocus = null;
  let geoData = null;
  let qleverAgeTimer;
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./status-panel.css", import.meta.url).href;
  document.head.append(stylesheet);
  const viewer = createDataViewer({ data, dataView, dataOutput, copyButton, getGeo: () => geoData });
  const log = (message) => {
    overlayLog.textContent += message + "\n";
    overlayLog.scrollTop = overlayLog.scrollHeight;
  };
  const overlayClose = () => {
    const wasOpen = !overlay.hidden;
    clearTimeout(overlayTimer);
    overlayTimer = 0;
    overlay.hidden = true;
    if (wasOpen && previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  };
  const overlayOpen = (message) => {
    clearTimeout(overlayTimer);
    overlayTimer = 0;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlayLog.textContent = "";
    overlay.hidden = false;
    if (message) log(message);
    requestAnimationFrame(() => $("ovX").focus());
  };
  const overlayDone = () => overlayTimer = setTimeout(overlayClose, 1200);
  const formatResultStatus = (html) => {
    const lines = html.split(/<br\s*\/?\s*>/i);
    const headline = lines[0]?.match(/^<strong>([^<>]+)<\/strong>$/);
    if (!headline || !/^(?:[\d.,]+ elementos OSM|[\d.,]+ resultados Postpass|Consulta válida sin resultados)$/.test(headline[1])) return null;
    const stats = new Map();
    for (const item of lines.slice(1).flatMap((line) => line.split(/\s+·\s+/))) {
      const match = item.match(/^(Nodos|Vías|Relaciones|Elementos OSM|GeoJSON|Tiempo|Antigüedad OSM): (.+)$/);
      if (!match || stats.has(match[1])) return null;
      stats.set(match[1], match[2]);
    }
    if (!stats.has("GeoJSON") || !stats.has("Tiempo")) return null;
    const result = document.createElement("div");
    result.className = "pod-status-result";
    const head = document.createElement("div");
    head.className = "pod-status-head";
    const total = document.createElement("strong");
    total.className = "pod-status-total";
    total.textContent = headline[1];
    const duration = document.createElement("span");
    duration.className = "pod-status-duration";
    duration.textContent = stats.get("Tiempo");
    head.append(total, duration);
    const details = document.createElement("div");
    details.className = "pod-status-details";
    const addStat = (label, value, isGeo = false) => {
      const entry = document.createElement("span");
      entry.className = "pod-status-stat" + (isGeo ? " pod-status-geo" : "") + (Number(value.replace(/\./g, "")) === 0 ? " pod-status-zero" : "");
      const number = document.createElement("strong");
      number.textContent = value;
      entry.append(number, " " + label);
      details.append(entry);
    };
    for (const label of ["Nodos", "Vías", "Relaciones", "Elementos OSM"]) if (stats.has(label)) addStat(label, stats.get(label));
    addStat("GeoJSON", stats.get("GeoJSON"), true);
    result.append(head, details);
    if (stats.has("Antigüedad OSM")) {
      const age = document.createElement("div");
      age.className = "pod-status-details";
      age.textContent = `Antigüedad de los datos OSM: ${stats.get("Antigüedad OSM")}`;
      result.append(age);
    }
    return result;
  };
  const showQLeverAge = (parent) => {
    const age = document.createElement("div");
    age.className = "pod-status-details";
    age.textContent = "Última edición OSM: consultando…";
    parent.append(age);
    void getQLeverTimestamp().then((timestamp) => {
      if (!status.contains(age)) return;
      if (timestamp === null) {
        age.textContent = "Última edición OSM: no disponible";
        return;
      }
      const refresh = () => {
        if (!status.contains(age)) return;
        const info = describeQLeverTimestamp(timestamp);
        age.textContent = info.text;
        age.style.color = info.color;
        qleverAgeTimer = setTimeout(refresh, 60000 - Math.max(0, Date.now() - timestamp) % 60000 + 35);
      };
      refresh();
    });
  };
  const setStatus = (html, cls = "") => {
    clearTimeout(qleverAgeTimer);
    status.className = "status " + cls;
    const result = cls === "ok" ? formatResultStatus(html) : null;
    if (result) {
      status.classList.add("pod-status-structured");
      status.replaceChildren(result);
    } else status.innerHTML = html;
    const qleverGeo = result && geoData?.qlever_properties?.endpoint === QLEVER_ENDPOINT;
    const qleverTable = !result && html.startsWith("<strong>Respuesta textual recibida</strong>") && $("endpoint")?.value === QLEVER_ENDPOINT;
    if (cls === "ok" && (qleverGeo || qleverTable)) showQLeverAge(result || status);
  };
  const show = () => viewer.show();
  const setGeojson = (value) => { geoData = value; viewer.resetPreview("geojson"); };
  const setOriginal = (text) => { data.raw = text; viewer.resetPreview("raw"); };
  const resetData = () => {
    geoData = null;
    Object.keys(data).forEach((key) => data[key] = "");
    viewer.reset();
  };
  const tab = (name) => {
    for (const item of ["status", "data", "analysis"]) {
      const on = item === name;
      const button = $(`${item}TabBtn`);
      button.classList.toggle("on", on);
      button.setAttribute("aria-selected", on);
      button.tabIndex = on ? 0 : -1;
      $(`${item}Panel`).classList.toggle("on", on);
    }
    if (name === "data") show();
    requestAnimationFrame(() => map.updateSize());
  };
  const copy = () => viewer.copy();
  return { data, log, overlayClose, overlayOpen, overlayDone, setStatus, show, setGeojson, setOriginal, resetData, tab, copy };
};
