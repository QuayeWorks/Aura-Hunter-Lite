const ctx = self;
try {
    if (typeof importScripts === 'function') {
        importScripts('../terrain/biomes.js');
    }
} catch (err) {
    // ignore loading errors; fallback paths remain available
}
const TerrainBiomesWorker = typeof self !== 'undefined' ? (self.TerrainBiomes || null) : null;

function solidAt(density, iso = 0.5) {
    return density >= iso;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

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
// Minimal SurfaceNets for scalar fields with per-voxel material picking
function surfaceNetsMesh(field, mats, dims, iso, scale, atlasRects) {
    const [nx, ny, nz] = dims;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const groups = new Map(); // materialId -> {start,count}

    const id = (x, y, z) => x + y * nx + z * nx * ny;

    // Precompute voxel signs
    const sign = new Uint8Array(nx * ny * nz);
    for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++) {
                const s = field[id(x, y, z)] >= iso ? 1 : 0;
                sign[id(x, y, z)] = s;
            }

    // Vertex id grid
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

        if (mask === 0 || mask === 255) return -1; // fully empty or full

        // Center of mass of edge intersections (good enough for smooth look)
        let cx = 0,
            cy = 0,
            cz = 0,
            n = 0;
        // Choose dominant material among corners that are "solid"
        const corner = [
            mats[base], mats[base + 1], mats[base + nx], mats[base + nx + 1],
            mats[base + nx * ny], mats[base + nx * ny + 1], mats[base + nx * ny + nx], mats[base + nx * ny + nx + 1]
        ];
        // Dominant solid material
        let mat = 0,
            counts = new Uint16Array(256);
        for (let i = 0; i < 8; i++)
            if ((mask >> i) & 1) counts[corner[i]]++;
        for (let i = 0; i < 256; i++)
            if (counts[i] && counts[i] > counts[mat]) mat = i;

        // Estimate gradient for normal from central differences
        const gx = (field[id(x + 1, y, z)] - field[id(x - 1, y, z)]) * 0.5 || 0;
        const gy = (field[id(x, y + 1, z)] - field[id(x, y - 1, z)]) * 0.5 || 0;
        const gz = (field[id(x, y, z + 1)] - field[id(x, y, z - 1)]) * 0.5 || 0;
        const gn = Math.hypot(gx, gy, gz) || 1;

        // Position roughly at cube center (SurfaceNets)
        const vx = (x + 0.5) * scale;
        const vy = (y + 0.5) * scale;
        const vz = (z + 0.5) * scale;

        const index = positions.length / 3;
        positions.push(vx, vy, vz);
        normals.push(gx / gn, gy / gn, gz / gn);

        // Triplanar-like cheap UV: project onto dominant axis
        const ax = Math.abs(gx),
            ay = Math.abs(gy),
            az = Math.abs(gz);
        if (ax >= ay && ax >= az) {
            uvs.push(vz, vy);
        } // X major
        else if (ay >= ax && ay >= az) {
            uvs.push(vx, vz);
        } // Y major (top)
        else {
            uvs.push(vx, vy);
        } // Z major

        // remember group start
        if (!groups.has(mat)) groups.set(mat, {
            start: 0,
            count: 0,
            materialId: mat
        });
        return index;
    };

    // Generate one vertex per cell that crosses the isosurface
    for (let z = 1; z < nz - 1; z++)
        for (let y = 1; y < ny - 1; y++)
            for (let x = 1; x < nx - 1; x++) {
                const idx = vid(x, y, z);
                const v = vertexForCell(x, y, z);
                vId[idx] = v;
            }

    // Connect quads between adjacent crossing cells (two tris per face)
    const pushFace = (a, b, c, d, mat) => {
        const start = indices.length;
        indices.push(a, b, c, a, c, d);
        const g = groups.get(mat);
        if (g) g.count += 6;
    };

    for (let z = 1; z < nz - 1; z++)
        for (let y = 1; y < ny - 1; y++)
            for (let x = 1; x < nx - 1; x++) {
                const m = sign[id(x, y, z)];
                // compare with neighbors only in +X, +Y, +Z to avoid duplicates
                if (sign[id(x + 1, y, z)] !== m) {
                    const v00 = vId[vid(x, y, z)],
                        v01 = vId[vid(x, y + 1, z)];
                    const v10 = vId[vid(x, y, z + 1)],
                        v11 = vId[vid(x, y + 1, z + 1)];
                    if (v00 | v01 | v10 | v11) {
                        const mat = m ? mats[id(x, y, z)] : mats[id(x + 1, y, z)];
                        pushFace(v00, v10, v11, v01, mat);
                    }
                }
                if (sign[id(x, y + 1, z)] !== m) {
                    const v00 = vId[vid(x, y, z)],
                        v01 = vId[vid(x, y, z + 1)];
                    const v10 = vId[vid(x + 1, y, z)],
                        v11 = vId[vid(x + 1, y, z + 1)];
                    if (v00 | v01 | v10 | v11) {
                        const mat = m ? mats[id(x, y, z)] : mats[id(x, y + 1, z)];
                        pushFace(v00, v10, v11, v01, mat);
                    }
                }
                if (sign[id(x, y, z + 1)] !== m) {
                    const v00 = vId[vid(x, y, z)],
                        v01 = vId[vid(x + 1, y, z)];
                    const v10 = vId[vid(x, y + 1, z)],
                        v11 = vId[vid(x + 1, y + 1, z)];
                    if (v00 | v01 | v10 | v11) {
                        const mat = m ? mats[id(x, y, z)] : mats[id(x, y, z + 1)];
                        pushFace(v00, v10, v11, v01, mat);
                    }
                }
            }

    // Build material groups list for subMeshes
    const materialGroups = [];
    for (const [mat, g] of groups.entries()) {
        if (g.count) {
            materialGroups.push({
                materialId: mat | 0,
                start: 0,
                count: g.count
            });
        }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
        groups: materialGroups,
        atlasRects
    };
}


