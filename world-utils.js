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

  const FACE_DEFINITIONS = {
    px: { name: "px", axis: 0, dir: 1, uAxis: 1, vAxis: 2, normal: [1, 0, 0] },
    nx: { name: "nx", axis: 0, dir: -1, uAxis: 1, vAxis: 2, normal: [-1, 0, 0] },
    py: { name: "py", axis: 1, dir: 1, uAxis: 0, vAxis: 2, normal: [0, 1, 0] },
    ny: { name: "ny", axis: 1, dir: -1, uAxis: 0, vAxis: 2, normal: [0, -1, 0] },
    pz: { name: "pz", axis: 2, dir: 1, uAxis: 0, vAxis: 1, normal: [0, 0, 1] },
    nz: { name: "nz", axis: 2, dir: -1, uAxis: 0, vAxis: 1, normal: [0, 0, -1] }
  };

  const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"];

  function resolveDimensions(blockData) {
    if (!blockData || typeof blockData !== "object") {
      throw new Error("buildChunkMesh requires a blockData object");
    }
    if (Array.isArray(blockData.size)) {
      const [x = 0, y = 0, z = 0] = blockData.size;
      return [x | 0, y | 0, z | 0];
    }
    if (Array.isArray(blockData.dimensions)) {
      const [x = 0, y = 0, z = 0] = blockData.dimensions;
      return [x | 0, y | 0, z | 0];
    }
    if (blockData.size && typeof blockData.size === "object") {
      const { x = 0, y = 0, z = 0 } = blockData.size;
      return [x | 0, y | 0, z | 0];
    }
    if (blockData.dimensions && typeof blockData.dimensions === "object") {
      const { x = 0, y = 0, z = 0 } = blockData.dimensions;
      return [x | 0, y | 0, z | 0];
    }
    if (typeof blockData.width === "number" && typeof blockData.height === "number" && typeof blockData.depth === "number") {
      return [blockData.width | 0, blockData.height | 0, blockData.depth | 0];
    }
    throw new Error("buildChunkMesh could not infer chunk dimensions");
  }

  function getBlockAccessor(blockData, dims) {
    if (typeof blockData.getBlock === "function") {
      return (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2])
        ? null
        : blockData.getBlock(x, y, z);
    }
    if (typeof blockData.get === "function") {
      return (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2])
        ? null
        : blockData.get(x, y, z);
    }
    const arrays = [blockData.blocks, blockData.data, blockData.voxels];
    for (const arr of arrays) {
      if (Array.isArray(arr) || ArrayBuffer.isView(arr)) {
        const strideX = 1;
        const strideY = dims[0];
        const strideZ = dims[0] * dims[1];
        return (x, y, z) => {
          if (x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2]) return null;
          const idx = x * strideX + y * strideY + z * strideZ;
          return arr[idx] ?? null;
        };
      }
    }
    throw new Error("buildChunkMesh requires a getBlock function or blocks array");
  }

  function isRenderableBlock(block) {
    if (!block) return false;
    if (block.type === "air" || block.id === 0) return false;
    if (block.render === false || block.invisible === true) return false;
    return true;
  }

  function isOpaque(block) {
    if (!block) return false;
    if (block.opaque === false) return false;
    if (block.transparent === true) return false;
    if (typeof block.alpha === "number" && block.alpha < 1) return false;
    return true;
  }

  function getFaceDescriptor(block, face) {
    const faceLower = face.toLowerCase();
    let source = null;
    if (block.faces && (block.faces[faceLower] || block.faces[face])) {
      source = block.faces[faceLower] || block.faces[face];
    } else if (block.faceUV && (block.faceUV[faceLower] || block.faceUV[face])) {
      source = block.faceUV[faceLower] || block.faceUV[face];
    } else if (block.uv && (block.uv[faceLower] || block.uv[face])) {
      source = block.uv[faceLower] || block.uv[face];
    } else if (block.uvs && (block.uvs[faceLower] || block.uvs[face])) {
      source = block.uvs[faceLower] || block.uvs[face];
    } else if (block.textures && (block.textures[faceLower] || block.textures[face])) {
      source = block.textures[faceLower] || block.textures[face];
    } else if (block.texture && typeof block.texture === "object") {
      source = block.texture[faceLower] || block.texture[face] || block.texture;
    }

    const descriptor = {
      material: block.materialId ?? block.material ?? null,
      uv: [0, 0, 1, 1],
      color: null
    };

    if (source) {
      if (Array.isArray(source)) {
        if (source.length >= 4) {
          descriptor.uv = source.slice(0, 4).map((v) => Number(v));
        } else if (source.length === 2) {
          descriptor.uv = [source[0], source[1], source[0] + 1, source[1] + 1];
        }
      } else if (typeof source === "object") {
        if (Array.isArray(source.uv) && source.uv.length >= 4) {
          descriptor.uv = source.uv.slice(0, 4).map((v) => Number(v));
        }
        if (source.material != null) {
          descriptor.material = source.material;
        } else if (source.materialId != null) {
          descriptor.material = source.materialId;
        }
        if (Array.isArray(source.color) && source.color.length >= 3) {
          const [r, g, b, a = 1] = source.color;
          descriptor.color = [Number(r), Number(g), Number(b), Number(a)];
        }
      } else if (typeof source === "string") {
        descriptor.material = source;
      }
    }

    if (!descriptor.color && Array.isArray(block.color)) {
      const [r, g, b, a = 1] = block.color;
      descriptor.color = [Number(r), Number(g), Number(b), Number(a)];
    }

    return descriptor;
  }

  function faceKey(face, descriptor) {
    const parts = [face];
    if (descriptor.material != null) parts.push(`m:${descriptor.material}`);
    if (descriptor.uv) parts.push(`uv:${descriptor.uv.map((v) => Number(v).toFixed(6)).join(",")}`);
    if (descriptor.color) parts.push(`c:${descriptor.color.map((v) => Number(v).toFixed(6)).join(",")}`);
    return parts.join("|");
  }

  function pushQuad(target, face, base, sizeU, sizeV, descriptor) {
    const def = FACE_DEFINITIONS[face];
    const { positions, normals, uvs, indices, colors, materials, quadMetadata, bounds } = target;
    const indexBase = positions.length / 3;
    const [x, y, z] = base;
    const normal = def.normal;
    const color = descriptor.color;
    const uvRange = descriptor.uv || [0, 0, 1, 1];
    const du = uvRange[2] - uvRange[0];
    const dv = uvRange[3] - uvRange[1];
    const uMin = uvRange[0];
    const vMin = uvRange[1];
    const uMax = uMin + du * sizeU;
    const vMax = vMin + dv * sizeV;

    function addVertex(px, py, pz, u, v) {
      positions.push(px, py, pz);
      normals.push(normal[0], normal[1], normal[2]);
      uvs.push(u, v);
      if (color) {
        colors.push(color[0], color[1], color[2], color[3] ?? 1);
      }
      bounds.min[0] = Math.min(bounds.min[0], px);
      bounds.min[1] = Math.min(bounds.min[1], py);
      bounds.min[2] = Math.min(bounds.min[2], pz);
      bounds.max[0] = Math.max(bounds.max[0], px);
      bounds.max[1] = Math.max(bounds.max[1], py);
      bounds.max[2] = Math.max(bounds.max[2], pz);
    }

    switch (face) {
      case "px": {
        addVertex(x + 1, y, z, uMin, vMin);
        addVertex(x + 1, y + sizeU, z, uMax, vMin);
        addVertex(x + 1, y + sizeU, z + sizeV, uMax, vMax);
        addVertex(x + 1, y, z + sizeV, uMin, vMax);
        break;
      }
      case "nx": {
        addVertex(x, y, z + sizeV, uMin, vMax);
        addVertex(x, y + sizeU, z + sizeV, uMax, vMax);
        addVertex(x, y + sizeU, z, uMax, vMin);
        addVertex(x, y, z, uMin, vMin);
        break;
      }
      case "py": {
        addVertex(x, y + 1, z, uMin, vMin);
        addVertex(x + sizeU, y + 1, z, uMax, vMin);
        addVertex(x + sizeU, y + 1, z + sizeV, uMax, vMax);
        addVertex(x, y + 1, z + sizeV, uMin, vMax);
        break;
      }
      case "ny": {
        addVertex(x, y, z + sizeV, uMin, vMax);
        addVertex(x + sizeU, y, z + sizeV, uMax, vMax);
        addVertex(x + sizeU, y, z, uMax, vMin);
        addVertex(x, y, z, uMin, vMin);
        break;
      }
      case "pz": {
        addVertex(x, y, z + 1, uMin, vMin);
        addVertex(x + sizeU, y, z + 1, uMax, vMin);
        addVertex(x + sizeU, y + sizeV, z + 1, uMax, vMax);
        addVertex(x, y + sizeV, z + 1, uMin, vMax);
        break;
      }
      case "nz": {
        addVertex(x, y + sizeV, z, uMin, vMax);
        addVertex(x + sizeU, y + sizeV, z, uMax, vMax);
        addVertex(x + sizeU, y, z, uMax, vMin);
        addVertex(x, y, z, uMin, vMin);
        break;
      }
      default:
        return;
    }

    indices.push(indexBase, indexBase + 1, indexBase + 2, indexBase, indexBase + 2, indexBase + 3);
    materials.push(descriptor.material ?? null);
    quadMetadata.push({ face, size: [sizeU, sizeV], uv: descriptor.uv, material: descriptor.material });
    target.quadCount += 1;
    target.triangleCount += 2;
  }

  function makeFaceEntry(face, x, y, z, block) {
    const descriptor = getFaceDescriptor(block, face);
    return {
      face,
      descriptor,
      key: faceKey(face, descriptor),
      base: [x, y, z]
    };
  }

  function tryEmitFace(target, opts, face, block, neighbor, x, y, z) {
    if (!isRenderableBlock(block)) return;
    if (opts.faceCulling && isOpaque(neighbor)) return;
    const entry = makeFaceEntry(face, x, y, z, block);
    pushQuad(target, face, entry.base, 1, 1, entry.descriptor);
  }

  function greedyForFace(target, opts, face, dims, getBlockFn) {
    const def = FACE_DEFINITIONS[face];
    const axis = def.axis;
    const dir = def.dir;
    const uAxis = def.uAxis;
    const vAxis = def.vAxis;
    const mainLimit = dims[axis];
    const uLimit = dims[uAxis];
    const vLimit = dims[vAxis];
    const mask = new Array(uLimit * vLimit);
    const delta = [0, 0, 0];
    delta[axis] = dir;

    for (let main = 0; main < mainLimit; main++) {
      mask.fill(null);
      for (let u = 0; u < uLimit; u++) {
        for (let v = 0; v < vLimit; v++) {
          const coords = [0, 0, 0];
          coords[axis] = main;
          coords[uAxis] = u;
          coords[vAxis] = v;
          const block = getBlockFn(coords[0], coords[1], coords[2]);
          if (!isRenderableBlock(block)) continue;
          const neighbor = getBlockFn(coords[0] + delta[0], coords[1] + delta[1], coords[2] + delta[2]);
          if (opts.faceCulling && isOpaque(neighbor)) continue;
          mask[u * vLimit + v] = makeFaceEntry(face, coords[0], coords[1], coords[2], block);
        }
      }

      for (let u = 0; u < uLimit; u++) {
        for (let v = 0; v < vLimit; ) {
          const entry = mask[u * vLimit + v];
          if (!entry) {
            v += 1;
            continue;
          }

          let vSpan = 1;
          while (v + vSpan < vLimit) {
            const next = mask[u * vLimit + v + vSpan];
            if (!next || next.key !== entry.key) break;
            vSpan += 1;
          }

          let uSpan = 1;
          outer: for (; u + uSpan < uLimit; uSpan++) {
            for (let dv = 0; dv < vSpan; dv++) {
              const next = mask[(u + uSpan) * vLimit + v + dv];
              if (!next || next.key !== entry.key) {
                break outer;
              }
            }
          }

          for (let du = 0; du < uSpan; du++) {
            for (let dv = 0; dv < vSpan; dv++) {
              mask[(u + du) * vLimit + v + dv] = null;
            }
          }

          const base = entry.base.slice();
          base[uAxis] = entry.base[uAxis] + (u - entry.base[uAxis]);
          base[vAxis] = entry.base[vAxis] + (v - entry.base[vAxis]);

          pushQuad(target, face, base, uSpan, vSpan, entry.descriptor);
          v += vSpan;
        }
      }
    }
  }

  function buildChunkMesh(blockData, opts = {}) {
    const options = {
      faceCulling: true,
      greedy: false,
      ...opts
    };

    const dims = resolveDimensions(blockData);
    const getBlockFn = getBlockAccessor(blockData, dims);

    const target = {
      positions: [],
      normals: [],
      uvs: [],
      indices: [],
      colors: [],
      materials: [],
      quadMetadata: [],
      quadCount: 0,
      triangleCount: 0,
      bounds: {
        min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
        max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
      }
    };

    if (options.greedy) {
      for (const face of FACE_ORDER) {
        greedyForFace(target, options, face, dims, getBlockFn);
      }
    } else {
      for (let x = 0; x < dims[0]; x++) {
        for (let y = 0; y < dims[1]; y++) {
          for (let z = 0; z < dims[2]; z++) {
            const block = getBlockFn(x, y, z);
            if (!isRenderableBlock(block)) continue;

            const neighborXPlus = getBlockFn(x + 1, y, z);
            const neighborXMinus = getBlockFn(x - 1, y, z);
            const neighborYPlus = getBlockFn(x, y + 1, z);
            const neighborYMinus = getBlockFn(x, y - 1, z);
            const neighborZPlus = getBlockFn(x, y, z + 1);
            const neighborZMinus = getBlockFn(x, y, z - 1);

            tryEmitFace(target, options, "px", block, neighborXPlus, x, y, z);
            tryEmitFace(target, options, "nx", block, neighborXMinus, x, y, z);
            tryEmitFace(target, options, "py", block, neighborYPlus, x, y, z);
            tryEmitFace(target, options, "ny", block, neighborYMinus, x, y, z);
            tryEmitFace(target, options, "pz", block, neighborZPlus, x, y, z);
            tryEmitFace(target, options, "nz", block, neighborZMinus, x, y, z);
          }
        }
      }
    }

    const hasColors = target.colors.length > 0;
    const hasMetadata = target.quadMetadata.length > 0;
    const hasMaterials = target.materials.some((m) => m != null);

    const min = target.bounds.min.map((v) => (Number.isFinite(v) ? v : 0));
    const max = target.bounds.max.map((v) => (Number.isFinite(v) ? v : 0));

    const result = {
      positions: target.positions,
      normals: target.normals,
      uvs: target.uvs,
      indices: target.indices,
      quadCount: target.quadCount,
      triangleCount: target.triangleCount,
      vertexCount: target.positions.length / 3,
      bounds: { min, max },
      dimensions: dims,
      options
    };

    if (hasColors) result.colors = target.colors;
    if (hasMaterials) result.materials = target.materials;
    if (hasMetadata) result.quadMetadata = target.quadMetadata;

    return result;
  }

  H.buildChunkMesh = buildChunkMesh;

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
    buildChunkMesh,
    GameSettings: window.GameSettings || H.GameSettings
  };
  window.WorldUtils = WorldUtils;
})();
