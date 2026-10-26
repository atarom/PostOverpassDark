import { PUBLIC_SERVERS, DEFAULT_ENDPOINT } from "./servers.js";
import { DEFAULT_HEAT } from "./utils.js";
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
      compressionStatus = "compared";
      if (candidate.length < directChars) encoded = candidate;
    } catch {
      compressionStatus = "failed";
    }
  }
  return { encoded, info: { rawBytes: bytes.length, directChars, compressedBytes, compressedChars, compressionStatus, method: encoded[0] === "b" ? "deflate-raw" : "direct" } };
};
export const encodeShare = async (state) => (await encodeShareDetailed(state)).encoded;
export const encodeShareZopfli = (state, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException("Compresión cancelada", "AbortError"));
  if (typeof Worker !== "function") return reject(Error("Este navegador no permite ejecutar Zopfli en segundo plano"));
  const data = encodeData(state);
  const worker = new Worker(new URL("./zopfli-worker.js", import.meta.url));
  let finished = false;
  let timeout;
  const cleanup = () => {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
    worker.terminate();
  };
  const finish = (error, bytes) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (error) reject(error);
    else resolve({ encoded: `b${toBase64(bytes)}`, compressedBytes: bytes.length });
  };
  const cancel = () => finish(new DOMException("Compresión cancelada", "AbortError"));
  worker.onerror = (event) => { event.preventDefault(); finish(Error("No se pudo cargar el compresor Zopfli")); };
  worker.onmessage = (event) => {
    if (event.data?.error) finish(Error(event.data.error));
    else if (event.data instanceof Uint8Array) finish(null, event.data);
    else finish(Error("Respuesta inválida del compresor Zopfli"));
  };
  signal?.addEventListener("abort", cancel, { once: true });
  timeout = setTimeout(() => finish(Error("Zopfli ha superado el límite de 60 segundos")), 60000);
  worker.postMessage(data, [data.buffer]);
});
export const decodeShare = async (value) => {
  const match = String(value).match(/^([ab])([A-Za-z0-9_-]+)$/);
  if (!match) throw Error("Formato de enlace compartido desconocido");
  let bytes = fromBase64(match[2]);
  if (match[1] === "b") {
    if (typeof DecompressionStream !== "function") throw Error("Este navegador no permite descomprimir el enlace");
    bytes = await transform(bytes, new DecompressionStream("deflate-raw"));
  }
  return decodeData(bytes);
};
export const sharedFragment = () => location.hash.startsWith("#s=") ? location.hash.slice(3) : null;
export const createShareComparison = () => {
  const dialog = document.getElementById("shareDialog");
  const result = document.getElementById("shareMaxResult");
  if (!dialog || !result) throw Error("No se pudo iniciar la comparativa de compresión");
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
  help.textContent = "Menor tamaño primero · barras proporcionales al enlace codificado";
  const bars = document.createElement("div");
  bars.className = "share-comparison-bars";
  bars.setAttribute("role", "list");
  bars.setAttribute("aria-label", "Métodos ordenados por longitud del enlace");
  result.before(section);
  section.append(header, help, bars, result);
  const facts = document.getElementById("shareInfoMethod")?.closest("dl");
  let zopfliInfo = null;
  if (facts) {
    const row = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");
    label.textContent = "Zopfli DEFLATE raw";
    value.textContent = "Pendiente";
    row.append(label, value);
    facts.append(row);
    zopfliInfo = value;
  }
  const numbers = new Intl.NumberFormat("es-ES");
  let plain = null;
  let compressed = null;
  let nativeStatus = "unavailable";
  let zopfli = null;
  let zopfliStatus = "pending";
  const render = () => {
    const methods = [{ name: "Directo", chars: plain, state: plain === null ? "Pendiente" : "Referencia" }, { name: "DEFLATE", chars: compressed, state: compressed === null ? nativeStatus === "failed" ? "Falló" : "No disponible" : "Nativo" }, { name: "Zopfli", chars: zopfli, state: zopfliStatus === "failed" ? "No disponible" : zopfliStatus === "pending" ? "Calculando…" : "Completado" }];
    const ordered = [...methods].sort((a, b) => (a.chars ?? Infinity) - (b.chars ?? Infinity));
    const available = ordered.filter((method) => method.chars !== null);
    const best = available[0];
    const savings = (chars) => plain > 0 ? (plain - chars) / plain * 100 : 0;
    const maximum = Math.max(1, ...available.map((method) => method.chars));
    bars.replaceChildren(...ordered.map((method) => {
      const item = document.createElement("div");
      item.className = "share-comparison-method" + (method === best ? " is-best" : "") + (method.chars === null ? " is-waiting" : "");
      item.setAttribute("role", "listitem");
      const value = document.createElement("strong");
      value.className = "share-comparison-value";
      value.textContent = method.chars === null ? method.state : `${numbers.format(method.chars)} car.`;
      const track = document.createElement("div");
      track.className = "share-comparison-track";
      const bar = document.createElement("div");
      bar.className = "share-comparison-bar";
      const saved = method.chars === null ? 0 : savings(method.chars);
      bar.style.height = `${method.chars === null ? 0 : Math.round(method.chars / maximum * 110)}px`;
      track.append(bar);
      const name = document.createElement("span");
      name.className = "share-comparison-name";
      name.textContent = method.name;
      const delta = document.createElement("small");
      delta.className = "share-comparison-delta";
      delta.textContent = method.chars === null ? method.state : saved > 0 ? `−${numbers.format(plain - method.chars)} car. (−${saved.toFixed(1)} %)` : saved < 0 ? `+${numbers.format(method.chars - plain)} car. (+${Math.abs(saved).toFixed(1)} %)` : "Referencia";
      item.setAttribute("aria-label", `${method.name}: ${method.chars === null ? method.state : `${numbers.format(method.chars)} caracteres, ${delta.textContent}`}`);
      item.append(value, track, name, delta);
      return item;
    }));
    status.textContent = plain === null ? "Preparando enlace…" : zopfliStatus === "failed" ? `Mejor: ${best.name} · Zopfli no disponible` : zopfliStatus === "completed" ? `Mejor: ${best.name}` : "Probando Zopfli…";
    if (zopfliInfo) zopfliInfo.textContent = methods[2].chars === null ? methods[2].state : `${numbers.format(methods[2].chars)} caracteres`;
  };
  const reset = () => { plain = null; compressed = null; nativeStatus = "unavailable"; zopfli = null; zopfliStatus = "pending"; result.textContent = ""; render(); };
  const setNative = (info) => { plain = info.directChars; compressed = info.compressedChars; nativeStatus = info.compressionStatus; render(); };
  const setZopfli = (chars) => { zopfli = chars; zopfliStatus = "completed"; render(); };
  const setFailure = () => { zopfliStatus = "failed"; render(); };
  render();
  return { reset, setNative, setZopfli, setFailure };
};
