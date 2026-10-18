const loadOl = async () => {
  if (window.ol?.layer?.WebGLVector) return window.ol;
  for (const url of ["https://cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js", "https://unpkg.com/ol@10.10.0/dist/ol.js"]) {
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
  const [ol, editor, state, language, autocomplete, lint, highlight, sql] = await Promise.all([
    loadOl(),
    import("codemirror"),
    import("@codemirror/state"),
    import("@codemirror/language"),
    import("@codemirror/autocomplete"),
    import("@codemirror/lint"),
    import("@lezer/highlight"),
    import("@codemirror/lang-sql")
  ]);
  if (typeof window.osmtogeojson !== "function") throw Error("No se pudo cargar osmtogeojson");
  return { ol, ...editor, ...state, ...language, ...autocomplete, ...lint, ...highlight, ...sql };
};
