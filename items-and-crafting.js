// items-and-crafting.js — lightweight item helpers + Shu runtime metadata
(function(){
  const globalObj = typeof window !== "undefined" ? window : globalThis;
  const existing = typeof globalObj.Items === "object" && globalObj.Items ? globalObj.Items : {};
  if (!existing.recipes) existing.recipes = {};
  if (typeof existing.craft !== "function") existing.craft = function(){ return false; };

  const Items = globalObj.Items = existing;
  const runtime = Items.__runtime = Items.__runtime || {};
  const supportsWeakMap = typeof WeakMap === "function";

  const DEFAULT_SHU = { damageMul: 1.3, durabilityScalar: 0.65, pierceCount: 1 };
  const DEFAULT_WEAPON_HUD_SELECTORS = [
    '[data-slot="weapon"].active',
    '#hud-weapon-active',
    '#hud-weapon',
    '.hud-weapon.active',
    '.hud-hotbar .slot[data-slot="weapon"].active'
  ];
  if (!runtime.shuDefaults) runtime.shuDefaults = { ...DEFAULT_SHU };
  runtime.shu = runtime.shu || null;
  if (!runtime.lastWeaponByOwner) {
    runtime.lastWeaponByOwner = supportsWeakMap ? new WeakMap() : [];
  }
  runtime.weaponHudSelectors = Array.isArray(runtime.weaponHudSelectors)
    ? runtime.weaponHudSelectors.slice()
    : [...DEFAULT_WEAPON_HUD_SELECTORS];

  function toFinite(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  function clampPositive(value, fallback) {
    const finite = toFinite(value);
    if (finite === null) return fallback;
    return finite > 0 ? finite : fallback;
  }

  function detectWeaponFromSlots(slots) {
    if (!Array.isArray(slots)) return null;
    for (const slot of slots) {
      if (!slot || typeof slot !== "object") continue;
      const slotName = typeof slot.slot === "string" ? slot.slot : slot.name;
      if (slotName && slotName.toLowerCase() === "weapon" && slot.item) {
        return slot.item;
      }
    }
    return null;
  }

  function rememberWeapon(state, weapon) {
    if (!weapon || typeof weapon !== "object") return null;
    runtime.lastWeapon = weapon;
    if (state && typeof state === "object") {
      const store = runtime.lastWeaponByOwner;
      if (store instanceof WeakMap) {
        store.set(state, weapon);
      } else if (Array.isArray(store)) {
        let updated = false;
        for (let i = 0; i < store.length; i += 1) {
          const entry = store[i];
          if (entry && entry.owner === state) {
            store[i] = { owner: state, item: weapon };
            updated = true;
            break;
          }
        }
        if (!updated) store.push({ owner: state, item: weapon });
      }
      runtime.activeWeapon = { owner: state, item: weapon };
    }
    return weapon;
  }

  function forgetWeapon(state) {
    if (!state || typeof state !== "object") return;
    const store = runtime.lastWeaponByOwner;
    if (runtime.activeWeapon && runtime.activeWeapon.owner === state) {
      runtime.activeWeapon = null;
    }
    if (store instanceof WeakMap) {
      store.delete(state);
    } else if (Array.isArray(store)) {
      for (let i = store.length - 1; i >= 0; i -= 1) {
        const entry = store[i];
        if (entry && entry.owner === state) {
          store.splice(i, 1);
        }
      }
    }
  }

  function detectActiveWeapon(state) {
    if (!state || typeof state !== "object") return null;
    if (state.weapon && typeof state.weapon === "object") {
      return rememberWeapon(state, state.weapon);
    }
    const eq = state.equipment;
    if (eq && typeof eq === "object") {
      if (typeof eq.getActiveWeapon === "function") {
        try {
          const weapon = eq.getActiveWeapon();
          if (weapon) return rememberWeapon(state, weapon);
        } catch (err) {
          console.warn("[HXH] Items.getActiveWeapon failed", err);
        }
      }
      if (eq.activeWeapon && typeof eq.activeWeapon === "object") {
        return rememberWeapon(state, eq.activeWeapon);
      }
      if (eq.weapon && typeof eq.weapon === "object") {
        return rememberWeapon(state, eq.weapon);
      }
      if (eq.active && typeof eq.active === "object") {
        const slot = eq.active;
        const slotName = typeof slot.slot === "string" ? slot.slot : slot.type;
        if (slotName && slotName.toLowerCase() === "weapon") {
          const weapon = slot.item || slot;
          if (weapon && typeof weapon === "object") return rememberWeapon(state, weapon);
        }
      }
      const slotWeapon = detectWeaponFromSlots(eq.slots);
      if (slotWeapon) return rememberWeapon(state, slotWeapon);
    }
    if (state.activeItem && typeof state.activeItem === "object") {
      const slot = state.activeItem;
      const slotName = typeof slot.slot === "string" ? slot.slot : slot.type;
      if (slotName && slotName.toLowerCase() === "weapon") {
        const weapon = slot.item || slot;
        if (weapon && typeof weapon === "object") return rememberWeapon(state, weapon);
      }
    }
    forgetWeapon(state);
    return null;
  }

  function isWeaponOut(state, weapon = detectActiveWeapon(state)) {
    if (!weapon || typeof weapon !== "object") return false;
    if (weapon.disabled || weapon.broken) return false;
    if ("out" in weapon) return !!weapon.out;
    if ("drawn" in weapon) return !!weapon.drawn;
    if ("equipped" in weapon) return !!weapon.equipped;
    if ("active" in weapon) return !!weapon.active;
    if ("holstered" in weapon) return !weapon.holstered;
    if (state && typeof state === "object") {
      const combat = state.combat;
      if (combat && typeof combat === "object" && "weaponOut" in combat) {
        return !!combat.weaponOut;
      }
    }
    if (runtime.shu && runtime.shu.weapon === weapon && "weaponOut" in runtime.shu) {
      return !!runtime.shu.weaponOut;
    }
    return true;
  }

  function getShuConfig(weapon) {
    if (!weapon || typeof weapon !== "object") return null;
    if (weapon.shu && typeof weapon.shu === "object") return weapon.shu;
    if (weapon.nen && typeof weapon.nen === "object" && weapon.nen.shu && typeof weapon.nen.shu === "object") {
      return weapon.nen.shu;
    }
    if (weapon.metadata && typeof weapon.metadata === "object" && weapon.metadata.shu && typeof weapon.metadata.shu === "object") {
      return weapon.metadata.shu;
    }
    if (weapon.effects && typeof weapon.effects === "object" && weapon.effects.shu && typeof weapon.effects.shu === "object") {
      return weapon.effects.shu;
    }
    return null;
  }

  function computeShuModifiers(state, weapon = detectActiveWeapon(state)) {
    const defaults = runtime.shuDefaults || DEFAULT_SHU;
    const result = {
      damageMul: defaults.damageMul,
      durabilityScalar: defaults.durabilityScalar,
      pierceCount: defaults.pierceCount
    };

    const config = getShuConfig(weapon);
    if (config) {
      const dmg = toFinite(config.damageMul ?? config.damageMultiplier ?? config.damage ?? config.power);
      if (dmg !== null) result.damageMul = dmg;
      const dura = toFinite(config.durabilityScalar ?? config.durabilityMultiplier ?? config.durabilityEfficiency);
      if (dura !== null) result.durabilityScalar = dura;
      const pierce = toFinite(config.pierceCount ?? config.pierce ?? config.pierceBonus);
      if (pierce !== null) result.pierceCount = pierce;
    }

    if (weapon && typeof weapon === "object") {
      const directDmg = toFinite(weapon.shuDamageMul ?? weapon.shuDamageMultiplier ?? weapon.shuDamage);
      if (directDmg !== null) result.damageMul = directDmg;
      const directDur = toFinite(weapon.shuDurabilityScalar ?? weapon.shuDurabilityMultiplier ?? weapon.shuDurabilityEfficiency);
      if (directDur !== null) result.durabilityScalar = directDur;
      const directPierce = toFinite(weapon.shuPierceCount ?? weapon.shuPierce ?? weapon.shuPierceBonus);
      if (directPierce !== null) result.pierceCount = directPierce;
    }

    result.damageMul = clampPositive(result.damageMul, defaults.damageMul);
    result.durabilityScalar = clampPositive(result.durabilityScalar, defaults.durabilityScalar);
    const pierceSafe = toFinite(result.pierceCount);
    result.pierceCount = pierceSafe !== null && pierceSafe >= 0 ? pierceSafe : defaults.pierceCount;

    result.damageMultiplier = result.damageMul;
    result.durabilityMultiplier = result.durabilityScalar;
    result.pierce = result.pierceCount;
    return result;
  }

  function applyShuDurabilityCost(baseCost, state, weapon = detectActiveWeapon(state)) {
    const cost = toFinite(baseCost);
    if (cost === null) return 0;
    const mods = computeShuModifiers(state, weapon);
    const scalar = typeof mods.durabilityScalar === "number" && Number.isFinite(mods.durabilityScalar)
      ? mods.durabilityScalar
      : 1;
    return Math.max(0, cost * scalar);
  }

  function recordShuState(info) {
    if (!info) {
      runtime.shu = null;
      return null;
    }
    runtime.shu = {
      intent: !!info.intent,
      active: !!info.active,
      weaponOut: !!info.weaponOut,
      weapon: info.weapon || null,
      modifiers: info.modifiers ? { ...info.modifiers } : null
    };
    if (info.weapon && typeof info.weapon === "object") {
      runtime.lastWeapon = info.weapon;
    }
    return runtime.shu;
  }

  function getRecordedShuState() {
    if (!runtime.shu) return null;
    return {
      intent: !!runtime.shu.intent,
      active: !!runtime.shu.active,
      weaponOut: !!runtime.shu.weaponOut,
      weapon: runtime.shu.weapon || null,
      modifiers: runtime.shu.modifiers ? { ...runtime.shu.modifiers } : null
    };
  }

  function setShuDefaults(config = {}) {
    runtime.shuDefaults = {
      damageMul: clampPositive(config.damageMul ?? config.damageMultiplier, DEFAULT_SHU.damageMul),
      durabilityScalar: clampPositive(config.durabilityScalar ?? config.durabilityMultiplier ?? config.durabilityEfficiency, DEFAULT_SHU.durabilityScalar),
      pierceCount: (() => {
        const val = toFinite(config.pierceCount ?? config.pierce ?? config.pierceBonus);
        return val !== null && val >= 0 ? val : DEFAULT_SHU.pierceCount;
      })()
    };
    Items.shuDefaults = { ...runtime.shuDefaults };
    return { ...runtime.shuDefaults };
  }

  function locateWeaponHud(root = document) {
    if (!root || typeof root.querySelector !== "function") return null;
    for (const selector of runtime.weaponHudSelectors) {
      const el = root.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function setWeaponHudSelectors(selectors) {
    if (!Array.isArray(selectors)) return;
    runtime.weaponHudSelectors = selectors.filter(sel => typeof sel === "string" && sel.trim().length > 0);
    if (runtime.weaponHudSelectors.length === 0) {
      runtime.weaponHudSelectors = [...DEFAULT_WEAPON_HUD_SELECTORS];
    }
    runtime.weaponHudSelectors = runtime.weaponHudSelectors.map(sel => sel.trim());
  }

  function registerActiveWeapon(state, weapon) {
    if (state && typeof state === "object" && weapon && typeof weapon === "object") {
      rememberWeapon(state, weapon);
      return;
    }
    if (state && typeof state === "object") {
      forgetWeapon(state);
      return;
    }
    runtime.activeWeapon = {
      owner: null,
      item: weapon && typeof weapon === "object" ? weapon : null
    };
    if (runtime.activeWeapon.item) runtime.lastWeapon = runtime.activeWeapon.item;
  }

  Items.getActiveWeapon = detectActiveWeapon;
  Items.isWeaponOut = isWeaponOut;
  Items.computeShuModifiers = computeShuModifiers;
  Items.applyShuDurabilityCost = applyShuDurabilityCost;
  Items.recordShuState = recordShuState;
  Items.getRecordedShuState = getRecordedShuState;
  Items.setShuDefaults = setShuDefaults;
  Items.locateWeaponHud = locateWeaponHud;
  Items.setWeaponHudSelectors = setWeaponHudSelectors;
  Items.registerActiveWeapon = registerActiveWeapon;
  Items.shuDefaults = { ...runtime.shuDefaults };
})();
