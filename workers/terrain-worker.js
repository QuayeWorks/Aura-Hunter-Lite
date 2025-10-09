const ctx = self;
try {
  if (typeof importScripts === 'function') {
    importScripts('../terrain/biomes.js');
  }
} catch (err) {
  // ignore loading errors; fallback paths remain available
}
const TerrainBiomesWorker = typeof self !== 'undefined' ? (self.TerrainBiomes || null) : null;

function toUint32Array(source) {
  if (!source) return null;
  if (source instanceof Uint32Array) return source;
  if (Array.isArray(source)) {
    return Uint32Array.from(source.map((value) => value >>> 0));
  }
  if (ArrayBuffer.isView(source)) {
    return new Uint32Array(source.buffer.slice(0));
  }
  if (source instanceof ArrayBuffer) {
    return new Uint32Array(source.slice(0));
  }
  return null;
}

function toFloat32Array(source, fallbackLength = 0) {
  if (!source) return new Float32Array(fallbackLength);
  if (source instanceof Float32Array) return source;
  if (Array.isArray(source)) return Float32Array.from(source.map(Number));
  if (ArrayBuffer.isView(source)) return new Float32Array(source.buffer.slice(0));
  if (source instanceof ArrayBuffer) return new Float32Array(source.slice(0));
  return new Float32Array(fallbackLength);
}

function toFloat32Array(source, fallbackLength = 0) {
  if (!source) return new Float32Array(fallbackLength);
  if (source instanceof Float32Array) return source;
  if (Array.isArray(source)) return Float32Array.from(source.map(Number));
  if (ArrayBuffer.isView(source)) return new Float32Array(source.buffer.slice(0));
  if (source instanceof ArrayBuffer) return new Float32Array(source.slice(0));
  return new Float32Array(fallbackLength);
}

function resolveDimensions(size, voxelCount) {
  if (Array.isArray(size) && size.length >= 3) {
    const [x = 0, y = 0, z = 0] = size;
    if (x && y && z) return [x | 0, y | 0, z | 0];
  }
  if (size && typeof size === 'object') {
    const x = Number.isFinite(size.x) ? size.x | 0 : 0;
    const y = Number.isFinite(size.y) ? size.y | 0 : 0;
    const z = Number.isFinite(size.z) ? size.z | 0 : 0;
    if (x && y && z) return [x, y, z];
    if (Array.isArray(size.dimensions) && size.dimensions.length >= 3) {
      const [dx = 0, dy = 0, dz = 0] = size.dimensions;
      if (dx && dy && dz) return [dx | 0, dy | 0, dz | 0];
    }
  }
  if (Number.isFinite(size)) {
    const value = Math.max(1, size | 0);
    return [value, value, value];
  }
  if (voxelCount > 0) {
    const cube = Math.max(1, Math.round(Math.pow(voxelCount, 1 / 3)));
    const inferred = cube * cube * cube === voxelCount ? cube : cube;
    return [inferred, inferred, inferred];
  }
  return [0, 0, 0];
}

function createAccessor(voxels, dims) {
  const [sx, sy, sz] = dims;
  const strideX = 1;
  const strideY = sx;
  const strideZ = sx * sy;

  return function getVoxel(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) {
      return 0;
    }
    const idx = x * strideX + y * strideY + z * strideZ;
    return voxels[idx] || 0;
  };
}

