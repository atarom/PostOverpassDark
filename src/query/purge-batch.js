const TYPES = { N: "node", W: "way", R: "relation", node: "node", way: "way", relation: "relation" };
const countUnique = (pairs) => {
  const cnt = { node: 0, way: 0, relation: 0, total: 0 };
  const seen = new Set();
  for (const [type, id] of pairs) {
    if (!cnt.hasOwnProperty(type) || type === "total" || id == null) continue;
    const code = `${type}/${id}`;
    if (seen.has(code)) continue;
    seen.add(code);
    cnt[type]++;
    cnt.total++;
  }
  return cnt;
};
export const purgeResponseBatch = (raw, postpass, identifiers, indices) => {
  if (postpass) {
    const value = JSON.parse(raw);
    if (!Array.isArray(value.features)) throw Error("Respuesta Postpass sin entidades");
    const removed = new Set(indices);
    if ([...removed].some((index) => !Number.isInteger(index) || index < 0 || index >= value.features.length)) throw Error("Entidad Postpass no encontrada");
    value.features = value.features.filter((feature, index) => !removed.has(index));
    const cnt = countUnique(value.features.map(({ properties = {} }) => [TYPES[String(properties.osm_type || properties.type || "").trim()] || TYPES[String(properties.osm_type || properties.type || "").trim().toUpperCase()], properties.osm_id ?? properties.id]));
    return { raw: JSON.stringify(value), removed: removed.size, cnt };
  }
  const targets = new Set(identifiers.map(({ type, id }) => `${type === "rel" ? "relation" : type}/${id}`));
  if (/^\s*</.test(raw)) {
    const documentValue = new DOMParser().parseFromString(raw, "text/xml");
    if (documentValue.querySelector("parsererror")) throw Error("Respuesta OSM XML inválida");
    let removed = 0;
    const pairs = [];
    for (const element of [...documentValue.documentElement.children]) {
      const type = element.localName;
      const id = element.getAttribute("id");
      if (targets.has(`${type}/${id}`)) { element.remove(); removed++; }
      else pairs.push([type, id]);
    }
    return { raw: new XMLSerializer().serializeToString(documentValue), removed, cnt: countUnique(pairs) };
  }
  const value = JSON.parse(raw);
  if (!Array.isArray(value.elements)) throw Error("Respuesta OSM JSON sin elementos");
  const before = value.elements.length;
  value.elements = value.elements.filter(({ type, id }) => !targets.has(`${type}/${id}`));
  return { raw: JSON.stringify(value), removed: before - value.elements.length, cnt: countUnique(value.elements.map(({ type, id }) => [type, id])) };
};
