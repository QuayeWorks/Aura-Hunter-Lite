// world-utils.js — thin wrappers exposing world/terrain helpers via window.HXH
(function(){
  const H = (window.HXH ||= {});
  const COLOR_CACHE = new Map();
  const VISUAL_STATE = {
    region: null,
    colors: null,
    patched: false
  };

  const FLAGS = (H.FLAGS ||= {});
  if (!Object.prototype.hasOwnProperty.call(FLAGS, "USE_UNIFIED_TERRAIN")) {
    FLAGS.USE_UNIFIED_TERRAIN = true;
  }

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
          throw new Error("buildChunkGeometry requires explicit dimensions when running in a worker");
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
          throw new Error("buildChunkGeometry worker expects a serializable block source");
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

        function buildChunkGeometry(blockData, opts = {}) {
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
            return buildChunkGeometry(data || {}, opts || {});
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

  const Terrain = (() => {
    const unsupported = {
      init() {
        console.warn("[WorldUtils] Babylon.js unavailable; unified terrain disabled");
        return null;
      },
      dispose() {},
      getMesh() { return null; },
      sampleHeight() { return null; },
      worldToVertex() { return null; },
      applyDamage() { return false; },
      updateFromColumns() { return false; },
      applyRegionAmbient() {},
      setActiveRegion() {},
      setColor() { return null; },
      getActiveRegion() { return null; }
    };

    if (typeof BABYLON === "undefined") {
      return unsupported;
    }

    const DEFAULT_COLOR = new BABYLON.Color4(0.34, 0.52, 0.26, 1);
    const DEFAULT_LAYER_COLORS = {
      grass: new BABYLON.Color4(0.34, 0.52, 0.26, 1),
      dirt: new BABYLON.Color4(0.45, 0.33, 0.19, 1),
      clay: new BABYLON.Color4(0.58, 0.4, 0.26, 1),
      bedrock: new BABYLON.Color4(0.32, 0.33, 0.38, 1)
    };
    const DEFAULT_DEPTH_THRESHOLDS = { dirt: 0.45, clay: 1.35, bedrock: 2.8 };
    const COLOR_WRITE_EPS = 1e-4;

    const state = {
      mesh: null,
      scene: null,
      width: 0,
      depth: 0,
      segmentsX: 0,
      segmentsZ: 0,
      vertexCountX: 0,
      vertexCountZ: 0,
      stepX: 1,
      stepZ: 1,
      baseY: 0,
      positions: null,
      normals: null,
      colors: null,
      indices: null,
      heights: null,
      originalHeights: null,
      originalInitialized: false,
      dirty: false,
      colorsDirty: false,
      defaultColor: DEFAULT_COLOR.clone(),
      lastColorKey: null,
      pendingColor: null,
      activeRegion: null,
      layerPalette: clonePalette(DEFAULT_LAYER_COLORS),
      depthThresholds: { ...DEFAULT_DEPTH_THRESHOLDS },
      colorBlendRing: true,
      colorBlendStrength: 0.45
    };

    function encodeColorKey(color) {
      if (!color) return null;
      return `${color.r.toFixed(4)},${color.g.toFixed(4)},${color.b.toFixed(4)},${color.a.toFixed(4)}`;
    }

    function toColor4(input, fallback = state.defaultColor) {
      if (input instanceof BABYLON.Color4) return input.clone();
      if (input instanceof BABYLON.Color3) return new BABYLON.Color4(input.r, input.g, input.b, 1);
      if (Array.isArray(input) && input.length >= 3) {
        const r = Number(input[0]) || 0;
        const g = Number(input[1]) || 0;
        const b = Number(input[2]) || 0;
        const a = input.length >= 4 && Number.isFinite(Number(input[3])) ? Number(input[3]) : 1;
        return new BABYLON.Color4(r, g, b, a);
      }
      if (typeof input === "string") {
        const trimmed = input.trim();
        if (trimmed) {
          try {
            const col = BABYLON.Color3.FromHexString(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
            return new BABYLON.Color4(col.r, col.g, col.b, 1);
          } catch (err) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed) && parsed.length >= 3) {
                return toColor4(parsed, fallback);
              }
            } catch (_) {}
          }
        }
      }
      if (input && typeof input === "object") {
        const r = Number(input.r ?? input.red);
        const g = Number(input.g ?? input.green);
        const b = Number(input.b ?? input.blue);
        const a = Number.isFinite(input.a) ? Number(input.a) : Number(input.alpha);
        if ([r, g, b].every((v) => Number.isFinite(v))) {
          return new BABYLON.Color4(r, g, b, Number.isFinite(a) ? a : 1);
        }
      }
      const base = fallback || DEFAULT_COLOR;
      return base.clone ? base.clone() : new BABYLON.Color4(base.r, base.g, base.b, base.a ?? 1);
    }

    function clamp01(v) {
      return Math.min(1, Math.max(0, Number(v) || 0));
    }

    function mixColor4(a, b, t) {
      const clamped = clamp01(t);
      const ar = a?.r ?? 0;
      const ag = a?.g ?? 0;
      const ab = a?.b ?? 0;
      const aa = a?.a ?? 1;
      const br = b?.r ?? 0;
      const bg = b?.g ?? 0;
      const bb = b?.b ?? 0;
      const ba = b?.a ?? 1;
      return new BABYLON.Color4(
        clamp01(ar + (br - ar) * clamped),
        clamp01(ag + (bg - ag) * clamped),
        clamp01(ab + (bb - ab) * clamped),
        clamp01(aa + (ba - aa) * clamped)
      );
    }

    function clonePalette(palette) {
      return {
        grass: toColor4(palette?.grass || DEFAULT_LAYER_COLORS.grass, DEFAULT_LAYER_COLORS.grass),
        dirt: toColor4(palette?.dirt || DEFAULT_LAYER_COLORS.dirt, DEFAULT_LAYER_COLORS.dirt),
        clay: toColor4(palette?.clay || DEFAULT_LAYER_COLORS.clay, DEFAULT_LAYER_COLORS.clay),
        bedrock: toColor4(palette?.bedrock || DEFAULT_LAYER_COLORS.bedrock, DEFAULT_LAYER_COLORS.bedrock)
      };
    }

    function resolveDepthThresholds(source, base = state.depthThresholds) {
      const ref = base && typeof base === "object" ? base : DEFAULT_DEPTH_THRESHOLDS;
      const resolved = {
        dirt: Number.isFinite(ref?.dirt) ? Number(ref.dirt) : DEFAULT_DEPTH_THRESHOLDS.dirt,
        clay: Number.isFinite(ref?.clay) ? Number(ref.clay) : DEFAULT_DEPTH_THRESHOLDS.clay,
        bedrock: Number.isFinite(ref?.bedrock) ? Number(ref.bedrock) : DEFAULT_DEPTH_THRESHOLDS.bedrock
      };
      if (source && typeof source === "object") {
        const dirt = Number(source.dirt ?? source.t1 ?? source.grassToDirt);
        const clay = Number(source.clay ?? source.t2 ?? source.dirtToClay);
        const bedrock = Number(source.bedrock ?? source.t3 ?? source.clayToBedrock);
        if (Number.isFinite(dirt) && dirt >= 0) resolved.dirt = dirt;
        if (Number.isFinite(clay) && clay >= 0) resolved.clay = clay;
        if (Number.isFinite(bedrock) && bedrock >= 0) resolved.bedrock = bedrock;
      }
      if (resolved.dirt < 0) resolved.dirt = 0;
      if (resolved.clay <= resolved.dirt) resolved.clay = resolved.dirt + 0.01;
      if (resolved.bedrock <= resolved.clay) resolved.bedrock = resolved.clay + 0.01;
      return resolved;
    }

    function resolveLayerPalette(overrides, grassBase) {
      const grass = grassBase ? toColor4(grassBase, DEFAULT_LAYER_COLORS.grass) : DEFAULT_LAYER_COLORS.grass;
      const palette = clonePalette({
        grass,
        dirt: mixColor4(DEFAULT_LAYER_COLORS.dirt, grass, 0.35),
        clay: mixColor4(DEFAULT_LAYER_COLORS.clay, grass, 0.22),
        bedrock: mixColor4(DEFAULT_LAYER_COLORS.bedrock, grass, 0.18)
      });
      if (overrides && typeof overrides === "object") {
        if (overrides.grass) palette.grass = toColor4(overrides.grass, palette.grass);
        if (overrides.dirt) palette.dirt = toColor4(overrides.dirt, palette.dirt);
        if (overrides.clay) palette.clay = toColor4(overrides.clay, palette.clay);
        if (overrides.bedrock) palette.bedrock = toColor4(overrides.bedrock, palette.bedrock);
      }
      return palette;
    }

    function ensureOriginalHeightsInitialized(force = false) {
      if (!state.heights) return;
      if (!state.originalHeights || state.originalHeights.length !== state.heights.length) {
        state.originalHeights = new Float32Array(state.heights.length);
      }
      if (!state.originalInitialized || force) {
        state.originalHeights.set(state.heights);
        state.originalInitialized = true;
      }
    }

    function refreshOriginalHeightsForRegion(minVX, maxVX, minVZ, maxVZ) {
      if (!state.originalHeights || !state.heights) return;
      if (state.vertexCountX <= 0 || state.vertexCountZ <= 0) return;
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const vx0 = clamp(minVX ?? 0, 0, state.vertexCountX - 1);
      const vx1 = clamp(maxVX ?? state.vertexCountX - 1, vx0, state.vertexCountX - 1);
      const vz0 = clamp(minVZ ?? 0, 0, state.vertexCountZ - 1);
      const vz1 = clamp(maxVZ ?? state.vertexCountZ - 1, vz0, state.vertexCountZ - 1);
      const rowStride = state.vertexCountX;
      for (let vz = vz0; vz <= vz1; vz++) {
        const rowStart = vz * rowStride + vx0;
        const rowEnd = vz * rowStride + vx1 + 1;
        state.originalHeights.set(state.heights.subarray(rowStart, rowEnd), rowStart);
      }
    }

    function writeVertexColor(index, color) {
      if (!state.colors) return false;
      const base = index * 4;
      const cr = state.colors[base];
      const cg = state.colors[base + 1];
      const cb = state.colors[base + 2];
      const ca = state.colors[base + 3];
      const nr = color.r;
      const ng = color.g;
      const nb = color.b;
      const na = color.a ?? 1;
      if (
        Math.abs(cr - nr) < COLOR_WRITE_EPS &&
        Math.abs(cg - ng) < COLOR_WRITE_EPS &&
        Math.abs(cb - nb) < COLOR_WRITE_EPS &&
        Math.abs(ca - na) < COLOR_WRITE_EPS
      ) {
        return false;
      }
      state.colors[base] = nr;
      state.colors[base + 1] = ng;
      state.colors[base + 2] = nb;
      state.colors[base + 3] = na;
      state.colorsDirty = true;
      return true;
    }

    function commitColors() {
      if (!state.mesh || !state.colors || !state.colorsDirty) return;
      state.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, state.colors, false, false);
      state.mesh.markAsDirty(BABYLON.VertexBuffer.ColorKind);
      state.colorsDirty = false;
    }

    function updateColorsForRegion(minVX, maxVX, minVZ, maxVZ, opts = {}) {
      if (!state.colors || !state.heights || state.vertexCountX <= 0 || state.vertexCountZ <= 0) {
        return null;
      }
      ensureOriginalHeightsInitialized(opts.resetOriginal === true);
      if (!state.originalHeights) return null;
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const rowStride = state.vertexCountX;
      const vx0 = clamp(minVX ?? 0, 0, state.vertexCountX - 1);
      const vx1 = clamp(maxVX ?? state.vertexCountX - 1, vx0, state.vertexCountX - 1);
      const vz0 = clamp(minVZ ?? 0, 0, state.vertexCountZ - 1);
      const vz1 = clamp(maxVZ ?? state.vertexCountZ - 1, vz0, state.vertexCountZ - 1);
      const thresholds = resolveDepthThresholds(opts.depthThresholds, state.depthThresholds);
      state.depthThresholds = thresholds;
      const palette = state.layerPalette || clonePalette(DEFAULT_LAYER_COLORS);
      const blendRing = opts.softBlend ?? state.colorBlendRing;
      const ringEntries = blendRing ? [] : null;
      let changed = false;
      for (let vz = vz0; vz <= vz1; vz++) {
        for (let vx = vx0; vx <= vx1; vx++) {
          const idx = vz * rowStride + vx;
          const original = state.originalHeights[idx];
          const current = state.heights[idx];
          if (!Number.isFinite(original) || !Number.isFinite(current)) continue;
          const depth = Math.max(0, original - current);
          let color = palette.grass;
          if (depth > thresholds.dirt) color = palette.dirt;
          if (depth > thresholds.clay) color = palette.clay;
          if (depth > thresholds.bedrock) color = palette.bedrock;
          changed = writeVertexColor(idx, color) || changed;
          if (ringEntries && (vx === vx0 || vx === vx1 || vz === vz0 || vz === vz1)) {
            ringEntries.push({ index: idx, vx, vz });
          }
        }
      }
      if (ringEntries && ringEntries.length && state.colorBlendStrength > 0) {
        const strength = Math.max(0, Math.min(1, Number(state.colorBlendStrength) || 0));
        for (const entry of ringEntries) {
          let totalR = 0;
          let totalG = 0;
          let totalB = 0;
          let totalA = 0;
          let count = 0;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nvx = entry.vx + dx;
              const nvz = entry.vz + dz;
              if (nvx < 0 || nvx >= state.vertexCountX || nvz < 0 || nvz >= state.vertexCountZ) continue;
              if (dx === 0 && dz === 0) continue;
              const nIdx = nvz * rowStride + nvx;
              const base = nIdx * 4;
              totalR += state.colors[base];
              totalG += state.colors[base + 1];
              totalB += state.colors[base + 2];
              totalA += state.colors[base + 3];
              count++;
            }
          }
          if (!count) continue;
          const avgR = totalR / count;
          const avgG = totalG / count;
          const avgB = totalB / count;
          const avgA = totalA / count;
          const base = entry.index * 4;
          const currentR = state.colors[base];
          const currentG = state.colors[base + 1];
          const currentB = state.colors[base + 2];
          const currentA = state.colors[base + 3];
          const blended = new BABYLON.Color4(
            clamp01(currentR * (1 - strength) + avgR * strength),
            clamp01(currentG * (1 - strength) + avgG * strength),
            clamp01(currentB * (1 - strength) + avgB * strength),
            clamp01(currentA * (1 - strength) + avgA * strength)
          );
          changed = writeVertexColor(entry.index, blended) || changed;
        }
      }
      return changed ? { minVX: vx0, maxVX: vx1, minVZ: vz0, maxVZ: vz1 } : null;
    }

    function refreshAllVertexColors(options = {}) {
      const region = updateColorsForRegion(0, state.vertexCountX - 1, 0, state.vertexCountZ - 1, options);
      if (region) {
        commitColors();
        return true;
      }
      return false;
    }

    function resolveScene(options = {}) {
      if (options.scene && typeof options.scene.getEngine === "function") return options.scene;
      if (options.parent && typeof options.parent.getScene === "function") return options.parent.getScene();
      if (H.environment?.terrain?.root?.getScene) return H.environment.terrain.root.getScene();
      if (H.environment?.sun?.getScene) return H.environment.sun.getScene();
      if (BABYLON.EngineStore?.LastCreatedScene) return BABYLON.EngineStore.LastCreatedScene;
      return null;
    }

    function resolveSegments(resolution, axis) {
      if (resolution == null) return 1;
      if (typeof resolution === "number" && Number.isFinite(resolution)) {
        return Math.max(1, Math.floor(resolution));
      }
      if (Array.isArray(resolution)) {
        const idx = axis === "x" ? 0 : 1;
        const value = Number(resolution[idx]);
        if (Number.isFinite(value) && value > 0) return Math.floor(value);
      }
      if (typeof resolution === "object") {
        const key = axis === "x" ? "x" : "z";
        let value = Number(resolution[key]);
        if (!Number.isFinite(value)) {
          const fallbackKey = axis === "x" ? "width" : "depth";
          value = Number(resolution[fallbackKey]);
        }
        if (!Number.isFinite(value)) {
          const altKey = axis === "x" ? "columns" : "rows";
          value = Number(resolution[altKey]);
        }
        if (Number.isFinite(value) && value > 0) return Math.floor(value);
      }
      return 1;
    }

    function dispose() {
      if (state.mesh && !state.mesh.isDisposed?.()) {
        try { state.mesh.dispose(false, true); } catch (err) {}
      }
      state.mesh = null;
      state.scene = null;
      state.width = 0;
      state.depth = 0;
      state.segmentsX = 0;
      state.segmentsZ = 0;
      state.vertexCountX = 0;
      state.vertexCountZ = 0;
      state.stepX = 1;
      state.stepZ = 1;
      state.baseY = 0;
      state.positions = null;
      state.normals = null;
      state.colors = null;
      state.indices = null;
      state.heights = null;
      state.originalHeights = null;
      state.originalInitialized = false;
      state.dirty = false;
      state.colorsDirty = false;
      state.lastColorKey = null;
      state.activeRegion = null;
      state.layerPalette = clonePalette(DEFAULT_LAYER_COLORS);
      state.depthThresholds = { ...DEFAULT_DEPTH_THRESHOLDS };
      state.colorBlendRing = true;
      state.colorBlendStrength = 0.45;
      state.pendingColor = null;
    }

    function commit(updateNormals = true) {
      if (!state.mesh) return;
      if (state.dirty && state.positions) {
        state.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, state.positions, false, false);
        if (updateNormals && state.normals && state.indices) {
          BABYLON.VertexData.ComputeNormals(state.positions, state.indices, state.normals);
          state.mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, state.normals, false, false);
        }
        state.mesh.refreshBoundingInfo();
        state.mesh.markAsDirty(BABYLON.VertexBuffer.PositionKind | BABYLON.VertexBuffer.NormalKind);
        state.dirty = false;
      }
      commitColors();
    }

    function emitTerrainDeformed(detail) {
      if (!detail) return;
      const payload = { ...detail };
      const target = H.onTerrainDeformed;
      const callSafe = (fn) => {
        if (typeof fn !== "function") return;
        try {
          fn(payload);
        } catch (err) {
          console.warn("[Terrain] onTerrainDeformed handler failed", err);
        }
      };
      if (typeof target === "function") {
        callSafe(target);
      } else if (Array.isArray(target)) {
        for (const entry of target) callSafe(entry);
      } else if (target && typeof target.notifyObservers === "function") {
        try { target.notifyObservers(payload); } catch (err) { console.warn("[Terrain] onTerrainDeformed notify failed", err); }
      } else if (target && typeof target.emit === "function") {
        try { target.emit(payload); } catch (err) { console.warn("[Terrain] onTerrainDeformed emit failed", err); }
      } else if (target && typeof target.dispatch === "function") {
        try { target.dispatch(payload); } catch (err) { console.warn("[Terrain] onTerrainDeformed dispatch failed", err); }
      }
      const events = H.events;
      if (events) {
        const methods = ["emit", "dispatch", "fire", "trigger", "publish"];
        for (const method of methods) {
          if (typeof events[method] === "function") {
            try { events[method]("onTerrainDeformed", payload); } catch (err) { console.warn(`[Terrain] events.${method} failed`, err); }
          }
        }
        if (typeof events.notifyObservers === "function") {
          try { events.notifyObservers(payload); } catch (err) { console.warn("[Terrain] events.notifyObservers failed", err); }
        }
      }
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        try { window.dispatchEvent(new window.CustomEvent("onTerrainDeformed", { detail: payload })); } catch (err) {}
        try { window.dispatchEvent(new window.CustomEvent("terrainDeformed", { detail: payload })); } catch (err) {}
      }
    }

    function recomputeNormalsForRegion(minVX, maxVX, minVZ, maxVZ) {
      if (!state.normals || !state.positions) return null;
      const rowStride = state.vertexCountX;
      const startVX = Math.max(0, Math.floor(minVX));
      const endVX = Math.min(state.vertexCountX - 1, Math.ceil(maxVX));
      const startVZ = Math.max(0, Math.floor(minVZ));
      const endVZ = Math.min(state.vertexCountZ - 1, Math.ceil(maxVZ));
      if (startVX > endVX || startVZ > endVZ) return null;
      const normals = state.normals;
      const positions = state.positions;
      // expand one ring around region for smooth shading
      const vx0 = Math.max(0, startVX - 1);
      const vx1 = Math.min(state.vertexCountX - 1, endVX + 1);
      const vz0 = Math.max(0, startVZ - 1);
      const vz1 = Math.min(state.vertexCountZ - 1, endVZ + 1);
      for (let vz = vz0; vz <= vz1; vz++) {
        for (let vx = vx0; vx <= vx1; vx++) {
          const idx = vz * rowStride + vx;
          const nIndex = idx * 3;
          normals[nIndex] = 0;
          normals[nIndex + 1] = 0;
          normals[nIndex + 2] = 0;
        }
      }
      const accumulate = (ia, ib, ic) => {
        const aIndex = ia * 3;
        const bIndex = ib * 3;
        const cIndex = ic * 3;
        const ax = positions[aIndex];
        const ay = positions[aIndex + 1];
        const az = positions[aIndex + 2];
        const bx = positions[bIndex];
        const by = positions[bIndex + 1];
        const bz = positions[bIndex + 2];
        const cx = positions[cIndex];
        const cy = positions[cIndex + 1];
        const cz = positions[cIndex + 2];
        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;
        const acx = cx - ax;
        const acy = cy - ay;
        const acz = cz - az;
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const addNormal = (index) => {
          const nIdx = index * 3;
          normals[nIdx] += nx;
          normals[nIdx + 1] += ny;
          normals[nIdx + 2] += nz;
        };
        addNormal(ia);
        addNormal(ib);
        addNormal(ic);
      };
      for (let vz = vz0; vz < vz1; vz++) {
        for (let vx = vx0; vx < vx1; vx++) {
          const topLeft = vz * rowStride + vx;
          const bottomLeft = topLeft + rowStride;
          const topRight = topLeft + 1;
          const bottomRight = bottomLeft + 1;
          accumulate(topLeft, bottomLeft, topRight);
          accumulate(topRight, bottomLeft, bottomRight);
        }
      }
      for (let vz = vz0; vz <= vz1; vz++) {
        for (let vx = vx0; vx <= vx1; vx++) {
          const idx = vz * rowStride + vx;
          const nIndex = idx * 3;
          const nx = normals[nIndex];
          const ny = normals[nIndex + 1];
          const nz = normals[nIndex + 2];
          const len = Math.hypot(nx, ny, nz);
          if (len > 1e-5) {
            normals[nIndex] = nx / len;
            normals[nIndex + 1] = ny / len;
            normals[nIndex + 2] = nz / len;
          } else {
            normals[nIndex] = 0;
            normals[nIndex + 1] = 1;
            normals[nIndex + 2] = 0;
          }
        }
      }
      return { minVX: vx0, maxVX: vx1, minVZ: vz0, maxVZ: vz1 };
    }

    function applyDamage(options = {}) {
      if (!state.mesh || !state.positions || !state.heights) return false;
      const worldX = Number(options.worldX);
      const worldZ = Number(options.worldZ);
      const radius = Number(options.radius);
      const strength = Number(options.strength);
      if (!Number.isFinite(worldX) || !Number.isFinite(worldZ) || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(strength) || strength <= 0) {
        return false;
      }
      ensureOriginalHeightsInitialized();
      const falloff = options.falloff === "linear" ? "linear" : "gauss";
      const startX = -state.width * 0.5;
      const startZ = -state.depth * 0.5;
      const maxX = startX + state.width;
      const maxZ = startZ + state.depth;
      if (worldX < startX - radius || worldX > maxX + radius || worldZ < startZ - radius || worldZ > maxZ + radius) {
        return false;
      }
      const radiusSq = radius * radius;
      const rowStride = state.vertexCountX;
      const minWorldX = worldX - radius;
      const maxWorldX = worldX + radius;
      const minWorldZ = worldZ - radius;
      const maxWorldZ = worldZ + radius;
      const minVX = Math.max(0, Math.floor((minWorldX - startX) / state.stepX));
      const maxVX = Math.min(state.vertexCountX - 1, Math.ceil((maxWorldX - startX) / state.stepX));
      const minVZ = Math.max(0, Math.floor((minWorldZ - startZ) / state.stepZ));
      const maxVZ = Math.min(state.vertexCountZ - 1, Math.ceil((maxWorldZ - startZ) / state.stepZ));
      if (minVX > maxVX || minVZ > maxVZ) return false;
      let affected = 0;
      let lowestY = Number.POSITIVE_INFINITY;
      for (let vz = minVZ; vz <= maxVZ; vz++) {
        const worldZv = startZ + vz * state.stepZ;
        for (let vx = minVX; vx <= maxVX; vx++) {
          const worldXv = startX + vx * state.stepX;
          const dx = worldXv - worldX;
          const dz = worldZv - worldZ;
          const distSq = dx * dx + dz * dz;
          if (distSq > radiusSq) continue;
          const idx = vz * rowStride + vx;
          const dist = Math.sqrt(distSq);
          let factor = 0;
          if (falloff === "linear") {
            factor = 1 - dist / radius;
          } else {
            const sigma = radius * 0.5;
            const denom = sigma > 0 ? 2 * sigma * sigma : 1;
            factor = Math.exp(-(distSq) / denom);
          }
          if (factor <= 0) continue;
          const delta = strength * factor;
          const newHeight = state.heights[idx] - delta;
          state.heights[idx] = newHeight;
          state.positions[idx * 3 + 1] = newHeight;
          if (newHeight < lowestY) lowestY = newHeight;
          affected++;
        }
      }
      if (!affected) return false;
      const normalRegion = recomputeNormalsForRegion(minVX, maxVX, minVZ, maxVZ);
      if (normalRegion && state.normals) {
        state.mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, state.normals, false, false);
      }
      state.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, state.positions, false, false);
      state.mesh.refreshBoundingInfo();
      state.mesh.markAsDirty(BABYLON.VertexBuffer.PositionKind | BABYLON.VertexBuffer.NormalKind);
      state.dirty = false;
      const colorRegion = updateColorsForRegion(
        Math.max(0, minVX - 1),
        Math.min(state.vertexCountX - 1, maxVX + 1),
        Math.max(0, minVZ - 1),
        Math.min(state.vertexCountZ - 1, maxVZ + 1),
        { softBlend: true }
      );
      if (colorRegion) {
        commitColors();
      }
      emitTerrainDeformed({
        worldX,
        worldZ,
        radius,
        strength,
        falloff,
        affected,
        bounds: normalRegion || { minVX, maxVX, minVZ, maxVZ },
        lowestY,
      });
      return true;
    }

    function computeVertexHeight(vx, vz, terrain) {
      if (!terrain || !terrain.heights) return state.baseY;
      const colsX = terrain.colsX | 0;
      const colsZ = terrain.colsZ | 0;
      const heights = terrain.heights;
      let total = 0;
      let count = 0;
      for (let dz = -1; dz <= 0; dz++) {
        const cz = vz + dz;
        if (cz < 0 || cz >= colsZ) continue;
        for (let dx = -1; dx <= 0; dx++) {
          const cx = vx + dx;
          if (cx < 0 || cx >= colsX) continue;
          const idx = cz * colsX + cx;
          total += heights[idx] ?? 0;
          count++;
        }
      }
      const offset = count > 0 ? total / count : 0;
      return state.baseY + offset;
    }

    function updateVertexAt(vx, vz, terrain) {
      if (!state.positions || !state.heights) return;
      if (vx < 0 || vz < 0 || vx > state.segmentsX || vz > state.segmentsZ) return;
      const vertexIndex = vz * state.vertexCountX + vx;
      if (vertexIndex < 0 || vertexIndex >= state.heights.length) return;
      const height = computeVertexHeight(vx, vz, terrain);
      state.heights[vertexIndex] = height;
      state.positions[vertexIndex * 3 + 1] = height;
      state.dirty = true;
    }

    function updateColumn(columnIndex, terrain) {
      if (!Number.isInteger(columnIndex)) return;
      const colsX = terrain?.colsX | 0;
      if (colsX <= 0) return;
      const cx = columnIndex % colsX;
      const cz = Math.floor(columnIndex / colsX);
      for (let vz = cz; vz <= cz + 1; vz++) {
        for (let vx = cx; vx <= cx + 1; vx++) {
          updateVertexAt(vx, vz, terrain);
        }
      }
    }

    function updateAllVertices(terrain) {
      for (let vz = 0; vz <= state.segmentsZ; vz++) {
        for (let vx = 0; vx <= state.segmentsX; vx++) {
          updateVertexAt(vx, vz, terrain);
        }
      }
    }

    function init(options = {}) {
      const scene = resolveScene(options);
      if (!scene) {
        console.warn("[WorldUtils] Terrain.init requires an active Babylon scene");
        return null;
      }

      const width = Number.isFinite(options.width) ? Math.max(0.001, Math.abs(options.width)) : 1;
      const depth = Number.isFinite(options.depth) ? Math.max(0.001, Math.abs(options.depth)) : 1;
      const segmentsX = Math.max(1, resolveSegments(options.resolution, "x"));
      const segmentsZ = Math.max(1, resolveSegments(options.resolution, "z"));
      const vertexCountX = segmentsX + 1;
      const vertexCountZ = segmentsZ + 1;
      const vertexCount = vertexCountX * vertexCountZ;
      const stepX = width / segmentsX;
      const stepZ = depth / segmentsZ;
      const baseY = Number.isFinite(options.baseY) ? Number(options.baseY) : 0;

      dispose();

      const mesh = new BABYLON.Mesh(options.name || "terrainUnified", scene);
      mesh.isPickable = true;
      mesh.checkCollisions = true;
      mesh.receiveShadows = true;
      mesh.alwaysSelectAsActiveMesh = false;
      mesh.useVertexColors = true;
      mesh.hasVertexAlpha = true;

      const positions = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      const colors = new Float32Array(vertexCount * 4);
      const indices = new Uint32Array(segmentsX * segmentsZ * 6);
      const heights = new Float32Array(vertexCount);
      const originalHeights = new Float32Array(vertexCount);

      const baseColor = options.color ? toColor4(options.color, DEFAULT_COLOR) : DEFAULT_COLOR.clone();
      const appliedColor = state.pendingColor ? state.pendingColor.clone() : baseColor.clone();
      state.layerPalette = resolveLayerPalette(options.layerColors, appliedColor);
      state.depthThresholds = resolveDepthThresholds(options.depthThresholds, state.depthThresholds);
      state.colorBlendRing = options.colorBlendRing !== false;
      state.colorBlendStrength = Number.isFinite(options.colorBlendStrength)
        ? Math.max(0, Math.min(1, options.colorBlendStrength))
        : state.colorBlendStrength;
      const grassColor = state.layerPalette.grass || appliedColor;
      state.lastColorKey = encodeColorKey(grassColor);

      const startX = -width * 0.5;
      const startZ = -depth * 0.5;
      let v = 0;
      for (let z = 0; z < vertexCountZ; z++) {
        const posZ = startZ + z * stepZ;
        for (let x = 0; x < vertexCountX; x++) {
          const posX = startX + x * stepX;
          const pIndex = v * 3;
          positions[pIndex] = posX;
          positions[pIndex + 1] = baseY;
          positions[pIndex + 2] = posZ;
          heights[v] = baseY;
          originalHeights[v] = baseY;
          const cIndex = v * 4;
          colors[cIndex] = grassColor.r;
          colors[cIndex + 1] = grassColor.g;
          colors[cIndex + 2] = grassColor.b;
          colors[cIndex + 3] = grassColor.a;
          v++;
        }
      }

      let ii = 0;
      for (let z = 0; z < segmentsZ; z++) {
        for (let x = 0; x < segmentsX; x++) {
          const topLeft = z * vertexCountX + x;
          const bottomLeft = (z + 1) * vertexCountX + x;
          const topRight = topLeft + 1;
          const bottomRight = bottomLeft + 1;
          indices[ii++] = topLeft;
          indices[ii++] = bottomLeft;
          indices[ii++] = topRight;
          indices[ii++] = topRight;
          indices[ii++] = bottomLeft;
          indices[ii++] = bottomRight;
        }
      }

      BABYLON.VertexData.ComputeNormals(positions, indices, normals);

      mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, true);
      mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, true);
      mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors, true, 4);
      mesh.setIndices(indices);
      mesh.refreshBoundingInfo();
      mesh.metadata = { ...(mesh.metadata || {}), terrainUnified: true };

      if (options.material) mesh.material = options.material;
      if (options.parent) mesh.parent = options.parent;

      state.mesh = mesh;
      state.scene = scene;
      state.width = width;
      state.depth = depth;
      state.segmentsX = segmentsX;
      state.segmentsZ = segmentsZ;
      state.vertexCountX = vertexCountX;
      state.vertexCountZ = vertexCountZ;
      state.stepX = stepX;
      state.stepZ = stepZ;
      state.baseY = baseY;
      state.positions = positions;
      state.normals = normals;
      state.colors = colors;
      state.indices = indices;
      state.heights = heights;
      state.originalHeights = originalHeights;
      state.originalInitialized = false;
      state.dirty = false;
      state.colorsDirty = false;
      state.defaultColor = baseColor.clone();
      state.pendingColor = appliedColor.clone();
      state.activeRegion = null;

      return mesh;
    }

    function getMesh() {
      return state.mesh || null;
    }

    function worldToVertex(x, z) {
      if (!state.mesh || !Number.isFinite(x) || !Number.isFinite(z)) return null;
      if (x < -state.width * 0.5 || x > state.width * 0.5 || z < -state.depth * 0.5 || z > state.depth * 0.5) return null;
      const localX = (x + state.width * 0.5) / state.stepX;
      const localZ = (z + state.depth * 0.5) / state.stepZ;
      const vx = Math.max(0, Math.min(state.vertexCountX - 1, Math.floor(localX)));
      const vz = Math.max(0, Math.min(state.vertexCountZ - 1, Math.floor(localZ)));
      const fx = Math.min(1, Math.max(0, localX - vx));
      const fz = Math.min(1, Math.max(0, localZ - vz));
      const index = vz * state.vertexCountX + vx;
      return {
        vx,
        vz,
        index,
        fx,
        fz,
        cellX: Math.max(0, Math.min(state.segmentsX - 1, vx)),
        cellZ: Math.max(0, Math.min(state.segmentsZ - 1, vz)),
        position: new BABYLON.Vector3(state.positions[index * 3], state.heights[index], state.positions[index * 3 + 2])
      };
    }

    function sampleHeight(x, z) {
      if (!state.mesh || !Number.isFinite(x) || !Number.isFinite(z)) return null;
      if (x < -state.width * 0.5 || x > state.width * 0.5 || z < -state.depth * 0.5 || z > state.depth * 0.5) return null;
      const localX = (x + state.width * 0.5) / state.stepX;
      const localZ = (z + state.depth * 0.5) / state.stepZ;
      const cellX = Math.max(0, Math.min(state.segmentsX - 1, Math.floor(localX)));
      const cellZ = Math.max(0, Math.min(state.segmentsZ - 1, Math.floor(localZ)));
      const fx = Math.min(1, Math.max(0, localX - cellX));
      const fz = Math.min(1, Math.max(0, localZ - cellZ));
      const rowStride = state.vertexCountX;
      const idx = cellZ * rowStride + cellX;
      const idxRight = idx + 1;
      const idxDown = idx + rowStride;
      const idxDownRight = idxDown + 1;
      const h00 = state.heights[idx] ?? state.baseY;
      const h10 = state.heights[idxRight] ?? h00;
      const h01 = state.heights[idxDown] ?? h00;
      const h11 = state.heights[idxDownRight] ?? h10;
      const h0 = h00 + (h10 - h00) * fx;
      const h1 = h01 + (h11 - h01) * fx;
      return h0 + (h1 - h0) * fz;
    }

    function updateFromColumns(terrain, opts = {}) {
      if (!terrain || !state.mesh) return false;
      const colsX = Number(terrain.colsX);
      const colsZ = Number(terrain.colsZ);
      if (!terrain.heights || !Number.isInteger(colsX) || !Number.isInteger(colsZ)) return false;
      if (colsX !== state.segmentsX || colsZ !== state.segmentsZ) return false;
      state.baseY = Number.isFinite(terrain.baseY) ? Number(terrain.baseY) : state.baseY;
      const { columnIndex, columnIndices } = opts;
      const regions = [];
      if (Array.isArray(columnIndices) && columnIndices.length) {
        for (const idx of columnIndices) {
          updateColumn(idx, terrain);
          const cx = idx % colsX;
          const cz = Math.floor(idx / colsX);
          regions.push({
            minVX: Math.max(0, cx - 1),
            maxVX: Math.min(state.vertexCountX - 1, cx + 2),
            minVZ: Math.max(0, cz - 1),
            maxVZ: Math.min(state.vertexCountZ - 1, cz + 2)
          });
        }
      } else if (Number.isInteger(columnIndex)) {
        updateColumn(columnIndex, terrain);
        const cx = columnIndex % colsX;
        const cz = Math.floor(columnIndex / colsX);
        regions.push({
          minVX: Math.max(0, cx - 1),
          maxVX: Math.min(state.vertexCountX - 1, cx + 2),
          minVZ: Math.max(0, cz - 1),
          maxVZ: Math.min(state.vertexCountZ - 1, cz + 2)
        });
      } else {
        updateAllVertices(terrain);
      }
      commit(true);
      if (!regions.length) {
        ensureOriginalHeightsInitialized(true);
        refreshAllVertexColors({ resetOriginal: true });
      } else {
        ensureOriginalHeightsInitialized();
        if (state.originalHeights) {
          for (const region of regions) {
            refreshOriginalHeightsForRegion(region.minVX, region.maxVX, region.minVZ, region.maxVZ);
          }
        }
        let changed = false;
        for (const region of regions) {
          const updated = updateColorsForRegion(region.minVX, region.maxVX, region.minVZ, region.maxVZ, { softBlend: true });
          if (updated) changed = true;
        }
        if (changed) commitColors();
      }
      return true;
    }

    function setColor(color) {
      const resolved = toColor4(color, state.defaultColor);
      state.pendingColor = resolved.clone();
      state.defaultColor = resolved.clone();
      state.layerPalette = resolveLayerPalette(null, resolved);
      state.lastColorKey = encodeColorKey(state.layerPalette.grass);
      if (!state.mesh || !state.colors) {
        return resolved;
      }
      refreshAllVertexColors();
      return resolved;
    }

    function applyRegionAmbient(ambient = {}) {
      if (!ambient) {
        setColor(state.defaultColor);
        return;
      }
      const color = ambient.ground ?? ambient.color ?? ambient.base ?? null;
      if (color) {
        setColor(color);
      } else {
        setColor(state.defaultColor);
      }
    }

    function setActiveRegion(region) {
      state.activeRegion = region || null;
      if (region?.ambient) {
        applyRegionAmbient(region.ambient);
      }
    }

    function setDepthThresholds(thresholds) {
      state.depthThresholds = resolveDepthThresholds(thresholds, state.depthThresholds);
      if (!state.mesh || !state.colors) {
        return { ...state.depthThresholds };
      }
      const region = updateColorsForRegion(0, state.vertexCountX - 1, 0, state.vertexCountZ - 1, {
        depthThresholds: state.depthThresholds,
        softBlend: true
      });
      if (region) commitColors();
      return { ...state.depthThresholds };
    }

    function getDepthThresholds() {
      return { ...state.depthThresholds };
    }

    return {
      init,
      dispose,
      getMesh,
      sampleHeight,
      worldToVertex,
      applyDamage,
      updateFromColumns,
      applyRegionAmbient,
      setActiveRegion,
      setColor,
      getActiveRegion: () => state.activeRegion,
      setDepthThresholds,
      getDepthThresholds
    };
  })();

  H.Terrain = Terrain;

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
    if (H.Terrain && typeof H.Terrain.applyRegionAmbient === "function") {
      try { H.Terrain.applyRegionAmbient(colors); } catch (err) {
        console.warn("[WorldUtils] Failed to apply terrain ambient", err);
      }
    }
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
    throw new Error("buildChunkGeometry requires a blockData object");
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
    throw new Error("buildChunkGeometry could not infer chunk dimensions");
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
    throw new Error("buildChunkGeometry requires a getBlock function or blocks array");
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

  function buildChunkGeometry(blockData, opts = {}) {
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

  function buildChunkMesh(blocks, opts = {}) {
    if (typeof BABYLON === "undefined" || !BABYLON.Mesh || !BABYLON.VertexData) {
      throw new Error("buildChunkMesh requires Babylon.js to be loaded");
    }

    const options = opts || {};
    const chunkSize = options.chunkSize || {};
    const chunkId = options.chunkId || { cx: 0, cy: 0, cz: 0 };
    const materials = options.materials || {};
    const layerSelector = typeof options.layerSelector === "function" ? options.layerSelector : null;

    const SX = Number.isFinite(chunkSize.x) ? chunkSize.x | 0 : 0;
    const SY = Number.isFinite(chunkSize.y) ? chunkSize.y | 0 : 0;
    const SZ = Number.isFinite(chunkSize.z) ? chunkSize.z | 0 : 0;
    if (!SX || !SY || !SZ) {
      throw new Error("buildChunkMesh requires chunkSize {x,y,z}");
    }

    const total = SX * SY * SZ;
    if (!blocks || typeof blocks.length !== "number" || blocks.length < total) {
      throw new Error("buildChunkMesh requires a dense block array matching chunk dimensions");
    }

    const scene = options.scene
      || materials.scene
      || window.scene
      || (BABYLON.Engine && BABYLON.Engine.LastCreatedScene)
      || window.HXH?.scene
      || null;
    if (!scene) {
      throw new Error("buildChunkMesh requires a Babylon scene reference");
    }

    const layers = {
      solid: { positions: [], normals: [], uvs: [], indices: [] },
      alpha: { positions: [], normals: [], uvs: [], indices: [] }
    };

    function pushQuad(layer, positions, normal, uv) {
      const base = layer.positions.length / 3;
      for (let i = 0; i < 4; i++) {
        layer.positions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        layer.normals.push(normal[0], normal[1], normal[2]);
        layer.uvs.push(uv[i * 2], uv[i * 2 + 1]);
      }
      layer.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const strideX = 1;
    const strideY = SX;
    const strideZ = SX * SY;
    const wx = (chunkId.cx || 0) * SX;
    const wy = (chunkId.cy || 0) * SY;
    const wz = (chunkId.cz || 0) * SZ;

    function getBlockIndex(x, y, z) {
      return x * strideX + y * strideY + z * strideZ;
    }

    function getBlock(x, y, z) {
      if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return 0;
      const idx = getBlockIndex(x, y, z);
      const value = blocks[idx];
      return value == null ? 0 : value | 0;
    }

    function getLayer(id) {
      if (!id) return null;
      const layer = layerSelector ? layerSelector(id) : "solid";
      return layer === "alpha" ? "alpha" : "solid";
    }

    for (let z = 0; z < SZ; z++) {
      for (let y = 0; y < SY; y++) {
        for (let x = 0; x < SX; x++) {
          const id = getBlock(x, y, z);
          if (!id) continue;
          const layerName = getLayer(id) || "solid";
          const targetLayer = layers[layerName] || layers.solid;

          const neighbors = {
            px: { id: getBlock(x + 1, y, z) },
            nx: { id: getBlock(x - 1, y, z) },
            py: { id: getBlock(x, y + 1, z) },
            ny: { id: getBlock(x, y - 1, z) },
            pz: { id: getBlock(x, y, z + 1) },
            nz: { id: getBlock(x, y, z - 1) }
          };

          for (const key of Object.keys(neighbors)) {
            const entry = neighbors[key];
            entry.layer = entry.id ? getLayer(entry.id) : null;
          }

          const X = wx + x;
          const Y = wy + y;
          const Z = wz + z;

          if (!neighbors.px.id || neighbors.px.layer !== layerName) {
            pushQuad(targetLayer,
              [X + 1, Y, Z, X + 1, Y, Z + 1, X + 1, Y + 1, Z + 1, X + 1, Y + 1, Z],
              [1, 0, 0],
              [0, 0, 1, 0, 1, 1, 0, 1]
            );
          }

          if (!neighbors.nx.id || neighbors.nx.layer !== layerName) {
            pushQuad(targetLayer,
              [X, Y, Z + 1, X, Y, Z, X, Y + 1, Z, X, Y + 1, Z + 1],
              [-1, 0, 0],
              [0, 0, 1, 0, 1, 1, 0, 1]
            );
          }

          if (!neighbors.py.id || neighbors.py.layer !== layerName) {
            pushQuad(targetLayer,
              [X, Y + 1, Z, X + 1, Y + 1, Z, X + 1, Y + 1, Z + 1, X, Y + 1, Z + 1],
              [0, 1, 0],
              [0, 0, 1, 0, 1, 1, 0, 1]
            );
          }

          if (!neighbors.ny.id || neighbors.ny.layer !== layerName) {
            pushQuad(targetLayer,
              [X, Y, Z + 1, X + 1, Y, Z + 1, X + 1, Y, Z, X, Y, Z],
              [0, -1, 0],
              [0, 0, 1, 0, 1, 1, 0, 1]
            );
          }

          if (!neighbors.pz.id || neighbors.pz.layer !== layerName) {
            pushQuad(targetLayer,
              [X + 1, Y, Z + 1, X, Y, Z + 1, X, Y + 1, Z + 1, X + 1, Y + 1, Z + 1],
              [0, 0, 1],
              [0, 0, 1, 0, 1, 1, 0, 1]
            );
          }

          if (!neighbors.nz.id || neighbors.nz.layer !== layerName) {
            pushQuad(targetLayer,
              [X, Y, Z, X + 1, Y, Z, X + 1, Y + 1, Z, X, Y + 1, Z],
              [0, 0, -1],
              [0, 0, 1, 0, 1, 1, 0, 1]
            );
          }
        }
      }
    }

    const { Mesh, VertexData } = BABYLON;
    const solidName = `chunk_${chunkId.cx ?? 0}_${chunkId.cy ?? 0}_${chunkId.cz ?? 0}`;

    function makeMeshFromLayer(name, layerData, material) {
      const mesh = new Mesh(name, scene);
      const vertexData = new VertexData();
      vertexData.positions = new Float32Array(layerData.positions);
      vertexData.indices = new Uint32Array(layerData.indices);
      vertexData.normals = new Float32Array(layerData.normals);
      vertexData.uvs = new Float32Array(layerData.uvs);
      vertexData.applyToMesh(mesh, true);
      if (material) mesh.material = material;
      mesh.alwaysSelectAsActiveMesh = false;
      mesh.refreshBoundingInfo();
      mesh.metadata = { ...(mesh.metadata || {}), chunkId: { ...chunkId } };
      return mesh;
    }

    const hasSolid = layers.solid.indices.length > 0;
    const hasAlpha = layers.alpha.indices.length > 0;

    let mainMesh = null;

    if (!hasSolid && hasAlpha) {
      const alphaOnlyMesh = makeMeshFromLayer(solidName, layers.alpha, materials.alpha);
      if (alphaOnlyMesh.material && Object.prototype.hasOwnProperty.call(alphaOnlyMesh.material, "backFaceCulling")) {
        alphaOnlyMesh.material.backFaceCulling = true;
      }
      return alphaOnlyMesh;
    }

    mainMesh = makeMeshFromLayer(solidName, layers.solid, materials.solid);

    if (hasAlpha) {
      const alphaMesh = makeMeshFromLayer(`${solidName}_alpha`, layers.alpha, materials.alpha);
      if (alphaMesh.material && Object.prototype.hasOwnProperty.call(alphaMesh.material, "backFaceCulling")) {
        alphaMesh.material.backFaceCulling = true;
      }
      alphaMesh.parent = mainMesh;
      alphaMesh.refreshBoundingInfo();
    }

    mainMesh.refreshBoundingInfo();
    return mainMesh;
  }

  function buildChunkMeshAsync(blockData, opts = {}) {
    const jobs = WorkerJobs;
    const resolveGeometry = () => {
      const geometry = buildChunkGeometry(blockData, opts);
      if (geometry && typeof geometry === "object" && "result" in geometry) {
        return geometry.result;
      }
      return geometry;
    };
    if (!jobs || typeof jobs.requestChunkMesh !== "function") {
      return Promise.resolve(resolveGeometry());
    }
    try {
      const job = jobs.requestChunkMesh(blockData, opts);
      if (!job || typeof job.then !== "function") {
        return Promise.resolve(resolveGeometry());
      }
      return job.catch((err) => {
        console.warn("[WorldUtils] Chunk mesh worker failed, falling back", err);
        return resolveGeometry();
      });
    } catch (err) {
      console.warn("[WorldUtils] Unable to queue chunk mesh job", err);
      return Promise.resolve(resolveGeometry());
    }
  }

  H.buildChunkGeometry = buildChunkGeometry;
  H.buildChunkMeshData = buildChunkGeometry;
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
    buildChunkGeometry,
    buildChunkMesh,
    buildChunkMeshAsync,
    WorkerJobs,
    Terrain,
    FLAGS,
    isUnifiedTerrainEnabled: () => FLAGS.USE_UNIFIED_TERRAIN !== false,
    isUnifiedTerrainActive: () => {
      if (FLAGS.USE_UNIFIED_TERRAIN === false) return false;
      const mesh = typeof Terrain.getMesh === "function" ? Terrain.getMesh() : null;
      if (!mesh) return false;
      if (typeof mesh.isDisposed === "function" && mesh.isDisposed()) return false;
      return true;
    },
    getUnifiedTerrainMesh: () => (typeof Terrain.getMesh === "function" ? Terrain.getMesh() : null),
    GameSettings: window.GameSettings || H.GameSettings
  };
  window.WorldUtils = WorldUtils;
})();
