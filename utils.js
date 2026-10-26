const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const $ = (id) => document.getElementById(id);
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ESC[char]);
export const json = (value) => JSON.stringify(value, null, 2);
export const val = (value) => typeof value === "string" ? value : value && typeof value === "object" ? json(value) : String(value ?? "");
export const abortError = (message) => new DOMException(message, "AbortError");
export const DEFAULT_HEAT = Object.freeze({ intensity: 1, radius: 1, opacity: 0.88, weight: 1, palette: "default" });
