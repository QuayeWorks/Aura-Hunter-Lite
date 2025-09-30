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
  const defaultCosmetics = {
    faces: [
      { id: "neutral", label: "Neutral" },
      { id: "grin", label: "Brave Grin" },
      { id: "focused", label: "Focused" }
    ],
    hair: [
      { id: "buzz", label: "Buzz Cut", primaryColor: "#2f2f38", secondaryColor: "#3c3f4f" },
      { id: "windswept", label: "Windswept", primaryColor: "#1e2f6f", secondaryColor: "#2f478f" },
      { id: "scout_hat", label: "Explorer Hat", primaryColor: "#6a4d32", secondaryColor: "#8c6a3e" }
    ],
    outfits: {
      top: {
        hunter: { id: "hunter", label: "Hunter Jacket", body: "#2d3d8f", accent: "#66c1ff", sleeve: "#1f2d64" },
        stealth: { id: "stealth", label: "Night Coat", body: "#1b1d28", accent: "#4d5978", sleeve: "#282b3c" },
        festival: { id: "festival", label: "Festival Vest", body: "#c55a5a", accent: "#f5d36a", sleeve: "#a44646" }
      },
      bottom: {
        scout: { id: "scout", label: "Scout Pants", hips: "#243244", thigh: "#1d2736", shin: "#324763" },
        stealth: { id: "stealth", label: "Night Trousers", hips: "#1a1c26", thigh: "#12141c", shin: "#2a2d3a" },
        festival: { id: "festival", label: "Festival Wraps", hips: "#7a3131", thigh: "#592424", shin: "#dd8a4a" }
      },
      full: {
        ranger: { id: "ranger", label: "Hunter Ranger", top: "hunter", bottom: "scout" },
        nocturne: { id: "nocturne", label: "Nocturne Operative", top: "stealth", bottom: "stealth" },
        parade: { id: "parade", label: "Parade Attire", top: "festival", bottom: "festival" }
      }
    },
    shoes: {
      standard: { id: "standard", label: "Standard Boots", base: "#2f2f38", accent: "#585d70" },
      sprint: { id: "sprint", label: "Sprint Sneakers", base: "#26486a", accent: "#69d1ff" },
      trail: { id: "trail", label: "Trail Runners", base: "#4a3522", accent: "#efb459" }
    },
    accessories: {
      visor: { id: "visor", label: "Nen Visor", color: "#68c9ff", accent: "#2b7fd0" },
      earrings: { id: "earrings", label: "Twin Studs", color: "#f6f0d6", accent: "#c9c2a5" },
      scarf: { id: "scarf", label: "Aura Scarf", color: "#d4643f", accent: "#f3ad7a" }
    }
  };

  const fallbackDefaultCosmetics = {
    face: "neutral",
    hair: "windswept",
    outfit: { top: "hunter", bottom: "scout", full: "ranger" },
    shoes: "standard",
    accessories: []
  };

  if (!RigDefinitions.COSMETICS) {
    RigDefinitions.COSMETICS = defaultCosmetics;
  }
  if (!RigDefinitions.DEFAULT_COSMETICS) {
    RigDefinitions.DEFAULT_COSMETICS = fallbackDefaultCosmetics;
  }

  window.RigDefinitions = RigDefinitions;
})();
