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

function softClamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getFlowShare(state, limb) {
  if (!state || typeof state.flow !== "object") return 0;
  const flow = state.flow;
  switch (limb) {
    case "arms":
      return softClamp01((Number(flow.rArm) || 0) + (Number(flow.lArm) || 0)) * 0.5;
    case "legs":
      return softClamp01((Number(flow.rLeg) || 0) + (Number(flow.lLeg) || 0)) * 0.5;
    default:
      return softClamp01(Number(flow[limb]) || 0);
  }
}

function tryGameMessage(text, cooldown = 1200) {
  if (!text) return;
  const H = getHXH();
  const state = H.state || {};
  const now = nowMs();
  const bucket = state.__nenMsgBucket || (state.__nenMsgBucket = {});
  if (bucket[text] && now - bucket[text] < cooldown) return;
  bucket[text] = now;
  if (typeof H.msg === "function") {
    try { H.msg(text); } catch (err) { console.warn("[HXH] msg failed", err); }
  }
}

function applyBruiserStrike(enemy, damage, playerState) {
  const tele = enemy?.__nenTelegraph;
  if (!tele) return damage;
  const now = nowMs();
  let next = damage;
  if (tele.active) {
    const limb = tele.limb || "torso";
    const share = getFlowShare(playerState, limb);
    const aura = playerState?.aura || {};
    const gyoBonus = aura.gyo ? 0.9 : 1;
    let guardMul = 1.0;
    if (share >= 0.23) {
      guardMul = 0.55 * gyoBonus;
      tryGameMessage(`Ryu guard catches the Bruiser's Ko toward your ${limb.toLowerCase()}.`, 2200);
    } else if (share >= 0.17) {
      guardMul = 0.74 * gyoBonus;
    } else if (share >= 0.12) {
      guardMul = 0.9 * gyoBonus;
    } else {
      guardMul = 1.35;
      if (!aura.gyo) {
        tryGameMessage("Bruiser slams a Ko into your weak point — rebalance your Ryu!", 2600);
      }
    }
    if (aura.ken) {
      guardMul *= 0.82;
    }
    const strikeMul = 1.6;
    next = damage * strikeMul * guardMul;
    tele.active = false;
    tele.lastStrikeAt = now;
    tele.nextAt = now + (tele.cooldown || 2600);
    tele.lastLimb = limb;
    if (enemy.__nenMarkers) {
      const marker = enemy.__nenMarkers.get?.(limb);
      if (marker?.mesh) marker.mesh.isVisible = false;
    }
  } else {
    next = damage * 1.15;
  }
  return next;
}

function applyAssassinStrike(enemy, damage, playerState) {
  const cloak = enemy?.__nenZetsu;
  if (!cloak) {
    const aura = playerState?.aura || {};
    return aura.gyo ? damage * 0.92 : damage;
  }
  const aura = playerState?.aura || {};
  const now = nowMs();
  let next = damage;
  if (cloak.active) {
    if (aura.gyo) {
      next *= 0.58;
      cloak.countered = true;
      tryGameMessage("Gyo exposes the assassin before the strike lands!", 2400);
    } else {
      next *= 1.85;
      tryGameMessage("Backstab! Activate Gyo to read hidden aura.", 2600);
    }
    cloak.active = false;
    cloak.spotted = aura.gyo;
    cloak.nextAt = now + 2400;
    cloak.breakAt = now + 1200;
  } else if (aura.en?.on) {
    next *= 0.9;
  } else if (!aura.gyo) {
    next *= 1.05;
  }
  return next;
}

