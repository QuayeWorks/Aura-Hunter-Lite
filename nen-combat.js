// nen-combat.js — Attacks & abilities (delegated) + damage hook exports
const getHXH = () => {
  if (typeof window.HXH !== "object" || !window.HXH) {
    window.HXH = {};
  }
  return window.HXH;
};

export function applyOutgoingDamage(src, limb, baseDamage) {
  console.log("[HXH] applyOutgoingDamage", limb, baseDamage);
  return baseDamage;
}

export function applyIncomingDamage(dst, limb, baseDamage) {
  console.log("[HXH] applyIncomingDamage", limb, baseDamage);
  return baseDamage;
}

const H = getHXH();
H.applyOutgoingDamage = applyOutgoingDamage;
H.applyIncomingDamage = applyIncomingDamage;

const NenCombat = {
  blast: (...a) => getHXH().blast?.(...a),
  dash: (...a) => getHXH().dash?.(...a),
  special: (...a) => getHXH().special?.(...a),
  nearestEnemy: (...a) => getHXH().nearestEnemy?.(...a),
};

window.NenCombat = NenCombat;
