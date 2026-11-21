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
  return { ol, ...view, ...state, ...language, ...autocomplete, ...lint, ...highlight, ...sql, ...commands, ...search };
};
