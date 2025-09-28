// enemies.js — thin accessors around enemy collections
(function(){
  const H = (window.HXH ||= {});
  const watchers = new Set();

  function notify(plan) {
    for (const cb of watchers) {
      try {
        cb?.(plan);
      } catch (err) {
        console.warn("[Enemies] Spawn plan listener failed", err);
      }
    }
  }

  const API = {
    list: ()=>H.enemies,
    projectiles: ()=>H.projectiles,
    getLastSpawnPlan: ()=>window.Spawns?.getLastPlan?.() || null,
    getActiveRegion: ()=>window.Spawns?.getActiveRegion?.() || null,
    onSpawnPlan(cb) {
      if (typeof cb !== "function") return () => {};
      watchers.add(cb);
      return () => watchers.delete(cb);
    },
    __notifySpawnPlan(plan) {
      notify(plan);
    }
  };

  window.Enemies = API;
})();
