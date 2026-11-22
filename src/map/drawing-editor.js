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
const insideArea = (geometry, area) => {
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
  if (type === "GeometryCollection") return geometry.getGeometries().length > 0 && geometry.getGeometries().every((part) => insideArea(part, area));
  return false;
};
const createAreaCounters = ({ ol, map, source }) => {
  const data = ol.layer.WebGLVector && map.getLayers().getArray().find((layer) => layer instanceof ol.layer.WebGLVector && layer.getSource() instanceof ol.source.Vector)?.getSource();
  if (!data) return;
  const labels = new Map();
  let preview = null;
  let refreshQueued = false;
  const stop = (entry) => {
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.revision++;
    entry.geometry.un("change", entry.onChange);
    map.removeOverlay(entry.overlay);
  };
  const position = (entry) => {
    const geometry = entry.geometry;
    const coordinates = geometry.getCoordinates()?.[0];
    if (!coordinates || coordinates.length < 4 || !coordinates.every((point) => point.every(Number.isFinite))) {
      entry.overlay.setPosition(undefined);
      return false;
    }
    const center = geometry.getInteriorPoint().getCoordinates();
    if (!center.slice(0, 2).every(Number.isFinite)) {
      entry.overlay.setPosition(undefined);
      return false;
    }
    entry.overlay.setPosition(center.slice(0, 2));
    return true;
  };
  const count = (entry) => {
    if (!position(entry)) return;
    const area = entry.geometry;
    const bounds = area.getExtent();
    const matches = [];
    data.forEachFeatureInExtent(bounds, (feature) => {
      if (feature.get("podIndex") != null && feature.get("podColor") >= 0) matches.push(feature);
    });
    const revision = ++entry.revision;
    let index = 0;
    let amount = 0;
    if (matches.length > 1000) entry.element.textContent = "Calculando…";
    const scan = () => {
      if (revision !== entry.revision) return;
      const start = performance.now();
      while (index < matches.length && performance.now() - start < 7) {
        const feature = matches[index++];
        if (insideArea(feature.getGeometry(), area)) amount++;
      }
      if (index < matches.length) requestAnimationFrame(scan);
      else entry.element.textContent = `${amount.toLocaleString("es-ES")} elemento${amount === 1 ? "" : "s"}`;
    };
    scan();
  };
  const queue = (entry, delay = 130) => {
    clearTimeout(entry.timer);
    entry.revision++;
    position(entry);
    entry.timer = setTimeout(() => count(entry), delay);
  };
  const add = (geometry) => {
    const element = document.createElement("div");
    element.className = "pod-selection-count";
    Object.assign(element.style, { padding: "4px 7px", background: "#17261edb", border: "1px solid #b0cda1", borderRadius: "4px", color: "#e8f4e2", font: "700 12px system-ui", whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 2px 8px #0009" });
    element.textContent = "0 elementos";
    const overlay = new ol.Overlay({ element, positioning: "center-center", stopEvent: false, insertFirst: false });
    map.addOverlay(overlay);
    const entry = { geometry, element, overlay, timer: 0, revision: 0 };
    entry.onChange = () => queue(entry);
    geometry.on("change", entry.onChange);
    queue(entry, 0);
    return entry;
  };
  for (const feature of source.getFeatures()) labels.set(feature, add(feature.getGeometry()));
  source.on("addfeature", ({ feature }) => labels.set(feature, add(feature.getGeometry())));
  source.on("removefeature", ({ feature }) => {
    stop(labels.get(feature));
    labels.delete(feature);
  });
  source.on("clear", () => {
    for (const entry of labels.values()) stop(entry);
    labels.clear();
  });
  const clearPreview = () => {
    stop(preview);
    preview = null;
  };
  for (const interaction of map.getInteractions().getArray()) if (interaction instanceof ol.interaction.Draw) {
    interaction.on("drawstart", ({ feature }) => {
      if (feature.getGeometry().getType() !== "Polygon") return;
      clearPreview();
      preview = add(feature.getGeometry());
    });
    interaction.on("drawend", clearPreview);
    interaction.on("drawabort", clearPreview);
  }
  const refresh = () => {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(() => {
      refreshQueued = false;
      for (const entry of labels.values()) queue(entry, 0);
      if (preview) queue(preview, 0);
    }, 180);
  };
  data.on("change", refresh);
};
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
  const directCircleDrag = Boolean(ol.interaction.Pointer);
  const modify = new ol.interaction.Modify({ source: handles, pixelTolerance: 17, filter: (feature) => !directCircleDrag || feature.get("record")?.kind !== "circle", insertVertexCondition: () => false, deleteCondition: () => false, condition: (event) => !drawingActive() && (ol.events?.condition?.primaryAction?.(event) ?? event.originalEvent.button === 0), style: new ol.style.Style({ image: new ol.style.Circle({ radius: 11, fill: new ol.style.Fill({ color: "#d8ffd7" }), stroke: new ol.style.Stroke({ color: "#14341e", width: 3 }) }) }) });
  map.addInteraction(modify);
  modify.on("modifyend", () => { if (selected?.kind === "area") updateSpatialResults(); });
  if (directCircleDrag) {
    let dragging = null;
    map.addInteraction(new ol.interaction.Pointer({
      handleDownEvent: (event) => {
        if (drawingActive() || event.originalEvent.button !== 0) return false;
        const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, { layerFilter: (layer) => layer === handleLayer, hitTolerance: 12 });
        if (feature?.get("record")?.kind !== "circle") return false;
        dragging = feature;
        setSelected(feature.get("record"));
        return true;
      },
      handleDragEvent: (event) => {
        if (dragging) dragging.getGeometry().setCoordinates(event.coordinate);
      },
      handleUpEvent: () => { dragging = null; return false; }
    }));
  }
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
  createAreaCounters({ ol, map, source: areaSource });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setSelected(null); });
};
