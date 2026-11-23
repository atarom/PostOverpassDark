const INDEX_URL = "https://osmlab.github.io/editor-layer-index/imagery.geojson";
const FAVORITES_KEY = "postoverpassdark:eli:favorites";
const ADJUSTMENTS_KEY = "postoverpassdark:eli:adjustments";
const DEFAULT_ADJUSTMENTS = { opacity: 100, brightness: 100, contrast: 100, saturation: 100, blend: "normal" };
const BLEND_MODES = new Set(["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference"]);
const loadAdjustments = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(ADJUSTMENTS_KEY) || "{}");
    return new Map(saved && typeof saved === "object" && !Array.isArray(saved) ? Object.entries(saved).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value)) : []);
  } catch { return new Map(); }
};
const safeNumber = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
const loadFavorites = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : []);
  } catch { return new Set(); }
};
const TOKEN = /\{([^{}]+)\}/g;
const SECURE_URL = (value) => {
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "https:" ? url : null;
  } catch { return null; }
};
const switchHost = (url) => url.replace(/\{switch:([^{}]+)\}/g, (_, hosts) => hosts.split(",")[0]?.trim() || "");
export const normalizeImagery = (feature, index = 0) => {
  const p = feature?.properties;
  if (!p || !["tms", "wms"].includes(p.type) || typeof p.name !== "string" || typeof p.url !== "string") return null;
  if (Array.isArray(p.available_projections) && p.available_projections.length && !p.available_projections.some((value) => /^(EPSG:)?(3857|900913)$/i.test(value))) return null;
  const url = switchHost(p.url.trim()).replace(/^http:\/\//i, "https://");
  const parsed = SECURE_URL(url);
  if (!parsed || !p.name.trim()) return null;
  let template = null;
  let config = null;
  if (p.type === "tms") {
    const tokens = [...url.matchAll(TOKEN)].map((match) => match[1]);
    if (!tokens.includes("zoom") && !tokens.includes("z")) return null;
    if (!tokens.includes("x") || !tokens.some((value) => ["y", "-y"].includes(value))) return null;
    if (tokens.some((value) => !["zoom", "z", "x", "y", "-y"].includes(value))) return null;
    template = url.replace(/\{zoom\}/g, "{z}");
  } else {
    const values = {};
    for (const [key, value] of parsed.searchParams) {
      const name = key.toUpperCase();
      if (["BBOX", "WIDTH", "HEIGHT", "SRS", "CRS", "SERVICE", "REQUEST"].includes(name)) continue;
      if (TOKEN.test(value)) return null;
      TOKEN.lastIndex = 0;
      values[name] = value;
    }
    if (!values.LAYERS || TOKEN.test(parsed.pathname)) return null;
    TOKEN.lastIndex = 0;
    config = { url: `${parsed.origin}${parsed.pathname}`, params: values };
  }
  return { id: String(p.id || `${p.type}-${index}`), name: p.name.trim(), type: p.type, template, config, geometry: feature.geometry || null, attribution: p.attribution || null, license: SECURE_URL(p.license_url || "")?.href || "", best: Boolean(p.best), minZoom: Number.isFinite(Number(p.min_zoom)) && p.min_zoom !== undefined ? Number(p.min_zoom) : undefined, maxZoom: Number.isFinite(Number(p.max_zoom)) && p.max_zoom !== undefined ? Number(p.max_zoom) : undefined };
};
export const createImagerySource = (ol, entry) => {
  const at = entry.attribution;
  const credit = typeof at === "string" ? at : typeof at?.text === "string" ? at.text : entry.name;
  const safeCredit = credit.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const link = SECURE_URL(typeof at === "object" ? at?.url || "" : "");
  const attribution = link ? `<a href="${link.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${safeCredit}</a>` : safeCredit;
  const common = { attributions: attribution, wrapX: false };
  if (entry.type === "tms") return new ol.source.XYZ({ ...common, url: entry.template, minZoom: entry.minZoom, maxZoom: entry.maxZoom });
  return new ol.source.TileWMS({ ...common, url: entry.config.url, params: { ...entry.config.params }, projection: "EPSG:3857", hidpi: false });
};
export const createEliBasemaps = ({ ol, map }) => {
  const zoom = map.getTargetElement().querySelector(".ol-zoom");
  if (!zoom || zoom.querySelector(".pod-eli-toggle")) return;
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("./eli-basemaps.css", import.meta.url).href;
  document.head.append(css);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pod-eli-toggle";
  button.title = "Cartografía de referencia (ELI)";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-controls", "pod-eli-panel");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M3 8 12 3l9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>';
  const panel = document.createElement("div");
  panel.className = "pod-eli-panel";
  panel.id = "pod-eli-panel";
  panel.hidden = true;
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Cartografía de referencia");
  panel.innerHTML = '<div class="pod-eli-head"><strong>Cartografía</strong><button class="pod-eli-close" type="button" aria-label="Cerrar cartografía">×</button></div><label for="pod-eli-search">Buscar capas de la zona visible</label><input id="pod-eli-search" type="search" placeholder="Nombre de la capa" autocomplete="off"><div id="pod-eli-list" class="pod-eli-list" role="group" aria-label="Capas cartográficas disponibles"><div class="pod-eli-row"><button class="pod-eli-layer" type="button" data-eli-id="">OpenStreetMap (original)</button></div></div><div class="pod-eli-status" role="status" aria-live="polite">Abre el selector para consultar ELI.</div><div class="pod-eli-image-controls" role="group" aria-label="Ajustes de imagen"><div class="pod-eli-image-head"><strong>Ajustes de imagen</strong><button class="pod-eli-reset" type="button" disabled>Restablecer</button></div><label class="pod-eli-setting" for="pod-eli-opacity">Opacidad <output id="pod-eli-opacity-value">100 %</output></label><input id="pod-eli-opacity" type="range" min="0" max="100" value="100" step="5" disabled><label class="pod-eli-setting" for="pod-eli-brightness">Brillo <output id="pod-eli-brightness-value">100 %</output></label><input id="pod-eli-brightness" type="range" min="0" max="200" value="100" step="5" disabled><label class="pod-eli-setting" for="pod-eli-contrast">Contraste <output id="pod-eli-contrast-value">100 %</output></label><input id="pod-eli-contrast" type="range" min="0" max="200" value="100" step="5" disabled><label class="pod-eli-setting" for="pod-eli-saturation">Saturación <output id="pod-eli-saturation-value">100 %</output></label><input id="pod-eli-saturation" type="range" min="0" max="200" value="100" step="5" disabled><label class="pod-eli-setting" for="pod-eli-blend">Fusión</label><select id="pod-eli-blend" disabled><option value="normal">Normal</option><option value="multiply">Multiply · Oscurecer</option><option value="screen">Screen · Aclarar</option><option value="overlay">Overlay · Contraste</option><option value="darken">Darken · Mínimo</option><option value="lighten">Lighten · Máximo</option><option value="difference">Difference · Diferencias</option></select></div><div class="pod-eli-credit"></div><div class="pod-eli-help">Fuentes ELI compatibles con OpenLayers. La disponibilidad depende del proveedor.</div>';
  const toolsButton = zoom.querySelector(".pod-map-tools-toggle");
  if (toolsButton) zoom.insertBefore(button, toolsButton);
  else zoom.append(button);
  zoom.append(panel);
  const search = panel.querySelector("#pod-eli-search");
  const list = panel.querySelector("#pod-eli-list");
  const status = panel.querySelector(".pod-eli-status");
  const opacity = panel.querySelector("#pod-eli-opacity");
  const opacityValue = panel.querySelector("#pod-eli-opacity-value");
  const brightness = panel.querySelector("#pod-eli-brightness");
  const contrast = panel.querySelector("#pod-eli-contrast");
  const saturation = panel.querySelector("#pod-eli-saturation");
  const blend = panel.querySelector("#pod-eli-blend");
  const reset = panel.querySelector(".pod-eli-reset");
  const controls = { opacity, brightness, contrast, saturation, blend };
  const outputs = { opacity: opacityValue, brightness: panel.querySelector("#pod-eli-brightness-value"), contrast: panel.querySelector("#pod-eli-contrast-value"), saturation: panel.querySelector("#pod-eli-saturation-value") };
  const mapTarget = map.getTargetElement();
  const credit = panel.querySelector(".pod-eli-credit");
  const close = panel.querySelector(".pod-eli-close");
  const geojson = new ol.format.GeoJSON();
  let catalogue = null;
  let pending = null;
  let active = null;
  let layer = null;
  let errorText = "";
  let storageError = false;
  const favorites = loadFavorites();
  const adjustments = loadAdjustments();
  const savedAdjustments = (id) => {
    const stored = adjustments.get(id) || DEFAULT_ADJUSTMENTS;
    return { opacity: safeNumber(stored.opacity, 100, 0, 100), brightness: safeNumber(stored.brightness, 100, 0, 200), contrast: safeNumber(stored.contrast, 100, 0, 200), saturation: safeNumber(stored.saturation, 100, 0, 200), blend: BLEND_MODES.has(stored.blend) ? stored.blend : "normal" };
  };
  const paintAdjustments = () => {
    for (const [name, output] of Object.entries(outputs)) output.textContent = `${controls[name].value} %`;
    mapTarget.style.setProperty("--pod-eli-image-filter", `brightness(${brightness.value}%) contrast(${contrast.value}%) saturate(${saturation.value}%)`);
    mapTarget.style.setProperty("--pod-eli-image-blend", blend.value);
    layer?.setOpacity(Number(opacity.value) / 100);
  };
  const restoreAdjustments = (values) => {
    for (const [name, input] of Object.entries(controls)) input.value = values[name];
    paintAdjustments();
  };
  const persistAdjustments = () => {
    if (!active || !layer) return;
    const values = Object.fromEntries(Object.entries(controls).map(([name, input]) => [name, name === "blend" ? input.value : Number(input.value)]));
    if (Object.keys(DEFAULT_ADJUSTMENTS).every((name) => values[name] === DEFAULT_ADJUSTMENTS[name])) adjustments.delete(active.id);
    else adjustments.set(active.id, values);
    try { localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(Object.fromEntries(adjustments))); storageError = false; }
    catch { storageError = true; status.textContent = "No se pudieron guardar las preferencias en este navegador."; }
  };
  const sortEntries = (a, b) => Number(b.best) - Number(a.best) || a.name.localeCompare(b.name, "es");
  const isInView = (entry, extent) => {
    if (!entry.geometry) return true;
    const bounds = entry.geometry.getExtent();
    return bounds[0] <= extent[2] && bounds[2] >= extent[0] && bounds[1] <= extent[3] && bounds[3] >= extent[1] && entry.geometry.intersectsExtent(extent);
  };
  const visibleEntries = (extent) => {
    if (!catalogue) return [];
    const q = search.value.trim().toLocaleLowerCase();
    return catalogue.filter((entry) => (!q || entry.name.toLocaleLowerCase().includes(q)) && isInView(entry, extent)).sort(sortEntries);
  };
  const rowFor = (entry, outside = false) => {
    const row = document.createElement("div");
    row.className = "pod-eli-row";
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "pod-eli-layer";
    choose.dataset.eliId = entry.id;
    choose.textContent = `${entry.name} · ${entry.type.toUpperCase()}${outside ? " · fuera de la zona" : ""}`;
    choose.setAttribute("aria-pressed", String(active?.id === entry.id));
    const star = document.createElement("button");
    star.type = "button";
    star.className = "pod-eli-star";
    star.dataset.eliFavorite = entry.id;
    const saved = favorites.has(entry.id);
    star.textContent = saved ? "★" : "☆";
    star.setAttribute("aria-pressed", String(saved));
    star.setAttribute("aria-label", `${saved ? "Quitar de favoritos" : "Añadir a favoritos"}: ${entry.name}`);
    star.title = star.getAttribute("aria-label");
    row.append(choose, star);
    return row;
  };
  const section = (label) => {
    const heading = document.createElement("div");
    heading.className = "pod-eli-section";
    heading.textContent = label;
    return heading;
  };
  const refresh = () => {
    if (!catalogue) return;
    const extent = map.getView().calculateExtent(map.getSize());
    const entries = visibleEntries(extent);
    const starred = catalogue.filter((entry) => favorites.has(entry.id)).sort(sortEntries);
    const seen = new Set(starred.map((entry) => entry.id));
    const scroll = list.scrollTop;
    const fragment = document.createDocumentFragment();
    const original = document.createElement("div");
    original.className = "pod-eli-row";
    const originalButton = document.createElement("button");
    originalButton.type = "button";
    originalButton.className = "pod-eli-layer";
    originalButton.dataset.eliId = "";
    originalButton.textContent = "OpenStreetMap (original)";
    originalButton.setAttribute("aria-pressed", String(!active));
    original.append(originalButton);
    fragment.append(original);
    if (starred.length) {
      fragment.append(section(`Favoritos (${starred.length})`));
      for (const entry of starred) fragment.append(rowFor(entry, !isInView(entry, extent)));
    }
    const remaining = entries.filter((entry) => !seen.has(entry.id));
    if (remaining.length) {
      fragment.append(section("Capas de la zona visible"));
      for (const entry of remaining) fragment.append(rowFor(entry));
    }
    if (active && !seen.has(active.id) && !entries.includes(active)) {
      fragment.append(section("Capa activa"), rowFor(active, !isInView(active, extent)));
    }
    list.replaceChildren(fragment);
    list.scrollTop = scroll;
    status.textContent = errorText || (storageError ? "No se pudieron guardar las preferencias en este navegador." : `${entries.length.toLocaleString("es-ES")} capas disponibles en la zona visible`);
  };
  const setCredit = (entry) => {
    credit.replaceChildren();
    if (!entry) return;
    const value = typeof entry.attribution === "string" ? entry.attribution : entry.attribution?.text || entry.name;
    credit.append(document.createTextNode(`Fuente: ${value}`));
    if (entry.license) {
      const link = document.createElement("a");
      link.href = entry.license;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = " Condiciones de uso";
      credit.append(link);
    }
  };
  const setLayer = (entry) => {
    if (entry && layer && active?.id === entry.id) return;
    if (!entry && !layer && !errorText) return;
    if (layer) map.removeLayer(layer);
    layer = null;
    active = entry;
    errorText = "";
    if (entry) {
      try {
        const source = createImagerySource(ol, entry);
        layer = new ol.layer.Tile({ source, opacity: savedAdjustments(entry.id).opacity / 100, className: "ol-layer pod-eli-image-layer" });
        map.getLayers().insertAt(1, layer);
        source.on("tileloaderror", (event) => {
          if (layer?.getSource() !== source || errorText) return;
          const url = event.tile?.getImage?.()?.src || "URL no disponible";
          console.warn("PostOverpassDark ELI: error al cargar tesela", entry.name, url);
          errorText = entry.type === "wms" ? "Falló una petición WMS. Consulta su URL en la consola." : "No se pudieron cargar algunas teselas de este proveedor.";
          if (!panel.hidden) refresh();
        });
        source.on("tileloadend", () => {
          if (layer?.getSource() !== source || !errorText) return;
          errorText = "";
          if (!panel.hidden) refresh();
        });
      } catch {
        active = null;
        errorText = "Esta fuente no se ha podido cargar.";
      }
    }
    for (const input of Object.values(controls)) input.disabled = !layer;
    reset.disabled = !layer;
    restoreAdjustments(layer ? savedAdjustments(active.id) : DEFAULT_ADJUSTMENTS);
    setCredit(active);
    refresh();
  };
  const load = async () => {
    if (catalogue || pending) return pending;
    status.textContent = "Cargando catálogo ELI…";
    pending = (async () => {
      const response = await fetch(INDEX_URL);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.features)) throw Error("Respuesta GeoJSON inválida");
      catalogue = data.features.map(normalizeImagery).filter(Boolean).flatMap((entry) => {
        if (!entry.geometry) return [entry];
        try { entry.geometry = geojson.readGeometry(entry.geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }); }
        catch { return []; }
        return [entry];
      });
      refresh();
    })().catch(() => { status.textContent = "No se pudo consultar ELI. Cierra y vuelve a abrir para reintentar."; }).finally(() => { pending = null; });
    return pending;
  };
  const setOpen = (open) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.classList.toggle("is-active", open || Boolean(active));
    if (open) {
      const other = zoom.querySelector(".pod-map-tools-toggle[aria-expanded='true']");
      other?.click();
      if (catalogue) refresh();
      else load();
      search.focus();
    }
  };
  button.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => { setOpen(false); button.focus(); });
  search.addEventListener("input", refresh);
  list.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || !list.contains(target)) return;
    if (target.classList.contains("pod-eli-star")) {
      const id = target.dataset.eliFavorite;
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); storageError = false; }
      catch { storageError = true; }
      refresh();
      const updated = [...list.querySelectorAll(".pod-eli-star")].find((button) => button.dataset.eliFavorite === id);
      (updated || list.querySelector(".pod-eli-layer"))?.focus({ preventScroll: true });
      updated?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (!target.classList.contains("pod-eli-layer")) return;
    const id = target.dataset.eliId;
    setLayer(catalogue?.find((entry) => entry.id === id) || null);
    [...list.querySelectorAll(".pod-eli-layer")].find((button) => button.dataset.eliId === id)?.focus({ preventScroll: true });
  });
  list.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const items = [...list.querySelectorAll(".pod-eli-layer")];
    const current = event.target.closest(".pod-eli-row")?.querySelector(".pod-eli-layer");
    const index = items.indexOf(current);
    if (index < 0) return;
    const next = items[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) { event.preventDefault(); next.focus(); }
  });
  for (const input of Object.values(controls)) {
    input.addEventListener("input", paintAdjustments);
    input.addEventListener("change", persistAdjustments);
  }
  reset.addEventListener("click", () => {
    if (!active || !layer) return;
    restoreAdjustments(DEFAULT_ADJUSTMENTS);
    persistAdjustments();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    button.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!panel.hidden && !panel.contains(event.target) && event.target !== button) setOpen(false);
  });
  zoom.querySelector(".pod-map-tools-toggle")?.addEventListener("click", () => { if (!panel.hidden) setOpen(false); });
  map.on("moveend", () => { if (!panel.hidden && catalogue) refresh(); });
};
