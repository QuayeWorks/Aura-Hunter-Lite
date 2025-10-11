/* terrain-worker.js — classic worker (not module) */
const ctx = self;

/* Optional: try to load biomes config if the file exists in the same folder.
   Fails gracefully if it’s not there. */
try {
  if (typeof importScripts === 'function') {
    try { importScripts('biomes.js'); } catch (_) {}
    try { importScripts('./biomes.js'); } catch (_) {}
  }
} catch (_) {}
const TerrainBiomesWorker = (self && self.TerrainBiomes) ? self.TerrainBiomes : null;

/* ---------- small helpers ---------- */

function toUint32Array(source) {
  if (!source) return null;
  if (source instanceof Uint32Array) return source;
  if (Array.isArray(source)) return Uint32Array.from(source, v => v >>> 0);
  if (ArrayBuffer.isView(source)) return new Uint32Array(source.buffer.slice(0));
  if (source instanceof ArrayBuffer) return new Uint32Array(source.slice(0));
  return null;
}
function toFloat32Array(source, fallbackLength = 0) {
  if (!source) return new Float32Array(fallbackLength);
  if (source instanceof Float32Array) return source;
  if (Array.isArray(source)) return Float32Array.from(source, Number);
  if (ArrayBuffer.isView(source)) return new Float32Array(source.buffer.slice(0));
  if (source instanceof ArrayBuffer) return new Float32Array(source.slice(0));
  return new Float32Array(fallbackLength);
}
function createAccessor(voxels, dims) {
  const [sx, sy, sz] = dims, strideX = 1, strideY = sx, strideZ = sx * sy;
  return (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz)
    ? 0
    : (voxels[x * strideX + y * strideY + z * strideZ] || 0);
}
function createDynamicBuffer(Type, initialCapacity = 1024) {
  let capacity = Math.max(1, initialCapacity | 0);
  let buffer = new Type(capacity);
  let length = 0;
  function ensure(additional) {
    const need = length + additional;
    if (need <= capacity) return;
    let next = capacity;
    while (next < need) next = Math.max(next * 2, need);
    const nextBuf = new Type(next);
    nextBuf.set(buffer.subarray(0, length), 0);
    buffer = nextBuf;
    capacity = next;
  }
  return {
    push(values) {
      const arr = Array.isArray(values) ? values : [values];
      ensure(arr.length); buffer.set(arr, length); length += arr.length;
    },
    push3(a, b, c) { ensure(3); buffer[length++] = a; buffer[length++] = b; buffer[length++] = c; },
    push2(a, b)    { ensure(2); buffer[length++] = a; buffer[length++] = b; },
    pushIndexQuad(base) {
      ensure(6);
      buffer[length++] = base; buffer[length++] = base + 1; buffer[length++] = base + 2;
      buffer[length++] = base; buffer[length++] = base + 2; buffer[length++] = base + 3;
    },
    get length() { return length; },
    slice() { return new Type(buffer.buffer.slice(0, length * Type.BYTES_PER_ELEMENT)); }
  };
}
function normalizeRect(rect) {
  if (!rect || typeof rect !== 'object') return { u0: 0, v0: 0, u1: 1, v1: 1 };
  if (Array.isArray(rect) && rect.length >= 4) {
    return { u0: +rect[0] || 0, v0: +rect[1] || 0, u1: +rect[2] || 1, v1: +rect[3] || 1 };
  }
  const u0 = Number(rect.u0 ?? rect.x0 ?? rect.minU ?? 0);
  const v0 = Number(rect.v0 ?? rect.y0 ?? rect.minV ?? 0);
  const u1 = Number(rect.u1 ?? rect.x1 ?? rect.maxU ?? 1);
  const v1 = Number(rect.v1 ?? rect.y1 ?? rect.maxV ?? 1);
  return { u0, v0, u1, v1 };
}
function getAtlasRect(atlasRects, value) {
  if (!Array.isArray(atlasRects) || atlasRects.length === 0) return { u0: 0, v0: 0, u1: 1, v1: 1 };
  const raw = Number.isFinite(value) ? value >>> 0 : 0;
  const index = raw > 0 ? raw - 1 : 0;
  return normalizeRect(atlasRects[index] ?? atlasRects[0]);
}
/* cheap deterministic hash in [-1,1] */
function hash3n(x, y, z) {
  let n = (x | 0) * 73856093 ^ (y | 0) * 19349663 ^ (z | 0) * 83492791;
  n = (n << 13) ^ n;
  return 1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0;
}
function postResult(jobId, mesh) {
  const transfer = [];
  if (mesh?.positions?.buffer) transfer.push(mesh.positions.buffer);
  if (mesh?.normals?.buffer)   transfer.push(mesh.normals.buffer);
  if (mesh?.uvs?.buffer)       transfer.push(mesh.uvs.buffer);
  if (mesh?.indices?.buffer)   transfer.push(mesh.indices.buffer);
  try { ctx.postMessage({ jobId, result: mesh }, transfer); }
  catch { ctx.postMessage({ jobId, result: mesh }); }
}

