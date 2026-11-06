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
  endpoint.replaceChildren(...PUBLIC_SERVERS.map((server) => {
    const option = document.createElement("option");
    option.textContent = server.label;
    option.value = server.url;
    option.dataset.engine = server.engine;
    option.selected = server.url === DEFAULT_ENDPOINT;
    return option;
  }));
  const customKey = "postoverpassdark:custom-endpoint";
  const selectedKey = "postoverpassdark:endpoint";
  const emptyEndpoint = "custom://sin-configurar";
  const storedUrl = storage.getItem(customKey) || "";
  const customOption = document.createElement("option");
  customOption.dataset.engine = "overpass";
  customOption.dataset.custom = "true";
  customOption.textContent = "Servidor personalizado…";
  customOption.value = storedUrl || emptyEndpoint;
  endpoint.append(customOption);
  const box = document.createElement("div");
  box.className = "custom-endpoint-box";
  const label = document.createElement("label");
  label.htmlFor = "customEndpoint";
  label.textContent = "URL privada Overpass";
  const input = document.createElement("input");
  input.id = "customEndpoint";
  input.type = "url";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "https://overpass.nextgis.com/CLAVE/api/interpreter";
  input.value = storedUrl;
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Guardar URL";
  const notice = document.createElement("small");
  notice.setAttribute("role", "status");
  notice.textContent = "Solo se guarda en este navegador. No se incluye en enlaces compartidos.";
  box.append(label, input, save, notice);
  endpoint.after(box);
  const style = document.createElement("style");
  style.textContent = ".custom-endpoint-box{display:none;margin-top:10px}.cfg:has(#endpoint option[data-custom]:checked) .custom-endpoint-box{display:block}.custom-endpoint-box input{box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid var(--b);border-radius:var(--r);background:var(--p2);color:var(--t);font:inherit}.custom-endpoint-box input:focus-visible{border-color:var(--a);outline:2px solid var(--a);outline-offset:1px}.custom-endpoint-box button{margin-top:8px}.custom-endpoint-box small{display:block;margin-top:6px;color:var(--m)}";
  document.head.append(style);
  endpoint.addEventListener("change", () => {
    if (customOption.selected) queueMicrotask(() => storage.setItem(selectedKey, customOption.value));
  });
  save.addEventListener("click", () => {
    const raw = input.value.trim();
    let value = emptyEndpoint;
    if (raw) {
      try {
        const url = new URL(raw);
        if (!/^https:\/\//i.test(raw) || url.protocol !== "https:" || url.username || url.password || url.hash) throw Error();
        if (/\/api\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/?$/, "/interpreter");
        value = url.href;
      } catch {
        input.setCustomValidity("Introduce una URL HTTPS válida.");
        input.reportValidity();
        notice.textContent = "No se ha guardado la URL: debe ser HTTPS y válida.";
        return;
      }
    }
    input.setCustomValidity("");
    input.value = value === emptyEndpoint ? "" : value;
    customOption.value = value;
    value === emptyEndpoint ? storage.removeItem(customKey) : storage.setItem(customKey, value);
    if (customOption.selected) endpoint.dispatchEvent(new Event("change", { bubbles: true }));
    notice.textContent = value === emptyEndpoint ? "Servidor borrado. Introduce una URL HTTPS para ejecutar consultas." : "Servidor guardado en este navegador. Los enlaces compartidos usarán un servidor público.";
  });
  input.addEventListener("input", () => input.setCustomValidity(""));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save.click();
    }
  });
}
