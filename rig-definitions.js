// rig-definitions.js — shared rig schema used by the game & editor
(function(){
  const Fallback = window.HXH && window.HXH.getRig ? window.HXH.getRig() : null;
  const RigDefinitions = window.RigDefinitions || (Fallback ? {
    // Provide at least PART_KEYS so the editor can align
    PART_KEYS: (window.HXH && window.HXH.PART_KEYS) || [
      "pelvis","torsoLower","torsoUpper","neck","head",
      "shoulderL","armL_upper","armL_fore","armL_hand",
      "shoulderR","armR_upper","armR_fore","armR_hand",
      "hipL","legL_thigh","legL_shin","legL_foot",
      "hipR","legR_thigh","legR_shin","legR_foot"
    ]
  } : {});
  const HUMANOID_PART_KEYS = [
    "pelvis", "torsoLower", "torsoUpper", "neck", "head",
    "shoulderL", "armL_upper", "armL_fore", "armL_hand",
    "shoulderR", "armR_upper", "armR_fore", "armR_hand",
    "hipL", "legL_thigh", "legL_shin", "legL_foot",
    "hipR", "legR_thigh", "legR_shin", "legR_foot"
  ];

  const HUMANOID_SEGMENTS = {
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
  };

  const MONKEY_PART_KEYS = [
    ...HUMANOID_PART_KEYS,
    "tailBase", "tailMid", "tailTip"
  ];

  const AQUATIC_PART_KEYS = [
    "core", "torsoFront", "torsoRear", "neck", "head",
    "finFrontL", "finFrontR", "finRearL", "finRearR",
    "tailBase", "tailTip"
  ];

  const defaultCosmetics = {
    faces: [
      { id: "neutral", label: "Neutral" },
      { id: "grin", label: "Brave Grin" },
      { id: "focused", label: "Focused" }
    ],
    hair: [
      { id: "buzz", label: "Buzz Cut", primaryColor: "#2f2f38", secondaryColor: "#3c3f4f" },
      { id: "windswept", label: "Windswept", primaryColor: "#1e2f6f", secondaryColor: "#2f478f" },
      { id: "scout_hat", label: "Explorer Hat", primaryColor: "#6a4d32", secondaryColor: "#8c6a3e" }
    ],
    outfits: {
      top: {
        hunter: { id: "hunter", label: "Hunter Jacket", body: "#2d3d8f", accent: "#66c1ff", sleeve: "#1f2d64" },
        stealth: { id: "stealth", label: "Night Coat", body: "#1b1d28", accent: "#4d5978", sleeve: "#282b3c" },
        festival: { id: "festival", label: "Festival Vest", body: "#c55a5a", accent: "#f5d36a", sleeve: "#a44646" }
      },
      bottom: {
        scout: { id: "scout", label: "Scout Pants", hips: "#243244", thigh: "#1d2736", shin: "#324763" },
        stealth: { id: "stealth", label: "Night Trousers", hips: "#1a1c26", thigh: "#12141c", shin: "#2a2d3a" },
        festival: { id: "festival", label: "Festival Wraps", hips: "#7a3131", thigh: "#592424", shin: "#dd8a4a" }
      },
      full: {
        ranger: { id: "ranger", label: "Hunter Ranger", top: "hunter", bottom: "scout" },
        nocturne: { id: "nocturne", label: "Nocturne Operative", top: "stealth", bottom: "stealth" },
        parade: { id: "parade", label: "Parade Attire", top: "festival", bottom: "festival" }
      }
    },
    shoes: {
      standard: { id: "standard", label: "Standard Boots", base: "#2f2f38", accent: "#585d70" },
      sprint: { id: "sprint", label: "Sprint Sneakers", base: "#26486a", accent: "#69d1ff" },
      trail: { id: "trail", label: "Trail Runners", base: "#4a3522", accent: "#efb459" }
    },
    accessories: {
      visor: { id: "visor", label: "Nen Visor", color: "#68c9ff", accent: "#2b7fd0" },
      earrings: { id: "earrings", label: "Twin Studs", color: "#f6f0d6", accent: "#c9c2a5" },
      scarf: { id: "scarf", label: "Aura Scarf", color: "#d4643f", accent: "#f3ad7a" }
    }
  };

  const fallbackDefaultCosmetics = {
    face: "neutral",
    hair: "windswept",
    outfit: { top: "hunter", bottom: "scout", full: "ranger" },
    shoes: "standard",
    accessories: []
  };

  function cloneTransforms(source = {}) {
    const out = {};
    Object.keys(source).forEach(key => {
      const entry = source[key] || {};
      const pos = entry.pos || {};
      const rot = entry.rot || {};
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

  const HUMANOID_TRANSFORMS = cloneTransforms({
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
  });

  const MONKEY_TRANSFORMS = cloneTransforms({
    ...HUMANOID_TRANSFORMS,
    tailBase: { pos:{x:0.000, y:-0.250, z:-0.350}, rot:{x:15, y:0, z:0} },
    tailMid:  { pos:{x:0.000, y:-0.380, z:-0.520}, rot:{x:20, y:0, z:0} },
    tailTip:  { pos:{x:0.000, y:-0.420, z:-0.520}, rot:{x:28, y:0, z:0} }
  });

  const AQUATIC_TRANSFORMS = cloneTransforms({
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
  });

  const HUMANOID_DEFAULT = {
    id: "anthro-biped",
    label: "Anthropomorphic Bipedal",
    partKeys: HUMANOID_PART_KEYS,
    defaults: {
      rigType: "anthro-biped",
      color: "#804a00",
      collider: { width: 0.85, height: 2.4, depth: 0.7, y: 1.3 },
      segments: HUMANOID_SEGMENTS,
      transforms: HUMANOID_TRANSFORMS
    },
    builder: "humanoid",
    options: { tail: false }
  };

  const MONKEY_SEGMENTS = {
    ...HUMANOID_SEGMENTS,
    tailBase: { w: 0.32, h: 0.45, d: 0.70 },
    tailMid:  { w: 0.26, h: 0.40, d: 0.65 },
    tailTip:  { w: 0.22, h: 0.35, d: 0.55 }
  };

  const MONKEY_DEFAULT = {
    id: "monkey-build",
    label: "Monkey Build",
    partKeys: MONKEY_PART_KEYS,
    defaults: {
      rigType: "monkey-build",
      color: "#8b5a2b",
      collider: { width: 0.9, height: 2.35, depth: 0.75, y: 1.2 },
      segments: MONKEY_SEGMENTS,
      transforms: MONKEY_TRANSFORMS
    },
    builder: "humanoid",
    options: { tail: true }
  };

  const AQUATIC_SEGMENTS = {
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
  };

  const AQUATIC_DEFAULT = {
    id: "aquatic-quad",
    label: "Aquatic Quadruped",
    partKeys: AQUATIC_PART_KEYS,
    defaults: {
      rigType: "aquatic-quad",
      color: "#0d5c7d",
      collider: { width: 1.4, height: 1.6, depth: 3.2, y: 0.9 },
      segments: AQUATIC_SEGMENTS,
      transforms: AQUATIC_TRANSFORMS
    },
    builder: "aquatic",
    options: { }
  };

  const DEFAULT_RIG_TYPES = [HUMANOID_DEFAULT, AQUATIC_DEFAULT, MONKEY_DEFAULT];

  if (!RigDefinitions.COSMETICS) {
    RigDefinitions.COSMETICS = defaultCosmetics;
  }
  if (!RigDefinitions.DEFAULT_COSMETICS) {
    RigDefinitions.DEFAULT_COSMETICS = fallbackDefaultCosmetics;
  }

  if (!RigDefinitions.RIG_TYPES) {
    RigDefinitions.RIG_TYPES = DEFAULT_RIG_TYPES.map(entry => JSON.parse(JSON.stringify(entry)));
  }

  if (!RigDefinitions.DEFAULT_RIG_TYPE) {
    const first = RigDefinitions.RIG_TYPES && RigDefinitions.RIG_TYPES[0];
    RigDefinitions.DEFAULT_RIG_TYPE = first?.id || "anthro-biped";
  }

  if (!RigDefinitions.PART_KEYS) {
    const active = (RigDefinitions.RIG_TYPES || []).find(type => type.id === RigDefinitions.DEFAULT_RIG_TYPE) || (RigDefinitions.RIG_TYPES && RigDefinitions.RIG_TYPES[0]);
    RigDefinitions.PART_KEYS = Array.isArray(active?.partKeys) ? active.partKeys.slice() : HUMANOID_PART_KEYS.slice();
  }

  if (!RigDefinitions.AnimationStore) {
    const CHANNEL_ALIASES = {
      pos: "position",
      position: "position",
      rot: "rotation",
      rotation: "rotation",
      scl: "scale",
      scale: "scale"
    };

    const animations = {};
    let activeName = null;
    const changeListeners = new Set();

    function emitChange(type, detail = {}) {
      const payload = {
        type,
        name: typeof detail.name === "string" ? detail.name : (detail.animation?.name ?? null),
        animation: detail.animation || null
      };
      changeListeners.forEach(listener => {
        try {
          listener(payload);
        } catch (err) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("AnimationStore listener error", err);
          }
        }
      });
    }

    function normalizeChannel(channel) {
      const key = CHANNEL_ALIASES[channel];
      if (!key) throw new Error(`Unknown channel: ${channel}`);
      return key;
    }

    function sanitizeFps(fps) {
      const num = Number(fps);
      if (!Number.isFinite(num) || num <= 0) return 30;
      return Math.max(1, Math.min(480, num));
    }

    function sanitizeRange(range, fps) {
      let start = 0;
      let end = fps;
      if (Array.isArray(range)) {
        start = Number(range[0]) || 0;
        end = Number(range[1]);
      } else if (range && typeof range === "object") {
        start = Number(range.start ?? range.min ?? 0) || 0;
        end = Number(range.end ?? range.max ?? start);
      }
      if (!Number.isFinite(end)) end = start + fps;
      if (end < start) [start, end] = [end, start];
      if (end === start) end = start + fps;
      return { start, end };
    }

    function cloneValue(value) {
      if (value && typeof value === "object") {
        if ("x" in value || "y" in value || "z" in value) {
          return {
            x: Number(value.x) || 0,
            y: Number(value.y) || 0,
            z: Number(value.z) || 0
          };
        }
        return JSON.parse(JSON.stringify(value));
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    }

    function ensureAnimation(name) {
      const anim = animations[name];
      if (!anim) throw new Error(`Animation '${name}' not found`);
      anim.joints = anim.joints || {};
      anim.range = anim.range || { start: 0, end: anim.fps };
      return anim;
    }

    function ensureJointChannel(anim, joint, channel) {
      const normalized = normalizeChannel(channel);
      if (!anim.joints[joint]) {
        anim.joints[joint] = {
          position: [],
          rotation: [],
          scale: []
        };
      }
      if (!Array.isArray(anim.joints[joint][normalized])) {
        anim.joints[joint][normalized] = [];
      }
      return anim.joints[joint][normalized];
    }

    function requireActive() {
      if (!activeName) throw new Error("No active animation");
      return ensureAnimation(activeName);
    }

    RigDefinitions.AnimationStore = {
      createAnimation(name, fps = 30, range = [0, fps]) {
        if (!name) throw new Error("Animation name is required");
        if (animations[name]) throw new Error(`Animation '${name}' already exists`);
        const cleanFps = sanitizeFps(fps);
        const cleanRange = sanitizeRange(range, cleanFps);
        const anim = {
          name,
          fps: cleanFps,
          range: cleanRange,
          joints: {}
        };
        animations[name] = anim;
        if (!activeName) {
          activeName = name;
        }
        emitChange("create", { animation: anim });
        return anim;
      },

      deleteAnimation(name) {
        if (!animations[name]) return false;
        delete animations[name];
        if (activeName === name) {
          activeName = this.listAnimations()[0] || null;
        }
        emitChange("delete", { name });
        return true;
      },

      addKey(joint, channel, frame, value, options = {}) {
        const anim = requireActive();
        const track = ensureJointChannel(anim, joint, channel);
        const key = {
          frame: Number(frame) || 0,
          value: cloneValue(value),
          ease: options.ease || options.easing || "linear"
        };
        const tolerance = Number(options.tolerance ?? 1e-4);
        const idx = track.findIndex(k => Math.abs(k.frame - key.frame) <= tolerance);
        if (idx >= 0) {
          track[idx] = { ...track[idx], ...key };
          emitChange("updateKey", { animation: anim });
          return track[idx];
        }
        track.push(key);
        track.sort((a, b) => a.frame - b.frame);
        emitChange("addKey", { animation: anim });
        return key;
      },

      removeKey(joint, channel, frame, options = {}) {
        const anim = requireActive();
        const track = ensureJointChannel(anim, joint, channel);
        const tolerance = Number(options.tolerance ?? 1e-4);
        const idx = track.findIndex(k => Math.abs(k.frame - frame) <= tolerance);
        if (idx < 0) return false;
        track.splice(idx, 1);
        emitChange("removeKey", { animation: anim });
        return true;
      },

      moveKey(joint, channel, frame, newFrame, options = {}) {
        const anim = requireActive();
        const track = ensureJointChannel(anim, joint, channel);
        const tolerance = Number(options.tolerance ?? 1e-4);
        const idx = track.findIndex(k => Math.abs(k.frame - frame) <= tolerance);
        if (idx < 0) return null;
        track[idx].frame = Number(newFrame) || 0;
        track.sort((a, b) => a.frame - b.frame);
        emitChange("moveKey", { animation: anim });
        return track[idx];
      },

      listAnimations() {
        return Object.keys(animations);
      },

      getAnimation(name) {
        return animations[name] || null;
      },

      getActiveName() {
        return activeName;
      },

      setActive(name) {
        if (name == null) {
          activeName = null;
          emitChange("activate", { name: null, animation: null });
          return null;
        }
        if (!animations[name]) throw new Error(`Animation '${name}' not found`);
        activeName = name;
        const anim = animations[name];
        emitChange("activate", { animation: anim });
        return anim;
      },

      getActive() {
        return activeName ? animations[activeName] : null;
      },

      onChange(listener) {
        if (typeof listener !== "function") return () => {};
        changeListeners.add(listener);
        return () => {
          changeListeners.delete(listener);
        };
      },

      touch(name) {
        const anim = name ? animations[name] : (activeName ? animations[activeName] : null);
        emitChange("update", { animation: anim, name });
      },

      buildAnimationGroup(options = {}) {
        if (typeof BABYLON === "undefined") return null;
        const {
          scene,
          nodes,
          animation: animationOverride,
          animationName,
          id,
          useQuaternions = true,
          loopMode = BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
        } = options || {};
        if (!scene || typeof scene !== "object") return null;

        const anim = animationOverride || (animationName ? animations[animationName] : this.getActive());
        if (!anim) return null;

        const fps = Number(anim.fps) || 30;
        const range = sanitizeRange(anim.range, fps);
        anim.range = range;

        const nodeLookup = new Map();
        if (nodes instanceof Map) {
          nodes.forEach((node, key) => {
            if (node) nodeLookup.set(key, node);
          });
        } else if (nodes && typeof nodes === "object") {
          Object.keys(nodes).forEach(key => {
            const node = nodes[key];
            if (node) nodeLookup.set(key, node);
          });
        }
        if (!nodeLookup.size) return null;

        const groupName = id || `anim-${anim.name || "clip"}-${Math.random().toString(36).slice(2)}`;
        const group = new BABYLON.AnimationGroup(groupName, scene);
        let added = false;

        const toVector3 = (value, defaultValue = 0) => new BABYLON.Vector3(
          Number(value?.x) || defaultValue,
          Number(value?.y) || defaultValue,
          Number(value?.z) || defaultValue
        );

        const toQuaternion = value => {
          const q = new BABYLON.Quaternion();
          BABYLON.Quaternion.FromEulerAnglesToRef(
            Number(value?.x) || 0,
            Number(value?.y) || 0,
            Number(value?.z) || 0,
            q
          );
          return q;
        };

        const joints = anim.joints || {};
        Object.keys(joints).forEach(joint => {
          const node = nodeLookup.get(joint);
          if (!node) return;
          const jointData = joints[joint] || {};

          if (Array.isArray(jointData.position) && jointData.position.length) {
            const animPos = new BABYLON.Animation(
              `${groupName}-${joint}-pos`,
              "position",
              fps,
              BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
              loopMode
            );
            animPos.setKeys(jointData.position.map(key => ({
              frame: Number(key.frame) || 0,
              value: toVector3(key.value)
            })));
            group.addTargetedAnimation(animPos, node);
            added = true;
          }

          if (Array.isArray(jointData.rotation) && jointData.rotation.length) {
            const prop = useQuaternions ? "rotationQuaternion" : "rotation";
            const type = useQuaternions
              ? BABYLON.Animation.ANIMATIONTYPE_QUATERNION
              : BABYLON.Animation.ANIMATIONTYPE_VECTOR3;
            if (useQuaternions && !node.rotationQuaternion) {
              node.rotationQuaternion = new BABYLON.Quaternion();
              BABYLON.Quaternion.FromEulerAnglesToRef(
                node.rotation?.x || 0,
                node.rotation?.y || 0,
                node.rotation?.z || 0,
                node.rotationQuaternion
              );
            }
            const animRot = new BABYLON.Animation(
              `${groupName}-${joint}-rot`,
              prop,
              fps,
              type,
              loopMode
            );
            animRot.setKeys(jointData.rotation.map(key => ({
              frame: Number(key.frame) || 0,
              value: useQuaternions ? toQuaternion(key.value) : toVector3(key.value)
            })));
            group.addTargetedAnimation(animRot, node);
            added = true;
          }

          if (Array.isArray(jointData.scale) && jointData.scale.length) {
            const animScale = new BABYLON.Animation(
              `${groupName}-${joint}-scl`,
              "scaling",
              fps,
              BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
              loopMode
            );
            animScale.setKeys(jointData.scale.map(key => ({
              frame: Number(key.frame) || 0,
              value: toVector3(key.value, 1)
            })));
            group.addTargetedAnimation(animScale, node);
            added = true;
          }
        });

        if (!added) {
          group.dispose();
          return null;
        }

        return {
          group,
          fps,
          range: { start: range.start, end: range.end },
          name: anim.name || null
        };
      }
    };
  }

  window.RigDefinitions = RigDefinitions;
})();
