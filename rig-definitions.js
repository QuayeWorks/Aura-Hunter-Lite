// rig-definitions.js — shared rig schema used by the game & editor
(function(){
  const Fallback = window.HXH && window.HXH.getRig ? window.HXH.getRig() : null;
  const RigDefinitions = window.RigDefinitions || (Fallback ? {
    // Provide at least PART_KEYS so the editor can align
    PART_KEYS: (window.HXH && window.HXH.PART_KEYS) || [
      "pelvis","torsoLower","torsoUpper","neck","head",
      "shoulderL","armL_upper","armL_fore","armL_hand",
      "shoulderR","armR_upper","armR_fore","armR_hand",
      "hipL","legL_thigh","legL_shin","legL_foot",
      "hipR","legR_thigh","legR_shin","legR_foot"
    ]
  } : {});
  window.RigDefinitions = RigDefinitions;
})();
