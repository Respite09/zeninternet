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

  // Entries may be legacy strings or saved effect objects.
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
        const tint = e.effects?.tint;
        const blur = e.effects?.blur;
        const tintEnabled = tint ? tint.enabled : e.mode !== "blur";
        const blurEnabled = blur ? blur.enabled : e.mode === "blur";
        const declarations = [];
        let css = "";

        if (tintEnabled) {
          const color = tint ? tint.color : e.color;
          const alpha = tint ? tint.alpha : e.alpha;
          const bg = alpha > 0 ? hexToRgba(color, alpha) : "transparent";
          declarations.push(
            `background: ${bg} !important`,
            "background-image: none !important",
            "box-shadow: none !important"
          );
          css += `${e.selector} * { background: transparent !important; background-image: none !important; box-shadow: none !important; }\n`;
        }

        if (blurEnabled) {
          const amount = blur ? blur.amount : e.blur;
          if (!tintEnabled) declarations.push("background-color: transparent !important");
          declarations.push(
            `backdrop-filter: blur(${Number(amount) || 0}px) !important`,
            `-webkit-backdrop-filter: blur(${Number(amount) || 0}px) !important`
          );
        }

        if (declarations.length) {
          css = `${e.selector} { ${declarations.join("; ")}; }\n${css}`;
        }
        return css;
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
    label.textContent = "Element effects";
    const tintToggle = document.createElement("input");
    tintToggle.type = "checkbox";
    tintToggle.checked = true;
    const tintLabel = document.createElement("label");
    tintLabel.append(tintToggle, " Tint / transparency");
    const color = document.createElement("input");
    color.type = "color";
    color.value = "#000000";
    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = "0";
    opacity.max = "100";
    opacity.value = "0";
    const blurToggle = document.createElement("input");
    blurToggle.type = "checkbox";
    const blurLabel = document.createElement("label");
    blurLabel.append(blurToggle, " Blur");
    const blurAmount = document.createElement("input");
    blurAmount.type = "range";
    blurAmount.min = "0";
    blurAmount.max = "100";
    blurAmount.value = "20";
    const hint = document.createElement("div");
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;";
    const ok = document.createElement("button");
    ok.textContent = "Apply";
    const remove = document.createElement("button");
    remove.textContent = "Remove element";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    row.append(ok, remove, cancel);
    panel.append(label, tintLabel, color, opacity, blurLabel, blurAmount, hint, row);
    document.documentElement.appendChild(panel);

    const current = () => ({
      selector,
      effects: {
        tint: {
          enabled: tintToggle.checked,
          color: color.value,
          alpha: Number(opacity.value) / 100,
        },
        blur: {
          enabled: blurToggle.checked,
          amount: Number(blurAmount.value) * 0.3,
        },
      },
    });
    const preview = () => {
      color.style.display = tintToggle.checked ? "" : "none";
      opacity.style.display = tintToggle.checked ? "" : "none";
      blurAmount.style.display = blurToggle.checked ? "" : "none";
      hint.textContent = [
        tintToggle.checked ? `${opacity.value}% tint` : "",
        blurToggle.checked ? `${(Number(blurAmount.value) * 0.3).toFixed(1)}px blur` : "",
      ].filter(Boolean).join(" · ");
      ok.disabled = !tintToggle.checked && !blurToggle.checked;
      renderStyle([current()]);
    };
    tintToggle.addEventListener("change", preview);
    blurToggle.addEventListener("change", preview);
    color.addEventListener("input", preview);
    opacity.addEventListener("input", preview);
    blurAmount.addEventListener("input", preview);
    ok.addEventListener("click", () => {
      panel.remove();
      saveSelector(current());
    });
    remove.addEventListener("click", () => {
      panel.remove();
      saveSelector({ selector, mode: "remove" });
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
