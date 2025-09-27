// hud.js — HUD helpers delegated to game internals
(function(){
  const H = (window.HXH ||= {});
  const HUD = {
    update: (...a)=>H.updateHUD?.(...a),
    updateCooldowns: (...a)=>H.updateCooldownUI?.(...a),
    setCooldown: (...a)=>H.setCooldown?.(...a),
    isCooldown: (...a)=>H.cdActive?.(...a),
    message: (...a)=>H.msg?.(...a)
  };
  window.HUD = HUD;
})();
