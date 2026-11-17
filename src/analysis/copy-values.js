const displayValue = (value) => String(value || "(vacío)").replace(/[\r\n]+/g, " ");
const markdownCell = (value) => displayValue(value).replace(/\|/g, "\\|");
export const createValueCopier = ({ label, getContext }) => {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("./copy-values.css", import.meta.url).href;
  document.head.append(css);
  const header = document.createElement("div");
  header.className = "analysis-values-heading";
  label.replaceWith(header);
  const actions = document.createElement("div");
  actions.className = "analysis-values-actions";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copiar";
  copy.title = "Copiar todos los valores con sus recuentos";
  copy.disabled = true;
  const format = document.createElement("select");
  format.setAttribute("aria-label", "Formato para copiar valores");
  for (const [value, text] of [["list", "Lista"], ["markdown", "Tabla MD"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    format.append(option);
  }
  actions.append(copy, format);
  header.append(label, actions);
  let rows = [];
  let timer;
  const resetFeedback = () => {
    clearTimeout(timer);
    copy.textContent = "Copiar";
    copy.removeAttribute("data-state");
  };
  const setRows = (next) => {
    rows = next;
    copy.disabled = !rows.length;
    resetFeedback();
  };
  format.addEventListener("change", resetFeedback);
  copy.addEventListener("click", async () => {
    if (!rows.length) return;
    const { key, total, mode } = getContext();
    const kind = mode === "word" ? "palabras únicas" : "valores únicos";
    const title = `${key} (${total.toLocaleString("es-ES")} elementos, ${rows.length.toLocaleString("es-ES")} ${kind})`;
    const content = format.value === "markdown"
      ? `${title}\n\n| ${markdownCell(key)} | Cantidad |\n| --- | ---: |\n${rows.map(([value, count]) => `| ${markdownCell(value)} | ${count.toLocaleString("es-ES")} |`).join("\n")}`
      : `${title}\n${rows.map(([value, count]) => `- (${count.toLocaleString("es-ES")}) ${displayValue(value)}`).join("\n")}`;
    resetFeedback();
    try {
      await navigator.clipboard.writeText(content);
      copy.textContent = "Copiado";
      copy.dataset.state = "success";
    } catch {
      copy.textContent = "Error";
      copy.dataset.state = "error";
    }
    timer = setTimeout(resetFeedback, 1800);
  });
  return { setRows };
};
