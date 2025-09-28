// hud.js — HUD helpers delegated to game internals
(function(){
  const H = (window.HXH ||= {});
  const ensureHudRoot = () => document.getElementById("hud");
  const ensureHead = () => document.head || document.getElementsByTagName("head")[0] || null;

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
    getFlowState: (...a)=>H.getFlowState?.(...a),
    getHudRoot: ensureHudRoot,
    ensureLayer(id, className = "") {
      const root = ensureHudRoot();
      if (!root || !id) return null;
      let layer = root.querySelector(`#${id}`);
      if (!layer) {
        layer = document.createElement("div");
        layer.id = id;
        layer.setAttribute("data-hud-layer", id);
        layer.style.pointerEvents = "none";
        root.appendChild(layer);
      }
      if (className) {
        className.split(/\s+/).filter(Boolean).forEach(cls => layer.classList.add(cls));
      }
      return layer;
    },
    injectStyles(id, css) {
      if (!id || !css) return null;
      const head = ensureHead();
      if (!head) return null;
      const existing = document.getElementById(id);
      if (existing) return existing;
      const style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      head.appendChild(style);
      return style;
    }
  };
  window.HUD = HUD;
})();
