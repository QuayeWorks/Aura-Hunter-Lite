// region-manager.js — region registry + ambient/spawn routing
(function(){
  const H = (window.HXH ||= {});
  const registry = new Map();
  const listeners = new Set();
  const graph = new Map();
  const assetSpecsByRegion = new Map();
  const assetSpecsLookup = new Map();
  const assetCache = new Map();
  const regionUsage = new Map();
  const warmedNeighbors = new Set();
  let activeRegionId = null;
  let lastCommand = null;
  let activeScene = null;
  let lastKnownPosition = { x: 0, z: 0 };

  const LOOK_AHEAD_DEFAULT = 48;
  const LOOK_AHEAD_HYSTERESIS = 12;
  const ASSET_EVICTION_DELAY_MS = 12000;

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
      neighbors: ["frost-hollow", "ember-ridge"],
      lookAhead: 56,
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
      neighbors: ["emerald-basin", "ember-ridge"],
      lookAhead: 52,
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
      neighbors: ["emerald-basin", "frost-hollow"],
      lookAhead: 60,
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

  function ensureGraphEntry(regionId) {
    if (!regionId) return null;
    if (!graph.has(regionId)) {
      graph.set(regionId, { neighbors: new Set(), lookAhead: LOOK_AHEAD_DEFAULT });
    }
    return graph.get(regionId);
  }

  function linkRegions(sourceId, neighborId) {
    if (!sourceId || !neighborId || sourceId === neighborId) return;
    const src = ensureGraphEntry(sourceId);
    const dst = ensureGraphEntry(neighborId);
    if (!src || !dst) return;
    src.neighbors.add(neighborId);
    dst.neighbors.add(sourceId);
  }

  function normalizeAssetSpec(entry, regionId) {
    if (!entry) return null;
    if (typeof entry === "string") {
      return { key: entry, type: "texture", url: entry, regionId };
    }
    if (typeof entry !== "object") return null;
    const type = entry.type || (entry.sceneFile || entry.rootUrl ? "mesh" : (entry.url ? "texture" : null));
    if (!type) return null;
    const key = typeof entry.key === "string" && entry.key.trim()
      ? entry.key.trim()
      : (typeof entry.url === "string" && entry.url.trim()
        ? entry.url.trim()
        : `${entry.rootUrl || ""}${entry.sceneFile || entry.file || ""}`);
    if (!key) return null;
    return { ...entry, key, type, regionId };
  }

  function normalizeRegionAssets(assets, regionId) {
    if (!assets) return [];
    const list = [];
    const push = (item, fallbackType) => {
      const normalized = normalizeAssetSpec(fallbackType ? { ...item, type: fallbackType } : item, regionId);
      if (normalized) list.push(normalized);
    };
    if (Array.isArray(assets)) {
      assets.forEach(item => push(item));
    } else if (typeof assets === "object") {
      if (Array.isArray(assets.textures)) assets.textures.forEach(item => push(item, "texture"));
      if (Array.isArray(assets.meshes)) assets.meshes.forEach(item => push(item, "mesh"));
      if (Array.isArray(assets.prefetch)) assets.prefetch.forEach(item => push(item));
    }
    return list;
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
    const lookAhead = Number.isFinite(def.lookAhead) ? Math.max(12, def.lookAhead) : null;
    const assets = normalizeRegionAssets(def.assets, id);
    const region = {
      id,
      name: typeof def.name === "string" && def.name.trim() ? def.name.trim() : id,
      bounds: def.bounds || null,
      ambient: def.ambient || {},
      spawnTable: def.spawnTable || null,
      difficulty: typeof def.difficulty === "number" ? def.difficulty : 1,
      meta: def.meta || null,
      terrain,
      lod,
      neighbors: Array.isArray(def.neighbors) ? def.neighbors.map(n => String(n).trim().toLowerCase()).filter(Boolean) : [],
      lookAhead,
      assets
    };
    return region;
  }

  function registerRegion(def) {
    const region = normalizeRegion(def);
    if (!region) return null;
    registry.set(region.id, region);
    const entry = ensureGraphEntry(region.id);
    entry.lookAhead = Number.isFinite(region.lookAhead) ? region.lookAhead : LOOK_AHEAD_DEFAULT;
    if (Array.isArray(region.neighbors)) {
      region.neighbors.forEach(neighborId => linkRegions(region.id, neighborId));
    }
    const assetSpecs = region.assets || [];
    assetSpecsByRegion.set(region.id, assetSpecs);
    for (const spec of assetSpecs) {
      if (!assetSpecsLookup.has(spec.key)) {
        assetSpecsLookup.set(spec.key, spec);
      }
    }
    return region;
  }

  function setScene(scene) {
    activeScene = scene || null;
    if (!activeScene) return;
    for (const state of assetCache.values()) {
      if (!state) continue;
      if ((state.refCount || 0) > 0 || (state.warmCount || 0) > 0) {
        loadAssetState(state);
      }
    }
  }

  function getScene() {
    if (activeScene && typeof activeScene.getEngine === "function") return activeScene;
    const env = window.HXH?.environment;
    if (env?.sky?.getScene?.()) {
      activeScene = env.sky.getScene();
      return activeScene;
    }
    if (env?.sun?.getScene?.()) {
      activeScene = env.sun.getScene();
      return activeScene;
    }
    if (env?.hemi?.getScene?.()) {
      activeScene = env.hemi.getScene();
      return activeScene;
    }
    return activeScene;
  }

  function ensureRegionUsage(regionId) {
    if (!regionUsage.has(regionId)) {
      regionUsage.set(regionId, { active: new Set(), warm: new Set() });
    }
    return regionUsage.get(regionId);
  }

  function ensureAssetState(spec) {
    const current = assetCache.get(spec.key);
    if (current) return current;
    const state = {
      key: spec.key,
      type: spec.type,
      spec,
      status: "idle",
      refCount: 0,
      warmCount: 0,
      data: null,
      promise: null,
      lastUsed: 0,
      timer: null,
      error: null
    };
    assetCache.set(spec.key, state);
    return state;
  }

  function disposeMeshAsset(payload) {
    if (!payload) return;
    const { meshes, particleSystems, skeletons, animationGroups, transformNodes } = payload;
    if (Array.isArray(animationGroups)) {
      animationGroups.forEach(group => {
        try { group.dispose(); } catch (err) {}
      });
    }
    if (Array.isArray(particleSystems)) {
      particleSystems.forEach(ps => {
        try { ps.dispose(); } catch (err) {}
      });
    }
    if (Array.isArray(skeletons)) {
      skeletons.forEach(sk => {
        try { sk.dispose(); } catch (err) {}
      });
    }
    if (Array.isArray(transformNodes)) {
      transformNodes.forEach(node => {
        try { node.dispose(); } catch (err) {}
      });
    }
    if (Array.isArray(meshes)) {
      meshes.forEach(mesh => {
        if (!mesh) return;
        try { mesh.dispose(false, true); } catch (err) {}
      });
    }
  }

  function disposeAssetState(state) {
    if (!state) return;
    const { spec, type, data } = state;
    try {
      if (typeof spec?.dispose === "function") {
        spec.dispose(data);
      } else if (type === "texture" && data?.dispose) {
        data.dispose();
      } else if (type === "mesh" && data) {
        disposeMeshAsset(data);
      }
    } catch (err) {
      console.warn("[RegionManager] Asset dispose failed", err);
    }
    state.data = null;
    state.promise = null;
    state.error = null;
    state.status = "idle";
  }

  function scheduleEviction(state) {
    if (!state || state.refCount > 0 || state.warmCount > 0) return;
    if (state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      if (state.refCount === 0 && state.warmCount === 0 && state.status === "ready") {
        disposeAssetState(state);
      }
    }, ASSET_EVICTION_DELAY_MS);
  }

  function markAssetUsed(state) {
    if (!state) return;
    state.lastUsed = Date.now();
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function loadTextureAsset(spec, scene) {
    if (!scene || !BABYLON?.Texture) return Promise.resolve(null);
    const options = spec.options || {};
    const noMipmap = !!options.noMipmap;
    const invertY = options.invertY ?? false;
    const sampling = options.samplingMode ?? BABYLON.Texture.BILINEAR_SAMPLINGMODE;
    return new Promise((resolve, reject) => {
      const texture = new BABYLON.Texture(spec.url, scene, noMipmap, invertY, sampling,
        () => {
          try {
            if (typeof spec.onLoad === "function") spec.onLoad(texture, scene);
          } catch (err) {
            console.warn("[RegionManager] texture onLoad failed", err);
          }
          resolve(texture);
        },
        (message, exception) => {
          if (texture && typeof texture.dispose === "function") {
            try { texture.dispose(); } catch (err) {}
          }
          reject(exception || new Error(message || `Failed to load texture ${spec.url}`));
        }
      );
      if (typeof spec.configure === "function") {
        try { spec.configure(texture, scene); } catch (err) {
          console.warn("[RegionManager] texture configure failed", err);
        }
      }
    });
  }

  function loadMeshAsset(spec, scene) {
    if (!scene || !BABYLON?.SceneLoader) return Promise.resolve(null);
    const rootUrl = spec.rootUrl || spec.url || "";
    const sceneFile = spec.sceneFile || spec.file || "";
    const meshNames = spec.meshNames ?? spec.meshName ?? "";
    const pluginOptions = spec.pluginOptions || undefined;
    const progress = typeof spec.onProgress === "function" ? spec.onProgress : undefined;
    const loader = BABYLON.SceneLoader.ImportMeshAsync(meshNames, rootUrl, sceneFile, scene, progress, pluginOptions);
    return loader.then((result) => {
      try {
        if (typeof spec.onLoad === "function") spec.onLoad(result, scene);
      } catch (err) {
        console.warn("[RegionManager] mesh onLoad failed", err);
      }
      return result;
    });
  }

  function loadAssetState(state) {
    if (!state) return Promise.resolve(null);
    if (state.status === "ready") return Promise.resolve(state.data);
    if (state.status === "loading" && state.promise) return state.promise;
    const scene = getScene();
    if (!scene) {
      state.status = "idle";
      state.promise = null;
      return Promise.resolve(null);
    }
    const spec = state.spec || assetSpecsLookup.get(state.key);
    if (!spec) {
      state.status = "idle";
      return Promise.resolve(null);
    }
    state.status = "loading";
    const loader = spec.type === "mesh" ? loadMeshAsset(spec, scene) : loadTextureAsset(spec, scene);
    state.promise = loader.then((payload) => {
      state.data = payload || null;
      state.status = "ready";
      state.promise = null;
      state.error = null;
      markAssetUsed(state);
      return payload;
    }).catch((err) => {
      state.status = "error";
      state.error = err;
      state.promise = null;
      console.warn("[RegionManager] Asset load failed", err);
      return null;
    });
    return state.promise;
  }

  function retainAsset(spec) {
    const state = ensureAssetState(spec);
    state.refCount = Math.max(0, (state.refCount || 0)) + 1;
    markAssetUsed(state);
    loadAssetState(state);
    return state;
  }

  function releaseAssetKey(key) {
    const state = assetCache.get(key);
    if (!state) return;
    state.refCount = Math.max(0, (state.refCount || 0) - 1);
    markAssetUsed(state);
    if (state.refCount === 0 && state.warmCount === 0) {
      scheduleEviction(state);
    }
  }

  function prefetchAsset(spec) {
    const state = ensureAssetState(spec);
    state.warmCount = Math.max(0, (state.warmCount || 0)) + 1;
    markAssetUsed(state);
    loadAssetState(state);
    return state;
  }

  function releasePrefetchKey(key) {
    const state = assetCache.get(key);
    if (!state) return;
    state.warmCount = Math.max(0, (state.warmCount || 0) - 1);
    markAssetUsed(state);
    if (state.refCount === 0 && state.warmCount === 0) {
      scheduleEviction(state);
    }
  }

  function activateRegionAssets(regionId) {
    if (!regionId) return;
    const specs = assetSpecsByRegion.get(regionId) || [];
    if (!specs.length) return;
    const usage = ensureRegionUsage(regionId);
    for (const spec of specs) {
      if (usage.warm.has(spec.key)) {
        usage.warm.delete(spec.key);
        releasePrefetchKey(spec.key);
      }
      if (!usage.active.has(spec.key)) {
        usage.active.add(spec.key);
        retainAsset(spec);
      }
    }
  }

  function deactivateRegionAssets(regionId) {
    if (!regionId) return;
    const usage = regionUsage.get(regionId);
    if (!usage) return;
    for (const key of usage.active) {
      usage.active.delete(key);
      releaseAssetKey(key);
    }
  }

  function warmRegionAssets(regionId) {
    if (!regionId) return;
    const specs = assetSpecsByRegion.get(regionId) || [];
    if (!specs.length) return;
    const usage = ensureRegionUsage(regionId);
    for (const spec of specs) {
      if (usage.active.has(spec.key) || usage.warm.has(spec.key)) continue;
      usage.warm.add(spec.key);
      prefetchAsset(spec);
    }
  }

  function coolRegionAssets(regionId) {
    if (!regionId) return;
    const usage = regionUsage.get(regionId);
    if (!usage) return;
    for (const key of usage.warm) {
      usage.warm.delete(key);
      releasePrefetchKey(key);
    }
  }

  function getGraphEntry(regionId) {
    return ensureGraphEntry(regionId);
  }

  function resolvePoint(position) {
    if (!position) return { x: 0, z: 0 };
    if (typeof position.x === "number" || typeof position.z === "number") {
      return {
        x: Number.isFinite(position.x) ? position.x : 0,
        z: Number.isFinite(position.z) ? position.z : 0
      };
    }
    if (Array.isArray(position)) {
      const [px = 0, pz = 0] = position;
      return { x: Number(px) || 0, z: Number(pz) || 0 };
    }
    return { x: 0, z: 0 };
  }

  function resolveCircleBounds(bounds) {
    if (!bounds) return null;
    const centerSource = bounds.center || bounds.c || [bounds.x ?? bounds.centerX ?? 0, bounds.z ?? bounds.centerZ ?? 0];
    let cx = 0;
    let cz = 0;
    if (Array.isArray(centerSource)) {
      cx = Number(centerSource[0]) || 0;
      cz = Number(centerSource[1]) || 0;
    } else if (typeof centerSource === "object") {
      cx = Number(centerSource.x ?? centerSource[0]) || 0;
      cz = Number(centerSource.z ?? centerSource[1]) || 0;
    } else {
      cx = Number(centerSource) || 0;
      cz = Number(bounds.centerZ ?? bounds.z ?? 0) || 0;
    }
    const radius = Number(bounds.radius ?? bounds.r ?? 0);
    if (!Number.isFinite(radius) || radius <= 0) return null;
    return { cx, cz, radius };
  }

  function resolveRectBounds(bounds) {
    if (!bounds) return null;
    const centerX = Number(bounds.center?.x ?? bounds.centerX ?? bounds.x ?? 0) || 0;
    const centerZ = Number(bounds.center?.z ?? bounds.centerZ ?? bounds.z ?? 0) || 0;
    const width = Number(bounds.width ?? bounds.size ?? 0) || 0;
    const depth = Number(bounds.depth ?? bounds.size ?? 0) || 0;
    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    const hasMinX = Number.isFinite(bounds.minX);
    const hasMaxX = Number.isFinite(bounds.maxX);
    const hasMinZ = Number.isFinite(bounds.minZ);
    const hasMaxZ = Number.isFinite(bounds.maxZ);

    let minX = hasMinX ? Number(bounds.minX) : centerX - halfWidth;
    let maxX = hasMaxX ? Number(bounds.maxX) : centerX + halfWidth;
    let minZ = hasMinZ ? Number(bounds.minZ) : centerZ - halfDepth;
    let maxZ = hasMaxZ ? Number(bounds.maxZ) : centerZ + halfDepth;

    if (hasMinX && !hasMaxX && width > 0) maxX = minX + width;
    if (hasMaxX && !hasMinX && width > 0) minX = maxX - width;
    if (hasMinZ && !hasMaxZ && depth > 0) maxZ = minZ + depth;
    if (hasMaxZ && !hasMinZ && depth > 0) minZ = maxZ - depth;

    const resolvedMinX = Math.min(minX, maxX);
    const resolvedMaxX = Math.max(minX, maxX);
    const resolvedMinZ = Math.min(minZ, maxZ);
    const resolvedMaxZ = Math.max(minZ, maxZ);
    return { minX: resolvedMinX, maxX: resolvedMaxX, minZ: resolvedMinZ, maxZ: resolvedMaxZ };
  }

  function isPointInsideRegion(region, point) {
    if (!region?.bounds) return false;
    const bounds = region.bounds;
    if (bounds.type === "circle" || Number.isFinite(bounds.radius) || bounds.c || bounds.center) {
      const circle = resolveCircleBounds(bounds);
      if (!circle) return false;
      const dx = point.x - circle.cx;
      const dz = point.z - circle.cz;
      const distSq = dx * dx + dz * dz;
      return distSq <= circle.radius * circle.radius;
    }
    if (bounds.type === "rect" || bounds.type === "box" || Number.isFinite(bounds.minX) || Number.isFinite(bounds.maxX)) {
      const rect = resolveRectBounds(bounds);
      if (!rect) return false;
      return point.x >= rect.minX && point.x <= rect.maxX && point.z >= rect.minZ && point.z <= rect.maxZ;
    }
    return false;
  }

  function distanceToRegionBoundary(region, point) {
    if (!region?.bounds) return Infinity;
    const bounds = region.bounds;
    if (bounds.type === "circle" || Number.isFinite(bounds.radius) || bounds.c || bounds.center) {
      const circle = resolveCircleBounds(bounds);
      if (!circle) return Infinity;
      const dx = point.x - circle.cx;
      const dz = point.z - circle.cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      return dist - circle.radius;
    }
    if (bounds.type === "rect" || bounds.type === "box" || Number.isFinite(bounds.minX) || Number.isFinite(bounds.maxX)) {
      const rect = resolveRectBounds(bounds);
      if (!rect) return Infinity;
      const inside = point.x >= rect.minX && point.x <= rect.maxX && point.z >= rect.minZ && point.z <= rect.maxZ;
      if (inside) {
        const distX = Math.min(point.x - rect.minX, rect.maxX - point.x);
        const distZ = Math.min(point.z - rect.minZ, rect.maxZ - point.z);
        return -Math.min(distX, distZ);
      }
      const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
      const dz = Math.max(rect.minZ - point.z, 0, point.z - rect.maxZ);
      return Math.sqrt(dx * dx + dz * dz);
    }
    return Infinity;
  }

  function findRegionByPosition(position) {
    const point = resolvePoint(position);
    if (activeRegionId && registry.has(activeRegionId)) {
      const active = registry.get(activeRegionId);
      if (isPointInsideRegion(active, point)) return active;
    }
    for (const region of registry.values()) {
      if (isPointInsideRegion(region, point)) return region;
    }
    return null;
  }

  function refreshLookAheadState(region, point) {
    const pointRef = resolvePoint(point);
    const nextWarm = new Set();
    if (region) {
      const entry = getGraphEntry(region.id);
      const baseLookAhead = entry?.lookAhead ?? LOOK_AHEAD_DEFAULT;
      if (entry) {
        entry.neighbors.forEach(neighborId => {
          if (neighborId === region.id) return;
          const neighbor = registry.get(neighborId);
          if (!neighbor) return;
          const neighborEntry = getGraphEntry(neighborId);
          const lookAhead = Number.isFinite(neighbor.lookAhead)
            ? neighbor.lookAhead
            : (neighborEntry?.lookAhead ?? baseLookAhead);
          const dist = distanceToRegionBoundary(neighbor, pointRef);
          const threshold = Number.isFinite(lookAhead) ? lookAhead : LOOK_AHEAD_DEFAULT;
          const keepWarm = warmedNeighbors.has(neighborId) && dist <= threshold + LOOK_AHEAD_HYSTERESIS;
          const shouldWarm = dist <= threshold;
          if (shouldWarm || keepWarm) {
            if (!warmedNeighbors.has(neighborId)) warmRegionAssets(neighborId);
            nextWarm.add(neighborId);
          }
        });
      }
    }
    for (const neighborId of warmedNeighbors) {
      if (!nextWarm.has(neighborId)) {
        coolRegionAssets(neighborId);
      }
    }
    warmedNeighbors.clear();
    nextWarm.forEach(id => warmedNeighbors.add(id));
  }

  function updateSpatialState(position = {}, opts = {}) {
    ensureDefaults();
    const point = resolvePoint(position);
    lastKnownPosition = { ...point };
    let region = activeRegionId ? registry.get(activeRegionId) : null;
    if (!region || !isPointInsideRegion(region, point)) {
      const next = findRegionByPosition(point);
      if (next && next.id !== activeRegionId) {
        warmRegionAssets(next.id);
        applyRegion(next, { silent: opts.silent ?? true });
        region = next;
      }
    }
    if (region) {
      refreshLookAheadState(region, point);
    } else if (warmedNeighbors.size) {
      for (const neighborId of warmedNeighbors) coolRegionAssets(neighborId);
      warmedNeighbors.clear();
    }
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
    const previousId = activeRegionId;
    warmRegionAssets(region.id);
    activeRegionId = region.id;
    activateRegionAssets(region.id);
    if (previousId && previousId !== region.id) {
      deactivateRegionAssets(previousId);
    }
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
    refreshLookAheadState(region, lastKnownPosition);
    return true;
  }

  function ensureDefaults() {
    if (registry.size > 0) return;
    DEFAULT_REGIONS.forEach(registerRegion);
  }

  function ensureActive(silent = true) {
    ensureDefaults();
    if (activeRegionId && registry.has(activeRegionId)) {
      const region = registry.get(activeRegionId);
      applyRegion(region, { silent });
      return region;
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

  function spawnInstances(type, transforms, options) {
    if (!type) return [];
    try {
      const fn = window.HXH?.spawnInstances;
      return typeof fn === "function" ? fn(type, transforms, options) || [] : [];
    } catch (err) {
      console.warn("[RegionManager] spawnInstances failed", err);
      return [];
    }
  }

  function despawnInstances(type, ids) {
    if (!type) return 0;
    try {
      const fn = window.HXH?.despawnInstances;
      return typeof fn === "function" ? fn(type, ids) || 0 : 0;
    } catch (err) {
      console.warn("[RegionManager] despawnInstances failed", err);
      return 0;
    }
  }

  const API = {
    registerRegion,
    listRegions,
    getRegion: id => registry.get(id) || null,
    setRegion,
    ensureActive,
    getActiveRegion,
    updateSpatialState,
    onRegionChange,
    runCommand,
    getLastCommand,
    spawnInstances,
    despawnInstances,
    getLODConfig: id => buildRegionLodProfile(id || activeRegionId),
    getDefaultLODConfig: () => ({ version: DEFAULT_LOD_CONFIG.version, assets: clone(DEFAULT_LOD_CONFIG.assets) }),
    setTerrainRadius: (radius, opts) => window.WorldUtils?.setTerrainStreamingRadius?.(radius, opts),
    getTerrainRadius: () => window.WorldUtils?.getTerrainStreamingRadius?.() || null,
    showMenu: (...a)=>window.MenuScreen?.showMenu?.(...a),
    setScene,
    distanceToRegionBoundary: (id, point) => {
      const region = typeof id === "string" ? registry.get(id) : id;
      if (!region) return Infinity;
      const pt = resolvePoint(point || lastKnownPosition);
      return distanceToRegionBoundary(region, pt);
    },
    getRegionNeighbors: (id) => {
      const entry = getGraphEntry(typeof id === "string" ? id : id?.id);
      if (!entry) return [];
      return Array.from(entry.neighbors);
    }
  };

  window.RegionManager = API;

  ensureDefaults();
  ensureActive(true);

  window.addEventListener("DOMContentLoaded", () => ensureActive(true));
})();
