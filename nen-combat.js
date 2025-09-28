// nen-combat.js — Attacks & abilities (delegated) + damage hook exports
const getHXH = () => {
  if (typeof window.HXH !== "object" || !window.HXH) {
    window.HXH = {};
  }
  return window.HXH;
};

export function applyOutgoingDamage(src, limb, baseDamage) {
  const H = getHXH();
  let result = baseDamage;
  const playerState = H.state;
  if (src && playerState && src === playerState) {
    const strike = playerState.koStrike;
    if (strike) {
      playerState.koStrike = null;
      if (!strike.limb || strike.limb === limb) {
        const mult = Number.isFinite(strike.multiplier) ? strike.multiplier : 1;
        result = baseDamage * mult;
      }
    }
  }
  console.log("[HXH] applyOutgoingDamage", limb, baseDamage, "->", result);
  return result;
}

export function applyIncomingDamage(dst, limb, baseDamage) {
  const H = getHXH();
  let result = baseDamage;
  if (dst && typeof dst === "object") {
    const aura = dst.aura || (dst === H.state ? H.state?.aura : undefined);
    if (aura?.ken) {
      result *= 0.75;
    }
    const vulnerabilityT = Number.isFinite(dst.koVulnerabilityT) ? dst.koVulnerabilityT : 0;
    if (vulnerabilityT > 0) {
      const vulnMult = Number.isFinite(dst.koVulnerabilityMultiplier) ? dst.koVulnerabilityMultiplier : 1.5;
      result *= vulnMult;
    }
  }
  console.log("[HXH] applyIncomingDamage", limb, baseDamage, "->", result);
  return result;
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
