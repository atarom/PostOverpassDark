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
export const tagValueParts = (value, mode = "value") => {
  const raw = textValue(value);
  return mode === "word" ? raw.normalize("NFC").toLocaleLowerCase("es").normalize("NFC").match(/\p{L}[\p{L}\p{M}\p{N}]*/gu) || [] : mode === "semicolon" ? raw.split(";").map((item) => item.trim()).filter(Boolean) : [raw];
};
export const matchesTagValue = (tags, key, selectedValue, mode = "value") => own(tags, key) && tagValueParts(tags[key], mode).includes(selectedValue);
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
export const splitRegexPatterns = (raw) => String(raw).split(/\r\n?|\n/).map((value) => value.trim()).filter(Boolean);
const compilePatterns = (raw, insensitive) => splitRegexPatterns(raw).flatMap((source) => {
  try {
    return [{ source, regex: new RegExp(source, insensitive ? "i" : "") }];
  } catch {
    return [];
  }
});
export const createAnalysis = ({ elements, onChange }) => {
  const { key, onlyKey, countMode, values, valueTools, valueSelectedColor, valueOtherColor, valueHideOthers, summary, numericEnable, numericKey, numericErrors, numericMin, numericMax, numericMinValue, numericMaxValue, regexEnable, regexText: regexInput, regexInsensitive, regexOnly, regexColors, reset } = elements;
  const regexText = document.createElement("textarea");
  regexText.id = regexInput.id;
  regexText.rows = 3;
  regexText.placeholder = "^Pantà\n^Embassament";
  regexText.setAttribute("aria-label", "Una expresión regular por línea");
  regexText.style.cssText = "display:block;width:100%;min-height:72px;max-height:180px;padding:9px 10px;resize:vertical;overflow:auto;border:1px solid var(--b);border-radius:var(--r);background:var(--p2);color:var(--t);font:12px/1.4 var(--mono)";
  regexInput.previousElementSibling.textContent = "Una regex por línea";
  regexInput.replaceWith(regexText);
  const valuesLabel = values.previousElementSibling;
  valuesLabel.textContent = "Valores únicos";
  valuesLabel.classList.add("analysis-box");
  let collection = { type: "FeatureCollection", features: [] };
  let info = { keys: [], numericKeys: [] };
  let colors = {};
  let selectedValue = null;
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
      const list = tagValueParts(tags[selected], countMode.value);
      for (const item of list) counts.set(item, (counts.get(item) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  };
  const renderValues = () => {
    const counts = valueCounts();
    valuesLabel.textContent = countMode.value === "word" ? "Palabras únicas" : "Valores únicos";
    const scroll = values.scrollTop;
    values.replaceChildren();
    for (const [value, count] of counts) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "analysis-value";
      button.setAttribute("aria-pressed", String(value === selectedValue));
      button.title = value === selectedValue ? "Quitar selección" : `Seleccionar ${value || "(vacío)"}`;
      const amount = document.createElement("span");
      amount.className = "analysis-value-count";
      amount.textContent = count.toLocaleString("es-ES");
      const text = document.createElement("span");
      text.className = "analysis-value-text";
      text.textContent = value || "(vacío)";
      button.append(amount, text);
      button.onclick = () => {
        selectedValue = selectedValue === value ? null : value;
        if (selectedValue !== null) regexEnable.checked = false;
        valueTools.hidden = selectedValue === null;
        for (const item of values.querySelectorAll(".analysis-value")) item.setAttribute("aria-pressed", String(item === button && selectedValue !== null));
        emit();
      };
      values.append(button);
    }
    if (!counts.length) values.textContent = countMode.value === "word" ? "Sin palabras." : "Sin valores.";
    values.scrollTop = scroll;
    valueTools.hidden = selectedValue === null;
    summary.textContent = `${collection.features.length.toLocaleString("es-ES")} entidades · ${info.keys.length.toLocaleString("es-ES")} keys · ${counts.length.toLocaleString("es-ES")} ${countMode.value === "word" ? "palabras" : "valores"}`;
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
    const baseStep = spread <= 1 ? 0.001 : spread <= 10 ? 0.01 : spread <= 100 ? 0.1 : 1;
    const decimals = (value) => {
      const [number, exponent] = String(value).toLowerCase().split("e");
      return Math.max(0, (number.split(".")[1]?.length || 0) - (Number(exponent) || 0));
    };
    const step = Math.min(baseStep, 10 ** -Math.min(15, Math.max(decimals(min), decimals(max))));
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
  const options = () => ({ selectedKey: key.value, onlySelectedKey: onlyKey.checked, selectedValue, countMode: countMode.value, selectedValueColor: valueSelectedColor.value, otherValueColor: valueOtherColor.value, hideOtherValues: valueHideOthers.checked, regexEnabled: regexEnable.checked, regexText: regexText.value, regexInsensitive: regexInsensitive.checked, regexOnly: regexOnly.checked, regexColors: colors, numericEnabled: numericEnable.checked, numericKey: numericKey.value, numericMin: numericMin.value, numericMax: numericMax.value, numericShowErrors: numericErrors.checked, errorColor: "#ef8491" });
  const emit = () => onChange?.(options());
  const emitFrame = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(emit);
  };
  const keyChanged = () => {
    selectedValue = null;
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
    selectedValue = null;
    valueSelectedColor.value = "#4abde1";
    valueOtherColor.value = "#708b7a";
    valueHideOthers.checked = false;
    countMode.value = "value";
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
  countMode.onchange = () => {
    selectedValue = null;
    renderValues();
    emit();
  };
  valueSelectedColor.oninput = emit;
  valueOtherColor.oninput = emit;
  valueHideOthers.onchange = emit;
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
    if (regexEnable.checked && selectedValue !== null) {
      selectedValue = null;
      renderValues();
    }
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
    selectedValue = null;
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
    selectedValue = null;
    valueTools.hidden = true;
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
  return { setData, clear, options };
};
