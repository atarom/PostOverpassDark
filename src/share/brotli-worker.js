import { encodeIdLists } from "./ids-codec.js";
self.onmessage = async ({ data }) => {
  try {
    const { default: ready } = await import("https://cdn.jsdelivr.net/npm/brotli-wasm@3.0.1/index.web.js");
    const compressor = await ready;
    const normal = new Uint8Array(compressor.compress(data.data, { quality: 11 }));
    const variants = [{ name: "Brotli", prefix: "c", bytes: normal }];
    const packed = encodeIdLists(data.data, data.query);
    if (packed) {
      try { variants.push({ name: "Brotli + IDs", prefix: "d", bytes: new Uint8Array(compressor.compress(packed, { quality: 11 })) }); } catch {}
    }
    self.postMessage({ variants }, variants.map((value) => value.bytes.buffer));
  } catch (error) {
    self.postMessage({ error: error?.message || "No se pudo comprimir con Brotli" });
  }
};
