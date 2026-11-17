import { normalizeOsmType } from "../export/osm-identifiers.js";
import { countOsmPairs } from "./response.js";
export const purgeResponseBatch = (raw, postpass, identifiers, indices) => {
  if (postpass) {
    const value = JSON.parse(raw);
    if (!Array.isArray(value.features)) throw Error("Respuesta Postpass sin entidades");
    const removed = new Set(indices);
    if ([...removed].some((index) => !Number.isInteger(index) || index < 0 || index >= value.features.length)) throw Error("Entidad Postpass no encontrada");
    value.features = value.features.filter((feature, index) => !removed.has(index));
    const cnt = countOsmPairs(value.features.map(({ properties = {} }) => [normalizeOsmType(properties.osm_type || properties.type), properties.osm_id ?? properties.id]));
    return { raw: JSON.stringify(value), removed: removed.size, cnt };
  }
  const targets = new Set(identifiers.map(({ type, id }) => `${normalizeOsmType(type) || type}/${id}`));
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
    return { raw: new XMLSerializer().serializeToString(documentValue), removed, cnt: countOsmPairs(pairs) };
  }
  const value = JSON.parse(raw);
  if (!Array.isArray(value.elements)) throw Error("Respuesta OSM JSON sin elementos");
  const before = value.elements.length;
  value.elements = value.elements.filter(({ type, id }) => !targets.has(`${type}/${id}`));
  return { raw: JSON.stringify(value), removed: before - value.elements.length, cnt: countOsmPairs(value.elements.map(({ type, id }) => [type, id])) };
};
