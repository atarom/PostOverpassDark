(() => {
  const programs = new Map();
  const wrap = (prototype) => {
    if (!prototype || typeof prototype.linkProgram !== "function") return;
    const original = prototype.linkProgram;
    try {
      Object.defineProperty(prototype, "linkProgram", { configurable: true, writable: true, value: function (program) {
        const result = original.call(this, program);
        let linked = false;
        let attributes = [];
        let error = "";
        try {
          linked = Boolean(this.getProgramParameter(program, this.LINK_STATUS));
          if (linked) {
            const total = this.getProgramParameter(program, this.ACTIVE_ATTRIBUTES) || 0;
            for (let i = 0; i < total; i++) {
              const attribute = this.getActiveAttrib(program, i);
              if (attribute) attributes.push({ name: attribute.name, location: this.getAttribLocation(program, attribute.name), size: attribute.size, type: attribute.type });
            }
          } else error = this.getProgramInfoLog(program) || "El controlador no ha proporcionado detalles.";
        } catch (exception) {
          error = String(exception.message || exception);
        }
        if (!programs.has(this)) programs.set(this, new Map());
        programs.get(this).set(program, { linked, attributes, error });
        return result;
      } });
    } catch (error) {
      console.warn("No se ha podido activar el diagnóstico de atributos WebGL", error);
    }
  };
  if (typeof WebGLRenderingContext !== "undefined") wrap(WebGLRenderingContext.prototype);
  if (typeof WebGL2RenderingContext !== "undefined") wrap(WebGL2RenderingContext.prototype);
  const init = () => {
    const config = document.getElementById("cfg");
    if (!config || document.getElementById("wgOpen")) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./webgl-diagnostics.css";
    document.head.append(stylesheet);
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = "wgOpen";
    trigger.className = "wg-entry";
    trigger.textContent = "Diagnóstico GPU / WebGL ↗";
    trigger.setAttribute("aria-haspopup", "dialog");
    config.append(trigger);
    const dialog = document.createElement("dialog");
    dialog.className = "wg-dialog";
    dialog.setAttribute("aria-labelledby", "wgTitle");
    dialog.innerHTML = `<div class="wg-head"><div><span class="wg-kicker">INFORMACIÓN TÉCNICA</span><h2 id="wgTitle">GPU y WebGL</h2></div><button id="wgClose" type="button" aria-label="Cerrar diagnóstico">×</button></div><div class="wg-content"><p class="wg-explain">Los atributos se cuentan por programa gráfico, no se suman entre programas. Los datos proceden del controlador WebGL de este navegador.</p><div id="wgOutput" role="status" aria-live="polite">Sin datos.</div></div><div class="wg-footer"><span id="wgActionMessage" aria-live="polite"></span><button id="wgRefresh" type="button">Actualizar</button><button id="wgCopy" type="button">Copiar informe</button></div><textarea id="wgFallback" class="wg-fallback" aria-label="Informe para copiar manualmente" readonly hidden></textarea>`;
    document.body.append(dialog);
    const output = dialog.querySelector("#wgOutput");
    const message = dialog.querySelector("#wgActionMessage");
    const fallback = dialog.querySelector("#wgFallback");
    let report = "";
    const entry = (container, tag, className, value) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (value !== undefined) element.textContent = String(value);
      container.append(element);
      return element;
    };
    const safeParameter = (gl, parameter) => {
      try { return gl.getParameter(parameter); } catch { return null; }
    };
    const slots = (gl, attribute) => {
      const columns = attribute.type === gl.FLOAT_MAT2 || attribute.type === gl.FLOAT_MAT2x3 || attribute.type === gl.FLOAT_MAT2x4 ? 2 : attribute.type === gl.FLOAT_MAT3 || attribute.type === gl.FLOAT_MAT3x2 || attribute.type === gl.FLOAT_MAT3x4 ? 3 : attribute.type === gl.FLOAT_MAT4 || attribute.type === gl.FLOAT_MAT4x2 || attribute.type === gl.FLOAT_MAT4x3 ? 4 : 1;
      return columns * Math.max(1, attribute.size);
    };
    const friendlyName = (value) => {
      const names = { podKeep: "Filtro de etiquetas", podValue: "Valor numérico / IQR", podGeomValue: "Análisis geométrico", podColor: "Color RGB", podR: "Canal rojo", podG: "Canal verde", podB: "Canal azul" };
      for (const [name, description] of Object.entries(names)) if (new RegExp(`(?:^|_)${name}(?:$|\\[)`).test(value)) return description;
      return "Atributo interno o geométrico";
    };
    const programName = (attributes) => {
      const names = new Set(attributes.map((attribute) => attribute.name.replace(/\[\d+\]$/, "")));
      if (names.has("a_segmentStart") && names.has("a_segmentEnd")) return "Líneas";
      if (names.has("a_position") && names.has("a_localPosition") && names.has("a_hitColor")) return "Polígonos";
      if (names.has("a_position") && names.has("a_hitColor") && !names.has("a_localPosition")) return "Puntos";
      if (names.has("a_position") && names.size === 1) return "Composición de imagen";
      if (names.has("a_weight") || names.has("a_prop_weight")) return "Mapa de calor";
      return "Programa WebGL no identificado";
    };
    const field = (container, name, value) => {
      const item = entry(container, "div", "wg-field");
      entry(item, "dt", "", name);
      entry(item, "dd", "", value === null || value === undefined || value === "" ? "No disponible" : value);
    };
    const inspect = () => {
      output.replaceChildren();
      fallback.hidden = true;
      message.textContent = "";
      const mapNode = document.getElementById("map");
      const found = [...programs.entries()].filter(([gl]) => mapNode?.contains(gl.canvas));
      const contexts = found.length ? found : [...programs.entries()];
      const lines = ["PostOverpassDark · Diagnóstico WebGL", `Fecha: ${new Date().toLocaleString("es-ES")}`, `Contextos registrados: ${contexts.length}`];
      if (!contexts.length) {
        entry(output, "p", "wg-empty", "Aún no se han registrado programas WebGL. Ejecuta una consulta con elementos y pulsa Actualizar.");
        entry(output, "p", "wg-hint", "El diagnóstico no crea contextos gráficos nuevos ni consume atributos adicionales.");
        report = lines.join("\n");
        return;
      }
      contexts.forEach(([gl, items], index) => {
        const title = `Contexto ${index + 1}`;
        const group = entry(output, "section", "wg-group");
        entry(group, "h3", "wg-group-title", title);
        const lost = Boolean(gl.isContextLost?.());
        const limit = lost ? null : safeParameter(gl, gl.MAX_VERTEX_ATTRIBS);
        const rendererExtension = lost ? null : gl.getExtension("WEBGL_debug_renderer_info");
        const info = entry(group, "dl", "wg-info");
        const version = lost ? "Contexto perdido" : safeParameter(gl, gl.VERSION);
        const vendor = lost ? null : safeParameter(gl, rendererExtension?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR);
        const renderer = lost ? null : safeParameter(gl, rendererExtension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
        const height = gl.canvas?.height || 0;
        const width = gl.canvas?.width || 0;
        field(info, "API", version);
        field(info, "GPU / controlador", renderer);
        field(info, "Fabricante", vendor);
        field(info, "Lienzo", width && height ? `${width} × ${height} píxeles` : "No disponible");
        field(info, "Máximo de atributos", limit);
        field(info, "Tamaño máximo de textura", lost ? null : safeParameter(gl, gl.MAX_TEXTURE_SIZE));
        field(info, "Unidades de textura (fragmento)", lost ? null : safeParameter(gl, gl.MAX_TEXTURE_IMAGE_UNITS));
        const linked = [...items.values()].filter((item) => item.linked);
        const failed = [...items.values()].filter((item) => !item.linked);
        const usages = linked.map((item) => item.attributes.reduce((sum, attribute) => sum + slots(gl, attribute), 0));
        const peak = usages.length ? Math.max(...usages) : null;
        const margin = peak === null || limit === null ? null : limit - peak;
        const bar = entry(group, "div", "wg-usage");
        entry(bar, "strong", "", peak === null || limit === null ? "Atributos: sin programas activos" : `${peak} / ${limit} ranuras ocupadas (máximo observado)`);
        entry(bar, "span", "", margin === null ? "Margen no disponible" : `${margin} libres`);
        if (peak !== null && limit > 0) {
          const track = entry(group, "div", "wg-track");
          const fill = entry(track, "div", "wg-fill");
          fill.style.width = `${Math.min(100, 100 * peak / limit)}%`;
          if (margin <= 2) track.classList.add("wg-tight");
        }
        field(info, "Programas enlazados", linked.length);
        field(info, "Enlaces fallidos", failed.length);
        lines.push(`${title}: ${version || "No disponible"}`, `GPU: ${renderer || "No disponible"}`, `Límite: ${limit ?? "No disponible"}`, `Máximo usado: ${peak ?? "No disponible"}`, `Margen: ${margin ?? "No disponible"}`);
        const list = entry(group, "div", "wg-programs");
        const nameCounts = new Map();
        linked.forEach((item, position) => {
          const used = usages[position];
          const kind = programName(item.attributes);
          const count = (nameCounts.get(kind) || 0) + 1;
          nameCounts.set(kind, count);
          const name = count === 1 ? kind : `${kind} (${count})`;
          const detail = entry(list, "details", "wg-program");
          const summary = entry(detail, "summary", "wg-program-head");
          entry(summary, "span", "", name);
          entry(summary, "span", "wg-program-count", `${used} / ${limit ?? "?"} atributos · ${item.attributes.length} variables`);
          const table = entry(detail, "table", "wg-table");
          const head = entry(table, "thead");
          const heading = entry(head, "tr");
          ["Atributo activo", "Uso", "Ranuras", "Posición"].forEach((name) => entry(heading, "th", "", name));
          const body = entry(table, "tbody");
          lines.push(`${name}: ${used}/${limit ?? "?"} ranuras`);
          [...item.attributes].sort((a, b) => a.location - b.location).forEach((attribute) => {
            const row = entry(body, "tr");
            entry(row, "td", "wg-mono", attribute.name);
            entry(row, "td", "", friendlyName(attribute.name));
            entry(row, "td", "", slots(gl, attribute));
            entry(row, "td", "", attribute.location);
            lines.push(`  ${attribute.name}: posición ${attribute.location}, ${slots(gl, attribute)} ranuras`);
          });
        });
        failed.forEach((item, position) => {
          const failure = entry(list, "details", "wg-program wg-error");
          entry(failure, "summary", "", `Programa sin enlazar ${position + 1}`);
          entry(failure, "pre", "wg-error-text", item.error);
          lines.push(`Error de enlace ${position + 1}: ${item.error}`);
        });
        if (!linked.length && !failed.length) entry(group, "p", "wg-empty", "Este contexto todavía no tiene programas registrados.");
      });
      entry(output, "p", "wg-hint", "Los nombres se deducen de los atributos activos; si no permiten identificar un programa, se indica. El contador muestra las ranuras utilizadas por programa, no memoria VRAM ni uso total de GPU.");
      report = lines.join("\n");
    };
    trigger.addEventListener("click", () => {
      document.getElementById("cfg").hidden = true;
      document.getElementById("cfgToggle")?.setAttribute("aria-expanded", "false");
      dialog.showModal();
      inspect();
    });
    dialog.querySelector("#wgClose").addEventListener("click", () => dialog.close());
    dialog.querySelector("#wgRefresh").addEventListener("click", inspect);
    dialog.addEventListener("close", () => document.getElementById("cfgToggle")?.focus());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelector("#wgCopy").addEventListener("click", async () => {
      try {
        if (!navigator.clipboard?.writeText) throw Error("Portapapeles no disponible");
        await navigator.clipboard.writeText(report);
        message.textContent = "Informe copiado";
      } catch {
        fallback.value = report;
        fallback.hidden = false;
        fallback.focus();
        fallback.select();
        message.textContent = "Selecciona y copia el informe manualmente";
      }
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
