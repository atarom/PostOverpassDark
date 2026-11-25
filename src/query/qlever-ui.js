import { QLEVER_ENDPOINT } from "../core/servers.js";
import { POSTPASS_PRESETS } from "./presets-postpass.js";
export const QLEVER_PRESETS = [
  { title: "Elementos con automatic=* en España", description: "Elementos contenidos en la relación administrativa de España (1311341), con geometría y etiquetas OSM disponibles. Sin límite de resultados.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
SELECT DISTINCT ?osm ?geometry ?key ?value WHERE {
  osmrel:1311341 ogc:sfContains ?osm .
  ?osm osmkey:automatic ?automatic .
  ?osm geo:hasGeometry/geo:asWKT ?geometry .
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Fuentes de agua en el mapa", description: "Ejemplo de filtro espacial {{bbox}}. Hasta 5.000 elementos amenity=drinking_water, con sus etiquetas. Cambia la etiqueta para buscar otros objetos.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT DISTINCT ?osm ?geometry ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry WHERE {
    ?osm osmkey:amenity "drinking_water" .
    ?osm geo:hasGeometry/geo:asWKT ?geometry .
    FILTER(geof:sfIntersects(?geometry, {{bbox}}))
  } LIMIT 5000 }
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Picos con elevación", description: "Picos con ele=* en la vista actual, para sliders numéricos e IQR. Hasta 5.000 elementos con sus etiquetas.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT DISTINCT ?osm ?geometry ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry WHERE {
    ?osm osmkey:natural "peak" ;
         osmkey:ele ?ele .
    ?osm geo:hasGeometry/geo:asWKT ?geometry .
    FILTER(geof:sfIntersects(?geometry, {{bbox}}))
  } LIMIT 5000 }
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Picos sin elevación", description: "Picos sin la etiqueta ele=* en la vista actual. Hasta 5.000 elementos con sus etiquetas.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT DISTINCT ?osm ?geometry ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry WHERE {
    ?osm osmkey:natural "peak" .
    ?osm geo:hasGeometry/geo:asWKT ?geometry .
    MINUS { ?osm osmkey:ele [] . }
    FILTER(geof:sfIntersects(?geometry, {{bbox}}))
  } LIMIT 5000 }
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Fuentes a 10 m o menos", description: "Posibles duplicados de nodos amenity=drinking_water. Ambos nodos deben intersectar la vista actual. Hasta 2.000 pares dirigidos; acerca el mapa antes de ejecutar.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
PREFIX osm: <https://www.openstreetmap.org/>
SELECT DISTINCT ?osm ?geometry ?otro_osm ?distancia_m ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry ?otro_osm ?distancia_m WHERE {
    { SELECT DISTINCT ?osm ?geometry WHERE {
      ?osm a osm:node ;
           osmkey:amenity "drinking_water" ;
           geo:hasGeometry/geo:asWKT ?geometry .
      FILTER(geof:sfIntersects(?geometry, {{bbox}}))
    } }
    { SELECT DISTINCT ?otro_osm ?otra_geometria WHERE {
      ?otro_osm a osm:node ;
                osmkey:amenity "drinking_water" ;
                geo:hasGeometry/geo:asWKT ?otra_geometria .
      FILTER(geof:sfIntersects(?otra_geometria, {{bbox}}))
    } }
    FILTER(?osm != ?otro_osm)
    FILTER(geof:metricDistance(?geometry, ?otra_geometria) <= 10)
    BIND(geof:metricDistance(?geometry, ?otra_geometria) AS ?distancia_m)
  } LIMIT 2000 }
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Carreteras sin maxspeed", description: "Vías de carretera de varias categorías sin maxspeed=* que intersectan la vista. Hasta 5.000 vías; la ausencia de etiqueta no implica un error.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
PREFIX osm: <https://www.openstreetmap.org/>
SELECT DISTINCT ?osm ?geometry ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry WHERE {
    ?osm a osm:way ;
         osmkey:highway ?highway ;
         geo:hasGeometry/geo:asWKT ?geometry .
    VALUES ?highway { "motorway" "trunk" "primary" "secondary" "tertiary" "unclassified" "residential" }
    MINUS { ?osm osmkey:maxspeed [] . }
    FILTER(geof:sfIntersects(?geometry, {{bbox}}))
  } LIMIT 5000 }
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Carreteras que cruzan ríos sin puente ni túnel", description: "Candidatas a revisión: cruces geométricos con waterway=river sin bridge/tunnel positivos ni ford positivo en la carretera, y sin túnel o puente positivo en el río. Hasta 2.000 pares en la vista; no confirma un error.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
PREFIX osm: <https://www.openstreetmap.org/>
PREFIX ogc: <http://www.opengis.net/rdf#>
SELECT DISTINCT ?osm ?geometry ?rio_osm ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry ?rio_osm WHERE {
    ?osm a osm:way ;
         osmkey:highway ?highway ;
         geo:hasGeometry/geo:asWKT ?geometry .
    VALUES ?highway { "motorway" "trunk" "primary" "secondary" "tertiary" "unclassified" "residential" "service" "track" }
    ?rio_osm a osm:way ;
             osmkey:waterway "river" .
    ?osm ogc:sfCrosses ?rio_osm .
    MINUS { ?osm osmkey:bridge ?puente . FILTER(?puente != "no") }
    MINUS { ?osm osmkey:tunnel ?tunel . FILTER(?tunel != "no") }
    MINUS { ?osm osmkey:ford ?vado . FILTER(?vado != "no") }
    MINUS { ?rio_osm osmkey:bridge ?puente_rio . FILTER(?puente_rio != "no") }
    MINUS { ?rio_osm osmkey:tunnel ?tunel_rio . FILTER(?tunel_rio != "no") }
    FILTER(geof:sfIntersects(?geometry, {{bbox}}))
  } LIMIT 2000 }
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Edificios que se solapan", description: "Edificios con solapamiento parcial (sfOverlaps), no simples contactos ni contención total. Hasta 2.000 pares dirigidos; acerca el mapa a un barrio.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
PREFIX ogc: <http://www.opengis.net/rdf#>
SELECT DISTINCT ?osm ?geometry ?otro_osm ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry ?otro_osm WHERE {
    ?osm osmkey:building ?building .
    ?otro_osm osmkey:building ?otro_building .
    ?osm ogc:sfOverlaps ?otro_osm .
    ?osm geo:hasGeometry/geo:asWKT ?geometry .
    FILTER(?osm != ?otro_osm)
    FILTER(REGEX(STR(?geometry), "^(POLYGON|MULTIPOLYGON)", "i"))
    FILTER(geof:sfIntersects(?geometry, {{bbox}}))
  } LIMIT 2000 }
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Elementos con el mismo Wikidata", description: "Elementos de la vista con un identificador Wikidata compartido con otro objeto OSM, incluso fuera del mapa. Hasta 2.000 pares; un mismo QID puede ser legítimo.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
PREFIX osm2rdfkey: <https://osm2rdf.cs.uni-freiburg.de/rdf/key#>
SELECT DISTINCT ?osm ?geometry ?otro_osm ?wikidata_qid ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry ?otro_osm ?wikidata_qid WHERE {
    ?osm osm2rdfkey:wikidata ?qid .
    ?otro_osm osm2rdfkey:wikidata ?qid .
    FILTER(?osm != ?otro_osm)
    ?osm geo:hasGeometry/geo:asWKT ?geometry .
    FILTER(geof:sfIntersects(?geometry, {{bbox}}))
    BIND(STRAFTER(STR(?qid), "http://www.wikidata.org/entity/") AS ?wikidata_qid)
  } LIMIT 2000 }
  OPTIONAL {
    ?osm ?key ?value .
    FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
  }
}` },
  { title: "Frecuencia de etiquetas (tabla)", description: "Estadística de claves OSM en elementos que intersectan la vista actual, ordenadas por número de objetos. No dibuja geometrías.", query: `# POD:TABLE
PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT ?key (COUNT(DISTINCT ?osm) AS ?total) WHERE {
  ?osm geo:hasGeometry/geo:asWKT ?geometry .
  FILTER(geof:sfIntersects(?geometry, {{bbox}}))
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}
GROUP BY ?key
ORDER BY DESC(?total)
LIMIT 100` },
  { title: "Elementos por ID OSM", description: "Edita los IDs de VALUES para recuperar nodos, vías o relaciones concretos. Los prefijos identifican el tipo de elemento.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX osmnode: <https://www.openstreetmap.org/node/>
PREFIX osmway: <https://www.openstreetmap.org/way/>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
SELECT DISTINCT ?osm ?geometry ?key ?value WHERE {
  VALUES ?osm { osmrel:1311341 osmrel:347950 }
  ?osm geo:hasGeometry/geo:asWKT ?geometry .
  OPTIONAL {
    ?osm ?key ?value .
    FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
  }
}` },
  { title: "Aerogeneradores de todo el mundo", description: "Consulta mundial power=generator y generator:source=wind, sin límite de resultados. Prueba masiva de WebGL; puede generar una respuesta grande.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT DISTINCT ?osm ?geometry ?key ?value WHERE {
  ?osm osmkey:power "generator" ;
       osmkey:generator:source "wind" .
  ?osm geo:hasGeometry/geo:asWKT ?geometry .
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Edificios en el mapa (polígonos)", description: "Hasta 5.000 geometrías poligonales building=* en la vista, con sus etiquetas.", query: `PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT DISTINCT ?osm ?geometry ?key ?value WHERE {
  { SELECT DISTINCT ?osm ?geometry WHERE {
    ?osm osmkey:building ?building .
    ?osm geo:hasGeometry/geo:asWKT ?geometry .
    FILTER(REGEX(STR(?geometry), "^(POLYGON|MULTIPOLYGON)", "i"))
    FILTER(geof:sfIntersects(?geometry, {{bbox}}))
  } LIMIT 5000 }
  ?osm ?key ?value .
  FILTER(STRSTARTS(STR(?key), STR(osmkey:)))
}` },
  { title: "Conteo mundial de fuentes (tabla)", description: "Número de objetos amenity=drinking_water en todo el planeta. Consulta de agregación sin geometrías.", query: `# POD:TABLE
PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT (COUNT(DISTINCT ?osm) AS ?total) WHERE {
  ?osm osmkey:amenity "drinking_water" .
}` }
];
const createSparqlMode = (deps) => {
  const { StreamLanguage, HighlightStyle, syntaxHighlighting, tags: t, Prec } = deps;
  const lang = StreamLanguage.define({
    tokenTable: { variableName: t.variableName, propertyName: t.propertyName, url: t.url },
    startState: () => ({ quote: "" }),
    token(s, state) {
      if (state.quote) {
        while (!s.eol()) {
          if (s.match(state.quote)) { state.quote = ""; break; }
          if (s.next() === "\\") s.next();
        }
        return "string";
      }
      if (s.eatSpace()) return null;
      if (s.peek() === "#") { s.skipToEnd(); return "comment"; }
      if (s.match(/\{\{[^}]*\}\}/)) return "meta";
      if (s.match(/"""|'''/)) { state.quote = s.current(); return "string"; }
      if (s.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/)) return "string";
      if (s.match(/<[^<>\s"{}|^`\\]*>/)) return "url";
      if (s.match(/[?$][\w\p{L}]+/u)) return "variableName";
      if (s.match(/(?:[A-Za-z_][\w-]*)?:[\w.%~:-]*/)) return "propertyName";
      if (s.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)) return "number";
      if (s.match(/\b(?:PREFIX|BASE|SELECT|DISTINCT|REDUCED|WHERE|OPTIONAL|UNION|FILTER|BIND|VALUES|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|ASK|CONSTRUCT|DESCRIBE|FROM|NAMED|GRAPH|SERVICE|MINUS|NOT|EXISTS|AS|ASC|DESC|COUNT|SUM|MIN|MAX|AVG|SAMPLE|GROUP_CONCAT|STR|STRSTARTS|REGEX|BOUND|COALESCE|IF|DATATYPE|LANG|CONCAT)\b/i)) return "keyword";
      if (s.match(/\b(?:true|false|UNDEF|a)\b/)) return "atom";
      if (s.match(/[{}()[\];,.]/)) return "bracket";
      if (s.match(/\^\^|&&|\|\||[=<>!+*/|^?-]/)) return "operator";
      s.next();
      return null;
    }
  });
  const highlight = HighlightStyle.define([{ tag: t.keyword, color: "#b8e4ff", fontWeight: "700" }, { tag: t.variableName, color: "#e7a18b" }, { tag: t.propertyName, color: "#ff79c6" }, { tag: [t.url, t.string], color: "#b5dc9f" }, { tag: t.number, color: "#f4d391" }, { tag: t.meta, color: "#bd93f9" }, { tag: t.comment, color: "#859e8c" }]);
  return Prec.highest([lang, syntaxHighlighting(highlight)]);
};
export const installQLeverUI = (deps) => {
  const { EditorView, Compartment, StateEffect } = deps;
  const endpoint = document.getElementById("endpoint");
  const editorNode = document.querySelector("#query .cm-editor");
  const list = document.getElementById("presetList");
  const panel = document.getElementById("presetPanel");
  const toggle = document.getElementById("presetToggle");
  if (!endpoint || !editorNode || !list || !panel || !toggle) return;
  const view = EditorView.findFromDOM(editorNode);
  if (!view) return;
  const mode = new Compartment();
  const sparqlMode = createSparqlMode(deps);
  const getQuery = () => view.state.doc.toString();
  const setQuery = (query) => { if (getQuery() !== query) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: query } }); };
  const engine = () => endpoint.value === QLEVER_ENDPOINT ? "qlever" : endpoint.selectedOptions[0]?.dataset.engine === "postpass" ? "postpass" : "overpass";
  const drafts = { qlever: QLEVER_PRESETS[0].query, postpass: POSTPASS_PRESETS[0]?.query ?? "" };
  let previous = engine();
  let previousSqlButtons = [];
  let active = false;
  let sqlNeedsRestore = previous === "qlever";
  let pending = false;
  let scheduled = false;
  const isQLeverList = () => list.firstElementChild?.dataset.qlever === "true";
  const updateSelected = () => {
    if (!isQLeverList()) return;
    const query = getQuery().trim();
    for (const [index, button] of [...list.children].entries()) button.setAttribute("aria-pressed", String(QLEVER_PRESETS[index]?.query.trim() === query));
  };
  const renderPresets = () => {
    if (isQLeverList()) { updateSelected(); return; }
    previousSqlButtons = [...list.children];
    list.replaceChildren(...QLEVER_PRESETS.map((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-item";
      button.dataset.qlever = "true";
      const title = document.createElement("span");
      title.className = "preset-item-title";
      title.textContent = preset.title;
      const description = document.createElement("span");
      description.className = "preset-item-description";
      description.textContent = preset.description;
      button.append(title, description);
      button.addEventListener("click", () => {
        setQuery(preset.query);
        updateSelected();
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      });
      return button;
    }));
    updateSelected();
  };
  const sync = () => {
    const next = engine();
    if (next === "qlever") {
      if (!active) { active = true; sqlNeedsRestore = true; view.dispatch({ effects: mode.reconfigure(sparqlMode) }); }
      renderPresets();
    } else {
      if (active) { active = false; view.dispatch({ effects: mode.reconfigure([]) }); }
      if (isQLeverList() && next === "postpass") {
        list.replaceChildren(...previousSqlButtons);
        for (const button of list.children) button.setAttribute("aria-pressed", String(POSTPASS_PRESETS[Number(button.dataset.index)]?.query.trim() === getQuery().trim()));
      }
    }
    previous = next;
  };
  const schedule = () => {
    if (scheduled || pending) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!pending) sync(); });
  };
  view.dispatch({ effects: StateEffect.appendConfig.of([mode.of([]), EditorView.updateListener.of((update) => { if (update.docChanged) schedule(); })]) });
  endpoint.addEventListener("change", () => {
    const from = previous;
    const next = engine();
    if (from === next) return;
    if (from === "qlever" || from === "postpass") drafts[from] = getQuery();
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (engine() !== next) { sync(); return; }
      if (next === "qlever") setQuery(drafts.qlever);
      else if (next === "postpass" && sqlNeedsRestore) { setQuery(drafts.postpass); sqlNeedsRestore = false; }
      sync();
      if (next === "qlever" || next === "postpass" && from === "qlever") {
        const status = document.getElementById("status");
        if (status) status.textContent = `Modo ${next === "qlever" ? "QLever SPARQL" : "Postpass SQL"} listo para ejecutar.`;
      }
    });
  }, true);
  if (previous === "postpass") drafts.postpass = getQuery();
  if (previous === "qlever" && !location.hash && getQuery() === drafts.postpass) setQuery(drafts.qlever);
  sync();
};
