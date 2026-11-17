const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./purge-controls.css", import.meta.url).href;
document.head.append(stylesheet);
export const purgeIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.2"/><path d="m9 9 6 6m0-6-6 6"/></svg>';
export const createKeyPurge = ({ select, onPurge }) => {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "analysisKeyTrigger";
  trigger.className = "pod-key-trigger";
  trigger.setAttribute("aria-label", "Key analizada");
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  const current = document.createElement("span");
  current.className = "pod-key-current";
  const arrow = document.createElement("span");
  arrow.className = "pod-key-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "▾";
  trigger.append(current, arrow);
  const menu = document.createElement("div");
  menu.id = "analysisKeyMenu";
  menu.className = "pod-key-menu";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Listado de keys y purga");
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menu.id);
  select.classList.add("pod-key-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.previousElementSibling?.setAttribute("for", trigger.id);
  select.after(trigger);
  document.body.append(menu);
  let rows = [];
  let first = -1;
  let last = -1;
  const height = matchMedia("(pointer: coarse)").matches ? 44 : 38;
  const sync = () => {
    current.textContent = select.selectedOptions[0]?.textContent || "Sin keys";
    current.title = current.textContent;
    trigger.disabled = !select.options.length;
    if (!menu.hidden) close();
  };
  const close = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    rows = [];
    first = -1;
    last = -1;
  };
  const render = () => {
    if (menu.hidden) return;
    const begin = Math.max(0, Math.floor(menu.scrollTop / height) - 5);
    const end = Math.min(rows.length, Math.ceil((menu.scrollTop + menu.clientHeight) / height) + 5);
    if (begin === first && end === last) return;
    first = begin;
    last = end;
    const upper = document.createElement("div");
    upper.className = "pod-key-spacer";
    upper.style.height = `${begin * height}px`;
    const lower = document.createElement("div");
    lower.className = "pod-key-spacer";
    lower.style.height = `${(rows.length - end) * height}px`;
    const elements = [upper];
    for (let i = begin; i < end; i++) {
      const [name, label] = rows[i];
      const row = document.createElement("div");
      row.className = "pod-key-row";
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "pod-key-choice";
      choose.dataset.index = String(i);
      choose.setAttribute("aria-current", String(name === select.value));
      choose.textContent = label;
      choose.title = label;
      const purge = document.createElement("button");
      purge.type = "button";
      purge.className = "pod-purge-action";
      purge.dataset.index = String(i);
      purge.title = `Purgar los objetos con la key ${name}`;
      purge.setAttribute("aria-label", purge.title);
      purge.innerHTML = purgeIcon;
      row.append(choose, purge);
      elements.push(row);
    }
    elements.push(lower);
    menu.replaceChildren(...elements);
  };
  const focusRow = (index, purge = false) => {
    if (index < 0 || index >= rows.length) return;
    if (index < first || index >= last) {
      menu.scrollTop = Math.max(0, index * height - Math.floor(menu.clientHeight / height / 2) * height);
      first = -1;
      render();
    }
    menu.querySelector(`${purge ? ".pod-purge-action" : ".pod-key-choice"}[data-index="${index}"]`)?.focus({ preventScroll: true });
  };
  const open = () => {
    rows = [...select.options].map((option) => [option.value, option.textContent]);
    if (!rows.length) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const space = Math.max(44, Math.min(360, Math.max(below, above)));
    menu.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
    menu.style.height = `${space}px`;
    menu.style.top = `${below >= space || below >= above ? rect.bottom + 3 : rect.top - space - 3}px`;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    first = -1;
    last = -1;
    const selected = Math.max(0, rows.findIndex(([name]) => name === select.value));
    menu.scrollTop = Math.max(0, selected * height - Math.floor(space / height / 2) * height);
    render();
    focusRow(selected);
  };
  trigger.addEventListener("click", () => menu.hidden ? open() : close());
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (menu.hidden) open();
  });
  menu.addEventListener("scroll", render, { passive: true });
  menu.addEventListener("click", (event) => {
    const button = event.target.closest(".pod-key-choice, .pod-purge-action");
    if (!button || !menu.contains(button)) return;
    const item = rows[Number(button.dataset.index)];
    if (!item) return;
    close();
    if (button.classList.contains("pod-purge-action")) onPurge(item[0]);
    else {
      select.value = item[0];
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    trigger.focus();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); return; }
    const button = event.target.closest(".pod-key-choice, .pod-purge-action");
    if (!button || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = Number(button.dataset.index);
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    focusRow(next, button.classList.contains("pod-purge-action"));
  });
  document.addEventListener("pointerdown", (event) => { if (!menu.hidden && !menu.contains(event.target) && event.target !== trigger && !trigger.contains(event.target)) close(); });
  document.addEventListener("scroll", (event) => { if (!menu.hidden && event.target !== menu && !menu.contains(event.target)) close(); }, true);
  window.addEventListener("resize", close);
  select.addEventListener("change", sync);
  new MutationObserver(sync).observe(select, { childList: true });
  sync();
};
