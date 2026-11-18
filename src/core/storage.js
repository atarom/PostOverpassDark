import { PUBLIC_SERVERS, DEFAULT_ENDPOINT } from "./servers.js";
export const storage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};
const endpoint = document.getElementById("endpoint");
if (endpoint) {
  const listKey = "postoverpassdark:custom-endpoints";
  const selectedKey = "postoverpassdark:endpoint";
  const readList = () => {
    try {
      const saved = JSON.parse(storage.getItem(listKey) || "[]");
      return Array.isArray(saved) ? saved.filter((item) => item && typeof item.name === "string" && typeof item.url === "string" && item.name.trim() && /^https:\/\//i.test(item.url)) : [];
    } catch {
      return [];
    }
  };
  let servers = readList();
  const normalize = (value) => {
    const raw = value.trim();
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw Error("URL no válida");
    if (/\/api\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/?$/, "/interpreter");
    return url.href;
  };
  const makeOption = (server, custom = false) => {
    const option = document.createElement("option");
    option.textContent = server.name || server.label;
    option.value = server.url;
    option.dataset.engine = server.engine || "overpass";
    if (custom) option.dataset.custom = "true";
    return option;
  };
  const renderOptions = (selected = endpoint.value) => {
    endpoint.replaceChildren(...PUBLIC_SERVERS.map((server) => makeOption(server)), ...servers.map((server) => makeOption(server, true)));
    endpoint.value = [...endpoint.options].some((option) => option.value === selected) ? selected : DEFAULT_ENDPOINT;
  };
  renderOptions(DEFAULT_ENDPOINT);
  const panel = document.createElement("div");
  panel.className = "custom-endpoints";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "custom-endpoints-toggle";
  toggle.textContent = "Gestionar servidores";
  toggle.setAttribute("aria-expanded", "false");
  const body = document.createElement("div");
  body.className = "custom-endpoints-body";
  body.hidden = true;
  const list = document.createElement("div");
  list.className = "custom-endpoints-list";
  const form = document.createElement("form");
  form.className = "custom-endpoints-form";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Nombre";
  const name = document.createElement("input");
  name.type = "text";
  name.required = true;
  name.maxLength = 80;
  name.autocomplete = "off";
  name.placeholder = "Mi servidor Overpass";
  nameLabel.append(name);
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "URL HTTPS";
  const url = document.createElement("input");
  url.type = "url";
  url.required = true;
  url.autocomplete = "off";
  url.spellcheck = false;
  url.placeholder = "https://servidor.example/api/interpreter";
  urlLabel.append(url);
  const actions = document.createElement("div");
  actions.className = "custom-endpoints-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Añadir servidor";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancelar edición";
  cancel.hidden = true;
  actions.append(save, cancel);
  const notice = document.createElement("small");
  notice.setAttribute("role", "status");
  notice.textContent = "Las URL se guardan en este navegador y no se incluyen en enlaces compartidos.";
  form.append(nameLabel, urlLabel, actions, notice);
  body.append(list, form);
  panel.append(toggle, body);
  endpoint.after(panel);
  const style = document.createElement("style");
  style.textContent = `
.custom-endpoints { margin-top: 8px; }
.custom-endpoints-toggle { font: inherit; cursor: pointer; }
.custom-endpoints-body { margin-top: 10px; }
.custom-endpoints-body[hidden] { display: none; }
.custom-endpoints-list { display: grid; gap: 5px; margin-bottom: 10px; max-height: 180px; overflow-y: auto; }
.custom-endpoints-row { display: flex; align-items: center; gap: 6px; padding: 5px 0; border-bottom: 1px solid var(--b); }
.custom-endpoints-row span { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.custom-endpoints-row button { flex-shrink: 0; cursor: pointer; }
.custom-endpoints-form { display: grid; gap: 8px; }
.custom-endpoints-form label { display: grid; gap: 4px; }
.custom-endpoints-form input { box-sizing: border-box; width: 100%; padding: 9px 10px; border: 1px solid var(--b); border-radius: var(--r); background: var(--p2); color: var(--t); font: inherit; }
.custom-endpoints-form input:focus-visible { border-color: var(--a); outline: 2px solid var(--a); outline-offset: 1px; }
.custom-endpoints-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.custom-endpoints-form small { color: var(--m); }
`;
  document.head.append(style);
  let editing = -1;
  const resetForm = () => {
    editing = -1;
    form.reset();
    save.textContent = "Añadir servidor";
    cancel.hidden = true;
    url.setCustomValidity("");
  };
  const persist = (previous = endpoint.value) => {
    storage.setItem(listKey, JSON.stringify(servers));
    renderOptions(previous);
    endpoint.dispatchEvent(new Event("change", { bubbles: true }));
    renderList();
  };
  const renderList = () => {
    list.replaceChildren();
    for (const [index, server] of servers.entries()) {
      const row = document.createElement("div");
      row.className = "custom-endpoints-row";
      const title = document.createElement("span");
      title.textContent = server.name;
      title.title = server.url;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Editar";
      edit.addEventListener("click", () => {
        editing = index;
        name.value = server.name;
        url.value = server.url;
        save.textContent = "Guardar cambios";
        cancel.hidden = false;
        name.focus();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Eliminar";
      remove.addEventListener("click", () => {
        if (!confirm(`¿Eliminar el servidor «${server.name}»?`)) return;
        const selected = endpoint.value === server.url ? DEFAULT_ENDPOINT : endpoint.value;
        servers.splice(index, 1);
        resetForm();
        persist(selected);
        notice.textContent = "Servidor eliminado.";
      });
      row.append(title, edit, remove);
      list.append(row);
    }
  };
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.setAttribute("aria-expanded", String(!body.hidden));
    if (!body.hidden) name.focus();
  });
  cancel.addEventListener("click", resetForm);
  url.addEventListener("input", () => url.setCustomValidity(""));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const label = name.value.trim();
    let value;
    try {
      value = normalize(url.value);
    } catch {
      url.setCustomValidity("Introduce una URL HTTPS válida.");
      url.reportValidity();
      return;
    }
    const duplicate = servers.some((server, index) => server.url === value && index !== editing) || PUBLIC_SERVERS.some((server) => server.url === value);
    if (duplicate) {
      url.setCustomValidity("Este servidor ya está registrado.");
      url.reportValidity();
      return;
    }
    const oldUrl = editing >= 0 ? servers[editing].url : null;
    if (editing >= 0) servers[editing] = { name: label, url: value };
    else servers.push({ name: label, url: value });
    const selected = oldUrl && endpoint.value === oldUrl ? value : endpoint.value;
    resetForm();
    persist(selected);
    notice.textContent = "Servidores guardados localmente. No se incluyen en enlaces compartidos.";
  });
  endpoint.addEventListener("change", () => {
    const selected = endpoint.selectedOptions[0];
    if (selected?.dataset.custom === "true") queueMicrotask(() => storage.setItem(selectedKey, selected.value));
  });
  renderList();
}
