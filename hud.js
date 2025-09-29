// hud.js — HUD helpers delegated to game internals
(function(){
  const H = (window.HXH ||= {});
  const ensureHudRoot = () => document.getElementById("hud");
  const ensureHead = () => document.head || document.getElementsByTagName("head")[0] || null;

  const HOTBAR_SIZE = 9;
  let hotbarCache = null;
  let nenRadialCache = null;

  function formatItemLabel(item) {
    if (!item) return "";
    if (typeof item.name === "string" && item.name.trim()) return item.name.trim();
    if (typeof item.label === "string" && item.label.trim()) return item.label.trim();
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) return "";
    return id
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function ensureHotbar() {
    const root = ensureHudRoot();
    if (!root) return null;
    const bottom = document.getElementById("hud-bottom");
    if (!bottom) return null;
    if (hotbarCache && hotbarCache.root && bottom.contains(hotbarCache.root)) {
      return hotbarCache;
    }

    let container = bottom.querySelector("#hud-hotbar");
    if (!container) {
      container = document.createElement("div");
      container.id = "hud-hotbar";
      bottom.appendChild(container);
    } else {
      container.innerHTML = "";
    }

    container.classList.add("hud-hotbar");
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(9, minmax(0, 1fr))";
    container.style.gap = "0.35rem";
    container.style.marginTop = "0.75rem";
    container.style.pointerEvents = "auto";
    container.style.userSelect = "none";

    const slots = new Array(HOTBAR_SIZE);
    for (let i = 0; i < HOTBAR_SIZE; i += 1) {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.dataset.index = String(i);
      slot.className = "hud-hotbar-slot";
      slot.style.display = "flex";
      slot.style.flexDirection = "column";
      slot.style.alignItems = "stretch";
      slot.style.justifyContent = "space-between";
      slot.style.padding = "0.35rem 0.4rem";
      slot.style.borderRadius = "8px";
      slot.style.background = "rgba(16, 24, 36, 0.55)";
      slot.style.border = "1px solid rgba(255,255,255,0.1)";
      slot.style.color = "#f5faff";
      slot.style.fontSize = "0.7rem";
      slot.style.textAlign = "left";
      slot.style.cursor = "pointer";
      slot.style.transition = "background-color 0.15s ease, border-color 0.18s ease, transform 0.12s ease";
      slot.style.position = "relative";
      slot.style.minHeight = "3.1rem";
      slot.style.pointerEvents = "auto";

      const key = document.createElement("span");
      key.dataset.role = "key";
      key.textContent = String(i + 1);
      key.style.fontSize = "0.65rem";
      key.style.opacity = "0.6";
      key.style.alignSelf = "flex-end";

      const label = document.createElement("span");
      label.dataset.role = "label";
      label.style.fontSize = "0.78rem";
      label.style.fontWeight = "600";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";

      const info = document.createElement("div");
      info.style.display = "flex";
      info.style.alignItems = "center";
      info.style.justifyContent = "space-between";
      info.style.gap = "0.35rem";
      info.style.marginTop = "0.25rem";
      info.style.fontSize = "0.65rem";

      const stack = document.createElement("span");
      stack.dataset.role = "stack";
      stack.style.opacity = "0.75";
      stack.style.minWidth = "2.4ch";

      const durWrap = document.createElement("div");
      durWrap.dataset.role = "dur-wrap";
      durWrap.style.flex = "1";
      durWrap.style.height = "4px";
      durWrap.style.background = "rgba(255,255,255,0.18)";
      durWrap.style.borderRadius = "4px";
      durWrap.style.overflow = "hidden";

      const dur = document.createElement("div");
      dur.dataset.role = "dur";
      dur.style.height = "100%";
      dur.style.width = "0%";
      dur.style.background = "linear-gradient(90deg, #4cd5ff, #5effc8)";
      dur.style.transition = "width 0.12s ease";

      durWrap.appendChild(dur);
      info.appendChild(stack);
      info.appendChild(durWrap);

      slot.appendChild(key);
      slot.appendChild(label);
      slot.appendChild(info);

      container.appendChild(slot);
      slots[i] = { root: slot, labelEl: label, stackEl: stack, durEl: dur, durWrap };
    }

    hotbarCache = { root: container, slots };
    return hotbarCache;
  }

  function renderHotbar(inventory) {
    const cache = ensureHotbar();
    if (!cache) return;
    const slots = cache.slots;
    for (let i = 0; i < slots.length; i += 1) {
      const slotMeta = slots[i];
      if (!slotMeta) continue;
      const slotIndex = inventory && Array.isArray(inventory.hotbar) ? inventory.hotbar[i] : null;
      const item = typeof slotIndex === "number" && inventory?.slots ? inventory.slots[slotIndex] : null;
      const active = inventory?.activeHotbar === i && item && !item.broken;
      slotMeta.root.classList.toggle("active", !!active);
      slotMeta.root.classList.toggle("empty", !item);
      slotMeta.root.classList.toggle("broken", !!item && !!item.broken);
      slotMeta.root.style.background = active ? "rgba(38, 72, 112, 0.65)" : "rgba(16, 24, 36, 0.55)";
      slotMeta.root.style.borderColor = active ? "rgba(86, 214, 255, 0.95)" : item ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)";
      slotMeta.root.style.transform = active ? "translateY(-2px)" : "translateY(0)";

      slotMeta.labelEl.textContent = item ? formatItemLabel(item) : "";
      const stackInfo = item && item.stack && item.stack.max > 1
        ? `${Math.max(0, item.stack.count ?? 0)}/${Math.max(1, item.stack.max ?? 1)}`
        : "";
      slotMeta.stackEl.textContent = stackInfo;
      slotMeta.stackEl.style.visibility = stackInfo ? "visible" : "hidden";

      if (item && item.dur && item.dur.max > 0) {
        const ratio = Math.max(0, Math.min(1, item.dur.current / Math.max(1, item.dur.max)));
        slotMeta.durEl.style.width = `${ratio * 100}%`;
        slotMeta.durWrap.style.opacity = "1";
      } else {
        slotMeta.durEl.style.width = "0%";
        slotMeta.durWrap.style.opacity = item ? "0.35" : "0.12";
      }
    }
  }

  function flashHotbar(index) {
    const cache = hotbarCache || ensureHotbar();
    if (!cache) return;
    const slot = cache.slots[index];
    if (!slot) return;
    slot.root.style.boxShadow = "0 0 12px rgba(255,82,82,0.75)";
    setTimeout(() => {
      slot.root.style.boxShadow = "";
    }, 220);
  }

  function ensureNenRadial() {
    if (nenRadialCache?.root?.isConnected) return nenRadialCache;
    const root = ensureHudRoot();
    if (!root) return null;
    let container = document.getElementById("hud-nen-radial");
    if (!container) {
      container = document.createElement("div");
      container.id = "hud-nen-radial";
      container.style.position = "absolute";
      container.style.pointerEvents = "auto";
      container.style.display = "none";
      container.style.left = "50%";
      container.style.bottom = "30%";
      container.style.transform = "translateX(-50%)";
      container.style.width = "220px";
      container.style.height = "220px";
      container.style.zIndex = "9";
      root.appendChild(container);
    } else {
      container.innerHTML = "";
    }
    const ring = document.createElement("div");
    ring.style.position = "relative";
    ring.style.width = "100%";
    ring.style.height = "100%";
    ring.style.borderRadius = "50%";
    ring.style.background = "radial-gradient(circle, rgba(18,32,52,0.9) 0%, rgba(8,16,28,0.8) 55%, rgba(4,12,24,0.2) 100%)";
    ring.style.border = "1px solid rgba(132, 200, 255, 0.4)";
    ring.style.boxShadow = "0 0 22px rgba(40,140,255,0.35)";
    ring.style.pointerEvents = "auto";

    const center = document.createElement("div");
    center.dataset.role = "center";
    center.style.position = "absolute";
    center.style.left = "50%";
    center.style.top = "50%";
    center.style.transform = "translate(-50%, -50%)";
    center.style.fontSize = "0.78rem";
    center.style.letterSpacing = "0.1em";
    center.style.textTransform = "uppercase";
    center.style.color = "#d6ecff";
    center.style.opacity = "0.85";
    center.style.pointerEvents = "none";
    center.textContent = "Select";
    ring.appendChild(center);

    container.appendChild(ring);
    nenRadialCache = { root: container, ring, center, options: [] };
    return nenRadialCache;
  }

  function renderNenRadial(options = [], activeKey = null) {
    const cache = ensureNenRadial();
    if (!cache) return;
    const { ring } = cache;
    cache.options.forEach(entry => entry.button?.remove());
    cache.options = [];
    const count = options.length;
    if (count === 0) {
      cache.center.textContent = "No Options";
      return;
    }
    cache.center.textContent = "";
    const radius = 78;
    options.forEach((opt, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.key = opt.key ?? String(index);
      btn.className = "nen-radial-option";
      btn.textContent = opt.label ?? btn.dataset.key;
      btn.title = opt.hint ?? "";
      btn.style.position = "absolute";
      btn.style.left = "50%";
      btn.style.top = "50%";
      btn.style.transform = `translate(-50%, -50%) translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
      btn.style.padding = "0.4rem 0.6rem";
      btn.style.borderRadius = "999px";
      btn.style.border = "1px solid rgba(156, 220, 255, 0.5)";
      btn.style.background = opt.color || "rgba(22, 38, 58, 0.85)";
      btn.style.color = "#f4fbff";
      btn.style.fontSize = "0.74rem";
      btn.style.letterSpacing = "0.08em";
      btn.style.textTransform = "uppercase";
      btn.style.pointerEvents = "auto";
      btn.style.cursor = "pointer";
      btn.style.transition = "transform 0.12s ease, box-shadow 0.18s ease, opacity 0.18s ease";
      if (opt.icon) {
        btn.textContent = `${opt.icon} ${btn.textContent}`.trim();
      }
      ring.appendChild(btn);
      const entry = { key: btn.dataset.key, button: btn };
      cache.options.push(entry);
    });
    updateNenRadialSelection(activeKey);
  }

  function showNenRadial(options, activeKey = null) {
    const cache = ensureNenRadial();
    if (!cache) return () => {};
    renderNenRadial(options, activeKey);
    cache.root.style.display = "block";
    cache.root.style.pointerEvents = "auto";
    cache.ring.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("mouseenter", () => updateNenRadialSelection(btn.dataset.key));
    });
    requestAnimationFrame(() => {
      cache.root.style.opacity = "1";
    });
    return () => hideNenRadial();
  }

  function hideNenRadial() {
    if (!nenRadialCache || !nenRadialCache.root) return;
    nenRadialCache.root.style.display = "none";
    nenRadialCache.root.style.opacity = "0";
  }

  function updateNenRadialSelection(activeKey = null) {
    if (!nenRadialCache) return;
    nenRadialCache.options.forEach(entry => {
      if (!entry.button) return;
      const active = entry.key === activeKey;
      entry.button.classList.toggle("active", active);
      entry.button.style.boxShadow = active
        ? "0 0 16px rgba(90, 200, 255, 0.65)"
        : "0 0 8px rgba(10, 20, 32, 0.6)";
      entry.button.style.opacity = active ? "1" : "0.72";
      entry.button.style.transform = entry.button.style.transform.replace(/scale\([0-9.]+\)/, "");
      if (active) {
        entry.button.style.transform += " scale(1.05)";
      }
    });
  }

  function bindNenRadialSelection(handler) {
    const cache = ensureNenRadial();
    if (!cache) return () => {};
    const clickHandler = (event) => {
      const target = event.target instanceof Element ? event.target.closest(".nen-radial-option") : null;
      if (!target) return;
      const key = target.dataset.key;
      handler?.(key, event);
    };
    cache.ring.addEventListener("click", clickHandler);
    return () => cache.ring.removeEventListener("click", clickHandler);
  }

  function bindHotbar(handler) {
    const cache = ensureHotbar();
    if (!cache) return () => {};
    const listener = (event) => {
      const target = event.target instanceof Element ? event.target.closest(".hud-hotbar-slot") : null;
      if (!target) return;
      const index = Number.parseInt(target.dataset.index ?? "", 10);
      if (!Number.isInteger(index)) return;
      handler?.(index, event);
    };
    cache.root.addEventListener("click", listener);
    return () => cache.root.removeEventListener("click", listener);
  }

  const HUD = {
    update: (...a)=>H.updateHUD?.(...a),
    updateCooldowns: (...a)=>H.updateCooldownUI?.(...a),
    setCooldown: (...a)=>H.setCooldown?.(...a),
    isCooldown: (...a)=>H.cdActive?.(...a),
    message: (...a)=>H.msg?.(...a),
    updateAuraStrip: (...a)=>H.updateAuraHud?.(...a),
    subscribeAura: (...a)=>H.subscribeAura?.(...a),
    getAuraState: (...a)=>H.getAuraState?.(...a),
    updateFlow: (...a)=>H.updateFlowHud?.(...a),
    showNenRadial,
    hideNenRadial,
    updateNenRadialSelection,
    bindNenRadialSelection,
    getFlowState: (...a)=>H.getFlowState?.(...a),
    getHudRoot: ensureHudRoot,
    ensureLayer(id, className = "") {
      const root = ensureHudRoot();
      if (!root || !id) return null;
      let layer = root.querySelector(`#${id}`);
      if (!layer) {
        layer = document.createElement("div");
        layer.id = id;
        layer.setAttribute("data-hud-layer", id);
        layer.style.pointerEvents = "none";
        root.appendChild(layer);
      }
      if (className) {
        className.split(/\s+/).filter(Boolean).forEach(cls => layer.classList.add(cls));
      }
      return layer;
    },
    injectStyles(id, css) {
      if (!id || !css) return null;
      const head = ensureHead();
      if (!head) return null;
      const existing = document.getElementById(id);
      if (existing) return existing;
      const style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      head.appendChild(style);
      return style;
    },
    ensureHotbar,
    renderHotbar,
    bindHotbar,
    flashHotbarBreak: flashHotbar
  };
  window.HUD = HUD;
})();
