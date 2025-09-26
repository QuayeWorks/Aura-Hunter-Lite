// combat.js
(function(){
  // These depend on globals set in game.js: scene, state, playerRoot, enemies, projectiles, COOLDOWNS, etc.

  function cdActive(key){ const c=state.cooldowns[key]; return !!(c && c.t>0); }
  function setCooldown(key, t){ state.cooldowns[key]={t, max:t}; }
  function tickCooldowns(dt){
    for (const k in state.cooldowns){
      const c = state.cooldowns[k];
      if (!c) continue;
      c.t -= dt; if (c.t<=0){ delete state.cooldowns[k]; }
    }
  }

  function spendNen(cost){
    if (state.nen < cost) return false;
    state.nen -= cost; return true;
  }

  function playerAimDir(){
    const fwd = scene.activeCamera?.getForwardRay()?.direction || new BABYLON.Vector3(0,0,1);
    return new BABYLON.Vector3(fwd.x, 0, fwd.z).normalize();
  }

  function nearestEnemy(){
    if (!enemies || !enemies.length) return null;
    let best=null, bestD=Infinity;
    for (const e of enemies){
      if (!e || e.isDisposed?.()) continue;
      const d = BABYLON.Vector3.DistanceSquared(e.position, playerRoot.position);
      if (d<bestD){ bestD=d; best=e; }
    }
    return best;
  }

  // Projectiles with manual hit tests (Nen blast)
  function blast(){
    if (cdActive("nenblast")) return;
    const cost = 18 * (state.ch.nen === "Emitter" ? 0.75 : 1);
    if (!spendNen(cost)){ msg("Not enough Nen for blast."); return; }
    setCooldown("nenblast", COOLDOWNS.nenblast);

    const dir = playerAimDir();
    const orb = BABYLON.MeshBuilder.CreateSphere("blast",{ diameter:0.5 }, scene);
    orb.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)).add(dir.scale(1.1));
    const om = new BABYLON.StandardMaterial("om", scene);
    const c = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");
    om.emissiveColor = c; om.diffuseColor = c.scale(0.2);
    orb.material = om; orb.checkCollisions=false; orb.isPickable=false;

    const speed = 12 + (state.eff?.focus||0) * 0.6;
    const life = { t: 3.0 };
    const dmg = (18 + (state.eff?.focus||0) * 2.0 * (state.ch.nen === "Emitter" ? 1.35 : 1)) * (state.aura.renMul||1);

    projectiles.push({ mesh:orb, dir, speed, life, dmg, radius:0.55, prevPos: orb.position.clone() });
  }

  function special(){
    if (cdActive("special")) return;

    switch (state.ch.nen){
      case "Conjurer":
        if (!spendNen(25)) { msg("Not enough Nen."); return; }
        setCooldown("special", COOLDOWNS.special);
        state.buffs = state.buffs || {};
        state.buffs.shield = 6; msg("Conjured shield!");
        break;
      case "Manipulator":
        if (!spendNen(20)) { msg("Not enough Nen."); return; }
        setCooldown("special", COOLDOWNS.special);
        const t = nearestEnemy();
        if (t) { t.charmed = 5; msg("Charmed an enemy!"); }
        break;
      case "Specialist":
        if (state.timeStop) return;
        if (state.nen <= (state.ultMinNen||0) + 5) { msg("Not enough Nen for time distortion."); return; }
        state.timeStop = true; state.ultT = 0; msg("Time distorted! (Auto-ends as Nen drains)");
        break;
      case "Transmuter":
        if (!spendNen(22)) { msg("Not enough Nen."); return; }
        setCooldown("special", COOLDOWNS.special);
        state.buffs = state.buffs || {};
        state.buffs.electrify = 6; msg("Electrified strikes!");
        break;
      case "Enhancer":
        if (!spendNen(20)) { msg("Not enough Nen."); return; }
        setCooldown("special", COOLDOWNS.special);
        state.buffs = state.buffs || {};
        state.buffs.berserk = 6; msg("Berserk mode!");
        break;
      case "Emitter":
        if (!spendNen(24)) { msg("Not enough Nen."); return; }
        setCooldown("special", COOLDOWNS.special);
        for (let i=-2;i<=2;i++){
          const d = playerAimDir().add(new BABYLON.Vector3(i*0.15,0,0)); d.normalize();
          const orb = BABYLON.MeshBuilder.CreateSphere("blast",{ diameter:0.45 }, scene);
          orb.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)).add(d.scale(1.1));
          const om = new BABYLON.StandardMaterial("om", scene);
          const c = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");
          om.emissiveColor = c; orb.material = om; orb.checkCollisions=false; orb.isPickable=false;
          const speed = 11 + (state.eff?.focus||0) * 0.5;
          const life = { t: 3.0 };
          const dmg = (12 + (state.eff?.focus||0) * 1.6) * (state.aura.renMul||1);
          projectiles.push({ mesh:orb, dir:d, speed, life, dmg, radius:0.5, prevPos: orb.position.clone() });
        }
        break;
    }
  }
  function onKill(killer, victim){
  // Only anthros can absorb
  const killerSpecies = killer?.metadata?.species || (killer === playerRoot ? state.ch?.species : null);
  if (killerSpecies !== "anthro") return;

  if (Math.random() < 0.25) {
    const kStats = killer.metadata?.stats;
    const vStats = victim?.metadata?.stats;
    if (!kStats || !vStats) return;

    // 1) Steal one ability (if any new one exists)
    const kAb = kStats.abilities = kStats.abilities || new Set();
    const vAb = vStats.abilities instanceof Set ? [...vStats.abilities] : [];
    const candidates = vAb.filter(a => !kAb.has(a));
    if (candidates.length) {
      const pick = candidates[Math.floor(Math.random()*candidates.length)];
      kAb.add(pick);
      msg?.(`Absorbed ability: ${pick}`);
    } else {
      msg?.(`Absorbed strength`);
    }

    // 2) Gain a slice of victim’s power
    const hpGain = Math.max(6, Math.round((vStats.hp || 60) * 0.12));
    const dmgMul = 1.06;
    kStats.hp = (kStats.hp || 100) + hpGain;
    kStats.dmg = (kStats.dmg || 10) * dmgMul;

    // If the killer is the player, reflect some of that immediately
    if (killer === playerRoot) {
      state.maxHP = (state.maxHP || 100) + Math.round(hpGain * 0.5);
      state.hp = Math.min(state.maxHP, (state.hp || state.maxHP) + Math.round(hpGain * 0.5));
      updateHealthHud?.();
    }
  }
}

  window.Combat = { blast, special, tickCooldowns, setCooldown, cdActive, spendNen, onKill };
})();
