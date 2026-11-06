let task = null;
self.onmessage = ({ data }) => {
  try {
    if (data.action === "preview") {
      const pieces = [];
      let remaining = 51200;
      let truncated = false;
      for (const feature of data.features) {
        const value = JSON.stringify(feature, null, 2) ?? "null";
        const part = (pieces.length ? ",\n" : "") + value;
        if (part.length > remaining) {
          pieces.push(part.slice(0, remaining));
          truncated = true;
          break;
        }
        pieces.push(part);
        remaining -= part.length;
      }
      self.postMessage({ action: "preview", text: pieces.join("") + (truncated ? "\n… [contenido recortado en esta página]" : ""), truncated });
    }
    if (data.action === "begin") {
      const meta = data.meta || {};
      const members = Object.entries(meta).filter(([key]) => key !== "features").map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
      task = { parts: ["{" + (members.length ? members.join(",") + "," : "") + '"features":['], count: 0 };
    }
    if (data.action === "batch" && task) {
      const text = data.features.map((feature) => JSON.stringify(feature) ?? "null").join(",");
      if (text) task.parts.push((task.count ? "," : "") + text);
      task.count += data.features.length;
    }
    if (data.action === "finish" && task) {
      task.parts.push("]}");
      const blob = new Blob(task.parts, { type: "application/geo+json;charset=utf-8" });
      task = null;
      self.postMessage({ action: "blob", blob });
    }
  } catch (error) {
    task = null;
    self.postMessage({ action: "error", message: error?.message || String(error) });
  }
};
