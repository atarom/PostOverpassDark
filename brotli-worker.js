import { encodeIdLists } from "./ids-codec.js";
self.onmessage = async (event) => {
  try {
    const { default: ready } = await import("https://cdn.jsdelivr.net/npm/brotli-wasm@3.0.1/index.web.js");
    const compressor = await ready;
    const compressed = new Uint8Array(compressor.compress(event.data.data, { quality: 11 }));
    let best = compressed;
    let prefix = "c";
    const packed = encodeIdLists(event.data.data, event.data.query);
    if (packed) {
      try {
        const optimized = new Uint8Array(compressor.compress(packed, { quality: 11 }));
        if (optimized.length < compressed.length) { best = optimized; prefix = "d"; }
      } catch {}
    }
    self.postMessage({ bytes: best, prefix }, [best.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || "No se pudo comprimir con Brotli" });
  }
};
