self.onmessage = async (event) => {
  try {
    const { default: ready } = await import("https://cdn.jsdelivr.net/npm/brotli-wasm@3.0.1/index.web.js");
    const compressed = new Uint8Array((await ready).compress(event.data, { quality: 11 }));
    self.postMessage(compressed, [compressed.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || "No se pudo comprimir con Brotli" });
  }
};
