// nen-core.js — Nen resource/core logic (delegated)
(function(){
  const H = (window.HXH ||= {});

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const mapRange = (value, inMin, inMax, outMin, outMax) => {
    if (!Number.isFinite(value)) return outMin;
    if (inMax === inMin) return outMin;
    const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
    return outMin + (outMax - outMin) * t;
  };

  const formatDrainSummary = (entries) => {
    if (!entries.length) return "None";
    return entries.map((entry) => `${entry.label} ${entry.value.toFixed(1)}/s`).join(", ");
  };

  function ensureNenType(state) {
    if (!state || typeof state !== "object") return null;
    const existing = state.nenType;
    if (existing && typeof existing === "string") return existing;
    const inferred = typeof state.ch?.nen === "string" ? state.ch.nen : null;
    if (inferred) state.nenType = inferred;
    return inferred;
  }

  function getVowSeverity(vows) {
    if (!Array.isArray(vows) || vows.length === 0) return 0;
    return vows.reduce((acc, vow) => {
      if (!vow || vow.disabled) return acc;
      const active = vow.active ?? true;
      if (!active) return acc;
      const severity = typeof vow.severity === "number" ? vow.severity : (typeof vow.rank === "number" ? vow.rank : 1);
      return acc + clamp(severity, 0, 5);
    }, 0);
  }

  function tuneSpecialistUlt(state) {
    if (!state || ensureNenType(state) !== "Specialist") return;
    const focus = clamp(Number(state.eff?.focus) || 0, 0, 12);
    const vowSeverity = clamp(getVowSeverity(state.vows), 0, 18);
    const baseDrain = 20;
    const focusMit = 1 - clamp(focus * 0.04, 0, 0.55);
    const vowBoost = 1 + vowSeverity * 0.08;
    const tunedDrain = clamp(baseDrain * focusMit / vowBoost, 5, 20);
    state.ultDrainRate = tunedDrain;
    const baseDur = 8 + focus * 0.35 + vowSeverity * 0.25;
    state.ultMaxDur = clamp(baseDur, 8, 24);
    if (state.timeStop && state.nen && state.nen.cur <= (state.ultMinNen ?? 0)) {
      state.timeStop = false;
      const focus = clamp(Number(state.eff?.focus) || 0, 0, 12);
      const baseCd = 10 * (1 - focus * 0.03);
      H.setCooldown?.("special", baseCd);
      H.msg?.("Time distortion collapses — Nen exhausted.");
    }
  }

  function nenTick(dt){
    if (!H.state || !Number.isFinite(dt) || dt <= 0) return;
    const state = H.state;
    ensureNenType(state);
    tuneSpecialistUlt(state);
    const aura = state.aura || {};
    const nen = state.nen || (state.nen = { cur: 0, max: 0, regen: 0 });

    const regenBase = Number.isFinite(nen.regen) ? nen.regen : 0;
    const regenMult = aura.ten ? 0.85 : 1.0;
    let regenRate = regenBase * regenMult;
    if (state.chargingNen && !aura.zetsu) regenRate += 4.0;

    const drains = [];
    let totalDrain = 0;
    const addDrain = (label, value, condition = true) => {
      if (!condition || value <= 0) return;
      totalDrain += value;
      drains.push({ label, value });
    };

    addDrain("Leak", 0.8, !aura.ten && !aura.zetsu);
    addDrain("Ren", 1.0, aura.renActive);
    addDrain("Ken", 1.8, !!aura.ken);
    addDrain("Gyo", 0.6, !!aura.gyo);
    const shuActive = aura?.__shuActive ?? aura.shu;
    addDrain("Shu", 1.0, !!shuActive);
    if (aura.en && aura.en.on) {
      const r = clamp(aura.en.r ?? 0, 6, 18);
      addDrain("En", mapRange(r, 6, 18, 4, 10));
    }

    const prevNen = nen.cur;
    const netRate = regenRate - totalDrain;
    nen.cur = clamp(prevNen + netRate * dt, 0, nen.max ?? 0);

    if (nen.cur <= 0 && aura.renActive) {
      aura.renActive = false;
      aura.renCharge = 0;
      aura.renMul = 1.0;
    }

    const summary = formatDrainSummary(drains);
    const prevSummary = state.nenDrainSummary;
    state.nenDrainEntries = drains;
    state.nenDrainSummary = summary;

    if (nen.cur !== prevNen || summary !== prevSummary) {
      H.updateNenHud?.();
    }
  }

  const NenCore = {
    setCooldown: (...a)=>H.setCooldown?.(...a),
    gainXP: (...a)=>H.gainXP?.(...a),
    xpToNext: (...a)=>H.xpToNext?.(...a),
    getAuraState: ()=>H.getAuraState?.(),
    onAuraChange: (fn)=>H.subscribeAura?.(fn),
    refreshAuraHud: ()=>H.updateAuraHud?.(),
    getFlowState: ()=>H.getFlowState?.(),
    refreshFlowHud: ()=>H.updateFlowHud?.(),
    nenTick,
  };
  window.NenCore = NenCore;
})();
