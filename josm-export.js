const PREFIX = { N: "n", W: "w", R: "r", node: "n", way: "w", relation: "r" };
const JOSM = "http://127.0.0.1:8111/";
const LIMIT = 500;
const URL_LIMIT = 1700;
export const osmIdentifiers = (geo) => {
  const found = new Map();
  let omitted = 0;
  for (const feature of geo?.features || []) {
    const properties = feature?.properties || {};
    const type = String(properties.osm_type ?? properties.type ?? "").trim();
    const prefix = PREFIX[type] || PREFIX[type.toUpperCase()];
    const rawId = properties.osm_id ?? properties.id;
    const id = typeof rawId === "string" && !/^\d+$/.test(rawId) ? NaN : Number(rawId);
    if (!prefix || !Number.isSafeInteger(id) || id <= 0) {
      omitted++;
      continue;
    }
    found.set(`${prefix}${id}`, `${prefix}${id}`);
  }
  return { ids: [...found.values()], omitted };
};
export const josmUrl = (ids, first = true) => {
  const url = new URL("load_object", JOSM);
  url.searchParams.set("objects", ids.join(","));
  url.searchParams.set("relation_members", "true");
  url.searchParams.set("new_layer", first ? "true" : "false");
  return url.toString();
};
export const josmBatches = (ids, maxLength = URL_LIMIT) => {
  const batches = [];
  let batch = [];
  for (const id of ids) {
    if (!batch.length && josmUrl([id], false).length > maxLength) throw Error("Identificador OSM demasiado largo");
    if (batch.length && josmUrl([...batch, id], false).length > maxLength) {
      batches.push(batch);
      batch = [];
    }
    batch.push(id);
  }
  if (batch.length) batches.push(batch);
  return batches;
};
export const createJosmExporter = ({ container, sendButton, message }) => {
  let ids = [];
  let active = null;
  let revision = 0;
  let working = false;
  const sync = () => { sendButton.disabled = working || !ids.length; };
  const notify = (value, error = false) => {
    message.textContent = value;
    message.classList.toggle("err", error);
  };
  const reset = () => {
    revision++;
    active?.abort();
    active = null;
    ids = [];
    working = false;
    notify("");
    sync();
  };
  const setEngine = (engine) => {
    container.hidden = engine !== "postpass";
    if (engine !== "postpass") reset();
  };
  const setData = (geo) => {
    reset();
    const result = osmIdentifiers(geo);
    const warning = result.omitted ? ` · ${result.omitted} sin ID OSM, excluidos` : "";
    if (result.ids.length > LIMIT) {
      notify(`Límite de envío: ${LIMIT} objetos OSM. Reduce la consulta.`, true);
      return;
    }
    ids = result.ids;
    notify(ids.length ? `${ids.length} objetos OSM listos para JOSM${warning}` : "La consulta no devuelve identificadores OSM válidos.");
    sync();
  };
  const checkResponse = async (response) => {
    if (response.ok) return response;
    throw Error(`JOSM devolvió HTTP ${response.status}`);
  };
  const send = async () => {
    if (working || !ids.length) return;
    working = true;
    sync();
    const current = revision;
    active = new AbortController();
    const signal = active.signal;
    try {
      notify("Comprobando el control remoto de JOSM…");
      const response = await checkResponse(await fetch(new URL("version", JOSM), { signal, cache: "no-store" }));
      const version = await response.json();
      if (version?.protocolversion?.major !== 1) throw Error("Versión incompatible del control remoto de JOSM");
      const batches = josmBatches(ids);
      for (let index = 0; index < batches.length; index++) {
        if (current !== revision) return;
        notify(`Enviando a JOSM ${index + 1}/${batches.length}…`);
        await checkResponse(await fetch(josmUrl(batches[index], index === 0), { signal, cache: "no-store" }));
      }
      if (current === revision) notify(`${ids.length} ${ids.length === 1 ? "objeto solicitado" : "objetos solicitados"} a JOSM. JOSM los descargará desde la API OSM.`);
    } catch (error) {
      if (current === revision && error?.name !== "AbortError") {
        const advice = error instanceof TypeError ? " Comprueba que JOSM está abierto, Control remoto activado y el navegador permite conexiones locales." : "";
        notify(`No se pudo enviar a JOSM: ${error?.message || String(error)}.${advice}`, true);
      }
    } finally {
      if (current === revision) {
        active = null;
        working = false;
        sync();
      }
    }
  };
  sendButton.addEventListener("click", send);
  setEngine("overpass");
  return { setEngine, setData, reset };
};
