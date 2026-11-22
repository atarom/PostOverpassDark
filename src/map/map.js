import { esc, val, DEFAULT_HEAT } from "../core/utils.js";
import { featureTags, matchesTagValue, numericValue, compilePatterns } from "../analysis/analysis.js";
import { getOsmReference } from "../export/osm-identifiers.js";
import { ShaderBuilder } from "https://cdn.jsdelivr.net/npm/ol@10.11.0/render/webgl/ShaderBuilder.js/+esm";
const COLORS = { default: ["#355f8d", "#3f8f9c", "#79b88d", "#d6b56d", "#e58b68", "#ef5d72"], warm: ["#72543b", "#a26c43", "#d1924f", "#e6b95f", "#ef8262", "#ef4e5d"], cool: ["#324a7a", "#326b98", "#3f98a7", "#63b7a8", "#88d0b4", "#d3f0c0"], fire: ["#3a173d", "#7d2450", "#bd3a45", "#e96d3e", "#f5b747", "#fff2a1"] };
const hexPacked = (value) => {
  const match = /^#([\da-f]{6})$/i.exec(value || "");
  return match ? parseInt(match[1], 16) : 0x8db6e8;
};
const entries = (obj) => obj && typeof obj === "object" && !Array.isArray(obj) ? Object.entries(obj).filter(([, value]) => value != null) : [];
const rows = (items) => items.sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `<div class="tr"><div class="tk">${esc(key)}</div><div class="tv">${esc(val(value))}</div></div>`).join("");
const section = (title, cls, items) => items.length ? `<section class="ps ${cls}"><div class="psh">${title}</div>${rows(items)}</section>` : "";
const popupIcon = (shape) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shape}</svg>`;
const POPUP_ICONS = {
  osm: popupIcon('<circle cx="10.5" cy="10.5" r="6.3"/><path d="m15.2 15.2 5.2 5.2"/>'),
  id: popupIcon('<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13 7 4 4"/>'),
  rapid: popupIcon('<path d="M13 2 5 13h6l-1 9 9-12h-6l1-8Z"/>'),
  level0: popupIcon('<path d="M4.2 4.5v14.8h7.4"/><rect x="14.2" y="4.5" width="7.1" height="14.8" rx="3.5"/><circle cx="17.75" cy="11.9" r="1.15" fill="currentColor" stroke="none"/>'),
  josm: popupIcon('<path d="M3 6 9 3l6 3 6-3v10M3 6v14l6-3 4.3 2M9 3v14M15 6v8"/><path d="m14.1 20.4 2.5-.6 4.9-5-1.9-1.9-4.9 5-.6 2.5Z"/>'),
  purge: popupIcon('<circle cx="12" cy="12" r="8.2"/><path d="m9 9 6 6m0-6-6 6"/>')
};
const popupHtml = (feature) => {
  const p = feature.properties || {};
  const tags = featureTags(feature);
  const { type = "", id = "", short = "" } = getOsmReference(feature) || {};
  const relationData = p["@relations"] ?? p.relations;
  const relations = Array.isArray(relationData) ? relationData.map((entry, index) => [String(index + 1), entry]) : entries(relationData);
  const meta = [...entries(p.meta), ...Object.entries(p).filter(([key, value]) => value != null && key !== "_podColor" && (p.tags ? !["tags", "relations", "meta", "@id", "id", "type"].includes(key) : key.startsWith("@") && !["@id", "@relations"].includes(key)))];
  const name = tags.name || tags["name:es"] || tags.ref || `${type || "OSM"}/${id || "?"}`;
  const osm = type && id ? `https://www.openstreetmap.org/${type}/${id}` : "";
  const shortId = short + id;
  const body = section("Tags OSM", "tag", entries(tags)) + section("Relaciones", "rel", relations) + section("Metadatos", "meta", meta);
  const links = osm ? [["osm", "Ver en OSM", osm], ["id", "Editar con iD", `https://www.openstreetmap.org/edit?editor=id&${type}=${id}`], ["rapid", "Editar con Rapid", `https://rapideditor.org/edit#id=${shortId}`], ["level0", "Editar con Level0", `https://level0.osmz.ru/?url=${encodeURIComponent(osm)}`], ["josm", "Editar con JOSM", `http://127.0.0.1:8111/load_object?objects=${shortId}`]] : [];
  const actions = links.map(([icon, title, url]) => `<button type="button" class="pop-action" style="width:auto;height:38px;flex:1 1 0;min-width:0" data-url="${esc(url)}" title="${esc(title)}" aria-label="${esc(title)}">${POPUP_ICONS[icon]}</button>`).join("") + (osm ? `<button type="button" class="pop-action pop-purge" style="width:auto;height:38px;flex:1 1 0;min-width:0;color:var(--d)!important;border-color:#935849!important" title="Purgar de los resultados de POD (no modifica OSM)" aria-label="Purgar de los resultados de POD">${POPUP_ICONS.purge}</button>` : "");
  return `<div class="pp" style="grid-template-rows:auto auto minmax(0,1fr)"><div class="ph"><div class="pt">${esc(name)}</div></div>${actions ? `<div class="acts" style="grid-row:2;padding:10px 13px;border-top:0;border-bottom:1px solid var(--b)">${actions}</div>` : ""}<div class="tags" style="grid-row:3">${body || '<div class="tr"><div class="tk">info</div><div class="tv">Sin información visible</div></div>'}</div></div>`;
};
const MISSING_NUMBER = -1e20;
const PASS = ["all", ["!=", ["get", "podValue"], MISSING_NUMBER], ["between", ["get", "podValue"], ["var", "minEle"], ["var", "maxEle"]]];
const BAD = ["any", ["==", ["get", "podValue"], MISSING_NUMBER], ["<", ["get", "podValue"], ["var", "minEle"]], [">", ["get", "podValue"], ["var", "maxEle"]]];
const GEOMETRY_PASS = ["any", ["==", ["var", "geometryEnabled"], 0], ["all", ["!=", ["get", "podGeomValue"], -1], ["between", ["get", "podGeomValue"], ["var", "minGeom"], ["var", "maxGeom"]]]];
const OUTLIER_VALUE = ["all", ["!=", ["get", "podValue"], MISSING_NUMBER], ["any", ["<", ["get", "podValue"], ["var", "outlierMin"]], [">", ["get", "podValue"], ["var", "outlierMax"]]]];
const OUTLIER_PASS = ["any", ["!=", ["var", "outlierMode"], 2], OUTLIER_VALUE];
const SPATIAL_RARE = ["all", [">=", ["get", "podSpatial"], 0], [">", ["get", "podSpatial"], ["var", "spatialThreshold"]]];
const SPATIAL_PASS = ["any", ["<", ["var", "spatialMode"], 2], ["all", ["==", ["var", "spatialMode"], 2], SPATIAL_RARE], ["all", ["==", ["var", "spatialMode"], 3], [">=", ["get", "podSpatial"], 0], ["!", SPATIAL_RARE]]];
const SPATIAL_ACTIVE = ["all", [">", ["var", "spatialMode"], 0], SPATIAL_RARE];
const OUTLIER_ACTIVE = ["all", ["==", ["var", "outlierMode"], 1], OUTLIER_VALUE];
const FILTER = ["all", [">=", ["get", "podColor"], 0], ["any", ["==", ["var", "numericEnabled"], 0], ["==", ["var", "showErrors"], 1], PASS], GEOMETRY_PASS, OUTLIER_PASS, SPATIAL_PASS];
const PACKED_COLOR = ["get", "podColor"];
const RED = ["case", SPATIAL_ACTIVE, 244, OUTLIER_ACTIVE, 237, ["all", ["==", ["var", "numericEnabled"], 1], BAD], 239, ["floor", ["/", PACKED_COLOR, 65536]]];
const GREEN = ["case", SPATIAL_ACTIVE, 98, OUTLIER_ACTIVE, 153, ["all", ["==", ["var", "numericEnabled"], 1], BAD], 132, ["floor", ["%", ["/", PACKED_COLOR, 256], 256]]];
const BLUE = ["case", SPATIAL_ACTIVE, 100, OUTLIER_ACTIVE, 134, ["all", ["==", ["var", "numericEnabled"], 1], BAD], 145, ["%", PACKED_COLOR, 256]];
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
  let heat = { ...DEFAULT_HEAT };
  try {
    const saved = JSON.parse(storage.getItem(heatStoreKey) || "{}");
    heat = { intensity: valid(saved.intensity, 0.25, 3, 1), radius: valid(saved.radius, 0.25, 3, 1), opacity: valid(saved.opacity, 0, 1, 0.88), weight: valid(saved.weight, 0.1, 5, 1), palette: COLORS[saved.palette] ? saved.palette : "default" };
  } catch {}
  const vars = { minEle: -1000000, maxEle: 1000000, numericEnabled: 0, showErrors: 0, minGeom: 0, maxGeom: 0, geometryEnabled: 0, outlierMode: 0, outlierMin: 0, outlierMax: 0, spatialMode: 0, spatialThreshold: 0 };
  const vectorSource = new Vector({ wrapX: false });
  const heatSource = new Vector({ wrapX: false });
  const glowStyleVars = { ...vars };
  const glowShader = () => {
    const builder = new ShaderBuilder();
    builder.addAttribute("a_podColor", "float", "vec3(mod(floor(a_podColor / 65536.0), 256.0), mod(floor(a_podColor / 256.0), 256.0), mod(a_podColor, 256.0)) / 255.0", "vec3");
    builder.addAttribute("a_podValue", "float");
    builder.addAttribute("a_podGeomValue", "float");
    builder.addAttribute("a_podSpatial", "float");
    for (const key of Object.keys(glowStyleVars)) builder.addUniform(`u_${key}`, "float");
    builder.setSymbolSizeExpression("vec2(28.0)");
    builder.setShapeDiscardExpression("a_podColor < 0.0 || (u_numericEnabled > 0.5 && u_showErrors < 0.5 && (a_podValue == -1.0e20 || a_podValue < u_minEle || a_podValue > u_maxEle)) || (u_geometryEnabled > 0.5 && (a_podGeomValue == -1.0 || a_podGeomValue < u_minGeom || a_podGeomValue > u_maxGeom)) || (u_outlierMode > 1.5 && (a_podValue == -1.0e20 || (a_podValue >= u_outlierMin && a_podValue <= u_outlierMax))) || (u_spatialMode > 1.5 && u_spatialMode < 2.5 && (a_podSpatial < 0.0 || a_podSpatial <= u_spatialThreshold)) || (u_spatialMode > 2.5 && (a_podSpatial < 0.0 || a_podSpatial > u_spatialThreshold))");
    const outlier = "u_outlierMode > 0.5 && u_outlierMode < 1.5 && a_podValue != -1.0e20 && (a_podValue < u_outlierMin || a_podValue > u_outlierMax)";
    const spatialOutlier = "u_spatialMode > 0.5 && a_podSpatial >= 0.0 && a_podSpatial > u_spatialThreshold";
    const invalid = "u_numericEnabled > 0.5 && (a_podValue == -1.0e20 || a_podValue < u_minEle || a_podValue > u_maxEle)";
    builder.setSymbolColorExpression(`vec4((${spatialOutlier}) ? vec3(244.0, 98.0, 100.0) / 255.0 : ((${outlier}) ? vec3(237.0, 153.0, 134.0) / 255.0 : ((${invalid}) ? vec3(239.0, 132.0, 145.0) / 255.0 : a_podColor)), 0.33 * (1.0 - smoothstep(12.5, 13.5, length((v_texCoord - vec2(0.5)) * v_quadSizePx))))`);
    return { builder, attributes: { podColor: { callback: (feature) => feature.get("podColor") }, podValue: { callback: (feature) => feature.get("podValue") }, podGeomValue: { callback: (feature) => feature.get("podGeomValue") }, podSpatial: { callback: (feature) => feature.get("podSpatial") } }, uniforms: Object.fromEntries(Object.keys(glowStyleVars).map((key) => [`u_${key}`, () => glowStyleVars[key]])) };
  };
  class ReducedGlowLayer extends WebGLVector {
    createRenderer() {
      const renderer = super.createRenderer();
      renderer.setPostProcesses([{ scaleRatio: 0.50 }]);
      return renderer;
    }
  }
  const glowLayer = new ReducedGlowLayer({ source: vectorSource, className: "ol-layer halo-low-layer", style: glowShader(), disableHitDetection: true });
  const vectorLayer = new WebGLVector({ source: vectorSource, className: "ol-layer halo-core-layer", variables: { ...vars }, style: [{ filter: FILTER, style: { "circle-radius": 6, "circle-fill-color": styleColor(0.73), "circle-stroke-color": "#e5edf8", "circle-stroke-width": 1.8, "stroke-color": styleColor(1), "stroke-width": 3, "fill-color": styleColor(0.18) } }] });
  const heatWeight = ["clamp", ["*", 0.75, ["var", "weight"], ["var", "intensity"], ["case", OUTLIER_ACTIVE, 1.8, 1], ["case", FILTER, 1, 0]], 0, 1];
  const heatLayer = new Heatmap({ source: heatSource, radius: ["*", 20, ["var", "radius"]], blur: ["*", 13, ["var", "radius"]], weight: heatWeight, variables: { ...vars, radius: heat.radius, weight: heat.weight, intensity: heat.intensity }, opacity: heat.opacity, gradient: COLORS[heat.palette], visible: false });
  const baseLayer = new Tile({ className: "dark-base-layer", source: new OSM({ referrerPolicy: "strict-origin-when-cross-origin" }) });
  const map = new OlMap({ target: "map", layers: [baseLayer, glowLayer, vectorLayer, heatLayer], view: new View({ center: fromLonLat([-3.70379, 40.416775]), zoom: 5.5, minZoom: 0, maxZoom: 19 }) });
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
  const popup = new Overlay({ element: popupElement, offset: [0, -10], positioning: "bottom-center" });
  map.addOverlay(popup);
  let popupIndex = null;
  let popupAnchor = null;
  let purgeRequested = null;
  const closePopup = () => { popupIndex = null; popupAnchor = null; popup.setPosition(undefined); popupElement.hidden = true; };
  const positionPopup = () => {
    if (popupIndex === null || !popupAnchor) return;
    const size = map.getSize();
    if (!size?.[0] || !size?.[1]) return;
    const mobile = window.matchMedia("(max-width: 850px)").matches;
    const width = Math.max(1, Math.min(460, size[0] - 24, window.innerWidth * (mobile ? 0.88 : 0.82)));
    const height = Math.max(1, Math.min(390, size[1] - 24, window.innerHeight - 24));
    popupElement.style.minWidth = `${Math.min(280, width)}px`;
    popupElement.style.maxWidth = `${width}px`;
    popupElement.style.maxHeight = `${height}px`;
    popupContent.firstElementChild.style.maxHeight = `${height}px`;
    if (mobile) {
      popup.setPositioning("center-center");
      popup.setOffset([0, 0]);
      popup.setPosition(map.getCoordinateFromPixel([size[0] / 2, size[1] / 2]));
      return;
    }
    const pixel = map.getPixelFromCoordinate(popupAnchor);
    if (!pixel) return;
    const offsetY = pixel[1] > size[1] / 2 ? -10 : 10;
    popup.setPositioning(offsetY < 0 ? "bottom-center" : "top-center");
    popup.setOffset([0, offsetY]);
    popup.setPosition(popupAnchor);
    const bounds = map.getTargetElement().getBoundingClientRect();
    const rect = popupElement.getBoundingClientRect();
    const margin = 12;
    const dx = rect.left < bounds.left + margin ? bounds.left + margin - rect.left : rect.right > bounds.right - margin ? bounds.right - margin - rect.right : 0;
    const dy = rect.top < bounds.top + margin ? bounds.top + margin - rect.top : rect.bottom > bounds.bottom - margin ? bounds.bottom - margin - rect.bottom : 0;
    if (dx || dy) popup.setOffset([dx, offsetY + dy]);
  };
  popupClose.onclick = closePopup;
  map.on("moveend", positionPopup);
  map.on("change:size", () => requestAnimationFrame(positionPopup));
  window.addEventListener("resize", () => requestAnimationFrame(positionPopup));
  popupElement.addEventListener("click", (event) => {
    const button = event.target.closest(".pop-action");
    if (!button || !popupElement.contains(button)) return;
    if (button.classList.contains("pop-purge")) {
      if (popupIndex !== null) purgeRequested?.(popupIndex);
      return;
    }
    if (button.dataset.url) window.open(button.dataset.url, "_blank", "noopener,noreferrer");
  });
  const selectionSource = new Vector({ wrapX: false });
  map.addLayer(new ol.layer.Vector({ source: selectionSource, style: { "stroke-color": "#ffe69d", "stroke-width": 4, "fill-color": "rgba(255,230,157,0.24)", "circle-radius": 10, "circle-fill-color": "#ffe69d", "circle-stroke-color": "#32483a", "circle-stroke-width": 2 } }));
  const format = new GeoJSON();
  let geo = null;
  let rendered = [];
  const featureByIndex = (index) => {
    let low = 0;
    let high = rendered.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const found = rendered[middle];
      const value = found.get("podIndex");
      if (value === index) return found;
      if (value < index) low = middle + 1;
      else high = middle - 1;
    }
    return null;
  };
  let selectedIndex = null;
  let resultsChanged = null;
  let lastColorSignature = "";
  let lastNumericKey;
  let lastGeometryValues = null;
  let lastSpatialFlags = null;
  const lastStyleVars = { ...vars };
  const vectorStyleVars = { ...vars };
  const heatStyleVars = { ...vars };
  const syncStyleVars = (layer, applied) => {
    const changed = {};
    for (const [key, value] of Object.entries(lastStyleVars)) if (applied[key] !== value) changed[key] = value;
    if (Object.keys(changed).length) {
      Object.assign(applied, changed);
      layer.updateStyleVariables(changed);
    }
  };
  const syncVectorStyles = () => {
    syncStyleVars(vectorLayer, vectorStyleVars);
    let changed = false;
    for (const [key, value] of Object.entries(lastStyleVars)) {
      if (glowStyleVars[key] !== value) { glowStyleVars[key] = value; changed = true; }
    }
    if (changed) glowLayer.changed();
  };
  let regexPatterns = [];
  let options = {};
  let heatReady = false;
  let heatShared = false;
  let heatDirty = 0;
  let vectorDirty = false;
  const notifyVector = () => {
    if (renderMode.value === "heat" && !heatShared) { vectorDirty = true; return; }
    vectorDirty = false;
    vectorSource.changed();
  };
  const flushHeat = () => {
    if (!heatDirty || !heatReady || heatShared) return;
    const mask = heatDirty;
    heatSource.forEachFeature((feature) => {
      const original = rendered[feature.get("podLocalIndex")];
      if (!original) return;
      const update = {};
      if (mask & 1) update.podColor = original.get("podColor");
      if (mask & 2) update.podValue = original.get("podValue");
      if (mask & 4) update.podGeomValue = original.get("podGeomValue");
      if (mask & 8) update.podSpatial = original.get("podSpatial");
      feature.setProperties(update, true);
    });
    heatDirty = 0;
    heatSource.changed();
  };
  const notifyHeat = (mask) => {
    if (!heatReady || heatShared) return;
    heatDirty |= mask;
    if (renderMode.value === "heat") flushHeat();
  };
  const basePass = (tags, opts, patterns) => {
    if (opts.onlySelectedKey && opts.selectedKey && !Object.prototype.hasOwnProperty.call(tags, opts.selectedKey)) return { keep: 0, color: "" };
    const selected = opts.selectedValue === null || opts.selectedValue === undefined ? null : matchesTagValue(tags, opts.selectedKey, opts.selectedValue, opts.countMode);
    if (selected === false && opts.hideOtherValues) return { keep: 0, color: "" };
    let color = "";
    if (opts.regexEnabled && selected === null) {
      const value = tags[opts.selectedKey] == null ? "" : String(tags[opts.selectedKey]).trim();
      const match = value ? patterns.find((entry) => entry.regex.test(value)) : null;
      if (match) color = opts.regexColors?.[match.source] || "";
      else if (opts.regexOnly) return { keep: 0, color: "" };
    }
    if (selected !== null) color = selected ? opts.selectedValueColor || "#4abde1" : opts.otherValueColor || "#708b7a";
    return { keep: 1, color };
  };
  const syncAttributes = (opts, force = false) => {
    const colorSignature = JSON.stringify([opts.selectedKey, opts.onlySelectedKey, opts.regexEnabled, opts.regexText, opts.regexInsensitive, opts.regexOnly, opts.regexColors, opts.selectedValue, opts.countMode, opts.selectedValueColor, opts.otherValueColor, opts.hideOtherValues]);
    const colorChanged = force || colorSignature !== lastColorSignature;
    const numericChanged = force || opts.numericKey !== lastNumericKey;
    if (!colorChanged && !numericChanged) return;
    lastColorSignature = colorSignature;
    lastNumericKey = opts.numericKey;
    if (colorChanged) regexPatterns = opts.regexEnabled ? compilePatterns(opts.regexText || "", opts.regexInsensitive) : [];
    for (const feature of rendered) {
      const original = geo.features[feature.get("podIndex")];
      const tags = featureTags(original);
      const update = {};
      if (colorChanged) {
        const attrs = basePass(tags, opts, regexPatterns);
        update.podColor = attrs.keep ? hexPacked(attrs.color) : -1;
      }
      if (numericChanged) {
        const n = numericValue(tags[opts.numericKey]);
        update.podValue = Number.isFinite(n) ? n : MISSING_NUMBER;
      }
      feature.setProperties(update, true);
    }
    if (!force) notifyVector();
    notifyHeat((colorChanged ? 1 : 0) | (numericChanged ? 2 : 0));
  };
  const syncGeometryAttributes = (values, notify = true) => {
    if (values === lastGeometryValues) return;
    lastGeometryValues = values;
    for (const feature of rendered) {
      const value = values?.[feature.get("podIndex")];
      feature.setProperties({ podGeomValue: Number.isFinite(value) ? value : -1 }, true);
    }
    if (notify) notifyVector();
    notifyHeat(4);
  };
  const syncSpatialAttributes = (scores, notify = true) => {
    if (scores === lastSpatialFlags) return;
    lastSpatialFlags = scores;
    for (const feature of rendered) {
      const value = scores?.[feature.get("podIndex")];
      feature.setProperties({ podSpatial: Number.isFinite(value) ? value : -1 }, true);
    }
    if (notify) notifyVector();
    notifyHeat(8);
  };
  const applyFilters = (next = {}) => {
    options = next;
    if (!geo) return;
    syncAttributes(next);
    syncGeometryAttributes(next.geometryValues);
    syncSpatialAttributes(next.spatialScores);
    const active = next.numericEnabled && next.numericKey ? 1 : 0;
    const update = { minEle: Number(next.numericMin) || 0, maxEle: Number(next.numericMax) || 0, numericEnabled: active, showErrors: next.numericShowErrors ? 1 : 0, minGeom: Number(next.geometryMin) || 0, maxGeom: Number(next.geometryMax) || 0, geometryEnabled: next.geometryEnabled ? 1 : 0, outlierMode: next.outlierMode === "only" ? 2 : next.outlierMode === "highlight" ? 1 : 0, outlierMin: Number(next.outlierMin) || 0, outlierMax: Number(next.outlierMax) || 0, spatialMode: next.spatialEnabled ? next.spatialDisplay === "isolated" ? 2 : next.spatialDisplay === "normal" ? 3 : 1 : 0, spatialThreshold: Number(next.spatialThreshold) || 0 };
    let changed = false;
    for (const [key, value] of Object.entries(update)) {
      if (lastStyleVars[key] !== value) { lastStyleVars[key] = value; changed = true; }
    }
    if (changed) {
      if (renderMode.value === "heat") syncStyleVars(heatLayer, heatStyleVars);
      else syncVectorStyles();
    }
  };
  const isOutlier = (value) => Number.isFinite(value) && value !== MISSING_NUMBER && (value < Number(options.outlierMin) || value > Number(options.outlierMax));
  const hasResultFilter = () => Boolean(geo && (options.onlySelectedKey && options.selectedKey || options.hideOtherValues && options.selectedValue !== null && options.selectedValue !== undefined || options.regexEnabled && options.regexOnly && options.selectedValue == null || options.numericEnabled && options.numericKey && !options.numericShowErrors || options.geometryEnabled || options.outlierMode === "only" || options.spatialEnabled || areaGeometry));
  const isResultMatch = (feature, ignoreGeometry = false) => {
    if (!feature || feature.get("podColor") < 0) return false;
    if (options.outlierMode === "only" && !isOutlier(feature.get("podValue"))) return false;
    const spatial = feature.get("podSpatial");
    if (options.spatialEnabled && options.spatialDisplay === "isolated" && !(spatial >= 0 && spatial > options.spatialThreshold)) return false;
    if (options.spatialEnabled && options.spatialDisplay === "normal" && !(spatial >= 0 && spatial <= options.spatialThreshold)) return false;
    const index = feature.get("podIndex");
    const raw = geo?.features[index];
    if (!raw) return false;
    const number = feature.get("podValue");
    if (options.numericEnabled && options.numericKey && !options.numericShowErrors && (number === MISSING_NUMBER || number < Number(options.numericMin) || number > Number(options.numericMax))) return false;
    const measure = feature.get("podGeomValue");
    if (!ignoreGeometry && options.geometryEnabled && (measure === -1 || measure < Number(options.geometryMin) || measure > Number(options.geometryMax))) return false;
    if (areaGeometry && !geometryInsideArea(feature.getGeometry(), areaGeometry)) return false;
    return true;
  };
  const getShapeReference = () => {
    const mask = new Uint8Array(geo?.features.length || 0);
    for (const feature of rendered) if (isResultMatch(feature, true)) mask[feature.get("podIndex")] = 1;
    return mask;
  };
  const clearResultSelection = (zoom = false) => {
    selectedIndex = null;
    selectionSource.clear(true);
    if (zoom) fit(rendered);
  };
  const selectResult = (index) => {
    if (selectedIndex === index) { clearResultSelection(true); return null; }
    const feature = featureByIndex(index);
    if (!isResultMatch(feature)) return selectedIndex;
    selectedIndex = index;
    selectionSource.clear(true);
    selectionSource.addFeature(new Feature({ geometry: feature.getGeometry() }));
    const shape = feature.getGeometry();
    const extent = shape.getExtent();
    const view = map.getView();
    if (!extent.every(Number.isFinite)) { clearResultSelection(); return null; }
    view.cancelAnimations();
    if (shape.getType() === "Point" || (extent[0] === extent[2] && extent[1] === extent[3])) view.animate({ center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2], zoom: 18, duration: 250 });
    else view.fit(extent, { padding: [65, 65, 65, 65], maxZoom: 19, duration: 250 });
    closePopup();
    return selectedIndex;
  };
  const purge = (indices) => {
    closePopup();
    clearResultSelection();
    for (const index of [...new Set(indices)].sort((a, b) => b - a)) {
      let low = 0;
      let high = rendered.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (rendered[middle].get("podIndex") < index) low = middle + 1;
        else high = middle;
      }
      if (rendered[low]?.get("podIndex") === index) {
        vectorSource.removeFeature(rendered[low]);
        rendered.splice(low, 1);
        if (heatReady && !heatShared) {
          for (const point of heatSource.getFeatures()) {
            const position = point.get("podLocalIndex");
            if (position === low) heatSource.removeFeature(point);
            else if (position > low) point.set("podLocalIndex", position - 1, true);
          }
        }
      }
      for (let i = low; i < rendered.length; i++) rendered[i].set("podIndex", rendered[i].get("podIndex") - 1, true);
    }
    map.getTargetElement().style.cursor = "";
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
  const zoomControl = map.getTargetElement().querySelector(".ol-zoom");
  zoomControl?.append(zoomAll);
  const toolsToggle = document.createElement("button");
  toolsToggle.type = "button";
  toolsToggle.className = "pod-map-tools-toggle";
  toolsToggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M3 16h8M7 12v8m8-7 6 6m0-6-6 6"/></svg>';
  toolsToggle.setAttribute("aria-controls", "pod-map-tools-panel");
  toolsToggle.setAttribute("aria-expanded", "false");
  const toolsPanel = document.createElement("div");
  toolsPanel.id = "pod-map-tools-panel";
  toolsPanel.className = "pod-map-tools-panel";
  toolsPanel.setAttribute("role", "group");
  toolsPanel.setAttribute("aria-label", "Herramientas del mapa");
  toolsPanel.hidden = true;
  const makeToolGroup = (label, className) => {
    const group = document.createElement("div");
    group.className = `pod-map-tools-group ${className}`;
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    group.title = label;
    return group;
  };
  const measurementTools = makeToolGroup("Mediciones", "pod-map-tools-measurements");
  const filterTools = makeToolGroup("Selección espacial", "pod-map-tools-selection");
  toolsPanel.append(measurementTools, filterTools);
  const setToolsOpen = (open) => {
    toolsPanel.hidden = !open;
    toolsToggle.setAttribute("aria-expanded", String(open));
    const label = open ? "Ocultar herramientas del mapa" : "Mostrar herramientas del mapa";
    toolsToggle.setAttribute("aria-label", label);
    toolsToggle.title = label;
  };
  toolsToggle.addEventListener("click", () => setToolsOpen(toolsPanel.hidden));
  toolsToggle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight") return;
    if (toolsPanel.hidden) setToolsOpen(true);
    toolsPanel.querySelector("button:not(:disabled)")?.focus();
    event.preventDefault();
  });
  toolsPanel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setToolsOpen(false);
    toolsToggle.focus();
    event.stopPropagation();
  });
  setToolsOpen(false);
  zoomControl?.append(toolsToggle, toolsPanel);
  const toolsStyles = document.createElement("link");
  toolsStyles.rel = "stylesheet";
  toolsStyles.href = "./src/map/map-tools.css";
  document.head.append(toolsStyles);
  const refreshToolsToggle = () => {
    const active = [measureButton, circleButton, areaButton].some((button) => button.getAttribute("aria-pressed") === "true");
    toolsToggle.classList.toggle("is-active", active);
  };
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
  const clearMeasuresButton = document.createElement("button");
  clearMeasuresButton.type = "button";
  clearMeasuresButton.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 16 14 5l3 3L6 19 3 16Z M8 11l3 3 M11 8l2 2"/><path d="m16 16 5 5m0-5-5 5"/></svg>';
  clearMeasuresButton.title = "Borrar mediciones de distancia";
  clearMeasuresButton.setAttribute("aria-label", "Borrar mediciones de distancia");
  Object.assign(clearMeasuresButton.style, { display: "grid", placeItems: "center", padding: "0" });
  clearMeasuresButton.disabled = true;
  let measuring = false;
  let measureGeometry = null;
  let measureTooltip = null;
  const measureTooltips = [];
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
    const label = document.createElement("div");
    Object.assign(label.style, { padding: "5px 8px", background: "#13221b", border: "1px solid #47634f", borderRadius: "5px", color: "#e1eae2", font: "700 12px system-ui", whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 3px 12px #0008" });
    measureTooltip = new Overlay({ element: label, offset: [0, -12], positioning: "bottom-center", stopEvent: false, insertFirst: false });
    map.addOverlay(measureTooltip);
    measureTooltips.push(measureTooltip);
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
      measureTooltip = null;
    }
    clearMeasuresButton.disabled = false;
  });
  const clearMeasurePreview = () => {
    measureGeometry?.un("change", updateMeasure);
    measureGeometry = null;
    if (measureTooltip) {
      map.removeOverlay(measureTooltip);
      measureTooltips.splice(measureTooltips.indexOf(measureTooltip), 1);
      measureTooltip = null;
    }
  };
  measureDraw.on("drawabort", clearMeasurePreview);
  const setMeasuring = (active) => {
    if (active && circleDrawing) setCircleDrawing(false);
    measuring = active;
    measureDraw.setActive(active);
    measureButton.setAttribute("aria-pressed", String(active));
    measureButton.style.background = active ? "#304e38" : "";
    measureButton.style.color = active ? "#a0d2ae" : "";
    map.getTargetElement().style.cursor = active ? "crosshair" : "";
    if (active) closePopup();
    else {
      measureDraw.abortDrawing();
      clearMeasurePreview();
    }
    refreshToolsToggle();
  };
  clearMeasuresButton.addEventListener("click", () => {
    measureDraw.abortDrawing();
    clearMeasurePreview();
    for (const overlay of measureTooltips) map.removeOverlay(overlay);
    measureTooltips.length = 0;
    measureSource.clear();
    clearMeasuresButton.disabled = true;
  });
  const circleSource = new Vector({ wrapX: false });
  const circleStyle = { "stroke-color": "#a0d2ae", "stroke-width": 2.5, "fill-color": "rgba(160,210,174,0.11)", "circle-radius": 5, "circle-fill-color": "#a0d2ae", "circle-stroke-color": "#0a1511", "circle-stroke-width": 2 };
  map.addLayer(new ol.layer.Vector({ source: circleSource, style: circleStyle }));
  const circleButton = document.createElement("button");
  circleButton.type = "button";
  circleButton.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><path d="M12 12 19.4 8.8"/></svg>';
  circleButton.title = "Medir círculo: clic en el centro, mueve el radio y doble clic para fijarlo";
  circleButton.setAttribute("aria-label", "Medir círculo");
  circleButton.setAttribute("aria-pressed", "false");
  Object.assign(circleButton.style, { display: "grid", placeItems: "center", padding: "0" });
  const clearCirclesButton = document.createElement("button");
  clearCirclesButton.type = "button";
  clearCirclesButton.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="11" r="6.6"/><path d="m16.3 16.3 5 5m0-5-5 5"/></svg>';
  clearCirclesButton.title = "Borrar círculos medidos";
  clearCirclesButton.setAttribute("aria-label", "Borrar círculos medidos");
  Object.assign(clearCirclesButton.style, { display: "grid", placeItems: "center", padding: "0" });
  clearCirclesButton.disabled = true;
  const doubleClickZoom = map.getInteractions().getArray().find((interaction) => interaction instanceof ol.interaction.DoubleClickZoom);
  let restoreDoubleClickZoom = true;
  let circleDrawing = false;
  let circleCenter = null;
  let circleCenterLonLat = null;
  let circlePolygon = null;
  let circleRadiusLine = null;
  let circleCenterPoint = null;
  let circleTooltip = null;
  const circleTooltips = [];
  const formatCircleLength = (meters) => meters >= 1000 ? `${(meters / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} km` : `${meters.toLocaleString("es-ES", { maximumFractionDigits: 1 })} m`;
  const circleRing = (center, radius) => {
    const lon = center[0] * Math.PI / 180;
    const lat = center[1] * Math.PI / 180;
    const angular = radius / 6371008.8;
    const points = [];
    for (let i = 0; i <= 96; i++) {
      const bearing = i * Math.PI * 2 / 96;
      const latitude = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
      const longitude = lon + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(latitude));
      points.push(ol.proj.fromLonLat([longitude * 180 / Math.PI, latitude * 180 / Math.PI]));
    }
    return points;
  };
  const cancelCirclePreview = () => {
    for (const feature of [circlePolygon, circleRadiusLine, circleCenterPoint]) if (feature) circleSource.removeFeature(feature);
    if (circleTooltip) { map.removeOverlay(circleTooltip); circleTooltips.splice(circleTooltips.indexOf(circleTooltip), 1); }
    circleCenter = null;
    circleCenterLonLat = null;
    circlePolygon = null;
    circleRadiusLine = null;
    circleCenterPoint = null;
    circleTooltip = null;
  };
  const updateCircle = (coordinate) => {
    if (!circleCenter) return 0;
    const radius = ol.sphere.getDistance(circleCenterLonLat, ol.proj.toLonLat(coordinate));
    if (!Number.isFinite(radius) || radius <= 0) return 0;
    circlePolygon.getGeometry().setCoordinates([circleRing(circleCenterLonLat, radius)]);
    circleRadiusLine.getGeometry().setCoordinates([circleCenter, coordinate]);
    circleTooltip.getElement().textContent = formatCircleLength(radius);
    circleTooltip.setPosition(coordinate);
    return radius;
  };
  const setCircleDrawing = (active) => {
    circleDrawing = active;
    circleButton.setAttribute("aria-pressed", String(active));
    circleButton.style.background = active ? "#304e38" : "";
    circleButton.style.color = active ? "#a0d2ae" : "";
    if (active) {
      if (measuring) setMeasuring(false);
      if (areaDrawing) setAreaDrawing(false);
      closePopup();
      restoreDoubleClickZoom = doubleClickZoom?.getActive() ?? true;
      doubleClickZoom?.setActive(false);
    } else {
      cancelCirclePreview();
      doubleClickZoom?.setActive(restoreDoubleClickZoom);
    }
    map.getTargetElement().style.cursor = active ? "crosshair" : "";
    refreshToolsToggle();
  };
  circleButton.addEventListener("click", () => setCircleDrawing(!circleDrawing));
  clearCirclesButton.addEventListener("click", () => {
    cancelCirclePreview();
    for (const overlay of circleTooltips) map.removeOverlay(overlay);
    circleTooltips.length = 0;
    circleSource.clear();
    clearCirclesButton.disabled = true;
  });
  map.on("singleclick", (event) => {
    if (!circleDrawing || circleCenter) return;
    circleCenter = event.coordinate.slice();
    circleCenterLonLat = ol.proj.toLonLat(circleCenter);
    circlePolygon = new Feature({ geometry: new ol.geom.Polygon([[circleCenter, circleCenter, circleCenter, circleCenter]]) });
    circleRadiusLine = new Feature({ geometry: new ol.geom.LineString([circleCenter, circleCenter]) });
    circleCenterPoint = new Feature({ geometry: new ol.geom.Point(circleCenter) });
    circleSource.addFeatures([circlePolygon, circleRadiusLine, circleCenterPoint]);
    const label = document.createElement("div");
    Object.assign(label.style, { padding: "5px 8px", background: "#13221b", border: "1px solid #47634f", borderRadius: "5px", color: "#e1eae2", font: "700 12px system-ui", whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 3px 12px #0008" });
    label.textContent = "0 m";
    circleTooltip = new Overlay({ element: label, offset: [0, -12], positioning: "bottom-center", stopEvent: false, insertFirst: false });
    map.addOverlay(circleTooltip);
    circleTooltips.push(circleTooltip);
    circleTooltip.setPosition(circleCenter);
    clearCirclesButton.disabled = false;
  });
  map.on("pointermove", (event) => { if (circleDrawing && circleCenter && !event.dragging) updateCircle(event.coordinate); });
  map.on("dblclick", (event) => {
    if (!circleDrawing) return;
    event.preventDefault();
    if (circleCenter && updateCircle(event.coordinate) > 0) {
      circleTooltip.getElement().style.background = "#203127";
      circleCenter = null;
      circleCenterLonLat = null;
      circlePolygon = null;
      circleRadiusLine = null;
      circleCenterPoint = null;
      circleTooltip = null;
    }
    return false;
  });
  measureButton.addEventListener("click", () => { if (!measuring && areaDrawing) setAreaDrawing(false); setMeasuring(!measuring); });
  const areaSource = new Vector({ wrapX: false });
  const areaStyle = { "stroke-color": "#f4db9b", "stroke-width": 2, "fill-color": "rgba(244,219,155,0.13)", "circle-radius": 5, "circle-fill-color": "#f4db9b", "circle-stroke-color": "#0a1511", "circle-stroke-width": 2 };
  map.addLayer(new ol.layer.Vector({ source: areaSource, style: areaStyle }));
  const areaDraw = new ol.interaction.Draw({ source: areaSource, type: "Polygon", style: areaStyle, stopClick: true });
  areaDraw.setActive(false);
  map.addInteraction(areaDraw);
  const areaButton = document.createElement("button");
  areaButton.type = "button";
  const selectionIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 8 7-5 9 5-2 8-8 5-7-7Z"/></svg>';
  areaButton.innerHTML = selectionIcon;
  areaButton.className = "pod-map-selection-add";
  const clearAreaButton = document.createElement("button");
  clearAreaButton.type = "button";
  clearAreaButton.innerHTML = selectionIcon;
  clearAreaButton.className = "pod-map-selection-remove";
  clearAreaButton.title = "Eliminar selección espacial y quitar el filtro de área";
  clearAreaButton.setAttribute("aria-label", "Eliminar selección espacial");
  clearAreaButton.disabled = true;
  let areaGeometry = null;
  let areaDrawing = false;
  const areaControls = () => {
    const selected = areaDrawing || Boolean(areaGeometry);
    areaButton.setAttribute("aria-pressed", String(selected));
    areaButton.setAttribute("aria-label", areaDrawing ? "Cancelar selección espacial" : areaGeometry ? "Redibujar selección espacial" : "Seleccionar por área");
    areaButton.title = areaDrawing ? "Cancelar selección espacial" : areaGeometry ? "Redibujar selección espacial: clics para dibujar y doble clic para sustituir el área" : "Seleccionar por área: clics para dibujar y doble clic para terminar";
    clearAreaButton.disabled = !areaGeometry;
    areaButton.style.background = selected ? "#304e38" : "";
    areaButton.style.color = selected ? "#a0d2ae" : "";
    refreshToolsToggle();
  };
  const setAreaDrawing = (active) => {
    areaDrawing = active;
    areaDraw.setActive(active);
    if (!active) areaDraw.abortDrawing();
    if (active) { closePopup(); if (measuring) setMeasuring(false); if (circleDrawing) setCircleDrawing(false); }
    map.getTargetElement().style.cursor = active ? "crosshair" : "";
    areaControls();
  };
  areaDraw.on("drawend", ({ feature }) => { areaSource.clear(); areaGeometry = feature.getGeometry(); queueMicrotask(() => { setAreaDrawing(false); resultsChanged?.(); }); });
  areaButton.addEventListener("click", () => setAreaDrawing(!areaDrawing));
  clearAreaButton.addEventListener("click", () => {
    if (!areaGeometry) return;
    if (areaDrawing) setAreaDrawing(false);
    areaSource.clear();
    areaGeometry = null;
    areaControls();
    resultsChanged?.();
  });
  areaControls();
  measurementTools.append(measureButton, circleButton, clearMeasuresButton, clearCirclesButton);
  filterTools.append(areaButton, clearAreaButton);
  const draw = (collection, { fitBounds = true, filters = options } = {}) => {
    closePopup();
    geo = collection;
    options = filters;
    rendered = [];
    clearResultSelection();
    heatReady = false;
    heatShared = true;
    heatDirty = 0;
    vectorDirty = false;
    lastColorSignature = "";
    lastNumericKey = undefined;
    lastGeometryValues = null;
    lastSpatialFlags = null;
    heatSource.clear(true);
    vectorSource.clear(true);
    for (let i = 0; i < (collection.features || []).length; i++) {
      const item = collection.features[i];
      if (!item?.geometry) continue;
      let geometry;
      try { geometry = format.readGeometry(item.geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }); } catch { continue; }
      if (!geometry) continue;
      if (geometry.getType() !== "Point") heatShared = false;
      const feature = new Feature({ geometry, podIndex: i, podValue: MISSING_NUMBER, podGeomValue: -1, podSpatial: -1, podColor: 0x8db6e8 });
      rendered.push(feature);
    }
    syncAttributes(options, true);
    syncGeometryAttributes(options.geometryValues, false);
    syncSpatialAttributes(options.spatialScores, false);
    vectorSource.addFeatures(rendered);
    heatLayer.setSource(heatShared ? vectorSource : heatSource);
    heatReady = heatShared;
    if (fitBounds) fit(rendered);
    render();
    resultsChanged?.();
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
      const point = new Feature({ geometry: new Point(center), podLocalIndex: i, podColor: feature.get("podColor"), podValue: feature.get("podValue"), podGeomValue: feature.get("podGeomValue"), podSpatial: feature.get("podSpatial") });
      points.push(point);
    }
    heatSource.addFeatures(points);
    heatReady = true;
    heatDirty = 0;
  };
  const render = () => {
    const isHeat = renderMode.value === "heat";
    if (isHeat && geo) buildHeat();
    if (isHeat) { flushHeat(); syncStyleVars(heatLayer, heatStyleVars); }
    else {
      if (vectorDirty) notifyVector();
      syncVectorStyles();
    }
    glowLayer.setVisible(!isHeat);
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
  let paintedHeat = { ...heat };
  const heatPaint = () => {
    const update = {};
    for (const key of ["radius", "weight", "intensity"]) if (heat[key] !== paintedHeat[key]) update[key] = heat[key];
    if (Object.keys(update).length) heatLayer.updateStyleVariables(update);
    if (heat.opacity !== paintedHeat.opacity) heatLayer.setOpacity(heat.opacity);
    if (heat.palette !== paintedHeat.palette) heatLayer.setGradient(COLORS[heat.palette]);
    paintedHeat = { ...heat };
  };
  [[intensity, intensityValue, "intensity"], [radius, radiusValue, "radius"], [opacity, opacityValue, "opacity"], [weight, weightValue, "weight"]].forEach(([input, output, key]) => input.addEventListener("input", () => { heat[key] = +input.value; output.value = input.value; heatSave(); heatPaint(); }));
  palette.onchange = () => { heat.palette = COLORS[palette.value] ? palette.value : "default"; heatSave(); heatPaint(); };
  reset.onclick = () => { heat = { ...DEFAULT_HEAT }; heatSave(); heatUI(); heatPaint(); };
  map.on("singleclick", (event) => {
    if (measuring || circleDrawing || areaDrawing || renderMode.value === "heat") return;
    const selected = map.forEachFeatureAtPixel(event.pixel, (feature) => feature, { hitTolerance: 3, layerFilter: (layer) => layer === vectorLayer });
    const index = selected?.get("podIndex");
    if (index == null || !geo?.features[index]) { closePopup(); return; }
    const raw = geo.features[index];
    if (!isResultMatch(selected)) { closePopup(); return; }
    popupContent.innerHTML = popupHtml(raw);
    popupIndex = index;
    popupAnchor = event.coordinate;
    popupElement.hidden = false;
    positionPopup();
  });
  map.on("pointermove", (event) => {
    if (event.dragging || measuring || circleDrawing || areaDrawing || renderMode.value === "heat") return;
    map.getTargetElement().style.cursor = map.hasFeatureAtPixel(event.pixel, { layerFilter: (layer) => layer === vectorLayer }) ? "pointer" : "";
  });
  const clear = () => { closePopup(); clearResultSelection(); geo = null; rendered = []; heatReady = false; heatShared = false; heatDirty = 0; vectorDirty = false; lastColorSignature = ""; lastNumericKey = undefined; lastGeometryValues = null; lastSpatialFlags = null; regexPatterns = []; vectorSource.clear(true); heatSource.clear(true); heatLayer.setSource(heatSource); };
  heatUI();
  render();
  return { map, draw, clear, purge, onPurge: (callback) => { purgeRequested = callback; }, render, heatUI, getHeat, setHeat, hasGeo: () => Boolean(geo), applyFilters, hasResultFilter, getShapeReference, getResultSource: () => rendered, isResultMatch, isSelectedResultMatch: () => selectedIndex === null || isResultMatch(featureByIndex(selectedIndex)), clearResultSelection, selectResult, onResultsChanged: (callback) => { resultsChanged = callback; } };
};
