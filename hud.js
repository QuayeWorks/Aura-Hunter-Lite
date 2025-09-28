// hud.js — HUD helpers delegated to game internals
(function(){
  const H = (window.HXH ||= {});
  const HUD = {
    update: (...a)=>H.updateHUD?.(...a),
    updateCooldowns: (...a)=>H.updateCooldownUI?.(...a),
    setCooldown: (...a)=>H.setCooldown?.(...a),
    isCooldown: (...a)=>H.cdActive?.(...a),
    message: (...a)=>H.msg?.(...a),
    updateAuraStrip: (...a)=>H.updateAuraHud?.(...a),
    subscribeAura: (...a)=>H.subscribeAura?.(...a),
    getAuraState: (...a)=>H.getAuraState?.(...a),
    updateFlow: (...a)=>H.updateFlowHud?.(...a),
    getFlowState: (...a)=>H.getFlowState?.(...a)
  };
  window.HUD = HUD;
})();
