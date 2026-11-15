import { formatJosmIds } from "./osm-identifiers.js";
const JOSM = "http://127.0.0.1:8111/";
const URL_LIMIT = 1700;
const josmUrl = (ids, first = true) => {
  const url = new URL("load_object", JOSM);
  url.searchParams.set("objects", ids.join(","));
  url.searchParams.set("relation_members", "true");
  url.searchParams.set("new_layer", first ? "true" : "false");
  return url.toString();
};
const josmBatches = (ids, maxLength = URL_LIMIT) => {
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
export const createJosmExporter = ({ container, sendButton, message, getIds }) => {
  let hasData = false;
  let active = null;
  let revision = 0;
  let working = false;
  const sync = () => { sendButton.disabled = working || !hasData; };
  const notify = (value, error = false) => {
    message.textContent = value;
    message.classList.toggle("err", error);
  };
  const reset = () => {
    revision++;
    active?.abort();
    active = null;
    hasData = false;
    working = false;
    notify("");
    sync();
  };
  const setEngine = () => {
    container.hidden = false;
    reset();
  };
  const setData = (loaded) => {
    reset();
    hasData = Boolean(loaded);
    if (hasData) notify("IDs de la selección actual listos para JOSM.");
    sync();
  };
  const checkResponse = async (response) => {
    if (response.ok) return response;
    throw Error(`JOSM devolvió HTTP ${response.status}`);
  };
  const send = async () => {
    if (working || !hasData) return;
    let target;
    try { target = formatJosmIds(getIds().groups); }
    catch (error) {
      notify(`No se pudieron obtener los IDs: ${error?.message || String(error)}`, true);
      return;
    }
    if (!target.length) {
      notify("No hay elementos visibles con identificador OSM válido para enviar a JOSM.", true);
      return;
    }
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
      const batches = josmBatches(target);
      for (let index = 0; index < batches.length; index++) {
        if (current !== revision) return;
        notify(`Enviando a JOSM ${index + 1}/${batches.length}…`);
        await checkResponse(await fetch(josmUrl(batches[index], index === 0), { signal, cache: "no-store" }));
      }
      if (current === revision) notify(`${target.length} ${target.length === 1 ? "objeto solicitado" : "objetos solicitados"} a JOSM. JOSM los descargará desde la API OSM.`);
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
  setEngine();
  return { setEngine, setData, reset };
};
