const OVERSCAN = 6;
export const createVirtualValues = ({ root, onSelect }) => {
  let rows = [];
  let selected = null;
  let heights = [];
  let tree = [];
  let first = -1;
  let last = -1;
  let frame = 0;
  let contentWidth = 0;
  let rowHeight = matchMedia("(pointer: coarse)").matches ? 44 : 36;
  const upper = document.createElement("div");
  const lower = document.createElement("div");
  upper.className = lower.className = "analysis-value-spacer";
  upper.setAttribute("aria-hidden", "true");
  lower.setAttribute("aria-hidden", "true");
  const sum = (end) => {
    let total = 0;
    for (let i = end; i > 0; i -= i & -i) total += tree[i];
    return total;
  };
  const update = (index, amount) => {
    for (let i = index + 1; i < tree.length; i += i & -i) tree[i] += amount;
  };
  const indexAt = (position) => {
    let index = 0;
    let total = 0;
    let bit = 1;
    while (bit < tree.length) bit <<= 1;
    for (bit >>= 1; bit; bit >>= 1) {
      const next = index + bit;
      if (next < tree.length && total + tree[next] <= position) { index = next; total += tree[next]; }
    }
    return Math.min(rows.length - 1, index);
  };
  const makeButton = (index) => {
    const [value, count] = rows[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "analysis-value";
    button.dataset.index = String(index);
    button.setAttribute("aria-pressed", String(value === selected));
    button.title = value === selected ? "Quitar selección" : `Seleccionar ${value || "(vacío)"}`;
    const amount = document.createElement("span");
    amount.className = "analysis-value-count";
    amount.textContent = count.toLocaleString("es-ES");
    const label = document.createElement("span");
    label.className = "analysis-value-text";
    label.textContent = value || "(vacío)";
    button.append(amount, label);
    return button;
  };
  const measured = new ResizeObserver((entries) => {
    let changed = false;
    let adjustment = 0;
    for (const entry of entries) {
      const index = Number(entry.target.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index >= rows.length) continue;
      const size = entry.target.getBoundingClientRect().height;
      if (size <= 0 || Math.abs(size - heights[index]) < 0.5) continue;
      const diff = size - heights[index];
      heights[index] = size;
      update(index, diff);
      if (index < first) adjustment += diff;
      changed = true;
    }
    if (adjustment) root.scrollTop += adjustment;
    if (changed) schedule();
  });
  const render = (focus = -1) => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!rows.length) return;
    const top = Math.max(0, root.scrollTop - root.clientTop - 8);
    const height = Math.max(root.clientHeight, rowHeight * 8);
    let start = Math.max(0, indexAt(top) - OVERSCAN);
    let end = Math.min(rows.length, indexAt(top + height) + OVERSCAN + 1);
    if (focus >= 0) {
      start = Math.min(start, focus);
      end = Math.max(end, focus + 1);
      if (end - start > 80) { start = Math.max(0, focus - 10); end = Math.min(rows.length, focus + 12); }
    }
    if (start !== first || end !== last) {
      const existing = new Map([...root.querySelectorAll(".analysis-value")].map((button) => [Number(button.dataset.index), button]));
      const active = root.contains(document.activeElement) ? Number(document.activeElement.dataset.index) : -1;
      if (root.firstElementChild !== upper) root.replaceChildren(upper, lower);
      for (const [index, button] of existing) if (index < start || index >= end) { measured.unobserve(button); button.remove(); }
      let reference = lower;
      for (let i = end - 1; i >= start; i--) {
        const button = existing.get(i) || makeButton(i);
        if (button.nextSibling !== reference) root.insertBefore(button, reference);
        if (!existing.has(i)) measured.observe(button);
        reference = button;
      }
      first = start;
      last = end;
      if (active >= 0 && (active < start || active >= end)) root.querySelector(`.analysis-value[data-index="${Math.max(start, Math.min(end - 1, active))}"]`)?.focus({ preventScroll: true });
    }
    upper.style.height = `${sum(start)}px`;
    lower.style.height = `${sum(rows.length) - sum(end)}px`;
    if (focus >= 0) {
      const button = root.querySelector(`.analysis-value[data-index="${focus}"]`);
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: "nearest" });
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => render()); };
  const resetHeights = () => {
    rowHeight = matchMedia("(pointer: coarse)").matches ? 44 : 36;
    heights = new Array(rows.length).fill(rowHeight);
    tree = new Array(rows.length + 1).fill(0);
    for (let i = 0; i < rows.length; i++) update(i, rowHeight);
    first = -1;
    last = -1;
  };
  root.addEventListener("scroll", schedule, { passive: true });
  root.addEventListener("click", (event) => {
    const button = event.target.closest(".analysis-value");
    if (!button || !root.contains(button)) return;
    const value = rows[Number(button.dataset.index)]?.[0];
    if (value === undefined) return;
    selected = selected === value ? null : value;
    onSelect(selected);
    updateSelection(selected);
  });
  root.addEventListener("keydown", (event) => {
    const button = event.target.closest(".analysis-value");
    if (!button) return;
    const index = Number(button.dataset.index);
    const change = { ArrowDown: 1, ArrowUp: -1, Home: -index, End: rows.length - index - 1 }[event.key];
    const tab = event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (change === undefined && !tab) return;
    const step = tab ? event.shiftKey ? -1 : 1 : change;
    const next = index + step;
    if (next < 0 || next >= rows.length) return;
    if (tab && next >= first && next < last) return;
    event.preventDefault();
    render(next);
  });
  const resize = new ResizeObserver(() => {
    const width = root.clientWidth;
    if (!rows.length || width === contentWidth) return;
    contentWidth = width;
    resetHeights();
    schedule();
  });
  resize.observe(root);
  const updateSelection = (next) => {
    selected = next;
    for (const button of root.querySelectorAll(".analysis-value")) {
      const value = rows[Number(button.dataset.index)]?.[0];
      const active = selected !== null && value === selected;
      button.setAttribute("aria-pressed", String(active));
      button.title = active ? "Quitar selección" : `Seleccionar ${value || "(vacío)"}`;
    }
  };
  const setData = (next, chosen, emptyText) => {
    const scroll = root.scrollTop;
    measured.disconnect();
    rows = next;
    selected = chosen;
    cancelAnimationFrame(frame);
    frame = 0;
    resetHeights();
    root.replaceChildren();
    if (!rows.length) { root.textContent = emptyText; root.scrollTop = 0; return; }
    render();
    root.scrollTop = scroll;
    schedule();
  };
  return { setData, updateSelection };
};
