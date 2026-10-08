import { esc, val } from "./utils.js";
import { featureTags } from "./analysis.js";
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
const compilePatterns = (raw, insensitive) => raw.split(",").map((v) => v.trim()).filter(Boolean).flatMap((value) => {
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
  const links = osm ? [["🔍", "Ver en OSM", osm], ["✏️", "Editar con iD", `https://www.openstreetmap.org/edit?editor=id&${type}=${id}`], ["⚡", "Editar con Rapid", `https://rapideditor.org/edit#id=${shortId}`], ["🧩", "Editar con Level0", `https://level0.osmz.ru/?url=${encodeURIComponent(osm)}`], ["🖥️", "Editar con JOSM", `http://127.0.0.1:8111/load_object?objects=${shortId}`]] : [];
  const actions = links.map(([icon, title, url]) => `<button type="button" class="pop-action" data-url="${esc(url)}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`).join("");
  return `<div class="pp"><div class="ph"><div class="pt">${esc(name)}</div></div><div class="tags">${body || '<div class="tr"><div class="tk">info</div><div class="tv">Sin información visible</div></div>'}</div>${actions ? `<div class="acts">${actions}</div>` : ""}</div>`;
};
const PASS = ["all", ["==", ["get", "podValid"], 1], ["between", ["get", "podValue"], ["var", "minEle"], ["var", "maxEle"]]];
const BAD = ["any", ["==", ["get", "podValid"], 0], ["<", ["get", "podValue"], ["var", "minEle"]], [">", ["get", "podValue"], ["var", "maxEle"]]];
const FILTER = ["all", ["==", ["get", "podKeep"], 1], ["any", ["==", ["var", "numericEnabled"], 0], ["==", ["var", "showErrors"], 1], PASS]];
const RED = ["case", ["all", ["==", ["var", "numericEnabled"], 1], BAD], 239, ["get", "podR"]];
const GREEN = ["case", ["all", ["==", ["var", "numericEnabled"], 1], BAD], 132, ["get", "podG"]];
const BLUE = ["case", ["all", ["==", ["var", "numericEnabled"], 1], BAD], 145, ["get", "podB"]];
const styleColor = (alpha) => ["color", RED, GREEN, BLUE, alpha];
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
  const baseLayer = new Tile({ className: "dark-base-layer", source: new OSM() });
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
    let color = "";
    if (opts.regexEnabled) {
      const value = tags[opts.selectedKey] == null ? "" : String(tags[opts.selectedKey]).trim();
      const match = value ? patterns.find((entry) => entry.regex.test(value)) : null;
      if (match) color = opts.regexColors?.[match.value] || "";
      else if (opts.regexOnly) return { keep: 0, color: "" };
    }
    return { keep: 1, color };
  };
  const syncAttributes = (opts, force = false) => {
    const signature = JSON.stringify([opts.selectedKey, opts.onlySelectedKey, opts.regexEnabled, opts.regexText, opts.regexInsensitive, opts.regexOnly, opts.regexColors, opts.numericKey]);
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
    if (renderMode.value === "heat") return;
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
    if (event.dragging || renderMode.value === "heat") return;
    map.getTargetElement().style.cursor = map.hasFeatureAtPixel(event.pixel, { layerFilter: (layer) => layer === vectorLayer }) ? "pointer" : "";
  });
  const clear = () => { closePopup(); geo = null; rendered = []; heatReady = false; heatShared = false; lastPrepared = ""; vectorSource.clear(true); heatSource.clear(true); heatLayer.setSource(heatSource); };
  heatUI();
  render();
  return { map, draw, clear, render, heatUI, hasGeo: () => Boolean(geo), applyFilters };
};
