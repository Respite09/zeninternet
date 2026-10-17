// Element picker: click any element on the page to make its background transparent (like uBlock Origin's element zapper).
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
    style.textContent =
      selectors
        .map((s) => `${s}, ${s} * { background: transparent !important; background-image: none !important; box-shadow: none !important; }`)
        .join("\n");
  }

  async function saveSelector(selector) {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const all = data[STORAGE_KEY] || {};
    const list = all[HOST] || [];
    if (!list.includes(selector)) list.push(selector);
    all[HOST] = list;
    await browser.storage.local.set({ [STORAGE_KEY]: all });
    renderStyle(list);
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
      saveSelector(cssPath(el));
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
