// region-manager.js — region registry + ambient/spawn routing
(function(){
  const H = (window.HXH ||= {});
  const registry = new Map();
  const listeners = new Set();
  let activeRegionId = null;
  let lastCommand = null;

  const DEFAULT_LOD_CONFIG = Object.freeze({
    version: 1,
    assets: Object.freeze({
      tree: Object.freeze({ mediumDistance: 48, farDistance: 96, cullDistance: 160, billboard: true }),
      rock: Object.freeze({ mediumDistance: 36, farDistance: 78, cullDistance: 148, billboard: false }),
      structure: Object.freeze({ mediumDistance: 60, farDistance: 130, cullDistance: 220, billboard: false })
    }),
    regionOverrides: Object.freeze({
      "frost-hollow": Object.freeze({
        tree: { mediumDistance: 44, farDistance: 88 },
        rock: { mediumDistance: 32, farDistance: 70 }
      }),
      "ember-ridge": Object.freeze({
        tree: { mediumDistance: 54, farDistance: 112 },
        structure: { mediumDistance: 66, farDistance: 140 }
      })
    })
  });

  const DEFAULT_REGIONS = [
    {
      id: "emerald-basin",
      name: "Emerald Basin",
      difficulty: 1,
      bounds: { type: "circle", center: [0, 0], radius: 180 },
      ambient: {
        sky: "#4c82d9",
        fog: "#122032",
        ground: "#1a2a39",
        ambient: "#283b52",
        sun: "#ffd7a0",
        fogDensity: 0.0065
      },
      terrain: {
        streamRadius: 32
      },
      spawnTable: {
        waveSize: { base: 6, variance: 2, ramp: 1.2 },
        cadence: { min: 22, max: 30 },
        enemies: [
          { id: "skirmisher", name: "Skirmisher", weight: 5, hp: { base: 46, variance: 12 }, speed: { base: 3.7, variance: 0.4 } },
          { id: "scout", name: "Scout", weight: 3, hpMultiplier: 0.9, speedMultiplier: 1.25, tint: "#6fffd1" }
        ]
      }
    },
    {
      id: "frost-hollow",
      name: "Frost Hollow",
      difficulty: 2,
      bounds: { type: "circle", center: [220, -40], radius: 160 },
      ambient: {
        sky: "#6aa4e1",
        fog: "#1a2433",
        ground: "#1c2735",
        ambient: "#2d3d52",
        sun: "#ffe3b6",
        moon: "#b6d3ff",
        fogDensity: 0.0085
      },
      terrain: {
        streamRadius: 34
      },
      spawnTable: {
        waveSize: { base: 7, variance: 2, ramp: 1.6 },
        cadence: { min: 26, max: 34 },
        enemies: [
          { id: "winter-wolf", name: "Frost Runner", weight: 4, hp: { base: 52, variance: 10 }, speedMultiplier: 1.3, tint: "#76c0ff" },
          { id: "glacier-brute", name: "Glacier Brute", weight: 2, hp: { base: 72, variance: 16, bonus: 10 }, speedMultiplier: 0.75, tint: "#9fb0ff" }
        ]
      }
    },
    {
      id: "ember-ridge",
      name: "Ember Ridge",
      difficulty: 3,
      bounds: { type: "circle", center: [-180, 120], radius: 200 },
      ambient: {
        sky: "#7a3a2c",
        fog: "#2a120f",
        ground: "#2c1711",
        ambient: "#3f1d16",
        sun: "#ff9757",
        fogDensity: 0.01
      },
      terrain: {
        streamRadius: 36
      },
      spawnTable: {
        waveSize: { base: 8, variance: 3, ramp: 2.1 },
        cadence: { min: 18, max: 26 },
        enemies: [
          { id: "ember-lancer", name: "Ember Lancer", weight: 4, hpMultiplier: 1.15, speed: { base: 3.8, variance: 0.5 }, tint: "#ff6b45" },
          { id: "cinder-brute", name: "Cinder Brute", weight: 3, hp: { base: 88, variance: 18 }, speedMultiplier: 0.65, tint: "#ff9340" },
          { id: "flare-stalker", name: "Flare Stalker", weight: 2, hpMultiplier: 0.8, speedMultiplier: 1.4, tint: "#ffd15c" }
        ]
      }
    }
  ];

  function clone(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      if (typeof value === "object") {
        return { ...value };
      }
      return value;
    }
  }

  function normalizeLodAssetConfig(source) {
    if (!source || typeof source !== "object") return null;
    const medium = Number(source.mediumDistance);
    const far = Number(source.farDistance);
    const cull = Number(source.cullDistance);
    const result = {};
    if (Number.isFinite(medium) && medium > 0) result.mediumDistance = medium;
    if (Number.isFinite(far) && far > 0) result.farDistance = far;
    if (Number.isFinite(cull) && cull > 0) result.cullDistance = cull;
    if (typeof source.billboard === "boolean") result.billboard = source.billboard;
    return Object.keys(result).length ? result : null;
  }

  function normalizeLodOverrides(source) {
    if (!source || typeof source !== "object") return null;
    const result = {};
    for (const key of Object.keys(source)) {
      const normalized = normalizeLodAssetConfig(source[key]);
      if (normalized) result[key] = normalized;
    }
    return Object.keys(result).length ? result : null;
  }

  function buildRegionLodProfile(regionId) {
    const baseAssets = clone(DEFAULT_LOD_CONFIG.assets) || {};
    const overrides = [];
    if (regionId && DEFAULT_LOD_CONFIG.regionOverrides && DEFAULT_LOD_CONFIG.regionOverrides[regionId]) {
      overrides.push(DEFAULT_LOD_CONFIG.regionOverrides[regionId]);
    }
    if (regionId && registry.has(regionId)) {
      const region = registry.get(regionId);
      if (region?.lod) overrides.push(region.lod);
    }
    for (const override of overrides) {
      for (const key of Object.keys(override)) {
        const normalized = normalizeLodAssetConfig(override[key]);
        if (!normalized) continue;
        baseAssets[key] = { ...(baseAssets[key] || {}), ...normalized };
      }
    }
    return { version: DEFAULT_LOD_CONFIG.version, assets: baseAssets };
  }

  function normalizeRegion(def) {
    if (!def || typeof def !== "object") return null;
    const id = typeof def.id === "string" ? def.id.trim().toLowerCase() : null;
    if (!id) return null;
    let terrain = null;
    if (def.terrain && typeof def.terrain === "object") {
      const streamRadius = Number.isFinite(def.terrain.streamRadius) ? def.terrain.streamRadius : null;
      terrain = { streamRadius };
    }
    const lod = normalizeLodOverrides(def.lod);
    const region = {
      id,
      name: typeof def.name === "string" && def.name.trim() ? def.name.trim() : id,
      bounds: def.bounds || null,
      ambient: def.ambient || {},
      spawnTable: def.spawnTable || null,
      difficulty: typeof def.difficulty === "number" ? def.difficulty : 1,
      meta: def.meta || null,
      terrain,
      lod
    };
    return region;
  }

  function registerRegion(def) {
    const region = normalizeRegion(def);
    if (!region) return null;
    registry.set(region.id, region);
    return region;
  }

  function notify(region) {
    for (const cb of listeners) {
      try {
        cb?.(region);
      } catch (err) {
        console.warn("[RegionManager] listener failed", err);
      }
    }
  }

  function applyRegion(region, opts = {}) {
    if (!region) return false;
    activeRegionId = region.id;
    window.Spawns?.useRegion?.(region);
    window.WorldUtils?.applyRegionVisuals?.(region);
    const streamRadius = Number.isFinite(region.terrain?.streamRadius) ? region.terrain.streamRadius : null;
    window.WorldUtils?.setTerrainStreamingRadius?.(streamRadius, { mode: "base" });
    const lodProfile = buildRegionLodProfile(region.id);
    window.HXH?.setEnvironmentLodProfile?.(clone(lodProfile.assets));
    if (!opts.silent && typeof H.msg === "function") {
      const cadence = window.Spawns?.getNextCadence?.();
      const cadenceInfo = cadence ? ` Cadence ~${cadence.toFixed(0)}s.` : "";
      H.msg(`Region set: ${region.name}. Difficulty ${region.difficulty}.${cadenceInfo}`);
    }
    notify(region);
    return true;
  }

  function ensureDefaults() {
    if (registry.size > 0) return;
    DEFAULT_REGIONS.forEach(registerRegion);
  }

  function ensureActive(silent = true) {
    ensureDefaults();
    if (activeRegionId && registry.has(activeRegionId)) {
      applyRegion(registry.get(activeRegionId), { silent });
      return registry.get(activeRegionId);
    }
    const first = registry.values().next().value;
    if (first) {
      applyRegion(first, { silent });
      return first;
    }
    return null;
  }

  function setRegion(id, opts = {}) {
    ensureDefaults();
    const targetId = typeof id === "string" ? id.trim().toLowerCase() : null;
    const region = targetId ? registry.get(targetId) : null;
    if (!region) {
      if (!opts.silent && typeof H.msg === "function") {
        H.msg(`Unknown region: ${id}`);
      }
      return null;
    }
    if (region.id === activeRegionId && !opts.force) {
      if (!opts.silent && typeof H.msg === "function") {
        H.msg(`${region.name} is already active.`);
      }
      return region;
    }
    applyRegion(region, opts);
    return region;
  }

  function listRegions() {
    ensureDefaults();
    return Array.from(registry.values());
  }

  function getActiveRegion() {
    ensureDefaults();
    return activeRegionId ? registry.get(activeRegionId) || null : ensureActive(true);
  }

  function onRegionChange(cb) {
    if (typeof cb !== "function") return () => {};
    listeners.add(cb);
    if (activeRegionId && registry.has(activeRegionId)) {
      try { cb(registry.get(activeRegionId)); } catch (err) { console.warn("[RegionManager] init listener failed", err); }
    }
    return () => listeners.delete(cb);
  }

  function formatRegionList() {
    return listRegions().map(r => `${r.id} — ${r.name} (★${r.difficulty})`).join("\n");
  }

  function runCommand(input) {
    if (typeof input !== "string") return false;
    const trimmed = input.trim();
    if (!trimmed.startsWith("/region")) return false;
    lastCommand = trimmed;
    const setMatch = trimmed.match(/^\/region\s+set\s+([\w-]+)/i);
    if (setMatch) {
      const id = setMatch[1].toLowerCase();
      const region = setRegion(id, { silent: true });
      if (region) {
        applyRegion(region, { silent: false });
      } else if (typeof H.msg === "function") {
        H.msg(`Region '${id}' not found.`);
      }
      return true;
    }
    if (/^\/region\s+list/i.test(trimmed)) {
      const message = formatRegionList();
      if (typeof H.msg === "function") H.msg(message || "No regions registered.");
      return true;
    }
    if (/^\/region\s+info/i.test(trimmed)) {
      const active = getActiveRegion();
      if (!active) {
        if (typeof H.msg === "function") H.msg("No active region.");
        return true;
      }
      const cadence = window.Spawns?.getNextCadence?.();
      const info = `Region ${active.name} (id=${active.id}) difficulty ${active.difficulty}. Cadence ${cadence ? `${cadence.toFixed(1)}s` : "n/a"}.`;
      if (typeof H.msg === "function") H.msg(info);
      return true;
    }
    if (typeof H.msg === "function") {
      H.msg("Usage: /region list | /region set <id> | /region info");
    }
    return true;
  }

  function getLastCommand() {
    return lastCommand;
  }

  const API = {
    registerRegion,
    listRegions,
    getRegion: id => registry.get(id) || null,
    setRegion,
    ensureActive,
    getActiveRegion,
    onRegionChange,
    runCommand,
    getLastCommand,
    getLODConfig: id => buildRegionLodProfile(id || activeRegionId),
    getDefaultLODConfig: () => ({ version: DEFAULT_LOD_CONFIG.version, assets: clone(DEFAULT_LOD_CONFIG.assets) }),
    setTerrainRadius: (radius, opts) => window.WorldUtils?.setTerrainStreamingRadius?.(radius, opts),
    getTerrainRadius: () => window.WorldUtils?.getTerrainStreamingRadius?.() || null,
    showMenu: (...a)=>window.MenuScreen?.showMenu?.(...a)
  };

  window.RegionManager = API;

  ensureDefaults();
  ensureActive(true);

  window.addEventListener("DOMContentLoaded", () => ensureActive(true));
})();