// Use Uint32 for indices by default to avoid 16-bit overflow.
function createDynamicBuffer(Type, initialCapacity = 1024) {
  let capacity = Math.max(1, initialCapacity | 0);
  let buffer = new Type(capacity);
  let length = 0;

  function ensure(additional) {
    const needed = length + additional;
    if (needed <= capacity) return;
    let next = capacity;
    while (next < needed) {
      next = Math.max(next * 2, needed);
    }
    const nextBuffer = new Type(next);
    nextBuffer.set(buffer.subarray(0, length), 0);
    buffer = nextBuffer;
    capacity = next;
  }

  return {
    push(values) {
      const arr = Array.isArray(values) ? values : [values];
      ensure(arr.length);
      buffer.set(arr, length);
      length += arr.length;
    },
    push3(a, b, c) {
      ensure(3);
      buffer[length++] = a;
      buffer[length++] = b;
      buffer[length++] = c;
    },
    push2(a, b) {
      ensure(2);
      buffer[length++] = a;
      buffer[length++] = b;
    },
    pushIndexQuad(base) {
      ensure(6);
      buffer[length++] = base;
      buffer[length++] = base + 1;
      buffer[length++] = base + 2;
      buffer[length++] = base;
      buffer[length++] = base + 2;
      buffer[length++] = base + 3;
    },
    get length() {
      return length;
    },
    slice() {
      return new Type(buffer.buffer.slice(0, length * Type.BYTES_PER_ELEMENT));
    }
  };
}

function normalizeRect(rect) {
  if (!rect || typeof rect !== 'object') {
    return { u0: 0, v0: 0, u1: 1, v1: 1 };
  }
  if (Array.isArray(rect) && rect.length >= 4) {
    return { u0: Number(rect[0]) || 0, v0: Number(rect[1]) || 0, u1: Number(rect[2]) || 1, v1: Number(rect[3]) || 1 };
  }
  const u0 = Number(rect.u0 ?? rect.x0 ?? rect.minU ?? 0);
  const v0 = Number(rect.v0 ?? rect.y0 ?? rect.minV ?? 0);
  const u1 = Number(rect.u1 ?? rect.x1 ?? rect.maxU ?? 1);
  const v1 = Number(rect.v1 ?? rect.y1 ?? rect.maxV ?? 1);
  return { u0, v0, u1, v1 };
}

function getAtlasRect(atlasRects, value) {
  if (!Array.isArray(atlasRects) || atlasRects.length === 0) {
    return { u0: 0, v0: 0, u1: 1, v1: 1 };
  }
  const raw = Number.isFinite(value) ? value >>> 0 : 0;
  const index = raw > 0 ? raw - 1 : 0;
  const rect = atlasRects[index] ?? atlasRects[0];
  return normalizeRect(rect);
}

