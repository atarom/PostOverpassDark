import { esc } from "./utils.js";
const PALETTE = ["#e6194b","#3cb44b","#ffe119","#4363d8","#f58231","#911eb4","#46f0f0","#f032e6","#bcf60c","#fabebe","#008080","#e6beff","#9a6324","#fffac8","#800000","#aaffc3","#808000","#ffd8b1","#000075","#808080","#ffffff","#000000"];
const RESERVED = new Set(["id","type","relations","meta","osm_id","osm_type","osm_url"]);
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
export const featureTags = (feature) => {
  const properties = feature?.properties || {};
  if (isObject(properties.tags)) return properties.tags;
  if (!Object.keys(properties).some((key) => key.startsWith("@"))) return {};
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) => value != null && !key.startsWith("@") && !RESERVED.has(key)));
};
const textValue = (value) => typeof value === "string" ? value.trim() : value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
const numericValue = (value) => {
  const text = textValue(value).replace(",", ".");
  if (!text) return NaN;
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
};
const own = (value, key) => Boolean(key) && Object.prototype.hasOwnProperty.call(value, key);
export const analyzeCollection = (collection) => {
  const counts = new Map();
  const numeric = new Map();
  for (const feature of collection?.features || []) {
    const tags = featureTags(feature);
    for (const [key, value] of Object.entries(tags)) {
      counts.set(key, (counts.get(key) || 0) + 1);
      const number = numericValue(value);
      if (Number.isFinite(number)) {
        const stat = numeric.get(key);
        if (stat) { stat.min = Math.min(stat.min, number); stat.max = Math.max(stat.max, number); stat.count++; }
        else numeric.set(key, { min: number, max: number, count: 1 });
      }
    }
  }
  const keys = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  const numericKeys = [...numeric].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], "es")).map(([key, stat]) => [key, stat.min, stat.max, stat.count]);
  return { keys, numericKeys };
};
const compilePatterns = (raw, insensitive) => raw.split(",").map((value) => value.trim()).filter(Boolean).flatMap((source) => {
  try {
    return [{ source, regex: new RegExp(source, insensitive ? "i" : "") }];
  } catch {
    return [];
  }
});
export const filterCollection = (collection, options = {}) => {
  const selectedKey = options.selectedKey || "";
  const patterns = options.regexEnabled ? compilePatterns(options.regexText || "", options.regexInsensitive) : [];
  const min = Number(options.numericMin);
  const max = Number(options.numericMax);
  const out = [];
  for (const feature of collection?.features || []) {
    const tags = featureTags(feature);
    if (options.onlySelectedKey && selectedKey && !own(tags, selectedKey)) continue;
    let color = "";
    if (options.regexEnabled) {
      const value = textValue(tags[selectedKey]);
      const match = value ? patterns.find(({ regex }) => regex.test(value)) : null;
      if (match) color = options.regexColors?.[match.source] || "";
      else if (options.regexOnly) continue;
    }
    if (options.numericEnabled && options.numericKey) {
      const number = numericValue(tags[options.numericKey]);
      const pass = Number.isFinite(number) && number >= min && number <= max;
      if (!pass) {
        if (!options.numericShowErrors) continue;
        color = options.errorColor || "#ef8491";
      }
    }
    const properties = color ? { ...(feature.properties || {}), _podColor: color } : { ...(feature.properties || {}) };
    delete properties._podColor;
    if (color) properties._podColor = color;
    out.push({ ...feature, properties });
  }
  return { type: "FeatureCollection", features: out };
};
export const createAnalysis = ({ elements, onChange }) => {
  const { key, onlyKey, multivalue, values, summary, numericEnable, numericKey, numericErrors, numericMin, numericMax, numericMinValue, numericMaxValue, regexEnable, regexText, regexInsensitive, regexOnly, regexColors, reset } = elements;
  let collection = { type: "FeatureCollection", features: [] };
  let info = { keys: [], numericKeys: [] };
  let colors = {};
  let timer;
  let frame;
  const colorFor = (source, used) => {
    if (colors[source]) return colors[source];
    const color = PALETTE.find((item) => !used.has(item)) || PALETTE[Object.keys(colors).length % PALETTE.length];
    colors[source] = color;
    used.add(color);
    return color;
  };
  const valueCounts = () => {
    const selected = key.value;
    const counts = new Map();
    for (const feature of collection.features || []) {
      const tags = featureTags(feature);
      if (!own(tags, selected)) continue;
      const raw = textValue(tags[selected]);
      const list = multivalue.checked ? raw.split(";").map((item) => item.trim()).filter(Boolean) : [raw];
      for (const item of list) counts.set(item, (counts.get(item) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  };
  const renderValues = () => {
    const counts = valueCounts();
    values.textContent = counts.length ? counts.map(([value, count]) => `${count} ${value}`).join("\n") : "Sin valores.";
    summary.textContent = `${collection.features.length.toLocaleString("es-ES")} entidades · ${info.keys.length.toLocaleString("es-ES")} keys · ${counts.length.toLocaleString("es-ES")} valores`;
  };
  const regexCount = (pattern) => {
    const selected = key.value;
    let count = 0;
    for (const feature of collection.features || []) {
      const value = textValue(featureTags(feature)[selected]);
      if (value && pattern.regex.test(value)) count++;
    }
    return count;
  };
  const renderRegex = () => {
    const patterns = compilePatterns(regexText.value, regexInsensitive.checked);
    const used = new Set(Object.values(colors));
    regexColors.replaceChildren();
    for (const pattern of patterns.sort((a, b) => regexCount(b) - regexCount(a))) {
      const item = document.createElement("label");
      item.className = "rxchip";
      const input = document.createElement("input");
      input.type = "color";
      input.value = colorFor(pattern.source, used);
      input.setAttribute("aria-label", `Color para ${pattern.source}`);
      input.oninput = () => {
        colors[pattern.source] = input.value;
        emit();
      };
      const text = document.createElement("span");
      text.textContent = `${pattern.source} (${regexCount(pattern)})`;
      item.append(input, text);
      regexColors.append(item);
    }
  };
  const numericRange = () => {
    const item = info.numericKeys.find(([name]) => name === numericKey.value);
    const min = item?.[1] ?? 0;
    const max = item?.[2] ?? 1000;
    const spread = Math.max(Math.abs(max - min), 0.01);
    const step = spread <= 1 ? 0.001 : spread <= 10 ? 0.01 : spread <= 100 ? 0.1 : 1;
    for (const input of [numericMin, numericMax]) {
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.disabled = !numericEnable.checked || !item;
    }
    numericMin.value = String(min);
    numericMax.value = String(max);
    numericMinValue.value = String(min);
    numericMaxValue.value = String(max);
  };
  const options = () => ({ selectedKey: key.value, onlySelectedKey: onlyKey.checked, regexEnabled: regexEnable.checked, regexText: regexText.value, regexInsensitive: regexInsensitive.checked, regexOnly: regexOnly.checked, regexColors: colors, numericEnabled: numericEnable.checked, numericKey: numericKey.value, numericMin: numericMin.value, numericMax: numericMax.value, numericShowErrors: numericErrors.checked, errorColor: "#ef8491" });
  const emit = () => onChange?.(options());
  const emitFrame = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(emit);
  };
  const keyChanged = () => {
    renderValues();
    renderRegex();
    emit();
  };
  const numericChanged = () => {
    numericRange();
    emit();
  };
  const delayedRegex = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      renderRegex();
      emit();
    }, 250);
  };
  const resetControls = () => {
    onlyKey.checked = false;
    multivalue.checked = false;
    numericEnable.checked = false;
    numericErrors.checked = false;
    regexEnable.checked = false;
    regexInsensitive.checked = false;
    regexOnly.checked = false;
    regexText.value = "";
    colors = {};
    numericRange();
    renderValues();
    renderRegex();
    emit();
  };
  key.onchange = keyChanged;
  onlyKey.onchange = emit;
  multivalue.onchange = renderValues;
  numericEnable.onchange = () => {
    for (const input of [numericMin, numericMax]) input.disabled = !numericEnable.checked || !numericKey.value;
    emit();
  };
  numericKey.onchange = numericChanged;
  numericErrors.onchange = emit;
  numericMin.oninput = () => {
    if (+numericMin.value > +numericMax.value) numericMax.value = numericMin.value;
    numericMinValue.value = numericMin.value;
    numericMaxValue.value = numericMax.value;
    emitFrame();
  };
  numericMax.oninput = () => {
    if (+numericMax.value < +numericMin.value) numericMin.value = numericMax.value;
    numericMinValue.value = numericMin.value;
    numericMaxValue.value = numericMax.value;
    emitFrame();
  };
  regexEnable.onchange = () => {
    renderRegex();
    emit();
  };
  regexInsensitive.onchange = () => {
    renderRegex();
    emit();
  };
  regexOnly.onchange = emit;
  regexText.oninput = delayedRegex;
  reset.onclick = resetControls;
  const setData = (next, silent = false) => {
    collection = next?.type === "FeatureCollection" && Array.isArray(next.features) ? next : { type: "FeatureCollection", features: [] };
    info = analyzeCollection(collection);
    const oldKey = key.value;
    key.replaceChildren(...info.keys.map(([name, count]) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = `${name} (${count})`;
      return option;
    }));
    if (info.keys.some(([name]) => name === oldKey)) key.value = oldKey;
    const oldNumeric = numericKey.value;
    numericKey.replaceChildren(...info.numericKeys.map(([name, , , count]) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = `${name} (${count})`;
      return option;
    }));
    if (info.numericKeys.some(([name]) => name === oldNumeric)) numericKey.value = oldNumeric;
    numericRange();
    renderValues();
    renderRegex();
    if (!silent) emit();
  };
  const clear = () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    collection = { type: "FeatureCollection", features: [] };
    info = { keys: [], numericKeys: [] };
    key.replaceChildren();
    numericKey.replaceChildren();
    values.textContent = "Sin datos.";
    summary.textContent = "Ejecuta una consulta para analizar sus tags.";
    regexColors.replaceChildren();
    numericEnable.checked = false;
    regexEnable.checked = false;
    numericMin.disabled = true;
    numericMax.disabled = true;
  };
  clear();
  return { setData, clear, apply: emit, options, htmlKey: () => esc(key.value) };
};
