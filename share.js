import { PUBLIC_SERVERS, DEFAULT_ENDPOINT } from "./servers.js";
import { DEFAULT_HEAT } from "./utils.js";
import { encodeIdLists, decodeIdLists } from "./ids-codec.js";
const PALETTES = ["default", "warm", "cool", "fire"];
const HEAT_FIELDS = [["intensity", 20], ["radius", 20], ["opacity", 100], ["weight", 10]];
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const writeVar = (data, number) => {
  let value = number;
  while (value >= 128) {
    data.push(value % 128 + 128);
    value = Math.floor(value / 128);
  }
  data.push(value);
};
const readVar = (bytes, pos) => {
  let value = 0;
  for (let i = 0; i < 6; i++) {
    if (pos.index >= bytes.length) throw Error("Enlace incompleto");
    const byte = bytes[pos.index++];
    value += (byte & 127) * 2 ** (i * 7);
    if (byte < 128) {
      if (!Number.isSafeInteger(value)) throw Error("Número inválido en el enlace");
      return value;
    }
  }
  throw Error("Número inválido en el enlace");
};
const writeSigned = (data, number) => writeVar(data, number < 0 ? -number * 2 - 1 : number * 2);
const readSigned = (bytes, pos) => {
  const number = readVar(bytes, pos);
  return number % 2 ? -(number + 1) / 2 : number / 2;
};
const toBase64 = (bytes) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 16384) value += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64 = (value) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw Error("El enlace compartido no es válido");
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
};
const transform = async (data, stream) => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());
const encodeData = (state) => {
  const heat = { ...DEFAULT_HEAT, ...state.heat };
  const lon = Math.round(Number(state.longitude) * 1e6);
  const lat = Math.round(Number(state.latitude) * 1e6);
  const zoom = Math.round(Number(state.zoom) * 1000);
  if (!Number.isInteger(lon) || Math.abs(lon) > 180000000 || !Number.isInteger(lat) || Math.abs(lat) > 90000000 || !Number.isInteger(zoom) || zoom < 0 || zoom > 19000) throw Error("Centro o zoom del mapa no válido");
  if (typeof state.query !== "string" || !state.query.trim()) throw Error("Escribe una consulta antes de compartir");
  const server = PUBLIC_SERVERS.find((item) => item.url === state.endpoint);
  const endpoint = server?.url ?? DEFAULT_ENDPOINT;
  const endpointIndex = PUBLIC_SERVERS.find((item) => item.url === endpoint)?.shareId ?? 255;
  let mask = 0;
  const heatValues = HEAT_FIELDS.map(([key, scale], index) => {
    const value = Math.round(Number(heat[key]) * scale);
    if (!Number.isInteger(value) || value < 0 || value > 255) throw Error("Configuración de calor no válida");
    if (value !== Math.round(DEFAULT_HEAT[key] * scale)) mask |= 1 << index;
    return value;
  });
  const paletteIndex = PALETTES.indexOf(heat.palette);
  if (paletteIndex < 0) throw Error("Paleta de calor no válida");
  if (paletteIndex) mask |= 16;
  const flags = (state.autoRun === false ? 1 : 0) | (state.heatMode ? 2 : 0) | (endpoint !== DEFAULT_ENDPOINT ? 4 : 0) | (mask ? 8 : 0);
  const bytes = [flags];
  writeSigned(bytes, lon);
  writeSigned(bytes, lat);
  writeVar(bytes, zoom);
  if (flags & 4) {
    bytes.push(endpointIndex);
    if (endpointIndex === 255) {
      const url = encoder.encode(endpoint);
      writeVar(bytes, url.length);
      bytes.push(...url);
    }
  }
  if (flags & 8) {
    bytes.push(mask);
    for (let i = 0; i < heatValues.length; i++) if (mask & (1 << i)) bytes.push(heatValues[i]);
    if (mask & 16) bytes.push(paletteIndex);
  }
  const queryBytes = encoder.encode(state.query);
  for (const byte of queryBytes) bytes.push(byte);
  return new Uint8Array(bytes);
};
const decodeData = (bytes) => {
  if (!bytes.length) throw Error("Enlace compartido vacío");
  const pos = { index: 0 };
  const flags = bytes[pos.index++];
  if (flags & 240) throw Error("Versión de enlace incompatible");
  const longitude = readSigned(bytes, pos) / 1e6;
  const latitude = readSigned(bytes, pos) / 1e6;
  const zoom = readVar(bytes, pos) / 1000;
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || zoom > 19) throw Error("Posición del mapa no válida");
  let endpoint = DEFAULT_ENDPOINT;
  if (flags & 4) {
    if (pos.index >= bytes.length) throw Error("Enlace incompleto");
    const index = bytes[pos.index++];
    if (index === 255) {
      const length = readVar(bytes, pos);
      if (length > bytes.length - pos.index) throw Error("Enlace incompleto");
      endpoint = decoder.decode(bytes.subarray(pos.index, pos.index + length));
      pos.index += length;
    } else {
      endpoint = PUBLIC_SERVERS.find((server) => server.shareId === index)?.url ?? DEFAULT_ENDPOINT;
    }
    if (!PUBLIC_SERVERS.some((server) => server.url === endpoint)) endpoint = DEFAULT_ENDPOINT;
  }
  const heat = { ...DEFAULT_HEAT };
  if (flags & 8) {
    if (pos.index >= bytes.length) throw Error("Enlace incompleto");
    const mask = bytes[pos.index++];
    if (mask & 224) throw Error("Configuración de calor no válida");
    for (let i = 0; i < HEAT_FIELDS.length; i++) if (mask & (1 << i)) {
      if (pos.index >= bytes.length) throw Error("Enlace incompleto");
      const [key, scale] = HEAT_FIELDS[i];
      heat[key] = bytes[pos.index++] / scale;
    }
    if (mask & 16) {
      if (pos.index >= bytes.length) throw Error("Enlace incompleto");
      heat.palette = PALETTES[bytes[pos.index++]];
      if (!heat.palette) throw Error("Paleta de calor no válida");
    }
  }
  const query = decoder.decode(bytes.subarray(pos.index));
  if (!query.trim()) throw Error("El enlace no contiene una consulta");
  return { query, longitude, latitude, zoom, endpoint, heatMode: Boolean(flags & 2), heat, autoRun: !(flags & 1) };
};
export const encodeShareDetailed = async (state) => {
  const bytes = encodeData(state);
  let encoded = `a${toBase64(bytes)}`;
  const candidates = [{ name: "Directo", encoded, compressedBytes: bytes.length }];
  let compressedBytes = null;
  let compressedChars = null;
  let compressionStatus = "unavailable";
  const directChars = encoded.length;
  if (typeof CompressionStream === "function" && typeof DecompressionStream === "function") {
    try {
      const compressed = await transform(bytes, new CompressionStream("deflate-raw"));
      const candidate = `b${toBase64(compressed)}`;
      compressedBytes = compressed.length;
      compressedChars = candidate.length;
      candidates.push({ name: "DEFLATE", encoded: candidate, compressedBytes: compressed.length });
      compressionStatus = "compared";
      if (candidate.length < directChars) encoded = candidate;
    } catch {
      compressionStatus = "failed";
    }
  }
  return { encoded, info: { rawBytes: bytes.length, directChars, compressedBytes, compressedChars, compressionStatus, method: encoded[0] === "b" ? "deflate-raw" : "direct", candidates } };
};
export const encodeShare = async (state) => (await encodeShareDetailed(state)).encoded;
export const encodeShareDeflateIds = async (state, signal) => {
  if (signal?.aborted) throw new DOMException("Compresión cancelada", "AbortError");
  if (typeof CompressionStream !== "function" || typeof DecompressionStream !== "function") return [];
  const packed = encodeIdLists(encodeData(state), state.query);
  if (!packed) return [];
  const compressed = await transform(packed, new CompressionStream("deflate-raw"));
  if (signal?.aborted) throw new DOMException("Compresión cancelada", "AbortError");
  return [{ name: "DEFLATE + IDs", encoded: `e${toBase64(compressed)}`, compressedBytes: compressed.length }];
};
const encodeWorker = (state, signal, file, options) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException("Compresión cancelada", "AbortError"));
  if (typeof Worker !== "function") return reject(Error("Este navegador no permite ejecutar compresores en segundo plano"));
  const data = encodeData(state);
  const worker = new Worker(new URL(file, import.meta.url), options);
  let finished = false;
  let timeout;
  const cleanup = () => {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
    worker.terminate();
  };
  const finish = (error, candidates) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (error) reject(error);
    else resolve(candidates);
  };
  const cancel = () => finish(new DOMException("Compresión cancelada", "AbortError"));
  worker.onerror = (event) => { event.preventDefault(); finish(Error("No se pudo cargar el compresor")); };
  worker.onmessage = ({ data: response }) => {
    if (response?.error) return finish(Error(response.error));
    if (!Array.isArray(response?.variants) || !response.variants.length || response.variants.some((value) => !["b", "c", "d", "e"].includes(value.prefix) || !(value.bytes instanceof Uint8Array))) return finish(Error("Respuesta inválida del compresor"));
    finish(null, response.variants.map((value) => ({ name: value.name, encoded: `${value.prefix}${toBase64(value.bytes)}`, compressedBytes: value.bytes.length })));
  };
  signal?.addEventListener("abort", cancel, { once: true });
  timeout = setTimeout(() => finish(Error("Se ha superado el límite de 120 segundos")), 120000);
  worker.postMessage({ data, query: state.query }, [data.buffer]);
});
export const encodeShareZopfli = (state, signal) => encodeWorker(state, signal, "./zopfli-worker.js");
export const encodeShareBrotli = (state, signal) => encodeWorker(state, signal, "./brotli-worker.js", { type: "module" });
const decodeBrotli = async (bytes) => {
  const { default: ready } = await import("https://cdn.jsdelivr.net/npm/brotli-wasm@3.0.1/index.web.js");
  return (await ready).decompress(bytes);
};
export const decodeShare = async (value) => {
  const match = String(value).match(/^([abcde])([A-Za-z0-9_-]+)$/);
  if (!match) throw Error("Formato de enlace compartido desconocido");
  let bytes = fromBase64(match[2]);
  if (match[1] === "b" || match[1] === "e") {
    if (typeof DecompressionStream !== "function") throw Error("Este navegador no permite descomprimir el enlace");
    bytes = await transform(bytes, new DecompressionStream("deflate-raw"));
    if (match[1] === "e") bytes = decodeIdLists(bytes);
  } else if (match[1] === "c" || match[1] === "d") {
    try { bytes = await decodeBrotli(bytes); } catch { throw Error("No se pudo descomprimir el enlace Brotli"); }
    if (match[1] === "d") bytes = decodeIdLists(bytes);
  }
  return decodeData(bytes);
};
export const sharedFragment = () => location.hash.startsWith("#s=") ? location.hash.slice(3) : null;
export const createShareComparison = (onSelect) => {
  const result = document.getElementById("shareMaxResult");
  if (!document.getElementById("shareDialog") || !result) throw Error("No se pudo iniciar la comparativa de compresión");
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./share-choice.css", import.meta.url).href;
  document.head.append(stylesheet);
  const section = document.createElement("section");
  section.className = "share-comparison";
  section.setAttribute("aria-labelledby", "shareComparisonTitle");
  const header = document.createElement("div");
  header.className = "share-comparison-head";
  const title = document.createElement("h3");
  title.id = "shareComparisonTitle";
  title.className = "share-comparison-title";
  title.textContent = "Comparativa de compresión";
  const status = document.createElement("span");
  status.className = "share-comparison-status";
  status.setAttribute("role", "status");
  header.append(title, status);
  const help = document.createElement("p");
  help.className = "share-comparison-help";
  help.textContent = "Selecciona una barra para usar ese método · Menor tamaño primero";
  const bars = document.createElement("div");
  bars.className = "share-comparison-bars";
  bars.setAttribute("role", "group");
  bars.setAttribute("aria-label", "Seleccionar método de compresión del enlace");
  result.before(section);
  section.append(header, help, bars, result);
  const facts = document.getElementById("shareInfoMethod")?.closest("dl");
  const names = ["Directo", "DEFLATE", "DEFLATE + IDs", "Zopfli", "Zopfli + IDs", "Brotli", "Brotli + IDs"];
  const advanced = names.slice(2);
  const extra = {};
  if (facts) for (const name of advanced) {
    const row = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");
    label.textContent = name;
    value.textContent = "Pendiente";
    row.append(label, value);
    facts.append(row);
    extra[name] = value;
  }
  const numbers = new Intl.NumberFormat("es-ES");
  const methods = new Map();
  let selected = null;
  let manual = false;
  let plain = null;
  const render = () => {
    const ordered = names.map((name) => ({ name, ...methods.get(name) })).sort((a, b) => (a.encoded?.length ?? Infinity) - (b.encoded?.length ?? Infinity));
    const available = ordered.filter((item) => item.encoded);
    const best = available[0];
    const maximum = Math.max(1, ...available.map((item) => item.encoded.length));
    const focused = document.activeElement?.dataset?.method;
    bars.replaceChildren(...ordered.map((method) => {
      const item = document.createElement("button");
      item.type = "button";
      item.dataset.method = method.name;
      item.className = "share-comparison-method" + (method.name === best?.name ? " is-best" : "") + (method.name === selected ? " is-selected" : "") + (!method.encoded ? " is-waiting" : "");
      item.disabled = !method.encoded;
      item.setAttribute("aria-pressed", String(method.name === selected));
      const value = document.createElement("strong");
      value.className = "share-comparison-value";
      value.textContent = method.encoded ? `${numbers.format(method.encoded.length)} car.` : method.status || "Calculando…";
      const track = document.createElement("div");
      track.className = "share-comparison-track";
      const bar = document.createElement("div");
      bar.className = "share-comparison-bar";
      bar.style.height = `${method.encoded ? Math.max(5, Math.round(method.encoded.length / maximum * 110)) : 0}px`;
      track.append(bar);
      const name = document.createElement("span");
      name.className = "share-comparison-name";
      name.textContent = method.name;
      const delta = document.createElement("small");
      delta.className = "share-comparison-delta";
      const difference = plain === null || !method.encoded ? 0 : plain - method.encoded.length;
      delta.textContent = !method.encoded ? method.status || "Pendiente" : difference > 0 ? `−${numbers.format(difference)} car. (−${(difference / plain * 100).toFixed(1)} %)` : difference < 0 ? `+${numbers.format(-difference)} car. (+${(-difference / plain * 100).toFixed(1)} %)` : "Referencia";
      item.setAttribute("aria-label", `${method.name}: ${method.encoded ? `${numbers.format(method.encoded.length)} caracteres, ${delta.textContent}` : delta.textContent}`);
      item.onclick = () => onSelect(method.name);
      item.append(value, track, name, delta);
      return item;
    }));
    if (focused) [...bars.children].find((item) => item.dataset.method === focused && !item.disabled)?.focus({ preventScroll: true });
    const waiting = advanced.some((name) => !methods.get(name));
    status.textContent = plain === null ? "Preparando enlace…" : selected ? `${manual ? "Elegido" : "Automático"}: ${selected}` : waiting ? "Comparando métodos…" : "Sin resultados";
    for (const name of advanced) if (extra[name]) {
      const method = methods.get(name);
      extra[name].textContent = method?.encoded ? `${numbers.format(method.encoded.length)} caracteres` : method?.status || "Calculando…";
    }
  };
  const reset = () => { methods.clear(); plain = null; selected = null; manual = false; result.textContent = ""; render(); };
  const setNative = (info) => {
    plain = info.directChars;
    for (const candidate of info.candidates) methods.set(candidate.name, candidate);
    if (!info.candidates.some((candidate) => candidate.name === "DEFLATE")) methods.set("DEFLATE", { status: info.compressionStatus === "failed" ? "Falló" : "No disponible" });
    render();
  };
  const setResults = (group, candidates) => {
    const groupNames = group === "Zopfli" || group === "Brotli" ? [group, `${group} + IDs`] : [group];
    for (const name of groupNames) methods.set(name, candidates.find((candidate) => candidate.name === name) || { status: "No aplicable" });
    render();
  };
  const setFailure = (group) => {
    const groupNames = group === "Zopfli" || group === "Brotli" ? [group, `${group} + IDs`] : group ? [group] : advanced;
    for (const name of groupNames) methods.set(name, { status: "No disponible" });
    render();
  };
  const setSelected = (name, isManual) => { selected = name; manual = isManual; render(); };
  render();
  return { reset, setNative, setResults, setFailure, setSelected };
};
