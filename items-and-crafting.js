// items-and-crafting.js — inventory + durability helpers
(function(){
  const globalObj = typeof window !== "undefined" ? window : globalThis;
  const Items = globalObj.Items = globalObj.Items || {};

  const runtime = Items.__runtime = Items.__runtime || {};

  const ItemSchema = Items.ItemSchema = Object.freeze({
    id: { required: true },
    slot: { default: "inventory" },
    type: { default: "generic" },
    dmg: { default: 0 },
    dur: { default: () => ({ current: 0, max: 0 }) },
    tags: { default: () => [] },
    stack: { default: () => ({ count: 1, max: 1 }) }
  });

  const HOTBAR_SIZE = 9;
  const DEFAULT_SHU = { damageMul: 1, durabilityScalar: 1, pierceCount: 0 };
  const DEFAULT_WEAPON_HUD_SELECTORS = ["[data-weapon]", "#hud-weapon"];
  const listeners = new Set();
  const slots = [];
  const hotbar = new Array(HOTBAR_SIZE).fill(null);

  let activeHotbar = null;
  let activeItem = null;
  let ownerState = null;
  let pendingAttack = null;

  const supportsWeakSet = typeof WeakSet === "function";
  if (!runtime.shuDefaults) runtime.shuDefaults = { ...DEFAULT_SHU };
  if (!Array.isArray(runtime.weaponHudSelectors) || runtime.weaponHudSelectors.length === 0) {
    runtime.weaponHudSelectors = DEFAULT_WEAPON_HUD_SELECTORS.slice();
  }
  let weaponHudSelectors = runtime.weaponHudSelectors.slice();
  Items.weaponHudSelectors = weaponHudSelectors.slice();
  let shuDefaults = { ...runtime.shuDefaults };
  runtime.shuDefaults = { ...shuDefaults };
  let recordedShu = runtime.shu ? { ...runtime.shu } : null;

  function emit(change) {
    listeners.forEach((fn) => {
      try {
        fn(change, inventory);
      } catch (err) {
        console.warn("[HXH] inventory listener failed", err);
      }
    });
  }

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function ensureString(value, fallback = "") {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Number.isFinite(value)) return String(value);
    return fallback;
  }

  function normalizeDurability(value) {
    if (value && typeof value === "object") {
      const max = Math.max(0, toNumber(value.max ?? value.maximum ?? value.cap, 0));
      const current = Math.min(max, Math.max(0, toNumber(value.current ?? value.cur ?? value.value, max)));
      return { current, max };
    }
    if (Number.isFinite(value) && value >= 0) {
      const safe = Math.floor(value);
      return { current: safe, max: safe };
    }
    return { current: 0, max: 0 };
  }

  function normalizeStack(value) {
    if (value && typeof value === "object") {
      const max = Math.max(1, Math.floor(toNumber(value.max ?? value.limit ?? value.size, 1)));
      const count = Math.max(0, Math.min(max, Math.floor(toNumber(value.count ?? value.cur ?? value.quantity, 1))));
      return { count, max };
    }
    if (Number.isFinite(value) && value > 0) {
      const qty = Math.floor(value);
      return { count: qty, max: qty };
    }
    return { count: 1, max: 1 };
  }

  function createItem(data = {}) {
    const id = ensureString(data.id, `item-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);
    const slot = ensureString(data.slot, ItemSchema.slot.default).toLowerCase();
    const type = ensureString(data.type, slot === "weapon" ? "weapon" : ItemSchema.type.default).toLowerCase();
    const dmg = toNumber(data.dmg, ItemSchema.dmg.default);
    const dur = normalizeDurability(data.dur);
    const tags = Array.isArray(data.tags) ? data.tags.filter(tag => typeof tag === "string" && tag.trim()).map(tag => tag.trim()) : [];
    const stack = normalizeStack(data.stack);
    const item = {
      id,
      slot,
      type,
      dmg,
      dur,
      tags,
      stack,
      broken: dur.current <= 0
    };
    Object.defineProperty(item, "__slotIndex", { value: -1, writable: true, configurable: true });
    return item;
  }

  function cloneItem(item) {
    if (!item || typeof item !== "object") return null;
    const copy = createItem(item);
    copy.dur = { current: item.dur?.current ?? 0, max: item.dur?.max ?? 0 };
    copy.stack = { count: item.stack?.count ?? 1, max: item.stack?.max ?? 1 };
    copy.broken = !!item.broken;
    return copy;
  }

  function updateActive(newHotbar, newItem) {
    activeHotbar = newHotbar;
    activeItem = newItem && !newItem.broken ? newItem : null;
    inventory.activeHotbar = activeHotbar;
    inventory.activeItem = activeItem;
    if (ownerState && typeof ownerState === "object") {
      ownerState.weapon = activeItem || null;
    }
    runtime.activeHotbar = activeHotbar;
    runtime.activeItem = activeItem;
  }

  function normalizeHotbarIndex(index) {
    if (!Number.isInteger(index)) return null;
    if (index < 0 || index >= HOTBAR_SIZE) return null;
    return index;
  }

  function findHotbarIndexForSlot(slotIndex) {
    for (let i = 0; i < hotbar.length; i += 1) {
      if (hotbar[i] === slotIndex) return i;
    }
    return null;
  }

  function assignHotbar(slotIndex, preferredIndex = null) {
    const target = normalizeHotbarIndex(preferredIndex);
    if (target !== null) {
      for (let i = 0; i < hotbar.length; i += 1) {
        if (hotbar[i] === slotIndex) hotbar[i] = null;
      }
      hotbar[target] = slotIndex;
      return target;
    }
    for (let i = 0; i < hotbar.length; i += 1) {
      if (hotbar[i] === null || typeof hotbar[i] === "undefined") {
        hotbar[i] = slotIndex;
        return i;
      }
    }
    return null;
  }

  function clearHotbarSlot(slotIndex) {
    const cleared = [];
    for (let i = 0; i < hotbar.length; i += 1) {
      if (hotbar[i] === slotIndex) {
        hotbar[i] = null;
        cleared.push(i);
      }
    }
    return cleared;
  }

  function setSlot(slotIndex, item) {
    if (slotIndex < 0) return;
    while (slotIndex >= slots.length) slots.push(null);
    slots[slotIndex] = item;
    if (item) {
      item.__slotIndex = slotIndex;
      item.broken = item.dur.current <= 0;
    }
  }

  function findEmptySlot() {
    for (let i = 0; i < slots.length; i += 1) {
      if (!slots[i]) return i;
    }
    return slots.length;
  }

  function serializeItem(item) {
    if (!item) return null;
    return {
      id: item.id,
      slot: item.slot,
      type: item.type,
      dmg: item.dmg,
      dur: { current: item.dur?.current ?? 0, max: item.dur?.max ?? 0 },
      tags: Array.isArray(item.tags) ? item.tags.slice() : [],
      stack: { count: item.stack?.count ?? 1, max: item.stack?.max ?? 1 },
      broken: !!item.broken
    };
  }

  function markHit(pending, dst) {
    if (!pending) return false;
    if (!dst || typeof dst !== "object") return true;
    if (supportsWeakSet) {
      if (!pending.hitSet) pending.hitSet = new WeakSet();
      if (pending.hitSet.has(dst)) return false;
      pending.hitSet.add(dst);
      return true;
    }
    if (!Array.isArray(pending.hitList)) pending.hitList = [];
    if (pending.hitList.includes(dst)) return false;
    pending.hitList.push(dst);
    return true;
  }

  function breakItem(item, reason = "durability") {
    if (!item) return;
    const slotIndex = Number.isInteger(item.__slotIndex) ? item.__slotIndex : slots.indexOf(item);
    const hotbarCleared = slotIndex >= 0 ? clearHotbarSlot(slotIndex) : [];
    if (slotIndex >= 0 && slots[slotIndex] === item) {
      slots[slotIndex] = null;
    }
    if (activeHotbar !== null && (hotbar[activeHotbar] === slotIndex || activeItem === item)) {
      updateActive(null, null);
    }
    item.broken = true;
    if (item.dur) item.dur.current = 0;
    emit({ type: "break", slotIndex, hotbarIndices: hotbarCleared, item, reason });
  }

  function damageItem(item, amount = 1) {
    if (!item || !item.dur) return 0;
    const cost = Math.max(0, toNumber(amount, 0));
    if (cost <= 0) return item.dur.current ?? 0;
    const slotIndex = Number.isInteger(item.__slotIndex) ? item.__slotIndex : slots.indexOf(item);
    item.dur.current = Math.max(0, Math.min(item.dur.max, toNumber(item.dur.current, 0) - cost));
    if (item.dur.current <= 0) {
      item.broken = true;
      emit({ type: "durability", slotIndex, item });
      breakItem(item, "durability");
      return 0;
    }
    item.broken = false;
    emit({ type: "durability", slotIndex, item });
    return item.dur.current;
  }

  const inventory = {
    slots,
    hotbar,
    activeHotbar: activeHotbar,
    activeItem: activeItem,
    add(rawItem, options = {}) {
      const item = rawItem && typeof rawItem === "object" && rawItem.id ? cloneItem(rawItem) : createItem(rawItem);

      if (item.stack.max > 1) {
        for (let i = 0; i < slots.length && item.stack.count > 0; i += 1) {
          const existing = slots[i];
          if (!existing || existing.id !== item.id || existing.stack.max <= existing.stack.count) continue;
          const space = existing.stack.max - existing.stack.count;
          const transfer = Math.min(space, item.stack.count);
          if (transfer > 0) {
            existing.stack.count += transfer;
            item.stack.count -= transfer;
            emit({ type: "stack", slotIndex: i, item: existing, transfer });
          }
        }
        if (item.stack.count <= 0) {
          return null;
        }
      }

      const slotIndex = Number.isInteger(options.slotIndex) ? Math.max(0, options.slotIndex) : findEmptySlot();
      setSlot(slotIndex, item);
      const assignedHotbar = assignHotbar(slotIndex, options.hotbarIndex);
      emit({ type: "add", slotIndex, hotbarIndex: assignedHotbar, item });

      const shouldEquip = options.autoEquip ?? (item.slot === "weapon" && assignedHotbar !== null && !inventory.activeItem);
      if (shouldEquip && assignedHotbar !== null) {
        inventory.equip(assignedHotbar, { silent: true });
      }
      return { item, slotIndex, hotbarIndex: assignedHotbar };
    },
    use(index, options = {}) {
      return this.equip(index, options);
    },
    equip(index, options = {}) {
      const hotbarIndex = normalizeHotbarIndex(index);
      if (hotbarIndex === null) {
        if (inventory.activeHotbar !== null) {
          updateActive(null, null);
          if (!options.silent) emit({ type: "equip", hotbarIndex: null, slotIndex: null, item: null });
        }
        return null;
      }
      const slotIndex = hotbar[hotbarIndex];
      const item = Number.isInteger(slotIndex) ? slots[slotIndex] : null;
      if (!item || item.broken) {
        if (item && item.broken) breakItem(item, "broken-equip");
        if (inventory.activeHotbar === hotbarIndex) {
          updateActive(null, null);
        }
        if (!options.silent) emit({ type: "equip", hotbarIndex, slotIndex, item: null });
        return null;
      }
      updateActive(hotbarIndex, item);
      if (!options.silent) emit({ type: "equip", hotbarIndex, slotIndex, item });
      return item;
    },
    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    toJSON() {
      return {
        slots: slots.map(serializeItem),
        hotbar: hotbar.slice(),
        activeHotbar: activeHotbar
      };
    }
  };

  Items.createItem = createItem;
  Items.cloneItem = cloneItem;
  Items.inventory = inventory;
  runtime.inventory = inventory;
  Items.getActiveItem = () => activeItem && !activeItem.broken ? activeItem : null;
  Items.damageItem = damageItem;
  Items.breakItem = breakItem;
  Items.bindPlayerState = function(state) {
    ownerState = state || null;
    runtime.playerState = ownerState;
    runtime.inventory = inventory;
    updateActive(activeHotbar, activeItem);
    return inventory;
  };

  function computeWeaponConfig(weapon) {
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

  function computeShuModifiers(state, weapon = Items.getActiveItem() || (state && state.weapon) || null) {
    const result = { ...shuDefaults };
    const config = computeWeaponConfig(weapon);
    if (config) {
      const dmg = toNumber(config.damageMul ?? config.damageMultiplier ?? config.damage ?? config.power, result.damageMul);
      if (dmg > 0) result.damageMul = dmg;
      const dur = toNumber(config.durabilityScalar ?? config.durabilityMultiplier ?? config.durabilityEfficiency, result.durabilityScalar);
      if (dur > 0) result.durabilityScalar = dur;
      const pierce = toNumber(config.pierceCount ?? config.pierce ?? config.pierceBonus, result.pierceCount);
      if (pierce >= 0) result.pierceCount = pierce;
    }
    if (weapon && typeof weapon === "object") {
      const directDmg = toNumber(weapon.shuDamageMul ?? weapon.shuDamageMultiplier ?? weapon.shuDamage, result.damageMul);
      if (directDmg > 0) result.damageMul = directDmg;
      const directDur = toNumber(weapon.shuDurabilityScalar ?? weapon.shuDurabilityMultiplier ?? weapon.shuDurabilityEfficiency, result.durabilityScalar);
      if (directDur > 0) result.durabilityScalar = directDur;
      const directPierce = toNumber(weapon.shuPierceCount ?? weapon.shuPierce ?? weapon.shuPierceBonus, result.pierceCount);
      if (directPierce >= 0) result.pierceCount = directPierce;
    }
    result.damageMultiplier = result.damageMul;
    result.durabilityMultiplier = result.durabilityScalar;
    result.pierce = result.pierceCount;
    return result;
  }

  function applyShuDurabilityCost(baseCost, state, weapon = Items.getActiveItem() || (state && state.weapon) || null) {
    const cost = Math.max(0, toNumber(baseCost, 0));
    if (cost <= 0) return 0;
    const mods = computeShuModifiers(state, weapon);
    const scalar = Number.isFinite(mods.durabilityScalar) && mods.durabilityScalar > 0 ? mods.durabilityScalar : 1;
    return cost * scalar;
  }

  function setShuDefaults(config = {}) {
    const damage = toNumber(config.damageMul ?? config.damageMultiplier, shuDefaults.damageMul);
    const durability = toNumber(config.durabilityScalar ?? config.durabilityMultiplier ?? config.durabilityEfficiency, shuDefaults.durabilityScalar);
    const pierce = toNumber(config.pierceCount ?? config.pierce ?? config.pierceBonus, shuDefaults.pierceCount);
    shuDefaults = {
      damageMul: damage > 0 ? damage : DEFAULT_SHU.damageMul,
      durabilityScalar: durability > 0 ? durability : DEFAULT_SHU.durabilityScalar,
      pierceCount: pierce >= 0 ? pierce : DEFAULT_SHU.pierceCount
    };
    runtime.shuDefaults = { ...shuDefaults };
    Items.shuDefaults = { ...shuDefaults };
    return { ...shuDefaults };
  }

  function recordShuState(info) {
    if (!info) {
      recordedShu = null;
      runtime.shu = null;
      return null;
    }
    recordedShu = {
      intent: !!info.intent,
      active: !!info.active,
      weaponOut: !!info.weaponOut,
      weapon: info.weapon || Items.getActiveItem() || null,
      modifiers: info.modifiers ? { ...info.modifiers } : null
    };
    runtime.shu = { ...recordedShu };
    if (recordedShu.weapon) {
      runtime.lastWeapon = recordedShu.weapon;
    }
    return { ...recordedShu };
  }

  function getRecordedShuState() {
    if (!recordedShu) return null;
    return {
      intent: recordedShu.intent,
      active: recordedShu.active,
      weaponOut: recordedShu.weaponOut,
      weapon: recordedShu.weapon || null,
      modifiers: recordedShu.modifiers ? { ...recordedShu.modifiers } : null
    };
  }

  function locateWeaponHud(root = document) {
    if (!root || typeof root.querySelector !== "function") return null;
    for (const selector of weaponHudSelectors) {
      const el = root.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function setWeaponHudSelectors(selectors) {
    if (!Array.isArray(selectors)) return;
    weaponHudSelectors = selectors
      .map(sel => (typeof sel === "string" ? sel.trim() : ""))
      .filter(Boolean);
    if (weaponHudSelectors.length === 0) {
      weaponHudSelectors = DEFAULT_WEAPON_HUD_SELECTORS.slice();
    }
    runtime.weaponHudSelectors = weaponHudSelectors.slice();
    Items.weaponHudSelectors = runtime.weaponHudSelectors.slice();
  }

  function getActiveWeapon(state) {
    const weapon = Items.getActiveItem();
    if (weapon) return weapon;
    if (state && typeof state === "object" && state.weapon && typeof state.weapon === "object") {
      return state.weapon;
    }
    return null;
  }

  function isWeaponOut(state, weapon) {
    if (!weapon || typeof weapon !== "object") return false;
    if (Items.getActiveItem() === weapon) return true;
    if (recordedShu && recordedShu.weapon === weapon) {
      return !!recordedShu.weaponOut;
    }
    if (state && typeof state === "object" && state.weapon === weapon) {
      return true;
    }
    return false;
  }

  Items.getActiveWeapon = getActiveWeapon;
  Items.isWeaponOut = isWeaponOut;
  Items.computeShuModifiers = computeShuModifiers;
  Items.applyShuDurabilityCost = applyShuDurabilityCost;
  Items.recordShuState = recordShuState;
  Items.getRecordedShuState = getRecordedShuState;
  Items.setShuDefaults = setShuDefaults;
  Items.locateWeaponHud = locateWeaponHud;
  Items.setWeaponHudSelectors = setWeaponHudSelectors;
  Items.shuDefaults = { ...shuDefaults };

  const hx = globalObj.HXH = globalObj.HXH || {};
  const previousOutgoing = typeof hx.applyOutgoingDamage === "function" ? hx.applyOutgoingDamage.bind(hx) : null;
  const previousIncoming = typeof hx.applyIncomingDamage === "function" ? hx.applyIncomingDamage.bind(hx) : null;

  function applyOutgoingDamageHook(src, limb, baseDamage) {
    let result = Number.isFinite(baseDamage) ? baseDamage : 0;
    if (previousOutgoing) {
      try {
        result = previousOutgoing(src, limb, result);
      } catch (err) {
        console.warn("[HXH] previous applyOutgoingDamage failed", err);
      }
    }
    const weapon = Items.getActiveItem();
    if (!ownerState || src !== ownerState) {
      pendingAttack = null;
      return result;
    }
    if (!weapon) {
      pendingAttack = null;
      return result;
    }
    const bonus = toNumber(weapon.dmg, 0);
    const durabilityCost = applyShuDurabilityCost(1, ownerState, weapon);
    const safeCost = Math.max(0, toNumber(durabilityCost, 1));
    pendingAttack = { weapon, cost: safeCost > 0 ? safeCost : 1 };
    return result + bonus;
  }

  function applyIncomingDamageHook(dst, limb, baseDamage) {
    let result = Number.isFinite(baseDamage) ? baseDamage : 0;
    if (previousIncoming) {
      try {
        result = previousIncoming(dst, limb, result);
      } catch (err) {
        console.warn("[HXH] previous applyIncomingDamage failed", err);
      }
    }
    if (!pendingAttack || !ownerState) return result;
    if (!dst || dst === ownerState) return result;
    if (!markHit(pendingAttack, dst)) return result;
    const weapon = pendingAttack.weapon;
    if (!weapon || weapon.broken) {
      pendingAttack = null;
      return result;
    }
    const remaining = damageItem(weapon, pendingAttack.cost);
    if (remaining <= 0) {
      breakItem(weapon, "durability");
      pendingAttack = null;
    }
    return result;
  }

  hx.applyOutgoingDamage = applyOutgoingDamageHook;
  hx.applyIncomingDamage = applyIncomingDamageHook;
})();