function greedyMesh(voxels, dims, scale, atlasRects) {
  const getVoxel = createAccessor(voxels, dims);
  const [sx, sy, sz] = dims;
  const dimensions = [sx, sy, sz];
  const positions = createDynamicBuffer(Float32Array, 1024);
  const normals = createDynamicBuffer(Float32Array, 1024);
  const uvs = createDynamicBuffer(Float32Array, 1024);
  const indices = createDynamicBuffer(Uint32Array, 1024);

  let quadCount = 0;
  let triangleCount = 0;

  const q = [0, 0, 0];
  const x = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const dimU = dimensions[u];
    const dimV = dimensions[v];
    const dimD = dimensions[d];
    if (!dimU || !dimV || !dimD) continue;

    const mask = new Int32Array(dimU * dimV);
    q[0] = q[1] = q[2] = 0;
    q[d] = 1;

    for (x[d] = -1; x[d] < dimD;) {
      let n = 0;
      for (x[v] = 0; x[v] < dimV; x[v]++) {
        for (x[u] = 0; x[u] < dimU; x[u]++) {
          const a = x[d] >= 0 ? getVoxel(x[0], x[1], x[2]) : 0;
          const b = x[d] < dimD - 1 ? getVoxel(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;
          if ((a !== 0) === (b !== 0)) {
            mask[n++] = 0;
          } else if (a) {
            mask[n++] = a;
          } else {
            mask[n++] = -b;
          }
        }
      }

      x[d]++;
      n = 0;

      for (let j = 0; j < dimV; j++) {
        for (let i = 0; i < dimU;) {
          const id = mask[n];
          if (id === 0) {
            i++;
            n++;
            continue;
          }

          let width = 1;
          while (i + width < dimU && mask[n + width] === id) {
            width++;
          }

          let height = 1;
          outer: for (; j + height < dimV; height++) {
            for (let k = 0; k < width; k++) {
              if (mask[n + k + height * dimU] !== id) {
                break outer;
              }
            }
          }

          for (let jj = 0; jj < height; jj++) {
            for (let kk = 0; kk < width; kk++) {
              mask[n + kk + jj * dimU] = 0;
            }
          }

          const sign = id > 0 ? 1 : -1;
          const blockValue = sign > 0 ? id : -id;
          const rect = getAtlasRect(atlasRects, blockValue);

          const base = [x[0], x[1], x[2]];
          base[u] = i;
          base[v] = j;
          if (sign > 0) {
            base[d] = x[d];
          } else {
            base[d] = x[d] - 1;
          }

          const du = [0, 0, 0];
          const dv = [0, 0, 0];
          du[u] = width;
          dv[v] = height;

          const normal = [0, 0, 0];
          normal[d] = sign;

          // Keep UVs within atlas rect (do NOT scale by quad w/h). With CLAMP,
          // scaling beyond the rect turns the whole quad into the edge color (often black).
          // Add a tiny inset to avoid bleeding across tiles.
          const padU = (rect.u1 - rect.u0) * 0.001;
          const padV = (rect.v1 - rect.v0) * 0.001;
          const u0 = rect.u0 + padU, v0 = rect.v0 + padV;
          const u1 = rect.u1 - padU, v1 = rect.v1 - padV;

          const corners = [
            [base[0], base[1], base[2]],
            [base[0] + du[0], base[1] + du[1], base[2] + du[2]],
            [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]],
            [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]]
          ];

          const uvCorners = [
            [u0, v0],
            [u1, v0],
            [u1, v1],
            [u0, v1]
          ];
          
          //const order = sign > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
          const baseIndex = (positions.length / 3) | 0;
          // Optional: skip faces on +X/+Z borders to avoid duplicate border faces when neighboring chunk also draws them.
          if ((d === 0 || d === 2) && sign > 0 && x[d] === dimensions[d] - 1) {
            // we’re at +X or +Z outer edge; let the neighbor draw this face
            // (world-edge will have no neighbor but remains closed by -X/-Z faces)
            continue;
          }
          const order = sign > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
          for (let idx = 0; idx < 4; idx++) {
            const cornerIndex = order[idx];
            const corner = corners[cornerIndex];
            const uv = uvCorners[cornerIndex];
            positions.push3(corner[0] * scale, corner[1] * scale, corner[2] * scale);
            normals.push3(normal[0], normal[1], normal[2]);
            uvs.push2(uv[0], uv[1]);
          }

          indices.pushIndexQuad(baseIndex);
          quadCount++;
          triangleCount += 2;

          i += width;
          n += width;
        }
      }
    }
  }

  return {
    positions: positions.slice(),
    normals: normals.slice(),
    uvs: uvs.slice(),
    indices: indices.slice(),
    quadCount,
    triangleCount,
    vertexCount: (positions.length / 3) | 0
  };
}

// workers/terrain-worker.js  — replace ONLY the onmessage block with this:

function buildBiomeChunk(payload, atlasRects, scale) {
  if (!TerrainBiomesWorker?.createSampler) return null;
  const config = payload?.biome?.config;
  if (!config) return null;
  const sampler = TerrainBiomesWorker.createSampler(config);
  if (!sampler) return null;
  const w = payload.spanX | 0;
  const d = payload.spanZ | 0;
  if (!w || !d) return null;
  const chunkHeight = Math.max(1, payload.biome?.chunkHeight | 0);
  const voxels = new Uint32Array(w * chunkHeight * d);
  const indices = payload.indices || [];
  const colsX = payload.colsX | 0;
  const halfX = Number(payload.halfX) || 0;
  const halfZ = Number(payload.halfZ) || 0;
  let cursor = 0;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const rawIndex = indices[cursor];
      const columnIndex = rawIndex != null ? (rawIndex >>> 0) : cursor;
      const gridX = colsX > 0 ? (columnIndex % colsX) : x;
      const gridZ = colsX > 0 ? Math.floor(columnIndex / colsX) : z;
      const worldX = -halfX + (gridX + 0.5) * scale;
      const worldZ = -halfZ + (gridZ + 0.5) * scale;
      const column = sampler.sampleColumn(worldX, worldZ);
      const columnBase = x + z * w * chunkHeight;
      for (let y = 0; y < chunkHeight; y++) {
        const worldY = y * scale;
        const voxel = TerrainBiomesWorker.getVoxelForColumn(column, worldY, scale);
        if (voxel) {
          voxels[columnBase + y * w] = voxel >>> 0;
        }
      }
      cursor++;
    }
  }
  return greedyMesh(voxels, [w, chunkHeight, d], scale, atlasRects);
}

