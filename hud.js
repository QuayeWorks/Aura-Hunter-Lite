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
  let trainingMenuCache = null;
  let trainingGameState = null;
  let trainingButtonCache = null;
  let grudgeWidgetCache = null;
  let grudgeStyleInjected = false;
  let controlDockCache = null;
  let performanceTargetValue = 60;
  let cosmeticTesterCache = null;
  const RIG_UNLOCK_PHRASE = "QuayeWorks";
  let rigEditorUnlocked = false;
  let rigUnlockOverlayCache = null;
  const rigUnlockWaiters = new Set();

  function isRigEditorUnlocked() {
    return rigEditorUnlocked;
  }

  function notifyRigUnlockWaiters() {
    if (!rigUnlockWaiters.size) return;
    const callbacks = Array.from(rigUnlockWaiters);
    rigUnlockWaiters.clear();
    callbacks.forEach((callback) => {
      try {
        callback();
      } catch (err) {
        console.warn("[HUD] Rig unlock callback failed", err);
      }
    });
  }

  function updateRigEditorMenuVisibility() {
    const btn = document.getElementById("btn-rig");
    if (!btn) return;
    if (rigEditorUnlocked) {
      btn.hidden = false;
      btn.style.display = "";
    } else {
      btn.hidden = true;
      btn.style.display = "none";
    }
  }

  function setRigEditorUnlocked(next) {
    const value = !!next;
    if (rigEditorUnlocked === value) return value;
    rigEditorUnlocked = value;
    updateRigEditorMenuVisibility();
    if (controlDockCache?.rigUnlockButton) {
      controlDockCache.rigUnlockButton.classList.toggle("hud-rig-unlocked", rigEditorUnlocked);
      controlDockCache.rigUnlockButton.textContent = rigEditorUnlocked ? "Console ✓" : "Console";
      controlDockCache.rigUnlockButton.title = rigEditorUnlocked
        ? "Rig Editor access granted for this session."
        : "Enter the access phrase.";
    }
    if (rigEditorUnlocked) {
      notifyRigUnlockWaiters();
    }
    return rigEditorUnlocked;
  }

  function closeRigUnlockConsole() {
    if (!rigUnlockOverlayCache) return;
    const { root, input, escHandler } = rigUnlockOverlayCache;
    if (root) {
      root.style.display = "none";
    }
    if (input) {
      input.value = "";
    }
    if (escHandler) {
      document.removeEventListener("keydown", escHandler);
    }
  }

  function ensureRigUnlockOverlay() {
    if (rigUnlockOverlayCache?.root?.isConnected) return rigUnlockOverlayCache;
    const root = document.createElement("div");
    root.id = "hud-rig-unlock";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.display = "none";
    root.style.alignItems = "center";
    root.style.justifyContent = "center";
    root.style.background = "rgba(4, 10, 18, 0.68)";
    root.style.backdropFilter = "blur(3px)";
    root.style.zIndex = "4000";
    root.style.pointerEvents = "auto";

    const form = document.createElement("form");
    form.style.display = "flex";
    form.style.flexDirection = "column";
    form.style.gap = "0.65rem";
    form.style.minWidth = "260px";
    form.style.maxWidth = "320px";
    form.style.padding = "1.15rem 1.25rem";
    form.style.borderRadius = "14px";
    form.style.border = "1px solid rgba(120, 200, 255, 0.32)";
    form.style.background = "rgba(10, 20, 32, 0.94)";
    form.style.boxShadow = "0 18px 36px rgba(0,0,0,0.45)";
    root.appendChild(form);

    const title = document.createElement("strong");
    title.textContent = "Access Console";
    title.style.fontSize = "0.84rem";
    title.style.letterSpacing = "0.08em";
    title.style.textTransform = "uppercase";
    title.style.color = "#e7f6ff";
    form.appendChild(title);

    const prompt = document.createElement("p");
    prompt.textContent = "Enter the session phrase to reveal advanced tooling.";
    prompt.style.margin = "0";
    prompt.style.fontSize = "0.72rem";
    prompt.style.lineHeight = "1.35";
    prompt.style.color = "rgba(211, 233, 255, 0.72)";
    form.appendChild(prompt);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Access phrase";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.padding = "0.55rem 0.7rem";
    input.style.borderRadius = "999px";
    input.style.border = "1px solid rgba(120, 200, 255, 0.35)";
    input.style.background = "rgba(6, 16, 26, 0.82)";
    input.style.color = "#dff1ff";
    input.style.fontSize = "0.75rem";
    input.style.letterSpacing = "0.05em";
    input.style.outline = "none";
    input.addEventListener("focus", () => {
      input.style.borderColor = "rgba(160, 220, 255, 0.6)";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "rgba(120, 200, 255, 0.35)";
    });
    form.appendChild(input);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "0.5rem";
    actions.style.justifyContent = "flex-end";
    form.appendChild(actions);

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.textContent = "Close";
    btnCancel.style.padding = "0.4rem 0.85rem";
    btnCancel.style.borderRadius = "999px";
    btnCancel.style.border = "1px solid rgba(120, 200, 255, 0.22)";
    btnCancel.style.background = "rgba(8, 16, 28, 0.6)";
    btnCancel.style.color = "rgba(211, 233, 255, 0.85)";
    btnCancel.style.fontSize = "0.7rem";
    btnCancel.style.letterSpacing = "0.04em";
    btnCancel.addEventListener("mouseenter", () => {
      btnCancel.style.borderColor = "rgba(160, 220, 255, 0.45)";
      btnCancel.style.color = "#ffffff";
    });
    btnCancel.addEventListener("mouseleave", () => {
      btnCancel.style.borderColor = "rgba(120, 200, 255, 0.22)";
      btnCancel.style.color = "rgba(211, 233, 255, 0.85)";
    });
    btnCancel.addEventListener("click", () => {
      closeRigUnlockConsole();
    });
    actions.appendChild(btnCancel);

    const btnSubmit = document.createElement("button");
    btnSubmit.type = "submit";
    btnSubmit.textContent = "Unlock";
    btnSubmit.style.padding = "0.4rem 1rem";
    btnSubmit.style.borderRadius = "999px";
    btnSubmit.style.border = "1px solid rgba(120, 200, 255, 0.35)";
    btnSubmit.style.background = "rgba(20, 40, 64, 0.92)";
    btnSubmit.style.color = "#e7f6ff";
    btnSubmit.style.fontSize = "0.72rem";
    btnSubmit.style.letterSpacing = "0.08em";
    btnSubmit.style.textTransform = "uppercase";
    btnSubmit.style.cursor = "pointer";
    btnSubmit.addEventListener("mouseenter", () => {
      btnSubmit.style.background = "rgba(36, 78, 118, 0.95)";
      btnSubmit.style.borderColor = "rgba(170, 230, 255, 0.55)";
    });
    btnSubmit.addEventListener("mouseleave", () => {
      btnSubmit.style.background = "rgba(20, 40, 64, 0.92)";
      btnSubmit.style.borderColor = "rgba(120, 200, 255, 0.35)";
    });
    actions.appendChild(btnSubmit);

    const overlay = {
      root,
      input,
      open() {
        if (rigEditorUnlocked) return;
        if (!root.isConnected) {
          document.body.appendChild(root);
        }
        root.style.display = "flex";
        requestAnimationFrame(() => {
          try { input.focus(); input.select(); } catch (err) {}
        });
        document.addEventListener("keydown", overlay.escHandler);
      },
      close: closeRigUnlockConsole,
      escHandler(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeRigUnlockConsole();
        }
      }
    };

    root.addEventListener("click", (event) => {
      if (event.target === root) {
        closeRigUnlockConsole();
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (rigEditorUnlocked) {
        closeRigUnlockConsole();
        return;
      }
      const value = input.value.trim();
      if (value === RIG_UNLOCK_PHRASE) {
        closeRigUnlockConsole();
        setRigEditorUnlocked(true);
      } else {
        requestAnimationFrame(() => {
          try { input.focus(); input.select(); } catch (err) {}
        });
      }
    });

    rigUnlockOverlayCache = overlay;
    document.body.appendChild(root);
    return overlay;
  }

  function openRigUnlockConsole(options = {}) {
    const callback = typeof options?.onUnlock === "function" ? options.onUnlock : null;
    if (callback) {
      if (rigEditorUnlocked) {
        try { callback(); } catch (err) { console.warn("[HUD] Rig unlock callback failed", err); }
        return true;
      }
      rigUnlockWaiters.add(callback);
    }
    if (rigEditorUnlocked) return true;
    const overlay = ensureRigUnlockOverlay();
    overlay.open();
    return false;
  }

  function onRigEditorUnlock(callback) {
    if (typeof callback !== "function") return () => {};
    if (rigEditorUnlocked) {
      try { callback(); } catch (err) { console.warn("[HUD] Rig unlock listener failed", err); }
      return () => {};
    }
    rigUnlockWaiters.add(callback);
    return () => {
      rigUnlockWaiters.delete(callback);
    };
  }

  function callHx(method, ...args) {
    try {
      const api = window.HXH;
      if (!api || typeof api[method] !== "function") return null;
      return api[method](...args);
    } catch (err) {
      console.warn("[HUD] HXH call failed", err);
      return null;
    }
  }

  function getCosmeticConfig() {
    const cfg = window.RigDefinitions?.COSMETICS;
    return cfg && typeof cfg === "object" ? cfg : null;
  }

  function cloneValue(value) {
    if (!value) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      if (Array.isArray(value)) return value.slice();
      if (typeof value === "object") return { ...value };
      return value;
    }
  }

  function getCosmeticSelectionSnapshot() {
    const snapshot = callHx("getCosmeticSelection");
    if (snapshot && typeof snapshot === "object") return cloneValue(snapshot);
    const fallback = window.RigDefinitions?.DEFAULT_COSMETICS;
    if (fallback && typeof fallback === "object") return cloneValue(fallback);
    return { face: "", hair: "", outfit: { top: "", bottom: "", full: null }, shoes: "", accessories: [] };
  }

  function buildCosmeticTester({ dock, cardStyle, makeButton, cardMinWidth = 220 }) {
    const config = getCosmeticConfig();
    if (!dock || !config) return null;

    if (cosmeticTesterCache?.root?.isConnected && dock.contains(cosmeticTesterCache.root)) {
      cosmeticTesterCache.update();
      return cosmeticTesterCache;
    }

    if (cosmeticTesterCache?.root?.parentElement) {
      cosmeticTesterCache.root.parentElement.removeChild(cosmeticTesterCache.root);
    }

    const faces = Array.isArray(config.faces) ? config.faces.filter(spec => spec && spec.id) : [];
    const hair = Array.isArray(config.hair) ? config.hair.filter(spec => spec && spec.id) : [];
    const fullEntries = Object.entries(config.outfits?.full || {});
    const fullSpecs = fullEntries.map(([key, spec]) => ({ ...(spec || {}), id: spec?.id || key }));
    const shoeEntries = Object.entries(config.shoes || {});
    const shoeSpecs = shoeEntries.map(([key, spec]) => ({ ...(spec || {}), id: spec?.id || key }));
    const accessoryEntries = Object.entries(config.accessories || {});
    const accessorySpecs = accessoryEntries.map(([key, spec]) => ({ ...(spec || {}), id: spec?.id || key }));

    if (!faces.length && !hair.length && !fullSpecs.length && !shoeSpecs.length && !accessorySpecs.length) {
      cosmeticTesterCache = null;
      return null;
    }

    const card = document.createElement("div");
    cardStyle(card);
    card.classList.add("hud-cosmetic-card");
    if (typeof cardMinWidth === "number") {
      card.style.minWidth = cardMinWidth > 0 ? `${cardMinWidth}px` : "0";
    } else if (typeof cardMinWidth === "string" && cardMinWidth) {
      card.style.minWidth = cardMinWidth;
    } else {
      card.style.minWidth = "220px";
    }

    const title = document.createElement("strong");
    title.textContent = "Cosmetics (Test)";
    title.style.fontSize = "0.68rem";
    title.style.letterSpacing = "0.08em";
    title.style.textTransform = "uppercase";
    title.style.opacity = "0.8";
    card.appendChild(title);

    const row = document.createElement("div");
    row.className = "cosmetic-test-row";
    card.appendChild(row);

    let currentSelection = getCosmeticSelectionSnapshot();
    const supportsAnchorNudge = typeof window.HXH?.getCosmeticAnchor === "function"
      && typeof window.HXH?.adjustCosmeticAnchor === "function"
      && typeof window.HXH?.resetCosmeticAnchor === "function";
    let nudgeKind = faces.length ? "face" : (hair.length ? "hair" : "");
    const nudgeButtons = [];
    let nudgeCard = null;
    let nudgeStatus = null;
    let nudgeItemLabel = null;
    let nudgeTargetSelect = null;

    const faceIds = faces.map(spec => spec.id);
    const faceMap = new Map(faces.map(spec => [spec.id, spec]));
    const hairIds = hair.map(spec => spec.id);
    const hairMap = new Map(hair.map(spec => [spec.id, spec]));
    const fullIds = fullSpecs.map(spec => spec.id);
    const fullMap = new Map(fullSpecs.map(spec => [spec.id, spec]));
    const shoeIds = shoeSpecs.map(spec => spec.id);
    const shoeMap = new Map(shoeSpecs.map(spec => [spec.id, spec]));
    const accessoryMap = new Map(accessorySpecs.map(spec => [spec.id, spec]));

    const accessoryCombosRaw = [];
    accessoryCombosRaw.push([]);
    if (accessorySpecs[0]) accessoryCombosRaw.push([accessorySpecs[0].id]);
    if (accessorySpecs[1]) accessoryCombosRaw.push([accessorySpecs[1].id]);
    if (accessorySpecs[0] && accessorySpecs[1]) accessoryCombosRaw.push([accessorySpecs[0].id, accessorySpecs[1].id]);
    if (accessorySpecs[2]) accessoryCombosRaw.push([accessorySpecs[2].id]);
    const seenCombo = new Set();
    const accessoryCombos = accessoryCombosRaw
      .map(combo => combo.filter(id => accessoryMap.has(id)))
      .map(combo => combo.slice().sort())
      .filter(combo => {
        const key = combo.join("|");
        if (seenCombo.has(key)) return false;
        seenCombo.add(key);
        return true;
      });

    let faceIndex = 0;
    let hairIndex = 0;
    let fullIndex = 0;
    let shoeIndex = 0;
    let accIndex = 0;
    let outfitCustom = false;
    let accessoriesCustom = false;

    const faceBtn = faces.length ? makeButton("Face") : null;
    const hairBtn = hair.length ? makeButton("Hair") : null;
    const outfitBtn = fullSpecs.length ? makeButton("Outfit") : null;
    const shoeBtn = shoeSpecs.length ? makeButton("Shoes") : null;
    const accessoryBtn = accessoryCombos.length ? makeButton("Accessories") : null;

    [faceBtn, hairBtn, outfitBtn, shoeBtn, accessoryBtn].forEach(btn => {
      if (!btn) return;
      btn.style.minWidth = "140px";
      btn.style.justifyContent = "center";
      row.appendChild(btn);
    });

    function labelFromMap(map, id, fallback = id || "—") {
      const spec = id ? map.get(id) : null;
      return spec?.label || fallback;
    }

    function getItemLabel(kind, id) {
      if (!id) return "Default";
      if (kind === "face") return labelFromMap(faceMap, id, id);
      if (kind === "hair") return labelFromMap(hairMap, id, id);
      return id;
    }

    function getActiveId(kind) {
      if (kind === "face") {
        const selected = typeof currentSelection?.face === "string" ? currentSelection.face : "";
        if (selected && faceMap.has(selected)) return selected;
        return faceIds[faceIndex] || "";
      }
      if (kind === "hair") {
        const selected = typeof currentSelection?.hair === "string" ? currentSelection.hair : "";
        if (selected && hairMap.has(selected)) return selected;
        return hairIds[hairIndex] || "";
      }
      return "";
    }

    function formatDelta(value, decimals = 2) {
      const num = Number(value);
      if (!Number.isFinite(num)) return (0).toFixed(decimals);
      return num.toFixed(decimals);
    }

    function handleAnchorNudge(targetKey, axis, step) {
      if (!nudgeKind) return;
      const id = getActiveId(nudgeKind);
      if (!id) return;
      const payload = { [targetKey]: { [axis]: step } };
      callHx("adjustCosmeticAnchor", nudgeKind, id, payload);
      updateNudgeState();
    }

    function handleAnchorReset() {
      if (!nudgeKind) return;
      const id = getActiveId(nudgeKind);
      if (!id) return;
      callHx("resetCosmeticAnchor", nudgeKind, id);
      updateNudgeState();
    }

    function makeAxisControls({ label, step, targetKey, unit = "" }) {
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.gap = "0.3rem";

      const title = document.createElement("span");
      title.textContent = label;
      title.style.fontSize = "0.68rem";
      title.style.opacity = "0.8";
      wrap.appendChild(title);

      const axes = [
        { key: "x", label: "X" },
        { key: "y", label: "Y" },
        { key: "z", label: "Z" }
      ];

      axes.forEach(axis => {
        const rowEl = document.createElement("div");
        rowEl.style.display = "flex";
        rowEl.style.alignItems = "center";
        rowEl.style.gap = "0.35rem";

        const axisLabel = document.createElement("span");
        axisLabel.textContent = axis.label;
        axisLabel.style.width = "1.2rem";
        axisLabel.style.opacity = "0.72";
        rowEl.appendChild(axisLabel);

        const minus = document.createElement("button");
        minus.type = "button";
        minus.textContent = "−";
        minus.style.width = "26px";
        minus.style.height = "26px";
        minus.style.lineHeight = "1";
        minus.title = `-${step}${unit ? ` ${unit}` : ""}`;
        minus.addEventListener("click", () => handleAnchorNudge(targetKey, axis.key, -step));
        rowEl.appendChild(minus);
        nudgeButtons.push(minus);

        const plus = document.createElement("button");
        plus.type = "button";
        plus.textContent = "+";
        plus.style.width = "26px";
        plus.style.height = "26px";
        plus.style.lineHeight = "1";
        plus.title = `+${step}${unit ? ` ${unit}` : ""}`;
        plus.addEventListener("click", () => handleAnchorNudge(targetKey, axis.key, step));
        rowEl.appendChild(plus);
        nudgeButtons.push(plus);

        wrap.appendChild(rowEl);
      });

      return wrap;
    }

    function updateNudgeState() {
      if (!nudgeCard) return;
      if (nudgeKind === "face" && !faces.length) {
        nudgeKind = hair.length ? "hair" : "";
      }
      if (nudgeKind === "hair" && !hair.length) {
        nudgeKind = faces.length ? "face" : "";
      }
      if (nudgeTargetSelect) {
        nudgeTargetSelect.value = nudgeKind || "";
      }
      const id = nudgeKind ? getActiveId(nudgeKind) : "";
      const hasTarget = Boolean(nudgeKind && id);
      nudgeButtons.forEach(btn => { btn.disabled = !hasTarget; });
      if (nudgeItemLabel) {
        if (hasTarget) {
          const kindLabel = nudgeKind === "face" ? "Face" : "Hair";
          nudgeItemLabel.textContent = `${kindLabel}: ${getItemLabel(nudgeKind, id)}`;
        } else {
          nudgeItemLabel.textContent = "Adjust: —";
        }
      }
      if (!hasTarget) {
        if (nudgeStatus) nudgeStatus.textContent = "Select a face or hair item to adjust.";
        return;
      }
      const snapshot = callHx("getCosmeticAnchor", nudgeKind, id);
      if (!snapshot || typeof snapshot !== "object") {
        if (nudgeStatus) nudgeStatus.textContent = "Anchor data unavailable.";
        return;
      }
      const override = snapshot.override || {};
      const pos = override.localPos || {};
      const rot = override.localRot || {};
      const scale = override.localScale || {};
      const socket = snapshot.headSocket || override.headSocket || snapshot.base?.headSocket || "origin";
      const posText = `(${formatDelta(pos.x)}, ${formatDelta(pos.y)}, ${formatDelta(pos.z)})`;
      const rotText = `(${formatDelta(rot.x, 1)}, ${formatDelta(rot.y, 1)}, ${formatDelta(rot.z, 1)})`;
      const scaleText = `(${formatDelta(scale.x)}, ${formatDelta(scale.y)}, ${formatDelta(scale.z)})`;
      if (nudgeStatus) {
        nudgeStatus.textContent = `Socket: ${socket}\nΔPos ${posText}\nΔRot ${rotText}\nΔScale ${scaleText}`;
      }
    }

    function formatAccessories(ids = []) {
      if (!ids.length) return "None";
      const names = ids.map(id => labelFromMap(accessoryMap, id, id));
      return names.join(" + ");
    }

    function syncIndices(selection = {}) {
      if (selection.face && faceIds.includes(selection.face)) faceIndex = faceIds.indexOf(selection.face);
      if (selection.hair && hairIds.includes(selection.hair)) hairIndex = hairIds.indexOf(selection.hair);
      if (selection.shoes && shoeIds.includes(selection.shoes)) shoeIndex = shoeIds.indexOf(selection.shoes);

      outfitCustom = true;
      if (selection.outfit && selection.outfit.full && fullIds.includes(selection.outfit.full)) {
        fullIndex = fullIds.indexOf(selection.outfit.full);
        outfitCustom = false;
      }

      accessoriesCustom = true;
      const selAcc = Array.isArray(selection.accessories) ? selection.accessories.slice().sort() : [];
      for (let i = 0; i < accessoryCombos.length; i += 1) {
        const combo = accessoryCombos[i];
        if (combo.length === selAcc.length && combo.every((id, idx) => id === selAcc[idx])) {
          accIndex = i;
          accessoriesCustom = false;
          break;
        }
      }
      if (accessoriesCustom) accIndex = 0;
    }

    function update(selectionOverride) {
      const selection = selectionOverride && typeof selectionOverride === "object"
        ? selectionOverride
        : getCosmeticSelectionSnapshot();
      currentSelection = selection ? cloneValue(selection) : currentSelection;
      syncIndices(selection);

      if (faceBtn) faceBtn.textContent = `Face: ${labelFromMap(faceMap, faceIds[faceIndex], "Default")}`;
      if (hairBtn) hairBtn.textContent = `Hair: ${labelFromMap(hairMap, hairIds[hairIndex], "Default")}`;
      if (outfitBtn) {
        outfitBtn.textContent = outfitCustom
          ? "Outfit: Custom"
          : `Outfit: ${labelFromMap(fullMap, fullIds[fullIndex], "Preset")}`;
      }
      if (shoeBtn) shoeBtn.textContent = `Shoes: ${labelFromMap(shoeMap, shoeIds[shoeIndex], "Default")}`;
      if (accessoryBtn) {
        accessoryBtn.textContent = accessoriesCustom
          ? "Accessories: Mixed"
          : `Accessories: ${formatAccessories(accessoryCombos[accIndex] || [])}`;
      }
      updateNudgeState();
    }

    if (faceBtn && faceIds.length) {
      faceBtn.addEventListener("click", () => {
        faceIndex = (faceIndex + 1) % faceIds.length;
        const id = faceIds[faceIndex];
        callHx("setFace", id);
        update();
      });
    }

    if (hairBtn && hairIds.length) {
      hairBtn.addEventListener("click", () => {
        hairIndex = (hairIndex + 1) % hairIds.length;
        const id = hairIds[hairIndex];
        callHx("setHair", id);
        update();
      });
    }

    if (outfitBtn && fullIds.length) {
      outfitBtn.addEventListener("click", () => {
        fullIndex = (fullIndex + 1) % fullIds.length;
        const id = fullIds[fullIndex];
        callHx("setOutfit", { full: id });
        update();
      });
    }

    if (shoeBtn && shoeIds.length) {
      shoeBtn.addEventListener("click", () => {
        shoeIndex = (shoeIndex + 1) % shoeIds.length;
        const id = shoeIds[shoeIndex];
        callHx("setShoes", id);
        update();
      });
    }

    if (accessoryBtn && accessoryCombos.length) {
      accessoryBtn.addEventListener("click", () => {
        accIndex = (accIndex + 1) % accessoryCombos.length;
        const combo = accessoryCombos[accIndex] || [];
        callHx("setAccessories", combo.slice());
        update();
      });
    }

    if (supportsAnchorNudge && (faceIds.length || hairIds.length)) {
      nudgeCard = document.createElement("div");
      nudgeCard.style.display = "flex";
      nudgeCard.style.flexDirection = "column";
      nudgeCard.style.gap = "0.5rem";
      nudgeCard.style.marginTop = "0.6rem";
      nudgeCard.style.padding = "0.6rem";
      nudgeCard.style.background = "rgba(10, 18, 30, 0.6)";
      nudgeCard.style.border = "1px solid rgba(110, 190, 255, 0.2)";
      nudgeCard.style.borderRadius = "10px";

      const nudgeTitle = document.createElement("strong");
      nudgeTitle.textContent = "Anchor Nudge";
      nudgeTitle.style.fontSize = "0.66rem";
      nudgeTitle.style.letterSpacing = "0.08em";
      nudgeTitle.style.textTransform = "uppercase";
      nudgeTitle.style.opacity = "0.8";
      nudgeCard.appendChild(nudgeTitle);

      const targetRow = document.createElement("div");
      targetRow.style.display = "flex";
      targetRow.style.alignItems = "center";
      targetRow.style.gap = "0.4rem";

      const targetLabel = document.createElement("span");
      targetLabel.textContent = "Target";
      targetLabel.style.fontSize = "0.68rem";
      targetLabel.style.opacity = "0.78";
      targetRow.appendChild(targetLabel);

      nudgeTargetSelect = document.createElement("select");
      nudgeTargetSelect.style.flex = "1";
      nudgeTargetSelect.style.padding = "0.25rem 0.35rem";
      nudgeTargetSelect.style.background = "rgba(18, 28, 44, 0.85)";
      nudgeTargetSelect.style.border = "1px solid rgba(110, 190, 255, 0.25)";
      nudgeTargetSelect.style.borderRadius = "6px";
      nudgeTargetSelect.style.color = "#e6f4ff";
      nudgeTargetSelect.style.fontSize = "0.68rem";
      nudgeTargetSelect.style.cursor = "pointer";

      if (faces.length) {
        const option = document.createElement("option");
        option.value = "face";
        option.textContent = "Face";
        nudgeTargetSelect.appendChild(option);
      }
      if (hair.length) {
        const option = document.createElement("option");
        option.value = "hair";
        option.textContent = "Hair";
        nudgeTargetSelect.appendChild(option);
      }
      if (!nudgeKind) {
        nudgeKind = faces.length ? "face" : (hair.length ? "hair" : "");
      }
      nudgeTargetSelect.value = nudgeKind || (faces.length ? "face" : "hair");
      nudgeTargetSelect.addEventListener("change", () => {
        nudgeKind = nudgeTargetSelect.value;
        updateNudgeState();
      });

      targetRow.appendChild(nudgeTargetSelect);
      nudgeCard.appendChild(targetRow);

      nudgeItemLabel = document.createElement("div");
      nudgeItemLabel.style.fontSize = "0.7rem";
      nudgeItemLabel.style.opacity = "0.82";
      nudgeCard.appendChild(nudgeItemLabel);

      const controlGrid = document.createElement("div");
      controlGrid.style.display = "grid";
      controlGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(120px, 1fr))";
      controlGrid.style.gap = "0.5rem";

      controlGrid.appendChild(makeAxisControls({ label: "Position Δ (m)", step: 0.01, targetKey: "localPos" }));
      controlGrid.appendChild(makeAxisControls({ label: "Rotation Δ (°)", step: 1, targetKey: "localRot", unit: "deg" }));
      controlGrid.appendChild(makeAxisControls({ label: "Scale Δ", step: 0.05, targetKey: "localScale" }));

      nudgeCard.appendChild(controlGrid);

      const resetRow = document.createElement("div");
      resetRow.style.display = "flex";
      resetRow.style.justifyContent = "flex-start";

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.textContent = "Reset Offsets";
      resetBtn.style.padding = "0.35rem 0.6rem";
      resetBtn.style.fontSize = "0.68rem";
      resetBtn.style.borderRadius = "6px";
      resetBtn.addEventListener("click", handleAnchorReset);
      resetRow.appendChild(resetBtn);
      nudgeButtons.push(resetBtn);

      nudgeCard.appendChild(resetRow);

      nudgeStatus = document.createElement("div");
      nudgeStatus.style.fontSize = "0.66rem";
      nudgeStatus.style.opacity = "0.8";
      nudgeStatus.style.whiteSpace = "pre-wrap";
      nudgeCard.appendChild(nudgeStatus);

      card.appendChild(nudgeCard);
    }

    dock.appendChild(card);
    cosmeticTesterCache = { root: card, update };
    update();
    return cosmeticTesterCache;
  }

  function refreshCosmeticTester(selection) {
    if (cosmeticTesterCache?.update) {
      cosmeticTesterCache.update(selection);
    }
  }

  const performanceTargetListeners = new Set();
  let dynamicResolutionState = { enabled: false, minScale: 0.7, currentScale: 1 };
  const PERF_SETTINGS_KEY = "hxh-perf-settings";
  const dynamicResolutionListeners = new Set();
  let adaptiveQualityLabel = "High";
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  (function hydratePerfPreferences() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(PERF_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.qualityLabel === "string" && parsed.qualityLabel.trim()) {
        adaptiveQualityLabel = parsed.qualityLabel.trim();
      }
      const dyn = parsed.dynamic && typeof parsed.dynamic === "object" ? parsed.dynamic : {};
      if (typeof dyn.enabled === "boolean") {
        dynamicResolutionState.enabled = dyn.enabled;
      }
      if (Number.isFinite(dyn.minScale)) {
        dynamicResolutionState.minScale = clamp(dyn.minScale, 0.5, 1);
      }
      let storedScale = Number.isFinite(dyn.currentScale) ? clamp(dyn.currentScale, 0.3, 1) : null;
      if (dynamicResolutionState.enabled) {
        const target = storedScale != null ? Math.max(storedScale, dynamicResolutionState.minScale) : dynamicResolutionState.minScale;
        dynamicResolutionState.currentScale = clamp(target, dynamicResolutionState.minScale, 1);
      } else {
        dynamicResolutionState.currentScale = 1;
      }
    } catch (err) {}
  })();
  let helpOverlayCache = null;
  let logOverlayCache = null;
  let devPanelCache = null;
  let devPanelVisible = false;
  let devPanelHandlers = {
    toggleAura: () => {},
    setEnRadius: () => {},
    spawnDummy: () => {},
    refill: () => {},
    toggleRearView: () => {}
  };

  const DEV_BUILD = (() => {
    if (typeof window === "undefined") return false;
    if (typeof window.__HXH_DEV__ === "boolean") return window.__HXH_DEV__;
    if (typeof window.DEV_MODE === "boolean") return window.DEV_MODE;
    const host = window.location?.hostname || "";
    if (!host) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return true;
    return host.endsWith(".local");
  })();

  let profilerOverlayCache = null;
  let profilerOverlayVisible = false;
  let profilerOverlayHandlers = {
    onToggleLod: () => {},
    onInstanceModeChange: () => {},
    onGreedyChange: () => {},
    onDynamicResolutionChange: () => {},
    onChunkRadiusChange: () => {},
    onChunkRadiusReset: () => {}
  };

  const TRAINING_SPECS = [
    {
      key: "renHold",
      title: "Ren Hold Meter",
      description: "Hold the channel button and release while the charge is within the glowing band.",
      effect: (caps = {}) => {
        const hold = Number.isFinite(caps.renDurationCap) ? caps.renDurationCap.toFixed(1) : "6.0";
        const regen = Number.isFinite(caps.renRecoveryRate) ? caps.renRecoveryRate.toFixed(1) : "1.5";
        return `Hold cap ${hold}s • Regen ${regen}s/s`;
      },
      run: runRenHoldMinigame
    },
    {
      key: "gyoFocus",
      title: "Gyo Numbers",
      description: "Tap the glowing numbers in ascending order before the timer expires.",
      effect: (caps = {}) => {
        const cap = Number.isFinite(caps.gyoCritCap) ? Math.round(caps.gyoCritCap * 100) : 12;
        const scale = Number.isFinite(caps.gyoCritScale) ? Math.round(caps.gyoCritScale * 1000) / 10 : 1.2;
        return `Crit window +${cap}% • +${scale}% per Focus`;
      },
      run: runGyoNumbersMinigame
    },
    {
      key: "ryuDrill",
      title: "Ryu Drill",
      description: "Match your limb distribution to the target percentages within the tolerance window.",
      effect: (caps = {}) => {
        const vuln = Number.isFinite(caps.ryuVulnFactor) ? Math.round((1 - caps.ryuVulnFactor) * 100) : 0;
        const guard = Number.isFinite(caps.ryuGuardBonus) ? Math.round(caps.ryuGuardBonus * 100) : 0;
        return `Ko vuln -${vuln}% • Guard bonus +${guard}%`;
      },
      run: runRyuDrillMinigame
    },
    {
      key: "shuEfficiency",
      title: "Shu Rock Test",
      description: "Shatter the stone before time runs out by striking with controlled bursts.",
      effect: (caps = {}) => {
        const dmg = Number.isFinite(caps.shuDamageMul) ? Math.round((caps.shuDamageMul - 1) * 100) : 30;
        const dura = Number.isFinite(caps.shuDurabilityScalar) ? Math.round((1 - caps.shuDurabilityScalar) * 100) : 35;
        const pierce = Number.isFinite(caps.shuPierce) ? caps.shuPierce : 1;
        return `Damage +${dmg}% • Durability saved ${dura}% • Pierce ${pierce}`;
      },
      run: runShuRockMinigame
    }
  ];

  function shuffleArray(arr = []) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

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
    const center = document.getElementById("hud-bottom-center");
    if (!center) return null;
    if (hotbarCache && hotbarCache.root && center.contains(hotbarCache.root)) {
      return hotbarCache;
    }

    let container = center.querySelector("#hud-hotbar");
    if (!container) {
      container = document.createElement("div");
      container.id = "hud-hotbar";
      center.appendChild(container);
    } else {
      container.innerHTML = "";
    }

    container.classList.add("hud-hotbar");
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(9, minmax(0, 1fr))";
    container.style.gap = "0.35rem";
    container.style.marginTop = "0";
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

  function ensureGrudgeStyles() {
    if (grudgeStyleInjected) return;
    const css = `
      #hud .hud-grudge-wrap {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin-top: 0.1rem;
        pointer-events: auto;
      }
      #hud .hud-grudge-wrap .bar.grudge {
        position: relative;
        background: #1a2744;
      }
      #hud .hud-grudge-wrap .bar.grudge > span {
        display: block;
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #3f2256 0%, #6a3f76 55%, #a07aa9 100%);
        box-shadow: 0 0 14px rgba(150, 96, 196, 0.35);
        transition: width 140ms ease;
      }
      #hud .hud-grudge-wrap.full .bar.grudge > span {
        box-shadow: 0 0 18px rgba(198, 146, 255, 0.55);
      }
      #hud .hud-grudge-wrap.cursed .bar.grudge > span {
        background: linear-gradient(90deg, #4c285f 0%, #86448f 55%, #d4a0dc 100%);
      }
      #hud .hud-grudge-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.72rem;
        letter-spacing: 0.05em;
        color: rgba(220, 208, 255, 0.72);
      }
      #hud .hud-grudge-label {
        opacity: 0.82;
        font-weight: 500;
      }
      #hud .hud-grudge-value {
        font-size: 0.78rem;
        font-weight: 600;
        color: #f4eaff;
      }
      #hud .hud-grudge-status {
        display: none;
        align-items: center;
        gap: 0.45rem;
        flex-wrap: wrap;
        font-size: 0.68rem;
        color: rgba(235, 222, 255, 0.82);
      }
      #hud .hud-grudge-wrap.show-action .hud-grudge-status {
        display: flex;
      }
      #hud .hud-grudge-curse {
        display: none;
        align-items: center;
        gap: 0.3rem;
        padding: 0.12rem 0.45rem;
        border-radius: 999px;
        border: 1px solid rgba(198, 146, 255, 0.55);
        background: rgba(110, 70, 150, 0.35);
        color: #f5ecff;
        font-size: 0.66rem;
        letter-spacing: 0.05em;
      }
      #hud .hud-grudge-wrap.cursed .hud-grudge-curse {
        display: inline-flex;
      }
      #hud .hud-grudge-action {
        padding: 0.25rem 0.65rem;
        border-radius: 999px;
        border: 1px solid rgba(186, 142, 255, 0.45);
        background: rgba(32, 20, 52, 0.78);
        color: #efe2ff;
        font-size: 0.68rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        cursor: pointer;
        transition: background-color 120ms ease, border-color 140ms ease, opacity 120ms ease;
      }
      #hud .hud-grudge-action:disabled {
        cursor: default;
        opacity: 0.55;
        border-color: rgba(255,255,255,0.16);
      }
      #hud .hud-grudge-hint {
        display: none;
        font-size: 0.68rem;
        letter-spacing: 0.03em;
        color: rgba(227, 215, 255, 0.68);
        line-height: 1.3;
      }
      #hud .hud-grudge-wrap.has-hint .hud-grudge-hint {
        display: block;
      }
    `;
    const style = document.createElement("style");
    style.id = "hud-grudge-style";
    style.textContent = css;
    ensureHead()?.appendChild(style);
    grudgeStyleInjected = true;
  }

  function ensureGrudgeWidget() {
    ensureGrudgeStyles();
    const hudRoot = ensureHudRoot();
    const hudRight = hudRoot?.querySelector?.(".hud-right") || document.querySelector?.("#hud .hud-right") || null;
    if (!hudRight) return null;
    if (grudgeWidgetCache && grudgeWidgetCache.root && hudRight.contains(grudgeWidgetCache.root)) {
      return grudgeWidgetCache;
    }

    let widget = document.getElementById("hud-grudge");
    if (!widget || !hudRight.contains(widget)) {
      widget = document.createElement("div");
      widget.id = "hud-grudge";
      widget.className = "hud-grudge-wrap";

      const bar = document.createElement("div");
      bar.className = "bar grudge hud-grudge-bar";
      const fill = document.createElement("span");
      fill.style.width = "0%";
      bar.appendChild(fill);

      const meta = document.createElement("div");
      meta.className = "hud-grudge-meta";
      const label = document.createElement("span");
      label.className = "hud-grudge-label";
      label.textContent = "Grudge Bar";
      const value = document.createElement("strong");
      value.className = "hud-grudge-value";
      value.textContent = "0%";
      meta.appendChild(label);
      meta.appendChild(value);

      const status = document.createElement("div");
      status.className = "hud-grudge-status";
      const curse = document.createElement("span");
      curse.className = "hud-grudge-curse";
      curse.textContent = "";
      const action = document.createElement("button");
      action.type = "button";
      action.className = "hud-grudge-action";
      action.textContent = "Exorcise";
      action.disabled = true;
      status.appendChild(curse);
      status.appendChild(action);

      const hint = document.createElement("div");
      hint.className = "hud-grudge-hint";
      hint.textContent = "";

      widget.appendChild(bar);
      widget.appendChild(meta);
      widget.appendChild(status);
      widget.appendChild(hint);
      hudRight.appendChild(widget);
    }

    const fill = widget.querySelector?.(".hud-grudge-bar > span");
    const value = widget.querySelector?.(".hud-grudge-value");
    const curse = widget.querySelector?.(".hud-grudge-curse");
    const action = widget.querySelector?.(".hud-grudge-action");
    const hint = widget.querySelector?.(".hud-grudge-hint");
    const status = widget.querySelector?.(".hud-grudge-status");
    if (!fill || !value || !curse || !action || !hint || !status) {
      return null;
    }

    if (!fill.style.width) {
      fill.style.width = "0%";
    }

    grudgeWidgetCache = {
      root: widget,
      valueEl: value,
      fillEl: fill,
      curseEl: curse,
      questEl: hint,
      button: action,
      last: null
    };
    return grudgeWidgetCache;
  }

  function updateGrudgeWidget({
    value = 0,
    max = 100,
    full = false,
    charges = 0,
    cursed = false,
    curseLabel = "",
    curseStacks = 0,
    questHint = "",
    slowPct = 0
  } = {}) {
    const widget = ensureGrudgeWidget();
    if (!widget) return;
    const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const pctText = `${Math.round(pct * 100)}%`;
    if (!widget.last || widget.last.pctText !== pctText) {
      widget.valueEl.textContent = pctText;
    }
    if (!widget.last || widget.last.pct !== pct) {
      widget.fillEl.style.width = `${pct * 100}%`;
    }
    widget.root.classList.toggle("full", !!full);
    widget.root.classList.toggle("cursed", !!cursed);
    const label = curseLabel || (cursed ? `Lingering Curse${curseStacks > 1 ? ` x${curseStacks}` : ""}` : "");
    if (!widget.last || widget.last.curseLabel !== label) {
      widget.curseEl.textContent = label;
    }
    const slowText = cursed && slowPct > 0 ? `Slow -${Math.round(slowPct * 100)}%` : "";
    const questText = questHint || slowText;
    if (!widget.last || widget.last.questText !== questText) {
      widget.questEl.textContent = questText;
    }
    widget.root.classList.toggle("has-hint", !!questText);
    const hasCharges = Number.isFinite(charges) && charges > 0;
    const showAction = !!cursed || hasCharges;
    widget.root.classList.toggle("show-action", showAction);
    const btnLabel = hasCharges ? `Exorcise (${Math.round(charges)})` : "Exorcise";
    if (!widget.last || widget.last.btnLabel !== btnLabel) {
      widget.button.textContent = btnLabel;
    }
    widget.button.disabled = !hasCharges || !cursed;
    widget.button.title = !cursed
      ? "No lingering curse detected."
      : hasCharges
        ? "Use an exorcism charm to purge lingering curses."
        : "Acquire an exorcism charm to purge this curse.";
    widget.last = {
      pct,
      pctText,
      curseLabel: label,
      questText,
      btnLabel,
      charges,
      showAction,
      hasHint: !!questText,
      cursed,
      full,
      slowPct
    };
  }

  function bindGrudgeExorcise(handler) {
    const widget = ensureGrudgeWidget();
    if (!widget) return () => {};
    const button = widget.button;
    const listener = (event) => {
      event.preventDefault();
      handler?.(event);
    };
    button.addEventListener("click", listener);
    return () => button.removeEventListener("click", listener);
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

  function ensureControlDock() {
    const left = document.getElementById("hud-bottom-left");
    if (!left) return null;
    if (controlDockCache?.root?.isConnected && left.contains(controlDockCache.root)) {
      return controlDockCache;
    }
    let dock = left.querySelector?.("#hud-control-dock") || null;
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "hud-control-dock";
      left.appendChild(dock);
    } else {
      dock.innerHTML = "";
    }
    dock.style.display = "flex";
    dock.style.gap = "0.5rem";
    dock.style.flexWrap = "wrap";
    dock.style.justifyContent = "flex-start";
    dock.style.pointerEvents = "auto";
    dock.style.alignItems = "center";

    const makeButton = (label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.padding = "0.35rem 0.75rem";
      btn.style.borderRadius = "999px";
      btn.style.border = "1px solid rgba(120, 200, 255, 0.35)";
      btn.style.background = "rgba(16, 26, 40, 0.85)";
      btn.style.color = "#e9f6ff";
      btn.style.fontSize = "0.72rem";
      btn.style.letterSpacing = "0.04em";
      btn.style.cursor = "pointer";
      btn.style.transition = "background-color 0.18s ease, border-color 0.18s ease";
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(26, 46, 70, 0.9)";
        btn.style.borderColor = "rgba(160, 220, 255, 0.55)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(16, 26, 40, 0.85)";
        btn.style.borderColor = "rgba(120, 200, 255, 0.35)";
      });
      return btn;
    };

    const cluster = document.createElement("div");
    cluster.style.display = "flex";
    cluster.style.flexWrap = "wrap";
    cluster.style.alignItems = "center";
    cluster.style.gap = "0.4rem";

    const qualityBadge = document.createElement("span");
    qualityBadge.style.padding = "0.35rem 0.7rem";
    qualityBadge.style.borderRadius = "999px";
    qualityBadge.style.border = "1px solid rgba(120, 200, 255, 0.32)";
    qualityBadge.style.background = "rgba(16, 28, 44, 0.8)";
    qualityBadge.style.color = "#e0f3ff";
    qualityBadge.style.fontSize = "0.68rem";
    qualityBadge.style.letterSpacing = "0.06em";
    qualityBadge.style.textTransform = "uppercase";
    qualityBadge.textContent = `Quality: ${adaptiveQualityLabel}`;
    cluster.appendChild(qualityBadge);

    const btnWrap = document.createElement("div");
    btnWrap.style.display = "flex";
    btnWrap.style.flexWrap = "wrap";
    btnWrap.style.gap = "0.35rem";
    btnWrap.style.alignItems = "center";

    const btnHelp = makeButton("Help");
    btnHelp.title = "Open the hunter field manual.";
    btnHelp.addEventListener("click", () => openHelpOverlay());
    btnWrap.appendChild(btnHelp);

    const btnLog = makeButton("Log");
    btnLog.title = "View the latest feature log and mechanics summary.";
    btnLog.addEventListener("click", () => openLogOverlay());
    btnWrap.appendChild(btnLog);

    const btnUnlock = makeButton(rigEditorUnlocked ? "Console ✓" : "Console");
    btnUnlock.title = rigEditorUnlocked
      ? "Rig Editor access granted for this session."
      : "Open the access console.";
    btnUnlock.addEventListener("click", () => openRigUnlockConsole());
    btnWrap.appendChild(btnUnlock);

    cluster.appendChild(btnWrap);
    dock.appendChild(cluster);

    controlDockCache = {
      root: dock,
      btnHelp,
      btnLog,
      rigUnlockButton: btnUnlock,
      qualityBadge
    };

    setAdaptiveQualityStatus({
      qualityLabel: adaptiveQualityLabel,
      dynamicScale: dynamicResolutionState.currentScale,
      dynamicEnabled: dynamicResolutionState.enabled,
      minScale: dynamicResolutionState.minScale
    });
    return controlDockCache;
  }

  function notifyPerformanceTargetChange(value) {
    performanceTargetListeners.forEach((listener) => {
      try {
        listener(value);
      } catch (err) {
        console.warn("[HUD] Performance target listener failed", err);
      }
    });
  }

  function setPerformanceTarget(value, { emit = false } = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return performanceTargetValue;
    const clamped = clamp(Math.round(numeric), 30, 120);
    performanceTargetValue = clamped;
    if (devPanelCache?.perfSlider) devPanelCache.perfSlider.value = String(clamped);
    if (devPanelCache?.perfValue) devPanelCache.perfValue.textContent = `${clamped} FPS`;
    if (emit) notifyPerformanceTargetChange(clamped);
    return clamped;
  }

  function onPerformanceTargetChange(callback) {
    if (typeof callback !== "function") return () => {};
    performanceTargetListeners.add(callback);
    return () => performanceTargetListeners.delete(callback);
  }

  function offPerformanceTargetChange(callback) {
    if (typeof callback !== "function") return;
    performanceTargetListeners.delete(callback);
  }

  function notifyDynamicResolutionChange(state) {
    dynamicResolutionListeners.forEach((listener) => {
      try {
        listener({ ...state });
      } catch (err) {
        console.warn("[HUD] Dynamic resolution listener failed", err);
      }
    });
  }

  function setDynamicResolutionUI(next = {}, { emit = false } = {}) {
    const state = { ...dynamicResolutionState };
    if (typeof next.enabled === "boolean") state.enabled = next.enabled;
    if (Number.isFinite(next.minScale)) state.minScale = clamp(next.minScale, 0.5, 1);
    if (Number.isFinite(next.currentScale)) state.currentScale = clamp(next.currentScale, 0.3, 1);
    if (state.enabled && state.currentScale < state.minScale) {
      state.currentScale = state.minScale;
    }
    dynamicResolutionState = state;
    if (devPanelCache?.dynToggle) devPanelCache.dynToggle.checked = state.enabled;
    if (devPanelCache?.dynSlider) {
      devPanelCache.dynSlider.disabled = !state.enabled;
      devPanelCache.dynSlider.value = state.minScale.toFixed(2);
    }
    if (devPanelCache?.dynValue) devPanelCache.dynValue.textContent = `Min ${Math.round(state.minScale * 100)}%`;
    if (devPanelCache?.dynCurrent) devPanelCache.dynCurrent.textContent = `Current: ${Math.round(state.currentScale * 100)}%`;
    if (emit) notifyDynamicResolutionChange(state);
    return state;
  }

  function onDynamicResolutionChange(callback) {
    if (typeof callback !== "function") return () => {};
    dynamicResolutionListeners.add(callback);
    return () => dynamicResolutionListeners.delete(callback);
  }

  function offDynamicResolutionChange(callback) {
    if (typeof callback !== "function") return;
    dynamicResolutionListeners.delete(callback);
  }

  function setAdaptiveQualityStatus(status = {}) {
    if (status && typeof status === "object") {
      if (typeof status.qualityLabel === "string") {
        adaptiveQualityLabel = status.qualityLabel.trim() || "High";
        if (controlDockCache?.qualityBadge) {
          controlDockCache.qualityBadge.textContent = `Quality: ${adaptiveQualityLabel}`;
        }
      }
      const dyn = {};
      let hasDyn = false;
      if (typeof status.dynamicEnabled === "boolean") {
        dyn.enabled = status.dynamicEnabled;
        hasDyn = true;
      }
      if (Number.isFinite(status.minScale)) {
        dyn.minScale = status.minScale;
        hasDyn = true;
      }
      if (Number.isFinite(status.dynamicScale)) {
        dyn.currentScale = status.dynamicScale;
        hasDyn = true;
      }
      if (hasDyn) {
        setDynamicResolutionUI(dyn, { emit: false });
      }
    }
  }

  function createOverlayModal(id, titleText) {
    const root = ensureHudRoot();
    if (!root) return null;
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(6, 10, 18, 0.78)";
    overlay.style.backdropFilter = "blur(8px)";
    overlay.style.zIndex = "18";
    overlay.style.pointerEvents = "auto";

    const panel = document.createElement("div");
    panel.style.background = "rgba(12, 20, 32, 0.96)";
    panel.style.border = "1px solid rgba(90, 150, 220, 0.32)";
    panel.style.borderRadius = "16px";
    panel.style.padding = "1.4rem";
    panel.style.width = "min(720px, 92vw)";
    panel.style.maxHeight = "82vh";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "0.8rem";
    panel.style.boxShadow = "0 18px 38px rgba(0,0,0,0.45)";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    const title = document.createElement("h2");
    title.textContent = titleText;
    title.style.margin = "0";
    title.style.fontSize = "1.4rem";
    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.textContent = "Close";
    btnClose.style.padding = "0.35rem 0.8rem";
    btnClose.style.border = "1px solid rgba(120, 200, 255, 0.35)";
    btnClose.style.borderRadius = "8px";
    btnClose.style.background = "rgba(24, 38, 58, 0.9)";
    btnClose.style.color = "#e8f6ff";
    btnClose.style.cursor = "pointer";
    header.appendChild(title);
    header.appendChild(btnClose);

    const body = document.createElement("div");
    body.style.flex = "1";
    body.style.overflowY = "auto";
    body.style.paddingRight = "0.4rem";
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.gap = "0.8rem";

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    root.appendChild(overlay);

    const modal = { root: overlay, panel, body, close: () => overlay.remove() };

    btnClose.addEventListener("click", () => modal.close());
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) modal.close();
    });

    return modal;
  }

  function appendSection(container, titleText, description, bullets = []) {
    const section = document.createElement("section");
    section.style.display = "flex";
    section.style.flexDirection = "column";
    section.style.gap = "0.45rem";

    if (titleText) {
      const title = document.createElement("h3");
      title.textContent = titleText;
      title.style.margin = "0";
      title.style.fontSize = "1rem";
      title.style.color = "#d5ebff";
      section.appendChild(title);
    }

    if (description) {
      const desc = document.createElement("p");
      desc.style.margin = "0";
      desc.style.opacity = "0.82";
      desc.style.fontSize = "0.85rem";
      if (Array.isArray(description)) {
        desc.innerHTML = description.join(" ");
      } else {
        desc.innerHTML = description;
      }
      section.appendChild(desc);
    }

    if (Array.isArray(bullets) && bullets.length) {
      const list = document.createElement("ul");
      list.style.margin = "0";
      list.style.paddingLeft = "1.1rem";
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "0.35rem";
      list.style.fontSize = "0.85rem";
      bullets.forEach(entry => {
        const item = document.createElement("li");
        item.innerHTML = entry;
        list.appendChild(item);
      });
      section.appendChild(list);
    }

    container.appendChild(section);
  }

  function buildHelpContent(container) {
    appendSection(container, "Movement & Combat", "Core navigation and strikes:", [
      "<b>WASD</b> to move. Tap <b>Space</b> to jump, hold Space to charge a high leap.",
      "<b>Left Mouse</b> swings your weapon. <b>Q</b> fires a Nen blast, <b>E</b> uses your Nen ability, and <b>Shift</b> dashes.",
      "Hold <b>C</b> while channeling Ren to attempt a Ko strike — huge damage but Nen intensive."
    ]);

    appendSection(container, "Nen Disciplines", "Toggle Nen techniques to match the fight:", [
      "<b>T – Ten</b>: Maintains your aura guard. Leave it on to prevent chip damage and ready other styles.",
      "<b>Z – Zetsu</b>: Suppresses all other disciplines for stealth and Nen recovery.",
      "<b>Hold R – Ren</b>: Flood your aura for raw power. Pair with <b>C</b> to line up Ko finishers.",
      "<b>K – Ken</b>: Condense Ren for burst defense. Some vows may block it; check the vow menu if it won’t toggle.",
      "<b>G – Gyo</b>: Highlight weak points and hidden traps. <b>B – Shu</b> reinforces equipment for piercing hits.",
      "<b>V – En</b>: Expand to scout, collapse to conserve Nen. Use the QA slider to preview different radii."
    ]);

    appendSection(container, "Menus & Progression", "Keep long-term growth straight:", [
      "Press <b>L</b> to open the level allocation board and raise stats.",
      "Press <b>O</b> to bind or adjust vows. The Training button on the HUD launches skill drills to raise caps.",
      "Use the Help and Log buttons under the HUD feed for quick refreshers on controls and mechanics.",
      "Game state — inventory, vows, Nen pools, and region progress — auto-saves after major events. Resume picks up exactly where you left off."
    ]);

    appendSection(container, "QA & Dev Shortcuts", "Tools for rapid testing:", [
      "Press <b>Ctrl + Shift + D</b> to open the QA panel. Flip individual Nen modes, refill resources, or spawn target dummies for damage checks.",
      "Dummy spawns stay passive and ignore aggro — great for verifying hit reactions.",
      "Need a clean field? Use the refill buttons to top off HP or Nen instantly, or drag the En slider to stress-test vision ranges."
    ]);
  }

  function buildLogContent(container) {
    appendSection(container, "Core Loop", null, [
      "Clear waves, then touch the glowing exit cube to advance.",
      "Region cadence, wave counters, and active portals resume from the exact beat you saved on."
    ]);

    appendSection(container, "Nen Systems", null, [
      "All disciplines (Ten, Zetsu, Ren, Ken, Gyo, Shu, En) drain, recover, and show feedback on the HUD.",
      "Nen pools persist between sessions — leave mid-wave and resume with identical aura states.",
      "Ko strikes scale with vows and Focus; vulnerability timers carry across saves."
    ]);

    appendSection(container, "Vows & Training", null, [
      "Bind lethal or restrictive vows with <b>O</b>. Violations and elite rotations resume correctly after reload.",
      "Training drills (Ren hold, Gyo numbers, Ryu drill, Shu rock test) raise permanent Nen ceilings, all serialized with your profile."
    ]);

    appendSection(container, "Regions & Spawns", null, [
      "Active region, cadence rolls, and vow wave counters are saved so biome difficulty never desyncs.",
      "QA dummy spawns respect the current arena and stay put for combat comparisons."
    ]);

    appendSection(container, "Inventory & Equipment", null, [
      "Hotbar layout, durability, and active weapons persist exactly, preventing duplication or loss.",
      "Nen ammunition, consumable stacks, and durability damage are captured in the runtime snapshot."
    ]);

    appendSection(container, "QA Toolkit", null, [
      "Ctrl+Shift+D opens the dev panel: instant aura toggles, En radius tuning, resource refills, and dummy spawning.",
      "Panel visibility, toggle states, and hotkey bindings restore on load so QA setups stick between sessions."
    ]);

    appendSection(container, "Autosave", null, [
      "Progress, vows, Nen state, region data, and inventory snapshots auto-save after key actions.",
      "Leaving or refreshing the page reloads exactly into the same combat state when you return via Resume."
    ]);
  }


  function openHelpOverlay() {
    if (helpOverlayCache?.close) {
      helpOverlayCache.close();
    }
    const modal = createOverlayModal("hud-help-overlay", "Hunter Field Manual");
    if (!modal) return null;
    buildHelpContent(modal.body);
    const dispose = modal.close;
    const close = () => {
      dispose();
      helpOverlayCache = null;
    };
    modal.close = close;
    helpOverlayCache = modal;
    return close;
  }

  function closeHelpOverlay() {
    if (helpOverlayCache?.close) helpOverlayCache.close();
    helpOverlayCache = null;
  }

  function openLogOverlay() {
    if (logOverlayCache?.close) {
      logOverlayCache.close();
    }
    const modal = createOverlayModal("hud-log-overlay", "Update Log & Mechanics");
    if (!modal) return null;
    buildLogContent(modal.body);
    const dispose = modal.close;
    const close = () => {
      dispose();
      logOverlayCache = null;
    };
    modal.close = close;
    logOverlayCache = modal;
    return close;
  }

  function closeLogOverlay() {
    if (logOverlayCache?.close) logOverlayCache.close();
    logOverlayCache = null;
  }

  const DEV_TOGGLES = [
    { key: "ten", label: "Ten" },
    { key: "zetsu", label: "Zetsu" },
    { key: "ren", label: "Ren" },
    { key: "ken", label: "Ken" },
    { key: "gyo", label: "Gyo" },
    { key: "shu", label: "Shu" },
    { key: "en", label: "En" }
  ];

  function ensureDevPanel() {
    const root = ensureHudRoot();
    if (!root) return null;
    if (devPanelCache?.root?.isConnected && root.contains(devPanelCache.root)) {
      return devPanelCache;
    }
    const panel = document.createElement("div");
    panel.id = "hud-dev-panel";
    panel.style.position = "absolute";
    panel.style.top = "1.2rem";
    panel.style.right = "1.2rem";
    panel.style.width = "240px";
    panel.style.display = "none";
    panel.style.flexDirection = "column";
    panel.style.gap = "0.6rem";
    panel.style.padding = "0.9rem";
    panel.style.background = "rgba(12, 22, 36, 0.94)";
    panel.style.border = "1px solid rgba(120, 200, 255, 0.28)";
    panel.style.borderRadius = "12px";
    panel.style.boxShadow = "0 14px 28px rgba(0,0,0,0.38)";
    panel.style.pointerEvents = "auto";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    const title = document.createElement("strong");
    title.textContent = "QA Tools";
    title.style.letterSpacing = "0.06em";
    title.style.fontSize = "0.85rem";
    const btnHide = document.createElement("button");
    btnHide.type = "button";
    btnHide.textContent = "×";
    btnHide.style.background = "transparent";
    btnHide.style.border = "none";
    btnHide.style.color = "#e8f6ff";
    btnHide.style.fontSize = "1.1rem";
    btnHide.style.cursor = "pointer";
    btnHide.title = "Hide panel (Ctrl+Shift+D toggles)";
    btnHide.addEventListener("click", () => setDevPanelVisible(false));
    header.appendChild(title);
    header.appendChild(btnHide);
    panel.appendChild(header);

    const toggleList = document.createElement("div");
    toggleList.style.display = "flex";
    toggleList.style.flexDirection = "column";
    toggleList.style.gap = "0.35rem";

    const toggleInputs = new Map();
    DEV_TOGGLES.forEach(spec => {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.fontSize = "0.82rem";
      row.style.gap = "0.4rem";
      const span = document.createElement("span");
      span.textContent = spec.label;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.addEventListener("change", () => devPanelHandlers.toggleAura?.(spec.key, input.checked));
      row.appendChild(span);
      row.appendChild(input);
      toggleList.appendChild(row);
      toggleInputs.set(spec.key, input);
    });

    panel.appendChild(toggleList);

    const enControl = document.createElement("div");
    enControl.style.display = "flex";
    enControl.style.flexDirection = "column";
    enControl.style.gap = "0.3rem";
    enControl.style.marginTop = "0.2rem";
    const enLabel = document.createElement("span");
    enLabel.textContent = "En Radius";
    enLabel.style.fontSize = "0.78rem";
    enLabel.style.opacity = "0.8";
    const enSliderWrap = document.createElement("div");
    enSliderWrap.style.display = "flex";
    enSliderWrap.style.alignItems = "center";
    enSliderWrap.style.gap = "0.4rem";
    const enSlider = document.createElement("input");
    enSlider.type = "range";
    enSlider.min = "6";
    enSlider.max = "18";
    enSlider.step = "0.5";
    enSlider.value = "6";
    enSlider.style.flex = "1";
    const enValue = document.createElement("span");
    enValue.style.minWidth = "3ch";
    enValue.style.fontSize = "0.78rem";
    enValue.style.textAlign = "right";
    enSlider.addEventListener("input", () => {
      enValue.textContent = `${Number.parseFloat(enSlider.value).toFixed(1)}m`;
      devPanelHandlers.setEnRadius?.(Number.parseFloat(enSlider.value));
    });
    enSliderWrap.appendChild(enSlider);
    enSliderWrap.appendChild(enValue);
    enControl.appendChild(enLabel);
    enControl.appendChild(enSliderWrap);
    panel.appendChild(enControl);

    const actions = document.createElement("div");
    actions.style.display = "grid";
    actions.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    actions.style.gap = "0.35rem";

    const actionButtonBg = "rgba(20, 34, 50, 0.86)";
    const actionButtonBorder = "1px solid rgba(120, 200, 255, 0.28)";
    const actionButtonActiveBg = "rgba(42, 74, 112, 0.95)";
    const actionButtonActiveBorder = "1px solid rgba(160, 220, 255, 0.62)";
    const actionButtonActiveShadow = "0 0 0 1px rgba(120,200,255,0.45) inset";

    const makeActionButton = (label, handler) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.padding = "0.35rem 0.4rem";
      btn.style.fontSize = "0.72rem";
      btn.style.borderRadius = "8px";
      btn.style.border = actionButtonBorder;
      btn.style.background = actionButtonBg;
      btn.style.color = "#e4f4ff";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", handler);
      return btn;
    };

    let rearViewActive = false;
    const rearToggle = makeActionButton("Rear View", () => {});
    rearToggle.dataset.active = "0";
    rearToggle.style.gridColumn = "1 / span 2";
    rearToggle.style.justifyContent = "center";
    rearToggle.style.fontWeight = "600";
    rearToggle.title = "Toggle rear debug camera";
    rearToggle.setAttribute("aria-label", "Toggle rear debug camera");
    rearToggle.setAttribute("aria-pressed", "false");

    const setRearViewButtonState = (active) => {
      rearViewActive = !!active;
      rearToggle.dataset.active = rearViewActive ? "1" : "0";
      rearToggle.setAttribute("aria-pressed", rearViewActive ? "true" : "false");
      rearToggle.style.background = rearViewActive ? actionButtonActiveBg : actionButtonBg;
      rearToggle.style.border = rearViewActive ? actionButtonActiveBorder : actionButtonBorder;
      rearToggle.style.boxShadow = rearViewActive ? actionButtonActiveShadow : "none";
      rearToggle.style.color = rearViewActive ? "#f0fbff" : "#e4f4ff";
      if (devPanelCache) {
        devPanelCache.rearViewActive = rearViewActive;
      }
    };

    rearToggle.addEventListener("click", () => {
      const next = rearToggle.dataset.active !== "1";
      setRearViewButtonState(next);
      const result = devPanelHandlers.toggleRearView?.(next);
      if (result === false) {
        setRearViewButtonState(!next);
      }
    });

    actions.appendChild(rearToggle);

    actions.appendChild(makeActionButton("Refill HP+Nen", () => devPanelHandlers.refill?.("both")));
    actions.appendChild(makeActionButton("Refill Nen", () => devPanelHandlers.refill?.("nen")));
    actions.appendChild(makeActionButton("Spawn Dummy", () => devPanelHandlers.spawnDummy?.(1)));
    actions.appendChild(makeActionButton("Spawn Trio", () => devPanelHandlers.spawnDummy?.(3)));
    panel.appendChild(actions);

    const qaCards = document.createElement("div");
    qaCards.style.display = "flex";
    qaCards.style.flexDirection = "column";
    qaCards.style.gap = "0.55rem";

    const applyCardStyle = (el) => {
      el.style.display = "flex";
      el.style.flexDirection = "column";
      el.style.gap = "0.4rem";
      el.style.padding = "0.55rem 0.6rem";
      el.style.width = "100%";
      el.style.background = "rgba(14, 24, 36, 0.82)";
      el.style.border = "1px solid rgba(110, 190, 255, 0.24)";
      el.style.borderRadius = "12px";
      el.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.35)";
    };

    const perfCard = document.createElement("div");
    applyCardStyle(perfCard);
    const perfHeader = document.createElement("div");
    perfHeader.style.display = "flex";
    perfHeader.style.alignItems = "center";
    perfHeader.style.justifyContent = "space-between";

    const perfLabel = document.createElement("span");
    perfLabel.textContent = "Performance Target";
    perfLabel.style.fontSize = "0.7rem";
    perfLabel.style.textTransform = "uppercase";
    perfLabel.style.letterSpacing = "0.08em";
    perfLabel.style.opacity = "0.78";

    const perfValue = document.createElement("span");
    perfValue.style.fontSize = "0.74rem";
    perfValue.style.fontWeight = "600";

    perfHeader.appendChild(perfLabel);
    perfHeader.appendChild(perfValue);

    const perfSlider = document.createElement("input");
    perfSlider.type = "range";
    perfSlider.min = "30";
    perfSlider.max = "120";
    perfSlider.step = "5";
    perfSlider.value = String(performanceTargetValue);
    perfSlider.style.width = "100%";
    perfSlider.style.cursor = "pointer";
    perfSlider.addEventListener("input", () => {
      const value = setPerformanceTarget(perfSlider.value, { emit: true });
      perfValue.textContent = `${value} FPS`;
    });

    perfCard.appendChild(perfHeader);
    perfCard.appendChild(perfSlider);
    qaCards.appendChild(perfCard);

    const dynCard = document.createElement("div");
    applyCardStyle(dynCard);
    const dynHeader = document.createElement("div");
    dynHeader.style.display = "flex";
    dynHeader.style.alignItems = "center";
    dynHeader.style.justifyContent = "space-between";

    const dynToggleLabel = document.createElement("label");
    dynToggleLabel.style.display = "flex";
    dynToggleLabel.style.alignItems = "center";
    dynToggleLabel.style.gap = "0.45rem";
    dynToggleLabel.style.fontSize = "0.7rem";
    dynToggleLabel.style.textTransform = "uppercase";
    dynToggleLabel.style.letterSpacing = "0.08em";
    dynToggleLabel.style.opacity = "0.8";

    const dynToggle = document.createElement("input");
    dynToggle.type = "checkbox";
    dynToggle.checked = !!dynamicResolutionState.enabled;
    dynToggle.style.width = "16px";
    dynToggle.style.height = "16px";
    dynToggle.style.cursor = "pointer";
    dynToggle.addEventListener("change", () => {
      setDynamicResolutionUI({ enabled: dynToggle.checked }, { emit: true });
    });

    const dynLabelText = document.createElement("span");
    dynLabelText.textContent = "Dynamic Resolution";

    dynToggleLabel.appendChild(dynToggle);
    dynToggleLabel.appendChild(dynLabelText);

    const dynCurrent = document.createElement("span");
    dynCurrent.style.fontSize = "0.72rem";
    dynCurrent.style.opacity = "0.82";

    dynHeader.appendChild(dynToggleLabel);
    dynHeader.appendChild(dynCurrent);

    const dynSliderRow = document.createElement("div");
    dynSliderRow.style.display = "flex";
    dynSliderRow.style.alignItems = "center";
    dynSliderRow.style.gap = "0.45rem";

    const dynSlider = document.createElement("input");
    dynSlider.type = "range";
    dynSlider.min = "0.5";
    dynSlider.max = "1";
    dynSlider.step = "0.05";
    dynSlider.value = dynamicResolutionState.minScale.toFixed(2);
    dynSlider.disabled = !dynamicResolutionState.enabled;
    dynSlider.style.flex = "1";
    dynSlider.style.cursor = "pointer";
    dynSlider.addEventListener("input", () => {
      setDynamicResolutionUI({ minScale: Number(dynSlider.value) }, { emit: true });
    });

    const dynValue = document.createElement("span");
    dynValue.style.fontSize = "0.7rem";
    dynValue.style.opacity = "0.8";
    dynValue.style.minWidth = "5ch";

    dynSliderRow.appendChild(dynSlider);
    dynSliderRow.appendChild(dynValue);

    dynCard.appendChild(dynHeader);
    dynCard.appendChild(dynSliderRow);
    qaCards.appendChild(dynCard);

    const makeCosmeticButton = (label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.padding = "0.4rem 0.55rem";
      btn.style.borderRadius = "8px";
      btn.style.border = "1px solid rgba(120, 200, 255, 0.28)";
      btn.style.background = "rgba(24, 38, 58, 0.78)";
      btn.style.color = "#e8f6ff";
      btn.style.fontSize = "0.7rem";
      btn.style.cursor = "pointer";
      btn.style.display = "flex";
      btn.style.justifyContent = "center";
      btn.style.alignItems = "center";
      btn.style.width = "100%";
      btn.style.transition = "background-color 0.16s ease, border-color 0.16s ease";
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(44, 70, 102, 0.9)";
        btn.style.borderColor = "rgba(170, 230, 255, 0.48)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(24, 38, 58, 0.78)";
        btn.style.borderColor = "rgba(120, 200, 255, 0.28)";
      });
      return btn;
    };

    const cosmeticTester = buildCosmeticTester({
      dock: qaCards,
      cardStyle: applyCardStyle,
      makeButton: makeCosmeticButton,
      cardMinWidth: 0
    });

    panel.appendChild(qaCards);

    root.appendChild(panel);
    devPanelCache = {
      root: panel,
      toggles: toggleInputs,
      enSlider,
      enValue,
      btnHide,
      setRearViewButtonState,
      rearViewButton: rearToggle,
      rearViewActive,
      perfSlider,
      perfValue,
      dynToggle,
      dynSlider,
      dynValue,
      dynCurrent,
      cosmeticTester
    };
    setPerformanceTarget(performanceTargetValue);
    setDynamicResolutionUI({
      enabled: dynamicResolutionState.enabled,
      minScale: dynamicResolutionState.minScale,
      currentScale: dynamicResolutionState.currentScale
    });
    setRearViewButtonState(false);
    return devPanelCache;
  }

  function setDevPanelVisible(visible) {
    const cache = ensureDevPanel();
    if (!cache) return false;
    devPanelVisible = !!visible;
    cache.root.style.display = devPanelVisible ? "flex" : "none";
    return devPanelVisible;
  }

  function toggleDevPanel() {
    setDevPanelVisible(!devPanelVisible);
    return devPanelVisible;
  }

  function configureDevPanel(handlers = {}) {
    devPanelHandlers = { ...devPanelHandlers, ...handlers };
    ensureDevPanel();
  }

  function updateDevPanelState(aura = {}) {
    const cache = devPanelCache || ensureDevPanel();
    if (!cache) return;
    DEV_TOGGLES.forEach(spec => {
      const input = cache.toggles.get(spec.key);
      if (!input) return;
      if (spec.key === "en") {
        input.checked = !!aura?.en?.on;
      } else {
        input.checked = !!aura?.[spec.key];
      }
    });
    if (cache.enSlider) {
      const radius = Number.isFinite(aura?.en?.r) ? aura.en.r : 6;
      cache.enSlider.value = radius;
      if (cache.enValue) cache.enValue.textContent = `${radius.toFixed(1)}m`;
    }
  }

  function ensureProfilerOverlay() {
    if (!DEV_BUILD) return null;
    if (profilerOverlayCache?.root?.isConnected) return profilerOverlayCache;
    const root = ensureHudRoot();
    if (!root) return null;

    let container = document.getElementById("hud-profiler-overlay");
    if (container && container.parentElement !== root) {
      container.remove();
      container = null;
    }
    if (container) container.innerHTML = "";
    if (!container) {
      container = document.createElement("div");
      container.id = "hud-profiler-overlay";
      root.appendChild(container);
    }

    container.style.position = "absolute";
    container.style.top = "1rem";
    container.style.right = "1rem";
    container.style.display = profilerOverlayVisible ? "flex" : "none";
    container.style.flexDirection = "column";
    container.style.gap = "0.75rem";
    container.style.minWidth = "260px";
    container.style.maxWidth = "320px";
    container.style.padding = "0.75rem";
    container.style.borderRadius = "12px";
    container.style.background = "rgba(8, 16, 28, 0.92)";
    container.style.border = "1px solid rgba(120, 200, 255, 0.28)";
    container.style.boxShadow = "0 14px 32px rgba(6, 14, 26, 0.55)";
    container.style.color = "#e6f4ff";
    container.style.fontSize = "0.78rem";
    container.style.pointerEvents = "auto";
    container.style.zIndex = "20";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";

    const title = document.createElement("span");
    title.textContent = "Profiler";
    title.style.textTransform = "uppercase";
    title.style.letterSpacing = "0.12em";
    title.style.fontSize = "0.72rem";
    title.style.fontWeight = "600";
    title.style.opacity = "0.85";
    header.appendChild(title);

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "✕";
    close.title = "Hide profiler overlay";
    close.setAttribute("aria-label", "Hide profiler overlay");
    close.style.border = "none";
    close.style.background = "transparent";
    close.style.color = "#9abfe6";
    close.style.fontSize = "0.82rem";
    close.style.cursor = "pointer";
    close.style.padding = "0";
    close.style.lineHeight = "1";
    close.addEventListener("click", () => setProfilerOverlayVisible(false));
    header.appendChild(close);
    container.appendChild(header);

    const metricsWrap = document.createElement("div");
    metricsWrap.style.display = "flex";
    metricsWrap.style.flexDirection = "column";
    metricsWrap.style.gap = "0.25rem";
    metricsWrap.style.padding = "0.4rem 0.2rem 0.2rem";
    metricsWrap.style.background = "rgba(20, 34, 54, 0.55)";
    metricsWrap.style.borderRadius = "8px";

    const metrics = [
      { key: "fps", label: "FPS" },
      { key: "drawCalls", label: "Draw Calls" },
      { key: "activeVertices", label: "Active Vertices" },
      { key: "gpuFrame", label: "GPU Frame" },
      { key: "chunksLoaded", label: "Chunks Loaded" },
      { key: "chunksPending", label: "Chunks Pending" },
      { key: "workerQueue", label: "Worker Queue" }
    ];
    const metricElements = new Map();
    metrics.forEach(spec => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      const label = document.createElement("span");
      label.textContent = spec.label;
      label.style.opacity = "0.72";
      const value = document.createElement("span");
      value.dataset.metric = spec.key;
      value.textContent = "--";
      value.style.fontVariantNumeric = "tabular-nums";
      value.style.marginLeft = "1rem";
      row.appendChild(label);
      row.appendChild(value);
      metricsWrap.appendChild(row);
      metricElements.set(spec.key, value);
    });
    container.appendChild(metricsWrap);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.flexDirection = "column";
    controls.style.gap = "0.45rem";

    const toggleSpecs = [
      { key: "lod", label: "Tree LOD" },
      { key: "instances", label: "Use Clones" },
      { key: "greedy", label: "Greedy Meshing" },
      { key: "dynamic", label: "Dynamic Resolution" }
    ];

    const toggleInputs = new Map();
    toggleSpecs.forEach(spec => {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "0.8rem";
      const text = document.createElement("span");
      text.textContent = spec.label;
      text.style.flex = "1";
      text.style.opacity = "0.82";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.style.width = "16px";
      input.style.height = "16px";
      input.style.cursor = "pointer";
      if (spec.key === "lod") {
        input.addEventListener("change", () => profilerOverlayHandlers.onToggleLod?.(!!input.checked));
      } else if (spec.key === "instances") {
        input.addEventListener("change", () => profilerOverlayHandlers.onInstanceModeChange?.(input.checked ? "cloned" : "instanced"));
      } else if (spec.key === "greedy") {
        input.addEventListener("change", () => profilerOverlayHandlers.onGreedyChange?.(!!input.checked));
      } else if (spec.key === "dynamic") {
        input.addEventListener("change", () => profilerOverlayHandlers.onDynamicResolutionChange?.(!!input.checked));
      }
      row.appendChild(text);
      row.appendChild(input);
      controls.appendChild(row);
      toggleInputs.set(spec.key, input);
    });

    const radiusBlock = document.createElement("div");
    radiusBlock.style.display = "flex";
    radiusBlock.style.flexDirection = "column";
    radiusBlock.style.gap = "0.4rem";

    const radiusHeader = document.createElement("div");
    radiusHeader.style.display = "flex";
    radiusHeader.style.justifyContent = "space-between";
    const radiusLabel = document.createElement("span");
    radiusLabel.textContent = "Chunk Radius";
    radiusLabel.style.opacity = "0.82";
    const radiusValue = document.createElement("span");
    radiusValue.textContent = "--";
    radiusValue.style.fontVariantNumeric = "tabular-nums";
    radiusHeader.appendChild(radiusLabel);
    radiusHeader.appendChild(radiusValue);

    const radiusControls = document.createElement("div");
    radiusControls.style.display = "flex";
    radiusControls.style.alignItems = "center";
    radiusControls.style.gap = "0.5rem";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "4";
    slider.max = "200";
    slider.step = "1";
    slider.value = "64";
    slider.style.flex = "1";
    slider.style.cursor = "pointer";

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Auto";
    reset.style.padding = "0.25rem 0.55rem";
    reset.style.fontSize = "0.68rem";
    reset.style.borderRadius = "6px";
    reset.style.border = "1px solid rgba(120, 200, 255, 0.32)";
    reset.style.background = "rgba(16, 32, 52, 0.85)";
    reset.style.color = "#d6ecff";
    reset.style.cursor = "pointer";

    const cache = {
      root: container,
      metrics: metricElements,
      toggles: toggleInputs,
      chunkSlider: slider,
      chunkValue: radiusValue,
      chunkReset: reset,
      suppressChunkInput: false
    };

    slider.addEventListener("input", () => {
      const raw = Number.parseFloat(slider.value);
      if (Number.isFinite(raw)) {
        cache.chunkValue.textContent = `${Math.round(raw)}m`;
      }
      if (!cache.suppressChunkInput) {
        profilerOverlayHandlers.onChunkRadiusChange?.(Number.isFinite(raw) ? raw : null);
      }
    });

    reset.addEventListener("click", () => profilerOverlayHandlers.onChunkRadiusReset?.());

    radiusControls.appendChild(slider);
    radiusControls.appendChild(reset);
    radiusBlock.appendChild(radiusHeader);
    radiusBlock.appendChild(radiusControls);
    controls.appendChild(radiusBlock);
    container.appendChild(controls);

    profilerOverlayCache = cache;
    return profilerOverlayCache;
  }

  function configureProfilerOverlay(handlers = {}) {
    if (!DEV_BUILD) return false;
    profilerOverlayHandlers = { ...profilerOverlayHandlers, ...handlers };
    return !!ensureProfilerOverlay();
  }

  function setProfilerOverlayVisible(visible) {
    if (!DEV_BUILD) return false;
    const cache = ensureProfilerOverlay();
    if (!cache) return false;
    profilerOverlayVisible = !!visible;
    cache.root.style.display = profilerOverlayVisible ? "flex" : "none";
    return profilerOverlayVisible;
  }

  function toggleProfilerOverlay() {
    return setProfilerOverlayVisible(!profilerOverlayVisible);
  }

  function formatProfilerNumber(value, { digits = 0, suffix = "", fallback = "--" } = {}) {
    if (!Number.isFinite(value)) return fallback;
    const rounded = digits > 0 ? value.toFixed(digits) : Math.round(value).toString();
    return `${rounded}${suffix}`;
  }

  function updateProfilerOverlayMetrics(metrics = {}) {
    if (!DEV_BUILD) return;
    const cache = profilerOverlayCache || ensureProfilerOverlay();
    if (!cache?.metrics) return;
    const entries = cache.metrics;
    const set = (key, value) => {
      if (!entries.has(key)) return;
      entries.get(key).textContent = value;
    };
    set("fps", formatProfilerNumber(metrics.fps, { digits: 1 }));
    set("drawCalls", Number.isFinite(metrics.drawCalls) ? Math.round(metrics.drawCalls).toLocaleString("en-US") : "--");
    set("activeVertices", Number.isFinite(metrics.activeVertices) ? Math.round(metrics.activeVertices).toLocaleString("en-US") : "--");
    set("gpuFrame", formatProfilerNumber(metrics.gpuFrameTime, { digits: 2, suffix: "ms" }));
    set("chunksLoaded", Number.isFinite(metrics.chunksLoaded) ? Math.round(metrics.chunksLoaded).toLocaleString("en-US") : "--");
    set("chunksPending", Number.isFinite(metrics.chunksPending) ? Math.round(metrics.chunksPending).toLocaleString("en-US") : "--");
    set("workerQueue", Number.isFinite(metrics.workerQueueDepth) ? Math.round(metrics.workerQueueDepth).toLocaleString("en-US") : "--");
  }

  function updateProfilerOverlayState(state = {}) {
    if (!DEV_BUILD) return;
    const cache = profilerOverlayCache || ensureProfilerOverlay();
    if (!cache) return;
    const { toggles } = cache;
    if (toggles?.has("lod")) toggles.get("lod").checked = !!state.lodEnabled;
    if (toggles?.has("instances")) toggles.get("instances").checked = state.instanceMode === "cloned";
    if (toggles?.has("greedy")) toggles.get("greedy").checked = !!state.greedyEnabled;
    if (toggles?.has("dynamic")) toggles.get("dynamic").checked = !!state.dynamicResolution;
    const slider = cache.chunkSlider;
    if (slider) {
      const min = Number.isFinite(state.chunkMin) ? Math.round(state.chunkMin) : 4;
      const max = Number.isFinite(state.chunkMax) ? Math.round(state.chunkMax) : Math.max(min + 2, 200);
      const step = Number.isFinite(state.chunkStep) ? Math.max(1, Math.round(state.chunkStep)) : Math.max(1, Math.round((max - min) / 20));
      cache.suppressChunkInput = true;
      slider.min = `${min}`;
      slider.max = `${max}`;
      slider.step = `${step}`;
      const manual = Number.isFinite(state.chunkOverride);
      const sliderValue = manual ? state.chunkOverride : (Number.isFinite(state.chunkRadius) ? state.chunkRadius : min);
      if (Number.isFinite(sliderValue)) slider.value = `${Math.round(sliderValue)}`;
      slider.disabled = !Number.isFinite(state.chunkRadius);
      if (cache.chunkReset) cache.chunkReset.disabled = slider.disabled;
      const radiusDisplay = Number.isFinite(state.chunkRadius) ? Math.round(state.chunkRadius) : null;
      cache.chunkValue.textContent = radiusDisplay != null
        ? (manual ? `${radiusDisplay}m` : `Auto (${radiusDisplay}m)`)
        : "--";
      cache.suppressChunkInput = false;
    }
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

  function resolveTrainingButton() {
    if (trainingButtonCache?.isConnected) return trainingButtonCache;
    const btn = document.getElementById("hud-training-button");
    if (btn) trainingButtonCache = btn;
    return trainingButtonCache;
  }

  function ensureTrainingMenu() {
    if (trainingMenuCache?.root?.isConnected) return trainingMenuCache;
    const hudRoot = ensureHudRoot();
    if (!hudRoot) return null;

    const root = document.createElement("div");
    root.id = "hud-training-overlay";
    root.style.position = "absolute";
    root.style.left = "0";
    root.style.top = "0";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.display = "none";
    root.style.alignItems = "center";
    root.style.justifyContent = "center";
    root.style.background = "rgba(6, 12, 20, 0.78)";
    root.style.backdropFilter = "blur(6px)";
    root.style.zIndex = "16";
    root.style.pointerEvents = "none";
    root.style.opacity = "0";
    root.style.transition = "opacity 0.18s ease";

    const panel = document.createElement("div");
    panel.className = "hud-training-panel";
    panel.style.background = "rgba(14, 22, 36, 0.96)";
    panel.style.border = "1px solid rgba(90, 150, 220, 0.32)";
    panel.style.borderRadius = "14px";
    panel.style.padding = "1.6rem";
    panel.style.width = "min(720px, 94vw)";
    panel.style.maxHeight = "82vh";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "1rem";
    panel.style.boxShadow = "0 18px 40px rgba(0,0,0,0.45)";
    panel.style.pointerEvents = "auto";

    const title = document.createElement("h2");
    title.textContent = "Training Grounds";
    title.style.margin = "0";
    title.style.fontSize = "1.45rem";
    panel.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.textContent = "Master each discipline to raise your Nen caps permanently.";
    subtitle.style.margin = "0";
    subtitle.style.opacity = "0.78";
    subtitle.style.fontSize = "0.92rem";
    panel.appendChild(subtitle);

    const cardsWrap = document.createElement("div");
    cardsWrap.style.display = "grid";
    cardsWrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))";
    cardsWrap.style.gap = "0.8rem";
    panel.appendChild(cardsWrap);

    const minigameWrap = document.createElement("div");
    minigameWrap.style.background = "rgba(10, 18, 30, 0.92)";
    minigameWrap.style.border = "1px solid rgba(80, 130, 190, 0.28)";
    minigameWrap.style.borderRadius = "10px";
    minigameWrap.style.padding = "1rem";
    minigameWrap.style.minHeight = "180px";
    minigameWrap.style.display = "flex";
    minigameWrap.style.flexDirection = "column";
    minigameWrap.style.gap = "0.75rem";
    panel.appendChild(minigameWrap);

    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";
    footer.style.gap = "0.6rem";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Done";
    closeBtn.className = "primary";
    closeBtn.style.minWidth = "110px";
    footer.appendChild(closeBtn);
    panel.appendChild(footer);

    const cards = new Map();
    TRAINING_SPECS.forEach(spec => {
      const card = document.createElement("div");
      card.style.background = "rgba(10, 18, 30, 0.9)";
      card.style.border = "1px solid rgba(80, 130, 190, 0.28)";
      card.style.borderRadius = "10px";
      card.style.padding = "0.85rem";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.gap = "0.55rem";

      const head = document.createElement("div");
      head.style.display = "flex";
      head.style.flexDirection = "column";
      head.style.gap = "0.25rem";
      const name = document.createElement("strong");
      name.textContent = spec.title;
      name.style.fontSize = "0.95rem";
      head.appendChild(name);
      const desc = document.createElement("span");
      desc.textContent = spec.description;
      desc.style.fontSize = "0.78rem";
      desc.style.opacity = "0.82";
      head.appendChild(desc);
      card.appendChild(head);

      const effect = document.createElement("div");
      effect.style.fontSize = "0.8rem";
      effect.style.opacity = "0.85";
      effect.textContent = spec.effect?.();
      card.appendChild(effect);

      const progress = document.createElement("div");
      progress.style.fontSize = "0.78rem";
      progress.style.opacity = "0.82";
      progress.textContent = "Rank 0/0";
      card.appendChild(progress);

      const action = document.createElement("button");
      action.type = "button";
      action.textContent = "Train";
      action.className = "secondary";
      action.style.alignSelf = "flex-start";
      card.appendChild(action);

      cardsWrap.appendChild(card);
      cards.set(spec.key, { root: card, button: action, effectEl: effect, progressEl: progress, spec, maxed: false });
    });

    root.appendChild(panel);
    hudRoot.appendChild(root);

    trainingMenuCache = { root, panel, cards, minigameWrap, closeBtn, state: null, config: null };
    closeBtn.addEventListener("click", () => internalCloseTrainingMenu(true));
    renderTrainingPlaceholder();
    return trainingMenuCache;
  }

  function renderTrainingPlaceholder() {
    if (!trainingMenuCache?.minigameWrap) return;
    const wrap = trainingMenuCache.minigameWrap;
    wrap.innerHTML = "";
    const msg = document.createElement("p");
    msg.textContent = "Select a drill to practice your Nen control.";
    msg.style.margin = "0";
    msg.style.opacity = "0.78";
    wrap.appendChild(msg);
  }

  function renderTrainingCards(progress = {}, caps = {}, limits = {}) {
    if (!trainingMenuCache?.cards) return;
    trainingMenuCache.cards.forEach((card, key) => {
      const spec = card.spec;
      const rank = Number(progress[key]) || 0;
      const limit = Number(limits[key]) || 0;
      card.progressEl.textContent = `Rank ${rank}/${limit}`;
      card.effectEl.textContent = spec.effect ? spec.effect(caps) : "";
      const maxed = limit > 0 && rank >= limit;
      card.maxed = maxed;
      card.root.classList.toggle("maxed", maxed);
      const active = trainingGameState?.key === key;
      card.root.classList.toggle("active", !!active);
      card.button.disabled = maxed || (!!trainingGameState && !active);
      card.button.textContent = maxed ? "Mastered" : (active ? "Training..." : "Train");
    });
  }

  function stopTrainingMinigame() {
    if (trainingGameState?.cleanup) {
      try {
        trainingGameState.cleanup();
      } catch (err) {
        console.warn("[HUD] Training cleanup failed", err);
      }
    }
    trainingGameState = null;
    if (trainingMenuCache?.cards) {
      trainingMenuCache.cards.forEach(card => {
        card.root.classList.remove("active");
        card.button.disabled = card.maxed;
      });
    }
    renderTrainingPlaceholder();
  }

  function startTrainingMinigame(spec, state) {
    const cache = trainingMenuCache || ensureTrainingMenu();
    if (!cache) return;
    stopTrainingMinigame();
    const card = cache.cards.get(spec.key);
    if (card) {
      card.button.disabled = true;
      card.root.classList.add("active");
    }
    const wrap = cache.minigameWrap;
    wrap.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = spec.title;
    title.style.margin = "0";
    wrap.appendChild(title);

    const instructions = document.createElement("p");
    instructions.textContent = spec.description;
    instructions.style.margin = "0";
    instructions.style.opacity = "0.82";
    instructions.style.fontSize = "0.85rem";
    wrap.appendChild(instructions);

    const board = document.createElement("div");
    board.style.display = "flex";
    board.style.flexDirection = "column";
    board.style.gap = "0.75rem";
    wrap.appendChild(board);

    const feedback = document.createElement("div");
    feedback.style.fontSize = "0.8rem";
    feedback.style.minHeight = "1.2rem";
    feedback.style.opacity = "0.85";
    wrap.appendChild(feedback);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "0.5rem";
    wrap.appendChild(controls);

    const level = Number(state.progress?.[spec.key]) || 0;

    const handleResult = (payload = {}) => {
      const success = !!payload.success;
      const message = payload.message || (success ? "Training complete." : "Focus lost — try again.");
      feedback.textContent = message;
      if (success) {
        const update = cache.config?.onComplete?.(spec.key);
        if (update?.progress) state.progress = { ...state.progress, ...update.progress };
        if (update?.caps) state.caps = { ...state.caps, ...update.caps };
        renderTrainingCards(state.progress, state.caps, state.limits);
      } else {
        renderTrainingCards(state.progress, state.caps, state.limits);
      }

      controls.innerHTML = "";
      if (!success || !(cache.cards.get(spec.key)?.maxed)) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "secondary";
        retry.textContent = success ? "Run again" : "Try again";
        retry.onclick = () => startTrainingMinigame(spec, state);
        controls.appendChild(retry);
      }
      const back = document.createElement("button");
      back.type = "button";
      back.className = "secondary";
      back.textContent = "Back";
      back.onclick = () => stopTrainingMinigame();
      controls.appendChild(back);

      if (card) {
        card.button.disabled = card.maxed;
        card.root.classList.remove("active");
      }
      trainingGameState = null;
    };

    const cleanup = spec.run(board, { level, onResult: handleResult });
    trainingGameState = {
      key: spec.key,
      cleanup: () => {
        if (typeof cleanup === "function") {
          try {
            cleanup();
          } catch (err) {
            console.warn("[HUD] Training runner cleanup failed", err);
          }
        }
        if (card) {
          card.button.disabled = card.maxed;
          card.root.classList.remove("active");
        }
        renderTrainingPlaceholder();
      }
    };
  }

  function internalCloseTrainingMenu(notify = false) {
    if (!trainingMenuCache?.root) return;
    stopTrainingMinigame();
    const { root } = trainingMenuCache;
    root.style.opacity = "0";
    root.style.pointerEvents = "none";
    setTimeout(() => {
      if (trainingMenuCache?.root === root) {
        root.style.display = "none";
      }
    }, 180);
    if (notify && typeof trainingMenuCache.config?.onClose === "function") {
      try {
        trainingMenuCache.config.onClose();
      } catch (err) {
        console.warn("[HUD] Training onClose failed", err);
      }
    }
    trainingMenuCache.config = null;
    trainingMenuCache.state = null;
    const btn = resolveTrainingButton();
    if (btn) {
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
      if (btn.dataset.bgBase) btn.style.background = btn.dataset.bgBase;
      if (btn.dataset.borderBase) btn.style.border = btn.dataset.borderBase;
    }
  }

  function openTrainingMenu(config = {}) {
    const cache = ensureTrainingMenu();
    if (!cache) return () => {};
    cache.config = {
      onClose: typeof config.onClose === "function" ? config.onClose : null,
      onComplete: typeof config.onComplete === "function" ? config.onComplete : null
    };
    cache.state = {
      progress: { ...(config.progress || {}) },
      caps: { ...(config.caps || {}) },
      limits: { ...(config.limits || {}) }
    };
    renderTrainingCards(cache.state.progress, cache.state.caps, cache.state.limits);
    renderTrainingPlaceholder();
    cache.cards.forEach(({ button, spec }) => {
      button.onclick = () => startTrainingMinigame(spec, cache.state);
    });
    cache.root.style.display = "flex";
    cache.root.style.pointerEvents = "auto";
    requestAnimationFrame(() => {
      cache.root.style.opacity = "1";
    });
    const btn = resolveTrainingButton();
    if (btn) {
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      if (btn.dataset.bgActive) btn.style.background = btn.dataset.bgActive;
      if (btn.dataset.borderActive) btn.style.border = btn.dataset.borderActive;
    }
    return () => internalCloseTrainingMenu(false);
  }

  function closeTrainingMenu() {
    internalCloseTrainingMenu(false);
  }

  function bindTrainingButton(handler) {
    const btn = resolveTrainingButton();
    if (!btn) return () => {};
    const listener = (event) => {
      handler?.(event);
    };
    btn.addEventListener("click", listener);
    return () => btn.removeEventListener("click", listener);
  }

  function runRenHoldMinigame(board, { level = 0, onResult } = {}) {
    board.innerHTML = "";
    board.style.display = "flex";
    board.style.flexDirection = "column";
    board.style.gap = "0.75rem";

    const gauge = document.createElement("div");
    gauge.style.position = "relative";
    gauge.style.width = "100%";
    gauge.style.height = "20px";
    gauge.style.borderRadius = "10px";
    gauge.style.background = "rgba(255,255,255,0.12)";
    gauge.style.overflow = "hidden";

    const fill = document.createElement("div");
    fill.style.position = "absolute";
    fill.style.left = "0";
    fill.style.top = "0";
    fill.style.bottom = "0";
    fill.style.width = "0%";
    fill.style.background = "linear-gradient(90deg, rgba(94,178,255,0.7), rgba(120,220,255,0.95))";
    gauge.appendChild(fill);

    const target = document.createElement("div");
    target.style.position = "absolute";
    target.style.top = "0";
    target.style.bottom = "0";
    target.style.background = "rgba(90, 210, 255, 0.35)";
    target.style.border = "1px solid rgba(120,220,255,0.8)";
    gauge.appendChild(target);

    const targetWidth = Math.max(0.14 - level * 0.015, 0.06);
    const targetStart = Math.random() * (0.75 - targetWidth) + 0.15;
    target.style.left = `${targetStart * 100}%`;
    target.style.width = `${targetWidth * 100}%`;

    board.appendChild(gauge);

    const prompt = document.createElement("div");
    prompt.textContent = "Hold, then release inside the highlighted band.";
    prompt.style.fontSize = "0.82rem";
    prompt.style.opacity = "0.82";
    board.appendChild(prompt);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary";
    button.textContent = "Channel Aura";
    button.style.alignSelf = "flex-start";
    board.appendChild(button);

    let raf = null;
    let active = false;
    let progress = 0;
    let lastTs = 0;

    const cancelLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    };

    const finish = (success, message) => {
      cancelLoop();
      active = false;
      onResult?.({ success, message });
    };

    const loop = (ts) => {
      if (!active) return;
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      const rate = 0.55 + level * 0.09;
      progress += dt * rate;
      if (progress >= 1) {
        fill.style.width = "100%";
        finish(false, "The surge overruns your control.");
        return;
      }
      fill.style.width = `${Math.max(0, Math.min(progress, 1)) * 100}%`;
      raf = requestAnimationFrame(loop);
    };

    const startHold = (event) => {
      event.preventDefault();
      if (active) return;
      progress = 0;
      lastTs = 0;
      fill.style.width = "0%";
      active = true;
      cancelLoop();
      raf = requestAnimationFrame(loop);
    };

    const releaseHold = (event) => {
      event?.preventDefault?.();
      if (!active) return;
      cancelLoop();
      active = false;
      fill.style.width = `${Math.max(0, Math.min(progress, 1)) * 100}%`;
      const success = progress >= targetStart && progress <= targetStart + targetWidth;
      const message = success ? "Ren stamina reinforced." : "Timing slips — the flow scatters.";
      finish(success, message);
    };

    button.addEventListener("mousedown", startHold);
    button.addEventListener("touchstart", startHold, { passive: false });
    window.addEventListener("mouseup", releaseHold);
    window.addEventListener("touchend", releaseHold);
    window.addEventListener("touchcancel", releaseHold);

    return () => {
      cancelLoop();
      button.removeEventListener("mousedown", startHold);
      button.removeEventListener("touchstart", startHold);
      window.removeEventListener("mouseup", releaseHold);
      window.removeEventListener("touchend", releaseHold);
      window.removeEventListener("touchcancel", releaseHold);
    };
  }

  function runGyoNumbersMinigame(board, { level = 0, onResult } = {}) {
    board.innerHTML = "";
    board.style.display = "flex";
    board.style.flexDirection = "column";
    board.style.gap = "0.6rem";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.fontSize = "0.82rem";
    const prompt = document.createElement("span");
    prompt.textContent = "Tap numbers in ascending order.";
    prompt.style.opacity = "0.82";
    const timerEl = document.createElement("strong");
    timerEl.textContent = "Timer 0.0s";
    header.appendChild(prompt);
    header.appendChild(timerEl);
    board.appendChild(header);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(48px, 1fr))";
    grid.style.gap = "0.35rem";
    board.appendChild(grid);

    const count = Math.max(5, 5 + level);
    const timerLimit = Math.max(6, 16 - level * 1.2);
    let remaining = timerLimit;
    timerEl.textContent = `Timer ${remaining.toFixed(1)}s`;

    const numbers = Array.from({ length: count }, (_, i) => i + 1);
    shuffleArray(numbers);

    let expected = 1;
    let finished = false;

    const buttonHandlers = [];
    numbers.forEach(num => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(num);
      btn.style.padding = "0.45rem";
      btn.style.borderRadius = "8px";
      btn.style.border = "1px solid rgba(120, 180, 255, 0.35)";
      btn.style.background = "rgba(18, 30, 48, 0.92)";
      btn.style.color = "#f2f8ff";
      btn.style.fontWeight = "600";
      const handler = () => {
        if (finished) return;
        if (num === expected) {
          expected += 1;
          btn.disabled = true;
          btn.style.background = "rgba(80, 200, 255, 0.35)";
          if (expected > count) {
            finish(true, "You track every aura flicker.");
          }
        } else {
          finish(false, "Sequence lost — reset your focus.");
        }
      };
      btn.addEventListener("click", handler);
      buttonHandlers.push({ btn, handler });
      grid.appendChild(btn);
    });

    const finish = (success, message) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      buttonHandlers.forEach(({ btn }) => { btn.disabled = true; });
      onResult?.({ success, message });
    };

    const timer = setInterval(() => {
      remaining = Math.max(0, remaining - 0.1);
      timerEl.textContent = `Timer ${remaining.toFixed(1)}s`;
      if (remaining <= 0) {
        finish(false, "The pattern fades before you." );
      }
    }, 100);

    return () => {
      clearInterval(timer);
      buttonHandlers.forEach(({ btn, handler }) => btn.removeEventListener("click", handler));
    };
  }

  function runRyuDrillMinigame(board, { level = 0, onResult } = {}) {
    board.innerHTML = "";
    board.style.display = "flex";
    board.style.flexDirection = "column";
    board.style.gap = "0.75rem";

    const tolerance = Math.max(2, 6 - level);
    const timeLimit = Math.max(12, 36 - level * 3);

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    const note = document.createElement("span");
    note.style.fontSize = "0.82rem";
    note.style.opacity = "0.82";
    note.textContent = `Match the target within ±${tolerance}%`;
    const timerEl = document.createElement("strong");
    timerEl.textContent = `${timeLimit.toFixed(1)}s`;
    header.appendChild(note);
    header.appendChild(timerEl);
    board.appendChild(header);

    const groups = [
      { key: "Head", label: "Head" },
      { key: "Torso", label: "Torso" },
      { key: "Arms", label: "Arms" },
      { key: "Legs", label: "Legs" }
    ];
    const raw = groups.map(() => Math.random() + 0.4);
    const sum = raw.reduce((acc, val) => acc + val, 0);
    const target = raw.map(val => Math.round((val / sum) * 100));
    const diff = 100 - target.reduce((acc, val) => acc + val, 0);
    target[target.length - 1] += diff;

    const targetList = document.createElement("div");
    targetList.style.display = "flex";
    targetList.style.flexWrap = "wrap";
    targetList.style.gap = "0.5rem 1rem";
    targetList.style.fontSize = "0.82rem";
    groups.forEach((group, i) => {
      const span = document.createElement("span");
      span.textContent = `${group.label}: ${target[i]}%`;
      targetList.appendChild(span);
    });
    board.appendChild(targetList);

    const sliders = document.createElement("div");
    sliders.style.display = "flex";
    sliders.style.flexDirection = "column";
    sliders.style.gap = "0.55rem";
    board.appendChild(sliders);

    const current = {};
    const sliderEntries = [];
    groups.forEach(group => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "column";
      row.style.gap = "0.25rem";
      const label = document.createElement("div");
      label.textContent = `${group.label}: 25%`;
      label.style.fontSize = "0.8rem";
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "70";
      input.step = "1";
      input.value = "25";
      input.style.width = "100%";
      row.appendChild(label);
      row.appendChild(input);
      sliders.appendChild(row);
      current[group.key] = 25;
      const handler = () => {
        const val = Number(input.value) || 0;
        current[group.key] = val;
        label.textContent = `${group.label}: ${val}%`;
        sumLabel.textContent = `Total: ${total()}%`;
      };
      input.addEventListener("input", handler);
      sliderEntries.push({ input, handler, group });
    });

    const sumLabel = document.createElement("div");
    sumLabel.style.fontSize = "0.8rem";
    sumLabel.style.opacity = "0.82";
    const total = () => Object.values(current).reduce((acc, val) => acc + Number(val || 0), 0);
    sumLabel.textContent = `Total: ${total()}%`;
    board.appendChild(sumLabel);

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "primary";
    submit.textContent = "Stabilize";
    submit.style.alignSelf = "flex-start";
    board.appendChild(submit);

    let finished = false;
    let countdown = null;
    const finish = (success, message) => {
      if (finished) return;
      finished = true;
      if (countdown) clearInterval(countdown);
      onResult?.({ success, message });
    };

    submit.onclick = () => {
      if (finished) return;
      const totalVal = total();
      const sumOkay = Math.abs(totalVal - 100) <= tolerance;
      const allGood = groups.every((group, idx) => Math.abs(current[group.key] - target[idx]) <= tolerance);
      if (sumOkay && allGood) {
        finish(true, "Ryu redistribution locks into place.");
      } else {
        finish(false, "Flow slips — adjust and try again.");
      }
    };

    let remaining = timeLimit;
    timerEl.textContent = `${remaining.toFixed(1)}s`;
    countdown = setInterval(() => {
      remaining = Math.max(0, remaining - 0.1);
      timerEl.textContent = `${remaining.toFixed(1)}s`;
      if (remaining <= 0) {
        finish(false, "You hesitate and lose the tempo.");
      }
    }, 100);

    return () => {
      if (countdown) clearInterval(countdown);
      sliderEntries.forEach(({ input, handler }) => input.removeEventListener("input", handler));
    };
  }

  function runShuRockMinigame(board, { level = 0, onResult } = {}) {
    board.innerHTML = "";
    board.style.display = "flex";
    board.style.flexDirection = "column";
    board.style.gap = "0.7rem";

    const hpMax = Math.round(80 + level * 25);
    let hp = hpMax;
    const timeLimit = Math.max(10, 18 - level * 0.6);

    const gauge = document.createElement("div");
    gauge.style.position = "relative";
    gauge.style.width = "100%";
    gauge.style.height = "18px";
    gauge.style.borderRadius = "9px";
    gauge.style.background = "rgba(255,255,255,0.12)";
    const fill = document.createElement("div");
    fill.style.position = "absolute";
    fill.style.left = "0";
    fill.style.top = "0";
    fill.style.bottom = "0";
    fill.style.width = "100%";
    fill.style.background = "linear-gradient(90deg, rgba(110,255,182,0.9), rgba(70,200,255,0.9))";
    gauge.appendChild(fill);
    board.appendChild(gauge);

    const status = document.createElement("div");
    status.style.fontSize = "0.82rem";
    status.style.opacity = "0.82";
    status.textContent = `Stone integrity: ${hpMax}`;
    board.appendChild(status);

    const timerEl = document.createElement("strong");
    timerEl.textContent = `${timeLimit.toFixed(1)}s`;
    board.appendChild(timerEl);

    const strike = document.createElement("button");
    strike.type = "button";
    strike.className = "primary";
    strike.textContent = "Strike";
    strike.style.alignSelf = "flex-start";
    board.appendChild(strike);

    let finished = false;
    let combo = 0;
    let lastStrike = 0;

    const finish = (success, message) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      strike.disabled = true;
      onResult?.({ success, message });
    };

    strike.onclick = () => {
      if (finished) return;
      const now = typeof performance === "object" && typeof performance.now === "function" ? performance.now() : Date.now();
      if (now - lastStrike < 350) {
        combo += 1;
      } else {
        combo = 0;
      }
      lastStrike = now;
      const base = 6 + level * 2.2;
      const dmg = base + Math.random() * (8 + combo * 1.6);
      hp = Math.max(0, hp - Math.round(dmg));
      const ratio = hp / hpMax;
      fill.style.width = `${Math.max(0, ratio) * 100}%`;
      status.textContent = hp > 0
        ? `Stone integrity: ${hp}  (combo ${combo + 1}x)`
        : "Stone shattered!";
      if (hp <= 0) {
        finish(true, "Shu channels cleanly through the stone.");
      }
    };

    let remaining = timeLimit;
    timerEl.textContent = `${remaining.toFixed(1)}s`;
    const timer = setInterval(() => {
      remaining = Math.max(0, remaining - 0.1);
      timerEl.textContent = `${remaining.toFixed(1)}s`;
      if (remaining <= 0) {
        finish(false, "The stone settles — efficiency wasted.");
      }
    }, 100);

    return () => {
      clearInterval(timer);
      strike.onclick = null;
    };
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
    updateGrudgeWidget,
    bindGrudgeExorcise,
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
    closeVowMenu,
    openTrainingMenu,
    closeTrainingMenu,
    bindTrainingButton,
    ensureControlDock,
    refreshCosmeticTester,
    getPerformanceTarget: () => performanceTargetValue,
    setPerformanceTarget: (value) => setPerformanceTarget(value, { emit: false }),
    onPerformanceTargetChange,
    offPerformanceTargetChange,
    setDynamicResolutionOptions: (state) => setDynamicResolutionUI(state, { emit: false }),
    updateDynamicResolutionState: (state) => setDynamicResolutionUI(state, { emit: false }),
    onDynamicResolutionChange,
    offDynamicResolutionChange,
    setAdaptiveQualityStatus,
    openHelp: openHelpOverlay,
    closeHelp: closeHelpOverlay,
    openLog: openLogOverlay,
    closeLog: closeLogOverlay,
    openRigUnlockConsole,
    closeRigUnlockConsole,
    isRigEditorUnlocked,
    onRigEditorUnlock,
    configureDevPanel,
    updateDevPanelState,
    setRearViewActive: (active) => {
      const cache = devPanelCache || ensureDevPanel();
      cache?.setRearViewButtonState?.(!!active);
    },
    toggleDevPanel,
    setDevPanelVisible,
    configureProfilerOverlay,
    updateProfilerOverlayMetrics,
    updateProfilerOverlayState,
    toggleProfilerOverlay,
    setProfilerOverlayVisible
  };
  window.HUD = HUD;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateRigEditorMenuVisibility);
  } else {
    updateRigEditorMenuVisibility();
  }
  ensureControlDock();
  if (typeof H.subscribeAura === "function") {
    try {
      H.subscribeAura(handleGyoState);
      H.subscribeAura(updateDevPanelState);
      const initialAura = H.getAuraState?.();
      if (initialAura) {
        handleGyoState(initialAura);
        updateDevPanelState(initialAura);
      }
    } catch (err) {
      console.warn("[HUD] Failed to subscribe to aura state", err);
    }
  }
})();
// === Character creator preview & selectors ===
(() => {
  const SCREEN_ID = "screen--creator";
  const CANVAS_ID = "creator-preview-canvas";
  const CREATOR_GROUND_Y = -0.25;
  const DEG2RAD = Math.PI / 180;
  const FALLBACK_PART_KEYS = [
    "pelvis","torsoLower","torsoUpper","neck","head",
    "shoulderL","armL_upper","armL_fore","armL_hand",
    "shoulderR","armR_upper","armR_fore","armR_hand",
    "hipL","legL_thigh","legL_shin","legL_foot",
    "hipR","legR_thigh","legR_shin","legR_foot"
  ];

  function t0() {
    return { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } };
  }

  const FALLBACK_RIG = {
    color: "#804a00",
    pelvis: { w: 0.850, h: 0.350, d: 0.520 },
    torsoLower: { w: 0.900, h: 0.450, d: 0.550 },
    torsoUpper: { w: 0.950, h: 0.710, d: 0.550 },
    neck: { w: 0.250, h: 0.250, d: 0.250 },
    head: { w: 0.520, h: 0.520, d: 0.520 },
    arm: {
      upperW: 0.340, upperD: 0.340, upperLen: 0.750,
      foreW: 0.300, foreD: 0.270, foreLen: 0.700,
      handLen: 0.250
    },
    leg: {
      thighW: 0.450, thighD: 0.500, thighLen: 1.050,
      shinW: 0.330, shinD: 0.430, shinLen: 0.880,
      footW: 0.320, footH: 0.210, footLen: 0.750
    },
    transforms: {
      pelvis: { ...t0(), pos: { x: 0.000, y: 1.190, z: 0.000 } },
      torsoLower: { ...t0(), pos: { x: 0.000, y: 0.450, z: 0.000 } },
      torsoUpper: { ...t0(), pos: { x: 0.000, y: 0.710, z: 0.000 } },
      neck: { ...t0(), pos: { x: 0.000, y: 0.250, z: 0.000 } },
      head: t0(),
      shoulderL: { ...t0(), pos: { x: -0.650, y: 0.000, z: 0.000 }, rot: { x: 0, y: 180, z: 0 } },
      armL_upper: t0(),
      armL_fore: { ...t0(), pos: { x: 0.000, y: -0.750, z: 0.000 } },
      armL_hand: { ...t0(), pos: { x: 0.000, y: -0.710, z: 0.000 } },
      shoulderR: { ...t0(), pos: { x: 0.650, y: 0.000, z: 0.000 }, rot: { x: 0, y: 180, z: 0 } },
      armR_upper: t0(),
      armR_fore: { ...t0(), pos: { x: 0.000, y: -0.750, z: 0.000 } },
      armR_hand: { ...t0(), pos: { x: 0.000, y: -0.710, z: 0.000 } },
      hipL: { ...t0(), pos: { x: -0.250, y: -0.350, z: 0.000 } },
      legL_thigh: t0(),
      legL_shin: { ...t0(), pos: { x: 0.000, y: -1.050, z: 0.000 } },
      legL_foot: { ...t0(), pos: { x: 0.000, y: -0.880, z: -0.210 } },
      hipR: { ...t0(), pos: { x: 0.250, y: -0.350, z: 0.000 } },
      legR_thigh: t0(),
      legR_shin: { ...t0(), pos: { x: 0.000, y: -1.050, z: 0.000 } },
      legR_foot: { ...t0(), pos: { x: 0.000, y: -0.880, z: -0.210 } }
    }
  };

  const loadoutStatusTimers = new WeakMap();

  const state = {
    dom: null,
    engine: null,
    scene: null,
    camera: null,
    renderFn: null,
    running: false,
    resizeObserver: null,
    resizeHandler: null,
    configKey: null,
    config: null,
    specMaps: null,
    baseSelection: null,
    selection: null,
    preview: null,
    rigSignature: null,
    stanceKey: null,
    observer: null,
    listenersBound: false,
    accessoryInputs: [],
    rigButton: null,
    saveLoadoutButton: null,
    loadLoadoutButton: null
  };

  function openRigEditorFromCreator() {
    const rigApi = window.RigEditor;
    if (!rigApi || typeof rigApi.boot !== "function") {
      alert("Rig Editor is not available in this build.");
      return;
    }
    const hx = window.HXH || {};
    const currentSelection = (() => {
      try {
        const raw = typeof hx.getCosmeticSelection === "function"
          ? hx.getCosmeticSelection()
          : null;
        if (raw && state.baseSelection) {
          return mergeSelection(state.baseSelection, raw);
        }
        if (raw) return deepClone(raw);
      } catch (err) {
        console.warn("[Creator] Failed to read cosmetics before opening rig editor", err);
      }
      if (state.selection) return deepClone(state.selection);
      if (state.baseSelection) return deepClone(state.baseSelection);
      ensureConfig();
      return state.baseSelection ? deepClone(state.baseSelection) : null;
    })();
    const sessionRig = (() => {
      try {
        return typeof hx.getRig === "function" ? hx.getRig() : null;
      } catch (err) {
        console.warn("[Creator] Failed to read rig before opening editor", err);
        return null;
      }
    })();

    const onReturn = (result = {}) => {
      const hx = window.HXH || {};
      if (result && typeof result === "object") {
        const { rig: nextRig, cosmetics: nextCosmetics } = result;
        const rigType = typeof result.rigType === "string" ? result.rigType : null;
        const wantsRigUpdate = nextRig != null || rigType;
        if (wantsRigUpdate && typeof hx.setRig === "function") {
          let payload = nextRig != null && typeof nextRig === "object" ? deepClone(nextRig) : {};
          if (rigType && typeof payload === "object" && payload) {
            payload = { ...payload, rigType };
          }
          try {
            hx.setRig(payload);
          } catch (err) {
            console.warn("[Creator] Failed to apply rig from editor", err);
          }
        }
        if (nextCosmetics && typeof hx.applyCosmeticLoadout === "function") {
          try {
            const applied = hx.applyCosmeticLoadout(deepClone(nextCosmetics), { persist: true });
            if (applied && typeof applied === "object") {
              state.selection = deepClone(applied);
            }
          } catch (err) {
            console.warn("[Creator] Failed to apply cosmetics from editor", err);
          }
        }
      }
      const dom = ensureDom();
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
      if (dom?.screen) {
        dom.screen.classList.add("visible");
      }
      open();
    };

    try {
      hx.cancelRigEditorSession?.();
    } catch (err) {
      console.warn("[Creator] Failed to clear previous rig session", err);
    }

    try {
      hx.prepareRigEditorSession?.({
        source: "creator",
        cosmetics: currentSelection,
        rig: sessionRig,
        onReturn,
        meta: { screenId: SCREEN_ID }
      });
    } catch (err) {
      console.warn("[Creator] Failed to prepare rig editor session", err);
    }

    close();
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
    document.getElementById("screen--rig")?.classList.add("visible");
    rigApi.boot();
  }

  function deepClone(value) {
    if (value == null || typeof value !== "object") return value;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (err) {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (err) {}
    if (Array.isArray(value)) return value.slice();
    return { ...value };
  }

  function colorFromHex(hex, fallback = "#ffffff") {
    try {
      if (typeof hex === "string" && /^#/u.test(hex)) {
        return BABYLON.Color3.FromHexString(hex);
      }
    } catch (err) {}
    try { return BABYLON.Color3.FromHexString(fallback); } catch (err) {}
    return BABYLON.Color3.White();
  }

  function mergeSelection(base, override) {
    const result = deepClone(base);
    if (!override || typeof override !== "object") return result;
    if (typeof override.face === "string") result.face = override.face;
    if (typeof override.hair === "string") result.hair = override.hair;
    if (override.outfit && typeof override.outfit === "object") {
      result.outfit = { ...result.outfit };
      if (Object.prototype.hasOwnProperty.call(override.outfit, "top")) {
        result.outfit.top = override.outfit.top;
      }
      if (Object.prototype.hasOwnProperty.call(override.outfit, "bottom")) {
        result.outfit.bottom = override.outfit.bottom;
      }
      if (Object.prototype.hasOwnProperty.call(override.outfit, "full")) {
        result.outfit.full = override.outfit.full;
      }
    }
    if (typeof override.shoes === "string") result.shoes = override.shoes;
    if (Array.isArray(override.accessories)) result.accessories = override.accessories.slice();
    return result;
  }

  function flashLoadoutButton(button, message, { revertDelay = 1600 } = {}) {
    if (!button) return;
    const original = button.dataset.defaultLabel || button.textContent;
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = original;
    }
    button.textContent = message;
    button.disabled = true;
    const prevTimer = loadoutStatusTimers.get(button);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(() => {
      button.textContent = button.dataset.defaultLabel || original;
      button.disabled = false;
      loadoutStatusTimers.delete(button);
    }, Math.max(400, revertDelay));
    loadoutStatusTimers.set(button, timer);
  }

  function getCosmeticStorageKey() {
    return (window.RigDefinitions && window.RigDefinitions.COSMETIC_STORAGE_KEY) || "hxh.cosmetics";
  }

  function readSavedCosmeticLoadout() {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(getCosmeticStorageKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object"
        ? (parsed.selection || parsed.cosmetics || parsed.data || parsed)
        : null;
    } catch (err) {
      return null;
    }
  }

  function writeSavedCosmeticLoadout(selection) {
    if (typeof localStorage === "undefined") return null;
    try {
      ensureConfig();
      const specMaps = state.specMaps || buildSpecMaps(getCosmeticConfig());
      const base = state.baseSelection || buildDefaultSelection(specMaps);
      const normalized = normalizeSelection(selection, base, specMaps);
      localStorage.setItem(getCosmeticStorageKey(), JSON.stringify({ version: 1, selection: normalized }));
      return normalized;
    } catch (err) {
      return null;
    }
  }

  function handleSaveLoadout(button) {
    const hx = window.HXH;
    let selection = null;
    try { selection = hx?.getCosmeticSelection?.(); } catch (err) { selection = null; }
    if (!selection) {
      selection = state.selection ? deepClone(state.selection) : getCosmeticSelectionSnapshot();
    }
    let saved = null;
    if (hx?.saveCosmeticLoadout) {
      try { saved = hx.saveCosmeticLoadout(selection); } catch (err) { saved = null; }
    }
    if (!saved) {
      saved = writeSavedCosmeticLoadout(selection);
    }
    if (saved) {
      flashLoadoutButton(button, "Loadout Saved!");
      refreshFromGame({ fallback: saved });
    } else {
      flashLoadoutButton(button, "Save Failed", { revertDelay: 2000 });
    }
  }

  function handleLoadLoadout(button) {
    const hx = window.HXH;
    let saved = null;
    if (hx?.getSavedCosmeticLoadout) {
      try { saved = hx.getSavedCosmeticLoadout(); } catch (err) { saved = null; }
    }
    if (!saved) {
      const raw = readSavedCosmeticLoadout();
      if (raw) {
        ensureConfig();
        const specMaps = state.specMaps || buildSpecMaps(getCosmeticConfig());
        const base = state.baseSelection || buildDefaultSelection(specMaps);
        saved = normalizeSelection(raw, base, specMaps);
      }
    }
    if (!saved) {
      flashLoadoutButton(button, "No Loadout", { revertDelay: 1600 });
      return;
    }
    let applied = null;
    if (hx?.applyCosmeticLoadout) {
      try { applied = hx.applyCosmeticLoadout(saved); } catch (err) { applied = null; }
    }
    if (!applied) {
      if (hx) {
        try { hx.setFace?.(saved.face); } catch (err) {}
        try { hx.setHair?.(saved.hair); } catch (err) {}
        try { hx.setOutfit?.(saved.outfit); } catch (err) {}
        try { hx.setShoes?.(saved.shoes); } catch (err) {}
        try { hx.setAccessories?.(saved.accessories); } catch (err) {}
      }
      applied = saved;
    }
    refreshFromGame({ fallback: applied });
    flashLoadoutButton(button, "Loadout Loaded!");
  }

  function onSaveLoadoutClick(event) {
    event?.preventDefault();
    handleSaveLoadout(event?.currentTarget || state.saveLoadoutButton);
  }

  function onLoadLoadoutClick(event) {
    event?.preventDefault();
    handleLoadLoadout(event?.currentTarget || state.loadLoadoutButton);
  }

  function getCosmeticConfig() {
    const hx = window.HXH;
    if (hx && typeof hx.getAvailableCosmetics === "function") {
      try {
        const cfg = hx.getAvailableCosmetics();
        if (cfg && typeof cfg === "object") return deepClone(cfg);
      } catch (err) {}
    }
    const defs = window.RigDefinitions;
    if (defs && defs.COSMETICS) return deepClone(defs.COSMETICS);
    return {
      faces: [],
      hair: [],
      outfits: { top: {}, bottom: {}, full: {} },
      shoes: {},
      accessories: {}
    };
  }

  function buildSpecMaps(config) {
    const faces = Array.isArray(config.faces)
      ? config.faces.filter(spec => spec && typeof spec.id === "string")
      : [];
    const hair = Array.isArray(config.hair)
      ? config.hair.filter(spec => spec && typeof spec.id === "string")
      : [];

    const topEntries = Object.entries(config?.outfits?.top || {});
    const bottomEntries = Object.entries(config?.outfits?.bottom || {});
    const fullEntries = Object.entries(config?.outfits?.full || {});

    const topSpecs = topEntries.map(([key, spec]) => ({ ...(spec || {}), id: spec?.id || key }));
    const bottomSpecs = bottomEntries.map(([key, spec]) => ({ ...(spec || {}), id: spec?.id || key }));
    const fullSpecs = fullEntries.map(([key, spec]) => ({ ...(spec || {}), id: spec?.id || key }));

    const shoeEntries = Object.entries(config?.shoes || {});
    const shoeSpecs = shoeEntries.map(([key, spec]) => ({ ...(spec || {}), id: spec?.id || key }));

    const accessoryEntries = Object.entries(config?.accessories || {});
    const accessorySpecs = accessoryEntries.map(([key, spec]) => ({ ...(spec || {}), id: spec?.id || key }));

    const faceMap = new Map(faces.map(spec => [spec.id, spec]));
    const hairMap = new Map(hair.map(spec => [spec.id, spec]));

    const topMap = new Map(topSpecs.map(spec => [spec.id, spec]));
    const bottomMap = new Map(bottomSpecs.map(spec => [spec.id, spec]));
    const fullMap = new Map(fullSpecs.map(spec => [spec.id, spec]));
    const shoeMap = new Map(shoeSpecs.map(spec => [spec.id, spec]));
    const accessoryMap = new Map(accessorySpecs.map(spec => [spec.id, spec]));

    const defaults = {
      face: faces[0]?.id || "",
      hair: hair[0]?.id || "",
      top: topSpecs[0]?.id || "",
      bottom: bottomSpecs[0]?.id || "",
      full: fullSpecs[0]?.id ?? null,
      shoes: shoeSpecs[0]?.id || ""
    };

    return {
      faces,
      hair,
      topSpecs,
      bottomSpecs,
      fullSpecs,
      shoeSpecs,
      accessorySpecs,
      faceMap,
      hairMap,
      topMap,
      bottomMap,
      fullMap,
      shoeMap,
      accessoryMap,
      defaults
    };
  }

  function normalizeOutfit(next, base, specMaps) {
    const current = {
      top: typeof base?.top === "string" && base.top ? base.top : specMaps.defaults.top,
      bottom: typeof base?.bottom === "string" && base.bottom ? base.bottom : specMaps.defaults.bottom,
      full: base?.full != null ? base.full : specMaps.defaults.full
    };
    if (!next || typeof next !== "object") return current;
    if (Object.prototype.hasOwnProperty.call(next, "full")) {
      if (next.full === null) {
        current.full = null;
      } else if (typeof next.full === "string" && specMaps.fullMap.has(next.full)) {
        current.full = next.full;
      }
    }
    if (Object.prototype.hasOwnProperty.call(next, "top")) {
      if (typeof next.top === "string" && specMaps.topMap.has(next.top)) {
        current.top = next.top;
      }
      if (next.full === undefined) current.full = null;
    }
    if (Object.prototype.hasOwnProperty.call(next, "bottom")) {
      if (typeof next.bottom === "string" && specMaps.bottomMap.has(next.bottom)) {
        current.bottom = next.bottom;
      }
      if (next.full === undefined) current.full = null;
    }
    return current;
  }

  function normalizeAccessories(ids, specMaps) {
    if (!Array.isArray(ids) || !ids.length) return [];
    const unique = [];
    const seen = new Set();
    for (const raw of ids) {
      if (typeof raw !== "string") continue;
      const id = raw.trim();
      if (!id || seen.has(id) || !specMaps.accessoryMap.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    unique.sort();
    return unique;
  }

  function normalizeSelection(value, baseSelection, specMaps) {
    const base = deepClone(baseSelection);
    if (!value || typeof value !== "object") {
      base.accessories = normalizeAccessories(base.accessories, specMaps);
      base.outfit = normalizeOutfit(base.outfit, base.outfit, specMaps);
      return base;
    }
    if (typeof value.face === "string" && specMaps.faceMap.has(value.face)) {
      base.face = value.face;
    }
    if (typeof value.hair === "string" && specMaps.hairMap.has(value.hair)) {
      base.hair = value.hair;
    }
    base.outfit = normalizeOutfit(value.outfit, base.outfit, specMaps);
    if (typeof value.shoes === "string" && specMaps.shoeMap.has(value.shoes)) {
      base.shoes = value.shoes;
    }
    base.accessories = normalizeAccessories(value.accessories, specMaps);
    return base;
  }

  function buildDefaultSelection(specMaps) {
    const fallback = {
      face: specMaps.defaults.face,
      hair: specMaps.defaults.hair,
      outfit: {
        top: specMaps.defaults.top,
        bottom: specMaps.defaults.bottom,
        full: specMaps.defaults.full
      },
      shoes: specMaps.defaults.shoes,
      accessories: []
    };
    const defs = window.RigDefinitions;
    if (defs && defs.DEFAULT_COSMETICS) {
      return normalizeSelection(defs.DEFAULT_COSMETICS, fallback, specMaps);
    }
    return fallback;
  }

  function ensureDom() {
    if (state.dom) return state.dom;
    const screen = document.getElementById(SCREEN_ID);
    const canvas = document.getElementById(CANVAS_ID);
    if (!screen || !canvas) return null;
    const selectors = {
      face: document.getElementById("creator-face"),
      hair: document.getElementById("creator-hair"),
      outfitSet: document.getElementById("creator-outfit-set"),
      top: document.getElementById("creator-outfit-top"),
      bottom: document.getElementById("creator-outfit-bottom"),
      shoes: document.getElementById("creator-shoes")
    };
    const accessories = document.getElementById("creator-accessories");
    state.dom = { screen, canvas, selectors, accessories };

    if (!state.observer && typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(() => {
        if (!screen.classList.contains("visible")) {
          close();
        }
      });
      observer.observe(screen, { attributes: true, attributeFilter: ["class"] });
      state.observer = observer;
    }

    const form = document.getElementById("creator-form");
    form?.addEventListener("submit", () => {
      setTimeout(close, 0);
    });
    const cancel = document.getElementById("btn-cancel");
    cancel?.addEventListener("click", () => {
      setTimeout(close, 0);
    });

    if (form) {
      const actionRow = form.querySelector(".row-right");
      if (actionRow) {
        let btn = document.getElementById("creator-edit-rig");
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.id = "creator-edit-rig";
          btn.className = "secondary";
          btn.textContent = "Edit in Rig Editor";
          actionRow.insertBefore(btn, cancel || actionRow.firstChild);
        }
        if (state.rigButton !== btn) {
          state.rigButton?.removeEventListener("click", openRigEditorFromCreator);
          btn.addEventListener("click", openRigEditorFromCreator);
          state.rigButton = btn;
        }

        let saveBtn = document.getElementById("creator-save-loadout");
        if (!saveBtn) {
          saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.id = "creator-save-loadout";
          saveBtn.className = "secondary";
          saveBtn.textContent = "Save Loadout";
          actionRow.insertBefore(saveBtn, cancel || actionRow.firstChild);
        }
        if (state.saveLoadoutButton !== saveBtn) {
          state.saveLoadoutButton?.removeEventListener("click", onSaveLoadoutClick);
          saveBtn.addEventListener("click", onSaveLoadoutClick);
          state.saveLoadoutButton = saveBtn;
        }

        let loadBtn = document.getElementById("creator-load-loadout");
        if (!loadBtn) {
          loadBtn = document.createElement("button");
          loadBtn.type = "button";
          loadBtn.id = "creator-load-loadout";
          loadBtn.className = "secondary";
          loadBtn.textContent = "Load Loadout";
          actionRow.insertBefore(loadBtn, cancel || actionRow.firstChild);
        }
        if (state.loadLoadoutButton !== loadBtn) {
          state.loadLoadoutButton?.removeEventListener("click", onLoadLoadoutClick);
          loadBtn.addEventListener("click", onLoadLoadoutClick);
          state.loadLoadoutButton = loadBtn;
        }
      }
    }

    return state.dom;
  }

  function ensureConfig() {
    const dom = ensureDom();
    if (!dom) return;
    const config = getCosmeticConfig();
    const key = JSON.stringify(config);
    if (state.configKey === key && state.specMaps) return;
    state.configKey = key;
    state.config = config;
    state.specMaps = buildSpecMaps(config);
    state.baseSelection = buildDefaultSelection(state.specMaps);
    state.selection = null;
    if (state.preview) {
      try { state.preview.dispose?.(); } catch (err) {}
      state.preview = null;
      state.rigSignature = null;
    }
    populateSelectors();
  }

  function populateSelectors() {
    const dom = state.dom;
    if (!dom || !state.specMaps) return;
    const { selectors, accessories } = dom;
    const maps = state.specMaps;

    function fillSelect(select, specs, { allowEmpty = false, emptyLabel = "None" } = {}) {
      if (!select) return;
      select.innerHTML = "";
      if (!specs.length) {
        if (allowEmpty) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = emptyLabel;
          select.appendChild(opt);
        }
        select.disabled = true;
        return;
      }
      specs.forEach(spec => {
        const opt = document.createElement("option");
        opt.value = spec.id;
        opt.textContent = spec.label || spec.id;
        select.appendChild(opt);
      });
      select.disabled = false;
    }

    fillSelect(selectors.face, maps.faces, { allowEmpty: true, emptyLabel: "Default" });
    fillSelect(selectors.hair, maps.hair, { allowEmpty: true, emptyLabel: "Default" });
    fillSelect(selectors.top, maps.topSpecs, { allowEmpty: true, emptyLabel: maps.topSpecs.length ? "Select" : "" });
    fillSelect(selectors.bottom, maps.bottomSpecs, { allowEmpty: true, emptyLabel: maps.bottomSpecs.length ? "Select" : "" });
    fillSelect(selectors.shoes, maps.shoeSpecs, { allowEmpty: true, emptyLabel: "Default" });

    if (selectors.outfitSet) {
      selectors.outfitSet.innerHTML = "";
      const custom = document.createElement("option");
      custom.value = "custom";
      custom.textContent = maps.fullSpecs.length ? "Custom Mix" : "Custom";
      selectors.outfitSet.appendChild(custom);
      maps.fullSpecs.forEach(spec => {
        const opt = document.createElement("option");
        opt.value = spec.id;
        opt.textContent = spec.label || spec.id;
        selectors.outfitSet.appendChild(opt);
      });
      selectors.outfitSet.disabled = maps.fullSpecs.length === 0;
    }

    if (accessories) {
      accessories.innerHTML = "";
      state.accessoryInputs = [];
      if (!maps.accessorySpecs.length) {
        const msg = document.createElement("span");
        msg.className = "small";
        msg.textContent = "No accessories available.";
        accessories.appendChild(msg);
      } else {
        maps.accessorySpecs.forEach(spec => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = spec.id;
          const span = document.createElement("span");
          span.textContent = spec.label || spec.id;
          label.appendChild(input);
          label.appendChild(span);
          accessories.appendChild(label);
          state.accessoryInputs.push({ input, label, spec });
        });
      }
    }

    state.listenersBound = false;
    bindSelectorEvents();
  }

  function setTopBottomDisabled(disabled) {
    const { selectors } = state.dom || {};
    if (!selectors) return;
    if (selectors.top) selectors.top.disabled = disabled || !selectors.top.options.length;
    if (selectors.bottom) selectors.bottom.disabled = disabled || !selectors.bottom.options.length;
  }

  function gatherAccessories() {
    if (!Array.isArray(state.accessoryInputs)) return [];
    const active = [];
    state.accessoryInputs.forEach(({ input }) => {
      if (input.checked) active.push(input.value);
    });
    active.sort();
    return active;
  }

  function updateAccessoryUi(ids) {
    const set = new Set(ids || []);
    if (!Array.isArray(state.accessoryInputs)) return;
    state.accessoryInputs.forEach(({ input, label }) => {
      const active = set.has(input.value);
      input.checked = active;
      if (active) {
        label.classList.add("selected");
      } else {
        label.classList.remove("selected");
      }
    });
  }

  function updateSelectors(selection) {
    const { selectors } = state.dom || {};
    if (!selectors) return;
    if (selectors.face) selectors.face.value = selection.face || "";
    if (selectors.hair) selectors.hair.value = selection.hair || "";
    const outfit = selection.outfit || {};
    if (selectors.outfitSet) {
      selectors.outfitSet.value = outfit.full || "custom";
      if (!outfit.full) selectors.outfitSet.value = "custom";
    }
    setTopBottomDisabled(Boolean(outfit.full));
    if (selectors.top) selectors.top.value = outfit.top || "";
    if (selectors.bottom) selectors.bottom.value = outfit.bottom || "";
    if (selectors.shoes) selectors.shoes.value = selection.shoes || "";
    updateAccessoryUi(selection.accessories);
  }

  function bindSelectorEvents() {
    const dom = state.dom;
    if (!dom) return;
    const { selectors } = dom;

    if (!state.listenersBound) {
      selectors.face?.addEventListener("change", () => {
        const id = selectors.face.value;
        let fallback = { face: id };
        try {
          const applied = window.HXH?.setFace?.(id);
          if (typeof applied === "string") fallback.face = applied;
        } catch (err) {}
        refreshFromGame({ fallback });
      });

      selectors.hair?.addEventListener("change", () => {
        const id = selectors.hair.value;
        let fallback = { hair: id };
        try {
          const applied = window.HXH?.setHair?.(id);
          if (typeof applied === "string") fallback.hair = applied;
        } catch (err) {}
        refreshFromGame({ fallback });
      });

      selectors.outfitSet?.addEventListener("change", () => {
        const value = selectors.outfitSet.value;
        if (value && value !== "custom") {
          let fallback = { outfit: { full: value } };
          try {
            const applied = window.HXH?.setOutfit?.({ full: value });
            if (applied && typeof applied === "object") fallback = { outfit: applied };
          } catch (err) {}
          refreshFromGame({ fallback });
          setTopBottomDisabled(true);
        } else {
          setTopBottomDisabled(false);
          const topId = selectors.top?.value || "";
          const bottomId = selectors.bottom?.value || "";
          let fallback = { outfit: { top: topId, bottom: bottomId, full: null } };
          try {
            const applied = window.HXH?.setOutfit?.({ top: topId, bottom: bottomId, full: null });
            if (applied && typeof applied === "object") fallback = { outfit: applied };
          } catch (err) {}
          refreshFromGame({ fallback });
        }
      });

      selectors.top?.addEventListener("change", () => {
        if (selectors.top.disabled) return;
        const topId = selectors.top.value;
        const bottomId = selectors.bottom?.value || "";
        let fallback = { outfit: { top: topId, bottom: bottomId, full: null } };
        try {
          const applied = window.HXH?.setOutfit?.({ top: topId, bottom: bottomId, full: null });
          if (applied && typeof applied === "object") fallback = { outfit: applied };
        } catch (err) {}
        refreshFromGame({ fallback });
      });

      selectors.bottom?.addEventListener("change", () => {
        if (selectors.bottom.disabled) return;
        const topId = selectors.top?.value || "";
        const bottomId = selectors.bottom.value;
        let fallback = { outfit: { top: topId, bottom: bottomId, full: null } };
        try {
          const applied = window.HXH?.setOutfit?.({ top: topId, bottom: bottomId, full: null });
          if (applied && typeof applied === "object") fallback = { outfit: applied };
        } catch (err) {}
        refreshFromGame({ fallback });
      });

      selectors.shoes?.addEventListener("change", () => {
        const id = selectors.shoes.value;
        let fallback = { shoes: id };
        try {
          const applied = window.HXH?.setShoes?.(id);
          if (typeof applied === "string") fallback.shoes = applied;
        } catch (err) {}
        refreshFromGame({ fallback });
      });

      state.listenersBound = true;
    }

    if (Array.isArray(state.accessoryInputs)) {
      state.accessoryInputs.forEach(({ input }) => {
        input.addEventListener("change", handleAccessoryChange);
      });
    }
  }

  function handleAccessoryChange() {
    const values = gatherAccessories();
    let fallback = { accessories: values };
    try {
      const applied = window.HXH?.setAccessories?.(values);
      if (Array.isArray(applied)) fallback.accessories = applied.slice();
    } catch (err) {}
    refreshFromGame({ fallback });
  }
  function getRigSpec() {
    const hx = window.HXH;
    try {
      const rig = hx?.getRig?.();
      if (rig) return deepClone(rig);
    } catch (err) {}
    const defs = window.RigDefinitions;
    if (defs?.DEFAULT_RIG) {
      if (typeof defs.deepClone === "function") {
        try { return defs.deepClone(defs.DEFAULT_RIG); } catch (err) {}
      }
      return deepClone(defs.DEFAULT_RIG);
    }
    return deepClone(FALLBACK_RIG);
  }

  function computeRigGroundSignature(rig) {
    if (!rig || typeof rig !== "object") return "null";
    const signature = {
      rigType: typeof rig.rigType === "string" ? rig.rigType : "",
      leg: rig.leg || null,
      pelvis: rig.pelvis || null,
      torsoLower: rig.torsoLower || null,
      torsoUpper: rig.torsoUpper || null,
      segments: null,
      transforms: {}
    };
    const segmentKeys = ["pelvis", "torsoLower", "torsoUpper", "neck", "head"];
    const srcSegments = rig && typeof rig.segments === "object" ? rig.segments : null;
    if (srcSegments) {
      signature.segments = {};
      segmentKeys.forEach(key => {
        if (srcSegments[key]) signature.segments[key] = srcSegments[key];
      });
    }
    const srcTransforms = rig && typeof rig.transforms === "object" ? rig.transforms : {};
    const transformKeys = [
      "pelvis",
      "hipL",
      "hipR",
      "legL_thigh",
      "legL_shin",
      "legL_foot",
      "legR_thigh",
      "legR_shin",
      "legR_foot"
    ];
    transformKeys.forEach(key => {
      if (srcTransforms[key]) signature.transforms[key] = srcTransforms[key];
    });
    try {
      return JSON.stringify(signature);
    } catch (err) {
      try {
        return JSON.stringify({ rigType: signature.rigType, leg: signature.leg });
      } catch (err2) {
        return `${signature.rigType || ""}:${Date.now()}`;
      }
    }
  }

  const FACE_MATERIAL_CACHE = new Map();


  function createPreviewRig(scene, rig, specMaps, baseSelection, selection) {
    const root = new BABYLON.TransformNode("creator-root", scene);
    const fallback = FALLBACK_RIG || {};
    const rigSegments = (rig && typeof rig.segments === "object") ? rig.segments : null;
    const fallbackSegments = (fallback && typeof fallback.segments === "object") ? fallback.segments : null;
    const rigTransforms = (rig && typeof rig.transforms === "object") ? rig.transforms : {};
    const fallbackTransforms = (fallback && typeof fallback.transforms === "object") ? fallback.transforms : {};
    const nodes = {};

    function num(...values) {
      for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
      return 0;
    }

    function segmentSize(key, defaults = {}) {
      const src = (rigSegments && rigSegments[key]) || rig?.[key] || {};
      const fb = (fallbackSegments && fallbackSegments[key]) || fallback?.[key] || defaults || {};
      return {
        w: num(src.w, fb.w, defaults.w ?? 0.4),
        h: num(src.h, fb.h, defaults.h ?? 0.4),
        d: num(src.d, fb.d, defaults.d ?? 0.4)
      };
    }

    const pelvisSize = segmentSize("pelvis", { w: 0.85, h: 0.35, d: 0.52 });
    const torsoLowerSize = segmentSize("torsoLower", { w: 0.9, h: 0.45, d: 0.55 });
    const torsoUpperSize = segmentSize("torsoUpper", { w: 0.95, h: 0.71, d: 0.55 });
    const neckSize = segmentSize("neck", { w: 0.25, h: 0.25, d: 0.25 });
    const headSize = segmentSize("head", { w: 0.52, h: 0.52, d: 0.52 });

    const armSource = rig?.arm || {};
    const armFallback = fallback?.arm || {};
    const armDims = {
      upperW: num(armSource.upperW, armFallback.upperW, 0.34),
      upperD: num(armSource.upperD, armFallback.upperD, 0.34),
      upperLen: num(armSource.upperLen, armFallback.upperLen, 0.75),
      foreW: num(armSource.foreW, armFallback.foreW, 0.30),
      foreD: num(armSource.foreD, armFallback.foreD, 0.27),
      foreLen: num(armSource.foreLen, armFallback.foreLen, 0.70),
      handLen: num(armSource.handLen, armFallback.handLen, 0.25)
    };

    const legSource = rig?.leg || {};
    const legFallback = fallback?.leg || {};
    const legDims = {
      thighW: num(legSource.thighW, legFallback.thighW, 0.45),
      thighD: num(legSource.thighD, legFallback.thighD, 0.50),
      thighLen: num(legSource.thighLen, legFallback.thighLen, 1.05),
      shinW: num(legSource.shinW, legFallback.shinW, 0.33),
      shinD: num(legSource.shinD, legFallback.shinD, 0.43),
      shinLen: num(legSource.shinLen, legFallback.shinLen, 0.88),
      footW: num(legSource.footW, legFallback.footW, 0.32),
      footH: num(legSource.footH, legFallback.footH, 0.21),
      footLen: num(legSource.footLen, legFallback.footLen, 0.75)
    };

    function register(key, node) {
      if (!node) return null;
      node.rotationQuaternion = null;
      nodes[key] = node;
      return node;
    }

    const basePivot = new BABYLON.TransformNode("creator-base", scene);
    basePivot.parent = root;

    const baseColorHex = (typeof rig?.color === "string") ? rig.color : (typeof fallback.color === "string" ? fallback.color : "#804a00");
    const baseColor = colorFromHex(baseColorHex, "#804a00");

    function makeBodyMat(scale = 1) {
      const mat = new BABYLON.StandardMaterial(`creator-body-${Math.random().toString(36).slice(2)}`, scene);
      const col = new BABYLON.Color3(baseColor.r, baseColor.g, baseColor.b);
      col.scaleInPlace(Math.max(0, scale));
      mat.diffuseColor = col;
      const emissive = new BABYLON.Color3(col.r, col.g, col.b);
      emissive.scaleInPlace(0.18);
      mat.emissiveColor = emissive;
      mat.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
      return mat;
    }

    function createSegmentY(parent, key, size, shade) {
      const pivot = register(key, new BABYLON.TransformNode(`creator-${key}_pivot`, scene));
      pivot.parent = parent;
      const mesh = BABYLON.MeshBuilder.CreateBox(`creator-${key}`, { width: size.w, height: size.h, depth: size.d }, scene);
      mesh.parent = pivot;
      mesh.position.y = -size.h * 0.5;
      mesh.material = makeBodyMat(shade);
      mesh.isPickable = false;
      return { pivot, mesh };
    }

    function createFoot(parent, key, dims, shade) {
      const pivot = register(key, new BABYLON.TransformNode(`creator-${key}_pivot`, scene));
      pivot.parent = parent;
      const mesh = BABYLON.MeshBuilder.CreateBox(`creator-${key}`, { width: dims.footW, height: dims.footH, depth: dims.footLen }, scene);
      mesh.parent = pivot;
      mesh.position.y = -dims.footH * 0.5;
      mesh.position.z = dims.footLen * 0.5;
      mesh.material = makeBodyMat(shade);
      mesh.isPickable = false;
      return { pivot, mesh };
    }

    const pelvis = createSegmentY(basePivot, "pelvis", pelvisSize, 1.0);
    const torsoLower = createSegmentY(pelvis.pivot, "torsoLower", torsoLowerSize, 1.0);
    torsoLower.pivot.position.y = 0.30;
    const torsoUpper = createSegmentY(torsoLower.pivot, "torsoUpper", torsoUpperSize, 0.92);
    torsoUpper.pivot.position.y = 0.55;
    const neck = createSegmentY(torsoUpper.pivot, "neck", neckSize, 0.85);
    neck.pivot.position.y = 0.55;
    const headPivot = register("head", new BABYLON.TransformNode("creator-head_pivot", scene));
    headPivot.parent = neck.pivot;
    const headMesh = BABYLON.MeshBuilder.CreateSphere(
      "creator-head",
      { diameterX: headSize.w, diameterY: headSize.h, diameterZ: headSize.d, segments: 32 },
      scene
    );
    headMesh.parent = headPivot;
    headMesh.position.y = headSize.h * 0.5;
    headMesh.material = makeBodyMat(0.8);
    headMesh.isPickable = false;

    const facePlane = BABYLON.MeshBuilder.CreatePlane("creator-face", { width: headSize.w * 0.92, height: headSize.h * 0.92 }, scene);
    facePlane.parent = headPivot;
    facePlane.position.y = headSize.h * 0.1;
    facePlane.position.z = (headSize.d * 0.5) + 0.01;
    facePlane.isPickable = false;

    const hairRoot = new BABYLON.TransformNode("creator-hair-root", scene);
    hairRoot.parent = headPivot;
    hairRoot.position.y = headSize.h * 0.5;

    const accessoryRoot = new BABYLON.TransformNode("creator-accessory-root", scene);
    accessoryRoot.parent = headPivot;
    accessoryRoot.position.y = headSize.h * 0.1;

    const shoulderL = register("shoulderL", new BABYLON.TransformNode("creator-shoulderL", scene));
    shoulderL.parent = torsoUpper.pivot;
    const shoulderR = register("shoulderR", new BABYLON.TransformNode("creator-shoulderR", scene));
    shoulderR.parent = torsoUpper.pivot;

    const armL = {};
    armL.upper = createSegmentY(shoulderL, "armL_upper", { w: armDims.upperW, h: armDims.upperLen, d: armDims.upperD }, 0.9);
    armL.fore = createSegmentY(armL.upper.pivot, "armL_fore", { w: armDims.foreW, h: armDims.foreLen, d: armDims.foreD }, 0.8);
    armL.hand = createSegmentY(armL.fore.pivot, "armL_hand", { w: armDims.foreW, h: armDims.handLen, d: armDims.foreD }, 0.75);

    const armR = {};
    armR.upper = createSegmentY(shoulderR, "armR_upper", { w: armDims.upperW, h: armDims.upperLen, d: armDims.upperD }, 0.9);
    armR.fore = createSegmentY(armR.upper.pivot, "armR_fore", { w: armDims.foreW, h: armDims.foreLen, d: armDims.foreD }, 0.8);
    armR.hand = createSegmentY(armR.fore.pivot, "armR_hand", { w: armDims.foreW, h: armDims.handLen, d: armDims.foreD }, 0.75);

    const hipL = register("hipL", new BABYLON.TransformNode("creator-hipL", scene));
    hipL.parent = pelvis.pivot;
    const hipR = register("hipR", new BABYLON.TransformNode("creator-hipR", scene));
    hipR.parent = pelvis.pivot;

    const legL = {};
    legL.thigh = createSegmentY(hipL, "legL_thigh", { w: legDims.thighW, h: legDims.thighLen, d: legDims.thighD }, 0.85);
    legL.shin = createSegmentY(legL.thigh.pivot, "legL_shin", { w: legDims.shinW, h: legDims.shinLen, d: legDims.shinD }, 0.8);
    legL.foot = createFoot(legL.shin.pivot, "legL_foot", legDims, 0.75);

    const legR = {};
    legR.thigh = createSegmentY(hipR, "legR_thigh", { w: legDims.thighW, h: legDims.thighLen, d: legDims.thighD }, 0.85);
    legR.shin = createSegmentY(legR.thigh.pivot, "legR_shin", { w: legDims.shinW, h: legDims.shinLen, d: legDims.shinD }, 0.8);
    legR.foot = createFoot(legR.shin.pivot, "legR_foot", legDims, 0.75);

    function createShoeOverlay(pivot, name) {
      const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: legDims.footW, height: legDims.footH, depth: legDims.footLen }, scene);
      mesh.parent = pivot;
      mesh.position.y = -legDims.footH * 0.5;
      mesh.position.z = legDims.footLen * 0.5;
      mesh.scaling = new BABYLON.Vector3(1.08, 1.05, 1.12);
      mesh.isPickable = false;
      mesh.setEnabled(true);
      return mesh;
    }

    const shoeMeshes = [
      createShoeOverlay(legL.foot.pivot, "creator-shoeL"),
      createShoeOverlay(legR.foot.pivot, "creator-shoeR")
    ];

    const footMeshes = [
      legL.foot.mesh,
      legR.foot.mesh,
      ...shoeMeshes
    ].filter(mesh => mesh);

    function recomputeGrounding() {
      const meshes = footMeshes.length ? footMeshes : root.getChildMeshes(false);
      if (!Array.isArray(meshes) || !meshes.length) {
        root.position.y = 0;
        root.metadata = root.metadata || {};
        root.metadata.creatorGrounding = {
          offset: 0,
          minY: null,
          method: "none"
        };
        return 0;
      }
      root.position.y = 0;
      try { root.computeWorldMatrix(true); } catch (err) {}
      let minY = Infinity;
      meshes.forEach(mesh => {
        if (!mesh) return;
        if (typeof mesh.isDisposed === "function" && mesh.isDisposed()) return;
        try { mesh.computeWorldMatrix(true); } catch (err) {}
        try { mesh.refreshBoundingInfo?.(); } catch (err) {}
        const info = typeof mesh.getBoundingInfo === "function" ? mesh.getBoundingInfo() : null;
        if (!info || !info.boundingBox) return;
        const y = info.boundingBox.minimumWorld?.y;
        if (Number.isFinite(y) && y < minY) minY = y;
      });
      if (!Number.isFinite(minY)) {
        root.position.y = 0;
        root.metadata = root.metadata || {};
        root.metadata.creatorGrounding = {
          offset: 0,
          minY: null,
          method: footMeshes.length ? "feet" : "bounds"
        };
        return 0;
      }
      const offset = CREATOR_GROUND_Y - minY;
      root.position.y = offset;
      try { root.computeWorldMatrix(true); } catch (err) {}
      root.metadata = root.metadata || {};
      root.metadata.creatorGrounding = {
        offset,
        minY,
        method: footMeshes.length ? "feet" : "bounds"
      };
      return offset;
    }

    const clothingRefs = {
      torso: [torsoLower.mesh, torsoUpper.mesh],
      sleeves: [armL.upper.mesh, armR.upper.mesh],
      hips: [pelvis.mesh],
      thighs: [legL.thigh.mesh, legR.thigh.mesh],
      shins: [legL.shin.mesh, legR.shin.mesh],
      shoes: shoeMeshes
    };

    const clothMatCache = new Map();
    const hairMatCache = new Map();
    const shoeMatCache = new Map();
    const accessoryMatCache = new Map();

    function clothMat(hex) {
      const key = hex || "#2d3d8f";
      if (clothMatCache.has(key)) return clothMatCache.get(key);
      const color = colorFromHex(hex || "#2d3d8f", "#2d3d8f");
      const mat = new BABYLON.StandardMaterial(`creator-cloth-${key}`, scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.22);
      mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
      clothMatCache.set(key, mat);
      return mat;
    }

    function hairMat(hex) {
      const key = hex || "#2f2f38";
      if (hairMatCache.has(key)) return hairMatCache.get(key);
      const color = colorFromHex(hex || "#2f2f38", "#2f2f38");
      const mat = new BABYLON.StandardMaterial(`creator-hair-${key}`, scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.25);
      mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
      hairMatCache.set(key, mat);
      return mat;
    }

    function shoeMat(spec) {
      const key = spec?.id || "default";
      if (shoeMatCache.has(key)) return shoeMatCache.get(key);
      const base = colorFromHex(spec?.base || "#2f2f38", "#2f2f38");
      const accent = colorFromHex(spec?.accent || spec?.base || "#585d70", "#585d70");
      const mat = new BABYLON.StandardMaterial(`creator-shoe-${key}`, scene);
      mat.diffuseColor = base;
      mat.emissiveColor = accent.scale(0.25);
      mat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
      shoeMatCache.set(key, mat);
      return mat;
    }

    function accessoryMat(hex) {
      const key = hex || "#68c9ff";
      if (accessoryMatCache.has(key)) return accessoryMatCache.get(key);
      const color = colorFromHex(hex || "#68c9ff", "#68c9ff");
      const mat = new BABYLON.StandardMaterial(`creator-acc-${key}`, scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.35);
      mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
      accessoryMatCache.set(key, mat);
      return mat;
    }

    function ensureFaceMaterial(faceId) {
      const id = FACE_SPEC_MAP.has(faceId) ? faceId : DEFAULT_FACE_ID;
      if (FACE_MATERIAL_CACHE.has(id)) return FACE_MATERIAL_CACHE.get(id);
      const size = 512;
      const texture = new BABYLON.DynamicTexture(`creator-face-${id}`, { width: size, height: size }, scene, false);
      const ctx = texture.getContext();
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, size, size);

      const eyeColor = "#10121a";
      const mouthColor = "#1f2230";
      const accentColor = "#f58a8a";
      const eyeY = size * 0.42;
      const eyeSpacing = size * 0.18;
      const eyeRadius = size * 0.065;

      function drawEye(cx) {
        ctx.beginPath();
        ctx.arc(cx, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = eyeColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, eyeY, eyeRadius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }

      drawEye(size * 0.5 - eyeSpacing);
      drawEye(size * 0.5 + eyeSpacing);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      switch (id) {
        case "grin": {
          ctx.strokeStyle = mouthColor;
          ctx.lineWidth = size * 0.035;
          ctx.beginPath();
          ctx.arc(size * 0.5, size * 0.62, size * 0.18, Math.PI * 0.15, Math.PI - Math.PI * 0.15);
          ctx.stroke();
          ctx.fillStyle = accentColor;
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.arc(size * 0.5, size * 0.65, size * 0.24, 0, Math.PI);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case "focused": {
          ctx.strokeStyle = mouthColor;
          ctx.lineWidth = size * 0.025;
          ctx.beginPath();
          ctx.moveTo(size * 0.44, size * 0.64);
          ctx.lineTo(size * 0.56, size * 0.64);
          ctx.stroke();
          const browWidth = size * 0.24;
          const browY = size * 0.36;
          ctx.lineWidth = size * 0.04;
          ctx.beginPath();
          ctx.moveTo(size * 0.5 - browWidth * 0.5, browY + size * 0.02);
          ctx.lineTo(size * 0.5 - browWidth * 0.15, browY - size * 0.02);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(size * 0.5 + browWidth * 0.5, browY + size * 0.02);
          ctx.lineTo(size * 0.5 + browWidth * 0.15, browY - size * 0.02);
          ctx.stroke();
          break;
        }
        default: {
          ctx.strokeStyle = mouthColor;
          ctx.lineWidth = size * 0.03;
          ctx.beginPath();
          ctx.moveTo(size * 0.42, size * 0.63);
          ctx.lineTo(size * 0.58, size * 0.63);
          ctx.stroke();
        }
      }

      texture.hasAlpha = true;
      texture.update();

      const material = new BABYLON.StandardMaterial(`creator-face-mat-${id}`, scene);
      material.diffuseTexture = texture;
      material.specularColor = new BABYLON.Color3(0, 0, 0);
      material.emissiveColor = new BABYLON.Color3(0.08, 0.08, 0.08);
      FACE_MATERIAL_CACHE.set(id, material);
      return material;
    }

    function instantiateHair(spec) {
      const nodesList = [];
      if (!spec) return nodesList;
      const baseMat = hairMat(spec.primaryColor);
      const accentMat = hairMat(spec.secondaryColor || spec.primaryColor);
      const headW = headSize.w;
      const headH = headSize.h;
      const headD = headSize.d;
      switch (spec.id) {
        case "windswept": {
          const crown = BABYLON.MeshBuilder.CreateBox("creator-hair-crown", {
            width: headW * 1.28,
            height: headH * 0.48,
            depth: headD * 1.18
          }, scene);
          crown.parent = hairRoot;
          crown.position.y = headH * 0.2;
          crown.material = baseMat;
          crown.isPickable = false;
          nodesList.push(crown);

          const fringe = BABYLON.MeshBuilder.CreateBox("creator-hair-fringe", {
            width: headW * 1.1,
            height: headH * 0.26,
            depth: headD * 0.45
          }, scene);
          fringe.parent = hairRoot;
          fringe.position.x = headW * 0.05;
          fringe.position.y = -headH * 0.15;
          fringe.position.z = headD * 0.6;
          fringe.rotation.y = -5 * DEG2RAD;
          fringe.material = accentMat;
          fringe.isPickable = false;
          nodesList.push(fringe);
          break;
        }
        case "scout_hat": {
          const brim = BABYLON.MeshBuilder.CreateCylinder("creator-hat-brim", {
            diameter: headW * 1.65,
            height: headH * 0.05
          }, scene);
          brim.parent = hairRoot;
          brim.position.y = headH * 0.05;
          brim.material = accentMat;
          brim.isPickable = false;
          nodesList.push(brim);

          const crown = BABYLON.MeshBuilder.CreateCylinder("creator-hat-crown", {
            diameter: headW * 1.0,
            height: headH * 0.7
          }, scene);
          crown.parent = hairRoot;
          crown.position.y = headH * 0.45;
          crown.material = baseMat;
          crown.isPickable = false;
          nodesList.push(crown);
          break;
        }
        default: {
          const cap = BABYLON.MeshBuilder.CreateBox("creator-hair-cap", {
            width: headW * 1.22,
            height: headH * 0.42,
            depth: headD * 1.1
          }, scene);
          cap.parent = hairRoot;
          cap.position.y = headH * 0.18;
          cap.material = baseMat;
          cap.isPickable = false;
          nodesList.push(cap);
        }
      }
      return nodesList;
    }

    function instantiateAccessory(spec) {
      const nodesList = [];
      if (!spec) return nodesList;
      switch (spec.id) {
        case "visor": {
          const visor = BABYLON.MeshBuilder.CreatePlane("creator-acc-visor", {
            width: headSize.w * 1.35,
            height: headSize.h * 0.32
          }, scene);
          visor.parent = accessoryRoot;
          visor.position.y = headSize.h * 0.1;
          visor.position.z = headSize.d * 0.58;
          visor.material = accessoryMat(spec.color);
          visor.isPickable = false;
          nodesList.push(visor);
          break;
        }
        case "earrings": {
          const diameter = headSize.w * 0.18;
          const offsetX = headSize.w * 0.6;
          const offsetY = -headSize.h * 0.05;
          const left = BABYLON.MeshBuilder.CreateSphere("creator-acc-earL", { diameter }, scene);
          left.parent = accessoryRoot;
          left.position.x = -offsetX;
          left.position.y = offsetY;
          left.material = accessoryMat(spec.color);
          left.isPickable = false;
          nodesList.push(left);

          const right = left.clone("creator-acc-earR");
          right.parent = accessoryRoot;
          right.position.x = offsetX;
          nodesList.push(right);
          break;
        }
        case "scarf": {
          const ring = BABYLON.MeshBuilder.CreateTorus("creator-acc-scarf", {
            diameter: Math.max(0.4, (neckSize.w + neckSize.d) * 1.2),
            thickness: Math.max(0.08, neckSize.h * 0.5)
          }, scene);
          ring.parent = neck.pivot;
          ring.rotation.x = Math.PI / 2;
          ring.position.y = -neckSize.h * 0.35;
          ring.material = accessoryMat(spec.color);
          ring.isPickable = false;
          nodesList.push(ring);

          const tail = BABYLON.MeshBuilder.CreateBox("creator-acc-scarf-tail", {
            width: neckSize.w * 0.6,
            height: headSize.h * 0.45,
            depth: neckSize.d * 0.5
          }, scene);
          tail.parent = neck.pivot;
          tail.position.x = -neckSize.w * 0.6;
          tail.position.y = -neckSize.h * 0.9;
          tail.position.z = headSize.d * 0.12;
          tail.rotation.z = 18 * DEG2RAD;
          tail.material = accessoryMat(spec.accent || spec.color);
          tail.isPickable = false;
          nodesList.push(tail);
          break;
        }
        default:
          break;
      }
      return nodesList;
    }

    function getTransform(key) {
      const src = rigTransforms[key] || {};
      const fb = fallbackTransforms[key] || {};
      const posSrc = src.pos || {};
      const posFb = fb.pos || {};
      const rotSrc = src.rot || {};
      const rotFb = fb.rot || {};
      return {
        pos: {
          x: num(posSrc.x, posFb.x, 0),
          y: num(posSrc.y, posFb.y, 0),
          z: num(posSrc.z, posFb.z, 0)
        },
        rot: {
          x: num(rotSrc.x, rotFb.x, 0),
          y: num(rotSrc.y, rotFb.y, 0),
          z: num(rotSrc.z, rotFb.z, 0)
        }
      };
    }

    function applyRigTransforms() {
      const keys = new Set([...FALLBACK_PART_KEYS, ...Object.keys(nodes)]);
      keys.forEach(key => {
        const node = nodes[key];
        if (!node) return;
        const tr = getTransform(key);
        node.position.x = tr.pos.x;
        node.position.y = tr.pos.y;
        node.position.z = tr.pos.z;
        node.rotation.x = (tr.rot.x || 0) * DEG2RAD;
        node.rotation.y = (tr.rot.y || 0) * DEG2RAD;
        node.rotation.z = (tr.rot.z || 0) * DEG2RAD;
      });
    }

    applyRigTransforms();

    const FACE_SPEC_MAP = new Map(specMaps.faces.map(spec => [spec.id, spec]));
    const HAIR_SPEC_MAP = new Map(specMaps.hair.map(spec => [spec.id, spec]));
    const TOP_SPEC_MAP = new Map(specMaps.topSpecs.map(spec => [spec.id, spec]));
    const BOTTOM_SPEC_MAP = new Map(specMaps.bottomSpecs.map(spec => [spec.id, spec]));
    const FULL_SPEC_MAP = new Map(specMaps.fullSpecs.map(spec => [spec.id, spec]));
    const SHOE_SPEC_MAP = new Map(specMaps.shoeSpecs.map(spec => [spec.id, spec]));
    const ACCESSORY_SPEC_MAP = new Map(specMaps.accessorySpecs.map(spec => [spec.id, spec]));

    const DEFAULT_FACE_ID = specMaps.defaults.face || specMaps.faces[0]?.id || "";
    const DEFAULT_HAIR_ID = specMaps.defaults.hair || specMaps.hair[0]?.id || "";
    const DEFAULT_TOP_ID = specMaps.defaults.top || specMaps.topSpecs[0]?.id || "";
    const DEFAULT_BOTTOM_ID = specMaps.defaults.bottom || specMaps.bottomSpecs[0]?.id || "";
    const DEFAULT_FULL_ID = specMaps.defaults.full;
    const DEFAULT_SHOE_ID = specMaps.defaults.shoes || specMaps.shoeSpecs[0]?.id || "";

    const cosmeticState = normalizeSelection(selection, baseSelection, specMaps);

    const hairState = { id: null, nodes: [] };
    const accessoryState = new Map();

    function applyFace(id) {
      const target = FACE_SPEC_MAP.has(id) ? id : DEFAULT_FACE_ID;
      facePlane.material = ensureFaceMaterial(target);
      cosmeticState.face = target;
      return cosmeticState.face;
    }

    function applyHair(id) {
      const target = HAIR_SPEC_MAP.has(id) ? id : DEFAULT_HAIR_ID;
      hairState.nodes.forEach(node => { try { node.dispose(); } catch (err) {}; });
      hairState.nodes = instantiateHair(HAIR_SPEC_MAP.get(target));
      hairState.id = target;
      cosmeticState.hair = target;
      return cosmeticState.hair;
    }

    function applyTop(id) {
      const spec = TOP_SPEC_MAP.has(id) ? TOP_SPEC_MAP.get(id) : TOP_SPEC_MAP.get(DEFAULT_TOP_ID);
      const applied = spec?.id || id || DEFAULT_TOP_ID;
      const torsoMat = clothMat(spec?.body || "#2d3d8f");
      const accentMat = clothMat(spec?.accent || spec?.body || "#2d3d8f");
      const sleeveMat = clothMat(spec?.sleeve || spec?.body || "#2d3d8f");
      if (clothingRefs.torso[0]) clothingRefs.torso[0].material = torsoMat;
      if (clothingRefs.torso[1]) clothingRefs.torso[1].material = accentMat;
      clothingRefs.sleeves.forEach(mesh => { mesh.material = sleeveMat; });
      return applied;
    }

    function applyBottom(id) {
      const spec = BOTTOM_SPEC_MAP.has(id) ? BOTTOM_SPEC_MAP.get(id) : BOTTOM_SPEC_MAP.get(DEFAULT_BOTTOM_ID);
      const applied = spec?.id || id || DEFAULT_BOTTOM_ID;
      const hipMat = clothMat(spec?.hips || "#243244");
      const thighMat = clothMat(spec?.thigh || spec?.hips || "#243244");
      const shinMat = clothMat(spec?.shin || spec?.thigh || spec?.hips || "#243244");
      clothingRefs.hips.forEach(mesh => { mesh.material = hipMat; });
      clothingRefs.thighs.forEach(mesh => { mesh.material = thighMat; });
      clothingRefs.shins.forEach(mesh => { mesh.material = shinMat; });
      return applied;
    }

    function applyShoes(id) {
      const spec = SHOE_SPEC_MAP.has(id) ? SHOE_SPEC_MAP.get(id) : SHOE_SPEC_MAP.get(DEFAULT_SHOE_ID);
      const applied = spec?.id || id || DEFAULT_SHOE_ID;
      const mat = shoeMat(spec || { id: applied });
      clothingRefs.shoes.forEach(mesh => { mesh.material = mat; mesh.setEnabled(true); });
      cosmeticState.shoes = applied;
      return cosmeticState.shoes;
    }

    function applyAccessories(ids) {
      const desired = Array.isArray(ids) ? ids.filter(id => ACCESSORY_SPEC_MAP.has(id)) : [];
      for (const [key, nodes] of accessoryState) {
        if (!desired.includes(key)) {
          nodes.forEach(node => { try { node.dispose(); } catch (err) {}; });
          accessoryState.delete(key);
        }
      }
      const applied = [];
      desired.forEach(id => {
        if (!accessoryState.has(id)) {
          accessoryState.set(id, instantiateAccessory(ACCESSORY_SPEC_MAP.get(id)));
        }
        if (accessoryState.has(id)) applied.push(id);
      });
      cosmeticState.accessories = applied.slice();
      return cosmeticState.accessories.slice();
    }

    function applyOutfit(next) {
      const normalized = normalizeOutfit(next, cosmeticState.outfit, specMaps);
      let fullId = normalized.full;
      if (fullId && !FULL_SPEC_MAP.has(fullId)) {
        fullId = null;
      }
      if (fullId) {
        const preset = FULL_SPEC_MAP.get(fullId);
        if (preset?.top && TOP_SPEC_MAP.has(preset.top)) normalized.top = preset.top;
        if (preset?.bottom && BOTTOM_SPEC_MAP.has(preset.bottom)) normalized.bottom = preset.bottom;
      }
      const appliedTop = applyTop(normalized.top);
      const appliedBottom = applyBottom(normalized.bottom);
      cosmeticState.outfit = { top: appliedTop, bottom: appliedBottom, full: fullId };
      return deepClone(cosmeticState.outfit);
    }

    function applyAll(sel) {
      const normalized = normalizeSelection(sel, baseSelection, specMaps);
      applyFace(normalized.face);
      applyHair(normalized.hair);
      const outfit = applyOutfit(normalized.outfit);
      const shoes = applyShoes(normalized.shoes);
      const accessories = applyAccessories(normalized.accessories);
      cosmeticState.face = normalized.face;
      cosmeticState.hair = normalized.hair;
      cosmeticState.outfit = deepClone(outfit);
      cosmeticState.shoes = shoes;
      cosmeticState.accessories = accessories;
      return {
        face: cosmeticState.face,
        hair: cosmeticState.hair,
        outfit: deepClone(cosmeticState.outfit),
        shoes: cosmeticState.shoes,
        accessories: cosmeticState.accessories.slice()
      };
    }

    applyAll(selection);
    recomputeGrounding();

    return {
      root,
      cosmetics: {
        applyAll,
        applyFace,
        applyHair,
        applyOutfit,
        applyShoes,
        applyAccessories,
        getState() {
          return {
            face: cosmeticState.face,
            hair: cosmeticState.hair,
            outfit: deepClone(cosmeticState.outfit),
            shoes: cosmeticState.shoes,
            accessories: cosmeticState.accessories.slice()
          };
        }
      },
      recomputeGrounding,
      dispose() {
        try { root.dispose(); } catch (err) {}
      }
    };
  }
  function ensureEngine() {
    const dom = ensureDom();
    if (!dom || typeof BABYLON === "undefined") return null;
    if (state.engine) return state.engine;
    const engine = new BABYLON.Engine(dom.canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.08, 0.14, 1);
    const camera = new BABYLON.ArcRotateCamera("creator-camera", Math.PI / 1.6, 1.2, 6, new BABYLON.Vector3(0, 1.35, 0), scene);
    camera.attachControl(dom.canvas, true);
    camera.useNaturalPinchZoom = true;
    camera.lowerRadiusLimit = 2.2;
    camera.upperRadiusLimit = 8;
    camera.lowerBetaLimit = 0.2;
    camera.upperBetaLimit = Math.PI / 1.45;
    camera.panningAxis = new BABYLON.Vector3(1, 1, 0);
    camera.panningSensibility = 1200;
    camera.wheelPrecision = 50;
    camera.inputs.attached.pointers.buttons = [0, 1, 2];
    camera.target = new BABYLON.Vector3(0, 1.35, 0);
    state.camera = camera;
    state.scene = scene;
    state.engine = engine;

    const hemi = new BABYLON.HemisphericLight("creator-hemi", new BABYLON.Vector3(0.2, 1, -0.4), scene);
    hemi.intensity = 0.9;
    const dir = new BABYLON.DirectionalLight("creator-dir", new BABYLON.Vector3(-0.4, -1, 0.3), scene);
    dir.position = new BABYLON.Vector3(2.5, 5, -3.5);
    dir.intensity = 0.8;

    const ground = BABYLON.MeshBuilder.CreateGround("creator-ground", { width: 18, height: 18 }, scene);
    ground.position.y = CREATOR_GROUND_Y;
    ground.isPickable = false;
    const groundMat = new BABYLON.StandardMaterial("creator-ground-mat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.05, 0.09, 0.18);
    groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMat;

    if (!state.resizeHandler) {
      state.resizeHandler = () => {
        try { state.engine?.resize(); } catch (err) {}
      };
      window.addEventListener("resize", state.resizeHandler);
    }
    if (!state.resizeObserver && typeof ResizeObserver !== "undefined") {
      state.resizeObserver = new ResizeObserver(() => {
        try { state.engine?.resize(); } catch (err) {}
      });
      state.resizeObserver.observe(dom.canvas);
    }

    return engine;
  }

  function ensurePreview(selection) {
    if (!state.scene || !state.specMaps) return null;
    const rig = getRigSpec();
    const signature = computeRigGroundSignature(rig);
    if (state.preview && state.rigSignature && state.rigSignature !== signature) {
      try { state.preview.dispose?.(); } catch (err) {}
      state.preview = null;
      state.rigSignature = null;
    }
    if (!state.preview) {
      state.preview = createPreviewRig(state.scene, rig, state.specMaps, state.baseSelection, selection || state.baseSelection);
      state.rigSignature = signature;
      let snapshot = null;
      const hx = window.HXH;
      if (hx && typeof hx.getFlowState === "function") {
        try { snapshot = hx.getFlowState(); } catch (err) {}
      }
      if (!snapshot && state.stanceKey != null) {
        snapshot = { presetKey: state.stanceKey };
      }
      handleFlowSnapshot(snapshot, { force: true });
    } else if (!state.rigSignature) {
      state.rigSignature = signature;
    }
    return state.preview;
  }

  function regroundPreview() {
    const preview = state.preview;
    if (!preview || typeof preview.recomputeGrounding !== "function") return;
    try { preview.recomputeGrounding(); } catch (err) {}
  }

  function handleFlowSnapshot(snapshot, { force = false } = {}) {
    let key = state.stanceKey;
    if (typeof snapshot === "string") {
      key = snapshot;
    } else if (snapshot && typeof snapshot === "object") {
      if (typeof snapshot.presetKey === "string") {
        key = snapshot.presetKey;
      } else if (snapshot.presetKey === null) {
        key = null;
      }
    }
    if (!force && key === state.stanceKey) return;
    state.stanceKey = key;
    regroundPreview();
  }

  function startRenderLoop() {
    if (!state.engine || !state.scene || state.running) return;
    state.renderFn = () => {
      try { state.scene.render(); } catch (err) {}
    };
    state.engine.runRenderLoop(state.renderFn);
    state.running = true;
  }

  function stopRenderLoop() {
    if (!state.engine || !state.running) return;
    try { state.engine.stopRenderLoop(state.renderFn); } catch (err) { state.engine.stopRenderLoop(); }
    state.running = false;
  }

  function applySelectionToPreview(selection) {
    const preview = ensurePreview(selection);
    if (!preview) return;
    try { preview.cosmetics.applyAll(selection); } catch (err) {}
  }

  function refreshFromGame({ fallback = null } = {}) {
    ensureConfig();
    if (!state.specMaps) return;
    const base = state.baseSelection || buildDefaultSelection(state.specMaps);
    let source = null;
    const hx = window.HXH;
    if (hx?.getCosmeticSelection) {
      try { source = hx.getCosmeticSelection(); } catch (err) {}
    }
    if (!source) {
      source = mergeSelection(state.selection || base, fallback || null);
    } else if (fallback) {
      source = mergeSelection(source, fallback);
    }
    const normalized = normalizeSelection(source, base, state.specMaps);
    state.selection = normalized;
    updateSelectors(normalized);
    applySelectionToPreview(normalized);
  }

  function open() {
    ensureDom();
    ensureConfig();
    ensureEngine();
    ensurePreview(state.selection || state.baseSelection);
    const hx = window.HXH;
    let stanceSnapshot = null;
    if (hx && typeof hx.getFlowState === "function") {
      try { stanceSnapshot = hx.getFlowState(); } catch (err) {}
    }
    if (!stanceSnapshot && state.stanceKey != null) {
      stanceSnapshot = { presetKey: state.stanceKey };
    }
    handleFlowSnapshot(stanceSnapshot, { force: true });
    refreshFromGame();
    startRenderLoop();
    try { state.engine?.resize(); } catch (err) {}
    const ready = window.HXH?.rigReady;
    if (ready?.then) {
      ready.then(() => {
        refreshFromGame();
      }).catch(() => {});
    }
  }

  function close() {
    stopRenderLoop();
  }

  function refresh() {
    refreshFromGame();
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureDom();
  });

  window.CharacterCreator = {
    open,
    close,
    refresh,
    handleFlowSnapshot
  };
})();
