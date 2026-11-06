import { collectOsmIds } from "./osm-identifiers.js";
const ORIGIN = location.origin;
const READY = "pod-idstopod-ready";
const DATA = "pod-idstopod-data";
const DONE = "pod-idstopod-done";
const TOKEN = /^#idstopod=([a-z0-9-]{12,})$/;
export const buildIdsToPodQuery = (features) => {
  const { groups, count } = collectOsmIds(features);
  const lines = [];
  for (const type of ["node", "way", "rel"]) {
    const ids = groups[type];
    if (!ids.length) continue;
    lines.push(`  ${type}(id:${ids.join(",")});`);
  }
  if (!count) return { query: "", count: 0 };
  return { query: `[out:json][timeout:180][maxsize:16Mi];\n(\n${lines.join("\n")}\n);\nout center;`, count };
};
export const createIdsToPod = ({ anchor, getFeatures, getPosition, receive }) => {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./ids-to-pod.css", import.meta.url).href;
  document.head.append(stylesheet);
  const button = document.createElement("button");
  button.id = "idsToPod";
  button.className = "action-button ids-to-pod";
  button.type = "button";
  button.textContent = "IDsToPOD";
  button.title = "Abrir los IDs visibles o seleccionados en una nueva pestaña de POD";
  button.disabled = true;
  anchor.after(button);
  const message = document.createElement("div");
  message.className = "josm-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  anchor.parentElement.after(message);
  const notify = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("err", error);
  };
  const pending = new Map();
  const targetToken = location.hash.match(TOKEN)?.[1];
  let receiverTimer = 0;
  let received = false;
  const complete = (token, text, error = false) => {
    const state = pending.get(token);
    if (!state) return;
    clearTimeout(state.timeout);
    pending.delete(token);
    notify(text, error);
  };
  addEventListener("message", (event) => {
    if (event.origin !== ORIGIN || !event.data || typeof event.data !== "object") return;
    const { kind, token } = event.data;
    if (targetToken && !received && event.source === window.opener && token === targetToken && kind === DATA) {
      if (typeof event.data.query !== "string" || !event.data.query.startsWith("[out:json][timeout:180][maxsize:16Mi];")) return;
      received = true;
      clearInterval(receiverTimer);
      receiverTimer = 0;
      try {
        receive(event.data.query, event.data.position);
        history.replaceState(history.state, "", location.pathname + location.search);
        window.opener.postMessage({ kind: DONE, token }, ORIGIN);
      } catch (error) {
        notify(`No se pudo cargar la consulta: ${error?.message || String(error)}`, true);
      }
      return;
    }
    const state = pending.get(token);
    if (!state || event.source !== state.tab) return;
    if (kind === READY) state.tab.postMessage({ kind: DATA, token, query: state.query, position: state.position }, ORIGIN);
    if (kind === DONE) complete(token, `${state.count.toLocaleString("es-ES")} IDs transferidos a otra pestaña.`);
  });
  if (targetToken && window.opener) {
    let tries = 0;
    receiverTimer = setInterval(() => {
      if (window.opener?.closed || ++tries > 180) {
        clearInterval(receiverTimer);
        notify("No se ha recibido la consulta de la pestaña original.", true);
        return;
      }
      window.opener.postMessage({ kind: READY, token: targetToken }, ORIGIN);
    }, 300);
  }
  button.onclick = () => {
    let built;
    try { built = buildIdsToPodQuery(getFeatures()); }
    catch (error) { notify(`No se pudieron obtener los IDs: ${error?.message || String(error)}`, true); return; }
    if (!built.count) { notify("No hay objetos OSM visibles o seleccionados con IDs válidos.", true); return; }
    const token = crypto.randomUUID();
    const url = new URL(location.href);
    url.hash = `idstopod=${token}`;
    const tab = window.open(url.href, "_blank");
    if (!tab) { notify("El navegador ha bloqueado la nueva pestaña.", true); return; }
    const position = getPosition();
    const timeout = setTimeout(() => complete(token, "No se ha confirmado la transferencia. Comprueba la nueva pestaña.", true), 60000);
    pending.set(token, { tab, timeout, query: built.query, position, count: built.count });
    notify(`Preparando ${built.count.toLocaleString("es-ES")} IDs en la nueva pestaña…`);
  };
  return { setData: (value) => { button.disabled = !value; if (!value) notify(""); }, button };
};
