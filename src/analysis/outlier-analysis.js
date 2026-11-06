const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./outlier-analysis.css", import.meta.url).href;
document.head.append(stylesheet);
const format = new Intl.NumberFormat("es-ES");
const percent = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const quantile = (sorted, p) => {
  const index = (sorted.length - 1) * p;
  const left = Math.floor(index);
  const fraction = index - left;
  return sorted[left] + fraction * (sorted[Math.ceil(index)] - sorted[left]);
};
export const createOutlierAnalysis = ({ anchor, numericEnable, getCollection, getValue, onChange }) => {
  const root = document.createElement("section");
  root.className = "pod-outliers";
  const checkboxLabel = document.createElement("label");
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  checkboxLabel.append(enabled, " Detectar valores atípicos");
  const controls = document.createElement("div");
  controls.className = "pod-outliers-controls";
  const sensitivityLabel = document.createElement("label");
  sensitivityLabel.textContent = "Sensibilidad";
  const sensitivity = document.createElement("select");
  for (const [value, label] of [["1.5", "Normal (1,5 × IQR)"], ["3", "Estricto (3 × IQR)"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    sensitivity.append(option);
  }
  sensitivityLabel.append(sensitivity);
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Mostrar";
  const mode = document.createElement("select");
  for (const [value, label] of [["highlight", "Resaltar atípicos"], ["only", "Solo atípicos"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }
  modeLabel.append(mode);
  const status = document.createElement("div");
  status.className = "pod-outliers-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const hint = document.createElement("div");
  hint.className = "pod-outliers-hint";
  hint.textContent = "Los valores atípicos son candidatos a revisión, no errores OSM confirmados.";
  controls.append(sensitivityLabel, modeLabel, status, hint);
  root.append(checkboxLabel, controls);
  anchor.nextElementSibling.after(root);
  let collection = null;
  let key = "";
  let values = [];
  let q1 = NaN;
  let q3 = NaN;
  let min = NaN;
  let max = NaN;
  let count = 0;
  let total = 0;
  const calculate = () => {
    min = max = NaN;
    count = 0;
    total = values.length;
    if (total < 20) {
      status.textContent = `${format.format(total)} valores · Se necesitan al menos 20.`;
      return;
    }
    const iqr = q3 - q1;
    if (!(iqr > 0)) {
      status.textContent = "Sin dispersión suficiente para aplicar IQR.";
      return;
    }
    const factor = Number(sensitivity.value);
    min = q1 - factor * iqr;
    max = q3 + factor * iqr;
    if (!Number.isFinite(min) || !Number.isFinite(max)) { status.textContent = "Los valores no permiten calcular límites IQR."; return; }
    for (const value of values) if (value < min || value > max) count++;
    status.textContent = `${format.format(count)} de ${format.format(total)} valores atípicos (${percent.format(count * 100 / total)} %) · Fuera de ${percent.format(min)} – ${percent.format(max)}`;
  };
  const update = (notify = true) => {
    root.hidden = !numericEnable.checked || !anchor.value;
    controls.hidden = !enabled.checked;
    if (!root.hidden && enabled.checked) {
      const source = getCollection();
      if (source !== collection || anchor.value !== key) {
        collection = source;
        key = anchor.value;
        values = [];
        for (let i = 0; i < (collection?.features?.length || 0); i++) {
          const number = getValue(collection.features[i], key);
          if (Number.isFinite(number)) values.push(number);
        }
        const sorted = values.slice().sort((a, b) => a - b);
        q1 = sorted.length ? quantile(sorted, 0.25) : NaN;
        q3 = sorted.length ? quantile(sorted, 0.75) : NaN;
      }
      calculate();
      mode.disabled = !Number.isFinite(min) || !Number.isFinite(max);
      if (mode.disabled) mode.value = "highlight";
    }
    if (notify) onChange?.();
  };
  enabled.onchange = () => update();
  sensitivity.onchange = () => update();
  mode.onchange = () => onChange?.();
  const reset = () => {
    enabled.checked = false;
    sensitivity.value = "1.5";
    mode.value = "highlight";
    collection = null;
    key = "";
    values = [];
    min = max = NaN;
    count = total = 0;
    update(false);
  };
  reset();
  return { refresh: () => update(false), reset, options: () => ({ outlierMode: !root.hidden && enabled.checked && Number.isFinite(min) && Number.isFinite(max) ? mode.value : "", outlierMin: min, outlierMax: max }) };
};
