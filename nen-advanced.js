(function(){
  const globalObj = typeof window !== "undefined" ? window : globalThis;
  const existing = typeof globalObj.NenAdvanced === "object" && globalObj.NenAdvanced ? globalObj.NenAdvanced : {};

  const advState = {
    currentState: null,
    gyoActive: false,
    overlay: null,
    inIndicator: null,
    unsubscribeAura: null,
    trackedProjectiles: null,
    originalProjectilePush: null,
    concealedRecords: new Set(),
    enemyHighlights: new Map(),
    styleReady: false,
    lastFrameTs: null,
    nenType: null,
    originalSpecial: null,
    radial: {
      active: false,
      unsubscribe: null,
      options: [],
      selectedKey: null
    },
    transmute: {
      mode: "sticky",
      lastSelection: "sticky"
    },
    boundSigil: null,
    boundSigilSelection: null,
    manipulator: {
      lastCleanup: 0
    },
    inStatus: {
      prepared: false,
      pending: false,
      upkeep: false,
      accum: 0,
      pendingKind: null,
      pendingWindow: 0,
      notified: false,
    },
    enStatus: {
      keyHeld: false,
      keyDownAt: 0,
      holdThresholdMs: 220,
      maintainActive: false,
      maintainStart: 0,
      maintainRadius: 0,
      maintainFailed: false,
      pendingPulse: false,
      lastAuraRadius: 0,
      highlightLayer: null,
      senseEntries: new Map(),
      slowedProjectiles: new Map(),
      senseColor: null,
      pulseActiveUntil: 0
    },
    shuStatus: {
      intent: false,
      active: false,
      weaponOut: false,
      lastActive: false,
      modifiers: null,
      weapon: null,
      glyph: null,
      warned: false
    }
  };

  const IN_UPFRONT_COST = 8;
  const IN_UPKEEP_PER_SEC = 1;
  const VOLLEY_WINDOW = 0.16;
  const EN_PULSE_COST = 12;
  const EN_PULSE_RADIUS = 12;
  const EN_PULSE_SLOW_FACTOR = 0.35;
  const EN_PULSE_SLOW_DURATION = 0.3;
  const EN_MIN_RADIUS = 6;
  const EN_MAX_RADIUS = 18;
  const EN_EXPAND_DURATION = 1.0;

  const getHXH = () => (typeof globalObj.HXH === "object" ? globalObj.HXH : null);
  const getHUD = () => (typeof globalObj.HUD === "object" ? globalObj.HUD : null);
  const getBABYLON = () => globalObj.BABYLON || null;
  const getItems = () => (typeof globalObj.Items === "object" && globalObj.Items ? globalObj.Items : null);

  const DEFAULT_SHU_MODIFIERS = { damageMul: 1.3, durabilityScalar: 0.65, pierceCount: 1 };
  const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

  const VOW_RULES = [
    {
      id: "ko-only-wave",
      label: "Only Ko strikes this wave",
      description: "Channel everything into Ko strikes — any other attack breaks the vow.",
      defaultStrength: 1,
      maxStrength: 3,
      build(strength = 1, lethal = false) {
        const lvl = clampNumber(Math.round(Number(strength) || 1), 1, this.maxStrength || 3);
        const lethalActive = !!lethal;
        const base = 0.35 + 0.15 * (lvl - 1);
        const bonus = base * (lethalActive ? 2 : 1);
        const summaryParts = [`Ko strikes deal +${Math.round(bonus * 100)}% damage.`];
        summaryParts.push("Ken sealed.");
        if (lethalActive) summaryParts.push("Lethal vow.");
        return {
          ruleId: this.id,
          label: this.label,
          description: this.description,
          summary: summaryParts.join(" "),
          strength: lvl,
          lethal: lethalActive,
          severity: Math.round(4 + lvl * 2 + (lethalActive ? 4 : 0)),
          effects: {
            koMultiplier: 1 + bonus,
            disableKen: true,
            restrictions: { requireKo: true }
          },
          preview: {
            koMultiplier: 1 + bonus,
            disableKen: true,
            lethal: lethalActive
          }
        };
      }
    },
    {
      id: "no-dash-wave",
      label: "No dash this wave",
      description: "Stand your ground — dashing breaks the vow, but Nen techniques hit harder.",
      defaultStrength: 1,
      maxStrength: 3,
      build(strength = 1, lethal = false) {
        const lvl = clampNumber(Math.round(Number(strength) || 1), 1, this.maxStrength || 3);
        const lethalActive = !!lethal;
        const base = 0.2 + 0.1 * (lvl - 1);
        const bonus = base * (lethalActive ? 2 : 1);
        const summaryParts = [`Nen abilities deal +${Math.round(bonus * 100)}% damage.`];
        summaryParts.push("Dashing forbidden.");
        if (lethalActive) summaryParts.push("Lethal vow.");
        return {
          ruleId: this.id,
          label: this.label,
          description: this.description,
          summary: summaryParts.join(" "),
          strength: lvl,
          lethal: lethalActive,
          severity: Math.round(3 + lvl * 2 + (lethalActive ? 3 : 0)),
          effects: {
            nenMultiplier: 1 + bonus,
            restrictions: { forbidDash: true }
          },
          preview: {
            nenMultiplier: 1 + bonus,
            lethal: lethalActive
          }
        };
      }
    },
    {
      id: "only-elite",
      label: "Only attack marked elite",
      description: "Focus on the marked elite — harming others weakens you and breaks the vow.",
      defaultStrength: 1,
      maxStrength: 3,
      build(strength = 1, lethal = false) {
        const lvl = clampNumber(Math.round(Number(strength) || 1), 1, this.maxStrength || 3);
        const lethalActive = !!lethal;
        const baseBonus = 0.6 + 0.2 * (lvl - 1);
        const basePenalty = 0.3 + 0.1 * (lvl - 1);
        const bonus = baseBonus * (lethalActive ? 2 : 1);
        const penalty = basePenalty * (lethalActive ? 2 : 1);
        const eliteMultiplier = 1 + bonus;
        const otherMultiplier = Math.max(0.1, 1 - penalty);
        const summaryParts = [
          `+${Math.round(bonus * 100)}% vs the marked elite, -${Math.round(penalty * 100)}% vs others.`
        ];
        if (lethalActive) summaryParts.push("Lethal vow.");
        return {
          ruleId: this.id,
          label: this.label,
          description: this.description,
          summary: summaryParts.join(" "),
          strength: lvl,
          lethal: lethalActive,
          severity: Math.round(5 + lvl * 3 + (lethalActive ? 4 : 0)),
          effects: {
            eliteTargetMultiplier: eliteMultiplier,
            eliteOthersMultiplier: otherMultiplier,
            restrictions: { restrictTarget: true }
          },
          preview: {
            eliteTargetMultiplier: eliteMultiplier,
            eliteOthersMultiplier: otherMultiplier,
            lethal: lethalActive
          }
        };
      }
    }
  ];

  const VOW_RULE_LOOKUP = new Map(VOW_RULES.map(rule => [rule.id, rule]));

  function resolveVowRule(ruleId, strength = 1, lethal = false) {
    const rule = VOW_RULE_LOOKUP.get(ruleId);
    if (!rule || typeof rule.build !== "function") return null;
    const built = rule.build(strength, lethal);
    if (!built) return null;
    return Object.assign({ key: rule.id, id: rule.id }, built);
  }

  function combineVows(configs = []) {
    const entries = [];
    const totals = {
      koMultiplier: 1,
      nenMultiplier: 1,
      eliteTargetMultiplier: 1,
      eliteOthersMultiplier: 1,
      disableKen: false,
      restrictions: { requireKo: null, forbidDash: null, restrictTarget: null },
      lethalCount: 0
    };
    configs.forEach((cfg, index) => {
      if (!cfg || !cfg.ruleId) return;
      const entry = resolveVowRule(cfg.ruleId, cfg.strength, cfg.lethal);
      if (!entry) return;
      if (!entry.key) entry.key = `${entry.ruleId}-${index}`;
      if (!entry.id) entry.id = entry.key;
      entries.push(entry);
      const fx = entry.effects || {};
      if (typeof fx.koMultiplier === "number" && Number.isFinite(fx.koMultiplier) && fx.koMultiplier > 0) {
        totals.koMultiplier *= fx.koMultiplier;
      }
      if (typeof fx.nenMultiplier === "number" && Number.isFinite(fx.nenMultiplier) && fx.nenMultiplier > 0) {
        totals.nenMultiplier *= fx.nenMultiplier;
      }
      if (typeof fx.eliteTargetMultiplier === "number" && Number.isFinite(fx.eliteTargetMultiplier) && fx.eliteTargetMultiplier > 0) {
        totals.eliteTargetMultiplier *= fx.eliteTargetMultiplier;
      }
      if (typeof fx.eliteOthersMultiplier === "number" && Number.isFinite(fx.eliteOthersMultiplier) && fx.eliteOthersMultiplier >= 0) {
        totals.eliteOthersMultiplier *= fx.eliteOthersMultiplier;
      }
      if (fx.disableKen) totals.disableKen = true;
      if (fx.restrictions && typeof fx.restrictions === "object") {
        if (fx.restrictions.requireKo) totals.restrictions.requireKo = entry.ruleId;
        if (fx.restrictions.forbidDash) totals.restrictions.forbidDash = entry.ruleId;
        if (fx.restrictions.restrictTarget) totals.restrictions.restrictTarget = entry.ruleId;
      }
      if (entry.lethal) totals.lethalCount += 1;
    });
    totals.koMultiplier = Math.max(0.1, totals.koMultiplier);
    totals.nenMultiplier = Math.max(0.1, totals.nenMultiplier);
    totals.eliteTargetMultiplier = Math.max(0.1, totals.eliteTargetMultiplier);
    totals.eliteOthersMultiplier = Math.max(0, totals.eliteOthersMultiplier);
    return { entries, totals };
  }

  function listVowRules() {
    return VOW_RULES.map(rule => ({
      id: rule.id,
      label: rule.label,
      description: rule.description,
      defaultStrength: rule.defaultStrength || 1,
      maxStrength: rule.maxStrength || 3
    }));
  }

  function createColor(hex, fallback = [1, 1, 1]) {
    const BABYLON = globalObj.BABYLON;
    if (BABYLON?.Color3?.FromHexString && hex) {
      return BABYLON.Color3.FromHexString(hex);
    }
    const [r, g, b] = fallback;
    return {
      r,
      g,
      b,
      clone() {
        return createColor(null, [this.r, this.g, this.b]);
      },
      copyFrom(src) {
        if (!src) return;
        if (typeof src.r === "number") this.r = src.r;
        if (typeof src.g === "number") this.g = src.g;
        if (typeof src.b === "number") this.b = src.b;
      }
    };
  }

  const COLORS = {
    vignette: {
      start: "rgba(255,255,255,0.08)",
      middle: "rgba(12,24,40,0.25)",
      end: "rgba(3,7,16,0.92)"
    },
    weakIdle: createColor("#ffdb6e", [1.0, 0.86, 0.42]),
    weakVulnerable: createColor("#ff6b6b", [1.0, 0.42, 0.42]),
    weakGlow: createColor("#5cc9ff", [0.36, 0.78, 1.0]),
    weakGlowVulnerable: createColor("#ffb347", [1.0, 0.7, 0.34]),
    concealOutline: createColor("#7fd2ff", [0.5, 0.82, 1.0]),
    concealGlow: createColor("#9fe1ff", [0.62, 0.88, 1.0]),
    enSense: createColor("#7fb8ff", [0.5, 0.72, 1.0])
  };

  function hudMessage(text) {
    if (!text) return;
    const HUD = getHUD();
    if (HUD?.message) {
      HUD.message(text);
    } else {
      console.log("[HXH]", text);
    }
  }

  function inferNenType(state) {
    if (!state || typeof state !== "object") return null;
    if (typeof state.nenType === "string" && state.nenType) return state.nenType;
    if (typeof state.ch?.nen === "string" && state.ch.nen) return state.ch.nen;
    return null;
  }

  function updateNenType(state) {
    advState.nenType = inferNenType(state || advState.currentState);
    return advState.nenType;
  }

  function ensureTransmuteMode(state) {
    const type = updateNenType(state);
    if (type !== "Transmuter") return null;
    const mode = advState.transmute.mode || "sticky";
    advState.transmute.mode = mode;
    advState.transmute.lastSelection = mode;
    return mode;
  }

  function formatTitleCase(value) {
    if (typeof value !== "string" || !value) return "";
    return value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function resolveVowOptions(state) {
    const vows = Array.isArray(state?.vows) && state.vows.length ? state.vows : null;
    if (!vows) {
      return [
        { key: "discipline", label: "Discipline", hint: "Boosts guard & focus." },
        { key: "mercy", label: "Mercy", hint: "Improves regen." },
        { key: "resolve", label: "Resolve", hint: "Raises attack output." }
      ];
    }
    return vows.map((vow, index) => ({
      key: vow.key || vow.id || `${vow.ruleId || "vow"}-${index}`,
      label: vow.label || vow.name || formatTitleCase(vow.ruleId || vow.key || `Vow ${index + 1}`),
      hint: vow.summary || `Severity ${vow.severity ?? vow.rank ?? 1}`
    }));
  }

  function buildNenRadialOptions(state) {
    const type = updateNenType(state);
    if (type === "Transmuter") {
      return [
        { key: "sticky", label: "Sticky", hint: "Lingers & slows", color: "rgba(110,210,180,0.85)" },
        { key: "elastic", label: "Elastic", hint: "Curves mid-flight", color: "rgba(120,170,255,0.85)" },
        { key: "conductive", label: "Conductive", hint: "Charged bursts", color: "rgba(220,220,120,0.85)" }
      ];
    }
    if (type === "Conjurer") {
      return resolveVowOptions(state);
    }
    return [];
  }

  function closeNenRadial() {
    if (!advState.radial.active) return;
    const HUD = getHUD();
    HUD?.hideNenRadial?.();
    if (advState.radial.unsubscribe) {
      try { advState.radial.unsubscribe(); } catch (err) { console.warn("[HXH] radial unsubscribe failed", err); }
      advState.radial.unsubscribe = null;
    }
    advState.radial.active = false;
    advState.radial.options = [];
  }

  function handleNenRadialSelection(key) {
    if (!key) return;
    const state = advState.currentState;
    const type = updateNenType(state);
    const HUD = getHUD();
    advState.radial.selectedKey = key;
    HUD?.updateNenRadialSelection?.(key);
    if (type === "Transmuter") {
      advState.transmute.mode = key;
      advState.transmute.lastSelection = key;
      hudMessage(`Transmutation attuned: ${formatTitleCase(key)}.`);
    } else if (type === "Conjurer") {
      advState.boundSigilSelection = key;
      if (advState.boundSigil) advState.boundSigil.selectedKey = key;
      hudMessage(`Bound Sigil vow focus set to ${formatTitleCase(key)}.`);
    }
  }

  function openNenRadial(state) {
    const options = buildNenRadialOptions(state);
    if (!options.length) return false;
    const HUD = getHUD();
    if (!HUD?.showNenRadial) return false;
    const type = updateNenType(state);
    let selected = advState.radial.selectedKey;
    if (type === "Transmuter") {
      selected = advState.transmute.mode;
    } else if (type === "Conjurer") {
      selected = advState.boundSigilSelection || options[0]?.key;
    }
    HUD.showNenRadial(options, selected);
    advState.radial.active = true;
    advState.radial.options = options;
    advState.radial.selectedKey = selected;
    if (advState.radial.unsubscribe) {
      try { advState.radial.unsubscribe(); } catch (err) {}
    }
    advState.radial.unsubscribe = HUD.bindNenRadialSelection?.(handleNenRadialSelection) || null;
    return true;
  }

  function tintProjectile(projectile, hex) {
    const BABYLON = getBABYLON();
    if (!BABYLON || !projectile?.mesh) return;
    if (!projectile.mesh.material) {
      projectile.mesh.material = new BABYLON.StandardMaterial("transmuteMat", projectile.mesh.getScene?.());
    }
    const mat = projectile.mesh.material;
    if (!mat) return;
    const color = BABYLON.Color3.FromHexString(hex);
    if (mat.diffuseColor?.copyFrom) mat.diffuseColor.copyFrom(color.scale(0.45));
    if (mat.emissiveColor?.copyFrom) mat.emissiveColor.copyFrom(color);
    if (typeof mat.alpha === "number") mat.alpha = 0.9;
  }

  function handleTransmuterProjectile(projectile) {
    const state = advState.currentState;
    if (!state || inferNenType(state) !== "Transmuter") return;
    if (!projectile || projectile.source !== state) return;
    const limb = typeof projectile.limb === "string" ? projectile.limb.toLowerCase() : "";
    if (!limb.startsWith("nen")) return;
    const mode = ensureTransmuteMode(state) || "sticky";
    projectile.__transmuteMode = mode;
    projectile.__transmuteInitSpeed = projectile.speed;
    projectile.__transmuteBaseDir = projectile.dir?.clone ? projectile.dir.clone() : null;
    switch (mode) {
      case "sticky": {
        if (projectile.life && typeof projectile.life.t === "number") {
          projectile.life.t += 1.2;
        }
        projectile.speed *= 0.85;
        projectile.radius = (projectile.radius || 0.5) + 0.25;
        tintProjectile(projectile, "#6fd6b8");
        break;
      }
      case "elastic": {
        projectile.__transmutePhase = Math.random() * Math.PI * 2;
        projectile.__transmutePhaseSpeed = 5 + Math.random() * 3;
        projectile.__transmuteAmplitude = 0.35;
        tintProjectile(projectile, "#78b6ff");
        break;
      }
      case "conductive": {
        projectile.__transmuteConductive = true;
        projectile.dmg = (projectile.dmg || 0) * 1.12;
        tintProjectile(projectile, "#f5e66b");
        break;
      }
    }
  }

  function updateTransmuterProjectiles(dt) {
    if (!advState.trackedProjectiles) return;
    const BABYLON = getBABYLON();
    const H = getHXH();
    const enemies = Array.isArray(H?.enemies) ? H.enemies : [];
    for (const projectile of advState.trackedProjectiles) {
      const mode = projectile?.__transmuteMode;
      if (!mode) continue;
      if (mode === "sticky") {
        if (projectile.speed && projectile.__transmuteInitSpeed) {
          const target = Math.max(projectile.__transmuteInitSpeed * 0.45, projectile.speed * 0.92);
          projectile.speed = BABYLON ? BABYLON.Scalar.Lerp(projectile.speed, target, dt * 2.4) : target;
        }
      } else if (mode === "elastic" && BABYLON && projectile.dir && projectile.__transmuteBaseDir) {
        const base = projectile.__transmuteBaseDir;
        const right = new BABYLON.Vector3(base.z, 0, -base.x);
        if (right.length() < 1e-3) right.set(1, 0, 0);
        right.normalize();
        const phase = (projectile.__transmutePhase ?? 0) + (projectile.__transmutePhaseSpeed ?? 6) * dt;
        projectile.__transmutePhase = phase;
        const sway = Math.sin(phase) * (projectile.__transmuteAmplitude ?? 0.3);
        const dir = base.clone();
        dir.addInPlace(right.scale(sway));
        dir.normalize();
        if (projectile.dir.copyFrom) {
          projectile.dir.copyFrom(dir);
        }
      } else if (mode === "conductive" && projectile.__transmuteConductive && BABYLON) {
        const pos = projectile.mesh?.position;
        if (!pos) continue;
        for (const enemy of enemies) {
          if (!enemy?.alive) continue;
          const ePos = enemy.root?.position;
          if (!ePos) continue;
          const dist = BABYLON.Vector3.Distance(pos, ePos);
          if (dist <= 4) {
            enemy.__conductiveT = Math.max(enemy.__conductiveT || 0, 0.35);
            if (enemy.root?.material?.emissiveColor?.scaleInPlace) {
              enemy.root.material.emissiveColor.scaleInPlace(1.02);
            }
          }
        }
      }
    }
  }

  function handleEmitterProjectile(projectile) {
    const state = advState.currentState;
    if (!state || inferNenType(state) !== "Emitter") return;
    if (!projectile || projectile.source !== state) return;
    const limb = typeof projectile.limb === "string" ? projectile.limb.toLowerCase() : "";
    if (limb === "nenblast") {
      if (projectile.life && typeof projectile.life.t === "number") {
        projectile.life.t += 1.6;
      }
      projectile.radius = (projectile.radius || 0.55) + 0.1;
    } else if (limb === "nenvolley") {
      projectile.__emitterVolley = true;
      projectile.__emitterHomeStrength = 0.075;
      projectile.__emitterLastSeek = 0;
    }
  }

  function updateEmitterProjectiles(nowMs, dt) {
    if (!advState.trackedProjectiles) return;
    const BABYLON = getBABYLON();
    const H = getHXH();
    const enemies = Array.isArray(H?.enemies) ? H.enemies : [];
    if (inferNenType(advState.currentState) !== "Emitter") return;
    const pulseActive = advState.enStatus.pulseActiveUntil > nowMs;
    if (!BABYLON || !pulseActive) return;
    const playerPos = getPlayerPosition();
    if (!playerPos) return;
    const seekInterval = 0.08;
    for (const projectile of advState.trackedProjectiles) {
      if (!projectile?.__emitterVolley) continue;
      if (!projectile.mesh?.position) continue;
      projectile.__emitterLastSeek = (projectile.__emitterLastSeek || 0) + dt;
      if (projectile.__emitterLastSeek < seekInterval) continue;
      projectile.__emitterLastSeek = 0;
      let bestEnemy = null;
      let bestDist = Infinity;
      for (const enemy of enemies) {
        if (!enemy?.alive) continue;
        const ePos = enemy.root?.position;
        if (!ePos) continue;
        const dist = BABYLON.Vector3.Distance(projectile.mesh.position, ePos);
        if (dist < bestDist) {
          bestDist = dist;
          bestEnemy = enemy;
        }
      }
      if (!bestEnemy?.root?.position) continue;
      const dir = bestEnemy.root.position.clone();
      dir.subtractInPlace(projectile.mesh.position);
      dir.normalize();
      if (projectile.dir?.copyFrom) {
        projectile.dir.addInPlace(dir.scale(projectile.__emitterHomeStrength ?? 0.07));
        projectile.dir.normalize();
      }
    }
  }

  function getSceneFromState(state) {
    if (!state) return null;
    if (state.nenLight?.getScene) {
      try { return state.nenLight.getScene(); } catch (err) {}
    }
    const BABYLON = getBABYLON();
    return BABYLON?.Engine?.LastCreatedScene || null;
  }

  function disposeBoundSigil() {
    const data = advState.boundSigil;
    if (!data) return;
    if (data.mesh && data.mesh.dispose) {
      try { data.mesh.dispose(); } catch (err) { console.warn("[HXH] dispose sigil failed", err); }
    }
    advState.boundSigil = null;
    const state = advState.currentState;
    if (state?.buffs?.boundSigil) {
      state.buffs.boundSigil.active = false;
      state.buffs.boundSigil.expireAt = 0;
    }
  }

  function resolveVowSeverity(state, key) {
    if (!state || !key) return 1;
    const vow = Array.isArray(state.vows) ? state.vows.find(v => (v.key || v.id) === key) : null;
    if (!vow) return 1;
    const severity = typeof vow.severity === "number" ? vow.severity : (typeof vow.rank === "number" ? vow.rank : 1);
    return Math.max(1, severity);
  }

  function placeBoundSigil() {
    const state = advState.currentState;
    if (!state || inferNenType(state) !== "Conjurer") return false;
    const scene = getSceneFromState(state);
    const BABYLON = getBABYLON();
    if (!scene || !BABYLON) return false;
    const playerPos = getPlayerPosition();
    if (!playerPos) return false;
    disposeBoundSigil();
    const radius = 6;
    const mesh = BABYLON.MeshBuilder.CreateCylinder("bound-sigil", { diameter: radius * 2, height: 0.05, tessellation: 48 }, scene);
    mesh.position = new BABYLON.Vector3(playerPos.x, (playerPos.y || 0) - 0.1, playerPos.z);
    mesh.rotation.x = Math.PI / 2;
    mesh.isPickable = false;
    mesh.renderingGroupId = 1;
    const mat = new BABYLON.StandardMaterial("boundSigilMat", scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString("#5c9bff").scale(0.2);
    mat.emissiveColor = BABYLON.Color3.FromHexString("#9fbfff");
    mat.alpha = advState.gyoActive ? 0.85 : 0.0;
    mesh.material = mat;
    const key = advState.boundSigilSelection || advState.boundSigil?.selectedKey || (resolveVowOptions(state)[0]?.key ?? "discipline");
    const severity = resolveVowSeverity(state, key);
    const damageBonus = 0.08 + severity * 0.03;
    const duration = 12000;
    advState.boundSigil = {
      mesh,
      radius,
      expiresAt: getNow() + duration,
      vowKey: key,
      damageBonus,
      selectedKey: key
    };
    advState.boundSigilSelection = key;
    hudMessage(`Bound Sigil anchors ${formatTitleCase(key)} for ${Math.round(duration / 1000)}s.`);
    return true;
  }

  function updateBoundSigil(nowMs, dt) {
    const data = advState.boundSigil;
    const state = advState.currentState;
    if (!data || !state) return;
    const mesh = data.mesh;
    if (!mesh || mesh.isDisposed?.()) {
      disposeBoundSigil();
      return;
    }
    if (nowMs >= data.expiresAt) {
      disposeBoundSigil();
      hudMessage("Bound Sigil fades.");
      return;
    }
    if (mesh.material && typeof mesh.material.alpha === "number") {
      mesh.material.alpha = advState.gyoActive ? 0.85 : 0.0;
    }
    const playerPos = getPlayerPosition();
    if (!playerPos) return;
    const distSq = distanceSq(playerPos, mesh.position);
    const inside = distSq <= data.radius * data.radius;
    const buff = state.buffs || (state.buffs = {});
    if (!buff.boundSigil) {
      buff.boundSigil = { active: false, damageBonus: data.damageBonus, vowKey: data.vowKey, expireAt: 0 };
    }
    if (inside) {
      buff.boundSigil.active = true;
      buff.boundSigil.damageBonus = data.damageBonus;
      buff.boundSigil.vowKey = data.vowKey;
      buff.boundSigil.expireAt = nowMs + 200;
    } else if (buff.boundSigil.expireAt && nowMs > buff.boundSigil.expireAt) {
      buff.boundSigil.active = false;
    }
  }

  function updateManipulatorEffects(nowMs, dt) {
    const state = advState.currentState;
    if (!state || inferNenType(state) !== "Manipulator") return;
    const H = getHXH();
    const BABYLON = getBABYLON();
    const enemies = Array.isArray(H?.enemies) ? H.enemies : [];
    const playerPos = getPlayerPosition();
    for (const enemy of enemies) {
      if (!enemy) continue;
      if (enemy.__conductiveT) {
        enemy.__conductiveT = Math.max(0, enemy.__conductiveT - dt);
      }
      const effect = enemy.__manipulatorEffect;
      if (!effect) {
        if (typeof enemy.__manipulatorOriginalSpeed === "number") {
          enemy.speed = enemy.__manipulatorOriginalSpeed;
          delete enemy.__manipulatorOriginalSpeed;
        }
        continue;
      }
      const elapsed = (nowMs - effect.appliedAt) / 1000;
      if (elapsed >= effect.duration) {
        if (typeof enemy.__manipulatorOriginalSpeed === "number") {
          enemy.speed = enemy.__manipulatorOriginalSpeed;
          delete enemy.__manipulatorOriginalSpeed;
        }
        delete enemy.__manipulatorEffect;
        continue;
      }
      if (effect.mode === "compel" && BABYLON && playerPos && enemy.root?.position) {
        const dir = playerPos.clone ? playerPos.clone() : new BABYLON.Vector3(playerPos.x, playerPos.y, playerPos.z);
        dir.subtractInPlace(enemy.root.position);
        dir.y = 0;
        if (dir.lengthSquared() > 1e-4) {
          dir.normalize();
          if (enemy.vel && typeof enemy.vel.x === "number") {
            enemy.vel.x += dir.x * 18 * dt;
            enemy.vel.z += dir.z * 18 * dt;
          } else {
            enemy.vel = new BABYLON.Vector3(dir.x * 18 * dt, 0, dir.z * 18 * dt);
          }
        }
      } else if (effect.mode === "jam") {
        enemy.attackCd = Math.max(enemy.attackCd || 0, effect.duration - elapsed);
      }
    }
  }

  function emitEnhancerShockwave(strike, ctx) {
    const state = advState.currentState;
    if (!state || inferNenType(state) !== "Enhancer") return;
    const BABYLON = getBABYLON();
    const H = getHXH();
    const playerPos = getPlayerPosition();
    if (!BABYLON || !playerPos) return;
    const scene = getSceneFromState(state);
    const radius = 4.5;
    if (scene) {
      const ring = BABYLON.MeshBuilder.CreateCylinder("ko-shock", { diameter: radius * 2, height: 0.08, tessellation: 24 }, scene);
      ring.position = new BABYLON.Vector3(playerPos.x, playerPos.y - 0.1, playerPos.z);
      ring.rotation.x = Math.PI / 2;
      ring.isPickable = false;
      const mat = new BABYLON.StandardMaterial("koShockMat", scene);
      mat.diffuseColor = BABYLON.Color3.FromHexString("#ffb347").scale(0.25);
      mat.emissiveColor = BABYLON.Color3.FromHexString("#ffde73");
      mat.alpha = 0.8;
      ring.material = mat;
      const fade = () => {
        if (!ring || ring.isDisposed?.()) return;
        mat.alpha = Math.max(0, mat.alpha - 0.12);
        ring.scaling.x += 0.25;
        ring.scaling.z += 0.25;
        if (mat.alpha <= 0.05) {
          ring.dispose();
        } else {
          requestAnimationFrame(fade);
        }
      };
      requestAnimationFrame(fade);
    }
    const enemies = Array.isArray(H?.enemies) ? H.enemies : [];
    enemies.forEach(enemy => {
      if (!enemy?.alive) return;
      const pos = enemy.root?.position;
      if (!pos) return;
      const dist = BABYLON.Vector3.Distance(playerPos, pos);
      if (dist > radius) return;
      const dir = pos.clone();
      dir.subtractInPlace(playerPos);
      if (dir.lengthSquared() > 1e-4) {
        dir.normalize();
        if (enemy.vel && typeof enemy.vel.x === "number") {
          enemy.vel.x += dir.x * 12;
          enemy.vel.z += dir.z * 12;
        } else {
          enemy.vel = new BABYLON.Vector3(dir.x * 12, 0, dir.z * 12);
        }
      }
      const base = 10 + (state.eff?.power || 0) * 1.2;
      const outgoing = H?.applyOutgoingDamage ? H.applyOutgoingDamage(state, "koShock", base) : base;
      const applied = H?.applyIncomingDamage ? H.applyIncomingDamage(enemy, "koShock", outgoing) : outgoing;
      enemy.hp = (enemy.hp || 0) - applied;
      if (enemy.hp <= 0) {
        enemy.alive = false;
        enemy.root?.dispose?.();
        H?.gainXP?.(20);
      }
    });
  }

  function computeSpecialCooldown(state) {
    const focus = Math.max(0, Number(state?.eff?.focus) || 0);
    return 10 * (1 - focus * 0.03);
  }

  function spendNen(state, cost, failureMessage) {
    if (!state?.nen) return false;
    if (state.nen.cur < cost) {
      if (failureMessage) hudMessage(failureMessage);
      return false;
    }
    state.nen.cur -= cost;
    getHXH()?.updateNenHud?.();
    return true;
  }

  function performConjurerSpecial(state) {
    const cost = 24;
    if (!spendNen(state, cost, "Not enough Nen for Bound Sigil.")) return;
    const cooldown = computeSpecialCooldown(state);
    getHXH()?.setCooldown?.("special", cooldown);
    placeBoundSigil();
    closeNenRadial();
  }

  function ensureSpecialOverride(state) {
    const H = getHXH();
    if (!H) return;
    if (!advState.originalSpecial) {
      advState.originalSpecial = H.special || null;
    }
    H.special = function(...args) {
      const currentState = advState.currentState || H.state;
      const type = inferNenType(currentState);
      if (type === "Conjurer") {
        if (H.cdActive?.("special")) return;
        performConjurerSpecial(currentState);
        return;
      }
      if (typeof advState.originalSpecial === "function") {
        advState.originalSpecial.apply(this, args);
      }
    };
  }

  function ensureStyles() {
    if (advState.styleReady) return;
    const css = `
      #hud .nen-gyo-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(circle at center, ${COLORS.vignette.start} 0%, ${COLORS.vignette.middle} 55%, ${COLORS.vignette.end} 92%);
        mix-blend-mode: multiply;
        opacity: 0;
        transition: opacity 180ms ease-out;
        z-index: 2;
      }
      #hud .nen-gyo-overlay.active { opacity: 1; }
      #hud .nen-in-indicator {
        position: absolute;
        bottom: 4.2rem;
        right: 1rem;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #a4ddff;
        background: rgba(10, 24, 40, 0.72);
        border: 1px solid rgba(82, 160, 220, 0.72);
        border-radius: 11px;
        padding: 0.28rem 0.7rem;
        pointer-events: none;
        opacity: 0;
        transition: opacity 160ms ease-out;
      }
      #hud .nen-in-indicator.active { opacity: 1; }
      #hud .hud-shu-layer {
        position: absolute;
        top: 3rem;
        right: 1rem;
        pointer-events: none;
        display: flex;
        justify-content: flex-end;
        z-index: 3;
      }
      #hud .shu-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.18rem 0.42rem;
        border-radius: 6px;
        border: 1px solid rgba(110, 195, 255, 0.5);
        background: rgba(12, 32, 54, 0.78);
        color: #d4ecff;
        font-size: 0.62rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0;
        transform: translateY(-6px);
        transition: opacity 140ms ease, transform 140ms ease, box-shadow 160ms ease;
      }
      #hud .shu-glyph .label { font-size: 0.62rem; }
      #hud .shu-glyph.intent {
        opacity: 0.45;
        transform: translateY(-3px);
      }
      #hud .shu-glyph.armed.intent {
        opacity: 0.65;
      }
      #hud .shu-glyph.active {
        opacity: 1;
        transform: translateY(0);
        box-shadow: 0 0 12px rgba(120, 210, 255, 0.45);
      }
      #hud .shu-glyph.hidden {
        opacity: 0;
        transform: translateY(-8px);
      }
    `;
    const HUD = getHUD();
    if (HUD?.injectStyles) {
      HUD.injectStyles("nen-advanced-style", css);
    } else {
      const style = document.createElement("style");
      style.id = "nen-advanced-style";
      style.textContent = css;
      document.head.appendChild(style);
    }
    advState.styleReady = true;
  }

  function ensureOverlay() {
    if (advState.overlay && document.body.contains(advState.overlay)) return advState.overlay;
    ensureStyles();
    const HUD = getHUD();
    const layer = HUD?.ensureLayer?.("nen-gyo-overlay", "nen-gyo-overlay") || document.getElementById("nen-gyo-overlay");
    if (layer) {
      layer.style.pointerEvents = "none";
      advState.overlay = layer;
    }
    return advState.overlay;
  }

  function ensureInIndicator() {
    if (advState.inIndicator && document.body.contains(advState.inIndicator)) return advState.inIndicator;
    ensureStyles();
    const HUD = getHUD();
    const indicator = HUD?.ensureLayer?.("nen-in-indicator", "nen-in-indicator") || document.getElementById("nen-in-indicator");
    if (indicator) {
      indicator.style.pointerEvents = "none";
      if (!indicator.textContent) indicator.textContent = "In Ready";
      advState.inIndicator = indicator;
    }
    return advState.inIndicator;
  }

  function setOverlayActive(active) {
    const overlay = ensureOverlay();
    if (!overlay) return;
    overlay.classList.toggle("active", !!active);
  }

  function setIndicatorActive(active, text) {
    const indicator = ensureInIndicator();
    if (!indicator) return;
    if (text) indicator.textContent = text;
    indicator.classList.toggle("active", !!active);
  }

  function markAuraFlag(flag, value) {
    const state = advState.currentState;
    if (!state || !state.aura) return;
    if (value) {
      state.aura[flag] = value;
    } else {
      delete state.aura[flag];
    }
    getHXH()?.updateAuraHud?.();
  }

  function getActiveWeapon(state) {
    if (!state || typeof state !== "object") return null;
    const Items = getItems();
    if (Items?.getActiveWeapon) {
      try {
        const weapon = Items.getActiveWeapon(state);
        if (weapon) return weapon;
      } catch (err) {
        console.warn("[HXH] Items.getActiveWeapon failed", err);
      }
    }
    if (state.weapon && typeof state.weapon === "object") return state.weapon;
    return null;
  }

  function weaponIsOut(state, weapon) {
    if (!weapon || typeof weapon !== "object") return false;
    const Items = getItems();
    if (Items?.isWeaponOut) {
      try {
        return !!Items.isWeaponOut(state, weapon);
      } catch (err) {
        console.warn("[HXH] Items.isWeaponOut failed", err);
      }
    }
    if ("out" in weapon) return !!weapon.out;
    if ("drawn" in weapon) return !!weapon.drawn;
    if ("equipped" in weapon) return !!weapon.equipped;
    if ("active" in weapon) return !!weapon.active;
    if ("holstered" in weapon) return !weapon.holstered;
    return true;
  }

  function sanitizeShuModifiers(mods) {
    const fallback = DEFAULT_SHU_MODIFIERS;
    if (!mods || typeof mods !== "object") return { ...fallback };
    const damage = typeof mods.damageMul === "number" && Number.isFinite(mods.damageMul)
      ? mods.damageMul
      : typeof mods.damageMultiplier === "number" && Number.isFinite(mods.damageMultiplier)
        ? mods.damageMultiplier
        : fallback.damageMul;
    const durability = typeof mods.durabilityScalar === "number" && Number.isFinite(mods.durabilityScalar)
      ? mods.durabilityScalar
      : typeof mods.durabilityMultiplier === "number" && Number.isFinite(mods.durabilityMultiplier)
        ? mods.durabilityMultiplier
        : typeof mods.durabilityEfficiency === "number" && Number.isFinite(mods.durabilityEfficiency)
          ? mods.durabilityEfficiency
          : fallback.durabilityScalar;
    const pierceSource = mods.pierceCount ?? mods.pierce ?? mods.pierceBonus;
    const pierce = typeof pierceSource === "number" && Number.isFinite(pierceSource) && pierceSource >= 0
      ? pierceSource
      : fallback.pierceCount;
    return {
      damageMul: damage > 0 ? damage : fallback.damageMul,
      durabilityScalar: durability > 0 ? durability : fallback.durabilityScalar,
      pierceCount: pierce
    };
  }

  function resolveShuModifiers(state, weapon) {
    const Items = getItems();
    if (Items?.computeShuModifiers) {
      try {
        const mods = Items.computeShuModifiers(state, weapon);
        if (mods) return sanitizeShuModifiers(mods);
      } catch (err) {
        console.warn("[HXH] Items.computeShuModifiers failed", err);
      }
    }
    return { ...DEFAULT_SHU_MODIFIERS };
  }

  function createShuGlyphElement() {
    const glyph = document.createElement("div");
    glyph.className = "shu-glyph hidden";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Shu";
    glyph.appendChild(label);
    return glyph;
  }

  function ensureShuGlyph() {
    const status = advState.shuStatus;
    ensureStyles();
    const HUD = getHUD();
    const hudRoot = HUD?.getHudRoot?.() || document.getElementById("hud");
    if (!hudRoot) return null;
    const Items = getItems();
    const anchor = Items?.locateWeaponHud?.(hudRoot) || null;
    let glyph = status.glyph;
    if (!glyph || !glyph.isConnected) {
      glyph = createShuGlyphElement();
    }
    if (anchor) {
      if (glyph.parentElement !== anchor) {
        glyph.remove();
        anchor.appendChild(glyph);
      }
    } else {
      const layer = HUD?.ensureLayer?.("hud-shu-layer", "hud-shu-layer") || document.getElementById("hud-shu-layer");
      if (!layer) return glyph;
      if (!layer.contains(glyph)) {
        layer.innerHTML = "";
        layer.appendChild(glyph);
      }
    }
    status.glyph = glyph;
    return glyph;
  }

  function updateShuGlyph(status) {
    const glyph = ensureShuGlyph();
    if (!glyph) return;
    const label = glyph.querySelector?.(".label") || glyph;
    if (label && label.textContent !== "Shu") label.textContent = "Shu";
    const visible = status.intent || status.active;
    glyph.classList.toggle("hidden", !visible);
    glyph.classList.toggle("intent", !!status.intent);
    glyph.classList.toggle("active", !!status.active);
    glyph.classList.toggle("armed", !!status.weaponOut);
    const weaponName = status.weapon && typeof status.weapon.name === "string" && status.weapon.name.trim().length
      ? status.weapon.name.trim()
      : null;
    let title = "Shu inactive.";
    if (status.active) {
      title = weaponName ? `Shu imbues ${weaponName}.` : "Shu imbues your weapon.";
    } else if (status.intent) {
      title = status.weaponOut ? "Shu ready." : "Equip a weapon to channel Shu.";
    }
    glyph.title = title;
  }

  function setupProjectilePierce(projectile, pierceCount) {
    if (!projectile || typeof projectile !== "object") return;
    const attempts = Math.max(0, Math.floor(pierceCount));
    if (attempts <= 0) return;
    const life = projectile.life;
    if (!life || typeof life !== "object") return;
    if (life.__shuPierceMeta) {
      life.__shuPierceMeta.remaining = Math.max(life.__shuPierceMeta.remaining, attempts);
      return;
    }
    let internal = typeof life.t === "number" ? life.t : 0;
    const meta = {
      remaining: attempts,
      keepAlive: Math.max(0.08, Math.min(internal > 0 ? internal * 0.25 : 0.18, 0.25)),
      hits: 0
    };
    life.__shuPierceMeta = meta;
    Object.defineProperty(life, "t", {
      configurable: true,
      enumerable: true,
      get() { return internal; },
      set(value) {
        const data = life.__shuPierceMeta;
        if (value === 0 && data && data.remaining > 0 && projectile.mesh && !projectile.mesh.isDisposed?.()) {
          data.remaining -= 1;
          data.hits += 1;
          const minLife = data.keepAlive;
          internal = internal > minLife ? internal : minLife;
          const dir = projectile.dir;
          if (dir && typeof dir.scale === "function" && projectile.mesh?.position?.addInPlace) {
            const advance = Math.max(0.6, Math.min(1.4, (projectile.speed || 12) * 0.05));
            try {
              projectile.mesh.position.addInPlace(dir.scale(advance));
              if (projectile.prevPos?.copyFrom) projectile.prevPos.copyFrom(projectile.mesh.position);
            } catch (err) {
              console.warn("[HXH] Shu projectile advance failed", err);
            }
          }
          return;
        }
        internal = value;
      }
    });
    projectile.__shuPierceMeta = meta;
  }

  function handleShuProjectile(projectile) {
    const state = advState.currentState;
    const status = advState.shuStatus;
    if (!state || !status.active || !status.modifiers) return;
    if (!projectile || typeof projectile !== "object") return;
    if (projectile.source && projectile.source !== state) return;
    const limb = typeof projectile.limb === "string" ? projectile.limb.toLowerCase() : "";
    if (limb.startsWith("nen")) return;
    const pierce = Math.max(0, Math.floor(status.modifiers.pierceCount ?? status.modifiers.pierce ?? DEFAULT_SHU_MODIFIERS.pierceCount));
    if (pierce <= 0) return;
    setupProjectilePierce(projectile, pierce);
  }

  function refreshShuProjectiles() {
    if (!Array.isArray(advState.trackedProjectiles)) return;
    advState.trackedProjectiles.forEach(projectile => {
      handleShuProjectile(projectile);
      handleTransmuterProjectile(projectile);
      handleEmitterProjectile(projectile);
    });
  }

  function resetInStatus() {
    const s = advState.inStatus;
    s.prepared = false;
    s.pending = false;
    s.upkeep = false;
    s.accum = 0;
    s.pendingKind = null;
    s.pendingWindow = 0;
    s.notified = false;
    setIndicatorActive(false);
    markAuraFlag("inPrepared", false);
    markAuraFlag("inUpkeep", false);
  }

  function cancelIn(reason, opts = {}) {
    if (!advState.inStatus.prepared && !advState.inStatus.pending && !advState.inStatus.upkeep) return false;
    resetInStatus();
    if (reason && !opts.silent) hudMessage(reason);
    return true;
  }

  function getNow() {
    if (typeof globalObj.performance === "object" && typeof globalObj.performance.now === "function") {
      return globalObj.performance.now();
    }
    return Date.now();
  }

  function getPlayerPosition() {
    const state = advState.currentState;
    if (!state) return null;
    if (state.prevPlayerPos && typeof state.prevPlayerPos.x === "number") {
      return state.prevPlayerPos;
    }
    const root = state.ch?.root;
    if (root?.position && typeof root.position.x === "number") {
      return root.position;
    }
    return null;
  }

  function distanceSq(a, b) {
    if (!a || !b) return Infinity;
    const ax = typeof a.x === "number" ? a.x : 0;
    const ay = typeof a.y === "number" ? a.y : 0;
    const az = typeof a.z === "number" ? a.z : 0;
    const bx = typeof b.x === "number" ? b.x : 0;
    const by = typeof b.y === "number" ? b.y : 0;
    const bz = typeof b.z === "number" ? b.z : 0;
    const dx = ax - bx;
    const dy = ay - by;
    const dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
  }

  function ensureEnSenseColor() {
    if (advState.enStatus.senseColor) return advState.enStatus.senseColor;
    const base = COLORS.enSense;
    if (!base) return null;
    advState.enStatus.senseColor = base.clone ? base.clone() : base;
    return advState.enStatus.senseColor;
  }

  function ensureEnHighlightLayer(mesh) {
    const BABYLON = getBABYLON();
    if (!BABYLON || typeof BABYLON.HighlightLayer !== "function" || !mesh?.getScene) return null;
    const scene = mesh.getScene?.();
    if (!scene) return null;
    let layer = advState.enStatus.highlightLayer || null;
    if (layer && typeof layer.isDisposed === "function" && layer.isDisposed()) {
      layer = null;
      advState.enStatus.highlightLayer = null;
    }
    if (layer && layer._scene && layer._scene !== scene) {
      try { layer.dispose(); } catch (err) { console.warn("[HXH] Failed to dispose old En layer", err); }
      layer = null;
      advState.enStatus.highlightLayer = null;
    }
    if (!layer) {
      try {
        layer = new BABYLON.HighlightLayer("enSenseLayer", scene, { blurHorizontalSize: 1.2, blurVerticalSize: 1.2 });
        layer.innerGlow = true;
        layer.outerGlow = false;
        advState.enStatus.highlightLayer = layer;
      } catch (err) {
        console.warn("[HXH] Failed to create En highlight layer", err);
        advState.enStatus.highlightLayer = null;
        return null;
      }
    }
    return layer;
  }


  function isMeshLike(node) {
    if (!node) return false;
    if (typeof node.getTotalVertices === "function") return true;
    if (typeof node.isVerticesDataPresent === "function") return true;
    const name = node.getClassName?.();
    return typeof name === "string" && /mesh/i.test(name);
  }

  function gatherSenseMeshes(root) {
    if (!root) return [];
    const meshes = [];
    const seen = new Set();
    const add = mesh => {
      if (!mesh || seen.has(mesh) || !isMeshLike(mesh)) return;
      seen.add(mesh);
      meshes.push(mesh);
    };
    if (isMeshLike(root)) add(root);
    const collectChildren = node => {
      if (!node) return;
      let children = [];
      if (typeof node.getChildMeshes === "function") {
        try {
          const result = node.getChildMeshes(false);
          if (Array.isArray(result)) {
            children = result;
          }
        } catch (err) {
          console.warn("[HXH] Failed to enumerate En meshes", err);
        }
      }
      if (!children.length && Array.isArray(node._children)) {
        children = node._children;
      }
      children.forEach(child => {
        if (isMeshLike(child)) add(child);
        collectChildren(child);
      });
    };
    collectChildren(root);
    return meshes;
  }

  function removeSenseEntry(enemy) {
    const entry = advState.enStatus.senseEntries.get(enemy);
    if (!entry) return;
    if (!Array.isArray(entry.meshes)) {
      entry.meshes = [];
      if (entry.mesh && !entry.meshes.includes(entry.mesh)) {
        entry.meshes.push(entry.mesh);
      }
    }
    if (!Array.isArray(entry.disposeObservers) && entry.disposeObserver && entry.mesh) {
      entry.disposeObservers = [{ mesh: entry.mesh, observer: entry.disposeObserver }];
    }
    const layer = advState.enStatus.highlightLayer;
    if (layer?.removeMesh && Array.isArray(entry.meshes)) {
      entry.meshes.forEach(mesh => {
        if (!mesh) return;
        try { layer.removeMesh(mesh); } catch (err) { console.warn("[HXH] Failed removing En mesh", err); }
      });
    }
    if (Array.isArray(entry.disposeObservers)) {
      entry.disposeObservers.forEach(({ mesh, observer }) => {
        if (mesh?.onDisposeObservable?.remove && observer) {
          mesh.onDisposeObservable.remove(observer);
        }
      });

    }
    advState.enStatus.senseEntries.delete(enemy);
  }

  function clearSenseEntries() {
    for (const enemy of Array.from(advState.enStatus.senseEntries.keys())) {
      removeSenseEntry(enemy);
    }
  }

  function markEnemySensed(enemy, now, durationMs) {
    if (!enemy || !enemy.root || enemy.root.isDisposed?.() || !enemy.alive) return;
    const layer = ensureEnHighlightLayer(enemy.root);
    if (!layer) return;

    const meshSet = new Set(gatherSenseMeshes(enemy.root));
    const parts = enemy.parts;
    if (parts && typeof parts === "object") {
      Object.values(parts).forEach(part => {
        gatherSenseMeshes(part).forEach(mesh => meshSet.add(mesh));
      });
    }
    const meshes = Array.from(meshSet);
    if (!meshes.length) return;
    const color = ensureEnSenseColor();
    let entry = advState.enStatus.senseEntries.get(enemy);
    if (!entry) {
      const addedMeshes = [];
      const disposeObservers = [];
      meshes.forEach(mesh => {
        try {
          layer.addMesh(mesh, color, true);
          addedMeshes.push(mesh);
          if (mesh.onDisposeObservable?.add) {
            const observer = mesh.onDisposeObservable.add(() => removeSenseEntry(enemy));
            disposeObservers.push({ mesh, observer });
          }
        } catch (err) {
          console.warn("[HXH] Failed highlighting enemy mesh", err);
        }
      });
      if (!addedMeshes.length) return;
      entry = {
        meshes: addedMeshes,
        enemy,
        expiresAt: now + durationMs,
        disposeObservers
      };
      advState.enStatus.senseEntries.set(enemy, entry);
    } else {
      if (!Array.isArray(entry.meshes)) entry.meshes = [];
      if (!Array.isArray(entry.disposeObservers)) entry.disposeObservers = [];
      entry.expiresAt = Math.max(entry.expiresAt, now + durationMs);
      const missing = meshes.filter(mesh => !entry.meshes.includes(mesh));
      missing.forEach(mesh => {
        try {
          layer.addMesh(mesh, color, true);
          entry.meshes.push(mesh);
          if (mesh.onDisposeObservable?.add) {
            const observer = mesh.onDisposeObservable.add(() => removeSenseEntry(enemy));
            entry.disposeObservers = entry.disposeObservers || [];
            entry.disposeObservers.push({ mesh, observer });
          }
        } catch (err) {
          console.warn("[HXH] Failed updating En highlight", err);
        }
      });
    }
  }

  function updateSenseEntries(now) {
    for (const [enemy, entry] of Array.from(advState.enStatus.senseEntries.entries())) {
      const meshes = Array.isArray(entry?.meshes)
        ? entry.meshes
        : entry?.mesh
          ? [entry.mesh]
          : [];
      const hasMesh = meshes.some(mesh => mesh && !mesh.isDisposed?.());
      if (!enemy || !enemy.alive || !hasMesh || now >= entry.expiresAt) {
        removeSenseEntry(enemy);
      }
    }
  }

  function clearEnHighlightLayer() {
    const layer = advState.enStatus.highlightLayer;
    if (layer) {
      try { layer.dispose(); } catch (err) { console.warn("[HXH] Failed disposing En layer", err); }
      advState.enStatus.highlightLayer = null;
    }
  }

  function clearProjectileSlows() {
    for (const [proj, info] of Array.from(advState.enStatus.slowedProjectiles.entries())) {
      if (proj && typeof info?.originalSpeed === "number") {
        proj.speed = info.originalSpeed;
      }
      advState.enStatus.slowedProjectiles.delete(proj);
    }
  }

  function updateProjectileSlows(nowMs) {
    for (const [proj, info] of Array.from(advState.enStatus.slowedProjectiles.entries())) {
      const expired = !proj || info.until <= nowMs || proj.mesh?.isDisposed?.();
      if (expired) {
        if (proj && typeof info?.originalSpeed === "number") {
          proj.speed = info.originalSpeed;
        }
        advState.enStatus.slowedProjectiles.delete(proj);
      }
    }
  }

  function applyProjectileSlow(proj, nowMs, durationSec = EN_PULSE_SLOW_DURATION) {
    if (!proj || typeof proj.speed !== "number") return;
    const durationMs = Math.max(0, durationSec * 1000);
    const entry = advState.enStatus.slowedProjectiles.get(proj);
    if (entry) {
      entry.until = Math.max(entry.until, nowMs + durationMs);
      return;
    }
    const originalSpeed = proj.speed;
    proj.speed = Math.max(0, originalSpeed * EN_PULSE_SLOW_FACTOR);
    advState.enStatus.slowedProjectiles.set(proj, {
      originalSpeed,
      until: nowMs + durationMs
    });
  }

  function setAuraEn(active, radius = EN_MIN_RADIUS, opts = {}) {
    const state = advState.currentState;
    const aura = state?.aura;
    if (!aura || !aura.en) return false;
    const en = aura.en;
    const prevOn = !!en.on;
    const prevRadius = typeof en.r === "number" ? en.r : 0;
    if (active) {
      const clamped = Math.min(EN_MAX_RADIUS, Math.max(EN_MIN_RADIUS, Number.isFinite(radius) ? radius : EN_MIN_RADIUS));
      en.on = true;
      en.r = clamped;
      advState.enStatus.lastAuraRadius = clamped;
    } else {
      en.on = false;
      en.r = 0;
      advState.enStatus.lastAuraRadius = 0;
    }
    const changed = prevOn !== en.on || Math.abs(prevRadius - en.r) > 0.05;
    if (changed && !opts.skipHud) {
      getHXH()?.updateAuraHud?.();
    }
    return changed;
  }

  function startEnMaintain(nowMs) {
    const state = advState.currentState;
    if (!state) return false;
    if (state.aura?.zetsu) {
      hudMessage("Cannot expand En while in Zetsu.");
      advState.enStatus.maintainFailed = true;
      setAuraEn(false);
      return false;
    }
    if (!state.nen || state.nen.cur <= 0) {
      hudMessage("Nen too low to maintain En.");
      advState.enStatus.maintainFailed = true;
      setAuraEn(false);
      return false;
    }
    advState.enStatus.maintainActive = true;
    advState.enStatus.maintainStart = nowMs;
    advState.enStatus.maintainRadius = EN_MIN_RADIUS;
    advState.enStatus.maintainFailed = false;
    advState.enStatus.pendingPulse = false;
    setAuraEn(true, EN_MIN_RADIUS);
    hudMessage("En aura maintained — senses extending.");
    return true;
  }

  function stopEnMaintain(reason, opts = {}) {
    if (advState.enStatus.maintainActive) {
      advState.enStatus.maintainActive = false;
      advState.enStatus.maintainRadius = 0;
      advState.enStatus.maintainStart = 0;
    }
    setAuraEn(false, 0, { skipHud: opts.skipHud });
    if (reason && !opts.silent) hudMessage(reason);
    clearSenseEntries();
  }

  function resetEnState(opts = {}) {
    const status = advState.enStatus;
    status.keyHeld = false;
    status.keyDownAt = 0;
    status.pendingPulse = false;
    status.maintainActive = false;
    status.maintainFailed = false;
    status.maintainRadius = 0;
    status.maintainStart = 0;
    status.lastAuraRadius = 0;
    status.pulseActiveUntil = 0;
    setAuraEn(false, 0, { skipHud: opts.skipHud });
    clearProjectileSlows();
    clearSenseEntries();
    if (opts.disposeLayer) {
      clearEnHighlightLayer();
    }
  }

  function performEnPulse(nowMs) {
    const state = advState.currentState;
    if (!state?.nen) return false;
    if (state.nen.cur < EN_PULSE_COST) {
      hudMessage("Nen too low for En pulse.");
      setAuraEn(false);
      return false;
    }
    state.nen.cur = Math.max(0, state.nen.cur - EN_PULSE_COST);
    getHXH()?.updateNenHud?.();
    const playerPos = getPlayerPosition();
    const radiusSq = EN_PULSE_RADIUS * EN_PULSE_RADIUS;
    const H = getHXH();
    if (playerPos) {
      const enemies = Array.isArray(H?.enemies) ? H.enemies : [];
      enemies.forEach(enemy => {
        const pos = enemy?.root?.position;
        if (!pos) return;
        if (distanceSq(pos, playerPos) <= radiusSq) {
          markEnemySensed(enemy, nowMs, 340);
        }
      });
      const projectiles = Array.isArray(H?.projectiles) ? H.projectiles : [];
    projectiles.forEach(proj => {
      const pos = proj?.mesh?.position;
      if (!pos) return;
      if (distanceSq(pos, playerPos) <= radiusSq) {
        applyProjectileSlow(proj, nowMs, EN_PULSE_SLOW_DURATION);
      }
    });
  }
  advState.enStatus.pendingPulse = false;
  advState.enStatus.pulseActiveUntil = nowMs + 700;
  hudMessage("En pulse ripples outward.");
  setAuraEn(false, 0);
  return true;
}

  function updateEn(nowMs, dtSec = 0) {
    updateProjectileSlows(nowMs);
    updateSenseEntries(nowMs);

    const status = advState.enStatus;
    const state = advState.currentState;
    const dt = Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0;
    if (!state) return;

    if (status.keyHeld && !status.maintainActive && !status.maintainFailed) {
      if (nowMs - status.keyDownAt >= status.holdThresholdMs) {
        startEnMaintain(nowMs);
      }
    }

    if (status.maintainActive) {
      if (state.aura?.zetsu) {
        stopEnMaintain("Zetsu suppresses En.");
        return;
      }
      if (!state.nen || state.nen.cur <= 0) {
        stopEnMaintain("Nen exhausted — En collapses.");
        return;
      }
      const elapsed = Math.max(0, (nowMs - status.maintainStart) / 1000);
      const t = Math.min(1, elapsed / EN_EXPAND_DURATION);
      const radius = EN_MIN_RADIUS + (EN_MAX_RADIUS - EN_MIN_RADIUS) * t;
      status.maintainRadius = radius;
      setAuraEn(true, radius);
      const nen = state.nen;
      if (nen && dt > 0) {
        const lerp = (radius - EN_MIN_RADIUS) / (EN_MAX_RADIUS - EN_MIN_RADIUS);
        const mix = Math.min(1, Math.max(0, lerp));
        const drainRate = 4 + (10 - 4) * mix;
        const nenCost = drainRate * dt;
        if (nenCost > 0) {
          if (nen.cur <= nenCost) {
            nen.cur = 0;
            getHXH()?.updateNenHud?.();
            stopEnMaintain("Nen exhausted — En collapses.");
            return;
          }
          nen.cur = Math.max(0, nen.cur - nenCost);
          getHXH()?.updateNenHud?.();
        }
      }
      const playerPos = getPlayerPosition();
      if (playerPos) {
        const H = getHXH();
        const radiusSq = radius * radius;
        const enemies = Array.isArray(H?.enemies) ? H.enemies : [];
        enemies.forEach(enemy => {
          const pos = enemy?.root?.position;
          if (!pos) return;
          if (distanceSq(pos, playerPos) <= radiusSq) {
            markEnemySensed(enemy, nowMs, 220);
          }
        });
      }
    }
  }

  function toggleIn(forceOff = false) {
    const state = advState.currentState;
    if (!state || !state.nen) return false;
    if (forceOff) return cancelIn("In focus relaxed.");
    if (advState.inStatus.prepared) {
      return cancelIn("In focus relaxed.");
    }
    if (state.aura?.zetsu) {
      hudMessage("Cannot hide aura while in Zetsu.");
      return false;
    }
    if (state.nen.cur < IN_UPFRONT_COST) {
      hudMessage("Nen too low to shape In.");
      return false;
    }
    state.nen.cur = Math.max(0, state.nen.cur - IN_UPFRONT_COST);
    getHXH()?.updateNenHud?.();
    advState.inStatus.prepared = true;
    advState.inStatus.pending = true;
    advState.inStatus.upkeep = true;
    advState.inStatus.accum = 0;
    advState.inStatus.pendingKind = null;
    advState.inStatus.pendingWindow = 0;
    advState.inStatus.notified = false;
    setIndicatorActive(true, "In Ready");
    markAuraFlag("inPrepared", true);
    markAuraFlag("inUpkeep", true);
    hudMessage("In focus prepared — next conjuration concealed.");
    return true;
  }

  function handleKoStrike(strike, context) {
    emitEnhancerShockwave(strike, context);
    if (!advState.inStatus.prepared) return;
    cancelIn("Ko focus disrupts In concealment.");
  }

  function drainIn(dt) {
    if (!advState.inStatus.upkeep || !advState.currentState) return;
    const state = advState.currentState;
    if (state.aura?.zetsu) {
      cancelIn("Zetsu disperses your In focus.");
      return;
    }
    advState.inStatus.accum += dt;
    if (advState.inStatus.accum < 1) return;
    const ticks = Math.floor(advState.inStatus.accum);
    advState.inStatus.accum -= ticks;
    const cost = IN_UPKEEP_PER_SEC * ticks;
    const nen = state.nen;
    if (!nen || nen.cur < cost) {
      cancelIn("Nen exhausted — In dissipates.");
      return;
    }
    nen.cur = Math.max(0, nen.cur - cost);
    getHXH()?.updateNenHud?.();
  }

  function updateShu(dt) {
    const state = advState.currentState;
    if (!state) return;
    const aura = state.aura || (state.aura = {});
    const status = advState.shuStatus;
    const prevIntent = status.intent;
    const prevActive = status.active;

    const intent = !!aura.shu;
    const weapon = getActiveWeapon(state);
    const weaponOut = weaponIsOut(state, weapon);
    const active = intent && weaponOut;
    const modifiers = active ? resolveShuModifiers(state, weapon) : null;

    aura.__shuIntent = intent;
    aura.__shuWeaponOut = weaponOut;
    aura.__shuActive = active;
    aura.__shuModifiers = modifiers;
    aura.__shuDurabilityScalar = modifiers ? modifiers.durabilityScalar : 1;
    aura.__shuDamageMul = modifiers ? modifiers.damageMul : 1;

    status.intent = intent;
    status.weaponOut = weaponOut;
    status.active = active;
    status.weapon = weapon || null;
    status.modifiers = modifiers;

    const Items = getItems();
    if (Items?.recordShuState) {
      Items.recordShuState({
        state,
        weapon,
        intent,
        active,
        weaponOut,
        modifiers
      });
    } else if (Items && Items.__runtime) {
      Items.__runtime.shu = { intent, active, weaponOut, weapon, modifiers };
    }

    if (intent && !weaponOut) {
      if (!status.warned && prevIntent !== intent) {
        hudMessage("Shu requires an equipped weapon.");
        status.warned = true;
      }
    } else {
      status.warned = false;
    }

    if (active && !prevActive) {
      refreshShuProjectiles();
    }
    status.lastActive = active;

    updateShuGlyph(status);

    if (active !== prevActive) {
      getHXH()?.updateAuraHud?.();
    }
  }

  function ensureHighlightEntry(enemy) {
    if (!enemy || !enemy.root) return null;
    let entry = advState.enemyHighlights.get(enemy);
    if (entry) return entry;
    const mesh = enemy.parts?.head || enemy.root;
    if (!mesh) return null;
    entry = {
      enemy,
      mesh,
      originalOutline: mesh.renderOutline || false,
      originalOutlineWidth: typeof mesh.outlineWidth === "number" ? mesh.outlineWidth : 0,
      originalOutlineColor: mesh.outlineColor?.clone ? mesh.outlineColor.clone() : null,
      originalEmissive: mesh.material?.emissiveColor?.clone ? mesh.material.emissiveColor.clone() : null,
      active: false,
      disposeObserver: null
    };
    if (mesh.onDisposeObservable?.add) {
      entry.disposeObserver = mesh.onDisposeObservable.add(() => {
        advState.enemyHighlights.delete(enemy);
      });
    }
    advState.enemyHighlights.set(enemy, entry);
    return entry;
  }

  function resetEnemyHighlight(entry) {
    if (!entry || !entry.mesh) return;
    const mesh = entry.mesh;
    if (mesh.isDisposed?.()) return;
    mesh.renderOutline = entry.originalOutline;
    mesh.outlineWidth = entry.originalOutlineWidth;
    if (entry.originalOutlineColor) {
      if (!mesh.outlineColor) {
        mesh.outlineColor = entry.originalOutlineColor.clone ? entry.originalOutlineColor.clone() : entry.originalOutlineColor;
      } else if (mesh.outlineColor.copyFrom) {
        mesh.outlineColor.copyFrom(entry.originalOutlineColor);
      }
    }
    if (entry.originalEmissive && mesh.material?.emissiveColor?.copyFrom) {
      mesh.material.emissiveColor.copyFrom(entry.originalEmissive);
    }
    entry.active = false;
  }

  function applyEnemyHighlight(entry, enemy, now) {
    if (!entry || !entry.mesh) return;
    const mesh = entry.mesh;
    if (mesh.isDisposed?.()) return;
    const vulnerable = (enemy.koVulnerabilityT ?? 0) > 0;
    const pulse = 0.55 + 0.45 * Math.sin((now || performance.now()) * 0.005);
    const outlineWidth = vulnerable ? 0.065 + 0.02 * pulse : 0.04 + 0.01 * pulse;
    mesh.renderOutline = true;
    mesh.outlineWidth = outlineWidth;
    const outlineColor = vulnerable ? COLORS.weakVulnerable : COLORS.weakIdle;
    if (outlineColor) {
      if (!mesh.outlineColor) {
        mesh.outlineColor = outlineColor.clone ? outlineColor.clone() : outlineColor;
      } else if (mesh.outlineColor.copyFrom) {
        mesh.outlineColor.copyFrom(outlineColor);
      }
    }
    const glowColor = vulnerable ? COLORS.weakGlowVulnerable : COLORS.weakGlow;
    if (glowColor && mesh.material?.emissiveColor?.copyFrom) {
      mesh.material.emissiveColor.copyFrom(glowColor);
    }
    entry.active = true;
  }

  function updateEnemyHighlights(now) {
    const H = getHXH();
    const enemies = Array.isArray(H?.enemies) ? H.enemies : [];
    const seen = new Set();
    enemies.forEach(enemy => {
      if (!enemy || !enemy.root || enemy.root.isDisposed?.() || !enemy.alive) {
        return;
      }
      seen.add(enemy);
      const entry = ensureHighlightEntry(enemy);
      if (!entry) return;
      if (advState.gyoActive) {
        applyEnemyHighlight(entry, enemy, now);
      } else if (entry.active) {
        resetEnemyHighlight(entry);
      }
    });
    for (const [enemy, entry] of advState.enemyHighlights.entries()) {
      if (!seen.has(enemy) || !advState.gyoActive) {
        resetEnemyHighlight(entry);
        if (!seen.has(enemy)) {
          advState.enemyHighlights.delete(enemy);
        }
      }
    }
  }

  function updateConcealedRecord(record) {
    const mesh = record?.mesh;
    if (!mesh || mesh.isDisposed?.()) return false;
    const show = advState.gyoActive;
    if (show) {
      mesh.isVisible = true;
      if (typeof record.meta.originalVisibility === "number") {
        mesh.visibility = record.meta.originalVisibility;
      } else {
        mesh.visibility = 1;
      }
      if (mesh.material) {
        if (typeof record.meta.originalAlpha === "number") {
          mesh.material.alpha = record.meta.originalAlpha;
        }
        if (mesh.material.emissiveColor?.copyFrom) {
          const color = record.visibleEmissive || (record.visibleEmissive = COLORS.concealGlow.clone ? COLORS.concealGlow.clone() : COLORS.concealGlow);
          mesh.material.emissiveColor.copyFrom(color);
        }
      }
      if (COLORS.concealOutline) {
        if (!mesh.outlineColor) {
          mesh.outlineColor = COLORS.concealOutline.clone ? COLORS.concealOutline.clone() : COLORS.concealOutline;
        } else if (mesh.outlineColor.copyFrom) {
          mesh.outlineColor.copyFrom(COLORS.concealOutline);
        }
      }
      mesh.renderOutline = true;
      mesh.outlineWidth = 0.038;
    } else {
      mesh.renderOutline = false;
      mesh.visibility = 0;
      mesh.isVisible = false;
      if (mesh.material && typeof mesh.material.alpha === "number") {
        if (record.meta.originalAlpha === undefined) record.meta.originalAlpha = mesh.material.alpha;
        mesh.material.alpha = 0;
      }
    }
    return true;
  }

  function pruneConcealed() {
    for (const record of Array.from(advState.concealedRecords)) {
      const mesh = record.mesh;
      if (!mesh || mesh.isDisposed?.()) {
        if (mesh?.onDisposeObservable?.remove && record.disposeObserver) {
          mesh.onDisposeObservable.remove(record.disposeObserver);
        }
        advState.concealedRecords.delete(record);
      }
    }
  }

  function updateConcealed() {
    for (const record of advState.concealedRecords) {
      updateConcealedRecord(record);
    }
    pruneConcealed();
  }

  function registerConcealed(item) {
    if (!item || typeof item !== "object" || !item.mesh) return;
    const mesh = item.mesh;
    if (mesh.isDisposed?.()) return;
    const record = {
      item,
      mesh,
      meta: {
        originalVisibility: typeof mesh.visibility === "number" ? mesh.visibility : 1,
        originalAlpha: mesh.material && typeof mesh.material.alpha === "number" ? mesh.material.alpha : undefined
      },
      disposeObserver: null,
      visibleEmissive: null
    };
    if (mesh.onDisposeObservable?.add) {
      record.disposeObserver = mesh.onDisposeObservable.add(() => {
        advState.concealedRecords.delete(record);
      });
    }
    if (!mesh.metadata) mesh.metadata = {};
    mesh.metadata.concealed = true;
    advState.concealedRecords.add(record);
    item.concealed = true;
    updateConcealedRecord(record);
  }

  function handleConjured(item) {
    if (!advState.currentState || item?.source !== advState.currentState) return;
    if (!advState.inStatus.pending) return;
    const limb = typeof item?.limb === "string" ? item.limb : "";
    const qualifies = limb === "nenBlast" || limb === "nenVolley" || item?.conjured === true || item?.trap === true;
    if (!qualifies) return;
    registerConcealed(item);
    if (!advState.inStatus.notified) {
      hudMessage("In veil hides the conjuration.");
      advState.inStatus.notified = true;
    }
    if (limb === "nenVolley") {
      if (!advState.inStatus.pendingKind) {
        advState.inStatus.pendingKind = limb;
        advState.inStatus.pendingWindow = VOLLEY_WINDOW;
      }
      return;
    }
    resetInStatus();
  }

  function attachProjectiles(projectiles) {
    if (!Array.isArray(projectiles)) return;
    if (advState.trackedProjectiles === projectiles) return;
    detachProjectiles();
    advState.trackedProjectiles = projectiles;
    const original = projectiles.push;
    advState.originalProjectilePush = original;
    projectiles.push = function(...items) {
      const result = original.apply(this, items);
      items.forEach(item => {
        handleConjured(item);
        handleShuProjectile(item);
        handleTransmuterProjectile(item);
        handleEmitterProjectile(item);
      });
      return result;
    };
    refreshShuProjectiles();
  }

  function detachProjectiles() {
    if (advState.trackedProjectiles && advState.originalProjectilePush) {
      try {
        advState.trackedProjectiles.push = advState.originalProjectilePush;
      } catch (err) {
        console.warn("[HXH] Failed to restore projectile push", err);
      }
    }
    clearProjectileSlows();
    advState.trackedProjectiles = null;
    advState.originalProjectilePush = null;
  }

  function handleAuraChange(aura) {
    const active = !!aura?.gyo;
    if (advState.gyoActive === active) return;
    advState.gyoActive = active;
    setOverlayActive(active);
    updateConcealed();
    if (advState.boundSigil?.mesh?.material && typeof advState.boundSigil.mesh.material.alpha === "number") {
      advState.boundSigil.mesh.material.alpha = active ? 0.85 : 0.0;
    }
  }

  function attachState(state) {
    advState.currentState = state;
    updateNenType(state);
    ensureSpecialOverride(state);
    if (inferNenType(state) === "Transmuter") {
      ensureTransmuteMode(state);
    } else if (inferNenType(state) === "Conjurer") {
      const options = resolveVowOptions(state);
      if (options.length && !advState.boundSigilSelection) {
        advState.boundSigilSelection = options[0].key;
      }
    }
    resetEnState({ skipHud: true, disposeLayer: true });
    ensureOverlay();
    ensureInIndicator();
    advState.gyoActive = !!state?.aura?.gyo;
    setOverlayActive(advState.gyoActive);
    const aura = state?.aura || {};
    const status = advState.shuStatus;
    const weapon = getActiveWeapon(state);
    const inferredWeaponOut = weaponIsOut(state, weapon);
    status.intent = !!aura.shu;
    status.active = !!(aura.__shuActive ?? (status.intent && inferredWeaponOut));
    status.weaponOut = !!(aura.__shuWeaponOut ?? inferredWeaponOut);
    status.modifiers = aura.__shuModifiers || (status.active ? resolveShuModifiers(state, weapon) : null);
    status.weapon = weapon;
    status.lastActive = status.active;
    status.warned = false;
    updateShuGlyph(status);
    const H = getHXH();
    if (H?.subscribeAura) {
      advState.unsubscribeAura = H.subscribeAura(handleAuraChange);
    }
    attachProjectiles(H?.projectiles);
    updateShu(0);
  }

  function detachState() {
    const H = getHXH();
    if (H && advState.originalSpecial) {
      H.special = advState.originalSpecial;
    }
    disposeBoundSigil();
    closeNenRadial();
    resetEnState({ skipHud: true, disposeLayer: true });
    if (advState.unsubscribeAura) {
      try { advState.unsubscribeAura(); } catch (err) { console.warn("[HXH] Aura unsubscribe failed", err); }
      advState.unsubscribeAura = null;
    }
    detachProjectiles();
    advState.currentState = null;
    advState.gyoActive = false;
    setOverlayActive(false);
    resetInStatus();
    for (const record of advState.concealedRecords) {
      const mesh = record.mesh;
      if (mesh?.onDisposeObservable?.remove && record.disposeObserver) {
        mesh.onDisposeObservable.remove(record.disposeObserver);
      }
    }
    advState.concealedRecords.clear();
    for (const [, entry] of advState.enemyHighlights.entries()) {
      resetEnemyHighlight(entry);
    }
    advState.enemyHighlights.clear();
    const glyph = advState.shuStatus.glyph;
    if (glyph) {
      glyph.classList.add("hidden");
      glyph.classList.remove("active", "intent", "armed");
    }
    Object.assign(advState.shuStatus, {
      intent: false,
      active: false,
      weaponOut: false,
      lastActive: false,
      modifiers: null,
      weapon: null,
      warned: false
    });
    const Items = getItems();
    Items?.recordShuState?.(null);
  }

  function isGameScreenVisible() {
    const screen = document.getElementById("screen--game");
    return !!(screen && screen.classList.contains("visible"));
  }

  function handleKeydown(e) {
    if (e.repeat) return;
    if (e.code === "KeyI" && isGameScreenVisible()) {
      toggleIn();
    }
    if (e.code === "KeyV" && isGameScreenVisible()) {
      const status = advState.enStatus;
      status.keyHeld = true;
      status.keyDownAt = getNow();
      status.pendingPulse = true;
      status.maintainFailed = false;
      if (!status.maintainActive) {
        setAuraEn(false, 0);
      }
    }
    if (e.code === "Tab" && isGameScreenVisible()) {
      e.preventDefault();
      if (!advState.radial.active) {
        openNenRadial(advState.currentState);
        ensureTransmuteMode(advState.currentState);
      }
    }
  }

  function handleKeyup(e) {
    if (e.code === "KeyV") {
      const status = advState.enStatus;
      const now = getNow();
      if (status.maintainActive) {
        stopEnMaintain(null, { silent: true });
      } else if (status.pendingPulse && !status.maintainFailed) {
        const held = now - status.keyDownAt;
        if (held <= status.holdThresholdMs + 80) {
          performEnPulse(now);
        } else {
          setAuraEn(false, 0);
        }
      } else {
        setAuraEn(false, 0);
      }
      status.keyHeld = false;
      status.pendingPulse = false;
      status.maintainFailed = false;
      return;
    }
    if (e.code === "Tab") {
      e.preventDefault();
      closeNenRadial();
    }
  }

  function frame(ts) {
    const H = getHXH();
    const state = H?.state || null;
    if (state !== advState.currentState) {
      if (advState.currentState) detachState();
      if (state) attachState(state);
    }
    if (!advState.lastFrameTs) advState.lastFrameTs = ts;
    const dt = Math.max(0, (ts - advState.lastFrameTs) / 1000);
    advState.lastFrameTs = ts;

    updateEn(ts, dt);

    if (advState.currentState) {
      updateNenType(advState.currentState);
      if (H?.projectiles && H.projectiles !== advState.trackedProjectiles) {
        attachProjectiles(H.projectiles);
      }
      updateShu(dt);
      drainIn(dt);
      if (advState.inStatus.pendingKind) {
        advState.inStatus.pendingWindow = Math.max(0, advState.inStatus.pendingWindow - dt);
        if (advState.inStatus.pendingWindow <= 0) {
          resetInStatus();
        }
      }
      updateConcealed();
      updateEnemyHighlights(ts);
      updateTransmuterProjectiles(dt);
      updateEmitterProjectiles(ts, dt);
      updateBoundSigil(ts, dt);
      updateManipulatorEffects(ts, dt);
    }

    globalObj.requestAnimationFrame(frame);
  }

  if (!existing.applyVow) existing.applyVow = function(){};
  if (!existing.currentSpec) existing.currentSpec = function(){ return null; };

  const api = Object.assign({}, existing, {
    getVowRules: listVowRules,
    resolveVow(ruleId, strength = 1, lethal = false) {
      const combo = combineVows([{ ruleId, strength, lethal }]);
      return combo.entries[0] || null;
    },
    combineVows,
    applyVow: existing.applyVow,
    currentSpec: existing.currentSpec,
    toggleIn,
    activateIn: toggleIn,
    cancelIn,
    onKoStrike: handleKoStrike,
    isGyoActive: () => advState.gyoActive,
    getAdvancedState: () => ({
      gyoActive: advState.gyoActive,
      inPrepared: advState.inStatus.prepared,
      inUpkeep: advState.inStatus.upkeep,
      concealedCount: advState.concealedRecords.size
    })
  });

  api.__state = advState;
  api.__initialized = true;
  globalObj.NenAdvanced = api;

  try {
    globalObj.addEventListener("keydown", handleKeydown, { passive: true });
    globalObj.addEventListener("keyup", handleKeyup, { passive: true });
  } catch (err) {
    console.warn("[HXH] NenAdvanced key handler failed", err);
  }

  globalObj.requestAnimationFrame(frame);
})();
