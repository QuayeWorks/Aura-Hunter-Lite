// spawns.js — vegetation/enemy spawn helpers
(function(){
  const H = (window.HXH ||= {});

  const DEFAULT_ENEMY_HP = 50;
  const DEFAULT_ENEMY_SPEED = 3.8;

  const rand = (min, max) => {
    if (typeof H.rand === "function") return H.rand(min, max);
    if (typeof min !== "number" || typeof max !== "number") {
      return Math.random();
    }
    return min + Math.random() * (max - min);
  };

  function randRange(range, fallback) {
    if (!range) return fallback;
    const { min, max } = normalizeRange(range, fallback);
    if (typeof min !== "number" || typeof max !== "number") return fallback;
    if (min === max) return min;
    return rand(min, max);
  }

  function normalizeRange(range, fallback) {
    if (typeof range === "number") {
      return { min: range, max: range };
    }
    if (!range || typeof range !== "object") {
      return fallback ? normalizeRange(fallback) : { min: undefined, max: undefined };
    }
    const min = typeof range.min === "number" ? range.min : typeof range.base === "number" ? range.base : undefined;
    const max = typeof range.max === "number" ? range.max : typeof range.base === "number" ? range.base : undefined;
    return { min, max };
  }

  function weightedPick(entries) {
    if (!Array.isArray(entries) || !entries.length) return null;
    let total = 0;
    for (const entry of entries) {
      const weight = typeof entry.weight === "number" ? Math.max(0, entry.weight) : 1;
      total += weight;
    }
    if (total <= 0) return entries[0];
    let roll = rand(0, total);
    for (const entry of entries) {
      const weight = typeof entry.weight === "number" ? Math.max(0, entry.weight) : 1;
      roll -= weight;
      if (roll <= 0) return entry;
    }
    return entries[entries.length - 1];
  }

  function parseColor(input) {
    if (!input) return null;
    if (input instanceof BABYLON.Color3) return input.clone();
    if (typeof input === "string") {
      try {
        return BABYLON.Color3.FromHexString(input);
      } catch (err) {
        console.warn("[Spawns] Failed to parse color", input, err);
      }
    }
    if (Array.isArray(input) && input.length >= 3) {
      return new BABYLON.Color3(
        Number.parseFloat(input[0]) || 0,
        Number.parseFloat(input[1]) || 0,
        Number.parseFloat(input[2]) || 0
      );
    }
    return null;
  }

  function resolveNumeric(spec, baseValue) {
    if (spec == null) return baseValue;
    if (typeof spec === "number") return spec;
    if (typeof spec === "object") {
      const base = typeof spec.base === "number" ? spec.base : baseValue;
      const variance = typeof spec.variance === "number" ? spec.variance : typeof spec.spread === "number" ? spec.spread : 0;
      const bonus = typeof spec.bonus === "number" ? spec.bonus : 0;
      const scale = typeof spec.scale === "number" ? spec.scale : typeof spec.mult === "number" ? spec.mult : 1;
      const roll = variance ? rand(-variance, variance) : 0;
      return (base + roll + bonus) * scale;
    }
    return baseValue;
  }

  function clamp(value, min, max) {
    if (typeof value !== "number") return value;
    if (typeof min === "number" && value < min) return min;
    if (typeof max === "number" && value > max) return max;
    return value;
  }

  function computeCadence(region) {
    const table = getSpawnTable(region);
    if (!table || !table.cadence) return null;
    const cadenceRange = normalizeRange(table.cadence, { min: table.cadence.base ?? table.cadence, max: table.cadence.base ?? table.cadence });
    if (cadenceRange.min == null && cadenceRange.max == null) return null;
    return Math.max(1, randRange(cadenceRange, { min: 18, max: 28 }));
  }

  function getSpawnTable(region) {
    if (!region || typeof region !== "object") return null;
    return region.spawnTable || null;
  }

  let activeRegion = null;
  let lastPlan = null;
  let nextCadence = null;

  function useRegion(region) {
    activeRegion = region || null;
    nextCadence = computeCadence(activeRegion);
  }

  function planWave(context = {}) {
    const region = context.region || activeRegion;
    const table = getSpawnTable(region);
    if (!table) return null;
    const difficulty = context.difficulty ?? region?.difficulty ?? 1;
    const baseCount = context.baseCount ?? table.waveSize?.base ?? table.wave?.base ?? 6;
    const waveSpec = table.waveSize || table.wave || {};
    const variance = typeof waveSpec.variance === "number" ? waveSpec.variance : typeof waveSpec.spread === "number" ? waveSpec.spread : 0;
    const min = typeof waveSpec.min === "number" ? waveSpec.min : baseCount - variance;
    const max = typeof waveSpec.max === "number" ? waveSpec.max : baseCount + variance;
    const ramp = typeof waveSpec.ramp === "number" ? waveSpec.ramp : typeof waveSpec.scale === "number" ? waveSpec.scale : 0;
    const diffBonus = ramp ? (difficulty - 1) * ramp : 0;
    const count = Math.max(1, Math.round(randRange({ min, max }, { min: baseCount, max: baseCount }) + diffBonus));

    const enemyEntries = Array.isArray(table.enemies) ? table.enemies : [];
    const planned = [];
    for (let i = 0; i < count; i += 1) {
      const def = weightedPick(enemyEntries);
      planned.push(buildEnemyPlan(def, context, region, i));
    }

    nextCadence = computeCadence(region) ?? nextCadence;
    lastPlan = {
      count,
      entries: planned,
      cadence: nextCadence,
      regionId: region?.id || null
    };
    if (typeof window.Enemies?.__notifySpawnPlan === "function") {
      try {
        window.Enemies.__notifySpawnPlan(lastPlan);
      } catch (err) {
        console.warn("[Spawns] Failed to notify spawn observers", err);
      }
    }
    return lastPlan;
  }

  function buildEnemyPlan(def, context, region, index) {
    const plan = {
      id: def?.id || `enemy-${index}`,
      label: def?.name || def?.label || def?.id || null,
      role: def?.role || null,
      tint: def?.tint ? parseColor(def.tint) : null,
      hp: null,
      hpMultiplier: null,
      speed: null,
      speedMultiplier: null,
      bonusXP: typeof def?.xp === "number" ? def.xp : 0,
      meta: def?.meta || null
    };

    if (def?.hp !== undefined) {
      if (typeof def.hp === "number") {
        plan.hp = clamp(def.hp, 1, 9999);
      } else if (typeof def.hp === "object") {
        const resolved = resolveNumeric(def.hp, DEFAULT_ENEMY_HP);
        plan.hp = clamp(resolved, 1, 9999);
      }
    } else if (typeof def?.hpMultiplier === "number") {
      plan.hpMultiplier = Math.max(0.1, def.hpMultiplier);
    }

    if (def?.speed !== undefined) {
      if (typeof def.speed === "number") {
        plan.speed = Math.max(0.4, def.speed);
      } else if (typeof def.speed === "object") {
        const resolved = resolveNumeric(def.speed, DEFAULT_ENEMY_SPEED);
        plan.speed = Math.max(0.4, resolved);
      }
    } else if (typeof def?.speedMultiplier === "number") {
      plan.speedMultiplier = Math.max(0.2, def.speedMultiplier);
    }

    if (typeof def?.onBuild === "function") {
      try {
        def.onBuild(plan, { context, region, index });
      } catch (err) {
        console.warn("[Spawns] onBuild hook failed", err);
      }
    }

    return plan;
  }

  function applyEnemyProfile(enemy, plan, meta = {}) {
    if (!enemy || !plan) return enemy;
    if (typeof plan.hp === "number") {
      enemy.hp = plan.hp;
      enemy.maxHp = plan.hp;
    } else if (typeof plan.hpMultiplier === "number") {
      const base = enemy.hp ?? DEFAULT_ENEMY_HP;
      const next = clamp(base * plan.hpMultiplier, 1, 9999);
      enemy.hp = next;
      enemy.maxHp = next;
    }

    if (typeof plan.speed === "number") {
      enemy.speed = plan.speed;
    } else if (typeof plan.speedMultiplier === "number" && typeof enemy.speed === "number") {
      enemy.speed = Math.max(0.2, enemy.speed * plan.speedMultiplier);
    }

    if (plan.tint && enemy.root?.getChildMeshes) {
      try {
        const color = plan.tint;
        enemy.root.getChildMeshes().forEach(mesh => {
          if (!mesh.material) return;
          if (mesh.material.diffuseColor) mesh.material.diffuseColor = color.clone();
          if (mesh.material.emissiveColor) mesh.material.emissiveColor = color.scale(0.18);
        });
      } catch (err) {
        console.warn("[Spawns] Failed to tint enemy", err);
      }
    }

    enemy.profileId = plan.id;
    enemy.profileLabel = plan.label;
    enemy.profileMeta = plan.meta;
    if (typeof plan.bonusXP === "number") {
      enemy.bonusXP = (enemy.bonusXP || 0) + plan.bonusXP;
    }

    if (typeof plan.onApply === "function") {
      try {
        plan.onApply(enemy, meta);
      } catch (err) {
        console.warn("[Spawns] onApply hook failed", err);
      }
    }
    return enemy;
  }

  function getLastPlan() {
    return lastPlan ? { ...lastPlan, entries: lastPlan.entries.slice() } : null;
  }

  const Spawns = {
    scatterVegetation: (...a)=>H.scatterVegetation?.(...a),
    useRegion,
    planWave,
    applyEnemyProfile,
    getLastPlan,
    getActiveRegion: () => activeRegion,
    getNextCadence: () => nextCadence,
    getSpawnTable: () => getSpawnTable(activeRegion)
  };

  window.Spawns = Spawns;
})();
