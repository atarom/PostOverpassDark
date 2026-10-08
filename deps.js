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
    import("https://esm.sh/codemirror@6.0.2"),
    import("https://esm.sh/@codemirror/state@6"),
    import("https://esm.sh/@codemirror/language@6.12.4"),
    import("https://esm.sh/@codemirror/autocomplete@6.20.3"),
    import("https://esm.sh/@codemirror/lint@6.8.5"),
    import("https://esm.sh/@lezer/highlight@1.2.3"),
    import("https://esm.sh/@codemirror/lang-sql@6.10.0")
  ]);
  if (typeof window.osmtogeojson !== "function") throw Error("No se pudo cargar osmtogeojson");
  return { ol, ...editor, ...state, ...language, ...autocomplete, ...lint, ...highlight, ...sql };
};