function normalizeRect(rect) {
    if (!rect || typeof rect !== 'object') {
        return {
            u0: 0,
            v0: 0,
            u1: 1,
            v1: 1
        };
    }
    if (Array.isArray(rect) && rect.length >= 4) {
        return {
            u0: Number(rect[0]) || 0,
            v0: Number(rect[1]) || 0,
            u1: Number(rect[2]) || 1,
            v1: Number(rect[3]) || 1
        };
    }
    const u0 = Number(rect.u0 ?? rect.x0 ?? rect.minU ?? 0);
    const v0 = Number(rect.v0 ?? rect.y0 ?? rect.minV ?? 0);
    const u1 = Number(rect.u1 ?? rect.x1 ?? rect.maxU ?? 1);
    const v1 = Number(rect.v1 ?? rect.y1 ?? rect.maxV ?? 1);
    return {
        u0,
        v0,
        u1,
        v1
    };
}

function getAtlasRect(atlasRects, value) {
    if (!Array.isArray(atlasRects) || atlasRects.length === 0) {
        return {
            u0: 0,
            v0: 0,
            u1: 1,
            v1: 1
        };
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
                    const u0 = rect.u0 + padU,
                        v0 = rect.v0 + padV;
                    const u1 = rect.u1 - padU,
                        v1 = rect.v1 - padV;

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
    const {
        jobId,
        payload
    } = data;
    if (typeof jobId !== 'number') return;

	// ---- helpers (one copy only)
	const toFloat32Array = (src, len) => {
	  if (src instanceof Float32Array && src.length === len) return src;
	  if (Array.isArray(src) || (src && typeof src.length === 'number')) {
		const out = new Float32Array(len);
		for (let i = 0; i < len; i++) out[i] = +src[i] || 0;
		return out;
	  }
	  return new Float32Array(len);
	};
	
	// cheap deterministic hash in [-1,1]
	const hash3n = (x, y, z) => {
	  let n = (x | 0) * 73856093 ^ (y | 0) * 19349663 ^ (z | 0) * 83492791;
	  n = (n << 13) ^ n;
	  const t = 1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0;
	  return t;
	};
	
	const postResult = (jobId, mesh) => {
	  const transfer = [];
	  if (mesh?.positions?.buffer) transfer.push(mesh.positions.buffer);
	  if (mesh?.normals?.buffer)   transfer.push(mesh.normals.buffer);
	  if (mesh?.uvs?.buffer)       transfer.push(mesh.uvs.buffer);
	  if (mesh?.indices?.buffer)   transfer.push(mesh.indices.buffer);
	  try { postMessage({ jobId, result: mesh }, transfer); }
	  catch { postMessage({ jobId, result: mesh }); }
	};

	// ---- single handler
	ctx.addEventListener('message', (event) => {
	  const data = event?.data || {};
	  const { jobId, payload } = data;
	  if (typeof jobId !== 'number') return;

	  try {
		const {
		  spanX = 0, spanZ = 0, scale = 1,
		  heights: heightsIn,
		  layerOffsets = [], layerThicknesses = [],
		  atlasRects = [],
		  colsX = 0, colsZ = 0, halfX = 0, halfZ = 0,
		  lod = 0,
		  caves
		} = payload || {};

		if (!spanX || !spanZ) throw new Error('Invalid span/layer dims');
		const heights = toFloat32Array(heightsIn, spanX * spanZ);
		if (heights.length !== spanX * spanZ) throw new Error('Bad heights length');

		// --- Build a column-wise density & material field (coarsened by LOD)
		const step = Math.max(1, 1 << lod);
		const w = Math.max(2, Math.floor(spanX / step) + 1);
		const d = Math.max(2, Math.floor(spanZ / step) + 1);

		// Column max voxel height
		let maxVoxY = 1;
		const colMax = new Uint16Array(w * d);
		{
		  let i = 0;
		  for (let z = 0; z < d; z++) {
			const srcZ = Math.min(spanZ - 1, z * step);
			for (let x = 0; x < w; x++, i++) {
			  const srcX = Math.min(spanX - 1, x * step);
			  const srcIdx = srcX + srcZ * spanX;
			  const hv = Math.max(0, heights[srcIdx] / Math.max(1e-6, scale));
			  const vy = Math.max(1, Math.round(hv));
			  colMax[i] = vy;
			  if (vy > maxVoxY) maxVoxY = vy;
			}
		  }
		}
		const h = Math.max(2, maxVoxY + 2);

		const density  = new Float32Array(w * h * d);
		const material = new Uint8Array(w * h * d);

		const T0 = Math.max(1, Math.round((layerThicknesses[0] ?? scale)    / scale)); // surface cap (grass/sand)
		const T1 = Math.max(1, Math.round((layerThicknesses[1] ?? 2*scale)  / scale)); // soil/rock
		const cavesEnabled = !!caves;

		const noise = (x,y,z) => {
		  if (!cavesEnabled) return 0;
		  const a = caves.amplitude  ?? 0.18;
		  const f = caves.frequency  ?? 0.06;
		  const t = caves.threshold  ?? 0.35; // used below
		  // map hash to [0,1]
		  const n = (hash3n(Math.floor(x*f), Math.floor(y*f), Math.floor(z*f)) + 1) * 0.5;
		  return n > (1.0 - t) ? 1 : 0;
		};

		const setCell = (x,y,z,occ,mat) => {
		  const idx = x + y*w + z*w*h;
		  density[idx]  = occ;
		  material[idx] = mat|0;
		};

		// Roblox-like layering per column
		for (let z = 0; z < d; z++) {
		  for (let x = 0; x < w; x++) {
			const colH = colMax[x + z*w];
			for (let y = 0; y <= colH; y++) {
			  // carve caves
			  if (noise(x,y,z)) { setCell(x,y,z, 0, 0); continue; }
			  const depth = colH - y; // 0 at surface
			  let mat;
			  if (depth <= T0) mat = 4;     // grass top (maps on main thread)
			  else if (depth <= T0 + T1) mat = 5; // soil
			  else mat = 1;                 // bedrock
			  setCell(x,y,z, 1, mat);
			}
			// above surface = air
			for (let y = colH+1; y < h; y++) setCell(x,y,z, 0, 0);
		  }
		}

		// --- Mesh (SurfaceNets / Greedy). Must output groups per material.
		const mesh = surfaceNetsMesh(density, material, [w,h,d], 0.5, scale, atlasRects);
		// Ensure groups[] exists even if empty
		if (!mesh.groups) mesh.groups = [];

		// Robust empty return to avoid Babylon warnings
		if (!mesh.positions || mesh.positions.length === 0) {
		  postResult(jobId, {
			chunkSize: { x: w, y: h, z: d },
			scale, atlasRects,
			flags: payload.flags || {},
			voxelCount: w*h*d,
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
		  voxelCount: w*h*d,
		  ...mesh
		});
	  } catch (err) {
		const message = (err && err.message) ? err.message : String(err);
		postMessage({ jobId, error: message });
	  }
	});
