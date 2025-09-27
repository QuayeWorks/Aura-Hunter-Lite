// nen-combat.js — Attacks & abilities (delegated)
(function(){
  const H = (window.HXH ||= {});
  const NenCombat = {
    blast: (...a)=>H.blast?.(...a),
    dash:  (...a)=>H.dash?.(...a),
    special:(...a)=>H.special?.(...a),
    nearestEnemy:(...a)=>H.nearestEnemy?.(...a)
  };
  window.NenCombat = NenCombat;
})();
