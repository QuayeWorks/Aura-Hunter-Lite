// enemies.js — thin accessors around enemy collections
(function(){
  const H = (window.HXH ||= {});
  const watchers = new Set();
  const processed = new WeakSet();
  const limbKeys = ["head", "torso", "rArm", "lArm", "rLeg", "lLeg"];
  const SIM_STATE_SLEEPING = "sleeping";
  const SIM_STATE_DESPAWNED = "despawned";
  const archetypeById = new Map([
    ["glacier-brute", "bruiser"],
    ["cinder-brute", "bruiser"],
    ["ember-lancer", "caster"],
    ["ember-ranger", "caster"],
    ["flare-stalker", "assassin"],
    ["scout", "assassin"],
    ["skirmisher", "caster"],
    ["winter-wolf", "assassin"],
    ["ember-bruiser", "bruiser"],
  ]);
  const archetypeFallbacks = {
    slow: "bruiser",
    fast: "assassin",
    ranged: "caster"
  };

  const CURSE_PROFILES = {
    bruiser: { chance: 0.12, duration: 5200, dot: 4.5, slow: 0.08, maxStacks: 3 },
    assassin: { chance: 0.18, duration: 6400, dot: 5.5, slow: 0.12, maxStacks: 4 },
    caster: { chance: 0.22, duration: 7200, dot: 6, slow: 0.1, maxStacks: 4 }
  };

  function getWorkerJobs() {
    const utils = window.WorldUtils;
    if (!utils || !utils.WorkerJobs) return null;
    return utils.WorkerJobs;
  }

  function normalizeGridInput(grid, width, height) {
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const total = w * h;
    if (ArrayBuffer.isView(grid)) {
      const copy = new Uint8Array(total);
      const source = grid.subarray(0, Math.min(grid.length, total));
      copy.set(source);
      return { grid: copy, width: w, height: h };
    }
    const data = new Uint8Array(total);
    if (Array.isArray(grid)) {
      const limit = Math.min(total, grid.length);
      for (let i = 0; i < limit; i++) {
        data[i] = grid[i] ? 1 : 0;
      }
    }
    return { grid: data, width: w, height: h };
  }

  function fallbackPath(start, goal, width, height, reason = null) {
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const sx = Math.max(0, Math.min(w - 1, start?.x ?? 0));
    const sy = Math.max(0, Math.min(h - 1, start?.y ?? 0));
    const gx = Math.max(0, Math.min(w - 1, goal?.x ?? sx));
    const gy = Math.max(0, Math.min(h - 1, goal?.y ?? sy));
    const points = [];
    points.push({ x: sx, y: sy });
    if (sx !== gx || sy !== gy) {
      points.push({ x: gx, y: gy });
    }
    return { success: true, points, reason };
  }

  function requestPathJob(grid, width, height, start, goal, opts = {}) {
    const jobs = getWorkerJobs();
    const normalized = normalizeGridInput(grid, width, height);
    if (!jobs || typeof jobs.requestPathGrid !== "function") {
      return Promise.resolve(fallbackPath(start, goal, normalized.width, normalized.height, "no-worker"));
    }
    try {
      const job = jobs.requestPathGrid({
        grid: normalized.grid,
        width: normalized.width,
        height: normalized.height,
        start: { x: start?.x ?? 0, y: start?.y ?? 0 },
        goal: { x: goal?.x ?? 0, y: goal?.y ?? 0 },
        allowDiagonal: !!opts.allowDiagonal
      });
      if (!job || typeof job.then !== "function") {
        return Promise.resolve(fallbackPath(start, goal, normalized.width, normalized.height, "job-unavailable"));
      }
      return job.then((result) => {
        const payload = result || {};
        const typed = ArrayBuffer.isView(payload.path) ? payload.path : null;
        const raw = typed ? Array.from(typed) : Array.isArray(payload.path) ? payload.path.slice() : [];
        const points = [];
        for (let i = 0; i < raw.length; i += 2) {
          points.push({ x: raw[i], y: raw[i + 1] });
        }
        if (!points.length) {
          return fallbackPath(start, goal, normalized.width, normalized.height, payload.reason || "empty");
        }
        return { success: payload.success !== false, points, reason: payload.reason || null };
      }).catch((err) => {
        console.warn("[Enemies] Path worker failed", err);
        return fallbackPath(start, goal, normalized.width, normalized.height, "worker-error");
      });
    } catch (err) {
      console.warn("[Enemies] Unable to queue path job", err);
      return Promise.resolve(fallbackPath(start, goal, normalized.width, normalized.height, "exception"));
    }
  }

  const intelState = {
    list: [],
    updatedAt: 0
  };

  function parseColor(hex, fallback) {
    if (typeof BABYLON === "undefined" || !BABYLON.Color3) return fallback || null;
    if (typeof BABYLON.Color3.FromHexString === "function" && typeof hex === "string") {
      try {
        return BABYLON.Color3.FromHexString(hex);
      } catch (err) {
        return fallback || new BABYLON.Color3(0.3, 0.8, 1.0);
      }
    }
    return fallback || new BABYLON.Color3(0.3, 0.8, 1.0);
  }

  function notify(plan) {
    for (const cb of watchers) {
      try {
        cb?.(plan);
      } catch (err) {
        console.warn("[Enemies] Spawn plan listener failed", err);
      }
    }
  }

  function cleanupEnemy(enemy) {
    if (!enemy) return;
    disposeMarkers(enemy);
    disposeOrbs(enemy);
    setEnemyVisibility(enemy, 1);
  }

  const rand = (min, max) => {
    if (typeof H.rand === "function") return H.rand(min, max);
    if (typeof min !== "number" || typeof max !== "number") return Math.random();
    return min + Math.random() * (max - min);
  };

  function nowMs() {
    if (typeof performance === "object" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getEnemyParts(enemy) {
    return enemy?.root?.metadata?.parts || null;
  }

  function limbNode(parts, limb) {
    if (!parts) return null;
    switch (limb) {
      case "head":
        return parts.head || null;
      case "torso":
        return parts.upperTorso || parts.lowerTorso || parts.pelvis || null;
      case "rArm":
        return parts.armR?.wrist || parts.armR?.elbow || null;
      case "lArm":
        return parts.armL?.wrist || parts.armL?.elbow || null;
      case "rLeg":
        return parts.legR?.ankle || parts.legR?.footMesh || null;
      case "lLeg":
        return parts.legL?.ankle || parts.legL?.footMesh || null;
      default:
        return enemy?.root || null;
    }
  }

  function ensureMaterial(scene, color) {
    if (typeof BABYLON === "undefined") return null;
    const key = color?.toHexString?.() || "#3ab5ff";
    if (!ensureMaterial.cache) ensureMaterial.cache = new Map();
    if (ensureMaterial.cache.has(key)) return ensureMaterial.cache.get(key);
    const mat = new BABYLON.StandardMaterial(`nen-signal-${ensureMaterial.cache.size}`, scene || BABYLON.Engine.LastCreatedScene);
    const col = color || new BABYLON.Color3(0.25, 0.7, 1.0);
    mat.emissiveColor = col;
    mat.diffuseColor = col.scale(0.1);
    mat.specularColor = BABYLON.Color3.Black();
    ensureMaterial.cache.set(key, mat);
    return mat;
  }

  function ensureMarker(enemy, limb) {
    if (!enemy || typeof BABYLON === "undefined") return null;
    const scene = enemy.root?.getScene?.() || enemy.root?._scene || BABYLON.Engine.LastCreatedScene;
    const parts = getEnemyParts(enemy);
    const key = limb || "torso";
    const markers = enemy.__nenMarkers || (enemy.__nenMarkers = new Map());
    if (markers.has(key)) {
      const marker = markers.get(key);
      if (marker?.mesh && !marker.mesh.isDisposed()) return marker;
    }
    const mesh = BABYLON.MeshBuilder.CreateSphere(`nen-intent-${key}-${enemy.__enemyId || "?"}`, {
      diameter: 0.65
    }, scene);
    mesh.parent = enemy.root;
    mesh.isPickable = false;
    mesh.isVisible = false;
    mesh.material = ensureMaterial(scene, parseColor("#4cd5ff", new BABYLON.Color3(0.3, 0.82, 1)));
    const marker = { mesh, limb: key };
    markers.set(key, marker);
    const node = limbNode(parts, key);
    if (node?.getAbsolutePosition) {
      const local = node.getAbsolutePosition().subtract(enemy.root.position);
      mesh.position.copyFrom(local);
    }
    return marker;
  }

  function disposeMarkers(enemy) {
    const markers = enemy?.__nenMarkers;
    if (!markers) return;
    markers.forEach(entry => {
      try { entry?.mesh?.dispose?.(); } catch {}
    });
    markers.clear();
  }

  function setEnemyVisibility(enemy, value) {
    if (!enemy?.root?.getChildMeshes) return;
    const clamped = Math.max(0.05, Math.min(1, value));
    enemy.root.getChildMeshes().forEach(mesh => {
      mesh.visibility = clamped;
    });
  }

  function assignArchetype(enemy) {
    if (!enemy || processed.has(enemy)) return enemy;
    const id = typeof enemy.profileId === "string" ? enemy.profileId.toLowerCase() : "";
    let archetype = archetypeById.get(id) || null;
    if (!archetype) {
      const speed = Number(enemy.speed) || 0;
      const hp = Number(enemy.hp) || 0;
      if (speed <= 3.2 && hp >= 60) {
        archetype = archetypeFallbacks.slow;
      } else if (speed >= 4.4 && hp < 60) {
        archetype = archetypeFallbacks.fast;
      } else {
        archetype = archetypeFallbacks.ranged;
      }
    }
    enemy.nenArchetype = archetype;
    enemy.nenLiteracy = true;
    const curseProfile = archetype ? CURSE_PROFILES[archetype] || null : null;
    enemy.__curseProfile = curseProfile ? { ...curseProfile } : null;
    processed.add(enemy);
    if (archetype === "bruiser") {
      enemy.__nenTelegraph = {
        nextAt: nowMs() + rand(1400, 2600),
        active: false,
        limb: limbKeys[Math.floor(Math.random() * limbKeys.length)]
      };
    } else if (archetype === "assassin") {
      enemy.__nenZetsu = {
        nextAt: nowMs() + rand(2200, 3600),
        active: false,
        spotted: false
      };
    } else if (archetype === "caster") {
      enemy.__nenOrbs = {
        nextSpawn: nowMs() + rand(800, 1400),
        orbs: []
      };
    }
    return enemy;
  }

  function updateBruiser(enemy, dt, now, intel) {
    const tele = enemy.__nenTelegraph;
    if (!tele) return;
    if (!enemy.alive) {
      disposeMarkers(enemy);
      return;
    }
    if (!tele.active && now >= tele.nextAt) {
      tele.active = true;
      tele.startAt = now;
      tele.impactWindow = now + 1400;
      tele.cooldown = rand(2600, 4200);
      tele.limb = limbKeys[Math.floor(Math.random() * limbKeys.length)];
      const marker = ensureMarker(enemy, tele.limb);
      if (marker?.mesh) {
        marker.mesh.isVisible = true;
        marker.mesh.scaling.setAll(1);
      }
    }
    if (tele.active) {
      const elapsed = (now - tele.startAt) / 1400;
      const marker = ensureMarker(enemy, tele.limb);
      if (marker?.mesh) {
        const pulse = 0.8 + Math.sin(elapsed * Math.PI * 2) * 0.25;
        marker.mesh.scaling.setAll(0.75 + pulse * 0.35);
        marker.mesh.isVisible = true;
      }
      if (intel) {
        intel.push({
          id: enemy.__enemyId || null,
          archetype: "bruiser",
          type: "telegraph",
          limb: tele.limb,
          urgency: Math.max(0, 1 - elapsed)
        });
      }
      if (now > tele.startAt + 3200) {
        tele.active = false;
        tele.nextAt = now + tele.cooldown;
        const marker = enemy.__nenMarkers?.get(tele.limb);
        if (marker?.mesh) marker.mesh.isVisible = false;
      }
    } else if (enemy.__nenMarkers) {
      const marker = enemy.__nenMarkers.get(tele.limb);
      if (marker?.mesh) marker.mesh.isVisible = false;
    }
  }

  function startZetsu(enemy, now) {
    const data = enemy.__nenZetsu;
    if (!data) return;
    data.active = true;
    data.startedAt = now;
    data.duration = rand(1600, 2400);
    data.breakAt = now + data.duration;
    data.nextAt = data.breakAt + rand(2000, 3400);
    data.countered = false;
  }

  function updateAssassin(enemy, dt, now, intel, gyoActive) {
    const cloak = enemy.__nenZetsu;
    if (!cloak) return;
    if (!enemy.alive) {
      setEnemyVisibility(enemy, 1);
      return;
    }
    if (!cloak.active && now >= cloak.nextAt) {
      startZetsu(enemy, now);
    }
    if (cloak.active) {
      const factor = gyoActive ? 0.6 : 0.2;
      setEnemyVisibility(enemy, cloak.countered ? 0.4 : factor);
      if (intel && gyoActive) {
        intel.push({
          id: enemy.__enemyId || null,
          archetype: "assassin",
          type: "zetsu",
          urgency: cloak.countered ? 0.2 : 0.8
        });
      }
      if (now >= cloak.breakAt || cloak.countered) {
        cloak.active = false;
        cloak.spotted = false;
        setEnemyVisibility(enemy, 1);
      }
    } else {
      setEnemyVisibility(enemy, 1);
    }
  }

  function ensureOrbMaterial(enemy) {
    if (enemy.__nenOrbMaterial && !enemy.__nenOrbMaterial.isDisposed) return enemy.__nenOrbMaterial;
    if (typeof BABYLON === "undefined") return null;
    const scene = enemy.root?.getScene?.() || enemy.root?._scene || BABYLON.Engine.LastCreatedScene;
    const firstMesh = typeof enemy.root?.getChildMeshes === "function" ? enemy.root.getChildMeshes(false)[0] : null;
    const color = (firstMesh?.material?.emissiveColor && firstMesh.material.emissiveColor.clone()) || parseColor("#5effc8", new BABYLON.Color3(0.5, 1, 0.78));
    const mat = new BABYLON.StandardMaterial(`nen-orb-${enemy.__enemyId || Math.random()}`, scene);
    mat.emissiveColor = color.clone();
    mat.diffuseColor = color.scale(0.12);
    mat.specularColor = BABYLON.Color3.Black();
    enemy.__nenOrbMaterial = mat;
    return mat;
  }

  function spawnOrb(enemy) {
    if (typeof BABYLON === "undefined") return null;
    const scene = enemy.root?._scene || BABYLON.Engine.LastCreatedScene;
    if (!scene) return null;
    const orb = BABYLON.MeshBuilder.CreateSphere(`nen-orb-${enemy.__enemyId || "?"}-${Date.now()}`, { diameter: 0.45 }, scene);
    orb.parent = enemy.root;
    orb.position = new BABYLON.Vector3(rand(-1.2, 1.2), 1 + rand(0.2, 0.6), rand(-1.2, 1.2));
    orb.isPickable = false;
    orb.material = ensureOrbMaterial(enemy);
    const entry = {
      mesh: orb,
      angle: rand(0, Math.PI * 2),
      radius: rand(1.2, 1.8),
      speed: rand(0.6, 1.1),
      height: rand(0.4, 0.7),
      dormant: false
    };
    enemy.__nenOrbs.orbs.push(entry);
    return entry;
  }

  function disposeOrbs(enemy) {
    const store = enemy.__nenOrbs;
    if (!store) return;
    ensureArray(store.orbs).forEach(entry => {
      try { entry?.mesh?.dispose?.(); } catch {}
    });
    store.orbs.length = 0;
  }

  function updateCaster(enemy, dt, now, intel, aura, gyoActive) {
    const store = enemy.__nenOrbs;
    if (!store) return;
    if (!enemy.alive) {
      disposeOrbs(enemy);
      return;
    }
    if (store.orbs.length < 3 && now >= store.nextSpawn) {
      spawnOrb(enemy);
      store.nextSpawn = now + rand(1600, 2600);
    }
    const enActive = !!aura?.en?.on;
    const inActive = !!aura?.in;
    ensureArray(store.orbs).forEach(entry => {
      if (!entry?.mesh || entry.mesh.isDisposed()) return;
      entry.angle += dt * entry.speed * 1.5;
      const x = Math.cos(entry.angle) * entry.radius;
      const z = Math.sin(entry.angle) * entry.radius;
      entry.mesh.position.x = x;
      entry.mesh.position.z = z;
      entry.mesh.position.y = 1 + Math.sin(entry.angle * 1.5) * entry.height;
      const baseScale = enActive ? 0.9 : 1.1;
      const inFactor = inActive ? 0.65 : 1;
      entry.mesh.scaling.setAll(baseScale * inFactor);
      entry.dormant = inActive && enActive;
      const intensity = entry.dormant ? 0.18 : enActive ? 0.5 : 0.85;
      if (entry.mesh.material?.emissiveColor) {
        entry.mesh.material.emissiveColor.set(intensity * 0.35, intensity, intensity * 0.85);
        if (entry.mesh.material.diffuseColor) {
          entry.mesh.material.diffuseColor.set(intensity * 0.18, intensity * 0.22, intensity * 0.2);
        }
      }
    });
    if (intel && (gyoActive || enActive)) {
      intel.push({
        id: enemy.__enemyId || null,
        archetype: "caster",
        type: "orb",
        urgency: store.orbs.filter(o => !o.dormant).length / Math.max(1, store.orbs.length)
      });
    }
  }

  function purgeInactiveEnemies(list) {
    ensureArray(list).forEach(enemy => {
      if (enemy?.alive) return;
      cleanupEnemy(enemy);
    });
  }

  let raf = null;
  let lastTick = nowMs();

  function step() {
    const now = nowMs();
    const dt = Math.min(0.35, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    const list = ensureArray(H.enemies);
    const aura = H.state?.aura || null;
    const gyoActive = !!aura?.gyo;
    const intel = [];
    for (const enemy of list) {
      if (!enemy || !enemy.root) continue;
      const sim = enemy.__sim || enemy.simulationBubble || null;
      if (sim && (sim.state === SIM_STATE_SLEEPING || sim.state === SIM_STATE_DESPAWNED)) {
        continue;
      }
      assignArchetype(enemy);
      switch (enemy.nenArchetype) {
        case "bruiser":
          updateBruiser(enemy, dt, now, gyoActive ? intel : null);
          break;
        case "assassin":
          updateAssassin(enemy, dt, now, gyoActive ? intel : null, gyoActive);
          break;
        case "caster":
          updateCaster(enemy, dt, now, gyoActive ? intel : null, aura, gyoActive);
          break;
      }
    }
    intelState.list = intel;
    intelState.updatedAt = now;
    purgeInactiveEnemies(list);
    raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(step) : setTimeout(step, 60);
  }

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(step);
  } else {
    setTimeout(step, 60);
  }

  const API = {
    list: ()=>H.enemies,
    projectiles: ()=>H.projectiles,
    getLastSpawnPlan: ()=>window.Spawns?.getLastPlan?.() || null,
    getActiveRegion: ()=>window.Spawns?.getActiveRegion?.() || null,
    getArchetype(enemy) {
      if (!enemy) return null;
      return enemy.nenArchetype || null;
    },
    getAuraIntel() {
      return intelState.list.slice();
    },
    getCurseProfile(enemy) {
      if (!enemy) return null;
      return enemy.__curseProfile || null;
    },
    requestPath(grid, width, height, start, goal, opts) {
      return requestPathJob(grid, width, height, start, goal, opts);
    },
    onSpawnPlan(cb) {
      if (typeof cb !== "function") return () => {};
      watchers.add(cb);
      return () => watchers.delete(cb);
    },
    __notifySpawnPlan(plan) {
      notify(plan);
    },
    cleanup: cleanupEnemy
  };

  window.Enemies = API;
})();
