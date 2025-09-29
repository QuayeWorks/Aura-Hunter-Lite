// nen-combat.js — Attacks & abilities (delegated) + damage hook exports
const getHXH = () => {
  if (typeof window.HXH !== "object" || !window.HXH) {
    window.HXH = {};
  }
  return window.HXH;
};

const getItemsModule = () => (typeof window.Items === "object" && window.Items ? window.Items : null);

const SHU_LIMB_KEYWORDS = ["melee", "weapon", "blade", "projectile", "arrow", "dagger", "knife", "spear", "throw"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nowMs() {
  if (typeof performance === "object" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getNenType(state) {
  if (!state || typeof state !== "object") return null;
  if (typeof state.nenType === "string") return state.nenType;
  if (typeof state.ch?.nen === "string") return state.ch.nen;
  return null;
}

function applyBoundSigilBuff(src, damage) {
  if (!src || typeof src !== "object") return damage;
  const buff = src.buffs?.boundSigil;
  if (!buff || !buff.active) return damage;
  const bonus = typeof buff.damageBonus === "number" ? buff.damageBonus : 0.12;
  return damage * (1 + Math.max(0, bonus));
}

function trackManipulatorTag(enemy, context) {
  if (!enemy || typeof enemy !== "object") return;
  if (!context || typeof context !== "object") return;
  const store = enemy.__manipulatorTags || (enemy.__manipulatorTags = {
    count: 0,
    lastTagAt: 0,
    stacks: 0,
    nextMode: "compel"
  });
  const now = nowMs();
  store.lastTagAt = now;
  store.count = clamp((store.count || 0) + 1, 0, 3);
  if (store.count < 3) return;
  store.count = 0;
  store.stacks = (store.stacks || 0) + 1;
  const mode = store.nextMode === "jam" ? "jam" : "compel";
  store.nextMode = mode === "compel" ? "jam" : "compel";
  if (mode === "jam" && typeof enemy.__manipulatorOriginalSpeed !== "number") {
    enemy.__manipulatorOriginalSpeed = enemy.speed || 4;
  }
  enemy.__manipulatorEffect = {
    mode,
    appliedAt: now,
    duration: mode === "compel" ? 0.8 : 1.6
  };
  if (mode === "compel") {
    enemy.attackCd = Math.max(enemy.attackCd || 0, 0.8);
    enemy.fearT = Math.max(enemy.fearT || 0, 0.8);
  } else {
    enemy.attackCd = Math.max(enemy.attackCd || 0, 1.2);
    enemy.speed = (enemy.speed || 4) * 0.75;
  }
}

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
    working = applyBoundSigilBuff(playerState, working);
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
  try {
    H.__lastOutgoingContext = { src, limb, base: baseDamage, final: result };
  } catch (err) {
    console.warn("[HXH] Failed to store outgoing context", err);
  }
  console.log("[HXH] applyOutgoingDamage", limb, baseDamage, "->", result);
  return result;
}

export function applyIncomingDamage(dst, limb, baseDamage) {
  const H = getHXH();
  let result = baseDamage;
  const playerState = H.state;
  if (dst && typeof dst === "object") {
    const aura = dst.aura || (dst === playerState ? playerState?.aura : undefined);
    if (aura?.ken) {
      let factor = 0.75;
      if (dst === playerState && getNenType(playerState) === "Enhancer") {
        const renCharge = clamp(aura.renCharge ?? 0, 0, 1);
        factor = clamp(factor - 0.18 * renCharge, 0.45, 0.75);
      }
      result *= factor;
    }
    const vulnerabilityT = Number.isFinite(dst.koVulnerabilityT) ? dst.koVulnerabilityT : 0;
    if (vulnerabilityT > 0) {
      const vulnMult = Number.isFinite(dst.koVulnerabilityMultiplier) ? dst.koVulnerabilityMultiplier : 1.5;
      result *= vulnMult;
    }
  }
  const context = H.__lastOutgoingContext;
  if (context && context.src === playerState && dst && dst !== playerState) {
    if (getNenType(playerState) === "Manipulator") {
      try {
        trackManipulatorTag(dst, context);
      } catch (err) {
        console.warn("[HXH] manipulator tag failed", err);
      }
    }
  }
  H.__lastOutgoingContext = null;
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
