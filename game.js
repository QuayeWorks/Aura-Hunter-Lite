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
      chunkSize: DEFAULT_CHUNK_SIZE
   };

   const TERRAIN_SETTINGS_KEY = "hxh-terrain-settings";

   function clampSetting(value, min, max, fallback) {
      if (!Number.isFinite(value)) return fallback;
      return clamp(value, min, max);
   }

   function normalizeTerrainSettings(next = {}) {
      const out = { ...defaultTerrainSettings };
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
      terrainSettings: { ...savedTerrainSettings },
      lodProfile: JSON.parse(JSON.stringify(DEFAULT_ENVIRONMENT_LOD_PROFILE)),
      updateAccumulator: 0,
      updateInterval: 1 / 24
   };

   let terrainRadiusControl = null;
   let terrainRadiusUiScheduled = false;

   let fallbackTreeMaterials = null;

   const INSTANCE_POOL = (() => {
      const registry = new Map();
      let idCounter = 1;

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
         const baseMesh = ensureBaseMesh(entry);
         if (!baseMesh) return [];
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

         for (const transformInput of list) {
            const transform = normalizeTransform(transformInput);
            const mesh = baseMesh.createInstance(`${type}-inst-${idCounter}`);
            applyTransformToMesh(mesh, transform);
            mesh.isVisible = true;
            mesh.isPickable = false;
            mesh.checkCollisions = !!entry.options.withCollisions;
            const id = idCounter++;
            entry.instanceRecords.set(id, { mesh, transform });
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
         }
      };

      return {
         registerType,
         spawnInstances,
         despawnInstances,
         reset,
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
         return { ...environment.terrainSettings };
      },
      setTerrainSettings(update) {
         const merged = normalizeTerrainSettings({ ...environment.terrainSettings, ...update });
         environment.terrainSettings = merged;
         saveTerrainSettings(merged);
         if (environment.terrain) {
            environment.terrain.settings = { ...merged };
            initializeTerrainStreaming(environment.terrain, merged, { preserveOverride: true });
         }
         return merged;
      },
      resetTerrainSettings() {
         const merged = normalizeTerrainSettings(defaultTerrainSettings);
         environment.terrainSettings = merged;
         saveTerrainSettings(merged);
         if (environment.terrain) {
            environment.terrain.settings = { ...merged };
            initializeTerrainStreaming(environment.terrain, merged, { preserveOverride: true, forceRebuild: true });
         }
         return merged;
      }
   };
   const SKY_RADIUS = 420;
   const VEC3_UP = new BABYLON.Vector3(0, 1, 0);
   const VEC3_DOWN = new BABYLON.Vector3(0, -1, 0);
   const GROUND_STICK_THRESHOLD = 0.35;
   const FOOT_CLEARANCE = 0.012;
   const IK_POS_EPS = 1e-4;
   const IK_ROT_EPS = 0.0015;
   const IK_IDLE_FRAME_LIMIT = 3;
   const TMP_PLAYER_MOVE_DIR = new BABYLON.Vector3();
   const TMP_PLAYER_MOVE_VEC = new BABYLON.Vector3();
   const TMP_PLAYER_MOTION = new BABYLON.Vector3();
   const TMP_PLAYER_DELTA = new BABYLON.Vector3();
   const TMP_ENEMY_TO_PLAYER = new BABYLON.Vector3();
   const TMP_ENEMY_DELTA = new BABYLON.Vector3();
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
      if (!mesh) return false;
      const meta = mesh.metadata;
      if (meta && meta.terrainBlock && !meta.terrainBlock.destroyed && mesh.isEnabled && mesh.isEnabled()) return true;
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
            pivot.rotation.x = baseRotX;
            pivot.rotation.z = baseRotZ;
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
            pivot.rotation.x = baseRotX;
            pivot.rotation.z = baseRotZ;
            continue;
         }
         const gap = bottomY - pick.pickedPoint.y;
         if (gap > foot.contactThreshold) {
            pivot.rotation.x = baseRotX;
            pivot.rotation.z = baseRotZ;
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
         pivot.rotation.x = baseRotX + tiltX;
         pivot.rotation.z = baseRotZ + tiltZ;
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
      if (terrainTextureState.material && !terrainTextureState.material.isDisposed()) {
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

         // 4) Clear references
         environment.terrain = null;
         world.ground = null;
       }


	function createTerrain(scene) {
	  disposeTerrain();

	  const settings = environment.terrainSettings = normalizeTerrainSettings(environment.terrainSettings);
	  saveTerrainSettings(settings);

          const { length, width, cubeSize, layers } = settings;

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
                settings: { ...settings },
                streamAccumulator: 0,
                streamInterval: DEFAULT_STREAM_INTERVAL,
                bounds: { minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ },
                layerTemplates // keep a reference if other systems need access
          };
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
      const idx = terrainColumnIndexFromWorld(x, z);
      if (idx < 0) return null;
      const height = terrain.heights[idx];
      if (!Number.isFinite(height) || height <= 0) return terrain.baseY;
      return terrain.baseY + height;
   }

   function enableTerrainColumn(column) {
      for (const block of column) {
         if (!block) continue;
         const meta = block.metadata?.terrainBlock;
         if (meta && meta.destroyed) continue;
         block.setEnabled(true);
         block.isPickable = true;
         block.checkCollisions = true;
      }
   }

   function disableTerrainColumn(column) {
      for (const block of column) {
         if (!block) continue;
         block.setEnabled(false);
         block.isPickable = false;
         block.checkCollisions = false;
      }
   }

   const STREAMING_STATES = {
      UNLOADED: "unloaded",
      LOADING: "loading",
      LOADED: "loaded",
      UNLOADING: "unloading"
   };

   function getWorkerJobs() {
      const utils = window.WorldUtils;
      if (!utils || !utils.WorkerJobs) return null;
      return utils.WorkerJobs;
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

   function initializeTerrainStreaming(terrain, settings = {}, opts = {}) {
      if (!terrain) return null;
      const previous = terrain.streaming || null;
      const preserveOverride = opts.preserveOverride !== false;
      const prevOverride = preserveOverride ? previous?.radiusOverride ?? null : null;
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
         radiusOverride: prevOverride,
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
      if (!streaming) return null;
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
         if (terrain.columnStates[columnIndex]) {
            enableTerrainColumn(column);
         }
         return true;
      }
      return false;
   }

   function removeTerrainBlockFromMesh(mesh) {
      if (!mesh) return false;
      const meta = mesh.metadata?.terrainBlock;
      if (!meta) return false;
      return removeTopBlock(meta.columnIndex);
   }

   function removeTerrainCubeAtPoint(point) {
      const idx = terrainColumnIndexFromWorld(point.x, point.z);
      if (idx < 0) return false;
      return removeTopBlock(idx);
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
            mesh.checkCollisions = !!enabled;
            mesh.isPickable = !!enabled;
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
            mesh.checkCollisions = true;
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
            mesh.checkCollisions = true;
            interactiveMeshes.push(mesh);
         }
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
      if (flowListeners.size === 0) return;
      const snapshot = getFlowSnapshot();
      for (const listener of flowListeners) {
         try {
            listener(snapshot);
         } catch (err) {
            console.error("Flow listener error", err);
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
         w: 0.45,
         h: 0.50,
         d: 0.45
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

   function deepClone(o) {
      return JSON.parse(JSON.stringify(o));
   }

   // ensure transforms exist and are numeric
   function ensureRig(rig) {
      const r = rig && typeof rig === "object" ? rig : {};
      const out = deepClone(DEFAULT_RIG);

      if (typeof r.color === "string") {
         out.color = r.color;
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
   };

   getRuntimeState = () => state;

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

   async function setupBabylon(canvas) {
      engine = new BABYLON.Engine(canvas, true, {
         stencil: true
      });
      scene = new BABYLON.Scene(engine);
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
      await setupEnvironment(scene);

      const spawnHeight = getTerrainHeight(0, 0);
      const baseY = spawnHeight === null ? 3 : spawnHeight + 1.8;
      startPos = new BABYLON.Vector3(0, baseY, 0);

      const p = createHumanoid(state.ch.color || "#00ffcc");
      playerRoot = player = p.root; // collider mesh
      playerRoot.position.copyFrom(startPos);
      state.prevPlayerPos = playerRoot.position.clone();
      player.checkCollisions = true;
      player.metadata = {
         parts: p.parts,
         animPhase: 0
      };
      updateTerrainStreaming(playerRoot.position, 0, true);

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

      engine.runRenderLoop(() => {
         const now = performance.now();
         const dt = lastTime ? (now - lastTime) / 1000 : 0;
         lastTime = now;
         if (!paused) tick(dt);
         scene.render();
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
      if (hudApi?.configureDevPanel) {
         hudApi.configureDevPanel({
            toggleAura: (key, value) => setAuraState(key, value),
            setEnRadius: radius => setEnRadius(radius),
            spawnDummy: count => spawnTargetDummy({ count }),
            refill: (target) => {
               if (target === "hp") return refillResources({ hp: true, nen: false });
               if (target === "nen") return refillResources({ hp: false, nen: true });
               return refillResources({ hp: true, nen: true });
            }
         });
         hudApi.updateDevPanelState?.(getAuraSnapshot());
         scheduleTerrainRadiusUiUpdate();
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
      setTimeout(() => {
         try {
            canvas.focus();
			// One more resize after focus/paint, to be extra safe:
            engine && engine.resize();
         } catch (e) {}
      }, 0);
   }

   // ------------ Humanoid (segmented) ------------
   function createHumanoid(hex, rig = RIG) {
      const color = BABYLON.Color3.FromHexString(hex);

      function mat(c) {
         const m = new BABYLON.StandardMaterial("m" + Math.random(), scene);
         m.diffuseColor = c;
         m.emissiveColor = c.scale(0.16);
         return m;
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
      const headM = BABYLON.MeshBuilder.CreateBox("head", {
         width: s.head.w,
         height: s.head.h,
         depth: s.head.d
      }, scene);
      headM.material = mat(color.scale(0.8));
      headM.parent = headPivot;
      headM.position.y = s.head.h * 0.5;

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

      // apply transforms (absolute, same as editor)
      const T = rig.transforms || {};

      function apply(key) {
         const n = nodes[key];
         if (!n) return;
         const tr = T[key] || t0();
         n.position.set(tr.pos.x || 0, tr.pos.y || 0, tr.pos.z || 0);
         n.rotation.set(d2r(tr.rot.x || 0), d2r(tr.rot.y || 0), d2r(tr.rot.z || 0));
      }
      PART_KEYS.forEach(apply);

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

      root.metadata = {
         parts,
         animPhase: 0,
         footIK
      };
      return {
         root,
         parts
      };
   }

   // ------------ Enemies ------------
   function createEnemy(pos) {
      const h = createHumanoid("#f24d7a");
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
   function updateWalkAnim(rootMesh, speed, grounded, dt, attackT = 0) {
      const P = rootMesh.metadata?.parts;
      if (!P) return;
      const phPrev = rootMesh.metadata.animPhase || 0;
      const ph = phPrev + (grounded ? speed * 4.8 : speed * 2.4) * dt * ANIM_SPEED;
      rootMesh.metadata.animPhase = ph;

      P.pelvis.position.x = 0;
      P.pelvis.position.y = 0;
      P.pelvis.position.z = 0;
      P.pelvis.rotation.set(0, 0, 0);
      if (P.head) {
         P.head.rotation.x = 0;
         P.head.rotation.y = 0;
         P.head.rotation.z = 0;
      }
      P.armL.shoulder.rotation.y = 0;
      P.armR.shoulder.rotation.y = 0;
      P.armL.shoulder.rotation.z = 0;
      P.armR.shoulder.rotation.z = 0;
      P.legL.hip.rotation.y = 0;
      P.legR.hip.rotation.y = 0;
      P.legL.hip.rotation.z = 0;
      P.legR.hip.rotation.z = 0;
      P.armL.elbow.rotation.y = 0;
      P.armR.elbow.rotation.y = 0;
      P.armL.wrist.rotation.z = 0;
      P.armR.wrist.rotation.z = 0;

      const swing = grounded ? Math.sin(ph) * 0.7 : 0.3 * Math.sin(ph * 0.6);
      const armSwing = swing * 0.8;

      P.legL.hip.rotation.x = swing;
      P.legR.hip.rotation.x = -swing;
      const kneeL = Math.max(0, -Math.sin(ph)) * 1.1;
      const kneeR = Math.max(0, Math.sin(ph)) * 1.1;
      P.legL.knee.rotation.x = kneeL;
      P.legR.knee.rotation.x = kneeR;
      P.legL.ankle.rotation.x = -kneeL * 0.35 + 0.1 * Math.sin(ph * 2);
      P.legR.ankle.rotation.x = -kneeR * 0.35 - 0.1 * Math.sin(ph * 2);

      P.armL.shoulder.rotation.x = -armSwing;
      P.armR.shoulder.rotation.x = armSwing;
      const elbowL = Math.max(0, Math.sin(ph)) * 0.6;
      const elbowR = Math.max(0, -Math.sin(ph)) * 0.6;
      P.armL.elbow.rotation.x = elbowL;
      P.armR.elbow.rotation.x = elbowR;
      P.armL.wrist.rotation.x = -elbowL * 0.4;
      P.armR.wrist.rotation.x = -elbowR * 0.4;

      if (!grounded) {
         P.armL.shoulder.rotation.x = 0.5;
         P.armR.shoulder.rotation.x = 0.5;
         P.legL.knee.rotation.x = Math.max(P.legL.knee.rotation.x, 0.4);
         P.legR.knee.rotation.x = Math.max(P.legR.knee.rotation.x, 0.4);
         P.legL.ankle.rotation.x = 0.15;
         P.legR.ankle.rotation.x = 0.15;
      }

      if (attackT > 0) {
         const t = Math.min(1, attackT / 0.22);
         const k = Math.sin(t * Math.PI);
         const reach = 1.6 * 1.9;
         const elbowStart = 0.2;
         const elbowEnd = -0.32;
         const wristStart = 0.12;
         const wristEnd = -0.08;
         P.armR.shoulder.rotation.x = -reach * k;
         P.armR.elbow.rotation.x = elbowStart * (1 - k) + elbowEnd * k;
         P.armR.wrist.rotation.x = wristStart * (1 - k) + wristEnd * k;
      }

      P.lowerTorso.rotation.x = 0.05 * Math.sin(ph * 2) * (grounded ? 1 : 0.3);
      P.upperTorso.rotation.x = 0.03 * Math.sin(ph * 2 + 0.4) * (grounded ? 1 : 0.3);
      P.neck.rotation.x = -0.03 * Math.sin(ph * 2 + 0.2);
   }

   function updateIdleAnim(rootMesh, dt, attackT = 0) {
      const P = rootMesh.metadata?.parts;
      if (!P) return;
      const phPrev = rootMesh.metadata.animPhase || 0;
      const ph = phPrev + dt * ANIM_SPEED * 0.9;
      rootMesh.metadata.animPhase = ph;

      const breathe = Math.sin(ph * 0.8) * 0.05;
      const sway = Math.sin(ph * 0.35) * 0.1;
      const shift = Math.sin(ph * 0.45 + 1.2) * 0.08;

      P.pelvis.position.x = shift * 0.4;
      P.pelvis.position.y = 0.02 * Math.sin(ph * 0.8 + 0.4);
      P.pelvis.position.z = 0;
      P.pelvis.rotation.x = 0;
      P.pelvis.rotation.y = sway * 0.45;
      P.pelvis.rotation.z = -shift * 0.35;

      P.lowerTorso.rotation.x = breathe * 0.6;
      P.lowerTorso.rotation.y = 0.08 * Math.sin(ph * 0.45);
      P.lowerTorso.rotation.z = sway * 0.25;

      P.upperTorso.rotation.x = 0.12 * Math.sin(ph * 0.85 + 0.6);
      P.upperTorso.rotation.y = 0.14 * Math.sin(ph * 0.35 + 0.3);
      P.upperTorso.rotation.z = -sway * 0.4;

      P.neck.rotation.x = -0.06 * Math.sin(ph * 0.9 + 0.9);
      P.neck.rotation.y = 0.04 * Math.sin(ph * 0.7);
      P.neck.rotation.z = 0.02 * Math.sin(ph * 0.5 + 0.5);

      if (P.head) {
         P.head.rotation.x = -0.03 * Math.sin(ph * 0.85 + 0.4);
         P.head.rotation.y = 0.05 * Math.sin(ph * 0.6 + 1.1);
         P.head.rotation.z = 0.01 * Math.sin(ph * 0.8);
      }

      const armOsc = Math.sin(ph * 0.8);
      P.armL.shoulder.rotation.x = -0.18 + 0.09 * armOsc;
      P.armR.shoulder.rotation.x = -0.12 - 0.09 * armOsc;
      P.armL.shoulder.rotation.y = 0.05 * Math.sin(ph * 0.5);
      P.armR.shoulder.rotation.y = -0.05 * Math.sin(ph * 0.5 + 0.4);
      P.armL.shoulder.rotation.z = 0.18 + 0.04 * Math.sin(ph * 0.7);
      P.armR.shoulder.rotation.z = -0.18 + 0.04 * Math.sin(ph * 0.7 + Math.PI);

      P.armL.elbow.rotation.x = 0.28 + 0.05 * Math.sin(ph * 0.9 + 0.3);
      P.armR.elbow.rotation.x = 0.28 + 0.05 * Math.sin(ph * 0.9 - 0.3);
      P.armL.elbow.rotation.y = 0;
      P.armR.elbow.rotation.y = 0;
      P.armL.wrist.rotation.x = -0.12 + 0.04 * Math.sin(ph * 1.1);
      P.armR.wrist.rotation.x = -0.12 + 0.04 * Math.sin(ph * 1.1 + 0.5);
      P.armL.wrist.rotation.z = 0.02 * Math.sin(ph * 1.4);
      P.armR.wrist.rotation.z = -0.02 * Math.sin(ph * 1.3);

      P.legL.hip.rotation.x = 0.12 + 0.03 * Math.sin(ph * 0.6);
      P.legR.hip.rotation.x = 0.12 + 0.03 * Math.sin(ph * 0.6 + Math.PI);
      P.legL.hip.rotation.y = 0.02 * Math.sin(ph * 0.4);
      P.legR.hip.rotation.y = -0.02 * Math.sin(ph * 0.4);
      P.legL.hip.rotation.z = shift * 0.8;
      P.legR.hip.rotation.z = -shift * 0.8;
      P.legL.knee.rotation.x = 0.14 + 0.025 * Math.sin(ph * 0.7);
      P.legR.knee.rotation.x = 0.14 + 0.025 * Math.sin(ph * 0.7 + Math.PI);
      P.legL.ankle.rotation.x = -0.08 + 0.02 * Math.sin(ph * 0.9);
      P.legR.ankle.rotation.x = -0.08 + 0.02 * Math.sin(ph * 0.9 + Math.PI);

      if (attackT > 0) {
         const t = Math.min(1, attackT / 0.22);
         const k = Math.sin(t * Math.PI);
         const reach = 1.6 * 1.9;
         const elbowStart = 0.2;
         const elbowEnd = -0.32;
         const wristStart = 0.12;
         const wristEnd = -0.08;
         P.armR.shoulder.rotation.x = -reach * k;
         P.armR.elbow.rotation.x = elbowStart * (1 - k) + elbowEnd * k;
         P.armR.wrist.rotation.x = wristStart * (1 - k) + wristEnd * k;
      }
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
      playerRoot.position.copyFrom(player.position);
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

      updateTerrainStreaming(playerRoot.position, dt);

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
         p.life.t -= dt;
         if (p.life.t <= 0) {
            const groundY = getTerrainHeight(p.mesh.position.x, p.mesh.position.z);
            if (groundY !== null && p.mesh.position.y - groundY < 6) {
               removeTerrainCubeAtPoint(new BABYLON.Vector3(p.mesh.position.x, groundY, p.mesh.position.z));
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
               removeTerrainBlockFromMesh(collision.pickedMesh);
            } else if (collision.pickedMesh && destroyTreeByMesh(collision.pickedMesh)) {
               // tree destroyed
            } else if (collision.pickedPoint) {
               removeTerrainCubeAtPoint(collision.pickedPoint);
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
      if (state.grounded && playerAnimSpeed < 0.05 && moveDir.lengthSquared() < 0.01) {
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
      try {
         engine.stopRenderLoop();
         engine.dispose();
      } catch (e) {};
      document.getElementById("screen--game").classList.remove("visible");
      document.getElementById("screen--menu").classList.add("visible");
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

   // Public API
   window.GameSettings = GameSettings;
   const previousHXH = typeof window.HXH === "object" && window.HXH ? window.HXH : {};
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
      setSimulationBehaviorOverride
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
    scatterVegetation, clearTrees, createCloudLayer, advanceEnvironment, updateEnvironment,
    getFallbackTreeMaterials, createFallbackTree,
    applyTreeLOD, refreshAllTreeLods, setEnvironmentLodProfile,
    registerInstanceType: INSTANCE_POOL.registerType,
    spawnInstances: (type, transforms, options) => INSTANCE_POOL.spawnInstances(type, transforms, options),
    despawnInstances: (type, ids) => INSTANCE_POOL.despawnInstances(type, ids),
    resetInstancePools: (opts) => INSTANCE_POOL.reset(opts),

    // HUD & cooldowns
    setCooldown, cdActive, markCooldownDirty, updateHealthHud, updateNenHud, updateXpHud, updateAuraHud, updateFlowHud, updateCooldownUI, updateHUD, msg,

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
    refreshEnemySimulationAssignments,
    configureEnemyForSimulation,
    simulationBubble,
  });
  // share rig definitions for the editor if available
  window.RigDefinitions = {
    RIG_KEY, PART_KEYS, DEFAULT_RIG, ensureRig, parseRigXML, deepClone, d2r, t0
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
   const btnCancel = document.getElementById("settings-cancel");

   function populate() {
      const settings = window.GameSettings?.getTerrainSettings?.() || {};
      if (inputLength) inputLength.value = settings.length ?? "";
      if (inputWidth) inputWidth.value = settings.width ?? "";
      if (inputCube) inputCube.value = settings.cubeSize ?? "";
      if (inputRadius) inputRadius.value = settings.activeRadius ?? "";
      if (inputMaxTrees) inputMaxTrees.value = settings.maxTrees ?? "";
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
      window.MenuBG && window.MenuBG.stop();
      document.getElementById("screen--menu").classList.remove("visible");
          document.getElementById("screen--game").classList.add("visible");
          // Make sure Babylon samples a real size once the screen is visible
      setTimeout(() => { try { engine && engine.resize(); } catch {} }, 0);
      window.HXH.startGame(ch, { runtime });
   });

	btnNew?.addEventListener("click", () => {
	  if (window.hasSave?.() && !confirm("Start a new game? This will reset your progress and character.")) return;
	  window.wipeSave?.();
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

	  // wire the creator UI
	  window.CharacterUI?.boot?.();
	});



   btnRig?.addEventListener("click", () => {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
      document.getElementById("screen--rig").classList.add("visible");
      window.MenuBG && window.MenuBG.stop();
      window.RigEditor && window.RigEditor.boot();
   });

   // first load -> decide whether to show Resume
   document.addEventListener("DOMContentLoaded", showMenu);

   window.MenuScreen = { showMenu };
})();
