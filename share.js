const ENDPOINTS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter", "https://postpass.geofabrik.de/api/interpreter"];
export const DEFAULT_ENDPOINT = ENDPOINTS[0];
export const DEFAULT_HEAT = Object.freeze({ intensity: 1, radius: 1, opacity: 0.88, weight: 1, palette: "default" });
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
  const endpoint = ENDPOINTS.includes(state.endpoint) ? state.endpoint : DEFAULT_ENDPOINT;
  const endpointIndex = ENDPOINTS.indexOf(endpoint);
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
    bytes.push(endpointIndex < 0 ? 255 : endpointIndex);
    if (endpointIndex < 0) {
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
      endpoint = ENDPOINTS[index];
      if (!endpoint) throw Error("Servidor desconocido en el enlace");
    }
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
