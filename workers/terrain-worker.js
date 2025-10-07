const ctx = self;

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
  const index = value >= 0 ? value : 0;
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
  const indices = createDynamicBuffer(Uint16Array, 1024);

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

          const uSpan = (rect.u1 - rect.u0) * width;
          const vSpan = (rect.v1 - rect.v0) * height;

          const corners = [
            [base[0], base[1], base[2]],
            [base[0] + du[0], base[1] + du[1], base[2] + du[2]],
            [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]],
            [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]]
          ];

          const uvCorners = [
            [rect.u0, rect.v0],
            [rect.u0 + uSpan, rect.v0],
            [rect.u0 + uSpan, rect.v0 + vSpan],
            [rect.u0, rect.v0 + vSpan]
          ];

          const order = sign > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
          const baseIndex = positions.length / 3;
          if (baseIndex + 3 > 65535) {
            throw new Error('Chunk vertex count exceeds Uint16 index limit');
          }

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

ctx.addEventListener('message', (event) => {
  const data = event?.data || {};
  const { jobId, payload } = data;
  if (typeof jobId !== 'number') {
    return;
  }

  try {
    const { chunkVoxels, chunkSize = 0, scale = 1, atlasRects = [], flags = {} } = payload || {};
    const voxels = toUint32Array(chunkVoxels) || new Uint32Array(0);
    const dims = resolveDimensions(chunkSize, voxels.length);
    if (!dims[0] || !dims[1] || !dims[2]) {
      throw new Error('Invalid chunk dimensions');
    }

    const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const geometry = greedyMesh(voxels, dims, normalizedScale, atlasRects);

    const transfer = [
      geometry.positions.buffer,
      geometry.normals.buffer,
      geometry.uvs.buffer,
      geometry.indices.buffer
    ];

    const result = {
      chunkSize: { x: dims[0], y: dims[1], z: dims[2] },
      scale: normalizedScale,
      atlasRects,
      flags,
      voxelCount: voxels.length,
      ...geometry
    };

    ctx.postMessage({ jobId, result }, transfer);
  } catch (err) {
    const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
    ctx.postMessage({ jobId, error: message });
  }
});
