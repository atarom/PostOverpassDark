import { $, esc } from "./utils.js";
import { createDataViewer } from "./data-viewer.js";
export const createUI = ({ map, status, dataOutput, dataView, overlay, overlayLog, copyButton }) => {
  const data = { query: "", raw: "", geojson: "" };
  let overlayTimer;
  let previousFocus = null;
  let geoData = null;
  const viewer = createDataViewer({ data, dataView, dataOutput, copyButton, getGeo: () => geoData });
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
  const show = () => viewer.show();
  const setGeojson = (value) => { geoData = value; data.geojson = ""; viewer.resetPreview("geojson"); };
  const setOriginal = (text) => { data.raw = text; viewer.resetPreview("raw"); };
  const resetData = () => {
    geoData = null;
    Object.keys(data).forEach((key) => data[key] = "");
    viewer.reset();
  };
  const tab = (name) => {
    for (const item of ["status", "data", "analysis"]) {
      const on = item === name;
      const button = $(`${item}TabBtn`);
      button.classList.toggle("on", on);
      button.setAttribute("aria-selected", on);
      button.tabIndex = on ? 0 : -1;
      $(`${item}Panel`).classList.toggle("on", on);
    }
    if (name === "data") show();
    requestAnimationFrame(() => map.updateSize());
  };
  const copy = () => viewer.copy();
  return { data, log, overlayClose, overlayOpen, overlayDone, setStatus, show, setGeojson, setOriginal, resetData, tab, copy };
};
