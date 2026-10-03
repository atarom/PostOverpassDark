export const loadDependencies = async () => {
  const [maplibregl, editor, state, language, autocomplete, lint, highlight, sql] = await Promise.all([
    import("https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl.mjs"),
    import("https://esm.sh/codemirror@6.0.2"),
    import("https://esm.sh/@codemirror/state@6"),
    import("https://esm.sh/@codemirror/language@6.12.4"),
    import("https://esm.sh/@codemirror/autocomplete@6.20.3"),
    import("https://esm.sh/@codemirror/lint@6.8.5"),
    import("https://esm.sh/@lezer/highlight@1.2.3"),
    import("https://esm.sh/@codemirror/lang-sql@6.10.0")
  ]);
  if (typeof window.osmtogeojson !== "function") throw Error("No se pudo cargar osmtogeojson");
  return { maplibregl, ...editor, ...state, ...language, ...autocomplete, ...lint, ...highlight, ...sql };
};
