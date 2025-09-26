// hud.js
(function(){
  // Relies on: window.hud, window.hudState, window.state, window.progress
  const HUD_BAR_EPS = 0.0025;
  const COOLDOWN_UI_INTERVAL = 1/30;
  let cooldownUiAccumulator = COOLDOWN_UI_INTERVAL;

  function setHudBarWidth(el, pct, key){
    if (!el) return;
    const clamped = Math.min(1, Math.max(0, Number.isFinite(pct)?pct:0));
    const last = (hudState?.bars||{})[key];
    if (last === undefined || last < 0 || Math.abs(last - clamped) > HUD_BAR_EPS) {
      el.style.width = `${clamped * 100}%`;
      if (hudState?.bars) hudState.bars[key] = clamped;
    }
  }

  function updateHealthHud(){ setHudBarWidth(hud.health, state.hp / state.maxHP, "health"); }
  function updateNenHud(){ setHudBarWidth(hud.nenbar, state.nen / state.nenMax, "nen"); }
  function updateXpHud(pct){ setHudBarWidth(hud.xpbar, pct, "xp"); }
  function msg(s){ if (hud?.msg) hud.msg.textContent = s; }

  function updateHUD(){
    if (!hud || !state) return;
    if (hud.name) hud.name.textContent = state.ch.name || "Hunter";
    if (hud.nen)  hud.nen.textContent  = `${state.ch.nen} — ${state.ch.clan||"Wanderer"}`;
    if (hud.level && window.progress) hud.level.textContent = `Lv ${progress.level}  •  Points: ${progress.unspent}`;
    updateHealthHud(); updateNenHud();
    if (window.progress && typeof window.xpToNext === "function"){
      const req = xpToNext(progress.level);
      const pct = progress.level >= 410 ? 1 : (progress.xp / req);
      updateXpHud(pct);
    }
  }

  function updateCooldownUI(dt=0){
    cooldownUiAccumulator += dt;
    if (cooldownUiAccumulator < COOLDOWN_UI_INTERVAL) return;
    cooldownUiAccumulator = 0;

    const targets = [
      { el: hud.cdQ, key: "nenblast" },
      { el: hud.cdE, key: "special" },
      { el: hud.cdDash, key: "dash" }
    ];
    for (const {el,key} of targets){
      if (!el) continue;
      const cdState = hudState.cooldowns[key];
      const cooldown = state.cooldowns[key];
      if (!cooldown){
        if (cdState.active || cdState.pct !== 1){
          el.classList.remove("cooling");
          el.style.setProperty("--pct","100%");
          cdState.active=false; cdState.pct=1;
        }
        continue;
      }
      const pct = Math.min(1, Math.max(0, cooldown.t / cooldown.max));
      if (!cdState.active) { el.classList.add("cooling"); cdState.active=true; }
      if (cdState.pct < 0 || Math.abs(cdState.pct - pct) > 0.01) {
        el.style.setProperty("--pct",`${pct*100}%`);
        cdState.pct = pct;
      }
    }
  }

  window.updateHUD = updateHUD;
  window.updateCooldownUI = updateCooldownUI;
  window.updateHealthHud = updateHealthHud;
  window.updateNenHud = updateNenHud;
  window.updateXpHud = updateXpHud;
  window.msg = msg;
})();
