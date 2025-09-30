// world-utils.js — thin wrappers exposing world/terrain helpers via window.HXH
(function(){
  const H = (window.HXH ||= {});
  const COLOR_CACHE = new Map();
  const VISUAL_STATE = {
    region: null,
    colors: null,
    patched: false
  };

  const WorkerJobs = (() => {
    if (typeof window === "undefined") return null;

    let worker = null;
    let jobId = 0;
    const pending = new Map();
    const queue = [];
    let scheduled = false;

    function scheduleFlush() {
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        while (queue.length) {
          const message = queue.shift();
          if (!message || typeof message.id !== "number") continue;
          const entry = pending.get(message.id);
          if (!entry) continue;
          pending.delete(message.id);
          if (message.success) {
            entry.resolve(message.result);
          } else {
            const error = message.error || message.result || new Error("Worker job failed");
            entry.reject(error);
          }
        }
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(run);
      } else {
        setTimeout(run, 0);
      }
    }

    function createWorkerScript() {
      const script = `
        const FACE_DEFINITIONS = ${JSON.stringify({
          px: { name: "px", axis: 0, dir: 1, uAxis: 1, vAxis: 2, normal: [1, 0, 0] },
          nx: { name: "nx", axis: 0, dir: -1, uAxis: 1, vAxis: 2, normal: [-1, 0, 0] },
          py: { name: "py", axis: 1, dir: 1, uAxis: 0, vAxis: 2, normal: [0, 1, 0] },
          ny: { name: "ny", axis: 1, dir: -1, uAxis: 0, vAxis: 2, normal: [0, -1, 0] },
          pz: { name: "pz", axis: 2, dir: 1, uAxis: 0, vAxis: 1, normal: [0, 0, 1] },
          nz: { name: "nz", axis: 2, dir: -1, uAxis: 0, vAxis: 1, normal: [0, 0, -1] }
        })};
        const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"];

        function resolveDimensions(blockData = {}) {
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
          throw new Error("buildChunkMesh requires explicit dimensions when running in a worker");
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
            if (!arr) continue;
            if (ArrayBuffer.isView(arr)) {
              const strideX = 1;
              const strideY = dims[0];
              const strideZ = dims[0] * dims[1];
              return (x, y, z) => {
                if (x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2]) return null;
                const idx = x * strideX + y * strideY + z * strideZ;
                return arr[idx] ?? null;
              };
            }
            if (Array.isArray(arr)) {
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
          throw new Error("buildChunkMesh worker expects a serializable block source");
        }

        function isRenderableBlock(block) {
          if (block == null) return false;
          if (typeof block === "object") {
            if (block.type === "air" || block.id === 0) return false;
            if (block.render === false || block.invisible === true) return false;
            return true;
          }
          return block !== 0;
        }

        function isOpaque(block) {
          if (block == null) return false;
          if (typeof block === "object") {
            if (block.type === "air" || block.id === 0) return false;
            if (block.render === false || block.invisible === true) return false;
            if (block.opaque === false) return false;
            if (block.transparent === true) return false;
            if (typeof block.alpha === "number" && block.alpha < 1) return false;
            return true;
          }
          return block !== 0;
        }

        function getFaceDescriptor(block, face) {
          const descriptor = {
            material: block && typeof block === "object" ? (block.materialId ?? block.material ?? null) : null,
            uv: [0, 0, 1, 1],
            color: null
          };
          if (block && typeof block === "object") {
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
          }
          return descriptor;
        }

        function faceKey(face, descriptor) {
          const parts = [face];
          if (descriptor.material != null) parts.push('m:' + descriptor.material);
          if (descriptor.uv) parts.push('uv:' + descriptor.uv.map((v) => Number(v).toFixed(6)).join(','));
          if (descriptor.color) parts.push('c:' + descriptor.color.map((v) => Number(v).toFixed(6)).join(','));
          return parts.join('|');
        }

        function pushQuad(target, face, base, sizeU, sizeV, descriptor) {
          const def = FACE_DEFINITIONS[face];
          const indexBase = target.positions.length / 3;
          const [x, y, z] = base;
          const normal = def.normal;
          const uvRange = descriptor.uv || [0, 0, 1, 1];
          const du = uvRange[2] - uvRange[0];
          const dv = uvRange[3] - uvRange[1];
          const uMin = uvRange[0];
          const vMin = uvRange[1];
          const uMax = uMin + du * sizeU;
          const vMax = vMin + dv * sizeV;

          function addVertex(px, py, pz, u, v) {
            target.positions.push(px, py, pz);
            target.normals.push(normal[0], normal[1], normal[2]);
            target.uvs.push(u, v);
            if (descriptor.color) {
              target.colors.push(descriptor.color[0], descriptor.color[1], descriptor.color[2], descriptor.color[3] ?? 1);
            }
            target.bounds.min[0] = Math.min(target.bounds.min[0], px);
            target.bounds.min[1] = Math.min(target.bounds.min[1], py);
            target.bounds.min[2] = Math.min(target.bounds.min[2], pz);
            target.bounds.max[0] = Math.max(target.bounds.max[0], px);
            target.bounds.max[1] = Math.max(target.bounds.max[1], py);
            target.bounds.max[2] = Math.max(target.bounds.max[2], pz);
          }

          switch (face) {
            case 'px':
              addVertex(x + 1, y, z, uMin, vMin);
              addVertex(x + 1, y + sizeU, z, uMax, vMin);
              addVertex(x + 1, y + sizeU, z + sizeV, uMax, vMax);
              addVertex(x + 1, y, z + sizeV, uMin, vMax);
              break;
            case 'nx':
              addVertex(x, y, z + sizeV, uMin, vMax);
              addVertex(x, y + sizeU, z + sizeV, uMax, vMax);
              addVertex(x, y + sizeU, z, uMax, vMin);
              addVertex(x, y, z, uMin, vMin);
              break;
            case 'py':
              addVertex(x, y + 1, z, uMin, vMin);
              addVertex(x + sizeU, y + 1, z, uMax, vMin);
              addVertex(x + sizeU, y + 1, z + sizeV, uMax, vMax);
              addVertex(x, y + 1, z + sizeV, uMin, vMax);
              break;
            case 'ny':
              addVertex(x, y, z + sizeV, uMin, vMax);
              addVertex(x + sizeU, y, z + sizeV, uMax, vMax);
              addVertex(x + sizeU, y, z, uMax, vMin);
              addVertex(x, y, z, uMin, vMin);
              break;
            case 'pz':
              addVertex(x, y, z + 1, uMin, vMin);
              addVertex(x + sizeU, y, z + 1, uMax, vMin);
              addVertex(x + sizeU, y + sizeV, z + 1, uMax, vMax);
              addVertex(x, y + sizeV, z + 1, uMin, vMax);
              break;
            case 'nz':
              addVertex(x, y + sizeV, z, uMin, vMax);
              addVertex(x + sizeU, y + sizeV, z, uMax, vMax);
              addVertex(x + sizeU, y, z, uMax, vMin);
              addVertex(x, y, z, uMin, vMin);
              break;
            default:
              return;
          }

          target.indices.push(indexBase, indexBase + 1, indexBase + 2, indexBase, indexBase + 2, indexBase + 3);
          target.materials.push(descriptor.material ?? null);
          target.quadMetadata.push({ face, size: [sizeU, sizeV], uv: descriptor.uv, material: descriptor.material });
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
              for (let v = 0; v < vLimit;) {
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

                  tryEmitFace(target, options, 'px', block, neighborXPlus, x, y, z);
                  tryEmitFace(target, options, 'nx', block, neighborXMinus, x, y, z);
                  tryEmitFace(target, options, 'py', block, neighborYPlus, x, y, z);
                  tryEmitFace(target, options, 'ny', block, neighborYMinus, x, y, z);
                  tryEmitFace(target, options, 'pz', block, neighborZPlus, x, y, z);
                  tryEmitFace(target, options, 'nz', block, neighborZMinus, x, y, z);
                }
              }
            }
          }

          const min = target.bounds.min.map((v) => (Number.isFinite(v) ? v : 0));
          const max = target.bounds.max.map((v) => (Number.isFinite(v) ? v : 0));

          const response = {
            positions: new Float32Array(target.positions),
            normals: new Float32Array(target.normals),
            uvs: new Float32Array(target.uvs),
            indices: new Uint32Array(target.indices),
            quadCount: target.quadCount,
            triangleCount: target.triangleCount,
            vertexCount: target.positions.length / 3,
            bounds: { min, max },
            dimensions: dims,
            options
          };

          const transfer = [
            response.positions.buffer,
            response.normals.buffer,
            response.uvs.buffer,
            response.indices.buffer
          ];

          if (target.colors.length) {
            response.colors = new Float32Array(target.colors);
            transfer.push(response.colors.buffer);
          }
          if (target.materials.some((m) => m != null)) {
            response.materials = target.materials.slice();
          }
          if (target.quadMetadata.length) {
            response.quadMetadata = target.quadMetadata.slice();
          }

          return { result: response, transfer };
        }

        function generateTerrainChunks(payload = {}) {
          const colsX = Math.max(1, payload.colsX | 0);
          const colsZ = Math.max(1, payload.colsZ | 0);
          const chunkSize = Math.max(1, payload.chunkSize | 0);
          const cubeSize = Number(payload.cubeSize) || 1;
          const minWorldX = Number.isFinite(payload.minWorldX) ? payload.minWorldX : 0;
          const minWorldZ = Number.isFinite(payload.minWorldZ) ? payload.minWorldZ : 0;
          const chunkCountX = Math.max(1, Math.ceil(colsX / chunkSize));
          const chunkCountZ = Math.max(1, Math.ceil(colsZ / chunkSize));
          const chunks = new Array(chunkCountX * chunkCountZ);
          const transfer = [];

          for (let cz = 0; cz < chunkCountZ; cz++) {
            for (let cx = 0; cx < chunkCountX; cx++) {
              const startX = cx * chunkSize;
              const startZ = cz * chunkSize;
              const spanX = Math.min(chunkSize, colsX - startX);
              const spanZ = Math.min(chunkSize, colsZ - startZ);
              const len = Math.max(0, spanX * spanZ);
              const indices = new Uint32Array(len);
              transfer.push(indices.buffer);
              let cursor = 0;
              for (let dz = 0; dz < spanZ; dz++) {
                for (let dx = 0; dx < spanX; dx++) {
                  const gridX = startX + dx;
                  const gridZ = startZ + dz;
                  indices[cursor++] = (startZ + dz) * colsX + (startX + dx);
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
                columnIndices: indices,
                center: { x: centerX, z: centerZ },
                bounds: { minX, maxX, minZ, maxZ }
              };
            }
          }

          return {
            result: {
              chunkCountX,
              chunkCountZ,
              chunkSize,
              chunks
            },
            transfer
          };
        }

        function reconstructPath(cameFrom, current, width) {
          const path = [];
          while (current >= 0) {
            const x = current % width;
            const y = Math.floor(current / width);
            path.push(x, y);
            current = cameFrom[current];
          }
          path.reverse();
          return path;
        }

        function pathfindGrid(payload = {}) {
          const width = Math.max(1, payload.width | 0);
          const height = Math.max(1, payload.height | 0);
          const allowDiagonal = !!payload.allowDiagonal;
          let grid = payload.grid;
          if (!ArrayBuffer.isView(grid)) {
            throw new Error('Pathfinding grid must be a TypedArray');
          }
          if (grid.length < width * height) {
            const copy = new Uint8Array(width * height);
            copy.set(grid.subarray(0, Math.min(grid.length, copy.length)));
            grid = copy;
          }
          const start = payload.start || { x: 0, y: 0 };
          const goal = payload.goal || { x: width - 1, y: height - 1 };
          const startX = Math.min(Math.max(start.x | 0, 0), width - 1);
          const startY = Math.min(Math.max(start.y | 0, 0), height - 1);
          const goalX = Math.min(Math.max(goal.x | 0, 0), width - 1);
          const goalY = Math.min(Math.max(goal.y | 0, 0), height - 1);
          const startIndex = startY * width + startX;
          const goalIndex = goalY * width + goalX;
          if (grid[startIndex]) {
            return { result: { path: new Int16Array(0), success: false, reason: 'start-blocked' }, transfer: [] };
          }
          if (grid[goalIndex]) {
            return { result: { path: new Int16Array(0), success: false, reason: 'goal-blocked' }, transfer: [] };
          }

          const total = width * height;
          const cameFrom = new Int32Array(total);
          cameFrom.fill(-1);
          const gScore = new Float32Array(total);
          const fScore = new Float32Array(total);
          for (let i = 0; i < total; i++) {
            gScore[i] = Infinity;
            fScore[i] = Infinity;
          }

          const open = [];
          gScore[startIndex] = 0;
          const heuristic = (x, y) => Math.abs(x - goalX) + Math.abs(y - goalY);
          fScore[startIndex] = heuristic(startX, startY);
          open.push({ index: startIndex, f: fScore[startIndex] });

          const dirs = allowDiagonal
            ? [
                [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
                [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
              ]
            : [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]];

          const inOpen = new Uint8Array(total);
          inOpen[startIndex] = 1;

          function popLowest() {
            let bestIndex = 0;
            for (let i = 1; i < open.length; i++) {
              if (open[i].f < open[bestIndex].f) bestIndex = i;
            }
            const node = open[bestIndex];
            open.splice(bestIndex, 1);
            inOpen[node.index] = 0;
            return node;
          }

          while (open.length) {
            const current = popLowest();
            if (current.index === goalIndex) {
              const coords = reconstructPath(cameFrom, current.index, width);
              const path = new Int16Array(coords);
              return { result: { path, success: true }, transfer: [path.buffer] };
            }
            const cx = current.index % width;
            const cy = Math.floor(current.index / width);
            for (const [dx, dy, cost] of dirs) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const nIndex = ny * width + nx;
              if (grid[nIndex]) continue;
              const tentative = gScore[current.index] + cost;
              if (tentative < gScore[nIndex]) {
                cameFrom[nIndex] = current.index;
                gScore[nIndex] = tentative;
                fScore[nIndex] = tentative + heuristic(nx, ny);
                if (!inOpen[nIndex]) {
                  open.push({ index: nIndex, f: fScore[nIndex] });
                  inOpen[nIndex] = 1;
                }
              }
            }
          }

          return { result: { path: new Int16Array(0), success: false, reason: 'no-path' }, transfer: [] };
        }

        const handlers = {
          'chunk-mesh': (payload) => {
            const data = payload && payload.blockData ? payload.blockData : payload;
            const opts = payload && payload.options ? payload.options : {};
            return buildChunkMesh(data || {}, opts || {});
          },
          'terrain-chunks': generateTerrainChunks,
          'path-grid': pathfindGrid
        };

        function respond(id, payload, transfer) {
          const message = { id, success: true, result: payload };
          if (transfer && transfer.length) {
            self.postMessage(message, transfer);
          } else {
            self.postMessage(message);
          }
        }

        self.onmessage = (event) => {
          const data = event?.data || {};
          const { id, type, payload } = data;
          if (typeof id !== 'number' || !type) return;
          try {
            const handler = handlers[type];
            if (!handler) throw new Error('Unknown worker job: ' + type);
            const outcome = handler(payload || {});
            if (outcome && typeof outcome === 'object' && 'result' in outcome) {
              respond(id, outcome.result, outcome.transfer || []);
            } else {
              respond(id, outcome, []);
            }
          } catch (err) {
            const message = typeof err === 'object' && err && err.message ? err.message : String(err);
            const errorPayload = { id, success: false, error: message };
            self.postMessage(errorPayload);
          }
        };
      `;
      return script;
    }

    function ensureWorker() {
      if (worker || typeof Worker === "undefined") return worker;
      try {
        const blob = new Blob([createWorkerScript()], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = (event) => {
          queue.push(event.data);
          scheduleFlush();
        };
        worker.onerror = (err) => {
          console.warn("[WorldUtils] Worker job error", err);
        };
      } catch (err) {
        console.warn("[WorldUtils] Failed to create worker", err);
        worker = null;
      }
      return worker;
    }

    function postJob(type, payload, transfer = []) {
      const target = ensureWorker();
      if (!target) return null;
      const id = ++jobId;
      const message = { id, type, payload };
      const promise = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, type });
      });
      try {
        target.postMessage(message, transfer);
      } catch (err) {
        pending.delete(id);
        console.warn("[WorldUtils] Failed to post worker job", err);
        return null;
      }
      return promise;
    }

    function cloneToUint8(array) {
      if (!array) return null;
      if (ArrayBuffer.isView(array) && typeof array.slice === "function") {
        return array.slice();
      }
      if (Array.isArray(array)) {
        return Uint8Array.from(array.map((v) => v | 0));
      }
      return null;
    }

    function cloneToUint32(array) {
      if (!array) return null;
      if (ArrayBuffer.isView(array)) {
        const copy = new Uint32Array(array.length);
        for (let i = 0; i < array.length; i++) copy[i] = array[i];
        return copy;
      }
      if (Array.isArray(array)) {
        return Uint32Array.from(array);
      }
      return null;
    }

    function normalizeDimensions(dim) {
      if (!dim) return null;
      if (Array.isArray(dim)) {
        const out = [dim[0] ?? 0, dim[1] ?? 0, dim[2] ?? 0];
        return out.map((v) => v | 0);
      }
      if (typeof dim === "object") {
        const x = dim.x ?? dim.width ?? dim[0] ?? 0;
        const y = dim.y ?? dim.height ?? dim[1] ?? 0;
        const z = dim.z ?? dim.depth ?? dim[2] ?? 0;
        return [x | 0, y | 0, z | 0];
      }
      return null;
    }

    function requestChunkMesh(blockData, options = {}) {
      if (!blockData || typeof blockData !== "object") return null;
      if (typeof blockData.getBlock === "function" || typeof blockData.get === "function") return null;
      const dims = normalizeDimensions(blockData.dimensions || blockData.size || {
        x: blockData.width,
        y: blockData.height,
        z: blockData.depth
      });
      if (!dims) return null;
      const payload = {
        blockData: { dimensions: dims },
        options: { ...options }
      };
      const arrays = ["blocks", "data", "voxels"];
      const transfer = [];
      let attached = false;
      for (const key of arrays) {
        const source = blockData[key];
        if (!source) continue;
        const cloned = cloneToUint32(source);
        if (!cloned) continue;
        payload.blockData[key] = cloned;
        transfer.push(cloned.buffer);
        attached = true;
        break;
      }
      if (!attached) return null;
      return postJob("chunk-mesh", payload, transfer);
    }

    function requestTerrainChunks(payload) {
      if (!payload) return null;
      const job = postJob("terrain-chunks", payload);
      return job;
    }

    function requestPathGrid(payload = {}) {
      if (!payload.grid) return Promise.reject(new Error("Pathfinding payload requires a grid"));
      const grid = cloneToUint8(payload.grid);
      if (!grid) return Promise.reject(new Error("Pathfinding grid must be array-like"));
      const transfer = [grid.buffer];
      const job = postJob("path-grid", { ...payload, grid }, transfer);
      return job;
    }

    function isSupported() {
      return !!ensureWorker();
    }

    return {
      isSupported,
      ensureWorker,
      postJob,
      requestChunkMesh,
      requestTerrainChunks,
      requestPathGrid,
      cloneToUint32
    };
  })();

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
    if (block.type === "air" || block.id === 0) return false;
    if (block.render === false || block.invisible === true) return false;
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

  function buildChunkMeshAsync(blockData, opts = {}) {
    const jobs = WorkerJobs;
    if (!jobs || typeof jobs.requestChunkMesh !== "function") {
      return Promise.resolve(buildChunkMesh(blockData, opts));
    }
    try {
      const job = jobs.requestChunkMesh(blockData, opts);
      if (!job || typeof job.then !== "function") {
        return Promise.resolve(buildChunkMesh(blockData, opts));
      }
      return job.catch((err) => {
        console.warn("[WorldUtils] Chunk mesh worker failed, falling back", err);
        return buildChunkMesh(blockData, opts);
      });
    } catch (err) {
      console.warn("[WorldUtils] Unable to queue chunk mesh job", err);
      return Promise.resolve(buildChunkMesh(blockData, opts));
    }
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
    buildChunkMeshAsync,
    WorkerJobs,
    GameSettings: window.GameSettings || H.GameSettings
  };
  window.WorldUtils = WorldUtils;
})();
