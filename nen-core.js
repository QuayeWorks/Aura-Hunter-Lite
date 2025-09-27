// nen-core.js — Nen resource/core logic (delegated)
(function(){
  const H = (window.HXH ||= {});
  const NenCore = {
    setCooldown: (...a)=>H.setCooldown?.(...a),
    gainXP: (...a)=>H.gainXP?.(...a),
    xpToNext: (...a)=>H.xpToNext?.(...a)
  };
  window.NenCore = NenCore;
})();
