export const createEditor = ({ deps, queryNode, postpassTemplate, wrapMode, engine }) => {
  const { EditorView, Compartment, basicSetup, StreamLanguage, HighlightStyle, syntaxHighlighting, autocompletion, linter, tags: t, sql, PostgreSQL, keywordCompletionSource, schemaCompletionSource } = deps;
  const words = (s) => s.split(" ");
  const setOf = (s) => new Set(words(s));
  const opts = (a, type = "constant", detail) => [...a].map((label) => ({ label, type, detail }));
  const KW = setOf(
    "node way relation rel nw nr wr nwr area out foreach for if else convert make is_in map_to_area timeline local complete retro compare"
  );
  const FILTER = setOf(
    "around bbox poly id newer changed user uid user_touched uid_touched pivot area if way_cnt way_link"
  );
  const EVAL = setOf(
    "id type user uid version timestamp changeset lat lon length is_closed count_tags count_members count_by_role count_distinct_members count_distinct_by_role keys number is_number date is_date geom trace gcat pt lstr hull count set sum min max u per_member per_vertex pos mtype ref role angle lrs_in lrs_isect lrs_union lrs_min lrs_max lrs_is_sorted lrs_sort lrs_unique"
  );
  const BI = new Set([...FILTER, ...EVAL]),
    AT = setOf("json xml csv custom popup true false"),
    OUT = setOf("body skel tags meta ids noids count center geom bb qt asc"),
    LOCAL = setOf("ll llb"),
    COUNTS = setOf("nodes ways relations deriveds nwr nw wr nr"),
    MEMBER_TYPES = setOf("nodes ways relations"),
    RECURSE = setOf("n w r bn bw br"),
    SETTINGS = setOf("out timeout maxsize bbox date diff adiff"),
    OUT_FORMATS = setOf("xml json csv custom popup"),
    SET_METHODS = setOf("count set sum min max u val"),
    CONVERT_TYPES = setOf("node way relation item"),
    SPECIAL_PROPS = setOf(
      "id type geom version timestamp changeset user uid lat lon center"
    );
  const ROLES = words(
    "inner outer from to via device stop platform forward backward admin_centre label subarea marker marker_brackets goal"
  );
  const MAXSIZE_VALUES = words("16Mi 128Mi 512Mi 1024Mi 2048Mi"),
    TIMEOUT_VALUES = words("25 60 120 180 300"),
    RADIUS_VALUES = words("0 10 30 50 100 150 200 500 1000"),
    WAY_LINK_VALUES = words("1 2 3- 1,3-");
  const PP_BASE = ["osm_type", "osm_id", "tags", "geom"],
    PP_VIEW = [...PP_BASE, "length_m", "area_m2"],
    PP_SCHEMA = {
      postpass_point: PP_BASE,
      postpass_line: ["osm_type", "osm_id", "tags", "length_m", "geom"],
      postpass_polygon: ["osm_type", "osm_id", "tags", "area_m2", "geom"],
      postpass_pointline: PP_VIEW,
      postpass_pointpolygon: PP_VIEW,
      postpass_linepolygon: PP_VIEW,
      postpass_pointlinepolygon: PP_VIEW,
      planet_osm_ways: ["id", "nodes", "tags"],
      planet_osm_rels: ["id", "members", "tags"],
      land_polygons: ["geom"]
    };
  const PP_FUNCS = words(
    "ST_Intersects ST_Contains ST_Within ST_DWithin ST_Distance ST_Length ST_Area ST_Centroid ST_PointOnSurface ST_Buffer ST_MakeEnvelope ST_MakePoint ST_MakeBox2D ST_SetSRID ST_Collect ST_MakeLine ST_Union ST_Difference ST_Intersection ST_IsEmpty ST_Transform ST_MaximumInscribedCircle jsonb_path_query_first jsonb_build_object jsonb_each_text jsonb_object_keys jsonb_array_elements pg_input_is_valid"
  );
  const stops = (...c) => [
    0,
    "rgba(16,24,39,0)",
    0.15,
    c[0],
    0.35,
    c[1],
    0.55,
    c[2],
    0.72,
    c[3],
    0.88,
    c[4],
    1,
    c[5]
  ];
  const PALETTES = {
    default: stops(
      "#355f8d",
      "#3f8f9c",
      "#79b88d",
      "#d6b56d",
      "#e58b68",
      "#ef5d72"
    ),
    warm: stops(
      "#72543b",
      "#a26c43",
      "#d1924f",
      "#e6b95f",
      "#ef8262",
      "#ef4e5d"
    ),
    cool: stops(
      "#324a7a",
      "#326b98",
      "#3f98a7",
      "#63b7a8",
      "#88d0b4",
      "#d3f0c0"
    ),
    fire: stops(
      "#3a173d",
      "#7d2450",
      "#bd3a45",
      "#e96d3e",
      "#f5b747",
      "#fff2a1"
    )
  };
  const cleanDefault = (node) =>
      (node.querySelector("textarea")?.value ?? node.textContent)
        .trim()
        .replace(/^[ \t]+/gm, ""),
    DEF = cleanDefault(queryNode),
    PPDEF = postpassTemplate.content.textContent.trim().replace(/^[ \t]+/gm, "");
  const lang = StreamLanguage.define({
    tokenTable: { atom: t.bool, opt: t.constant(t.variableName) },
    startState: () => ({ c: false, x: "" }),
    token(s, z) {
      if (z.c) {
        while (!s.eol()) {
          if (s.match("*/")) {
            z.c = false;
            break;
          }
          s.next();
        }
        return "comment";
      }
      if (s.eatSpace()) return null;
      if (s.match("//")) {
        s.skipToEnd();
        return "comment";
      }
      if (s.match("/*")) {
        z.c = true;
        return "comment";
      }
      if (s.match(/\{\{[^}]*\}\}/)) return "meta";
      if (s.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/)) return "string";
      if (s.match(/-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+|Mi)?/i))
        return "number";
      if (s.match(/->|::|!~|!=|==|<=|>=|&&|\|\||[=~<>+\-*\/!?]/))
        return "operator";
      if (s.peek() === "." && /[A-Za-z_]/.test(s.string[s.pos + 1])) {
        s.next();
        s.match(/[A-Za-z_][\w-]*/);
        return "variable-2";
      }
      if (s.match(/[A-Za-z_][\w-]*/)) {
        const w = s.current().toLowerCase();
        if (
          (z.x === "out" && OUT.has(w)) ||
          (z.x === "local" && LOCAL.has(w)) ||
          (z.x === "count" && COUNTS.has(w))
        )
          return "opt";
        if (KW.has(w)) {
          z.x = /^(out|local)$/.test(w) ? w : "";
          return "keyword";
        }
        if (SETTINGS.has(w)) {
          z.x = "";
          return "keyword";
        }
        if (BI.has(w)) {
          z.x = w === "count" ? "count" : "";
          return "builtin";
        }
        z.x = "";
        return AT.has(w) ? "atom" : "variable";
      }
      if (s.match(/[()[\]{},;.:]/)) {
        const c = s.current();
        if (";{}".includes(c) || (c === ")" && z.x === "count")) z.x = "";
        return "bracket";
      }
      s.next();
      z.x = "";
      return null;
    }
  });
  const colors = HighlightStyle.define(
    [
      [t.keyword, "#90b8ec"],
      [t.bool, "#c6a0f6"],
      [t.number, "#8fc9e8"],
      [t.variableName, "#ef8491"],
      [t.special(t.variableName), "#91c9bc"],
      [t.constant(t.variableName), "#d6b56d"],
      [t.standard(t.variableName), "#82c6dc"],
      [t.operator, "#b4c3d8"],
      [t.bracket, "#b4c3d8"],
      [t.comment, "#8295b4"],
      [t.string, "#9fcda8"],
      [t.meta, "#d9bf77"]
    ].map(([tag, color]) => ({ tag, color }))
  );
  const queryFilter = [
    ...words(
      "around: around. area area. pivot pivot. id: newer: changed: user: uid: user_touched: uid_touched: if: way_cnt: way_link:"
    ),
    ...RECURSE
  ].map((label) => ({
    label,
    apply: label,
    type: "function",
    detail: "Filtro de consulta"
  }));
  const COMP = {
    base: [
      ...opts(KW, "keyword", "Overpass QL"),
      ...opts(EVAL, "function", "Evaluador"),
      ...opts(AT, undefined, "Literal"),
      { label: "t", type: "variable", detail: "Tags" }
    ],
    out: opts(OUT, undefined, "Opción de out"),
    local: opts(LOCAL, undefined, "Opción de local"),
    count: opts(COUNTS, undefined, "Tipo de elemento"),
    memberTypes: opts(MEMBER_TYPES, undefined, "Tipo de miembro"),
    recurse: opts(RECURSE, undefined, "Recursión"),
    settings: opts(SETTINGS, "keyword", "Ajuste global"),
    format: opts(OUT_FORMATS, undefined, "Formato de salida"),
    maxsize: opts(MAXSIZE_VALUES, undefined, "Memoria máxima"),
    timeout: opts(TIMEOUT_VALUES, undefined, "Segundos"),
    methods: opts(SET_METHODS, "function", "Conjunto"),
    convert: opts(CONVERT_TYPES, undefined, "Tipo derivado"),
    special: opts(SPECIAL_PROPS, undefined, "Propiedad especial"),
    roles: ROLES.map((label) => ({
      label: `"${label}"`,
      type: "constant",
      detail: "Rol"
    })),
    radius: opts(RADIUS_VALUES, undefined, "Metros"),
    wayLink: opts(WAY_LINK_VALUES, undefined, "Número de vías"),
    queryFilter,
    csvSpecial: ["::type", "::id", "::lat", "::lon", "::count"].map(
      (label) => ({ label, type: "constant", detail: "Campo CSV" })
    )
  };
  const relDates = ["1day", "1month", "1year"],
    isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    dateOpts = () => [
      { label: `"${isoNow()}"`, type: "constant", detail: "Fecha actual UTC" },
      ...relDates.map((x) => ({
        label: `"{{date:${x}}}"`,
        type: "constant",
        detail: "Fecha relativa"
      }))
    ];
  const macroApply = (value) => (view, completion, from, to) => {
    const close = view.state.sliceDoc(to, to + 2) === "}}" ? "" : "}}";
    view.dispatch({
      changes: { from, to, insert: value + close },
      selection: { anchor: from + value.length + close.length }
    });
  };
  const macroOpts = () => [
    ...[
      ["bbox", "BBox"],
      ["center", "Centro"],
      ["zoom", "Zoom"]
    ].map(([label, name]) => ({
      label,
      apply: macroApply(label),
      type: "constant",
      detail: `${name} actual`
    })),
    {
      label: "geocodeArea",
      apply: "geocodeArea:",
      type: "function",
      detail: "Área por nombre"
    },
    ...relDates.map((x) => ({
      label: `date:${x}`,
      apply: macroApply(`date:${x}`),
      type: "function",
      detail: "Fecha relativa"
    })),
    { label: "style", apply: "style:\n\n}}", type: "keyword", detail: "MapCSS" }
  ];
  const postpassComplete = (ctx) => {
    const line = ctx.state.doc.lineAt(ctx.pos),
      text = ctx.state.sliceDoc(line.from, ctx.pos),
      m = text.match(/\{\{([^{}]*)$/);
    if (m)
      return {
        from: ctx.pos - m[1].length,
        options: [
          {
            label: "bbox",
            apply: macroApply("bbox"),
            type: "constant",
            detail: "BBox PostGIS"
          }
        ],
        validFor: /^[^{}]*$/
      };
    const word = ctx.matchBefore(/[A-Za-z_][\w$]*/);
    return !ctx.explicit && !word?.text
      ? null
      : {
          from: word?.from ?? ctx.pos,
          options: opts(PP_FUNCS, "function", "PostGIS / PostgreSQL"),
          validFor: /^[\w$]*$/
        };
  };
  const overpassComplete = (ctx) => {
    const line = ctx.state.doc.lineAt(ctx.pos),
      text = ctx.state.sliceDoc(line.from, ctx.pos),
      doc = ctx.state.doc.toString(),
      word = ctx.matchBefore(/[A-Za-z_][\w-]*/),
      ident = /^[A-Za-z_][\w-]*$/;
    const setOptions = () =>
      opts(
        new Set([
          "_",
          ...[...doc.matchAll(/->\s*\.([A-Za-z_][\w-]*)/g)].map(([, x]) => x)
        ]),
        "variable",
        "Conjunto"
      );
    const res = (from, options, validFor = ident) => ({
        from,
        options,
        validFor
      }),
      tail = (rx, options, validFor = ident) => {
        const m = text.match(rx);
        return m && res(ctx.pos - m[1].length, options, validFor);
      };
    const selector = String.raw`\b(?:node|way|relation|rel|nw|nr|wr|nwr)(?:\.[A-Za-z_][\w-]*)*(?:\[[^\]]*\]|\([^)]*\))*`;
    const rules = [
      [/\{\{([^{}]*)$/, macroOpts(), /^[^{}]*$/],
      [/\[\s*out\s*:\s*([A-Za-z_]*)$/i, COMP.format],
      [/\[\s*maxsize\s*:\s*([0-9A-Za-z]*)$/i, COMP.maxsize, /^[0-9A-Za-z]*$/],
      [/\[\s*timeout\s*:\s*(\d*)$/i, COMP.timeout, /^\d*$/],
      [/\[\s*(?:date|diff|adiff)\s*:\s*([^\]]*)$/i, dateOpts(), /^[^\]]*$/],
      [
        /\[\s*bbox\s*:\s*([^\]]*)$/i,
        [{ label: "{{bbox}}", type: "constant", detail: "BBox actual" }],
        /^[^\]]*$/
      ],
      [/\[\s*([A-Za-z_]*)$/i, COMP.settings],
      [/\bout\s+([A-Za-z_]*)$/i, COMP.out],
      [/\blocal\s+([A-Za-z_]*)$/i, COMP.local],
      [/\bconvert\s+([A-Za-z_]*)$/i, COMP.convert],
      [/::([A-Za-z_]*)$/, COMP.special],
      [/\bcount\s*\(\s*([A-Za-z_]*)$/i, COMP.count],
      [/\bcount_members\s*\(\s*([A-Za-z_]*)$/i, COMP.memberTypes],
      [
        /\b(?:count_by_role|count_distinct_by_role)\s*\(\s*([^)]*)$/i,
        COMP.roles,
        /^[^)]*$/
      ],
      [
        /\btimeline\s*\(\s*([A-Za-z_]*)$/i,
        opts(["node", "way", "rel"], "constant", "Tipo OSM")
      ],
      [
        /\b(?:retro|newer|changed)\s*(?:\(|:)\s*([^)]*)$/i,
        dateOpts(),
        /^[^)]*$/
      ],
      [/\bway_link\s*:\s*([^)]*)$/i, COMP.wayLink, /^[0-9,\-]*$/],
      [/\baround(?:\.[A-Za-z_][\w-]*)?\s*:\s*([^,)]*)$/i, COMP.radius, /^\d*$/],
      [
        new RegExp(
          selector +
            String.raw`\(\s*(?:around|area|pivot|n|w|r|bn|bw|br)\.([A-Za-z_]*)$`,
          "i"
        ),
        setOptions()
      ],
      [
        new RegExp(
          selector +
            String.raw`\(\s*(?:n|w|r|bn|bw|br)\.[A-Za-z_][\w-]*\s*:\s*([^)]*)$`,
          "i"
        ),
        COMP.roles,
        /^[^)]*$/
      ],
      [
        new RegExp(selector + String.raw`\(\s*([A-Za-z_.:-]*)$`, "i"),
        COMP.queryFilter,
        /^[A-Za-z_.:-]*$/
      ],
      [
        /\b(?:node|way|relation|rel|nw|nr|wr|nwr|area|foreach|for|complete|around|pivot)\.([A-Za-z_]*)$/i,
        setOptions()
      ],
      [/\b(?:foreach|for)\s+\.([A-Za-z_]*)$/i, setOptions()],
      [/(?:^|[\s;(])\.([A-Za-z_]*)$/, setOptions()]
    ];
    for (const [rx, o, v] of rules) {
      const x = tail(rx, o, v);
      if (x) return x;
    }
    if (
      /\b(?:node|way|relation|rel|nw|nr|wr|nwr|area)(?:\.[A-Za-z_][\w-]*)+\.[A-Za-z_]*$/i.test(
        text
      )
    )
      return null;
    let x = tail(/\b[A-Za-z_][\w-]*\.([A-Za-z_]*)$/i, COMP.methods);
    if (x) return x;
    x = tail(
      /\bout\s*:\s*csv\s*\([^;)]*?(::[A-Za-z_]*)$/i,
      COMP.csvSpecial,
      /^::[A-Za-z_]*$/
    );
    return (
      x ||
      (!ctx.explicit && (!word?.text || /^(out|local)$/i.test(word.text))
        ? null
        : res(word?.from ?? ctx.pos, COMP.base))
    );
  };
  const overpassLint = (view) => {
    const out = [];
    for (const m of view.state.doc
      .toString()
      .matchAll(/\[\s*maxsize\s*:\s*([^\]]*)\]/gi)) {
      const raw = m[1].trim(),
        from =
          (m.index ?? 0) + m[0].indexOf(m[1]) + Math.max(0, m[1].indexOf(raw)),
        to = from + raw.length,
        mi = raw.match(/^(\d+)Mi$/),
        bytes = raw.match(/^(\d+)$/);
      const message =
        mi && (+mi[1] < 1 || +mi[1] > 2048)
          ? "maxsize con Mi debe estar entre 1Mi y 2048Mi"
          : bytes && (+bytes[1] < 1 || +bytes[1] > 2147483648)
            ? "maxsize en bytes debe estar entre 1 y 2147483648"
            : !mi && !bytes
              ? "Usa un entero en bytes o un valor entre 1Mi y 2048Mi. Solo se admite el sufijo Mi"
              : "";
      if (message) out.push({ from, to, severity: "error", message });
    }
    return out;
  };
  const ppKeyword = keywordCompletionSource(PostgreSQL, true),
    ppSchema = schemaCompletionSource({
      dialect: PostgreSQL,
      schema: PP_SCHEMA
    }),
    sqlMode = sql({ dialect: PostgreSQL });
  const completion = (x) =>
      autocompletion({
        override:
          x === "postpass"
            ? [postpassComplete, ppKeyword, ppSchema]
            : [overpassComplete],
        activateOnTyping: true,
        maxRenderedOptions: 40
      }),
    language = (x) => (x === "postpass" ? sqlMode : lang),
    lint = (x) =>
      x === "postpass" ? [] : linter(overpassLint, { delay: 250 });
  const wrapComp = new Compartment();
  const langComp = new Compartment();
  const completeComp = new Compartment();
  const lintComp = new Compartment();
  const defaults = { overpass: DEF, postpass: PPDEF };
  const queries = { ...defaults };
  let currentEngine = engine;
  const ed = new EditorView({
    parent: queryNode,
    doc: queries[currentEngine],
    extensions: [
      basicSetup,
      langComp.of(language(currentEngine)),
      syntaxHighlighting(colors),
      completeComp.of(completion(currentEngine)),
      lintComp.of(lint(currentEngine)),
      wrapComp.of(wrapMode === "wrap" ? EditorView.lineWrapping : []),
      EditorView.contentAttributes.of({ "aria-label": "Consulta" })
    ]
  });
  queryNode.replaceChildren(ed.dom);
  const getQuery = () => ed.state.doc.toString();
  const setQuery = (text) => ed.dispatch({ changes: { from: 0, to: ed.state.doc.length, insert: text } });
  const setMode = (next) => {
    if (next === currentEngine) return;
    queries[currentEngine] = getQuery();
    currentEngine = next;
    ed.dispatch({ effects: [langComp.reconfigure(language(next)), completeComp.reconfigure(completion(next)), lintComp.reconfigure(lint(next))] });
    setQuery(queries[next]);
  };
  const setWrap = (value) => ed.dispatch({ effects: wrapComp.reconfigure(value === "wrap" ? EditorView.lineWrapping : []) });
  const reset = () => {
    queries[currentEngine] = defaults[currentEngine];
    setQuery(queries[currentEngine]);
  };
  return { getQuery, setQuery, setMode, setWrap, reset, getEngine: () => currentEngine };
};