ctx.addEventListener('message', (event) => {
  const data = event?.data || {};
  const { jobId, payload } = data;
  if (typeof jobId !== 'number') return;

  try {
    const p = payload || {};
    const atlasRects = p.atlasRects || [];
    const scale = Number.isFinite(p.scale) && p.scale > 0 ? p.scale : 1;

    let geometry = null;

    if (TerrainBiomesWorker && p.biome && p.indices && (p.spanX | 0) && (p.spanZ | 0)) {
      geometry = buildBiomeChunk(p, atlasRects, scale);
    }

    if (!geometry && p.indices && (p.spanX | 0) && (p.spanZ | 0)) {
      // NEW SCHEMA: indices/spanX/spanZ/layers/offsets/thicknesses/heights
      const w = p.spanX | 0;
      const d = p.spanZ | 0;
      let layers = p.layers | 0;
      let offs = Array.isArray(p.layerOffsets) ? p.layerOffsets : [];
      let thick = Array.isArray(p.layerThicknesses) ? p.layerThicknesses : [];
      if (!layers) layers = Math.max(offs.length, thick.length) || 1;
      if (offs.length < layers) offs = offs.concat(new Array(layers - offs.length).fill(0));
      if (thick.length < layers) thick = thick.concat(new Array(layers - thick.length).fill(1));
      if (!w || !d || !layers) throw new Error('Invalid span/layer dims');

      const heights = toFloat32Array(p.heights, w * d);

      // Build column → voxel volume (w × layers × d)
      const voxels = new Uint32Array(w * layers * d);
      const strideX = 1, strideY = w, strideZ = w * layers;
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          const hi = z * w + x;
        const hWorld = heights[hi] || 0;
        // Fallback: if thresholds aren’t meaningful, treat height as number of cubes.
        const heightLayers = Math.max(0, Math.floor(hWorld / (scale || 1)));
        for (let y = 0; y < layers; y++) {
          let solid = 0;
          if (offs.length && thick.length) {
            const base = offs[y] || 0;
            const top  = base + (thick[y] || 0);
            // Fill the layer if our height reaches that layer's top.
            solid = hWorld >= top ? (y + 1) : 0;
          } else {
            solid = (y < heightLayers) ? 1 : 0;
          }
          if (solid) {
            const idx = x * strideX + y * strideY + z * strideZ;
            voxels[idx] = solid;
          }
         }
        }
      }
      geometry = greedyMesh(voxels, [w, layers, d], scale, atlasRects);

    } else {
      // OLD SCHEMA: chunkVoxels + chunkSize
      const voxels = toUint32Array(p.chunkVoxels) || new Uint32Array(0);
      const dims = resolveDimensions(p.chunkSize || 0, voxels.length);
      if (!dims[0] || !dims[1] || !dims[2]) throw new Error('Invalid chunk dimensions');
      geometry = greedyMesh(voxels, dims, scale, atlasRects);
    }

    const transfer = [
      geometry.positions.buffer,
      geometry.normals.buffer,
      geometry.uvs.buffer,
      geometry.indices.buffer
    ];

    // <-- use a different variable name to avoid any duplicate const
    const out = { ...geometry };
    ctx.postMessage({ jobId, result: out }, transfer);

  } catch (err) {
    const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
    ctx.postMessage({ jobId, error: message });
  }
});
