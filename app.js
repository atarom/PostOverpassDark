import { loadDependencies } from "./deps.js";
import { storage } from "./storage.js";
import { createEditor } from "./editor.js";
import { createQueryPreparer } from "./query.js";
import { parseResponse, responseError, errorStatusHtml, OSM_TYPES } from "./response.js";
import { createMapController } from "./map.js";
import { createUI } from "./ui.js";
import { $, esc, json, abortError } from "./utils.js";
import { OVERPASS_PRESETS } from "./presets-overpass.js";
import { POSTPASS_PRESETS } from "./presets-postpass.js";
const STORE = { endpoint: "osm-overpass-map:endpoint", wrap: "osm-overpass-map:wrap", mode: "osm-overpass-map:render", heat: "osm-overpass-map:heat", areas: "osm-overpass-map:geocode-areas" };
const PRESETS = { overpass: OVERPASS_PRESETS, postpass: POSTPASS_PRESETS };
const initializeApp = (deps) => {
  const status = $("status");
  const dataOutput = $("dataOutput");
  const dataView = $("dataView");
  const runButton = $("runBtn");
  const endpoint = $("endpoint");
  const overlay = $("ov");
  const overlayLog = $("ovLog");
  const copyButton = $("copyDataBtn");
  const queryNode = $("query");
  const wrapLines = $("wrapLines");
  const renderMode = $("renderMode");
  const presetSelect = $("presetSelect");
  const presetDescription = $("presetDescription");
  const endpoints = [...endpoint.options].map((option) => option.value);
  const savedEndpoint = storage.getItem(STORE.endpoint);
  const wrap = storage.getItem(STORE.wrap) === "wrap" ? "wrap" : "scroll";
  const mode = storage.getItem(STORE.mode) === "heat" ? "heat" : "normal";
  if (endpoints.includes(savedEndpoint)) endpoint.value = savedEndpoint;
  wrapLines.value = wrap;
  renderMode.value = mode;
  const getEngine = () => endpoint.selectedOptions[0]?.dataset.engine === "postpass" ? "postpass" : "overpass";
  const defaults = { overpass: PRESETS.overpass[0]?.query ?? "", postpass: PRESETS.postpass[0]?.query ?? "" };
  let editor;
  const syncPreset = () => {
    if (!editor) return;
    const presets = PRESETS[editor.getEngine()];
    const query = editor.getQuery().trim();
    const index = presets.findIndex((preset) => preset.query.trim() === query);
    presetSelect.value = index < 0 ? "custom" : String(index);
    presetDescription.textContent = index < 0 ? "Consulta editada manualmente." : presets[index].description;
  };
  const renderPresets = () => {
    const presets = PRESETS[editor.getEngine()];
    presetSelect.replaceChildren();
    presets.forEach((preset, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = preset.title;
      presetSelect.append(option);
    });
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Consulta personalizada";
    presetSelect.append(custom);
    syncPreset();
  };
  editor = createEditor({ deps, queryNode, wrapMode: wrap, engine: getEngine(), defaults, onChange: syncPreset });
  renderPresets();
  presetSelect.onchange = () => {
    if (presetSelect.value === "custom") return;
    const preset = PRESETS[editor.getEngine()][Number(presetSelect.value)];
    if (preset) editor.setQuery(preset.query);
  };
  const mapController = createMapController({ ml: deps.maplibregl, storage, heatStoreKey: STORE.heat, renderMode, heatElements: { config: $("heatCfg"), radius: $("heatRadius"), intensity: $("heatIntensity"), opacity: $("heatOpacity"), weight: $("heatWeight"), palette: $("heatPalette"), radiusValue: $("heatRadiusVal"), intensityValue: $("heatIntensityVal"), opacityValue: $("heatOpacityVal"), weightValue: $("heatWeightVal"), reset: $("heatReset") } });
  const map = mapController.map;
  const ui = createUI({ map, status, dataOutput, dataView, overlay, overlayLog, copyButton });
  const preparer = createQueryPreparer({ map, storage, areaStoreKey: STORE.areas, log: ui.log });
  let controller;
  let timer;
  let busy = false;
  let runSeq = 0;
  const stop = (message = "Consulta cancelada") => {
    runSeq++;
    const active = controller;
    controller = null;
    clearTimeout(timer);
    busy = false;
    runButton.disabled = false;
    ui.overlayClose();
    if (active && !active.signal.aborted) active.abort(abortError(message));
  };
  const elapsed = (start) => {
    const ms = performance.now() - start;
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} s`;
  };
  const textResult = (result, start) => {
    const time = elapsed(start);
    ui.data.geojson = "";
    dataView.value = "raw";
    ui.setStatus(`<strong>Respuesta textual recibida</strong><br>Formato: ${esc(result.format.toUpperCase())} · Tiempo: ${time}`, "ok");
    ui.show();
    ui.tab("data");
    ui.log(`Respuesta ${result.format.toUpperCase()} recibida\nSin representación en el mapa\nTiempo: ${time}`);
    ui.overlayDone();
  };
  const geoResult = (result, start, postpass) => {
    ui.data.geojson = json(result.geo);
    ui.log(postpass ? `GeoJSON recibido\nDibujando ${result.geo.features.length} entidades GeoJSON…` : `Conversión GeoJSON completada\nDibujando ${result.geo.features.length} entidades GeoJSON…`);
    mapController.draw(result.geo);
    const formatter = new Intl.NumberFormat("es-ES");
    const time = elapsed(start);
    const featureCount = result.geo.features.length;
    const hasOSM = result.cnt.total && (!postpass || featureCount);
    const hasResults = hasOSM || (postpass && featureCount);
    const title = hasOSM ? `${formatter.format(result.cnt.total)} elementos OSM` : hasResults ? `${formatter.format(featureCount)} resultados Postpass` : "Consulta válida sin resultados";
    const counts = ["Nodos", "Vías", "Relaciones"].map((label, index) => [label, result.cnt[OSM_TYPES[index]]]);
    const summary = `<strong>${title}</strong><br>` + (hasOSM ? counts.map(([label, count]) => `${label}: ${formatter.format(count)}`).join(" · ") + "<br>" : "") + (!postpass && !hasOSM ? "Elementos OSM: 0 · " : "") + `GeoJSON: ${formatter.format(featureCount)}` + (!postpass && !hasOSM ? "<br>" : " · ") + `Tiempo: ${time}`;
    const done = [hasResults ? "Mapa actualizado" : `Consulta${postpass ? " Postpass" : ""} completada correctamente`, hasOSM ? `${result.cnt.total} elementos OSM` : hasResults ? `${featureCount} resultados Postpass` : `Sin resultados${postpass ? "" : " OSM"}`, ...(hasOSM ? counts.map(([label, count]) => `${label}: ${count}`) : []), ...(!postpass || hasOSM ? [`GeoJSON: ${featureCount}`] : []), `Tiempo: ${time}`].join("\n");
    ui.setStatus(summary, "ok");
    ui.tab("status");
    ui.log(done);
    ui.overlayDone();
  };
  const run = async () => {
    if (busy) return;
    const runId = ++runSeq;
    const queryText = editor.getQuery();
    const runEngine = editor.getEngine();
    const postpassTextOnly = runEngine === "postpass" && /\{\{\s*data\s*:\s*sql\s*,[^{}]*\bgeojson\s*=\s*false\b[^{}]*\}\}/i.test(queryText);
    const url = endpoint.value;
    const start = performance.now();
    const active = new AbortController();
    busy = true;
    runButton.disabled = true;
    controller = active;
    timer = null;
    map.stop();
    mapController.clear();
    ui.resetData();
    ui.show();
    ui.overlayOpen("Preparando consulta…");
    try {
      const query = await preparer.prep(queryText, active.signal, runEngine);
      if (runId !== runSeq) return;
      ui.data.query = query;
      ui.show();
      if (runEngine === "overpass") {
        const timeout = query.match(/\[\s*timeout\s*:\s*(\d+)\s*\]/i);
        if (timeout) timer = setTimeout(() => active.abort(abortError("Tiempo de espera agotado")), Number(timeout[1]) * 1000);
      }
      ui.log(`Consulta ${runEngine === "postpass" ? "Postpass" : "Overpass"} preparada\nEnviando consulta…`);
      const body = new URLSearchParams({ data: query });
      if (postpassTextOnly) body.set("options[geojson]", "false");
      const response = await fetch(url, { method: "POST", body, signal: active.signal, cache: "no-store" });
      const text = await response.text();
      const contentType = response.headers.get("content-type") || "";
      if (runId !== runSeq) return;
      ui.log(`Respuesta recibida: HTTP ${response.status}`);
      ui.data.raw = text;
      const queryError = responseError(text, contentType, response.status, response.statusText);
      if (queryError) {
        const error = new Error(queryError.title);
        error.overpass = queryError;
        throw error;
      }
      const result = parseResponse(text, contentType, runEngine, query, postpassTextOnly);
      ui.data.raw = result.raw;
      if (result.textOnly) {
        textResult(result, start);
        return;
      }
      if (!Array.isArray(result.geo?.features)) throw Error("GeoJSON no válido");
      geoResult(result, start, runEngine === "postpass");
    } catch (error) {
      if (runId !== runSeq) return;
      ui.overlayClose();
      if (error?.name === "AbortError") {
        const message = error.message || "Consulta cancelada";
        ui.setStatus(`<strong>Consulta cancelada</strong><br>${esc(message)}`, "err");
        ui.tab("status");
        ui.log("ERROR: " + message);
      } else {
        const info = error?.overpass;
        const message = error?.message || String(error);
        ui.setStatus(info ? errorStatusHtml(info, message) : `<strong>Error</strong><br>${esc(message).replace(/\n/g, "<br>")}`, "err");
        ui.tab("status");
        ui.log("ERROR: " + (info?.raw || message));
      }
    } finally {
      if (runId === runSeq) {
        clearTimeout(timer);
        if (controller === active) controller = null;
        busy = false;
        runButton.disabled = false;
      }
    }
  };
  const clear = () => {
    stop("Consulta cancelada al restablecer");
    ui.clearOverlayTimer();
    mapController.clear();
    ui.resetData();
    editor.reset();
    syncPreset();
    ui.show();
    ui.setStatus("Pulsa <strong>Ejecutar</strong> o <strong>Ctrl+Intro</strong> para ejecutar la consulta.");
    ui.tab("status");
  };
  endpoint.onchange = () => {
    endpoints.includes(endpoint.value) ? storage.setItem(STORE.endpoint, endpoint.value) : storage.removeItem(STORE.endpoint);
    if (busy) stop("Consulta cancelada al cambiar de servidor");
    const next = getEngine();
    if (next !== editor.getEngine()) {
      editor.setMode(next);
      renderPresets();
      ui.setStatus(`Modo <strong>${next === "postpass" ? "Postpass SQL" : "Overpass QL"}</strong> listo para ejecutar.`);
      ui.tab("status");
    }
  };
  wrapLines.onchange = () => {
    const value = wrapLines.value === "wrap" ? "wrap" : "scroll";
    storage.setItem(STORE.wrap, value);
    editor.setWrap(value);
  };
  renderMode.onchange = () => {
    const value = renderMode.value === "heat" ? "heat" : "normal";
    storage.setItem(STORE.mode, value);
    mapController.heatUI();
    if (mapController.hasGeo()) mapController.render();
  };
  map.on("error", (event) => {
    const message = event?.error?.message;
    if (busy && message && !/abort|cancel/i.test(message)) ui.log("ERROR MAPA: " + message);
  });
  $("ovX").onclick = ui.overlayClose;
  $("statusTabBtn").onclick = () => ui.tab("status");
  $("dataTabBtn").onclick = () => ui.tab("data");
  for (const name of ["status", "data"]) $(`${name}TabBtn`).onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const next = name === "status" ? "data" : "status";
    ui.tab(next);
    $(`${next}TabBtn`).focus();
  };
  $("clearBtn").onclick = clear;
  dataView.onchange = ui.show;
  copyButton.onclick = ui.copy;
  runButton.onclick = run;
  document.addEventListener("keydown", (event) => {
    if (!overlay.hidden && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      ui.overlayClose();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      run();
    }
  }, true);
  addEventListener("resize", () => map.resize());
  ui.show();
};
const boot = async () => {
  const button = $("runBtn");
  const status = $("status");
  const query = $("query");
  const fallback = query.querySelector("textarea");
  if (fallback) fallback.value = fallback.value.trim().replace(/^[ \t]+/gm, "");
  button.disabled = true;
  status.textContent = "Cargando editor y mapa…";
  try {
    const deps = await loadDependencies();
    initializeApp(deps);
    button.disabled = false;
    status.textContent = "Pulsa Ejecutar o Ctrl+Intro para ejecutar la consulta.";
  } catch (error) {
    if (fallback && !query.querySelector(".cm-editor")) query.replaceChildren(fallback);
    status.className = "status err";
    status.textContent = "No se pudo iniciar la aplicación: " + (error.message || String(error));
    console.error(error);
  }
};
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();
