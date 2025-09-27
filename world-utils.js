// world-utils.js — thin wrappers exposing world/terrain helpers via window.HXH
(function(){
  const H = (window.HXH ||= {});
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
    removeTerrainCubeAtPoint: (...a)=>H.removeTerrainCubeAtPoint?.(...a),
    scatterVegetation: (...a)=>H.scatterVegetation?.(...a),
    clearTrees: (...a)=>H.clearTrees?.(...a),
    createCloudLayer: (...a)=>H.createCloudLayer?.(...a),
    advanceEnvironment: (...a)=>H.advanceEnvironment?.(...a),
    updateEnvironment: (...a)=>H.updateEnvironment?.(...a),
    GameSettings: window.GameSettings || H.GameSettings
  };
  window.WorldUtils = WorldUtils;
})();
