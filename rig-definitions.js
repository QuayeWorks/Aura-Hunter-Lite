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

  if (!RigDefinitions.COSMETICS) {
    RigDefinitions.COSMETICS = defaultCosmetics;
  }
  if (!RigDefinitions.DEFAULT_COSMETICS) {
    RigDefinitions.DEFAULT_COSMETICS = fallbackDefaultCosmetics;
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