function applyCasterStrike(enemy, damage, playerState) {
  const store = enemy?.__nenOrbs;
  if (!store) return damage * 1.05;
  const aura = playerState?.aura || {};
  let multiplier = 1.25;
  if (aura.in && aura.en?.on) {
    multiplier = 0.58;
    if (Array.isArray(store.orbs)) {
      for (const orb of store.orbs) {
        if (orb) orb.dormant = true;
      }
    }
    tryGameMessage("In + En disturb the emitter's orbs — they sputter out.", 2800);
  } else if (aura.en?.on) {
    multiplier = 0.78;
  } else if (aura.in) {
    multiplier = 0.7;
  }
  return damage * multiplier;
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
  let vowMeta = null;
  const playerState = H.state;
  if (src && playerState && src === playerState) {
    working = applyShuDamage(playerState, limb, working);
    working = applyBoundSigilBuff(playerState, working);
    if (typeof H.applyVowToOutgoing === "function") {
      try {
        const meta = H.applyVowToOutgoing({ limb, baseDamage, damage: working, strike: playerState.koStrike });
        if (meta && Number.isFinite(meta.damage)) {
          working = meta.damage;
        }
        vowMeta = meta || null;
      } catch (err) {
        console.warn("[HXH] Vow outgoing hook failed", err);
      }
    }
    result = working;
    const strike = playerState.koStrike;
    let wasKoFlag = false;
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
      const isKoStrike = !strike.limb || strike.limb === limb;
      if (isKoStrike) {
        const mult = Number.isFinite(strike.multiplier) ? strike.multiplier : 1;
        let final = working * mult;
        if (playerState.aura && playerState.aura.gyo) {
          final *= 1.15;
        }
        result = final;
      }
      if (vowMeta) vowMeta.wasKo = vowMeta.wasKo ?? isKoStrike;
      wasKoFlag = isKoStrike;
    }
  } else if (src && src !== playerState) {
    const archetype = src.nenArchetype || (typeof window.Enemies?.getArchetype === "function" ? window.Enemies.getArchetype(src) : null);
    switch (archetype) {
      case "bruiser":
        working = applyBruiserStrike(src, working, playerState);
        break;
      case "assassin":
        working = applyAssassinStrike(src, working, playerState);
        break;
      case "caster":
        working = applyCasterStrike(src, working, playerState);
        break;
      default: {
        const aura = playerState?.aura || {};
        if (aura.gyo && src?.__nenZetsu?.active) {
          working *= 0.94;
        }
      }
    }
    result = working;
  }
  try {
    const mergedWasKo = vowMeta?.wasKo ?? wasKoFlag;
    const isNen = vowMeta?.isNen ?? (typeof limb === "string" && limb.toLowerCase().includes("nen"));
    H.__lastOutgoingContext = { src, limb, base: baseDamage, final: result, wasKo: mergedWasKo, isNen };
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
  if (dst && dst !== playerState) {
    const archetype = dst.nenArchetype || (typeof window.Enemies?.getArchetype === "function" ? window.Enemies.getArchetype(dst) : null);
    const aura = playerState?.aura || {};
    if (archetype === "assassin" && aura.gyo && dst.__nenZetsu?.active) {
      result *= 1.25;
      dst.__nenZetsu.active = false;
      dst.__nenZetsu.countered = true;
    }
    if (archetype === "caster") {
      if (aura.in) result *= 1.15;
      if (aura.en?.on) result *= 1.08;
    }
    if (archetype === "bruiser" && dst.__nenTelegraph?.active) {
      const limbKey = dst.__nenTelegraph.limb || "torso";
      const share = getFlowShare(playerState, limbKey);
      if (share >= 0.2) {
        result *= 1.12;
      }
    }
  }
  const context = H.__lastOutgoingContext;
  if (context && context.src === playerState && dst && dst !== playerState) {
    if (typeof H.applyVowToIncoming === "function") {
      try {
        const vowRes = H.applyVowToIncoming({ target: dst, damage: result, context });
        if (vowRes && Number.isFinite(vowRes.damage)) {
          result = vowRes.damage;
        }
      } catch (err) {
        console.warn("[HXH] Vow incoming hook failed", err);
      }
    }
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
