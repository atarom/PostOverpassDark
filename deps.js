const loadOl = async () => {
  if (window.ol?.layer?.WebGLVector) return window.ol;
  for (const url of ["https://cdn.jsdelivr.net/npm/ol@10.11.0/dist/ol.js", "https://unpkg.com/ol@10.11.0/dist/ol.js"]) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      if (window.ol?.layer?.WebGLVector) return window.ol;
    } catch {}
  }
  throw Error("No se pudo cargar OpenLayers desde los servidores CDN");
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
  if (typeof window.osmtogeojson !== "function") throw Error("No se pudo cargar osmtogeojson");
  return { ol, ...view, ...state, ...language, ...autocomplete, ...lint, ...highlight, ...sql, ...commands, ...search };
};
