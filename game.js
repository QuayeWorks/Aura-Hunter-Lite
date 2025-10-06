// game.js — Consolidated stats (Power / Agility / Focus) + migration, facing, charged jump, time-stop drain, animations
(function () {
   const $ = (q) => document.querySelector(q);
   const hud = {
      name: $("#hud-name"),
      nen: $("#hud-nen"),
      level: $("#hud-level"),
      xpbar: $("#hud-xpbar span"),
      health: $("#hud-health span"),
      nenbar: $("#hud-nenbar span"),
      nenbarWrap: $("#hud-nenbar"),
      msg: $("#hud-message"),
      cdQ: $("#cd-q"),
      cdE: $("#cd-e"),
      cdDash: $("#cd-shift"),
      pauseOverlay: $("#pause-overlay"),
      btnResume: $("#pause-overlay #btn-resume-pause"),
      btnExit: document.querySelector("#pause-overlay #btn-exit"),
      lvOverlay: $("#level-overlay"),
      lvCur: $("#lv-cur"),
      lvUnspent: $("#lv-unspent"),
      lvClose: $("#lv-close"),
      plusBtns: () => Array.from(document.querySelectorAll('#level-overlay .plus')),
      // NEW: only these three spans
      statSpans: {
         power: $("#s-power"),
         agility: $("#s-agility"),
         focus: $("#s-focus")
      }
   };

   const DEV_BUILD = (() => {
      if (typeof window === "undefined") return false;
      if (typeof window.__HXH_DEV__ === "boolean") return window.__HXH_DEV__;
      if (typeof window.DEV_MODE === "boolean") return window.DEV_MODE;

      const autoDisable = window.__HXH_DEV_DISABLE_AUTO === true;
      const allowList = Array.isArray(window.__HXH_DEV_HOSTS) ? window.__HXH_DEV_HOSTS : null;
      const host = window.location?.hostname || "";

      const matchesAllowList = (hostname) => {
         if (!allowList || !hostname) return false;
         return allowList.some((entry) => {
            if (typeof entry === "string") return entry.toLowerCase() === hostname.toLowerCase();
            if (entry instanceof RegExp) {
               try {
                  return entry.test(hostname);
               } catch (err) {
                  return false;
               }
            }
            return false;
         });
      };

      if (!host) return !autoDisable;

      if (matchesAllowList(host)) return true;

      const normalizedHost = host.toLowerCase();
      if (normalizedHost === "localhost" || normalizedHost === "127.0.0.1" || normalizedHost === "0.0.0.0") return true;
      if (normalizedHost.endsWith(".local")) return true;
      if (/^(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1]))\./.test(normalizedHost)) return true;

      return false;
   })();

   const AURA_STATUS_KEYS = [
      { key: "ten", label: "Ten" },
      { key: "zetsu", label: "Zetsu" },
      { key: "ren", label: "Ren" },
      { key: "ken", label: "Ken" },
      { key: "gyo", label: "Gyo" },
      { key: "shu", label: "Shu" },
      { key: "en", label: "En", nestedKey: "en" }
   ];

   const FLOW_GROUPS = [
      { key: "head", label: "Head", limbs: ["head"], color: "#6da8ff" },
      { key: "torso", label: "Torso", limbs: ["torso"], color: "#5fd1bb" },
      { key: "arms", label: "Arms", limbs: ["lArm", "rArm"], color: "#f79f5c" },
      { key: "legs", label: "Legs", limbs: ["lLeg", "rLeg"], color: "#c47bff" }
   ];
   const FLOW_LIMB_KEYS = ["head", "torso", "rArm", "lArm", "rLeg", "lLeg"];
   const FLOW_PRESETS = [
      { key: "balanced", label: "Balanced Guard", groups: { head: 0.1, torso: 0.3, arms: 0.3, legs: 0.3 } },
      { key: "arms-heavy", label: "Arms 70/30", groups: { head: 0.08, torso: 0.22, arms: 0.45, legs: 0.25 } },
   { key: "torso-wall", label: "Torso 60/40", groups: { head: 0.06, torso: 0.45, arms: 0.3, legs: 0.19 } },
   { key: "mobile-legs", label: "Leg Drive", groups: { head: 0.07, torso: 0.2, arms: 0.27, legs: 0.46 } }
  ];
  const DEFAULT_FLOW_PRESET_INDEX = 0;

   const HOTBAR_LENGTH = 9;

   const TRAINING_KEYS = ["renHold", "gyoFocus", "ryuDrill", "shuEfficiency"];
   const TRAINING_LIMITS = {
      renHold: 5,
      gyoFocus: 5,
      ryuDrill: 5,
      shuEfficiency: 5
   };
   const TRAINING_LABELS = {
      renHold: "Ren hold meter",
      gyoFocus: "Gyo numbers",
      ryuDrill: "Ryu drill",
      shuEfficiency: "Shu rock test"
   };

   function makeDefaultTrainingProgress() {
      return {
         renHold: 0,
         gyoFocus: 0,
         ryuDrill: 0,
         shuEfficiency: 0
      };
   }

   function makeDefaultTrainingCaps() {
      return {
         renDurationCap: 6,
         renRecoveryRate: 1.5,
         renBonusMul: 0,
         gyoCritCap: 0.12,
         gyoCritScale: 0.012,
         ryuVulnFactor: 1,
         ryuGuardBonus: 0,
         shuDamageMul: 1.3,
         shuDurabilityScalar: 0.65,
         shuPierce: 1
      };
   }

   const parseHotbarKey = (code) => {
      if (typeof code !== "string") return null;
      if (code.startsWith("Digit")) {
         const num = Number.parseInt(code.slice(5), 10);
         if (Number.isInteger(num) && num >= 1 && num <= HOTBAR_LENGTH) return num - 1;
      }
      if (code.startsWith("Numpad")) {
         const num = Number.parseInt(code.slice(6), 10);
         if (Number.isInteger(num) && num >= 1 && num <= HOTBAR_LENGTH) return num - 1;
      }
      return null;
   };

   const getItemsModule = () => (typeof window.Items === "object" && window.Items ? window.Items : null);

   const formatInventoryName = (item) => {
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
   };

   const findHotbarIndexForSlot = (inventory, slotIndex) => {
      if (!inventory || !Array.isArray(inventory.hotbar)) return null;
      for (let i = 0; i < inventory.hotbar.length; i += 1) {
         if (inventory.hotbar[i] === slotIndex) return i;
      }
      return null;
   };
   const KO_AAP = 1.0;
   const KO_COST = 10 + KO_AAP * 0.5;
   const KO_MULTIPLIER = 2.5;
   const KO_VULN_DURATION = 0.8;
   const KO_VULN_MULTIPLIER = 1.5;

   if (hud.nen) {
      hud.nen.textContent = "";
      const nenInfo = document.createElement("div");
      nenInfo.className = "hud-nen-info";
      hud.nen.appendChild(nenInfo);
      hud.nenInfo = nenInfo;

      const strip = document.createElement("div");
      strip.className = "hud-nen-strip";
      strip.style.display = "flex";
      strip.style.gap = "0.4rem";
      strip.style.flexWrap = "wrap";
      strip.style.alignItems = "center";
      hud.nen.appendChild(strip);
      hud.nenStrip = strip;

      const badgeMap = new Map();
      for (const spec of AURA_STATUS_KEYS) {
         const badge = document.createElement("span");
         badge.className = "hud-nen-badge";
         badge.style.padding = "0.1rem 0.35rem";
         badge.style.borderRadius = "4px";
         badge.style.fontSize = "0.75rem";
         badge.style.letterSpacing = "0.04em";
         badge.style.textTransform = "uppercase";
         badge.style.background = "rgba(255,255,255,0.08)";
         badge.style.border = "1px solid rgba(255,255,255,0.18)";
         badge.style.transition = "background-color 0.15s ease";
         strip.appendChild(badge);
         badgeMap.set(spec.key, { badge, spec });
      }
      hud.auraBadges = badgeMap;

      const flowWrap = document.createElement("div");
      flowWrap.className = "hud-flow";
      flowWrap.style.display = "flex";
      flowWrap.style.alignItems = "center";
      flowWrap.style.flexWrap = "wrap";
      flowWrap.style.gap = "0.7rem";
      flowWrap.style.marginTop = "0.5rem";
      hud.nen.appendChild(flowWrap);
      hud.flowWrap = flowWrap;

      const pie = document.createElement("div");
      pie.style.width = "64px";
      pie.style.height = "64px";
      pie.style.borderRadius = "50%";
      pie.style.border = "2px solid rgba(255,255,255,0.16)";
      pie.style.background = "conic-gradient(#243356 0deg 360deg)";
      pie.style.boxShadow = "0 0 0 rgba(0,0,0,0)";
      flowWrap.appendChild(pie);
      hud.flowPie = pie;

      const flowInfo = document.createElement("div");
      flowInfo.style.display = "flex";
      flowInfo.style.flexDirection = "column";
      flowInfo.style.gap = "0.25rem";
      flowInfo.style.minWidth = "150px";
      flowWrap.appendChild(flowInfo);

      const flowLabel = document.createElement("div");
      flowLabel.style.fontSize = "0.82rem";
      flowLabel.style.fontWeight = "600";
      flowLabel.textContent = "Ryu: Balanced";
      flowInfo.appendChild(flowLabel);
      hud.flowLabel = flowLabel;

      const legend = document.createElement("div");
      legend.style.display = "grid";
      legend.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
      legend.style.gap = "0.25rem 0.8rem";
      flowInfo.appendChild(legend);
      hud.flowLegend = legend;

      const legendEntries = new Map();
      for (const group of FLOW_GROUPS) {
         const row = document.createElement("div");
         row.style.display = "flex";
         row.style.alignItems = "center";
         row.style.gap = "0.45rem";
         row.style.fontSize = "0.74rem";

         const swatch = document.createElement("span");
         swatch.style.width = "0.65rem";
         swatch.style.height = "0.65rem";
         swatch.style.borderRadius = "50%";
         swatch.style.display = "inline-block";
         swatch.style.background = group.color;
         row.appendChild(swatch);

         const value = document.createElement("span");
         value.textContent = `${group.label} 0%`;
         row.appendChild(value);

         legend.appendChild(row);
         legendEntries.set(group.key, { row, value, swatch });
      }
      hud.flowLegendEntries = legendEntries;

      const trainingRow = document.createElement("div");
      trainingRow.style.display = "flex";
      trainingRow.style.flexWrap = "wrap";
      trainingRow.style.alignItems = "center";
      trainingRow.style.gap = "0.5rem";
      trainingRow.style.marginTop = "0.55rem";
      flowInfo.appendChild(trainingRow);

      const trainingBtn = document.createElement("button");
      trainingBtn.id = "hud-training-button";
      trainingBtn.type = "button";
      trainingBtn.textContent = "Training Grounds";
      trainingBtn.className = "hud-training-button";
      const baseBg = "rgba(26, 44, 70, 0.85)";
      const baseBorder = "1px solid rgba(120, 190, 255, 0.35)";
      const activeBg = "rgba(80, 190, 255, 0.28)";
      const activeBorder = "1px solid rgba(140, 220, 255, 0.7)";
      trainingBtn.dataset.bgBase = baseBg;
      trainingBtn.dataset.borderBase = baseBorder;
      trainingBtn.dataset.bgActive = activeBg;
      trainingBtn.dataset.borderActive = activeBorder;
      trainingBtn.style.padding = "0.32rem 0.75rem";
      trainingBtn.style.borderRadius = "999px";
      trainingBtn.style.fontSize = "0.72rem";
      trainingBtn.style.fontWeight = "600";
      trainingBtn.style.letterSpacing = "0.04em";
      trainingBtn.style.textTransform = "uppercase";
      trainingBtn.style.background = baseBg;
      trainingBtn.style.border = baseBorder;
      trainingBtn.style.color = "#eff6ff";
      trainingBtn.style.cursor = "pointer";
      trainingBtn.style.transition = "background-color 0.18s ease, border-color 0.18s ease, transform 0.15s ease";
      trainingBtn.setAttribute("aria-haspopup", "dialog");
      trainingBtn.setAttribute("aria-pressed", "false");
      trainingBtn.setAttribute("title", "Open training drills (Y)");
      trainingRow.appendChild(trainingBtn);
      hud.trainingButton = trainingBtn;

      const trainingHint = document.createElement("span");
      trainingHint.className = "hud-training-hint";
      trainingHint.style.fontSize = "0.68rem";
      trainingHint.style.opacity = "0.75";
      trainingHint.style.flex = "1";
      trainingHint.style.minWidth = "12ch";
      trainingHint.textContent = "Ranks: —";
      trainingRow.appendChild(trainingHint);
      hud.trainingHint = trainingHint;
   }

   // Babylon exposes the wrap constant as WRAP_ADDRESSMODE (without the "ING").
   // Some older snippets – including the new ground material introduced in this
   // branch – referenced WRAP_ADDRESSING_MODE instead, leaving the property
   // undefined and breaking texture tiling. Mirror the constant so both names
   // resolve to the same value regardless of which alias downstream code uses.
   if (BABYLON?.Texture) {
      const tex = BABYLON.Texture;
      const wrap = tex.WRAP_ADDRESSMODE ?? tex.WRAP_ADDRESSING_MODE;
      if (wrap !== undefined) {
         if (tex.WRAP_ADDRESSMODE === undefined) tex.WRAP_ADDRESSMODE = wrap;
         if (tex.WRAP_ADDRESSING_MODE === undefined) tex.WRAP_ADDRESSING_MODE = wrap;
      }
   }

   const HUD_BAR_EPS = 0.0025;
   const COOLDOWN_UI_INTERVAL = 1 / 30;
   const hudState = {
      bars: {
         health: -1,
         nen: -1,
         xp: -1
      },
      cooldowns: {
         nenblast: { active: false, pct: -1 },
         special: { active: false, pct: -1 },
         dash: { active: false, pct: -1 }
      },
      flowPresetKey: null,
      flowFocus: null,
      flowVulnerable: false
   };
   const auraListeners = new Set();
   const flowListeners = new Set();
   let cooldownUiAccumulator = COOLDOWN_UI_INTERVAL;

   const isTouchDevice = (() => {
      if (typeof window === "undefined") return false;
      const hasTouch = "ontouchstart" in window || (typeof navigator !== "undefined" && (
         ("maxTouchPoints" in navigator && navigator.maxTouchPoints > 0) ||
         ("msMaxTouchPoints" in navigator && navigator.msMaxTouchPoints > 0)
      ));
      const coarseMatch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      return hasTouch || coarseMatch;
   })();

   const mobileUI = {
      container: $("#mobile-controls"),
      joystick: $("#mobile-joystick"),
      thumb: $("#mobile-joystick-thumb"),
      buttons: {
         attack: $("#mc-attack"),
         jump: $("#mc-jump"),
         dash: $("#mc-dash"),
         blast: $("#mc-blast"),
         special: $("#mc-special"),
         nen: $("#mc-nen")
      }
   };

   function makeFlowFromGroups(groups = {}) {
      const flow = {
         head: 0,
         torso: 0,
         rArm: 0,
         lArm: 0,
         rLeg: 0,
         lLeg: 0
      };
      let total = 0;
      for (const group of FLOW_GROUPS) {
         const value = Number(groups[group.key] ?? 0);
         if (Number.isFinite(value) && value > 0) {
            total += value;
         }
      }
      if (total <= 0) total = 1;
      for (const group of FLOW_GROUPS) {
         const value = Number(groups[group.key] ?? 0);
         if (!Number.isFinite(value) || value <= 0) continue;
         const normalized = value / total;
         const perLimb = normalized / (group.limbs.length || 1);
         for (const limb of group.limbs) {
            flow[limb] = perLimb;
         }
      }
      const sum = FLOW_LIMB_KEYS.reduce((acc, key) => acc + (flow[key] ?? 0), 0);
      if (sum > 0 && Math.abs(sum - 1) > 1e-6) {
         const correction = 1 / sum;
         for (const key of FLOW_LIMB_KEYS) {
            flow[key] = (flow[key] ?? 0) * correction;
         }
      }
      return flow;
   }

   const ensureFiniteDamage = (value, fallback) =>
      Number.isFinite(value) ? value : fallback;

   function runOutgoingDamage(src, limb, baseDamage) {
      const base = ensureFiniteDamage(baseDamage, 0);
      const hook = window.HXH?.applyOutgoingDamage;
      if (typeof hook === "function") {
         try {
            const result = hook(src, limb, base);
            return ensureFiniteDamage(result, base);
         } catch (err) {
            console.warn("[HXH] applyOutgoingDamage failed", err);
         }
      }
      return base;
   }

   function runIncomingDamage(dst, limb, baseDamage) {
      const base = ensureFiniteDamage(baseDamage, 0);
      const hook = window.HXH?.applyIncomingDamage;
      if (typeof hook === "function") {
         try {
            const result = hook(dst, limb, base);
            return ensureFiniteDamage(result, base);
         } catch (err) {
            console.warn("[HXH] applyIncomingDamage failed", err);
         }
      }
      return base;
   }

   const mobileMove = { x: 0, y: 0, active: false };
   let mobileControlsInitialized = false;

   const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
   const rand = (a, b) => a + Math.random() * (b - a);
   const nowMs = () => (typeof performance === "object" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
   const ADAPTIVE_QUALITY_LEVELS = [
      { label: "High" },
      { label: "FX Reduced" },
      { label: "Minimal" }
   ];
   const adaptiveQuality = {
      targetFps: 60,
      degradeDelay: 2.5,
      recoverDelay: 4,
      lowTimer: 0,
      highTimer: 0,
      scene: null,
      engine: null,
      camera: null,
      pipeline: null,
      optimizer: null,
      optimizerRunning: false,
      currentLevel: 0,
      dynamic: {
         enabled: false,
         minScale: 0.7,
         scale: 1,
         cooldown: 0
      }
   };

   const PERF_SETTINGS_KEY = "hxh-perf-settings";
   const defaultPerfSettings = Object.freeze({
      lodEnabled: true,
      greedyMeshing: false,
      workerEnabled: true,
      optimizerLevel: 0,
      qualityLabel: "High",
      chunkRadius: null,
      dynamic: {
         enabled: false,
         minScale: 0.7,
         currentScale: 1
      }
   });

   const qualityLabelForLevel = (level) => {
      const numeric = Number.isFinite(level) ? level : 0;
      const clampedLevel = clamp(Math.round(numeric), 0, ADAPTIVE_QUALITY_LEVELS.length - 1);
      return ADAPTIVE_QUALITY_LEVELS[clampedLevel]?.label || "High";
   };

   function normalizePerfSettings(raw = {}) {
      const source = typeof raw === "object" && raw ? raw : {};
      const optimizerLevel = clamp(
         Math.round(Number.isFinite(source.optimizerLevel) ? source.optimizerLevel : 0),
         0,
         ADAPTIVE_QUALITY_LEVELS.length - 1
      );
      const dynamicSource = source.dynamic && typeof source.dynamic === "object" ? source.dynamic : {};
      const dynamicEnabled = typeof dynamicSource.enabled === "boolean"
         ? dynamicSource.enabled
         : !!source.dynamicEnabled;
      const dynamicMinRaw = Number.isFinite(dynamicSource.minScale)
         ? dynamicSource.minScale
         : Number.isFinite(source.dynamicMinScale)
            ? source.dynamicMinScale
            : defaultPerfSettings.dynamic.minScale;
      const dynamicMin = clamp(dynamicMinRaw, 0.5, 1);
      const dynamicScaleRaw = Number.isFinite(dynamicSource.currentScale)
         ? dynamicSource.currentScale
         : Number.isFinite(source.dynamicScale)
            ? source.dynamicScale
            : defaultPerfSettings.dynamic.currentScale;
      const chunkRadius = Number.isFinite(source.chunkRadius) && source.chunkRadius > 0 ? source.chunkRadius : null;
      const dynamicScale = dynamicEnabled ? clamp(dynamicScaleRaw, dynamicMin, 1) : 1;
      const label = typeof source.qualityLabel === "string" && source.qualityLabel.trim()
         ? source.qualityLabel.trim()
         : qualityLabelForLevel(optimizerLevel);

      return {
         lodEnabled: source.lodEnabled !== false,
         greedyMeshing: !!source.greedyMeshing,
         workerEnabled: source.workerEnabled !== false,
         optimizerLevel,
         qualityLabel: label,
         chunkRadius,
         dynamic: {
            enabled: dynamicEnabled,
            minScale: dynamicMin,
            currentScale: dynamicScale
         }
      };
   }

   function loadPerfSettings() {
      if (typeof localStorage === "undefined") {
         return { ...defaultPerfSettings, dynamic: { ...defaultPerfSettings.dynamic } };
      }
      try {
         const raw = localStorage.getItem(PERF_SETTINGS_KEY);
         if (!raw) return { ...defaultPerfSettings, dynamic: { ...defaultPerfSettings.dynamic } };
         const parsed = JSON.parse(raw);
         return normalizePerfSettings(parsed);
      } catch (err) {
         return { ...defaultPerfSettings, dynamic: { ...defaultPerfSettings.dynamic } };
      }
   }

   let perfSettings = loadPerfSettings();
   let chunkWorkerEnabled = perfSettings.workerEnabled !== false;

   function persistPerfSettings() {
      if (typeof localStorage === "undefined") return;
      try {
         localStorage.setItem(PERF_SETTINGS_KEY, JSON.stringify(perfSettings));
      } catch (err) {}
   }

   function updatePerfSettings(update = {}) {
      if (!update || typeof update !== "object") return perfSettings;
      const next = {
         ...perfSettings,
         dynamic: { ...perfSettings.dynamic }
      };
      let dirty = false;

      if (Object.prototype.hasOwnProperty.call(update, "lodEnabled")) {
         const value = update.lodEnabled !== false;
         if (next.lodEnabled !== value) {
            next.lodEnabled = value;
            dirty = true;
         }
      }

      if (Object.prototype.hasOwnProperty.call(update, "greedyMeshing")) {
         const value = !!update.greedyMeshing;
         if (next.greedyMeshing !== value) {
            next.greedyMeshing = value;
            dirty = true;
         }
      }

      if (Object.prototype.hasOwnProperty.call(update, "workerEnabled")) {
         const value = update.workerEnabled !== false;
         if (next.workerEnabled !== value) {
            next.workerEnabled = value;
            dirty = true;
         }
      }

      if (Object.prototype.hasOwnProperty.call(update, "optimizerLevel")) {
         const numeric = Number(update.optimizerLevel);
         if (Number.isFinite(numeric)) {
            const clampedLevel = clamp(Math.round(numeric), 0, ADAPTIVE_QUALITY_LEVELS.length - 1);
            if (next.optimizerLevel !== clampedLevel) {
               next.optimizerLevel = clampedLevel;
               dirty = true;
            }
            const desiredLabel = typeof update.qualityLabel === "string" && update.qualityLabel.trim()
               ? update.qualityLabel.trim()
               : qualityLabelForLevel(clampedLevel);
            if (next.qualityLabel !== desiredLabel) {
               next.qualityLabel = desiredLabel;
               dirty = true;
            }
         }
      } else if (Object.prototype.hasOwnProperty.call(update, "qualityLabel")) {
         const desiredLabel = typeof update.qualityLabel === "string" && update.qualityLabel.trim()
            ? update.qualityLabel.trim()
            : qualityLabelForLevel(next.optimizerLevel);
         if (next.qualityLabel !== desiredLabel) {
            next.qualityLabel = desiredLabel;
            dirty = true;
         }
      }

      if (Object.prototype.hasOwnProperty.call(update, "chunkRadius")) {
         const raw = Number(update.chunkRadius);
         const value = Number.isFinite(raw) && raw > 0 ? raw : null;
         if ((next.chunkRadius ?? null) !== (value ?? null)) {
            next.chunkRadius = value;
            dirty = true;
         }
      }

      if (update.dynamic && typeof update.dynamic === "object") {
         const dynUpdate = update.dynamic;
         if (Object.prototype.hasOwnProperty.call(dynUpdate, "enabled")) {
            const value = !!dynUpdate.enabled;
            if (next.dynamic.enabled !== value) {
               next.dynamic.enabled = value;
               dirty = true;
            }
         }
         if (Object.prototype.hasOwnProperty.call(dynUpdate, "minScale")) {
            const raw = Number(dynUpdate.minScale);
            if (Number.isFinite(raw)) {
               const value = clamp(raw, 0.5, 1);
               if (next.dynamic.minScale !== value) {
                  next.dynamic.minScale = value;
                  dirty = true;
               }
            }
         }
         if (Object.prototype.hasOwnProperty.call(dynUpdate, "currentScale")) {
            const raw = Number(dynUpdate.currentScale);
            if (Number.isFinite(raw)) {
               const lower = next.dynamic.enabled ? next.dynamic.minScale : 1;
               const value = clamp(raw, lower, 1);
               if (next.dynamic.currentScale !== value) {
                  next.dynamic.currentScale = value;
                  dirty = true;
               }
            }
         }
         if (!next.dynamic.enabled && next.dynamic.currentScale !== 1) {
            next.dynamic.currentScale = 1;
            dirty = true;
         } else if (next.dynamic.enabled && next.dynamic.currentScale < next.dynamic.minScale) {
            next.dynamic.currentScale = next.dynamic.minScale;
            dirty = true;
         }
      } else {
         const dynKeys = ["dynamicEnabled", "dynamicMinScale", "dynamicScale"];
         if (dynKeys.some(key => Object.prototype.hasOwnProperty.call(update, key))) {
            const dynUpdate = {
               enabled: Object.prototype.hasOwnProperty.call(update, "dynamicEnabled") ? update.dynamicEnabled : undefined,
               minScale: update.dynamicMinScale,
               currentScale: update.dynamicScale
            };
            return updatePerfSettings({ dynamic: dynUpdate });
         }
      }

      if (dirty) {
         perfSettings = next;
         persistPerfSettings();
      }
      return perfSettings;
   }

   function syncDynamicPerfSettings() {
      updatePerfSettings({
         dynamic: {
            enabled: adaptiveQuality.dynamic.enabled,
            minScale: adaptiveQuality.dynamic.minScale,
            currentScale: adaptiveQuality.dynamic.scale
         }
      });
   }

   adaptiveQuality.currentLevel = perfSettings.optimizerLevel;
   adaptiveQuality.dynamic.enabled = !!perfSettings.dynamic.enabled;
   adaptiveQuality.dynamic.minScale = perfSettings.dynamic.minScale;
   adaptiveQuality.dynamic.scale = adaptiveQuality.dynamic.enabled
      ? perfSettings.dynamic.currentScale
      : 1;
   adaptiveQuality.dynamic.cooldown = 0;
   syncDynamicPerfSettings();
   updatePerfSettings({
      optimizerLevel: adaptiveQuality.currentLevel,
      qualityLabel: perfSettings.qualityLabel
   });
   const workerMetrics = { pending: 0 };
   let engineInstrumentation = null;
   let sceneInstrumentation = null;
   const profilerState = {
      enabled: DEV_BUILD,
      lastMetricsUpdate: 0
   };
   let profilerHudConfigured = false;
   let profilerHudSyncPending = false;
   let profilerHotkeyHandler = null;
   let hudPerformanceUnsub = null;
   let hudDynamicUnsub = null;
   const COOLDOWNS = {
      meleehit: 0.25,
      nenblast: 2.0,
      special: 10,
      dash: 2.6
   };
   const ANIM_SPEED = 1.5;
   const VOW_STORAGE_KEY = "hxh.vows";

   let enemySeq = 1;
   let vowInitialized = false;
   let vowInitAttempts = 0;

   let engine, scene, camera;
   let rearDebugCamera = null;
   const TMP_DEBUG_POS = new BABYLON.Vector3();
   const TMP_DEBUG_FORWARD = new BABYLON.Vector3();
   const TMP_DEBUG_LEFT = new BABYLON.Vector3();
   const TMP_DEBUG_RIGHT = new BABYLON.Vector3();
   const cullingOverlayState = {
      enabled: false,
      root: null,
      renderCircle: null,
      cullCircle: null,
      observer: null,
      lastMetrics: null,
      lastHudUpdate: 0,
      lastValues: { radius: 0, sleepRadius: 0, renderRadius: 0, cullRadius: 0 }
   };
   const rearProxyState = {
      enabled: false,
      root: null,
      marker: null,
      lineSystem: null,
      linePoints: null,
      observer: null,
      material: null,
      lastHudSync: 0
   };
   const singleCamPerfState = {
      enabled: false,
      observer: null,
      samples: 0,
      sum: 0,
      min: Infinity,
      max: 0,
      lastHudUpdate: 0,
      metrics: null
   };
   let player, playerRoot, input = {},
      inputOnce = {},
      inputUp = {};
   let enemies = [],
      projectiles = [];
   let inventoryUnsub = null,
      hotbarUnsub = null,
      trainingMenuDisposer = null,
      trainingButtonUnsub = null;
   let lastTime = 0,
      paused = false;
   let getRuntimeState = () => null;
   let pendingInventorySnapshot = null;
   let startPos = new BABYLON.Vector3(0, 3, 0);
  const world = {
     size: 100,
     gravityY: -28,
     ground: null,
     platforms: []
  };

   const getTerrainApi = () => window.HXH?.Terrain || window.WorldUtils?.Terrain || null;

   function isUnifiedTerrainEnabled() {
      const flags = window.HXH?.FLAGS || window.WorldUtils?.FLAGS;
      return !(flags && flags.USE_UNIFIED_TERRAIN === false);
   }

   function isUnifiedTerrainActive() {
      if (!isUnifiedTerrainEnabled()) return false;
      const api = getTerrainApi();
      if (!api) return false;
      const mesh = typeof api.getMesh === "function" ? api.getMesh() : null;
      if (!mesh) return false;
      if (typeof mesh.isDisposed === "function" && mesh.isDisposed()) return false;
      return true;
   }

   const physics = {
      bodies: new Set(),
      slowLaneBodies: new Set(),
      sleepingBodies: new Set(),
      toRemove: new Set(),
      accumulator: 0,
      slowLaneAccumulator: 0,
      fixedTimeStep: 1 / 60,
      maxSubSteps: 4,
      budgetMs: 3.0,
      slowLaneBudgetMs: 1.2,
      slowLaneInterval: 1 / 18,
      defaultSleepDelay: 0.45,
      sleepLinearThreshold: 0.12,
      sleepAngularThreshold: 0.18,
      maxVelocity: 80,
      instrumentation: {
         lastStepCount: 0,
         lastSlowCount: 0,
         skippedSteps: 0,
         budgetUsedMs: 0,
         slowBudgetUsedMs: 0,
         activeBodies: 0,
         sleepingBodies: 0
      },
      tmp: {
         delta: new BABYLON.Vector3(),
         before: new BABYLON.Vector3(),
         after: new BABYLON.Vector3(),
         actual: new BABYLON.Vector3(),
         impulse: new BABYLON.Vector3()
      }
   };

   function clamp01Fast(value) {
      return value < 0 ? 0 : value > 1 ? 1 : value;
   }

   function configurePhysics(options = {}) {
      if (!options || typeof options !== "object") {
         return {
            budgetMs: physics.budgetMs,
            slowLaneBudgetMs: physics.slowLaneBudgetMs,
            slowLaneInterval: physics.slowLaneInterval,
            fixedTimeStep: physics.fixedTimeStep,
            maxSubSteps: physics.maxSubSteps,
            sleepLinearThreshold: physics.sleepLinearThreshold,
            sleepAngularThreshold: physics.sleepAngularThreshold
         };
      }
      if (Number.isFinite(options.budgetMs)) {
         physics.budgetMs = clamp(options.budgetMs, 0.5, 12);
      }
      if (Number.isFinite(options.slowLaneBudgetMs)) {
         physics.slowLaneBudgetMs = clamp(options.slowLaneBudgetMs, 0.2, 8);
      }
      if (Number.isFinite(options.slowLaneInterval)) {
         physics.slowLaneInterval = clamp(options.slowLaneInterval, 1 / 60, 1);
      }
      if (Number.isFinite(options.fixedTimeStep) && options.fixedTimeStep > 0) {
         physics.fixedTimeStep = clamp(options.fixedTimeStep, 1 / 240, 1 / 30);
      }
      if (Number.isInteger(options.maxSubSteps) && options.maxSubSteps > 0) {
         physics.maxSubSteps = clamp(options.maxSubSteps, 1, 10);
      }
      if (Number.isFinite(options.sleepLinearThreshold)) {
         physics.sleepLinearThreshold = Math.max(0.0001, Math.abs(options.sleepLinearThreshold));
      }
      if (Number.isFinite(options.sleepAngularThreshold)) {
         physics.sleepAngularThreshold = Math.max(0.0001, Math.abs(options.sleepAngularThreshold));
      }
      return configurePhysics();
   }

   function wakePhysicsBody(body, { hard = false } = {}) {
      if (!body) return false;
      if (!physics.bodies.has(body)) return false;
      body.sleeping = false;
      body.sleepTimer = 0;
      if (hard) {
         body.velocity.set(0, 0, 0);
         if (body.angularVelocity) body.angularVelocity.set(0, 0, 0);
      }
      physics.sleepingBodies.delete(body);
      body.wakeRequested = false;
      return true;
   }

   function unregisterPhysicsBody(body) {
      if (!body) return false;
      if (!physics.bodies.has(body)) return false;
      physics.bodies.delete(body);
      physics.slowLaneBodies.delete(body);
      physics.sleepingBodies.delete(body);
      if (body.mesh && body.mesh.metadata && body.mesh.metadata.physicsBody === body) {
         delete body.mesh.metadata.physicsBody;
      }
      body.mesh = null;
      return true;
   }

   function registerPhysicsBody(mesh, options = {}) {
      if (!mesh) return null;
      if (!mesh.metadata) mesh.metadata = {};
      if (mesh.metadata.physicsBody) {
         unregisterPhysicsBody(mesh.metadata.physicsBody);
      }
      const linearDamping = Number.isFinite(options.linearDamping)
         ? clamp01Fast(options.linearDamping)
         : 0.06;
      const angularDamping = Number.isFinite(options.angularDamping)
         ? clamp01Fast(options.angularDamping)
         : 0.1;
      const mass = Number.isFinite(options.mass) && options.mass > 0 ? options.mass : 1;
      const velocity = options.velocity instanceof BABYLON.Vector3
         ? options.velocity.clone()
         : new BABYLON.Vector3();
      const angularVelocity = options.angularVelocity instanceof BABYLON.Vector3
         ? options.angularVelocity.clone()
         : new BABYLON.Vector3();
      const body = {
         mesh,
         mass,
         invMass: 1 / mass,
         velocity,
         angularVelocity,
         linearDamping,
         angularDamping,
         gravityScale: Number.isFinite(options.gravityScale) ? options.gravityScale : 1,
         dynamic: options.dynamic !== false,
         allowSleep: options.allowSleep !== false,
         sleepLinearThreshold: Number.isFinite(options.sleepLinearThreshold)
            ? Math.max(0.0001, Math.abs(options.sleepLinearThreshold))
            : physics.sleepLinearThreshold,
         sleepAngularThreshold: Number.isFinite(options.sleepAngularThreshold)
            ? Math.max(0.0001, Math.abs(options.sleepAngularThreshold))
            : physics.sleepAngularThreshold,
         sleepDelay: Number.isFinite(options.sleepDelay)
            ? Math.max(0, options.sleepDelay)
            : physics.defaultSleepDelay,
         sleepTimer: 0,
         sleeping: !!options.startSleeping,
         wakeRequested: false,
         maxSpeed: Number.isFinite(options.maxSpeed) && options.maxSpeed > 0 ? options.maxSpeed : physics.maxVelocity,
         useCollisions: options.useCollisions !== false,
         priority: options.priority === "low" ? "low" : "normal",
         onBeforeStep: typeof options.onBeforeStep === "function" ? options.onBeforeStep : null,
         onAfterStep: typeof options.onAfterStep === "function" ? options.onAfterStep : null,
         userData: options.userData || null
      };
      if (body.sleeping) physics.sleepingBodies.add(body);
      physics.bodies.add(body);
      if (body.priority === "low" || options.nonCritical === true) {
         physics.slowLaneBodies.add(body);
      }
      mesh.metadata.physicsBody = body;
      return body;
   }

   function applyPhysicsImpulse(body, impulse) {
      if (!body || !impulse) return false;
      if (!physics.bodies.has(body)) return false;
      wakePhysicsBody(body);
      const vec = impulse instanceof BABYLON.Vector3 ? impulse : null;
      if (!vec) return false;
      physics.tmp.impulse.copyFrom(vec);
      physics.tmp.impulse.scaleInPlace(body.invMass);
      body.velocity.addInPlace(physics.tmp.impulse);
      const speedSq = body.velocity.lengthSquared();
      const maxSpeed = body.maxSpeed || physics.maxVelocity;
      if (speedSq > maxSpeed * maxSpeed) {
         body.velocity.normalize().scaleInPlace(maxSpeed);
      }
      return true;
   }

   function integratePhysicsStep(dt, phase) {
      const gravityY = world.gravityY;
      const tmpDelta = physics.tmp.delta;
      const tmpBefore = physics.tmp.before;
      const tmpAfter = physics.tmp.after;
      const tmpActual = physics.tmp.actual;
      const toRemove = physics.toRemove;
      let processed = 0;
      let sleeping = 0;
      for (const body of physics.bodies) {
         const mesh = body.mesh;
         if (!mesh || (typeof mesh.isDisposed === "function" && mesh.isDisposed())) {
            toRemove.add(body);
            continue;
         }
         const isSlowLane = physics.slowLaneBodies.has(body);
         if (phase === "regular" && isSlowLane) {
            continue;
         }
         if (phase === "slow" && !isSlowLane) {
            continue;
         }
         if (!body.dynamic) {
            continue;
         }
         if (body.sleeping) {
            sleeping += 1;
            continue;
         }
         if (body.onBeforeStep) {
            try {
               if (body.onBeforeStep(body, dt) === false) {
                  continue;
               }
            } catch (err) {
               console.warn("[Physics] onBeforeStep failed", err);
            }
         }
         processed += 1;
         if (body.gravityScale !== 0) {
            body.velocity.y += gravityY * body.gravityScale * dt;
         }
         if (body.linearDamping > 0) {
            const damp = Math.max(0, 1 - body.linearDamping * dt * 60);
            body.velocity.scaleInPlace(damp < 0 ? 0 : damp);
         }
         const maxSpeed = body.maxSpeed || physics.maxVelocity;
         const speedSq = body.velocity.lengthSquared();
         if (speedSq > maxSpeed * maxSpeed) {
            body.velocity.normalize().scaleInPlace(maxSpeed);
         }
         tmpDelta.copyFrom(body.velocity);
         tmpDelta.scaleInPlace(dt);
         tmpBefore.copyFrom(mesh.position);
         if (body.useCollisions && typeof mesh.moveWithCollisions === "function") {
            mesh.moveWithCollisions(tmpDelta);
         } else {
            mesh.position.addInPlace(tmpDelta);
         }
         tmpAfter.copyFrom(mesh.position);
         tmpActual.copyFrom(tmpAfter);
         tmpActual.subtractInPlace(tmpBefore);
         const actualSpeedSq = tmpActual.lengthSquared() / Math.max(dt * dt, 1e-8);
         if (Number.isFinite(actualSpeedSq)) {
            body.velocity.copyFrom(tmpActual);
            body.velocity.scaleInPlace(1 / Math.max(dt, 1e-5));
         }
         if (body.angularVelocity && body.angularVelocity.lengthSquared() > 1e-6) {
            if (!mesh.rotationQuaternion) {
               mesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
            }
            const av = body.angularVelocity;
            const angLen = av.length();
            const angle = angLen * dt;
            if (angle > 1e-5 && angLen > 1e-6) {
               const axis = physics.tmp.impulse;
               axis.copyFrom(av);
               axis.scaleInPlace(1 / angLen);
               const deltaRot = BABYLON.Quaternion.RotationAxis(axis, angle);
               mesh.rotationQuaternion.multiplyInPlace(deltaRot);
               mesh.rotationQuaternion.normalize();
            }
            if (body.angularDamping > 0) {
               const dampAng = Math.max(0, 1 - body.angularDamping * dt * 60);
               av.scaleInPlace(dampAng < 0 ? 0 : dampAng);
            }
         }
         if (body.onAfterStep) {
            try {
               body.onAfterStep(body, dt, tmpActual);
            } catch (err) {
               console.warn("[Physics] onAfterStep failed", err);
            }
         }
         if (body.allowSleep) {
            const linearSleep = body.sleepLinearThreshold * body.sleepLinearThreshold;
            const angularSleep = body.sleepAngularThreshold * body.sleepAngularThreshold;
            const curLinear = body.velocity.lengthSquared();
            const curAngular = body.angularVelocity ? body.angularVelocity.lengthSquared() : 0;
            if (curLinear < linearSleep && curAngular < angularSleep) {
               body.sleepTimer += dt;
               if (body.sleepTimer >= body.sleepDelay) {
                  body.sleeping = true;
                  body.velocity.set(0, 0, 0);
                  if (body.angularVelocity) body.angularVelocity.set(0, 0, 0);
                  physics.sleepingBodies.add(body);
                  sleeping += 1;
               }
            } else {
               body.sleepTimer = 0;
            }
         }
      }
      if (toRemove.size) {
         toRemove.forEach(b => unregisterPhysicsBody(b));
         toRemove.clear();
      }
      return { processed, sleeping };
   }

   function stepPhysics(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      if (physics.bodies.size === 0) {
         physics.accumulator = 0;
         physics.slowLaneAccumulator = 0;
         physics.instrumentation.lastStepCount = 0;
         physics.instrumentation.lastSlowCount = 0;
         physics.instrumentation.activeBodies = 0;
         physics.instrumentation.sleepingBodies = 0;
         physics.instrumentation.budgetUsedMs = 0;
         physics.instrumentation.slowBudgetUsedMs = 0;
         physics.instrumentation.skippedSteps = 0;
         return;
      }
      const step = physics.fixedTimeStep;
      physics.accumulator = Math.min(physics.accumulator + dt, step * physics.maxSubSteps * 4);
      physics.slowLaneAccumulator = Math.min(physics.slowLaneAccumulator + dt, physics.slowLaneInterval * 4);
      let steps = 0;
      let spentMs = 0;
      const startBudget = physics.budgetMs;
      const subStepLimit = physics.maxSubSteps;
      while (physics.accumulator >= step && steps < subStepLimit) {
         const stepStart = nowMs();
         integratePhysicsStep(step, "regular");
         spentMs += nowMs() - stepStart;
         physics.accumulator -= step;
         steps += 1;
         if (spentMs >= startBudget) {
            break;
         }
      }
      const skipped = Math.max(0, Math.floor(physics.accumulator / step));
      physics.instrumentation.lastStepCount = steps;
      physics.instrumentation.budgetUsedMs = spentMs;
      physics.instrumentation.skippedSteps = skipped;
      let slowSpent = 0;
      let slowSteps = 0;
      if (physics.slowLaneBodies.size > 0 && physics.slowLaneAccumulator >= physics.slowLaneInterval) {
         if (spentMs < startBudget + physics.slowLaneBudgetMs * 0.75) {
            const slowDt = Math.min(step, physics.slowLaneAccumulator);
            const slowStart = nowMs();
            const stats = integratePhysicsStep(slowDt, "slow");
            slowSpent = nowMs() - slowStart;
            slowSteps = stats.processed;
            physics.slowLaneAccumulator = Math.max(0, physics.slowLaneAccumulator - physics.slowLaneInterval);
         }
      }
      physics.instrumentation.lastSlowCount = slowSteps;
      physics.instrumentation.slowBudgetUsedMs = slowSpent;
      physics.instrumentation.activeBodies = physics.bodies.size - physics.sleepingBodies.size;
      physics.instrumentation.sleepingBodies = physics.sleepingBodies.size;
   }

   const TERRAIN_LAYER_DEFS = [
      { key: "bedrock", color: [0.5, 0.5, 0.56], emissive: [0.14, 0.14, 0.16], destructible: false, thickness: 1 },
      { key: "dirt", color: [0.5, 0.34, 0.2], emissive: [0.1, 0.06, 0.03], destructible: true, thickness: 1 },
      { key: "grass", color: [0.32, 0.62, 0.3], emissive: [0.1, 0.22, 0.1], destructible: true, thickness: 0.25 }
   ];

   const TERRAIN_ATLAS_SOURCES = (() => {
      if (typeof window === "undefined") {
         return { compressed: null, tileSize: 256, padding: 4 };
      }
      const atlasConfig = window.HXH_TEXTURES?.terrainAtlas || {};
      const compressed = typeof atlasConfig.compressed === "string" && atlasConfig.compressed.trim()
         ? atlasConfig.compressed.trim()
         : (typeof window.__HXH_TERRAIN_ATLAS_KTX2__ === "string" && window.__HXH_TERRAIN_ATLAS_KTX2__.trim()
            ? window.__HXH_TERRAIN_ATLAS_KTX2__.trim()
            : null);
      const tileSize = Number.isFinite(atlasConfig.tileSize) && atlasConfig.tileSize > 0
         ? Math.max(32, Math.min(1024, Math.round(atlasConfig.tileSize)))
         : 256;
      const padding = Number.isFinite(atlasConfig.padding)
         ? Math.max(0, Math.min(Math.round(atlasConfig.padding), Math.floor(tileSize / 3)))
         : 4;
      return { compressed, tileSize, padding };
   })();

   const terrainTextureState = {
      material: null,
      diffuseTexture: null,
      atlasRects: [],
      compressedUrl: TERRAIN_ATLAS_SOURCES.compressed,
      tileSize: TERRAIN_ATLAS_SOURCES.tileSize,
      padding: TERRAIN_ATLAS_SOURCES.padding,
      compressedLoading: false,
      compressedReady: false
   };

   const terrainKtx2State = {
      promise: null,
      supported: false
   };

   const DEFAULT_CHUNK_SIZE = 16;
   const DEFAULT_STREAM_INTERVAL = 0.05;
   const DEFAULT_STREAM_BUDGET_MS = 3.5;
   const DEFAULT_STREAM_BUDGET_OPS = 96;
   const DEFAULT_STREAM_BATCH = 12;

   const defaultTerrainSettings = {
      length: 32,
      width: 32,
      cubeSize: 1.2,
      activeRadius: 48,
      streamingPadding: 6,
      layers: TERRAIN_LAYER_DEFS.length,
      maxTrees: 18,
      chunkSize: DEFAULT_CHUNK_SIZE,
      depthThresholds: { dirt: 0.45, clay: 1.35, bedrock: 2.8 }
   };

   const TERRAIN_SETTINGS_KEY = "hxh-terrain-settings";

   function clampSetting(value, min, max, fallback) {
      if (!Number.isFinite(value)) return fallback;
      return clamp(value, min, max);
   }

   function normalizeDepthThresholds(next = {}, base = defaultTerrainSettings.depthThresholds) {
      const reference = base && typeof base === "object" ? base : defaultTerrainSettings.depthThresholds;
      const out = {
         dirt: Number.isFinite(reference?.dirt) ? Number(reference.dirt) : defaultTerrainSettings.depthThresholds.dirt,
         clay: Number.isFinite(reference?.clay) ? Number(reference.clay) : defaultTerrainSettings.depthThresholds.clay,
         bedrock: Number.isFinite(reference?.bedrock) ? Number(reference.bedrock) : defaultTerrainSettings.depthThresholds.bedrock
      };
      if (next && typeof next === "object") {
         const dirt = Number(next.dirt ?? next.t1 ?? next.grassToDirt);
         const clay = Number(next.clay ?? next.t2 ?? next.dirtToClay);
         const bedrock = Number(next.bedrock ?? next.t3 ?? next.clayToBedrock);
         if (Number.isFinite(dirt) && dirt >= 0) out.dirt = dirt;
         if (Number.isFinite(clay) && clay >= 0) out.clay = clay;
         if (Number.isFinite(bedrock) && bedrock >= 0) out.bedrock = bedrock;
      }
      if (out.dirt < 0) out.dirt = 0;
      if (out.clay <= out.dirt) out.clay = out.dirt + 0.01;
      if (out.bedrock <= out.clay) out.bedrock = out.clay + 0.01;
      return out;
   }

   function normalizeTerrainSettings(next = {}) {
      const out = { ...defaultTerrainSettings, depthThresholds: { ...defaultTerrainSettings.depthThresholds } };
      if (typeof next.length === "number") out.length = Math.round(clampSetting(next.length, 8, 256, defaultTerrainSettings.length));
      if (typeof next.width === "number") out.width = Math.round(clampSetting(next.width, 8, 256, defaultTerrainSettings.width));
      if (typeof next.cubeSize === "number") out.cubeSize = clampSetting(next.cubeSize, 0.5, 4, defaultTerrainSettings.cubeSize);
      if (typeof next.activeRadius === "number") out.activeRadius = clampSetting(next.activeRadius, 6, 300, defaultTerrainSettings.activeRadius);
      if (typeof next.streamingPadding === "number") out.streamingPadding = clampSetting(next.streamingPadding, 2, 60, defaultTerrainSettings.streamingPadding);
      if (typeof next.maxTrees === "number") out.maxTrees = Math.round(clampSetting(next.maxTrees, 0, 400, defaultTerrainSettings.maxTrees));
      if (typeof next.chunkSize === "number") {
         const clampedChunk = clampSetting(next.chunkSize, 4, 96, defaultTerrainSettings.chunkSize);
         out.chunkSize = Math.round(clampedChunk);
      }
      if (next.depthThresholds) {
         const merged = { ...out.depthThresholds, ...next.depthThresholds };
         out.depthThresholds = normalizeDepthThresholds(merged, out.depthThresholds);
      } else {
         out.depthThresholds = normalizeDepthThresholds(out.depthThresholds, out.depthThresholds);
      }
      out.layers = TERRAIN_LAYER_DEFS.length;
      return out;
   }

   function loadTerrainSettings() {
      if (typeof localStorage === "undefined") return { ...defaultTerrainSettings };
      try {
         const raw = localStorage.getItem(TERRAIN_SETTINGS_KEY);
         if (!raw) return { ...defaultTerrainSettings };
         const parsed = JSON.parse(raw);
         return normalizeTerrainSettings(parsed);
      } catch (err) {
         return { ...defaultTerrainSettings };
      }
   }

   const savedTerrainSettings = normalizeTerrainSettings(loadTerrainSettings());

   const COLOR3_WHITE = BABYLON.Color3.White();
   const COLOR3_BLACK = BABYLON.Color3.Black();

   const clamp01 = (value) => Math.min(1, Math.max(0, value));

   const arrayToColor3 = (arr = []) => {
      if (arr instanceof BABYLON.Color3) return arr.clone();
      const r = clamp01(Number(arr[0]) || 0);
      const g = clamp01(Number(arr[1]) || 0);
      const b = clamp01(Number(arr[2]) || 0);
      return new BABYLON.Color3(r, g, b);
   };

   const tintColor = (color, strength) => {
      if (!(color instanceof BABYLON.Color3)) return tintColor(arrayToColor3(color), strength);
      if (!Number.isFinite(strength) || strength === 0) return color.clone();
      const s = Math.min(1, Math.max(-1, strength));
      if (s > 0) {
         return BABYLON.Color3.Lerp(color, COLOR3_WHITE, s);
      }
      return BABYLON.Color3.Lerp(color, COLOR3_BLACK, Math.abs(s));
   };

   const color3ToCss = (color) => {
      const c = color instanceof BABYLON.Color3 ? color : arrayToColor3(color);
      const r = Math.round(clamp01(c.r) * 255);
      const g = Math.round(clamp01(c.g) * 255);
      const b = Math.round(clamp01(c.b) * 255);
      return `rgb(${r},${g},${b})`;
   };

   const makeSeededRandom = (seed) => {
      let state = seed >>> 0;
      return () => {
         state = (state * 1664525 + 1013904223) >>> 0;
         return state / 0x100000000;
      };
   };

   function createDynamicTerrainAtlas(scene) {
      const tileSize = terrainTextureState.tileSize;
      const padding = terrainTextureState.padding;
      const layers = TERRAIN_LAYER_DEFS.length;
      const width = tileSize * layers;
      const height = tileSize;
      const dynamicTexture = new BABYLON.DynamicTexture("terrainAtlasDynamic", { width, height }, scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
      dynamicTexture.hasAlpha = false;
      dynamicTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      dynamicTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      const ctx = dynamicTexture.getContext();
      ctx.clearRect(0, 0, width, height);
      const rects = new Array(layers);
      for (let i = 0; i < layers; i += 1) {
         const def = TERRAIN_LAYER_DEFS[i] || {};
         const baseColor = arrayToColor3(def.color || [0.5, 0.5, 0.5]);
         const highlight = tintColor(baseColor, 0.22);
         const shadow = tintColor(baseColor, -0.24);
         const x = i * tileSize;
         // Base fill with subtle shadow to reduce seams.
         ctx.fillStyle = color3ToCss(tintColor(baseColor, -0.05));
         ctx.fillRect(x, 0, tileSize, height);
         const grad = ctx.createLinearGradient(x, 0, x, height);
         grad.addColorStop(0, color3ToCss(highlight));
         grad.addColorStop(1, color3ToCss(shadow));
         ctx.fillStyle = grad;
         const innerX = x + padding;
         const innerY = padding;
         const innerWidth = tileSize - padding * 2;
         const innerHeight = height - padding * 2;
         ctx.fillRect(innerX, innerY, innerWidth, innerHeight);

         const noise = makeSeededRandom(0x9e3779b9 ^ (i * 0x45d9f3b));
         const density = Math.max(24, Math.round((innerWidth * innerHeight) / 1800));
         ctx.globalAlpha = 0.28;
         for (let n = 0; n < density; n += 1) {
            const nx = innerX + noise() * innerWidth;
            const ny = innerY + noise() * innerHeight;
            const size = 1 + noise() * 2.8;
            const tint = (noise() - 0.5) * 0.18;
            ctx.fillStyle = color3ToCss(tintColor(baseColor, tint));
            ctx.fillRect(nx, ny, size, size);
         }
         ctx.globalAlpha = 1;

         const u0 = innerX / width;
         const v0 = innerY / height;
         const u1 = (innerX + innerWidth) / width;
         const v1 = (innerY + innerHeight) / height;
         rects[i] = { u0, v0, u1, v1 };
      }
      dynamicTexture.update(false);
      return { texture: dynamicTexture, rects };
   }

   function configureAtlasTexture(texture) {
      if (!texture) return;
      texture.hasAlpha = false;
      texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 1;
   }

   function loadTextureAsync(url, scene, options = {}) {
      return new Promise((resolve, reject) => {
         if (!url) {
            reject(new Error("Texture URL missing"));
            return;
         }
         const noMipmap = !!options.noMipmap;
         const invertY = options.invertY ?? false;
         const sampling = options.samplingMode ?? BABYLON.Texture.NEAREST_SAMPLINGMODE;
         const texture = new BABYLON.Texture(url, scene, noMipmap, invertY, sampling,
            () => resolve(texture),
            (message, exception) => {
               if (texture && !texture.isDisposed()) {
                  try { texture.dispose(); } catch (err) {}
               }
               reject(exception || new Error(message || "Failed to load texture"));
            }
         );
         configureAtlasTexture(texture);
      });
   }

   function ensureKtx2Support(engine) {
      if (!engine) return Promise.resolve(false);
      if (terrainKtx2State.promise) return terrainKtx2State.promise;
      try {
         if (BABYLON?.KTX2DecodeManager?.SetTranscoderPath) {
            BABYLON.KTX2DecodeManager.SetTranscoderPath("https://cdn.babylonjs.com/basis/");
         } else if (BABYLON?.KhronosTextureContainer2) {
            const current = BABYLON.KhronosTextureContainer2.URLConfig || {};
            if (!current.jsDecoderModule) {
               BABYLON.KhronosTextureContainer2.URLConfig = {
                  ...current,
                  jsDecoderModule: "https://cdn.babylonjs.com/babylon.ktx2Decoder.js"
               };
            }
         }
      } catch (err) {
         console.debug("[HXH] Failed to configure KTX2 decoder", err);
      }

      if (typeof BABYLON?.KTX2DecodeManager?.IsTranscoderAvailableAsync === "function") {
         terrainKtx2State.promise = BABYLON.KTX2DecodeManager.IsTranscoderAvailableAsync(engine)
            .then((supported) => {
               terrainKtx2State.supported = !!supported;
               return terrainKtx2State.supported;
            })
            .catch((err) => {
               console.debug("[HXH] KTX2 transcoder unavailable", err);
               return false;
            });
      } else {
         const fallbackSupport = !!BABYLON?.KhronosTextureContainer2;
         terrainKtx2State.promise = Promise.resolve(fallbackSupport);
         terrainKtx2State.supported = fallbackSupport;
      }

      return terrainKtx2State.promise;
   }

   function maybeLoadCompressedTerrainAtlas(scene) {
      if (!terrainTextureState.compressedUrl || terrainTextureState.compressedLoading || terrainTextureState.compressedReady || !terrainTextureState.material) return;
      terrainTextureState.compressedLoading = true;
      ensureKtx2Support(scene.getEngine())
         .then((supported) => {
            if (!supported) return null;
            return loadTextureAsync(terrainTextureState.compressedUrl, scene, { invertY: false })
               .then((texture) => {
                  configureAtlasTexture(texture);
                  const material = terrainTextureState.material;
                  if (material) {
                     material.diffuseTexture = texture;
                     material.ambientTexture = null;
                  }
                  if (terrainTextureState.diffuseTexture && terrainTextureState.diffuseTexture !== texture) {
                     try { terrainTextureState.diffuseTexture.dispose(); } catch (err) {}
                  }
                  terrainTextureState.diffuseTexture = texture;
                  terrainTextureState.compressedReady = true;
               })
               .catch((err) => {
                  console.debug("[HXH] Terrain atlas KTX2 load failed", err);
               });
         })
         .catch((err) => {
            console.debug("[HXH] Terrain atlas compression probe failed", err);
         })
         .finally(() => {
            terrainTextureState.compressedLoading = false;
         });
   }

   const DEFAULT_ENVIRONMENT_LOD_PROFILE = Object.freeze({
      tree: Object.freeze({ mediumDistance: 48, farDistance: 96, cullDistance: 160, billboard: true }),
      rock: Object.freeze({ mediumDistance: 36, farDistance: 78, cullDistance: 148, billboard: false }),
      structure: Object.freeze({ mediumDistance: 60, farDistance: 130, cullDistance: 220, billboard: false })
   });

   const environment = {
      seed: 1,
      time: 0,
      dayLength: 160,
      sky: null,
      skyMaterial: null,
      sun: null,
      moon: null,
      sunMesh: null,
      moonMesh: null,
      hemi: null,
      clouds: [],
      trees: [],
      treeColumns: [],
      terrain: null,
      terrainMaterial: null,
      terrainAtlas: terrainTextureState,
      terrainSettings: { ...savedTerrainSettings, depthThresholds: { ...savedTerrainSettings.depthThresholds } },
      lodProfile: JSON.parse(JSON.stringify(DEFAULT_ENVIRONMENT_LOD_PROFILE)),
      lodEnabled: true,
      updateAccumulator: 0,
      updateInterval: 1 / 24
   };

   environment.lodEnabled = perfSettings.lodEnabled !== false;
   if (environment.terrainSettings) environment.terrainSettings.greedyMeshing = !!perfSettings.greedyMeshing;

   const interiorOcclusion = (() => {
      const groups = new Map();

      const normalizeKey = (key) => {
         if (typeof key === "string") return key.trim();
         if (key && typeof key.key === "string") return key.key.trim();
         if (key != null) return String(key).trim();
         return "";
      };

      const getActiveScene = (explicitScene) => {
         if (explicitScene && typeof explicitScene.isDisposed === "function" && explicitScene.isDisposed()) {
            return null;
         }
         if (explicitScene) return explicitScene;
         if (scene && typeof scene.isDisposed === "function" ? !scene.isDisposed() : !!scene) return scene;
         const rmScene = window.RegionManager?.getScene?.();
         if (rmScene && typeof rmScene.isDisposed === "function" && rmScene.isDisposed()) return null;
         return rmScene || scene || null;
      };

      const wildcardToRegExp = (pattern) => {
         const source = typeof pattern === "string" ? pattern : String(pattern ?? "");
         const specials = /[.*+?^${}()|[\]\\]/;
         let regex = "^";
         let escapeNext = false;

         for (const char of source) {
            if (escapeNext) {
               if (char === "\\") {
                  regex += "\\\\";
               } else {
                  regex += specials.test(char) ? `\\${char}` : char;
               }
               escapeNext = false;
               continue;
            }

            if (char === "\\") {
               escapeNext = true;
               continue;
            }

            if (char === "*") {
               regex += ".*";
               continue;
            }

            if (char === "?") {
               regex += ".";
               continue;
            }

            regex += specials.test(char) ? `\\${char}` : char;
         }

         if (escapeNext) {
            regex += "\\\\";
         }

         regex += "$";
         return new RegExp(regex, "i");
      };

      const applyNodeState = (node, enabled) => {
         if (!node) return;
         if (typeof node.isDisposed === "function" && node.isDisposed()) return;
         try {
            if (typeof node.setEnabled === "function") {
               node.setEnabled(enabled);
            } else {
               if ("isEnabled" in node) node.isEnabled = enabled;
               if ("isVisible" in node) node.isVisible = enabled;
            }
         } catch (err) {
            console.warn("[InteriorOcclusion] node toggle failed", err);
         }
      };

      const applyLightState = (light, enabled) => {
         if (!light) return;
         try {
            if (typeof light.setEnabled === "function") {
               light.setEnabled(enabled);
            } else if ("isEnabled" in light) {
               light.isEnabled = enabled;
            }
         } catch (err) {
            console.warn("[InteriorOcclusion] light toggle failed", err);
         }
      };

      const applyParticleState = (group, system, enabled) => {
         if (!system) return;
         const status = group.particleStatus;
         const previous = status.get(system);
         if (previous === enabled) return;
         status.set(system, enabled);
         try {
            if (enabled) {
               if (typeof system.start === "function") system.start();
               if (system.emitter && typeof system.emitter.setEnabled === "function") system.emitter.setEnabled(true);
            } else {
               if (typeof system.stop === "function") system.stop();
               if (typeof system.reset === "function") system.reset();
               if (system.emitter && typeof system.emitter.setEnabled === "function") system.emitter.setEnabled(false);
            }
         } catch (err) {
            console.warn("[InteriorOcclusion] particle toggle failed", err);
         }
      };

      const applyAnimationState = (group, animation, enabled) => {
         if (!animation) return;
         const status = group.animationStatus;
         const previous = status.get(animation);
         if (previous === enabled) return;
         status.set(animation, enabled);
         try {
            if (enabled) {
               if (typeof animation.play === "function") animation.play(animation.loopAnimation ?? true);
            } else {
               if (typeof animation.pause === "function") animation.pause();
               if (typeof animation.reset === "function") animation.reset();
            }
         } catch (err) {
            console.warn("[InteriorOcclusion] animation toggle failed", err);
         }
      };

      const addNodeAndDescendants = (group, node, includeDescendants = true) => {
         if (!node) return false;
         if (typeof node.isDisposed === "function" && node.isDisposed()) return false;
         let added = false;
         if (!group.nodes.has(node)) {
            group.nodes.add(node);
            applyNodeState(node, group.desiredState);
            added = true;
         }
         if (includeDescendants && typeof node.getDescendants === "function") {
            const descendants = node.getDescendants(true);
            if (Array.isArray(descendants)) {
               for (const child of descendants) {
                  if (!(child instanceof BABYLON.TransformNode) && !(child instanceof BABYLON.AbstractMesh)) continue;
                  if (!group.nodes.has(child)) {
                     group.nodes.add(child);
                     applyNodeState(child, group.desiredState);
                     added = true;
                  }
               }
            }
         }
         return added;
      };

      const ensureGroup = (key) => {
         const id = normalizeKey(key);
         if (!id) return null;
         if (!groups.has(id)) {
            groups.set(id, {
               key: id,
               label: null,
               nodes: new Set(),
               particleSystems: new Set(),
               particleStatus: new Map(),
               lights: new Set(),
               animationGroups: new Set(),
               animationStatus: new Map(),
               callbacks: new Set(),
               resolvers: [],
               metadata: {},
               desiredState: false,
               enabled: false,
               resolved: false,
               scene: null
            });
         }
         return groups.get(id) || null;
      };

      const ingestPayload = (group, payload, options = {}) => {
         if (!group || !payload) return false;
         let added = false;
         const list = Array.isArray(payload) ? payload : [payload];
         for (const entry of list) {
            if (!entry) continue;
            if (entry instanceof BABYLON.AbstractMesh || entry instanceof BABYLON.TransformNode) {
               if (addNodeAndDescendants(group, entry, options.includeDescendants !== false)) added = true;
               continue;
            }
            if (entry instanceof BABYLON.ParticleSystem) {
               if (!group.particleSystems.has(entry)) {
                  group.particleSystems.add(entry);
                  applyParticleState(group, entry, group.desiredState);
                  added = true;
               }
               continue;
            }
            if (entry instanceof BABYLON.Light) {
               if (!group.lights.has(entry)) {
                  group.lights.add(entry);
                  applyLightState(entry, group.desiredState);
                  added = true;
               }
               continue;
            }
            if (entry instanceof BABYLON.AnimationGroup) {
               if (!group.animationGroups.has(entry)) {
                  group.animationGroups.add(entry);
                  applyAnimationState(group, entry, group.desiredState);
                  added = true;
               }
               continue;
            }
            if (typeof entry === "function") {
               group.resolvers.push(entry);
               continue;
            }
            if (typeof entry === "string") {
               const pattern = entry;
               group.resolvers.push(({ scene: sceneOverride }) => {
                  const sceneRef = getActiveScene(sceneOverride || group.scene);
                  if (!sceneRef) return null;
                  const matches = [];
                  const exact = sceneRef.getNodeByName?.(pattern) || sceneRef.getTransformNodeByName?.(pattern) || sceneRef.getMeshByName?.(pattern);
                  if (exact) matches.push(exact);
                  if (pattern.includes("*") || pattern.includes("?")) {
                     const regex = wildcardToRegExp(pattern);
                     if (Array.isArray(sceneRef.transformNodes)) {
                        for (const node of sceneRef.transformNodes) {
                           if (regex.test(node?.name || node?.id || "")) matches.push(node);
                        }
                     }
                     if (Array.isArray(sceneRef.meshes)) {
                        for (const mesh of sceneRef.meshes) {
                           if (regex.test(mesh?.name || mesh?.id || "")) matches.push(mesh);
                        }
                     }
                  }
                  return matches.length ? { nodes: matches } : null;
               });
               continue;
            }
            if (Array.isArray(entry)) {
               if (ingestPayload(group, entry, options)) added = true;
               continue;
            }
            if (entry && typeof entry === "object") {
               if (entry.label && !group.label) group.label = entry.label;
               if (entry.metadata) group.metadata = { ...group.metadata, ...entry.metadata };
               if (entry.scene && !group.scene) group.scene = entry.scene;
               if (typeof entry.onToggle === "function") group.callbacks.add(entry.onToggle);
               if (Array.isArray(entry.onToggle)) {
                  entry.onToggle.forEach(cb => { if (typeof cb === "function") group.callbacks.add(cb); });
               }
               if (typeof entry.resolver === "function") group.resolvers.push(entry.resolver);
               if (Array.isArray(entry.resolvers)) {
                  entry.resolvers.forEach(fn => { if (typeof fn === "function") group.resolvers.push(fn); });
               }
               if (entry.nodes || entry.meshes || entry.node || entry.mesh || entry.transform) {
                  const nodes = entry.nodes || entry.meshes || entry.node || entry.mesh || entry.transform;
                  if (ingestPayload(group, nodes, { ...options, includeDescendants: entry.includeDescendants ?? options.includeDescendants })) added = true;
               }
               if (entry.particles || entry.particleSystems) {
                  if (ingestPayload(group, entry.particles || entry.particleSystems, options)) added = true;
               }
               if (entry.lights) {
                  if (ingestPayload(group, entry.lights, options)) added = true;
               }
               if (entry.animations || entry.animationGroups) {
                  if (ingestPayload(group, entry.animations || entry.animationGroups, options)) added = true;
               }
            }
         }
         return added;
      };

      const applyGroupStateInternal = (group, enabled, options = {}) => {
         if (!group) return false;
         const value = !!enabled;
         if (!options.force && group.enabled === value) return value;
         group.enabled = value;
         group.nodes.forEach(node => applyNodeState(node, value));
         group.lights.forEach(light => applyLightState(light, value));
         group.particleSystems.forEach(ps => applyParticleState(group, ps, value));
         group.animationGroups.forEach(anim => applyAnimationState(group, anim, value));
         if (!options.silent && group.callbacks.size) {
            const payload = { group, key: group.key, enabled: value, options };
            group.callbacks.forEach(cb => {
               try { cb(value, payload); } catch (err) { console.warn("[InteriorOcclusion] callback failed", err); }
            });
         }
         return value;
      };

      const resolveGroup = (group, options = {}) => {
         if (!group) return null;
         const sceneRef = getActiveScene(options.scene || group.scene);
         if (sceneRef) group.scene = sceneRef;
         let added = false;
         if (group.resolvers.length) {
            const resolvers = [...group.resolvers];
            for (const resolver of resolvers) {
               if (typeof resolver !== "function") continue;
               let result = null;
               try {
                  result = resolver({ group, scene: group.scene || getActiveScene(), options }) || null;
               } catch (err) {
                  console.warn("[InteriorOcclusion] resolver failed", err);
               }
               if (!result) continue;
               if (ingestPayload(group, result, options)) added = true;
            }
         }
         if ((added || group.nodes.size || group.particleSystems.size || group.lights.size || group.animationGroups.size) && !group.resolved) {
            group.resolved = true;
            applyGroupStateInternal(group, group.desiredState, { force: true, silent: true });
         }
         return group;
      };

      const setGroupState = (key, enabled, options = {}) => {
         const group = ensureGroup(key);
         if (!group) return false;
         const value = !!enabled;
         group.desiredState = value;
         if (options.label && !group.label) group.label = options.label;
         if (options.metadata) group.metadata = { ...group.metadata, ...options.metadata };
         if (options.scene && !group.scene) group.scene = options.scene;
         if (!group.resolved) resolveGroup(group, options);
         if (!group.resolved) return value;
         return applyGroupStateInternal(group, value, options);
      };

      const registerGroup = (key, spec = {}) => {
         const group = ensureGroup(key);
         if (!group) return null;
         if (spec.label) group.label = spec.label;
         if (spec.metadata) group.metadata = { ...group.metadata, ...spec.metadata };
         if (spec.scene && !group.scene) group.scene = spec.scene;
         if (typeof spec.onToggle === "function") group.callbacks.add(spec.onToggle);
         if (Array.isArray(spec.onToggle)) spec.onToggle.forEach(cb => { if (typeof cb === "function") group.callbacks.add(cb); });
         if (typeof spec.resolver === "function") group.resolvers.push(spec.resolver);
         if (Array.isArray(spec.resolvers)) spec.resolvers.forEach(fn => { if (typeof fn === "function") group.resolvers.push(fn); });
         ingestPayload(group, spec.nodes, spec);
         ingestPayload(group, spec.meshes, spec);
         ingestPayload(group, spec.particleSystems || spec.particles, spec);
         ingestPayload(group, spec.lights, spec);
         ingestPayload(group, spec.animations || spec.animationGroups, spec);
         if (typeof spec.enabled === "boolean") {
            group.desiredState = spec.enabled;
         }
         if (spec.autoResolve) {
            resolveGroup(group, spec);
         } else if (group.nodes.size || group.particleSystems.size || group.lights.size || group.animationGroups.size) {
            group.resolved = true;
            applyGroupStateInternal(group, group.desiredState, { force: true, silent: true });
         }
         if (typeof spec.enabled === "boolean" && group.resolved) {
            applyGroupStateInternal(group, spec.enabled, { force: true, silent: true });
         }
         return group;
      };

      const addToGroup = (key, payload, options = {}) => {
         const group = ensureGroup(key);
         if (!group) return null;
         if (options.label && !group.label) group.label = options.label;
         if (options.metadata) group.metadata = { ...group.metadata, ...options.metadata };
         if (options.scene && !group.scene) group.scene = options.scene;
         if (typeof options.onToggle === "function") group.callbacks.add(options.onToggle);
         const added = ingestPayload(group, payload, options);
         if (added) {
            group.resolved = true;
            applyGroupStateInternal(group, group.desiredState, { force: true, silent: true });
         }
         return group;
      };

      const refreshGroup = (key, options = {}) => {
         const group = ensureGroup(key);
         if (!group) return null;
         if (options.clear === true) {
            group.nodes.clear();
            group.particleSystems.clear();
            group.particleStatus.clear();
            group.lights.clear();
            group.animationGroups.clear();
            group.animationStatus.clear();
         }
         group.resolved = false;
         return resolveGroup(group, options);
      };

      const getGroupState = (key) => {
         const id = normalizeKey(key);
         if (!id) return null;
         const group = groups.get(id);
         if (!group) return null;
         return {
            key: group.key,
            label: group.label || null,
            enabled: group.enabled,
            desired: group.desiredState,
            resolved: group.resolved,
            counts: {
               nodes: group.nodes.size,
               particles: group.particleSystems.size,
               lights: group.lights.size,
               animations: group.animationGroups.size
            }
         };
      };

      const getGroup = (key) => {
         const id = normalizeKey(key);
         return id ? groups.get(id) || null : null;
      };

      const getGroups = () => Array.from(groups.values());

      const withGroup = (key, cb) => {
         const group = ensureGroup(key);
         if (!group) return null;
         if (typeof cb === "function") {
            try { cb(group); } catch (err) { console.warn("[InteriorOcclusion] withGroup callback failed", err); }
         }
         return group;
      };

      return {
         ensureGroup,
         registerGroup,
         addToGroup,
         setGroupState,
         refreshGroup,
         resolveGroup,
         getGroupState,
         getGroup,
         getGroups,
         withGroup
      };
   })();

   function resetAdaptiveQualityState() {
      adaptiveQuality.lowTimer = 0;
      adaptiveQuality.highTimer = 0;
      adaptiveQuality.currentLevel = clamp(perfSettings.optimizerLevel, 0, ADAPTIVE_QUALITY_LEVELS.length - 1);
      adaptiveQuality.dynamic.enabled = !!perfSettings.dynamic.enabled;
      adaptiveQuality.dynamic.minScale = perfSettings.dynamic.minScale;
      adaptiveQuality.dynamic.scale = adaptiveQuality.dynamic.enabled
         ? perfSettings.dynamic.currentScale
         : 1;
      adaptiveQuality.dynamic.cooldown = 0;
      syncDynamicPerfSettings();
   }

   function applyQualityPreset(level) {
      const pipeline = adaptiveQuality.pipeline;
      if (pipeline) {
         const fxEnabled = level === 0;
         pipeline.fxaaEnabled = fxEnabled;
         pipeline.samples = fxEnabled ? 2 : 1;
         pipeline.sharpenEnabled = fxEnabled;
      }
      const sceneRef = adaptiveQuality.scene;
      if (sceneRef) {
         sceneRef.shadowsEnabled = level <= 1;
         const imageConfig = sceneRef.imageProcessingConfiguration;
         if (imageConfig) {
            imageConfig.toneMappingEnabled = level === 0;
            imageConfig.contrast = level === 0 ? 1.05 : 1.0;
            imageConfig.exposure = level === 0 ? 1.0 : 0.95;
         }
      }
      setCloudVisibility(level <= 1);
   }

   function setCloudVisibility(visible) {
      if (environment?.clouds) {
         for (const cloud of environment.clouds) {
            const mesh = cloud?.mesh;
            if (mesh) mesh.isVisible = visible;
         }
      }
      environment.cloudsVisible = visible;
   }

   function setQualityLevel(level, { force = false, fromOptimizer = false } = {}) {
      const maxLevel = ADAPTIVE_QUALITY_LEVELS.length - 1;
      const clamped = clamp(level, 0, maxLevel);
      if (!force && adaptiveQuality.currentLevel === clamped) return;
      adaptiveQuality.currentLevel = clamped;
      applyQualityPreset(clamped);
      if (!fromOptimizer) {
         adaptiveQuality.lowTimer = 0;
      }
      adaptiveQuality.highTimer = 0;
      updateHudAdaptiveQuality();
      updatePerfSettings({
         optimizerLevel: adaptiveQuality.currentLevel,
         qualityLabel: ADAPTIVE_QUALITY_LEVELS[adaptiveQuality.currentLevel]?.label || "High"
      });
   }

   function updateHudAdaptiveQuality() {
      const hudApi = window.HUD;
      if (!hudApi?.setAdaptiveQualityStatus) return;
      const label = ADAPTIVE_QUALITY_LEVELS[adaptiveQuality.currentLevel]?.label || "High";
      hudApi.setAdaptiveQualityStatus({
         qualityLabel: label,
         dynamicScale: adaptiveQuality.dynamic.scale,
         dynamicEnabled: adaptiveQuality.dynamic.enabled,
         minScale: adaptiveQuality.dynamic.minScale
      });
      scheduleProfilerHudSync();
   }

   function setPerformanceTargetFps(value) {
      if (!Number.isFinite(value)) return;
      const clamped = clamp(Math.round(value), 30, 120);
      adaptiveQuality.targetFps = clamped;
      if (adaptiveQuality.optimizer) {
         adaptiveQuality.optimizer.targetFrameRate = clamped;
      }
      adaptiveQuality.lowTimer = 0;
      adaptiveQuality.highTimer = 0;
   }

   function applyDynamicResolutionState({ immediate = false } = {}) {
      const engineRef = adaptiveQuality.engine;
      const dyn = adaptiveQuality.dynamic;
      if (!dyn.enabled) {
         dyn.scale = 1;
      } else {
         dyn.scale = clamp(dyn.scale, dyn.minScale, 1);
      }
      if (engineRef) {
         try {
            engineRef.setHardwareScalingLevel(dyn.scale > 0 ? 1 / dyn.scale : 1);
         } catch (err) {
            console.warn("[HXH] Failed to apply dynamic resolution", err);
         }
      }
      if (immediate) dyn.cooldown = 0;
      updateHudAdaptiveQuality();
      syncDynamicPerfSettings();
   }

   function handleHudDynamicResolution(state = {}) {
      if (!state || typeof state !== "object") return;
      const dyn = adaptiveQuality.dynamic;
      if (typeof state.enabled === "boolean") dyn.enabled = state.enabled;
      if (Number.isFinite(state.minScale)) dyn.minScale = clamp(state.minScale, 0.5, 1);
      if (!dyn.enabled) {
         dyn.scale = 1;
      } else {
         dyn.scale = clamp(Math.max(dyn.minScale, dyn.scale), dyn.minScale, 1);
      }
      dyn.cooldown = 0;
      applyDynamicResolutionState({ immediate: true });
      scheduleProfilerHudSync();
   }

   function setDynamicResolutionEnabled(enabled) {
      const dyn = adaptiveQuality.dynamic;
      dyn.enabled = !!enabled;
      if (!dyn.enabled) {
         dyn.scale = 1;
      }
      dyn.cooldown = 0;
      applyDynamicResolutionState({ immediate: true });
      const hudApi = window.HUD;
      hudApi?.updateDynamicResolutionState?.({
         enabled: dyn.enabled,
         minScale: dyn.minScale,
         currentScale: dyn.scale
      });
      updateHudAdaptiveQuality();
      scheduleProfilerHudSync();
      return dyn.enabled;
   }

   function initializeAdaptiveQuality(sceneRef, engineRef, cameraRef) {
      adaptiveQuality.scene = sceneRef;
      adaptiveQuality.engine = engineRef;
      adaptiveQuality.camera = cameraRef;

      if (adaptiveQuality.pipeline) {
         try { adaptiveQuality.pipeline.dispose(); } catch (err) {}
         adaptiveQuality.pipeline = null;
      }
      if (BABYLON.DefaultRenderingPipeline) {
         try {
            adaptiveQuality.pipeline = new BABYLON.DefaultRenderingPipeline("adaptivePipeline", true, sceneRef, [cameraRef]);
            adaptiveQuality.pipeline.fxaaEnabled = true;
            adaptiveQuality.pipeline.samples = 1;
            adaptiveQuality.pipeline.bloomEnabled = false;
            adaptiveQuality.pipeline.sharpenEnabled = false;
         } catch (err) {
            console.warn("[HXH] Failed to create rendering pipeline", err);
            adaptiveQuality.pipeline = null;
         }
      }

      if (adaptiveQuality.optimizer) {
         try { adaptiveQuality.optimizer.stop(); } catch (err) {}
         adaptiveQuality.optimizer = null;
      }

      if (BABYLON.SceneOptimizerOptions) {
         try {
            const options = new BABYLON.SceneOptimizerOptions(adaptiveQuality.targetFps, 2000);
            if (BABYLON.SceneOptimization) {
               const custom = new BABYLON.SceneOptimization(0);
               custom.apply = () => {
                  if (adaptiveQuality.currentLevel < ADAPTIVE_QUALITY_LEVELS.length - 1) {
                     setQualityLevel(adaptiveQuality.currentLevel + 1, { fromOptimizer: true });
                  }
                  if (adaptiveQuality.optimizer) {
                     try { adaptiveQuality.optimizer.stop(); } catch (err) {}
                  }
                  adaptiveQuality.optimizerRunning = false;
                  return true;
               };
               custom.getDescription = () => "Adaptive quality step";
               options.addOptimization(custom);
            }
            if (BABYLON.PostProcessesOptimization) options.addOptimization(new BABYLON.PostProcessesOptimization(1));
            if (BABYLON.TextureOptimization) options.addOptimization(new BABYLON.TextureOptimization(2, 512));
            if (BABYLON.ShadowsOptimization) options.addOptimization(new BABYLON.ShadowsOptimization(3));
            adaptiveQuality.optimizer = new BABYLON.SceneOptimizer(sceneRef, options);
            adaptiveQuality.optimizer.onSuccessObservable?.add(() => { adaptiveQuality.optimizerRunning = false; });
            adaptiveQuality.optimizer.onFailureObservable?.add(() => { adaptiveQuality.optimizerRunning = false; });
         } catch (err) {
            console.warn("[HXH] Failed to initialise SceneOptimizer", err);
            adaptiveQuality.optimizer = null;
         }
      }

      applyDynamicResolutionState({ immediate: true });
      setQualityLevel(adaptiveQuality.currentLevel, { force: true });
   }

   function setupHudAdaptiveControls(hudApi) {
      if (!hudApi) return;
      if (typeof hudPerformanceUnsub === "function") {
         try { hudPerformanceUnsub(); } catch (err) {}
         hudPerformanceUnsub = null;
      }
      if (typeof hudDynamicUnsub === "function") {
         try { hudDynamicUnsub(); } catch (err) {}
         hudDynamicUnsub = null;
      }
      hudApi.setPerformanceTarget?.(adaptiveQuality.targetFps);
      hudApi.setDynamicResolutionOptions?.({
         enabled: adaptiveQuality.dynamic.enabled,
         minScale: adaptiveQuality.dynamic.minScale,
         currentScale: adaptiveQuality.dynamic.scale
      });
      hudApi.setAdaptiveQualityStatus?.({
         qualityLabel: ADAPTIVE_QUALITY_LEVELS[adaptiveQuality.currentLevel]?.label || "High",
         dynamicScale: adaptiveQuality.dynamic.scale,
         dynamicEnabled: adaptiveQuality.dynamic.enabled,
         minScale: adaptiveQuality.dynamic.minScale
      });
      if (typeof hudApi.onPerformanceTargetChange === "function") {
         hudPerformanceUnsub = hudApi.onPerformanceTargetChange((value) => setPerformanceTargetFps(value));
      }
      if (typeof hudApi.onDynamicResolutionChange === "function") {
         hudDynamicUnsub = hudApi.onDynamicResolutionChange((state) => handleHudDynamicResolution(state));
      }
   }

   function stepDynamicResolutionDown() {
      const dyn = adaptiveQuality.dynamic;
      if (!dyn.enabled) return;
      const next = clamp(dyn.scale - 0.1, dyn.minScale, 1);
      if (next < dyn.scale - 0.001) {
         dyn.scale = Math.max(dyn.minScale, Math.round(next * 100) / 100);
         dyn.cooldown = 1.5;
         adaptiveQuality.highTimer = 0;
         applyDynamicResolutionState({ immediate: true });
      }
   }

   function stepDynamicResolutionUp() {
      const dyn = adaptiveQuality.dynamic;
      if (!dyn.enabled) return;
      const next = clamp(dyn.scale + 0.05, dyn.minScale, 1);
      if (next > dyn.scale + 0.001) {
         dyn.scale = Math.min(1, Math.round(next * 100) / 100);
         applyDynamicResolutionState({ immediate: true });
         adaptiveQuality.lowTimer = 0;
      }
   }

   function triggerQualityDrop() {
      adaptiveQuality.lowTimer = 0;
      adaptiveQuality.highTimer = 0;
      if (adaptiveQuality.currentLevel >= ADAPTIVE_QUALITY_LEVELS.length - 1) return;
      if (adaptiveQuality.optimizer) {
         if (adaptiveQuality.optimizerRunning) return;
         adaptiveQuality.optimizerRunning = true;
         try {
            adaptiveQuality.optimizer.targetFrameRate = adaptiveQuality.targetFps;
            adaptiveQuality.optimizer.reset();
            adaptiveQuality.optimizer.start();
         } catch (err) {
            adaptiveQuality.optimizerRunning = false;
            console.warn("[HXH] SceneOptimizer start failed", err);
            setQualityLevel(adaptiveQuality.currentLevel + 1);
         }
      } else {
         setQualityLevel(adaptiveQuality.currentLevel + 1);
      }
   }

   function updateAdaptiveQuality(dt) {
      if (!adaptiveQuality.engine || !adaptiveQuality.scene) return;
      if (!Number.isFinite(dt) || dt <= 0) return;
      const delta = Math.min(dt, 0.5);
      if (delta <= 0) return;
      const dyn = adaptiveQuality.dynamic;
      if (dyn.cooldown > 0) dyn.cooldown = Math.max(0, dyn.cooldown - delta);

      let fps = 0;
      if (typeof adaptiveQuality.engine.getFps === "function") {
         fps = adaptiveQuality.engine.getFps();
      }
      if (!Number.isFinite(fps) || fps <= 1) {
         fps = 1 / delta;
      }
      if (!Number.isFinite(fps) || fps <= 1) return;

      const target = adaptiveQuality.targetFps;
      const lowThreshold = target * 0.9;
      const highThreshold = target * 1.05;

      if (fps < lowThreshold) {
         adaptiveQuality.lowTimer += delta;
         adaptiveQuality.highTimer = Math.max(0, adaptiveQuality.highTimer - delta * 0.5);
         if (adaptiveQuality.lowTimer >= adaptiveQuality.degradeDelay) {
            adaptiveQuality.lowTimer = 0;
            if (dyn.enabled && dyn.scale > dyn.minScale + 0.001) {
               stepDynamicResolutionDown();
            } else {
               triggerQualityDrop();
            }
         }
      } else if (fps > highThreshold) {
         adaptiveQuality.highTimer += delta;
         adaptiveQuality.lowTimer = Math.max(0, adaptiveQuality.lowTimer - delta * 0.5);
         if (adaptiveQuality.highTimer >= adaptiveQuality.recoverDelay) {
            adaptiveQuality.highTimer = 0;
            if (adaptiveQuality.currentLevel > 0) {
               setQualityLevel(adaptiveQuality.currentLevel - 1);
            } else if (dyn.enabled && dyn.scale < 0.999 && dyn.cooldown <= 0) {
               stepDynamicResolutionUp();
            }
         }
      } else {
         adaptiveQuality.lowTimer = Math.max(0, adaptiveQuality.lowTimer - delta * 0.5);
         adaptiveQuality.highTimer = Math.max(0, adaptiveQuality.highTimer - delta * 0.5);
      }
   }

   function ensureProfilerInstrumentation() {
      if (!profilerState.enabled) return;
      if (engine && !engineInstrumentation && typeof BABYLON?.EngineInstrumentation === "function") {
         try {
            engineInstrumentation = new BABYLON.EngineInstrumentation(engine);
            engineInstrumentation.captureGPUFrameTime = true;
         } catch (err) {
            engineInstrumentation = null;
            console.debug("[Profiler] EngineInstrumentation unavailable", err);
         }
      }
      if (scene && !sceneInstrumentation && typeof BABYLON?.SceneInstrumentation === "function") {
         try {
            sceneInstrumentation = new BABYLON.SceneInstrumentation(scene);
            sceneInstrumentation.captureFrameTime = true;
            sceneInstrumentation.captureRenderTime = true;
         } catch (err) {
            sceneInstrumentation = null;
            console.debug("[Profiler] SceneInstrumentation unavailable", err);
         }
      }
   }

   function scheduleProfilerHudSync() {
      if (!profilerState.enabled || profilerHudSyncPending) return;
      const hudApi = window.HUD;
      if (!hudApi?.updateProfilerOverlayState) return;
      profilerHudSyncPending = true;
      const run = () => {
         profilerHudSyncPending = false;
         pushProfilerHudState();
      };
      if (typeof requestAnimationFrame === "function") {
         requestAnimationFrame(run);
      } else {
         setTimeout(run, 0);
      }
   }

   function pushProfilerHudState() {
      if (!profilerState.enabled) return;
      const hudApi = window.HUD;
      if (!hudApi?.updateProfilerOverlayState) return;
      const streaming = environment.terrain?.streaming;
      let chunkRadius = null;
      let chunkOverride = null;
      let chunkMin = null;
      let chunkMax = null;
      let chunkStep = null;
      if (streaming) {
         chunkRadius = Number.isFinite(streaming.loadedRadius) ? streaming.loadedRadius : null;
         chunkOverride = Number.isFinite(streaming.radiusOverride) ? streaming.radiusOverride : null;
         chunkMin = Number.isFinite(streaming.minRadius) ? streaming.minRadius : null;
         chunkMax = Number.isFinite(streaming.maxRadius) ? streaming.maxRadius : null;
         const worldSize = Number.isFinite(streaming.chunkWorldSize) ? streaming.chunkWorldSize : 4;
         chunkStep = Math.max(1, Math.round(worldSize * 0.25));
      }
      const instanceMode = getInstanceRenderingMode();
      hudApi.updateProfilerOverlayState({
         lodEnabled: environment.lodEnabled !== false,
         instanceMode,
         greedyEnabled: !!environment.terrainSettings?.greedyMeshing,
         dynamicResolution: !!adaptiveQuality.dynamic.enabled,
         chunkRadius,
         chunkOverride,
         chunkMin,
         chunkMax,
         chunkStep
      });
   }

   function updateProfilerMetrics() {
      if (!profilerState.enabled) return;
      const hudApi = window.HUD;
      if (!hudApi?.updateProfilerOverlayMetrics) return;
      const now = typeof performance === "object" && typeof performance.now === "function" ? performance.now() : Date.now();
      if (profilerState.lastMetricsUpdate && now - profilerState.lastMetricsUpdate < 200) return;
      ensureProfilerInstrumentation();
      let fps = typeof engine?.getFps === "function" ? engine.getFps() : 0;
      if (!Number.isFinite(fps) || fps < 0) fps = 0;
      const drawCalls = typeof engine?.drawCalls === "number"
         ? engine.drawCalls
         : sceneInstrumentation?.drawCallsCounter?.current ?? 0;
      const activeVertices = typeof engine?.getActiveVertices === "function"
         ? engine.getActiveVertices()
         : sceneInstrumentation?.activeVerticesCounter?.current ?? 0;
      let gpuFrameTime = null;
      if (engineInstrumentation?.gpuFrameTimeCounter) {
         const counter = engineInstrumentation.gpuFrameTimeCounter;
         gpuFrameTime = Number.isFinite(counter.lastSecAverage) && counter.lastSecAverage > 0
            ? counter.lastSecAverage
            : counter.current;
      }
      const streaming = environment.terrain?.streaming;
      let chunksLoaded = 0;
      let chunksPending = 0;
      if (streaming?.chunks) {
         for (const chunk of streaming.chunks) {
            if (!chunk) continue;
            if (chunk.state === STREAMING_STATES.LOADED) chunksLoaded += 1;
            else if (chunk.state === STREAMING_STATES.LOADING || chunk.state === STREAMING_STATES.UNLOADING) chunksPending += 1;
         }
      }
      if (Array.isArray(streaming?.queue)) chunksPending += streaming.queue.length;
      const physicsBudget = physics.instrumentation.budgetUsedMs;
      const physicsSlowBudget = physics.instrumentation.slowBudgetUsedMs;
      const physicsBodies = physics.bodies.size;
      const physicsSleeping = physics.sleepingBodies.size;
      const physicsSkipped = physics.instrumentation.skippedSteps;
      hudApi.updateProfilerOverlayMetrics({
         fps,
         drawCalls,
         activeVertices,
         gpuFrameTime,
         chunksLoaded,
         chunksPending,
         workerQueueDepth: workerMetrics.pending,
         physicsBodies,
         physicsSleeping,
         physicsBudget,
         physicsSlowBudget,
         physicsSkipped
      });
      profilerState.lastMetricsUpdate = now;
   }

   function ensureProfilerHudConfigured(hudApi) {
      if (!profilerState.enabled || profilerHudConfigured) return;
      if (!hudApi?.configureProfilerOverlay) return;
      hudApi.configureProfilerOverlay({
         onToggleLod: (value) => setEnvironmentLodEnabled(value),
         onInstanceModeChange: (mode) => setInstanceRenderingMode(mode),
         onGreedyChange: (value) => setGreedyMeshingEnabled(value),
         onDynamicResolutionChange: (value) => setDynamicResolutionEnabled(value),
         onChunkRadiusChange: (value) => {
            if (Number.isFinite(value)) setTerrainStreamingRadius(value, { mode: "manual" });
         },
         onChunkRadiusReset: () => setTerrainStreamingRadius(null, { mode: "manual" })
      });
      hudApi.setProfilerOverlayVisible?.(false);
      profilerHudConfigured = true;
      scheduleProfilerHudSync();
   }

   let terrainRadiusControl = null;
   let terrainRadiusUiScheduled = false;
   let terrainDeformListenerAttached = false;

   let fallbackTreeMaterials = null;

   const INSTANCE_POOL = (() => {
      const registry = new Map();
      let idCounter = 1;
      let preferClones = false;

      const toVector3 = (value, fallback = new BABYLON.Vector3(0, 0, 0)) => {
         if (value instanceof BABYLON.Vector3) return value.clone();
         if (Array.isArray(value) && value.length >= 3) {
            return new BABYLON.Vector3(
               Number(value[0]) || 0,
               Number(value[1]) || 0,
               Number(value[2]) || 0
            );
         }
         if (value && typeof value === "object") {
            const x = Number(value.x);
            const y = Number(value.y);
            const z = Number(value.z);
            if (Number.isFinite(x) || Number.isFinite(y) || Number.isFinite(z)) {
               return new BABYLON.Vector3(x || 0, y || 0, z || 0);
            }
         }
         if (typeof value === "number" && Number.isFinite(value)) {
            return new BABYLON.Vector3(value, value, value);
         }
         return fallback.clone();
      };

      const toQuaternion = (value) => {
         if (value instanceof BABYLON.Quaternion) return value.clone();
         if (Array.isArray(value) && value.length >= 4) {
            return new BABYLON.Quaternion(
               Number(value[0]) || 0,
               Number(value[1]) || 0,
               Number(value[2]) || 0,
               Number(value[3]) || 1
            );
         }
         if (value && typeof value === "object") {
            const x = Number(value.x);
            const y = Number(value.y);
            const z = Number(value.z);
            const w = Number(value.w);
            if ([x, y, z, w].some(Number.isFinite)) {
               return new BABYLON.Quaternion(x || 0, y || 0, z || 0, Number.isFinite(w) ? w : 1);
            }
         }
         return BABYLON.Quaternion.Identity();
      };

      const normalizeTransform = (transform = {}) => {
         const position = toVector3(transform.position);
         let scaling = transform.scaling instanceof BABYLON.Vector3
            ? transform.scaling.clone()
            : toVector3(transform.scaling, new BABYLON.Vector3(1, 1, 1));
         if (typeof transform.scaling === "number") {
            scaling = new BABYLON.Vector3(transform.scaling, transform.scaling, transform.scaling);
         }
         let rotationQuat = null;
         if (transform.rotationQuaternion) {
            rotationQuat = toQuaternion(transform.rotationQuaternion);
         } else if (transform.quaternion) {
            rotationQuat = toQuaternion(transform.quaternion);
         } else if (transform.rotation instanceof BABYLON.Vector3) {
            rotationQuat = BABYLON.Quaternion.FromEulerVector(transform.rotation);
         } else if (Array.isArray(transform.rotation) && transform.rotation.length >= 3) {
            rotationQuat = BABYLON.Quaternion.FromEulerAngles(
               Number(transform.rotation[0]) || 0,
               Number(transform.rotation[1]) || 0,
               Number(transform.rotation[2]) || 0
            );
         } else if (transform.rotation && typeof transform.rotation === "object") {
            rotationQuat = BABYLON.Quaternion.FromEulerAngles(
               Number(transform.rotation.x) || 0,
               Number(transform.rotation.y) || 0,
               Number(transform.rotation.z) || 0
            );
         } else if (Number.isFinite(transform.rotationY)) {
            rotationQuat = BABYLON.Quaternion.FromEulerAngles(0, transform.rotationY, 0);
         } else {
            rotationQuat = BABYLON.Quaternion.Identity();
         }

         const matrix = BABYLON.Matrix.Compose(scaling, rotationQuat, position);
         return { position, scaling, rotationQuaternion: rotationQuat, matrix };
      };

      const applyTransformToMesh = (mesh, transform) => {
         if (!mesh || !transform) return;
         if (!mesh.rotationQuaternion) {
            mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
         }
         mesh.position.copyFrom(transform.position);
         mesh.scaling.copyFrom(transform.scaling);
         mesh.rotationQuaternion.copyFrom(transform.rotationQuaternion);
         if (mesh.rotation) {
            mesh.rotation.set(0, 0, 0);
         }
      };

      const createMeshForEntry = (entry, transform, id, modeOverride) => {
         const baseMesh = ensureBaseMesh(entry);
         if (!baseMesh) return null;
         const renderMode = modeOverride || (preferClones ? "cloned" : "instanced");
         const name = `${entry.type}-${renderMode}-${id}`;
         let mesh = null;
         if (renderMode === "cloned") {
            mesh = baseMesh.clone(name);
            if (!mesh) return null;
            if (!mesh.parent) mesh.parent = baseMesh.parent || null;
         } else {
            mesh = baseMesh.createInstance(name);
         }
         if (!mesh) return null;
         applyTransformToMesh(mesh, transform);
         mesh.isVisible = true;
         mesh.isPickable = false;
         mesh.checkCollisions = !!entry.options.withCollisions;
         return mesh;
      };

      const rebuildEntryRenderMode = (entry) => {
         if (!entry || entry.mode === "thin") return;
         const records = Array.from(entry.instanceRecords.entries());
         if (!records.length) {
            entry.renderMode = preferClones ? "cloned" : "instanced";
            return;
         }
         for (const [, record] of records) {
            if (record?.mesh && typeof record.mesh.dispose === "function") {
               try { record.mesh.dispose(); } catch (err) { /* ignore */ }
            }
         }
         entry.instanceRecords.clear();
         const renderMode = preferClones ? "cloned" : "instanced";
         for (const [id, record] of records) {
            const mesh = createMeshForEntry(entry, record.transform, id, renderMode);
            if (!mesh) continue;
            entry.instanceRecords.set(id, { mesh, transform: record.transform });
         }
         entry.renderMode = renderMode;
      };

      const rebuildThinBuffer = (entry) => {
         const { thinMatrices, baseMesh } = entry;
         if (!baseMesh) return;
         if (!thinMatrices.length) {
            baseMesh.thinInstanceSetBuffer("matrix", null, 16);
            baseMesh.thinInstanceCount = 0;
            baseMesh.isVisible = false;
            return;
         }
         const data = new Float32Array(thinMatrices.length * 16);
         for (let i = 0; i < thinMatrices.length; i += 1) {
            thinMatrices[i].matrix.copyToArray(data, i * 16);
         }
         baseMesh.thinInstanceSetBuffer("matrix", data, 16, true);
         baseMesh.thinInstanceCount = thinMatrices.length;
         baseMesh.thinInstanceBufferUpdated = true;
         baseMesh.thinInstanceRefreshBoundingInfo(true);
         baseMesh.isVisible = true;
      };

      const ensureEntry = (type) => {
         const key = typeof type === "string" ? type.trim().toLowerCase() : null;
         if (!key) return null;
         if (!registry.has(key)) {
            registry.set(key, {
               type: key,
               baseMesh: null,
               factory: null,
               options: {
                  allowThin: true,
                  thinThreshold: 800,
                  withCollisions: false
               },
               instanceRecords: new Map(),
               thinMatrices: [],
               thinIndex: new Map(),
               mode: "instanced"
            });
         }
         return registry.get(key);
      };

      const ensureBaseMesh = (entry) => {
         if (entry.baseMesh && !entry.baseMesh.isDisposed() && (!scene || entry.baseMesh.getScene() === scene)) {
            return entry.baseMesh;
         }
         if (entry.baseMesh && typeof entry.baseMesh.dispose === "function") {
            try { entry.baseMesh.dispose(false, true); } catch (err) { /* ignore */ }
         }
         entry.baseMesh = null;
         if (typeof entry.factory === "function" && scene) {
            const mesh = entry.factory(scene, entry) || null;
            if (mesh) {
               mesh.isVisible = false;
               mesh.alwaysSelectAsActiveMesh = false;
               mesh.isPickable = false;
               if (!entry.options.withCollisions) mesh.checkCollisions = false;
               entry.baseMesh = mesh;
            }
         }
         return entry.baseMesh;
      };

      const convertToThin = (entry) => {
         if (entry.mode === "thin") return;
         const baseMesh = ensureBaseMesh(entry);
         if (!baseMesh) return;
         const nextMatrices = [];
         for (const [id, record] of entry.instanceRecords.entries()) {
            nextMatrices.push({ id, matrix: record.transform.matrix.clone() });
            if (record.mesh && typeof record.mesh.dispose === "function") {
               try { record.mesh.dispose(); } catch (err) { /* ignore */ }
            }
         }
         entry.instanceRecords.clear();
         entry.thinMatrices = nextMatrices;
         entry.thinIndex = new Map(nextMatrices.map((rec, idx) => [rec.id, idx]));
         entry.mode = "thin";
         rebuildThinBuffer(entry);
      };

      const registerType = (type, config = {}) => {
         const entry = ensureEntry(type);
         if (!entry) return null;
         if (config.factory && typeof config.factory === "function") {
            entry.factory = config.factory;
         }
         if (config.baseMesh instanceof BABYLON.Mesh) {
            entry.baseMesh = config.baseMesh;
         }
         entry.options = {
            allowThin: config.allowThin !== undefined ? !!config.allowThin : entry.options.allowThin,
            thinThreshold: Number.isFinite(config.thinThreshold) ? config.thinThreshold : entry.options.thinThreshold,
            withCollisions: config.withCollisions !== undefined ? !!config.withCollisions : entry.options.withCollisions
         };
         return entry;
      };

      const spawnInstances = (type, transforms = [], options = {}) => {
         const entry = ensureEntry(type);
         if (!entry) return [];
         const list = Array.isArray(transforms) ? transforms : [transforms];
         if (!list.length) return [];

         const created = [];
         const requestMode = typeof options.mode === "string" ? options.mode.toLowerCase() : null;
         if (entry.mode !== "thin") {
            const predicted = entry.instanceRecords.size + list.length;
            const shouldThin = requestMode === "thin" || (
               requestMode !== "instanced" && entry.options.allowThin && !entry.options.withCollisions && predicted >= entry.options.thinThreshold
            );
            if (shouldThin) {
               convertToThin(entry);
            }
         }

         if (entry.mode === "thin") {
            const matrices = entry.thinMatrices;
            const indexMap = entry.thinIndex;
            for (const transformInput of list) {
               const transform = normalizeTransform(transformInput);
               const id = idCounter++;
               matrices.push({ id, matrix: transform.matrix });
               indexMap.set(id, matrices.length - 1);
               created.push(id);
            }
            rebuildThinBuffer(entry);
            return created;
         }

         const explicitMode = requestMode === "cloned" ? "cloned" : requestMode === "instanced" ? "instanced" : null;
         for (const transformInput of list) {
            const transform = normalizeTransform(transformInput);
            const id = idCounter++;
            const mesh = createMeshForEntry(entry, transform, id, explicitMode);
            if (!mesh) continue;
            entry.instanceRecords.set(id, { mesh, transform });
            entry.renderMode = (explicitMode || (preferClones ? "cloned" : "instanced"));
            created.push(id);
         }
         return created;
      };

      const despawnInstances = (type, ids = []) => {
         const entry = ensureEntry(type);
         if (!entry || !ids || ids.length === 0) return 0;
         let removed = 0;
         if (entry.mode === "thin") {
            const matrices = entry.thinMatrices;
            const indexMap = entry.thinIndex;
            for (const rawId of ids) {
               const id = Number(rawId);
               if (!indexMap.has(id)) continue;
               const index = indexMap.get(id);
               matrices.splice(index, 1);
               indexMap.delete(id);
               for (let i = index; i < matrices.length; i += 1) {
                  indexMap.set(matrices[i].id, i);
               }
               removed += 1;
            }
            if (removed > 0) rebuildThinBuffer(entry);
            return removed;
         }

         for (const rawId of ids) {
            const id = Number(rawId);
            if (!entry.instanceRecords.has(id)) continue;
            const record = entry.instanceRecords.get(id);
            if (record.mesh && typeof record.mesh.dispose === "function") {
               try { record.mesh.dispose(); } catch (err) { /* ignore */ }
            }
            entry.instanceRecords.delete(id);
            removed += 1;
         }
         return removed;
      };

      const setPreferredMode = (mode) => {
         const normalized = mode === "cloned" ? "cloned" : "instanced";
         const next = normalized === "cloned";
         if (preferClones === next) return normalized;
         preferClones = next;
         for (const entry of registry.values()) {
            rebuildEntryRenderMode(entry);
         }
         return normalized;
      };

      const getPreferredMode = () => (preferClones ? "cloned" : "instanced");

      const reset = ({ disposeBase = false } = {}) => {
         for (const entry of registry.values()) {
            if (entry.mode === "thin") {
               entry.thinMatrices = [];
               entry.thinIndex.clear();
               if (entry.baseMesh) {
                  entry.baseMesh.thinInstanceSetBuffer("matrix", null, 16);
                  entry.baseMesh.thinInstanceCount = 0;
                  entry.baseMesh.isVisible = false;
               }
            } else {
               for (const record of entry.instanceRecords.values()) {
                  if (record.mesh && typeof record.mesh.dispose === "function") {
                     try { record.mesh.dispose(); } catch (err) { /* ignore */ }
                  }
               }
               entry.instanceRecords.clear();
            }
            entry.mode = "instanced";
            if (disposeBase && entry.baseMesh) {
               try { entry.baseMesh.dispose(false, true); } catch (err) { /* ignore */ }
               entry.baseMesh = null;
            }
            entry.renderMode = preferClones ? "cloned" : "instanced";
         }
      };

      return {
         registerType,
         spawnInstances,
         despawnInstances,
         reset,
         setPreferredMode,
         getPreferredMode,
         _registry: registry
      };
   })();

   const TREE_PROTOTYPES = {
      trunk: null,
      foliage: null,
      crown: null,
      mediumTrunk: null,
      mediumFoliage: null,
      mediumCrown: null,
      billboard: null
   };

   function disposeTreePrototypes() {
      for (const key of Object.keys(TREE_PROTOTYPES)) {
         const mesh = TREE_PROTOTYPES[key];
         if (mesh && typeof mesh.dispose === "function" && !mesh.isDisposed()) {
            try { mesh.dispose(false, true); } catch (err) { /* ignore */ }
         }
         TREE_PROTOTYPES[key] = null;
      }
   }

   function ensureTreePrototypes(scene) {
      if (!scene) return TREE_PROTOTYPES;
      const sameScene = (mesh) => mesh && !mesh.isDisposed() && mesh.getScene() === scene;
      if (sameScene(TREE_PROTOTYPES.trunk) && sameScene(TREE_PROTOTYPES.foliage) && sameScene(TREE_PROTOTYPES.crown)) {
         return TREE_PROTOTYPES;
      }

      disposeTreePrototypes();

      const { trunkMat, leavesMat, billboardMat } = getFallbackTreeMaterials(scene);
      const trunk = BABYLON.MeshBuilder.CreateCylinder("treePrototype-trunk", {
         height: 4,
         diameterTop: 0.55,
         diameterBottom: 0.75
      }, scene);
      trunk.material = trunkMat;
      trunk.position.y = 2;
      trunk.isVisible = false;
      trunk.isPickable = false;
      trunk.checkCollisions = false;

      const foliage = BABYLON.MeshBuilder.CreateSphere("treePrototype-foliage", {
         diameterX: 3.2,
         diameterY: 3.4,
         diameterZ: 3.2,
         segments: 2
      }, scene);
      foliage.material = leavesMat;
      foliage.position.y = 4.5;
      foliage.isVisible = false;
      foliage.isPickable = false;
      foliage.checkCollisions = false;

      const crown = BABYLON.MeshBuilder.CreateSphere("treePrototype-crown", {
         diameterX: 2.6,
         diameterY: 2.8,
         diameterZ: 2.6,
         segments: 2
      }, scene);
      crown.material = leavesMat;
      crown.position.y = 6;
      crown.isVisible = false;
      crown.isPickable = false;
      crown.checkCollisions = false;

      const mediumTrunk = BABYLON.MeshBuilder.CreateCylinder("treePrototype-lod-trunk", {
         height: 4,
         diameterTop: 0.5,
         diameterBottom: 0.68,
         tessellation: 5
      }, scene);
      mediumTrunk.material = trunkMat;
      mediumTrunk.position.y = 2;
      mediumTrunk.isVisible = false;
      mediumTrunk.isPickable = false;
      mediumTrunk.checkCollisions = false;

      const mediumFoliage = BABYLON.MeshBuilder.CreateSphere("treePrototype-lod-foliage", {
         diameterX: 3,
         diameterY: 3,
         diameterZ: 3,
         segments: 1
      }, scene);
      mediumFoliage.material = leavesMat;
      mediumFoliage.position.y = 4.4;
      mediumFoliage.isVisible = false;
      mediumFoliage.isPickable = false;
      mediumFoliage.checkCollisions = false;

      const mediumCrown = BABYLON.MeshBuilder.CreateSphere("treePrototype-lod-crown", {
         diameterX: 2.4,
         diameterY: 2.5,
         diameterZ: 2.4,
         segments: 1
      }, scene);
      mediumCrown.material = leavesMat;
      mediumCrown.position.y = 5.8;
      mediumCrown.isVisible = false;
      mediumCrown.isPickable = false;
      mediumCrown.checkCollisions = false;

      const billboard = BABYLON.MeshBuilder.CreatePlane("treePrototype-lod-billboard", {
         width: 3.8,
         height: 6.2,
         sideOrientation: BABYLON.Mesh.DOUBLESIDE
      }, scene);
      billboard.material = billboardMat;
      billboard.position.y = 4.8;
      billboard.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_Y;
      billboard.isVisible = false;
      billboard.isPickable = false;
      billboard.checkCollisions = false;

      TREE_PROTOTYPES.trunk = trunk;
      TREE_PROTOTYPES.foliage = foliage;
      TREE_PROTOTYPES.crown = crown;
      TREE_PROTOTYPES.mediumTrunk = mediumTrunk;
      TREE_PROTOTYPES.mediumFoliage = mediumFoliage;
      TREE_PROTOTYPES.mediumCrown = mediumCrown;
      TREE_PROTOTYPES.billboard = billboard;

      return TREE_PROTOTYPES;
   }

   const GameSettings = {
      getTerrainSettings() {
         const settings = environment.terrainSettings || normalizeTerrainSettings();
         return { ...settings, depthThresholds: { ...settings.depthThresholds } };
      },
      setTerrainSettings(update) {
         const current = environment.terrainSettings || normalizeTerrainSettings();
         const thresholds = update?.depthThresholds
            ? normalizeDepthThresholds({ ...current.depthThresholds, ...update.depthThresholds }, current.depthThresholds)
            : { ...current.depthThresholds };
         const merged = normalizeTerrainSettings({ ...current, ...update, depthThresholds: thresholds });
         const cloned = { ...merged, depthThresholds: { ...merged.depthThresholds } };
         environment.terrainSettings = cloned;
         saveTerrainSettings(cloned);
         if (environment.terrain) {
            const terrainSettings = { ...cloned, depthThresholds: { ...cloned.depthThresholds } };
            environment.terrain.settings = terrainSettings;
            environment.terrain.depthThresholds = { ...cloned.depthThresholds };
            const terrainApi = getTerrainApi();
            if (terrainApi?.setDepthThresholds) {
               try { terrainApi.setDepthThresholds(cloned.depthThresholds); } catch (err) {
                  console.warn("[Terrain] Failed to apply updated depth thresholds", err);
               }
            }
            initializeTerrainStreaming(environment.terrain, terrainSettings, { preserveOverride: true });
         }
         return { ...cloned, depthThresholds: { ...cloned.depthThresholds } };
      },
      resetTerrainSettings() {
         const merged = normalizeTerrainSettings(defaultTerrainSettings);
         const cloned = { ...merged, depthThresholds: { ...merged.depthThresholds } };
         environment.terrainSettings = cloned;
         saveTerrainSettings(cloned);
         if (environment.terrain) {
            const terrainSettings = { ...cloned, depthThresholds: { ...cloned.depthThresholds } };
            environment.terrain.settings = terrainSettings;
            environment.terrain.depthThresholds = { ...cloned.depthThresholds };
            const terrainApi = getTerrainApi();
            if (terrainApi?.setDepthThresholds) {
               try { terrainApi.setDepthThresholds(cloned.depthThresholds); } catch (err) {
                  console.warn("[Terrain] Failed to reset depth thresholds", err);
               }
            }
            initializeTerrainStreaming(environment.terrain, terrainSettings, { preserveOverride: true, forceRebuild: true });
         }
         return { ...cloned, depthThresholds: { ...cloned.depthThresholds } };
      }
   };
   const SKY_RADIUS = 420;
   const VEC3_UP = new BABYLON.Vector3(0, 1, 0);
   const VEC3_DOWN = new BABYLON.Vector3(0, -1, 0);
   const GROUND_STICK_THRESHOLD = 0.35;
   const FOOT_CLEARANCE = 0.012;
   const ROOT_GROUND_SAMPLE_INTERVAL = 6;
   const ROOT_GROUND_MAX_OFFSET = 0.45;
   const ROOT_GROUND_LERP = 0.18;
   const IK_POS_EPS = 1e-4;
   const IK_ROT_EPS = 0.0015;
   const IK_IDLE_FRAME_LIMIT = 3;
   const TMP_PLAYER_MOVE_DIR = new BABYLON.Vector3();
   const TMP_PLAYER_MOVE_VEC = new BABYLON.Vector3();
   const TMP_PLAYER_MOTION = new BABYLON.Vector3();
   const TMP_PLAYER_DELTA = new BABYLON.Vector3();
   const TMP_ENEMY_TO_PLAYER = new BABYLON.Vector3();
   const TMP_ENEMY_DELTA = new BABYLON.Vector3();
   const TMP_REAR_DIR = new BABYLON.Vector3();
   const TMP_REAR_TARGET = new BABYLON.Vector3();
   const TMP_IK_DELTA = new BABYLON.Vector3();
   const TMP_IK_ORIGIN = new BABYLON.Vector3();
   const lerp = (a, b, t) => a + (b - a) * t;
   const ENEMY_ACTIVE_RADIUS = 42;
   const ENEMY_RENDER_RADIUS = 60;
   const ENEMY_ACTIVE_RADIUS_SQ = ENEMY_ACTIVE_RADIUS * ENEMY_ACTIVE_RADIUS;
   const ENEMY_RENDER_RADIUS_SQ = ENEMY_RENDER_RADIUS * ENEMY_RENDER_RADIUS;
   const SIM_BEHAVIOR_SLEEP = "sleep";
   const SIM_BEHAVIOR_DESPAWN = "despawn";
   const SIM_STATE_ACTIVE = "active";
   const SIM_STATE_SLEEPING = "sleeping";
   const SIM_STATE_DESPAWNED = "despawned";
   const simulationBubble = {
      radius: ENEMY_ACTIVE_RADIUS,
      sleepBuffer: 12,
      wakeBuffer: 8,
      cullBuffer: 140,
      maxRadius: 420,
      defaultBehavior: SIM_BEHAVIOR_SLEEP,
      behaviors: new Map(),
      derived: {}
   };
   const defaultSimulationBehaviorSeeds = [
      ["ambient", SIM_BEHAVIOR_DESPAWN],
      ["wildlife", SIM_BEHAVIOR_DESPAWN],
      ["minion", SIM_BEHAVIOR_DESPAWN],
      ["summon", SIM_BEHAVIOR_DESPAWN],
      ["trash", SIM_BEHAVIOR_DESPAWN],
      ["elite", SIM_BEHAVIOR_SLEEP],
      ["boss", SIM_BEHAVIOR_SLEEP]
   ];
   for (const [key, behavior] of defaultSimulationBehaviorSeeds) {
      simulationBubble.behaviors.set(key.toLowerCase(), behavior);
   }

   function normalizeSimBehavior(value) {
      if (typeof value !== "string") return null;
      const key = value.trim().toLowerCase();
      if (!key) return null;
      if (key === SIM_BEHAVIOR_SLEEP || key === "sleeping" || key === "idle") return SIM_BEHAVIOR_SLEEP;
      if (key === SIM_BEHAVIOR_DESPAWN || key === "cull" || key === "remove") return SIM_BEHAVIOR_DESPAWN;
      return null;
   }

   function updateSimulationBubbleDerived() {
      const radius = clamp(Number.isFinite(simulationBubble.radius) ? simulationBubble.radius : ENEMY_ACTIVE_RADIUS, 8, simulationBubble.maxRadius);
      simulationBubble.radius = radius;
      const sleepBuffer = Math.max(0, Number.isFinite(simulationBubble.sleepBuffer) ? simulationBubble.sleepBuffer : 0);
      const wakeBufferRaw = Math.max(0, Number.isFinite(simulationBubble.wakeBuffer) ? simulationBubble.wakeBuffer : 0);
      const cullBuffer = Math.max(0, Number.isFinite(simulationBubble.cullBuffer) ? simulationBubble.cullBuffer : 0);
      const wakeRadius = Math.max(4, radius - Math.min(radius - 4, wakeBufferRaw));
      const sleepRadius = Math.min(simulationBubble.maxRadius, radius + sleepBuffer);
      const cullRadius = Math.min(simulationBubble.maxRadius, Math.max(sleepRadius + 12, radius + cullBuffer));
      const renderRadius = Math.min(simulationBubble.maxRadius, Math.max(ENEMY_RENDER_RADIUS, sleepRadius + 6));
      simulationBubble.derived = {
         radius,
         radiusSq: radius * radius,
         wakeRadius,
         wakeRadiusSq: wakeRadius * wakeRadius,
         sleepRadius,
         sleepRadiusSq: sleepRadius * sleepRadius,
         cullRadius,
         cullRadiusSq: cullRadius * cullRadius,
         renderRadius,
         renderRadiusSq: renderRadius * renderRadius
      };
   }

   function resolveSimulationBehavior(enemy, plan) {
      if (!enemy) return simulationBubble.defaultBehavior;
      const meta = plan?.meta ?? enemy.profileMeta ?? {};
      const role = plan?.role ?? enemy.profileRole ?? meta?.role ?? null;
      if (plan?.role && typeof plan.role === "string") {
         enemy.profileRole = plan.role;
      }
      let raw = null;
      const simSpec = meta?.simulation ?? meta?.simBubble ?? meta?.bubble ?? null;
      if (typeof simSpec === "string") {
         raw = simSpec;
      } else if (simSpec && typeof simSpec === "object") {
         if (typeof simSpec.behavior === "string") raw = simSpec.behavior;
         else if (typeof simSpec.mode === "string") raw = simSpec.mode;
         else if (typeof simSpec.type === "string") raw = simSpec.type;
      }
      if (!raw && typeof meta?.simulationBehavior === "string") raw = meta.simulationBehavior;
      if (!raw && typeof meta?.despawn === "boolean") raw = meta.despawn ? SIM_BEHAVIOR_DESPAWN : SIM_BEHAVIOR_SLEEP;
      if (!raw && typeof meta?.despawnWhenFar === "boolean") raw = meta.despawnWhenFar ? SIM_BEHAVIOR_DESPAWN : SIM_BEHAVIOR_SLEEP;
      if (!raw && typeof meta?.persistent === "boolean" && meta.persistent === false) raw = SIM_BEHAVIOR_DESPAWN;
      if (!raw && (meta?.ambient || meta?.ephemeral)) raw = SIM_BEHAVIOR_DESPAWN;
      const lookupKeys = [];
      if (typeof role === "string") lookupKeys.push(role);
      if (meta && typeof meta.type === "string") lookupKeys.push(meta.type);
      if (meta && typeof meta.category === "string") lookupKeys.push(meta.category);
      if (typeof enemy.profileId === "string") lookupKeys.push(enemy.profileId);
      if (typeof enemy.nenArchetype === "string") lookupKeys.push(enemy.nenArchetype);
      for (const key of lookupKeys) {
         if (!key) continue;
         const normalizedKey = String(key).toLowerCase();
         if (simulationBubble.behaviors.has(normalizedKey)) {
            raw = simulationBubble.behaviors.get(normalizedKey);
            break;
         }
      }
      const normalized = normalizeSimBehavior(raw);
      return normalized || simulationBubble.defaultBehavior;
   }

   function ensureEnemySimulationHandle(enemy, plan) {
      if (!enemy) return null;
      const sim = enemy.__sim || (enemy.__sim = { state: SIM_STATE_ACTIVE, lastStateChange: nowMs() });
      if (!sim.state) {
         sim.state = SIM_STATE_ACTIVE;
      }
      if (!Number.isFinite(sim.lastStateChange)) {
         sim.lastStateChange = nowMs();
      }
      const behavior = resolveSimulationBehavior(enemy, plan);
      if (!sim.behavior || sim.behavior !== behavior) {
         sim.behavior = behavior;
      }
      return sim;
   }

   function configureEnemyForSimulation(enemy, plan) {
      if (!enemy) return null;
      const sim = ensureEnemySimulationHandle(enemy, plan);
      if (sim) {
         sim.state = SIM_STATE_ACTIVE;
         sim.sleepAnchor = null;
         sim.lastStateChange = nowMs();
      }
      return sim;
   }

   function refreshEnemySimulationAssignments() {
      const stamp = nowMs();
      enemies.forEach(enemy => {
         if (!enemy) return;
         const sim = ensureEnemySimulationHandle(enemy, null);
         if (sim && !Number.isFinite(sim.lastStateChange)) {
            sim.lastStateChange = stamp;
         }
      });
   }

   function getSimulationBubble() {
      const overrides = {};
      simulationBubble.behaviors.forEach((behavior, key) => {
         overrides[key] = behavior;
      });
      return {
         radius: simulationBubble.radius,
         sleepBuffer: simulationBubble.sleepBuffer,
         wakeBuffer: simulationBubble.wakeBuffer,
         cullBuffer: simulationBubble.cullBuffer,
         defaultBehavior: simulationBubble.defaultBehavior,
         derived: { ...simulationBubble.derived },
         overrides
      };
   }

   function configureSimulationBubble(config = {}) {
      if (!config || typeof config !== "object") config = {};
      let changed = false;
      if (Number.isFinite(config.radius)) {
         const next = clamp(config.radius, 8, simulationBubble.maxRadius);
         if (next !== simulationBubble.radius) {
            simulationBubble.radius = next;
            changed = true;
         }
      }
      if (Number.isFinite(config.sleepBuffer)) {
         const next = Math.max(0, config.sleepBuffer);
         if (next !== simulationBubble.sleepBuffer) {
            simulationBubble.sleepBuffer = next;
            changed = true;
         }
      }
      if (Number.isFinite(config.wakeBuffer)) {
         const next = Math.max(0, config.wakeBuffer);
         if (next !== simulationBubble.wakeBuffer) {
            simulationBubble.wakeBuffer = next;
            changed = true;
         }
      }
      if (Number.isFinite(config.cullBuffer)) {
         const next = Math.max(0, config.cullBuffer);
         if (next !== simulationBubble.cullBuffer) {
            simulationBubble.cullBuffer = next;
            changed = true;
         }
      }
      if (typeof config.defaultBehavior === "string") {
         const normalized = normalizeSimBehavior(config.defaultBehavior);
         if (normalized && normalized !== simulationBubble.defaultBehavior) {
            simulationBubble.defaultBehavior = normalized;
            changed = true;
         }
      }
      if (config.behaviors && typeof config.behaviors === "object") {
         for (const [key, value] of Object.entries(config.behaviors)) {
            if (typeof key !== "string") continue;
            const normalizedKey = key.trim().toLowerCase();
            if (!normalizedKey) continue;
            const normalized = normalizeSimBehavior(value);
            if (!normalized) {
               if (simulationBubble.behaviors.delete(normalizedKey)) changed = true;
            } else if (simulationBubble.behaviors.get(normalizedKey) !== normalized) {
               simulationBubble.behaviors.set(normalizedKey, normalized);
               changed = true;
            }
         }
      }
      updateSimulationBubbleDerived();
      if (changed) {
         refreshEnemySimulationAssignments();
      }
      return getSimulationBubble();
   }

   function setSimulationBehaviorOverride(key, behavior) {
      if (typeof key !== "string") return getSimulationBubble();
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey) return getSimulationBubble();
      const normalized = normalizeSimBehavior(behavior);
      let changed = false;
      if (!normalized) {
         changed = simulationBubble.behaviors.delete(normalizedKey);
      } else if (simulationBubble.behaviors.get(normalizedKey) !== normalized) {
         simulationBubble.behaviors.set(normalizedKey, normalized);
         changed = true;
      }
      if (changed) {
         refreshEnemySimulationAssignments();
      }
      return getSimulationBubble();
   }

   updateSimulationBubbleDerived();
   refreshEnemySimulationAssignments();
   const BLOODLUST_CONE_COS = Math.cos(Math.PI / 4);
   const BLOODLUST_RANGE_SQ = 16 * 16;
   const BLOODLUST_WEAK_HP = 55;

   function isGroundMesh(mesh) {
      if (!mesh || typeof mesh.isDisposed === "function" && mesh.isDisposed()) return false;
      if (typeof mesh.isEnabled === "function" && !mesh.isEnabled()) return false;
      const meta = mesh.metadata;
      if (meta?.terrainBlock && !meta.terrainBlock.destroyed) return true;
      if (meta?.terrainUnified) return true;
      const worldUtils = window.WorldUtils;
      if (worldUtils?.isUnifiedTerrainActive?.() && typeof worldUtils.getUnifiedTerrainMesh === "function") {
         const unifiedMesh = worldUtils.getUnifiedTerrainMesh();
         if (unifiedMesh && mesh === unifiedMesh) {
            const disposed = typeof unifiedMesh.isDisposed === "function" ? unifiedMesh.isDisposed() : false;
            if (!disposed) return true;
         }
      }
      return world.platforms.includes(mesh);
   }

   function isTreeMesh(mesh) {
      if (!mesh || typeof mesh.isDisposed === "function" && mesh.isDisposed()) return false;
      const entry = mesh.metadata?.treePart;
      return !!entry && !entry.destroyed;
   }

   function isGroundOrTreeMesh(mesh) {
      return isGroundMesh(mesh) || isTreeMesh(mesh);
   }

   function resolveGrounding(mesh, velY) {
      if (!scene || !mesh || mesh.isDisposed()) {
         return {
            grounded: false,
            correction: 0,
            normal: VEC3_UP,
            distance: Infinity,
            hitPointY: -Infinity
         };
      }
      mesh.computeWorldMatrix(true);
      const boundingInfo = mesh.getBoundingInfo();
      boundingInfo.update(mesh.getWorldMatrix());
      const groundY = getTerrainHeight(mesh.position.x, mesh.position.z);
      if (groundY === null) {
         return {
            grounded: false,
            correction: 0,
            normal: VEC3_UP,
            distance: Infinity,
            hitPointY: -Infinity
         };
      }
      const bottom = boundingInfo.boundingBox.minimumWorld.y;
      const distToGround = bottom - groundY;
      const grounded = velY <= 0.4 && distToGround <= GROUND_STICK_THRESHOLD;
      const desiredMin = groundY + FOOT_CLEARANCE;
      const correction = grounded ? Math.max(0, desiredMin - bottom) : 0;
      return {
         grounded,
         correction,
         normal: VEC3_UP,
         distance: distToGround,
         hitPointY: groundY
      };
   }

   function sampleRootGroundOffset(rootMesh) {
      if (!scene || !rootMesh) return 0;
      const meta = rootMesh.metadata;
      const footIK = meta?.footIK;
      if (!footIK) return 0;
      const feet = [footIK.left, footIK.right];
      let hasSample = false;
      let maxOffset = -Infinity;
      let minOffset = Infinity;
      for (const foot of feet) {
         if (!foot || !foot.mesh) continue;
         foot.mesh.computeWorldMatrix(true);
         const info = foot.mesh.getBoundingInfo();
         info.update(foot.mesh.getWorldMatrix());
         const bottom = info.boundingBox.minimumWorld.y;
         const center = info.boundingBox.centerWorld;
         const groundY = getTerrainHeight(center.x, center.z);
         if (groundY === null) continue;
         const clearance = Number.isFinite(foot.clearance) ? foot.clearance : FOOT_CLEARANCE;
         const desired = groundY + clearance;
         const delta = desired - bottom;
         if (delta > maxOffset) maxOffset = delta;
         if (delta < minOffset) minOffset = delta;
         hasSample = true;
      }
      if (!hasSample) return 0;
      const offset = maxOffset > 0 ? maxOffset : minOffset;
      const clampMin = -ROOT_GROUND_MAX_OFFSET;
      const clampMax = ROOT_GROUND_MAX_OFFSET;
      return Math.max(clampMin, Math.min(clampMax, offset));
   }

   function applyFootIK(rootMesh, grounded) {
      if (!rootMesh || !scene) return;
      const meta = rootMesh.metadata;
      if (!meta || !meta.footIK) return;
      let ikState = meta._ikState;
      if (!ikState) {
         ikState = {
            pos: rootMesh.position.clone(),
            yaw: rootMesh.rotation.y,
            grounded,
            idleFrames: 0
         };
         meta._ikState = ikState;
      }
      let skipIK = false;
      if (grounded && ikState.grounded) {
         TMP_IK_DELTA.copyFrom(rootMesh.position);
         TMP_IK_DELTA.subtractInPlace(ikState.pos);
         TMP_IK_DELTA.y = 0;
         const movedSq = TMP_IK_DELTA.lengthSquared();
         const rotDelta = Math.abs(rootMesh.rotation.y - ikState.yaw);
         if (movedSq < IK_POS_EPS && rotDelta < IK_ROT_EPS) {
            if (ikState.idleFrames < IK_IDLE_FRAME_LIMIT) {
               ikState.idleFrames++;
               skipIK = true;
            } else {
               ikState.idleFrames = 0;
            }
         } else {
            ikState.idleFrames = 0;
         }
      } else {
         ikState.idleFrames = 0;
      }
      if (skipIK) {
         ikState.pos.copyFrom(rootMesh.position);
         ikState.yaw = rootMesh.rotation.y;
         ikState.grounded = grounded;
         return;
      }
      ikState.pos.copyFrom(rootMesh.position);
      ikState.yaw = rootMesh.rotation.y;
      ikState.grounded = grounded;
      ikState.idleFrames = 0;
      const feet = [meta.footIK.left, meta.footIK.right];
      for (const foot of feet) {
         if (!foot || !foot.pivot || !foot.mesh) continue;
         const pivot = foot.pivot;
         const baseRotX = pivot.rotation.x;
         const baseRotZ = pivot.rotation.z;
         pivot.position.copyFrom(foot.restPos);
         if (!grounded) {
            const euler = getNodeEuler(pivot);
            euler.x = baseRotX;
            euler.z = baseRotZ;
            setNodeEuler(pivot, euler);
            continue;
         }
         foot.mesh.computeWorldMatrix(true);
         const bInfo = foot.mesh.getBoundingInfo();
         bInfo.update(foot.mesh.getWorldMatrix());
         const bottomY = bInfo.boundingBox.minimumWorld.y;
         const center = bInfo.boundingBox.centerWorld;
         TMP_IK_ORIGIN.set(center.x, center.y + foot.castUp, center.z);
         const pick = scene.pickWithRay(new BABYLON.Ray(TMP_IK_ORIGIN, VEC3_DOWN, foot.castUp + foot.maxDrop), isGroundMesh);
         if (!pick || !pick.hit) {
            const euler = getNodeEuler(pivot);
            euler.x = baseRotX;
            euler.z = baseRotZ;
            setNodeEuler(pivot, euler);
            continue;
         }
         const gap = bottomY - pick.pickedPoint.y;
         if (gap > foot.contactThreshold) {
            const euler = getNodeEuler(pivot);
            euler.x = baseRotX;
            euler.z = baseRotZ;
            setNodeEuler(pivot, euler);
            continue;
         }
         const desiredMin = pick.pickedPoint.y + foot.clearance;
         const lift = desiredMin - bottomY;
         if (lift > 0) {
            pivot.position.y += Math.min(lift, foot.maxLift);
         }
         const normal = pick.getNormal(true) || VEC3_UP;
         const tiltX = Math.atan2(normal.z, normal.y);
         const tiltZ = -Math.atan2(normal.x, normal.y);
         const euler = getNodeEuler(pivot);
         euler.x = baseRotX + tiltX;
         euler.z = baseRotZ + tiltZ;
         setNodeEuler(pivot, euler);
      }
   }

   function getCurrentDayPhase() {
      if (typeof Date !== "function") return 0;
      const now = new Date();
      const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
      return (seconds % 86400) / 86400;
   }

   function reseedEnvironment() {
      environment.seed = Math.random() * 1000 + (Date.now() % 1000) * 0.001;
      environment.time = environment.dayLength * getCurrentDayPhase();
   }

   function saveTerrainSettings(settings) {
      if (typeof localStorage === "undefined") return;
      try {
         localStorage.setItem(TERRAIN_SETTINGS_KEY, JSON.stringify(settings));
      } catch (err) {}
   }

   function ensureTerrainMaterial(scene) {
      const existingMaterial = terrainTextureState.material;
      const isExistingDisposed = typeof existingMaterial?.isDisposed === "function"
         ? existingMaterial.isDisposed()
         : existingMaterial?.isDisposed;

      if (existingMaterial && !isExistingDisposed) {
         environment.terrainMaterial = terrainTextureState.material;
         if (!terrainTextureState.compressedReady && !terrainTextureState.compressedLoading) {
            maybeLoadCompressedTerrainAtlas(scene);
         }
         return {
            material: terrainTextureState.material,
            rects: terrainTextureState.atlasRects
         };
      }

      const atlas = createDynamicTerrainAtlas(scene);
      terrainTextureState.diffuseTexture = atlas.texture;
      terrainTextureState.atlasRects = atlas.rects;

      const sharedMaterial = new BABYLON.StandardMaterial("terrainSharedMat", scene);
      sharedMaterial.diffuseTexture = atlas.texture;
      sharedMaterial.specularColor = BABYLON.Color3.Black();
      sharedMaterial.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.32);
      sharedMaterial.useGlossinessFromSpecularMapAlpha = false;
      configureAtlasTexture(atlas.texture);

      terrainTextureState.material = sharedMaterial;
      environment.terrainMaterial = sharedMaterial;
      environment.terrainAtlas = terrainTextureState;

      maybeLoadCompressedTerrainAtlas(scene);

      return {
         material: sharedMaterial,
         rects: terrainTextureState.atlasRects
      };
   }
	// Precompile terrain layer materials for smooth startup.
	// Call: await precompileTerrainMaterials(scene) after createTerrain(scene) and before mass instancing (trees, etc).
	async function precompileTerrainMaterials(scene) {
	  const terrain = environment.terrain;
	  if (!terrain || !terrain.layerTemplates) return;
	  const tasks = [];
	  for (const tpl of terrain.layerTemplates) {
		if (tpl && tpl.material && typeof tpl.material.forceCompilationAsync === "function") {
		  tasks.push(tpl.material.forceCompilationAsync(tpl));
		}
	  }
	  try { await Promise.all(tasks); } catch (e) { /* ignore compilation errors */ }
	}

       function disposeTerrain() {
         const terrain = environment.terrain;
         if (!terrain) return;

         resetTerrainHeightSampler(terrain);
         clearTrees();

         // 1) Dispose all block instances in columns (if present)
         if (terrain.columns) {
		for (const column of terrain.columns) {
		  if (!column) continue;
		  for (const block of column) {
			if (block && !block.isDisposed()) {
			  try { block.dispose(); } catch (e) { /* ignore */ }
			}
		  }
		}
	  }

	  // 2) Dispose per-layer templates if they exist (usually parented to root)
         if (terrain.layerTemplates) {
                for (const tpl of terrain.layerTemplates) {
                  if (tpl && !tpl.isDisposed()) {
                        try { tpl.dispose(); } catch (e) { /* ignore */ }
                  }
                }
         }

         // 3) Dispose the terrain root (recursively) to catch any remaining children
         if (terrain.root && !terrain.root.isDisposed?.()) {
                try { terrain.root.dispose(false); } catch (e) { /* ignore */ }
         }

         if (terrain.streaming) {
                if (Array.isArray(terrain.streaming.queue)) terrain.streaming.queue.length = 0;
                if (terrain.streaming.queueMap?.clear) terrain.streaming.queueMap.clear();
         }

         const terrainApi = getTerrainApi();
         if (terrainApi && typeof terrainApi.dispose === "function") {
                try { terrainApi.dispose(); } catch (err) {
                  console.warn("[Terrain] Failed to dispose unified mesh", err);
                }
         }

         // 4) Clear references
         environment.terrain = null;
         world.ground = null;
       }


	function createTerrain(scene) {
	  disposeTerrain();

          const settings = environment.terrainSettings = normalizeTerrainSettings(environment.terrainSettings);
          saveTerrainSettings({ ...settings, depthThresholds: { ...settings.depthThresholds } });

          const {
             length: rawLength,
             width: rawWidth,
             cubeSize,
             layers
          } = settings;
          const length = Number.isFinite(rawLength) ? Math.max(1, Math.round(rawLength)) : defaultTerrainSettings.length;
          const width = Number.isFinite(rawWidth) ? Math.max(1, Math.round(rawWidth)) : defaultTerrainSettings.width;

          const layerThicknesses = new Array(layers);
          const layerOffsets = new Array(layers);
          let totalLayerHeight = 0;
          for (let layer = 0; layer < layers; layer++) {
                const def = TERRAIN_LAYER_DEFS[layer] || {};
                const thickness = cubeSize * (def.thickness ?? 1);
                layerOffsets[layer] = totalLayerHeight;
                layerThicknesses[layer] = thickness;
                totalLayerHeight += thickness;
          }

          const totalWidth = length * cubeSize;
          const totalDepth = width * cubeSize;
          world.size = Math.max(totalWidth, totalDepth);

          const halfX = totalWidth * 0.5;
          const halfZ = totalDepth * 0.5;
          const baseY = -totalLayerHeight;

          const root = new BABYLON.TransformNode("terrainRoot", scene);

          // Column arrays
          const columns = new Array(length * width);
          const heights = new Float32Array(length * width);
          const columnStates = new Array(length * width).fill(false);
          const centers = new Array(length * width);

          const { material: terrainMaterial, rects: atlasRects } = ensureTerrainMaterial(scene);
          const defaultRect = atlasRects && atlasRects.length ? atlasRects[0] : { u0: 0, v0: 0, u1: 1, v1: 1 };

          const layerTemplates = [];
          for (let layer = 0; layer < layers; layer++) {
                const rect = atlasRects && atlasRects[layer] ? atlasRects[layer] : defaultRect;
                const faceUV = Array.from({ length: 6 }, () => new BABYLON.Vector4(rect.u0, rect.v0, rect.u1, rect.v1));
                const template = BABYLON.MeshBuilder.CreateBox(`terrainCubeTemplate_L${layer}`, {
                      width: cubeSize,
                      depth: cubeSize,
                      height: layerThicknesses[layer],
                      faceUV
                }, scene);
                template.parent = root;
                template.material = terrainMaterial;

                // Behavior flags to match the previous template
                template.isVisible = false;          // hide the template
                template.isPickable = false;
                template.checkCollisions = true;

		// Keep the template around (DO NOT dispose), but disable its own rendering
		template.setEnabled(false);

		layerTemplates[layer] = template;
	  }

	  // Build grid of columns
	  for (let z = 0; z < width; z++) {
		for (let x = 0; x < length; x++) {
                  const idx = z * length + x;
                  const column = new Array(layers);
                  columns[idx] = column;
                  heights[idx] = totalLayerHeight;

                  const worldX = -halfX + (x + 0.5) * cubeSize;
                  const worldZ = -halfZ + (z + 0.5) * cubeSize;
                  centers[idx] = { x: worldX, z: worldZ };

                  for (let layer = 0; layer < layers; layer++) {
                        // Create instance from the *layer's* template
                        const source = layerTemplates[layer];
                        const block = source.createInstance(`terrainCube_${x}_${z}_${layer}`);
                        block.parent = root;
                        const layerHeight = layerThicknesses[layer];
                        const offsetY = layerOffsets[layer] + layerHeight * 0.5;
                        block.position.set(worldX, baseY + offsetY, worldZ);

                        // DO NOT set block.material here; instances share their source mesh's material.

                        block.metadata = {
                          terrainBlock: {
				columnIndex: idx,
				layer,
				destructible: TERRAIN_LAYER_DEFS[layer]?.destructible ?? true,
				destroyed: false
			  }
			};

			block.isPickable = true;
			block.checkCollisions = true;
			block.setEnabled(false);

			column[layer] = block;
                  }
                }
          }

          // NOTE: We intentionally DO NOT dispose the per-layer templates; they are required
          // as the source of all instances. They are hidden and disabled, parented to 'root',
          // so when 'root' is disposed in disposeTerrain(), they'll be cleaned up correctly.

          environment.terrain = {
                root,
                columns,
                heights,
                centers,
                columnStates,
                baseY,
                cubeSize,
                colsX: length,
                colsZ: width,
                halfX,
                halfZ,
                totalHeight: totalLayerHeight,
                layerOffsets,
                layerThicknesses,
                material: terrainMaterial,
                atlasRects: atlasRects?.slice() || [],
                settings: { ...settings, depthThresholds: { ...settings.depthThresholds } },
                depthThresholds: { ...settings.depthThresholds },
                streamAccumulator: 0,
                streamInterval: DEFAULT_STREAM_INTERVAL,
                bounds: { minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ },
                layerTemplates // keep a reference if other systems need access
          };
          const terrainApi = getTerrainApi();
          const useUnified = !!terrainApi && isUnifiedTerrainEnabled();
          if (terrainApi) {
                if (useUnified) {
                  const mesh = terrainApi.init({
                        scene,
                        width: totalWidth,
                        depth: totalDepth,
                        resolution: { x: length, z: width },
                        baseY,
                        parent: root,
                        material: terrainMaterial,
                        depthThresholds: settings.depthThresholds,
                        colorBlendRing: true,
                        colorBlendStrength: 0.5
                  });
                  if (mesh && typeof terrainApi.updateFromColumns === "function") {
                        terrainApi.updateFromColumns(environment.terrain);
                        const activeRegion = typeof terrainApi.getActiveRegion === "function"
                           ? terrainApi.getActiveRegion()
                           : null;
                        if (activeRegion && typeof terrainApi.setActiveRegion === "function") {
                           try { terrainApi.setActiveRegion(activeRegion); } catch (err) {
                              console.warn("[Terrain] Failed to reapply region ambient", err);
                           }
                        }
                  }
                  environment.terrain.unifiedMesh = mesh || null;
                  environment.terrain.unifiedEnabled = !!mesh;
                  world.ground = mesh || null;
                } else {
                  if (typeof terrainApi.dispose === "function") {
                        try { terrainApi.dispose(); } catch (err) {
                          console.warn("[Terrain] Failed to reset unified mesh", err);
                        }
                  }
                  environment.terrain.unifiedMesh = null;
                  environment.terrain.unifiedEnabled = false;
                  world.ground = null;
                }
          } else {
                environment.terrain.unifiedMesh = null;
                environment.terrain.unifiedEnabled = false;
                world.ground = null;
          }
          if (!environment.terrain.unifiedEnabled) {
                primeTerrainColumnsForImmediateVisibility(environment.terrain);
          }
          initializeTerrainHeightSampler(environment.terrain);
          initializeTerrainStreaming(environment.terrain, settings, { preserveOverride: true });
          updateTerrainRadiusControl();
        }


   function terrainColumnIndexFromWorld(x, z) {
      const terrain = environment.terrain;
      if (!terrain) return -1;
      const { cubeSize, colsX, colsZ, halfX, halfZ } = terrain;
      const fx = (x + halfX) / cubeSize;
      const fz = (z + halfZ) / cubeSize;
      if (fx < 0 || fz < 0 || fx >= colsX || fz >= colsZ) return -1;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      return iz * colsX + ix;
   }

   function getTerrainHeight(x, z) {
      const terrain = environment.terrain;
      if (!terrain) return null;
      const terrainApi = getTerrainApi();
      if (terrainApi && isUnifiedTerrainActive() && typeof terrainApi.sampleHeight === "function") {
         const unifiedHeight = terrainApi.sampleHeight(x, z);
         if (Number.isFinite(unifiedHeight)) return unifiedHeight;
      }
      const idx = terrainColumnIndexFromWorld(x, z);
      if (idx < 0) return null;
      const height = terrain.heights[idx];
      if (!Number.isFinite(height) || height <= 0) return terrain.baseY;
      return terrain.baseY + height;
   }

   function enableTerrainColumn(column) {
      const hideLegacy = isUnifiedTerrainActive();
      for (const block of column) {
         if (!block) continue;
         const meta = block.metadata?.terrainBlock;
         if (meta && meta.destroyed) continue;
         if (hideLegacy) {
            block.isVisible = false;
            block.visibility = 0;
            block.isPickable = false;
            block.checkCollisions = false;
            block.setEnabled(false);
         } else {
            block.visibility = 1;
            block.isVisible = true;
            block.setEnabled(true);
            block.isPickable = true;
            block.checkCollisions = true;
         }
      }
   }

   function disableTerrainColumn(column) {
      for (const block of column) {
         if (!block) continue;
         block.isVisible = false;
         block.visibility = 0;
         block.setEnabled(false);
         block.isPickable = false;
         block.checkCollisions = false;
      }
   }

   function primeTerrainColumnsForImmediateVisibility(terrain) {
      if (!terrain) return;
      const columns = terrain.columns;
      const columnStates = terrain.columnStates;
      if (!Array.isArray(columns) || !Array.isArray(columnStates)) return;
      for (let i = 0; i < columns.length; i++) {
         if (columnStates[i]) continue;
         const column = columns[i];
         if (!column) continue;
         enableTerrainColumn(column);
         setTreeColumnEnabled(i, true);
         columnStates[i] = true;
      }
      terrain.initialColumnsPrimed = true;
   }

   const STREAMING_STATES = {
      UNLOADED: "unloaded",
      LOADING: "loading",
      LOADED: "loaded",
      UNLOADING: "unloading"
   };

   function instrumentWorkerJobs(jobs) {
      if (!jobs || typeof jobs !== "object") return jobs;
      if (jobs.__hxInstrumented) return jobs;
      const originalPostJob = typeof jobs.postJob === "function" ? jobs.postJob.bind(jobs) : null;
      if (!originalPostJob) {
         jobs.__hxInstrumented = true;
         return jobs;
      }
      jobs.postJob = function instrumentedPostJob(...args) {
         const result = originalPostJob(...args);
         if (result && typeof result.then === "function") {
            workerMetrics.pending = Math.max(0, workerMetrics.pending);
            workerMetrics.pending += 1;
            const finalize = () => {
               workerMetrics.pending = Math.max(0, workerMetrics.pending - 1);
            };
            result.then(finalize, finalize);
         }
         return result;
      };
      jobs.__hxInstrumented = true;
      return jobs;
   }

   function getWorkerJobs() {
      if (!chunkWorkerEnabled) return null;
      const utils = window.WorldUtils;
      if (!utils || !utils.WorkerJobs) return null;
      return instrumentWorkerJobs(utils.WorkerJobs);
   }

   function setChunkWorkerEnabled(enabled) {
      const value = enabled !== false;
      if (chunkWorkerEnabled === value) {
         updatePerfSettings({ workerEnabled: chunkWorkerEnabled });
         return chunkWorkerEnabled;
      }
      chunkWorkerEnabled = value;
      updatePerfSettings({ workerEnabled: chunkWorkerEnabled });
      return chunkWorkerEnabled;
   }

   function isChunkWorkerEnabled() {
      return chunkWorkerEnabled;
   }

   function toUint32Array(source) {
      if (!source) return new Uint32Array(0);
      if (ArrayBuffer.isView(source)) {
         if (source instanceof Uint32Array) return source;
         const copy = new Uint32Array(source.length);
         for (let i = 0; i < source.length; i++) copy[i] = source[i];
         return copy;
      }
      if (Array.isArray(source)) {
         try { return new Uint32Array(source); } catch (err) {
            const copy = new Uint32Array(source.length);
            for (let i = 0; i < source.length; i++) copy[i] = source[i] | 0;
            return copy;
         }
      }
      const jobs = getWorkerJobs();
      if (jobs && typeof jobs.cloneToUint32 === "function") {
         const cloned = jobs.cloneToUint32(source);
         if (cloned) return cloned;
      }
      return new Uint32Array(0);
   }

   function applyChunkDescriptor(streaming, descriptor, terrain) {
      if (!streaming || !descriptor || !terrain) return false;
      const chunkSize = Math.max(1, descriptor.chunkSize | 0 || streaming.chunkSize || 1);
      const chunkCountX = Math.max(1, descriptor.chunkCountX | 0 || 1);
      const chunkCountZ = Math.max(1, descriptor.chunkCountZ | 0 || 1);
      const list = Array.isArray(descriptor.chunks) ? descriptor.chunks : [];
      const normalized = new Array(list.length);
      for (let i = 0; i < list.length; i++) {
         const src = list[i];
         if (!src) {
            normalized[i] = null;
            continue;
         }
         const indices = toUint32Array(src.columnIndices);
         const chunk = {
            index: Number.isFinite(src.index) ? src.index : i,
            chunkX: Number.isFinite(src.chunkX) ? src.chunkX : Math.floor((src.startX ?? 0) / chunkSize),
            chunkZ: Number.isFinite(src.chunkZ) ? src.chunkZ : Math.floor((src.startZ ?? 0) / chunkSize),
            startX: src.startX ?? 0,
            startZ: src.startZ ?? 0,
            spanX: src.spanX ?? chunkSize,
            spanZ: src.spanZ ?? chunkSize,
            columnIndices: indices,
            center: {
               x: src.center?.x ?? src.centerX ?? 0,
               z: src.center?.z ?? src.centerZ ?? 0
            },
            bounds: {
               minX: src.bounds?.minX ?? src.minX ?? 0,
               maxX: src.bounds?.maxX ?? src.maxX ?? 0,
               minZ: src.bounds?.minZ ?? src.minZ ?? 0,
               maxZ: src.bounds?.maxZ ?? src.maxZ ?? 0
            },
            state: STREAMING_STATES.UNLOADED,
            pendingKey: null
         };
         const states = terrain.columnStates;
         if (Array.isArray(states)) {
            for (let k = 0; k < indices.length; k++) {
               if (states[indices[k]]) {
                  chunk.state = STREAMING_STATES.LOADED;
                  break;
               }
            }
         }
         normalized[i] = chunk;
      }
      streaming.chunkSize = chunkSize;
      streaming.chunkWorldSize = terrain.cubeSize * chunkSize;
      streaming.chunkCountX = chunkCountX;
      streaming.chunkCountZ = chunkCountZ;
      streaming.chunks = normalized;
      terrain.chunkSize = chunkSize;
      terrain.chunkWorldSize = streaming.chunkWorldSize;
      terrain.chunkCountX = chunkCountX;
      terrain.chunkCountZ = chunkCountZ;
      return true;
   }

   function clampStreamingRadius(streaming, radius) {
      if (!streaming) return 0;
      const min = Number.isFinite(streaming.minRadius) ? streaming.minRadius : 0;
      const max = Number.isFinite(streaming.maxRadius) ? streaming.maxRadius : radius;
      if (!Number.isFinite(radius)) return clamp(min, min, max);
      return clamp(radius, min, max);
   }

   function applyStreamingRadius(streaming) {
      if (!streaming) return 0;
      const base = clampStreamingRadius(streaming, Number.isFinite(streaming.baseRadius) ? streaming.baseRadius : streaming.defaultBaseRadius);
      streaming.baseRadius = base;
      const override = Number.isFinite(streaming.radiusOverride) ? clampStreamingRadius(streaming, streaming.radiusOverride) : null;
      const target = override ?? base;
      streaming.loadedRadius = target;
      const unload = target + streaming.padding;
      streaming.unloadRadius = unload > target ? unload : target + (streaming.innerMargin || 1);
      scheduleProfilerHudSync();
      return streaming.loadedRadius;
   }

   function buildChunkDescriptors(terrain, chunkSize) {
      if (!terrain) return { chunks: [], chunkCountX: 0, chunkCountZ: 0 };
      const colsX = Math.max(1, terrain.colsX | 0);
      const colsZ = Math.max(1, terrain.colsZ | 0);
      const chunkCountX = Math.max(1, Math.ceil(colsX / chunkSize));
      const chunkCountZ = Math.max(1, Math.ceil(colsZ / chunkSize));
      const chunks = new Array(chunkCountX * chunkCountZ);
      const cubeSize = terrain.cubeSize;
      const minWorldX = terrain.bounds?.minX ?? -terrain.halfX;
      const minWorldZ = terrain.bounds?.minZ ?? -terrain.halfZ;
      for (let cz = 0; cz < chunkCountZ; cz++) {
         for (let cx = 0; cx < chunkCountX; cx++) {
            const startX = cx * chunkSize;
            const startZ = cz * chunkSize;
            const spanX = Math.min(chunkSize, colsX - startX);
            const spanZ = Math.min(chunkSize, colsZ - startZ);
            const columnIndices = [];
            for (let dz = 0; dz < spanZ; dz++) {
               for (let dx = 0; dx < spanX; dx++) {
                  const gridX = startX + dx;
                  const gridZ = startZ + dz;
                  columnIndices.push((startZ + dz) * colsX + (startX + dx));
               }
            }
            const index = cz * chunkCountX + cx;
            const minX = minWorldX + startX * cubeSize;
            const maxX = minX + spanX * cubeSize;
            const minZ = minWorldZ + startZ * cubeSize;
            const maxZ = minZ + spanZ * cubeSize;
            const centerX = minX + (maxX - minX) * 0.5;
            const centerZ = minZ + (maxZ - minZ) * 0.5;
            chunks[index] = {
               index,
               chunkX: cx,
               chunkZ: cz,
               startX,
               startZ,
               spanX,
               spanZ,
               columnIndices,
               center: { x: centerX, z: centerZ },
               bounds: { minX, maxX, minZ, maxZ },
               state: STREAMING_STATES.UNLOADED,
               pendingKey: null
            };
         }
      }
      return { chunks, chunkCountX, chunkCountZ };
   }

   function scheduleTerrainRadiusUiUpdate() {
      if (terrainRadiusUiScheduled) return;
      terrainRadiusUiScheduled = true;
      const runner = () => {
         terrainRadiusUiScheduled = false;
         updateTerrainRadiusControl();
      };
      if (typeof requestAnimationFrame === "function") {
         requestAnimationFrame(runner);
      } else {
         setTimeout(runner, 0);
      }
   }

   function applyStoredChunkRadius(streaming = environment.terrain?.streaming) {
      if (!streaming || !streaming.ready) return;
      const desired = Number.isFinite(perfSettings.chunkRadius) ? perfSettings.chunkRadius : null;
      const currentOverride = Number.isFinite(streaming.radiusOverride) ? streaming.radiusOverride : null;
      if (desired == null) {
         if (currentOverride != null) {
            setTerrainStreamingRadius(null, { mode: "manual", forceImmediate: true });
         }
         return;
      }
      if (currentOverride != null && Math.abs(currentOverride - desired) < 0.5) return;
      setTerrainStreamingRadius(desired, { mode: "manual", forceImmediate: true });
   }

   function initializeTerrainStreaming(terrain, settings = {}, opts = {}) {
      if (!terrain) return null;
      const previous = terrain.streaming || null;
      const preserveOverride = opts.preserveOverride !== false;
      const storedOverride = Number.isFinite(perfSettings.chunkRadius) ? perfSettings.chunkRadius : null;
      const prevOverride = preserveOverride ? previous?.radiusOverride ?? null : null;
      const initialOverride = storedOverride != null ? storedOverride : prevOverride;
      const prevLastPos = previous?.lastPlayerPosition || null;
      const desiredChunk = Math.max(1, Math.round(settings?.chunkSize ?? terrain.settings?.chunkSize ?? DEFAULT_CHUNK_SIZE));
      const chunkSize = Math.max(1, Math.min(desiredChunk, Math.max(terrain.colsX, terrain.colsZ)));
      const rebuild = !previous || previous.chunkSize !== chunkSize || opts.forceRebuild;
      const padding = Number.isFinite(settings?.streamingPadding) ? settings.streamingPadding : terrain.settings?.streamingPadding ?? defaultTerrainSettings.streamingPadding;
      const streaming = {
         terrain,
         chunkSize,
         chunkCountX: 0,
         chunkCountZ: 0,
         chunks: [],
         queue: [],
         queueMap: new Map(),
         batchSize: Math.max(1, Math.round(settings?.chunkBatchSize ?? previous?.batchSize ?? DEFAULT_STREAM_BATCH)),
         budgetMs: Number.isFinite(settings?.chunkBudgetMs) ? clamp(settings.chunkBudgetMs, 0, 16) : (previous?.budgetMs ?? DEFAULT_STREAM_BUDGET_MS),
         budgetOps: Number.isFinite(settings?.chunkBudgetOps) ? Math.max(1, Math.round(settings.chunkBudgetOps)) : (previous?.budgetOps ?? DEFAULT_STREAM_BUDGET_OPS),
         interval: previous?.interval ?? DEFAULT_STREAM_INTERVAL,
         accumulator: 0,
         padding: Math.max(0, padding),
         innerMargin: Math.max(terrain.cubeSize * 0.5, 0.5),
         chunkWorldSize: terrain.cubeSize * chunkSize,
         minRadius: 0,
         maxRadius: 0,
         defaultBaseRadius: Number.isFinite(settings?.activeRadius) ? settings.activeRadius : defaultTerrainSettings.activeRadius,
         baseRadius: Number.isFinite(settings?.activeRadius) ? settings.activeRadius : defaultTerrainSettings.activeRadius,
         radiusOverride: initialOverride,
         lastPlayerPosition: prevLastPos,
         stats: { lastOps: 0 },
         ready: false,
         pendingDescriptor: null,
         descriptorVersion: (previous?.descriptorVersion || 0) + 1
      };
      streaming.minRadius = Math.max(6, streaming.chunkWorldSize * 0.75);
      const maxRadiusEstimate = Math.sqrt((terrain.halfX + streaming.padding) ** 2 + (terrain.halfZ + streaming.padding) ** 2);
      streaming.maxRadius = Math.max(streaming.minRadius, maxRadiusEstimate);
      streaming.interval = DEFAULT_STREAM_INTERVAL;
      streaming.baseRadius = clampStreamingRadius(streaming, streaming.defaultBaseRadius);
      if (Number.isFinite(streaming.radiusOverride)) {
         streaming.radiusOverride = clampStreamingRadius(streaming, streaming.radiusOverride);
      } else {
         streaming.radiusOverride = null;
      }
      applyStreamingRadius(streaming);
      terrain.streaming = streaming;
      terrain.chunkSize = chunkSize;
      terrain.chunkCountX = 0;
      terrain.chunkCountZ = 0;
      terrain.chunkWorldSize = streaming.chunkWorldSize;
      terrain.streamInterval = streaming.interval;
      terrain.streamAccumulator = 0;
      const workerJobs = getWorkerJobs();
      const adoptPrevious = !rebuild && Array.isArray(previous?.chunks) && previous.chunkCountX && previous.chunkCountZ;
      if (adoptPrevious) {
         applyChunkDescriptor(streaming, { chunkSize, chunkCountX: previous.chunkCountX, chunkCountZ: previous.chunkCountZ, chunks: previous.chunks }, terrain);
         streaming.ready = true;
         scheduleTerrainRadiusUiUpdate();
         const pos = streaming.lastPlayerPosition || previous?.lastPlayerPosition || { x: 0, z: 0 };
         refreshChunkTargets(streaming, pos, true);
         processStreamingQueue(streaming, true);
         applyStoredChunkRadius(streaming);
      } else {
         const payload = {
            colsX: Math.max(1, terrain.colsX | 0),
            colsZ: Math.max(1, terrain.colsZ | 0),
            chunkSize,
            cubeSize: terrain.cubeSize,
            minWorldX: terrain.bounds?.minX ?? -terrain.halfX,
            minWorldZ: terrain.bounds?.minZ ?? -terrain.halfZ
         };
         const integrate = (descriptor) => {
            applyChunkDescriptor(streaming, descriptor, terrain);
            streaming.ready = true;
            streaming.pendingDescriptor = null;
            scheduleTerrainRadiusUiUpdate();
            const pos = streaming.lastPlayerPosition || { x: 0, z: 0 };
            refreshChunkTargets(streaming, pos, true);
            processStreamingQueue(streaming, true);
            applyStoredChunkRadius(streaming);
         };
         const handleFallback = (err) => {
            if (err) console.warn("[Terrain] Worker chunk job failed", err);
            const descriptor = buildChunkDescriptors(terrain, chunkSize);
            integrate(descriptor);
         };
         if (workerJobs && typeof workerJobs.requestTerrainChunks === "function") {
            try {
               const version = streaming.descriptorVersion;
               const job = workerJobs.requestTerrainChunks(payload);
               if (job && typeof job.then === "function") {
                  streaming.pendingDescriptor = job;
                  if (!streaming.ready) {
                     const descriptor = buildChunkDescriptors(terrain, chunkSize);
                     integrate(descriptor);
                     streaming.pendingDescriptor = job;
                  }
                  job.then((result) => {
                     if (streaming.descriptorVersion !== version) return;
                     try {
                        integrate(result);
                     } catch (err) {
                        handleFallback(err);
                     }
                  }).catch(handleFallback);
               } else {
                  handleFallback();
               }
            } catch (err) {
               handleFallback(err);
            }
         } else {
            handleFallback();
         }
      }
      if (streaming.ready) {
         scheduleTerrainRadiusUiUpdate();
      }
      scheduleProfilerHudSync();
      return streaming;
   }

   function cancelStreamingTask(streaming, key) {
      if (!streaming?.queueMap || !key) return false;
      const task = streaming.queueMap.get(key);
      if (!task) return false;
      const idx = streaming.queue.indexOf(task);
      if (idx >= 0) streaming.queue.splice(idx, 1);
      streaming.queueMap.delete(key);
      return true;
   }

   function insertStreamingTask(streaming, task) {
      if (!streaming || !task) return null;
      if (!Array.isArray(streaming.queue)) streaming.queue = [];
      if (!streaming.queueMap) streaming.queueMap = new Map();
      if (streaming.queueMap.has(task.key)) return streaming.queueMap.get(task.key);
      let index = streaming.queue.length;
      while (index > 0 && streaming.queue[index - 1].priority < task.priority) index--;
      streaming.queue.splice(index, 0, task);
      streaming.queueMap.set(task.key, task);
      return task;
   }

   function bumpStreamingTaskPriority(streaming, key, priority) {
      if (!streaming?.queueMap || !key) return null;
      const task = streaming.queueMap.get(key);
      if (!task || task.priority >= priority) return task;
      const idx = streaming.queue.indexOf(task);
      if (idx >= 0) streaming.queue.splice(idx, 1);
      task.priority = priority;
      insertStreamingTask(streaming, task);
      return task;
   }

   function createChunkTask(streaming, chunk, mode, priority) {
      const terrain = streaming.terrain;
      const columns = terrain.columns;
      const columnStates = terrain.columnStates;
      const batchSize = Math.max(1, Math.floor(streaming.batchSize));
      return {
         key: `${mode}:${chunk.index}`,
         chunk,
         mode,
         priority,
         cursor: 0,
         step() {
            const indices = chunk.columnIndices || [];
            if (!indices.length) {
               chunk.state = mode === "load" ? STREAMING_STATES.LOADED : STREAMING_STATES.UNLOADED;
               chunk.pendingKey = null;
               return { done: true, opsUsed: 1 };
            }
            const start = this.cursor;
            const limit = Math.min(indices.length, start + batchSize);
            for (let i = start; i < limit; i++) {
               const columnIndex = indices[i];
               const column = columns[columnIndex];
               if (!column) continue;
               if (mode === "load") {
                  if (!columnStates[columnIndex]) {
                     enableTerrainColumn(column);
                     setTreeColumnEnabled(columnIndex, true);
                     columnStates[columnIndex] = true;
                  }
               } else if (columnStates[columnIndex]) {
                  disableTerrainColumn(column);
                  setTreeColumnEnabled(columnIndex, false);
                  columnStates[columnIndex] = false;
               }
            }
            this.cursor = limit;
            const done = this.cursor >= indices.length;
            if (done) {
               chunk.state = mode === "load" ? STREAMING_STATES.LOADED : STREAMING_STATES.UNLOADED;
               chunk.pendingKey = null;
            }
            return { done, opsUsed: Math.max(1, limit - start) };
         }
      };
   }

   function queueChunkLoad(streaming, chunk, opts = {}) {
      if (!streaming || !chunk) return;
      if (chunk.state === STREAMING_STATES.LOADED) return;
      const urgent = !!opts.urgent;
      const desiredPriority = urgent ? 4 : 2;
      if (chunk.state === STREAMING_STATES.LOADING) {
         if (chunk.pendingKey && urgent) bumpStreamingTaskPriority(streaming, chunk.pendingKey, desiredPriority);
         return;
      }
      if (chunk.state === STREAMING_STATES.UNLOADING && chunk.pendingKey) {
         cancelStreamingTask(streaming, chunk.pendingKey);
      }
      const task = createChunkTask(streaming, chunk, "load", desiredPriority);
      chunk.state = STREAMING_STATES.LOADING;
      chunk.pendingKey = task.key;
      insertStreamingTask(streaming, task);
   }

   function queueChunkUnload(streaming, chunk) {
      if (!streaming || !chunk) return;
      if (chunk.state === STREAMING_STATES.UNLOADED || chunk.state === STREAMING_STATES.UNLOADING) return;
      if (chunk.state === STREAMING_STATES.LOADING && chunk.pendingKey) {
         cancelStreamingTask(streaming, chunk.pendingKey);
      }
      const task = createChunkTask(streaming, chunk, "unload", 1);
      chunk.state = STREAMING_STATES.UNLOADING;
      chunk.pendingKey = task.key;
      insertStreamingTask(streaming, task);
   }

   function refreshChunkTargets(streaming, position = { x: 0, z: 0 }, force = false) {
      if (!streaming?.ready || !Array.isArray(streaming.chunks)) return;
      const px = Number.isFinite(position.x) ? position.x : 0;
      const pz = Number.isFinite(position.z) ? position.z : 0;
      const loadSq = streaming.loadedRadius * streaming.loadedRadius;
      const unloadRadius = streaming.unloadRadius;
      const unloadSq = unloadRadius * unloadRadius;
      const margin = streaming.innerMargin || 0.5;
      for (const chunk of streaming.chunks) {
         if (!chunk) continue;
         const { bounds } = chunk;
         const inside = bounds && px >= bounds.minX - margin && px <= bounds.maxX + margin && pz >= bounds.minZ - margin && pz <= bounds.maxZ + margin;
         if (inside) {
            queueChunkLoad(streaming, chunk, { urgent: true });
            continue;
         }
         const dx = chunk.center.x - px;
         const dz = chunk.center.z - pz;
         const distSq = dx * dx + dz * dz;
         if (distSq <= loadSq) {
            queueChunkLoad(streaming, chunk);
         } else if (distSq >= unloadSq || (force && distSq > loadSq)) {
            queueChunkUnload(streaming, chunk);
         }
      }
   }

   function processStreamingQueue(streaming, force = false) {
      if (!streaming?.ready || !streaming.queue?.length) {
         if (streaming?.stats) streaming.stats.lastOps = 0;
         return;
      }
      const queue = streaming.queue;
      const start = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
      const msBudget = force ? Infinity : Math.max(0, streaming.budgetMs ?? DEFAULT_STREAM_BUDGET_MS);
      const opsBudget = force ? Infinity : Math.max(1, streaming.budgetOps ?? DEFAULT_STREAM_BUDGET_OPS);
      let ops = 0;
      while (queue.length > 0) {
         if (opsBudget !== Infinity && ops >= opsBudget) break;
         if (msBudget !== Infinity) {
            const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
            if (now - start >= msBudget) break;
         }
         const task = queue[0];
         const result = task.step();
         const usedOps = result && Number.isFinite(result.opsUsed) ? result.opsUsed : 1;
         ops += usedOps;
         if (result?.done) {
            queue.shift();
            streaming.queueMap?.delete(task.key);
         } else if (queue.length > 1) {
            queue.push(queue.shift());
         }
      }
      streaming.stats.lastOps = ops;
   }

   function ensureTerrainRadiusControl() {
      const panel = document.getElementById("hud-dev-panel");
      if (!panel) {
         terrainRadiusControl = null;
         return null;
      }
      if (terrainRadiusControl?.root?.isConnected && panel.contains(terrainRadiusControl.root)) {
         return terrainRadiusControl;
      }
      const control = document.createElement("div");
      control.dataset.role = "terrain-radius";
      control.style.display = "flex";
      control.style.flexDirection = "column";
      control.style.gap = "0.3rem";
      control.style.marginTop = "0.2rem";

      const label = document.createElement("span");
      label.textContent = "Terrain Radius";
      label.style.fontSize = "0.78rem";
      label.style.opacity = "0.8";

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "0.4rem";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.style.flex = "1";

      const value = document.createElement("span");
      value.style.minWidth = "3ch";
      value.style.fontSize = "0.78rem";
      value.style.textAlign = "right";

      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "Auto";
      reset.style.padding = "0.25rem 0.4rem";
      reset.style.fontSize = "0.68rem";
      reset.style.borderRadius = "6px";
      reset.style.border = "1px solid rgba(120, 200, 255, 0.28)";
      reset.style.background = "rgba(20, 34, 50, 0.7)";
      reset.style.color = "#e4f4ff";
      reset.style.cursor = "pointer";

      wrap.appendChild(slider);
      wrap.appendChild(value);
      wrap.appendChild(reset);

      control.appendChild(label);
      control.appendChild(wrap);

      const actions = Array.from(panel.children).find(node => node.style?.gridTemplateColumns);
      if (actions) {
         panel.insertBefore(control, actions);
      } else {
         panel.appendChild(control);
      }

      const applyValue = (val) => {
         value.textContent = `${Math.round(val)}m`;
      };

      slider.addEventListener("input", () => {
         const val = Number.parseFloat(slider.value);
         if (!Number.isFinite(val)) return;
         applyValue(val);
         setTerrainStreamingRadius(val, { mode: "manual" });
      });

      reset.addEventListener("click", () => {
         const radius = setTerrainStreamingRadius(null, { mode: "manual" });
         if (Number.isFinite(radius)) {
            slider.value = `${Math.round(radius)}`;
            applyValue(radius);
         }
      });

      terrainRadiusControl = { root: control, slider, value, reset, applyValue };
      return terrainRadiusControl;
   }

   function updateTerrainRadiusControl() {
      const streaming = environment.terrain?.streaming;
      if (!streaming) {
         terrainRadiusControl = null;
         return;
      }
      const control = ensureTerrainRadiusControl();
      if (!control) return;
      const min = Math.max(4, Math.round(streaming.minRadius));
      const max = Math.max(min + 2, Math.round(streaming.maxRadius));
      control.slider.min = `${min}`;
      control.slider.max = `${max}`;
      const step = Math.max(1, Math.round((streaming.chunkWorldSize || 4) * 0.25));
      control.slider.step = `${step}`;
      control.slider.value = `${Math.round(streaming.loadedRadius)}`;
      control.applyValue?.(streaming.loadedRadius);
   }

   function setTerrainStreamingRadius(radius, opts = {}) {
      const streaming = environment.terrain?.streaming;
      if (!streaming) {
         const stored = Number.isFinite(radius) ? radius : null;
         updatePerfSettings({ chunkRadius: stored });
         return null;
      }
      const mode = opts.mode === "base" ? "base" : "manual";
      if (mode === "base") {
         const base = Number.isFinite(radius) ? clampStreamingRadius(streaming, radius) : streaming.defaultBaseRadius;
         streaming.baseRadius = clampStreamingRadius(streaming, base);
         if (opts.resetOverride) streaming.radiusOverride = null;
      } else if (Number.isFinite(radius)) {
         streaming.radiusOverride = clampStreamingRadius(streaming, radius);
      } else {
         streaming.radiusOverride = null;
      }
      applyStreamingRadius(streaming);
      const center = opts.position || streaming.lastPlayerPosition || { x: 0, z: 0 };
      refreshChunkTargets(streaming, center, true);
      processStreamingQueue(streaming, opts.forceImmediate === true);
      scheduleTerrainRadiusUiUpdate();
      scheduleProfilerHudSync();
      updatePerfSettings({
         chunkRadius: Number.isFinite(streaming.radiusOverride) ? streaming.radiusOverride : null
      });
      return streaming.loadedRadius;
   }

   function getTerrainStreamingRadius() {
      const streaming = environment.terrain?.streaming;
      if (!streaming) return null;
      return {
         radius: streaming.loadedRadius,
         base: streaming.baseRadius,
         override: Number.isFinite(streaming.radiusOverride) ? streaming.radiusOverride : null,
         padding: streaming.padding,
         min: streaming.minRadius,
         max: streaming.maxRadius
      };
   }

   function setGreedyMeshingEnabled(enabled) {
      const value = !!enabled;
      if (environment.terrainSettings) environment.terrainSettings.greedyMeshing = value;
      if (environment.terrain) environment.terrain.greedyMeshing = value;
      if (typeof window.GameSettings === "object" && window.GameSettings) {
         window.GameSettings.greedyMeshing = value;
      }
      const utilsSettings = window.WorldUtils?.GameSettings;
      if (typeof utilsSettings === "object" && utilsSettings) {
         utilsSettings.greedyMeshing = value;
      }
      scheduleProfilerHudSync();
      updatePerfSettings({ greedyMeshing: value });
      return value;
   }

   function setTerrainStreamingBudget(update = {}) {
      const streaming = environment.terrain?.streaming;
      if (!streaming) return null;
      if (typeof update.ms === "number" && update.ms >= 0) {
         streaming.budgetMs = clamp(update.ms, 0, 16);
      }
      if (typeof update.ops === "number" && update.ops > 0) {
         streaming.budgetOps = Math.max(1, Math.floor(update.ops));
      }
      if (typeof update.batchSize === "number" && update.batchSize > 0) {
         streaming.batchSize = Math.max(1, Math.floor(update.batchSize));
      }
      return { ms: streaming.budgetMs, ops: streaming.budgetOps, batchSize: streaming.batchSize };
   }

   function getTerrainStreamingStats() {
      const streaming = environment.terrain?.streaming;
      if (!streaming) return null;
      return {
         queue: streaming.queue?.length || 0,
         radius: streaming.loadedRadius,
         baseRadius: streaming.baseRadius,
         override: Number.isFinite(streaming.radiusOverride) ? streaming.radiusOverride : null,
         chunkSize: streaming.chunkSize,
         chunkCount: streaming.chunks?.length || 0,
         budgetMs: streaming.budgetMs,
         budgetOps: streaming.budgetOps,
         batchSize: streaming.batchSize,
         lastOps: streaming.stats?.lastOps || 0
      };
   }

   function updateTerrainStreaming(center, dt = 0, force = false) {
      const terrain = environment.terrain;
      if (!terrain?.streaming) return;
      const streaming = terrain.streaming;
      const target = center || BABYLON.Vector3.Zero();
      streaming.accumulator += dt;
      const px = Number.isFinite(target.x) ? target.x : 0;
      const pz = Number.isFinite(target.z) ? target.z : 0;
      streaming.lastPlayerPosition = { x: px, z: pz };
      if (!streaming.ready) return;
      const shouldRefresh = force || streaming.accumulator >= streaming.interval;
      if (shouldRefresh) {
         streaming.accumulator = 0;
         refreshChunkTargets(streaming, streaming.lastPlayerPosition, force);
      }
      processStreamingQueue(streaming, force);
   }

   function recomputeColumnHeight(column) {
      const terrain = environment.terrain;
      if (!terrain) return 0;
      let height = 0;
      for (let layer = 0; layer < column.length; layer++) {
         const block = column[layer];
         if (!block) continue;
         const meta = block.metadata?.terrainBlock;
         if (meta && !meta.destroyed) {
            const top = terrain.layerOffsets[layer] + terrain.layerThicknesses[layer];
            if (top > height) height = top;
         }
      }
      return height;
   }

   function normalizeCraterOptions(options = {}) {
      const terrain = environment.terrain;
      const cubeSize = Math.max(terrain?.cubeSize ?? 1, 0.5);
      const sourceRadius = Number.isFinite(options.radius)
         ? options.radius
         : Number.isFinite(options.sourceRadius)
            ? options.sourceRadius
            : Number.isFinite(options.scale)
               ? options.scale * cubeSize
               : undefined;
      const radius = Math.max(0.1, sourceRadius ?? cubeSize * 1.8);
      const baseStrength = Number.isFinite(options.strength)
         ? options.strength
         : Number.isFinite(options.sourceStrength)
            ? options.sourceStrength
            : radius * (Number.isFinite(options.intensity) ? options.intensity : 0.6);
      const strength = Math.max(0.05, baseStrength);
      const falloff = options.falloff === "linear" ? "linear" : "gauss";
      return { radius, strength, falloff };
   }

   function getTerrainBrushState() {
      const brush = state.terrainBrush;
      return {
         enabled: !!brush.enabled,
         radius: brush.radius,
         strength: brush.strength,
         falloff: brush.falloff,
         deferNormals: !!brush.deferNormals,
         metrics: { ...brush.lastMetrics }
      };
   }

   function syncTerrainBrushHud() {
      const hudApi = window.HUD;
      if (!hudApi?.setTerrainBrushState) return;
      hudApi.setTerrainBrushState(getTerrainBrushState());
      if (!state.terrainBrush.enabled) {
         hudApi.setDepthHudVisible?.(false);
      }
   }

   function clampTerrainBrushRadius(value) {
      const radius = Number(value);
      if (!Number.isFinite(radius)) return state.terrainBrush.radius;
      return Math.max(0.8, Math.min(12, radius));
   }

   function clampTerrainBrushStrength(value) {
      const strength = Number(value);
      if (!Number.isFinite(strength)) return state.terrainBrush.strength;
      return Math.max(0.1, Math.min(6, strength));
   }

   function setTerrainBrushEnabled(enabled) {
      state.terrainBrush.enabled = !!enabled && DEV_BUILD;
      if (!state.terrainBrush.enabled) {
         state.terrainBrush.pointerActive = false;
      }
      syncTerrainBrushHud();
      return state.terrainBrush.enabled;
   }

   function setTerrainBrushOptions(update = {}) {
      if (update.radius !== undefined) {
         state.terrainBrush.radius = clampTerrainBrushRadius(update.radius);
      }
      if (update.strength !== undefined) {
         state.terrainBrush.strength = clampTerrainBrushStrength(update.strength);
      }
      if (typeof update.falloff === "string") {
         state.terrainBrush.falloff = update.falloff === "linear" ? "linear" : "gauss";
      }
      syncTerrainBrushHud();
   }

   function setTerrainBrushDeferred(enabled) {
      state.terrainBrush.deferNormals = !!enabled;
      syncTerrainBrushHud();
   }

   function formatLayerLabel(key) {
      if (!key) return "—";
      return key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
   }

   function gatherBrushColumns(center, radius) {
      const terrain = environment.terrain;
      if (!terrain) return [];
      const colsX = terrain.colsX | 0;
      const colsZ = terrain.colsZ | 0;
      if (!colsX || !colsZ) return [];
      const cubeSize = Math.max(terrain.cubeSize || 1, 0.5);
      const minX = Math.max(-terrain.halfX, center.x - radius);
      const maxX = Math.min(terrain.halfX, center.x + radius);
      const minZ = Math.max(-terrain.halfZ, center.z - radius);
      const maxZ = Math.min(terrain.halfZ, center.z + radius);
      const startCX = Math.max(0, Math.floor((minX + terrain.halfX) / cubeSize));
      const endCX = Math.min(colsX - 1, Math.ceil((maxX + terrain.halfX) / cubeSize));
      const startCZ = Math.max(0, Math.floor((minZ + terrain.halfZ) / cubeSize));
      const endCZ = Math.min(colsZ - 1, Math.ceil((maxZ + terrain.halfZ) / cubeSize));
      const indices = [];
      for (let cz = startCZ; cz <= endCZ; cz++) {
         for (let cx = startCX; cx <= endCX; cx++) {
            indices.push(cz * colsX + cx);
         }
      }
      return indices;
   }

   function resolveColumnBounds(indices) {
      const terrain = environment.terrain;
      if (!terrain || !indices.length) return null;
      const colsX = terrain.colsX | 0;
      if (!colsX) return null;
      let minCX = Infinity;
      let maxCX = -Infinity;
      let minCZ = Infinity;
      let maxCZ = -Infinity;
      for (const idx of indices) {
         if (!Number.isInteger(idx) || idx < 0) continue;
         const cx = idx % colsX;
         const cz = Math.floor(idx / colsX);
         if (cx < minCX) minCX = cx;
         if (cx > maxCX) maxCX = cx;
         if (cz < minCZ) minCZ = cz;
         if (cz > maxCZ) maxCZ = cz;
      }
      if (!Number.isFinite(minCX) || !Number.isFinite(minCZ)) return null;
      return { minCX, maxCX, minCZ, maxCZ };
   }

   function resolveDominantLayerAt(x, z) {
      const terrain = environment.terrain;
      if (!terrain) return null;
      const idx = terrainColumnIndexFromWorld(x, z);
      if (idx < 0) return null;
      const offset = terrain.heights?.[idx] ?? terrain.totalHeight ?? 0;
      const offsets = terrain.layerOffsets || [];
      const thicknesses = terrain.layerThicknesses || [];
      for (let layer = offsets.length - 1; layer >= 0; layer--) {
         const start = offsets[layer];
         const top = start + (thicknesses[layer] ?? 0);
         if (offset > start + 1e-3) {
            const def = TERRAIN_LAYER_DEFS[layer] || {};
            return {
               key: def.key || `layer-${layer}`,
               label: formatLayerLabel(def.key || `layer ${layer}`),
               index: layer
            };
         }
         if (offset >= start) {
            const def = TERRAIN_LAYER_DEFS[layer] || {};
            return {
               key: def.key || `layer-${layer}`,
               label: formatLayerLabel(def.key || `layer ${layer}`),
               index: layer
            };
         }
      }
      return { key: "void", label: "Void", index: -1 };
   }

   function applyBrushMetrics(detail, elapsedMs) {
      const brush = state.terrainBrush;
      if (!brush) return;
      const layerInfo = resolveDominantLayerAt(detail?.worldX ?? 0, detail?.worldZ ?? 0);
      brush.lastMetrics = {
         timeMs: Number.isFinite(elapsedMs) ? elapsedMs : 0,
         verts: Number.isFinite(detail?.affected) ? detail.affected : 0,
         layer: layerInfo?.label || "—"
      };
      if (detail?.worldX != null && detail?.worldZ != null) {
         const radius = Number.isFinite(detail?.radius) ? detail.radius : brush.radius;
         const columns = gatherBrushColumns({ x: detail.worldX, z: detail.worldZ }, radius);
         brush.lastPatch = {
            center: { x: detail.worldX, z: detail.worldZ },
            radius,
            columnIndices: columns
         };
      }
      const hudApi = window.HUD;
      hudApi?.setTerrainBrushMetrics?.(brush.lastMetrics);
   }

   function resetTerrainBrushPatch() {
      const brush = state.terrainBrush;
      if (!brush?.lastPatch) return false;
      const terrain = environment.terrain;
      const terrainApi = getTerrainApi();
      if (!terrain || !terrainApi?.updateFromColumns) return false;
      const columns = Array.isArray(brush.lastPatch.columnIndices) && brush.lastPatch.columnIndices.length
         ? brush.lastPatch.columnIndices.slice()
         : gatherBrushColumns(brush.lastPatch.center, brush.lastPatch.radius);
      if (!columns.length) return false;
      const bounds = resolveColumnBounds(columns);
      const start = performance.now();
      let success = false;
      try {
         success = terrainApi.updateFromColumns(terrain, { columnIndices: columns });
      } catch (err) {
         console.warn("[Terrain] Failed to restore terrain patch", err);
         success = false;
      }
      if (!success) return false;
      if (bounds) {
         updateTerrainColumnsFromUnifiedMeshRange(terrain, bounds.minCX, bounds.maxCX, bounds.minCZ, bounds.maxCZ);
         const patch = updateTerrainSamplerForColumns(terrain, bounds.minCX, bounds.maxCX, bounds.minCZ, bounds.maxCZ, { reset: true });
         if (patch) handleTerrainPatchPhysics(patch);
      }
      const elapsed = performance.now() - start;
      const layerInfo = resolveDominantLayerAt(brush.lastPatch.center.x, brush.lastPatch.center.z);
      brush.lastMetrics = {
         timeMs: elapsed,
         verts: 0,
         layer: layerInfo?.label || "—"
      };
      const hudApi = window.HUD;
      hudApi?.setTerrainBrushMetrics?.(brush.lastMetrics);
      return true;
   }

   function buildCirclePoints(radius, segments = 72) {
      const pts = [];
      const safeRadius = Math.max(0.05, radius);
      for (let i = 0; i <= segments; i++) {
         const t = (i / segments) * Math.PI * 2;
         const x = Math.cos(t) * safeRadius;
         const z = Math.sin(t) * safeRadius;
         pts.push(new BABYLON.Vector3(x, 0.05, z));
      }
      return pts;
   }

   function ensureCullingOverlay() {
      if (!scene) return null;
      const overlay = cullingOverlayState;
      if (overlay.root) {
         const owningScene = typeof overlay.root.getScene === "function" ? overlay.root.getScene() : null;
         if (!owningScene || owningScene !== scene || overlay.root.isDisposed()) {
            try { overlay.root.dispose(); } catch (err) {}
            overlay.root = null;
            overlay.renderCircle = null;
            overlay.cullCircle = null;
            overlay.observer = null;
            overlay.lastMetrics = null;
            overlay.lastHudUpdate = 0;
            overlay.lastValues = { radius: 0, sleepRadius: 0, renderRadius: 0, cullRadius: 0 };
         }
      }
      if (!overlay.root) {
         const root = new BABYLON.TransformNode("culling-debug-root", scene);
         root.rotationQuaternion = new BABYLON.Quaternion();
         root.isPickable = false;
         root.setEnabled(false);

         const renderCircle = BABYLON.MeshBuilder.CreateLines("culling-debug-render", { points: buildCirclePoints(1) }, scene);
         renderCircle.color = new BABYLON.Color3(0.25, 0.78, 1.0);
         renderCircle.parent = root;
         renderCircle.isPickable = false;
         renderCircle.alwaysSelectAsActiveMesh = true;
         renderCircle.renderingGroupId = 1;

         const cullCircle = BABYLON.MeshBuilder.CreateLines("culling-debug-cull", { points: buildCirclePoints(1.1) }, scene);
         cullCircle.color = new BABYLON.Color3(1.0, 0.45, 0.45);
         cullCircle.parent = root;
         cullCircle.isPickable = false;
         cullCircle.alwaysSelectAsActiveMesh = true;
         cullCircle.renderingGroupId = 1;

         overlay.root = root;
         overlay.renderCircle = renderCircle;
         overlay.cullCircle = cullCircle;
         overlay.lastHudUpdate = 0;
         overlay.lastMetrics = null;
         overlay.lastValues = { radius: 0, sleepRadius: 0, renderRadius: 0, cullRadius: 0 };
      }
      return overlay;
   }

   function updateCullingOverlay() {
      if (!cullingOverlayState.enabled) return;
      const overlay = ensureCullingOverlay();
      if (!overlay || !overlay.root) return;
      if (playerRoot) {
         TMP_DEBUG_POS.copyFrom(playerRoot.position);
         TMP_DEBUG_POS.y += 0.1;
         overlay.root.position.copyFrom(TMP_DEBUG_POS);
      }
      const derived = simulationBubble.derived || {};
      const radius = Number.isFinite(derived.radius) ? derived.radius : 0;
      const sleepRadius = Number.isFinite(derived.sleepRadius) ? derived.sleepRadius : radius;
      const renderRadius = Number.isFinite(derived.renderRadius) ? derived.renderRadius : Math.max(radius, sleepRadius);
      const cullRadius = Number.isFinite(derived.cullRadius) ? derived.cullRadius : Math.max(renderRadius, sleepRadius);
      const last = overlay.lastValues;
      const changedRender = Math.abs(renderRadius - last.renderRadius) > 0.05;
      const changedCull = Math.abs(cullRadius - last.cullRadius) > 0.05;
      const changedRadius = Math.abs(radius - last.radius) > 0.05 || Math.abs(sleepRadius - last.sleepRadius) > 0.05;
      if (overlay.renderCircle && changedRender) {
         const points = buildCirclePoints(Math.max(0.25, renderRadius));
         BABYLON.MeshBuilder.CreateLines(null, { points, instance: overlay.renderCircle });
      }
      if (overlay.cullCircle && changedCull) {
         const points = buildCirclePoints(Math.max(0.3, cullRadius));
         BABYLON.MeshBuilder.CreateLines(null, { points, instance: overlay.cullCircle });
      }
      last.radius = radius;
      last.sleepRadius = sleepRadius;
      last.renderRadius = renderRadius;
      last.cullRadius = cullRadius;
      overlay.lastMetrics = { radius, sleepRadius, renderRadius, cullRadius };
      const now = Date.now();
      if (!overlay.lastHudUpdate || changedRender || changedCull || changedRadius || now - overlay.lastHudUpdate > 400) {
         overlay.lastHudUpdate = now;
         window.HUD?.setCullingOverlayState?.({ enabled: true, metrics: overlay.lastMetrics });
      }
   }

   function disableCullingOverlay() {
      const overlay = cullingOverlayState;
      overlay.enabled = false;
      if (overlay.observer && scene?.onBeforeRenderObservable) {
         try { scene.onBeforeRenderObservable.remove(overlay.observer); } catch (err) {}
      }
      overlay.observer = null;
      if (overlay.root) overlay.root.setEnabled(false);
      overlay.lastHudUpdate = 0;
      overlay.lastMetrics = null;
      overlay.lastValues = { radius: 0, sleepRadius: 0, renderRadius: 0, cullRadius: 0 };
      window.HUD?.setCullingOverlayState?.({ enabled: false, metrics: null });
   }

   function setCullingOverlayEnabled(enabled) {
      const next = !!enabled && DEV_BUILD;
      cullingOverlayState.enabled = next;
      if (!next) {
         disableCullingOverlay();
         return true;
      }
      if (!scene) {
         cullingOverlayState.enabled = false;
         disableCullingOverlay();
         return false;
      }
      const overlay = ensureCullingOverlay();
      if (!overlay?.root) {
         cullingOverlayState.enabled = false;
         disableCullingOverlay();
         return false;
      }
      overlay.root.setEnabled(true);
      if (!overlay.observer && scene?.onBeforeRenderObservable) {
         overlay.observer = scene.onBeforeRenderObservable.add(updateCullingOverlay);
      }
      updateCullingOverlay();
      window.HUD?.setCullingOverlayState?.({ enabled: true, metrics: overlay.lastMetrics });
      return true;
   }

   function ensureRearProxyMeshes() {
      if (!scene) return null;
      const state = rearProxyState;
      if (state.root) {
         const owningScene = typeof state.root.getScene === "function" ? state.root.getScene() : null;
         if (!owningScene || owningScene !== scene || state.root.isDisposed()) {
            try { state.root.dispose(); } catch (err) {}
            state.root = null;
            state.marker = null;
            state.lineSystem = null;
            state.linePoints = null;
            state.material = null;
            state.observer = null;
            state.lastHudSync = 0;
         }
      }
      if (!state.root) {
         const root = new BABYLON.TransformNode("rear-proxy-root", scene);
         root.rotationQuaternion = new BABYLON.Quaternion();
         root.isPickable = false;
         root.setEnabled(false);

         const marker = BABYLON.MeshBuilder.CreateSphere("rear-proxy-marker", { diameter: 0.6, segments: 12 }, scene);
         marker.parent = root;
         marker.isPickable = false;
         marker.alwaysSelectAsActiveMesh = true;
         marker.renderingGroupId = 1;

         const linePoints = [
            [BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, 0, -1)],
            [BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, 0, -1)],
            [BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, 0, -1)]
         ];
         const lineSystem = BABYLON.MeshBuilder.CreateLineSystem("rear-proxy-lines", { lines: linePoints }, scene);
         lineSystem.parent = root;
         lineSystem.isPickable = false;
         lineSystem.renderingGroupId = 1;
         lineSystem.alwaysSelectAsActiveMesh = true;
         lineSystem.color = new BABYLON.Color3(0.65, 0.85, 1.0);

         const mat = new BABYLON.StandardMaterial("rear-proxy-mat", scene);
         mat.emissiveColor = new BABYLON.Color3(0.55, 0.35, 0.95);
         mat.alpha = 0.55;
         mat.disableLighting = true;
         mat.backFaceCulling = false;
         marker.material = mat;

         state.root = root;
         state.marker = marker;
         state.lineSystem = lineSystem;
         state.linePoints = linePoints;
         state.material = mat;
         state.lastHudSync = 0;
      }
      return state;
   }

   function rotateVectorAroundY(vec, angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = vec.x * cos - vec.z * sin;
      const z = vec.x * sin + vec.z * cos;
      vec.x = x;
      vec.z = z;
   }

   function updateRearDebugProxies() {
      if (!rearProxyState.enabled) return;
      if (!camera) return;
      const state = ensureRearProxyMeshes();
      if (!state || !state.root) return;
      if (playerRoot) {
         TMP_DEBUG_POS.copyFrom(playerRoot.position);
         const offsetY = camera?.target ? (camera.target.y - playerRoot.position.y) : 0.9;
         TMP_DEBUG_POS.y += offsetY;
         state.root.position.copyFrom(TMP_DEBUG_POS);
      }
      TMP_DEBUG_FORWARD.copyFrom(camera.target);
      TMP_DEBUG_FORWARD.subtractInPlace(camera.position);
      let lenSq = TMP_DEBUG_FORWARD.lengthSquared();
      if (lenSq < 1e-6) {
         TMP_DEBUG_FORWARD.set(0, 0, 1);
         lenSq = 1;
      }
      TMP_DEBUG_FORWARD.scaleInPlace(1 / Math.sqrt(lenSq));
      TMP_DEBUG_FORWARD.x *= -1;
      TMP_DEBUG_FORWARD.z *= -1;
      const fov = Number.isFinite(camera.fov) ? camera.fov : Math.PI / 3;
      TMP_DEBUG_LEFT.copyFrom(TMP_DEBUG_FORWARD);
      TMP_DEBUG_RIGHT.copyFrom(TMP_DEBUG_FORWARD);
      rotateVectorAroundY(TMP_DEBUG_LEFT, fov * 0.5);
      rotateVectorAroundY(TMP_DEBUG_RIGHT, -fov * 0.5);
      const reach = 5;
      TMP_DEBUG_FORWARD.scaleInPlace(reach);
      TMP_DEBUG_LEFT.scaleInPlace(reach);
      TMP_DEBUG_RIGHT.scaleInPlace(reach);
      if (state.linePoints?.length === 3) {
         state.linePoints[0][1].copyFrom(TMP_DEBUG_FORWARD);
         state.linePoints[1][1].copyFrom(TMP_DEBUG_LEFT);
         state.linePoints[2][1].copyFrom(TMP_DEBUG_RIGHT);
         BABYLON.MeshBuilder.CreateLineSystem(null, { lines: state.linePoints, instance: state.lineSystem });
      }
      const now = Date.now();
      if (now - (rearProxyState.lastHudSync || 0) > 600) {
         rearProxyState.lastHudSync = now;
         window.HUD?.setRearProxyState?.({ enabled: true });
      }
   }

   function disableRearDebugProxies() {
      rearProxyState.enabled = false;
      if (rearProxyState.observer && scene?.onBeforeRenderObservable) {
         try { scene.onBeforeRenderObservable.remove(rearProxyState.observer); } catch (err) {}
      }
      rearProxyState.observer = null;
      if (rearProxyState.root) rearProxyState.root.setEnabled(false);
      rearProxyState.lastHudSync = 0;
      window.HUD?.setRearProxyState?.({ enabled: false });
   }

   function setRearDebugProxiesEnabled(enabled) {
      const next = !!enabled && DEV_BUILD;
      rearProxyState.enabled = next;
      if (!next) {
         disableRearDebugProxies();
         return true;
      }
      if (!scene) {
         rearProxyState.enabled = false;
         disableRearDebugProxies();
         return false;
      }
      const state = ensureRearProxyMeshes();
      if (!state?.root) {
         rearProxyState.enabled = false;
         disableRearDebugProxies();
         return false;
      }
      state.root.setEnabled(true);
      if (!rearProxyState.observer && scene?.onBeforeRenderObservable) {
         rearProxyState.observer = scene.onBeforeRenderObservable.add(updateRearDebugProxies);
      }
      updateRearDebugProxies();
      window.HUD?.setRearProxyState?.({ enabled: true });
      return true;
   }

   function resetSingleCamPerfMetrics() {
      singleCamPerfState.samples = 0;
      singleCamPerfState.sum = 0;
      singleCamPerfState.min = Infinity;
      singleCamPerfState.max = 0;
      singleCamPerfState.metrics = null;
      singleCamPerfState.lastHudUpdate = 0;
      window.HUD?.setSingleCamPerfMetrics?.(null);
   }

   function updateSingleCamPerfMetrics() {
      if (!singleCamPerfState.enabled || !engine) return;
      const dt = engine.getDeltaTime ? engine.getDeltaTime() : null;
      if (!Number.isFinite(dt) || dt <= 0) return;
      const fps = 1000 / dt;
      if (!Number.isFinite(fps)) return;
      singleCamPerfState.samples += 1;
      singleCamPerfState.sum += fps;
      if (fps < singleCamPerfState.min) singleCamPerfState.min = fps;
      if (fps > singleCamPerfState.max) singleCamPerfState.max = fps;
      const avg = singleCamPerfState.sum / singleCamPerfState.samples;
      singleCamPerfState.metrics = {
         avgFps: avg,
         minFps: singleCamPerfState.min,
         maxFps: singleCamPerfState.max,
         samples: singleCamPerfState.samples
      };
      const now = Date.now();
      if (!singleCamPerfState.lastHudUpdate || now - singleCamPerfState.lastHudUpdate > 500) {
         singleCamPerfState.lastHudUpdate = now;
         window.HUD?.setSingleCamPerfMetrics?.(singleCamPerfState.metrics);
      }
   }

   function disableSingleCamPerfTest() {
      if (singleCamPerfState.observer && scene?.onAfterRenderObservable) {
         try { scene.onAfterRenderObservable.remove(singleCamPerfState.observer); } catch (err) {}
      }
      singleCamPerfState.observer = null;
      singleCamPerfState.enabled = false;
      resetSingleCamPerfMetrics();
      window.HUD?.setSingleCamPerfState?.({ enabled: false });
   }

   function setSingleCamPerfTestEnabled(enabled) {
      const next = !!enabled && DEV_BUILD;
      if (!next) {
         disableSingleCamPerfTest();
         return true;
      }
      if (!scene) {
         disableSingleCamPerfTest();
         return false;
      }
      disableRearDebugCamera();
      singleCamPerfState.enabled = true;
      resetSingleCamPerfMetrics();
      if (singleCamPerfState.observer && scene?.onAfterRenderObservable) {
         try { scene.onAfterRenderObservable.remove(singleCamPerfState.observer); } catch (err) {}
         singleCamPerfState.observer = null;
      }
      if (scene?.onAfterRenderObservable) {
         singleCamPerfState.observer = scene.onAfterRenderObservable.add(updateSingleCamPerfMetrics);
      }
      window.HUD?.setSingleCamPerfState?.({ enabled: true });
      return true;
   }

   function buildTerrainSamplerDescriptor(sampler) {
      if (!sampler) return null;
      return {
         minX: sampler.minX,
         minZ: sampler.minZ,
         stepX: sampler.stepX,
         stepZ: sampler.stepZ,
         vertexCountX: sampler.vertexCountX,
         vertexCountZ: sampler.vertexCountZ,
         heights: sampler.heights,
         version: sampler.version,
      };
   }

   function scheduleTerrainSamplerFlush(terrain, sampler) {
      if (!terrain || !sampler) return;
      if (sampler.flushScheduled) return;
      sampler.flushScheduled = true;
      const flush = () => {
         sampler.flushScheduled = false;
         if (!terrain.heightSampler || terrain.heightSampler !== sampler) return;
         const pendingPatch = sampler.pendingPatch ? { ...sampler.pendingPatch } : null;
         const reset = sampler.pendingReset === true;
         sampler.pendingPatch = null;
         sampler.pendingReset = false;
         if (!pendingPatch && !reset) return;
         const detail = {
            version: sampler.version,
            patch: pendingPatch,
            reset,
            sampler: buildTerrainSamplerDescriptor(sampler)
         };
         try {
            window.RegionManager?.notifyTerrainSamplerPatch?.(detail);
         } catch (err) {
            console.warn("[Terrain] Failed to notify RegionManager of sampler patch", err);
         }
      };
      if (typeof requestAnimationFrame === "function") {
         requestAnimationFrame(flush);
      } else {
         setTimeout(flush, 0);
      }
   }

   function queueTerrainSamplerPatch(terrain, patch, opts = {}) {
      if (!terrain || !patch) {
         if (opts.reset === true) {
            try {
               window.RegionManager?.notifyTerrainSamplerPatch?.({
                  reset: true,
                  patch: null,
                  sampler: buildTerrainSamplerDescriptor(terrain?.heightSampler || null),
                  version: terrain?.heightSampler?.version || 0
               });
            } catch (err) {
               console.warn("[Terrain] Failed to notify RegionManager of sampler reset", err);
            }
         }
         return;
      }
      const sampler = terrain.heightSampler;
      if (!sampler) return;
      if (!sampler.pendingPatch) {
         sampler.pendingPatch = { ...patch };
      } else {
         const pending = sampler.pendingPatch;
         pending.minVX = Math.min(pending.minVX, patch.minVX);
         pending.maxVX = Math.max(pending.maxVX, patch.maxVX);
         pending.minVZ = Math.min(pending.minVZ, patch.minVZ);
         pending.maxVZ = Math.max(pending.maxVZ, patch.maxVZ);
         pending.minX = Math.min(pending.minX, patch.minX);
         pending.maxX = Math.max(pending.maxX, patch.maxX);
         pending.minZ = Math.min(pending.minZ, patch.minZ);
         pending.maxZ = Math.max(pending.maxZ, patch.maxZ);
      }
      if (opts.reset === true) sampler.pendingReset = true;
      scheduleTerrainSamplerFlush(terrain, sampler);
   }

   function ensureTerrainHeightSampler(terrain) {
      if (!terrain) return null;
      if (terrain.heightSampler) return terrain.heightSampler;
      const colsX = terrain.colsX | 0;
      const colsZ = terrain.colsZ | 0;
      if (!colsX || !colsZ) return null;
      const sampler = {
         colsX,
         colsZ,
         vertexCountX: colsX + 1,
         vertexCountZ: colsZ + 1,
         stepX: terrain.cubeSize || 1,
         stepZ: terrain.cubeSize || 1,
         minX: -terrain.halfX,
         minZ: -terrain.halfZ,
         baseY: terrain.baseY || 0,
         heights: new Float32Array((colsX + 1) * (colsZ + 1)),
         version: 0,
         pendingPatch: null,
         pendingReset: false,
         flushScheduled: false
      };
      terrain.heightSampler = sampler;
      return sampler;
   }

   function resetTerrainHeightSampler(terrain, opts = {}) {
      if (!terrain || !terrain.heightSampler) return;
      const sampler = terrain.heightSampler;
      terrain.heightSampler = null;
      sampler.pendingPatch = null;
      sampler.pendingReset = false;
      sampler.flushScheduled = false;
      if (opts.notify !== false) {
        try {
          window.RegionManager?.notifyTerrainSamplerPatch?.({
            reset: true,
            patch: null,
            sampler: null,
            version: sampler.version || 0
          });
        } catch (err) {
          console.warn("[Terrain] Failed to broadcast sampler reset", err);
        }
      }
   }

   function sampleTerrainHeightForSampler(terrain, worldX, worldZ) {
      if (!terrain) return null;
      const terrainApi = getTerrainApi();
      if (terrainApi && isUnifiedTerrainActive() && typeof terrainApi.sampleHeight === "function") {
         const height = terrainApi.sampleHeight(worldX, worldZ);
         if (Number.isFinite(height)) return height;
      }
      const idx = terrainColumnIndexFromWorld(worldX, worldZ);
      if (idx >= 0) {
         const offset = terrain.heights?.[idx];
         if (Number.isFinite(offset)) return terrain.baseY + offset;
      }
      return terrain.baseY || 0;
   }

   function updateTerrainSamplerRegion(terrain, minVX, maxVX, minVZ, maxVZ, opts = {}) {
      const sampler = ensureTerrainHeightSampler(terrain);
      if (!sampler) return null;
      const vCountX = sampler.vertexCountX;
      const vCountZ = sampler.vertexCountZ;
      if (!vCountX || !vCountZ) return null;
      const minVXClamped = Math.max(0, Math.min(vCountX - 1, Math.floor(minVX)));
      const maxVXClamped = Math.max(minVXClamped, Math.min(vCountX - 1, Math.ceil(maxVX)));
      const minVZClamped = Math.max(0, Math.min(vCountZ - 1, Math.floor(minVZ)));
      const maxVZClamped = Math.max(minVZClamped, Math.min(vCountZ - 1, Math.ceil(maxVZ)));
      if (maxVXClamped < minVXClamped || maxVZClamped < minVZClamped) return null;
      const { minX, minZ, stepX, stepZ } = sampler;
      for (let vz = minVZClamped; vz <= maxVZClamped; vz++) {
         const worldZ = minZ + vz * stepZ;
         for (let vx = minVXClamped; vx <= maxVXClamped; vx++) {
            const worldX = minX + vx * stepX;
            const height = sampleTerrainHeightForSampler(terrain, worldX, worldZ);
            const idx = vz * vCountX + vx;
            sampler.heights[idx] = Number.isFinite(height) ? height : sampler.heights[idx];
         }
      }
      sampler.version += 1;
      const patch = {
         minVX: minVXClamped,
         maxVX: maxVXClamped,
         minVZ: minVZClamped,
         maxVZ: maxVZClamped,
         minX: minX + minVXClamped * stepX,
         maxX: minX + (maxVXClamped + 1) * stepX,
         minZ: minZ + minVZClamped * stepZ,
         maxZ: minZ + (maxVZClamped + 1) * stepZ,
         stepX,
         stepZ
      };
      queueTerrainSamplerPatch(terrain, patch, opts);
      return patch;
   }

   function updateTerrainSamplerForColumns(terrain, minCX, maxCX, minCZ, maxCZ, opts = {}) {
      if (!terrain) return null;
      const sampler = ensureTerrainHeightSampler(terrain);
      if (!sampler) return null;
      const minVX = Math.max(0, minCX);
      const maxVX = Math.min(sampler.vertexCountX - 1, maxCX + 1);
      const minVZ = Math.max(0, minCZ);
      const maxVZ = Math.min(sampler.vertexCountZ - 1, maxCZ + 1);
      return updateTerrainSamplerRegion(terrain, minVX, maxVX, minVZ, maxVZ, opts);
   }

   function updateTerrainColumnsFromUnifiedMeshRange(terrain, minCX, maxCX, minCZ, maxCZ) {
      const terrainApi = getTerrainApi();
      if (!terrain || !terrain.heights || !terrainApi || typeof terrainApi.sampleHeight !== "function") return;
      const colsX = terrain.colsX | 0;
      const colsZ = terrain.colsZ | 0;
      if (!colsX || !colsZ) return;
      const cubeSize = Math.max(terrain.cubeSize || 1, 0.5);
      const halfX = terrain.halfX;
      const halfZ = terrain.halfZ;
      const baseY = terrain.baseY || 0;
      const minSampleCX = Math.max(0, Math.min(colsX - 1, minCX));
      const maxSampleCX = Math.max(minSampleCX, Math.min(colsX - 1, maxCX));
      const minSampleCZ = Math.max(0, Math.min(colsZ - 1, minCZ));
      const maxSampleCZ = Math.max(minSampleCZ, Math.min(colsZ - 1, maxCZ));
      for (let cz = minSampleCZ; cz <= maxSampleCZ; cz++) {
         const worldZ = -halfZ + (cz + 0.5) * cubeSize;
         for (let cx = minSampleCX; cx <= maxSampleCX; cx++) {
            const worldX = -halfX + (cx + 0.5) * cubeSize;
            const idx = cz * colsX + cx;
            const height = terrainApi.sampleHeight(worldX, worldZ);
            if (Number.isFinite(height)) {
               terrain.heights[idx] = Math.max(0, height - baseY);
            }
         }
      }
   }

   function handleTerrainPatchPhysics(patch) {
      if (!patch) return;
      const expandX = patch.stepX || 0;
      const expandZ = patch.stepZ || 0;
      const minX = patch.minX - expandX;
      const maxX = patch.maxX + expandX;
      const minZ = patch.minZ - expandZ;
      const maxZ = patch.maxZ + expandZ;
      if (player?.position) {
         const px = player.position.x;
         const pz = player.position.z;
         if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ) {
            state.groundSampleDirty = true;
            state.groundSampleCountdown = 0;
         }
      }
      for (const body of physics.bodies) {
         if (!body || !body.mesh || body.useCollisions === false) continue;
         const pos = body.mesh.position;
         if (!pos) continue;
         if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
            body.wakeRequested = true;
            wakePhysicsBody(body);
         }
      }
   }

   function processTerrainDeformDetail(detail) {
      if (!detail) return;
      const terrain = environment.terrain;
      if (!terrain) return;
      const bounds = detail.bounds || {};
      const sampler = ensureTerrainHeightSampler(terrain);
      if (!sampler) return;
      const minVX = Number.isFinite(bounds.minVX) ? bounds.minVX : Number(bounds.vx0) || 0;
      const maxVX = Number.isFinite(bounds.maxVX) ? bounds.maxVX : Number(bounds.vx1 ?? bounds.minVX ?? 0);
      const minVZ = Number.isFinite(bounds.minVZ) ? bounds.minVZ : Number(bounds.vz0) || 0;
      const maxVZ = Number.isFinite(bounds.maxVZ) ? bounds.maxVZ : Number(bounds.vz1 ?? bounds.minVZ ?? 0);
      const minVXInt = Math.max(0, Math.floor(minVX));
      const maxVXInt = Math.min(sampler.vertexCountX - 1, Math.ceil(maxVX));
      const minVZInt = Math.max(0, Math.floor(minVZ));
      const maxVZInt = Math.min(sampler.vertexCountZ - 1, Math.ceil(maxVZ));
      const minCX = Math.max(0, Math.floor(minVX));
      const maxCX = Math.max(minCX, Math.min(terrain.colsX - 1, Math.ceil(maxVX) - 1));
      const minCZ = Math.max(0, Math.floor(minVZ));
      const maxCZ = Math.max(minCZ, Math.min(terrain.colsZ - 1, Math.ceil(maxVZ) - 1));
      updateTerrainColumnsFromUnifiedMeshRange(terrain, minCX, maxCX, minCZ, maxCZ);
      const patch = updateTerrainSamplerRegion(terrain, minVXInt, maxVXInt, minVZInt, maxVZInt);
      if (patch) handleTerrainPatchPhysics(patch);
   }

   function flushDeferredTerrainBrush() {
      const brush = state.terrainBrush;
      if (!brush.deferredQueue.length) {
         brush.deferredScheduled = false;
         return;
      }
      const queue = brush.deferredQueue.splice(0, brush.deferredQueue.length);
      brush.deferredScheduled = false;
      for (const entry of queue) {
         processTerrainDeformDetail(entry);
      }
   }

   function scheduleDeferredTerrainBrush() {
      const brush = state.terrainBrush;
      if (brush.deferredScheduled) return;
      brush.deferredScheduled = true;
      const runner = () => flushDeferredTerrainBrush();
      if (typeof requestAnimationFrame === "function") {
         requestAnimationFrame(runner);
      } else if (typeof requestIdleCallback === "function") {
         requestIdleCallback(runner, { timeout: 16 });
      } else {
         setTimeout(runner, 0);
      }
   }

   function handleTerrainDeformed(detail) {
      if (!detail) return;
      const brush = state.terrainBrush;
      let shouldDefer = false;
      if (brush && brush.pendingStroke) {
         const affected = Number.isFinite(detail?.affected) ? detail.affected : 0;
         if (affected > 0) {
            const elapsed = performance.now() - (brush.pendingStroke.startedAt || performance.now());
            applyBrushMetrics(detail, elapsed);
            if (brush.deferNormals && elapsed > brush.frameBudgetMs) {
               shouldDefer = true;
            }
         }
         brush.pendingStroke = null;
      }
      if (shouldDefer && brush) {
         brush.deferredQueue.push(detail);
         scheduleDeferredTerrainBrush();
         return;
      }
      processTerrainDeformDetail(detail);
   }

   function ensureTerrainDeformListener() {
      if (terrainDeformListenerAttached) return;
      if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
      window.addEventListener("terrainDeformed", (event) => {
         const detail = event?.detail || null;
         handleTerrainDeformed(detail);
      });
      terrainDeformListenerAttached = true;
   }

   function initializeTerrainHeightSampler(terrain) {
      if (!terrain) return;
      const sampler = ensureTerrainHeightSampler(terrain);
      if (!sampler) return;
      updateTerrainSamplerRegion(terrain, 0, sampler.vertexCountX - 1, 0, sampler.vertexCountZ - 1, { reset: true });
   }

   function syncUnifiedTerrainHeights(worldX, worldZ, radius) {
      const terrain = environment.terrain;
      const terrainApi = getTerrainApi();
      if (!terrain || !terrain.heights || !terrainApi || typeof terrainApi.sampleHeight !== "function") return;
      const colsX = terrain.colsX | 0;
      const colsZ = terrain.colsZ | 0;
      if (colsX <= 0 || colsZ <= 0) return;
      const cubeSize = Math.max(terrain.cubeSize || 1, 0.5);
      const minX = Math.max(-terrain.halfX, worldX - radius);
      const maxX = Math.min(terrain.halfX, worldX + radius);
      const minZ = Math.max(-terrain.halfZ, worldZ - radius);
      const maxZ = Math.min(terrain.halfZ, worldZ + radius);
      const startCX = Math.max(0, Math.floor((minX + terrain.halfX) / cubeSize));
      const endCX = Math.min(colsX - 1, Math.ceil((maxX + terrain.halfX) / cubeSize));
      const startCZ = Math.max(0, Math.floor((minZ + terrain.halfZ) / cubeSize));
      const endCZ = Math.min(colsZ - 1, Math.ceil((maxZ + terrain.halfZ) / cubeSize));
      for (let cz = startCZ; cz <= endCZ; cz++) {
         for (let cx = startCX; cx <= endCX; cx++) {
            const idx = cz * colsX + cx;
            const sampleX = -terrain.halfX + (cx + 0.5) * cubeSize;
            const sampleZ = -terrain.halfZ + (cz + 0.5) * cubeSize;
            const height = terrainApi.sampleHeight(sampleX, sampleZ);
            if (Number.isFinite(height)) {
               terrain.heights[idx] = Math.max(0, height - terrain.baseY);
            }
         }
      }
      const patch = updateTerrainSamplerForColumns(terrain, startCX, endCX, startCZ, endCZ);
      if (patch) handleTerrainPatchPhysics(patch);
   }

   function applyUnifiedTerrainDamage(point, options = {}) {
      if (!point || !isUnifiedTerrainActive()) return false;
      const terrainApi = getTerrainApi();
      if (!terrainApi || typeof terrainApi.applyDamage !== "function") return false;
      const resolved = normalizeCraterOptions(options);
      try {
         const success = terrainApi.applyDamage({
            worldX: point.x,
            worldZ: point.z,
            radius: resolved.radius,
            strength: resolved.strength,
            falloff: resolved.falloff,
         });
         return !!success;
      } catch (err) {
         console.warn("[Terrain] Failed to deform unified mesh", err);
         return false;
      }
   }

   function canUseTerrainBrush() {
      return DEV_BUILD && state.terrainBrush.enabled && isUnifiedTerrainActive();
   }

   function pickTerrainPoint(event) {
      if (!scene) return null;
      const canvas = engine?.getRenderingCanvas?.();
      if (!canvas || !event) return null;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const predicate = (mesh) => {
         if (!mesh) return false;
         if (mesh === environment.terrain?.unifiedMesh) return true;
         return isGroundMesh(mesh);
      };
      const pick = scene.pick(x, y, predicate);
      if (!pick || !pick.hit || !pick.pickedPoint) return null;
      return pick.pickedPoint.clone();
   }

   function applyTerrainBrushStroke(point) {
      if (!canUseTerrainBrush() || !point) return false;
      const brush = state.terrainBrush;
      const now = performance.now();
      if (now - brush.lastStrokeTime < brush.strokeIntervalMs) return false;
      brush.lastStrokeTime = now;
      const options = {
         radius: brush.radius,
         strength: brush.strength,
         falloff: brush.falloff
      };
      brush.pendingStroke = {
         startedAt: now,
         center: { x: point.x, z: point.z }
      };
      const success = applyUnifiedTerrainDamage(point, options);
      if (!success) {
         brush.pendingStroke = null;
         return false;
      }
      return true;
   }

   function updateDepthHudCursor(pickPoint, event) {
      const hudApi = window.HUD;
      if (!hudApi) return;
      if (!canUseTerrainBrush()) {
         hudApi.setDepthHudVisible?.(false);
         return;
      }
      if (!pickPoint) {
         hudApi.setDepthHudVisible?.(false);
         return;
      }
      const layerInfo = resolveDominantLayerAt(pickPoint.x, pickPoint.z);
      state.terrainBrush.lastMetrics.layer = layerInfo?.label || state.terrainBrush.lastMetrics.layer;
      hudApi.setDepthHudVisible?.(true);
      hudApi.updateDepthHudMetrics?.({
         timeMs: state.terrainBrush.lastMetrics.timeMs,
         verts: state.terrainBrush.lastMetrics.verts,
         layer: layerInfo?.label || state.terrainBrush.lastMetrics.layer
      });
      if (event) {
         hudApi.setDepthHudPosition?.({ x: event.clientX, y: event.clientY });
      }
   }

   function handleTerrainBrushPointerDown(event) {
      if (!canUseTerrainBrush()) return;
      if (event.button !== 0) return;
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const point = pickTerrainPoint(event);
      updateDepthHudCursor(point, event);
      if (!point) return;
      state.terrainBrush.pointerActive = true;
      state.terrainBrush.activePointerId = event.pointerId;
      if (applyTerrainBrushStroke(point)) {
         event.preventDefault();
      }
   }

   function handleTerrainBrushPointerMove(event) {
      if (paused) {
         window.HUD?.setDepthHudVisible?.(false);
         return;
      }
      if (!canUseTerrainBrush()) return;
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const point = pickTerrainPoint(event);
      updateDepthHudCursor(point, event);
      if (!point) return;
      if (state.terrainBrush.pointerActive && event.pointerId === state.terrainBrush.activePointerId) {
         applyTerrainBrushStroke(point);
      }
   }

   function handleTerrainBrushPointerUp(event) {
      if (state.terrainBrush.pointerActive && event.pointerId === state.terrainBrush.activePointerId) {
         state.terrainBrush.pointerActive = false;
         state.terrainBrush.activePointerId = null;
      }
      if (!canUseTerrainBrush() || event.type === "pointerleave" || event.type === "pointercancel") {
         window.HUD?.setDepthHudVisible?.(false);
      }
   }

   function projectileCraterOptions(projectile) {
      if (!projectile) return {};
      const opts = {};
      if (Number.isFinite(projectile.craterRadius)) {
         opts.radius = projectile.craterRadius;
      } else if (Number.isFinite(projectile.radius)) {
         opts.sourceRadius = projectile.radius * 0.9;
      }
      if (Number.isFinite(projectile.craterStrength)) {
         opts.strength = projectile.craterStrength;
      }
      if (typeof projectile.craterFalloff === "string") {
         opts.falloff = projectile.craterFalloff;
      }
      return opts;
   }

   function removeTopBlock(columnIndex) {
      const terrain = environment.terrain;
      if (!terrain) return false;
      const column = terrain.columns[columnIndex];
      if (!column) return false;
         for (let layer = column.length - 1; layer >= 0; layer--) {
            const block = column[layer];
            if (!block) continue;
            const meta = block.metadata?.terrainBlock;
            if (!meta || meta.destroyed) continue;
            if (!meta.destructible) return false;
            meta.destroyed = true;
            block.isPickable = false;
            block.checkCollisions = false;
            block.isVisible = false;
            block.setEnabled(false);
            terrain.heights[columnIndex] = recomputeColumnHeight(column);
            const terrainApi = getTerrainApi();
            if (terrainApi && isUnifiedTerrainActive() && typeof terrainApi.updateFromColumns === "function") {
               try { terrainApi.updateFromColumns(terrain, { columnIndex }); } catch (err) {
                  console.warn("[Terrain] Failed to update unified mesh column", err);
               }
            }
            const colsX = terrain.colsX | 0;
            const cx = colsX > 0 ? columnIndex % colsX : columnIndex;
            const cz = colsX > 0 ? Math.floor(columnIndex / colsX) : 0;
            const patch = updateTerrainSamplerForColumns(terrain, cx, cx, cz, cz);
            if (patch) handleTerrainPatchPhysics(patch);
            if (terrain.columnStates[columnIndex]) {
               enableTerrainColumn(column);
            }
            return true;
         }
      return false;
   }

   function removeTerrainBlockFromMesh(mesh, options) {
      if (!mesh) return false;
      const meta = mesh.metadata?.terrainBlock;
      if (!meta) return false;
      const point = typeof mesh.getAbsolutePosition === "function"
         ? mesh.getAbsolutePosition()
         : mesh.position;
      applyUnifiedTerrainDamage(point, options);
      return removeTopBlock(meta.columnIndex);
   }

   function removeTerrainCubeAtPoint(point, options = {}) {
      if (!point) return false;
      const deformed = applyUnifiedTerrainDamage(point, options);
      const idx = terrainColumnIndexFromWorld(point.x, point.z);
      if (idx < 0) return deformed;
      const removed = removeTopBlock(idx);
      return removed || deformed;
   }

   function clearTrees() {
      if (environment.trees.length) {
         const entries = environment.trees.slice();
         for (const entry of entries) {
            if (entry && !entry.destroyed) {
               destroyTree(entry);
            }
         }
      }
      environment.trees = [];
      environment.treeColumns = [];
   }

   function setTreeEntryEnabled(entry, enabled) {
      if (!entry || entry.destroyed) return;
      if (entry.root && typeof entry.root.setEnabled === "function") {
         entry.root.setEnabled(enabled);
      }
      if (entry.meshes) {
         for (const mesh of entry.meshes) {
            if (!mesh || typeof mesh.isDisposed === "function" && mesh.isDisposed()) continue;
            if (typeof mesh.setEnabled === "function") mesh.setEnabled(enabled);
            mesh.checkCollisions = false;
            mesh.isPickable = !!enabled;
         }
      }
      if (Array.isArray(entry.impostors)) {
         for (const collider of entry.impostors) {
            if (!collider || typeof collider.isDisposed === "function" && collider.isDisposed()) continue;
            collider.isPickable = false;
            collider.isVisible = false;
            if (typeof collider.setEnabled === "function") collider.setEnabled(enabled);
            collider.checkCollisions = !!enabled;
         }
      }
   }

   function setTreeColumnEnabled(columnIndex, enabled) {
      if (!environment.treeColumns) return;
      const list = environment.treeColumns[columnIndex];
      if (!list) return;
      for (const entry of list) {
         setTreeEntryEnabled(entry, enabled);
      }
   }

   function destroyTree(entry) {
      if (!entry || entry.destroyed) return false;
      entry.destroyed = true;
      if (entry.meshes) {
         for (const mesh of entry.meshes) {
            if (!mesh || typeof mesh.isDisposed === "function" && mesh.isDisposed()) continue;
            if (mesh.metadata && mesh.metadata.treePart === entry) {
               delete mesh.metadata.treePart;
            }
         }
      }
      if (Array.isArray(entry.impostors)) {
         for (const collider of entry.impostors) {
            if (!collider || typeof collider.isDisposed === "function" && collider.isDisposed()) continue;
            if (collider.metadata && collider.metadata.treeEntry === entry) {
               delete collider.metadata.treeEntry;
            }
            try {
               collider.dispose();
            } catch (err) {}
         }
         entry.impostors = null;
      }
      if (entry.root && entry.root.metadata && entry.root.metadata.tree === entry) {
         delete entry.root.metadata.tree;
      }
      if (entry.root) {
         try {
            entry.root.dispose();
         } catch (e) {
            /* ignore */
         }
      }
      if (environment.treeColumns) {
         const columnList = environment.treeColumns[entry.columnIndex];
         if (columnList) {
            const idx = columnList.indexOf(entry);
            if (idx >= 0) columnList.splice(idx, 1);
            if (columnList.length === 0) environment.treeColumns[entry.columnIndex] = undefined;
         }
      }
      const globalIdx = environment.trees.indexOf(entry);
      if (globalIdx >= 0) environment.trees.splice(globalIdx, 1);
      entry.columnIndex = -1;
      entry.root = null;
      entry.meshes = null;
      return true;
   }

   function destroyTreeByMesh(mesh) {
      if (!mesh) return false;
      const entry = mesh.metadata?.treePart;
      if (!entry) return false;
      return destroyTree(entry);
   }

   function getTerrainLayerTopForColumn(columnIndex, layerIndex) {
      const terrain = environment.terrain;
      if (!terrain) return null;
      if (columnIndex < 0 || columnIndex >= terrain.columns.length) return null;
      if (layerIndex < 0 || layerIndex >= terrain.layerOffsets.length) return null;
      const column = terrain.columns[columnIndex];
      if (!column) return null;
      const block = column[layerIndex];
      if (!block) return null;
      const meta = block.metadata?.terrainBlock;
      if (!meta || meta.destroyed) return null;
      const offset = terrain.layerOffsets[layerIndex] + terrain.layerThicknesses[layerIndex];
      return terrain.baseY + offset;
   }

   function getFallbackTreeMaterials(scene) {
      if (fallbackTreeMaterials) return fallbackTreeMaterials;
      const trunkMat = new BABYLON.StandardMaterial("fallbackTreeTrunkMat", scene);
      trunkMat.diffuseColor = new BABYLON.Color3(0.36, 0.22, 0.12);
      trunkMat.specularColor = BABYLON.Color3.Black();
      const leavesMat = new BABYLON.StandardMaterial("fallbackTreeLeavesMat", scene);
      leavesMat.diffuseColor = new BABYLON.Color3(0.18, 0.35, 0.16);
      leavesMat.specularColor = new BABYLON.Color3(0.05, 0.1, 0.05);
      leavesMat.emissiveColor = new BABYLON.Color3(0.02, 0.05, 0.02);

      const billboardTexture = new BABYLON.DynamicTexture("fallbackTreeBillboardTex", { width: 128, height: 192 }, scene, false);
      const ctx = billboardTexture.getContext();
      if (ctx) {
         ctx.fillStyle = "rgba(0,0,0,0)";
         ctx.fillRect(0, 0, billboardTexture.getSize().width, billboardTexture.getSize().height);
         const width = billboardTexture.getSize().width;
         const height = billboardTexture.getSize().height;
         ctx.fillStyle = "#5a9c55";
         ctx.beginPath();
         ctx.moveTo(width * 0.15, height * 0.7);
         ctx.lineTo(width * 0.5, height * 0.08);
         ctx.lineTo(width * 0.85, height * 0.7);
         ctx.closePath();
         ctx.fill();
         ctx.fillStyle = "#1e3a17";
         ctx.globalAlpha = 0.6;
         ctx.beginPath();
         ctx.moveTo(width * 0.2, height * 0.74);
         ctx.lineTo(width * 0.5, height * 0.18);
         ctx.lineTo(width * 0.8, height * 0.74);
         ctx.closePath();
         ctx.fill();
         ctx.globalAlpha = 1;
         ctx.fillStyle = "#4b311f";
         ctx.fillRect(width * 0.47, height * 0.7, width * 0.06, height * 0.28);
         billboardTexture.update();
         billboardTexture.hasAlpha = true;
      }
      const billboardMat = new BABYLON.StandardMaterial("fallbackTreeBillboardMat", scene);
      billboardMat.diffuseTexture = billboardTexture;
      billboardMat.emissiveColor = new BABYLON.Color3(0.14, 0.22, 0.14);
      billboardMat.specularColor = BABYLON.Color3.Black();
      billboardMat.backFaceCulling = false;
      billboardMat.disableLighting = false;
      fallbackTreeMaterials = { trunkMat, leavesMat, billboardMat };
      return fallbackTreeMaterials;
   }

   function tagLodProxy(mesh) {
      if (!mesh) return mesh;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.isVisible = false;
      if (typeof mesh.setEnabled === "function") mesh.setEnabled(false);
      mesh.alwaysSelectAsActiveMesh = false;
      if (!mesh.metadata) mesh.metadata = {};
      mesh.metadata.lodProxy = true;
      return mesh;
   }

   function createTreeBillboard(scene, name, root, base) {
      const source = base || ensureTreePrototypes(scene).billboard;
      if (!source) return null;
      const instance = source.createInstance(`${name}-lod-billboard`);
      instance.parent = root;
      return tagLodProxy(instance);
   }

   function createTreeLodMeshes(scene, root, parts) {
      const { name, trunk, foliage, crown, prototypes } = parts;
      const mediumTrunkSource = prototypes?.mediumTrunk;
      const mediumFoliageSource = prototypes?.mediumFoliage;
      const mediumCrownSource = prototypes?.mediumCrown;
      const billboardSource = prototypes?.billboard;

      const mediumTrunk = mediumTrunkSource ? mediumTrunkSource.createInstance(`${name}-lod-trunk`) : null;
      if (mediumTrunk) {
         mediumTrunk.parent = root;
         tagLodProxy(mediumTrunk);
      }

      const mediumFoliage = mediumFoliageSource ? mediumFoliageSource.createInstance(`${name}-lod-foliage`) : null;
      if (mediumFoliage) {
         mediumFoliage.parent = root;
         tagLodProxy(mediumFoliage);
      }

      const mediumCrown = mediumCrownSource ? mediumCrownSource.createInstance(`${name}-lod-crown`) : null;
      if (mediumCrown) {
         mediumCrown.parent = root;
         tagLodProxy(mediumCrown);
      }

      const farBillboard = billboardSource ? createTreeBillboard(scene, name, root, billboardSource) : null;

      const bindings = [
         { host: trunk, medium: mediumTrunk, far: farBillboard },
         { host: foliage, medium: mediumFoliage, far: null },
         { host: crown, medium: mediumCrown, far: null }
      ];

      root.metadata = { ...(root.metadata || {}), lodBindings: bindings, lodType: "tree" };
      return bindings;
   }

   function createTreeImpostors(scene, entry, childMeshes = []) {
      if (!scene || !entry || !entry.root) return [];
      const root = entry.root;
      const impostors = [];
      const meshes = childMeshes.filter(mesh => mesh && !mesh.metadata?.lodProxy);
      if (!meshes.length) return impostors;

      let trunkMesh = null;
      let fallbackScore = Infinity;
      for (const mesh of meshes) {
         const name = typeof mesh.name === "string" ? mesh.name.toLowerCase() : "";
         if (name.includes("trunk") || name.includes("stem")) {
            trunkMesh = mesh;
            break;
         }
         const info = mesh.getBoundingInfo();
         if (!info) continue;
         const ext = info.boundingBox.extendSizeWorld;
         const horiz = Math.max(ext.x, ext.z);
         if (horiz < fallbackScore) {
            fallbackScore = horiz;
            trunkMesh = mesh;
         }
      }

      if (trunkMesh) {
         const info = trunkMesh.getBoundingInfo();
         if (info) {
            const box = info.boundingBox;
            const extend = box.extendSizeWorld;
            const height = Math.max(0.6, extend.y * 2 * 1.02);
            const radius = Math.max(0.25, Math.max(extend.x, extend.z) * 0.6);
            const capsule = BABYLON.MeshBuilder.CreateCapsule(`${root.name || "tree"}-trunk-imp`, {
               height,
               radius,
               tessellation: 6,
               subdivisions: 1
            }, scene);
            capsule.position.copyFrom(box.centerWorld);
            capsule.isPickable = false;
            capsule.checkCollisions = true;
            capsule.visibility = 0;
            capsule.isVisible = false;
            capsule.setParent(root, true);
            capsule.metadata = { treeCollider: true, treePart: "trunk", impostor: true, treeEntry: entry };
            impostors.push(capsule);
         }
      }

      const canopyMeshes = meshes.filter(mesh => mesh !== trunkMesh);
      if (canopyMeshes.length) {
         const canopyMin = new BABYLON.Vector3(Infinity, Infinity, Infinity);
         const canopyMax = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
         for (const mesh of canopyMeshes) {
            const info = mesh.getBoundingInfo();
            if (!info) continue;
            const box = info.boundingBox;
            canopyMin.x = Math.min(canopyMin.x, box.minimumWorld.x);
            canopyMin.y = Math.min(canopyMin.y, box.minimumWorld.y);
            canopyMin.z = Math.min(canopyMin.z, box.minimumWorld.z);
            canopyMax.x = Math.max(canopyMax.x, box.maximumWorld.x);
            canopyMax.y = Math.max(canopyMax.y, box.maximumWorld.y);
            canopyMax.z = Math.max(canopyMax.z, box.maximumWorld.z);
         }
         if (Number.isFinite(canopyMin.x) && Number.isFinite(canopyMax.x)) {
            const size = canopyMax.subtract(canopyMin);
            const width = Math.max(0.6, size.x * 1.02);
            const depth = Math.max(0.6, size.z * 1.02);
            const height = Math.max(0.5, size.y * 0.85);
            const center = BABYLON.Vector3.Center(canopyMin, canopyMax);
            const box = BABYLON.MeshBuilder.CreateBox(`${root.name || "tree"}-canopy-imp`, {
               width,
               height,
               depth
            }, scene);
            box.position.copyFrom(center);
            box.isPickable = false;
            box.checkCollisions = true;
            box.visibility = 0;
            box.isVisible = false;
            box.setParent(root, true);
            box.metadata = { treeCollider: true, treePart: "canopy", impostor: true, treeEntry: entry };
            impostors.push(box);
         }
      }

      if (!root.metadata) root.metadata = {};
      root.metadata.treeColliders = impostors;
      entry.impostors = impostors;
      return impostors;
   }

   function createFallbackTree(scene, name, position, scale) {
      const root = new BABYLON.TransformNode(name, scene);
      const prototypes = ensureTreePrototypes(scene);

      const trunkSource = prototypes.trunk;
      const foliageSource = prototypes.foliage;
      const crownSource = prototypes.crown;

      const trunk = trunkSource ? trunkSource.createInstance(`${name}-trunk`) : null;
      if (trunk) {
         trunk.parent = root;
      }

      const foliage = foliageSource ? foliageSource.createInstance(`${name}-foliage`) : null;
      if (foliage) {
         foliage.parent = root;
      }

      const crown = crownSource ? crownSource.createInstance(`${name}-crown`) : null;
      if (crown) {
         crown.parent = root;
      }

      createTreeLodMeshes(scene, root, {
         name,
         trunk,
         foliage,
         crown,
         prototypes
      });

      root.position.copyFrom(position);
      root.scaling.set(scale, scale, scale);

      const childMeshes = root.getChildMeshes();
      childMeshes.forEach(mesh => {
         mesh.computeWorldMatrix(true);
         if (mesh.metadata?.lodProxy) {
            mesh.isPickable = false;
            mesh.checkCollisions = false;
         } else {
            mesh.isPickable = false;
            mesh.checkCollisions = false;
         }
      });

      let minY = Infinity;
      childMeshes.forEach(mesh => {
         const info = mesh.getBoundingInfo();
         if (!info) return;
         const min = info.boundingBox.minimumWorld.y;
         if (min < minY) minY = min;
      });
      const offset = Number.isFinite(minY) ? position.y - minY : 0;
      if (offset !== 0) {
         root.position.y += offset;
      }

      return root;
   }

   function sanitizeLodDistance(value, fallback, min) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      const lowerBound = Number.isFinite(min) ? min : 0;
      return Math.max(numeric, lowerBound + 0.01);
   }

   function resolveTreeLodProfile() {
      const defaults = DEFAULT_ENVIRONMENT_LOD_PROFILE.tree;
      const current = environment.lodProfile?.tree || defaults;
      return {
         mediumDistance: Number.isFinite(current.mediumDistance) && current.mediumDistance > 0 ? current.mediumDistance : defaults.mediumDistance,
         farDistance: Number.isFinite(current.farDistance) && current.farDistance > 0 ? current.farDistance : defaults.farDistance,
         cullDistance: Number.isFinite(current.cullDistance) && current.cullDistance > 0 ? current.cullDistance : defaults.cullDistance,
         billboard: current.billboard !== undefined ? !!current.billboard : defaults.billboard
      };
   }

   function applyTreeLodBindings(bindings) {
      if (!Array.isArray(bindings) || bindings.length === 0) return;
      const lodEnabled = environment.lodEnabled !== false;
      const profile = resolveTreeLodProfile();
      let medium = sanitizeLodDistance(profile.mediumDistance, DEFAULT_ENVIRONMENT_LOD_PROFILE.tree.mediumDistance, 6);
      let far = sanitizeLodDistance(profile.farDistance, medium + 8, medium + 2);
      if (far <= medium + 2) far = medium + 8;
      let cull = sanitizeLodDistance(profile.cullDistance, far + 48, far);
      if (cull <= far + 2) cull = far + 32;
      const useBillboard = profile.billboard !== false;

      for (const binding of bindings) {
         const host = binding?.host;
         if (!host || typeof host.addLODLevel !== "function") continue;
         if (typeof host.clearLODLevels === "function") {
            host.clearLODLevels();
         } else if (Array.isArray(host._LODLevels)) {
            host._LODLevels.length = 0;
         }

         if (!lodEnabled) {
            continue;
         }

         const mediumMesh = binding.medium || null;
         const farMesh = binding.far || null;

         if (mediumMesh) {
            mediumMesh.isPickable = false;
            mediumMesh.checkCollisions = false;
            mediumMesh.isVisible = false;
         }
         if (farMesh) {
            farMesh.isPickable = false;
            farMesh.checkCollisions = false;
            farMesh.isVisible = false;
         }

         if (mediumMesh) {
            host.addLODLevel(medium, mediumMesh);
         }

         if (Number.isFinite(far)) {
            const resolvedFarMesh = useBillboard ? farMesh : null;
            host.addLODLevel(Math.max(far, medium + 0.1), resolvedFarMesh);
         }

         if (Number.isFinite(cull)) {
            host.addLODLevel(Math.max(cull, Math.max(far, medium) + 0.1), null);
         }
      }
   }

   function applyTreeLOD(entry) {
      if (!entry || entry.destroyed) return;
      const bindings = entry.lodBindings || entry.root?.metadata?.lodBindings;
      if (!bindings) return;
      applyTreeLodBindings(bindings);
   }

   function refreshAllTreeLods() {
      for (const entry of environment.trees) {
         if (!entry || entry.destroyed) continue;
         applyTreeLOD(entry);
      }
   }

   function mergeLodEntry(base, override) {
      const target = { ...base };
      if (override && typeof override === "object") {
         if (Number.isFinite(override.mediumDistance) && override.mediumDistance > 0) target.mediumDistance = override.mediumDistance;
         if (Number.isFinite(override.farDistance) && override.farDistance > 0) target.farDistance = override.farDistance;
         if (Number.isFinite(override.cullDistance) && override.cullDistance > 0) target.cullDistance = override.cullDistance;
         if (typeof override.billboard === "boolean") target.billboard = override.billboard;
      }
      return target;
   }

   function setEnvironmentLodProfile(profile = {}) {
      const assets = profile.assets && typeof profile.assets === "object" ? profile.assets : profile;
      const next = {
         tree: mergeLodEntry(DEFAULT_ENVIRONMENT_LOD_PROFILE.tree, assets.tree || {}),
         rock: mergeLodEntry(DEFAULT_ENVIRONMENT_LOD_PROFILE.rock, assets.rock || {}),
         structure: mergeLodEntry(DEFAULT_ENVIRONMENT_LOD_PROFILE.structure, assets.structure || {})
      };
      environment.lodProfile = next;
      refreshAllTreeLods();
      return next;
   }

   setEnvironmentLodProfile(environment.lodProfile);

   function setEnvironmentLodEnabled(enabled) {
      const value = enabled !== false;
      if (environment.lodEnabled === value) return environment.lodEnabled;
      environment.lodEnabled = value;
      refreshAllTreeLods();
      scheduleProfilerHudSync();
      updatePerfSettings({ lodEnabled: environment.lodEnabled });
      return environment.lodEnabled;
   }

   function setInstanceRenderingMode(mode) {
      const normalized = mode === "cloned" ? "cloned" : "instanced";
      if (typeof INSTANCE_POOL.setPreferredMode === "function") {
         INSTANCE_POOL.setPreferredMode(normalized);
      }
      scheduleProfilerHudSync();
      return normalized;
   }

   function getInstanceRenderingMode() {
      return typeof INSTANCE_POOL.getPreferredMode === "function"
         ? INSTANCE_POOL.getPreferredMode()
         : "instanced";
   }

   async function scatterVegetation(scene) {
      const terrain = environment.terrain;
      if (!terrain) return;

      clearTrees();

      const maxTreesSetting = Math.max(0, Math.round(terrain.settings?.maxTrees ?? defaultTerrainSettings.maxTrees));
      if (maxTreesSetting <= 0) {
         return;
      }

      environment.treeColumns = new Array(terrain.columns.length);

      const halfX = terrain.halfX;
      const halfZ = terrain.halfZ;
      if (halfX <= 6 || halfZ <= 6) return;

      const attempts = Math.max(maxTreesSetting * 4, maxTreesSetting * 2 + 8);
      let spawned = 0;
      for (let attempt = 0; attempt < attempts && spawned < maxTreesSetting; attempt++) {
         const x = rand(-halfX + 6, halfX - 6);
         const z = rand(-halfZ + 6, halfZ - 6);
         if (Math.sqrt(x * x + z * z) < 6) continue;
         const h = getTerrainHeight(x, z);
         if (h === null) continue;
         const hX = getTerrainHeight(x + 1.2, z);
         const hZ = getTerrainHeight(x, z + 1.2);
         if (hX === null || hZ === null) continue;
         if (Math.abs(h - hX) > 1.6 || Math.abs(h - hZ) > 1.6) continue;

         const columnIndex = terrainColumnIndexFromWorld(x, z);
         if (columnIndex < 0) continue;
         const dirtTop = getTerrainLayerTopForColumn(columnIndex, 1);
         if (dirtTop === null) continue;

         const scale = 0.8 + Math.random() * 1.2;
         const fallbackRoot = createFallbackTree(scene, `tree${spawned}`, new BABYLON.Vector3(x, dirtTop, z), scale);
         fallbackRoot.rotation.y = rand(0, Math.PI * 2);
         const childMeshes = fallbackRoot.getChildMeshes();
         const interactiveMeshes = [];
         const lodMeshes = [];
         const lodBindings = fallbackRoot.metadata?.lodBindings || [];
         const entry = {
            root: fallbackRoot,
            columnIndex,
            meshes: interactiveMeshes,
            lodMeshes,
            lodBindings,
            destroyed: false
         };
         fallbackRoot.metadata = { ...(fallbackRoot.metadata || {}), tree: entry };
         for (const mesh of childMeshes) {
            if (!mesh.metadata) mesh.metadata = {};
            if (mesh.metadata.lodProxy) {
               lodMeshes.push(mesh);
               mesh.isPickable = false;
               mesh.checkCollisions = false;
               continue;
            }
            mesh.metadata.treePart = entry;
            mesh.isPickable = true;
            mesh.checkCollisions = false;
            interactiveMeshes.push(mesh);
         }
         createTreeImpostors(scene, entry, childMeshes);
         applyTreeLOD(entry);
         if (!environment.treeColumns[columnIndex]) environment.treeColumns[columnIndex] = [];
         environment.treeColumns[columnIndex].push(entry);
         environment.trees.push(entry);
         setTreeEntryEnabled(entry, !!terrain.columnStates[columnIndex]);
         spawned++;
      }
   }

   function createCloudLayer(scene) {
      environment.clouds.forEach(c => c.mesh.dispose());
      environment.clouds = [];
      const cloudMat = new BABYLON.StandardMaterial("cloudMat", scene);
      cloudMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
      cloudMat.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.95);
      cloudMat.specularColor = BABYLON.Color3.Black();
      cloudMat.alpha = 0.8;
      cloudMat.disableLighting = true;
      cloudMat.backFaceCulling = false;
      const count = 7;
      for (let i = 0; i < count; i++) {
         const cloud = BABYLON.MeshBuilder.CreatePlane("cloud" + i, {
            width: 18 + Math.random() * 14,
            height: 8 + Math.random() * 6,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
         }, scene);
         cloud.material = cloudMat;
         cloud.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
         cloud.isPickable = false;
         cloud.position.set(rand(-world.size, world.size), 45 + Math.random() * 12, rand(-world.size, world.size));
         environment.clouds.push({
            mesh: cloud,
            speed: 1 + Math.random() * 1.4,
            drift: (Math.random() - 0.5) * 0.6
         });
      }
   }

   async function setupEnvironment(scene) {
      reseedEnvironment();
      clearTrees();
      INSTANCE_POOL.reset();
      environment.sky?.dispose();
      environment.sunMesh?.dispose();
      environment.moonMesh?.dispose();
      environment.sun?.dispose();
      environment.moon?.dispose();
      environment.hemi?.dispose();
      disposeTerrain();
      world.platforms = [];
      environment.updateAccumulator = 0;

      environment.hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
      environment.hemi.intensity = 0.35;
      environment.hemi.groundColor = new BABYLON.Color3(0.08, 0.1, 0.12);

      environment.sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.35), scene);
      environment.sun.diffuse = new BABYLON.Color3(1.0, 0.95, 0.88);
      environment.sun.specular = new BABYLON.Color3(1.0, 0.95, 0.9);

      environment.moon = new BABYLON.DirectionalLight("moon", new BABYLON.Vector3(0.5, -1, 0.35), scene);
      environment.moon.diffuse = new BABYLON.Color3(0.55, 0.62, 0.9);
      environment.moon.specular = new BABYLON.Color3(0.55, 0.62, 0.9);
      environment.moon.intensity = 0.0;

      environment.sky = BABYLON.MeshBuilder.CreateBox("sky", {
         size: SKY_RADIUS * 2
      }, scene);
      environment.sky.isPickable = false;
      environment.sky.infiniteDistance = true;
      const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
      skyMat.backFaceCulling = false;
      skyMat.disableLighting = true;
      skyMat.emissiveColor = new BABYLON.Color3(0.04, 0.06, 0.1);
      environment.sky.material = skyMat;
      environment.skyMaterial = skyMat;

      environment.sunMesh = BABYLON.MeshBuilder.CreateDisc("sunMesh", {
         radius: 8,
         tessellation: 32
      }, scene);
      const sunMat = new BABYLON.StandardMaterial("sunMat", scene);
      sunMat.diffuseColor = new BABYLON.Color3(1.0, 0.85, 0.55);
      sunMat.emissiveColor = new BABYLON.Color3(1.0, 0.85, 0.55);
      sunMat.specularColor = BABYLON.Color3.Black();
      sunMat.disableLighting = true;
      sunMat.backFaceCulling = false;
      environment.sunMesh.material = sunMat;
      environment.sunMesh.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
      environment.sunMesh.isPickable = false;

      environment.moonMesh = BABYLON.MeshBuilder.CreateDisc("moonMesh", {
         radius: 6,
         tessellation: 30
      }, scene);
      const moonMat = new BABYLON.StandardMaterial("moonMat", scene);
      moonMat.diffuseColor = new BABYLON.Color3(0.85, 0.9, 1.0);
      moonMat.emissiveColor = new BABYLON.Color3(0.7, 0.76, 1.0);
      moonMat.specularColor = BABYLON.Color3.Black();
      moonMat.disableLighting = true;
      moonMat.backFaceCulling = false;
      environment.moonMesh.material = moonMat;
      environment.moonMesh.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
      environment.moonMesh.isPickable = false;

      createTerrain(scene);
	  await precompileTerrainMaterials(scene);
      await scatterVegetation(scene);
      createCloudLayer(scene);
      updateEnvironment(240);
      applyQualityPreset(adaptiveQuality.currentLevel);
      updateHudAdaptiveQuality();
   }

   function advanceEnvironment(dt) {
      environment.updateAccumulator += dt;
      if (environment.updateAccumulator < environment.updateInterval) return;
      const step = environment.updateAccumulator;
      environment.updateAccumulator = 0;
      updateEnvironment(step);
   }

   function updateEnvironment(dt) {
      if (!environment.sun || !environment.skyMaterial) return;
      environment.time = environment.dayLength * getCurrentDayPhase();
      const phase = environment.time / environment.dayLength;
      const angle = phase * Math.PI * 2;
      const sunPos = new BABYLON.Vector3(Math.cos(angle) * SKY_RADIUS, Math.sin(angle) * SKY_RADIUS, Math.sin(angle * 0.6) * SKY_RADIUS);
      const moonAngle = angle + Math.PI;
      const moonPos = new BABYLON.Vector3(Math.cos(moonAngle) * SKY_RADIUS, Math.sin(moonAngle) * SKY_RADIUS, Math.sin(moonAngle * 0.6) * SKY_RADIUS);
      environment.sun.position.copyFrom(sunPos);
      environment.sun.direction = sunPos.clone().normalize().scale(-1);
      environment.moon.position.copyFrom(moonPos);
      environment.moon.direction = moonPos.clone().normalize().scale(-1);
      environment.sunMesh.position.copyFrom(sunPos);
      environment.moonMesh.position.copyFrom(moonPos);

      const sunHeight = sunPos.y / SKY_RADIUS;
      const moonHeight = moonPos.y / SKY_RADIUS;
      const daylight = clamp((sunHeight + 0.1) / 1.1, 0, 1);
      const nightLight = clamp((moonHeight + 0.25) / 1.3, 0, 1);
      const sunIntensity = Math.max(0, sunHeight);
      environment.sun.intensity = sunIntensity > 0 ? 0.25 + sunIntensity * 1.15 : 0;
      environment.moon.intensity = nightLight * 0.35;
      if (environment.hemi) {
         environment.hemi.intensity = 0.18 + daylight * 0.35 + nightLight * 0.1;
      }

      const dayColor = new BABYLON.Color3(0.48, 0.68, 0.9);
      const duskColor = new BABYLON.Color3(0.28, 0.32, 0.5);
      const nightColor = new BABYLON.Color3(0.03, 0.05, 0.09);
      const skyBlend = daylight * daylight;
      const twilight = clamp((sunHeight + 0.4) / 0.7, 0, 1);
      const skyDay = BABYLON.Color3.Lerp(duskColor, dayColor, skyBlend);
      const skyTint = BABYLON.Color3.Lerp(nightColor, skyDay, twilight);
      environment.skyMaterial.emissiveColor = skyTint;
      scene.clearColor = new BABYLON.Color4(skyTint.r, skyTint.g, skyTint.b, 1);
      scene.ambientColor = BABYLON.Color3.Lerp(new BABYLON.Color3(0.08, 0.1, 0.14), new BABYLON.Color3(0.32, 0.34, 0.4), twilight);
      environment.sunMesh.isVisible = sunHeight > -0.1;
      environment.moonMesh.isVisible = moonHeight > -0.4;

      const cloudLimit = world.size / 2 + 60;
      environment.clouds.forEach(cloud => {
         const { mesh, speed, drift } = cloud;
         mesh.position.x += speed * dt;
         mesh.position.z += drift * dt;
         if (mesh.position.x > cloudLimit) mesh.position.x = -cloudLimit;
         if (mesh.position.x < -cloudLimit) mesh.position.x = cloudLimit;
         if (mesh.position.z > cloudLimit) mesh.position.z = -cloudLimit;
         if (mesh.position.z < -cloudLimit) mesh.position.z = cloudLimit;
      });
   }
   // ===== Save helpers =====
   const SAVE_KEYS = {
      progress: "hxh.progress",
      character: "hxh.character",
      runtime: "hxh.runtime"
   };

   const RUNTIME_SAVE_DEBOUNCE = 1200;
   let runtimeSaveTimer = null;
   let lastRuntimeSnapshot = null;
   let devHotkeyHandler = null;
   let regionChangeUnsub = null;

   const EMPTY_ANIMATION_LIBRARY = { version: 1, active: null, clips: {} };
   let cachedAnimationLibrary = null;

   function sanitizeAnimationKeyframe(entry) {
      if (!entry || typeof entry !== "object") return null;
      const frame = Math.round(Number(entry.frame));
      if (!Number.isFinite(frame)) return null;
      const ease = typeof entry.ease === "string" && entry.ease.trim() ? entry.ease.trim() : "linear";
      const valueSource = entry.value;
      let value;
      if (valueSource && typeof valueSource === "object") {
         const x = Number(valueSource.x);
         const y = Number(valueSource.y);
         const z = Number(valueSource.z);
         value = {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            z: Number.isFinite(z) ? z : 0
         };
      } else {
         const num = Number(valueSource);
         value = Number.isFinite(num) ? num : 0;
      }
      return { frame, value, ease };
   }

   function sanitizeAnimationClipSnapshot(name, clip) {
      if (!clip || typeof clip !== "object") return null;
      const rawName = typeof clip.name === "string" && clip.name.trim()
         ? clip.name.trim()
         : (typeof name === "string" && name.trim() ? name.trim() : null);
      if (!rawName) return null;
      const fpsNum = Number(clip.fps);
      const fps = Number.isFinite(fpsNum) && fpsNum > 0 ? Math.max(1, Math.min(480, Math.round(fpsNum))) : 30;
      const rangeSource = Array.isArray(clip.range)
         ? { start: clip.range[0], end: clip.range[1] }
         : (clip.range && typeof clip.range === "object" ? clip.range : {});
      let start = Number(rangeSource.start);
      let end = Number(rangeSource.end);
      if (!Number.isFinite(start)) start = 0;
      start = Math.max(0, Math.round(start));
      if (!Number.isFinite(end)) end = start + fps;
      end = Math.max(start + 1, Math.round(end));
      const joints = {};
      const sourceJoints = clip.joints && typeof clip.joints === "object" ? clip.joints : {};
      Object.keys(sourceJoints).forEach(joint => {
         const jointData = sourceJoints[joint];
         if (!jointData || typeof jointData !== "object") return;
         const sanitizedChannels = {};
         const channelDefs = [
            { key: "position", aliases: ["position", "pos"] },
            { key: "rotation", aliases: ["rotation", "rot"] },
            { key: "scale", aliases: ["scale", "scl"] }
         ];
         channelDefs.forEach(({ key, aliases }) => {
            let channelSource = null;
            for (const alias of aliases) {
               if (Array.isArray(jointData[alias])) {
                  channelSource = jointData[alias];
                  break;
               }
            }
            if (!channelSource) return;
            const map = new Map();
            channelSource.forEach(entry => {
               const sanitized = sanitizeAnimationKeyframe(entry);
               if (!sanitized) return;
               map.set(sanitized.frame, sanitized);
            });
            if (!map.size) return;
            const keys = Array.from(map.values()).sort((a, b) => a.frame - b.frame);
            sanitizedChannels[key] = keys;
         });
         if (Object.keys(sanitizedChannels).length) {
            joints[joint] = sanitizedChannels;
         }
      });
      return {
         name: rawName,
         fps,
         range: { start, end },
         joints
      };
   }

   function sanitizeAnimationLibrarySnapshot(snapshot) {
      const result = { version: 1, active: null, clips: {} };
      if (!snapshot || typeof snapshot !== "object") return result;
      const pushClip = (name, data) => {
         const sanitized = sanitizeAnimationClipSnapshot(name, data);
         if (!sanitized) return;
         if (!result.clips[sanitized.name]) {
            result.clips[sanitized.name] = sanitized;
         }
      };
      if (Array.isArray(snapshot)) {
         snapshot.forEach(entry => pushClip(entry?.name, entry));
      }
      if (Array.isArray(snapshot?.clips)) {
         snapshot.clips.forEach(entry => pushClip(entry?.name, entry));
      }
      if (snapshot?.clips && typeof snapshot.clips === "object" && !Array.isArray(snapshot.clips)) {
         Object.entries(snapshot.clips).forEach(([name, data]) => pushClip(name, data));
      }
      if (snapshot?.animations && typeof snapshot.animations === "object") {
         Object.entries(snapshot.animations).forEach(([name, data]) => pushClip(name, data));
      }
      if (!Array.isArray(snapshot) && typeof snapshot === "object") {
         Object.entries(snapshot).forEach(([name, data]) => {
            if (["clips", "animations", "active", "activeName", "current", "version"].includes(name)) return;
            if (data && typeof data === "object" && (data.joints || data.range || data.fps)) {
               pushClip(name, data);
            }
         });
      }
      const activeCandidates = [snapshot.active, snapshot.activeName, snapshot.current]
         .filter(value => typeof value === "string" && value);
      for (const candidate of activeCandidates) {
         if (result.clips[candidate]) {
            result.active = candidate;
            break;
         }
      }
      if (!result.active) {
         const names = Object.keys(result.clips);
         if (names.length) {
            result.active = names.includes("Base") ? "Base" : names[0];
         }
      }
      return result;
   }

   function loadStoredAnimationLibrary() {
      if (typeof localStorage === "undefined") return null;
      try {
         const raw = localStorage.getItem(ANIMATION_STORAGE_KEY);
         if (!raw) return null;
         const parsed = JSON.parse(raw);
         return sanitizeAnimationLibrarySnapshot(parsed);
      } catch (err) {
         return null;
      }
   }

   function getAnimationLibrarySnapshot() {
      if (!cachedAnimationLibrary) {
         const stored = loadStoredAnimationLibrary();
         cachedAnimationLibrary = stored
            ? sanitizeAnimationLibrarySnapshot(stored)
            : JSON.parse(JSON.stringify(EMPTY_ANIMATION_LIBRARY));
      }
      return JSON.parse(JSON.stringify(cachedAnimationLibrary));
   }

   function saveAnimationLibrarySnapshot(snapshot, options = {}) {
      const { emit = true } = options;
      const sanitized = sanitizeAnimationLibrarySnapshot(snapshot || EMPTY_ANIMATION_LIBRARY);
      cachedAnimationLibrary = JSON.parse(JSON.stringify(sanitized));
      if (typeof localStorage !== "undefined") {
         try {
            if (Object.keys(sanitized.clips).length) {
               localStorage.setItem(ANIMATION_STORAGE_KEY, JSON.stringify(cachedAnimationLibrary));
            } else {
               localStorage.removeItem(ANIMATION_STORAGE_KEY);
            }
         } catch (err) {}
      }
      if (emit) scheduleRuntimeSave();
      return getAnimationLibrarySnapshot();
   }

   function hasSave() {
      try {
         return !!localStorage.getItem(SAVE_KEYS.character);
      } catch {
         return false;
      }
   }
          window.hasSave = hasSave;
          window.loadCharacter = loadCharacter;
          window.saveCharacter = saveCharacter;
          window.wipeSave = wipeSave;
          window.loadRuntimeState = loadRuntimeState;
          window.saveRuntimeState = saveRuntimeState;
          window.scheduleRuntimeSave = scheduleRuntimeSave;

   function loadCharacter() {
      try {
         return JSON.parse(localStorage.getItem(SAVE_KEYS.character) || "null");
      } catch {
         return null;
      }
   }

   function saveCharacter(ch) {
      try {
         localStorage.setItem(SAVE_KEYS.character, JSON.stringify(ch));
      } catch {}
   }

   function wipeSave() {
      try {
         localStorage.removeItem(SAVE_KEYS.progress);
         localStorage.removeItem(SAVE_KEYS.character);
         localStorage.removeItem(SAVE_KEYS.runtime);
         localStorage.removeItem(VOW_STORAGE_KEY);
         lastRuntimeSnapshot = null;
      } catch {}
      if (runtimeSaveTimer) {
         clearTimeout(runtimeSaveTimer);
         runtimeSaveTimer = null;
      }
   }

   function loadRuntimeState() {
      try {
         const raw = localStorage.getItem(SAVE_KEYS.runtime);
         if (!raw) {
            lastRuntimeSnapshot = null;
            return null;
         }
         lastRuntimeSnapshot = raw;
         const parsed = JSON.parse(raw);
         return parsed && typeof parsed === "object" ? parsed : null;
      } catch (err) {
         console.warn("[HXH] Failed to load runtime state", err);
         lastRuntimeSnapshot = null;
         return null;
      }
   }

   function saveRuntimeState(snapshot = null) {
      try {
         const data = snapshot || buildRuntimeSnapshot();
         if (!data) return null;
         const serialized = JSON.stringify(data);
         if (lastRuntimeSnapshot === serialized) return data;
         localStorage.setItem(SAVE_KEYS.runtime, serialized);
         lastRuntimeSnapshot = serialized;
         return data;
      } catch (err) {
         console.warn("[HXH] Failed to store runtime state", err);
         return null;
      }
   }

   function scheduleRuntimeSave({ immediate = false } = {}) {
      if (immediate) {
         if (runtimeSaveTimer) {
            clearTimeout(runtimeSaveTimer);
            runtimeSaveTimer = null;
         }
         return saveRuntimeState();
      }
      if (runtimeSaveTimer) return runtimeSaveTimer;
      runtimeSaveTimer = setTimeout(() => {
         runtimeSaveTimer = null;
         saveRuntimeState();
      }, RUNTIME_SAVE_DEBOUNCE);
      return runtimeSaveTimer;
   }

   // ------- Save / progress (with migration from old 5-stat allocs) -------
   let progress = null;
   try {
      progress = JSON.parse(localStorage.getItem("hxh.progress") || "null") || null;
   } catch (e) {
      progress = null;
   }
   if (!progress) progress = {
      level: 1,
      xp: 0,
      unspent: 0,
      alloc: {
         power: 0,
         agility: 0,
         focus: 0
      },
      training: makeDefaultTrainingProgress()
   };

   if (!progress.training || typeof progress.training !== "object") {
      progress.training = makeDefaultTrainingProgress();
   }
   TRAINING_KEYS.forEach(key => {
      const raw = Number(progress.training[key]);
      const cap = TRAINING_LIMITS[key] ?? 0;
      const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(cap, Math.floor(raw))) : 0;
      progress.training[key] = clamped;
   });

   // migrate old alloc {nen, attack, hp, nenRegen, hpRegen} -> refund to unspent
   if (progress.alloc && ("nen" in progress.alloc || "hp" in progress.alloc)) {
      const old = progress.alloc;
      const refunded = (old.nen || 0) + (old.attack || 0) + (old.hp || 0) + (old.nenRegen || 0) + (old.hpRegen || 0);
      progress.alloc = {
         power: 0,
         agility: 0,
         focus: 0
      };
      progress.unspent = (progress.unspent || 0) + refunded;
      saveProgress();
   }

   function saveProgress() {
      localStorage.setItem("hxh.progress", JSON.stringify(progress));
      scheduleRuntimeSave();
   }

   function xpToNext(level) {
      return Math.floor(40 + Math.pow(level, 1.35) * 25);
   }

   function gainXP(amount) {
      if (progress.level >= 410) return;
      progress.xp += amount;
      while (progress.level < 410 && progress.xp >= xpToNext(progress.level)) {
         progress.xp -= xpToNext(progress.level);
         progress.level++;
         progress.unspent++;
         msg(`Level up! Now level ${progress.level}. Press L to allocate.`);
      }
      updateHUD();
      saveProgress();
   }

   function getTrainingLevel(key) {
      if (!TRAINING_KEYS.includes(key)) return 0;
      const cap = TRAINING_LIMITS[key] ?? 0;
      const raw = Number(progress.training?.[key]);
      if (!Number.isFinite(raw)) return 0;
      return Math.max(0, Math.min(cap, Math.floor(raw)));
   }

   function getTrainingProgressSnapshot() {
      const snapshot = {};
      TRAINING_KEYS.forEach(key => {
         snapshot[key] = getTrainingLevel(key);
      });
      return snapshot;
   }

   function getTrainingCapsSnapshot() {
      return { ...state.trainingCaps };
   }

   function recomputeTrainingEffects({ silent = false } = {}) {
      const renLevel = getTrainingLevel("renHold");
      const gyoLevel = getTrainingLevel("gyoFocus");
      const ryuLevel = getTrainingLevel("ryuDrill");
      const shuLevel = getTrainingLevel("shuEfficiency");

      const renDurationCap = 6 + renLevel * 1.8;
      const renRecoveryRate = 1.5 + renLevel * 0.45;
      const renBonusMul = renLevel * 0.04;

      const gyoCritCap = 0.12 + gyoLevel * 0.04;
      const gyoCritScale = 0.012 + gyoLevel * 0.006;

      const ryuVulnFactor = Math.max(0.42, 1 - 0.14 * ryuLevel);
      const ryuGuardBonus = 0.02 * ryuLevel;

      const shuDamageMul = 1.3 + shuLevel * 0.08;
      const shuDurabilityScalar = Math.max(0.35, 0.65 - 0.05 * shuLevel);
      const shuPierce = 1 + (shuLevel >= 4 ? 1 : 0);

      state.trainingCaps = {
         renDurationCap,
         renRecoveryRate,
         renBonusMul,
         gyoCritCap,
         gyoCritScale,
         ryuVulnFactor,
         ryuGuardBonus,
         shuDamageMul,
         shuDurabilityScalar,
         shuPierce
      };

      const aura = state.aura;
      if (aura) {
         aura.renStaminaMax = renDurationCap;
         if (!Number.isFinite(aura.renStamina)) {
            aura.renStamina = renDurationCap;
         } else {
            aura.renStamina = Math.min(aura.renStamina, renDurationCap);
         }
      }

      if (silent) {
         updateAuraHud();
      } else {
         notifyAuraChange();
      }
      scheduleRuntimeSave();
   }

   function upgradeTraining(key, { silent = false } = {}) {
      if (!TRAINING_KEYS.includes(key)) {
         return { success: false, level: 0 };
      }
      const cap = TRAINING_LIMITS[key] ?? 0;
      const current = getTrainingLevel(key);
      if (current >= cap) {
         return { success: false, level: current, capped: true };
      }
      progress.training[key] = current + 1;
      recomputeTrainingEffects({ silent });
      saveProgress();
      if (!silent) {
         msg(`${TRAINING_LABELS[key] || key} advanced to rank ${current + 1}.`);
      }
      return { success: true, level: current + 1 };
   }

   function setCooldown(key, dur) {
      state.cooldowns[key] = {
         t: dur,
         max: dur
      };
      markCooldownDirty();
   }

   function cdActive(key) {
      return state.cooldowns[key] && state.cooldowns[key].t > 0;
   }

   function markCooldownDirty() {
      cooldownUiAccumulator = COOLDOWN_UI_INTERVAL;
   }

   function setHudBarWidth(el, pct, key) {
      if (!el) return false;
      const clamped = clamp(Number.isFinite(pct) ? pct : 0, 0, 1);
      const last = hudState.bars[key];
      if (last < 0 || Math.abs(last - clamped) > HUD_BAR_EPS) {
         el.style.width = `${clamped * 100}%`;
         hudState.bars[key] = clamped;
         return true;
      }
      return false;
   }

   function updateHealthHud() {
      if (setHudBarWidth(hud.health, state.hp / state.maxHP, "health")) {
         scheduleRuntimeSave();
      }
   }

   function updateNenHud() {
      const changed = setHudBarWidth(hud.nenbar, state.nen.cur / state.nen.max, "nen");
      if (hud.nenbarWrap) {
         const summary = state.nenDrainSummary || "None";
         if (typeof hud.nenbarWrap.attr === "function") {
            hud.nenbarWrap.attr("title", `Nen drains: ${summary}`);
         } else if (hud.nenbarWrap.setAttribute) {
            hud.nenbarWrap.setAttribute("title", `Nen drains: ${summary}`);
         } else if (hud.nenbarWrap[0]?.setAttribute) {
            hud.nenbarWrap[0].setAttribute("title", `Nen drains: ${summary}`);
         }
      }
      if (changed) scheduleRuntimeSave();
   }

   function updateXpHud(pct) {
      setHudBarWidth(hud.xpbar, pct, "xp");
   }

   function computeFlowGroupTotals(flow = state.flow) {
      return FLOW_GROUPS.map(group => {
         const total = group.limbs.reduce((acc, limb) => acc + (flow?.[limb] ?? 0), 0);
         return { ...group, value: total };
      });
   }

   function getDominantFlowZone(flow = state.flow) {
      const totals = computeFlowGroupTotals(flow);
      let dominant = null;
      for (const entry of totals) {
         if (!dominant || entry.value > dominant.value) {
            dominant = entry;
         }
      }
      return dominant;
   }

   function getFlowSnapshot() {
      const values = {};
      for (const key of FLOW_LIMB_KEYS) {
         values[key] = state.flow?.[key] ?? 0;
      }
      const groups = computeFlowGroupTotals(state.flow).map(({ key, label, value }) => ({ key, label, value }));
      const focus = getDominantFlowZone(state.flow);
      return {
         presetKey: state.flowPresetKey,
         presetLabel: state.flowPresetLabel,
         values,
         groups,
         focus: focus ? { key: focus.key, label: focus.label, value: focus.value } : null,
         vulnerable: state.koVulnerabilityT > 0
      };
   }

   function updateFlowHud() {
      if (!hud.flowPie) return;
      const totals = computeFlowGroupTotals(state.flow);
      const totalValue = totals.reduce((sum, entry) => sum + entry.value, 0) || 1;
      let cursor = 0;
      const segments = totals.map(entry => {
         const pct = entry.value / totalValue;
         const start = cursor;
         cursor += pct;
         return { ...entry, pct, start, end: cursor };
      });
      if (!segments.length) {
         hud.flowPie.style.background = "conic-gradient(#243356 0deg 360deg)";
      } else {
         const gradient = segments.map(segment => {
            const startPct = (segment.start * 100).toFixed(2);
            const endPct = (segment.end * 100).toFixed(2);
            return `${segment.color} ${startPct}% ${endPct}%`;
         }).join(", ");
         hud.flowPie.style.background = `conic-gradient(${gradient})`;
      }
      const focus = getDominantFlowZone(state.flow);
      if (hud.flowLabel) {
         let text = `Ryu: ${state.flowPresetLabel || "Flow"}`;
         if (focus) text += ` • ${focus.label}`;
         if (state.koVulnerabilityT > 0) {
            text += state.koLastFocus ? ` — Ko Vulnerable (${state.koLastFocus})` : " — Ko Vulnerable";
         }
         hud.flowLabel.textContent = text;
      }
      if (hud.flowLegendEntries) {
         for (const segment of segments) {
            const entry = hud.flowLegendEntries.get(segment.key);
            if (!entry) continue;
            entry.value.textContent = `${segment.label} ${(segment.pct * 100).toFixed(0)}%`;
            entry.row.style.opacity = segment.pct > 0 ? "1" : "0.55";
            entry.row.style.fontWeight = focus && focus.key === segment.key ? "600" : "400";
         }
      }
      if (hud.flowWrap) {
         const kenActive = !!state.aura?.ken && !state.aura?.zetsu;
         hud.flowWrap.style.opacity = kenActive ? "1" : "0.6";
      }
      const vulnerable = state.koVulnerabilityT > 0;
      if (hud.flowPie) {
         hud.flowPie.style.boxShadow = vulnerable ? "0 0 14px rgba(255,90,90,0.7)" : "0 0 0 rgba(0,0,0,0)";
         hud.flowPie.style.borderColor = vulnerable ? "rgba(255,120,120,0.7)" : "rgba(255,255,255,0.16)";
      }
      hudState.flowPresetKey = state.flowPresetKey;
      hudState.flowFocus = focus?.key ?? null;
      hudState.flowVulnerable = vulnerable;
   }

   function notifyFlowChange({ silent = false } = {}) {
      updateFlowHud();
      const creatorHandler = window.CharacterCreator && typeof window.CharacterCreator.handleFlowSnapshot === "function"
         ? window.CharacterCreator.handleFlowSnapshot
         : null;
      const hasListeners = flowListeners.size > 0;
      if (!hasListeners && !creatorHandler) return;
      const snapshot = getFlowSnapshot();
      if (hasListeners) {
         for (const listener of flowListeners) {
            try {
               listener(snapshot);
            } catch (err) {
               console.error("Flow listener error", err);
            }
         }
      }
      if (creatorHandler) {
         try {
            creatorHandler(snapshot);
         } catch (err) {
            console.warn("[Game] Failed to deliver flow snapshot to CharacterCreator", err);
         }
      }
   }

   function subscribeFlow(listener) {
      if (typeof listener !== "function") return () => {};
      flowListeners.add(listener);
      return () => flowListeners.delete(listener);
   }

   function applyFlowPreset(index, { silent = false } = {}) {
      if (!FLOW_PRESETS.length) return false;
      if (!Number.isFinite(index)) return false;
      const len = FLOW_PRESETS.length;
      const nextIndex = ((Math.round(index) % len) + len) % len;
      const preset = FLOW_PRESETS[nextIndex];
      const previousKey = state.flowPresetKey;
      Object.assign(state.flow, makeFlowFromGroups(preset.groups));
      state.flowPresetIndex = nextIndex;
      state.flowPresetKey = preset.key;
      state.flowPresetLabel = preset.label;
      notifyFlowChange({ silent });
      if (!silent && previousKey !== preset.key) {
         msg(`Ryu stance: ${preset.label}`);
      }
      return previousKey !== preset.key;
   }

   function rotateFlowPreset(direction) {
      if (!FLOW_PRESETS.length) return false;
      const delta = direction > 0 ? 1 : -1;
      const len = FLOW_PRESETS.length;
      const nextIndex = (state.flowPresetIndex + delta + len) % len;
      if (nextIndex === state.flowPresetIndex) return false;
      return applyFlowPreset(nextIndex);
   }

   function updateAuraHud() {
      if (!hud.auraBadges) return;
      const caps = state.trainingCaps || makeDefaultTrainingCaps();
      const renRank = getTrainingLevel("renHold");
      const gyoRank = getTrainingLevel("gyoFocus");
      const ryuRank = getTrainingLevel("ryuDrill");
      const shuRank = getTrainingLevel("shuEfficiency");
      const renLimit = TRAINING_LIMITS.renHold;
      const gyoLimit = TRAINING_LIMITS.gyoFocus;
      const ryuLimit = TRAINING_LIMITS.ryuDrill;
      const shuLimit = TRAINING_LIMITS.shuEfficiency;
      const holdCap = caps.renDurationCap ?? 6;
      const regenRate = caps.renRecoveryRate ?? 1.5;
      const renBonusPct = Math.round(Math.max(0, (caps.renBonusMul ?? 0) * 100));
      const gyoCapPct = Math.round(Math.max(0, (caps.gyoCritCap ?? 0) * 100));
      const gyoScalePct = Math.round(Math.max(0, (caps.gyoCritScale ?? 0) * 100));
      const vulnDrop = Math.round(Math.max(0, (1 - (caps.ryuVulnFactor ?? 1)) * 100));
      const guardBonus = Math.round(Math.max(0, (caps.ryuGuardBonus ?? 0) * 100));
      const shuDmgPct = Math.round(Math.max(0, ((caps.shuDamageMul ?? 1.3) - 1) * 100));
      const shuDuraSave = Math.round(Math.max(0, (1 - (caps.shuDurabilityScalar ?? 0.65)) * 100));
      const shuPierce = Math.max(1, Math.round(caps.shuPierce ?? 1));
      for (const [key, data] of hud.auraBadges.entries()) {
         const { badge, spec } = data;
         const active = key === "en" ? !!state.aura.en?.on : !!state.aura[key];
         badge.textContent = `${spec.label}: ${active ? "ON" : "OFF"}`;
         badge.style.background = active ? "rgba(80,200,255,0.25)" : "rgba(255,255,255,0.08)";
         badge.style.borderColor = active ? "rgba(120,220,255,0.55)" : "rgba(255,255,255,0.18)";
         switch (key) {
            case "ren": {
               const rank = renRank;
               const limit = renLimit;
               const holdSec = holdCap;
               const regen = regenRate;
               const renTitle = [
                  `Ren hold cap ${holdSec.toFixed(1)}s`,
                  `Regen ${regen.toFixed(1)}s/s`,
                  `Rank ${rank}/${limit}`,
                  `Bonus +${renBonusPct}%`
               ].join(" • ");
               badge.title = renTitle;
               break;
            }
            case "gyo": {
               const rank = gyoRank;
               const limit = gyoLimit;
               badge.title = `Crit window cap +${gyoCapPct}% • ${gyoScalePct}% per Focus • Rank ${rank}/${limit}`;
               break;
            }
            case "shu": {
               const rank = shuRank;
               const limit = shuLimit;
               const shuTitle = [
                  `Weapon aura +${shuDmgPct}%`,
                  `Durability saved ${shuDuraSave}%`,
                  `Pierce ${shuPierce}`,
                  `Rank ${rank}/${limit}`
               ].join(" • ");
               badge.title = shuTitle;
               break;
            }
            default:
               if (!badge.title) badge.title = spec.label;
               break;
         }
      }
      if (hud.flowLabel) {
         const rank = ryuRank;
         const limit = ryuLimit;
         hud.flowLabel.title = `Ryu drill rank ${rank}/${limit} — Ko vulnerability -${vulnDrop}% duration, guard bonus +${guardBonus}% on reads.`;
      }
      if (hud.trainingButton) {
         const summary = [
            `Ren ${holdCap.toFixed(1)}s`,
            `Regen ${regenRate.toFixed(1)}s/s`,
            `Gyo crit +${gyoCapPct}%`,
            `Ryu guard +${guardBonus}%`,
            `Shu dmg +${shuDmgPct}%`
         ].join(" • ");
         hud.trainingButton.title = `${summary} — ranks Ren ${renRank}/${renLimit}, Gyo ${gyoRank}/${gyoLimit}, Ryu ${ryuRank}/${ryuLimit}, Shu ${shuRank}/${shuLimit}`;
      }
      if (hud.trainingHint) {
         hud.trainingHint.textContent = `Ren ${renRank}/${renLimit} • Gyo ${gyoRank}/${gyoLimit} • Ryu ${ryuRank}/${ryuLimit} • Shu ${shuRank}/${shuLimit}`;
      }
   }

   function getAuraSnapshot() {
      return {
         ...state.aura,
         en: { ...state.aura.en }
      };
   }

   function notifyAuraChange() {
      updateAuraHud();
      updateFlowHud();
      for (const listener of auraListeners) {
         try {
            listener(getAuraSnapshot());
         } catch (err) {
            console.error("Aura listener error", err);
         }
      }
      scheduleRuntimeSave();
   }

   function subscribeAura(listener) {
      if (typeof listener !== "function") return () => {};
      auraListeners.add(listener);
      return () => auraListeners.delete(listener);
   }

   function updateCooldownUI(dt = 0) {
      cooldownUiAccumulator += dt;
      if (cooldownUiAccumulator < COOLDOWN_UI_INTERVAL) return;
      cooldownUiAccumulator = 0;
      const targets = [
         { el: hud.cdQ, key: "nenblast" },
         { el: hud.cdE, key: "special" },
         { el: hud.cdDash, key: "dash" }
      ];
      for (const { el, key } of targets) {
         if (!el) continue;
         const cdState = hudState.cooldowns[key];
         const cooldown = state.cooldowns[key];
         if (!cooldown) {
            if (cdState.active || cdState.pct !== 1) {
               el.classList.remove("cooling");
               el.style.setProperty("--pct", "100%");
               cdState.active = false;
               cdState.pct = 1;
            }
            continue;
         }
         const pct = clamp(cooldown.t / cooldown.max, 0, 1);
         if (!cdState.active) {
            el.classList.add("cooling");
            cdState.active = true;
         }
         if (cdState.pct < 0 || Math.abs(cdState.pct - pct) > 0.01) {
            el.style.setProperty("--pct", `${pct * 100}%`);
            cdState.pct = pct;
         }
      }
   }

   function msg(s) {
      hud.msg.textContent = s;
   }

   function updateHUD() {
      hud.name.textContent = state.ch.name || "Hunter";
      if (hud.nenInfo) {
         hud.nenInfo.textContent = `${state.ch.nen} — ${state.ch.clan || "Wanderer"}`;
      } else if (hud.nen) {
         hud.nen.textContent = `${state.ch.nen} — ${state.ch.clan || "Wanderer"}`;
      }
      hud.level.textContent = `Lv ${progress.level}  •  Points: ${progress.unspent}`;
      updateHealthHud();
      updateNenHud();
      updateAuraHud();
      updateFlowHud();
      const req = xpToNext(progress.level);
      const pct = progress.level >= 410 ? 1 : (progress.xp / req);
      updateXpHud(pct);
   }

   // ===== Rig loader (shared with the Rig Editor) =====
   const RIG_KEY = "hxh.rig.params";
   const ANIMATION_STORAGE_KEY = "hxh.anim.clips";
   const COSMETIC_STORAGE_KEY = "hxh.cosmetics";
   const d2r = (d) => d * Math.PI / 180;
   const t0 = () => ({
      pos: {
         x: 0,
         y: 0,
         z: 0
      },
      rot: {
         x: 0,
         y: 0,
         z: 0
      }
   });

   // all transformable parts
   const PART_KEYS = [
      "pelvis", "torsoLower", "torsoUpper", "neck", "head",
      "shoulderL", "armL_upper", "armL_fore", "armL_hand",
      "shoulderR", "armR_upper", "armR_fore", "armR_hand",
      "hipL", "legL_thigh", "legL_shin", "legL_foot",
   "hipR", "legR_thigh", "legR_shin", "legR_foot",
  ];

   const TMP_RIG_EULER = new BABYLON.Vector3();

   function getNodeEuler(node) {
      if (!node) return { x: 0, y: 0, z: 0 };
      if (node.rotationQuaternion) {
         node.rotationQuaternion.toEulerAnglesToRef(TMP_RIG_EULER);
         return { x: TMP_RIG_EULER.x, y: TMP_RIG_EULER.y, z: TMP_RIG_EULER.z };
      }
      const rot = node.rotation || { x: 0, y: 0, z: 0 };
      return { x: rot.x || 0, y: rot.y || 0, z: rot.z || 0 };
   }

   function setNodeEuler(node, euler) {
      if (!node) return;
      const x = Number(euler?.x) || 0;
      const y = Number(euler?.y) || 0;
      const z = Number(euler?.z) || 0;
      if (node.rotation) node.rotation.set(x, y, z);
      if (!node.rotationQuaternion) node.rotationQuaternion = new BABYLON.Quaternion();
      BABYLON.Quaternion.FromEulerAnglesToRef(x, y, z, node.rotationQuaternion);
   }

   function syncRigNodesToQuaternion(map) {
      if (!map) return;
      for (const key of PART_KEYS) {
         const node = map[key];
         if (!node) continue;
         const rot = node.rotation || TMP_RIG_EULER;
         setNodeEuler(node, rot);
      }
   }

   function syncRigNodesFromQuaternion(map) {
      if (!map) return;
      for (const key of PART_KEYS) {
         const node = map[key];
         if (!node) continue;
         if (node.rotationQuaternion) {
            node.rotationQuaternion.toEulerAnglesToRef(node.rotation ?? TMP_RIG_EULER);
         } else {
            setNodeEuler(node, node.rotation || TMP_RIG_EULER);
         }
      }
   }

   // default sizes + *sane default transforms* (shoulders/hips start in a T-pose)
   const DEFAULT_RIG = {
      color: "#804a00",
      pelvis: {
         w: 0.850,
         h: 0.350,
         d: 0.520
      },
      torsoLower: {
         w: 0.9,
         h: 0.45,
         d: 0.55
      },
      torsoUpper: {
         w: 0.95,
         h: 0.71,
         d: 0.55
      },
      neck: {
         w: 0.25,
         h: 0.25,
         d: 0.25
      },
      head: {
         w: 0.52,
         h: 0.52,
         d: 0.52
      },
      arm: {
         upperW: 0.34,
         upperD: 0.34,
         upperLen: 0.75,
         foreW: 0.30,
         foreD: 0.27,
         foreLen: 0.70,
         handLen: 0.25
      },
      leg: {
         thighW: 0.45,
         thighD: 0.50,
         thighLen: 1.05,
         shinW: 0.33,
         shinD: 0.43,
         shinLen: 0.88,
         footW: 0.32,
         footH: 0.21,
         footLen: 0.75
      },
      transforms: {
         pelvis: {
            ...t0(),
            pos: {
               x: 0,
               y: 1.19,
               z: 0
            }
         },
         torsoLower: {
            ...t0(),
            pos: {
               x: 0,
               y: 0.45,
               z: 0
            }
         },
         torsoUpper: {
            ...t0(),
            pos: {
               x: 0,
               y: 0.71,
               z: 0
            }
         },
         neck: {
            ...t0(),
            pos: {
               x: 0,
               y: 0.25,
               z: 0
            }
         },
         head: t0(),
         shoulderL: {
            ...t0(),
            pos: {
               x: -0.65,
               y: 0,
               z: 0
            },
            rot: {
               x: 0,
               y: 180,
               z: 0
            }
         },
         armL_upper: t0(),
         armL_fore: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.75,
               z: 0
            }
         },
         armL_hand: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.71,
               z: 0
            }
         },
         shoulderR: {
            ...t0(),
            pos: {
               x: 0.65,
               y: 0,
               z: 0
            },
            rot: {
               x: 0,
               y: 180,
               z: 0
            }
         },
         armR_upper: t0(),
         armR_fore: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.75,
               z: 0
            }
         },
         armR_hand: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.71,
               z: 0
            }
         },
         hipL: {
            ...t0(),
            pos: {
               x: -0.25,
               y: -0.35,
               z: 0
            }
         },
         legL_thigh: t0(),
         legL_shin: {
            ...t0(),
            pos: {
               x: 0,
               y: -1.05,
               z: 0
            }
         },
         legL_foot: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.88,
               z: -0.21
            }
         },
         hipR: {
            ...t0(),
            pos: {
               x: 0.25,
               y: -0.35,
               z: 0
            }
         },
         legR_thigh: t0(),
         legR_shin: {
            ...t0(),
            pos: {
               x: 0,
               y: -1.05,
               z: 0
            }
         },
         legR_foot: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.88,
               z: -0.21
            }
         },
      }
   };

   const FALLBACK_COSMETIC_CONFIG = {
      faces: [
         { id: "neutral", label: "Neutral" },
         { id: "grin", label: "Brave Grin" },
         { id: "focused", label: "Focused" }
      ],
      hair: [
         { id: "buzz", label: "Buzz Cut", primaryColor: "#2f2f38", secondaryColor: "#3c3f4f" },
         { id: "windswept", label: "Windswept", primaryColor: "#1e2f6f", secondaryColor: "#2f478f" },
         { id: "scout_hat", label: "Explorer Hat", primaryColor: "#6a4d32", secondaryColor: "#8c6a3e" }
      ],
      outfits: {
         top: {
            hunter: { id: "hunter", label: "Hunter Jacket", body: "#2d3d8f", accent: "#66c1ff", sleeve: "#1f2d64" },
            stealth: { id: "stealth", label: "Night Coat", body: "#1b1d28", accent: "#4d5978", sleeve: "#282b3c" },
            festival: { id: "festival", label: "Festival Vest", body: "#c55a5a", accent: "#f5d36a", sleeve: "#a44646" }
         },
         bottom: {
            scout: { id: "scout", label: "Scout Pants", hips: "#243244", thigh: "#1d2736", shin: "#324763" },
            stealth: { id: "stealth", label: "Night Trousers", hips: "#1a1c26", thigh: "#12141c", shin: "#2a2d3a" },
            festival: { id: "festival", label: "Festival Wraps", hips: "#7a3131", thigh: "#592424", shin: "#dd8a4a" }
         },
         full: {
            ranger: { id: "ranger", label: "Hunter Ranger", top: "hunter", bottom: "scout" },
            nocturne: { id: "nocturne", label: "Nocturne Operative", top: "stealth", bottom: "stealth" },
            parade: { id: "parade", label: "Parade Attire", top: "festival", bottom: "festival" }
         }
      },
      shoes: {
         standard: { id: "standard", label: "Standard Boots", base: "#2f2f38", accent: "#585d70" },
         sprint: { id: "sprint", label: "Sprint Sneakers", base: "#26486a", accent: "#69d1ff" },
         trail: { id: "trail", label: "Trail Runners", base: "#4a3522", accent: "#efb459" }
      },
      accessories: {
         visor: { id: "visor", label: "Nen Visor", color: "#68c9ff", accent: "#2b7fd0" },
         earrings: { id: "earrings", label: "Twin Studs", color: "#f6f0d6", accent: "#c9c2a5" },
         scarf: { id: "scarf", label: "Aura Scarf", color: "#d4643f", accent: "#f3ad7a" }
      }
   };

   const COSMETIC_CONFIG = deepClone((window.RigDefinitions && window.RigDefinitions.COSMETICS) || FALLBACK_COSMETIC_CONFIG);

   const FACE_SPECS = Array.isArray(COSMETIC_CONFIG.faces) && COSMETIC_CONFIG.faces.length
      ? COSMETIC_CONFIG.faces.filter(spec => spec && typeof spec.id === "string")
      : FALLBACK_COSMETIC_CONFIG.faces;
   const HAIR_SPECS = Array.isArray(COSMETIC_CONFIG.hair) && COSMETIC_CONFIG.hair.length
      ? COSMETIC_CONFIG.hair.filter(spec => spec && typeof spec.id === "string")
      : FALLBACK_COSMETIC_CONFIG.hair;
   const FACE_SPEC_MAP = new Map(FACE_SPECS.map(spec => [spec.id, spec]));
   const HAIR_SPEC_MAP = new Map(HAIR_SPECS.map(spec => [spec.id, spec]));

   const TOP_SPEC_MAP = new Map(Object.entries((COSMETIC_CONFIG.outfits && COSMETIC_CONFIG.outfits.top) || {}));
   const BOTTOM_SPEC_MAP = new Map(Object.entries((COSMETIC_CONFIG.outfits && COSMETIC_CONFIG.outfits.bottom) || {}));
   const FULL_SPEC_MAP = new Map(Object.entries((COSMETIC_CONFIG.outfits && COSMETIC_CONFIG.outfits.full) || {}));
   const SHOE_SPEC_MAP = new Map(Object.entries(COSMETIC_CONFIG.shoes || {}));
   const ACCESSORY_SPEC_MAP = new Map(Object.entries(COSMETIC_CONFIG.accessories || {}));

   const DEFAULT_FACE_ID = FACE_SPECS.length ? FACE_SPECS[0].id : "neutral";
   const DEFAULT_HAIR_ID = HAIR_SPECS.length ? HAIR_SPECS[0].id : "buzz";
   const DEFAULT_TOP_ID = (() => {
      for (const [key, spec] of TOP_SPEC_MAP) {
         return typeof spec?.id === "string" ? spec.id : key;
      }
      return "hunter";
   })();
   const DEFAULT_BOTTOM_ID = (() => {
      for (const [key, spec] of BOTTOM_SPEC_MAP) {
         return typeof spec?.id === "string" ? spec.id : key;
      }
      return "scout";
   })();
   const DEFAULT_FULL_ID = (() => {
      for (const [key, spec] of FULL_SPEC_MAP) {
         return typeof spec?.id === "string" ? spec.id : key;
      }
      return null;
   })();
   const DEFAULT_SHOE_ID = (() => {
      for (const [key, spec] of SHOE_SPEC_MAP) {
         return typeof spec?.id === "string" ? spec.id : key;
      }
      return "standard";
   })();

   const FALLBACK_COSMETIC_SELECTION = {
      face: DEFAULT_FACE_ID,
      hair: DEFAULT_HAIR_ID,
      outfit: {
         top: DEFAULT_TOP_ID,
         bottom: DEFAULT_BOTTOM_ID,
         full: DEFAULT_FULL_ID
      },
      shoes: DEFAULT_SHOE_ID,
      accessories: []
   };

   function normalizeAccessoryIds(ids) {
      if (!Array.isArray(ids)) return [];
      const unique = [];
      const seen = new Set();
      for (const raw of ids) {
         if (typeof raw !== "string") continue;
         const id = raw.trim();
         if (!id || seen.has(id) || !ACCESSORY_SPEC_MAP.has(id)) continue;
         seen.add(id);
         unique.push(id);
      }
      return unique;
   }

   function normalizeOutfit(next = {}, base = FALLBACK_COSMETIC_SELECTION.outfit) {
      const current = {
         top: typeof base?.top === "string" ? base.top : DEFAULT_TOP_ID,
         bottom: typeof base?.bottom === "string" ? base.bottom : DEFAULT_BOTTOM_ID,
         full: base?.full != null ? base.full : DEFAULT_FULL_ID
      };
      if (!next || typeof next !== "object") return current;
      if (Object.prototype.hasOwnProperty.call(next, "full")) {
         if (next.full === null) {
            current.full = null;
         } else if (typeof next.full === "string" && FULL_SPEC_MAP.has(next.full)) {
            current.full = next.full;
         }
      }
      if (Object.prototype.hasOwnProperty.call(next, "top")) {
         if (typeof next.top === "string" && TOP_SPEC_MAP.has(next.top)) {
            current.top = next.top;
         }
         if (next.full === undefined) current.full = null;
      }
      if (Object.prototype.hasOwnProperty.call(next, "bottom")) {
         if (typeof next.bottom === "string" && BOTTOM_SPEC_MAP.has(next.bottom)) {
            current.bottom = next.bottom;
         }
         if (next.full === undefined) current.full = null;
      }
      return current;
   }

   function normalizeCosmetics(value, baseSelection = FALLBACK_COSMETIC_SELECTION) {
      const base = deepClone(baseSelection);
      if (!value || typeof value !== "object") {
         base.accessories = normalizeAccessoryIds(base.accessories);
         base.outfit = normalizeOutfit(base.outfit);
         return base;
      }
      if (typeof value.face === "string" && FACE_SPEC_MAP.has(value.face)) {
         base.face = value.face;
      }
      if (typeof value.hair === "string" && HAIR_SPEC_MAP.has(value.hair)) {
         base.hair = value.hair;
      }
      base.outfit = normalizeOutfit(value.outfit, base.outfit);
      if (typeof value.shoes === "string" && SHOE_SPEC_MAP.has(value.shoes)) {
         base.shoes = value.shoes;
      }
      base.accessories = normalizeAccessoryIds(value.accessories);
      return base;
   }

   const DEFAULT_COSMETIC_SELECTION = normalizeCosmetics((window.RigDefinitions && window.RigDefinitions.DEFAULT_COSMETICS) || FALLBACK_COSMETIC_SELECTION, FALLBACK_COSMETIC_SELECTION);
   let cachedCosmeticStorage = null;
   const storedCosmetics = loadSavedCosmeticSelection();
   let cosmeticSelection = storedCosmetics ? deepClone(storedCosmetics) : deepClone(DEFAULT_COSMETIC_SELECTION);
   if (!cachedCosmeticStorage) {
      cachedCosmeticStorage = deepClone(cosmeticSelection);
   }
   let playerCosmeticController = null;

   const FACE_MATERIAL_CACHE = new Map();
   const DEG2RAD = Math.PI / 180;


   function deepClone(o) {
      return JSON.parse(JSON.stringify(o));
   }

   const COSMETIC_ANCHOR_STORAGE_KEY = (window.RigDefinitions && window.RigDefinitions.COSMETIC_ANCHOR_STORAGE_KEY) || "hxh.cosmeticAnchors";
   const FALLBACK_COSMETIC_ANCHORS = { faces: {}, hair: {} };
   const BASE_COSMETIC_ANCHORS = normalizeAnchorMap((window.RigDefinitions && window.RigDefinitions.COSMETIC_ANCHORS) || FALLBACK_COSMETIC_ANCHORS, { base: true });
   let cachedCosmeticAnchorStorage = null;
   let cosmeticAnchorOverrides = loadSavedCosmeticAnchors();

   function loadSavedCosmeticSelection() {
      if (cachedCosmeticStorage) {
         return deepClone(cachedCosmeticStorage);
      }
      if (typeof localStorage === "undefined") return null;
      try {
         const raw = localStorage.getItem(COSMETIC_STORAGE_KEY);
         if (!raw) return null;
         const parsed = JSON.parse(raw);
         const payload = parsed && typeof parsed === "object"
            ? (parsed.selection || parsed.cosmetics || parsed.data || parsed)
            : null;
         if (!payload) return null;
         const normalized = normalizeCosmetics(payload, DEFAULT_COSMETIC_SELECTION);
         cachedCosmeticStorage = deepClone(normalized);
         return deepClone(normalized);
      } catch (err) {
         return null;
      }
   }

   function persistCosmeticsSelection({ selection = null, emit = true } = {}) {
      const target = normalizeCosmetics(selection || getCosmeticSelection(), DEFAULT_COSMETIC_SELECTION);
      cachedCosmeticStorage = deepClone(target);
      if (typeof localStorage !== "undefined") {
         try {
            localStorage.setItem(COSMETIC_STORAGE_KEY, JSON.stringify({ version: 1, selection: target }));
         } catch (err) {}
      }
      if (emit) scheduleRuntimeSave();
      return deepClone(target);
   }

   function normalizeAnchorMap(source, { base = false } = {}) {
      const buckets = { faces: {}, hair: {} };
      if (!source || typeof source !== "object") return buckets;
      const keys = ["faces", "hair"];
      keys.forEach(bucketKey => {
         const src = source[bucketKey];
         if (!src || typeof src !== "object") return;
         const dest = {};
         Object.keys(src).forEach(id => {
            const spec = src[id];
            if (!spec || typeof spec !== "object") return;
            if (base) {
               dest[id] = normalizeAnchorBaseSpec(spec);
            } else {
               const normalized = normalizeAnchorOverrideSpec(spec);
               const trimmed = trimAnchorOverride(normalized);
               if (trimmed) dest[id] = trimmed;
            }
         });
         buckets[bucketKey] = dest;
      });
      return buckets;
   }

   function normalizeAnchorBaseSpec(spec) {
      const localPos = spec?.localPos || {};
      const localRot = spec?.localRot || {};
      const localScale = spec?.localScale || {};
      return {
         headSocket: (typeof spec?.headSocket === "string" && spec.headSocket.trim()) ? spec.headSocket.trim() : null,
         localPos: {
            x: Number(localPos.x) || 0,
            y: Number(localPos.y) || 0,
            z: Number(localPos.z) || 0
         },
         localRot: {
            x: Number(localRot.x) || 0,
            y: Number(localRot.y) || 0,
            z: Number(localRot.z) || 0
         },
         localScale: {
            x: Number.isFinite(Number(localScale.x)) ? Number(localScale.x) : 1,
            y: Number.isFinite(Number(localScale.y)) ? Number(localScale.y) : 1,
            z: Number.isFinite(Number(localScale.z)) ? Number(localScale.z) : 1
         }
      };
   }

   function normalizeAnchorOverrideSpec(spec) {
      const localPos = spec?.localPos || {};
      const localRot = spec?.localRot || {};
      const localScale = spec?.localScale || {};
      return {
         headSocket: (typeof spec?.headSocket === "string" && spec.headSocket.trim()) ? spec.headSocket.trim() : null,
         localPos: {
            x: Number(localPos.x) || 0,
            y: Number(localPos.y) || 0,
            z: Number(localPos.z) || 0
         },
         localRot: {
            x: Number(localRot.x) || 0,
            y: Number(localRot.y) || 0,
            z: Number(localRot.z) || 0
         },
         localScale: {
            x: Number(localScale.x) || 0,
            y: Number(localScale.y) || 0,
            z: Number(localScale.z) || 0
         }
      };
   }

   function trimAnchorOverride(entry) {
      if (!entry) return null;
      const out = { headSocket: entry.headSocket || null };

      function pruneVec(source, { epsilon = 1e-5 } = {}) {
         if (!source || typeof source !== "object") return null;
         const result = {};
         let any = false;
         ["x", "y", "z"].forEach(axis => {
            const num = Number(source[axis]) || 0;
            if (Math.abs(num) > epsilon) {
               result[axis] = num;
               any = true;
            }
         });
         return any ? result : null;
      }

      const pos = pruneVec(entry.localPos || {});
      const rot = pruneVec(entry.localRot || {});
      const scl = pruneVec(entry.localScale || {});

      if (pos) out.localPos = pos;
      if (rot) out.localRot = rot;
      if (scl) out.localScale = scl;

      if (!out.headSocket && !out.localPos && !out.localRot && !out.localScale) return null;
      return out;
   }

   function loadSavedCosmeticAnchors() {
      if (cachedCosmeticAnchorStorage) {
         return normalizeAnchorMap(cachedCosmeticAnchorStorage, { base: false });
      }
      if (typeof localStorage === "undefined") {
         return normalizeAnchorMap({}, { base: false });
      }
      try {
         const raw = localStorage.getItem(COSMETIC_ANCHOR_STORAGE_KEY);
         if (!raw) return normalizeAnchorMap({}, { base: false });
         const parsed = JSON.parse(raw);
         const payload = parsed && typeof parsed === "object"
            ? (parsed.overrides || parsed.anchors || parsed.data || parsed)
            : null;
         if (!payload) return normalizeAnchorMap({}, { base: false });
         cachedCosmeticAnchorStorage = normalizeAnchorMap(payload, { base: false });
         return normalizeAnchorMap(cachedCosmeticAnchorStorage, { base: false });
      } catch (err) {
         cachedCosmeticAnchorStorage = null;
         return normalizeAnchorMap({}, { base: false });
      }
   }

   function getCosmeticAnchorOverridesSnapshot() {
      return normalizeAnchorMap(cosmeticAnchorOverrides, { base: false });
   }

   function persistCosmeticAnchors({ overrides = null, emit = true } = {}) {
      if (overrides) {
         cosmeticAnchorOverrides = normalizeAnchorMap(overrides, { base: false });
      }
      cachedCosmeticAnchorStorage = normalizeAnchorMap(cosmeticAnchorOverrides, { base: false });
      if (typeof localStorage !== "undefined") {
         try {
            localStorage.setItem(COSMETIC_ANCHOR_STORAGE_KEY, JSON.stringify({ version: 1, overrides: cachedCosmeticAnchorStorage }));
         } catch (err) {}
      }
      if (emit) scheduleRuntimeSave();
      return getCosmeticAnchorOverridesSnapshot();
   }

   function normalizeAnchorKind(kind) {
      if (typeof kind !== "string") return null;
      const key = kind.toLowerCase();
      if (key === "face" || key === "faces") return "face";
      if (key === "hair" || key === "hairs") return "hair";
      return null;
   }

   function getAnchorBaseSpec(kind, id) {
      const normalized = normalizeAnchorKind(kind);
      if (!normalized) return null;
      const bucketKey = normalized === "face" ? "faces" : "hair";
      const bucket = BASE_COSMETIC_ANCHORS[bucketKey] || {};
      const spec = bucket[id] || {};
      const normalizedSpec = normalizeAnchorBaseSpec(spec);
      if (!normalizedSpec.headSocket) {
         normalizedSpec.headSocket = normalized === "face" ? "face" : "crown";
      }
      return normalizedSpec;
   }

   function getAnchorOverrideSpec(kind, id) {
      const normalized = normalizeAnchorKind(kind);
      if (!normalized) return normalizeAnchorOverrideSpec({});
      const bucketKey = normalized === "face" ? "faces" : "hair";
      const bucket = cosmeticAnchorOverrides[bucketKey] || {};
      const spec = bucket[id] || {};
      return normalizeAnchorOverrideSpec(spec);
   }

   function ensureHeadSegment(segments) {
      const headSource = segments && typeof segments === "object"
         ? (segments.head || segments)
         : null;
      const base = headSource && typeof headSource === "object" ? headSource : (RIG && RIG.head) || DEFAULT_RIG.head;
      return {
         w: Number(base?.w) || Number(DEFAULT_RIG.head.w) || 0.52,
         h: Number(base?.h) || Number(DEFAULT_RIG.head.h) || 0.52,
         d: Number(base?.d) || Number(DEFAULT_RIG.head.d) || 0.52
      };
   }

   function computeSocketTransform(socketKey, segments) {
      const head = ensureHeadSegment(segments);
      const transform = {
         pos: { x: 0, y: 0, z: 0 },
         rot: { x: 0, y: 0, z: 0 },
         scale: { x: 1, y: 1, z: 1 }
      };
      switch (socketKey) {
         case "face":
            transform.pos.y = head.h * 0.1;
            transform.pos.z = (head.d * 0.5) + 0.01;
            break;
         case "brow":
            transform.pos.y = head.h * 0.22;
            transform.pos.z = head.d * 0.38;
            break;
         case "visor":
            transform.pos.y = head.h * 0.18;
            transform.pos.z = head.d * 0.52;
            break;
         case "crown":
            transform.pos.y = head.h * 0.5;
            break;
         case "chin":
            transform.pos.y = -head.h * 0.25;
            transform.pos.z = head.d * 0.22;
            break;
         case "back":
            transform.pos.y = head.h * 0.12;
            transform.pos.z = -head.d * 0.45;
            break;
         default:
            break;
      }
      return transform;
   }

   function combineAnchorVector(base = {}, delta = {}) {
      return {
         x: (Number(base?.x) || 0) + (Number(delta?.x) || 0),
         y: (Number(base?.y) || 0) + (Number(delta?.y) || 0),
         z: (Number(base?.z) || 0) + (Number(delta?.z) || 0)
      };
   }

   function combineAnchorScale(base = {}, delta = {}) {
      return {
         x: Math.max(0.01, (Number(base?.x) || 1) + (Number(delta?.x) || 0)),
         y: Math.max(0.01, (Number(base?.y) || 1) + (Number(delta?.y) || 0)),
         z: Math.max(0.01, (Number(base?.z) || 1) + (Number(delta?.z) || 0))
      };
   }

   function resolveCosmeticAnchor(kind, id, segments) {
      const normalized = normalizeAnchorKind(kind);
      if (!normalized) return null;
      const baseSpec = getAnchorBaseSpec(normalized, id);
      const overrideSpec = getAnchorOverrideSpec(normalized, id);
      const headSocket = overrideSpec.headSocket || baseSpec.headSocket || (normalized === "face" ? "face" : "crown");
      const socket = computeSocketTransform(headSocket, segments);
      const localPos = combineAnchorVector(baseSpec.localPos, overrideSpec.localPos);
      const localRot = combineAnchorVector(baseSpec.localRot, overrideSpec.localRot);
      const localScale = combineAnchorScale(baseSpec.localScale, overrideSpec.localScale);
      const resolved = {
         position: {
            x: socket.pos.x + localPos.x,
            y: socket.pos.y + localPos.y,
            z: socket.pos.z + localPos.z
         },
         rotationDeg: {
            x: socket.rot.x + localRot.x,
            y: socket.rot.y + localRot.y,
            z: socket.rot.z + localRot.z
         },
         scale: {
            x: socket.scale.x * localScale.x,
            y: socket.scale.y * localScale.y,
            z: socket.scale.z * localScale.z
         }
      };
      return {
         kind: normalized,
         id,
         headSocket,
         socket,
         base: baseSpec,
         override: overrideSpec,
         local: {
            position: localPos,
            rotationDeg: localRot,
            scale: localScale
         },
         resolved
      };
   }

   function refreshAnchorsFor(kind, id) {
      if (!playerCosmeticController || typeof playerCosmeticController.refreshAnchor !== "function") return null;
      try {
         return playerCosmeticController.refreshAnchor(kind, id);
      } catch (err) {
         return null;
      }
   }

   function mergeAnchorDelta(current, delta = {}) {
      const base = normalizeAnchorOverrideSpec(current || {});
      let dirty = false;
      if (delta && typeof delta === "object") {
         if (typeof delta.headSocket === "string" && delta.headSocket.trim()) {
            base.headSocket = delta.headSocket.trim();
            dirty = true;
         }
         if (delta.localPos && typeof delta.localPos === "object") {
            base.localPos = base.localPos || { x: 0, y: 0, z: 0 };
            ["x", "y", "z"].forEach(axis => {
               if (Number.isFinite(Number(delta.localPos[axis]))) {
                  base.localPos[axis] = (base.localPos[axis] || 0) + Number(delta.localPos[axis]);
                  dirty = true;
               }
            });
         }
         if (delta.localRot && typeof delta.localRot === "object") {
            base.localRot = base.localRot || { x: 0, y: 0, z: 0 };
            ["x", "y", "z"].forEach(axis => {
               if (Number.isFinite(Number(delta.localRot[axis]))) {
                  base.localRot[axis] = (base.localRot[axis] || 0) + Number(delta.localRot[axis]);
                  dirty = true;
               }
            });
         }
         if (delta.localScale && typeof delta.localScale === "object") {
            base.localScale = base.localScale || { x: 0, y: 0, z: 0 };
            ["x", "y", "z"].forEach(axis => {
               if (Number.isFinite(Number(delta.localScale[axis]))) {
                  base.localScale[axis] = (base.localScale[axis] || 0) + Number(delta.localScale[axis]);
                  dirty = true;
               }
            });
         }
      }
      if (!dirty && !base.headSocket) return null;
      return trimAnchorOverride(base);
   }

   function adjustCosmeticAnchor(kind, id, delta = {}, { persist = true } = {}) {
      const normalized = normalizeAnchorKind(kind);
      if (!normalized || typeof id !== "string" || !id) {
         return getCosmeticAnchorSnapshot(kind, id);
      }
      const bucketKey = normalized === "face" ? "faces" : "hair";
      cosmeticAnchorOverrides[bucketKey] = cosmeticAnchorOverrides[bucketKey] || {};
      const current = cosmeticAnchorOverrides[bucketKey][id] || {};
      const merged = mergeAnchorDelta(current, delta);
      if (merged) {
         cosmeticAnchorOverrides[bucketKey][id] = merged;
      } else {
         delete cosmeticAnchorOverrides[bucketKey][id];
      }
      if (persist) persistCosmeticAnchors({ overrides: cosmeticAnchorOverrides, emit: true });
      refreshAnchorsFor(normalized, id);
      return getCosmeticAnchorSnapshot(normalized, id);
   }

   function resetCosmeticAnchor(kind, id, { persist = true } = {}) {
      const normalized = normalizeAnchorKind(kind);
      if (!normalized || typeof id !== "string" || !id) {
         return getCosmeticAnchorSnapshot(kind, id);
      }
      const bucketKey = normalized === "face" ? "faces" : "hair";
      if (cosmeticAnchorOverrides[bucketKey]) {
         delete cosmeticAnchorOverrides[bucketKey][id];
      }
      if (persist) persistCosmeticAnchors({ overrides: cosmeticAnchorOverrides, emit: true });
      refreshAnchorsFor(normalized, id);
      return getCosmeticAnchorSnapshot(normalized, id);
   }

   function getCosmeticAnchorSnapshot(kind, id) {
      const normalized = normalizeAnchorKind(kind);
      if (!normalized) return null;
      const targetId = typeof id === "string" && id
         ? id
         : (normalized === "face" ? cosmeticSelection.face : cosmeticSelection.hair);
      const segments = playerCosmeticController?.segments || RIG;
      const resolved = resolveCosmeticAnchor(normalized, targetId, segments);
      return resolved ? deepClone(resolved) : null;
   }

   function getSavedCosmeticLoadout() {
      const saved = loadSavedCosmeticSelection();
      return saved ? deepClone(saved) : deepClone(DEFAULT_COSMETIC_SELECTION);
   }

   function saveCosmeticLoadout(selection = null) {
      return persistCosmeticsSelection({ selection, emit: true });
   }

   function applyCosmeticLoadout(selection = null, { persist = true } = {}) {
      const normalized = normalizeCosmetics(selection || getSavedCosmeticLoadout(), DEFAULT_COSMETIC_SELECTION);
      cosmeticSelection = deepClone(normalized);
      applyCosmeticsToPlayer();
      persistCosmeticsSelection({ selection: normalized, emit: !!persist });
      return getCosmeticSelection();
   }

   function setRigParameters(nextRig = undefined, { persist = true } = {}) {
      const source = (typeof nextRig === "undefined") ? RIG : nextRig;
      const normalized = ensureRig(source);
      RIG = normalized;
      if (persist && typeof localStorage !== "undefined") {
         try {
            localStorage.setItem(RIG_KEY, JSON.stringify(RIG));
         } catch (err) {}
      }
      try {
         window.CharacterCreator?.refresh?.();
      } catch (err) {}
      return deepClone(RIG);
   }

   // ensure transforms exist and are numeric
   function ensureRig(rig) {
      const r = rig && typeof rig === "object" ? rig : {};
      const out = deepClone(DEFAULT_RIG);

      if (typeof r.color === "string") {
         out.color = r.color;
      }

      if (typeof r.rigType === "string" && r.rigType.trim()) {
         out.rigType = r.rigType.trim();
      } else if (typeof out.rigType !== "string") {
         out.rigType = "anthro-biped";
      }

      // copy sizes if present
      ["pelvis", "torsoLower", "torsoUpper", "neck", "head"].forEach(k => {
         if (r[k]) Object.assign(out[k], r[k]);
      });
      if (r.arm) Object.assign(out.arm, r.arm);
      if (r.leg) Object.assign(out.leg, r.leg);

      // transforms
      out.transforms = out.transforms || {};
      const srcT = (r.transforms && typeof r.transforms === "object") ? r.transforms : {};
      for (const k of PART_KEYS) {
         const base = srcT[k] || {};
         const pos = base.pos || {},
            rot = base.rot || {};
         out.transforms[k] = {
            pos: {
               x: Number(pos.x) || out.transforms[k].pos.x,
               y: Number(pos.y) || out.transforms[k].pos.y,
               z: Number(pos.z) || out.transforms[k].pos.z
            },
            rot: {
               x: Number(rot.x) || 0,
               y: Number(rot.y) || 0,
               z: Number(rot.z) || 0
            }
         };
      }
      return out;
   }

   function parseFloatAttr(node, name) {
      if (!node || !node.hasAttribute(name)) return null;
      const v = parseFloat(node.getAttribute(name));
      return Number.isFinite(v) ? v : null;
   }

   function parseRigXML(text) {
      try {
         const doc = new DOMParser().parseFromString(text, "application/xml");
         if (doc.getElementsByTagName("parsererror").length) return null;
         const root = doc.querySelector("rig");
         if (!root) return null;

         const parsed = { transforms: {} };
         const col = root.getAttribute("color");
         if (col) parsed.color = col;

         const sizes = root.querySelector("sizes");
         if (sizes) {
            const assignDims = (tag, key) => {
               const node = sizes.querySelector(tag);
               if (!node) return;
               const dest = parsed[key] = parsed[key] || {};
               ["w", "h", "d"].forEach(attr => {
                  const val = parseFloatAttr(node, attr);
                  if (val !== null) dest[attr] = val;
               });
            };
            assignDims("pelvis", "pelvis");
            assignDims("torsoLower", "torsoLower");
            assignDims("torsoUpper", "torsoUpper");
            assignDims("neck", "neck");
            assignDims("head", "head");

            const arm = sizes.querySelector("arm");
            if (arm) {
               const dest = parsed.arm = parsed.arm || {};
               [
                  ["upperW", "upperW"],
                  ["upperD", "upperD"],
                  ["upperLen", "upperLen"],
                  ["foreW", "foreW"],
                  ["foreD", "foreD"],
                  ["foreLen", "foreLen"],
                  ["handLen", "handLen"]
               ].forEach(([attr, key]) => {
                  const val = parseFloatAttr(arm, attr);
                  if (val !== null) dest[key] = val;
               });
            }

            const leg = sizes.querySelector("leg");
            if (leg) {
               const dest = parsed.leg = parsed.leg || {};
               [
                  ["thighW", "thighW"],
                  ["thighD", "thighD"],
                  ["thighLen", "thighLen"],
                  ["shinW", "shinW"],
                  ["shinD", "shinD"],
                  ["shinLen", "shinLen"],
                  ["footW", "footW"],
                  ["footH", "footH"],
                  ["footLen", "footLen"]
               ].forEach(([attr, key]) => {
                  const val = parseFloatAttr(leg, attr);
                  if (val !== null) dest[key] = val;
               });
            }
         }

         const transforms = root.querySelector("transforms");
         if (transforms) {
            for (const key of PART_KEYS) {
               const node = transforms.querySelector(key);
               if (!node) continue;
               const tr = { pos: {}, rot: {} };
               let touched = false;
               [
                  ["posX", "x"],
                  ["posY", "y"],
                  ["posZ", "z"]
               ].forEach(([attr, axis]) => {
                  const val = parseFloatAttr(node, attr);
                  if (val !== null) {
                     tr.pos[axis] = val;
                     touched = true;
                  }
               });
               [
                  ["rotX", "x"],
                  ["rotY", "y"],
                  ["rotZ", "z"]
               ].forEach(([attr, axis]) => {
                  const val = parseFloatAttr(node, attr);
                  if (val !== null) {
                     tr.rot[axis] = val;
                     touched = true;
                  }
               });
               if (touched) parsed.transforms[key] = tr;
            }
         }

         return parsed;
      } catch (err) {
         console.warn("Failed to parse rig XML", err);
         return null;
      }
   }

   function loadRigFromStorage() {
      try {
         const txt = localStorage.getItem(RIG_KEY);
         if (!txt) return null;
         return ensureRig(JSON.parse(txt));
      } catch {
         return null;
      }
   }

   async function fetchRigDefault() {
      if (typeof fetch !== "function") return null;
      try {
         const res = await fetch("hxh_rig.xml", { cache: "no-cache" });
         if (!res.ok) throw new Error(`HTTP ${res.status}`);
         const text = await res.text();
         const parsed = parseRigXML(text);
         return parsed ? ensureRig(parsed) : null;
      } catch (err) {
         console.warn("Failed to load default rig XML", err);
         return null;
      }
   }

   let RIG = deepClone(DEFAULT_RIG);
   const rigReady = (async () => {
      const stored = loadRigFromStorage();
      if (stored) {
         RIG = stored;
         return;
      }

      const xmlRig = await fetchRigDefault();
      if (xmlRig) {
         RIG = xmlRig;
         try {
            localStorage.setItem(RIG_KEY, JSON.stringify(RIG));
         } catch {}
         return;
      }

      RIG = deepClone(DEFAULT_RIG);
   })();

   const rigEditorBridge = {
      pending: null,
      active: null,
      callback: null
   };

   function cloneRigForSession(rig) {
      if (!rig || typeof rig !== "object") return null;
      try {
         return JSON.parse(JSON.stringify(rig));
      } catch (err) {
         if (Array.isArray(rig)) return rig.slice();
         return { ...rig };
      }
   }

   function prepareRigEditorSession(options = {}) {
      const hxRig = options && typeof options === "object" && options.rig ? options.rig : RIG;
      const sourceRig = ensureRig(hxRig);
      const cosmeticsSource = options && typeof options === "object" && options.cosmetics
         ? options.cosmetics
         : getCosmeticSelection();
      const selection = normalizeCosmetics(cosmeticsSource, cosmeticSelection);
      const session = {
         rig: cloneRigForSession(sourceRig),
         rigType: typeof options.rigType === "string" && options.rigType.trim()
            ? options.rigType.trim()
            : (typeof sourceRig?.rigType === "string" ? sourceRig.rigType : null),
         cosmetics: deepClone(selection),
         source: typeof options.source === "string" ? options.source : null,
         meta: options.meta && typeof options.meta === "object" ? deepClone(options.meta) : null
      };
      rigEditorBridge.pending = session;
      rigEditorBridge.callback = typeof options.onReturn === "function" ? options.onReturn : null;
      return deepClone(session);
   }

   function consumeRigEditorSession() {
      const session = rigEditorBridge.pending;
      rigEditorBridge.pending = null;
      rigEditorBridge.active = session ? deepClone(session) : null;
      return session ? deepClone(session) : null;
   }

   function getActiveRigEditorSession() {
      return rigEditorBridge.active ? deepClone(rigEditorBridge.active) : null;
   }

   function finalizeRigEditorSession(result = {}) {
      const session = rigEditorBridge.active;
      rigEditorBridge.active = null;
      rigEditorBridge.pending = null;
      const callback = rigEditorBridge.callback;
      rigEditorBridge.callback = null;
      if (!session) return false;
      if (typeof callback === "function") {
         try {
            callback(result || {}, session);
         } catch (err) {
            console.warn("[HXH] Rig editor return handler failed", err);
         }
      }
      return true;
   }

   function cancelRigEditorSession() {
      rigEditorBridge.pending = null;
      rigEditorBridge.active = null;
      rigEditorBridge.callback = null;
   }

   // ------- Game state -------
   const state = {
      ch: null,
      inventory: null,
      weapon: null,
      // live derived stats
      eff: {
         power: 0,
         agility: 0,
         focus: 0
      },
      maxHP: 100,
      hp: 100,
      nen: {
         max: 100,
         cur: 100,
         regen: 2.0
      },
      baseHpRegen: 0.0,

      aura: {
         ten: false,
         zetsu: false,
         ren: false,
         ken: false,
         in: false,
         gyo: false,
         shu: false,
         en: {
            on: false,
            r: 0
         },
         renActive: false,
         renCharge: 0,
         renMul: 1.0,
         renStamina: 6,
         renStaminaMax: 6
      },

      flow: makeFlowFromGroups(FLOW_PRESETS[DEFAULT_FLOW_PRESET_INDEX]?.groups),
      flowPresetIndex: DEFAULT_FLOW_PRESET_INDEX,
      flowPresetKey: FLOW_PRESETS[DEFAULT_FLOW_PRESET_INDEX]?.key ?? "balanced",
      flowPresetLabel: FLOW_PRESETS[DEFAULT_FLOW_PRESET_INDEX]?.label ?? "Balanced Guard",
      koVulnerabilityT: 0,
      koVulnerabilityMultiplier: KO_VULN_MULTIPLIER,
      koStrike: null,
      koLastFocus: null,
      lastKoWarning: 0,
      lastRenExhaust: 0,

      vows: [],
      vowRuntime: null,
      vowWave: 0,

      trainingCaps: makeDefaultTrainingCaps(),

      buffs: {},
      cooldowns: {},
      vel: new BABYLON.Vector3(0, 0, 0),
      grounded: false,
      groundNormal: new BABYLON.Vector3(0, 1, 0),
      prevPlayerPos: null,
      rootGroundOffset: 0,
      rootGroundOffsetTarget: 0,
      groundSampleCountdown: 0,
      groundSampleDirty: true,
      prevGrounded: false,
      prevIdle: false,

      // Jump charging
      chargingJump: false,
      jumpChargeT: 0,

      // Nen charge (C)
      chargingNen: false,
      nenLight: null,

      // animation helpers
      attackAnimT: 0,

      // Specialist ult
      timeStop: false,
      ultDrainRate: 20,
      ultMinNen: 5,
      ultT: 0,
      ultMaxDur: 8,
      terrainBrush: {
         enabled: false,
         radius: 3,
         strength: 1.5,
         falloff: "gauss",
         deferNormals: true,
         frameBudgetMs: 4.5,
         strokeIntervalMs: 70,
         lastStrokeTime: 0,
         pendingStroke: null,
         lastMetrics: { timeMs: 0, verts: 0, layer: "—" },
         lastPatch: null,
         pointerActive: false,
         activePointerId: null,
         deferredQueue: [],
         deferredScheduled: false
      }
   };

   getRuntimeState = () => state;
   ensureTerrainDeformListener();

   recomputeTrainingEffects({ silent: true });

   function teardownInventorySystem() {
      if (inventoryUnsub) {
         try {
            inventoryUnsub();
         } catch (err) {
            console.warn("[HXH] inventory unsubscribe failed", err);
         }
         inventoryUnsub = null;
      }
      if (hotbarUnsub) {
         try {
            hotbarUnsub();
         } catch (err) {
            console.warn("[HXH] hotbar unsubscribe failed", err);
         }
         hotbarUnsub = null;
      }
      if (typeof trainingButtonUnsub === "function") {
         try {
            trainingButtonUnsub();
         } catch (err) {
            console.warn("[HUD] Training button unbind failed", err);
         }
      }
      trainingButtonUnsub = null;
      state.inventory = null;
      state.weapon = null;
   }

   function handleInventoryEvent(change, inventory) {
      if (!inventory) {
         state.inventory = null;
         state.weapon = null;
         return;
      }
      state.inventory = inventory;
      const active = inventory.activeItem && !inventory.activeItem.broken ? inventory.activeItem : null;
      state.weapon = active;
      const hudApi = window.HUD;
      if (hudApi && typeof hudApi.renderHotbar === "function") {
         hudApi.renderHotbar(inventory);
      }
      if (change && change.type === "break" && change.item) {
         const label = formatInventoryName(change.item);
         if (label) msg(`${label} broke!`);
         const hotbarIndices = Array.isArray(change.hotbarIndices)
            ? change.hotbarIndices
            : Array.isArray(change.hotbar)
               ? change.hotbar
               : [];
         const index = hotbarIndices.length ? hotbarIndices[0] : findHotbarIndexForSlot(inventory, change.slotIndex);
         if (typeof index === "number" && hudApi && typeof hudApi.flashHotbarBreak === "function") {
            hudApi.flashHotbarBreak(index);
         }
      }
      scheduleRuntimeSave();
   }

   function setupInventorySystem() {
      teardownInventorySystem();
      const hudApi = window.HUD;
      const trainingDisposer = hudApi?.bindTrainingButton?.(() => {
         if (trainingMenuDisposer) {
            closeTrainingMenu();
         } else {
            openTrainingMenu();
         }
      });
      trainingButtonUnsub = typeof trainingDisposer === "function" ? trainingDisposer : null;
      const Items = getItemsModule();
      if (!Items) return;
      const inventory = typeof Items.bindPlayerState === "function" ? Items.bindPlayerState(state) : Items.inventory;
      if (!inventory) return;
      state.inventory = inventory;
      state.weapon = inventory.activeItem && !inventory.activeItem.broken ? inventory.activeItem : null;
      if (hudApi && typeof hudApi.ensureHotbar === "function") {
         hudApi.ensureHotbar();
      }
      if (hudApi && typeof hudApi.renderHotbar === "function") {
         hudApi.renderHotbar(inventory);
      }
      inventoryUnsub = inventory.subscribe((change, inv) => {
         handleInventoryEvent(change, inv);
      });
      handleInventoryEvent({ type: "sync" }, inventory);
      if (hudApi && typeof hudApi.bindHotbar === "function") {
         hotbarUnsub = hudApi.bindHotbar((index) => {
            if (paused) return;
            inventory.equip(index);
         });
      }
      if (pendingInventorySnapshot) {
         try {
            restoreInventoryFromSnapshot(pendingInventorySnapshot);
         } catch (err) {
            console.warn("[HXH] Failed to restore inventory snapshot", err);
         }
         pendingInventorySnapshot = null;
      }
      if (!inventory.slots.some(entry => entry)) {
         inventory.add({
            id: "rusty-blade",
            slot: "weapon",
            type: "melee",
            dmg: 6,
            dur: { current: 24, max: 24 },
            tags: ["starter", "sword"],
            stack: { count: 1, max: 1 }
         }, { hotbarIndex: 0, autoEquip: true });
      }
   }

   function sanitizeInventorySnapshot(raw) {
      if (!raw || typeof raw !== "object") return null;
      const slots = Array.isArray(raw.slots)
         ? raw.slots.map(item => {
            if (!item || typeof item !== "object") return null;
            return {
               id: item.id,
               slot: item.slot,
               type: item.type,
               dmg: Number.isFinite(item.dmg) ? item.dmg : 0,
               dur: {
                  current: Number.isFinite(item?.dur?.current) ? item.dur.current : 0,
                  max: Number.isFinite(item?.dur?.max) ? item.dur.max : 0
               },
               tags: Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === "string") : [],
               stack: {
                  count: Number.isFinite(item?.stack?.count) ? item.stack.count : 0,
                  max: Number.isFinite(item?.stack?.max) ? item.stack.max : 1
               },
               broken: !!item.broken
            };
         })
         : [];
      return {
         slots,
         hotbar: Array.isArray(raw.hotbar) ? raw.hotbar.map(entry => Number.isInteger(entry) ? entry : null) : [],
         activeHotbar: Number.isInteger(raw.activeHotbar) ? raw.activeHotbar : null
      };
   }

   function restoreInventoryFromSnapshot(snapshot) {
      const Items = getItemsModule();
      const inventory = Items?.inventory;
      const data = sanitizeInventorySnapshot(snapshot);
      if (!Items || !inventory || !data) return false;

      const slots = inventory.slots;
      for (let i = 0; i < slots.length; i += 1) {
         slots[i] = null;
      }
      const hotbar = inventory.hotbar;
      for (let i = 0; i < hotbar.length; i += 1) {
         hotbar[i] = null;
      }
      inventory.activeHotbar = null;
      inventory.activeItem = null;

      const hotbarAssignments = new Map();
      data.hotbar.forEach((slotIndex, hotbarIndex) => {
         if (Number.isInteger(slotIndex)) {
            hotbarAssignments.set(slotIndex, hotbarIndex);
         }
      });

      let restored = 0;
      data.slots.forEach((item, slotIndex) => {
         if (!item || typeof item !== "object" || !item.id) return;
         const payload = { ...item, dur: { ...item.dur }, stack: { ...item.stack } };
         const preferredHotbar = hotbarAssignments.has(slotIndex) ? hotbarAssignments.get(slotIndex) : null;
         inventory.add(payload, {
            slotIndex,
            hotbarIndex: preferredHotbar,
            autoEquip: false
         });
         restored += 1;
      });

      if (Number.isInteger(data.activeHotbar)) {
         inventory.equip(data.activeHotbar, { silent: true });
      } else {
         inventory.equip(null, { silent: true });
      }

      handleInventoryEvent({ type: "sync" }, inventory);
      return restored > 0;
   }

   function buildRuntimeSnapshot() {
      const state = getRuntimeState();
      if (!state) return null;
      const Items = getItemsModule();
      const rawInventory = Items?.inventory?.toJSON?.() || null;
      const inventory = rawInventory ? sanitizeInventorySnapshot(rawInventory) : null;
      const cosmeticsSnapshot = getCosmeticSelection();
      const animationLibrary = (() => {
         const snapshot = getAnimationLibrarySnapshot();
         if (!snapshot || typeof snapshot !== "object") return null;
         const clipCount = Object.keys(snapshot.clips || {}).length;
         return clipCount ? snapshot : null;
      })();
      const vows = Array.isArray(state.vows)
         ? state.vows.map(entry => ({
            ruleId: entry?.ruleId || null,
            strength: Number.isFinite(entry?.strength) ? entry.strength : 1,
            lethal: !!entry?.lethal
         })).filter(entry => !!entry.ruleId)
         : [];
      const nenType = typeof state.nenType === "string" && state.nenType
         ? state.nenType
         : (window.NenAdvanced?.getNenType?.(state) || null);
      const flowValues = state.flow
         ? FLOW_LIMB_KEYS.reduce((acc, key) => {
            acc[key] = Number.isFinite(state.flow[key]) ? state.flow[key] : 0;
            return acc;
         }, {})
         : null;
      const aura = getAuraSnapshot();
      const activeRegion = window.RegionManager?.getActiveRegion?.() || null;
      const nextCadence = window.Spawns?.getNextCadence?.();
      const vowRuntime = state.vowRuntime || null;

      return {
         version: 2,
         timestamp: Date.now(),
         inventory,
         cosmetics: cosmeticsSnapshot,
         animations: animationLibrary,
         vows,
         nenType,
         statCaps: state.trainingCaps ? { ...state.trainingCaps } : null,
         training: { progress: getTrainingProgressSnapshot() },
         aura,
         flow: flowValues ? {
            values: flowValues,
            presetKey: state.flowPresetKey ?? null,
            presetIndex: Number.isFinite(state.flowPresetIndex) ? state.flowPresetIndex : 0
         } : null,
         pools: {
            hp: { cur: Number.isFinite(state.hp) ? state.hp : 0, max: Number.isFinite(state.maxHP) ? state.maxHP : 0 },
            nen: {
               cur: Number.isFinite(state.nen?.cur) ? state.nen.cur : 0,
               max: Number.isFinite(state.nen?.max) ? state.nen.max : 0,
               regen: Number.isFinite(state.nen?.regen) ? state.nen.regen : 0
            },
            ren: {
               stamina: Number.isFinite(state.aura?.renStamina) ? state.aura.renStamina : 0,
               max: Number.isFinite(state.aura?.renStaminaMax) ? state.aura.renStaminaMax : 0
            }
         },
         region: {
            activeId: activeRegion?.id ?? null,
            vowWave: Number.isFinite(state.vowWave) ? state.vowWave : 0,
            vowRuntimeWave: Number.isFinite(vowRuntime?.waveId) ? vowRuntime.waveId : 0,
            nextCadence: Number.isFinite(nextCadence) ? nextCadence : null
         },
         vowRuntime: vowRuntime ? {
            lethalActive: !!vowRuntime.lethalActive,
            pendingElite: !!vowRuntime.pendingElite,
            eliteName: vowRuntime.eliteName || ""
         } : null,
         nenDrainSummary: state.nenDrainSummary || null,
         timeStop: { active: !!state.timeStop, ultT: Number.isFinite(state.ultT) ? state.ultT : 0 }
      };
   }

   function applyRuntimeSnapshot(snapshot = null, opts = {}) {
      const state = getRuntimeState();
      if (!state || !snapshot || typeof snapshot !== "object") return false;
      let applied = false;

      if (snapshot.nenType && typeof snapshot.nenType === "string") {
         state.nenType = snapshot.nenType;
         applied = true;
      }

      if (snapshot.statCaps && typeof snapshot.statCaps === "object") {
         state.trainingCaps = { ...state.trainingCaps, ...snapshot.statCaps };
         applied = true;
      }

      if (snapshot.inventory && !opts.skipInventory) {
         restoreInventoryFromSnapshot(snapshot.inventory);
         applied = true;
      }

      if (Array.isArray(snapshot.vows) && snapshot.vows.length) {
         setActiveVows(snapshot.vows.map(entry => ({
            ruleId: entry.ruleId,
            strength: entry.strength,
            lethal: !!entry.lethal
         })), { silent: true });
         applied = true;
      }

      if (snapshot.aura && typeof snapshot.aura === "object") {
         const aura = state.aura;
         Object.assign(aura, snapshot.aura);
         if (snapshot.aura.en && typeof snapshot.aura.en === "object") {
            aura.en = { ...aura.en, ...snapshot.aura.en };
         }
         applied = true;
      }

      if (snapshot.cosmetics && typeof snapshot.cosmetics === "object") {
         applyCosmeticLoadout(snapshot.cosmetics, { persist: false });
         applied = true;
      }

      if (snapshot.animations && typeof snapshot.animations === "object") {
         saveAnimationLibrarySnapshot(snapshot.animations, { emit: false });
         applied = true;
      }

      if (snapshot.pools && typeof snapshot.pools === "object") {
         if (snapshot.pools.hp) {
            if (Number.isFinite(snapshot.pools.hp.max)) state.maxHP = snapshot.pools.hp.max;
            if (Number.isFinite(snapshot.pools.hp.cur)) state.hp = clamp(snapshot.pools.hp.cur, 0, state.maxHP);
         }
         if (snapshot.pools.nen) {
            if (Number.isFinite(snapshot.pools.nen.max)) state.nen.max = snapshot.pools.nen.max;
            if (Number.isFinite(snapshot.pools.nen.cur)) state.nen.cur = clamp(snapshot.pools.nen.cur, 0, state.nen.max);
            if (Number.isFinite(snapshot.pools.nen.regen)) state.nen.regen = snapshot.pools.nen.regen;
         }
         if (snapshot.pools.ren) {
            if (Number.isFinite(snapshot.pools.ren.max)) state.aura.renStaminaMax = snapshot.pools.ren.max;
            if (Number.isFinite(snapshot.pools.ren.stamina)) state.aura.renStamina = clamp(snapshot.pools.ren.stamina, 0, state.aura.renStaminaMax ?? snapshot.pools.ren.max ?? 0);
         }
         applied = true;
      }

      if (snapshot.flow && typeof snapshot.flow === "object" && snapshot.flow.values) {
         Object.assign(state.flow, snapshot.flow.values);
         if (snapshot.flow.presetKey) state.flowPresetKey = snapshot.flow.presetKey;
         if (Number.isFinite(snapshot.flow.presetIndex)) state.flowPresetIndex = snapshot.flow.presetIndex;
         applied = true;
      }

      if (snapshot.region && typeof snapshot.region === "object") {
         if (Number.isFinite(snapshot.region.vowWave)) state.vowWave = snapshot.region.vowWave;
         if (Number.isFinite(snapshot.region.vowRuntimeWave) && state.vowRuntime) {
            state.vowRuntime.waveId = snapshot.region.vowRuntimeWave;
         }
         const targetRegion = snapshot.region.activeId;
         if (targetRegion && window.RegionManager?.setRegion) {
            try {
               window.RegionManager.setRegion(targetRegion, { silent: true, force: true });
            } catch (err) {
               console.warn("[HXH] Failed to restore region", err);
            }
         }
         applied = true;
      }

      if (snapshot.timeStop && typeof snapshot.timeStop === "object") {
         state.timeStop = !!snapshot.timeStop.active;
         if (Number.isFinite(snapshot.timeStop.ultT)) state.ultT = snapshot.timeStop.ultT;
      }

      updateHUD();
      notifyAuraChange();
      notifyFlowChange({ silent: true });
      updateNenHud();
      updateHealthHud();
      scheduleRuntimeSave();
      return applied;
   }

   function setAuraState(key, value) {
      const state = getRuntimeState();
      if (!state || !state.aura) return getAuraSnapshot();
      const aura = state.aura;
      const bool = !!value;
      let changed = false;
      switch (key) {
         case "ten":
            if (aura.ten !== bool) {
               aura.ten = bool;
               changed = true;
            }
            if (bool) {
               aura.zetsu = false;
            }
            break;
         case "zetsu":
            if (aura.zetsu !== bool) {
               aura.zetsu = bool;
               changed = true;
            }
            if (bool) {
               aura.ten = false;
               aura.ren = false;
               aura.renActive = false;
               aura.renCharge = 0;
               aura.ken = false;
               aura.gyo = false;
               aura.shu = false;
               aura.en.on = false;
               aura.en.r = 0;
            }
            break;
         case "ren":
            if (aura.ren !== bool || aura.renActive !== bool) {
               aura.ren = bool;
               aura.renActive = bool;
               aura.renCharge = bool ? 1 : 0;
               changed = true;
            }
            if (bool) {
               aura.zetsu = false;
               const max = Number.isFinite(aura.renStaminaMax) ? aura.renStaminaMax : 6;
               aura.renStamina = max;
               const bonus = state.trainingCaps?.renBonusMul ?? 0;
               aura.renMul = 1.3 + 0.9 * aura.renCharge + bonus;
            } else {
               aura.renMul = 1.0;
               const max = Number.isFinite(aura.renStaminaMax) ? aura.renStaminaMax : 6;
               aura.renStamina = Math.min(max, aura.renStamina ?? max);
            }
            break;
         case "ken":
            if (bool && state.vowRuntime?.totals?.disableKen) {
               msg("Ken is sealed by your vow.");
               break;
            }
            if (aura.ken !== bool) {
               aura.ken = bool;
               changed = true;
            }
            if (bool) aura.zetsu = false;
            break;
         case "gyo":
            if (aura.gyo !== bool) {
               aura.gyo = bool;
               changed = true;
            }
            if (bool) aura.zetsu = false;
            break;
         case "shu":
            if (aura.shu !== bool) {
               aura.shu = bool;
               changed = true;
            }
            if (bool) aura.zetsu = false;
            break;
         case "en":
            if (aura.en.on !== bool) {
               aura.en.on = bool;
               changed = true;
            }
            if (!bool) {
               aura.en.r = 0;
            } else {
               aura.zetsu = false;
               if (!Number.isFinite(aura.en.r) || aura.en.r <= 0) {
                  aura.en.r = 12;
               }
            }
            break;
         default:
            break;
      }
      if (changed) {
         notifyAuraChange();
         scheduleRuntimeSave();
      }
      return getAuraSnapshot();
   }

   function setEnRadius(radius) {
      const state = getRuntimeState();
      if (!state || !state.aura) return getAuraSnapshot();
      const aura = state.aura;
      const clamped = clamp(Number(radius) || 0, 0, 24);
      let changed = false;
      if (clamped <= 0) {
         if (aura.en.on || aura.en.r !== 0) {
            aura.en.on = false;
            aura.en.r = 0;
            changed = true;
         }
      } else {
         if (!aura.en.on || Math.abs(aura.en.r - clamped) > 0.01) {
            aura.en.on = true;
            aura.en.r = clamped;
            aura.zetsu = false;
            changed = true;
         }
      }
      if (changed) {
         notifyAuraChange();
         scheduleRuntimeSave();
      }
      return getAuraSnapshot();
   }

   function refillResources({ hp = true, nen = true } = {}) {
      let changed = false;
      if (hp && Number.isFinite(state.maxHP) && state.hp < state.maxHP) {
         state.hp = state.maxHP;
         updateHealthHud();
         changed = true;
      }
      if (nen && Number.isFinite(state.nen?.max) && state.nen.cur < state.nen.max) {
         state.nen.cur = state.nen.max;
         updateNenHud();
         changed = true;
      }
      if (changed) scheduleRuntimeSave();
      return { hp: state.hp, nen: state.nen.cur };
   }

   function spawnTargetDummy(options = {}) {
      const count = Number.isInteger(options.count) ? Math.max(1, options.count) : 1;
      const spacing = Number.isFinite(options.spacing) ? Math.max(2, options.spacing) : 4;
      if (!scene || !playerRoot) return 0;
      const base = playerRoot.position.clone();
      const region = window.RegionManager?.getActiveRegion?.() || null;
      let spawned = 0;
      for (let i = 0; i < count; i += 1) {
         const angle = (Math.PI * 2 * i) / count;
         const dx = Math.cos(angle);
         const dz = Math.sin(angle);
         const distance = spacing + i * 0.6;
         const targetX = base.x + dx * distance;
         const targetZ = base.z + dz * distance;
         let targetY = getTerrainHeight(targetX, targetZ);
         if (targetY === null) targetY = base.y;
         const spawnPos = new BABYLON.Vector3(targetX, targetY + 1.4, targetZ);
         const enemy = createEnemy(spawnPos);
         enemy.qaDummy = true;
         enemy.speed = 0;
         enemy.attackCd = Infinity;
         enemy.dormant = true;
         enemy.regionId = region?.id ?? null;
         enemy.root.position.copyFrom(spawnPos);
         enemy.root.computeWorldMatrix(true);
         enemy.prevPos.copyFrom(spawnPos);
         configureEnemyForSimulation(enemy, { role: "dummy", meta: { simulation: SIM_BEHAVIOR_SLEEP } });
         enemies.push(enemy);
         spawned += 1;
      }
      if (spawned > 0) {
         scheduleRuntimeSave();
         msg(`${spawned} dummy${spawned > 1 ? " targets" : " target"} spawned for testing.`);
      }
      return spawned;
   }

   const physicsPropMaterials = new Map();

   function getPhysicsPropMaterial(colorHex, targetScene) {
      const key = typeof colorHex === "string" ? colorHex.toLowerCase() : "default";
      if (physicsPropMaterials.has(key)) return physicsPropMaterials.get(key);
      const mat = new BABYLON.StandardMaterial(`physics-prop-mat-${physicsPropMaterials.size + 1}`, targetScene);
      try {
         mat.diffuseColor = BABYLON.Color3.FromHexString(colorHex);
      } catch {
         mat.diffuseColor = new BABYLON.Color3(0.56, 0.6, 0.68);
      }
      mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
      mat.emissiveColor = BABYLON.Color3.Black();
      physicsPropMaterials.set(key, mat);
      return mat;
   }

   function spawnPhysicsProp(options = {}) {
      if (!scene) return null;
      const type = options.type === "capsule" ? "capsule" : "box";
      const size = Number.isFinite(options.size) ? Math.max(0.4, options.size) : 1;
      const mass = Number.isFinite(options.mass) && options.mass > 0 ? options.mass : 1;
      const colorHex = typeof options.color === "string" && options.color.trim() ? options.color.trim() : "#9098a8";
      const spawnBase = options.position instanceof BABYLON.Vector3
         ? options.position.clone()
         : playerRoot
            ? playerRoot.position.add(new BABYLON.Vector3(0, 2.2, 0))
            : new BABYLON.Vector3(0, 4, 0);
      let mesh = null;
      if (type === "capsule") {
         mesh = BABYLON.MeshBuilder.CreateCapsule(`phys-prop-${Date.now()}`, {
            height: size * 1.6,
            radius: size * 0.45,
            tessellation: 8,
            subdivisions: 2
         }, scene);
      } else {
         mesh = BABYLON.MeshBuilder.CreateBox(`phys-prop-${Date.now()}`, {
            width: size,
            height: size,
            depth: size
         }, scene);
      }
      mesh.position.copyFrom(spawnBase);
      mesh.checkCollisions = true;
      mesh.isPickable = true;
      mesh.material = getPhysicsPropMaterial(colorHex, scene);
      const registerOpts = {
         mass,
         linearDamping: Number.isFinite(options.linearDamping) ? options.linearDamping : 0.08,
         angularDamping: Number.isFinite(options.angularDamping) ? options.angularDamping : 0.12,
         allowSleep: options.allowSleep !== false,
         sleepDelay: Number.isFinite(options.sleepDelay) ? Math.max(0, options.sleepDelay) : 0.55,
         sleepLinearThreshold: Number.isFinite(options.sleepLinearThreshold) ? options.sleepLinearThreshold : 0.18,
         sleepAngularThreshold: Number.isFinite(options.sleepAngularThreshold) ? options.sleepAngularThreshold : 0.25,
         priority: options.priority === "low" ? "low" : "normal",
         velocity: options.velocity instanceof BABYLON.Vector3 ? options.velocity : undefined,
         gravityScale: Number.isFinite(options.gravityScale) ? options.gravityScale : 1,
         useCollisions: true
      };
      const body = registerPhysicsBody(mesh, registerOpts);
      if (!body) {
         mesh.dispose();
         return null;
      }
      if (options.impulse instanceof BABYLON.Vector3) {
         applyPhysicsImpulse(body, options.impulse);
      }
      return { mesh, body };
   }

 function defaultVowTotals() {
    return {
       koMultiplier: 1,
       nenMultiplier: 1,
       eliteTargetMultiplier: 1,
       eliteOthersMultiplier: 1,
       disableKen: false,
       restrictions: { requireKo: null, forbidDash: null, restrictTarget: null },
       lethalCount: 0
    };
 }

 function loadStoredVows() {
    try {
       const raw = localStorage.getItem(VOW_STORAGE_KEY);
       if (!raw) return [];
       const parsed = JSON.parse(raw);
       if (!Array.isArray(parsed)) return [];
       return parsed
          .map(entry => ({
             ruleId: typeof entry?.ruleId === "string" ? entry.ruleId : null,
             strength: Number(entry?.strength) || 1,
             lethal: !!entry?.lethal
          }))
          .filter(entry => !!entry.ruleId);
    } catch (err) {
       console.warn("[HXH] Failed to load vows", err);
       return [];
    }
 }

 function saveVowsToStorage(vows) {
    try {
       localStorage.setItem(VOW_STORAGE_KEY, JSON.stringify(vows));
    } catch (err) {
       console.warn("[HXH] Failed to store vows", err);
    }
 }

 function rebuildVowRuntime({ keepWave = false } = {}) {
    const entries = Array.isArray(state.vows)
       ? state.vows.map(entry => Object.assign({}, entry, { broken: false, brokenReason: null }))
       : [];
    state.vowRuntime = {
       entries,
       totals: defaultVowTotals(),
       sources: { requireKo: null, forbidDash: null, restrictTarget: null },
       waveId: keepWave ? (state.vowRuntime?.waveId || 0) : 0,
       eliteTargetId: null,
       eliteName: "",
       pendingElite: false,
       lethalActive: entries.some(entry => entry.lethal)
    };
    recalcVowAggregates();
 }

 function recalcVowAggregates() {
    const runtime = state.vowRuntime;
    if (!runtime) return;
    const adv = window.NenAdvanced;
    const activeConfigs = runtime.entries
       .filter(entry => !entry.broken)
       .map(entry => ({ ruleId: entry.ruleId, strength: entry.strength, lethal: entry.lethal }));
    const combined = adv?.combineVows?.(activeConfigs) || null;
    runtime.totals = combined?.totals
       ? Object.assign(defaultVowTotals(), combined.totals)
       : defaultVowTotals();
    runtime.sources = { requireKo: null, forbidDash: null, restrictTarget: null };
    if (combined?.totals?.restrictions) {
       const restricts = combined.totals.restrictions;
       if (restricts.requireKo) {
          runtime.sources.requireKo = runtime.entries.find(entry => !entry.broken && entry.ruleId === restricts.requireKo) || null;
       }
       if (restricts.forbidDash) {
          runtime.sources.forbidDash = runtime.entries.find(entry => !entry.broken && entry.ruleId === restricts.forbidDash) || null;
       }
       if (restricts.restrictTarget) {
          runtime.sources.restrictTarget = runtime.entries.find(entry => !entry.broken && entry.ruleId === restricts.restrictTarget) || null;
       }
    }
    runtime.lethalActive = runtime.entries.some(entry => !entry.broken && entry.lethal);
    runtime.pendingElite = !!runtime.sources.restrictTarget && !runtime.eliteTargetId;
    if (runtime.totals.disableKen && state.aura?.ken) {
       state.aura.ken = false;
       notifyAuraChange();
       msg("Ken sealed by your vow.");
    }
 }

 function setActiveVows(selection, opts = {}) {
    const { silent = false, skipSave = false } = opts;
    const adv = window.NenAdvanced;
    const configs = Array.isArray(selection) ? selection.filter(Boolean).slice(0, 3) : [];
    const combined = adv?.combineVows?.(configs) || { entries: [], totals: defaultVowTotals() };
    const entries = combined.entries.map((entry, index) => Object.assign({}, entry, {
       key: entry.key || `${entry.ruleId}-${index}`,
       id: entry.id || `${entry.ruleId}-${index}`
    }));
    state.vows = entries;
    rebuildVowRuntime({ keepWave: false });
    if (!skipSave) {
       saveVowsToStorage(entries.map(entry => ({
          ruleId: entry.ruleId,
          strength: entry.strength,
          lethal: !!entry.lethal
       })));
    }
   if (!silent) {
      const names = entries.length
         ? entries.map(entry => `${entry.label || entry.ruleId}${entry.lethal ? " (lethal)" : ""}`).join(", ")
         : "none";
      msg(`[Vows] Bound: ${names}.`);
   }
    scheduleRuntimeSave();
   return entries;
}

 function assignEliteTarget(candidates = enemies) {
    const runtime = state.vowRuntime;
    if (!runtime || !runtime.sources?.restrictTarget) return;
    const pool = Array.isArray(candidates) && candidates.length ? candidates : enemies;
    let chosen = null;
    for (const enemy of pool) {
       if (!enemy || !enemy.alive) continue;
       if (!chosen || (enemy.hp || 0) > (chosen.hp || 0)) {
          chosen = enemy;
       }
    }
    if (chosen) {
       runtime.eliteTargetId = chosen.__enemyId || null;
       runtime.eliteName = `Enemy ${chosen.__enemyId ?? "?"}`;
       runtime.pendingElite = false;
       msg(`Elite vow target marked: focus ${runtime.eliteName}.`);
    }
 }

 function onWaveStart() {
    state.vowWave = (state.vowWave || 0) + 1;
    const runtime = state.vowRuntime;
    if (!runtime) return;
    runtime.waveId = (runtime.waveId || 0) + 1;
    runtime.entries.forEach(entry => {
       entry.broken = false;
       entry.brokenReason = null;
    });
   runtime.eliteTargetId = null;
   runtime.eliteName = "";
   recalcVowAggregates();
   runtime.pendingElite = !!runtime.sources?.restrictTarget;
   scheduleRuntimeSave();
}

 function updateVowRuntimeFrame(dt) {
    const runtime = state.vowRuntime;
    if (!runtime) return;
    if (runtime.sources?.restrictTarget) {
       const eliteId = runtime.eliteTargetId;
       if (eliteId) {
          const alive = enemies.find(enemy => enemy && enemy.__enemyId === eliteId && enemy.alive);
          if (!alive) {
             runtime.eliteTargetId = null;
             runtime.eliteName = "";
             runtime.pendingElite = true;
          }
       }
       if (runtime.pendingElite) assignEliteTarget();
    }
 }

 function limbIsNen(limb) {
    if (typeof limb !== "string") return false;
    const key = limb.toLowerCase();
    return key.includes("nen");
 }

 function applyVowToOutgoing(payload = {}) {
    const runtime = state.vowRuntime;
    const strike = payload.strike || null;
    const limb = payload.limb;
    const baseDamage = Number(payload.damage) || 0;
    const baseNen = limbIsNen(limb);
    const wasKo = !!(strike && (!strike.limb || strike.limb === limb));
    const countsAsNen = baseNen || wasKo;
    if (!runtime) {
       return { damage: baseDamage, wasKo, isNen: countsAsNen };
    }
    const totals = runtime.totals || defaultVowTotals();
    let result = baseDamage;
    if (countsAsNen && totals.nenMultiplier && totals.nenMultiplier !== 1) {
       result *= totals.nenMultiplier;
    }
    return { damage: result, wasKo, isNen: countsAsNen };
 }

 function applyVowToIncoming(payload = {}) {
    const runtime = state.vowRuntime;
    if (!runtime) return { damage: Number(payload.damage) || 0 };
    const target = payload.target || null;
    const context = payload.context || {};
    const totals = runtime.totals || defaultVowTotals();
    const targetId = target && typeof target.__enemyId === "number" ? target.__enemyId : null;
    let next = Number(payload.damage) || 0;
    const isEnemyTarget = !!targetId;
    if (!isEnemyTarget) {
       return { damage: next };
    }
    if (runtime.sources?.requireKo && !context.wasKo && next > 0) {
       handleVowViolation(runtime.sources.requireKo, "Attack was not a Ko strike.");
    }
    if (runtime.sources?.restrictTarget && runtime.eliteTargetId) {
       if (targetId === runtime.eliteTargetId) {
          next *= totals.eliteTargetMultiplier || 1;
       } else {
          next *= totals.eliteOthersMultiplier || 1;
          if (next > 0) {
             handleVowViolation(runtime.sources.restrictTarget, "Struck a non-elite target.");
          }
       }
    } else {
       if (targetId === runtime.eliteTargetId) {
          next *= totals.eliteTargetMultiplier || 1;
       } else if (totals.eliteOthersMultiplier && totals.eliteOthersMultiplier !== 1) {
          next *= totals.eliteOthersMultiplier;
       }
    }
    return { damage: next };
 }

 function handleVowViolation(entry, reason) {
    if (!entry || entry.broken) return;
    entry.broken = true;
    entry.brokenReason = reason || "";
    const label = entry.label || entry.ruleId || "Vow";
    const detail = reason ? `${label}: ${reason}` : label;
    msg(`Vow broken: ${detail}`);
    recalcVowAggregates();
    if (entry.lethal) {
       downPlayer("Lethal vow backlash! You collapse.");
    }
 }

 function downPlayer(reason) {
    if (state.hp <= 0) {
       if (reason) msg(reason);
       return;
    }
    state.hp = 0;
    updateHealthHud();
    if (reason) {
       msg(reason);
    } else {
       msg("You collapse!");
    }
 }

 function openVowMenu() {
    const hudApi = window.HUD;
    if (!hudApi?.openVowMenu) {
       msg("Vow crafting interface unavailable.");
       return;
    }
    const adv = window.NenAdvanced;
    const catalog = adv?.getVowRules?.() || [];
    const selection = Array.isArray(state.vows)
       ? state.vows.map(v => ({ ruleId: v.ruleId, strength: v.strength, lethal: v.lethal }))
       : [];
    hudApi.openVowMenu({
       catalog,
       selection,
       onConfirm: (vows) => {
          setActiveVows(vows || []);
          hudApi.closeVowMenu?.();
          paused = false;
       },
       onCancel: () => {
          hudApi.closeVowMenu?.();
          paused = false;
       }
    });
    paused = true;
 }

 function initVowSystem(force = false) {
    if (vowInitialized && !force) return;
    const adv = window.NenAdvanced;
    if (!adv || typeof adv.combineVows !== "function") {
       if (vowInitAttempts < 50) {
          vowInitAttempts += 1;
          setTimeout(() => initVowSystem(force), 120);
       }
       return;
    }
    vowInitialized = true;
    const stored = loadStoredVows();
    if (stored.length) {
       setActiveVows(stored, { silent: true, skipSave: true });
    } else {
       state.vows = [];
       rebuildVowRuntime({ keepWave: false });
    }
 }

 initVowSystem();

   updateAuraHud();
   updateFlowHud();
   notifyFlowChange({ silent: true });

   // recompute all derived numbers from creator stats + level alloc
   function computeEffective() {
      const s = state.ch.stats;
      state.eff = {
         power: (s.power || 0) + (progress.alloc.power || 0),
         agility: (s.agility || 0) + (progress.alloc.agility || 0),
         focus: (s.focus || 0) + (progress.alloc.focus || 0)
      };
   }

   function recomputeDerived() {
      computeEffective();
      const e = state.eff;

      // Max pools + regen
      state.maxHP = 100 + e.power * 12;
      state.nen.max = 100 + e.focus * 12;
      state.baseHpRegen = 0.0 + e.power * 0.08;
      state.nen.regen = 2.0 + e.focus * 0.6;

      // clamp current values
      state.hp = clamp(state.hp, 0, state.maxHP);
      state.nen.cur = clamp(state.nen.cur, 0, state.nen.max);

      // cooldown scaling from Focus; dash from Agility
      COOLDOWNS.nenblast = 2.0 * (1 - e.focus * 0.04);
      COOLDOWNS.special = 10 * (1 - e.focus * 0.03);
      COOLDOWNS.dash = 2.6 * (1 - e.agility * 0.02);
   }

   function bindHoldButton(el, code) {
      if (!el) return;
      el.addEventListener("click", (e) => e.preventDefault());
      let pointerId = null;
      let active = false;

      const press = (e) => {
         e.preventDefault();
         pointerId = e.pointerId;
         try {
            el.setPointerCapture(pointerId);
         } catch (err) {}
         if (active) return;
         active = true;
         input[code] = true;
         inputOnce[code] = true;
         el.classList.add("active");
      };

      const release = (e) => {
         if (!active || (pointerId !== null && e.pointerId !== pointerId)) return;
         e.preventDefault();
         try {
            el.releasePointerCapture(pointerId);
         } catch (err) {}
         pointerId = null;
         active = false;
         input[code] = false;
         inputUp[code] = true;
         el.classList.remove("active");
      };

      el.addEventListener("pointerdown", press);
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("pointerleave", release);
   }

   function resetMobileJoystick() {
      mobileMove.x = 0;
      mobileMove.y = 0;
      mobileMove.active = false;
      if (mobileUI.thumb) {
         mobileUI.thumb.style.transform = "translate(-50%, -50%)";
      }
   }

   function initMobileControls() {
      // Show mobile UI only on *small* touch layouts, to avoid desktops with "coarse" pointers.
      const smallViewport = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
      if (!(isTouchDevice && smallViewport) || !mobileUI.container) return;
      mobileUI.container.classList.add("visible");

      if (!mobileControlsInitialized) {
         mobileControlsInitialized = true;
         const joystick = mobileUI.joystick;
         let joyPointerId = null;

         const updateJoystick = (e) => {
            const joystickEl = mobileUI.joystick;
            if (!joystickEl) return;
            const rect = joystickEl.getBoundingClientRect();
            const cx = rect.left + rect.width * 0.5;
            const cy = rect.top + rect.height * 0.5;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const max = rect.width * 0.5 || 1;
            let nx = clamp(dx / max, -1, 1);
            let ny = clamp(dy / max, -1, 1);
            let len = Math.hypot(nx, ny);
            if (len > 1) {
               nx /= len;
               ny /= len;
               len = 1;
            }
            mobileMove.x = nx;
            mobileMove.y = ny;
            mobileMove.active = len > 0.08;
            const thumbEl = mobileUI.thumb;
            if (thumbEl) {
               const offsetX = nx * rect.width * 0.32;
               const offsetY = ny * rect.height * 0.32;
               thumbEl.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
            }
         };

         if (joystick) {
            joystick.addEventListener("pointerdown", (e) => {
               e.preventDefault();
               joyPointerId = e.pointerId;
               try {
                  joystick.setPointerCapture(joyPointerId);
               } catch (err) {}
               updateJoystick(e);
            });
            joystick.addEventListener("pointermove", (e) => {
               if (e.pointerId !== joyPointerId) return;
               e.preventDefault();
               updateJoystick(e);
            });
            const end = (e) => {
               if (e.pointerId !== joyPointerId) return;
               e.preventDefault();
               try {
                  joystick.releasePointerCapture(joyPointerId);
               } catch (err) {}
               joyPointerId = null;
               resetMobileJoystick();
            };
            joystick.addEventListener("pointerup", end);
            joystick.addEventListener("pointercancel", end);
            joystick.addEventListener("pointerleave", end);
         }

         bindHoldButton(mobileUI.buttons.jump, "Space");
         bindHoldButton(mobileUI.buttons.dash, "ShiftLeft");
         bindHoldButton(mobileUI.buttons.blast, "KeyQ");
         bindHoldButton(mobileUI.buttons.special, "KeyE");
         bindHoldButton(mobileUI.buttons.nen, "KeyC");

         if (mobileUI.buttons.attack) {
            const attackBtn = mobileUI.buttons.attack;
            attackBtn.addEventListener("click", (e) => e.preventDefault());
            attackBtn.addEventListener("pointerdown", (e) => {
               e.preventDefault();
               attackBtn.classList.add("active");
               melee();
            });
            const clear = () => attackBtn.classList.remove("active");
            attackBtn.addEventListener("pointerup", clear);
            attackBtn.addEventListener("pointercancel", clear);
            attackBtn.addEventListener("pointerleave", clear);
         }
      }

      resetMobileJoystick();
      Object.values(mobileUI.buttons).forEach(btn => {
         if (btn) btn.classList.remove("active");
      });
      ["Space", "ShiftLeft", "KeyQ", "KeyE", "KeyC"].forEach(code => {
         input[code] = false;
         inputUp[code] = false;
      });
   }

   function isRearDebugCameraActive() {
      return !!(rearDebugCamera && !rearDebugCamera.isDisposed());
   }

   function disableRearDebugCamera() {
      const rear = rearDebugCamera;
      rearDebugCamera = null;
      if (!rear) {
         window.HUD?.setRearViewActive?.(false);
         return false;
      }

      const owningScene = typeof rear.getScene === "function" ? rear.getScene() : scene;
      if (owningScene && rear._dbgObserver) {
         try { owningScene.onBeforeRenderObservable.remove(rear._dbgObserver); } catch {}
      }
      rear._dbgObserver = null;

      try { rear.dispose(); } catch {}

      if (owningScene) {
         const active = Array.isArray(owningScene.activeCameras)
            ? owningScene.activeCameras.filter(cam => cam && cam !== rear && !cam.__isRearDebug)
            : [];
         const next = [];
         const seen = new Set();
         const push = (cam) => {
            if (cam && !seen.has(cam)) {
               seen.add(cam);
               next.push(cam);
            }
         };
         if (owningScene === scene && camera) push(camera);
         active.forEach(push);
         if (next.length > 0) {
            owningScene.activeCameras = next;
            if (owningScene === scene && camera && next.includes(camera)) {
               owningScene.activeCamera = camera;
            } else if (!owningScene.activeCamera) {
               owningScene.activeCamera = next[0];
            }
         } else if (owningScene === scene && camera) {
            owningScene.activeCameras = [camera];
            owningScene.activeCamera = camera;
         } else {
            owningScene.activeCameras = [];
         }
      }

      window.HUD?.setRearViewActive?.(false);
      return true;
   }

   function enableRearDebugCamera(options = {}) {
      if (!scene || !playerRoot || !camera) {
         return null;
      }
      if (rearDebugCamera && !rearDebugCamera.isDisposed()) {
         return rearDebugCamera;
      }

      const width = Number.isFinite(options.w) ? options.w : 0.24;
      const height = Number.isFinite(options.h) ? options.h : 0.24;
      const margin = Number.isFinite(options.margin) ? options.margin : 0.01;
      const x = Number.isFinite(options.x) ? options.x : (1 - width - margin);
      const y = Number.isFinite(options.y) ? options.y : (1 - height - margin);
      const offsetY = Number.isFinite(options.offsetY)
         ? options.offsetY
         : (camera?.target ? (camera.target.y - playerRoot.position.y) : 0.9);

      const rear = new BABYLON.FreeCamera("rear-debug-camera", playerRoot.position.clone(), scene);
      rear.minZ = camera.minZ;
      rear.maxZ = camera.maxZ;
      rear.fov = Number.isFinite(options.fov) ? options.fov : camera.fov;
      rear.viewport = new BABYLON.Viewport(x, y, width, height);
      rear.layerMask = camera.layerMask;
      rear.inputs?.clear?.();
      rear.speed = 0;
      rear.inertia = 0;
      rear.__isRearDebug = true;

      const updateObserver = scene.onBeforeRenderObservable.add(() => {
         if (!playerRoot || !camera) return;
         rear.position.copyFrom(playerRoot.position);
         rear.position.y += offsetY;

         TMP_REAR_DIR.copyFrom(camera.target);
         TMP_REAR_DIR.subtractInPlace(camera.position);
         const lenSq = TMP_REAR_DIR.lengthSquared();
         if (lenSq > 1e-6) {
            TMP_REAR_DIR.scaleInPlace(1 / Math.sqrt(lenSq));
         } else {
            TMP_REAR_DIR.set(0, 0, 1);
         }
         const pitchY = TMP_REAR_DIR.y;
         TMP_REAR_DIR.x *= -1;
         TMP_REAR_DIR.z *= -1;
         TMP_REAR_DIR.y = pitchY;

         TMP_REAR_TARGET.copyFrom(rear.position);
         TMP_REAR_TARGET.addInPlace(TMP_REAR_DIR);
         rear.setTarget(TMP_REAR_TARGET);
      });
      rear._dbgObserver = updateObserver;

      const existing = Array.isArray(scene.activeCameras) ? scene.activeCameras.filter(Boolean) : [];
      const keep = existing.filter(cam => cam !== rear && !cam.__isRearDebug);
      const combined = [];
      const seen = new Set();
      const push = (cam) => {
         if (cam && !seen.has(cam)) {
            seen.add(cam);
            combined.push(cam);
         }
      };
      push(camera);
      keep.forEach(push);
      push(rear);
      scene.activeCameras = combined;
      scene.activeCamera = camera;

      rearDebugCamera = rear;
      window.HUD?.setRearViewActive?.(true);
      return rear;
   }

   async function setupBabylon(canvas) {
      disableRearDebugCamera();
      disableCullingOverlay();
      disableRearDebugProxies();
      disableSingleCamPerfTest();
      engine = new BABYLON.Engine(canvas, true, {
         stencil: true
      });
      resetAdaptiveQualityState();
      scene = new BABYLON.Scene(engine);
      window.RegionManager?.setScene?.(scene);
      scene.collisionsEnabled = true;
      scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.10, 1.0);
      scene.ambientColor = new BABYLON.Color3(0.25, 0.25, 0.3);

      camera = new BABYLON.ArcRotateCamera("cam", Math.PI / 2, 1.1, 14, new BABYLON.Vector3(0, 2, 0), scene);
      camera.lowerRadiusLimit = 6;
      camera.upperRadiusLimit = 30;
      camera.upperBetaLimit = 1.45;
      camera.attachControl(canvas, true);
      camera.checkCollisions = true;
      camera.applyGravity = false;
      const pInput = camera.inputs.attached.pointers;
      if (pInput && pInput.buttons) {
         pInput.buttons = [2];
      }
      camera.panningSensibility = 0;
      window.addEventListener("contextmenu", e => e.preventDefault());
      scene.activeCamera = camera;
      scene.activeCameras = [camera];
      initializeAdaptiveQuality(scene, engine, camera);
      await setupEnvironment(scene);

      const spawnHeight = getTerrainHeight(0, 0);
      const baseY = spawnHeight === null ? 3 : spawnHeight + 1.8;
      startPos = new BABYLON.Vector3(0, baseY, 0);

      const p = createHumanoid(state.ch.color || "#00ffcc", RIG, cosmeticSelection);
      playerRoot = player = p.root; // collider mesh
      playerRoot.position.copyFrom(startPos);
      state.prevPlayerPos = playerRoot.position.clone();
      state.rootGroundOffset = 0;
      state.rootGroundOffsetTarget = 0;
      state.groundSampleCountdown = 0;
      state.groundSampleDirty = true;
      state.prevGrounded = false;
      state.prevIdle = false;
      player.checkCollisions = true;
      playerCosmeticController = p.cosmetics || null;
      const basePlayerMeta = p.root.metadata || {};
      basePlayerMeta.parts = p.parts;
      basePlayerMeta.animPhase = 0;
      basePlayerMeta.footIK = p.root.metadata?.footIK;
      basePlayerMeta.cosmetics = playerCosmeticController?.getState?.() || getCosmeticSelection();
      player.metadata = basePlayerMeta;
      applyCosmeticsToPlayer();
      persistCosmeticsSelection({ emit: false });
      updateTerrainStreaming(playerRoot.position, 0, true);
      window.RegionManager?.updateSpatialState?.(playerRoot.position, { silent: true });

      state.nenLight = new BABYLON.PointLight("nenLight", playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)), scene);
      state.nenLight.intensity = 0.0;
      state.nenLight.diffuse = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");

      scene.registerBeforeRender(() => {
         camera.target = playerRoot.position.add(new BABYLON.Vector3(0, 0.9, 0));
         state.nenLight.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0));
      });

      spawnWave(6);

      if (isTouchDevice) {
         initMobileControls();
      }

      canvas.addEventListener("pointerdown", (e) => {
         if (paused) return;
         if (e.pointerType === "mouse" && e.button === 0) {
            e.preventDefault();
            melee();
         }
         handleTerrainBrushPointerDown(e);
      });

      canvas.addEventListener("wheel", (e) => {
         if (paused) return;
         if (!state.aura.ken || !input["KeyK"]) return;
         if (!FLOW_PRESETS.length) return;
         const direction = Math.sign(e.deltaY || 0);
         if (direction === 0) return;
         if (rotateFlowPreset(direction)) {
            e.preventDefault();
         }
      }, { passive: false });

      window.addEventListener("keydown", e => {
         if (e.code === "Escape") {
            togglePause();
            return;
         }
         if (!paused) {
            const hotbarIndex = parseHotbarKey(e.code);
            if (hotbarIndex !== null) {
               if (!e.repeat && state.inventory) {
                  state.inventory.equip(hotbarIndex);
               }
               e.preventDefault();
               return;
            }
         }
         input[e.code] = true;
         if (e.repeat) return;
         inputOnce[e.code] = true;
      });
      window.addEventListener("keyup", e => {
         input[e.code] = false;
         inputUp[e.code] = true;
      });
      window.addEventListener("mousedown", (e) => {
         if (paused) return;
         if (e.button === 0 && e.target !== canvas) melee();
      });

      if (DEV_BUILD) {
         canvas.addEventListener("pointermove", handleTerrainBrushPointerMove);
         canvas.addEventListener("pointerup", handleTerrainBrushPointerUp);
         canvas.addEventListener("pointerleave", handleTerrainBrushPointerUp);
         canvas.addEventListener("pointercancel", handleTerrainBrushPointerUp);
      }

      engine.runRenderLoop(() => {
         const now = performance.now();
         const dt = lastTime ? (now - lastTime) / 1000 : 0;
         lastTime = now;
         if (!paused) tick(dt);
         updateAdaptiveQuality(dt);
         scene.render();
         updateProfilerMetrics();
         inputOnce = {};
         inputUp = {};
      });
      window.addEventListener("resize", () => engine.resize());
   }

   function togglePause() {
      paused = !paused;
      hud.pauseOverlay.classList.toggle("visible", paused);
   }

  async function startGame(ch, options = {}) {
      await rigReady;
      playerCosmeticController = null;
      workerMetrics.pending = 0;

      const sceneAuditSpec = options.sceneAudit || null;
      const sceneAuditKey = typeof sceneAuditSpec === "string"
         ? sceneAuditSpec
         : (sceneAuditSpec && typeof sceneAuditSpec === "object" ? sceneAuditSpec.key : null);
      const sceneAuditLabels = sceneAuditSpec && typeof sceneAuditSpec === "object" ? sceneAuditSpec : {};

      const completeSceneAuditTransition = () => {
         if (!sceneAuditKey) return;
         try {
            window.SceneAudit?.completeTransition?.(sceneAuditKey, {
               fromLabel: sceneAuditLabels.fromLabel || undefined,
               toLabel: sceneAuditLabels.toLabel || "In-Game Scene",
               scene,
               engine
            });
         } catch (err) {}
      };

      const runtimeSnapshot = options && Object.prototype.hasOwnProperty.call(options, "runtime")
         ? options.runtime
         : loadRuntimeState();
      const runtimeHasInventory = !!(runtimeSnapshot && runtimeSnapshot.inventory);
      pendingInventorySnapshot = runtimeHasInventory ? runtimeSnapshot.inventory : null;

      state.ch = ch;
      saveCharacter(ch);
      // seed pools before recompute (so we don't clamp to zero)
      state.hp = state.maxHP;
      state.nen.cur = state.nen.max;
      recomputeDerived(); // compute from (creator + alloc)
      // after recompute, fill to full
      state.hp = state.maxHP;
      state.nen.cur = state.nen.max;
      state.aura.ten = true;
      state.aura.zetsu = false;
      state.aura.ren = false;
      state.aura.ken = false;
      state.aura.in = false;
      state.aura.gyo = false;
      state.aura.shu = false;
      state.aura.en.on = false;
      state.aura.en.r = 0;
      state.aura.renActive = false;
      state.aura.renCharge = 0;
      state.aura.renMul = 1.0;
      state.koVulnerabilityT = 0;
      state.koStrike = null;
      state.koLastFocus = null;
      state.lastKoWarning = 0;
      notifyAuraChange();

      setupInventorySystem();

      const hudApi = window.HUD;
      hudApi?.ensureControlDock?.();
      setupHudAdaptiveControls(hudApi);
      ensureProfilerHudConfigured(hudApi);
      if (hudApi?.configureDevPanel) {
         hudApi.configureDevPanel({
            toggleAura: (key, value) => setAuraState(key, value),
            setEnRadius: radius => setEnRadius(radius),
            spawnDummy: count => spawnTargetDummy({ count }),
            refill: (target) => {
               if (target === "hp") return refillResources({ hp: true, nen: false });
               if (target === "nen") return refillResources({ hp: false, nen: true });
               return refillResources({ hp: true, nen: true });
            },
            toggleRearView: (enabled) => {
               if (enabled) {
                  const rearCam = enableRearDebugCamera({ w: 0.26, h: 0.26 });
                  if (!rearCam) {
                     window.HUD?.setRearViewActive?.(false);
                     return false;
                  }
                  return true;
               }
               disableRearDebugCamera();
               return true;
            },
            toggleTerrainBrush: (enabled) => setTerrainBrushEnabled(enabled),
            setTerrainBrushOptions: (options) => setTerrainBrushOptions(options),
            setTerrainBrushDeferred: (enabled) => setTerrainBrushDeferred(enabled),
            resetTerrainPatch: () => resetTerrainBrushPatch(),
            toggleCullingOverlay: (enabled) => setCullingOverlayEnabled(enabled),
            toggleRearProxies: (enabled) => setRearDebugProxiesEnabled(enabled),
            toggleSingleCamPerf: (enabled) => setSingleCamPerfTestEnabled(enabled)
         });
         hudApi.updateDevPanelState?.(getAuraSnapshot());
         hudApi.setRearViewActive?.(isRearDebugCameraActive());
         scheduleTerrainRadiusUiUpdate();
         syncTerrainBrushHud();
         hudApi.setCullingOverlayState?.({ enabled: cullingOverlayState.enabled, metrics: cullingOverlayState.lastMetrics });
         hudApi.setRearProxyState?.({ enabled: rearProxyState.enabled });
         hudApi.setSingleCamPerfState?.({ enabled: singleCamPerfState.enabled });
         if (singleCamPerfState.metrics) {
            hudApi.setSingleCamPerfMetrics?.(singleCamPerfState.metrics);
         } else {
            hudApi.setSingleCamPerfMetrics?.(null);
         }
      }

      if (typeof regionChangeUnsub === "function") {
         try { regionChangeUnsub(); } catch {}
      }
      regionChangeUnsub = window.RegionManager?.onRegionChange?.(() => scheduleRuntimeSave()) || null;

      if (devHotkeyHandler) {
         window.removeEventListener("keydown", devHotkeyHandler);
      }
      devHotkeyHandler = (event) => {
         if (event.code === "KeyD" && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            hudApi?.toggleDevPanel?.();
         }
      };
      window.addEventListener("keydown", devHotkeyHandler);

      if (profilerHotkeyHandler) {
         window.removeEventListener("keydown", profilerHotkeyHandler);
      }
      if (profilerState.enabled) {
         profilerHotkeyHandler = (event) => {
            if (event.code === "KeyP" && event.ctrlKey && event.shiftKey) {
               event.preventDefault();
               hudApi?.toggleProfilerOverlay?.();
            }
         };
         window.addEventListener("keydown", profilerHotkeyHandler);
      } else {
         profilerHotkeyHandler = null;
         hudApi?.setProfilerOverlayVisible?.(false);
      }

      if (runtimeSnapshot) {
         applyRuntimeSnapshot(runtimeSnapshot, { skipInventory: runtimeHasInventory });
         msg("Save restored. Press Ctrl+Shift+D for QA tools.");
      } else {
         updateHUD();
         msg("Defeat enemies to trigger the exit portal! Press L to open the Level menu.");
      }

      scheduleRuntimeSave({ immediate: true });

      const canvas = $("#game-canvas");
      await setupBabylon(canvas);
      completeSceneAuditTransition();
      setTimeout(() => {
         try {
            canvas.focus();
			// One more resize after focus/paint, to be extra safe:
            engine && engine.resize();
         } catch (e) {}
      }, 0);
   }

   // ------------ Humanoid (segmented) ------------
   function createHumanoid(hex, rig = RIG, cosmeticPreset = DEFAULT_COSMETIC_SELECTION) {
      const color = BABYLON.Color3.FromHexString(hex);
      const clothMatCache = new Map();
      const hairMatCache = new Map();
      const shoeMatCache = new Map();
      const accessoryMatCache = new Map();
      const animationStore = window.RigDefinitions && window.RigDefinitions.AnimationStore;

      function mat(c) {
         const m = new BABYLON.StandardMaterial("m" + Math.random(), scene);
         m.diffuseColor = c;
         m.emissiveColor = c.scale(0.16);
         m.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
         return m;
      }

      function colorFromHex(hex, fallback = "#ffffff") {
         try {
            if (typeof hex === "string" && /^#/u.test(hex)) {
               return BABYLON.Color3.FromHexString(hex);
            }
         } catch (err) {}
         try {
            if (typeof fallback === "string" && /^#/u.test(fallback)) {
               return BABYLON.Color3.FromHexString(fallback);
            }
         } catch (err) {}
         return BABYLON.Color3.White();
      }

      function clothMat(hexColor) {
         const key = (typeof hexColor === "string" && hexColor.startsWith("#")) ? hexColor : "#2d3d8f";
         if (clothMatCache.has(key)) return clothMatCache.get(key);
         const m = new BABYLON.StandardMaterial(`cloth-${key}-${Math.random()}`, scene);
         const col = colorFromHex(key, "#2d3d8f");
         m.diffuseColor = col;
         m.emissiveColor = col.scale(0.12);
         m.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
         clothMatCache.set(key, m);
         return m;
      }

      function hairMat(hexColor) {
         const key = (typeof hexColor === "string" && hexColor.startsWith("#")) ? hexColor : "#2f2f38";
         if (hairMatCache.has(key)) return hairMatCache.get(key);
         const m = new BABYLON.StandardMaterial(`hair-${key}-${Math.random()}`, scene);
         const col = colorFromHex(key, "#2f2f38");
         m.diffuseColor = col;
         m.emissiveColor = col.scale(0.25);
         m.specularColor = new BABYLON.Color3(0.22, 0.22, 0.22);
         hairMatCache.set(key, m);
         return m;
      }

      function shoeMat(spec) {
         const id = spec?.id || DEFAULT_SHOE_ID;
         if (shoeMatCache.has(id)) return shoeMatCache.get(id);
         const mat = new BABYLON.StandardMaterial(`shoe-${id}-${Math.random()}`, scene);
         const base = colorFromHex(spec?.base, "#2f2f38");
         const accent = colorFromHex(spec?.accent, spec?.base || "#2f2f38");
         mat.diffuseColor = base;
         mat.emissiveColor = accent.scale(0.2);
         mat.specularColor = new BABYLON.Color3(0.32, 0.32, 0.32);
         shoeMatCache.set(id, mat);
         return mat;
      }

      function accessoryMat(hexColor) {
         const key = (typeof hexColor === "string" && hexColor.startsWith("#")) ? hexColor : "#ffffff";
         if (accessoryMatCache.has(key)) return accessoryMatCache.get(key);
         const mat = new BABYLON.StandardMaterial(`acc-${key}-${Math.random()}`, scene);
         const col = colorFromHex(key, "#ffffff");
         mat.diffuseColor = col;
         mat.emissiveColor = col.scale(0.25);
         mat.specularColor = new BABYLON.Color3(0.35, 0.35, 0.35);
         accessoryMatCache.set(key, mat);
         return mat;
      }

      // collider root
      const root = BABYLON.MeshBuilder.CreateBox("collider", {
         width: 0.85,
         height: 2.4,
         depth: 0.7
      }, scene);
      root.checkCollisions = true;
      root.isVisible = false;

      // helpers
      const nodes = {};

      function segY(parent, key, w, h, d, col) {
         const pivot = new BABYLON.TransformNode(key + "_pivot", scene);
         pivot.parent = parent;
         const mesh = BABYLON.MeshBuilder.CreateBox(key, {
            width: w,
            height: h,
            depth: d
         }, scene);
         mesh.material = mat(col);
         mesh.parent = pivot;
         mesh.position.y = -h * 0.5;
         nodes[key] = pivot;
         return {
            pivot,
            mesh
         };
      }

      function foot(parent, key, w, h, len, col) {
         const pivot = new BABYLON.TransformNode(key + "_pivot", scene);
         pivot.parent = parent;
         const mesh = BABYLON.MeshBuilder.CreateBox(key, {
            width: w,
            height: h,
            depth: len
         }, scene);
         mesh.material = mat(col);
         mesh.parent = pivot;
         mesh.position.y = -h * 0.5;
         mesh.position.z = len * 0.5;
         nodes[key] = pivot;
         return {
            pivot,
            mesh
         };
      }

      // sizes from rig
      const s = rig;

      // torso chain
      const pelvis = segY(root, "pelvis", s.pelvis.w, s.pelvis.h, s.pelvis.d, color);
      const torsoLower = segY(pelvis.pivot, "torsoLower", s.torsoLower.w, s.torsoLower.h, s.torsoLower.d, color);
      torsoLower.pivot.position.y = 0.30;
      const torsoUpper = segY(torsoLower.pivot, "torsoUpper", s.torsoUpper.w, s.torsoUpper.h, s.torsoUpper.d, color.scale(0.9));
      torsoUpper.pivot.position.y = 0.55;
      const neck = segY(torsoUpper.pivot, "neck", s.neck.w, s.neck.h, s.neck.d, color.scale(0.85));
      neck.pivot.position.y = 0.55;

      // head pivot so we can transform the head
      const headPivot = new BABYLON.TransformNode("head_pivot", scene);
      headPivot.parent = neck.pivot;
      nodes["head"] = headPivot;
      const headM = BABYLON.MeshBuilder.CreateBox(
         "head",
         {
            width: s.head.w,
            height: s.head.h,
            depth: s.head.d
         },
         scene
      );
      headM.material = mat(color.scale(0.8));
      headM.parent = headPivot;
      headM.position.y = s.head.h * 0.5;

      const faceAnchor = new BABYLON.TransformNode("faceAnchor", scene);
      faceAnchor.parent = headPivot;
      faceAnchor.rotationQuaternion = null;

      const facePlane = BABYLON.MeshBuilder.CreatePlane("face", {
         width: s.head.w * 0.92,
         height: s.head.h * 0.92
      }, scene);
      facePlane.parent = faceAnchor;
      facePlane.position.set(0, 0, 0);
      facePlane.isPickable = false;

      const hairRoot = new BABYLON.TransformNode("hairRoot", scene);
      hairRoot.parent = headPivot;
      hairRoot.rotationQuaternion = null;

      const accessoryRoot = new BABYLON.TransformNode("accessoryRoot", scene);
      accessoryRoot.parent = headPivot;
      accessoryRoot.position.y = s.head.h * 0.1;

      function applyAnchorTransform(node, anchor) {
         if (!node || !anchor) return;
         const resolved = anchor.resolved || {};
         const position = resolved.position || { x: 0, y: 0, z: 0 };
         const rotationDeg = resolved.rotationDeg || { x: 0, y: 0, z: 0 };
         const scale = resolved.scale || { x: 1, y: 1, z: 1 };
         node.position.set(position.x || 0, position.y || 0, position.z || 0);
         node.rotationQuaternion = null;
         node.rotation.x = (rotationDeg.x || 0) * DEG2RAD;
         node.rotation.y = (rotationDeg.y || 0) * DEG2RAD;
         node.rotation.z = (rotationDeg.z || 0) * DEG2RAD;
         node.scaling.set(scale.x || 1, scale.y || 1, scale.z || 1);
      }

      function refreshAnchor(kind, targetId) {
         const normalized = normalizeAnchorKind(kind);
         if (!normalized) return null;
         if (normalized === "face") {
            const id = (typeof targetId === "string" && FACE_SPEC_MAP.has(targetId))
               ? targetId
               : (FACE_SPEC_MAP.has(cosmeticState.face) ? cosmeticState.face : DEFAULT_FACE_ID);
            const anchor = resolveCosmeticAnchor("face", id, s);
            if (anchor) applyAnchorTransform(faceAnchor, anchor);
            return anchor;
         }
         if (normalized === "hair") {
            const id = (typeof targetId === "string" && HAIR_SPEC_MAP.has(targetId))
               ? targetId
               : (HAIR_SPEC_MAP.has(cosmeticState.hair) ? cosmeticState.hair : DEFAULT_HAIR_ID);
            const anchor = resolveCosmeticAnchor("hair", id, s);
            if (anchor) applyAnchorTransform(hairRoot, anchor);
            return anchor;
         }
         return null;
      }

      // shoulders (anchors)
      const shoulderL = new BABYLON.TransformNode("shoulderL", scene);
      shoulderL.parent = torsoUpper.pivot;
      nodes["shoulderL"] = shoulderL;
      const shoulderR = new BABYLON.TransformNode("shoulderR", scene);
      shoulderR.parent = torsoUpper.pivot;
      nodes["shoulderR"] = shoulderR;

      // arms
      const a = s.arm;
      const armL = {};
      armL.upper = segY(shoulderL, "armL_upper", a.upperW, a.upperLen, a.upperD, color.scale(0.9));
      armL.fore = segY(armL.upper.pivot, "armL_fore", a.foreW, a.foreLen, a.foreD, color.scale(0.8));
      armL.hand = segY(armL.fore.pivot, "armL_hand", a.foreW, a.handLen, a.foreD, color.scale(0.75));

      const armR = {};
      armR.upper = segY(shoulderR, "armR_upper", a.upperW, a.upperLen, a.upperD, color.scale(0.9));
      armR.fore = segY(armR.upper.pivot, "armR_fore", a.foreW, a.foreLen, a.foreD, color.scale(0.8));
      armR.hand = segY(armR.fore.pivot, "armR_hand", a.foreW, a.handLen, a.foreD, color.scale(0.75));

      // hips (anchors)
      const hipL = new BABYLON.TransformNode("hipL", scene);
      hipL.parent = pelvis.pivot;
      nodes["hipL"] = hipL;
      const hipR = new BABYLON.TransformNode("hipR", scene);
      hipR.parent = pelvis.pivot;
      nodes["hipR"] = hipR;

      // legs
      const l = s.leg;
      const legL = {};
      legL.thigh = segY(hipL, "legL_thigh", l.thighW, l.thighLen, l.thighD, color.scale(0.85));
      legL.shin = segY(legL.thigh.pivot, "legL_shin", l.shinW, l.shinLen, l.shinD, color.scale(0.8));
      legL.foot = foot(legL.shin.pivot, "legL_foot", l.footW, l.footH, l.footLen, color.scale(0.75));

      const legR = {};
      legR.thigh = segY(hipR, "legR_thigh", l.thighW, l.thighLen, l.thighD, color.scale(0.85));
      legR.shin = segY(legR.thigh.pivot, "legR_shin", l.shinW, l.shinLen, l.shinD, color.scale(0.8));
      legR.foot = foot(legR.shin.pivot, "legR_foot", l.footW, l.footH, l.footLen, color.scale(0.75));

      function createShoeOverlay(pivot, name) {
         const mesh = BABYLON.MeshBuilder.CreateBox(name, {
            width: l.footW,
            height: l.footH,
            depth: l.footLen
         }, scene);
         mesh.parent = pivot;
         mesh.position.y = -l.footH * 0.5;
         mesh.position.z = l.footLen * 0.5;
         mesh.scaling = new BABYLON.Vector3(1.08, 1.05, 1.12);
         mesh.isPickable = false;
         mesh.material = clothMat("#2f2f38");
         return mesh;
      }

      const shoeMeshes = [
         createShoeOverlay(legL.foot.pivot, "shoeL"),
         createShoeOverlay(legR.foot.pivot, "shoeR")
      ];

      // apply transforms (absolute, same as editor)
      const T = rig.transforms || {};

      function applyBasePose() {
         PART_KEYS.forEach(key => {
            const n = nodes[key];
            if (!n) return;
            const tr = T[key] || t0();
            n.position.set(tr.pos.x || 0, tr.pos.y || 0, tr.pos.z || 0);
            setNodeEuler(n, {
               x: d2r(tr.rot.x || 0),
               y: d2r(tr.rot.y || 0),
               z: d2r(tr.rot.z || 0)
            });
         });
      }

      const rigNodeMap = {};
      PART_KEYS.forEach(key => {
         if (nodes[key]) rigNodeMap[key] = nodes[key];
      });

      applyBasePose();
      syncRigNodesToQuaternion(rigNodeMap);

      const rigAnimation = {
         binding: null,
         frame: null,
         loop: true,
         nodes: rigNodeMap,
         applyBasePose,
         setFrame(frame, options = {}) {
            const binding = this.binding;
            if (!binding || !binding.group) return false;
            const range = binding.range || { start: 0, end: binding.fps || 30 };
            const span = Math.max(1e-6, (range.end ?? (range.start + (binding.fps || 30))) - range.start);
            let absolute = Number.isFinite(frame) ? frame : range.start;
            let target = absolute;
            if (options.loop !== false) {
               let relative = (absolute - range.start) % span;
               if (relative < 0) relative += span;
               target = range.start + relative;
            } else {
               if (absolute < range.start) target = range.start;
               else if (absolute > range.end) target = range.end;
            }
            this.frame = absolute;
            applyBasePose();
            binding.group.goToFrame(target);
            binding.group.pause();
            syncRigNodesFromQuaternion(rigNodeMap);
            return true;
         },
         advance(dt, speedRatio = 1, loop = true) {
            if (!this.binding || !this.binding.group) return false;
            const fps = this.binding.fps || 30;
            const current = typeof this.frame === "number" ? this.frame : (this.binding.range?.start ?? 0);
            const next = current + dt * fps * Math.max(0, speedRatio);
            return this.setFrame(next, { loop });
         }
      };

      let animationStoreUnsub = null;

      function disposeAnimationBinding() {
         if (animationStoreUnsub) {
            try { animationStoreUnsub(); } catch (err) { /* ignore */ }
            animationStoreUnsub = null;
         }
         if (rigAnimation.binding?.group) {
            try { rigAnimation.binding.group.dispose(); } catch (err) { /* ignore */ }
         }
         rigAnimation.binding = null;
         rigAnimation.frame = null;
         applyBasePose();
         syncRigNodesToQuaternion(rigNodeMap);
      }

      function rebuildAnimationBinding() {
         if (rigAnimation.binding?.group) {
            try { rigAnimation.binding.group.dispose(); } catch (err) { /* ignore */ }
         }
         rigAnimation.binding = null;

         if (!animationStore || typeof animationStore.buildAnimationGroup !== "function") {
            rigAnimation.frame = null;
            applyBasePose();
            syncRigNodesToQuaternion(rigNodeMap);
            return;
         }

         const activeAnim = typeof animationStore.getActive === "function"
            ? animationStore.getActive()
            : null;
         const build = animationStore.buildAnimationGroup({
            scene,
            nodes: rigNodeMap,
            animation: activeAnim,
            id: `humanoid-${Math.random().toString(36).slice(2)}`
         });
         if (build && build.group) {
            rigAnimation.binding = {
               group: build.group,
               fps: build.fps,
               range: { start: build.range.start, end: build.range.end },
               name: build.name || activeAnim?.name || null
            };
            rigAnimation.binding.group.start(false, 1.0, build.range.start, build.range.end);
            rigAnimation.binding.group.pause();
            const targetFrame = typeof rigAnimation.frame === "number" ? rigAnimation.frame : build.range.start;
            rigAnimation.setFrame(targetFrame, { loop: rigAnimation.loop !== false });
         } else {
            rigAnimation.frame = null;
            applyBasePose();
            syncRigNodesToQuaternion(rigNodeMap);
         }
      }

      rigAnimation.rebuild = rebuildAnimationBinding;
      rigAnimation.dispose = disposeAnimationBinding;

      if (animationStore && typeof animationStore.onChange === "function") {
         animationStoreUnsub = animationStore.onChange(() => {
            rebuildAnimationBinding();
         });
      }
      rebuildAnimationBinding();

      root.onDisposeObservable?.add(() => {
         disposeAnimationBinding();
      });

      // expose parts for animation
      const parts = {
         pelvis: pelvis.pivot,
         lowerTorso: torsoLower.pivot,
         upperTorso: torsoUpper.pivot,
         neck: neck.pivot,
         head: headM,
         armL: {
            shoulder: armL.upper.pivot,
            elbow: armL.fore.pivot,
            wrist: armL.hand.pivot
         },
         armR: {
            shoulder: armR.upper.pivot,
            elbow: armR.fore.pivot,
            wrist: armR.hand.pivot
         },
         legL: {
            hip: legL.thigh.pivot,
            knee: legL.shin.pivot,
            ankle: legL.foot.pivot,
            footMesh: legL.foot.mesh
         },
         legR: {
            hip: legR.thigh.pivot,
            knee: legR.shin.pivot,
            ankle: legR.foot.pivot,
            footMesh: legR.foot.mesh
         }
      };

      const footIK = {
         left: {
            pivot: legL.foot.pivot,
            mesh: legL.foot.mesh,
            restPos: legL.foot.pivot.position.clone(),
            castUp: 0.45,
            maxDrop: s.leg.thighLen + s.leg.shinLen + 0.6,
            clearance: FOOT_CLEARANCE,
            contactThreshold: 0.5,
            maxLift: 0.35
         },
         right: {
            pivot: legR.foot.pivot,
            mesh: legR.foot.mesh,
            restPos: legR.foot.pivot.position.clone(),
            castUp: 0.45,
            maxDrop: s.leg.thighLen + s.leg.shinLen + 0.6,
            clearance: FOOT_CLEARANCE,
            contactThreshold: 0.5,
            maxLift: 0.35
         }
      };

      const clothingRefs = {
         torso: [torsoLower.mesh, torsoUpper.mesh],
         sleeves: [armL.upper.mesh, armR.upper.mesh],
         hips: [pelvis.mesh],
         thighs: [legL.thigh.mesh, legR.thigh.mesh],
         shins: [legL.shin.mesh, legR.shin.mesh]
      };

      const activeHair = { id: null, nodes: [] };
      const activeAccessories = new Map();
      let cosmeticState = normalizeCosmetics(cosmeticPreset, DEFAULT_COSMETIC_SELECTION);

      function ensureFaceMaterial(faceId) {
         const id = FACE_SPEC_MAP.has(faceId) ? faceId : DEFAULT_FACE_ID;
         if (FACE_MATERIAL_CACHE.has(id)) return FACE_MATERIAL_CACHE.get(id).material;
         const size = 512;
         const texture = new BABYLON.DynamicTexture(`face-${id}`, { width: size, height: size }, scene, false);
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
         const material = new BABYLON.StandardMaterial(`faceMat-${id}`, scene);
         material.diffuseTexture = texture;
         material.emissiveColor = new BABYLON.Color3(0, 0, 0);
         material.specularColor = new BABYLON.Color3(0, 0, 0);
         material.backFaceCulling = false;
         FACE_MATERIAL_CACHE.set(id, { material, texture });
         return material;
      }

      function disposeNodes(nodes) {
         if (!Array.isArray(nodes)) return;
         nodes.forEach(node => {
            try {
               node?.dispose?.();
            } catch (err) {}
         });
      }

      function instantiateHair(spec) {
         const nodes = [];
         const baseMat = hairMat(spec?.primaryColor);
         const accentMat = hairMat(spec?.secondaryColor || spec?.primaryColor);
         switch (spec?.id) {
            case "windswept": {
               const crown = BABYLON.MeshBuilder.CreateBox("hair-windswept-crown", {
                  width: s.head.w * 1.1,
                  height: s.head.h * 0.42,
                  depth: s.head.d * 1.08
               }, scene);
               crown.parent = hairRoot;
               crown.position.y = s.head.h * 0.1;
               crown.material = baseMat;
               crown.isPickable = false;
               nodes.push(crown);

               const fringe = BABYLON.MeshBuilder.CreateBox("hair-windswept-fringe", {
                  width: s.head.w * 1.05,
                  height: s.head.h * 0.26,
                  depth: s.head.d * 0.32
               }, scene);
               fringe.parent = hairRoot;
               fringe.position.set(0.04, -s.head.h * 0.05, s.head.d * 0.55);
               fringe.rotation.y = -5 * DEG2RAD;
               fringe.material = accentMat;
               fringe.isPickable = false;
               nodes.push(fringe);
               break;
            }
            case "scout_hat": {
               const brim = BABYLON.MeshBuilder.CreateCylinder("hat-brim", {
                  diameter: s.head.w * 1.5,
                  height: 0.05
               }, scene);
               brim.parent = hairRoot;
               brim.position.y = s.head.h * 0.2;
               brim.material = accentMat;
               brim.isPickable = false;
               nodes.push(brim);

               const crown = BABYLON.MeshBuilder.CreateCylinder("hat-crown", {
                  diameter: s.head.w * 0.9,
                  height: s.head.h * 0.45
               }, scene);
               crown.parent = hairRoot;
               crown.position.y = s.head.h * 0.45;
               crown.material = baseMat;
               crown.isPickable = false;
               nodes.push(crown);
               break;
            }
            default: {
               const cap = BABYLON.MeshBuilder.CreateBox("hair-buzz", {
                  width: s.head.w * 1.04,
                  height: s.head.h * 0.48,
                  depth: s.head.d * 1.04
               }, scene);
               cap.parent = hairRoot;
               cap.position.y = s.head.h * 0.12;
               cap.material = baseMat;
               cap.isPickable = false;
               nodes.push(cap);
               break;
            }
         }
         return nodes;
      }

      function instantiateAccessory(spec) {
         const nodes = [];
         if (!spec) return nodes;
         switch (spec.id) {
            case "visor": {
               const visor = BABYLON.MeshBuilder.CreatePlane("acc-visor", {
                  width: s.head.w * 0.95,
                  height: s.head.h * 0.28
               }, scene);
               visor.parent = accessoryRoot;
               visor.position.set(0, s.head.h * 0.18, s.head.d * 0.55);
               visor.material = accessoryMat(spec.color);
               visor.isPickable = false;
               visor.billboardMode = BABYLON.Mesh.BILLBOARDMODE_NONE;
               nodes.push(visor);
               break;
            }
            case "earrings": {
               const left = BABYLON.MeshBuilder.CreateSphere("acc-earringL", { diameter: 0.1 }, scene);
               left.parent = accessoryRoot;
               left.position.set(-s.head.w * 0.55, s.head.h * 0.05, 0);
               left.material = accessoryMat(spec.color);
               left.isPickable = false;
               nodes.push(left);

               const right = BABYLON.MeshBuilder.CreateSphere("acc-earringR", { diameter: 0.1 }, scene);
               right.parent = accessoryRoot;
               right.position.set(s.head.w * 0.55, s.head.h * 0.05, 0);
               right.material = accessoryMat(spec.color);
               right.isPickable = false;
               nodes.push(right);
               break;
            }
            case "scarf": {
               const scarf = BABYLON.MeshBuilder.CreateTorus("acc-scarf", {
                  diameter: Math.max(s.neck.w * 2.4, 0.45),
                  thickness: 0.12
               }, scene);
               scarf.parent = neck.pivot;
               scarf.rotation.x = Math.PI / 2;
               scarf.position.y = -s.neck.h * 0.2;
               scarf.material = accessoryMat(spec.color);
               scarf.isPickable = false;

               const tail = BABYLON.MeshBuilder.CreateBox("acc-scarf-tail", {
                  width: s.neck.w * 0.35,
                  height: s.head.h * 0.5,
                  depth: s.neck.d * 0.35
               }, scene);
               tail.parent = neck.pivot;
               tail.position.set(-s.neck.w * 0.25, -s.neck.h * 0.55, s.neck.d * 0.1);
               tail.rotation.z = 15 * DEG2RAD;
               tail.material = accessoryMat(spec.accent || spec.color);
               tail.isPickable = false;
               nodes.push(scarf, tail);
               break;
            }
            default:
               break;
         }
         return nodes;
      }

      function applyFace(id) {
         const spec = FACE_SPEC_MAP.has(id) ? FACE_SPEC_MAP.get(id) : FACE_SPEC_MAP.get(DEFAULT_FACE_ID) || FACE_SPECS[0];
         if (!spec) return cosmeticState.face;
         refreshAnchor("face", spec.id);
         const material = ensureFaceMaterial(spec.id);
         facePlane.material = material;
         cosmeticState.face = spec.id;
         return cosmeticState.face;
      }

      function applyHair(id) {
         const spec = HAIR_SPEC_MAP.has(id) ? HAIR_SPEC_MAP.get(id) : HAIR_SPEC_MAP.get(DEFAULT_HAIR_ID) || HAIR_SPECS[0];
         refreshAnchor("hair", spec?.id || DEFAULT_HAIR_ID);
         disposeNodes(activeHair.nodes);
         activeHair.nodes = instantiateHair(spec);
         activeHair.id = spec?.id || DEFAULT_HAIR_ID;
         cosmeticState.hair = activeHair.id;
         return cosmeticState.hair;
      }

      function applyTop(id) {
         const spec = TOP_SPEC_MAP.has(id) ? TOP_SPEC_MAP.get(id) : TOP_SPEC_MAP.get(DEFAULT_TOP_ID);
         const appliedId = spec?.id || id || DEFAULT_TOP_ID;
         const bodyMat = clothMat(spec?.body || "#2d3d8f");
         const accentMat = clothMat(spec?.accent || spec?.body || "#2d3d8f");
         const sleeveMat = clothMat(spec?.sleeve || spec?.body || "#2d3d8f");
         clothingRefs.torso[0].material = bodyMat;
         clothingRefs.torso[1].material = accentMat;
         clothingRefs.sleeves.forEach(mesh => { mesh.material = sleeveMat; });
         return appliedId;
      }

      function applyBottom(id) {
         const spec = BOTTOM_SPEC_MAP.has(id) ? BOTTOM_SPEC_MAP.get(id) : BOTTOM_SPEC_MAP.get(DEFAULT_BOTTOM_ID);
         const appliedId = spec?.id || id || DEFAULT_BOTTOM_ID;
         const hipMat = clothMat(spec?.hips || "#243244");
         const thighMat = clothMat(spec?.thigh || spec?.hips || "#243244");
         const shinMat = clothMat(spec?.shin || spec?.thigh || spec?.hips || "#243244");
         clothingRefs.hips.forEach(mesh => { mesh.material = hipMat; });
         clothingRefs.thighs.forEach(mesh => { mesh.material = thighMat; });
         clothingRefs.shins.forEach(mesh => { mesh.material = shinMat; });
         return appliedId;
      }

      function applyShoes(id) {
         const spec = SHOE_SPEC_MAP.has(id) ? SHOE_SPEC_MAP.get(id) : SHOE_SPEC_MAP.get(DEFAULT_SHOE_ID);
         const appliedId = spec?.id || id || DEFAULT_SHOE_ID;
         const mat = shoeMat(spec || { id: appliedId });
         shoeMeshes.forEach(mesh => { mesh.material = mat; mesh.setEnabled(true); });
         cosmeticState.shoes = appliedId;
         return cosmeticState.shoes;
      }

      function applyAccessories(ids) {
         const desired = normalizeAccessoryIds(ids);
         for (const [key, nodes] of activeAccessories) {
            if (!desired.includes(key)) {
               disposeNodes(nodes);
               activeAccessories.delete(key);
            }
         }
         const applied = [];
         for (const id of desired) {
            if (!ACCESSORY_SPEC_MAP.has(id)) continue;
            if (!activeAccessories.has(id)) {
               const nodes = instantiateAccessory(ACCESSORY_SPEC_MAP.get(id));
               if (nodes.length) {
                  activeAccessories.set(id, nodes);
               }
            }
            if (activeAccessories.has(id)) applied.push(id);
         }
         cosmeticState.accessories = applied.slice();
         return cosmeticState.accessories.slice();
      }

      function applyOutfit(selection) {
         const normalized = normalizeOutfit(selection, cosmeticState.outfit);
         let fullId = normalized.full;
         if (fullId && !FULL_SPEC_MAP.has(fullId)) {
            fullId = null;
         }
         if (fullId) {
            const fullSpec = FULL_SPEC_MAP.get(fullId);
            if (fullSpec?.top && TOP_SPEC_MAP.has(fullSpec.top)) {
               normalized.top = fullSpec.top;
            }
            if (fullSpec?.bottom && BOTTOM_SPEC_MAP.has(fullSpec.bottom)) {
               normalized.bottom = fullSpec.bottom;
            }
         }
         const appliedTop = applyTop(normalized.top);
         const appliedBottom = applyBottom(normalized.bottom);
         cosmeticState.outfit = {
            top: appliedTop,
            bottom: appliedBottom,
            full: fullId
         };
         return deepClone(cosmeticState.outfit);
      }

      const cosmetics = {
         segments: s,
         applyFace,
         applyHair,
         applyOutfit,
         applyShoes,
         applyAccessories,
         refreshAnchor,
         getAnchor(kind, id) {
            const normalized = normalizeAnchorKind(kind);
            if (!normalized) return null;
            if (normalized === "face") {
               const target = (typeof id === "string" && FACE_SPEC_MAP.has(id))
                  ? id
                  : (FACE_SPEC_MAP.has(cosmeticState.face) ? cosmeticState.face : DEFAULT_FACE_ID);
               return resolveCosmeticAnchor("face", target, s);
            }
            if (normalized === "hair") {
               const target = (typeof id === "string" && HAIR_SPEC_MAP.has(id))
                  ? id
                  : (HAIR_SPEC_MAP.has(cosmeticState.hair) ? cosmeticState.hair : DEFAULT_HAIR_ID);
               return resolveCosmeticAnchor("hair", target, s);
            }
            return null;
         },
         applyAll(selection) {
            const normalized = normalizeCosmetics(selection, cosmeticState);
            const applied = {
               face: applyFace(normalized.face),
               hair: applyHair(normalized.hair),
               outfit: applyOutfit(normalized.outfit),
               shoes: applyShoes(normalized.shoes),
               accessories: applyAccessories(normalized.accessories)
            };
            return applied;
         },
         getState() {
            return {
               face: cosmeticState.face,
               hair: cosmeticState.hair,
               outfit: deepClone(cosmeticState.outfit),
               shoes: cosmeticState.shoes,
               accessories: cosmeticState.accessories.slice()
            };
         }
      };

      cosmetics.applyAll(cosmeticState);

      root.metadata = {
         parts,
         rigNodes: rigNodeMap,
         rigAnimation,
         animPhase: 0,
         footIK,
         cosmetics: cosmetics.getState()
      };

      return {
         root,
         parts,
         cosmetics,
         rigAnimation,
         rigNodes: rigNodeMap
      };
   }

   function getCosmeticSelection() {
      return {
         face: cosmeticSelection.face,
         hair: cosmeticSelection.hair,
         outfit: deepClone(cosmeticSelection.outfit),
         shoes: cosmeticSelection.shoes,
         accessories: cosmeticSelection.accessories.slice()
      };
   }

   function updatePlayerCosmeticState() {
      if (playerRoot && playerRoot.metadata && typeof playerRoot.metadata === "object") {
         try {
            playerRoot.metadata.cosmetics = playerCosmeticController?.getState?.() || getCosmeticSelection();
         } catch (err) {
            playerRoot.metadata.cosmetics = getCosmeticSelection();
         }
      }
      window.HUD?.refreshCosmeticTester?.(getCosmeticSelection());
      window.CharacterCreator?.refresh?.();
   }

   function applyCosmeticsToPlayer() {
      if (!playerCosmeticController) {
         updatePlayerCosmeticState();
         return;
      }
      const applied = playerCosmeticController.applyAll(getCosmeticSelection());
      if (applied) {
         if (typeof applied.face === "string") cosmeticSelection.face = applied.face;
         if (typeof applied.hair === "string") cosmeticSelection.hair = applied.hair;
         if (applied.outfit) cosmeticSelection.outfit = deepClone(applied.outfit);
         if (typeof applied.shoes === "string") cosmeticSelection.shoes = applied.shoes;
         if (Array.isArray(applied.accessories)) cosmeticSelection.accessories = applied.accessories.slice();
      }
      updatePlayerCosmeticState();
   }

   function setFace(id) {
      const next = (typeof id === "string" && FACE_SPEC_MAP.has(id)) ? id : cosmeticSelection.face;
      cosmeticSelection.face = next;
      if (playerCosmeticController) {
         const applied = playerCosmeticController.applyFace(next);
         if (typeof applied === "string") cosmeticSelection.face = applied;
      }
      updatePlayerCosmeticState();
      persistCosmeticsSelection();
      return cosmeticSelection.face;
   }

   function setHair(id) {
      const next = (typeof id === "string" && HAIR_SPEC_MAP.has(id)) ? id : cosmeticSelection.hair;
      cosmeticSelection.hair = next;
      if (playerCosmeticController) {
         const applied = playerCosmeticController.applyHair(next);
         if (typeof applied === "string") cosmeticSelection.hair = applied;
      }
      updatePlayerCosmeticState();
      persistCosmeticsSelection();
      return cosmeticSelection.hair;
   }

   function setOutfit(selection = {}) {
      const normalized = normalizeOutfit(selection, cosmeticSelection.outfit);
      cosmeticSelection.outfit = normalized;
      if (playerCosmeticController) {
         const applied = playerCosmeticController.applyOutfit(normalized);
         if (applied) cosmeticSelection.outfit = deepClone(applied);
      }
      updatePlayerCosmeticState();
      persistCosmeticsSelection();
      return deepClone(cosmeticSelection.outfit);
   }

   function setShoes(id) {
      const next = (typeof id === "string" && SHOE_SPEC_MAP.has(id)) ? id : cosmeticSelection.shoes;
      cosmeticSelection.shoes = next;
      if (playerCosmeticController) {
         const applied = playerCosmeticController.applyShoes(next);
         if (typeof applied === "string") cosmeticSelection.shoes = applied;
      }
      updatePlayerCosmeticState();
      persistCosmeticsSelection();
      return cosmeticSelection.shoes;
   }

   function setAccessories(ids) {
      cosmeticSelection.accessories = normalizeAccessoryIds(ids);
      if (playerCosmeticController) {
         const applied = playerCosmeticController.applyAccessories(cosmeticSelection.accessories);
         if (Array.isArray(applied)) cosmeticSelection.accessories = applied.slice();
      }
      updatePlayerCosmeticState();
      persistCosmeticsSelection();
      return cosmeticSelection.accessories.slice();
   }

   function getAvailableCosmetics() {
      return deepClone(COSMETIC_CONFIG);
   }

   // ------------ Enemies ------------
   function createEnemy(pos) {
      const h = createHumanoid("#f24d7a", RIG, DEFAULT_COSMETIC_SELECTION);
      h.root.position.copyFrom(pos);
      const e = {
         root: h.root,
         parts: h.parts,
         hp: 40 + rand(0, 20),
         speed: 3.2 + rand(0, 1.2),
         alive: true,
         attackCd: 0,
         vel: new BABYLON.Vector3(0, 0, 0),
         grounded: false,
         groundNormal: new BABYLON.Vector3(0, 1, 0),
         prevPos: h.root.position.clone(),
         animPhase: 0,
         attackAnimT: 0,
         dormant: false,
         fearT: 0
      };
      e.__enemyId = enemySeq++;
      const meta = h.root.metadata || {};
      meta.parts = h.parts;
      meta.animPhase = 0;
      if (!meta.rigNodes && h.rigNodes) meta.rigNodes = h.rigNodes;
      if (!meta.rigAnimation && h.rigAnimation) meta.rigAnimation = h.rigAnimation;
      h.root.metadata = meta;
      return e;
   }

  function spawnWave(n) {
      const spawnApi = window.Spawns;
      const region = window.RegionManager?.getActiveRegion?.() || null;
      onWaveStart();
      let plan = null;
      let count = n;
      if (spawnApi?.planWave) {
         try {
            plan = spawnApi.planWave({
               baseCount: n,
               region,
               difficulty: region?.difficulty ?? 1,
               world,
               enemies,
               state
            }) || null;
            if (plan && typeof plan.count === "number") {
               count = Math.max(1, Math.round(plan.count));
            }
         } catch (err) {
            console.warn("[Spawns] planWave failed", err);
            plan = null;
            count = n;
         }
      }
      const waveEnemies = [];
      for (let i = 0; i < count; i++) {
         let spawn = null;
         for (let attempts = 0; attempts < 12 && !spawn; attempts++) {
            const x = rand(-world.size / 2 + 6, world.size / 2 - 6);
            const z = rand(-world.size / 2 + 6, world.size / 2 - 6);
            const h = getTerrainHeight(x, z);
            if (h === null) continue;
            const hX = getTerrainHeight(x + 1.5, z);
            const hZ = getTerrainHeight(x, z + 1.5);
            if (hX === null || hZ === null) continue;
            if (Math.abs(h - hX) > 2 || Math.abs(h - hZ) > 2) continue;
            spawn = new BABYLON.Vector3(x, h + 1.4, z);
         }
         if (!spawn) {
            const x = rand(-world.size / 3, world.size / 3);
            const z = rand(-world.size / 3, world.size / 3);
            spawn = new BABYLON.Vector3(x, 3 + rand(0, 4), z);
         }
         const enemy = createEnemy(spawn);
         waveEnemies.push(enemy);
         const entry = plan?.entries?.[i] ?? null;
         if (entry && spawnApi?.applyEnemyProfile) {
            try {
               spawnApi.applyEnemyProfile(enemy, entry, {
                  index: i,
                  count,
                  region,
                  plan,
                  state,
                  world
               });
            } catch (err) {
               console.warn("[Spawns] applyEnemyProfile failed", err);
            }
         }
         if (region) {
            enemy.regionId = region.id;
         }
         configureEnemyForSimulation(enemy, entry);
         enemies.push(enemy);
      }
      if (waveEnemies.length) assignEliteTarget(waveEnemies);
   }

   // ------------ Combat / Abilities ------------
   function takeDamage(amount, type = "physical") {
      const normalized = ensureFiniteDamage(amount, 0);
      let dmg = runIncomingDamage(state, type, normalized);
      if (state.aura.ten && type !== "nen") {
         dmg *= 0.9;
      }
      if (state.aura.zetsu && type === "nen") {
         dmg *= 1.5;
      }
      state.hp = Math.max(0, state.hp - dmg);
      updateHealthHud();
      if (state.hp <= 0) {
         msg("You were defeated!");
      }
   }

   function updateAura(dt) {
      const aura = state.aura;
      let changed = false;
      const caps = state.trainingCaps || makeDefaultTrainingCaps();
      const now = typeof performance === "object" && typeof performance.now === "function"
         ? performance.now()
         : Date.now();

      if (!Number.isFinite(aura.renStaminaMax)) {
         aura.renStaminaMax = caps.renDurationCap;
      }
      if (!Number.isFinite(aura.renStamina)) {
         aura.renStamina = aura.renStaminaMax;
      }

      if (inputOnce["KeyT"]) {
         const exitingZetsu = aura.zetsu;
         aura.ten = !aura.ten;
         changed = true;
         if (aura.ten) {
            if (exitingZetsu) {
               aura.zetsu = false;
               msg("Ten restored — aura guard re-established.");
            } else {
               msg("Ten reinforced.");
            }
         } else {
            msg("Ten relaxed.");
         }
      }

      if (inputOnce["KeyZ"]) {
         aura.zetsu = !aura.zetsu;
         changed = true;
         if (aura.zetsu) {
            aura.ten = false;
            aura.ren = false;
            aura.ken = false;
            aura.gyo = false;
            aura.shu = false;
            aura.en.on = false;
            aura.en.r = 0;
            aura.renActive = false;
            aura.renCharge = 0;
            aura.renMul = 1.0;
            if (state.chargingNen) {
               state.chargingNen = false;
            }
            if (state.nenLight) state.nenLight.intensity = 0.0;
            if (state.koVulnerabilityT > 0) {
               state.koVulnerabilityT = 0;
               state.koStrike = null;
               state.koLastFocus = null;
               notifyFlowChange({ silent: true });
            }
            msg("Entered Zetsu — aura suppressed.");
         } else {
            msg("Exited Zetsu.");
         }
      }

      if (inputOnce["KeyK"]) {
         const kenSealed = state.vowRuntime?.totals?.disableKen;
         if (kenSealed && !aura.ken) {
            msg("Ken is sealed by your vow.");
         } else {
            aura.ken = !aura.ken;
            changed = true;
            msg(aura.ken ? "Ken raised." : "Ken released.");
         }
      }

      if (inputOnce["KeyG"]) {
         aura.gyo = !aura.gyo;
         changed = true;
         msg(aura.gyo ? "Gyo focus sharpened." : "Gyo relaxed.");
      }

      if (inputOnce["KeyB"]) {
         aura.shu = !aura.shu;
         changed = true;
         msg(aura.shu ? "Shu channeled." : "Shu dispersed.");
      }

      if (inputOnce["KeyV"]) {
         aura.en.on = !aura.en.on;
         if (!aura.en.on) {
            aura.en.r = 0;
         }
         changed = true;
         msg(aura.en.on ? "En expanding." : "En withdrawn.");
      }

      const renSuppressed = aura.zetsu;
      const holdingRen = !renSuppressed && input["KeyR"];
      if (aura.ren !== holdingRen) {
         aura.ren = holdingRen;
         changed = true;
      }
      if (holdingRen && state.nen.cur > 0 && aura.renStamina > 0.01) {
         aura.renActive = true;
         aura.renCharge = Math.min(1, aura.renCharge + dt / 1.2);
         aura.renStamina = Math.max(0, aura.renStamina - dt);
      } else {
         aura.renCharge = Math.max(0, aura.renCharge - dt / 0.6);
         if (aura.renCharge <= 0.0001) {
            aura.renCharge = 0;
            aura.renActive = false;
         }
         aura.renStamina = Math.min(aura.renStaminaMax, aura.renStamina + dt * caps.renRecoveryRate);
      }

      if (holdingRen && aura.renStamina <= 0.0001) {
         aura.renStamina = 0;
         aura.renActive = false;
         aura.ren = false;
         input["KeyR"] = false;
         if (!state.lastRenExhaust || now - state.lastRenExhaust > 1800) {
            state.lastRenExhaust = now;
            msg("Ren exhausted — train to extend your hold.");
         }
         changed = true;
      }

      const renBonus = caps.renBonusMul ?? 0;
      aura.renMul = aura.renActive ? 1.3 + 0.9 * aura.renCharge + renBonus : 1.0;
      if (aura.zetsu) {
         aura.renMul = 1.0;
      }

      if (state.nenLight) {
         if (aura.zetsu) {
            state.nenLight.intensity = 0.0;
         } else if (!state.chargingNen) {
            const glow = aura.renActive ? 0.45 + 0.4 * aura.renCharge : 0.0;
            state.nenLight.intensity = glow;
         }
      }

      if (changed) {
         notifyAuraChange();
      }
   }

   function spendNen(cost) {
      if (state.nen.cur < cost) return false;
      state.nen.cur -= cost;
      updateNenHud();
      return true;
   }

   function tryStartKoStrike(limbKey = "melee") {
      if (state.aura.zetsu) return false;
      if (!spendNen(KO_COST)) {
         const now = typeof performance === "object" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
         if (!state.lastKoWarning || now - state.lastKoWarning > 600) {
            state.lastKoWarning = now;
            msg("Nen too low for Ko!");
         }
         return false;
      }
      const focus = getDominantFlowZone();
      const vowKoMul = state.vowRuntime?.totals?.koMultiplier ?? 1;
      state.koStrike = {
         limb: limbKey,
         multiplier: KO_MULTIPLIER * vowKoMul,
         focus: focus?.key ?? null
      };
      const vulnFactor = state.trainingCaps?.ryuVulnFactor ?? 1;
      state.koVulnerabilityT = KO_VULN_DURATION * vulnFactor;
      state.koLastFocus = focus?.label ?? null;
      notifyFlowChange({ silent: true });
      if (focus?.label) {
         msg(`Ko strike channels through the ${focus.label.toLowerCase()}!`);
      } else {
         msg("Ko strike unleashed!");
      }
      return true;
   }

   function melee() {
      if (cdActive("meleehit")) return;
      setCooldown("meleehit", COOLDOWNS.meleehit);
      state.attackAnimT = 0.22;
      const forward = playerForward();
      if (forward.lengthSquared() > 0.0001) {
         playerRoot.rotation.y = Math.atan2(forward.x, forward.z);
      }
      const range = 2.0;
      let base = 10 + (state.eff.power * 1.5) * (state.ch.nen === "Enhancer" ? 1.25 : 1);
      const mult = state.aura.renMul || 1.0;
      if (input["KeyC"]) {
         tryStartKoStrike("melee");
      }
      let dmg = base * mult;
      if (state.buffs.electrify) dmg += 6;
      if (state.buffs.berserk) dmg *= 1.25;
      const outgoing = runOutgoingDamage(state, "melee", dmg);
      enemies.forEach(e => {
         if (!e.alive) return;
         const d = BABYLON.Vector3.Distance(e.root.position, playerRoot.position);
         if (d < range) {
            const applied = runIncomingDamage(e, "torso", outgoing);
            e.hp -= applied;
            if (e.hp <= 0) {
               e.alive = false;
               e.root.dispose();
               gainXP(30 + Math.floor(rand(0, 10)));
            }
         }
      });
   }

   function playerForward() {
      const v = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
      v.y = 0;
      return v.normalize();
   }

   function playerAimDir() {
      return camera.getDirection(new BABYLON.Vector3(0, 0, 1)).normalize();
   }

   function playerMoveDir() {
      const fwd = playerForward();
      const right = camera.getDirection(new BABYLON.Vector3(1, 0, 0));
      right.y = 0;
      right.normalize();
      const dir = TMP_PLAYER_MOVE_DIR;
      dir.set(0, 0, 0);
      if (mobileMove.active) {
         dir.addInPlace(fwd.scale(-mobileMove.y));
         dir.addInPlace(right.scale(mobileMove.x));
         if (dir.lengthSquared() > 0.0001) {
            return dir.normalize();
         }
      }
      if (input["KeyW"]) dir.addInPlace(fwd);
      if (input["KeyS"]) dir.addInPlace(fwd.scale(-1));
      if (input["KeyA"]) dir.addInPlace(right.scale(-1));
      if (input["KeyD"]) dir.addInPlace(right);
      if (dir.lengthSquared() > 0) dir.normalize();
      return dir;
   }

   // Charged Jump (tap=2x height; full=4x; drains Nen while held)
   const JUMP_MAX_T = 3.0,
      JUMP_NEN_DRAIN = 12.0;

   function startJumpCharge() {
      if (state.chargingJump || !state.grounded) return;
      state.chargingJump = true;
      state.jumpChargeT = 0;
   }

   function updateJumpCharge(dt) {
      if (!state.chargingJump) return;
      const drain = JUMP_NEN_DRAIN * dt;
      if (state.nen.cur <= 0) {
         performJump();
         return;
      }
      state.nen.cur = Math.max(0, state.nen.cur - drain);
      updateNenHud();
      state.jumpChargeT = Math.min(JUMP_MAX_T, state.jumpChargeT + dt);
      if (state.nenLight) state.nenLight.intensity = 0.2 + 0.6 * (state.jumpChargeT / JUMP_MAX_T);
   }

   function performJump() {
      if (!state.chargingJump) return;
      const baseV = 9 + state.eff.agility * 0.35;
      const t = state.jumpChargeT;
      const scale = 1.414 + (2.0 - 1.414) * (t / JUMP_MAX_T);
      state.vel.y = baseV * scale;
      state.grounded = false;
      state.chargingJump = false;
      state.jumpChargeT = 0;
      if (state.nenLight) state.nenLight.intensity = 0.0;
   }

   // Projectiles with manual hit tests
   function blast() {
      if (cdActive("nenblast")) return;
      const cost = 18 * (state.ch.nen === "Emitter" ? 0.75 : 1);
      if (!spendNen(cost)) {
         msg("Not enough Nen for blast.");
         return;
      }
      setCooldown("nenblast", COOLDOWNS.nenblast);
      const dir = playerAimDir();
      const orb = BABYLON.MeshBuilder.CreateSphere("blast", {
         diameter: 0.5
      }, scene);
      orb.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)).add(dir.scale(1.1));
      const om = new BABYLON.StandardMaterial("om", scene);
      const c = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");
      om.emissiveColor = c;
      om.diffuseColor = c.scale(0.2);
      orb.material = om;
      orb.checkCollisions = false;
      orb.isPickable = false;
      const speed = 12 + state.eff.focus * 0.6;
      const life = {
         t: 3.0
      };
      const dmg = (18 + state.eff.focus * 2.0 * (state.ch.nen === "Emitter" ? 1.35 : 1)) * state.aura.renMul;
      projectiles.push({
         mesh: orb,
         dir,
         speed,
         life,
         dmg,
         source: state,
         limb: "nenBlast",
         radius: 0.55,
         prevPos: orb.position.clone()
      });
   }

   function dash() {
      if (cdActive("dash")) return;
      const restriction = state.vowRuntime?.sources?.forbidDash || null;
      if (restriction) {
         handleVowViolation(restriction, "You dashed.");
         if (restriction.lethal) return;
      }
      setCooldown("dash", COOLDOWNS.dash);
      const dir = playerMoveDir().normalize();
      if (dir.length() < 0.1) return;
      const boost = 10 + state.eff.agility * 0.8;
      state.vel.x += dir.x * boost;
      state.vel.z += dir.z * boost;
   }

   function special() {
      if (cdActive("special")) return;
      switch (state.ch.nen) {
         case "Conjurer":
            if (!spendNen(25)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            state.buffs.shield = 6;
            msg("Conjured shield!");
            break;
         case "Manipulator":
            if (!spendNen(20)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            const t = nearestEnemy();
            if (t) {
               t.charmed = 5;
               msg("Charmed an enemy!");
            }
            break;
         case "Specialist":
            if (state.timeStop) return;
            if (state.nen.cur <= state.ultMinNen + 5) {
               msg("Not enough Nen for time distortion.");
               return;
            }
            state.timeStop = true;
            state.ultT = 0;
            msg("Time distorted! (Auto-ends as Nen drains)");
            break;
         case "Transmuter":
            if (!spendNen(22)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            state.buffs.electrify = 6;
            msg("Electrified strikes!");
            break;
         case "Enhancer":
            if (!spendNen(20)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            state.buffs.berserk = 6;
            msg("Berserk mode!");
            break;
         case "Emitter":
            if (!spendNen(24)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            for (let i = -2; i <= 2; i++) {
               const dir = playerAimDir().add(new BABYLON.Vector3(i * 0.15, 0, 0));
               dir.normalize();
               const orb = BABYLON.MeshBuilder.CreateSphere("blast", {
                  diameter: 0.45
               }, scene);
               orb.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)).add(dir.scale(1.1));
               const om = new BABYLON.StandardMaterial("om", scene);
               const c = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");
               om.emissiveColor = c;
               orb.material = om;
               orb.checkCollisions = false;
               orb.isPickable = false;
               const speed = 11 + state.eff.focus * 0.5;
               const life = {
                  t: 3.0
               };
               const dmg = (12 + state.eff.focus * 1.6) * state.aura.renMul;
               projectiles.push({
                  mesh: orb,
                  dir,
                  speed,
                  life,
                  dmg,
                  source: state,
                  limb: "nenVolley",
                  radius: 0.5,
                  prevPos: orb.position.clone()
               });
            }
            msg("Emitter volley!");
            break;
      }
   }

   function nearestEnemy() {
      let best = null,
         bd = 1e9;
      enemies.forEach(e => {
         if (!e.alive) return;
         const d = BABYLON.Vector3.Distance(e.root.position, playerRoot.position);
         if (d < bd) {
            bd = d;
            best = e;
         }
      });
      return best;
   }

   // ------------ Anim helpers ------------
   function getRigAnimation(rootMesh) {
      return rootMesh?.metadata?.rigAnimation || null;
   }

   function getRigNodes(rootMesh) {
      return rootMesh?.metadata?.rigNodes || null;
   }

   function advanceRigAnimation(rootMesh, dt, speedRatio, loop = true) {
      const rigAnim = getRigAnimation(rootMesh);
      if (!rigAnim || !rigAnim.binding?.group) return false;
      const ratio = Number.isFinite(speedRatio) ? speedRatio : 1;
      return !!rigAnim.advance(dt, ratio, loop);
   }

   function syncRigPoseFromFallback(rootMesh) {
      const rigNodes = getRigNodes(rootMesh);
      if (rigNodes) syncRigNodesToQuaternion(rigNodes);
   }

   function applyAttackOverlay(parts, attackT) {
      if (!parts || attackT <= 0) return;
      const shoulder = parts.armR?.shoulder;
      const elbow = parts.armR?.elbow;
      const wrist = parts.armR?.wrist;
      if (!shoulder || !elbow || !wrist) return;
      const t = Math.min(1, attackT / 0.22);
      const k = Math.sin(t * Math.PI);
      const reach = 1.6 * 1.9;
      const elbowStart = 0.2;
      const elbowEnd = -0.32;
      const wristStart = 0.12;
      const wristEnd = -0.08;

      const shoulderRot = getNodeEuler(shoulder);
      shoulderRot.x = -reach * k;
      setNodeEuler(shoulder, shoulderRot);

      const elbowRot = getNodeEuler(elbow);
      elbowRot.x = elbowStart * (1 - k) + elbowEnd * k;
      setNodeEuler(elbow, elbowRot);

      const wristRot = getNodeEuler(wrist);
      wristRot.x = wristStart * (1 - k) + wristEnd * k;
      setNodeEuler(wrist, wristRot);
   }

   function updateWalkAnim(rootMesh, speed, grounded, dt, attackT = 0) {
      const parts = rootMesh.metadata?.parts;
      if (!parts) return;
      const phasePrev = rootMesh.metadata.animPhase || 0;
      const phase = phasePrev + (grounded ? speed * 4.8 : speed * 2.4) * dt * ANIM_SPEED;
      rootMesh.metadata.animPhase = phase;

      const rigLoop = getRigAnimation(rootMesh)?.loop !== false;
      const rigAdvanced = advanceRigAnimation(
         rootMesh,
         dt,
         grounded ? Math.max(0.1, Math.min(3, speed * 1.8 + 0.3)) : 0.6,
         rigLoop
      );
      if (rigAdvanced) {
         if (attackT > 0) {
            applyAttackOverlay(parts, attackT);
         }
         return;
      }

      parts.pelvis.position.x = 0;
      parts.pelvis.position.y = 0;
      parts.pelvis.position.z = 0;
      parts.pelvis.rotation.set(0, 0, 0);
      if (parts.head) {
         parts.head.rotation.x = 0;
         parts.head.rotation.y = 0;
         parts.head.rotation.z = 0;
      }
      parts.armL.shoulder.rotation.y = 0;
      parts.armR.shoulder.rotation.y = 0;
      parts.armL.shoulder.rotation.z = 0;
      parts.armR.shoulder.rotation.z = 0;
      parts.legL.hip.rotation.y = 0;
      parts.legR.hip.rotation.y = 0;
      parts.legL.hip.rotation.z = 0;
      parts.legR.hip.rotation.z = 0;
      parts.armL.elbow.rotation.y = 0;
      parts.armR.elbow.rotation.y = 0;
      parts.armL.wrist.rotation.z = 0;
      parts.armR.wrist.rotation.z = 0;

      const swing = grounded ? Math.sin(phase) * 0.7 : 0.3 * Math.sin(phase * 0.6);
      const armSwing = swing * 0.8;

      parts.legL.hip.rotation.x = swing;
      parts.legR.hip.rotation.x = -swing;
      const kneeL = Math.max(0, -Math.sin(phase)) * 1.1;
      const kneeR = Math.max(0, Math.sin(phase)) * 1.1;
      parts.legL.knee.rotation.x = kneeL;
      parts.legR.knee.rotation.x = kneeR;
      parts.legL.ankle.rotation.x = -kneeL * 0.35 + 0.1 * Math.sin(phase * 2);
      parts.legR.ankle.rotation.x = -kneeR * 0.35 - 0.1 * Math.sin(phase * 2);

      parts.armL.shoulder.rotation.x = -armSwing;
      parts.armR.shoulder.rotation.x = armSwing;
      const elbowL = Math.max(0, Math.sin(phase)) * 0.6;
      const elbowR = Math.max(0, -Math.sin(phase)) * 0.6;
      parts.armL.elbow.rotation.x = elbowL;
      parts.armR.elbow.rotation.x = elbowR;
      parts.armL.wrist.rotation.x = -elbowL * 0.4;
      parts.armR.wrist.rotation.x = -elbowR * 0.4;

      if (!grounded) {
         parts.armL.shoulder.rotation.x = 0.5;
         parts.armR.shoulder.rotation.x = 0.5;
         parts.legL.knee.rotation.x = Math.max(parts.legL.knee.rotation.x, 0.4);
         parts.legR.knee.rotation.x = Math.max(parts.legR.knee.rotation.x, 0.4);
         parts.legL.ankle.rotation.x = 0.15;
         parts.legR.ankle.rotation.x = 0.15;
      }

      if (attackT > 0) {
         applyAttackOverlay(parts, attackT);
      }

      parts.lowerTorso.rotation.x = 0.05 * Math.sin(phase * 2) * (grounded ? 1 : 0.3);
      parts.upperTorso.rotation.x = 0.03 * Math.sin(phase * 2 + 0.4) * (grounded ? 1 : 0.3);
      parts.neck.rotation.x = -0.03 * Math.sin(phase * 2 + 0.2);

      syncRigPoseFromFallback(rootMesh);
   }

   function updateIdleAnim(rootMesh, dt, attackT = 0) {
      const parts = rootMesh.metadata?.parts;
      if (!parts) return;
      const phasePrev = rootMesh.metadata.animPhase || 0;
      const phase = phasePrev + dt * ANIM_SPEED * 0.9;
      rootMesh.metadata.animPhase = phase;

      const rigLoop = getRigAnimation(rootMesh)?.loop !== false;
      const rigAdvanced = advanceRigAnimation(rootMesh, dt, 1, rigLoop);
      if (rigAdvanced) {
         if (attackT > 0) {
            applyAttackOverlay(parts, attackT);
         }
         return;
      }

      const breathe = Math.sin(phase * 0.8) * 0.05;
      const sway = Math.sin(phase * 0.35) * 0.1;
      const shift = Math.sin(phase * 0.45 + 1.2) * 0.08;

      parts.pelvis.position.x = shift * 0.4;
      parts.pelvis.position.y = 0.02 * Math.sin(phase * 0.8 + 0.4);
      parts.pelvis.position.z = 0;
      parts.pelvis.rotation.x = 0;
      parts.pelvis.rotation.y = sway * 0.45;
      parts.pelvis.rotation.z = -shift * 0.35;

      parts.lowerTorso.rotation.x = breathe * 0.6;
      parts.lowerTorso.rotation.y = 0.08 * Math.sin(phase * 0.45);
      parts.lowerTorso.rotation.z = sway * 0.25;

      parts.upperTorso.rotation.x = 0.12 * Math.sin(phase * 0.85 + 0.6);
      parts.upperTorso.rotation.y = 0.14 * Math.sin(phase * 0.35 + 0.3);
      parts.upperTorso.rotation.z = -sway * 0.4;

      parts.neck.rotation.x = -0.06 * Math.sin(phase * 0.9 + 0.9);
      parts.neck.rotation.y = 0.04 * Math.sin(phase * 0.7);
      parts.neck.rotation.z = 0.02 * Math.sin(phase * 0.5 + 0.5);

      if (parts.head) {
         parts.head.rotation.x = -0.03 * Math.sin(phase * 0.85 + 0.4);
         parts.head.rotation.y = 0.05 * Math.sin(phase * 0.6 + 1.1);
         parts.head.rotation.z = 0.01 * Math.sin(phase * 0.8);
      }

      const armOsc = Math.sin(phase * 0.8);
      parts.armL.shoulder.rotation.x = -0.18 + 0.09 * armOsc;
      parts.armR.shoulder.rotation.x = -0.12 - 0.09 * armOsc;
      parts.armL.shoulder.rotation.y = 0.05 * Math.sin(phase * 0.5);
      parts.armR.shoulder.rotation.y = -0.05 * Math.sin(phase * 0.5 + 0.4);
      parts.armL.shoulder.rotation.z = 0.18 + 0.04 * Math.sin(phase * 0.7);
      parts.armR.shoulder.rotation.z = -0.18 + 0.04 * Math.sin(phase * 0.7 + Math.PI);

      parts.armL.elbow.rotation.x = 0.28 + 0.05 * Math.sin(phase * 0.9 + 0.3);
      parts.armR.elbow.rotation.x = 0.28 + 0.05 * Math.sin(phase * 0.9 - 0.3);
      parts.armL.elbow.rotation.y = 0;
      parts.armR.elbow.rotation.y = 0;
      parts.armL.wrist.rotation.x = -0.12 + 0.04 * Math.sin(phase * 1.1);
      parts.armR.wrist.rotation.x = -0.12 + 0.04 * Math.sin(phase * 1.1 + 0.5);
      parts.armL.wrist.rotation.z = 0.02 * Math.sin(phase * 1.4);
      parts.armR.wrist.rotation.z = -0.02 * Math.sin(phase * 1.3);

      parts.legL.hip.rotation.x = 0.12 + 0.03 * Math.sin(phase * 0.6);
      parts.legR.hip.rotation.x = 0.12 + 0.03 * Math.sin(phase * 0.6 + Math.PI);
      parts.legL.hip.rotation.y = 0.02 * Math.sin(phase * 0.4);
      parts.legR.hip.rotation.y = -0.02 * Math.sin(phase * 0.4);
      parts.legL.hip.rotation.z = shift * 0.8;
      parts.legR.hip.rotation.z = -shift * 0.8;
      parts.legL.knee.rotation.x = 0.14 + 0.025 * Math.sin(phase * 0.7);
      parts.legR.knee.rotation.x = 0.14 + 0.025 * Math.sin(phase * 0.7 + Math.PI);
      parts.legL.ankle.rotation.x = -0.08 + 0.02 * Math.sin(phase * 0.9);
      parts.legR.ankle.rotation.x = -0.08 + 0.02 * Math.sin(phase * 0.9 + Math.PI);

      if (attackT > 0) {
         applyAttackOverlay(parts, attackT);
      }

      syncRigPoseFromFallback(rootMesh);
   }

   // ------------ Main loop ------------
   function tick(dt) {
      const hasOwn = Object.prototype.hasOwnProperty;
      for (const key in state.cooldowns) {
         if (!hasOwn.call(state.cooldowns, key)) continue;
         const cd = state.cooldowns[key];
         cd.t = Math.max(0, cd.t - dt);
         if (cd.t === 0) {
            delete state.cooldowns[key];
            markCooldownDirty();
         }
      }
      updateCooldownUI(dt);
      for (const key in state.buffs) {
         if (!hasOwn.call(state.buffs, key)) continue;
         state.buffs[key] -= dt;
         if (state.buffs[key] <= 0) delete state.buffs[key];
      }

      if (state.koVulnerabilityT > 0) {
         const prev = state.koVulnerabilityT;
         state.koVulnerabilityT = Math.max(0, prev - dt);
         if (state.koVulnerabilityT === 0) {
            state.koLastFocus = null;
            notifyFlowChange({ silent: true });
         }
      }

      advanceEnvironment(dt);
      stepPhysics(dt);
      updateVowRuntimeFrame(dt);

      // inputs / abilities
      if (inputOnce["Space"]) startJumpCharge();
      if (input["Space"]) updateJumpCharge(dt);
      if (inputUp["Space"]) performJump();
      if (input["KeyQ"]) blast();
      if (input["ShiftLeft"] || input["ShiftRight"]) dash();
      if (input["KeyE"]) special();
      if (inputOnce["KeyO"]) openVowMenu();
      if (inputOnce["KeyY"]) {
         if (trainingMenuDisposer) {
            closeTrainingMenu();
         } else {
            openTrainingMenu();
         }
      }

      updateAura(dt);

      // Nen charge (hold C)
      if (input["KeyC"] && !state.aura.zetsu) {
         if (!state.chargingNen) {
            state.chargingNen = true;
            if (state.nenLight) state.nenLight.intensity = 0.8;
         }
      } else if (state.chargingNen) {
         state.chargingNen = false;
         if (state.nenLight) state.nenLight.intensity = 0.0;
      }

      if (!state.prevPlayerPos) {
         state.prevPlayerPos = playerRoot.position.clone();
      }

      // movement + rotation
      const prevGrounded = state.prevGrounded;
      const currentOffset = state.rootGroundOffset;
      const moveDir = playerMoveDir();
      let moveSpeed = 7 + state.eff.agility * 0.6;
      if (state.buffs.berserk) moveSpeed *= 1.35;
      const moveVec = TMP_PLAYER_MOVE_VEC;
      moveVec.copyFrom(moveDir);
      moveVec.scaleInPlace(moveSpeed * dt);
      state.vel.y += world.gravityY * dt;
      TMP_PLAYER_MOTION.set(
         moveVec.x + state.vel.x * dt,
         state.vel.y * dt,
         moveVec.z + state.vel.z * dt
      );
      player.moveWithCollisions(TMP_PLAYER_MOTION);
      const lastPos = state.prevPlayerPos;
      state.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
      state.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
      if (moveDir.lengthSquared() > 0.0001) {
         const targetYaw = Math.atan2(moveDir.x, moveDir.z);
         playerRoot.rotation.y = BABYLON.Scalar.LerpAngle(playerRoot.rotation.y, targetYaw, 1 - Math.pow(0.001, dt * 60));
      }

      // ground check
      const groundInfo = resolveGrounding(player, state.vel.y);
      state.grounded = groundInfo.grounded;
      if (state.grounded) {
         state.groundNormal.copyFrom(groundInfo.normal);
         if (groundInfo.correction > 0) {
            player.position.y += groundInfo.correction;
            player.computeWorldMatrix(true);
            playerRoot.position.copyFrom(player.position);
         }
         if (state.vel.y < 0) state.vel.y = 0;
      } else {
         state.groundNormal.copyFrom(VEC3_UP);
      }

      if (state.grounded !== prevGrounded) {
         state.groundSampleDirty = true;
         if (!state.grounded) {
            state.rootGroundOffsetTarget = 0;
            state.groundSampleCountdown = 0;
         }
      }

      const baseY = player.position.y;
      playerRoot.position.copyFrom(player.position);
      if (currentOffset !== 0) {
         playerRoot.position.y = baseY + currentOffset;
      }

      if (state.grounded) {
         if (state.groundSampleCountdown > 0) state.groundSampleCountdown -= 1;
         if (state.groundSampleDirty || state.groundSampleCountdown <= 0) {
            playerRoot.computeWorldMatrix(true);
            const sampleOffset = sampleRootGroundOffset(playerRoot);
            if (Number.isFinite(sampleOffset)) {
               state.rootGroundOffsetTarget = state.rootGroundOffset + sampleOffset;
            }
            state.groundSampleDirty = false;
            state.groundSampleCountdown = ROOT_GROUND_SAMPLE_INTERVAL;
         }
      } else {
         state.rootGroundOffsetTarget = 0;
      }

      const offsetLerp = Math.max(0, Math.min(1, ROOT_GROUND_LERP * dt * 60));
      state.rootGroundOffset += (state.rootGroundOffsetTarget - state.rootGroundOffset) * offsetLerp;
      if (Math.abs(state.rootGroundOffset) < 1e-4) state.rootGroundOffset = 0;
      playerRoot.position.y = baseY + state.rootGroundOffset;
      player.position.y = baseY;
      playerRoot.computeWorldMatrix(true);

      updateTerrainStreaming(playerRoot.position, dt);
      window.RegionManager?.updateSpatialState?.(playerRoot.position);

      // passive regen + aura flow
      const aura = state.aura;
      window.NenCore?.nenTick?.(dt);
      state.hp = clamp(state.hp + state.baseHpRegen * dt, 0, state.maxHP);
      updateHealthHud();

      // Specialist ult drain
      if (state.timeStop) {
         state.ultT += dt;
         const prevNen = state.nen.cur;
         state.nen.cur = Math.max(0, state.nen.cur - state.ultDrainRate * dt);
         if (state.nen.cur !== prevNen) {
            updateNenHud();
         }
         if (state.nen.cur <= state.ultMinNen || state.ultT >= state.ultMaxDur) {
            state.timeStop = false;
            setCooldown("special", COOLDOWNS.special);
            msg("Time resumes!");
         }
      }

      // projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
         const p = projectiles[i];
         const craterOpts = projectileCraterOptions(p);
         p.life.t -= dt;
         if (p.life.t <= 0) {
            const groundY = getTerrainHeight(p.mesh.position.x, p.mesh.position.z);
            if (groundY !== null && p.mesh.position.y - groundY < 6) {
               removeTerrainCubeAtPoint(
                  new BABYLON.Vector3(p.mesh.position.x, groundY, p.mesh.position.z),
                  craterOpts
               );
            }
            p.mesh.dispose();
            projectiles.splice(i, 1);
            continue;
         }
         const from = p.prevPos ? p.prevPos.clone() : p.mesh.position.clone();
         const moveVec = p.dir.scale(p.speed * dt);
         const stepLen = moveVec.length();
         let collision = null;
         if (stepLen > 0.0001) {
            const rayDir = moveVec.clone();
            rayDir.normalize();
            const pick = scene.pickWithRay(new BABYLON.Ray(from, rayDir, stepLen), isGroundOrTreeMesh);
            if (pick && pick.hit) collision = pick;
         }
         if (collision) {
            if (collision.pickedMesh && collision.pickedMesh.metadata?.terrainBlock) {
               removeTerrainBlockFromMesh(collision.pickedMesh, craterOpts);
            } else if (collision.pickedMesh && destroyTreeByMesh(collision.pickedMesh)) {
               // tree destroyed
            } else if (collision.pickedPoint) {
               removeTerrainCubeAtPoint(collision.pickedPoint, craterOpts);
            }
            p.mesh.dispose();
            projectiles.splice(i, 1);
            continue;
         }
         p.mesh.position.addInPlace(moveVec);
         if (p.prevPos) {
            p.prevPos.copyFrom(p.mesh.position);
         } else {
            p.prevPos = p.mesh.position.clone();
         }
         for (const e of enemies) {
            if (!e.alive || !e.root.isEnabled()) continue;
            const hitRadius = 0.9 + ((p.radius || 0) * 0.5);
            const dist = BABYLON.Vector3.Distance(e.root.position, p.mesh.position);
            if (dist < hitRadius) {
               const outgoing = runOutgoingDamage(p.source ?? state, p.limb ?? "projectile", p.dmg);
               const applied = runIncomingDamage(e, p.limb ?? "projectile", outgoing);
               e.hp -= applied;
               p.life.t = 0;
               if (e.hp <= 0) {
                  e.alive = false;
                  e.root.dispose();
                  gainXP(30 + Math.floor(rand(0, 10)));
               }
               break;
            }
         }
      }

      // enemies AI
      const playerPos = playerRoot.position;
      const stealthMult = state.aura.zetsu ? 0.4 : 1.0;
      const bubbleInfo = simulationBubble.derived || {};
      const bubbleRadius = Number.isFinite(bubbleInfo.radius) ? bubbleInfo.radius : ENEMY_ACTIVE_RADIUS;
      const baseActiveRadius = Math.min(bubbleRadius, ENEMY_ACTIVE_RADIUS * stealthMult);
      const activeRadiusSq = Math.max(4, baseActiveRadius * baseActiveRadius);
      const sleepRadiusSq = Number.isFinite(bubbleInfo.sleepRadiusSq) ? bubbleInfo.sleepRadiusSq : ENEMY_RENDER_RADIUS_SQ;
      const wakeRadiusSq = Number.isFinite(bubbleInfo.wakeRadiusSq) ? bubbleInfo.wakeRadiusSq : activeRadiusSq;
      const renderRadiusSq = Number.isFinite(bubbleInfo.renderRadiusSq) ? bubbleInfo.renderRadiusSq : ENEMY_RENDER_RADIUS_SQ;
      const cullRadiusSq = Number.isFinite(bubbleInfo.cullRadiusSq) ? bubbleInfo.cullRadiusSq : renderRadiusSq * 4;
      const renThreatActive = state.aura.renActive && !state.aura.zetsu;
      const bloodlustDir = renThreatActive ? playerAimDir() : null;
      const renFearStrength = renThreatActive ? state.aura.renCharge : 0;
      const simTime = nowMs();
      const toCull = [];
      for (const e of enemies) {
         if (!e.alive || !e.root) continue;
         const sim = ensureEnemySimulationHandle(e, null);
         TMP_ENEMY_TO_PLAYER.copyFrom(playerPos);
         TMP_ENEMY_TO_PLAYER.subtractInPlace(e.root.position);
         const distSq = TMP_ENEMY_TO_PLAYER.lengthSquared();
         if (sim) sim.lastDistanceSq = distSq;

         if (sim && sim.behavior === SIM_BEHAVIOR_DESPAWN && distSq > cullRadiusSq) {
            sim.state = SIM_STATE_DESPAWNED;
            sim.lastStateChange = simTime;
            sim.sleepAnchor = null;
            e.alive = false;
            try { e.root.dispose(); } catch {}
            try { window.Enemies?.cleanup?.(e); } catch {}
            toCull.push(e);
            continue;
         }

         if (sim && sim.state === SIM_STATE_SLEEPING && distSq <= wakeRadiusSq) {
            sim.state = SIM_STATE_ACTIVE;
            sim.sleepAnchor = null;
            sim.lastStateChange = simTime;
         }

         if (sim && sim.state !== SIM_STATE_SLEEPING && distSq > sleepRadiusSq) {
            sim.state = SIM_STATE_SLEEPING;
            sim.lastStateChange = simTime;
            sim.sleepAnchor = e.root.position.clone();
         }

         if (sim && sim.state === SIM_STATE_SLEEPING) {
            const anchor = sim.sleepAnchor || e.root.position.clone();
            sim.sleepAnchor = anchor;
            e.root.position.copyFrom(anchor);
            e.root.computeWorldMatrix(true);
            e.prevPos.copyFrom(e.root.position);
            if (typeof e.vel?.set === "function") {
               e.vel.set(0, 0, 0);
            } else {
               e.vel.x = 0;
               e.vel.y = 0;
               e.vel.z = 0;
            }
            e.grounded = true;
            e.dormant = true;
            if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
            if (e.root.isEnabled()) e.root.setEnabled(false);
            continue;
         }

         if (distSq > renderRadiusSq) {
            if (e.root.isEnabled()) e.root.setEnabled(false);
            e.dormant = true;
            if (typeof e.vel?.set === "function") {
               e.vel.set(0, e.vel.y, 0);
            } else {
               e.vel.x = 0;
               e.vel.z = 0;
            }
            if (Math.abs(e.vel.y) < 0.01) e.vel.y = 0;
            e.prevPos.copyFrom(e.root.position);
            if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
            continue;
         }

         if (!e.root.isEnabled()) e.root.setEnabled(true);
         if (sim && sim.state !== SIM_STATE_ACTIVE) {
            sim.state = SIM_STATE_ACTIVE;
            sim.lastStateChange = simTime;
            sim.sleepAnchor = null;
         }

         if (e.qaDummy) {
            e.vel.x = 0;
            e.vel.y = 0;
            e.vel.z = 0;
            const groundDummy = resolveGrounding(e.root, 0);
            e.grounded = groundDummy.grounded;
            if (groundDummy.correction) {
               e.root.position.y += groundDummy.correction;
               e.root.computeWorldMatrix(true);
            }
            e.prevPos.copyFrom(e.root.position);
            if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
            updateIdleAnim(e.root, dt, e.attackAnimT);
            applyFootIK(e.root, e.grounded);
            continue;
         }

         if (e.fearT > 0) {
            e.fearT = Math.max(0, e.fearT - dt);
         }
         const dist = Math.sqrt(distSq);
         if (renThreatActive && bloodlustDir && e.hp <= BLOODLUST_WEAK_HP && distSq <= BLOODLUST_RANGE_SQ) {
            const denom = dist > 1e-5 ? dist : 1e-5;
            const cos = (-(TMP_ENEMY_TO_PLAYER.x * bloodlustDir.x + TMP_ENEMY_TO_PLAYER.y * bloodlustDir.y + TMP_ENEMY_TO_PLAYER.z * bloodlustDir.z)) / denom;
            if (cos > BLOODLUST_CONE_COS) {
               const fearDur = 0.9 + 0.9 * renFearStrength;
               if (e.fearT < fearDur) e.fearT = fearDur;
            }
         }
         const frightened = e.fearT > 0;

         if (distSq > activeRadiusSq) {
            e.dormant = true;
            e.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
            e.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
            if (!e.grounded) {
               e.vel.y += world.gravityY * dt * 0.5;
               e.root.moveWithCollisions(new BABYLON.Vector3(0, e.vel.y * dt, 0));
               const groundDormant = resolveGrounding(e.root, e.vel.y);
               e.grounded = groundDormant.grounded;
               if (e.grounded) {
                  if (groundDormant.correction > 0) {
                     e.root.position.y += groundDormant.correction;
                     e.root.computeWorldMatrix(true);
                  }
                  if (e.vel.y < 0) e.vel.y = 0;
               }
            }
            e.prevPos.copyFrom(e.root.position);
            if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
            continue;
         }

         if (e.dormant) {
            e.prevPos.copyFrom(e.root.position);
            e.dormant = false;
         }

         const distXZSq = TMP_ENEMY_TO_PLAYER.x * TMP_ENEMY_TO_PLAYER.x + TMP_ENEMY_TO_PLAYER.z * TMP_ENEMY_TO_PLAYER.z;
         if (distXZSq > 1e-6) {
            const yaw = Math.atan2(TMP_ENEMY_TO_PLAYER.x, TMP_ENEMY_TO_PLAYER.z);
            e.root.rotation.y = BABYLON.Scalar.LerpAngle(e.root.rotation.y, yaw, 1 - Math.pow(0.001, dt * 60));
         }

         if (!state.timeStop) {
            if (frightened) {
               if (dist > 1e-4) {
                  TMP_ENEMY_TO_PLAYER.scaleInPlace(1 / dist);
               } else {
                  TMP_ENEMY_TO_PLAYER.set(0, 0, 0);
               }
               const fleeSpeed = e.speed * (1.2 + 0.6 * renFearStrength);
               TMP_ENEMY_TO_PLAYER.scaleInPlace(-fleeSpeed * dt);
               e.vel.y += world.gravityY * dt;
               TMP_ENEMY_DELTA.set(
                  TMP_ENEMY_TO_PLAYER.x + e.vel.x * dt,
                  e.vel.y * dt,
                  TMP_ENEMY_TO_PLAYER.z + e.vel.z * dt
               );
               e.root.moveWithCollisions(TMP_ENEMY_DELTA);
               e.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
               e.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
               e.attackCd = Math.max(e.attackCd, 0.6);
            } else if (dist > 1.6) {
               if (dist > 1e-4) {
                  TMP_ENEMY_TO_PLAYER.scaleInPlace(1 / dist);
               } else {
                  TMP_ENEMY_TO_PLAYER.set(0, 0, 0);
               }
               TMP_ENEMY_TO_PLAYER.scaleInPlace(e.speed * dt);
               e.vel.y += world.gravityY * dt;
               TMP_ENEMY_DELTA.set(
                  TMP_ENEMY_TO_PLAYER.x + e.vel.x * dt,
                  e.vel.y * dt,
                  TMP_ENEMY_TO_PLAYER.z + e.vel.z * dt
               );
               e.root.moveWithCollisions(TMP_ENEMY_DELTA);
               e.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
               e.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
               if (e.grounded && Math.random() < 0.005) e.vel.y = 7 + Math.random() * 2;
            } else {
               e.attackCd -= dt;
               if (e.attackCd <= 0) {
                  const baseDmg = state.buffs.shield ? 6 : 12;
                  const outgoing = runOutgoingDamage(e, "melee", baseDmg);
                  takeDamage(outgoing, "physical");
                  e.attackCd = 1.2;
                  e.attackAnimT = 0.22;
               }
            }
         } else {
            e.vel.x = 0;
            e.vel.z = 0;
            e.vel.y += world.gravityY * dt * 0.1;
            TMP_ENEMY_DELTA.set(0, e.vel.y * dt, 0);
            e.root.moveWithCollisions(TMP_ENEMY_DELTA);
         }

         const groundE = resolveGrounding(e.root, e.vel.y);
         e.grounded = groundE.grounded;
         if (e.grounded) {
            if (groundE.correction > 0) {
               e.root.position.y += groundE.correction;
               e.root.computeWorldMatrix(true);
            }
            if (e.vel.y < 0) e.vel.y = 0;
            e.groundNormal.copyFrom(groundE.normal);
         } else {
            e.groundNormal.copyFrom(VEC3_UP);
         }

         TMP_ENEMY_DELTA.copyFrom(e.root.position);
         TMP_ENEMY_DELTA.subtractInPlace(e.prevPos);
         TMP_ENEMY_DELTA.y = 0;
         const spd = TMP_ENEMY_DELTA.length() / Math.max(dt, 1e-4);
         const animSpeed = spd * 0.12;
         if (e.grounded && animSpeed < 0.05 && Math.abs(e.vel.y) < 0.5) {
            updateIdleAnim(e.root, dt, e.attackAnimT);
         } else {
            updateWalkAnim(e.root, animSpeed, e.grounded, dt, e.attackAnimT);
         }
         applyFootIK(e.root, e.grounded);
         if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
         e.prevPos.copyFrom(e.root.position);
      }

      if (toCull.length) {
         for (const enemy of toCull) {
            const idx = enemies.indexOf(enemy);
            if (idx >= 0) enemies.splice(idx, 1);
         }
      }

      // player walk anim
      TMP_PLAYER_DELTA.copyFrom(playerRoot.position);
      TMP_PLAYER_DELTA.subtractInPlace(lastPos);
      TMP_PLAYER_DELTA.y = 0;
      const playerSpd = TMP_PLAYER_DELTA.length() / Math.max(dt, 1e-4);
      const playerAnimSpeed = playerSpd * 0.12;
      const isIdle = state.grounded && playerAnimSpeed < 0.05 && moveDir.lengthSquared() < 0.01;
      if (isIdle && !state.prevIdle) {
         state.groundSampleDirty = true;
      }
      state.prevIdle = isIdle;
      state.prevGrounded = state.grounded;
      if (isIdle) {
         updateIdleAnim(playerRoot, dt, state.attackAnimT);
      } else {
         updateWalkAnim(playerRoot, playerAnimSpeed, state.grounded, dt, state.attackAnimT);
      }
      applyFootIK(playerRoot, state.grounded);
      if (state.attackAnimT > 0) state.attackAnimT = Math.max(0, state.attackAnimT - dt);
      lastPos.copyFrom(playerRoot.position);

      // wave clear / exit
      if (enemies.length && enemies.every(e => !e.alive)) {
         msg("Wave cleared! A glowing exit cube appeared — touch it to finish.");
         if (!scene.getMeshByName("exit")) {
            const exit = BABYLON.MeshBuilder.CreateBox("exit", {
               size: 1.5
            }, scene);
            exit.position = new BABYLON.Vector3(-8 + Math.random() * 16, 2.2, -8 + Math.random() * 16);
            const em = new BABYLON.StandardMaterial("xm", scene);
            em.emissiveColor = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc").scale(1.0);
            exit.material = em;
         } else {
            const exit = scene.getMeshByName("exit");
            if (BABYLON.Vector3.Distance(playerRoot.position, exit.position) < 1.8) {
               exit.dispose();
               msg("Next wave!");
               spawnWave(8);
               state.hp = Math.min(state.maxHP, state.hp + 20);
               updateHealthHud();
               state.nen.cur = Math.min(state.nen.max, state.nen.cur + 30);
               updateNenHud();
            }
         }
      }

      if (inputOnce["KeyL"]) {
         openLevelMenu();
      }
   }

   // ---------- Level menu ----------
   function openLevelMenu() {
      paused = true;
      hud.lvOverlay.classList.add("visible");
      hud.lvCur.textContent = progress.level;
      hud.lvUnspent.textContent = progress.unspent;
      Object.keys(progress.alloc).forEach(k => hud.statSpans[k].textContent = progress.alloc[k] ?? 0);
   }
   hud.lvClose?.addEventListener("click", () => {
      hud.lvOverlay.classList.remove("visible");
      paused = false;
   });
   hud.plusBtns().forEach(btn => btn.addEventListener("click", () => {
      if (progress.unspent <= 0) return;
      const stat = btn.getAttribute("data-stat");
      progress.alloc[stat] = (progress.alloc[stat] || 0) + 1;
      progress.unspent -= 1;
      recomputeDerived(); // update pools/regen/cooldowns from new totals
      updateHUD();
      hud.lvUnspent.textContent = progress.unspent;
      hud.statSpans[stat].textContent = progress.alloc[stat];
      saveProgress();
   }));

   function openTrainingMenu() {
      const hudApi = window.HUD;
      if (!hudApi?.openTrainingMenu) {
         msg("Training grounds unavailable.");
         return;
      }
      if (trainingMenuDisposer) {
         closeTrainingMenu({ silent: true });
         return;
      }
      paused = true;
      const disposer = hudApi.openTrainingMenu({
         progress: getTrainingProgressSnapshot(),
         caps: getTrainingCapsSnapshot(),
         limits: TRAINING_LIMITS,
         onClose: () => closeTrainingMenu({ silent: false }),
         onComplete: (key) => {
            const outcome = upgradeTraining(key, { silent: false });
            const snapshot = getTrainingProgressSnapshot();
            const caps = getTrainingCapsSnapshot();
            updateHUD();
            return { outcome, progress: snapshot, caps };
         }
      });
      trainingMenuDisposer = (silent = false) => {
         const closeFn = typeof disposer === "function" ? disposer : null;
         paused = false;
         if (closeFn) {
            try {
               closeFn();
            } catch (err) {
               console.warn("[HUD] Training menu cleanup failed", err);
            }
         }
         if (!silent) updateHUD();
      };
   }

   function closeTrainingMenu({ silent = false } = {}) {
      if (!trainingMenuDisposer) return;
      const cleanup = trainingMenuDisposer;
      trainingMenuDisposer = null;
      cleanup(silent);
   }

   // Pause UI
   hud.btnResume?.addEventListener("click", () => {
      paused = false;
      hud.pauseOverlay.classList.remove("visible");
   });
   hud.btnExit?.addEventListener("click", () => {
      paused = false;
      disableRearDebugCamera();
      window.SceneAudit?.beginTransition?.("game->menu", {
         fromLabel: "In-Game Scene",
         toLabel: "Menu Background",
         scene,
         engine
      });
      try {
         engine.stopRenderLoop();
         engine.dispose();
      } catch (e) {};
      scene = null;
      engine = null;
      document.getElementById("screen--game").classList.remove("visible");
      document.getElementById("screen--menu").classList.add("visible");
      window.MenuBG?.start();
      const menuState = window.MenuBG?.getState?.();
      window.SceneAudit?.completeTransition?.("game->menu", {
         fromLabel: "In-Game Scene",
         toLabel: "Menu Background",
         scene: menuState?.scene,
         engine: menuState?.engine
      });
   });

   if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
         try { scheduleRuntimeSave({ immediate: true }); } catch {}
      });
      document.addEventListener("visibilitychange", () => {
         if (document.visibilityState === "hidden") {
            try { scheduleRuntimeSave({ immediate: true }); } catch {}
         }
      });
   }

   setEnvironmentLodEnabled(perfSettings.lodEnabled);
   setGreedyMeshingEnabled(perfSettings.greedyMeshing);
   updatePerfSettings({ workerEnabled: chunkWorkerEnabled });

   // Public API
   window.GameSettings = GameSettings;
   const previousHXH = typeof window.HXH === "object" && window.HXH ? window.HXH : {};
   const previousFlags = previousHXH.FLAGS || window.WorldUtils?.FLAGS || {};
   const previousTerrainApi = previousHXH.Terrain || getTerrainApi();
   window.HXH = {
      startGame,
      rigReady,
      getRig: () => RIG,
      applyOutgoingDamage: previousHXH.applyOutgoingDamage,
      applyIncomingDamage: previousHXH.applyIncomingDamage,
      getTrainingProgress: () => getTrainingProgressSnapshot(),
      getTrainingCaps: () => getTrainingCapsSnapshot(),
      upgradeTraining: (key, opts) => upgradeTraining(key, opts || {}),
      openTrainingMenu,
      closeTrainingMenu,
      getSimulationBubble,
      configureSimulationBubble,
      setSimulationBehaviorOverride,
      registerPhysicsBody,
      unregisterPhysicsBody,
      wakePhysicsBody,
      applyPhysicsImpulse,
      configurePhysics,
      spawnPhysicsProp,
      setChunkWorkerEnabled,
      isChunkWorkerEnabled,
      enableRearDebugCamera,
      disableRearDebugCamera,
      isRearDebugCameraActive,
      FLAGS: previousFlags,
      Terrain: previousTerrainApi,
      getPhysicsStats: () => ({
         bodies: physics.bodies.size,
         sleeping: physics.sleepingBodies.size,
         budgetMs: physics.instrumentation.budgetUsedMs,
         slowBudgetMs: physics.instrumentation.slowBudgetUsedMs,
         regularSteps: physics.instrumentation.lastStepCount,
         slowSteps: physics.instrumentation.lastSlowCount,
         skippedSteps: physics.instrumentation.skippedSteps
      }),
      getAvailableCosmetics,
      getCosmeticSelection,
      setFace,
      setHair,
      setOutfit,
      setShoes,
      setAccessories,
      resolveCosmeticAnchor: (kind, id, segments) => resolveCosmeticAnchor(kind, id, segments || RIG),
      getCosmeticAnchor: (kind, id) => getCosmeticAnchorSnapshot(kind, id),
      adjustCosmeticAnchor: (kind, id, delta, opts) => adjustCosmeticAnchor(kind, id, delta || {}, opts || {}),
      resetCosmeticAnchor: (kind, id, opts) => resetCosmeticAnchor(kind, id, opts || {}),
      setRig: setRigParameters,
      getSavedCosmeticLoadout,
      saveCosmeticLoadout,
      applyCosmeticLoadout,
      getAnimationLibrary: () => getAnimationLibrarySnapshot(),
      saveAnimationLibrary: (snapshot, opts) => saveAnimationLibrarySnapshot(snapshot, opts || {}),
      prepareRigEditorSession,
      consumeRigEditorSession,
      getActiveRigEditorSession,
      finalizeRigEditorSession,
      cancelRigEditorSession
   };
// === Added: expose subsystems so auxiliary files can reuse them ===
try {
  Object.assign(window.HXH, {
    // shared state
    environment,
    world,
    enemies,
    projectiles,

    // math & helpers
    clamp, rand, lerp,

    // terrain & environment
    createTerrain, disposeTerrain, getTerrainHeight, updateTerrainStreaming, removeTerrainCubeAtPoint,
    getTerrainStreamingRadius, setTerrainStreamingRadius, setTerrainStreamingBudget, getTerrainStreamingStats,
    setChunkWorkerEnabled, isChunkWorkerEnabled,
    scatterVegetation, clearTrees, createCloudLayer, advanceEnvironment, updateEnvironment,
    getFallbackTreeMaterials, createFallbackTree,
    applyTreeLOD, refreshAllTreeLods, setEnvironmentLodProfile, setEnvironmentLodEnabled,
    setInstanceRenderingMode, getInstanceRenderingMode, setGreedyMeshingEnabled,
    registerInstanceType: INSTANCE_POOL.registerType,
    spawnInstances: (type, transforms, options) => INSTANCE_POOL.spawnInstances(type, transforms, options),
    despawnInstances: (type, ids) => INSTANCE_POOL.despawnInstances(type, ids),
    resetInstancePools: (opts) => INSTANCE_POOL.reset(opts),
    configurePhysics,
    registerPhysicsBody,
    unregisterPhysicsBody,
    wakePhysicsBody,
    applyPhysicsImpulse,
    spawnPhysicsProp,

    // HUD & cooldowns
    setCooldown, cdActive, markCooldownDirty, updateHealthHud, updateNenHud, updateXpHud, updateAuraHud, updateFlowHud, updateCooldownUI, updateHUD, msg,
    enableRearDebugCamera, disableRearDebugCamera, isRearDebugCameraActive,

    // combat
    blast, dash, special, nearestEnemy,
    applyVowToOutgoing,
    applyVowToIncoming,

    // saves & progress
    saveProgress, gainXP, xpToNext,
    saveRuntimeState, loadRuntimeState, scheduleRuntimeSave,

    // aura state accessors
    state,
    getAuraState: () => getAuraSnapshot(),
    subscribeAura,
    getFlowState: () => getFlowSnapshot(),
    subscribeFlow,
    applyFlowPreset,
    rotateFlowPreset,
    getVowRuntime: () => state.vowRuntime,
    openVowMenu,
    setActiveVows,
    setAuraState,
    setEnRadius,
    refillResources,
    spawnTargetDummy,
    applyRuntimeSnapshot,
    getSimulationBubble,
    configureSimulationBubble,
    setSimulationBehaviorOverride,
    setDynamicResolutionEnabled,
    refreshEnemySimulationAssignments,
    configureEnemyForSimulation,
    simulationBubble,
    interiors: interiorOcclusion,
    registerInteriorGroup: (key, spec) => interiorOcclusion.registerGroup(key, spec),
    addInteriorGroupNodes: (key, payload, options) => interiorOcclusion.addToGroup(key, payload, options),
    setInteriorGroupEnabled: (regionOrKey, setId, enabled, options = {}) => {
      if (typeof enabled === "undefined" && typeof setId === "boolean") {
        return interiorOcclusion.setGroupState(String(regionOrKey || ""), setId, options);
      }
      const key = setId != null ? `${regionOrKey}:${setId}` : String(regionOrKey || "");
      if (!key) return false;
      return interiorOcclusion.setGroupState(key, enabled, options);
    },
    refreshInteriorGroup: (key, options) => interiorOcclusion.refreshGroup(key, options),
    getInteriorGroupState: (key) => interiorOcclusion.getGroupState(key),
    withInteriorGroup: (key, cb) => interiorOcclusion.withGroup(key, cb),

    // cosmetics
    getAvailableCosmetics,
    getCosmeticSelection,
    setFace,
    setHair,
    setOutfit,
    setShoes,
    setAccessories,
    resolveCosmeticAnchor: (kind, id, segments) => resolveCosmeticAnchor(kind, id, segments || RIG),
    setRig: setRigParameters,
  });
  // share rig definitions for the editor if available
  window.RigDefinitions = {
    RIG_KEY,
    PART_KEYS,
    DEFAULT_RIG,
    ensureRig,
    parseRigXML,
    deepClone,
    d2r,
    t0,
    ANIMATION_STORAGE_KEY,
    COSMETIC_STORAGE_KEY
  };
  // Ensure GameSettings is globally accessible
  window.GameSettings = window.GameSettings || GameSettings;
} catch (e) {
  console.warn("[HXH] Export shim failed:", e);
}

   const prevApplyOutgoing = window.HXH.applyOutgoingDamage;
   window.HXH.applyOutgoingDamage = function applyOutgoingWithTraining(src, limb, baseDamage) {
      let result = typeof prevApplyOutgoing === "function"
         ? prevApplyOutgoing(src, limb, baseDamage)
         : baseDamage;
      if (src && src === state) {
         const aura = state.aura || {};
         if (aura.gyo) {
            const focusStat = Math.max(0, state.eff?.focus || 0);
            const scale = state.trainingCaps?.gyoCritScale ?? 0;
            const cap = state.trainingCaps?.gyoCritCap ?? 0;
            const bonus = Math.min(cap, focusStat * scale);
            if (bonus > 0) {
               result *= 1 + bonus;
            }
         }
      }
      return result;
   };

   const prevApplyIncoming = window.HXH.applyIncomingDamage;
   window.HXH.applyIncomingDamage = function applyIncomingWithTraining(dst, limb, baseDamage) {
      let result = typeof prevApplyIncoming === "function"
         ? prevApplyIncoming(dst, limb, baseDamage)
         : baseDamage;
      if (dst && dst === state) {
         const aura = state.aura || {};
         const guardBonus = state.trainingCaps?.ryuGuardBonus ?? 0;
         if (guardBonus > 0 && aura.ken) {
            result *= Math.max(0.55, 1 - guardBonus);
         }
      }
      return result;
   };

})();


// ===== Settings UI =====
(function () {
   const btnSettings = document.getElementById("btn-settings");
   const scrSettings = document.getElementById("screen--settings");
   const form = document.getElementById("settings-form");
   if (!btnSettings || !scrSettings || !form) return;
   const inputLength = document.getElementById("settings-length");
   const inputWidth = document.getElementById("settings-width");
   const inputCube = document.getElementById("settings-cube");
   const inputRadius = document.getElementById("settings-radius");
   const inputMaxTrees = document.getElementById("settings-max-trees");
   const inputThresholdDirt = document.getElementById("settings-threshold-dirt");
   const inputThresholdClay = document.getElementById("settings-threshold-clay");
   const inputThresholdBedrock = document.getElementById("settings-threshold-bedrock");
   const btnCancel = document.getElementById("settings-cancel");

   function populate() {
      const settings = window.GameSettings?.getTerrainSettings?.() || {};
      if (inputLength) inputLength.value = settings.length ?? "";
      if (inputWidth) inputWidth.value = settings.width ?? "";
      if (inputCube) inputCube.value = settings.cubeSize ?? "";
      if (inputRadius) inputRadius.value = settings.activeRadius ?? "";
      if (inputMaxTrees) inputMaxTrees.value = settings.maxTrees ?? "";
      const thresholds = settings.depthThresholds || {};
      if (inputThresholdDirt) inputThresholdDirt.value = thresholds.dirt ?? "";
      if (inputThresholdClay) inputThresholdClay.value = thresholds.clay ?? "";
      if (inputThresholdBedrock) inputThresholdBedrock.value = thresholds.bedrock ?? "";
   }

   function showSettings() {
      populate();
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
      scrSettings.classList.add("visible");
      window.MenuBG?.stop();
   }

   function returnToMenu() {
      if (window.MenuScreen?.showMenu) {
         window.MenuScreen.showMenu();
      } else {
         document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
         const menu = document.getElementById("screen--menu");
         menu?.classList.add("visible");
         window.MenuBG?.start();
      }
      window.CharacterCreator?.close?.();
   }

   form.addEventListener("submit", (e) => {
      e.preventDefault();
      const next = {
         length: inputLength ? parseInt(inputLength.value, 10) : undefined,
         width: inputWidth ? parseInt(inputWidth.value, 10) : undefined,
         cubeSize: inputCube ? parseFloat(inputCube.value) : undefined,
         activeRadius: inputRadius ? parseFloat(inputRadius.value) : undefined,
         maxTrees: inputMaxTrees ? parseInt(inputMaxTrees.value, 10) : undefined
      };
      const thresholds = {
         dirt: inputThresholdDirt ? parseFloat(inputThresholdDirt.value) : undefined,
         clay: inputThresholdClay ? parseFloat(inputThresholdClay.value) : undefined,
         bedrock: inputThresholdBedrock ? parseFloat(inputThresholdBedrock.value) : undefined
      };
      if (Object.values(thresholds).some((val) => Number.isFinite(val))) {
         next.depthThresholds = thresholds;
      }
      window.GameSettings?.setTerrainSettings?.(next);
      returnToMenu();
   });

   btnCancel?.addEventListener("click", (e) => {
      e.preventDefault();
      returnToMenu();
   });

   btnSettings.addEventListener("click", () => {
      showSettings();
   });
})();


// ===== Menu wiring =====
(function () {
   const scrMenu = document.getElementById("screen--menu");
   const btnResume = document.getElementById("btn-resume");
   const btnNew = document.getElementById("btn-new");
   const btnRig = document.getElementById("btn-rig");

   function showMenu() {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
      scrMenu.classList.add("visible");
      // show Resume only if we have a character saved
      if (btnResume) btnResume.hidden = !window.hasSave();
      // start menu background
      window.MenuBG && window.MenuBG.start();
   }

   btnResume?.addEventListener("click", () => {
      const ch = window.loadCharacter();
      if (!ch) {
         alert("No save found.");
         return;
      }
      const runtime = window.loadRuntimeState?.() || null;
      const menuState = window.MenuBG?.getState?.();
      window.SceneAudit?.beginTransition?.("menu->game", {
         fromLabel: "Menu Background",
         toLabel: "In-Game Scene",
         scene: menuState?.scene,
         engine: menuState?.engine
      });
      window.MenuBG && window.MenuBG.stop();
      document.getElementById("screen--menu").classList.remove("visible");
          document.getElementById("screen--game").classList.add("visible");
          // Make sure Babylon samples a real size once the screen is visible
      setTimeout(() => { try { engine && engine.resize(); } catch {} }, 0);
      window.HXH.startGame(ch, { runtime, sceneAudit: { key: "menu->game", fromLabel: "Menu Background", toLabel: "In-Game Scene" } });
   });

   btnNew?.addEventListener("click", () => {
          if (window.hasSave?.() && !confirm("Start a new game? This will reset your progress and character.")) return;
          window.wipeSave?.();
          const menuState = window.MenuBG?.getState?.();
          window.SceneAudit?.beginTransition?.("menu->creator", {
            fromLabel: "Menu Background",
            toLabel: "Character Creator",
            scene: menuState?.scene,
            engine: menuState?.engine
          });
          window.MenuBG?.stop();

          // hide all screens
          document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));

          // show the creator (your HTML id)
          const create = document.getElementById("screen--creator");
          if (!create) {
                alert('Could not find the character creation screen (screen--creator).');
                return;
          }
          create.classList.add("visible");
          window.CharacterCreator?.markSceneAuditPending?.();

          // initialize the 3D creator preview + UI
          window.CharacterCreator?.open?.();
          window.CharacterUI?.boot?.();
        });



   btnRig?.addEventListener("click", () => {
      const menuState = window.MenuBG?.getState?.();
      window.SceneAudit?.beginTransition?.("menu->rig", {
         fromLabel: "Menu Background",
         toLabel: "Rig Editor",
         scene: menuState?.scene,
         engine: menuState?.engine
      });
      window.RigEditor?.markSceneAuditPending?.();
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
      document.getElementById("screen--rig").classList.add("visible");
      window.MenuBG && window.MenuBG.stop();
      const rigEditor = window.RigEditor;
      if (rigEditor && typeof rigEditor.boot === "function") {
         const bootResult = rigEditor.boot();
         if (bootResult && typeof bootResult.then === "function") {
            bootResult
               .then((ok) => {
                  if (ok === false) {
                     console.warn("[Menu] Rig Editor boot did not complete successfully.");
                  }
               })
               .catch((err) => {
                  console.error("[Menu] Rig Editor boot promise rejected", err);
               });
         }
      }
   });

   // first load -> decide whether to show Resume
   document.addEventListener("DOMContentLoaded", showMenu);

   window.MenuScreen = { showMenu };
})();
