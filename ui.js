import { $, esc } from "./utils.js";
export const createUI = ({ map, status, dataOutput, dataView, overlay, overlayLog, copyButton }) => {
  const data = { query: "", raw: "", geojson: "" };
  let overlayTimer;
  let previousFocus = null;
  const log = (message) => {
    overlayLog.textContent += message + "\n";
    overlayLog.scrollTop = overlayLog.scrollHeight;
  };
  const overlayClose = () => {
    const wasOpen = !overlay.hidden;
    clearTimeout(overlayTimer);
    overlayTimer = 0;
    overlay.hidden = true;
    if (wasOpen && previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  };
  const overlayOpen = (message) => {
    clearTimeout(overlayTimer);
    overlayTimer = 0;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlayLog.textContent = "";
    overlay.hidden = false;
    if (message) log(message);
    requestAnimationFrame(() => $("ovX").focus());
  };
  const overlayDone = () => overlayTimer = setTimeout(overlayClose, 1200);
  const setStatus = (html, cls = "") => {
    status.className = "status " + cls;
    status.innerHTML = html;
  };
  const show = () => dataOutput.textContent = data[dataView.value] || "Sin datos.";
  const resetData = () => {
    Object.keys(data).forEach((key) => data[key] = "");
  };
  const tab = (name) => {
    for (const item of ["status", "data"]) {
      const on = item === name;
      const button = $(`${item}TabBtn`);
      button.classList.toggle("on", on);
      button.setAttribute("aria-selected", on);
      button.tabIndex = on ? 0 : -1;
      $(`${item}Panel`).classList.toggle("on", on);
    }
    if (name === "data") show();
    requestAnimationFrame(() => map.resize());
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error("Portapapeles no disponible");
      await navigator.clipboard.writeText(dataOutput.textContent);
      const old = copyButton.textContent;
      copyButton.textContent = "Copiado";
      copyButton.disabled = true;
      setTimeout(() => {
        copyButton.textContent = old;
        copyButton.disabled = false;
      }, 1200);
    } catch (error) {
      setStatus("No se pudo copiar: " + esc(error.message || error), "err");
      tab("status");
    }
  };
  return { data, log, overlayClose, overlayOpen, overlayDone, setStatus, show, resetData, tab, copy, clearOverlayTimer: () => clearTimeout(overlayTimer) };
};
