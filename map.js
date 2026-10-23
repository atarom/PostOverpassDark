import { esc, val } from "./utils.js";
import { featureTags, matchesTagValue, splitRegexPatterns } from "./analysis.js";
const TYPES = { N: "node", W: "way", R: "relation", node: "node", way: "way", relation: "relation" };
const COLORS = { default: ["#355f8d", "#3f8f9c", "#79b88d", "#d6b56d", "#e58b68", "#ef5d72"], warm: ["#72543b", "#a26c43", "#d1924f", "#e6b95f", "#ef8262", "#ef4e5d"], cool: ["#324a7a", "#326b98", "#3f98a7", "#63b7a8", "#88d0b4", "#d3f0c0"], fire: ["#3a173d", "#7d2450", "#bd3a45", "#e96d3e", "#f5b747", "#fff2a1"] };
const HEAT_DEFAULT = { intensity: 1, radius: 1, opacity: 0.88, weight: 1, palette: "default" };
const numeric = (value) => {
  const str = String(value ?? "").trim().replace(",", ".");
  const num = str ? Number(str) : NaN;
  return Number.isFinite(num) ? num : NaN;
};
const hexRgb = (value) => {
  const match = /^#([\da-f]{6})$/i.exec(value || "");
  return match ? [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16)) : [141, 182, 232];
};
const compilePatterns = (raw, insensitive) => splitRegexPatterns(raw).flatMap((value) => {
  try { return [{ value, regex: new RegExp(value, insensitive ? "i" : "") }]; } catch { return []; }
});
const entries = (obj) => obj && typeof obj === "object" && !Array.isArray(obj) ? Object.entries(obj).filter(([, value]) => value != null) : [];
const rows = (items) => items.sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `<div class="tr"><div class="tk">${esc(key)}</div><div class="tv">${esc(val(value))}</div></div>`).join("");
const section = (title, cls, items) => items.length ? `<section class="ps ${cls}"><div class="psh">${title}</div>${rows(items)}</section>` : "";
const oid = (feature) => {
  const p = feature.properties || {};
  let type = TYPES[p.osm_type] || TYPES[p.type] || "";
  let id = type && (p.osm_id ?? p.id) != null ? String(p.osm_id ?? p.id) : "";
  if (!type || !id) {
    for (const value of [p.osm_url, feature.id, p["@id"], p.id]) {
      const match = String(value || "").match(/(?:https?:\/\/(?:www\.)?openstreetmap\.org\/)?(node|way|relation)[/:](\d+)$/i) || String(value || "").match(/^([nwr])(\d+)$/i);
      if (match) { type = TYPES[{ n: "N", w: "W", r: "R" }[match[1]] || match[1]]; id = match[2]; break; }
    }
  }
  return { type, id, short: { node: "n", way: "w", relation: "r" }[type] || "" };
};
const popupIcon = (shape) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shape}</svg>`;
const POPUP_ICONS = {
  osm: popupIcon('<circle cx="10.5" cy="10.5" r="6.3"/><path d="m15.2 15.2 5.2 5.2"/>'),
  id: popupIcon('<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13 7 4 4"/>'),
  rapid: popupIcon('<path d="M13 2 5 13h6l-1 9 9-12h-6l1-8Z"/>'),
  level0: popupIcon('<path d="M4.2 4.5v14.8h7.4"/><rect x="14.2" y="4.5" width="7.1" height="14.8" rx="3.5"/><circle cx="17.75" cy="11.9" r="1.15" fill="currentColor" stroke="none"/>'),
  josm: popupIcon('<path d="M3 6 9 3l6 3 6-3v10M3 6v14l6-3 4.3 2M9 3v14M15 6v8"/><path d="m14.1 20.4 2.5-.6 4.9-5-1.9-1.9-4.9 5-.6 2.5Z"/>')
};
const popupHtml = (feature) => {
  const p = feature.properties || {};
  const tags = featureTags(feature);
  const { type, id, short } = oid(feature);
  const relationData = p["@relations"] ?? p.relations;
  const relations = Array.isArray(relationData) ? relationData.map((entry, index) => [String(index + 1), entry]) : entries(relationData);
  const meta = [...entries(p.meta), ...Object.entries(p).filter(([key, value]) => value != null && key !== "_podColor" && (p.tags ? !["tags", "relations", "meta", "@id", "id", "type"].includes(key) : key.startsWith("@") && !["@id", "@relations"].includes(key)))];
  const name = tags.name || tags["name:es"] || tags.ref || `${type || "OSM"}/${id || "?"}`;
  const osm = type && id ? `https://www.openstreetmap.org/${type}/${id}` : "";
  const shortId = short + id;
  const body = section("Tags OSM", "tag", entries(tags)) + section("Relaciones", "rel", relations) + section("Metadatos", "meta", meta);
  const links = osm ? [["osm", "Ver en OSM", osm], ["id", "Editar con iD", `https://www.openstreetmap.org/edit?editor=id&${type}=${id}`], ["rapid", "Editar con Rapid", `https://rapideditor.org/edit#id=${shortId}`], ["level0", "Editar con Level0", `https://level0.osmz.ru/?url=${encodeURIComponent(osm)}`], ["josm", "Editar con JOSM", `http://127.0.0.1:8111/load_object?objects=${shortId}`]] : [];
  const actions = links.map(([icon, title, url]) => `<button type="button" class="pop-action" style="width:40px;height:38px;flex:0 0 40px" data-url="${esc(url)}" title="${esc(title)}" aria-label="${esc(title)}">${POPUP_ICONS[icon]}</button>`).join("");
  return `<div class="pp"><div class="ph"><div class="pt">${esc(name)}</div></div><div class="tags">${body || '<div class="tr"><div class="tk">info</div><div class="tv">Sin información visible</div></div>'}</div>${actions ? `<div class="acts">${actions}</div>` : ""}</div>`;
};
const PASS = ["all", ["==", ["get", "podValid"], 1], ["between", ["get", "podValue"], ["var", "minEle"], ["var", "maxEle"]]];
const BAD = ["any", ["==", ["get", "podValid"], 0], ["<", ["get", "podValue"], ["var", "minEle"]], [">", ["get", "podValue"], ["var", "maxEle"]]];
const FILTER = ["all", ["==", ["get", "podKeep"], 1], ["any", ["==", ["var", "numericEnabled"], 0], ["==", ["var", "showErrors"], 1], PASS]];
const RED = ["case", ["all", ["==", ["var", "numericEnabled"], 1], BAD], 239, ["get", "podR"]];
const GREEN = ["case", ["all", ["==", ["var", "numericEnabled"], 1], BAD], 132, ["get", "podG"]];
const BLUE = ["case", ["all", ["==", ["var", "numericEnabled"], 1], BAD], 145, ["get", "podB"]];
const styleColor = (alpha) => ["color", RED, GREEN, BLUE, alpha];
const geometryInsideArea = (geometry, area) => {
  const bounds = geometry.getExtent();
  const limit = area.getExtent();
  if (bounds[0] < limit[0] || bounds[1] < limit[1] || bounds[2] > limit[2] || bounds[3] > limit[3]) return false;
  const ring = area.getCoordinates()[0];
  const inside = (point) => area.intersectsCoordinate(point);
  const segment = (a, b) => {
    if (!inside(a) || !inside(b)) return false;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const cuts = [0, 1];
    for (let i = 1; i < ring.length; i++) {
      const c = ring[i - 1], d = ring[i];
      const ex = d[0] - c[0], ey = d[1] - c[1];
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < 1e-12) continue;
      const qx = c[0] - a[0], qy = c[1] - a[1];
      const t = (qx * ey - qy * ex) / det;
      const u = (qx * dy - qy * dx) / det;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < 1e-12) continue;
      const t = (cuts[i] + cuts[i - 1]) / 2;
      if (!inside([a[0] + t * dx, a[1] + t * dy])) return false;
    }
    return true;
  };
  const path = (points) => points.length > 0 && points.every((point, index) => inside(point) && (index === 0 || segment(points[index - 1], point)));
  const type = geometry.getType();
  if (type === "Point") return inside(geometry.getCoordinates());
  if (type === "MultiPoint") return geometry.getCoordinates().length > 0 && geometry.getCoordinates().every(inside);
  if (type === "LineString") return path(geometry.getCoordinates());
  if (type === "MultiLineString" || type === "Polygon") return geometry.getCoordinates().length > 0 && geometry.getCoordinates().every(path);
  if (type === "MultiPolygon") return geometry.getCoordinates().length > 0 && geometry.getCoordinates().every((polygon) => polygon.every(path));
  if (type === "GeometryCollection") return geometry.getGeometries().length > 0 && geometry.getGeometries().every((part) => geometryInsideArea(part, area));
  return false;
};
export const createMapController = ({ ol, storage, heatStoreKey, renderMode, heatElements }) => {
  const { config, radius, intensity, opacity, weight, palette, radiusValue, intensityValue, opacityValue, weightValue, reset } = heatElements;
  const { Map: OlMap, View, Feature, Overlay, format: { GeoJSON }, geom: { Point }, layer: { Tile, WebGLVector, Heatmap }, source: { OSM, Vector }, proj: { fromLonLat } } = ol;
  const valid = (value, min, max, fallback) => Number.isFinite(+value) && +value >= min && +value <= max ? +value : fallback;
  let heat = { ...HEAT_DEFAULT };
  try {
    const saved = JSON.parse(storage.getItem(heatStoreKey) || "{}");
    heat = { intensity: valid(saved.intensity, 0.25, 3, 1), radius: valid(saved.radius, 0.25, 3, 1), opacity: valid(saved.opacity, 0, 1, 0.88), weight: valid(saved.weight, 0.1, 5, 1), palette: COLORS[saved.palette] ? saved.palette : "default" };
  } catch {}
  const vars = { minEle: -1000000, maxEle: 1000000, numericEnabled: 0, showErrors: 0 };
  const vectorSource = new Vector({ wrapX: false });
  const heatSource = new Vector({ wrapX: false });
  const vectorLayer = new WebGLVector({ source: vectorSource, variables: { ...vars }, style: [{ filter: FILTER, style: { "circle-radius": 7, "circle-fill-color": styleColor(1), "circle-stroke-color": "#e5edf8", "circle-stroke-width": 1.4, "stroke-color": styleColor(1), "stroke-width": 3, "fill-color": styleColor(0.18) } }] });
  const heatWeight = ["clamp", ["*", 0.75, ["var", "weight"], ["var", "intensity"], ["case", FILTER, 1, 0]], 0, 1];
  const heatLayer = new Heatmap({ source: heatSource, radius: ["*", 20, ["var", "radius"]], blur: ["*", 13, ["var", "radius"]], weight: heatWeight, variables: { ...vars, radius: heat.radius, weight: heat.weight, intensity: heat.intensity }, opacity: heat.opacity, gradient: COLORS[heat.palette], visible: false });
  const baseLayer = new Tile({ className: "dark-base-layer", source: new OSM({ referrerPolicy: "strict-origin-when-cross-origin" }) });
  const map = new OlMap({ target: "map", layers: [baseLayer, vectorLayer, heatLayer], view: new View({ center: fromLonLat([-3.70379, 40.416775]), zoom: 5.5, minZoom: 0, maxZoom: 19 }) });
  const popupElement = document.createElement("div");
  popupElement.className = "pod-ol-popup";
  popupElement.hidden = true;
  const popupClose = document.createElement("button");
  popupClose.className = "pod-ol-close";
  popupClose.type = "button";
  popupClose.textContent = "×";
  popupClose.setAttribute("aria-label", "Cerrar popup");
  const popupContent = document.createElement("div");
  popupElement.append(popupClose, popupContent);
  map.getTargetElement().append(popupElement);
  const popup = new Overlay({ element: popupElement, offset: [0, -10], positioning: "bottom-center", autoPan: { animation: { duration: 180 }, margin: 15 } });
  map.addOverlay(popup);
  const closePopup = () => { popup.setPosition(undefined); popupElement.hidden = true; };
  popupClose.onclick = closePopup;
  popupElement.addEventListener("click", (event) => {
    const button = event.target.closest(".pop-action");
    if (button) window.open(button.dataset.url, "_blank", "noopener,noreferrer");
  });
  const format = new GeoJSON();
  let geo = null;
  let rendered = [];
  let lastPrepared = "";
  let options = {};
  let heatReady = false;
  let heatShared = false;
  const basePass = (feature, opts, patterns) => {
    const tags = featureTags(feature);
    if (opts.onlySelectedKey && opts.selectedKey && !Object.prototype.hasOwnProperty.call(tags, opts.selectedKey)) return { keep: 0, color: "" };
    const selected = opts.selectedValue === null || opts.selectedValue === undefined ? null : matchesTagValue(tags, opts.selectedKey, opts.selectedValue, opts.countMode);
    if (selected === false && opts.hideOtherValues) return { keep: 0, color: "" };
    let color = "";
    if (opts.regexEnabled && selected === null) {
      const value = tags[opts.selectedKey] == null ? "" : String(tags[opts.selectedKey]).trim();
      const match = value ? patterns.find((entry) => entry.regex.test(value)) : null;
      if (match) color = opts.regexColors?.[match.value] || "";
      else if (opts.regexOnly) return { keep: 0, color: "" };
    }
    if (selected !== null) color = selected ? opts.selectedValueColor || "#4abde1" : opts.otherValueColor || "#708b7a";
    return { keep: 1, color };
  };
  const syncAttributes = (opts, force = false) => {
    const signature = JSON.stringify([opts.selectedKey, opts.onlySelectedKey, opts.regexEnabled, opts.regexText, opts.regexInsensitive, opts.regexOnly, opts.regexColors, opts.numericKey, opts.selectedValue, opts.countMode, opts.selectedValueColor, opts.otherValueColor, opts.hideOtherValues]);
    if (!force && signature === lastPrepared) return;
    lastPrepared = signature;
    const patterns = opts.regexEnabled ? compilePatterns(opts.regexText || "", opts.regexInsensitive) : [];
    for (let i = 0; i < rendered.length; i++) {
      const original = geo.features[rendered[i].get("podIndex")];
      const tags = featureTags(original);
      const attrs = basePass(original, opts, patterns);
      const n = numeric(tags[opts.numericKey]);
      const [podR, podG, podB] = hexRgb(attrs.color);
      rendered[i].setProperties({ podKeep: attrs.keep, podValue: Number.isFinite(n) ? n : 0, podValid: Number.isFinite(n) ? 1 : 0, podR, podG, podB }, true);
    }
    vectorSource.changed();
    if (heatReady && !heatShared) {
      for (const feat of heatSource.getFeatures()) {
        const original = rendered[feat.get("podLocalIndex")];
        if (original) feat.setProperties({ podKeep: original.get("podKeep"), podValue: original.get("podValue"), podValid: original.get("podValid") }, true);
      }
      heatSource.changed();
    }
  };
  const applyFilters = (next = {}) => {
    options = next;
    if (!geo) return;
    syncAttributes(next);
    const active = next.numericEnabled && next.numericKey ? 1 : 0;
    const update = { minEle: Number(next.numericMin) || 0, maxEle: Number(next.numericMax) || 0, numericEnabled: active, showErrors: next.numericShowErrors ? 1 : 0 };
    vectorLayer.updateStyleVariables(update);
    heatLayer.updateStyleVariables(update);
  };
  const fit = (features) => {
    if (!features.length) return;
    const extent = vectorSource.getExtent();
    if (extent.every(Number.isFinite)) map.getView().fit(extent, { padding: [28, 28, 28, 28], maxZoom: 17, duration: 300 });
  };
  const zoomAll = document.createElement("button");
  zoomAll.type = "button";
  zoomAll.textContent = "⛶";
  zoomAll.title = "Zoom a todo";
  zoomAll.setAttribute("aria-label", "Mostrar todas las entidades cargadas");
  zoomAll.addEventListener("click", () => fit(rendered));
  map.getTargetElement().querySelector(".ol-zoom")?.append(zoomAll);
  const measureSource = new Vector({ wrapX: false });
  const measureStyle = { "stroke-color": "#a0d2ae", "stroke-width": 3, "circle-radius": 5, "circle-fill-color": "#a0d2ae", "circle-stroke-color": "#0a1511", "circle-stroke-width": 2 };
  map.addLayer(new ol.layer.Vector({ source: measureSource, style: measureStyle }));
  const measureDraw = new ol.interaction.Draw({ source: measureSource, type: "LineString", style: measureStyle, stopClick: true });
  measureDraw.setActive(false);
  map.addInteraction(measureDraw);
  const measureButton = document.createElement("button");
  measureButton.type = "button";
  measureButton.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17 17 4l3 3L7 20 4 17Z M10 11l3 3 M13 8l2 2 M7 14l2 2"/></svg>';
  measureButton.title = "Medir distancias: clic para añadir puntos y doble clic para terminar";
  measureButton.setAttribute("aria-label", "Medir distancias");
  measureButton.setAttribute("aria-pressed", "false");
  Object.assign(measureButton.style, { display: "grid", placeItems: "center", padding: "0" });
  map.getTargetElement().querySelector(".ol-zoom")?.append(measureButton);
  let measuring = false;
  let measureGeometry = null;
  let measureTooltip = null;
  const measureFormat = (geometry) => {
    const meters = ol.sphere.getLength(geometry, { projection: map.getView().getProjection() });
    return meters >= 1000 ? `${(meters / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} km` : `${meters.toLocaleString("es-ES", { maximumFractionDigits: 1 })} m`;
  };
  const updateMeasure = (event) => {
    const geometry = event.target;
    if (!measureTooltip) return;
    measureTooltip.getElement().textContent = measureFormat(geometry);
    measureTooltip.setPosition(geometry.getLastCoordinate());
  };
  measureDraw.on("drawstart", ({ feature }) => {
    measureSource.clear();
    if (measureTooltip) map.removeOverlay(measureTooltip);
    const label = document.createElement("div");
    Object.assign(label.style, { padding: "5px 8px", background: "#13221b", border: "1px solid #47634f", borderRadius: "5px", color: "#e1eae2", font: "700 12px system-ui", whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 3px 12px #0008" });
    measureTooltip = new Overlay({ element: label, offset: [0, -12], positioning: "bottom-center", stopEvent: false, insertFirst: false });
    map.addOverlay(measureTooltip);
    measureGeometry = feature.getGeometry();
    measureGeometry.on("change", updateMeasure);
    updateMeasure({ target: measureGeometry });
  });
  measureDraw.on("drawend", ({ feature }) => {
    measureGeometry?.un("change", updateMeasure);
    measureGeometry = null;
    if (measureTooltip) {
      updateMeasure({ target: feature.getGeometry() });
      measureTooltip.getElement().style.background = "#203127";
    }
  });
  const setMeasuring = (active) => {
    measuring = active;
    measureDraw.setActive(active);
    measureButton.setAttribute("aria-pressed", String(active));
    measureButton.style.background = active ? "#304e38" : "";
    measureButton.style.color = active ? "#a0d2ae" : "";
    map.getTargetElement().style.cursor = active ? "crosshair" : "";
    if (active) closePopup();
    else {
      measureDraw.abortDrawing();
      measureGeometry?.un("change", updateMeasure);
      measureGeometry = null;
      measureSource.clear();
      if (measureTooltip) map.removeOverlay(measureTooltip);
      measureTooltip = null;
    }
  };
  measureButton.addEventListener("click", () => { if (!measuring && areaDrawing) setAreaDrawing(false); setMeasuring(!measuring); });
  const areaSource = new Vector({ wrapX: false });
  const areaStyle = { "stroke-color": "#f4db9b", "stroke-width": 2, "fill-color": "rgba(244,219,155,0.13)", "circle-radius": 5, "circle-fill-color": "#f4db9b", "circle-stroke-color": "#0a1511", "circle-stroke-width": 2 };
  map.addLayer(new ol.layer.Vector({ source: areaSource, style: areaStyle }));
  const areaDraw = new ol.interaction.Draw({ source: areaSource, type: "Polygon", style: areaStyle, stopClick: true });
  areaDraw.setActive(false);
  map.addInteraction(areaDraw);
  const areaButton = document.createElement("button");
  areaButton.type = "button";
  areaButton.textContent = "⬡";
  map.getTargetElement().querySelector(".ol-zoom")?.append(areaButton);
  let areaGeometry = null;
  let areaDrawing = false;
  const areaControls = () => {
    const selected = areaDrawing || Boolean(areaGeometry);
    areaButton.setAttribute("aria-pressed", String(selected));
    areaButton.setAttribute("aria-label", areaDrawing ? "Cancelar dibujo del área JOSM" : areaGeometry ? "Borrar área JOSM" : "Dibujar área para JOSM");
    areaButton.title = areaDrawing ? "Cancelar dibujo" : areaGeometry ? "Borrar área JOSM" : "Área JOSM: clics para dibujar, doble clic para terminar";
    areaButton.style.background = selected ? "#64532e" : "";
    areaButton.style.color = selected ? "#f4db9b" : "";
  };
  const setAreaDrawing = (active) => {
    areaDrawing = active;
    areaDraw.setActive(active);
    if (!active) areaDraw.abortDrawing();
    if (active) { closePopup(); if (measuring) setMeasuring(false); }
    map.getTargetElement().style.cursor = active ? "crosshair" : "";
    areaControls();
  };
  areaDraw.on("drawstart", () => { areaSource.clear(); areaGeometry = null; });
  areaDraw.on("drawend", ({ feature }) => { areaGeometry = feature.getGeometry(); queueMicrotask(() => setAreaDrawing(false)); });
  areaButton.addEventListener("click", () => {
    if (areaGeometry) { areaSource.clear(); areaGeometry = null; setAreaDrawing(false); }
    else setAreaDrawing(!areaDrawing);
  });
  areaControls();
  const draw = (collection, { fitBounds = true, filters = options } = {}) => {
    closePopup();
    geo = collection;
    options = filters;
    rendered = [];
    heatReady = false;
    heatShared = true;
    lastPrepared = "";
    heatSource.clear(true);
    vectorSource.clear(true);
    const features = [];
    for (let i = 0; i < (collection.features || []).length; i++) {
      const item = collection.features[i];
      if (!item?.geometry) continue;
      let geometry;
      try { geometry = format.readGeometry(item.geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }); } catch { continue; }
      if (!geometry) continue;
      if (geometry.getType() !== "Point") heatShared = false;
      const feature = new Feature({ geometry, podIndex: i, podKeep: 1, podValid: 0, podValue: 0, podR: 141, podG: 182, podB: 232 });
      rendered.push(feature);
      features.push(feature);
    }
    syncAttributes(options, true);
    vectorSource.addFeatures(features);
    heatLayer.setSource(heatShared ? vectorSource : heatSource);
    heatReady = heatShared;
    if (fitBounds) fit(features);
    render();
  };
  const buildHeat = () => {
    if (heatReady) return;
    const points = [];
    for (let i = 0; i < rendered.length; i++) {
      const feature = rendered[i];
      const geometry = feature.getGeometry();
      const type = geometry.getType();
      let center;
      if (type === "Point") center = geometry.getCoordinates();
      else if (type === "MultiPoint") center = geometry.getCoordinates()[0];
      else if (type === "Polygon") center = geometry.getInteriorPoint().getCoordinates().slice(0, 2);
      else if (type === "MultiPolygon") center = geometry.getInteriorPoints().getCoordinates()[0]?.slice(0, 2);
      else if (type === "LineString") center = geometry.getCoordinateAt(0.5);
      else if (type === "MultiLineString") center = geometry.getLineStrings()[0]?.getCoordinateAt(0.5);
      if (!center) {
        const extent = geometry.getExtent();
        center = geometry.getClosestPoint([(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2]);
      }
      if (!center || !center.every(Number.isFinite)) continue;
      const point = new Feature({ geometry: new Point(center), podLocalIndex: i, podKeep: feature.get("podKeep"), podValue: feature.get("podValue"), podValid: feature.get("podValid") });
      points.push(point);
    }
    heatSource.addFeatures(points);
    heatReady = true;
  };
  const render = () => {
    const isHeat = renderMode.value === "heat";
    if (isHeat && geo) buildHeat();
    vectorLayer.setVisible(!isHeat);
    heatLayer.setVisible(isHeat);
    closePopup();
  };
  const getHeat = () => ({ ...heat });
  const setHeat = (options) => {
    heat = { intensity: valid(options?.intensity, 0.25, 3, 1), radius: valid(options?.radius, 0.25, 3, 1), opacity: valid(options?.opacity, 0, 1, 0.88), weight: valid(options?.weight, 0.1, 5, 1), palette: COLORS[options?.palette] ? options.palette : "default" };
    heatUI();
    heatPaint();
  };
  const heatSave = () => storage.setItem(heatStoreKey, JSON.stringify(heat));
  const heatUI = () => {
    [[intensity, intensityValue, "intensity"], [radius, radiusValue, "radius"], [opacity, opacityValue, "opacity"], [weight, weightValue, "weight"]].forEach(([input, output, key]) => { input.value = output.value = heat[key]; });
    palette.value = heat.palette;
    config.hidden = renderMode.value !== "heat";
  };
  const heatPaint = () => {
    heatLayer.updateStyleVariables({ radius: heat.radius, weight: heat.weight, intensity: heat.intensity });
    heatLayer.setOpacity(heat.opacity);
    heatLayer.setGradient(COLORS[heat.palette]);
  };
  [[intensity, intensityValue, "intensity"], [radius, radiusValue, "radius"], [opacity, opacityValue, "opacity"], [weight, weightValue, "weight"]].forEach(([input, output, key]) => input.addEventListener("input", () => { heat[key] = +input.value; output.value = input.value; heatSave(); heatPaint(); }));
  palette.onchange = () => { heat.palette = COLORS[palette.value] ? palette.value : "default"; heatSave(); heatPaint(); };
  reset.onclick = () => { heat = { ...HEAT_DEFAULT }; heatSave(); heatUI(); heatPaint(); };
  map.on("singleclick", (event) => {
    if (measuring || areaDrawing || renderMode.value === "heat") return;
    const selected = map.forEachFeatureAtPixel(event.pixel, (feature, layer) => layer === vectorLayer ? feature : null, { hitTolerance: 3 });
    const index = selected?.get("podIndex");
    if (index == null || !geo?.features[index]) { closePopup(); return; }
    const raw = geo.features[index];
    const base = basePass(raw, options, options.regexEnabled ? compilePatterns(options.regexText || "", options.regexInsensitive) : []);
    const num = numeric(featureTags(raw)[options.numericKey]);
    const pass = !options.numericEnabled || !options.numericKey || options.numericShowErrors || Number.isFinite(num) && num >= Number(options.numericMin) && num <= Number(options.numericMax);
    if (!base.keep || !pass) { closePopup(); return; }
    popupContent.innerHTML = popupHtml(raw);
    popupElement.hidden = false;
    popup.setPosition(event.coordinate);
  });
  map.on("pointermove", (event) => {
    if (event.dragging || measuring || areaDrawing || renderMode.value === "heat") return;
    map.getTargetElement().style.cursor = map.hasFeatureAtPixel(event.pixel, { layerFilter: (layer) => layer === vectorLayer }) ? "pointer" : "";
  });
  const getVisibleOsm = () => {
    if (!geo) return null;
    if (areaDrawing) return [];
    const valueHidden = options.selectedValue !== null && options.selectedValue !== undefined && options.hideOtherValues;
    const regexHidden = options.regexEnabled && options.regexOnly && !valueHidden && (options.selectedValue === null || options.selectedValue === undefined);
    const numericHidden = Boolean(options.numericEnabled && options.numericKey && !options.numericShowErrors);
    if (!areaGeometry && !(options.onlySelectedKey && options.selectedKey) && !valueHidden && !regexHidden && !numericHidden) return null;
    const min = Number(options.numericMin) || 0;
    const max = Number(options.numericMax) || 0;
    const result = [];
    for (const feature of rendered) {
      if (feature.get("podKeep") !== 1) continue;
      if (numericHidden && (feature.get("podValid") !== 1 || feature.get("podValue") < min || feature.get("podValue") > max)) continue;
      if (areaGeometry && !geometryInsideArea(feature.getGeometry(), areaGeometry)) continue;
      result.push(oid(geo.features[feature.get("podIndex")]));
    }
    return result;
  };
  const clear = () => { closePopup(); geo = null; rendered = []; heatReady = false; heatShared = false; lastPrepared = ""; vectorSource.clear(true); heatSource.clear(true); heatLayer.setSource(heatSource); };
  heatUI();
  render();
  return { map, draw, clear, render, heatUI, getHeat, setHeat, hasGeo: () => Boolean(geo), applyFilters, getVisibleOsm };
};
