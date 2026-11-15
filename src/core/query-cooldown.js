export const createQueryCooldown = ({ editor, endpoint, map, ol, button, isBusy }) => {
  const duration = 60000;
  let previous = "";
  let expires = 0;
  let timer = 0;
  const bounds = () => {
    const extent = map.getView().calculateExtent(map.getSize() || [1024, 768]);
    const southwest = ol.proj.toLonLat([extent[0], extent[1]]);
    const northeast = ol.proj.toLonLat([extent[2], extent[3]]);
    return [...southwest, ...northeast].map((value) => Number(value.toFixed(7)));
  };
  const signature = (query = editor.getQuery(), server = endpoint.value) => JSON.stringify([query, server, ...bounds()]);
  const locked = () => Date.now() < expires && previous === signature();
  const sync = () => {
    clearTimeout(timer);
    const remaining = locked() ? expires - Date.now() : 0;
    const cooling = remaining > 0;
    button.disabled = isBusy() || cooling;
    button.classList.toggle("pod-run-cooldown", cooling);
    if (cooling) {
      button.style.setProperty("--pod-cooldown-progress", String(remaining / duration));
      button.title = `Repetir en ${Math.ceil(remaining / 1000)} s`;
      button.setAttribute("aria-label", button.title);
      timer = setTimeout(sync, Math.min(1000, remaining));
    } else {
      button.style.removeProperty("--pod-cooldown-progress");
      button.title = "Ejecutar";
      button.setAttribute("aria-label", "Ejecutar");
    }
  };
  const start = (query, server) => {
    previous = signature(query, server);
    expires = Date.now() + duration;
    sync();
  };
  const rebaseAfterFit = (query, server, eligible) => {
    if (!eligible || !map.getView().getAnimating()) return;
    const target = map.getTargetElement();
    let interacted = false;
    let finished = false;
    const mark = () => { interacted = true; };
    target.addEventListener("pointerdown", mark);
    target.addEventListener("wheel", mark);
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      map.un("moveend", finish);
      target.removeEventListener("pointerdown", mark);
      target.removeEventListener("wheel", mark);
      if (!interacted && Date.now() < expires && editor.getQuery() === query && endpoint.value === server) {
        previous = signature(query, server);
        sync();
      }
    };
    map.once("moveend", finish);
    const fallback = setTimeout(finish, 500);
  };
  map.on("moveend", sync);
  map.on("change:size", sync);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../ui/query-cooldown.css", import.meta.url).href;
  document.head.append(link);
  return { sync, locked, start, rebaseAfterFit };
};
