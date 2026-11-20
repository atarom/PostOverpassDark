const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const $ = (id) => document.getElementById(id);
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ESC[char]);
export const json = (value) => JSON.stringify(value, null, 2);
export const val = (value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (!Array.isArray(value) && Object.keys(value).length === 2 && Object.hasOwn(value, "lat") && Object.hasOwn(value, "lon")) return `${value.lat},${value.lon}`;
    return json(value);
  }
  return String(value ?? "");
};
export const abortError = (message) => new DOMException(message, "AbortError");
export const DEFAULT_HEAT = Object.freeze({ intensity: 1, radius: 1, opacity: 0.88, weight: 1, palette: "default" });
