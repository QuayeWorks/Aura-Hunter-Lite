(function (global) {
  const DEFAULT_SEED = 1337 >>> 0;
  const DEFAULT_WORLD_SIZE = 4096;
  const DEFAULT_VOXEL_SIZE = 1;
  function hash2(seed, x, y) {
    let h = seed ^ (x * 0x27d4eb2d) ^ (y * 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 1 | seed);
    h ^= h >>> 13;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  function fade(t) {
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function createValueNoise2D(seed) {
    const baseSeed = (seed >>> 0) || DEFAULT_SEED;
    return function sample(x, y) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const rx = fade(fx);
      const ry = fade(fy);
      const v00 = hash2(baseSeed, x0, y0);
      const v10 = hash2(baseSeed, x0 + 1, y0);
      const v01 = hash2(baseSeed, x0, y0 + 1);
      const v11 = hash2(baseSeed, x0 + 1, y0 + 1);
      const ix0 = lerp(v00, v10, rx);
      const ix1 = lerp(v01, v11, rx);
      return lerp(ix0, ix1, ry); // [0,1]
    };
  }

  const BIOMES = {
    MOUNTAIN: 0,
    JUNGLE: 1,
    DESERT: 2
  };

  const BASE_TERRAIN_LAYER_COUNT = 3; // bedrock, dirt, grass (see TERRAIN_LAYER_DEFS)
  const VOXEL_IDS = {
    AIR: 0,
    BEDROCK: 1,
    MOUNTAIN_ROCK: BASE_TERRAIN_LAYER_COUNT + 1,
    MOUNTAIN_DIRT: BASE_TERRAIN_LAYER_COUNT + 2,
    JUNGLE_GRASS: BASE_TERRAIN_LAYER_COUNT + 3,
    JUNGLE_SOIL: BASE_TERRAIN_LAYER_COUNT + 4,
    DESERT_SAND: BASE_TERRAIN_LAYER_COUNT + 5,
    DESERT_ROCK: BASE_TERRAIN_LAYER_COUNT + 6
  };

  const EXTRA_ATLAS_SWATCHES = [
    { key: "mountain-rock", color: [0.52, 0.53, 0.56], highlight: [0.68, 0.69, 0.72], shadow: [0.32, 0.33, 0.36] },
    { key: "mountain-dirt", color: [0.42, 0.35, 0.3], highlight: [0.56, 0.48, 0.42], shadow: [0.28, 0.22, 0.18] },
    { key: "jungle-grass", color: [0.18, 0.52, 0.28], highlight: [0.32, 0.7, 0.42], shadow: [0.1, 0.32, 0.16] },
    { key: "jungle-soil", color: [0.34, 0.23, 0.16], highlight: [0.52, 0.35, 0.24], shadow: [0.18, 0.12, 0.09] },
    { key: "desert-sand", color: [0.76, 0.69, 0.46], highlight: [0.92, 0.85, 0.62], shadow: [0.54, 0.48, 0.32] },
    { key: "desert-rock", color: [0.58, 0.5, 0.34], highlight: [0.74, 0.64, 0.46], shadow: [0.42, 0.35, 0.24] }
  ];

  const BIOME_PARAMS = {
    [BIOMES.MOUNTAIN]: {
      height: { base: 0.9, amplitude: 0.8, frequency: 6, detailAmplitude: 0.35, detailFrequency: 18 },
      surfaceDepth: 0.6,
      subSurfaceDepth: 1.4,
      surfaceVoxel: VOXEL_IDS.MOUNTAIN_ROCK,
      subSurfaceVoxel: VOXEL_IDS.MOUNTAIN_DIRT,
      deepVoxel: VOXEL_IDS.BEDROCK
    },
    [BIOMES.JUNGLE]: {
      height: { base: 1.15, amplitude: 0.6, frequency: 3.2, detailAmplitude: 0.28, detailFrequency: 11 },
      surfaceDepth: 0.4,
      subSurfaceDepth: 1,
      surfaceVoxel: VOXEL_IDS.JUNGLE_GRASS,
      subSurfaceVoxel: VOXEL_IDS.JUNGLE_SOIL,
      deepVoxel: VOXEL_IDS.BEDROCK
    },
    [BIOMES.DESERT]: {
      height: { base: 0.6, amplitude: 0.45, frequency: 2.4, detailAmplitude: 0.2, detailFrequency: 7 },
      surfaceDepth: 0.45,
      subSurfaceDepth: 1.2,
      surfaceVoxel: VOXEL_IDS.DESERT_SAND,
      subSurfaceVoxel: VOXEL_IDS.DESERT_ROCK,
      deepVoxel: VOXEL_IDS.BEDROCK
    }
  };

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function mixNoise(noiseFn, x, y, scale) {
    const factor = Number.isFinite(scale) && scale !== 0 ? scale : 1;
    return noiseFn(x * factor, y * factor) * 2 - 1;
  }

  function blendBiomes(value, thresholds) {
    const { desert, jungle, blend } = thresholds;
    if (value <= desert - blend) return { biome: BIOMES.DESERT, influence: 1 };
    if (value >= jungle + blend) return { biome: BIOMES.MOUNTAIN, influence: 1 };
    if (value >= desert + blend && value <= jungle - blend) {
      return { biome: BIOMES.JUNGLE, influence: 1 };
    }
    if (value < desert + blend) {
      const t = clamp01((value - (desert - blend)) / (2 * blend));
      return { biome: BIOMES.DESERT, next: BIOMES.JUNGLE, mix: t };
    }
    const t = clamp01((value - (jungle - blend)) / (2 * blend));
    return { biome: BIOMES.JUNGLE, next: BIOMES.MOUNTAIN, mix: t };
  }

  function createSampler(options = {}) {
    const seed = Number.isFinite(options.seed) ? (options.seed >>> 0) : DEFAULT_SEED;
    const worldSize = Number.isFinite(options.worldSize) ? Math.max(1, options.worldSize) : DEFAULT_WORLD_SIZE;
    const voxelSize = Number.isFinite(options.voxelSize) && options.voxelSize > 0 ? options.voxelSize : DEFAULT_VOXEL_SIZE;
    const maxHeight = Number.isFinite(options.maxHeight) && options.maxHeight > 0 ? options.maxHeight : 3;
    const requestedScale = Number.isFinite(options.biomeScale) && options.biomeScale > 0
      ? options.biomeScale
      : (Number.isFinite(options.biomeFrequency) && options.biomeFrequency > 0
        ? options.biomeFrequency
        : null);
    const biomeScale = requestedScale || 3.2;
    const thresholds = {
      desert: options.desertThreshold ?? 0.3,
      jungle: options.jungleThreshold ?? 0.62,
      blend: options.blendBand ?? 0.06
    };

    const biomeNoise = createValueNoise2D(seed ^ 0x9e3779b9);
    const heightNoise = createValueNoise2D(seed ^ 0x7f4a7c15);
    const detailNoise = createValueNoise2D(seed ^ 0x12c8b3);

    function sampleColumn(x, z) {
      const nx = x / worldSize;
      const nz = z / worldSize;
      const biomeValue = biomeNoise(nx * biomeScale, nz * biomeScale);
      const blend = blendBiomes(biomeValue, thresholds);
      const primary = BIOME_PARAMS[blend.biome] || BIOME_PARAMS[BIOMES.JUNGLE];
      let params = primary;
      if (blend.next != null && blend.mix != null) {
        const secondary = BIOME_PARAMS[blend.next] || primary;
        const mix = clamp01(blend.mix);
        const inv = 1 - mix;
        params = {
          height: {
            base: primary.height.base * inv + secondary.height.base * mix,
            amplitude: primary.height.amplitude * inv + secondary.height.amplitude * mix,
            frequency: primary.height.frequency * inv + secondary.height.frequency * mix,
            detailAmplitude: primary.height.detailAmplitude * inv + secondary.height.detailAmplitude * mix,
            detailFrequency: primary.height.detailFrequency * inv + secondary.height.detailFrequency * mix
          },
          surfaceDepth: primary.surfaceDepth * inv + secondary.surfaceDepth * mix,
          subSurfaceDepth: primary.subSurfaceDepth * inv + secondary.subSurfaceDepth * mix,
          surfaceVoxel: mix > 0.5 ? secondary.surfaceVoxel : primary.surfaceVoxel,
          subSurfaceVoxel: mix > 0.5 ? secondary.subSurfaceVoxel : primary.subSurfaceVoxel,
          deepVoxel: mix > 0.5 ? secondary.deepVoxel : primary.deepVoxel
        };
      }
      const hMain = mixNoise(heightNoise, nx, nz, params.height.frequency);
      const hDetail = mixNoise(detailNoise, nx, nz, params.height.detailFrequency);
      const height = clamp01(params.height.base + hMain * params.height.amplitude + hDetail * params.height.detailAmplitude) * maxHeight;
      return {
        biome: blend.biome,
        height,
        params
      };
    }

    function voxelForColumn(column, y, unitHeight) {
      if (!column || !column.params) return VOXEL_IDS.AIR;
      const height = column.height;
      if (y > height + 1e-3) return VOXEL_IDS.AIR;
      const depth = height - y;
      if (depth <= column.params.surfaceDepth) return column.params.surfaceVoxel;
      if (depth <= column.params.subSurfaceDepth) return column.params.subSurfaceVoxel;
      return column.params.deepVoxel;
    }

    return {
      sampleColumn,
      getHeight(x, z) {
        return sampleColumn(x, z).height;
      },
      getVoxelAt(x, y, z) {
        return voxelForColumn(sampleColumn(x, z), y, voxelSize);
      },
      getVoxelForColumn: voxelForColumn,
      serialize() {
        return {
          seed,
          worldSize,
          voxelSize,
          maxHeight,
          biomeScale,
          desertThreshold: thresholds.desert,
          jungleThreshold: thresholds.jungle,
          blendBand: thresholds.blend
        };
      },
      maxHeight,
      voxelSize
    };
  }

  const api = {
    BIOMES,
    VOXEL_IDS,
    createSampler,
    getAtlasSwatches() {
      return EXTRA_ATLAS_SWATCHES.slice();
    },
    getVoxelForColumn(column, y, unitHeight) {
      if (!column) return VOXEL_IDS.AIR;
      return column && column.params
        ? (y > column.height + 1e-3
          ? VOXEL_IDS.AIR
          : (column.height - y <= column.params.surfaceDepth
            ? column.params.surfaceVoxel
            : (column.height - y <= column.params.subSurfaceDepth
              ? column.params.subSurfaceVoxel
              : column.params.deepVoxel)))
        : VOXEL_IDS.AIR;
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.TerrainBiomes = api;
})(typeof self !== "undefined" ? self : globalThis);
