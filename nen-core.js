// nen-core.js
(function(){
  const state = window.state || (window.state = {});
  state.cooldowns = state.cooldowns || {};
  state.nen  = state.nen  || 100;
  state.nenMax = state.nenMax || 100;
  state.ch = state.ch || { name:"Hunter", nen:"Initiate" };
  state.aura = state.aura || { ten:false, zetsu:false, ren:false, ken:false, in:false, gyo:false, shu:false, en:{on:false,r:0} };
  state.flow = state.flow || { head:.09, torso:.25, rArm:.166, lArm:.166, rLeg:.166, lLeg:.166 };
  state.vows = state.vows || [];

  function handleInputs(input, inputOnce, dt){
    if (inputOnce["KeyG"]) state.aura.gyo = !state.aura.gyo;
    if (inputOnce["KeyV"]) { state.aura.en.on = true; state.aura.en.r = 6; }
    if (!input["KeyV"] && state.aura.en.on) { state.aura.en.on = false; state.aura.en.r = 0; }
    if (inputOnce["KeyB"]) state.aura.shu = !state.aura.shu;
    if (inputOnce["KeyK"]) state.aura.ken = !state.aura.ken;
    if (state.aura.ken && input["WheelDelta"]) {
      const d = Math.sign(input["WheelDelta"]) * 0.06;
      state.flow.rArm = Math.max(0.05, Math.min(0.40, state.flow.rArm + d));
      state.flow.lArm = Math.max(0.05, Math.min(0.40, state.flow.lArm - d));
      input["WheelDelta"] = 0;
    }
  }

  function update(dt){
    const a = state.aura;
    let leak = (a.ten || a.zetsu) ? 0 : 0.8;
    let drain = leak + (a.gyo?0.6:0) + (a.ken?1.8:0) + (a.shu?1.0:0);
    if (a.en.on){
      a.en.r = Math.max(6, Math.min(18, a.en.r + dt*8));
      drain += 4 + (a.en.r - 6) * 0.375;
    }
    if (a.ren) drain += 1.2;
    state.nen = Math.max(0, Math.min(state.nenMax, state.nen - drain*dt));
  }

  function computeDamage(attacker, target, base, limbKey){
    const flow = state.flow[limbKey||"torso"] || 0.16;
    let out = base * (1 + (flow - 0.166)*0.6);
    if (state.aura.ken) out *= 0.80;
    if (state.aura.shu) out *= 1.18;
    if (state.aura.gyo && Math.random()<0.15) out*=1.5;
    if (window.Vows) out = window.Vows.applyDamageMods(out);
    if (window.Specialization) out = window.Specialization.applyDamageMods(out);
    return out;
  }

  window.Nen = { state, handleInputs, update, computeDamage };
})();
