// nen-core.js — Nen resource/core logic (delegated)
(function(){
  const H = (window.HXH ||= {});
  const NenCore = {
    setCooldown: (...a)=>H.setCooldown?.(...a),
    gainXP: (...a)=>H.gainXP?.(...a),
    xpToNext: (...a)=>H.xpToNext?.(...a),
    getAuraState: ()=>H.getAuraState?.(),
    onAuraChange: (fn)=>H.subscribeAura?.(fn),
    refreshAuraHud: ()=>H.updateAuraHud?.()
  };
  window.NenCore = NenCore;
})();
