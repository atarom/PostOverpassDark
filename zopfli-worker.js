self.onmessage = async ({ data }) => {
  try {
    importScripts("https://cdn.jsdelivr.net/gh/imaya/zopfli.js@d4b909a24316a6bdc6b101fea4d510bd151c0210/bin/zopfli.raw.min.js");
    const { encodeIdLists } = await import("./ids-codec.js");
    const normal = new Uint8Array(new Zopfli.RawDeflate(data.data, { iterations: 15 }).compress());
    const variants = [{ name: "Zopfli", prefix: "b", bytes: normal }];
    const packed = encodeIdLists(data.data, data.query);
    if (packed) {
      try { variants.push({ name: "Zopfli + IDs", prefix: "e", bytes: new Uint8Array(new Zopfli.RawDeflate(packed, { iterations: 15 }).compress()) }); } catch {}
    }
    self.postMessage({ variants }, variants.map((value) => value.bytes.buffer));
  } catch (error) {
    self.postMessage({ error: error?.message || "No se pudo comprimir con Zopfli" });
  }
};
