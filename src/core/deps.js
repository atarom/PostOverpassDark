import { createDrawingEditor } from "../map/drawing-editor.js";
import { createEliBasemaps } from "../map/eli-basemaps.js";
import { installQLeverUI } from "../query/qlever-ui.js";
const searchStylesheet = document.createElement("link");
searchStylesheet.rel = "stylesheet";
searchStylesheet.href = new URL("../query/codemirror-search.css", import.meta.url).href;
document.head.append(searchStylesheet);
const loadOl = async () => {
  if (window.ol?.layer?.WebGLVector) return window.ol;
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/ol@10.11.0/dist/ol.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  } catch {}
  if (window.ol?.layer?.WebGLVector) return window.ol;
  throw Error("No se pudo cargar OpenLayers desde jsDelivr");
};
const enableDrawingEditor = (ol) => {
  if (ol.Map.prototype.podDrawingEditor) return;
  const originalAddLayer = ol.Map.prototype.addLayer;
  const initialized = new WeakSet();
  ol.Map.prototype.addLayer = function (...args) {
    const result = originalAddLayer.apply(this, args);
    if (args[0] instanceof ol.layer.Vector && !initialized.has(this)) queueMicrotask(() => {
      if (initialized.has(this)) return;
      const relevant = this.getLayers().getArray().filter((layer) => layer instanceof ol.layer.Vector && layer.getSource() instanceof ol.source.Vector);
      if (relevant.length < 4) return;
      initialized.add(this);
      createDrawingEditor({ ol, map: this });
      createEliBasemaps({ ol, map: this });
    });
    return result;
  };
  ol.Map.prototype.podDrawingEditor = true;
};
export const loadDependencies = async () => {
  const [ol, view, state, language, autocomplete, lint, highlight, sql, commands, search] = await Promise.all([
    loadOl(),
    import("@codemirror/view"),
    import("@codemirror/state"),
    import("@codemirror/language"),
    import("@codemirror/autocomplete"),
    import("@codemirror/lint"),
    import("@lezer/highlight"),
    import("@codemirror/lang-sql"),
    import("@codemirror/commands"),
    import("@codemirror/search")
  ]);
  enableDrawingEditor(ol);
  const deps = { ol, ...view, ...state, ...language, ...autocomplete, ...lint, ...highlight, ...sql, ...commands, ...search };
  requestAnimationFrame(() => installQLeverUI(deps));
  return deps;
};
