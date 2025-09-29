// hud.js — HUD helpers delegated to game internals
(function(){
  const H = (window.HXH ||= {});
  const ensureHudRoot = () => document.getElementById("hud");
  const ensureHead = () => document.head || document.getElementsByTagName("head")[0] || null;

  const HOTBAR_SIZE = 9;
  let hotbarCache = null;
  let nenRadialCache = null;
  let vowMenuCache = null;
  let gyoIntelCache = null;
  let gyoIntelLoop = null;
  let gyoIntelLoopType = null;
  let gyoIntelKey = "";
  let gyoIntelActive = false;

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

  function ensureVowMenu() {
    if (vowMenuCache?.root?.isConnected) return vowMenuCache;
    const hudRoot = ensureHudRoot();
    if (!hudRoot) return null;
    const root = document.createElement("div");
    root.id = "hud-vow-overlay";
    root.style.position = "absolute";
    root.style.left = "0";
    root.style.top = "0";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.display = "none";
    root.style.alignItems = "center";
    root.style.justifyContent = "center";
    root.style.background = "rgba(6, 12, 20, 0.78)";
    root.style.backdropFilter = "blur(5px)";
    root.style.zIndex = "14";
    root.style.pointerEvents = "none";

    const panel = document.createElement("div");
    panel.className = "hud-vow-panel";
    panel.style.background = "rgba(16, 24, 36, 0.96)";
    panel.style.border = "1px solid rgba(120, 180, 255, 0.28)";
    panel.style.borderRadius = "14px";
    panel.style.padding = "1.5rem";
    panel.style.width = "min(720px, 94vw)";
    panel.style.maxHeight = "82vh";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "1.1rem";
    panel.style.boxShadow = "0 18px 40px rgba(0, 0, 0, 0.45)";
    panel.style.pointerEvents = "auto";

    const title = document.createElement("h2");
    title.textContent = "Craft Vows";
    title.style.margin = "0";
    title.style.fontSize = "1.45rem";
    panel.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.textContent = "Bind up to three active vows. Increase strength for bigger multipliers.";
    subtitle.style.margin = "0";
    subtitle.style.opacity = "0.75";
    subtitle.style.fontSize = "0.9rem";
    panel.appendChild(subtitle);

    const slotsWrap = document.createElement("div");
    slotsWrap.style.display = "grid";
    slotsWrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))";
    slotsWrap.style.gap = "0.9rem";
    panel.appendChild(slotsWrap);

    const summaryBox = document.createElement("div");
    summaryBox.style.background = "rgba(12, 20, 32, 0.92)";
    summaryBox.style.border = "1px solid rgba(90, 150, 220, 0.32)";
    summaryBox.style.borderRadius = "12px";
    summaryBox.style.padding = "0.85rem 1rem";
    summaryBox.style.display = "flex";
    summaryBox.style.flexDirection = "column";
    summaryBox.style.gap = "0.5rem";
    const summaryTitle = document.createElement("div");
    summaryTitle.textContent = "Current multipliers";
    summaryTitle.style.fontWeight = "600";
    summaryTitle.style.letterSpacing = "0.02em";
    summaryBox.appendChild(summaryTitle);
    const summaryList = document.createElement("ul");
    summaryList.style.listStyle = "none";
    summaryList.style.margin = "0";
    summaryList.style.padding = "0";
    summaryList.style.display = "grid";
    summaryList.style.gridTemplateColumns = "repeat(auto-fit, minmax(160px, 1fr))";
    summaryList.style.gap = "0.45rem";
    summaryBox.appendChild(summaryList);
    panel.appendChild(summaryBox);

    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";
    footer.style.gap = "0.6rem";
    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.textContent = "Cancel";
    btnCancel.className = "secondary";
    btnCancel.style.minWidth = "96px";
    const btnConfirm = document.createElement("button");
    btnConfirm.type = "button";
    btnConfirm.textContent = "Bind Vows";
    btnConfirm.className = "primary";
    btnConfirm.style.minWidth = "120px";
    footer.appendChild(btnCancel);
    footer.appendChild(btnConfirm);
    panel.appendChild(footer);

    const slots = [];
    for (let i = 0; i < 3; i += 1) {
      const slot = document.createElement("div");
      slot.style.background = "rgba(10, 18, 30, 0.9)";
      slot.style.border = "1px solid rgba(80, 130, 190, 0.28)";
      slot.style.borderRadius = "10px";
      slot.style.padding = "0.85rem";
      slot.style.display = "flex";
      slot.style.flexDirection = "column";
      slot.style.gap = "0.55rem";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.flexDirection = "column";
      header.style.gap = "0.4rem";
      const label = document.createElement("label");
      label.textContent = `Slot ${i + 1}`;
      label.style.display = "flex";
      label.style.flexDirection = "column";
      label.style.gap = "0.35rem";
      const select = document.createElement("select");
      select.dataset.role = "rule";
      select.style.padding = "0.45rem";
      select.style.borderRadius = "8px";
      select.style.border = "1px solid rgba(120, 180, 255, 0.25)";
      select.style.background = "rgba(14, 22, 36, 0.96)";
      select.style.color = "#f2f8ff";
      select.style.fontSize = "0.85rem";
      label.appendChild(select);
      header.appendChild(label);
      slot.appendChild(header);

      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.flexDirection = "column";
      controls.style.gap = "0.4rem";

      const strengthRow = document.createElement("div");
      strengthRow.style.display = "flex";
      strengthRow.style.alignItems = "center";
      strengthRow.style.gap = "0.5rem";
      const strengthLabel = document.createElement("label");
      strengthLabel.textContent = "Strength";
      strengthLabel.style.fontSize = "0.8rem";
      const strengthValue = document.createElement("span");
      strengthValue.textContent = "1";
      strengthValue.style.fontSize = "0.85rem";
      strengthValue.style.fontWeight = "600";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "1";
      slider.max = "3";
      slider.step = "1";
      slider.value = "1";
      slider.style.flex = "1";
      slider.style.appearance = "none";
      slider.style.height = "4px";
      slider.style.borderRadius = "4px";
      slider.style.background = "linear-gradient(90deg, rgba(94, 178, 255, 0.65), rgba(120, 220, 255, 0.85))";
      strengthRow.appendChild(strengthLabel);
      strengthRow.appendChild(slider);
      strengthRow.appendChild(strengthValue);
      controls.appendChild(strengthRow);

      const lethalLabel = document.createElement("label");
      lethalLabel.style.display = "flex";
      lethalLabel.style.alignItems = "center";
      lethalLabel.style.gap = "0.45rem";
      lethalLabel.style.fontSize = "0.78rem";
      const lethalInput = document.createElement("input");
      lethalInput.type = "checkbox";
      lethalLabel.appendChild(lethalInput);
      lethalLabel.appendChild(document.createTextNode("I'll die if I break it"));
      controls.appendChild(lethalLabel);
      slot.appendChild(controls);

      const preview = document.createElement("div");
      preview.dataset.role = "preview";
      preview.style.fontSize = "0.78rem";
      preview.style.lineHeight = "1.35";
      preview.style.opacity = "0.8";
      preview.textContent = "Empty slot.";
      slot.appendChild(preview);

      slotsWrap.appendChild(slot);
      slots[i] = { root: slot, select, slider, strengthValue, lethal: lethalInput, preview };
    }

    root.appendChild(panel);
    hudRoot.appendChild(root);
    vowMenuCache = { root, panel, slots, summaryList, btnCancel, btnConfirm };
    return vowMenuCache;
  }

  function ensureGyoIntelStyles() {
    if (document.getElementById("hud-gyo-intel-style")) return;
    const head = ensureHead();
    if (!head) return;
    const style = document.createElement("style");
    style.id = "hud-gyo-intel-style";
    style.textContent = `
      #hud-gyo-intel {
        position: absolute;
        right: 1.2rem;
        top: 7.5rem;
        background: rgba(20,32,48,0.35);
        border: 1px solid rgba(120,200,255,0.25);
        border-radius: 8px;
        padding: 0.45rem 0.55rem;
        max-width: 220px;
        pointer-events: none;
        color: #d9ecff;
        font-size: 0.68rem;
        letter-spacing: 0.018em;
        display: none;
        flex-direction: column;
        gap: 0.3rem;
        box-shadow: 0 8px 22px rgba(10,20,34,0.35);
        backdrop-filter: blur(2px);
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 8;
      }
      #hud-gyo-intel.active {
        display: flex;
        opacity: 1;
      }
      #hud-gyo-intel .hud-gyo-header {
        text-transform: uppercase;
        font-weight: 600;
        font-size: 0.64rem;
        opacity: 0.78;
      }
      #hud-gyo-intel ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      #hud-gyo-intel li {
        display: flex;
        justify-content: space-between;
        gap: 0.45rem;
        background: rgba(28,46,72,0.5);
        border-radius: 5px;
        padding: 0.25rem 0.4rem;
        font-size: 0.66rem;
      }
      #hud-gyo-intel li span[data-role="tag"] {
        font-weight: 600;
        text-transform: uppercase;
        color: #74d4ff;
      }
      #hud-gyo-intel li span[data-role="detail"] {
        opacity: 0.8;
      }
    `;
    head.appendChild(style);
  }

  function ensureGyoIntel() {
    if (gyoIntelCache?.wrap?.isConnected) return gyoIntelCache;
    const root = ensureHudRoot();
    if (!root) return null;
    ensureGyoIntelStyles();
    let wrap = document.getElementById("hud-gyo-intel");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "hud-gyo-intel";
      const header = document.createElement("div");
      header.className = "hud-gyo-header";
      header.textContent = "Gyo read";
      wrap.appendChild(header);
      const list = document.createElement("ul");
      wrap.appendChild(list);
      root.appendChild(wrap);
      gyoIntelCache = { wrap, list, header };
    } else {
      let list = wrap.querySelector("ul");
      if (!list) {
        list = document.createElement("ul");
        wrap.appendChild(list);
      }
      const header = wrap.querySelector(".hud-gyo-header") || (() => {
        const h = document.createElement("div");
        h.className = "hud-gyo-header";
        h.textContent = "Gyo read";
        wrap.insertBefore(h, wrap.firstChild);
        return h;
      })();
      gyoIntelCache = { wrap, list, header };
    }
    return gyoIntelCache;
  }

  function describeIntel(entry) {
    if (!entry) return { tag: "", detail: "" };
    const archetype = entry.archetype || "";
    const type = entry.type || "";
    if (type === "telegraph") {
      const limb = (entry.limb || "torso").toUpperCase();
      return { tag: "Bruiser", detail: `Ko → ${limb}` };
    }
    if (type === "zetsu") {
      const state = entry.urgency && entry.urgency > 0.5 ? "Hidden" : "Revealed";
      return { tag: "Assassin", detail: state };
    }
    if (type === "orb") {
      const status = entry.urgency > 0.6 ? "Orbs primed" : "Orbs muted";
      return { tag: archetype === "caster" ? "Emitter" : "Caster", detail: status };
    }
    return { tag: archetype || "Aura", detail: "Flow shift" };
  }

  function renderGyoIntel() {
    if (!gyoIntelActive) {
      gyoIntelLoop = null;
      return;
    }
    const cache = ensureGyoIntel();
    if (!cache) {
      gyoIntelLoop = null;
      return;
    }
    const intel = window.Enemies?.getAuraIntel?.() || [];
    const limited = intel.slice(0, 3).map(entry => ({
      archetype: entry.archetype || "",
      type: entry.type || "",
      limb: entry.limb || "",
      urgency: Number(entry.urgency) || 0
    }));
    const fingerprint = JSON.stringify(limited.map(e => `${e.archetype}:${e.type}:${e.limb}:${Math.round(e.urgency * 100)}`));
    if (fingerprint !== gyoIntelKey) {
      gyoIntelKey = fingerprint;
      cache.list.innerHTML = "";
      if (!limited.length) {
        const li = document.createElement("li");
        li.textContent = "Aura steady.";
        cache.list.appendChild(li);
      } else {
        for (const entry of limited) {
          const li = document.createElement("li");
          const tag = document.createElement("span");
          tag.dataset.role = "tag";
          const detail = document.createElement("span");
          detail.dataset.role = "detail";
          const desc = describeIntel(entry);
          tag.textContent = desc.tag;
          detail.textContent = desc.detail;
          li.appendChild(tag);
          li.appendChild(detail);
          cache.list.appendChild(li);
        }
      }
    }
    if (typeof requestAnimationFrame === "function") {
      gyoIntelLoopType = "raf";
      gyoIntelLoop = requestAnimationFrame(renderGyoIntel);
    } else {
      gyoIntelLoopType = "timeout";
      gyoIntelLoop = setTimeout(renderGyoIntel, 160);
    }
  }

  function stopGyoIntelLoop() {
    gyoIntelActive = false;
    if (gyoIntelLoop) {
      if (gyoIntelLoopType === "raf" && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(gyoIntelLoop);
      } else if (gyoIntelLoopType === "timeout") {
        clearTimeout(gyoIntelLoop);
      }
    }
    gyoIntelLoop = null;
    gyoIntelLoopType = null;
    gyoIntelKey = "";
    if (gyoIntelCache?.wrap) {
      gyoIntelCache.wrap.classList.remove("active");
      gyoIntelCache.wrap.style.display = "none";
    }
  }

  function startGyoIntelLoop() {
    const cache = ensureGyoIntel();
    if (!cache) return;
    gyoIntelActive = true;
    cache.wrap.style.display = "flex";
    cache.wrap.classList.add("active");
    gyoIntelKey = "";
    if (!gyoIntelLoop) {
      renderGyoIntel();
    }
  }

  function handleGyoState(aura = {}) {
    if (aura.gyo) {
      startGyoIntelLoop();
    } else {
      stopGyoIntelLoop();
    }
  }

  function renderVowTotals(summaryList, totals, entries) {
    if (!summaryList) return;
    summaryList.innerHTML = "";
    const makeItem = (label, value) => {
      const li = document.createElement("li");
      li.textContent = `${label}: ${value}`;
      li.style.fontSize = "0.82rem";
      li.style.opacity = "0.85";
      summaryList.appendChild(li);
    };
    const formatMul = (mul) => mul.toFixed(2);
    makeItem("Ko", `×${formatMul(totals.koMultiplier ?? 1)}`);
    makeItem("Nen", `×${formatMul(totals.nenMultiplier ?? 1)}`);
    makeItem("Elite target", `×${formatMul(totals.eliteTargetMultiplier ?? 1)}`);
    makeItem("Others", `×${formatMul(totals.eliteOthersMultiplier ?? 1)}`);
    const flags = [];
    if (totals.disableKen) flags.push("Ken sealed");
    if (totals.restrictions?.requireKo) flags.push("Ko only");
    if (totals.restrictions?.forbidDash) flags.push("No dash");
    if (totals.restrictions?.restrictTarget) flags.push("Elite focus");
    if (flags.length) makeItem("Restrictions", flags.join(", "));
    if (Array.isArray(entries) && entries.some(entry => entry?.lethal)) {
      makeItem("Lethal vows", String(entries.filter(entry => entry?.lethal).length));
    }
  }

  function describeEntry(entry) {
    if (!entry) return "Empty slot.";
    const parts = [];
    if (entry.summary) parts.push(entry.summary);
    const fx = entry.effects || {};
    const details = [];
    if (typeof fx.koMultiplier === "number" && fx.koMultiplier !== 1) {
      details.push(`Ko ×${fx.koMultiplier.toFixed(2)}`);
    }
    if (typeof fx.nenMultiplier === "number" && fx.nenMultiplier !== 1) {
      details.push(`Nen ×${fx.nenMultiplier.toFixed(2)}`);
    }
    if (typeof fx.eliteTargetMultiplier === "number" && fx.eliteTargetMultiplier !== 1) {
      details.push(`Elite ×${fx.eliteTargetMultiplier.toFixed(2)}`);
    }
    if (typeof fx.eliteOthersMultiplier === "number" && fx.eliteOthersMultiplier !== 1) {
      details.push(`Others ×${fx.eliteOthersMultiplier.toFixed(2)}`);
    }
    if (fx.disableKen) details.push("Ken sealed");
    if (fx.restrictions?.requireKo) details.push("Ko only");
    if (fx.restrictions?.forbidDash) details.push("No dash");
    if (fx.restrictions?.restrictTarget) details.push("Elite focus");
    if (entry.lethal) details.push("Lethal vow");
    if (details.length) parts.push(details.join(" • "));
    return parts.join(" ").trim();
  }

  function openVowMenu(config = {}) {
    const cache = ensureVowMenu();
    if (!cache) return null;
    const { root, slots, summaryList, btnCancel, btnConfirm } = cache;
    const adv = window.NenAdvanced;
    const catalog = Array.isArray(config.catalog) && config.catalog.length
      ? config.catalog
      : (adv?.getVowRules?.() || []);
    const catalogMap = new Map(catalog.map(rule => [rule.id, rule]));
    const selection = Array.isArray(config.selection) ? config.selection.slice(0, 3) : [];

    slots.forEach((slot, index) => {
      slot.select.innerHTML = "";
      const optNone = document.createElement("option");
      optNone.value = "";
      optNone.textContent = "Empty";
      slot.select.appendChild(optNone);
      catalog.forEach(rule => {
        const opt = document.createElement("option");
        opt.value = rule.id;
        opt.textContent = rule.label;
        opt.title = rule.description || "";
        slot.select.appendChild(opt);
      });
      const current = selection[index] || null;
      const ruleId = current?.ruleId || "";
      slot.select.value = ruleId;
      const ruleMeta = catalogMap.get(ruleId) || null;
      slot.slider.max = String(ruleMeta?.maxStrength || 3);
      const strengthValue = Math.min(Number(slot.slider.max) || 3, Math.max(1, current?.strength || ruleMeta?.defaultStrength || 1));
      slot.slider.value = String(strengthValue);
      slot.strengthValue.textContent = slot.slider.value;
      slot.lethal.checked = !!current?.lethal;
      if (!ruleId) {
        slot.slider.disabled = true;
        slot.lethal.disabled = true;
        slot.strengthValue.textContent = "—";
        slot.preview.textContent = "Empty slot.";
      } else {
        slot.slider.disabled = false;
        slot.lethal.disabled = false;
        const entry = adv?.resolveVow?.(ruleId, slot.slider.value, slot.lethal.checked) || null;
        slot.preview.textContent = describeEntry(entry);
      }
    });

    const readSelection = () => slots.map(slot => {
      const ruleId = slot.select.value;
      if (!ruleId) return null;
      return {
        ruleId,
        strength: Number(slot.slider.value) || 1,
        lethal: !!slot.lethal.checked
      };
    }).filter(Boolean);

    const updatePreview = () => {
      const currentSelection = readSelection();
      slots.forEach((slot) => {
        if (!slot.select.value) {
          slot.slider.disabled = true;
          slot.lethal.disabled = true;
          slot.strengthValue.textContent = "—";
          slot.preview.textContent = "Empty slot.";
          return;
        }
        slot.slider.disabled = false;
        slot.lethal.disabled = false;
        slot.strengthValue.textContent = slot.slider.value;
        const entry = adv?.resolveVow?.(slot.select.value, slot.slider.value, slot.lethal.checked) || null;
        slot.preview.textContent = describeEntry(entry);
      });
      const bundle = adv?.combineVows?.(currentSelection) || { entries: [], totals: { koMultiplier: 1, nenMultiplier: 1, eliteTargetMultiplier: 1, eliteOthersMultiplier: 1, disableKen: false, restrictions: {} } };
      renderVowTotals(summaryList, bundle.totals || {}, bundle.entries || []);
      if (typeof config.onPreview === "function") {
        config.onPreview(currentSelection, bundle);
      }
    };

    slots.forEach(slot => {
      slot.select.onchange = () => {
        const ruleMeta = catalogMap.get(slot.select.value) || null;
        slot.slider.max = String(ruleMeta?.maxStrength || 3);
        if (!slot.select.value) {
          slot.slider.value = "1";
          slot.lethal.checked = false;
        } else {
          const preferred = ruleMeta?.defaultStrength || 1;
          slot.slider.value = String(preferred);
          slot.lethal.checked = false;
        }
        updatePreview();
      };
      slot.slider.oninput = () => {
        slot.strengthValue.textContent = slot.slider.value;
        updatePreview();
      };
      slot.lethal.onchange = () => {
        updatePreview();
      };
    });

    btnCancel.onclick = () => {
      if (typeof config.onCancel === "function") config.onCancel();
    };
    btnConfirm.onclick = () => {
      const chosen = readSelection();
      const bundle = adv?.combineVows?.(chosen) || null;
      if (typeof config.onConfirm === "function") config.onConfirm(chosen, bundle);
    };

    root.style.display = "flex";
    root.style.pointerEvents = "auto";
    requestAnimationFrame(() => {
      root.style.opacity = "1";
    });
    updatePreview();
    return () => closeVowMenu();
  }

  function closeVowMenu() {
    if (!vowMenuCache?.root) return;
    const { root } = vowMenuCache;
    root.style.display = "none";
    root.style.pointerEvents = "none";
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
    flashHotbarBreak: flashHotbar,
    openVowMenu,
    closeVowMenu
  };
  window.HUD = HUD;
  if (typeof H.subscribeAura === "function") {
    try {
      H.subscribeAura(handleGyoState);
      const initialAura = H.getAuraState?.();
      if (initialAura) handleGyoState(initialAura);
    } catch (err) {
      console.warn("[HUD] Failed to subscribe to aura state", err);
    }
  }
})();
