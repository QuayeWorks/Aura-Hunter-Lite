(function(){
  const globalObj = typeof window !== "undefined" ? window : globalThis;
  const existing = typeof globalObj.NenAdvanced === "object" && globalObj.NenAdvanced ? globalObj.NenAdvanced : {};

  const advState = {
    currentState: null,
    gyoActive: false,
    overlay: null,
    inIndicator: null,
    unsubscribeAura: null,
    trackedProjectiles: null,
    originalProjectilePush: null,
    concealedRecords: new Set(),
    enemyHighlights: new Map(),
    styleReady: false,
    lastFrameTs: null,
    inStatus: {
      prepared: false,
      pending: false,
      upkeep: false,
      accum: 0,
      pendingKind: null,
      pendingWindow: 0,
      notified: false,
    }
  };

  const IN_UPFRONT_COST = 8;
  const IN_UPKEEP_PER_SEC = 1;
  const VOLLEY_WINDOW = 0.16;

  const getHXH = () => (typeof globalObj.HXH === "object" ? globalObj.HXH : null);
  const getHUD = () => (typeof globalObj.HUD === "object" ? globalObj.HUD : null);

  function createColor(hex, fallback = [1, 1, 1]) {
    const BABYLON = globalObj.BABYLON;
    if (BABYLON?.Color3?.FromHexString && hex) {
      return BABYLON.Color3.FromHexString(hex);
    }
    const [r, g, b] = fallback;
    return {
      r,
      g,
      b,
      clone() {
        return createColor(null, [this.r, this.g, this.b]);
      },
      copyFrom(src) {
        if (!src) return;
        if (typeof src.r === "number") this.r = src.r;
        if (typeof src.g === "number") this.g = src.g;
        if (typeof src.b === "number") this.b = src.b;
      }
    };
  }

  const COLORS = {
    vignette: {
      start: "rgba(255,255,255,0.08)",
      middle: "rgba(12,24,40,0.25)",
      end: "rgba(3,7,16,0.92)"
    },
    weakIdle: createColor("#ffdb6e", [1.0, 0.86, 0.42]),
    weakVulnerable: createColor("#ff6b6b", [1.0, 0.42, 0.42]),
    weakGlow: createColor("#5cc9ff", [0.36, 0.78, 1.0]),
    weakGlowVulnerable: createColor("#ffb347", [1.0, 0.7, 0.34]),
    concealOutline: createColor("#7fd2ff", [0.5, 0.82, 1.0]),
    concealGlow: createColor("#9fe1ff", [0.62, 0.88, 1.0])
  };

  function hudMessage(text) {
    if (!text) return;
    const HUD = getHUD();
    if (HUD?.message) {
      HUD.message(text);
    } else {
      console.log("[HXH]", text);
    }
  }

  function ensureStyles() {
    if (advState.styleReady) return;
    const css = `
      #hud .nen-gyo-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(circle at center, ${COLORS.vignette.start} 0%, ${COLORS.vignette.middle} 55%, ${COLORS.vignette.end} 92%);
        mix-blend-mode: multiply;
        opacity: 0;
        transition: opacity 180ms ease-out;
        z-index: 2;
      }
      #hud .nen-gyo-overlay.active { opacity: 1; }
      #hud .nen-in-indicator {
        position: absolute;
        bottom: 4.2rem;
        right: 1rem;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #a4ddff;
        background: rgba(10, 24, 40, 0.72);
        border: 1px solid rgba(82, 160, 220, 0.72);
        border-radius: 11px;
        padding: 0.28rem 0.7rem;
        pointer-events: none;
        opacity: 0;
        transition: opacity 160ms ease-out;
      }
      #hud .nen-in-indicator.active { opacity: 1; }
    `;
    const HUD = getHUD();
    if (HUD?.injectStyles) {
      HUD.injectStyles("nen-advanced-style", css);
    } else {
      const style = document.createElement("style");
      style.id = "nen-advanced-style";
      style.textContent = css;
      document.head.appendChild(style);
    }
    advState.styleReady = true;
  }

  function ensureOverlay() {
    if (advState.overlay && document.body.contains(advState.overlay)) return advState.overlay;
    ensureStyles();
    const HUD = getHUD();
    const layer = HUD?.ensureLayer?.("nen-gyo-overlay", "nen-gyo-overlay") || document.getElementById("nen-gyo-overlay");
    if (layer) {
      layer.style.pointerEvents = "none";
      advState.overlay = layer;
    }
    return advState.overlay;
  }

  function ensureInIndicator() {
    if (advState.inIndicator && document.body.contains(advState.inIndicator)) return advState.inIndicator;
    ensureStyles();
    const HUD = getHUD();
    const indicator = HUD?.ensureLayer?.("nen-in-indicator", "nen-in-indicator") || document.getElementById("nen-in-indicator");
    if (indicator) {
      indicator.style.pointerEvents = "none";
      if (!indicator.textContent) indicator.textContent = "In Ready";
      advState.inIndicator = indicator;
    }
    return advState.inIndicator;
  }

  function setOverlayActive(active) {
    const overlay = ensureOverlay();
    if (!overlay) return;
    overlay.classList.toggle("active", !!active);
  }

  function setIndicatorActive(active, text) {
    const indicator = ensureInIndicator();
    if (!indicator) return;
    if (text) indicator.textContent = text;
    indicator.classList.toggle("active", !!active);
  }

  function markAuraFlag(flag, value) {
    const state = advState.currentState;
    if (!state || !state.aura) return;
    if (value) {
      state.aura[flag] = value;
    } else {
      delete state.aura[flag];
    }
    getHXH()?.updateAuraHud?.();
  }

  function resetInStatus() {
    const s = advState.inStatus;
    s.prepared = false;
    s.pending = false;
    s.upkeep = false;
    s.accum = 0;
    s.pendingKind = null;
    s.pendingWindow = 0;
    s.notified = false;
    setIndicatorActive(false);
    markAuraFlag("inPrepared", false);
    markAuraFlag("inUpkeep", false);
  }

  function cancelIn(reason, opts = {}) {
    if (!advState.inStatus.prepared && !advState.inStatus.pending && !advState.inStatus.upkeep) return false;
    resetInStatus();
    if (reason && !opts.silent) hudMessage(reason);
    return true;
  }

  function toggleIn(forceOff = false) {
    const state = advState.currentState;
    if (!state || !state.nen) return false;
    if (forceOff) return cancelIn("In focus relaxed.");
    if (advState.inStatus.prepared) {
      return cancelIn("In focus relaxed.");
    }
    if (state.aura?.zetsu) {
      hudMessage("Cannot hide aura while in Zetsu.");
      return false;
    }
    if (state.nen.cur < IN_UPFRONT_COST) {
      hudMessage("Nen too low to shape In.");
      return false;
    }
    state.nen.cur = Math.max(0, state.nen.cur - IN_UPFRONT_COST);
    getHXH()?.updateNenHud?.();
    advState.inStatus.prepared = true;
    advState.inStatus.pending = true;
    advState.inStatus.upkeep = true;
    advState.inStatus.accum = 0;
    advState.inStatus.pendingKind = null;
    advState.inStatus.pendingWindow = 0;
    advState.inStatus.notified = false;
    setIndicatorActive(true, "In Ready");
    markAuraFlag("inPrepared", true);
    markAuraFlag("inUpkeep", true);
    hudMessage("In focus prepared — next conjuration concealed.");
    return true;
  }

  function handleKoStrike() {
    if (!advState.inStatus.prepared) return;
    cancelIn("Ko focus disrupts In concealment.");
  }

  function drainIn(dt) {
    if (!advState.inStatus.upkeep || !advState.currentState) return;
    const state = advState.currentState;
    if (state.aura?.zetsu) {
      cancelIn("Zetsu disperses your In focus.");
      return;
    }
    advState.inStatus.accum += dt;
    if (advState.inStatus.accum < 1) return;
    const ticks = Math.floor(advState.inStatus.accum);
    advState.inStatus.accum -= ticks;
    const cost = IN_UPKEEP_PER_SEC * ticks;
    const nen = state.nen;
    if (!nen || nen.cur < cost) {
      cancelIn("Nen exhausted — In dissipates.");
      return;
    }
    nen.cur = Math.max(0, nen.cur - cost);
    getHXH()?.updateNenHud?.();
  }

  function ensureHighlightEntry(enemy) {
    if (!enemy || !enemy.root) return null;
    let entry = advState.enemyHighlights.get(enemy);
    if (entry) return entry;
    const mesh = enemy.parts?.head || enemy.root;
    if (!mesh) return null;
    entry = {
      enemy,
      mesh,
      originalOutline: mesh.renderOutline || false,
      originalOutlineWidth: typeof mesh.outlineWidth === "number" ? mesh.outlineWidth : 0,
      originalOutlineColor: mesh.outlineColor?.clone ? mesh.outlineColor.clone() : null,
      originalEmissive: mesh.material?.emissiveColor?.clone ? mesh.material.emissiveColor.clone() : null,
      active: false,
      disposeObserver: null
    };
    if (mesh.onDisposeObservable?.add) {
      entry.disposeObserver = mesh.onDisposeObservable.add(() => {
        advState.enemyHighlights.delete(enemy);
      });
    }
    advState.enemyHighlights.set(enemy, entry);
    return entry;
  }

  function resetEnemyHighlight(entry) {
    if (!entry || !entry.mesh) return;
    const mesh = entry.mesh;
    if (mesh.isDisposed?.()) return;
    mesh.renderOutline = entry.originalOutline;
    mesh.outlineWidth = entry.originalOutlineWidth;
    if (entry.originalOutlineColor) {
      if (!mesh.outlineColor) {
        mesh.outlineColor = entry.originalOutlineColor.clone ? entry.originalOutlineColor.clone() : entry.originalOutlineColor;
      } else if (mesh.outlineColor.copyFrom) {
        mesh.outlineColor.copyFrom(entry.originalOutlineColor);
      }
    }
    if (entry.originalEmissive && mesh.material?.emissiveColor?.copyFrom) {
      mesh.material.emissiveColor.copyFrom(entry.originalEmissive);
    }
    entry.active = false;
  }

  function applyEnemyHighlight(entry, enemy, now) {
    if (!entry || !entry.mesh) return;
    const mesh = entry.mesh;
    if (mesh.isDisposed?.()) return;
    const vulnerable = (enemy.koVulnerabilityT ?? 0) > 0;
    const pulse = 0.55 + 0.45 * Math.sin((now || performance.now()) * 0.005);
    const outlineWidth = vulnerable ? 0.065 + 0.02 * pulse : 0.04 + 0.01 * pulse;
    mesh.renderOutline = true;
    mesh.outlineWidth = outlineWidth;
    const outlineColor = vulnerable ? COLORS.weakVulnerable : COLORS.weakIdle;
    if (outlineColor) {
      if (!mesh.outlineColor) {
        mesh.outlineColor = outlineColor.clone ? outlineColor.clone() : outlineColor;
      } else if (mesh.outlineColor.copyFrom) {
        mesh.outlineColor.copyFrom(outlineColor);
      }
    }
    const glowColor = vulnerable ? COLORS.weakGlowVulnerable : COLORS.weakGlow;
    if (glowColor && mesh.material?.emissiveColor?.copyFrom) {
      mesh.material.emissiveColor.copyFrom(glowColor);
    }
    entry.active = true;
  }

  function updateEnemyHighlights(now) {
    const H = getHXH();
    const enemies = Array.isArray(H?.enemies) ? H.enemies : [];
    const seen = new Set();
    enemies.forEach(enemy => {
      if (!enemy || !enemy.root || enemy.root.isDisposed?.() || !enemy.alive) {
        return;
      }
      seen.add(enemy);
      const entry = ensureHighlightEntry(enemy);
      if (!entry) return;
      if (advState.gyoActive) {
        applyEnemyHighlight(entry, enemy, now);
      } else if (entry.active) {
        resetEnemyHighlight(entry);
      }
    });
    for (const [enemy, entry] of advState.enemyHighlights.entries()) {
      if (!seen.has(enemy) || !advState.gyoActive) {
        resetEnemyHighlight(entry);
        if (!seen.has(enemy)) {
          advState.enemyHighlights.delete(enemy);
        }
      }
    }
  }

  function updateConcealedRecord(record) {
    const mesh = record?.mesh;
    if (!mesh || mesh.isDisposed?.()) return false;
    const show = advState.gyoActive;
    if (show) {
      mesh.isVisible = true;
      if (typeof record.meta.originalVisibility === "number") {
        mesh.visibility = record.meta.originalVisibility;
      } else {
        mesh.visibility = 1;
      }
      if (mesh.material) {
        if (typeof record.meta.originalAlpha === "number") {
          mesh.material.alpha = record.meta.originalAlpha;
        }
        if (mesh.material.emissiveColor?.copyFrom) {
          const color = record.visibleEmissive || (record.visibleEmissive = COLORS.concealGlow.clone ? COLORS.concealGlow.clone() : COLORS.concealGlow);
          mesh.material.emissiveColor.copyFrom(color);
        }
      }
      if (COLORS.concealOutline) {
        if (!mesh.outlineColor) {
          mesh.outlineColor = COLORS.concealOutline.clone ? COLORS.concealOutline.clone() : COLORS.concealOutline;
        } else if (mesh.outlineColor.copyFrom) {
          mesh.outlineColor.copyFrom(COLORS.concealOutline);
        }
      }
      mesh.renderOutline = true;
      mesh.outlineWidth = 0.038;
    } else {
      mesh.renderOutline = false;
      mesh.visibility = 0;
      mesh.isVisible = false;
      if (mesh.material && typeof mesh.material.alpha === "number") {
        if (record.meta.originalAlpha === undefined) record.meta.originalAlpha = mesh.material.alpha;
        mesh.material.alpha = 0;
      }
    }
    return true;
  }

  function pruneConcealed() {
    for (const record of Array.from(advState.concealedRecords)) {
      const mesh = record.mesh;
      if (!mesh || mesh.isDisposed?.()) {
        if (mesh?.onDisposeObservable?.remove && record.disposeObserver) {
          mesh.onDisposeObservable.remove(record.disposeObserver);
        }
        advState.concealedRecords.delete(record);
      }
    }
  }

  function updateConcealed() {
    for (const record of advState.concealedRecords) {
      updateConcealedRecord(record);
    }
    pruneConcealed();
  }

  function registerConcealed(item) {
    if (!item || typeof item !== "object" || !item.mesh) return;
    const mesh = item.mesh;
    if (mesh.isDisposed?.()) return;
    const record = {
      item,
      mesh,
      meta: {
        originalVisibility: typeof mesh.visibility === "number" ? mesh.visibility : 1,
        originalAlpha: mesh.material && typeof mesh.material.alpha === "number" ? mesh.material.alpha : undefined
      },
      disposeObserver: null,
      visibleEmissive: null
    };
    if (mesh.onDisposeObservable?.add) {
      record.disposeObserver = mesh.onDisposeObservable.add(() => {
        advState.concealedRecords.delete(record);
      });
    }
    if (!mesh.metadata) mesh.metadata = {};
    mesh.metadata.concealed = true;
    advState.concealedRecords.add(record);
    item.concealed = true;
    updateConcealedRecord(record);
  }

  function handleConjured(item) {
    if (!advState.currentState || item?.source !== advState.currentState) return;
    if (!advState.inStatus.pending) return;
    const limb = typeof item?.limb === "string" ? item.limb : "";
    const qualifies = limb === "nenBlast" || limb === "nenVolley" || item?.conjured === true || item?.trap === true;
    if (!qualifies) return;
    registerConcealed(item);
    if (!advState.inStatus.notified) {
      hudMessage("In veil hides the conjuration.");
      advState.inStatus.notified = true;
    }
    if (limb === "nenVolley") {
      if (!advState.inStatus.pendingKind) {
        advState.inStatus.pendingKind = limb;
        advState.inStatus.pendingWindow = VOLLEY_WINDOW;
      }
      return;
    }
    resetInStatus();
  }

  function attachProjectiles(projectiles) {
    if (!Array.isArray(projectiles)) return;
    if (advState.trackedProjectiles === projectiles) return;
    detachProjectiles();
    advState.trackedProjectiles = projectiles;
    const original = projectiles.push;
    advState.originalProjectilePush = original;
    projectiles.push = function(...items) {
      const result = original.apply(this, items);
      items.forEach(item => handleConjured(item));
      return result;
    };
  }

  function detachProjectiles() {
    if (advState.trackedProjectiles && advState.originalProjectilePush) {
      try {
        advState.trackedProjectiles.push = advState.originalProjectilePush;
      } catch (err) {
        console.warn("[HXH] Failed to restore projectile push", err);
      }
    }
    advState.trackedProjectiles = null;
    advState.originalProjectilePush = null;
  }

  function handleAuraChange(aura) {
    const active = !!aura?.gyo;
    if (advState.gyoActive === active) return;
    advState.gyoActive = active;
    setOverlayActive(active);
    updateConcealed();
  }

  function attachState(state) {
    advState.currentState = state;
    ensureOverlay();
    ensureInIndicator();
    advState.gyoActive = !!state?.aura?.gyo;
    setOverlayActive(advState.gyoActive);
    const H = getHXH();
    if (H?.subscribeAura) {
      advState.unsubscribeAura = H.subscribeAura(handleAuraChange);
    }
    attachProjectiles(H?.projectiles);
  }

  function detachState() {
    if (advState.unsubscribeAura) {
      try { advState.unsubscribeAura(); } catch (err) { console.warn("[HXH] Aura unsubscribe failed", err); }
      advState.unsubscribeAura = null;
    }
    detachProjectiles();
    advState.currentState = null;
    advState.gyoActive = false;
    setOverlayActive(false);
    resetInStatus();
    for (const record of advState.concealedRecords) {
      const mesh = record.mesh;
      if (mesh?.onDisposeObservable?.remove && record.disposeObserver) {
        mesh.onDisposeObservable.remove(record.disposeObserver);
      }
    }
    advState.concealedRecords.clear();
    for (const [, entry] of advState.enemyHighlights.entries()) {
      resetEnemyHighlight(entry);
    }
    advState.enemyHighlights.clear();
  }

  function isGameScreenVisible() {
    const screen = document.getElementById("screen--game");
    return !!(screen && screen.classList.contains("visible"));
  }

  function handleKeydown(e) {
    if (e.repeat) return;
    if (e.code === "KeyI" && isGameScreenVisible()) {
      toggleIn();
    }
  }

  function frame(ts) {
    const H = getHXH();
    const state = H?.state || null;
    if (state !== advState.currentState) {
      if (advState.currentState) detachState();
      if (state) attachState(state);
    }
    if (!advState.lastFrameTs) advState.lastFrameTs = ts;
    const dt = Math.max(0, (ts - advState.lastFrameTs) / 1000);
    advState.lastFrameTs = ts;

    if (advState.currentState) {
      if (H?.projectiles && H.projectiles !== advState.trackedProjectiles) {
        attachProjectiles(H.projectiles);
      }
      drainIn(dt);
      if (advState.inStatus.pendingKind) {
        advState.inStatus.pendingWindow = Math.max(0, advState.inStatus.pendingWindow - dt);
        if (advState.inStatus.pendingWindow <= 0) {
          resetInStatus();
        }
      }
      updateConcealed();
      updateEnemyHighlights(ts);
    }

    globalObj.requestAnimationFrame(frame);
  }

  if (!existing.applyVow) existing.applyVow = function(){};
  if (!existing.currentSpec) existing.currentSpec = function(){ return null; };

  const api = Object.assign({}, existing, {
    applyVow: existing.applyVow,
    currentSpec: existing.currentSpec,
    toggleIn,
    activateIn: toggleIn,
    cancelIn,
    onKoStrike: handleKoStrike,
    isGyoActive: () => advState.gyoActive,
    getAdvancedState: () => ({
      gyoActive: advState.gyoActive,
      inPrepared: advState.inStatus.prepared,
      inUpkeep: advState.inStatus.upkeep,
      concealedCount: advState.concealedRecords.size
    })
  });

  api.__state = advState;
  api.__initialized = true;
  globalObj.NenAdvanced = api;

  try {
    globalObj.addEventListener("keydown", handleKeydown, { passive: true });
  } catch (err) {
    console.warn("[HXH] NenAdvanced key handler failed", err);
  }

  globalObj.requestAnimationFrame(frame);
})();
