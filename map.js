import { esc, val } from "./utils.js";
const OSM_TYPES = ["node", "way", "relation"];
const SHORT = { node: "n", way: "w", relation: "r" };
const PP_TYPES = { N: "node", W: "way", R: "relation", node: "node", way: "way", relation: "relation" };
const postpassType = (properties) => {
  const raw = String(properties.osm_type || "").trim();
  return PP_TYPES[raw] || PP_TYPES[raw.toUpperCase()];
};
const stops = (...colors) => [0, "rgba(16,24,39,0)", 0.15, colors[0], 0.35, colors[1], 0.55, colors[2], 0.72, colors[3], 0.88, colors[4], 1, colors[5]];
const PALETTES = {
  default: stops("#355f8d", "#3f8f9c", "#79b88d", "#d6b56d", "#e58b68", "#ef5d72"),
  warm: stops("#72543b", "#a26c43", "#d1924f", "#e6b95f", "#ef8262", "#ef4e5d"),
  cool: stops("#324a7a", "#326b98", "#3f98a7", "#63b7a8", "#88d0b4", "#d3f0c0"),
  fire: stops("#3a173d", "#7d2450", "#bd3a45", "#e96d3e", "#f5b747", "#fff2a1")
};
const HEAT_DEFAULT = { intensity: 1, radius: 1, opacity: 0.88, weight: 1, palette: "default" };
export const createMapController = ({ ml, storage, heatStoreKey, renderMode, heatElements }) => {
  const { config, radius, intensity, opacity, weight, palette, radiusValue, intensityValue, opacityValue, weightValue, reset } = heatElements;
  const layers = ["overpass-fill", "overpass-line", "overpass-point"];
  const source = "overpass-data";
  const heatLayer = "overpass-heat";
  const heatSource = "overpass-heat-data";
  const validNum = (value, min, max, fallback) => Number.isFinite(+value) && +value >= min && +value <= max ? +value : fallback;
  let heat = { ...HEAT_DEFAULT };
  try {
    const saved = JSON.parse(storage.getItem(heatStoreKey) || "{}");
    heat = { intensity: validNum(saved.intensity, 0.25, 3, 1), radius: validNum(saved.radius, 0.25, 3, 1), opacity: validNum(saved.opacity, 0, 1, 0.88), weight: validNum(saved.weight, 0.1, 5, 1), palette: PALETTES[saved.palette] ? saved.palette : "default" };
  } catch {}
  const map = new ml.Map({ container: "map", style: "https://tiles.openfreemap.org/styles/fiord", center: [-3.70379, 40.416775], zoom: 5.5, minZoom: 0, maxZoom: 19, attributionControl: false });
  let geo;
  let popup;
  let lookup = new Map();
  map.setMissingStyleImageResolver?.((id) => {
    if (/^circle-\d+$/.test(id) && !map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
  });
  map.addControl(new ml.NavigationControl({ showCompass: false }), "top-left");
  map.addControl(new ml.AttributionControl({ compact: true }), "bottom-right");
  map.once("load", () => document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
  const oid = (feature) => {
    const properties = feature.properties || {};
    let type = postpassType(properties) || "";
    let id = type && properties.osm_id != null ? String(properties.osm_id) : "";
    if (!type) {
      for (const value of [properties.osm_url, feature.id, properties["@id"], properties.id, properties.osm_id]) {
        if (value == null || value === "") continue;
        const text = String(value);
        const match = text.match(/(?:https?:\/\/(?:www\.)?openstreetmap\.org\/)?(node|way|relation)[/:](\d+)$/i) || text.match(/^(node|way|relation)[/:]?(\d+)$/i) || text.match(/^([nwr])(\d+)$/i);
        if (!match) continue;
        type = { n: "node", w: "way", r: "relation" }[match[1].toLowerCase()] || match[1].toLowerCase();
        id = match[2];
        break;
      }
    }
    if (!type && OSM_TYPES.includes(properties.type) && properties.id != null) {
      type = properties.type;
      id = String(properties.id);
    }
    return { t: type, i: id, s: SHORT[type] || "", txt: type && id ? `${type}/${id}` : String(feature.id || properties["@id"] || properties.id || "") };
  };
  const entries = (value) => value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value).filter(([, item]) => item != null) : [];
  const rows = (items) => items.sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `<div class="tr"><div class="tk">${esc(key)}</div><div class="tv">${esc(val(value))}</div></div>`).join("");
  const section = (title, cls, items) => items.length ? `<section class="ps ${cls}"><div class="psh">${title}</div>${rows(items)}</section>` : "";
  const popupHtml = (feature) => {
    const properties = feature.properties || {};
    const osmId = oid(feature);
    const nested = properties.tags && typeof properties.tags === "object" && !Array.isArray(properties.tags) ? properties.tags : null;
    const flat = Object.keys(properties).some((key) => key.startsWith("@"));
    const tagObject = nested || (flat ? Object.fromEntries(Object.entries(properties).filter(([key, value]) => value != null && !key.startsWith("@") && !["relations", "meta", "id", "type"].includes(key))) : {});
    const relationData = properties["@relations"] ?? properties.relations;
    const relations = Array.isArray(relationData) ? relationData.map((value, index) => [String(index + 1), value]) : entries(relationData);
    const meta = [...entries(properties.meta), ...Object.entries(properties).filter(([key, value]) => value != null && (nested ? !["tags", "relations", "meta", "@id", "id", "type"].includes(key) : key.startsWith("@") && !["@id", "@relations"].includes(key)))];
    const name = tagObject.name || tagObject["name:es"] || tagObject.ref || "";
    const valid = osmId.t && osmId.i;
    const osm = valid ? `https://www.openstreetmap.org/${osmId.t}/${osmId.i}` : "";
    const shortId = osmId.s + osmId.i;
    const body = section("Tags OSM", "tag", entries(tagObject)) + section("Relaciones", "rel", relations) + section("Metadatos", "meta", meta);
    const links = valid ? [["🔍", "Ver en OSM", osm], ["✏️", "Editar con iD", `https://www.openstreetmap.org/edit?editor=id&${osmId.t}=${osmId.i}`], ["⚡", "Editar con Rapid", `https://rapideditor.org/edit#id=${shortId}`], ["🧩", "Editar con Level0", `https://level0.osmz.ru/?url=${encodeURIComponent(osm)}`], ["🖥️", "Editar con JOSM", `http://127.0.0.1:8111/load_object?objects=${shortId}`]] : [];
    const actions = links.map(([icon, title, url]) => `<button type="button" class="pop-action" data-url="${esc(url)}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`).join("");
    return `<div class="pp"><div class="ph"><div class="pt">${esc(name)}</div></div><div class="tags">${body || '<div class="tr"><div class="tk">info</div><div class="tv">Sin información visible</div></div>'}</div>${actions ? `<div class="acts">${actions}</div>` : ""}</div>`;
  };
  const display = (collection) => {
    lookup = new Map();
    const features = [];
    for (const feature of collection.features || []) {
      if (!feature?.geometry) continue;
      const id = String(features.length);
      lookup.set(id, feature);
      features.push({ type: "Feature", id: features.length, properties: { _fid: id }, geometry: feature.geometry });
    }
    return { type: "FeatureCollection", features };
  };
  const geoPoints = (geometry, out = []) => {
    const walk = (coordinates) => {
      if (!Array.isArray(coordinates)) return;
      if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") out.push(coordinates);
      else coordinates.forEach(walk);
    };
    if (!geometry) return out;
    if (geometry.type === "GeometryCollection") geometry.geometries?.forEach((item) => geoPoints(item, out));
    else walk(geometry.coordinates);
    return out;
  };
  const fit = (collection) => {
    const bounds = new ml.LngLatBounds();
    for (const feature of collection.features || []) geoPoints(feature.geometry).forEach((point) => bounds.extend(point));
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 24, maxZoom: 17, duration: 500 });
  };
  const featurePoint = (feature) => {
    const geometry = feature?.geometry;
    if (!geometry) return null;
    if (geometry.type === "Point") return geometry.coordinates;
    const points = geoPoints(geometry);
    if (!points.length) return null;
    const [x, y] = points.reduce(([sumX, sumY], point) => [sumX + point[0], sumY + point[1]], [0, 0]);
    return [x / points.length, y / points.length];
  };
  const heatData = (collection) => ({ type: "FeatureCollection", features: (collection.features || []).flatMap((feature, index) => {
    const point = featurePoint(feature);
    return point ? [{ type: "Feature", id: index, properties: { _fid: String(index) }, geometry: { type: "Point", coordinates: point } }] : [];
  }) });
  const interpolate = (input, values) => ["interpolate", ["linear"], input, ...values];
  const heatIntensity = (value) => interpolate(["zoom"], [0, 0.7 * value, 9, 1.5 * value, 15, 2 * value]);
  const heatRadius = (value) => interpolate(["zoom"], [0, 10 * value, 6, 20 * value, 12, 32 * value, 18, 45 * value]);
  const heatColor = (value) => interpolate(["heatmap-density"], PALETTES[value]);
  const heatSave = () => storage.setItem(heatStoreKey, JSON.stringify(heat));
  const heatControls = [[intensity, intensityValue, "intensity"], [radius, radiusValue, "radius"], [opacity, opacityValue, "opacity"], [weight, weightValue, "weight"]];
  const heatUI = () => {
    heatControls.forEach(([input, output, key]) => input.value = output.value = heat[key]);
    palette.value = heat.palette;
    config.hidden = renderMode.value !== "heat";
  };
  const heatStyle = () => ({ "heatmap-intensity": heatIntensity(heat.intensity), "heatmap-radius": heatRadius(heat.radius), "heatmap-opacity": heat.opacity, "heatmap-weight": heat.weight, "heatmap-color": heatColor(heat.palette) });
  const heatPaint = () => {
    if (map.getLayer(heatLayer)) Object.entries(heatStyle()).forEach(([key, value]) => map.setPaintProperty(heatLayer, key, value));
  };
  const remove = () => {
    popup?.remove();
    popup = null;
    if (!map.isStyleLoaded()) return;
    [...layers, heatLayer].forEach((id) => map.getLayer(id) && map.removeLayer(id));
    [source, heatSource].forEach((id) => map.getSource(id) && map.removeSource(id));
  };
  const renderNormal = () => {
    map.addSource(source, { type: "geojson", data: display(geo) });
    [["fill", { "fill-color": "#8db6e8", "fill-opacity": 0.18 }], ["line", { "line-color": "#8db6e8", "line-width": 3, "line-opacity": 0.95 }], ["circle", { "circle-radius": 7, "circle-color": "#8db6e8", "circle-opacity": 0.95, "circle-stroke-color": "#e5edf8", "circle-stroke-width": 1.4 }]].forEach(([type, paint], index) => map.addLayer({ id: layers[index], type, source, paint }));
  };
  const renderHeat = () => {
    map.addSource(heatSource, { type: "geojson", data: heatData(geo) });
    map.addLayer({ id: heatLayer, type: "heatmap", source: heatSource, paint: heatStyle() });
  };
  const render = () => {
    if (!geo || !map.isStyleLoaded()) return;
    remove();
    renderMode.value === "heat" ? renderHeat() : renderNormal();
  };
  const draw = (collection) => {
    geo = collection;
    render();
    fit(collection);
  };
  const clear = () => {
    geo = null;
    lookup = new Map();
    remove();
  };
  const openPopup = (event) => {
    const feature = event.features?.[0];
    const original = feature && lookup.get(String(feature.properties?._fid));
    if (!original) return;
    popup?.remove();
    popup = new ml.Popup({ maxWidth: "480px", closeButton: true, closeOnClick: true }).setLngLat(event.lngLat).setHTML(popupHtml(original)).addTo(map);
    popup.getElement().querySelectorAll(".pop-action").forEach((button) => button.onclick = () => window.open(button.dataset.url, "_blank", "noopener,noreferrer"));
  };
  layers.forEach((id) => {
    map.on("click", id, openPopup);
    map.on("mouseenter", id, () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", id, () => map.getCanvas().style.cursor = "");
  });
  heatControls.forEach(([input, output, key]) => input.oninput = () => {
    heat[key] = +input.value;
    output.value = input.value;
    heatSave();
    heatPaint();
  });
  palette.onchange = () => {
    heat.palette = PALETTES[palette.value] ? palette.value : "default";
    heatSave();
    heatPaint();
  };
  reset.onclick = () => {
    heat = { ...HEAT_DEFAULT };
    heatSave();
    heatUI();
    heatPaint();
  };
  map.on("style.load", () => geo && render());
  heatUI();
  return { map, draw, clear, render, heatUI, hasGeo: () => Boolean(geo) };
};