/* ---------- meshing (SurfaceNets with material groups) ---------- */
function surfaceNetsMesh(field, mats, dims, iso, scale, atlasRects) {
  const [nx, ny, nz] = dims;
  const positions = [], normals = [], uvs = [], indices = [];
  const groups = new Map(); // materialId -> {count}
  const id = (x, y, z) => x + y * nx + z * nx * ny;

  // signs
  const sign = new Uint8Array(nx * ny * nz);
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++)
        sign[id(x, y, z)] = field[id(x, y, z)] >= iso ? 1 : 0;

  const vId = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const vid = (x, y, z) => x + y * (nx - 1) + z * (nx - 1) * (ny - 1);

  const vertexForCell = (x, y, z) => {
    const base = id(x, y, z);
    const mask =
      (sign[base]) |
      (sign[base + 1]) << 1 |
      (sign[base + nx]) << 2 |
      (sign[base + nx + 1]) << 3 |
      (sign[base + nx * ny]) << 4 |
      (sign[base + nx * ny + 1]) << 5 |
      (sign[base + nx * ny + nx]) << 6 |
      (sign[base + nx * ny + nx + 1]) << 7;

    if (mask === 0 || mask === 255) return -1;

    const gx = (field[id(x + 1, y, z)] - field[id(x - 1, y, z)]) * 0.5 || 0;
    const gy = (field[id(x, y + 1, z)] - field[id(x, y - 1, z)]) * 0.5 || 0;
    const gz = (field[id(x, y, z + 1)] - field[id(x, y, z - 1)]) * 0.5 || 0;
    const gn = Math.hypot(gx, gy, gz) || 1;

    const vx = (x + 0.5) * scale, vy = (y + 0.5) * scale, vz = (z + 0.5) * scale;
    const index = positions.length / 3;
    positions.push(vx, vy, vz);
    normals.push(gx / gn, gy / gn, gz / gn);

    // triplanar-ish UV (cheap)
    const ax = Math.abs(gx), ay = Math.abs(gy), az = Math.abs(gz);
    if (ax >= ay && ax >= az) uvs.push(vz, vy);
    else if (ay >= ax && ay >= az) uvs.push(vx, vz);
    else uvs.push(vx, vy);

    // pick dominant solid material (simple)
    const corners = [
      mats[base], mats[base + 1], mats[base + nx], mats[base + nx + 1],
      mats[base + nx * ny], mats[base + nx * ny + 1], mats[base + nx * ny + nx], mats[base + nx * ny + nx + 1]
    ];
    const counts = new Uint16Array(256); let mat = 0;
    for (let i = 0; i < 8; i++) if ((mask >> i) & 1) counts[corners[i]]++;
    for (let i = 0; i < 256; i++) if (counts[i] && counts[i] > counts[mat]) mat = i;
    if (!groups.has(mat)) groups.set(mat, { count: 0, materialId: mat });

    return index;
  };

  // generate vertex per cell
  for (let z = 1; z < nz - 1; z++)
    for (let y = 1; y < ny - 1; y++)
      for (let x = 1; x < nx - 1; x++)
        vId[vid(x, y, z)] = vertexForCell(x, y, z);

  // connect faces (+X, +Y, +Z)
  const pushFace = (a, b, c, d, mat) => {
    indices.push(a, b, c, a, c, d);
    const g = groups.get(mat); if (g) g.count += 6;
  };
  for (let z = 1; z < nz - 1; z++)
    for (let y = 1; y < ny - 1; y++)
      for (let x = 1; x < nx - 1; x++) {
        const s = sign[id(x, y, z)];
        if (sign[id(x + 1, y, z)] !== s) {
          const v00 = vId[vid(x, y, z)], v01 = vId[vid(x, y + 1, z)];
          const v10 = vId[vid(x, y, z + 1)], v11 = vId[vid(x, y + 1, z + 1)];
          if (v00 | v01 | v10 | v11) pushFace(v00, v10, v11, v01, s ? mats[id(x, y, z)] : mats[id(x + 1, y, z)]);
        }
        if (sign[id(x, y + 1, z)] !== s) {
          const v00 = vId[vid(x, y, z)], v01 = vId[vid(x, y, z + 1)];
          const v10 = vId[vid(x + 1, y, z)], v11 = vId[vid(x + 1, y, z + 1)];
          if (v00 | v01 | v10 | v11) pushFace(v00, v10, v11, v01, s ? mats[id(x, y, z)] : mats[id(x, y + 1, z)]);
        }
        if (sign[id(x, y, z + 1)] !== s) {
          const v00 = vId[vid(x, y, z)], v01 = vId[vid(x + 1, y, z)];
          const v10 = vId[vid(x, y + 1, z)], v11 = vId[vid(x + 1, y + 1, z)];
          if (v00 | v01 | v10 | v11) pushFace(v00, v10, v11, v01, s ? mats[id(x, y, z)] : mats[id(x, y, z + 1)]);
        }
      }

  const materialGroups = [];
  for (const [mat, g] of groups.entries()) if (g.count)
    materialGroups.push({ materialId: mat | 0, start: 0, count: g.count });

  return {
    positions: new Float32Array(positions),
    normals:   new Float32Array(normals),
    uvs:       new Float32Array(uvs),
    indices:   new Uint32Array(indices),
    groups: materialGroups,
    atlasRects
  };
}

