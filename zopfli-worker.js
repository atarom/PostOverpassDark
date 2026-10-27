self.onmessage = (event) => {
  try {
    importScripts("https://cdn.jsdelivr.net/gh/imaya/zopfli.js@d4b909a24316a6bdc6b101fea4d510bd151c0210/bin/zopfli.raw.min.js");
    const compressed = new Uint8Array(new Zopfli.RawDeflate(event.data, { iterations: 15 }).compress());
    self.postMessage(compressed, [compressed.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || "No se pudo comprimir con Zopfli" });
  }
};
