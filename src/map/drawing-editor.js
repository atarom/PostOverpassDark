const EARTH_RADIUS = 6371008.8;
const radians = (value) => value * Math.PI / 180;
const degrees = (value) => value * 180 / Math.PI;
const bearing = ([lon1, lat1], [lon2, lat2]) => {
  const a = radians(lat1);
  const b = radians(lat2);
  const delta = radians(lon2 - lon1);
  return Math.atan2(Math.sin(delta) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta));
};
const destination = ([longitude, latitude], distance, direction) => {
  const lat = radians(latitude);
  const lon = radians(longitude);
  const arc = distance / EARTH_RADIUS;
  const targetLat = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(direction));
  const targetLon = lon + Math.atan2(Math.sin(direction) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(targetLat));
  return [degrees(targetLon), degrees(targetLat)];
};
const ring = (ol, center, radius) => Array.from({ length: 97 }, (_, index) => ol.proj.fromLonLat(destination(center, radius, index * Math.PI * 2 / 96)));
const formatDistance = (meters) => meters >= 1000 ? `${(meters / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} km` : `${meters.toLocaleString("es-ES", { maximumFractionDigits: 1 })} m`;
const isDistanceLabel = (element) => element?.tagName === "DIV" && /^[\d.,\s]+(?:km|m)$/.test(element.textContent.trim());
const distanceSquared = (a, b) => a && b ? (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 : Infinity;
export const createDrawingEditor = ({ ol, map }) => {
  const layers = map.getLayers().getArray().filter((layer) => layer instanceof ol.layer.Vector && layer.getSource() instanceof ol.source.Vector);
  if (layers.length < 4) return;
  const [measureLayer, circleLayer, areaLayer] = layers.slice(-3);
  const [measureSource, circleSource, areaSource] = [measureLayer, circleLayer, areaLayer].map((layer) => layer.getSource());
  const toolsPanel = document.getElementById("pod-map-tools-panel");
  const circleButton = toolsPanel?.querySelector('[aria-label="Medir círculo"]');
  if (!toolsPanel || !circleButton) return;
  const handles = new ol.source.Vector({ wrapX: false });
  const colors = { vertex: "#a0eac0", center: "#a0eac0", radius: "#ffe39b" };
  const styles = {};
  for (const role of Object.keys(colors)) for (const active of [false, true]) {
    const color = colors[role];
    styles[`${role}-${active}`] = new ol.style.Style({ image: new ol.style.Circle({ radius: active ? 10 : role === "radius" ? 8 : 7, fill: new ol.style.Fill({ color }), stroke: new ol.style.Stroke({ color: active ? "#f7fff4" : "#0b1e17", width: active ? 3 : 2.5 }) }), zIndex: active ? 2 : 1 });
  }
  const handleLayer = new ol.layer.Vector({ source: handles, style: (feature) => styles[`${feature.get("role")}-${feature.get("record") === selected}`], zIndex: 100, declutter: false });
  map.addLayer(handleLayer);
  const records = new Map();
  const circleFeatures = new WeakMap();
  const pendingCircles = new Set();
  let selected = null;
  let stagedCircle = [];
  let syncing = false;
  const drawingActive = () => map.getInteractions().getArray().some((interaction) => interaction instanceof ol.interaction.Draw && interaction.getActive()) || circleButton.getAttribute("aria-pressed") === "true";
  const tooltipAt = (coordinate) => map.getOverlays().getArray().find((overlay) => distanceSquared(overlay.getPosition(), coordinate) < 0.01 && isDistanceLabel(overlay.getElement())) || null;
  const setSelected = (record) => {
    if (selected === record) return;
    selected = record;
    handles.changed();
  };
  const updateSpatialResults = () => document.getElementById("numericErrors")?.dispatchEvent(new Event("change", { bubbles: true }));
  const addHandle = (record, role, coordinate, callback) => {
    const feature = new ol.Feature({ geometry: new ol.geom.Point(coordinate.slice()), record, role });
    const geometry = feature.getGeometry();
    const listener = () => {
      if (syncing) return;
      setSelected(record);
      callback(geometry.getCoordinates());
    };
    geometry.on("change", listener);
    record.handles.push({ feature, geometry, listener });
    handles.addFeature(feature);
    return feature;
  };
  const removeRecord = (record) => {
    if (!record || !records.has(record.feature)) return;
    for (const entry of record.handles) {
      entry.geometry.un("change", entry.listener);
      handles.removeFeature(entry.feature);
    }
    record.geometry?.un("change", record.onGeometry);
    records.delete(record.feature);
    if (selected === record) setSelected(null);
  };
  const syncGeometry = (record) => {
    if (syncing || record.kind === "circle") return;
    syncing = true;
    const geometry = record.feature.getGeometry();
    const coordinates = record.kind === "measure" ? geometry.getCoordinates() : geometry.getCoordinates()[0].slice(0, -1);
    if (coordinates.length !== record.handles.length) {
      syncing = false;
      const kind = record.kind;
      const feature = record.feature;
      removeRecord(record);
      addGeometry(feature, kind);
      return;
    }
    for (let i = 0; i < coordinates.length; i++) record.handles[i].geometry.setCoordinates(coordinates[i]);
    if (record.kind === "measure") {
      record.tooltip ||= tooltipAt(geometry.getLastCoordinate());
      if (record.tooltip) {
        record.tooltip.setPosition(geometry.getLastCoordinate());
        record.tooltip.getElement().textContent = formatDistance(ol.sphere.getLength(geometry, { projection: map.getView().getProjection() }));
      }
    }
    syncing = false;
  };
  const addGeometry = (feature, kind) => {
    if (records.has(feature)) return;
    const geometry = feature.getGeometry();
    const record = { feature, kind, handles: [], geometry, tooltip: kind === "measure" ? tooltipAt(geometry.getLastCoordinate()) : null };
    records.set(feature, record);
    const coordinates = kind === "measure" ? geometry.getCoordinates() : geometry.getCoordinates()[0].slice(0, -1);
    for (let i = 0; i < coordinates.length; i++) addHandle(record, "vertex", coordinates[i], (coordinate) => {
      syncing = true;
      const next = geometry.getCoordinates();
      if (kind === "measure") next[i] = coordinate;
      else {
        next[0][i] = coordinate;
        if (i === 0) next[0][next[0].length - 1] = coordinate.slice();
      }
      geometry.setCoordinates(next);
      syncing = false;
      syncGeometry(record);
    });
    record.onGeometry = () => syncGeometry(record);
    geometry.on("change", record.onGeometry);
  };
  const registerCircle = (features) => {
    if (features.length !== 3 || features[0].getGeometry().getType() !== "Polygon" || features[1].getGeometry().getType() !== "LineString" || features[2].getGeometry().getType() !== "Point") return;
    const group = { polygon: features[0], line: features[1], point: features[2] };
    for (const feature of features) circleFeatures.set(feature, group);
    pendingCircles.add(group);
  };
  const addCircle = (group) => {
    if (records.has(group.polygon) || !circleSource.getFeatures().includes(group.polygon)) return;
    const line = group.line.getGeometry().getCoordinates();
    const center = ol.proj.toLonLat(line[0]);
    const radius = ol.sphere.getDistance(center, ol.proj.toLonLat(line[1]));
    if (!Number.isFinite(radius) || radius < 1) return;
    const record = { feature: group.polygon, group, kind: "circle", handles: [], tooltip: tooltipAt(line[1]) };
    records.set(record.feature, record);
    const centerHandle = addHandle(record, "center", line[0], (coordinate) => updateCircle(record, "center", coordinate));
    const radiusHandle = addHandle(record, "radius", ol.proj.fromLonLat(destination(center, radius, Math.PI / 2)), (coordinate) => updateCircle(record, "radius", coordinate));
    record.center = centerHandle;
    record.radius = radiusHandle;
    pendingCircles.delete(group);
  };
  const updateCircle = (record, role, coordinate) => {
    const group = record.group;
    const line = group.line.getGeometry().getCoordinates();
    const previousCenter = ol.proj.toLonLat(line[0]);
    const previousEdge = ol.proj.toLonLat(line[1]);
    const previousRadius = ol.sphere.getDistance(previousCenter, previousEdge);
    const direction = bearing(previousCenter, previousEdge);
    const center = role === "center" ? coordinate : record.center.getGeometry().getCoordinates();
    let edge = role === "radius" ? coordinate : record.radius.getGeometry().getCoordinates();
    syncing = true;
    if (role === "center") {
      const handleDirection = bearing(previousCenter, ol.proj.toLonLat(edge));
      edge = ol.proj.fromLonLat(destination(ol.proj.toLonLat(center), previousRadius, handleDirection));
      record.radius.getGeometry().setCoordinates(edge);
    }
    const radius = ol.sphere.getDistance(ol.proj.toLonLat(center), ol.proj.toLonLat(edge));
    if (Number.isFinite(radius) && radius >= 1) {
      const labelCoordinate = ol.proj.fromLonLat(destination(ol.proj.toLonLat(center), radius, direction));
      group.point.getGeometry().setCoordinates(center);
      group.line.getGeometry().setCoordinates([center, labelCoordinate]);
      group.polygon.getGeometry().setCoordinates([ring(ol, ol.proj.toLonLat(center), radius)]);
      record.tooltip ||= tooltipAt(line[1]);
      if (record.tooltip) {
        record.tooltip.setPosition(labelCoordinate);
        record.tooltip.getElement().textContent = formatDistance(radius);
      }
    }
    syncing = false;
  };
  const finishCircles = () => {
    for (const group of [...pendingCircles]) if (circleSource.getFeatures().includes(group.polygon)) addCircle(group);
  };
  const existing = circleSource.getFeatures();
  for (let i = 0; i + 2 < existing.length; i += 3) registerCircle(existing.slice(i, i + 3));
  finishCircles();
  circleSource.on("addfeature", ({ feature }) => {
    stagedCircle.push(feature);
    if (stagedCircle.length === 3) {
      registerCircle(stagedCircle);
      stagedCircle = [];
    }
  });
  map.getTargetElement().addEventListener("dblclick", () => setTimeout(finishCircles, 0), true);
  for (const feature of measureSource.getFeatures()) addGeometry(feature, "measure");
  for (const feature of areaSource.getFeatures()) addGeometry(feature, "area");
  for (const [source, kind] of [[measureSource, "measure"], [areaSource, "area"]]) {
    source.on("addfeature", ({ feature }) => addGeometry(feature, kind));
    source.on("removefeature", ({ feature }) => removeRecord(records.get(feature)));
    source.on("clear", () => { for (const record of [...records.values()]) if (record.kind === kind) removeRecord(record); });
  }
  circleSource.on("removefeature", ({ feature }) => {
    const group = circleFeatures.get(feature);
    if (group) {
      pendingCircles.delete(group);
      removeRecord(records.get(group.polygon));
    }
  });
  circleSource.on("clear", () => {
    stagedCircle = [];
    pendingCircles.clear();
    for (const record of [...records.values()]) if (record.kind === "circle") removeRecord(record);
  });
  const modify = new ol.interaction.Modify({ source: handles, pixelTolerance: 17, insertVertexCondition: () => false, deleteCondition: () => false, condition: (event) => !drawingActive() && (ol.events?.condition?.primaryAction?.(event) ?? event.originalEvent.button === 0), style: new ol.style.Style({ image: new ol.style.Circle({ radius: 11, fill: new ol.style.Fill({ color: "#d8ffd7" }), stroke: new ol.style.Stroke({ color: "#14341e", width: 3 }) }) }) });
  map.addInteraction(modify);
  modify.on("modifyend", () => { if (selected?.kind === "area") updateSpatialResults(); });
  map.on("singleclick", (event) => {
    if (drawingActive() || event.originalEvent.altKey) return;
    const clickedHandle = map.forEachFeatureAtPixel(event.pixel, (feature) => feature, { layerFilter: (layer) => layer === handleLayer, hitTolerance: 14 });
    if (clickedHandle) { setSelected(clickedHandle.get("record")); return; }
    const picked = map.forEachFeatureAtPixel(event.pixel, (feature, layer) => ({ feature, layer }), { layerFilter: (layer) => [measureLayer, circleLayer, areaLayer].includes(layer), hitTolerance: 10 });
    if (!picked) { setSelected(null); return; }
    if (picked.layer === circleLayer) setSelected(records.get(circleFeatures.get(picked.feature)?.polygon) || null);
    else setSelected(records.get(picked.feature) || null);
  });
  map.on("pointermove", (event) => {
    if (drawingActive()) return;
    const hit = map.hasFeatureAtPixel(event.pixel, { layerFilter: (layer) => layer === handleLayer, hitTolerance: 12 });
    if (hit) map.getTargetElement().style.cursor = event.originalEvent.buttons ? "grabbing" : "grab";
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setSelected(null); });
};
