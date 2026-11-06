const TYPES = ["node", "way", "rel"];
const TYPE = { N: "node", W: "way", R: "rel", n: "node", w: "way", r: "rel", node: "node", way: "way", relation: "rel", rel: "rel" };
export const getIdentifier = (feature) => {
  const properties = feature?.properties || feature || {};
  const rawType = String(properties.osm_type ?? "").trim();
  const fallbackType = String(properties.type ?? "").trim();
  let type = TYPE[rawType] || TYPE[rawType.toLowerCase()] || TYPE[fallbackType] || TYPE[fallbackType.toLowerCase()];
  let id = properties.osm_id ?? properties.id;
  if (!type || !/^\d+$/.test(String(id ?? ""))) {
    for (const value of [properties.osm_url, feature?.id, properties["@id"], properties.id]) {
      const source = String(value ?? "");
      const match = source.match(/(node|way|relation)[/:](\d+)$/i) || source.match(/^([nwr])(\d+)$/i);
      if (!match) continue;
      type = TYPE[match[1].toLowerCase()];
      id = match[2];
      break;
    }
  }
  if (!type || !/^\d+$/.test(String(id ?? ""))) return null;
  const number = Number(id);
  return Number.isSafeInteger(number) && number > 0 ? { type, id: number } : null;
};
export const collectOsmIds = (features, enabled = { node: true, way: true, rel: true }) => {
  const sets = { node: new Set(), way: new Set(), rel: new Set() };
  let omitted = 0;
  for (const feature of features) {
    const item = getIdentifier(feature);
    if (!item) { omitted++; continue; }
    if (enabled[item.type]) sets[item.type].add(item.id);
  }
  const groups = Object.fromEntries(TYPES.map((type) => [type, [...sets[type]].sort((a, b) => a - b)]));
  return { groups, count: TYPES.reduce((total, type) => total + groups[type].length, 0), omitted };
};
