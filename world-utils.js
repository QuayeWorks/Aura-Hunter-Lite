// world-utils.js — thin wrappers exposing world/terrain helpers via window.HXH
(function(){
  const H = (window.HXH ||= {});
  const COLOR_CACHE = new Map();
  const VISUAL_STATE = {
    region: null,
    colors: null,
    patched: false
  };

  function parseColor3(input, fallback) {
    if (!input) return fallback || null;
    if (input instanceof BABYLON.Color3) return input;
    if (typeof input === "string") {
      const key = input.toLowerCase();
      if (COLOR_CACHE.has(key)) return COLOR_CACHE.get(key).clone();
      try {
        const col = BABYLON.Color3.FromHexString(key);
        COLOR_CACHE.set(key, col.clone());
        return col;
      } catch (e) {
        console.warn("[WorldUtils] Invalid color string", input, e);
        return fallback || null;
      }
    }
    if (Array.isArray(input) && input.length >= 3) {
      const col = new BABYLON.Color3(
        Number.parseFloat(input[0]) || 0,
        Number.parseFloat(input[1]) || 0,
        Number.parseFloat(input[2]) || 0
      );
      return col;
    }
    return fallback || null;
  }

  function mixColor(base, tint, strength = 1) {
    if (!base) return tint ? tint.clone() : null;
    if (!tint) return base.clone();
    const s = Math.max(0, Math.min(1, strength));
    return new BABYLON.Color3(
      base.r + (tint.r - base.r) * s,
      base.g + (tint.g - base.g) * s,
      base.b + (tint.b - base.b) * s
    );
  }

  function ensureEnvironmentPatch() {
    if (VISUAL_STATE.patched) return;
    const originalUpdate = typeof H.updateEnvironment === "function" ? H.updateEnvironment : null;
    if (!originalUpdate) return;
    H.updateEnvironment = function patchedUpdateEnvironment(...args) {
      const result = originalUpdate.apply(this, args);
      applyRegionTint();
      return result;
    };
    VISUAL_STATE.patched = true;
  }

  function applyRegionTint() {
    const { colors } = VISUAL_STATE;
    if (!colors) return;
    const env = H.environment;
    if (!env) return;
    const scene = env.sky?.getScene?.() || env.hemi?.getScene?.() || env.sun?.getScene?.();

    if (colors.sky && env.skyMaterial) {
      env.skyMaterial.emissiveColor = mixColor(env.skyMaterial.emissiveColor, colors.sky, colors.skyStrength ?? 1);
    }
    if (scene) {
      if (colors.fog) {
        scene.fogColor = mixColor(scene.fogColor || colors.fog, colors.fog, 1);
        scene.fogMode = scene.fogMode || BABYLON.Scene.FOGMODE_EXP2;
        scene.fogDensity = colors.fogDensity ?? scene.fogDensity ?? 0.008;
      }
      if (colors.sky) {
        scene.clearColor = new BABYLON.Color4(colors.sky.r, colors.sky.g, colors.sky.b, 1);
      }
      if (colors.ambient) {
        scene.ambientColor = mixColor(scene.ambientColor, colors.ambient, 1);
      }
    }
    if (env.hemi && colors.ground) {
      env.hemi.groundColor = mixColor(env.hemi.groundColor, colors.ground, 1);
    }
    if (env.sun && colors.sun) {
      env.sun.diffuse = mixColor(env.sun.diffuse, colors.sun, 1);
      env.sun.specular = mixColor(env.sun.specular, colors.sun, 0.7);
    }
    if (env.moon && colors.moon) {
      env.moon.diffuse = mixColor(env.moon.diffuse, colors.moon, 1);
      env.moon.specular = mixColor(env.moon.specular, colors.moon, 0.7);
    }
    if (typeof colors.onApply === "function") {
      try { colors.onApply(env, scene); } catch (err) {
        console.warn("[WorldUtils] Region visual callback failed", err);
      }
    }
  }

  function scheduleTint() {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => applyRegionTint());
    } else {
      setTimeout(() => applyRegionTint(), 0);
    }
  }

  function applyRegionVisuals(region) {
    if (!region || typeof region !== "object") return;
    ensureEnvironmentPatch();
    const ambient = region.ambient || {};
    const colors = {
      sky: parseColor3(ambient.sky),
      fog: parseColor3(ambient.fog),
      ground: parseColor3(ambient.ground),
      ambient: parseColor3(ambient.ambient),
      sun: parseColor3(ambient.sun || ambient.light),
      moon: parseColor3(ambient.moon),
      fogDensity: typeof ambient.fogDensity === "number" ? ambient.fogDensity : undefined,
      skyStrength: typeof ambient.skyStrength === "number" ? ambient.skyStrength : undefined,
      onApply: ambient.onApply
    };
    VISUAL_STATE.region = region;
    VISUAL_STATE.colors = colors;
    applyRegionTint();
    scheduleTint();
  }

  const WorldUtils = {
    get environment(){ return H.environment; },
    get world(){ return H.world; },
    get enemies(){ return H.enemies; },
    get projectiles(){ return H.projectiles; },
    clamp: H.clamp,
    rand: H.rand,
    lerp: H.lerp,
    createTerrain: (...a)=>H.createTerrain?.(...a),
    disposeTerrain: (...a)=>H.disposeTerrain?.(...a),
    getTerrainHeight: (...a)=>H.getTerrainHeight?.(...a),
    updateTerrainStreaming: (...a)=>H.updateTerrainStreaming?.(...a),
    getTerrainStreamingRadius: (...a)=>H.getTerrainStreamingRadius?.(...a),
    setTerrainStreamingRadius: (...a)=>H.setTerrainStreamingRadius?.(...a),
    setTerrainStreamingBudget: (...a)=>H.setTerrainStreamingBudget?.(...a),
    getTerrainStreamingStats: (...a)=>H.getTerrainStreamingStats?.(...a),
    removeTerrainCubeAtPoint: (...a)=>H.removeTerrainCubeAtPoint?.(...a),
    scatterVegetation: (...a)=>H.scatterVegetation?.(...a),
    clearTrees: (...a)=>H.clearTrees?.(...a),
    createCloudLayer: (...a)=>H.createCloudLayer?.(...a),
    advanceEnvironment: (...a)=>H.advanceEnvironment?.(...a),
    updateEnvironment: (...a)=>H.updateEnvironment?.(...a),
    applyRegionVisuals,
    GameSettings: window.GameSettings || H.GameSettings
  };
  window.WorldUtils = WorldUtils;
})();
