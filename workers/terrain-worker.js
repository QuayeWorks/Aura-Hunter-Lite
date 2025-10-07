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

ctx.addEventListener('message', (event) => {
  const data = event?.data || {};
  const { jobId, payload } = data;
  if (typeof jobId !== 'number') {
    return;
  }

  try {
    const { chunkVoxels, chunkSize = 0, scale = 1, atlasRects = [], flags = {} } = payload || {};
    const voxels = toUint32Array(chunkVoxels) || new Uint32Array(0);

    const occupancy = new Uint8Array(voxels.length);
    let solidCount = 0;
    for (let i = 0; i < voxels.length; i += 1) {
      const solid = voxels[i] !== 0 ? 1 : 0;
      occupancy[i] = solid;
      solidCount += solid;
    }

    const result = {
      chunkSize,
      scale,
      atlasRects,
      flags,
      voxelCount: voxels.length,
      solidCount,
      occupancy
    };

    ctx.postMessage({ jobId, result }, [occupancy.buffer]);
  } catch (err) {
    const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
    ctx.postMessage({ jobId, error: message });
  }
});
