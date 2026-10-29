import { createNumericHistogram } from "./numeric-histogram.js";
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
export const numericValue = (value) => {
  const text = textValue(value).replace(",", ".");
  if (!text) return NaN;
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
};
const own = (value, key) => Boolean(key) && Object.prototype.hasOwnProperty.call(value, key);
const tagValueParts = (value, mode = "value") => {
  const raw = textValue(value);
  return mode === "word" ? raw.normalize("NFC").toLocaleLowerCase("es").normalize("NFC").match(/\p{L}[\p{L}\p{M}\p{N}]*/gu) || [] : mode === "semicolon" ? raw.split(";").map((item) => item.trim()).filter(Boolean) : [raw];
};
export const matchesTagValue = (tags, key, selectedValue, mode = "value") => own(tags, key) && tagValueParts(tags[key], mode).includes(selectedValue);
const analyzeCollection = (collection) => {
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
const splitRegexPatterns = (raw) => String(raw).split(/\r\n?|\n/).map((value) => value.trim()).filter(Boolean);
export const compilePatterns = (raw, insensitive) => splitRegexPatterns(raw).flatMap((source) => {
  try {
    return [{ source, regex: new RegExp(source, insensitive ? "i" : "") }];
  } catch {
    return [];
  }
});
export const createAnalysis = ({ elements, onChange }) => {
  const { key, onlyKey, countMode, values, valueTools, valueSelectedColor, valueOtherColor, valueHideOthers, summary, numericEnable, numericKey, numericErrors, numericMin, numericMax, numericMinValue, numericMaxValue, regexEnable, regexText: regexInput, regexInsensitive, regexOnly, regexColors, reset } = elements;
  const regexText = regexInput;
  const regexHead = document.createElement("div");
  regexHead.className = "pod-regex-head";
  regexHead.innerHTML = "<span>Expresión regular</span><span>Color</span>";
  regexColors.before(regexHead);
  const regexAdd = document.createElement("button");
  regexAdd.type = "button";
  regexAdd.className = "pod-regex-add";
  regexAdd.textContent = "+ Añadir regex";
  regexColors.after(regexAdd);
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
    const color = colors[source] || PALETTE.find((item) => !used.has(item)) || PALETTE[used.size % PALETTE.length];
    if (source) colors[source] = color;
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
  const updateRegexCounts = () => {
    const seen = new Set();
    for (const row of regexColors.children) {
      const input = row.querySelector(".pod-regex-input");
      const label = row.querySelector(".pod-regex-count");
      const source = input.value.trim();
      let error = "";
      let count = 0;
      if (source) {
        try {
          const regex = new RegExp(source, regexInsensitive.checked ? "i" : "");
          count = regexCount({ regex });
          if (seen.has(source)) error = "Regex duplicada";
          seen.add(source);
        } catch { error = "Expresión no válida"; }
      }
      input.setAttribute("aria-invalid", String(Boolean(error)));
      label.classList.toggle("is-error", Boolean(error));
      label.textContent = error || (source ? `${count.toLocaleString("es-ES")} coincidencia${count === 1 ? "" : "s"}` : "Escribe una regex");
    }
  };
  const syncRegexRules = () => {
    const next = {};
    const sources = [];
    for (const row of regexColors.children) {
      const source = row.querySelector(".pod-regex-input").value.trim();
      if (!source) continue;
      sources.push(source);
      if (!Object.hasOwn(next, source)) next[source] = row.querySelector("input[type=color]").value;
    }
    colors = next;
    regexText.value = sources.join("\n");
  };
  const addRegexRule = (source = "", used = new Set(Object.values(colors)), before = null) => {
    const row = document.createElement("div");
    row.className = "pod-regex-rule";
    const main = document.createElement("div");
    main.className = "pod-regex-main";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "pod-regex-input";
    input.value = source;
    input.placeholder = "^Carrer.*";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Expresión regular");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "pod-regex-delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Eliminar expresión regular");
    const count = document.createElement("span");
    count.className = "pod-regex-count";
    main.append(input, remove, count);
    const picker = document.createElement("label");
    picker.className = "pod-regex-picker";
    const color = document.createElement("input");
    color.type = "color";
    color.value = colorFor(source, used);
    color.setAttribute("aria-label", "Color de la expresión regular");
    picker.append(color);
    row.append(main, picker);
    regexColors.insertBefore(row, before);
    input.oninput = () => { syncRegexRules(); delayedRegex(); };
    input.onpaste = (event) => {
      const pasted = event.clipboardData?.getData("text/plain") || "";
      if (!/[\r\n]/.test(pasted)) return;
      event.preventDefault();
      const lines = splitRegexPatterns(pasted);
      if (!lines.length) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.value = input.value.slice(0, start) + lines[0] + input.value.slice(end);
      const sibling = row.nextElementSibling;
      for (const line of lines.slice(1)) {
        const used = new Set([...regexColors.querySelectorAll("input[type=color]")].map((item) => item.value));
        addRegexRule(line, used, sibling);
      }
      syncRegexRules();
      updateRegexCounts();
      emit();
    };
    input.onkeydown = (event) => {
      if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      const added = addRegexRule("", new Set([...regexColors.querySelectorAll("input[type=color]")].map((item) => item.value)), row.nextElementSibling);
      updateRegexCounts();
      added.focus();
    };
    remove.onclick = () => {
      const focus = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      if (!regexColors.children.length) addRegexRule();
      syncRegexRules();
      updateRegexCounts();
      emit();
      (focus || regexColors.firstElementChild)?.querySelector(".pod-regex-input").focus();
    };
    color.oninput = () => {
      const source = input.value.trim();
      for (const other of regexColors.children) if (other !== row && other.querySelector(".pod-regex-input").value.trim() === source) other.querySelector("input[type=color]").value = color.value;
      syncRegexRules();
      emit();
    };
    return input;
  };
  const renderRegex = () => {
    const sources = splitRegexPatterns(regexText.value);
    const used = new Set(Object.values(colors));
    regexColors.replaceChildren();
    for (const source of sources.length ? sources : [""]) addRegexRule(source, used);
    updateRegexCounts();
  };
  const histogram = createNumericHistogram({ anchor: numericKey, minInput: numericMin, maxInput: numericMax, getCollection: () => collection, getValue: (feature, name) => numericValue(featureTags(feature)[name]), onRange: () => { numericMinValue.value = numericMin.value; numericMaxValue.value = numericMax.value; emitFrame(); } });
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
    histogram.refresh();
    emit();
  };
  const delayedRegex = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      updateRegexCounts();
      emit();
    }, 250);
  };
  const resetControls = () => {
    clearTimeout(timer);
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
    histogram.refresh();
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
    histogram.refresh();
    emit();
  };
  numericKey.onchange = numericChanged;
  numericErrors.onchange = emit;
  numericMin.oninput = () => {
    if (+numericMin.value > +numericMax.value) numericMax.value = numericMin.value;
    numericMinValue.value = numericMin.value;
    numericMaxValue.value = numericMax.value;
    histogram.redraw();
    emitFrame();
  };
  numericMax.oninput = () => {
    if (+numericMax.value < +numericMin.value) numericMin.value = numericMax.value;
    numericMinValue.value = numericMin.value;
    numericMaxValue.value = numericMax.value;
    histogram.redraw();
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
  regexAdd.onclick = () => {
    const used = new Set([...regexColors.querySelectorAll("input[type=color]")].map((item) => item.value));
    addRegexRule("", used).focus();
    updateRegexCounts();
  };
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
    histogram.refresh();
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
    renderRegex();
    numericEnable.checked = false;
    regexEnable.checked = false;
    numericMin.disabled = true;
    numericMax.disabled = true;
    histogram.clear();
  };
  clear();
  return { setData, clear, options };
};
