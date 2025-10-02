// rig-editor.js — smooth zoom, per-part size/offset/rotation, XML import/export,
// animation editor, toolbar actions, robust picking (no pelvis-only), outline highlight,
// and panel-free layout (right box removed).
(() => {
  // ---------- Rig type catalog ----------
  const deepClone = o => JSON.parse(JSON.stringify(o));
  const RIG_TYPE_STORAGE_KEY = "hxh.rig.type";
  const ANIMATION_STORAGE_KEY = (window.RigDefinitions && window.RigDefinitions.ANIMATION_STORAGE_KEY) || "hxh.anim.clips";

  const FALLBACK_RIG_TYPES = (() => {
    const humanoid = {
      id: "anthro-biped",
      label: "Anthropomorphic Bipedal",
      partKeys: [
        "pelvis", "torsoLower", "torsoUpper", "neck", "head",
        "shoulderL", "armL_upper", "armL_fore", "armL_hand",
        "shoulderR", "armR_upper", "armR_fore", "armR_hand",
        "hipL", "legL_thigh", "legL_shin", "legL_foot",
        "hipR", "legR_thigh", "legR_shin", "legR_foot"
      ],
      defaults: {
        rigType: "anthro-biped",
        color: "#804a00",
        collider: { width: 0.85, height: 2.4, depth: 0.7, y: 1.3 },
        segments: {
          pelvis: { w: 0.85, h: 0.35, d: 0.52 },
          torsoLower: { w: 0.9, h: 0.45, d: 0.55 },
          torsoUpper: { w: 0.95, h: 0.71, d: 0.55 },
          neck: { w: 0.25, h: 0.25, d: 0.25 },
          head: { w: 0.45, h: 0.5, d: 0.45 },
          armL_upper: { w: 0.34, h: 0.75, d: 0.34 },
          armL_fore: { w: 0.3, h: 0.7, d: 0.27 },
          armL_hand: { w: 0.28, h: 0.25, d: 0.25 },
          armR_upper: { w: 0.34, h: 0.75, d: 0.34 },
          armR_fore: { w: 0.3, h: 0.7, d: 0.27 },
          armR_hand: { w: 0.28, h: 0.25, d: 0.25 },
          legL_thigh: { w: 0.45, h: 1.05, d: 0.5 },
          legL_shin: { w: 0.33, h: 0.88, d: 0.43 },
          legL_foot: { w: 0.32, h: 0.21, d: 0.75 },
          legR_thigh: { w: 0.45, h: 1.05, d: 0.5 },
          legR_shin: { w: 0.33, h: 0.88, d: 0.43 },
          legR_foot: { w: 0.32, h: 0.21, d: 0.75 }
        },
        transforms: {
          pelvis:      { pos:{x:0.000, y:1.190, z:0.000}, rot:{x:0, y:0, z:0} },
          torsoLower:  { pos:{x:0.000, y:0.450, z:0.000}, rot:{x:0, y:0, z:0} },
          torsoUpper:  { pos:{x:0.000, y:0.710, z:0.000}, rot:{x:0, y:0, z:0} },
          neck:        { pos:{x:0.000, y:0.250, z:0.000}, rot:{x:0, y:0, z:0} },
          head:        { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
          shoulderL:   { pos:{x:-0.650,y:0.000, z:0.000}, rot:{x:0, y:180, z:0} },
          armL_upper:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
          armL_fore:   { pos:{x:0.000, y:-0.750,z:0.000}, rot:{x:0, y:0, z:0} },
          armL_hand:   { pos:{x:0.000, y:-0.710,z:0.000}, rot:{x:0, y:0, z:0} },
          shoulderR:   { pos:{x:0.650, y:0.000, z:0.000}, rot:{x:0, y:180, z:0} },
          armR_upper:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
          armR_fore:   { pos:{x:0.000, y:-0.750,z:0.000}, rot:{x:0, y:0, z:0} },
          armR_hand:   { pos:{x:0.000, y:-0.710,z:0.000}, rot:{x:0, y:0, z:0} },
          hipL:        { pos:{x:-0.250,y:-0.350,z:0.000}, rot:{x:0, y:0, z:0} },
          legL_thigh:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
          legL_shin:   { pos:{x:0.000, y:-1.050,z:0.000}, rot:{x:0, y:0, z:0} },
          legL_foot:   { pos:{x:0.000, y:-0.880,z:-0.210}, rot:{x:0, y:0, z:0} },
          hipR:        { pos:{x:0.250, y:-0.350,z:0.000}, rot:{x:0, y:0, z:0} },
          legR_thigh:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
          legR_shin:   { pos:{x:0.000, y:-1.050,z:0.000}, rot:{x:0, y:0, z:0} },
          legR_foot:   { pos:{x:0.000, y:-0.880,z:-0.210}, rot:{x:0, y:0, z:0} }
        }
      },
      builder: "humanoid",
      options: { tail: false }
    };

    const monkey = {
      id: "monkey-build",
      label: "Monkey Build",
      partKeys: [
        ...humanoid.partKeys,
        "tailBase", "tailMid", "tailTip"
      ],
      defaults: {
        rigType: "monkey-build",
        color: "#8b5a2b",
        collider: { width: 0.9, height: 2.35, depth: 0.75, y: 1.2 },
        segments: {
          ...humanoid.defaults.segments,
          tailBase: { w: 0.32, h: 0.45, d: 0.70 },
          tailMid:  { w: 0.26, h: 0.40, d: 0.65 },
          tailTip:  { w: 0.22, h: 0.35, d: 0.55 }
        },
        transforms: {
          ...humanoid.defaults.transforms,
          tailBase: { pos:{x:0.000, y:-0.250, z:-0.350}, rot:{x:15, y:0, z:0} },
          tailMid:  { pos:{x:0.000, y:-0.380, z:-0.520}, rot:{x:20, y:0, z:0} },
          tailTip:  { pos:{x:0.000, y:-0.420, z:-0.520}, rot:{x:28, y:0, z:0} }
        }
      },
      builder: "humanoid",
      options: { tail: true }
    };

    const aquatic = {
      id: "aquatic-quad",
      label: "Aquatic Quadruped",
      partKeys: [
        "core", "torsoFront", "torsoRear", "neck", "head",
        "finFrontL", "finFrontR", "finRearL", "finRearR",
        "tailBase", "tailTip"
      ],
      defaults: {
        rigType: "aquatic-quad",
        color: "#0d5c7d",
        collider: { width: 1.4, height: 1.6, depth: 3.2, y: 0.9 },
        segments: {
          core:      { w: 1.25, h: 0.75, d: 1.60 },
          torsoFront:{ w: 1.05, h: 0.65, d: 1.10 },
          torsoRear: { w: 1.15, h: 0.60, d: 1.30 },
          neck:      { w: 0.50, h: 0.45, d: 0.50 },
          head:      { w: 0.70, h: 0.50, d: 0.70 },
          finFrontL: { w: 0.24, h: 0.40, d: 1.10 },
          finFrontR: { w: 0.24, h: 0.40, d: 1.10 },
          finRearL:  { w: 0.28, h: 0.38, d: 1.05 },
          finRearR:  { w: 0.28, h: 0.38, d: 1.05 },
          tailBase:  { w: 0.42, h: 0.42, d: 0.90 },
          tailTip:   { w: 0.36, h: 0.36, d: 1.05 }
        },
        transforms: {
          core:      { pos:{x:0.000, y:0.800, z:0.000}, rot:{x:0, y:0, z:0} },
          torsoFront:{ pos:{x:0.000, y:0.000, z:0.750}, rot:{x:0, y:0, z:0} },
          torsoRear: { pos:{x:0.000, y:0.000, z:-0.720}, rot:{x:0, y:0, z:0} },
          neck:      { pos:{x:0.000, y:0.280, z:1.350}, rot:{x:0, y:0, z:0} },
          head:      { pos:{x:0.000, y:0.000, z:0.600}, rot:{x:0, y:0, z:0} },
          finFrontL: { pos:{x:-0.820, y:-0.100, z:0.600}, rot:{x:0, y:0, z:25} },
          finFrontR: { pos:{x:0.820,  y:-0.100, z:0.600}, rot:{x:0, y:0, z:-25} },
          finRearL:  { pos:{x:-0.780, y:-0.120, z:-0.450}, rot:{x:0, y:0, z:32} },
          finRearR:  { pos:{x:0.780,  y:-0.120, z:-0.450}, rot:{x:0, y:0, z:-32} },
          tailBase:  { pos:{x:0.000, y:-0.050, z:-1.020}, rot:{x:0, y:0, z:0} },
          tailTip:   { pos:{x:0.000, y:-0.060, z:-0.900}, rot:{x:5, y:0, z:0} }
        }
      },
      builder: "aquatic",
      options: {}
    };

    return [humanoid, aquatic, monkey];
  })();

  function normalizeCollider(collider = {}, fallback = {}) {
    const source = { ...fallback, ...collider };
    return {
      width: Number(source.width) || 1,
      height: Number(source.height) || 1,
      depth: Number(source.depth) || 1,
      y: Number(source.y) || 0
    };
  }

  function normalizeSegmentsMap(map = {}, partKeys = []) {
    const out = {};
    partKeys.forEach(key => {
      const src = map[key];
      if (!src) return;
      const w = Number(src.w ?? src.width);
      const h = Number(src.h ?? src.height);
      const d = Number(src.d ?? src.depth ?? src.len ?? src.length);
      if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return;
      out[key] = { w, h, d };
    });
    return out;
  }

  function normalizeTransformsMap(map = {}, partKeys = []) {
    const out = {};
    partKeys.forEach(key => {
      const src = map[key] || {};
      const pos = src.pos || {};
      const rot = src.rot || {};
      out[key] = {
        pos: {
          x: Number(pos.x) || 0,
          y: Number(pos.y) || 0,
          z: Number(pos.z) || 0
        },
        rot: {
          x: Number(rot.x) || 0,
          y: Number(rot.y) || 0,
          z: Number(rot.z) || 0
        }
      };
    });
    return out;
  }

  function normalizeRigEntry(entry, fallback) {
    if (!entry && !fallback) return null;
    const source = deepClone(entry || {});
    const base = fallback || {};
    const id = String(source.id || base.id || "").trim();
    if (!id) return null;
    const partKeys = Array.isArray(source.partKeys) && source.partKeys.length
      ? source.partKeys.slice()
      : (Array.isArray(base.partKeys) ? base.partKeys.slice() : []);
    const defaultsBase = (source.defaults && typeof source.defaults === "object") ? source.defaults : {};
    const fallbackDefaults = base.defaults || {};
    const defaults = {
      ...deepClone(fallbackDefaults),
      ...deepClone(defaultsBase)
    };
    defaults.rigType = id;
    defaults.color = defaults.color || fallbackDefaults.color || "#804a00";
    defaults.collider = normalizeCollider(defaults.collider, fallbackDefaults.collider);
    defaults.segments = normalizeSegmentsMap(defaults.segments, partKeys);
    defaults.transforms = normalizeTransformsMap(defaults.transforms, partKeys);
    return {
      id,
      label: String(source.label || base.label || id),
      partKeys,
      defaults,
      builder: source.builder || base.builder || "humanoid",
      options: { ...(base.options || {}), ...(source.options || {}) }
    };
  }

  const fallbackMap = new Map(FALLBACK_RIG_TYPES.map(entry => [entry.id, entry]));
  const rigTypeList = [];
  const rigTypeMap = new Map();

  const sharedRigTypes = Array.isArray(window.RigDefinitions?.RIG_TYPES) && window.RigDefinitions.RIG_TYPES.length
    ? window.RigDefinitions.RIG_TYPES
    : null;

  const primarySource = sharedRigTypes || FALLBACK_RIG_TYPES;
  primarySource.forEach(raw => {
    const normalized = normalizeRigEntry(raw, fallbackMap.get(raw.id));
    if (!normalized || rigTypeMap.has(normalized.id)) return;
    rigTypeList.push(normalized);
    rigTypeMap.set(normalized.id, normalized);
  });

  FALLBACK_RIG_TYPES.forEach(raw => {
    if (rigTypeMap.has(raw.id)) return;
    const normalized = normalizeRigEntry(raw, raw);
    if (!normalized) return;
    rigTypeList.push(normalized);
    rigTypeMap.set(normalized.id, normalized);
  });

  const defaultRigId = (() => {
    const explicit = typeof window.RigDefinitions?.DEFAULT_RIG_TYPE === "string"
      ? window.RigDefinitions.DEFAULT_RIG_TYPE
      : null;
    if (explicit && rigTypeMap.has(explicit)) return explicit;
    let stored = null;
    try {
      stored = localStorage.getItem(RIG_TYPE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored && rigTypeMap.has(stored)) return stored;
    return rigTypeList[0]?.id || "anthro-biped";
  })();

  let rigTypeId = defaultRigId;
  let activeRigDef = rigTypeMap.get(rigTypeId) || rigTypeList[0] || null;
  if (!activeRigDef && rigTypeList.length) {
    activeRigDef = rigTypeList[0];
    rigTypeId = activeRigDef.id;
  }

  let PART_KEYS = activeRigDef ? activeRigDef.partKeys.slice() : [];
  if (window.RigDefinitions) {
    window.RigDefinitions.PART_KEYS = PART_KEYS.slice();
  }

  function createDefaultParamsForType(id) {
    const def = rigTypeMap.get(id) || rigTypeList.find(entry => entry.id === id) || activeRigDef;
    const base = def ? deepClone(def.defaults) : { rigType: id, color: "#888", collider: { width: 1, height: 1, depth: 1, y: 0 }, segments: {}, transforms: {} };
    base.rigType = def?.id || id;
    base.segments = normalizeSegmentsMap(base.segments, def?.partKeys || []);
    base.transforms = normalizeTransformsMap(base.transforms, def?.partKeys || []);
    base.collider = normalizeCollider(base.collider, def?.defaults?.collider || {});
    return base;
  }

  function currentRigDefinition() {
    return rigTypeMap.get(rigTypeId) || activeRigDef || rigTypeList[0] || null;
  }

  function persistRigType(id) {
    try {
      localStorage.setItem(RIG_TYPE_STORAGE_KEY, id);
    } catch {
      /* ignore persistence errors */
    }
  }

  function ensureRigParamsStructure(raw, keys = PART_KEYS, definition = currentRigDefinition()) {
    const targetKeys = Array.isArray(keys) && keys.length ? keys : (definition?.partKeys || []);
    const baseDef = definition?.defaults || {};
    const paramsObj = raw && typeof raw === "object" ? raw : {};
    if (!paramsObj.segments || typeof paramsObj.segments !== "object") {
      paramsObj.segments = {};
    }
    const normalizedSegments = {};
    targetKeys.forEach(key => {
      const seg = paramsObj.segments[key];
      let w = Number(seg?.w ?? seg?.width);
      let h = Number(seg?.h ?? seg?.height);
      let d = Number(seg?.d ?? seg?.depth ?? seg?.len ?? seg?.length);
      if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) {
        const fallback = baseDef.segments?.[key];
        w = Number(fallback?.w) || 0.4;
        h = Number(fallback?.h) || 0.4;
        d = Number(fallback?.d) || 0.4;
      }
      normalizedSegments[key] = { w, h, d };
    });
    paramsObj.segments = normalizedSegments;
    paramsObj.collider = normalizeCollider(paramsObj.collider, baseDef.collider || {});
    paramsObj.rigType = typeof paramsObj.rigType === "string" ? paramsObj.rigType : (currentRigDefinition()?.id || rigTypeId);
    ensureTransformMap(paramsObj, targetKeys);
    return paramsObj;
  }

  function legacyRigToParams(legacy, keys = PART_KEYS, definition = currentRigDefinition()) {
    const base = ensureRigParamsStructure(createDefaultParamsForType(definition?.id || rigTypeId), keys, definition);
    if (!legacy || typeof legacy !== "object") return base;

    if (typeof legacy.color === "string") {
      base.color = legacy.color;
    }
    if (typeof legacy.rigType === "string") {
      base.rigType = legacy.rigType;
    }

    const assignSegment = (partKey, dims) => {
      if (!dims || typeof dims !== "object") return;
      const seg = base.segments?.[partKey];
      if (!seg) return;
      const w = Number(dims.w);
      const h = Number(dims.h);
      const d = Number(dims.d);
      if (Number.isFinite(w)) seg.w = w;
      if (Number.isFinite(h)) seg.h = h;
      if (Number.isFinite(d)) seg.d = d;
    };

    assignSegment("pelvis", legacy.pelvis);
    assignSegment("torsoLower", legacy.torsoLower);
    assignSegment("torsoUpper", legacy.torsoUpper);
    assignSegment("neck", legacy.neck);
    assignSegment("head", legacy.head);

    const arm = legacy.arm || {};
    const upperDims = { w: arm.upperW, h: arm.upperLen, d: arm.upperD };
    const foreDims = { w: arm.foreW, h: arm.foreLen, d: arm.foreD };
    const handDims = { w: arm.foreW, h: arm.handLen, d: arm.foreD };
    assignSegment("armL_upper", upperDims);
    assignSegment("armR_upper", upperDims);
    assignSegment("armL_fore", foreDims);
    assignSegment("armR_fore", foreDims);
    assignSegment("armL_hand", handDims);
    assignSegment("armR_hand", handDims);

    const leg = legacy.leg || {};
    assignSegment("legL_thigh", { w: leg.thighW, h: leg.thighLen, d: leg.thighD });
    assignSegment("legR_thigh", { w: leg.thighW, h: leg.thighLen, d: leg.thighD });
    assignSegment("legL_shin", { w: leg.shinW, h: leg.shinLen, d: leg.shinD });
    assignSegment("legR_shin", { w: leg.shinW, h: leg.shinLen, d: leg.shinD });
    assignSegment("legL_foot", { w: leg.footW, h: leg.footH, d: leg.footLen });
    assignSegment("legR_foot", { w: leg.footW, h: leg.footH, d: leg.footLen });

    const transforms = legacy.transforms && typeof legacy.transforms === "object" ? legacy.transforms : {};
    ensureTransformMap(base, keys);
    keys.forEach(key => {
      const src = transforms[key];
      if (!src || typeof src !== "object") return;
      const dst = base.transforms[key] || t0();
      if (!base.transforms[key]) base.transforms[key] = dst;
      if (src.pos && typeof src.pos === "object") {
        const { x, y, z } = src.pos;
        if (Number.isFinite(Number(x))) dst.pos.x = Number(x);
        if (Number.isFinite(Number(y))) dst.pos.y = Number(y);
        if (Number.isFinite(Number(z))) dst.pos.z = Number(z);
      }
      if (src.rot && typeof src.rot === "object") {
        const { x, y, z } = src.rot;
        if (Number.isFinite(Number(x))) dst.rot.x = Number(x);
        if (Number.isFinite(Number(y))) dst.rot.y = Number(y);
        if (Number.isFinite(Number(z))) dst.rot.z = Number(z);
      }
    });

    return base;
  }

  const rigParamCache = new Map();
  let rigTypeSelectEl = null;
  let partSelectorEl = null;
  let sessionContext = null;

  function updateRigTypeSelectUI() {
    if (!rigTypeSelectEl) return;
    rigTypeSelectEl.innerHTML = "";
    rigTypeList.forEach(entry => {
      const opt = document.createElement("option");
      opt.value = entry.id;
      opt.textContent = entry.label || entry.id;
      rigTypeSelectEl.appendChild(opt);
    });
    rigTypeSelectEl.value = rigTypeId;
  }

  function populatePartSelector(selectedValue) {
    if (!partSelectorEl) return;
    const previous = selectedValue ?? partSelectorEl.value;
    partSelectorEl.innerHTML = "";
    PART_KEYS.forEach(key => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      partSelectorEl.appendChild(opt);
    });
    if (previous && PART_KEYS.includes(previous)) {
      partSelectorEl.value = previous;
    }
  }

  function setRigType(newId, options = {}) {
    if (!newId || !rigTypeMap.has(newId)) return false;
    const { paramsOverride = null, skipCache = false, deferRefresh = false, force = false } = options;
    if (newId === rigTypeId && !force && !paramsOverride) {
      if (!deferRefresh) {
        updateRigTypeSelectUI();
        populatePartSelector();
      }
      return true;
    }

    if (!skipCache && params) {
      try {
        syncParamsFromScene();
      } catch { /* ignore sync failures */ }
      rigParamCache.set(rigTypeId, deepClone(params));
    }

    rigTypeId = newId;
    activeRigDef = rigTypeMap.get(newId) || activeRigDef;
    PART_KEYS = activeRigDef ? activeRigDef.partKeys.slice() : [];
    if (window.RigDefinitions) {
      window.RigDefinitions.PART_KEYS = PART_KEYS.slice();
    }

    let nextParams = null;
    if (paramsOverride) {
      nextParams = deepClone(paramsOverride);
    } else if (!skipCache && rigParamCache.has(newId)) {
      nextParams = deepClone(rigParamCache.get(newId));
    } else {
      nextParams = createDefaultParamsForType(newId);
    }

    params = ensureRigParamsStructure(nextParams, PART_KEYS, activeRigDef);
    if (!params.color) {
      params.color = getRigColor();
    }
    params.rigType = newId;
    persistRigType(newId);

    if (!deferRefresh) {
      refresh();
      clearSelection();
      updateRigTypeSelectUI();
      populatePartSelector();
      markAnimationGroupDirty();
      refreshDopeSheet?.();
      applyPoseForFrame?.(playheadFrame);
      saveLocalSilently?.();
    }
    return true;
  }

  function t0(){ return { pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0} }; }
  const d2r = d => d * Math.PI / 180;

  // ===== Module-level state =====
  let gizmoMgr, selectedKey = null;
  const UNIT_POS = 1000; // set to 1 if you prefer scene units
  let outlinedMesh = null;
  let refreshDopeSheet = null;
  let keyClipboard = null;
  let timelineKeyHandler = null;
  const AUTO_KEY_STORAGE_KEY = "hxh.rig.autokey";
  const INTERPOLATION_STORAGE_KEY = "hxh.rig.interpolation";
  const VALID_INTERPOLATION_MODES = new Set(["linear", "stepped"]);
  let autoKeyEnabled = false;
  let autoKeyButton = null;
  let easeSelectorRef = null;
  let interpolationSelectRef = null;
  const autoKeyState = { snapshot: null, part: null, channel: null };
  const autoKeyHookedGizmos = new WeakSet();
  let autoKeyHooksInstalled = false;
  let autoKeyHookObserver = null;
  let interpolationMode = "linear";
  const ONION_SKIN_STORAGE_KEY = "hxh.rig.onionSkin";
  const ONION_OFFSETS = [-2, -1, 1, 2];
  const onionMaterials = { past: null, future: null };
  let onionSkinEnabled = false;
  let onionSkinButton = null;
  let onionGhosts = [];

  try {
    const storedGhost = localStorage.getItem(ONION_SKIN_STORAGE_KEY);
    if (storedGhost && ["1", "true", "on"].includes(storedGhost.toLowerCase())) {
      onionSkinEnabled = true;
    }
  } catch {
    onionSkinEnabled = false;
  }

  try {
    const stored = localStorage.getItem(AUTO_KEY_STORAGE_KEY);
    if (stored && ["1", "true", "on", "yes"].includes(stored.toLowerCase())) {
      autoKeyEnabled = true;
    }
  } catch {
    autoKeyEnabled = false;
  }

  try {
    const storedMode = localStorage.getItem(INTERPOLATION_STORAGE_KEY);
    if (storedMode && VALID_INTERPOLATION_MODES.has(storedMode)) {
      interpolationMode = storedMode;
    }
  } catch {
    interpolationMode = "linear";
  }

  // Visible mesh helper + red outline
  function meshForPart(key){ return scene.getMeshByName(key) || null; }
  function setOutline(mesh){
    if (outlinedMesh && !outlinedMesh.isDisposed()){
      outlinedMesh.renderOutline = false;
    }
    outlinedMesh = mesh || null;
    if (!outlinedMesh) return;
    outlinedMesh.renderOutline = true;
    outlinedMesh.outlineWidth = 0.03;
    outlinedMesh.outlineColor = BABYLON.Color3.FromHexString("#ff4d6d"); // red
  }

  // Animation store (shared via RigDefinitions.AnimationStore)
  const AnimationStore = window.RigDefinitions && window.RigDefinitions.AnimationStore;
  if (!AnimationStore) {
    throw new Error("RigDefinitions.AnimationStore is required for the rig editor");
  }

  if (AnimationStore.listAnimations().length === 0) {
    AnimationStore.createAnimation("Base", 30, [0, 30]);
  }
  if (typeof AnimationStore.getActive === "function" && !AnimationStore.getActive()) {
    const first = AnimationStore.listAnimations()[0];
    if (first && typeof AnimationStore.setActive === "function") {
      AnimationStore.setActive(first);
    }
  }

  let animationsHydrated = false;
  const ANIMATION_AUTOSAVE_DELAY = 700;
  let animationAutosaveTimer = null;
  let lastAnimationSnapshotJSON = null;
  let unloadAnimationSaveHandler = null;
  let visibilityAnimationSaveHandler = null;

  const CHANNEL_ALIAS = {
    pos: "position",
    position: "position",
    rot: "rotation",
    rotation: "rotation",
    scl: "scale",
    scale: "scale"
  };

  function normalizeChannel(channel) {
    const key = CHANNEL_ALIAS[channel];
    if (!key) throw new Error(`Unknown channel '${channel}'`);
    return key;
  }

  function currentAnimation() {
    if (typeof AnimationStore.getActive === "function") {
      const active = AnimationStore.getActive();
      if (active) return active;
    }
    const activeName = typeof AnimationStore.getActiveName === "function" ? AnimationStore.getActiveName() : null;
    if (activeName) return AnimationStore.getAnimation(activeName);
    const first = AnimationStore.listAnimations()[0];
    return first ? AnimationStore.getAnimation(first) : null;
  }

  function ensureAnimation() {
    let anim = currentAnimation();
    if (!anim) {
      anim = AnimationStore.createAnimation("Base", 30, [0, 30]);
      if (typeof AnimationStore.setActive === "function") {
        AnimationStore.setActive(anim.name || "Base");
      }
    }
    anim.joints = anim.joints || {};
    anim.range = anim.range || { start: 0, end: anim.fps || 30 };
    return anim;
  }

  function currentRange() {
    const anim = ensureAnimation();
    if (typeof anim.range.start !== "number") anim.range.start = Number(anim.range.start) || 0;
    if (typeof anim.range.end !== "number") anim.range.end = Number(anim.range.end) || (anim.range.start + (anim.fps || 30));
    if (anim.range.end <= anim.range.start) {
      anim.range.end = anim.range.start + (anim.fps || 30);
    }
    return anim.range;
  }

  function currentFps() {
    const anim = ensureAnimation();
    const fps = Number(anim.fps);
    anim.fps = (!Number.isFinite(fps) || fps <= 0) ? 30 : Math.max(1, Math.min(480, fps));
    return anim.fps;
  }

  // ---------- Animation persistence helpers ----------
  function sanitizeAnimationKeyframeSnapshot(entry) {
    if (!entry || typeof entry !== "object") return null;
    const frame = Math.round(Number(entry.frame));
    if (!Number.isFinite(frame)) return null;
    const ease = typeof entry.ease === "string" && entry.ease.trim() ? entry.ease.trim() : "linear";
    const valueSource = entry.value;
    let value;
    if (valueSource && typeof valueSource === "object") {
      const x = Number(valueSource.x);
      const y = Number(valueSource.y);
      const z = Number(valueSource.z);
      value = {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        z: Number.isFinite(z) ? z : 0
      };
    } else {
      const num = Number(valueSource);
      value = Number.isFinite(num) ? num : 0;
    }
    return { frame, value, ease };
  }

  function sanitizeAnimationClipSnapshot(name, clip) {
    if (!clip || typeof clip !== "object") return null;
    const rawName = typeof clip.name === "string" && clip.name.trim()
      ? clip.name.trim()
      : (typeof name === "string" && name.trim() ? name.trim() : null);
    if (!rawName) return null;
    const fpsNum = Number(clip.fps);
    const fps = Number.isFinite(fpsNum) && fpsNum > 0 ? Math.max(1, Math.min(480, Math.round(fpsNum))) : 30;
    const rangeSource = Array.isArray(clip.range)
      ? { start: clip.range[0], end: clip.range[1] }
      : (clip.range && typeof clip.range === "object" ? clip.range : {});
    let start = Number(rangeSource.start);
    let end = Number(rangeSource.end);
    if (!Number.isFinite(start)) start = 0;
    start = Math.max(0, Math.round(start));
    if (!Number.isFinite(end)) end = start + fps;
    end = Math.max(start + 1, Math.round(end));
    const joints = {};
    const sourceJoints = clip.joints && typeof clip.joints === "object" ? clip.joints : {};
    Object.keys(sourceJoints).forEach(joint => {
      const jointData = sourceJoints[joint];
      if (!jointData || typeof jointData !== "object") return;
      const sanitizedChannels = {};
      const channelDefs = [
        { key: "position", aliases: ["position", "pos"] },
        { key: "rotation", aliases: ["rotation", "rot"] },
        { key: "scale", aliases: ["scale", "scl"] }
      ];
      channelDefs.forEach(({ key, aliases }) => {
        let channelSource = null;
        for (const alias of aliases) {
          if (Array.isArray(jointData[alias])) {
            channelSource = jointData[alias];
            break;
          }
        }
        if (!channelSource) return;
        const map = new Map();
        channelSource.forEach(entry => {
          const sanitized = sanitizeAnimationKeyframeSnapshot(entry);
          if (!sanitized) return;
          map.set(sanitized.frame, sanitized);
        });
        if (!map.size) return;
        const keys = Array.from(map.values()).sort((a, b) => a.frame - b.frame);
        sanitizedChannels[key] = keys;
      });
      if (Object.keys(sanitizedChannels).length) {
        joints[joint] = sanitizedChannels;
      }
    });
    return {
      name: rawName,
      fps,
      range: { start, end },
      joints
    };
  }

  function sanitizeAnimationLibrarySnapshot(snapshot) {
    const result = { version: 1, active: null, clips: {} };
    if (!snapshot || typeof snapshot !== "object") return result;
    const pushClip = (name, data) => {
      const sanitized = sanitizeAnimationClipSnapshot(name, data);
      if (!sanitized) return;
      if (!result.clips[sanitized.name]) {
        result.clips[sanitized.name] = sanitized;
      }
    };
    if (Array.isArray(snapshot)) {
      snapshot.forEach(entry => pushClip(entry?.name, entry));
    }
    if (Array.isArray(snapshot?.clips)) {
      snapshot.clips.forEach(entry => pushClip(entry?.name, entry));
    }
    if (snapshot?.clips && typeof snapshot.clips === "object" && !Array.isArray(snapshot.clips)) {
      Object.entries(snapshot.clips).forEach(([name, data]) => pushClip(name, data));
    }
    if (snapshot?.animations && typeof snapshot.animations === "object") {
      Object.entries(snapshot.animations).forEach(([name, data]) => pushClip(name, data));
    }
    if (!Array.isArray(snapshot) && typeof snapshot === "object") {
      Object.entries(snapshot).forEach(([name, data]) => {
        if (["clips", "animations", "active", "activeName", "current", "version"].includes(name)) return;
        if (data && typeof data === "object" && (data.joints || data.range || data.fps)) {
          pushClip(name, data);
        }
      });
    }
    const activeCandidates = [snapshot.active, snapshot.activeName, snapshot.current]
      .filter(value => typeof value === "string" && value);
    for (const candidate of activeCandidates) {
      if (result.clips[candidate]) {
        result.active = candidate;
        break;
      }
    }
    if (!result.active) {
      const names = Object.keys(result.clips);
      if (names.length) {
        result.active = names.includes("Base") ? "Base" : names[0];
      }
    }
    return result;
  }

  function buildAnimationLibrarySnapshot() {
    const clips = {};
    const names = AnimationStore.listAnimations();
    names.forEach(name => {
      const anim = AnimationStore.getAnimation(name);
      if (!anim) return;
      const rawClip = {
        name: anim.name || name,
        fps: anim.fps,
        range: anim.range,
        joints: anim.joints
      };
      const sanitized = sanitizeAnimationClipSnapshot(name, rawClip);
      if (sanitized) {
        clips[sanitized.name] = sanitized;
      }
    });
    const snapshot = { version: 1, active: null, clips };
    const activeName = typeof AnimationStore.getActiveName === "function" ? AnimationStore.getActiveName() : null;
    if (activeName && clips[activeName]) {
      snapshot.active = activeName;
    } else {
      const clipNames = Object.keys(clips);
      if (clipNames.length) {
        snapshot.active = clipNames.includes("Base") ? "Base" : clipNames[0];
      }
    }
    return snapshot;
  }

  function loadSavedAnimationLibrary() {
    const hx = window.HXH;
    if (hx && typeof hx.getAnimationLibrary === "function") {
      try {
        const lib = hx.getAnimationLibrary();
        if (lib) return sanitizeAnimationLibrarySnapshot(lib);
      } catch (err) {}
    }
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(ANIMATION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return sanitizeAnimationLibrarySnapshot(parsed);
        }
      } catch (err) {}
    }
    return null;
  }

  function persistAnimationLibrarySnapshot(snapshot) {
    const sanitized = sanitizeAnimationLibrarySnapshot(snapshot);
    let stored = null;
    const hx = window.HXH;
    if (hx && typeof hx.saveAnimationLibrary === "function") {
      try {
        const result = hx.saveAnimationLibrary(sanitized);
        if (result) stored = sanitizeAnimationLibrarySnapshot(result);
      } catch (err) { stored = null; }
    }
    if (!stored && typeof localStorage !== "undefined") {
      try {
        if (Object.keys(sanitized.clips).length) {
          localStorage.setItem(ANIMATION_STORAGE_KEY, JSON.stringify(sanitized));
        } else {
          localStorage.removeItem(ANIMATION_STORAGE_KEY);
        }
        stored = sanitized;
      } catch (err) {}
    }
    if (stored) {
      lastAnimationSnapshotJSON = JSON.stringify(stored);
      return true;
    }
    return false;
  }

  function persistAnimationLibrarySnapshotIfChanged(force = false) {
    const snapshot = buildAnimationLibrarySnapshot();
    const serialized = JSON.stringify(snapshot);
    if (!force && serialized === lastAnimationSnapshotJSON) return false;
    return persistAnimationLibrarySnapshot(snapshot);
  }

  function scheduleAnimationAutosave() {
    if (animationAutosaveTimer) {
      clearTimeout(animationAutosaveTimer);
    }
    animationAutosaveTimer = setTimeout(() => {
      animationAutosaveTimer = null;
      persistAnimationLibrarySnapshotIfChanged();
    }, ANIMATION_AUTOSAVE_DELAY);
  }

  function flushAnimationAutosave({ force = false } = {}) {
    if (animationAutosaveTimer) {
      clearTimeout(animationAutosaveTimer);
      animationAutosaveTimer = null;
    }
    persistAnimationLibrarySnapshotIfChanged(force);
  }

  function ensureAnimationLibraryHydrated() {
    if (animationsHydrated) return;
    animationsHydrated = true;
    const saved = loadSavedAnimationLibrary();
    if (saved && Object.keys(saved.clips || {}).length) {
      applyAnimationLibrarySnapshot(saved, { silent: true });
      lastAnimationSnapshotJSON = JSON.stringify(saved);
    } else {
      const current = buildAnimationLibrarySnapshot();
      lastAnimationSnapshotJSON = JSON.stringify(current);
    }
  }

  function applyAnimationLibrarySnapshot(snapshot, { silent = false } = {}) {
    const sanitized = sanitizeAnimationLibrarySnapshot(snapshot);
    const clips = sanitized.clips || {};
    const existing = AnimationStore.listAnimations();
    existing.forEach(name => {
      try { AnimationStore.deleteAnimation(name); } catch (err) {}
    });
    const createdNames = [];
    Object.keys(clips).forEach(name => {
      const clip = clips[name];
      if (!clip) return;
      const fps = Math.max(1, Math.min(480, Math.round(Number(clip.fps) || 30)));
      const start = Math.max(0, Math.round(Number(clip.range?.start) || 0));
      let end = Math.round(Number(clip.range?.end));
      if (!Number.isFinite(end) || end <= start) end = start + fps;
      let created = null;
      try {
        created = AnimationStore.createAnimation(clip.name || name, fps, [start, end]);
      } catch (err) {
        const fallback = `${clip.name || name}-${Math.random().toString(36).slice(2, 6)}`;
        try { created = AnimationStore.createAnimation(fallback, fps, [start, end]); } catch (err2) { created = null; }
      }
      if (!created) return;
      const createdName = created.name || clip.name || name;
      createdNames.push(createdName);
      if (typeof AnimationStore.setActive === "function") {
        try { AnimationStore.setActive(createdName); } catch (err) {}
      }
      const joints = clip.joints && typeof clip.joints === "object" ? clip.joints : {};
      Object.keys(joints).forEach(jointKey => {
        const channels = joints[jointKey] && typeof joints[jointKey] === "object" ? joints[jointKey] : {};
        ["position", "rotation", "scale"].forEach(channelName => {
          const keys = Array.isArray(channels[channelName]) ? channels[channelName] : [];
          keys.forEach(key => {
            const frame = Math.round(Number(key.frame) || 0);
            const ease = typeof key.ease === "string" && key.ease.trim() ? key.ease.trim() : "linear";
            const value = key.value && typeof key.value === "object"
              ? {
                x: Number(key.value.x) || 0,
                y: Number(key.value.y) || 0,
                z: Number(key.value.z) || 0
              }
              : Number(key.value) || 0;
            AnimationStore.addKey(jointKey, channelName, frame, value, { ease, tolerance: 0.5 });
          });
        });
      });
    });
    if (!createdNames.length) {
      if (AnimationStore.listAnimations().length === 0) {
        const base = AnimationStore.createAnimation("Base", 30, [0, 30]);
        if (base) createdNames.push(base.name || "Base");
      }
    }
    const activeTarget = sanitized.active && createdNames.includes(sanitized.active)
      ? sanitized.active
      : (createdNames.includes("Base") ? "Base" : createdNames[0]);
    if (activeTarget && typeof AnimationStore.setActive === "function") {
      try { AnimationStore.setActive(activeTarget); } catch (err) {}
    }
    if (!silent && typeof AnimationStore.touch === "function") {
      try { AnimationStore.touch(activeTarget || createdNames[0] || null); } catch (err) {}
    }
    markAnimationGroupDirty();
    refreshDopeSheet?.();
    return true;
  }

  function exportAnimationLibrary() {
    try {
      const snapshot = sanitizeAnimationLibrarySnapshot(buildAnimationLibrarySnapshot());
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = snapshot.active || "animations";
      const safeName = baseName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "animations";
      a.download = `${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      console.warn("[RigEditor] Failed to export animations", err);
      alert("Failed to export animations.");
    }
  }

  async function importAnimationLibraryFromFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const sanitized = sanitizeAnimationLibrarySnapshot(parsed);
      applyAnimationLibrarySnapshot(sanitized);
      persistAnimationLibrarySnapshot(sanitized);
      alert("Animation clips imported.");
    } catch (err) {
      console.warn("[RigEditor] Failed to import animation JSON", err);
      alert("Failed to import animation JSON.");
    }
  }

  function totalFrames() {
    const range = currentRange();
    return Math.max(1, range.end - range.start);
  }

  function secondsToFrame(seconds) {
    const range = currentRange();
    return range.start + seconds * currentFps();
  }

  function frameToSeconds(frame) {
    const range = currentRange();
    return (frame - range.start) / currentFps();
  }

  function currentLengthSeconds() {
    return totalFrames() / currentFps();
  }

  function trackOf(part, ch) {
    const anim = ensureAnimation();
    const channel = normalizeChannel(ch);
    if (!anim.joints[part]) {
      anim.joints[part] = {
        position: [],
        rotation: [],
        scale: []
      };
    }
    if (!Array.isArray(anim.joints[part][channel])) {
      anim.joints[part][channel] = [];
    }
    return anim.joints[part][channel];
  }

  function getChannelValueFromNode(node, channel) {
    if (!node) return null;
    if (channel === "pos") {
      return { x: node.position.x, y: node.position.y, z: node.position.z };
    }
    if (channel === "rot") {
      return getNodeEuler(node);
    }
    if (channel === "scl") {
      const s = node.scaling || new BABYLON.Vector3(1, 1, 1);
      return { x: s.x, y: s.y, z: s.z };
    }
    return null;
  }

  function currentJointValue(part, channel) {
    const node = nodes[part];
    return getChannelValueFromNode(node, channel);
  }

  function captureNodeSnapshot(part) {
    return {
      pos: currentJointValue(part, "pos"),
      rot: currentJointValue(part, "rot"),
      scl: currentJointValue(part, "scl")
    };
  }

  function hasChannelChanged(channel, before, after) {
    const key = channel === "rot" ? "rot" : (channel === "scl" ? "scl" : "pos");
    const prev = before?.[key];
    const next = after?.[key];
    if (!prev || !next) return false;
    const epsilon = channel === "rot" ? 1e-4 : (channel === "scl" ? 1e-4 : 1e-4);
    return (
      Math.abs(prev.x - next.x) > epsilon ||
      Math.abs(prev.y - next.y) > epsilon ||
      Math.abs(prev.z - next.z) > epsilon
    );
  }

  function captureRigSnapshot() {
    const snapshot = {};
    for (const key of PART_KEYS) {
      const node = nodes[key];
      if (!node) continue;
      const position = node.position?.clone?.() || new BABYLON.Vector3();
      const scaling = node.scaling?.clone?.() || new BABYLON.Vector3(1, 1, 1);
      let rotationQuaternion = node.rotationQuaternion;
      if (!rotationQuaternion) {
        rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(node.rotation?.x || 0, node.rotation?.y || 0, node.rotation?.z || 0);
      }
      snapshot[key] = {
        position,
        scaling,
        rotationQuaternion: rotationQuaternion.clone(),
        hadQuaternion: Boolean(node.rotationQuaternion)
      };
    }
    return snapshot;
  }

  function restoreRigSnapshot(snapshot) {
    if (!snapshot) return;
    for (const key of Object.keys(snapshot)) {
      const node = nodes[key];
      const snap = snapshot[key];
      if (!node || !snap) continue;
      if (node.position) node.position.copyFrom(snap.position);
      if (node.scaling) node.scaling.copyFrom(snap.scaling);
      if (!node.rotationQuaternion) {
        node.rotationQuaternion = new BABYLON.Quaternion();
      }
      node.rotationQuaternion.copyFrom(snap.rotationQuaternion);
      if (!snap.hadQuaternion && node.rotation) {
        node.rotationQuaternion.toEulerAnglesToRef(node.rotation);
      } else {
        syncRotationFromQuaternion(node);
      }
    }
  }

  function persistOnionSkinSetting(enabled) {
    try {
      localStorage.setItem(ONION_SKIN_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore persistence errors */
    }
  }

  function updateOnionSkinButtonUI() {
    if (!onionSkinButton) return;
    onionSkinButton.textContent = onionSkinEnabled ? "👻 Ghost On" : "Ghost Off";
    onionSkinButton.classList.toggle("primary", onionSkinEnabled);
    onionSkinButton.classList.toggle("secondary", !onionSkinEnabled);
    onionSkinButton.setAttribute("aria-pressed", onionSkinEnabled ? "true" : "false");
  }

  function disposeOnionGhosts() {
    if (!onionGhosts.length) return;
    onionGhosts.forEach(ghost => {
      try { ghost.root?.dispose?.(); } catch { /* ignore */ }
    });
    onionGhosts = [];
  }

  function ghostMaterialFor(offset) {
    const key = offset < 0 ? "past" : "future";
    const cached = onionMaterials[key];
    if (cached) {
      const disposed = typeof cached.isDisposed === "function" ? cached.isDisposed() : cached.isDisposed;
      if (!disposed) return cached;
    }
    if (!scene) return null;
    const mat = new BABYLON.StandardMaterial(`onion-${key}-${Date.now()}`, scene);
    const color = offset < 0 ? new BABYLON.Color3(1, 0.45, 0.4) : new BABYLON.Color3(0.4, 0.75, 1);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.2);
    mat.alpha = 0.25;
    mat.specularColor = BABYLON.Color3.Black();
    mat.backFaceCulling = true;
    onionMaterials[key] = mat;
    return mat;
  }

  function ensureOnionGhosts() {
    if (!onionSkinEnabled || !scene) return;
    if (onionGhosts.length === ONION_OFFSETS.length && onionGhosts.every(g => g && !g.root?.isDisposed?.())) {
      return;
    }
    disposeOnionGhosts();
    const availableParts = new Map();
    for (const key of PART_KEYS) {
      const mesh = scene.getMeshByName(key);
      if (mesh) availableParts.set(key, mesh);
    }
    if (!availableParts.size) return;
    onionGhosts = ONION_OFFSETS.map(offset => {
      const root = new BABYLON.TransformNode(`onion-root-${offset}-${Date.now()}`, scene);
      root.isPickable = false;
      const mat = ghostMaterialFor(offset);
      const meshes = new Map();
      availableParts.forEach((src, key) => {
        const clone = src.clone?.(`onion-${offset}-${key}`, root);
        if (!clone) return;
        clone.parent = root;
        clone.material = mat;
        clone.isPickable = false;
        clone.renderOutline = false;
        clone.alwaysSelectAsActiveMesh = false;
        clone.visibility = 1;
        clone.checkCollisions = false;
        clone.metadata = { ...(clone.metadata || {}), onionSkin: true, offset };
        if (!clone.rotationQuaternion) {
          clone.rotationQuaternion = new BABYLON.Quaternion();
        }
        meshes.set(key, clone);
      });
      return { offset, root, meshes };
    });
  }

  function gatherWorldTransforms() {
    const transforms = new Map();
    if (!scene) return transforms;
    const scaling = new BABYLON.Vector3();
    const rotation = new BABYLON.Quaternion();
    const position = new BABYLON.Vector3();
    for (const key of PART_KEYS) {
      const mesh = scene.getMeshByName(key);
      if (!mesh) continue;
      const matrix = mesh.getWorldMatrix();
      matrix.decompose(scaling, rotation, position);
      transforms.set(key, {
        position: position.clone(),
        rotation: rotation.clone(),
        scaling: scaling.clone()
      });
    }
    return transforms;
  }

  function sampleGhostTransforms(offsets) {
    const results = new Map();
    if (!scene || !offsets.length) return results;
    const snapshot = captureRigSnapshot();
    const baseFrame = playheadFrame;
    const range = currentRange();
    const clampFrame = value => {
      const clamped = Math.max(range.start, Math.min(range.end, value));
      return Number.isFinite(clamped) ? clamped : range.start;
    };
    for (const offset of offsets) {
      const targetFrame = clampFrame(baseFrame + offset);
      applyAtTime(frameToSeconds(targetFrame));
      results.set(offset, { frame: targetFrame, transforms: gatherWorldTransforms() });
    }
    restoreRigSnapshot(snapshot);
    return results;
  }

  function updateOnionGhosts() {
    if (!onionSkinEnabled) return;
    ensureOnionGhosts();
    if (!onionGhosts.length) return;
    const samples = sampleGhostTransforms(onionGhosts.map(g => g.offset));
    const baseFrameRounded = Math.round(playheadFrame);
    onionGhosts.forEach(ghost => {
      const data = samples.get(ghost.offset);
      if (!data || !data.transforms) {
        ghost.root.setEnabled(false);
        return;
      }
      const sameFrame = Math.round(data.frame) === baseFrameRounded;
      const hasTransforms = data.transforms.size > 0;
      const visible = hasTransforms && !sameFrame;
      ghost.root.setEnabled(visible);
      if (!visible) return;
      ghost.root.getChildren().forEach(child => child.setEnabled(true));
      ghost.meshes.forEach((mesh, key) => {
        const tr = data.transforms.get(key);
        if (!tr) {
          mesh.setEnabled(false);
          return;
        }
        mesh.setEnabled(true);
        mesh.position.copyFrom(tr.position);
        if (!mesh.rotationQuaternion) {
          mesh.rotationQuaternion = new BABYLON.Quaternion();
        }
        mesh.rotationQuaternion.copyFrom(tr.rotation);
        if (mesh.rotation) {
          mesh.rotationQuaternion.toEulerAnglesToRef(mesh.rotation);
        }
        mesh.scaling.copyFrom(tr.scaling);
      });
    });
  }

  function setOnionSkinEnabled(enabled, { persist = true } = {}) {
    const next = Boolean(enabled);
    onionSkinEnabled = next;
    updateOnionSkinButtonUI();
    if (onionSkinEnabled) {
      ensureOnionGhosts();
      updateOnionGhosts();
    } else {
      disposeOnionGhosts();
    }
    if (persist) {
      persistOnionSkinSetting(onionSkinEnabled);
    }
  }
  // ---------- Picking robustness ----------
  // Map pivot TransformNode -> part key (avoids pelvis fallback)
  const pivotToKey = new WeakMap();

  // Mark non-pickable décor (call once after scene build)
  function markDecorUnpickable() {
    scene.meshes.forEach(m=>{
      const n=(m.name||"").toLowerCase();
      if (n==="g" || n==="collider" || n.includes("grid") || n.includes("floor") || n.includes("ground") || n.includes("axis")){
        m.isPickable = false;
      }
    });
  }

  // Resolve a clicked mesh to the closest rig pivot above it
  function findPartKeyFromMesh(mesh){
    if (!mesh) return null;

    // Honor metadata if present
    if (mesh.metadata && mesh.metadata.partKey && nodes[mesh.metadata.partKey]){
      return mesh.metadata.partKey;
    }

    // Walk ancestors: first pivot we know wins (closest)
    let cur = mesh;
    while (cur){
      if (pivotToKey.has(cur)) return pivotToKey.get(cur);
      cur = cur.parent;
    }

    // Fallback: descendant-of scan (should rarely run now)
    if (mesh.isDescendantOf){
      for (const [k,pivot] of Object.entries(nodes)){
        if (mesh.isDescendantOf(pivot)) return k;
      }
    }
    return null;
  }

  function ensureTransformMap(p, keys = PART_KEYS){
    if (!p.transforms || typeof p.transforms!=="object") p.transforms = {};
    const targetKeys = Array.isArray(keys) && keys.length ? keys : PART_KEYS;
    const allowed = new Set(targetKeys);
    targetKeys.forEach(k => {
      const base = p.transforms[k] || {};
      const pos = base.pos || {};
      const rot = base.rot || {};
      p.transforms[k] = {
        pos:{ x:Number(pos.x)||0, y:Number(pos.y)||0, z:Number(pos.z)||0 },
        rot:{ x:Number(rot.x)||0, y:Number(rot.y)||0, z:Number(rot.z)||0 },
      };
    });
    Object.keys(p.transforms).forEach(key => {
      if (!allowed.has(key)) delete p.transforms[key];
    });
    return p.transforms;
  }

  // ---------- Babylon setup ----------
  let engine, scene, camera;
  let rigRoot = null; // visible collider
  let nodes = {};     // TransformNodes keyed by part
  let params = null;  // working params
  let booted = false;
  let pendingUnlockBoot = null;

  const timelineControls = { btnPlay: null };
  const TIMELINE_MIN_VIEW_SPAN = 2;
  let timelineViewRange = null;
  let playheadFrame = 0;
  let animationBinding = { group: null, fps: 30, range: { start: 0, end: 30 }, name: null };
  let animationGroupDirty = true;

  const TMP_EULER = new BABYLON.Vector3();

  function isSteppedMode() {
    return interpolationMode === "stepped";
  }

  function persistInterpolationMode(mode) {
    try {
      localStorage.setItem(INTERPOLATION_STORAGE_KEY, mode);
    } catch {
      /* ignore persistence errors */
    }
  }

  function updateInterpolationUI() {
    if (!interpolationSelectRef) return;
    interpolationSelectRef.value = interpolationMode;
    const label = interpolationSelectRef.closest("label");
    if (label) {
      label.setAttribute("data-mode", interpolationMode);
    }
  }

  function ensureSteppedKeyStyles() {
    const styleId = "rig-editor-stepped-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
.timeline-key.stepped{ position:relative; }
.timeline-key.stepped::after{
  content:"";
  position:absolute;
  inset:-3px;
  border:2px solid rgba(255,255,255,0.85);
  border-radius:3px;
  pointer-events:none;
}
.timeline-key.stepped.selected::after{
  border-color:#ffe28a;
}
`;
    document.head.appendChild(style);
  }

  function clampTimelineViewRange(start, end) {
    const range = currentRange();
    const fullSpan = Math.max(1, range.end - range.start);
    const minSpan = Math.min(fullSpan, Math.max(1, TIMELINE_MIN_VIEW_SPAN));
    let span = Number(end) - Number(start);
    if (!Number.isFinite(span) || span <= 0) span = fullSpan;
    span = Math.max(minSpan, Math.min(fullSpan, span));
    let clampedStart = Number(start);
    if (!Number.isFinite(clampedStart)) clampedStart = range.start;
    clampedStart = Math.max(range.start, Math.min(range.end - span, clampedStart));
    const clampedEnd = Math.min(range.end, clampedStart + span);
    return { start: clampedStart, end: clampedEnd };
  }

  function ensureTimelineViewRange() {
    const range = currentRange();
    if (!timelineViewRange || !Number.isFinite(timelineViewRange.start) || !Number.isFinite(timelineViewRange.end)) {
      timelineViewRange = { start: range.start, end: range.end };
    }
    timelineViewRange = clampTimelineViewRange(timelineViewRange.start, timelineViewRange.end);
    return timelineViewRange;
  }

  function getTimelineViewRange() {
    return ensureTimelineViewRange();
  }

  function setTimelineViewRange(start, end) {
    timelineViewRange = clampTimelineViewRange(start, end);
    return timelineViewRange;
  }

  function applyInterpolationModeToGroup(group) {
    if (!group) return;
    const target = isSteppedMode() ? BABYLON.Animation.ANIMATIONKEYINTERPOLATION_STEP : null;
    const animations = Array.isArray(group.targetedAnimations) ? group.targetedAnimations : [];
    animations.forEach(entry => {
      const animation = entry?.animation;
      if (!animation || typeof animation.getKeys !== "function") return;
      const keys = animation.getKeys();
      if (!Array.isArray(keys) || !keys.length) return;
      let changed = false;
      if (target != null) {
        keys.forEach(key => {
          if (!key) return;
          if (key.interpolation !== target) {
            key.interpolation = target;
            changed = true;
          }
        });
      } else {
        keys.forEach(key => {
          if (!key || key.interpolation == null) return;
          delete key.interpolation;
          changed = true;
        });
      }
      if (changed && typeof animation.setKeys === "function") {
        animation.setKeys(keys);
      }
    });
  }

  function setInterpolationMode(mode) {
    const normalized = VALID_INTERPOLATION_MODES.has(mode) ? mode : "linear";
    if (normalized === interpolationMode) {
      updateInterpolationUI();
      return;
    }
    interpolationMode = normalized;
    updateInterpolationUI();
    persistInterpolationMode(interpolationMode);
    markAnimationGroupDirty();
    const binding = ensureAnimationGroup();
    if (binding?.group) {
      applyInterpolationModeToGroup(binding.group);
    }
    applyPoseForFrame(playheadFrame);
    refreshDopeSheet?.();
  }

  function getNodeEuler(node) {
    if (!node) return { x: 0, y: 0, z: 0 };
    if (node.rotationQuaternion) {
      node.rotationQuaternion.toEulerAnglesToRef(TMP_EULER);
      return { x: TMP_EULER.x, y: TMP_EULER.y, z: TMP_EULER.z };
    }
    const rot = node.rotation || { x: 0, y: 0, z: 0 };
    return { x: rot.x || 0, y: rot.y || 0, z: rot.z || 0 };
  }

  function setNodeEuler(node, euler) {
    if (!node) return;
    const x = Number(euler?.x) || 0;
    const y = Number(euler?.y) || 0;
    const z = Number(euler?.z) || 0;
    if (node.rotation) node.rotation.set(x, y, z);
    if (!node.rotationQuaternion) node.rotationQuaternion = new BABYLON.Quaternion();
    BABYLON.Quaternion.FromEulerAnglesToRef(x, y, z, node.rotationQuaternion);
  }

  function syncRotationToQuaternion(node) {
    if (!node) return;
    const rot = node.rotation || { x: 0, y: 0, z: 0 };
    setNodeEuler(node, rot);
  }

  function syncRotationFromQuaternion(node) {
    if (!node) return;
    if (node.rotationQuaternion) {
      node.rotationQuaternion.toEulerAnglesToRef(node.rotation ?? TMP_EULER);
    } else {
      syncRotationToQuaternion(node);
    }
  }

  function syncAllNodeQuaternions() {
    for (const key of PART_KEYS) {
      const node = nodes[key];
      if (!node) continue;
      syncRotationToQuaternion(node);
    }
  }

  function syncNodesFromQuaternion() {
    for (const key of PART_KEYS) {
      const node = nodes[key];
      if (!node) continue;
      syncRotationFromQuaternion(node);
    }
  }

  function applyPoseForFrame(frame, bindingOverride) {
    applyTransforms();
    const binding = bindingOverride || ensureAnimationGroup();
    if (binding && binding.group) {
      binding.group.goToFrame(frame);
      binding.group.pause();
      syncNodesFromQuaternion();
    } else {
      applyAtTime(frameToSeconds(frame));
    }
    updateOnionGhosts();
    updateToolbar();
  }

  function disposeAnimationGroup() {
    if (animationBinding.group) {
      try { animationBinding.group.dispose(); } catch (err) { /* ignore */ }
    }
    animationBinding = { group: null, fps: 30, range: { start: 0, end: 30 }, name: null };
  }

  function markAnimationGroupDirty() {
    animationGroupDirty = true;
    if (anim.playing) {
      anim.playing = false;
      if (timelineControls.btnPlay) timelineControls.btnPlay.textContent = "▶";
    }
    if (animationBinding.group) {
      try { animationBinding.group.pause(); } catch (err) { /* ignore */ }
    }
  }

  function rebuildAnimationGroup() {
    if (!scene || !AnimationStore || typeof AnimationStore.buildAnimationGroup !== "function") {
      disposeAnimationGroup();
      animationGroupDirty = false;
      return animationBinding;
    }
    const animData = ensureAnimation();
    if (!animData) {
      disposeAnimationGroup();
      animationGroupDirty = false;
      return animationBinding;
    }
    disposeAnimationGroup();
    const build = AnimationStore.buildAnimationGroup({
      scene,
      nodes,
      animation: animData,
      id: `rig-editor-${animData.name || "anim"}-${Date.now()}`
    });
    if (build && build.group) {
      animationBinding = {
        group: build.group,
        fps: build.fps,
        range: { start: build.range.start, end: build.range.end },
        name: build.name || animData.name || null
      };
      applyInterpolationModeToGroup(animationBinding.group);
      animationBinding.group.start(false, 1.0, animationBinding.range.start, animationBinding.range.end);
      animationBinding.group.pause();
    } else {
      const range = currentRange();
      animationBinding = {
        group: null,
        fps: animData.fps || currentFps(),
        range: { start: range.start, end: range.end },
        name: animData.name || null
      };
    }
    animationGroupDirty = false;
    if (!anim.playing) {
      applyPoseForFrame(playheadFrame, animationBinding);
    }
    return animationBinding;
  }

  function ensureAnimationGroup() {
    if (animationGroupDirty) {
      rebuildAnimationGroup();
    }
    return animationBinding;
  }

  if (typeof AnimationStore.onChange === "function") {
    AnimationStore.onChange(() => {
      markAnimationGroupDirty();
      scheduleAnimationAutosave();
    });
  }

  // Animation-preview state
  const anim = { playing:false, mode:"walk", speed:1.0, grounded:true, phase:0, attackT:0, loop:true };

  function buildAnimEditor(){
    ensureSteppedKeyStyles();
    const timelineRoot = document.getElementById("an-timeline");
    const timeSlider = document.getElementById("an-time");
    const timeOut = document.getElementById("an-time-readout");
    const btnPlay = document.getElementById("an-play");
    timelineControls.btnPlay = btnPlay;
    if (btnPlay) {
      btnPlay.title = "Play / Pause (Space)";
    }
    const btnStop = document.getElementById("an-stop");
    const btnToStart = document.getElementById("an-to-start");
    const btnPrev = document.getElementById("an-prev");
    const btnNext = document.getElementById("an-next");
    const btnToEnd = document.getElementById("an-to-end");
    const lenEl = document.getElementById("an-length");
    const fpsEl = document.getElementById("an-fps");
    const rangeStartEl = document.getElementById("an-range-start");
    const rangeEndEl = document.getElementById("an-range-end");
    const partSel = document.getElementById("an-track");
    const chSel = document.getElementById("an-channel");
    const easeSel = document.getElementById("an-ease");
    const addBtn = document.getElementById("an-add");
    const delBtn = document.getElementById("an-del");
    if (addBtn) {
      addBtn.title = "Insert key at current frame (I)";
    }
    easeSelectorRef = easeSel;

    const curveRow = document.querySelector("#anim-panel .curve-row");
    if (curveRow) {
      let interpLabel = curveRow.querySelector("label[data-role='interp-mode']");
      if (!interpLabel) {
        interpLabel = document.createElement("label");
        interpLabel.dataset.role = "interp-mode";
        const text = document.createElement("span");
        text.textContent = "Key Mode";
        const select = document.createElement("select");
        select.id = "an-interp";
        const optLinear = document.createElement("option");
        optLinear.value = "linear";
        optLinear.textContent = "Linear";
        const optStepped = document.createElement("option");
        optStepped.value = "stepped";
        optStepped.textContent = "Stepped";
        select.append(optLinear, optStepped);
        interpLabel.append(text, select);
        curveRow.appendChild(interpLabel);
        select.onchange = () => setInterpolationMode(select.value);
        interpolationSelectRef = select;
      } else {
        const select = interpLabel.querySelector("select");
        if (select) {
          select.innerHTML = "";
          const optLinear = document.createElement("option");
          optLinear.value = "linear";
          optLinear.textContent = "Linear";
          const optStepped = document.createElement("option");
          optStepped.value = "stepped";
          optStepped.textContent = "Stepped";
          select.append(optLinear, optStepped);
          select.onchange = () => setInterpolationMode(select.value);
          interpolationSelectRef = select;
        }
      }
      updateInterpolationUI();
    }

    let autoKeyBtn = document.getElementById("an-autokey");
    const controlsParent = addBtn?.parentElement || delBtn?.parentElement || null;
    if (!autoKeyBtn && controlsParent) {
      autoKeyBtn = document.createElement("button");
      autoKeyBtn.type = "button";
      autoKeyBtn.id = "an-autokey";
      autoKeyBtn.className = "secondary";
      autoKeyBtn.title = "Toggle Auto-Key (records transforms automatically)";
      controlsParent.insertBefore(autoKeyBtn, delBtn || null);
    } else if (autoKeyBtn && controlsParent && autoKeyBtn.parentElement !== controlsParent) {
      controlsParent.insertBefore(autoKeyBtn, delBtn || null);
    }
    if (autoKeyBtn) {
      autoKeyBtn.title = "Toggle Auto-Key (records transforms automatically)";
      autoKeyBtn.onclick = () => { setAutoKeyEnabled(!autoKeyEnabled); };
    }
    autoKeyButton = autoKeyBtn || null;
    updateAutoKeyButtonUI();

    // populate parts
    partSelectorEl = partSel;
    populatePartSelector();

    timelineRoot.innerHTML = "";

    const sheetEl = document.createElement("div");
    sheetEl.className = "dope-sheet timeline";

    const headerEl = document.createElement("div");
    headerEl.className = "dope-header";

    const headerLeft = document.createElement("div");
    headerLeft.className = "dope-header-left";
    const filterLabel = document.createElement("label");
    filterLabel.className = "dope-filter";
    filterLabel.textContent = "View";
    const filterSel = document.createElement("select");
    filterSel.id = "dope-filter";
    const optAll = document.createElement("option");
    optAll.value = "animated";
    optAll.textContent = "All Animated";
    const optSel = document.createElement("option");
    optSel.value = "selected";
    optSel.textContent = "Only Selected Joint";
    filterSel.append(optAll, optSel);
    filterLabel.appendChild(filterSel);
    headerLeft.appendChild(filterLabel);

    const rulerEl = document.createElement("div");
    rulerEl.className = "dope-header-right timeline-ruler";

    headerEl.append(headerLeft, rulerEl);
    sheetEl.appendChild(headerEl);

    const bodyEl = document.createElement("div");
    bodyEl.className = "dope-body";
    const rowsEl = document.createElement("div");
    rowsEl.className = "dope-rows";
    bodyEl.appendChild(rowsEl);

    const overlayEl = document.createElement("div");
    overlayEl.className = "dope-overlay";
    const playheadLine = document.createElement("div");
    playheadLine.className = "timeline-playhead";
    overlayEl.appendChild(playheadLine);
    const selectionBox = document.createElement("div");
    selectionBox.className = "dope-selection";
    selectionBox.style.display = "none";
    overlayEl.appendChild(selectionBox);
    bodyEl.appendChild(overlayEl);

    const playheadHandle = document.createElement("div");
    playheadHandle.className = "playhead-handle";
    bodyEl.appendChild(playheadHandle);

    sheetEl.appendChild(bodyEl);
    timelineRoot.appendChild(sheetEl);

    const transport = btnToStart?.parentElement || null;
    if (transport) {
      const loopLabel = document.createElement("label");
      loopLabel.className = "timeline-loop";
      const loopInput = document.createElement("input");
      loopInput.type = "checkbox";
      loopInput.id = "an-loop";
      loopInput.checked = anim.loop !== false;
      const loopText = document.createElement("span");
      loopText.textContent = "Loop";
      loopLabel.append(loopInput, loopText);
      transport.appendChild(loopLabel);
      loopInput.addEventListener("change", () => {
        anim.loop = loopInput.checked;
      });
    }

    const CHANNELS = [
      { short: "pos", name: "position", label: "Position" },
      { short: "rot", name: "rotation", label: "Rotation" },
      { short: "scl", name: "scale", label: "Scale" }
    ];

    const selectedKeys = new Set();
    const keyElements = new Map();
    const keyMeta = new Map();
    const rowElements = new Map();
    const expandedJoints = new Map();
    playheadFrame = currentRange().start;
    ensureTimelineViewRange();
    let playheadDrag = null;
    let keyDrag = null;
    let boxSelect = null;
    let panState = null;
    const indicatorRegistry = new Map();

    const registerIndicator = (part, channel, el) => {
      if (!part || !channel || !el) return;
      const key = `${part}|${channel}`;
      if (!indicatorRegistry.has(key)) {
        indicatorRegistry.set(key, []);
      }
      indicatorRegistry.get(key).push(el);
    };

    function updateIndicatorStates() {
      const animData = ensureAnimation();
      const jointsData = animData.joints || {};
      const frame = Math.round(playheadFrame);
      indicatorRegistry.forEach((elements, key) => {
        const [part, channel] = key.split("|");
        const data = jointsData[part] || {};
        const channelName = CHANNEL_ALIAS[channel] || channel;
        const track = Array.isArray(data[channelName]) ? data[channelName] : [];
        const keyed = track.length > 0;
        const onFrame = keyed && track.some(k => Math.abs(k.frame - frame) <= 0.001);
        elements.forEach(el => {
          if (keyed) {
            el.dataset.keyed = "true";
          } else {
            delete el.dataset.keyed;
          }
          if (onFrame) {
            el.dataset.active = "true";
          } else {
            delete el.dataset.active;
          }
        });
      });
    }

    function insertKeyAtPlayhead({ selectNew = true } = {}) {
      const part = partSel.value;
      const ch = chSel.value;
      const frame = Math.round(playheadFrame);
      const cur = currentJointValue(part, ch);
      if (!cur) return null;
      const key = AnimationStore.addKey(part, ch, frame, cur, { ease: easeSel?.value || "linear", tolerance: 0.5 });
      if (selectNew) {
        selectedKeys.clear();
        if (key) selectedKeys.add(key);
      }
      setFrame(frame, { snap: true });
      drawTimeline();
      return key;
    }

    function deleteKeys() {
      let removed = false;
      if (selectedKeys.size) {
        const targets = Array.from(selectedKeys);
        targets.forEach(key => {
          const meta = keyMeta.get(key);
          if (!meta) return;
          if (AnimationStore.removeKey(meta.part, meta.channel, key.frame, { tolerance: 0.5 })) {
            removed = true;
            selectedKeys.delete(key);
          }
        });
      } else {
        const part = partSel.value;
        const ch = chSel.value;
        const frame = Math.round(playheadFrame);
        if (AnimationStore.removeKey(part, ch, frame, { tolerance: 0.5 })) {
          removed = true;
        }
      }
      if (removed) {
        drawTimeline();
      }
      return removed;
    }

    function gatherClipboardPayload() {
      if (!selectedKeys.size) return null;
      const keys = Array.from(selectedKeys).filter(key => keyMeta.has(key));
      if (!keys.length) return null;
      const baseFrame = keys.reduce((min, key) => Math.min(min, key.frame), keys[0].frame);
      return {
        baseFrame,
        keys: keys.map(key => {
          const meta = keyMeta.get(key);
          return {
            part: meta.part,
            channel: meta.channel,
            offset: key.frame - baseFrame,
            value: deepClone(key.value),
            ease: key.ease || "linear"
          };
        })
      };
    }

    function copySelectionToClipboard() {
      const payload = gatherClipboardPayload();
      if (!payload) return false;
      keyClipboard = payload;
      return true;
    }

    function pasteClipboard(clipboard = keyClipboard) {
      if (!clipboard || !Array.isArray(clipboard.keys) || !clipboard.keys.length) return false;
      const targetFrame = Math.round(playheadFrame);
      const newKeys = [];
      clipboard.keys.forEach(entry => {
        if (!entry) return;
        const frame = targetFrame + (Number(entry.offset) || 0);
        const value = deepClone(entry.value);
        const key = AnimationStore.addKey(entry.part, entry.channel, frame, value, { ease: entry.ease || "linear", tolerance: 0.5 });
        if (key) newKeys.push(key);
      });
      if (!newKeys.length) return false;
      selectedKeys.clear();
      newKeys.forEach(key => selectedKeys.add(key));
      setFrame(targetFrame, { snap: true });
      drawTimeline();
      return true;
    }

    function duplicateSelection() {
      const payload = gatherClipboardPayload();
      if (!payload) return false;
      keyClipboard = payload;
      return pasteClipboard(payload);
    }

    if (timelineKeyHandler) {
      window.removeEventListener("keydown", timelineKeyHandler);
      timelineKeyHandler = null;
    }

    const isTypingTarget = el => {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const rigScreenVisible = () => {
      const screen = document.getElementById("screen--rig");
      return !screen || screen.classList.contains("visible");
    };

    const handleTimelineKeydown = e => {
      if (!rigScreenVisible()) return;
      if (isTypingTarget(document.activeElement)) return;
      const key = e.key;
      if ((key === "i" || key === "I") && !e.ctrlKey && !e.metaKey) {
        if (e.altKey) {
          e.preventDefault();
          deleteKeys();
        } else {
          e.preventDefault();
          insertKeyAtPlayhead();
        }
        return;
      }
      if ((key === "Delete" || e.code === "Delete") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        deleteKeys();
        return;
      }
      if ((key === "c" || key === "C") && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        copySelectionToClipboard();
        return;
      }
      if ((key === "v" || key === "V") && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if ((key === "d" || key === "D") && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        duplicateSelection();
      }
    };

    timelineKeyHandler = handleTimelineKeydown;
    window.addEventListener("keydown", timelineKeyHandler);

    function currentTrackKeys(){
      return trackOf(partSel.value, chSel.value);
    }

    function getOverlayRect(){
      return overlayEl.getBoundingClientRect();
    }

    function frameFromClientX(x){
      const rect = getOverlayRect();
      if (rect.width <= 0){
        const range = currentRange();
        return range.start;
      }
      const pct = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
      const view = getTimelineViewRange();
      const total = Math.max(1e-6, view.end - view.start);
      const frame = view.start + pct * total;
      const range = currentRange();
      return Math.min(range.end, Math.max(range.start, frame));
    }

    function positionPlayhead(frame){
      const view = getTimelineViewRange();
      const total = Math.max(1e-6, view.end - view.start);
      const pct = Math.min(1, Math.max(0, (frame - view.start) / total));
      playheadLine.style.left = `${pct * 100}%`;
      const overlayLeft = overlayEl.offsetLeft;
      const overlayWidth = overlayEl.clientWidth || 1;
      playheadHandle.style.left = `${overlayLeft + overlayWidth * pct}px`;
    }

    function updateTimeReadout(){
      const displayFrame = Math.round(playheadFrame);
      const seconds = frameToSeconds(playheadFrame);
      timeOut.textContent = `F${displayFrame} (${seconds.toFixed(3)}s)`;
    }

    function ensurePlayheadVisible(padding = 0.08) {
      const view = getTimelineViewRange();
      const span = Math.max(1, view.end - view.start);
      const pad = Math.max(1, span * padding);
      let updated = false;
      const prevStart = view.start;
      const prevEnd = view.end;
      let newStart = view.start;
      if (playheadFrame < view.start + pad) {
        newStart = playheadFrame - pad;
        updated = true;
      } else if (playheadFrame > view.end - pad) {
        newStart = playheadFrame + pad - span;
        updated = true;
      }
      if (updated) {
        const next = setTimelineViewRange(newStart, newStart + span);
        return Math.abs(next.start - prevStart) > 1e-3 || Math.abs(next.end - prevEnd) > 1e-3;
      }
      return false;
    }

    function updateKeySelection(){
      keyElements.forEach((el, key)=>{
        el.classList.toggle("selected", selectedKeys.has(key));
      });
    }

    function updateActiveRowHighlight(){
      const activeJoint = partSel.value;
      const activeChannel = chSel.value;
      rowElements.forEach((row, key)=>{
        const parts = key.split("|");
        let isActive = false;
        if (parts[0] === "channel"){
          isActive = parts[1] === activeJoint && parts[2] === activeChannel;
        } else if (parts[0] === "joint"){
          isActive = parts[1] === activeJoint;
        }
        row.classList.toggle("active", isActive);
      });
    }

    function syncRangeUI(){
      const range = currentRange();
      const fps = currentFps();
      const frames = Math.max(1, range.end - range.start);
      timeSlider.min = String(range.start);
      timeSlider.max = String(range.end);
      timeSlider.step = "1";
      lenEl.value = (frames / fps).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
      fpsEl.value = String(fps);
      rangeStartEl.value = String(range.start);
      rangeEndEl.value = String(range.end);
      setFrame(playheadFrame, { snap: true });
    }

    function updateRuler(){
      const view = getTimelineViewRange();
      const total = Math.max(1e-6, view.end - view.start);
      const width = overlayEl.clientWidth || 1;
      const targetPx = 70;
      let framesPerTick = Math.max(1e-6, total / Math.max(1, width / targetPx));
      const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, framesPerTick))));
      const norm = framesPerTick / pow;
      let step;
      if (norm <= 1) step = 1;
      else if (norm <= 2) step = 2;
      else if (norm <= 5) step = 5;
      else step = 10;
      framesPerTick = Math.max(1, Math.round(step * pow));
      rulerEl.innerHTML = "";
      const startTick = Math.floor(view.start / framesPerTick) * framesPerTick;
      for (let f = startTick; f <= view.end + framesPerTick; f += framesPerTick){
        const pct = ((f - view.start) / total) * 100;
        if (pct < -5 || pct > 105) continue;
        const tick = document.createElement("div");
        tick.className = "tick";
        tick.style.left = `${Math.max(0, Math.min(100, pct))}%`;
        rulerEl.appendChild(tick);
        const label = document.createElement("div");
        label.className = "tick-label";
        label.textContent = `F${Math.round(f)}`;
        label.style.left = `${Math.max(0, Math.min(100, pct))}%`;
        rulerEl.appendChild(label);
      }
    }

    function setFrame(frame, opts = {}){
      const { snap = true, fromAnimation = false } = opts;
      const range = currentRange();
      const clamped = Math.min(range.end, Math.max(range.start, frame));
      playheadFrame = fromAnimation ? clamped : (snap ? Math.round(clamped) : clamped);
      const displayFrame = Math.round(playheadFrame);
      timeSlider.value = String(displayFrame);
      let viewChanged = false;
      if (!fromAnimation) {
        viewChanged = ensurePlayheadVisible();
      }
      if (viewChanged) {
        drawTimeline();
      } else {
        positionPlayhead(playheadFrame);
      }
      updateTimeReadout();
      updateIndicatorStates();
      if (!fromAnimation) {
        applyPoseForFrame(playheadFrame);
      } else {
        syncNodesFromQuaternion();
        updateToolbar();
      }
    }

    function clearKeySelection(){
      if (!selectedKeys.size) return;
      selectedKeys.clear();
      updateKeySelection();
    }

    function setActiveTrackInternal(joint, channel){
      if (joint && partSel.value !== joint){
        partSel.value = joint;
      }
      if (channel && chSel.value !== channel){
        chSel.value = channel;
      }
      updateActiveRowHighlight();
    }

    function updateSelectionFromRect(rect, additive){
      keyElements.forEach((node, key)=>{
        const bounds = node.getBoundingClientRect();
        const intersects = bounds.right >= rect.left && bounds.left <= rect.right && bounds.bottom >= rect.top && bounds.top <= rect.bottom;
        if (intersects){
          selectedKeys.add(key);
        } else if (!additive){
          selectedKeys.delete(key);
        }
      });
      updateKeySelection();
    }

    function drawTimeline(){
      updateRuler();
      selectionBox.style.display = "none";
      rowsEl.innerHTML = "";
      keyElements.clear();
      rowElements.clear();
      indicatorRegistry.clear();
      const animData = ensureAnimation();
      const jointsData = animData.joints || {};
      const filterMode = filterSel.value || "animated";
      const jointSet = new Set();
      const addJoint = j=>{ if (j) jointSet.add(j); };
      if (filterMode === "selected"){
        addJoint(selectedKey);
        addJoint(partSel.value);
      } else {
        Object.keys(jointsData).forEach(joint=>{
          const data = jointsData[joint];
          if (!data) return;
          const hasKeys = CHANNELS.some(ch=>Array.isArray(data[ch.name]) && data[ch.name].length);
          if (hasKeys) addJoint(joint);
        });
        if (!jointSet.size) addJoint(partSel.value);
      }
      if (!jointSet.size && PART_KEYS.length){
        addJoint(PART_KEYS[0]);
      }
      const jointNames = Array.from(jointSet).filter(Boolean).sort((a,b)=>a.localeCompare(b));

      keyMeta.clear();
      const viewRange = getTimelineViewRange();
      const total = Math.max(1e-6, viewRange.end - viewRange.start);
      jointNames.forEach(joint=>{
        const jointData = jointsData[joint] || {};
        CHANNELS.forEach(ch=>{
          const arr = jointData[ch.name];
          if (!Array.isArray(arr)) return;
          arr.forEach(key=>{
            keyMeta.set(key, { part: joint, channel: ch.short });
          });
        });
      });

      Array.from(selectedKeys).forEach(key=>{
        if (!keyMeta.has(key)) selectedKeys.delete(key);
      });

      const range = currentRange();

      if (!jointNames.length){
        const empty = document.createElement("div");
        empty.className = "dope-empty";
        empty.textContent = "No joints available.";
        rowsEl.appendChild(empty);
        updateKeySelection();
        updateActiveRowHighlight();
        updateIndicatorStates();
        positionPlayhead(playheadFrame);
        return;
      }

      jointNames.forEach(joint=>{
        const jointRow = document.createElement("div");
        jointRow.className = "dope-row joint-row";
        const label = document.createElement("div");
        label.className = "dope-label joint";
        const caret = document.createElement("button");
        caret.type = "button";
        caret.className = "dope-caret";
        const expanded = expandedJoints.get(joint) ?? false;
        caret.textContent = expanded ? "▾" : "▸";
        caret.addEventListener("click", e=>{
          e.preventDefault();
          e.stopPropagation();
          expandedJoints.set(joint, !expanded);
          drawTimeline();
        });
        const nameSpan = document.createElement("span");
        nameSpan.classList.add("label-text");
        nameSpan.textContent = joint;
        const indicatorWrap = document.createElement("div");
        indicatorWrap.className = "channel-indicators";
        CHANNELS.forEach(ch => {
          const indicator = document.createElement("span");
          indicator.className = `channel-indicator channel-${ch.short}`;
          indicatorWrap.appendChild(indicator);
          registerIndicator(joint, ch.short, indicator);
        });
        label.append(caret, nameSpan, indicatorWrap);
        label.addEventListener("click", e=>{
          e.preventDefault();
          e.stopPropagation();
          if (partSel.value !== joint){
            partSel.value = joint;
            drawTimeline();
          } else {
            updateActiveRowHighlight();
          }
        });
        const track = document.createElement("div");
        track.className = "dope-track joint";
        const jointData = jointsData[joint] || {};
        const hasKeys = CHANNELS.some(ch=>Array.isArray(jointData[ch.name]) && jointData[ch.name].length);
        if (!hasKeys){
          const msg = document.createElement("span");
          msg.className = "empty-msg";
          msg.textContent = "No keys";
          track.appendChild(msg);
        }
        jointRow.append(label, track);
        rowsEl.appendChild(jointRow);
        rowElements.set(`joint|${joint}`, jointRow);

        if (!expanded) return;

        CHANNELS.forEach(ch=>{
          const arr = jointData[ch.name];
          if (!Array.isArray(arr) || !arr.length) return;
          const chRow = document.createElement("div");
          chRow.className = `dope-row channel-row channel-${ch.short}`;
          chRow.dataset.part = joint;
          chRow.dataset.channel = ch.short;
          const chLabel = document.createElement("div");
          chLabel.className = "dope-label channel";
          const chIndicator = document.createElement("span");
          chIndicator.className = `channel-indicator channel-${ch.short}`;
          registerIndicator(joint, ch.short, chIndicator);
          const chText = document.createElement("span");
          chText.className = "label-text";
          chText.textContent = ch.label;
          chLabel.append(chIndicator, chText);
          chLabel.addEventListener("click", e=>{
            e.preventDefault();
            e.stopPropagation();
            setActiveTrackInternal(joint, ch.short);
            if (filterSel.value === "selected") drawTimeline();
          });
          const chTrack = document.createElement("div");
          chTrack.className = `dope-track channel channel-${ch.short}`;
          arr.forEach(key=>{
            const el=document.createElement("div");
            el.className=`timeline-key channel-${ch.short}`;
            if (isSteppedMode()) {
              el.classList.add("stepped");
            }
            const pct = ((key.frame - viewRange.start) / total) * 100;
            el.style.left = `${Math.max(0, Math.min(100, pct))}%`;
            const offscreen = key.frame < viewRange.start - 1e-3 || key.frame > viewRange.end + 1e-3;
            el.style.display = offscreen ? "none" : "";
            const modeSuffix = isSteppedMode() ? " — Hold" : "";
            el.title = `Frame ${key.frame.toFixed(2)} (${frameToSeconds(key.frame).toFixed(3)}s${modeSuffix})`;
            el.addEventListener("pointerdown", e=>{
              e.preventDefault();
              e.stopPropagation();
              const additive = e.shiftKey || e.ctrlKey || e.metaKey;
              if (!additive && !selectedKeys.has(key)){
                selectedKeys.clear();
              }
              if (e.ctrlKey || e.metaKey){
                if (selectedKeys.has(key)){
                  selectedKeys.delete(key);
                } else {
                  selectedKeys.add(key);
                }
              } else {
                selectedKeys.add(key);
              }
              setActiveTrackInternal(joint, ch.short);
              updateKeySelection();
              selectionBox.style.display = "none";
              boxSelect = null;
              if (!selectedKeys.has(key)) return;
              const dragKeys = selectedKeys.size ? Array.from(selectedKeys) : [key];
              keyDrag = {
                pointerId: e.pointerId,
                anchor: key,
                original: new Map(dragKeys.map(k=>[k, k.frame])),
                lastDelta: 0
              };
              keyElements.forEach((node, k)=>{ if (selectedKeys.has(k)) node.classList.add("dragging"); });
              el.setPointerCapture(e.pointerId);
              setFrame(key.frame, { snap: true });
            });
            el.addEventListener("pointermove", e=>{
              if (!keyDrag || keyDrag.pointerId !== e.pointerId) return;
              const desired = Math.round(frameFromClientX(e.clientX));
              const anchorStart = keyDrag.original.get(keyDrag.anchor) ?? keyDrag.anchor.frame;
              let delta = desired - Math.round(anchorStart);
              const originals = Array.from(keyDrag.original.values());
              const rangeInner = currentRange();
              const minOriginal = Math.min(...originals);
              const maxOriginal = Math.max(...originals);
              const minDelta = rangeInner.start - minOriginal;
              const maxDelta = rangeInner.end - maxOriginal;
              delta = Math.max(minDelta, Math.min(maxDelta, delta));
              if (delta === keyDrag.lastDelta) return;
              keyDrag.lastDelta = delta;
              keyDrag.original.forEach((startFrame, k)=>{
                const meta = keyMeta.get(k);
                if (!meta) return;
                const target = startFrame + delta;
                const moved = AnimationStore.moveKey(meta.part, meta.channel, k.frame, target, { tolerance: 0.25 });
                if (moved){
                  const pctMoved = ((moved.frame - rangeInner.start) / Math.max(1, rangeInner.end - rangeInner.start)) * 100;
                  const node = keyElements.get(k);
                  if (node){
                    const clamped = Math.max(0, Math.min(100, pctMoved));
                    node.style.left = `${clamped}%`;
                    const suffix = isSteppedMode() ? " — Hold" : "";
                    node.title = `Frame ${moved.frame.toFixed(2)} (${frameToSeconds(moved.frame).toFixed(3)}s${suffix})`;
                  }
                }
              });
              setFrame(anchorStart + delta, { snap: true });
            });
            const finishDrag = e=>{
              if (!keyDrag || keyDrag.pointerId !== e.pointerId) return;
              el.releasePointerCapture(e.pointerId);
              keyDrag = null;
              keyElements.forEach(node=>node.classList.remove("dragging"));
              drawTimeline();
            };
            el.addEventListener("pointerup", finishDrag);
            el.addEventListener("pointercancel", finishDrag);
            el.addEventListener("click", e=>{
              e.stopPropagation();
              setFrame(key.frame, { snap: true });
              setActiveTrackInternal(joint, ch.short);
            });
            chTrack.appendChild(el);
            keyElements.set(key, el);
          });
          chRow.append(chLabel, chTrack);
          rowsEl.appendChild(chRow);
          rowElements.set(`channel|${joint}|${ch.short}`, chRow);
        });
      });

      updateKeySelection();
      updateActiveRowHighlight();
      updateIndicatorStates();
      positionPlayhead(playheadFrame);
    }

    timeSlider.oninput = ()=> setFrame(Number(timeSlider.value)||currentRange().start, { snap: true });

    btnPlay.onclick = togglePlay;
    btnStop.onclick = ()=>{
      anim.playing=false;
      btnPlay.textContent="▶";
      const binding = ensureAnimationGroup();
      if (binding?.group) binding.group.pause();
      const startFrame = binding?.range?.start ?? currentRange().start;
      setFrame(startFrame, { snap: true });
    };
    btnToStart.onclick = ()=>{
      anim.playing=false;
      btnPlay.textContent="▶";
      const binding = ensureAnimationGroup();
      if (binding?.group) binding.group.pause();
      const start = binding?.range?.start ?? currentRange().start;
      setFrame(start, { snap: true });
    };
    btnToEnd.onclick = ()=>{
      anim.playing=false;
      btnPlay.textContent="▶";
      const binding = ensureAnimationGroup();
      if (binding?.group) binding.group.pause();
      const end = binding?.range?.end ?? currentRange().end;
      setFrame(end, { snap: true });
    };

    function stepToNeighbor(dir){
      const keys = currentTrackKeys().slice().sort((a,b)=>a.frame-b.frame);
      if (!keys.length) return;
      const current = Math.round(playheadFrame);
      let target = null;
      if (dir < 0){
        for (let i = keys.length - 1; i >= 0; i--){
          if (keys[i].frame < current - 1e-3){ target = keys[i]; break; }
        }
        if (!target) target = keys[0];
      } else {
        for (let i = 0; i < keys.length; i++){
          if (keys[i].frame > current + 1e-3){ target = keys[i]; break; }
        }
        if (!target) target = keys[keys.length-1];
      }
      if (target){
        selectedKeys.clear();
        selectedKeys.add(target);
        setFrame(target.frame, { snap: true });
        drawTimeline();
      }
    }

    btnPrev.onclick = ()=>{
      anim.playing=false;
      btnPlay.textContent="▶";
      const binding = ensureAnimationGroup();
      if (binding?.group) binding.group.pause();
      stepToNeighbor(-1);
    };
    btnNext.onclick = ()=>{
      anim.playing=false;
      btnPlay.textContent="▶";
      const binding = ensureAnimationGroup();
      if (binding?.group) binding.group.pause();
      stepToNeighbor(1);
    };

    lenEl.addEventListener("change", ()=>{
      const animData = ensureAnimation();
      const fps = currentFps();
      const seconds = Math.max(0.25, Math.min(60, Number(lenEl.value) || 2));
      const frames = Math.max(1, Math.round(seconds * fps));
      const range = currentRange();
      range.end = range.start + frames;
      syncRangeUI();
      drawTimeline();
      if (AnimationStore.touch) AnimationStore.touch(animData?.name);
    });

    fpsEl.addEventListener("change", ()=>{
      const animData = ensureAnimation();
      const fps = Math.max(6, Math.min(120, Number(fpsEl.value) || 30));
      animData.fps = fps;
      syncRangeUI();
      drawTimeline();
      if (AnimationStore.touch) AnimationStore.touch(animData?.name);
    });

    rangeStartEl.addEventListener("change", ()=>{
      const animData = ensureAnimation();
      const range = currentRange();
      let start = Math.floor(Number(rangeStartEl.value) || 0);
      start = Math.max(0, start);
      if (start >= range.end){
        range.end = start + 1;
      }
      range.start = start;
      syncRangeUI();
      drawTimeline();
      if (AnimationStore.touch) AnimationStore.touch(animData?.name);
    });

    rangeEndEl.addEventListener("change", ()=>{
      const animData = ensureAnimation();
      const range = currentRange();
      let end = Math.floor(Number(rangeEndEl.value) || (range.start + 1));
      end = Math.max(range.start + 1, end);
      range.end = end;
      syncRangeUI();
      drawTimeline();
      if (AnimationStore.touch) AnimationStore.touch(animData?.name);
    });

    bodyEl.addEventListener("pointerdown", e=>{
      const overlayRect = getOverlayRect();
      const inTimeline = overlayRect.width > 0 && e.clientX >= overlayRect.left && e.clientX <= overlayRect.right && e.clientY >= overlayRect.top && e.clientY <= overlayRect.bottom;
      if (!inTimeline) return;
      if (e.target === playheadHandle || e.target.closest(".timeline-key")) return;
      const wantsPan = e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey);
      if (wantsPan){
        const view = getTimelineViewRange();
        panState = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startView: { start: view.start, end: view.end },
          lastStart: view.start,
          lastEnd: view.end
        };
        bodyEl.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      if (e.target.closest(".dope-label")) return;
      const channelRow = e.target.closest(".dope-row.channel-row");
      if (channelRow){
        setActiveTrackInternal(channelRow.dataset.part, channelRow.dataset.channel);
      }
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!additive){
        clearKeySelection();
      }
      setFrame(Math.round(frameFromClientX(e.clientX)), { snap: true });
      selectionBox.style.display = "none";
      boxSelect = {
        pointerId: e.pointerId,
        additive,
        startX: e.clientX,
        startY: e.clientY,
        active: false
      };
      bodyEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    bodyEl.addEventListener("pointermove", e=>{
      if (panState && panState.pointerId === e.pointerId){
        const overlayRect = getOverlayRect();
        if (overlayRect.width > 0){
          const span = panState.startView.end - panState.startView.start;
          if (span > 0){
            const deltaPx = e.clientX - panState.startX;
            const deltaFrames = -(deltaPx / overlayRect.width) * span;
            const updated = setTimelineViewRange(panState.startView.start + deltaFrames, panState.startView.end + deltaFrames);
            if (Math.abs(updated.start - panState.lastStart) > 1e-3 || Math.abs(updated.end - panState.lastEnd) > 1e-3){
              panState.lastStart = updated.start;
              panState.lastEnd = updated.end;
              drawTimeline();
            }
          }
        }
        e.preventDefault();
        return;
      }
      if (keyDrag && keyDrag.pointerId === e.pointerId) return;
      if (!boxSelect || boxSelect.pointerId !== e.pointerId) return;
      const overlayRect = getOverlayRect();
      if (overlayRect.width <= 0){
        selectionBox.style.display = "none";
        return;
      }
      const dx = e.clientX - boxSelect.startX;
      const dy = e.clientY - boxSelect.startY;
      if (!boxSelect.active && Math.hypot(dx, dy) > 4){
        boxSelect.active = true;
        if (!boxSelect.additive){
          selectedKeys.clear();
        }
      }
      if (!boxSelect.active) return;
      const left = Math.max(overlayRect.left, Math.min(boxSelect.startX, e.clientX));
      const right = Math.min(overlayRect.right, Math.max(boxSelect.startX, e.clientX));
      const top = Math.max(overlayRect.top, Math.min(boxSelect.startY, e.clientY));
      const bottom = Math.min(overlayRect.bottom, Math.max(boxSelect.startY, e.clientY));
      selectionBox.style.display = "block";
      selectionBox.style.left = `${left - overlayRect.left}px`;
      selectionBox.style.top = `${top - overlayRect.top}px`;
      selectionBox.style.width = `${Math.max(0, right - left)}px`;
      selectionBox.style.height = `${Math.max(0, bottom - top)}px`;
      updateSelectionFromRect({ left, right, top, bottom }, boxSelect.additive);
      e.preventDefault();
    });

    const finishBoxSelect = e=>{
      if (!boxSelect || boxSelect.pointerId !== e.pointerId) return;
      bodyEl.releasePointerCapture(e.pointerId);
      boxSelect = null;
      selectionBox.style.display = "none";
    };
    bodyEl.addEventListener("pointerup", finishBoxSelect);
    bodyEl.addEventListener("pointercancel", finishBoxSelect);

    const finishPan = e=>{
      if (!panState || panState.pointerId !== e.pointerId) return;
      bodyEl.releasePointerCapture(e.pointerId);
      panState = null;
    };
    bodyEl.addEventListener("pointerup", finishPan);
    bodyEl.addEventListener("pointercancel", finishPan);

    bodyEl.addEventListener("contextmenu", e=>{
      if (e.target.closest(".dope-body")) {
        e.preventDefault();
      }
    });

    bodyEl.addEventListener("wheel", e=>{
      if (e.ctrlKey) return;
      const overlayRect = getOverlayRect();
      if (overlayRect.width <= 0) return;
      if (e.clientX < overlayRect.left || e.clientX > overlayRect.right || e.clientY < overlayRect.top || e.clientY > overlayRect.bottom) return;
      const prev = getTimelineViewRange();
      const prevStart = prev.start;
      const prevEnd = prev.end;
      let start = prevStart;
      let end = prevEnd;
      const span = Math.max(1e-6, prevEnd - prevStart);
      const pct = Math.min(1, Math.max(0, (e.clientX - overlayRect.left) / overlayRect.width));
      let handled = false;
      if (Math.abs(e.deltaY) > 0.01){
        handled = true;
        const focus = start + pct * span;
        const range = currentRange();
        const fullSpan = Math.max(1, range.end - range.start);
        const minSpan = Math.min(fullSpan, Math.max(1, TIMELINE_MIN_VIEW_SPAN));
        let newSpan = span * Math.exp(e.deltaY * 0.0015);
        newSpan = Math.max(minSpan, Math.min(fullSpan, newSpan));
        start = focus - pct * newSpan;
        end = start + newSpan;
      }
      if (Math.abs(e.deltaX) > 0.01){
        handled = true;
        const panFrames = (e.deltaX / overlayRect.width) * span;
        start += panFrames;
        end += panFrames;
      }
      if (!handled) return;
      e.preventDefault();
      const updated = setTimelineViewRange(start, end);
      if (Math.abs(updated.start - prevStart) > 1e-3 || Math.abs(updated.end - prevEnd) > 1e-3){
        drawTimeline();
      }
    }, { passive: false });

    playheadHandle.addEventListener("pointerdown", e=>{
      e.preventDefault();
      playheadDrag = { pointerId:e.pointerId };
      playheadHandle.setPointerCapture(e.pointerId);
    });
    playheadHandle.addEventListener("pointermove", e=>{
      if (!playheadDrag || playheadDrag.pointerId !== e.pointerId) return;
      const frame = frameFromClientX(e.clientX);
      setFrame(frame, { snap: true });
    });
    const finishPlayheadDrag = e=>{
      if (!playheadDrag || playheadDrag.pointerId !== e.pointerId) return;
      playheadHandle.releasePointerCapture(e.pointerId);
      playheadDrag = null;
    };
    playheadHandle.addEventListener("pointerup", finishPlayheadDrag);
    playheadHandle.addEventListener("pointercancel", finishPlayheadDrag);

    addBtn.onclick = () => { insertKeyAtPlayhead(); };

    delBtn.onclick = () => { deleteKeys(); };

    partSel.addEventListener("change", ()=>{ selectedKeys.clear(); drawTimeline(); });
    chSel.addEventListener("change", ()=>{ selectedKeys.clear(); drawTimeline(); });
    filterSel.addEventListener("change", ()=>{ selectedKeys.clear(); drawTimeline(); });

    window.addEventListener("resize", drawTimeline);

    syncRangeUI();
    setFrame(playheadFrame, { snap: true });
    drawTimeline();
    refreshDopeSheet = drawTimeline;
  }

    function lerp(a,b,t){ return a + (b-a)*t; }
    function ease(t,e){ if(e==="easeIn")return t*t; if(e==="easeOut")return 1-(1-t)*(1-t); if(e==="easeInOut")return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; return t; }

    function sampleChannel(part,ch,t){
      const keys=trackOf(part,ch);
      if(!keys.length) return null;
      const frame = secondsToFrame(t);
      if(frame<=keys[0].frame) return keys[0].value;
      if(frame>=keys[keys.length-1].frame) return keys[keys.length-1].value;
      let a=0,b=1;
      for(let i=1;i<keys.length;i++){ if(frame<=keys[i].frame){ b=i; a=i-1; break; } }
      const ka=keys[a], kb=keys[b];
      const u=(frame-ka.frame)/Math.max(1e-6,(kb.frame-ka.frame));
      if (isSteppedMode()) return ka.value;
      const w=ease(u,kb.ease||"linear");
      return { x:lerp(ka.value.x,kb.value.x,w), y:lerp(ka.value.y,kb.value.y,w), z:lerp(ka.value.z,kb.value.z,w) };
    }

    function applyAtTime(t){
      PART_KEYS.forEach(part=>{
        const p=nodes[part]; if(!p) return;
        const P=sampleChannel(part,"pos",t); if(P) p.position.set(P.x,P.y,P.z);
        const R=sampleChannel(part,"rot",t); if(R) setNodeEuler(p, R);
        const S=sampleChannel(part,"scl",t); if(S) p.scaling?.set?.(S.x,S.y,S.z);
      });
    }

    function togglePlay(){
      const binding = ensureAnimationGroup();
      anim.playing=!anim.playing;
      btnPlay.textContent = anim.playing ? "⏸" : "▶";
      if (!binding || !binding.group){
        if (anim.playing) {
          anim.playing = false;
          btnPlay.textContent = "▶";
        }
        return;
      }
      if (anim.playing){
        binding.group.stop();
        binding.group.start(anim.loop !== false, 1.0, binding.range.start, binding.range.end);
        binding.group.goToFrame(playheadFrame);
      } else {
        binding.group.pause();
      }
    }

    scene.onBeforeRenderObservable.add(()=>{
      if(!anim.playing) return;
      const binding = ensureAnimationGroup();
      if (binding && binding.group){
        const animatable = binding.group.animatables?.[0];
        const current = animatable ? (typeof animatable.masterFrame === "number" ? animatable.masterFrame : animatable.currentFrame) : null;
        if (typeof current === "number"){
          if (!anim.loop && current >= binding.range.end - 1e-3){
            anim.playing = false;
            btnPlay.textContent = "▶";
            binding.group.pause();
            setFrame(binding.range.end, { snap: true, fromAnimation: true });
            return;
          }
          setFrame(current, { snap: false, fromAnimation: true });
        }
        return;
      }
      const dt = engine.getDeltaTime()/1000;
      animateTick(dt);
      syncAllNodeQuaternions();
    });
  }

  function boot(){
    if (booted){ refresh(); return; }
    booted = true;

    ensureAnimationLibraryHydrated();
    if (!unloadAnimationSaveHandler && typeof window !== "undefined") {
      unloadAnimationSaveHandler = () => {
        try { flushAnimationAutosave({ force: true }); } catch (err) {}
      };
      window.addEventListener("beforeunload", unloadAnimationSaveHandler);
    }
    if (!visibilityAnimationSaveHandler && typeof document !== "undefined") {
      visibilityAnimationSaveHandler = () => {
        if (document.visibilityState === "hidden") {
          try { flushAnimationAutosave(); } catch (err) {}
        }
      };
      document.addEventListener("visibilitychange", visibilityAnimationSaveHandler);
    }

    const hx = typeof window !== "undefined" ? window.HXH : null;
    let session = null;
    if (hx && typeof hx.consumeRigEditorSession === "function") {
      try { session = hx.consumeRigEditorSession(); }
      catch (err) { session = null; }
    }
    sessionContext = session;

    let initialParams = null;
    let inferredType = null;
    let rawSessionParams = null;
    let rawLegacyRig = null;
    if (session && typeof session === "object") {
      if (session.params && typeof session.params === "object") {
        inferredType = typeof session.params.rigType === "string" ? session.params.rigType : (typeof session.rigType === "string" ? session.rigType : null);
        rawSessionParams = deepClone(session.params);
      } else if (session.rig && typeof session.rig === "object") {
        inferredType = typeof session.rig.rigType === "string" ? session.rig.rigType : (typeof session.rigType === "string" ? session.rigType : null);
        rawLegacyRig = session.rig;
      }
    }

    if (inferredType && rigTypeMap.has(inferredType) && inferredType !== rigTypeId) {
      rigTypeId = inferredType;
      activeRigDef = rigTypeMap.get(inferredType) || activeRigDef;
      PART_KEYS = activeRigDef ? activeRigDef.partKeys.slice() : PART_KEYS;
      if (window.RigDefinitions) {
        window.RigDefinitions.PART_KEYS = PART_KEYS.slice();
      }
    }

    let storedParams = null;
    if (!initialParams) {
      try { storedParams = JSON.parse(localStorage.getItem("hxh.rig.params")||"null"); }
      catch { storedParams = null; }
      if (storedParams && typeof storedParams === "object") {
        const storedType = typeof storedParams.rigType === "string" ? storedParams.rigType : null;
        if (storedType && rigTypeMap.has(storedType) && !inferredType) {
          rigTypeId = storedType;
          activeRigDef = rigTypeMap.get(storedType) || activeRigDef;
          PART_KEYS = activeRigDef ? activeRigDef.partKeys.slice() : PART_KEYS;
          if (window.RigDefinitions) {
            window.RigDefinitions.PART_KEYS = PART_KEYS.slice();
          }
        }
      }
    }

    const baseDefinition = activeRigDef;
    if (!initialParams) {
      if (rawSessionParams) {
        initialParams = ensureRigParamsStructure(rawSessionParams, PART_KEYS, baseDefinition);
      } else if (rawLegacyRig) {
        initialParams = legacyRigToParams(rawLegacyRig, PART_KEYS, baseDefinition);
      }
    }
    if (initialParams) {
      params = ensureRigParamsStructure(initialParams, PART_KEYS, baseDefinition);
    } else {
      params = ensureRigParamsStructure(storedParams ? deepClone(storedParams) : createDefaultParamsForType(rigTypeId), PART_KEYS, baseDefinition);
    }
    if (!params.color) {
      params.color = getRigColor();
    }

    const canvas = document.getElementById("rig-canvas");
    engine = new BABYLON.Engine(canvas, true, { stencil:true });
    scene  = new BABYLON.Scene(engine);
    scene.clearColor   = new BABYLON.Color4(0.06,0.08,0.12,1);
    scene.ambientColor = new BABYLON.Color3(0.35,0.35,0.42);

    // Arc camera: left = orbit, right = pan, wheel = zoom (smooth)
    camera = new BABYLON.ArcRotateCamera("cam", Math.PI/2, 1.1, 8, new BABYLON.Vector3(0,1.1,0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 30;
    camera.wheelDeltaPercentage = 0.015;
    camera.pinchDeltaPercentage = 0.015;
    camera.useNaturalPinchZoom = true;
    // Ensure pan works across versions
    camera.panningSensibility = 1000;
    const pInput = camera.inputs.attached.pointers;
    if (pInput){
      pInput.buttons=[0];
      pInput.useCtrlForPanning=false;
      pInput.panningMouseButton=2;
      pInput.panningSensibility=1000;
    }
    window.addEventListener("contextmenu",(e)=>{ if (e.target && e.target.id==="rig-canvas") e.preventDefault(); });

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene); hemi.intensity=1.0;
    const sun  = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5,-1,-0.3), scene);
    sun.position = new BABYLON.Vector3(30,60,30); sun.intensity=1.05;

    // grid ground
    try{
      const ground = BABYLON.MeshBuilder.CreateGround("g",{width:30,height:30},scene);
      const grid = new BABYLON.GridMaterial("grid",scene);
      grid.gridRatio=1.5; grid.majorUnitFrequency=5; grid.minorUnitVisibility=0.6;
      grid.color1=new BABYLON.Color3(0.35,0.8,1); grid.color2=new BABYLON.Color3(0.05,0.07,0.1);
      ground.material = grid; ground.isPickable=false;
    }catch{}

    // orientation helpers
    const beacon = BABYLON.MeshBuilder.CreateBox("beacon",{size:0.6},scene);
    const bm = new BABYLON.StandardMaterial("bm",scene); bm.emissiveColor=new BABYLON.Color3(1,0.5,0.2);
    beacon.material=bm; beacon.position=new BABYLON.Vector3(0,1.1,2);
    new BABYLON.AxesViewer(scene,1.5);

    rebuildRig();
    markDecorUnpickable();

    // (Right panel removal) hide panel if present; don't build resizer/panel UI
    const panel = document.querySelector('#screen--rig .rig-panel');
    const layout = document.querySelector('#screen--rig .rig-layout');
    if (panel){ panel.style.display = 'none'; }
    if (layout){ layout.style.setProperty('--panel-w','0px'); }

    buildAnimBar();
    buildAnimEditor();
    setOnionSkinEnabled(onionSkinEnabled, { persist: false });
    // buildResizablePanel(); // disabled to remove right box

    // --- Gizmos ---
    gizmoMgr = new BABYLON.GizmoManager(scene);
    gizmoMgr.usePointerToAttachGizmos = false;
    if (typeof gizmoMgr.clearGizmos === "function"){ gizmoMgr.clearGizmos(); }
    else { gizmoMgr.positionGizmoEnabled=false; gizmoMgr.rotationGizmoEnabled=false; gizmoMgr.scaleGizmoEnabled=false; gizmoMgr.attachToMesh(null); }
    setGizmoMode("select");
    ensureAutoKeyHooks();

    // Toolbar, actions, picking
    buildToolbar();
    wireActionButtons();     // NEW: wire the buttons inside the toolbar
    installPicking();

    // smooth zoom feel
    let targetRadius = camera.radius;
    scene.onBeforeRenderObservable.add(()=>{ targetRadius = BABYLON.Scalar.Clamp(targetRadius, camera.lowerRadiusLimit||1, camera.upperRadiusLimit||100); camera.radius = BABYLON.Scalar.Lerp(camera.radius, targetRadius, 0.18); });
    canvas.addEventListener("wheel", ()=>{ targetRadius = camera.radius; }, {passive:true});

    engine.runRenderLoop(()=>{
      if (animationGroupDirty) ensureAnimationGroup();
      const dt = engine.getDeltaTime()/1000;
      if (anim.playing){
        const binding = animationBinding;
        if (!binding.group){
          animateTick(dt);
          syncAllNodeQuaternions();
        }
      }
      scene.render();
    });
    window.addEventListener("resize", ()=> engine.resize());
  }

  // Helper: what's the current active gizmo mode?
  function activeMode(){ if(gizmoMgr.positionGizmoEnabled)return "move"; if(gizmoMgr.rotationGizmoEnabled)return "rotate"; if(gizmoMgr.scaleGizmoEnabled)return "scale"; return "select"; }

  function selectPart(key){
    selectedKey = key;
    const pivot = nodes[key];
    if (!pivot) return;
    gizmoMgr.attachToMesh(pivot);
    setOutline(meshForPart(key));
    updateToolbar();
    refreshDopeSheet?.();
  }

  function clearSelection(){
    selectedKey = null;
    gizmoMgr.attachToMesh(null);
    setOutline(null);
    updateToolbar();
    refreshDopeSheet?.();
  }

  function setGizmoMode(mode){
    gizmoMgr.positionGizmoEnabled = (mode==="move");
    gizmoMgr.rotationGizmoEnabled = (mode==="rotate");
    gizmoMgr.scaleGizmoEnabled    = (mode==="scale");
    if (mode==="select") clearSelection();
    updateToolbar(mode);
  }

  function currentTRS(){
    if (!selectedKey) return null;
    const p = nodes[selectedKey]; if(!p) return null;
    const pos = p.position.clone();
    const e = getNodeEuler(p);
    const rot = new BABYLON.Vector3(e.x, e.y, e.z);
    const scl = p.scaling?.clone?.()||new BABYLON.Vector3(1,1,1);
    return {pos,rot,scl};
  }

  function persistAutoKeySetting(enabled) {
    try {
      localStorage.setItem(AUTO_KEY_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore persistence errors */
    }
  }

  function updateAutoKeyButtonUI() {
    if (!autoKeyButton) return;
    autoKeyButton.textContent = autoKeyEnabled ? "Auto-Key On" : "Auto-Key Off";
    autoKeyButton.classList.toggle("primary", autoKeyEnabled);
    autoKeyButton.classList.toggle("secondary", !autoKeyEnabled);
    autoKeyButton.setAttribute("aria-pressed", autoKeyEnabled ? "true" : "false");
  }

  function setAutoKeyEnabled(value) {
    autoKeyEnabled = Boolean(value);
    updateAutoKeyButtonUI();
    persistAutoKeySetting(autoKeyEnabled);
  }

  function insertAutoKeyForChannel(part, channel) {
    if (!autoKeyEnabled) return null;
    const value = currentJointValue(part, channel);
    if (!value) return null;
    const frame = Math.round(playheadFrame);
    const ease = easeSelectorRef?.value || "linear";
    const key = AnimationStore.addKey(part, channel, frame, value, { ease, tolerance: 0.5 });
    refreshDopeSheet?.();
    return key;
  }

  function getManagerGizmo(kind) {
    if (!gizmoMgr) return null;
    const key = `${kind}Gizmo`;
    return gizmoMgr.gizmos?.[key] || gizmoMgr[key] || null;
  }

  function ensureAutoKeyHooks() {
    if (!gizmoMgr || autoKeyHooksInstalled) return;
    const register = (gizmo, channel) => {
      if (!gizmo || autoKeyHookedGizmos.has(gizmo)) return false;
      if (!gizmo.onDragStartObservable || !gizmo.onDragEndObservable) return false;
      gizmo.onDragStartObservable.add(() => {
        if (!selectedKey) {
          autoKeyState.snapshot = null;
          autoKeyState.part = null;
          autoKeyState.channel = null;
          return;
        }
        autoKeyState.snapshot = captureNodeSnapshot(selectedKey);
        autoKeyState.part = selectedKey;
        autoKeyState.channel = channel;
      });
      gizmo.onDragEndObservable.add(() => {
        const part = autoKeyState.part;
        const snapshot = autoKeyState.snapshot;
        autoKeyState.snapshot = null;
        autoKeyState.part = null;
        autoKeyState.channel = null;
        if (!part || !snapshot) return;
        const after = captureNodeSnapshot(part);
        if (!autoKeyEnabled || !after) return;
        if (!hasChannelChanged(channel, snapshot, after)) return;
        insertAutoKeyForChannel(part, channel);
      });
      autoKeyHookedGizmos.add(gizmo);
      return true;
    };
    const gizmoSpecs = [
      ["position", "pos"],
      ["rotation", "rot"],
      ["scale", "scl"]
    ];
    for (const [type, channel] of gizmoSpecs) {
      const gizmo = getManagerGizmo(type);
      if (!gizmo || autoKeyHookedGizmos.has(gizmo)) continue;
      register(gizmo, channel);
    }

    const allHooked = gizmoSpecs.every(([type]) => {
      const gizmo = getManagerGizmo(type);
      return gizmo && autoKeyHookedGizmos.has(gizmo);
    });

    autoKeyHooksInstalled = allHooked;
    if (allHooked) {
      if (autoKeyHookObserver && scene) {
        scene.onBeforeRenderObservable.remove(autoKeyHookObserver);
        autoKeyHookObserver = null;
      }
    } else if (scene && !autoKeyHookObserver) {
      autoKeyHookObserver = scene.onBeforeRenderObservable.add(() => {
        ensureAutoKeyHooks();
        if (autoKeyHooksInstalled && autoKeyHookObserver) {
          scene.onBeforeRenderObservable.remove(autoKeyHookObserver);
          autoKeyHookObserver = null;
        }
      });
    }
  }

  // reflect live changes to UI + params
  function updateToolbar(activeModeName){
    const nameEl = document.getElementById("sel-part");
    const posEl  = document.getElementById("sel-pos");
    const rotEl  = document.getElementById("sel-rot");
    const sclEl  = document.getElementById("sel-scl");
    if (nameEl) nameEl.textContent = selectedKey || "—";

    const TRS = currentTRS();
    if (!TRS){
      if (posEl) posEl.textContent = "X 0.00 | Y 0.00 | Z 0.00 mm";
      if (rotEl) rotEl.textContent = "RX 0.0° | RY 0.0° | RZ 0.0°";
      if (sclEl) sclEl.textContent = "SX 1.00 | SY 1.00 | SZ 1.00";
    } else {
      const {pos,rot,scl} = TRS;
      if (posEl) posEl.textContent = `X ${(pos.x*UNIT_POS).toFixed(2)} | Y ${(pos.y*UNIT_POS).toFixed(2)} | Z ${(pos.z*UNIT_POS).toFixed(2)} mm`;
      if (rotEl) rotEl.textContent = `RX ${(BABYLON.Angle.FromRadians(rot.x).degrees()).toFixed(1)}° | RY ${(BABYLON.Angle.FromRadians(rot.y).degrees()).toFixed(1)}° | RZ ${(BABYLON.Angle.FromRadians(rot.z).degrees()).toFixed(1)}°`;
      if (sclEl) sclEl.textContent = `SX ${scl.x.toFixed(2)} | SY ${scl.y.toFixed(2)} | SZ ${scl.z.toFixed(2)}`;
    }

    // toolbar button states
    const ids = [["tb-select","select"],["tb-move","move"],["tb-rotate","rotate"],["tb-scale","scale"]];
    ids.forEach(([id,mode])=>{
      const b=document.getElementById(id); if(!b) return;
      b.classList.toggle("primary", activeModeName===mode);
      b.classList.toggle("secondary", activeModeName!==mode);
    });

    // persist params for XML
    if (selectedKey && params?.transforms){
      const t = params.transforms[selectedKey] || t0();
      const p = nodes[selectedKey];
      t.pos.x=p.position.x; t.pos.y=p.position.y; t.pos.z=p.position.z;
      t.rot.x=BABYLON.Angle.FromRadians(p.rotation.x).degrees();
      t.rot.y=BABYLON.Angle.FromRadians(p.rotation.y).degrees();
      t.rot.z=BABYLON.Angle.FromRadians(p.rotation.z).degrees();
      params.transforms[selectedKey] = t;
      saveLocalSilently?.();
    }
  }

  function buildToolbar(){
    [["tb-select","select"],["tb-move","move"],["tb-rotate","rotate"],["tb-scale","scale"]].forEach(([id,mode])=>{
      const el=document.getElementById(id);
      if (el) el.onclick=()=> setGizmoMode(mode);
    });
    const toolbar = document.getElementById("rig-toolbar");
    if (toolbar){
      let picker = toolbar.querySelector("select[data-role='rig-type']");
      if (!picker){
        const wrap = document.createElement("div");
        wrap.className = "rig-type-picker";
        const label = document.createElement("label");
        label.textContent = "Rig Type";
        picker = document.createElement("select");
        picker.dataset.role = "rig-type";
        picker.className = "secondary";
        label.appendChild(picker);
        wrap.appendChild(label);
        toolbar.insertBefore(wrap, toolbar.firstChild);
      }
      rigTypeSelectEl = picker;
      updateRigTypeSelectUI();
      picker.onchange = () => {
        setRigType(picker.value);
      };
    }
    window.addEventListener("keydown",(e)=>{
      if (e.repeat) return;
      if (e.key==="s"||e.key==="S") setGizmoMode("select");
      if (e.key==="w"||e.key==="W") setGizmoMode("move");
      if (e.key==="e"||e.key==="E") setGizmoMode("rotate");
      if (e.key==="r"||e.key==="R") setGizmoMode("scale");
      if (e.code==="Space"){ e.preventDefault(); document.getElementById("an-play")?.click(); }
    });
  }

  // ---- Wire toolbar action buttons (no right panel required) ----
  function wireActionButtons(){
    const q = id => document.getElementById(id);

    q("rig-reset")?.addEventListener("click", ()=>{
      params = ensureRigParamsStructure(createDefaultParamsForType(rigTypeId), PART_KEYS, currentRigDefinition());
      refresh();
      saveLocalSilently();
      alert("Rig reset to defaults.");
    });

    q("rig-zero")?.addEventListener("click", ()=>{
      ensureTransformMap(params, PART_KEYS);
      for (const k of Object.keys(params.transforms)) params.transforms[k] = t0();
      refresh();
      saveLocalSilently();
      alert("Pose zeroed.");
    });

    q("rig-save-local")?.addEventListener("click", ()=>{ saveLocal(); });

    q("rig-export")?.addEventListener("click", ()=>{ exportXML(); });

    q("rig-exit")?.addEventListener("click", ()=>{
      try { syncParamsFromScene(); } catch (err) { /* ignore */ }
      flushAnimationAutosave({ force: true });
      let handled = false;
      const hx = typeof window !== "undefined" ? window.HXH : null;
      if (hx && typeof hx.finalizeRigEditorSession === "function" && sessionContext) {
        try {
          handled = !!hx.finalizeRigEditorSession({
            rig: deepClone(params),
            rigType: rigTypeId,
            cosmetics: sessionContext.cosmetics || null,
            source: sessionContext.source || null,
            meta: sessionContext.meta || null,
            reason: "exit"
          });
        } catch (err) {
          console.warn("[RigEditor] Failed to finalize session", err);
        }
      }
      sessionContext = null;
      anim.playing = false;
      if (timelineControls.btnPlay) timelineControls.btnPlay.textContent = "▶";
      if (animationBinding?.group) {
        try { animationBinding.group.pause(); } catch (err) { /* ignore */ }
      }
      if (!handled) {
        document.querySelectorAll(".screen").forEach(s=> s.classList.remove("visible"));
        document.getElementById("screen--menu")?.classList.add("visible");
      }
    });

    // Import (uses hidden #rig-file in HTML)
    const fileInput = document.getElementById("rig-file");
    q("rig-import")?.addEventListener("click", ()=> fileInput?.click());
    fileInput?.addEventListener("change", async (e)=>{
      const f = e.target.files?.[0]; if (!f) return;
      try{
        const text = await f.text();
        const loaded = parseRigXML(text);
        if (!loaded) { alert("Invalid XML format."); return; }
        if (loaded.rigType && rigTypeMap.has(loaded.rigType)) {
          setRigType(loaded.rigType, { paramsOverride: loaded.params || loaded, skipCache: true });
        } else {
          params = ensureRigParamsStructure(loaded.params || loaded, PART_KEYS, currentRigDefinition());
          refresh();
        }
        saveLocalSilently();
        alert("Rig imported.");
      }catch(err){ console.error(err); alert("Failed to import XML."); }
      finally { e.target.value=""; }
    });

    const actionsRow = document.querySelector("#rig-toolbar .actions");
    if (actionsRow) {
      let animExportBtn = document.getElementById("anim-export-json");
      if (!animExportBtn) {
        animExportBtn = document.createElement("button");
        animExportBtn.type = "button";
        animExportBtn.id = "anim-export-json";
        animExportBtn.className = "secondary";
        animExportBtn.textContent = "Export Anim JSON";
        animExportBtn.title = "Download animation clips as JSON";
        actionsRow.insertBefore(animExportBtn, q("rig-exit") || null);
      }
      let animImportBtn = document.getElementById("anim-import-json");
      if (!animImportBtn) {
        animImportBtn = document.createElement("button");
        animImportBtn.type = "button";
        animImportBtn.id = "anim-import-json";
        animImportBtn.className = "secondary";
        animImportBtn.textContent = "Import Anim JSON";
        animImportBtn.title = "Load animation clips from JSON";
        actionsRow.insertBefore(animImportBtn, q("rig-exit") || null);
      }
      let animFileInput = document.getElementById("anim-json-file");
      if (!animFileInput) {
        animFileInput = document.createElement("input");
        animFileInput.type = "file";
        animFileInput.id = "anim-json-file";
        animFileInput.accept = ".json,application/json";
        animFileInput.hidden = true;
        actionsRow.appendChild(animFileInput);
      }
      animExportBtn.onclick = () => exportAnimationLibrary();
      animImportBtn.onclick = () => animFileInput?.click();
      animFileInput.onchange = async (event) => {
        const file = event?.target?.files?.[0];
        if (!file) return;
        await importAnimationLibraryFromFile(file);
        if (event?.target) event.target.value = "";
      };
    }
  }

  // ---- Picking (left-click selects; right-drag pans) ----
  function installPicking(){
    scene.onPointerObservable.add((pi)=>{
      if (pi.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
      if (pi.event && pi.event.button !== 0) return; // left only

      const pick = scene.pick(scene.pointerX, scene.pointerY, (m)=>{
        if (!m || !m.isPickable) return false;
        const nm=(m.name||"").toLowerCase();
        if (nm.includes("gizmo")) return false;
        if (nm==="g" || nm==="collider") return false;
        if (nm.includes("grid") || nm.includes("floor") || nm.includes("ground") || nm.includes("axis")) return false;
        return true;
      });
      if (!pick || !pick.hit || !pick.pickedMesh){ clearSelection(); return; }

      const key = findPartKeyFromMesh(pick.pickedMesh);
      if (!key) return;

      selectPart(key);
      setGizmoMode(activeMode()); // keep current gizmo mode
    }, BABYLON.PointerEventTypes.POINTERDOWN);
  }

  // ---------- Build rig (same topology as the game) ----------
  function mat(hex){
    const m = new BABYLON.StandardMaterial(`m-${Math.random().toString(36).slice(2)}`, scene);
    const c = BABYLON.Color3.FromHexString(hex);
    m.diffuseColor=c; m.emissiveColor=c.scale(0.16);
    return m;
  }

  function registerPivot(key, pivot){
    nodes[key] = pivot;
    pivotToKey.set(pivot, key);
    return pivot;
  }

  function createPivotOnly(parent, key){
    const pivot = new BABYLON.TransformNode(key, scene);
    pivot.parent = parent;
    return registerPivot(key, pivot);
  }

  function createBoxSegment(parent, key, size, options = {}) {
    const axis = options.axis || "y";
    const origin = options.origin || "start";
    const offset = options.offset || {};
    const pivotName = options.pivotName || `${key}_pivot`;
    const pivot = new BABYLON.TransformNode(pivotName, scene);
    pivot.parent = parent;
    registerPivot(key, pivot);
    const mesh = BABYLON.MeshBuilder.CreateBox(key, { width: size.w, height: size.h, depth: size.d }, scene);
    mesh.material = mat(options.materialHex || getRigColor());
    mesh.parent = pivot;
    mesh.isPickable = true;
    mesh.metadata = { ...(mesh.metadata || {}), partKey: key };
    mesh.position.set(0, 0, 0);
    if (axis === "y") {
      mesh.position.y = origin === "end" ? size.h * 0.5 : (origin === "center" ? 0 : -size.h * 0.5);
    } else if (axis === "x") {
      mesh.position.x = origin === "end" ? size.w * 0.5 : (origin === "center" ? 0 : -size.w * 0.5);
      if (!options.keepVerticalCenter) {
        mesh.position.y = -size.h * 0.5;
      }
    } else if (axis === "z") {
      mesh.position.z = origin === "end" ? size.d * 0.5 : (origin === "center" ? 0 : -size.d * 0.5);
      if (!options.keepVerticalCenter) {
        mesh.position.y = -size.h * 0.5;
      }
    }
    mesh.position.x += offset.x || 0;
    mesh.position.y += offset.y || 0;
    mesh.position.z += offset.z || 0;
    return { pivot, mesh };
  }

  function getSegmentSize(key) {
    if (!params) return { w: 0.4, h: 0.4, d: 0.4 };
    if (!params.segments || typeof params.segments !== "object") params.segments = {};
    const seg = params.segments[key];
    let w = Number(seg?.w);
    let h = Number(seg?.h);
    let d = Number(seg?.d);
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) {
      const fallback = currentRigDefinition()?.defaults?.segments?.[key];
      w = Number(fallback?.w) || 0.4;
      h = Number(fallback?.h) || 0.4;
      d = Number(fallback?.d) || 0.4;
      params.segments[key] = { w, h, d };
    }
    return { w, h, d };
  }

  function getColliderDimensions() {
    const fallback = currentRigDefinition()?.defaults?.collider || {};
    const collider = params?.collider || {};
    const width = Number(collider.width) || Number(fallback.width) || 1;
    const height = Number(collider.height) || Number(fallback.height) || 1;
    const depth = Number(collider.depth) || Number(fallback.depth) || 1;
    const y = Number(collider.y) || Number(fallback.y) || 0;
    if (params) {
      params.collider = { width, height, depth, y };
    }
    return { width, height, depth, y };
  }

  function getRigColor() {
    const candidate = typeof params?.color === "string" ? params.color.trim() : null;
    if (candidate && /^#([0-9a-f]{3}){1,2}$/i.test(candidate)) {
      return candidate;
    }
    const fallback = currentRigDefinition()?.defaults?.color;
    return (typeof fallback === "string" && /^#([0-9a-f]{3}){1,2}$/i.test(fallback)) ? fallback : "#888888";
  }

  function buildHumanoidRig({ options = {} } = {}) {
    const hex = getRigColor();
    const pelvis = createBoxSegment(rigRoot, "pelvis", getSegmentSize("pelvis"), { axis: "y", origin: "start", materialHex: hex });
    const torsoLower = createBoxSegment(pelvis.pivot, "torsoLower", getSegmentSize("torsoLower"), { axis: "y", origin: "start", materialHex: hex });
    torsoLower.pivot.position.y = 0.30;
    const torsoUpper = createBoxSegment(torsoLower.pivot, "torsoUpper", getSegmentSize("torsoUpper"), { axis: "y", origin: "start", materialHex: hex });
    torsoUpper.pivot.position.y = 0.55;
    const neck = createBoxSegment(torsoUpper.pivot, "neck", getSegmentSize("neck"), { axis: "y", origin: "start", materialHex: hex });
    neck.pivot.position.y = 0.55;
    createBoxSegment(neck.pivot, "head", getSegmentSize("head"), { axis: "y", origin: "end", materialHex: hex });

    const shoulderL = createPivotOnly(torsoUpper.pivot, "shoulderL");
    const shoulderR = createPivotOnly(torsoUpper.pivot, "shoulderR");
    const armLUpper = createBoxSegment(shoulderL, "armL_upper", getSegmentSize("armL_upper"), { axis: "y", origin: "start", materialHex: hex });
    const armLFore = createBoxSegment(armLUpper.pivot, "armL_fore", getSegmentSize("armL_fore"), { axis: "y", origin: "start", materialHex: hex });
    createBoxSegment(armLFore.pivot, "armL_hand", getSegmentSize("armL_hand"), { axis: "y", origin: "start", materialHex: hex });
    const armRUpper = createBoxSegment(shoulderR, "armR_upper", getSegmentSize("armR_upper"), { axis: "y", origin: "start", materialHex: hex });
    const armRFore = createBoxSegment(armRUpper.pivot, "armR_fore", getSegmentSize("armR_fore"), { axis: "y", origin: "start", materialHex: hex });
    createBoxSegment(armRFore.pivot, "armR_hand", getSegmentSize("armR_hand"), { axis: "y", origin: "start", materialHex: hex });

    const hipL = createPivotOnly(pelvis.pivot, "hipL");
    const hipR = createPivotOnly(pelvis.pivot, "hipR");
    const legLThigh = createBoxSegment(hipL, "legL_thigh", getSegmentSize("legL_thigh"), { axis: "y", origin: "start", materialHex: hex });
    const legLShin = createBoxSegment(legLThigh.pivot, "legL_shin", getSegmentSize("legL_shin"), { axis: "y", origin: "start", materialHex: hex });
    createBoxSegment(legLShin.pivot, "legL_foot", getSegmentSize("legL_foot"), { axis: "z", origin: "end", materialHex: hex });
    const legRThigh = createBoxSegment(hipR, "legR_thigh", getSegmentSize("legR_thigh"), { axis: "y", origin: "start", materialHex: hex });
    const legRShin = createBoxSegment(legRThigh.pivot, "legR_shin", getSegmentSize("legR_shin"), { axis: "y", origin: "start", materialHex: hex });
    createBoxSegment(legRShin.pivot, "legR_foot", getSegmentSize("legR_foot"), { axis: "z", origin: "end", materialHex: hex });

    if (options.tail) {
      const tailBase = createBoxSegment(pelvis.pivot, "tailBase", getSegmentSize("tailBase"), { axis: "z", origin: "start", materialHex: hex });
      tailBase.pivot.position.z = -getSegmentSize("pelvis").d * 0.5;
      tailBase.pivot.position.y = -0.15;
      const tailMid = createBoxSegment(tailBase.pivot, "tailMid", getSegmentSize("tailMid"), { axis: "z", origin: "start", materialHex: hex });
      tailMid.pivot.position.z = -getSegmentSize("tailBase").d * 0.6;
      tailMid.pivot.position.y = -0.05;
      const tailTip = createBoxSegment(tailMid.pivot, "tailTip", getSegmentSize("tailTip"), { axis: "z", origin: "start", materialHex: hex });
      tailTip.pivot.position.z = -getSegmentSize("tailMid").d * 0.6;
      tailTip.pivot.position.y = -0.05;
    }
  }

  function buildAquaticRig(){
    const hex = getRigColor();
    const coreSize = getSegmentSize("core");
    const core = createBoxSegment(rigRoot, "core", coreSize, { axis: "y", origin: "center", materialHex: hex });
    core.pivot.position.y = 0.4;

    const frontSize = getSegmentSize("torsoFront");
    const torsoFront = createBoxSegment(core.pivot, "torsoFront", frontSize, { axis: "z", origin: "end", materialHex: hex, keepVerticalCenter: true });
    torsoFront.pivot.position.z = coreSize.d * 0.5;
    const rearSize = getSegmentSize("torsoRear");
    const torsoRear = createBoxSegment(core.pivot, "torsoRear", rearSize, { axis: "z", origin: "start", materialHex: hex, keepVerticalCenter: true });
    torsoRear.pivot.position.z = -coreSize.d * 0.5;

    const neck = createBoxSegment(torsoFront.pivot, "neck", getSegmentSize("neck"), { axis: "z", origin: "end", materialHex: hex, keepVerticalCenter: true });
    neck.pivot.position.z = frontSize.d * 0.5;
    const head = createBoxSegment(neck.pivot, "head", getSegmentSize("head"), { axis: "z", origin: "end", materialHex: hex, keepVerticalCenter: true });
    head.pivot.position.z = getSegmentSize("neck").d * 0.6;

    const finFrontL = createBoxSegment(torsoFront.pivot, "finFrontL", getSegmentSize("finFrontL"), { axis: "x", origin: "start", materialHex: hex, keepVerticalCenter: true });
    finFrontL.pivot.position.z = 0.35;
    finFrontL.pivot.position.y = -0.05;
    const finFrontR = createBoxSegment(torsoFront.pivot, "finFrontR", getSegmentSize("finFrontR"), { axis: "x", origin: "end", materialHex: hex, keepVerticalCenter: true });
    finFrontR.pivot.position.z = 0.35;
    finFrontR.pivot.position.y = -0.05;

    const finRearL = createBoxSegment(torsoRear.pivot, "finRearL", getSegmentSize("finRearL"), { axis: "x", origin: "start", materialHex: hex, keepVerticalCenter: true });
    finRearL.pivot.position.z = -0.3;
    finRearL.pivot.position.y = -0.1;
    const finRearR = createBoxSegment(torsoRear.pivot, "finRearR", getSegmentSize("finRearR"), { axis: "x", origin: "end", materialHex: hex, keepVerticalCenter: true });
    finRearR.pivot.position.z = -0.3;
    finRearR.pivot.position.y = -0.1;

    const tailBase = createBoxSegment(torsoRear.pivot, "tailBase", getSegmentSize("tailBase"), { axis: "z", origin: "start", materialHex: hex, keepVerticalCenter: true });
    tailBase.pivot.position.z = -rearSize.d * 0.5;
    const tailTip = createBoxSegment(tailBase.pivot, "tailTip", getSegmentSize("tailTip"), { axis: "z", origin: "start", materialHex: hex, keepVerticalCenter: true });
    tailTip.pivot.position.z = -getSegmentSize("tailBase").d * 0.7;
  }

  const RIG_BUILDERS = {
    humanoid: buildHumanoidRig,
    aquatic: buildAquaticRig
  };

  function rebuildRig(){
    disposeOnionGhosts();
    // purge previous (keep ground/axes/beacon)
    scene.meshes.slice().forEach(m=>{ if(!["g","beacon"].includes(m.name)) m.dispose(); });
    scene.transformNodes.slice().forEach(t=>{ if(!t.name.startsWith("Axes")) t.dispose(); });
    nodes = {};
    const { width, height, depth, y } = getColliderDimensions();
    rigRoot = BABYLON.MeshBuilder.CreateBox("collider",{width,height,depth},scene);
    rigRoot.position.y = y;
    const cm = new BABYLON.StandardMaterial("cm",scene);
    cm.diffuseColor = new BABYLON.Color3(0.1,0.2,0.25); cm.alpha=0.25;
    rigRoot.material = cm; rigRoot.isPickable=false;

    const def = currentRigDefinition();
    const builderKey = def?.builder || "humanoid";
    const builder = RIG_BUILDERS[builderKey] || buildHumanoidRig;
    builder({ options: def?.options || {} });

    applyTransforms();
    markAnimationGroupDirty();
    if (onionSkinEnabled) {
      ensureOnionGhosts();
      updateOnionGhosts();
    }
  }

  function applyTransforms(){
    const T = ensureTransformMap(params, PART_KEYS);
    for (const key of PART_KEYS){
      const node = nodes[key]; if (!node) continue;
      const tr = T[key];
      node.position.set(tr.pos.x, tr.pos.y, tr.pos.z);
      setNodeEuler(node, {
        x: d2r(tr.rot.x),
        y: d2r(tr.rot.y),
        z: d2r(tr.rot.z)
      });
    }
  }

  function refresh(){ rebuildRig(); }

  // ---------- Animation Preview ----------
  function partsForAnim(){
    const def = currentRigDefinition();
    if (!def || def.builder !== "humanoid") {
      return {};
    }
    return {
      lowerTorso:nodes.torsoLower, upperTorso:nodes.torsoUpper, neck:nodes.neck,
      armL:{ shoulder:nodes.armL_upper, elbow:nodes.armL_fore, wrist:nodes.armL_hand },
      armR:{ shoulder:nodes.armR_upper, elbow:nodes.armR_fore, wrist:nodes.armR_hand },
      legL:{ hip:nodes.legL_thigh, knee:nodes.legL_shin, ankle:nodes.legL_foot },
      legR:{ hip:nodes.legR_thigh, knee:nodes.legR_shin, ankle:nodes.legR_foot },
    };
  }
  function addRot(n, rx=0,ry=0,rz=0){
    if(!n) return;
    const e = getNodeEuler(n);
    setNodeEuler(n, { x: e.x + rx, y: e.y + ry, z: e.z + rz });
  }

  function updateWalkAnimEditor(P, speed, grounded, dt, attackT=0){
    if (!P.armL || !P.armR || !P.legL || !P.legR) return;
    const phInc = (grounded ? speed*4.8 : speed*2.4) * dt * 1.5;
    anim.phase += phInc; const ph = anim.phase;

    const swing = grounded ? Math.sin(ph)*0.7 : 0.3*Math.sin(ph*0.6);
    const armSwing = swing*0.8;

    addRot(P.legL.hip,  swing,0,0); addRot(P.legR.hip, -swing,0,0);
    const kneeL = Math.max(0,-Math.sin(ph))*1.1;
    const kneeR = Math.max(0, Math.sin(ph))*1.1;
    addRot(P.legL.knee,kneeL,0,0); addRot(P.legR.knee,kneeR,0,0);
    addRot(P.legL.ankle,-kneeL*0.35+0.1*Math.sin(ph*2),0,0);
    addRot(P.legR.ankle,-kneeR*0.35-0.1*Math.sin(ph*2),0,0);

    addRot(P.armL.shoulder,-armSwing,0,0); addRot(P.armR.shoulder,armSwing,0,0);
    const elbowL = Math.max(0, Math.sin(ph))*0.6;
    const elbowR = Math.max(0,-Math.sin(ph))*0.6;
    addRot(P.armL.elbow, elbowL,0,0); addRot(P.armR.elbow, elbowR,0,0);
    addRot(P.armL.wrist,-elbowL*0.4,0,0); addRot(P.armR.wrist,-elbowR*0.4,0,0);

    if (!grounded){
      addRot(P.armL.shoulder,0.5,0,0); addRot(P.armR.shoulder,0.5,0,0);
      addRot(P.legL.knee,0.4,0,0); addRot(P.legR.knee,0.4,0,0);
      addRot(P.legL.ankle,0.15,0,0); addRot(P.legR.ankle,0.15,0,0);
    }

    if (attackT>0){
      const t = Math.min(1, attackT/0.22), k=Math.sin(t*Math.PI);
      addRot(P.armR.shoulder,-1.6*k,0,0);
      addRot(P.armR.elbow,0.2*(1-k),0,0);
      addRot(P.armR.wrist,0.12,0,0);
    }

    addRot(P.lowerTorso, 0.05*Math.sin(ph*2)*(grounded?1:0.3),0,0);
    addRot(P.upperTorso, 0.03*Math.sin(ph*2+0.4)*(grounded?1:0.3),0,0);
    addRot(P.neck,      -0.03*Math.sin(ph*2+0.2),0,0);
  }

  function animateTick(dt){
    const def = currentRigDefinition();
    if (!def || def.builder !== "humanoid") {
      applyTransforms();
      return;
    }
    applyTransforms();
    const P = partsForAnim();
    let spd = anim.speed;
    if (anim.mode==="idle") spd = 0.15*anim.speed;
    if (anim.mode==="walk") anim.grounded=true;
    if (anim.mode==="jump") anim.grounded=false;
    if (anim.mode==="punch"){ anim.grounded=true; if (anim.attackT<=0) anim.attackT=0.22; else anim.attackT=Math.max(0,anim.attackT-dt); }
    else anim.attackT=0;
    updateWalkAnimEditor(P, spd, anim.grounded, dt, anim.attackT);
  }

  // ---------- (Right-panel code kept but unused) ----------
  function buildResizablePanel(){ /* intentionally disabled */ }

  // ---------- Legacy Form UI (not used) ----------
  function buildForm(){ /* intentionally disabled; kept for compatibility */ }

  // ---------- Actions previously in the panel (now wired in toolbar) ----------
  function wireActionsRow(){ /* deprecated */ }

  // ---- Animation controls overlay (top-right of canvas) ----
  function buildAnimBar(){
    const wrap = document.querySelector(".rig-canvas-wrap");
    let bar = document.getElementById("rig-animbar");
    if (bar) return;
    bar = document.createElement("div");
    bar.id = "rig-animbar";
    bar.className = "rig-animbar";
    bar.innerHTML = `
      <button id="anim-play" class="secondary">▶ Play</button>
      <select id="anim-mode" class="secondary">
        <option value="walk">Walk / Run</option>
        <option value="idle">Idle</option>
        <option value="jump">Jump (air pose)</option>
        <option value="punch">Punch loop</option>
      </select>
      <label class="anim-speed">Speed
        <input id="anim-speed" type="range" min="0.2" max="3" step="0.1" value="1">
      </label>
      <button id="anim-onion" class="secondary" title="Toggle onion-skin ghost preview">Ghost Off</button>`;
    wrap.appendChild(bar);

    const btn = document.getElementById("anim-play");
    const mode = document.getElementById("anim-mode");
    const spd  = document.getElementById("anim-speed");
    const ghostBtn = document.getElementById("anim-onion");
    btn.onclick = ()=>{ anim.playing=!anim.playing; btn.textContent = anim.playing ? "⏸ Pause" : "▶ Play"; };
    mode.onchange= ()=>{ anim.mode = mode.value; };
    spd.oninput  = ()=>{ anim.speed = Number(spd.value)||1; };
    if (ghostBtn) {
      onionSkinButton = ghostBtn;
      ghostBtn.onclick = () => setOnionSkinEnabled(!onionSkinEnabled);
      updateOnionSkinButtonUI();
    }
  }

  // ---------- persistence & export ----------
  function saveLocalSilently(){
    try{
      syncParamsFromScene();
      if (params) {
        params.rigType = rigTypeId;
      }
      localStorage.setItem("hxh.rig.params", JSON.stringify(params));
    }catch{}
  }
  function saveLocal(){ saveLocalSilently(); alert("Saved this rig to your browser (localStorage)."); }

  function parseFloatAttr(node,name,def=0){ const v=parseFloat(node?.getAttribute(name)); return Number.isFinite(v)?v:def; }

  // Sync all live node transforms into params.transforms (deg in params)
  function syncParamsFromScene(){
        ensureTransformMap(params);
        for (const key of PART_KEYS){
                const n = nodes[key];
                if (!n) continue;
                const t = params.transforms[key];
                t.pos.x = n.position.x;
                t.pos.y = n.position.y;
                t.pos.z = n.position.z;
                const e = getNodeEuler(n);
                t.rot.x = BABYLON.Angle.FromRadians(e.x).degrees();
                t.rot.y = BABYLON.Angle.FromRadians(e.y).degrees();
                t.rot.z = BABYLON.Angle.FromRadians(e.z).degrees();
          }
        }


  function parseRigXML(text){
    const doc=new DOMParser().parseFromString(text,"application/xml");
    if (doc.getElementsByTagName("parsererror").length) return null;
    const root=doc.querySelector("rig"); if(!root) return null;
    const typeAttr = root.getAttribute("type") || root.getAttribute("rigType");
    const def = (typeAttr && rigTypeMap.get(typeAttr)) || currentRigDefinition();
    if (!def) return null;
    const partKeys = def.partKeys;
    const base = ensureRigParamsStructure(createDefaultParamsForType(def.id), partKeys, def);
    const colorAttr = root.getAttribute("color");
    if (colorAttr) { base.color = colorAttr; }

    const colliderNode = root.querySelector("collider");
    if (colliderNode) {
      base.collider = {
        width: parseFloatAttr(colliderNode, "width", base.collider.width),
        height: parseFloatAttr(colliderNode, "height", base.collider.height),
        depth: parseFloatAttr(colliderNode, "depth", base.collider.depth),
        y: parseFloatAttr(colliderNode, "y", base.collider.y)
      };
    }

    const segmentsNode = root.querySelector("segments");
    if (segmentsNode) {
      partKeys.forEach(key => {
        const node = segmentsNode.querySelector(`part[name='${key}']`) || segmentsNode.querySelector(key);
        if (!node) return;
        const current = base.segments[key] || { w: 0.4, h: 0.4, d: 0.4 };
        base.segments[key] = {
          w: parseFloatAttr(node, "w", parseFloatAttr(node, "width", current.w)),
          h: parseFloatAttr(node, "h", parseFloatAttr(node, "height", current.h)),
          d: parseFloatAttr(node, "d", parseFloatAttr(node, "depth", current.d))
        };
      });
    } else {
      const sizes = root.querySelector("sizes");
      if (sizes) {
        const setSize = (tag, key) => {
          const node = sizes.querySelector(tag);
          if (!node) return;
          const current = base.segments[key] || { w: 0.4, h: 0.4, d: 0.4 };
          base.segments[key] = {
            w: parseFloatAttr(node, "w", current.w),
            h: parseFloatAttr(node, "h", current.h),
            d: parseFloatAttr(node, "d", current.d)
          };
        };
        setSize("pelvis", "pelvis");
        setSize("torsoLower", "torsoLower");
        setSize("torsoUpper", "torsoUpper");
        setSize("neck", "neck");
        setSize("head", "head");
        const arm=sizes.querySelector("arm");
        if (arm){
          const upperDefaults = base.segments.armL_upper || { w: 0.34, h: 0.75, d: 0.34 };
          const foreDefaults = base.segments.armL_fore || { w: 0.3, h: 0.7, d: 0.27 };
          const handDefaults = base.segments.armL_hand || { w: foreDefaults.w, h: 0.25, d: foreDefaults.d };
          const upperW=parseFloatAttr(arm,"upperW", upperDefaults.w);
          const upperD=parseFloatAttr(arm,"upperD", upperDefaults.d);
          const upperLen=parseFloatAttr(arm,"upperLen", upperDefaults.h);
          const foreW=parseFloatAttr(arm,"foreW", foreDefaults.w);
          const foreD=parseFloatAttr(arm,"foreD", foreDefaults.d);
          const foreLen=parseFloatAttr(arm,"foreLen", foreDefaults.h);
          const handLen=parseFloatAttr(arm,"handLen", handDefaults.h);
          base.segments.armL_upper = { w: upperW, h: upperLen, d: upperD };
          base.segments.armR_upper = { w: upperW, h: upperLen, d: upperD };
          base.segments.armL_fore = { w: foreW, h: foreLen, d: foreD };
          base.segments.armR_fore = { w: foreW, h: foreLen, d: foreD };
          base.segments.armL_hand = { w: foreW, h: handLen, d: foreD };
          base.segments.armR_hand = { w: foreW, h: handLen, d: foreD };
        }
        const leg=sizes.querySelector("leg");
        if (leg){
          const thighDefaults = base.segments.legL_thigh || { w: 0.45, h: 1.05, d: 0.5 };
          const shinDefaults = base.segments.legL_shin || { w: 0.33, h: 0.88, d: 0.43 };
          const footDefaults = base.segments.legL_foot || { w: 0.32, h: 0.21, d: 0.75 };
          const thighW=parseFloatAttr(leg,"thighW", thighDefaults.w);
          const thighD=parseFloatAttr(leg,"thighD", thighDefaults.d);
          const thighLen=parseFloatAttr(leg,"thighLen", thighDefaults.h);
          const shinW=parseFloatAttr(leg,"shinW", shinDefaults.w);
          const shinD=parseFloatAttr(leg,"shinD", shinDefaults.d);
          const shinLen=parseFloatAttr(leg,"shinLen", shinDefaults.h);
          const footW=parseFloatAttr(leg,"footW", footDefaults.w);
          const footH=parseFloatAttr(leg,"footH", footDefaults.h);
          const footLen=parseFloatAttr(leg,"footLen", footDefaults.d);
          base.segments.legL_thigh = { w: thighW, h: thighLen, d: thighD };
          base.segments.legR_thigh = { w: thighW, h: thighLen, d: thighD };
          base.segments.legL_shin = { w: shinW, h: shinLen, d: shinD };
          base.segments.legR_shin = { w: shinW, h: shinLen, d: shinD };
          base.segments.legL_foot = { w: footW, h: footH, d: footLen };
          base.segments.legR_foot = { w: footW, h: footH, d: footLen };
        }
      }
    }

    ensureTransformMap(base, partKeys);
    const transforms=root.querySelector("transforms");
    if (transforms){
      for (const key of partKeys){
        const n=transforms.querySelector(key); if(!n) continue;
        const tr=base.transforms[key];
        tr.pos.x=parseFloatAttr(n,"posX",tr.pos.x);
        tr.pos.y=parseFloatAttr(n,"posY",tr.pos.y);
        tr.pos.z=parseFloatAttr(n,"posZ",tr.pos.z);
        tr.rot.x=parseFloatAttr(n,"rotX",tr.rot.x);
        tr.rot.y=parseFloatAttr(n,"rotY",tr.rot.y);
        tr.rot.z=parseFloatAttr(n,"rotZ",tr.rot.z);
      }
    }

    return { rigType: def.id, params: ensureRigParamsStructure(base, partKeys, def) };
  }

  function exportXML(){
    syncParamsFromScene();
    if (params) { params.rigType = rigTypeId; }
    const def = currentRigDefinition();
    const typeId = def?.id || rigTypeId;
    const color = getRigColor();
    const collider = getColliderDimensions();
    const segLines = PART_KEYS.map(key => {
      const seg = params?.segments?.[key];
      if (!seg) return null;
      return `    <part name="${key}" w="${Number(seg.w).toFixed(3)}" h="${Number(seg.h).toFixed(3)}" d="${Number(seg.d).toFixed(3)}" />`;
    }).filter(Boolean).join("\n");
    const transformLines = PART_KEYS.map(key => {
      const tr = params?.transforms?.[key] || t0();
      return `    <${key} posX="${Number(tr.pos.x).toFixed(3)}" posY="${Number(tr.pos.y).toFixed(3)}" posZ="${Number(tr.pos.z).toFixed(3)}" rotX="${Number(tr.rot.x).toFixed(3)}" rotY="${Number(tr.rot.y).toFixed(3)}" rotZ="${Number(tr.rot.z).toFixed(3)}" />`;
    }).join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rig type="${typeId}" color="${color}">\n  <collider width="${collider.width.toFixed(3)}" height="${collider.height.toFixed(3)}" depth="${collider.depth.toFixed(3)}" y="${collider.y.toFixed(3)}" />\n  <segments>\n${segLines}\n  </segments>\n  <transforms>\n${transformLines}\n  </transforms>\n</rig>`;
    const blob=new Blob([xml],{type:"application/xml"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`hxh_rig_${Date.now()}.xml`;
    document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
  }

  function guardedBoot(...args) {
    const hud = window.HUD;
    if (!hud || typeof hud.isRigEditorUnlocked !== "function") {
      return boot(...args);
    }
    if (hud.isRigEditorUnlocked()) {
      return boot(...args);
    }

    const handleUnlock = () => {
      pendingUnlockBoot = null;
      try {
        boot(...args);
      } catch (err) {
        console.warn("[RigEditor] Boot after unlock failed", err);
      }
    };

    if (typeof hud.onRigEditorUnlock === "function") {
      if (!pendingUnlockBoot) {
        pendingUnlockBoot = handleUnlock;
        try {
          hud.onRigEditorUnlock(handleUnlock);
        } catch (err) {
          console.warn("[RigEditor] Failed to subscribe to unlock", err);
          pendingUnlockBoot = null;
          return boot(...args);
        }
      }
      if (typeof hud.openRigUnlockConsole === "function") {
        hud.openRigUnlockConsole();
      }
      return null;
    }

    if (typeof hud.openRigUnlockConsole === "function") {
      hud.openRigUnlockConsole({ onUnlock: handleUnlock });
      return null;
    }

    return boot(...args);
  }

  // public
  window.RigEditor = {
    boot: guardedBoot,
    unsafeBoot: boot,
    setOnionSkin(enabled) {
      setOnionSkinEnabled(Boolean(enabled));
    },
    isOnionSkinEnabled() {
      return onionSkinEnabled;
    }
  };
})();
