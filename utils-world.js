// utils-world.js
(function(){
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash3(seedFloat, a, b) {
    const base = Math.floor((seedFloat * 1e6) ^ 0) ^ (a * 2654435761) ^ (b | 0);
    let h = base >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
  }
  window.Utils = { mulberry32, hash3 };
})();

// The helpers below rely on globals (scene, world, environment) defined in game.js.
// They’re intentionally lightweight and can be moved into a namespace later.
(function(){
  const VEC3_UP = new BABYLON.Vector3(0,1,0);
  const GROUND_STICK_THRESHOLD = 0.35;
  const FOOT_CLEARANCE = 0.012;

  window.isGroundMesh = function isGroundMesh(mesh){
    if (!mesh) return false;
    const meta = mesh.metadata;
    if (meta && meta.terrainBlock && !meta.terrainBlock.destroyed && mesh.isEnabled && mesh.isEnabled()) return true;
    return (window.world?.platforms || []).includes(mesh);
  };

  window.isTreeMesh = function isTreeMesh(mesh){
    if (!mesh || (typeof mesh.isDisposed==="function" && mesh.isDisposed())) return false;
    const entry = mesh.metadata?.treePart;
    return !!entry && !entry.destroyed;
  };

  window.isGroundOrTreeMesh = function isGroundOrTreeMesh(mesh){
    return isGroundMesh(mesh) || isTreeMesh(mesh);
  };

  window.resolveGrounding = function resolveGrounding(mesh, velY){
    if (!window.scene || !mesh || mesh.isDisposed()) {
      return { grounded:false, correction:0, normal:VEC3_UP, distance:Infinity, hitPointY:-Infinity };
    }
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo(); bi.update(mesh.getWorldMatrix());
    const groundY = typeof getTerrainHeight === "function" ? getTerrainHeight(mesh.position.x, mesh.position.z) : null;
    if (groundY === null) {
      return { grounded:false, correction:0, normal:VEC3_UP, distance:Infinity, hitPointY:-Infinity };
    }
    const bottom = bi.boundingBox.minimumWorld.y;
    const distToGround = bottom - groundY;
    const grounded = velY <= 0.4 && distToGround <= GROUND_STICK_THRESHOLD;
    const desiredMin = groundY + FOOT_CLEARANCE;
    const correction = grounded ? Math.max(0, desiredMin - bottom) : 0;
    return { grounded, correction, normal:VEC3_UP, distance:distToGround, hitPointY:groundY };
  };
})();
