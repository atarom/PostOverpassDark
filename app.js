import { loadDependencies } from "./deps.js";
import { storage } from "./storage.js";
import { createEditor } from "./editor.js";
import { createQueryPreparer } from "./query.js";
import { parseResponse, responseError, errorStatusHtml, OSM_TYPES } from "./response.js";
import { createMapController } from "./map.js";
import { createUI } from "./ui.js";
import { createAnalysis } from "./analysis.js";
import { createJosmExporter } from "./josm-export.js";
import { encodeShare, decodeShare, sharedFragment } from "./share.js";
import { $, esc, json, abortError } from "./utils.js";
import { OVERPASS_PRESETS } from "./presets-overpass.js";
import { POSTPASS_PRESETS } from "./presets-postpass.js";
const STORE = { endpoint: "postoverpassdark:endpoint", wrap: "postoverpassdark:wrap", mode: "postoverpassdark:render", heat: "postoverpassdark:heat", areas: "postoverpassdark:geocode-areas", sidebar: "postoverpassdark:sidebar-width" };
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
  const presetToggle = $("presetToggle");
  const presetPanel = $("presetPanel");
  const presetList = $("presetList");
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
  let busy = false;
  const closePresets = () => {
    presetPanel.hidden = true;
    presetToggle.setAttribute("aria-expanded", "false");
  };
  const syncPreset = () => {
    if (!editor) return;
    const query = editor.getQuery().trim();
    const presets = PRESETS[editor.getEngine()];
    for (const button of presetList.children) {
      const index = Number(button.dataset.index);
      button.setAttribute("aria-pressed", String(presets[index]?.query.trim() === query));
    }
  };
  const renderPresets = () => {
    const presets = PRESETS[editor.getEngine()];
    presetList.replaceChildren();
    presets.forEach((preset, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-item";
      button.dataset.index = String(index);
      const title = document.createElement("span");
      title.className = "preset-item-title";
      title.textContent = preset.title;
      const description = document.createElement("span");
      description.className = "preset-item-description";
      description.textContent = preset.description;
      button.append(title, description);
      button.onclick = () => {
        editor.setQuery(preset.query);
        syncPreset();
        closePresets();
        presetToggle.focus();
      };
      presetList.append(button);
    });
    syncPreset();
  };
  editor = createEditor({ deps, queryNode, wrapMode: wrap, engine: getEngine(), defaults, onChange: syncPreset });
  renderPresets();
  presetToggle.onclick = () => {
    if (presetPanel.hidden) {
      closeConfig();
      presetPanel.hidden = false;
      presetToggle.setAttribute("aria-expanded", "true");
      (presetList.querySelector('[aria-pressed="true"]') || presetList.firstElementChild)?.focus();
    } else {
      closePresets();
      presetToggle.focus();
    }
  };
  document.addEventListener("pointerdown", (event) => {
    if (!presetPanel.hidden && !presetPanel.contains(event.target) && !presetToggle.contains(event.target)) closePresets();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !presetPanel.hidden) {
      closePresets();
      presetToggle.focus();
    }
  });
  const mapController = createMapController({ ol: deps.ol, storage, heatStoreKey: STORE.heat, renderMode, heatElements: { config: $("heatCfg"), radius: $("heatRadius"), intensity: $("heatIntensity"), opacity: $("heatOpacity"), weight: $("heatWeight"), palette: $("heatPalette"), radiusValue: $("heatRadiusVal"), intensityValue: $("heatIntensityVal"), opacityValue: $("heatOpacityVal"), weightValue: $("heatWeightVal"), reset: $("heatReset") } });
  const map = mapController.map;
  const cfg = $("cfg");
  const cfgToggle = $("cfgToggle");
  cfgToggle.onclick = () => {
    closePresets();
    const expanded = cfg.hidden;
    cfg.hidden = !expanded;
    cfgToggle.setAttribute("aria-expanded", String(expanded));
  };
  const closeConfig = () => {
    cfg.hidden = true;
    cfgToggle.setAttribute("aria-expanded", "false");
  };
  document.addEventListener("pointerdown", (event) => {
    if (!cfg.hidden && !cfg.contains(event.target) && !cfgToggle.contains(event.target)) closeConfig();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !cfg.hidden) {
      closeConfig();
      cfgToggle.focus();
    }
  });
  const app = document.querySelector(".app");
  const splitter = $("sidebarResize");
  const savedWidth = Number(storage.getItem(STORE.sidebar));
  let desiredWidth = Number.isFinite(savedWidth) && savedWidth >= 320 ? savedWidth : 430;
  let dragging = null;
  const widthLimits = () => ({ min: 320, max: Math.max(320, innerWidth - 340) });
  const applyWidth = () => {
    const { min, max } = widthLimits();
    const width = Math.max(min, Math.min(max, Math.round(desiredWidth)));
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
    splitter.setAttribute("aria-valuemin", String(min));
    splitter.setAttribute("aria-valuemax", String(max));
    splitter.setAttribute("aria-valuenow", String(width));
    map.updateSize();
  };
  const saveWidth = () => storage.setItem(STORE.sidebar, String(Math.round(desiredWidth)));
  splitter.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || innerWidth <= 850) return;
    event.preventDefault();
    dragging = event.pointerId;
    splitter.setPointerCapture(dragging);
    app.classList.add("is-resizing");
  });
  splitter.addEventListener("pointermove", (event) => {
    if (event.pointerId !== dragging) return;
    desiredWidth = event.clientX - app.getBoundingClientRect().left;
    applyWidth();
  });
  const finishResize = (event) => {
    if (event.pointerId !== dragging) return;
    dragging = null;
    app.classList.remove("is-resizing");
    desiredWidth = Number(splitter.getAttribute("aria-valuenow"));
    saveWidth();
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
  };
  splitter.addEventListener("pointerup", finishResize);
  splitter.addEventListener("pointercancel", finishResize);
  splitter.addEventListener("lostpointercapture", finishResize);
  splitter.addEventListener("keydown", (event) => {
    const { min, max } = widthLimits();
    const current = Number(splitter.getAttribute("aria-valuenow"));
    if (event.key === "ArrowLeft") desiredWidth = current - (event.shiftKey ? 60 : 24);
    else if (event.key === "ArrowRight") desiredWidth = current + (event.shiftKey ? 60 : 24);
    else if (event.key === "Home") desiredWidth = min;
    else if (event.key === "End") desiredWidth = max;
    else return;
    event.preventDefault();
    applyWidth();
    desiredWidth = Number(splitter.getAttribute("aria-valuenow"));
    saveWidth();
  });
  splitter.addEventListener("dblclick", () => {
    desiredWidth = 430;
    applyWidth();
    saveWidth();
  });
  applyWidth();
  const shareDialog = $("shareDialog");
  const shareAuto = $("shareAuto");
  const shareUrl = $("shareUrl");
  const shareCopy = $("shareCopy");
  const shareMessage = $("shareMessage");
  let shareRevision = 0;
  const shareStatus = (value, error = false) => {
    shareMessage.textContent = value;
    shareMessage.classList.toggle("err", error);
  };
  const shareState = () => {
    const [longitude, latitude] = deps.ol.proj.toLonLat(map.getView().getCenter());
    return { query: editor.getQuery(), longitude: ((longitude + 180) % 360 + 360) % 360 - 180, latitude, zoom: map.getView().getZoom(), endpoint: endpoint.value, heatMode: renderMode.value === "heat", heat: mapController.getHeat(), autoRun: shareAuto.checked };
  };
  const refreshShare = async () => {
    const revision = ++shareRevision;
    shareCopy.disabled = true;
    shareUrl.value = "";
    shareStatus("Comprimiendo consulta…");
    try {
      const encoded = await encodeShare(shareState());
      if (revision !== shareRevision || !shareDialog.open) return;
      const url = new URL(".", location.href);
      url.hash = `s=${encoded}`;
      shareUrl.value = url.href;
      shareCopy.disabled = false;
      shareStatus(`${url.href.length} caracteres${url.href.length > 4000 ? " · Enlace largo: algunas aplicaciones pueden recortarlo" : ""}`);
    } catch (error) {
      if (revision === shareRevision) shareStatus(error.message || String(error), true);
    }
  };
  $("shareBtn").onclick = () => {
    shareAuto.checked = true;
    shareDialog.showModal();
    refreshShare();
  };
  shareAuto.onchange = refreshShare;
  $("shareClose").onclick = () => shareDialog.close();
  shareDialog.addEventListener("close", () => { shareRevision++; });
  shareUrl.onclick = () => shareUrl.select();
  shareCopy.onclick = async () => {
    if (!shareUrl.value) return;
    try {
      await navigator.clipboard.writeText(shareUrl.value);
      shareStatus("Enlace copiado al portapapeles");
    } catch {
      shareUrl.focus();
      shareUrl.select();
      shareStatus("Copia el enlace seleccionado manualmente");
    }
  };
  const ui = createUI({ map, status, dataOutput, dataView, overlay, overlayLog, copyButton });
  const panelResize = $("panelResize");
  const side = document.querySelector(".side");
  const headerPanel = document.querySelector(".pan");
  const tabStrip = document.querySelector(".tabs");
  const panelDefaults = { status: 64, data: 250, analysis: 390 };
  const panelStoreKey = "postoverpassdark:panel-heights";
  let panelHeights;
  try {
    const saved = JSON.parse(storage.getItem(panelStoreKey) || "{}");
    panelHeights = Object.fromEntries(Object.entries(panelDefaults).map(([name, height]) => [name, Number.isFinite(saved?.[name]) && saved[name] >= (name === "status" ? 64 : 80) ? saved[name] : height]));
  } catch {
    panelHeights = { ...panelDefaults };
  }
  let activePanel = "status";
  let panelDragging = null;
  const mobilePanels = () => matchMedia("(max-width: 850px)").matches;
  const panelBounds = () => {
    const minEditor = Math.min(120, Math.max(60, Math.round(side.clientHeight * 0.22)));
    const available = Math.floor(side.clientHeight - headerPanel.offsetHeight - tabStrip.offsetHeight - panelResize.offsetHeight - minEditor);
    const minimum = activePanel === "status" ? 64 : 80;
    const max = Math.max(0, available);
    return { min: Math.min(minimum, max), max };
  };
  const syncPanelHeight = () => {
    if (mobilePanels()) {
      side.style.removeProperty("--panel-height");
      panelResize.tabIndex = -1;
      return;
    }
    panelResize.tabIndex = 0;
    const { min, max } = panelBounds();
    const height = Math.round(Math.max(min, Math.min(max, panelHeights[activePanel])));
    side.style.setProperty("--panel-height", `${height}px`);
    panelResize.setAttribute("aria-valuemin", String(min));
    panelResize.setAttribute("aria-valuemax", String(max));
    panelResize.setAttribute("aria-valuenow", String(height));
    panelResize.setAttribute("aria-valuetext", `${height} píxeles: ${activePanel === "analysis" ? "Análisis" : activePanel === "data" ? "Datos" : "Estado"}`);
  };
  const savePanelHeight = () => storage.setItem(panelStoreKey, JSON.stringify(panelHeights));
  const movePanel = (height) => {
    const { min, max } = panelBounds();
    panelHeights[activePanel] = Math.round(Math.max(min, Math.min(max, height)));
    syncPanelHeight();
  };
  panelResize.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || mobilePanels()) return;
    event.preventDefault();
    panelDragging = event.pointerId;
    panelResize.setPointerCapture(panelDragging);
    side.classList.add("is-panel-resizing");
  });
  panelResize.addEventListener("pointermove", (event) => {
    if (event.pointerId !== panelDragging) return;
    movePanel(side.getBoundingClientRect().bottom - tabStrip.offsetHeight - event.clientY - panelResize.offsetHeight / 2);
  });
  const finishPanelResize = (event) => {
    if (event.pointerId !== panelDragging) return;
    panelDragging = null;
    side.classList.remove("is-panel-resizing");
    savePanelHeight();
    if (panelResize.hasPointerCapture(event.pointerId)) panelResize.releasePointerCapture(event.pointerId);
  };
  panelResize.addEventListener("pointerup", finishPanelResize);
  panelResize.addEventListener("pointercancel", finishPanelResize);
  panelResize.addEventListener("lostpointercapture", finishPanelResize);
  panelResize.addEventListener("keydown", (event) => {
    if (mobilePanels()) return;
    const current = Number(panelResize.getAttribute("aria-valuenow"));
    const { min, max } = panelBounds();
    if (event.key === "ArrowUp") movePanel(current + (event.shiftKey ? 60 : 24));
    else if (event.key === "ArrowDown") movePanel(current - (event.shiftKey ? 60 : 24));
    else if (event.key === "Home") movePanel(min);
    else if (event.key === "End") movePanel(max);
    else return;
    event.preventDefault();
    savePanelHeight();
  });
  panelResize.addEventListener("dblclick", () => {
    if (mobilePanels()) return;
    panelHeights[activePanel] = panelDefaults[activePanel];
    syncPanelHeight();
    savePanelHeight();
  });
  const showTab = (name) => {
    activePanel = name;
    syncPanelHeight();
    ui.tab(name);
  };
  syncPanelHeight();
  new ResizeObserver(syncPanelHeight).observe(headerPanel);
  const analysis = createAnalysis({ elements: { key: $("analysisKey"), onlyKey: $("analysisOnlyKey"), multivalue: $("analysisMultivalue"), values: $("analysisValues"), summary: $("analysisSummary"), numericEnable: $("numericEnable"), numericKey: $("numericKey"), numericErrors: $("numericErrors"), numericMin: $("numericMin"), numericMax: $("numericMax"), numericMinValue: $("numericMinValue"), numericMaxValue: $("numericMaxValue"), regexEnable: $("regexEnable"), regexText: $("regexText"), regexInsensitive: $("regexInsensitive"), regexOnly: $("regexOnly"), regexColors: $("regexColors"), reset: $("analysisReset") }, onChange: (options) => mapController.applyFilters(options) });
  const josm = createJosmExporter({ container: $("josmTools"), sendButton: $("josmSend"), message: $("josmMessage") });
  josm.setEngine(getEngine());
  const preparer = createQueryPreparer({ map, storage, areaStoreKey: STORE.areas, log: ui.log });
  let controller;
  let timer;
  let runSeq = 0;
  const overlayButton = $("ovX");
  const setOverlayButton = (cancel) => {
    const label = cancel ? "Cancelar consulta" : "Cerrar";
    overlayButton.title = label;
    overlayButton.setAttribute("aria-label", label);
  };
  const stop = (message = "Consulta cancelada") => {
    if (!busy) return;
    runSeq++;
    const active = controller;
    controller = null;
    clearTimeout(timer);
    busy = false;
    if (active && !active.signal.aborted) active.abort(abortError(message));
    ui.overlayClose();
    setOverlayButton(false);
    runButton.disabled = false;
    ui.setStatus(`<strong>Consulta cancelada</strong><br>${esc(message)}`, "err");
    showTab("status");
  };
  const elapsed = (start) => {
    const ms = performance.now() - start;
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} s`;
  };
  const textResult = (result, start) => {
    josm.reset();
    const time = elapsed(start);
    analysis.clear();
    ui.data.geojson = "";
    dataView.value = "raw";
    ui.setStatus(`<strong>Respuesta textual recibida</strong><br>Formato: ${esc(result.format.toUpperCase())} · Tiempo: ${time}`, "ok");
    ui.show();
    showTab("data");
    ui.log(`Respuesta ${result.format.toUpperCase()} recibida\nSin representación en el mapa\nTiempo: ${time}`);
    ui.overlayDone();
  };
  const geoResult = (result, start, postpass) => {
    josm.setData(postpass ? result.geo : result.raw, postpass ? "postpass" : "overpass");
    ui.data.geojson = json(result.geo);
    analysis.setData(result.geo, true);
    ui.log(postpass ? `GeoJSON recibido\nDibujando ${result.geo.features.length} entidades GeoJSON…` : `Conversión GeoJSON completada\nDibujando ${result.geo.features.length} entidades GeoJSON…`);
    mapController.draw(result.geo, { filters: analysis.options() });
    mapController.applyFilters(analysis.options());
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
    showTab("status");
    ui.log(done);
    ui.overlayDone();
  };
  const run = async () => {
    if (busy) return;
    const runId = ++runSeq;
    josm.reset();
    const queryText = editor.getQuery();
    const runEngine = editor.getEngine();
    const postpassTextOnly = runEngine === "postpass" && /\{\{\s*data\s*:\s*sql\s*,[^{}]*\bgeojson\s*=\s*false\b[^{}]*\}\}/i.test(queryText);
    const url = endpoint.value;
    const start = performance.now();
    const active = new AbortController();
    busy = true;
    runButton.disabled = true;
    setOverlayButton(true);
    controller = active;
    timer = null;
    map.getView().cancelAnimations();
    mapController.clear();
    analysis.clear();
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
        showTab("status");
        ui.log("ERROR: " + message);
      } else {
        const info = error?.overpass;
        const message = error?.message || String(error);
        ui.setStatus(info ? errorStatusHtml(info, message) : `<strong>Error</strong><br>${esc(message).replace(/\n/g, "<br>")}`, "err");
        showTab("status");
        ui.log("ERROR: " + (info?.raw || message));
      }
    } finally {
      if (runId === runSeq) {
        clearTimeout(timer);
        if (controller === active) controller = null;
        busy = false;
        setOverlayButton(false);
        runButton.disabled = false;
      }
    }
  };
  endpoint.onchange = () => {
    endpoints.includes(endpoint.value) ? storage.setItem(STORE.endpoint, endpoint.value) : storage.removeItem(STORE.endpoint);
    if (busy) stop("Consulta cancelada al cambiar de servidor");
    const next = getEngine();
    josm.setEngine(next);
    if (next !== editor.getEngine()) {
      editor.setMode(next);
      renderPresets();
      ui.setStatus(`Modo <strong>${next === "postpass" ? "Postpass SQL" : "Overpass QL"}</strong> listo para ejecutar.`);
      showTab("status");
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
  overlayButton.onclick = () => busy ? stop("Consulta cancelada por el usuario") : ui.overlayClose();
  const tabNames = ["status", "data", "analysis"];
  tabNames.forEach((name) => {
    $(`${name}TabBtn`).onclick = () => showTab(name);
    $(`${name}TabBtn`).onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const next = tabNames[(tabNames.indexOf(name) + offset + tabNames.length) % tabNames.length];
      showTab(next);
      $(`${next}TabBtn`).focus();
    };
  });
  dataView.onchange = ui.show;
  copyButton.onclick = ui.copy;
  runButton.onclick = run;
  document.addEventListener("keydown", (event) => {
    if (!overlay.hidden && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (busy) stop("Consulta cancelada por el usuario");
      else ui.overlayClose();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      run();
    }
  }, true);
  addEventListener("resize", () => { applyWidth(); syncPanelHeight(); });
  ui.show();
  const restoreShared = async () => {
    const fragment = sharedFragment();
    if (!fragment) return;
    try {
      const shared = await decodeShare(fragment);
      if (!endpoints.includes(shared.endpoint)) throw Error("El servidor compartido no está disponible en esta versión");
      endpoint.value = shared.endpoint;
      const engine = getEngine();
      if (engine !== editor.getEngine()) {
        editor.setMode(engine);
        renderPresets();
      }
      editor.setQuery(shared.query);
      mapController.setHeat(shared.heat);
      renderMode.value = shared.heatMode ? "heat" : "normal";
      mapController.heatUI();
      mapController.render();
      map.getView().setCenter(deps.ol.proj.fromLonLat([shared.longitude, shared.latitude]));
      map.getView().setZoom(shared.zoom);
      map.updateSize();
      josm.setEngine(engine);
      syncPreset();
      ui.setStatus(`<strong>Consulta compartida restaurada</strong><br>${shared.autoRun ? "Ejecutando automáticamente…" : "Preparada para ejecutar"}`, "ok");
      showTab("status");
      if (shared.autoRun) requestAnimationFrame(() => run());
    } catch (error) {
      ui.setStatus(`<strong>Enlace compartido inválido</strong><br>${esc(error.message || String(error))}`, "err");
      showTab("status");
    }
  };
  void restoreShared();
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
