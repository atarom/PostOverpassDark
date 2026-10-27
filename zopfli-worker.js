self.onmessage = (event) => {
  try {
    const { data, iterations } = event.data;
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) throw Error("Las iteraciones deben estar entre 1 y 100");
    importScripts("https://cdn.jsdelivr.net/gh/imaya/zopfli.js@d4b909a24316a6bdc6b101fea4d510bd151c0210/bin/zopfli.raw.min.js");
    const compressed = new Uint8Array(new Zopfli.RawDeflate(data, { iterations }).compress());
    self.postMessage(compressed, [compressed.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || "No se pudo comprimir con Zopfli" });
  }
};
