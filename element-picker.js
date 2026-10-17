// Element picker: click any element on the page to make its background transparent, blur it, or remove it (like uBlock Origin's element zapper).
(function () {
  if (window.__zenElementPickerLoaded) return;
  window.__zenElementPickerLoaded = true;

  const STORAGE_KEY = "transparentElements";
  const STYLE_ID = "zen-transparent-elements-style";
  const OVERLAY_ID = "zen-element-picker-overlay";
  const HOST = window.location.hostname;

  let active = false;
  let hovered = null;
  let overlay = null;

  function cssPath(el) {
    if (el.id && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) {
      return "#" + CSS.escape(el.id);
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node.id && document.querySelectorAll("#" + CSS.escape(node.id)).length === 1) {
        parts.unshift("#" + CSS.escape(node.id));
        break;
      }
      let part = node.localName;
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.localName === node.localName);
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  // Entries may be legacy strings or {selector, color, alpha}
  function normalize(e) {
    return typeof e === "string" ? { selector: e, color: "#000000", alpha: 0 } : e;
  }

  function hexToRgba(hex, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex) || [null, "000000"];
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  async function getSelectors() {
    const data = await browser.storage.local.get(STORAGE_KEY);
    return (data[STORAGE_KEY] && data[STORAGE_KEY][HOST]) || [];
  }

  function renderStyle(selectors) {
    let style = document.getElementById(STYLE_ID);
    if (!selectors.length) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = selectors
      .map(normalize)
      .map((e) => {
        if (e.mode === "remove") return `${e.selector} { display: none !important; }`;
        if (e.mode === "blur") return `${e.selector} { background-color: transparent !important; background-image: none !important; backdrop-filter: blur(${Number(e.blur) || 0}px) !important; -webkit-backdrop-filter: blur(${Number(e.blur) || 0}px) !important; }`;
        const bg = e.alpha > 0 ? hexToRgba(e.color, e.alpha) : "transparent";
        return `${e.selector} { background: ${bg} !important; background-image: none !important; box-shadow: none !important; }\n${e.selector} * { background: transparent !important; background-image: none !important; box-shadow: none !important; }`;
      })
      .join("\n");
  }

  async function saveSelector(entry) {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const all = data[STORAGE_KEY] || {};
    const list = (all[HOST] || []).filter((e) => normalize(e).selector !== entry.selector);
    list.push(entry);
    all[HOST] = list;
    await browser.storage.local.set({ [STORAGE_KEY]: all });
    renderStyle(list);
  }

  function showTintPanel(selector, el) {
    const panel = document.createElement("div");
    panel.id = "zen-tint-panel";
    panel.style.cssText =
      "position:fixed;top:16px;right:16px;z-index:2147483647;background:#222;color:#fff;font:13px sans-serif;" +
      "padding:12px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px;width:200px;";
    const label = document.createElement("div");
    label.textContent = "Element action";
    const mode = document.createElement("select");
    [["tint", "Tint / transparent"], ["blur", "Blur"], ["remove", "Remove"]].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      mode.appendChild(o);
    });
    const color = document.createElement("input");
    color.type = "color";
    color.value = "#000000";
    const range = document.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.value = "0";
    const hint = document.createElement("div");
    hint.textContent = "0% = fully transparent";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;";
    const ok = document.createElement("button");
    ok.textContent = "Apply";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    row.append(ok, cancel);
    panel.append(label, mode, color, range, hint, row);
    document.documentElement.appendChild(panel);

    const current = () =>
      mode.value === "remove"
        ? { selector, mode: "remove" }
        : mode.value === "blur"
          ? { selector, mode: "blur", blur: Number(range.value) * 0.3 }
          : { selector, mode: "tint", color: color.value, alpha: Number(range.value) / 100 };
    const preview = () => {
      color.style.display = mode.value === "tint" ? "" : "none";
      range.style.display = mode.value === "remove" ? "none" : "";
      hint.style.display = mode.value === "remove" ? "none" : "";
      hint.textContent =
        mode.value === "blur" ? (Number(range.value) * 0.3).toFixed(1) + "px blur" : range.value + "% tint";
      renderStyle([current()]);
    };
    mode.addEventListener("change", preview);
    color.addEventListener("input", preview);
    range.addEventListener("input", preview);
    ok.addEventListener("click", () => {
      panel.remove();
      saveSelector(current());
    });
    cancel.addEventListener("click", async () => {
      panel.remove();
      renderStyle(await getSelectors());
    });
    preview();
  }

  async function reset() {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const all = data[STORAGE_KEY] || {};
    delete all[HOST];
    await browser.storage.local.set({ [STORAGE_KEY]: all });
    renderStyle([]);
  }

  function updateOverlay(el) {
    if (!overlay) return;
    if (!el) {
      overlay.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    overlay.style.cssText =
      `position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #ff4d4d;background:rgba(255,77,77,0.2);` +
      `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;display:block;`;
  }

  function onMove(e) {
    hovered = e.target === overlay ? null : e.target;
    updateOverlay(hovered);
  }

  function block(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function onClick(e) {
    block(e);
    const el = e.target;
    stop();
    if (el && el.nodeType === 1 && el !== document.documentElement) {
      showTintPanel(cssPath(el), el);
    }
  }

  function onKey(e) {
    if (e.key === "Escape") {
      block(e);
      stop();
    }
  }

  function start() {
    if (active) return;
    active = true;
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    document.documentElement.appendChild(overlay);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mousedown", block, true);
    document.addEventListener("mouseup", block, true);
    document.addEventListener("keydown", onKey, true);
  }

  function stop() {
    active = false;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("mousedown", block, true);
    document.removeEventListener("mouseup", block, true);
    document.removeEventListener("keydown", onKey, true);
    if (overlay) overlay.remove();
    overlay = null;
    hovered = null;
  }

  getSelectors().then(renderStyle).catch(() => {});

  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "startElementPicker") {
      start();
      return Promise.resolve({ success: true });
    }
    if (message.action === "resetTransparentElements") {
      return reset().then(() => ({ success: true }));
    }
    return false;
  });
})();
