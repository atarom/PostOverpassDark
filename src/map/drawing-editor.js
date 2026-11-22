const EARTH_RADIUS = 6371008.8;
const radians = (value) => value * Math.PI / 180;
const degrees = (value) => value * 180 / Math.PI;
const geodesicBearing = ([lon1, lat1], [lon2, lat2]) => {
  const a = radians(lat1);
  const b = radians(lat2);
  const delta = radians(lon2 - lon1);
  return Math.atan2(Math.sin(delta) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta));
};
const geodesicDestination = ([longitude, latitude], distance, bearing) => {
  const lat = radians(latitude);
  const lon = radians(longitude);
  const arc = distance / EARTH_RADIUS;
  const targetLat = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(bearing));
  const targetLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(targetLat));
  return [degrees(targetLon), degrees(targetLat)];
};
const geodesicRing = (ol, center, distance) => {
  const points = [];
  for (let i = 0; i <= 96; i++) points.push(ol.proj.fromLonLat(geodesicDestination(center, distance, i * Math.PI * 2 / 96)));
  return points;
};
const formatDistance = (meters) => meters >= 1000 ? `${(meters / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} km` : `${meters.toLocaleString("es-ES", { maximumFractionDigits: 1 })} m`;
const squaredDistance = (first, second) => first && second ? (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 : Infinity;
const isDistanceLabel = (element) => element?.tagName === "DIV" && /^[\d.,\s]+(?:km|m)$/.test(element.textContent.trim());
export const createDrawingEditor = ({ ol, map }) => {
  const vectorLayers = map.getLayers().getArray().filter((layer) => layer instanceof ol.layer.Vector && layer.getSource() instanceof ol.source.Vector);
  if (vectorLayers.length < 4) return;
  const [measureLayer, circleLayer, areaLayer] = vectorLayers.slice(-3);
  const measureSource = measureLayer.getSource();
  const circleSource = circleLayer.getSource();
  const areaSource = areaLayer.getSource();
  const toolsPanel = document.getElementById("pod-map-tools-panel");
  const circleButton = toolsPanel?.querySelector('[aria-label="Medir círculo"]');
  if (!toolsPanel || !circleButton) return;
  let selected = null;
  let selectedKind = "";
  let selectedTooltip = null;
  let trackedGeometry = null;
  let circleGroup = null;
  let centerHandle = null;
  let radiusHandle = null;
  let editingCircle = false;
  let circleListenerKeys = [];
  const circleByFeature = new WeakMap();
  let stagedCircle = [];
  const registerCircle = (features) => {
    if (features.length !== 3 || features[0].getGeometry().getType() !== "Polygon" || features[1].getGeometry().getType() !== "LineString" || features[2].getGeometry().getType() !== "Point") return;
    const group = { polygon: features[0], line: features[1], point: features[2] };
    for (const feature of features) circleByFeature.set(feature, group);
  };
  const storedCircles = circleSource.getFeatures();
  for (let i = 0; i + 2 < storedCircles.length; i += 3) registerCircle(storedCircles.slice(i, i + 3));
  circleSource.on("addfeature", ({ feature }) => {
    stagedCircle.push(feature);
    if (stagedCircle.length === 3) {
      registerCircle(stagedCircle);
      stagedCircle = [];
    }
  });
  const handles = new ol.source.Vector({ wrapX: false });
  const handleLayer = new ol.layer.Vector({ source: handles, style: (feature) => ({ "circle-radius": feature.get("role") === "radius" ? 10 : 7, "circle-fill-color": feature.get("role") === "radius" ? "#94f3ba" : "#ffe39b", "circle-stroke-color": "#14291c", "circle-stroke-width": 2.5 }) });
  map.addLayer(handleLayer);
  const vertices = new ol.Collection();
  const vertexModify = new ol.interaction.Modify({ features: vertices, pixelTolerance: 13, condition: (event) => !event.originalEvent.shiftKey && (ol.events?.condition?.primaryAction?.(event) ?? event.originalEvent.button === 0), style: { "circle-radius": 9, "circle-fill-color": "#94f3ba", "circle-stroke-color": "#14291c", "circle-stroke-width": 2 } });
  const translate = new ol.interaction.Translate({ features: vertices, condition: (event) => event.originalEvent.shiftKey, hitTolerance: 12 });
  const circleModify = new ol.interaction.Modify({ source: handles, pixelTolerance: 15, condition: (event) => !event.originalEvent.shiftKey && (ol.events?.condition?.primaryAction?.(event) ?? event.originalEvent.button === 0), insertVertexCondition: () => false, style: { "circle-radius": 10, "circle-fill-color": "#94f3ba", "circle-stroke-color": "#14291c", "circle-stroke-width": 2 } });
  for (const interaction of [vertexModify, translate, circleModify]) {
    interaction.setActive(false);
    map.addInteraction(interaction);
  }
  const updateSpatialResults = () => document.getElementById("numericErrors")?.dispatchEvent(new Event("change", { bubbles: true }));
  const tooltipAt = (coordinate) => map.getOverlays().getArray().find((overlay) => squaredDistance(overlay.getPosition(), coordinate) < 0.001 && isDistanceLabel(overlay.getElement())) || null;
  const moveTooltip = (coordinate, meters) => {
    if (!selectedTooltip) return;
    selectedTooltip.setPosition(coordinate);
    selectedTooltip.getElement().textContent = formatDistance(meters);
  };
  const refreshVertices = () => {
    if (!selected || selectedKind === "circle") return;
    const geometry = selected.getGeometry();
    const coords = selectedKind === "measure" ? geometry.getCoordinates() : geometry.getCoordinates()[0]?.slice(0, -1) || [];
    handles.clear(true);
    handles.addFeatures(coords.map((coordinate) => new ol.Feature({ geometry: new ol.geom.Point(coordinate), role: "vertex" })));
    if (selectedKind === "measure") moveTooltip(geometry.getLastCoordinate(), ol.sphere.getLength(geometry, { projection: map.getView().getProjection() }));
  };
  const updateCircle = (role) => {
    if (editingCircle || !circleGroup) return;
    editingCircle = true;
    const lineCoords = circleGroup.line.getGeometry().getCoordinates();
    const before = ol.proj.toLonLat(lineCoords[0]);
    let center = centerHandle.getGeometry().getCoordinates();
    let edge = radiusHandle.getGeometry().getCoordinates();
    if (role === "center") {
      const radius = ol.sphere.getDistance(before, ol.proj.toLonLat(lineCoords[1]));
      const bearing = geodesicBearing(before, ol.proj.toLonLat(lineCoords[1]));
      edge = ol.proj.fromLonLat(geodesicDestination(ol.proj.toLonLat(center), radius, bearing));
      radiusHandle.getGeometry().setCoordinates(edge);
    }
    const radius = ol.sphere.getDistance(ol.proj.toLonLat(center), ol.proj.toLonLat(edge));
    if (radius > 0 && Number.isFinite(radius)) {
      circleGroup.point.getGeometry().setCoordinates(center);
      circleGroup.line.getGeometry().setCoordinates([center, edge]);
      circleGroup.polygon.getGeometry().setCoordinates([geodesicRing(ol, ol.proj.toLonLat(center), radius)]);
      moveTooltip(edge, radius);
    }
    editingCircle = false;
  };
  const detachGeometry = () => {
    if (trackedGeometry) trackedGeometry.geometry.un("change", trackedGeometry.listener);
    trackedGeometry = null;
    for (const [geometry, callback] of circleListenerKeys) geometry.un("change", callback);
    circleListenerKeys = [];
  };
  const deselect = () => {
    detachGeometry();
    selected = null;
    selectedKind = "";
    selectedTooltip = null;
    circleGroup = null;
    centerHandle = null;
    radiusHandle = null;
    vertices.clear();
    handles.clear(true);
    vertexModify.setActive(false);
    translate.setActive(false);
    circleModify.setActive(false);
  };
  const select = (feature, kind) => {
    deselect();
    if (!feature) return;
    selected = feature;
    selectedKind = kind;
    if (kind === "circle") {
      circleGroup = circleByFeature.get(feature) || null;
      if (!circleGroup) { deselect(); return; }
      const line = circleGroup.line.getGeometry().getCoordinates();
      selectedTooltip = tooltipAt(line[1]);
      centerHandle = new ol.Feature({ geometry: new ol.geom.Point(line[0]), role: "center" });
      radiusHandle = new ol.Feature({ geometry: new ol.geom.Point(line[1]), role: "radius" });
      handles.addFeatures([centerHandle, radiusHandle]);
      for (const [handle, role] of [[centerHandle, "center"], [radiusHandle, "radius"]]) {
        const geometry = handle.getGeometry();
        const callback = () => updateCircle(role);
        geometry.on("change", callback);
        circleListenerKeys.push([geometry, callback]);
      }
      circleModify.setActive(true);
      return;
    }
    const geometry = feature.getGeometry();
    selectedTooltip = kind === "measure" ? tooltipAt(geometry.getLastCoordinate()) : null;
    const callback = () => refreshVertices();
    geometry.on("change", callback);
    trackedGeometry = { geometry, listener: callback };
    vertices.push(feature);
    refreshVertices();
    vertexModify.setActive(true);
    translate.setActive(true);
  };
  const drawingActive = () => map.getInteractions().getArray().some((interaction) => interaction instanceof ol.interaction.Draw && interaction.getActive()) || circleButton.getAttribute("aria-pressed") === "true";
  for (const button of toolsPanel.querySelectorAll("button")) button.addEventListener("click", () => { if (drawingActive()) deselect(); });
  const activeLayers = [measureLayer, circleLayer, areaLayer];
  map.on("singleclick", (event) => {
    if (drawingActive() || event.originalEvent.altKey || event.originalEvent.shiftKey) return;
    if (map.hasFeatureAtPixel(event.pixel, { layerFilter: (layer) => layer === handleLayer, hitTolerance: 12 })) return;
    const result = map.forEachFeatureAtPixel(event.pixel, (feature, layer) => activeLayers.includes(layer) ? { feature, layer } : undefined, { layerFilter: (layer) => activeLayers.includes(layer), hitTolerance: 10 });
    if (!result) { deselect(); return; }
    const kind = result.layer === circleLayer ? "circle" : result.layer === areaLayer ? "area" : "measure";
    if (selected === result.feature && selectedKind === kind) return;
    select(result.feature, kind);
    document.querySelector(".pod-ol-close")?.click();
  });
  vertexModify.on("modifyend", () => { if (selectedKind === "area") updateSpatialResults(); else refreshVertices(); });
  translate.on("translateend", () => { if (selectedKind === "area") updateSpatialResults(); else refreshVertices(); });
  for (const [source, kind] of [[measureSource, "measure"], [areaSource, "area"]]) {
    source.on("removefeature", ({ feature }) => { if (selected === feature) deselect(); });
    source.on("clear", () => { if (selectedKind === kind) deselect(); });
  }
  circleSource.on("removefeature", ({ feature }) => { if (circleGroup && circleByFeature.get(feature) === circleGroup) deselect(); });
  circleSource.on("clear", () => { stagedCircle = []; if (selectedKind === "circle") deselect(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selected) deselect();
  });
};
