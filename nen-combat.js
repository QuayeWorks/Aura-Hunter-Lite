// nen-combat.js — Attacks & abilities (delegated) + damage hook exports
const getHXH = () => {
  if (typeof window.HXH !== "object" || !window.HXH) {
    window.HXH = {};
  }
  return window.HXH;
};

const getItemsModule = () => (typeof window.Items === "object" && window.Items ? window.Items : null);

const SHU_LIMB_KEYWORDS = ["melee", "weapon", "blade", "projectile", "arrow", "dagger", "knife", "spear", "throw"];

function isWeaponLimb(limb) {
  if (typeof limb !== "string" || !limb) return false;
  const key = limb.toLowerCase();
  if (!key) return false;
  if (key.startsWith("nen")) return false;
  if (key === "projectile") return true;
  for (const token of SHU_LIMB_KEYWORDS) {
    if (key.includes(token)) return true;
  }
  return false;
}

function applyShuDamage(playerState, limb, damage) {
  const aura = playerState?.aura;
  if (!aura) return damage;
  const shuActive = aura.__shuActive ?? aura.shu;
  if (!shuActive) return damage;
  if (!isWeaponLimb(limb)) return damage;

  const Items = getItemsModule();
  const weapon = Items?.getActiveWeapon?.(playerState) ?? playerState.weapon ?? null;
  const weaponOut = aura.__shuWeaponOut ?? (Items?.isWeaponOut ? Items.isWeaponOut(playerState, weapon) : !!weapon);
  if (!weaponOut) return damage;

  const mods = aura.__shuModifiers || Items?.computeShuModifiers?.(playerState, weapon) || null;
  let mul = 1.3;
  if (mods && typeof mods === "object") {
    const cand = mods.damageMul ?? mods.damageMultiplier;
    if (typeof cand === "number" && Number.isFinite(cand) && cand > 0) {
      mul = cand;
    }
  }
  return damage * mul;
}

export function applyOutgoingDamage(src, limb, baseDamage) {
  const H = getHXH();
  let working = baseDamage;
  let result = working;
  const playerState = H.state;
  if (src && playerState && src === playerState) {
    working = applyShuDamage(playerState, limb, working);
    result = working;
    const strike = playerState.koStrike;
    if (strike) {
      const advanced = typeof window !== "undefined" ? window.NenAdvanced : null;
      if (advanced && typeof advanced.onKoStrike === "function") {
        try {
          advanced.onKoStrike(strike, { limb, baseDamage, source: src });
        } catch (err) {
          console.warn("[HXH] NenAdvanced.onKoStrike failed", err);
        }
      }
      playerState.koStrike = null;
      if (!strike.limb || strike.limb === limb) {
        const mult = Number.isFinite(strike.multiplier) ? strike.multiplier : 1;
        let final = working * mult;
        if (playerState.aura && playerState.aura.gyo) {
          final *= 1.15;
        }
        result = final;
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