/* ---------- optional biome-driven column sampler (used only if present) ---------- */
function buildBiomeChunk(payload, atlasRects, scale) {
  if (!TerrainBiomesWorker?.createSampler) return null;
  const config = payload?.biome?.config;
  if (!config) return null;
  const sampler = TerrainBiomesWorker.createSampler(config);
  if (!sampler) return null;

  const w = payload.spanX | 0, d = payload.spanZ | 0;
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
      const base = x + z * w * chunkHeight;
      for (let y = 0; y < chunkHeight; y++) {
        const worldY = y * scale;
        const voxel = TerrainBiomesWorker.getVoxelForColumn(column, worldY, scale);
        if (voxel) voxels[base + y * w] = voxel >>> 0;
      }
      cursor++;
    }
  }
  // You can also mesh this with greedyMesh if you keep blocky voxels.
  return surfaceNetsMesh(
    /*field*/ voxels, /*materials*/ voxels, [w, chunkHeight, d], 0.5, scale, atlasRects
  );
}

/* ---------- SINGLE message handler (fixes “unexpected end of input”) ---------- */
ctx.addEventListener('message', (event) => {
  const data = event?.data || {};
  const { jobId, payload } = data;
  if (typeof jobId !== 'number') return;

  try {
    // Expected payload shape:
    // { spanX, spanZ, scale, heights(Float32Array len=spanX*spanZ),
    //   layerOffsets[], layerThicknesses[], atlasRects[], flags,
    //   lod?:0..N, caves?:{amplitude,frequency,threshold}, biome?:{...}}
    const {
      spanX = 0, spanZ = 0, scale = 1,
      heights: heightsIn,
      layerOffsets = [], layerThicknesses = [],
      atlasRects = [],
      lod = 0,
      caves,
      biome
    } = payload || {};

    if (!spanX || !spanZ) throw new Error('Invalid span/layer dims');
    const heights = toFloat32Array(heightsIn, spanX * spanZ);
    if (heights.length !== spanX * spanZ) throw new Error('Bad heights length');

    // If a biome sampler was provided/loaded, you can short-circuit to that path.
    if (biome && TerrainBiomesWorker?.createSampler) {
      const mesh = buildBiomeChunk(payload, atlasRects, scale);
      if (mesh) { postResult(jobId, mesh); return; }
    }

    // ----- Build a column-wise density & material field (LOD aware) -----
    const step = Math.max(1, 1 << lod);
    const w = Math.max(2, Math.floor(spanX / step) + 1);
    const d = Math.max(2, Math.floor(spanZ / step) + 1);

    // Per-column max height (in voxels)
    let maxVoxY = 1;
    const colMax = new Uint16Array(w * d);
    let p = 0;
    for (let z = 0; z < d; z++) {
      const srcZ = Math.min(spanZ - 1, z * step);
      for (let x = 0; x < w; x++, p++) {
        const srcX = Math.min(spanX - 1, x * step);
        const idx = srcX + srcZ * spanX;
        const hv = Math.max(0, heights[idx] / Math.max(1e-6, scale));
        const vy = Math.max(1, Math.round(hv));
        colMax[p] = vy; if (vy > maxVoxY) maxVoxY = vy;
      }
    }
    const h = Math.max(2, maxVoxY + 2);

    const density  = new Float32Array(w * h * d);
    const material = new Uint8Array(w * h * d);

    // Roblox-like layering (top cap + subsurface + bedrock)
    const T0 = Math.max(1, Math.round((layerThicknesses[0] ?? scale)     / scale)); // surface
    const T1 = Math.max(1, Math.round((layerThicknesses[1] ?? 2 * scale) / scale)); // soil/rock

    // optional cave carve
    const cavesEnabled = !!caves;
    const f = cavesEnabled ? (caves.frequency ?? 0.06) : 0.06;
    const thr = cavesEnabled ? (caves.threshold ?? 0.35) : 0.35;

    const setCell = (x, y, z, occ, mat) => {
      const idx = x + y * w + z * w * h;
      density[idx]  = occ;
      material[idx] = mat | 0;
    };

    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const colH = colMax[x + z * w];
        for (let y = 0; y <= colH; y++) {
          // caves?
          if (cavesEnabled) {
            const n = (hash3n(Math.floor(x * f), Math.floor(y * f), Math.floor(z * f)) + 1) * 0.5;
            if (n > (1.0 - thr)) { setCell(x, y, z, 0, 0); continue; }
          }
          const depth = colH - y; // 0 at surface
          let mat;
          if (depth <= T0)        mat = 4; // JUNGLE_GRASS / surface (mapped on main thread)
          else if (depth <= T0+T1) mat = 5; // JUNGLE_SOIL / subsurface
          else                    mat = 1; // BEDROCK
          setCell(x, y, z, 1, mat);
        }
        for (let y = colH + 1; y < h; y++) setCell(x, y, z, 0, 0); // air
      }
    }

    // ----- Mesh and return -----
    const mesh = surfaceNetsMesh(density, material, [w, h, d], 0.5, scale, atlasRects);
    if (!mesh.positions || mesh.positions.length === 0) {
      postResult(jobId, {
        chunkSize: { x: w, y: h, z: d },
        scale, atlasRects,
        flags: payload.flags || {},
        voxelCount: w * h * d,
        quadCount: 0, triangleCount: 0, vertexCount: 0,
        positions: new Float32Array(0),
        normals:   new Float32Array(0),
        uvs:       new Float32Array(0),
        indices:   new Uint32Array(0),
        groups: []
      });
      return;
    }

    postResult(jobId, {
      chunkSize: { x: w, y: h, z: d },
      scale, atlasRects,
      flags: payload.flags || {},
      voxelCount: w * h * d,
      ...mesh
    });
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    ctx.postMessage({ jobId, error: msg });
  }
});
