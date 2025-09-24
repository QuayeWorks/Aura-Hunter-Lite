// game.js — Consolidated stats (Power / Agility / Focus) + migration, facing, charged jump, time-stop drain, animations
(function () {
   const $ = (q) => document.querySelector(q);
   const hud = {
      name: $("#hud-name"),
      nen: $("#hud-nen"),
      level: $("#hud-level"),
      xpbar: $("#hud-xpbar span"),
      health: $("#hud-health span"),
      nenbar: $("#hud-nenbar span"),
      msg: $("#hud-message"),
      cdQ: $("#cd-q"),
      cdE: $("#cd-e"),
      cdDash: $("#cd-shift"),
	  pauseOverlay: $("#pause-overlay"),
	  btnResume: $("#pause-overlay #btn-resume-pause"),
	  btnExit:   document.querySelector("#pause-overlay #btn-exit"),
      lvOverlay: $("#level-overlay"),
      lvCur: $("#lv-cur"),
      lvUnspent: $("#lv-unspent"),
      lvClose: $("#lv-close"),
      plusBtns: () => Array.from(document.querySelectorAll('#level-overlay .plus')),
      // NEW: only these three spans
      statSpans: {
         power: $("#s-power"),
         agility: $("#s-agility"),
         focus: $("#s-focus")
      }
   };

   const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
   const rand = (a, b) => a + Math.random() * (b - a);
   const COOLDOWNS = {
      meleehit: 0.25,
      nenblast: 2.0,
      special: 10,
      dash: 2.6
   };
   const ANIM_SPEED = 1.5;

   let engine, scene, camera;
   let player, playerRoot, input = {},
      inputOnce = {},
      inputUp = {};
   let enemies = [],
      projectiles = [];
   let lastTime = 0,
      paused = false;
   const startPos = new BABYLON.Vector3(0, 3, 0);
   const world = {
      size: 100,
      gravityY: -28,
      ground: null,
      platforms: []
   };
   // ===== Save helpers =====
   const SAVE_KEYS = {
      progress: "hxh.progress",
      character: "hxh.character"
   };

   function hasSave() {
      try {
         return !!localStorage.getItem(SAVE_KEYS.character);
      } catch {
         return false;
      }
   }
   	  window.hasSave = hasSave;
	  window.loadCharacter = loadCharacter;
	  window.saveCharacter = saveCharacter;
	  window.wipeSave = wipeSave;

   function loadCharacter() {
      try {
         return JSON.parse(localStorage.getItem(SAVE_KEYS.character) || "null");
      } catch {
         return null;
      }
   }

   function saveCharacter(ch) {
      try {
         localStorage.setItem(SAVE_KEYS.character, JSON.stringify(ch));
      } catch {}
   }

   function wipeSave() {
      try {
         localStorage.removeItem(SAVE_KEYS.progress);
         localStorage.removeItem(SAVE_KEYS.character);
      } catch {}
   }

   // ------- Save / progress (with migration from old 5-stat allocs) -------
   let progress = null;
   try {
      progress = JSON.parse(localStorage.getItem("hxh.progress") || "null") || null;
   } catch (e) {
      progress = null;
   }
   if (!progress) progress = {
      level: 1,
      xp: 0,
      unspent: 0,
      alloc: {
         power: 0,
         agility: 0,
         focus: 0
      }
   };

   // migrate old alloc {nen, attack, hp, nenRegen, hpRegen} -> refund to unspent
   if (progress.alloc && ("nen" in progress.alloc || "hp" in progress.alloc)) {
      const old = progress.alloc;
      const refunded = (old.nen || 0) + (old.attack || 0) + (old.hp || 0) + (old.nenRegen || 0) + (old.hpRegen || 0);
      progress.alloc = {
         power: 0,
         agility: 0,
         focus: 0
      };
      progress.unspent = (progress.unspent || 0) + refunded;
      saveProgress();
   }

   function saveProgress() {
      localStorage.setItem("hxh.progress", JSON.stringify(progress));
   }

   function xpToNext(level) {
      return Math.floor(40 + Math.pow(level, 1.35) * 25);
   }

   function gainXP(amount) {
      if (progress.level >= 410) return;
      progress.xp += amount;
      while (progress.level < 410 && progress.xp >= xpToNext(progress.level)) {
         progress.xp -= xpToNext(progress.level);
         progress.level++;
         progress.unspent++;
         msg(`Level up! Now level ${progress.level}. Press L to allocate.`);
      }
      updateHUD();
      saveProgress();
   }

   function setCooldown(key, dur) {
      state.cooldowns[key] = {
         t: dur,
         max: dur
      };
   }

   function cdActive(key) {
      return state.cooldowns[key] && state.cooldowns[key].t > 0;
   }

   function updateCooldownUI() {
      function setCd(el, key) {
         const c = state.cooldowns[key];
         if (!c) {
            el.classList.remove("cooling");
            el.style.setProperty("--pct", "100%");
            return;
         }
         const pct = Math.min(100, Math.max(0, (c.t / c.max) * 100));
         el.classList.add("cooling");
         el.style.setProperty("--pct", `${pct}%`);
      }
      setCd(hud.cdQ, "nenblast");
      setCd(hud.cdE, "special");
      setCd(hud.cdDash, "dash");
   }

   function msg(s) {
      hud.msg.textContent = s;
   }

   function updateHUD() {
      hud.name.textContent = state.ch.name || "Hunter";
      hud.nen.textContent = `${state.ch.nen} — ${state.ch.clan||"Wanderer"}`;
      hud.level.textContent = `Lv ${progress.level}  •  Points: ${progress.unspent}`;
      hud.health.style.width = `${(state.hp/state.maxHP)*100}%`;
      hud.nenbar.style.width = `${(state.nen/state.nenMax)*100}%`;
      const req = xpToNext(progress.level);
      const pct = progress.level >= 410 ? 100 : (progress.xp / req) * 100;
      hud.xpbar.style.width = `${pct}%`;
   }

   // ===== Rig loader (shared with the Rig Editor) =====
   const RIG_KEY = "hxh.rig.params";
   const d2r = (d) => d * Math.PI / 180;
   const t0 = () => ({
      pos: {
         x: 0,
         y: 0,
         z: 0
      },
      rot: {
         x: 0,
         y: 0,
         z: 0
      }
   });

   // all transformable parts
   const PART_KEYS = [
      "pelvis", "torsoLower", "torsoUpper", "neck", "head",
      "shoulderL", "armL_upper", "armL_fore", "armL_hand",
      "shoulderR", "armR_upper", "armR_fore", "armR_hand",
      "hipL", "legL_thigh", "legL_shin", "legL_foot",
      "hipR", "legR_thigh", "legR_shin", "legR_foot",
   ];

   // default sizes + *sane default transforms* (shoulders/hips start in a T-pose)
   const DEFAULT_RIG = {
      color: "#00ffcc",
      pelvis: {
         w: 0.850,
         h: 0.350,
         d: 0.520
      },
      torsoLower: {
         w: 0.9,
         h: 0.45,
         d: 0.55
      },
      torsoUpper: {
         w: 0.95,
         h: 0.71,
         d: 0.55
      },
      neck: {
         w: 0.25,
         h: 0.25,
         d: 0.25
      },
      head: {
         w: 0.45,
         h: 0.50,
         d: 0.45
      },
      arm: {
         upperW: 0.34,
         upperD: 0.34,
         upperLen: 0.75,
         foreW: 0.30,
         foreD: 0.27,
         foreLen: 0.70,
         handLen: 0.25
      },
      leg: {
         thighW: 0.45,
         thighD: 0.50,
         thighLen: 1.05,
         shinW: 0.33,
         shinD: 0.43,
         shinLen: 0.88,
         footW: 0.32,
         footH: 0.21,
         footLen: 0.75
      },
      transforms: {
         pelvis: t0(),
         torsoLower: t0(),
         torsoUpper: t0(),
         neck: t0(),
         head: t0(),
         shoulderL: {
            ...t0(),
            pos: {
               x: 0.65,
               y: 0.00,
               z: 0
            }
         },
         shoulderR: {
            ...t0(),
            pos: {
               x: -0.65,
               y: 0.00,
               z: 0
            }
         },
         armL_upper: t0(),
         armL_fore: t0(),
         armL_hand: t0(),
         armR_upper: t0(),
         armR_fore: t0(),
         armR_hand: t0(),
         hipL: {
            ...t0(),
            pos: {
               x: -0.25,
               y: -0.12,
               z: 0
            }
         },
         hipR: {
            ...t0(),
            pos: {
               x: 0.33,
               y: -0.12,
               z: 0
            }
         },
         legL_thigh: t0(),
         legL_shin: t0(),
         legL_foot: t0(),
         legR_thigh: t0(),
         legR_shin: t0(),
         legR_foot: t0(),
      }
   };

   function deepClone(o) {
      return JSON.parse(JSON.stringify(o));
   }

   // ensure transforms exist and are numeric
   function ensureRig(rig) {
      const r = rig && typeof rig === "object" ? rig : {};
      const out = deepClone(DEFAULT_RIG);

      // copy sizes if present
      ["pelvis", "torsoLower", "torsoUpper", "neck", "head"].forEach(k => {
         if (r[k]) Object.assign(out[k], r[k]);
      });
      if (r.arm) Object.assign(out.arm, r.arm);
      if (r.leg) Object.assign(out.leg, r.leg);

      // transforms
      out.transforms = out.transforms || {};
      const srcT = (r.transforms && typeof r.transforms === "object") ? r.transforms : {};
      for (const k of PART_KEYS) {
         const base = srcT[k] || {};
         const pos = base.pos || {},
            rot = base.rot || {};
         out.transforms[k] = {
            pos: {
               x: Number(pos.x) || out.transforms[k].pos.x,
               y: Number(pos.y) || out.transforms[k].pos.y,
               z: Number(pos.z) || out.transforms[k].pos.z
            },
            rot: {
               x: Number(rot.x) || 0,
               y: Number(rot.y) || 0,
               z: Number(rot.z) || 0
            }
         };
      }
      return out;
   }

   function loadRigParams() {
      try {
         const txt = localStorage.getItem(RIG_KEY);
         if (!txt) return deepClone(DEFAULT_RIG);
         return ensureRig(JSON.parse(txt));
      } catch {
         return deepClone(DEFAULT_RIG);
      }
   }

   // Load once on boot
   const RIG = loadRigParams();

   // ------- Game state -------
   const state = {
      ch: null,
      // live derived stats
      eff: {
         power: 0,
         agility: 0,
         focus: 0
      },
      maxHP: 100,
      hp: 100,
      nenMax: 100,
      nen: 100,
      baseNenRegen: 2.0,
      baseHpRegen: 0.0,

      buffs: {},
      cooldowns: {},
      vel: new BABYLON.Vector3(0, 0, 0),
      grounded: false,

      // Jump charging
      chargingJump: false,
      jumpChargeT: 0,

      // Nen charge (C)
      chargingNen: false,
      nenLight: null,

      // animation helpers
      attackAnimT: 0,

      // Specialist ult
      timeStop: false,
      ultDrainRate: 20,
      ultMinNen: 5,
      ultT: 0,
      ultMaxDur: 8,
   };

   // recompute all derived numbers from creator stats + level alloc
   function computeEffective() {
      const s = state.ch.stats;
      state.eff = {
         power: (s.power || 0) + (progress.alloc.power || 0),
         agility: (s.agility || 0) + (progress.alloc.agility || 0),
         focus: (s.focus || 0) + (progress.alloc.focus || 0)
      };
   }

   function recomputeDerived() {
      computeEffective();
      const e = state.eff;

      // Max pools + regen
      state.maxHP = 100 + e.power * 12;
      state.nenMax = 100 + e.focus * 12;
      state.baseHpRegen = 0.0 + e.power * 0.08;
      state.baseNenRegen = 2.0 + e.focus * 0.6;

      // clamp current values
      state.hp = clamp(state.hp, 0, state.maxHP);
      state.nen = clamp(state.nen, 0, state.nenMax);

      // cooldown scaling from Focus; dash from Agility
      COOLDOWNS.nenblast = 2.0 * (1 - e.focus * 0.04);
      COOLDOWNS.special = 10 * (1 - e.focus * 0.03);
      COOLDOWNS.dash = 2.6 * (1 - e.agility * 0.02);
   }

   function setupBabylon(canvas) {
      engine = new BABYLON.Engine(canvas, true, {
         stencil: true
      });
      scene = new BABYLON.Scene(engine);
      scene.collisionsEnabled = true;
      scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.10, 1.0);
      scene.ambientColor = new BABYLON.Color3(0.25, 0.25, 0.3);

      camera = new BABYLON.ArcRotateCamera("cam", Math.PI / 2, 1.1, 14, new BABYLON.Vector3(0, 2, 0), scene);
      camera.lowerRadiusLimit = 6;
      camera.upperRadiusLimit = 30;
      camera.upperBetaLimit = 1.45;
      camera.attachControl(canvas, true);
      camera.checkCollisions = true;
      camera.applyGravity = false;
      const pInput = camera.inputs.attached.pointers;
      if (pInput && pInput.buttons) {
         pInput.buttons = [2];
      }
      camera.panningSensibility = 0;
      window.addEventListener("contextmenu", e => e.preventDefault());

      new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.9;
      const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.35), scene);
      sun.position = new BABYLON.Vector3(30, 60, 30);
      sun.intensity = 1.1;

      const sky = BABYLON.MeshBuilder.CreateBox("sky", {
         size: 500
      }, scene);
      const skyMat = new BABYLON.StandardMaterial("skym", scene);
      skyMat.backFaceCulling = false;
      skyMat.disableLighting = true;
      skyMat.emissiveColor = new BABYLON.Color3(0.03, 0.05, 0.09);
      sky.material = skyMat;

      world.ground = BABYLON.MeshBuilder.CreateGround("ground", {
         width: world.size,
         height: world.size,
         subdivisions: 2
      }, scene);
      try {
         const grid = new BABYLON.GridMaterial("grid", scene);
         grid.gridRatio = 3;
         grid.majorUnitFrequency = 5;
         grid.minorUnitVisibility = 0.45;
         grid.opacity = 1;
         grid.color1 = new BABYLON.Color3(0.2, 0.6, 1.0);
         grid.color2 = new BABYLON.Color3(0.02, 0.05, 0.09);
         world.ground.material = grid;
      } catch (e) {
         const gmat = new BABYLON.StandardMaterial("gmat", scene);
         gmat.diffuseColor = new BABYLON.Color3(0.08, 0.12, 0.25);
         world.ground.material = gmat;
      }
      world.ground.checkCollisions = true;

      for (let i = 0; i < 16; i++) {
         const w = 6 + Math.random() * 10,
            d = 6 + Math.random() * 10,
            h = 2 + Math.random() * 4;
         const x = -world.size / 2 + 10 + Math.random() * (world.size - 20);
         const z = -world.size / 2 + 10 + Math.random() * (world.size - 20);
         const y = 2 + Math.random() * 12;
         const plt = BABYLON.MeshBuilder.CreateBox("plt" + i, {
            width: w,
            depth: d,
            height: h
         }, scene);
         plt.position.set(x, y, z);
         plt.checkCollisions = true;
         const pm = new BABYLON.StandardMaterial("pm" + i, scene);
         pm.diffuseColor = new BABYLON.Color3(0.12 + Math.random() * 0.15, 0.18 + Math.random() * 0.15, 0.45 + Math.random() * 0.3);
         pm.emissiveColor = new BABYLON.Color3(0.06, 0.08, 0.12);
         plt.material = pm;
         world.platforms.push(plt);
      }

      const p = createHumanoid(state.ch.color || "#00ffcc");
      playerRoot = player = p.root; // collider mesh
      playerRoot.position.copyFrom(startPos);
      player.checkCollisions = true;
      player.metadata = {
         parts: p.parts,
         animPhase: 0
      };

      state.nenLight = new BABYLON.PointLight("nenLight", playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)), scene);
      state.nenLight.intensity = 0.0;
      state.nenLight.diffuse = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");

      scene.registerBeforeRender(() => {
         camera.target = playerRoot.position.add(new BABYLON.Vector3(0, 0.9, 0));
         state.nenLight.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0));
      });

      spawnWave(6);

      window.addEventListener("keydown", e => {
         if (e.code === "Escape") {
            togglePause();
            return;
         }
         input[e.code] = true;
         inputOnce[e.code] = true;
      });
      window.addEventListener("keyup", e => {
         input[e.code] = false;
         inputUp[e.code] = true;
      });
      window.addEventListener("mousedown", (e) => {
         if (paused) return;
         if (e.button === 0) melee();
      });

      engine.runRenderLoop(() => {
         const now = performance.now();
         const dt = lastTime ? (now - lastTime) / 1000 : 0;
         lastTime = now;
         if (!paused) tick(dt);
         scene.render();
         inputOnce = {};
         inputUp = {};
      });
      window.addEventListener("resize", () => engine.resize());
   }

   function togglePause() {
      paused = !paused;
      hud.pauseOverlay.classList.toggle("visible", paused);
   }

   function startGame(ch) {
      state.ch = ch;
      saveCharacter(ch);
      // seed pools before recompute (so we don't clamp to zero)
      state.hp = state.maxHP;
      state.nen = state.nenMax;
      recomputeDerived(); // compute from (creator + alloc)
      // after recompute, fill to full
      state.hp = state.maxHP;
      state.nen = state.nenMax;

      updateHUD();
      msg("Defeat enemies to trigger the exit portal! Press L to open the Level menu.");
      const canvas = $("#game-canvas");
      setupBabylon(canvas);
      setTimeout(() => {
         try {
            canvas.focus();
         } catch (e) {}
      }, 0);
   }

   // ------------ Humanoid (segmented) ------------
   function createHumanoid(hex, rig = RIG) {
      const color = BABYLON.Color3.FromHexString(hex);

      function mat(c) {
         const m = new BABYLON.StandardMaterial("m" + Math.random(), scene);
         m.diffuseColor = c;
         m.emissiveColor = c.scale(0.16);
         return m;
      }

      // collider root
      const root = BABYLON.MeshBuilder.CreateBox("collider", {
         width: 0.85,
         height: 2.4,
         depth: 0.7
      }, scene);
      root.checkCollisions = true;
      root.isVisible = false;

      // helpers
      const nodes = {};

      function segY(parent, key, w, h, d, col) {
         const pivot = new BABYLON.TransformNode(key + "_pivot", scene);
         pivot.parent = parent;
         const mesh = BABYLON.MeshBuilder.CreateBox(key, {
            width: w,
            height: h,
            depth: d
         }, scene);
         mesh.material = mat(col);
         mesh.parent = pivot;
         mesh.position.y = -h * 0.5;
         nodes[key] = pivot;
         return {
            pivot,
            mesh
         };
      }

      function foot(parent, key, w, h, len, col) {
         const pivot = new BABYLON.TransformNode(key + "_pivot", scene);
         pivot.parent = parent;
         const mesh = BABYLON.MeshBuilder.CreateBox(key, {
            width: w,
            height: h,
            depth: len
         }, scene);
         mesh.material = mat(col);
         mesh.parent = pivot;
         mesh.position.y = -h * 0.5;
         mesh.position.z = len * 0.5;
         nodes[key] = pivot;
         return {
            pivot,
            mesh
         };
      }

      // sizes from rig
      const s = rig;

      // torso chain
      const pelvis = segY(root, "pelvis", s.pelvis.w, s.pelvis.h, s.pelvis.d, color);
      const torsoLower = segY(pelvis.pivot, "torsoLower", s.torsoLower.w, s.torsoLower.h, s.torsoLower.d, color);
      torsoLower.pivot.position.y = 0.30;
      const torsoUpper = segY(torsoLower.pivot, "torsoUpper", s.torsoUpper.w, s.torsoUpper.h, s.torsoUpper.d, color.scale(0.9));
      torsoUpper.pivot.position.y = 0.55;
      const neck = segY(torsoUpper.pivot, "neck", s.neck.w, s.neck.h, s.neck.d, color.scale(0.85));
      neck.pivot.position.y = 0.55;

      // head pivot so we can transform the head
      const headPivot = new BABYLON.TransformNode("head_pivot", scene);
      headPivot.parent = neck.pivot;
      nodes["head"] = headPivot;
      const headM = BABYLON.MeshBuilder.CreateBox("head", {
         width: s.head.w,
         height: s.head.h,
         depth: s.head.d
      }, scene);
      headM.material = mat(color.scale(0.8));
      headM.parent = headPivot;
      headM.position.y = s.head.h * 0.5;

      // shoulders (anchors)
      const shoulderL = new BABYLON.TransformNode("shoulderL", scene);
      shoulderL.parent = torsoUpper.pivot;
      nodes["shoulderL"] = shoulderL;
      const shoulderR = new BABYLON.TransformNode("shoulderR", scene);
      shoulderR.parent = torsoUpper.pivot;
      nodes["shoulderR"] = shoulderR;

      // arms
      const a = s.arm;
      const armL = {};
      armL.upper = segY(shoulderL, "armL_upper", a.upperW, a.upperLen, a.upperD, color.scale(0.9));
      armL.fore = segY(armL.upper.pivot, "armL_fore", a.foreW, a.foreLen, a.foreD, color.scale(0.8));
      armL.hand = segY(armL.fore.pivot, "armL_hand", a.foreW, a.handLen, a.foreD, color.scale(0.75));

      const armR = {};
      armR.upper = segY(shoulderR, "armR_upper", a.upperW, a.upperLen, a.upperD, color.scale(0.9));
      armR.fore = segY(armR.upper.pivot, "armR_fore", a.foreW, a.foreLen, a.foreD, color.scale(0.8));
      armR.hand = segY(armR.fore.pivot, "armR_hand", a.foreW, a.handLen, a.foreD, color.scale(0.75));

      // hips (anchors)
      const hipL = new BABYLON.TransformNode("hipL", scene);
      hipL.parent = pelvis.pivot;
      nodes["hipL"] = hipL;
      const hipR = new BABYLON.TransformNode("hipR", scene);
      hipR.parent = pelvis.pivot;
      nodes["hipR"] = hipR;

      // legs
      const l = s.leg;
      const legL = {};
      legL.thigh = segY(hipL, "legL_thigh", l.thighW, l.thighLen, l.thighD, color.scale(0.85));
      legL.shin = segY(legL.thigh.pivot, "legL_shin", l.shinW, l.shinLen, l.shinD, color.scale(0.8));
      legL.foot = foot(legL.shin.pivot, "legL_foot", l.footW, l.footH, l.footLen, color.scale(0.75));

      const legR = {};
      legR.thigh = segY(hipR, "legR_thigh", l.thighW, l.thighLen, l.thighD, color.scale(0.85));
      legR.shin = segY(legR.thigh.pivot, "legR_shin", l.shinW, l.shinLen, l.shinD, color.scale(0.8));
      legR.foot = foot(legR.shin.pivot, "legR_foot", l.footW, l.footH, l.footLen, color.scale(0.75));

      // apply transforms (absolute, same as editor)
      const T = rig.transforms || {};

      function apply(key) {
         const n = nodes[key];
         if (!n) return;
         const tr = T[key] || t0();
         n.position.set(tr.pos.x || 0, tr.pos.y || 0, tr.pos.z || 0);
         n.rotation.set(d2r(tr.rot.x || 0), d2r(tr.rot.y || 0), d2r(tr.rot.z || 0));
      }
      PART_KEYS.forEach(apply);

      // expose parts for animation
      const parts = {
         pelvis: pelvis.pivot,
         lowerTorso: torsoLower.pivot,
         upperTorso: torsoUpper.pivot,
         neck: neck.pivot,
         head: headM,
         armL: {
            shoulder: armL.upper.pivot,
            elbow: armL.fore.pivot,
            wrist: armL.hand.pivot
         },
         armR: {
            shoulder: armR.upper.pivot,
            elbow: armR.fore.pivot,
            wrist: armR.hand.pivot
         },
         legL: {
            hip: legL.thigh.pivot,
            knee: legL.shin.pivot,
            ankle: legL.foot.pivot
         },
         legR: {
            hip: legR.thigh.pivot,
            knee: legR.shin.pivot,
            ankle: legR.foot.pivot
         }
      };

      root.metadata = {
         parts,
         animPhase: 0
      };
      return {
         root,
         parts
      };
   }

   // ------------ Enemies ------------
   function createEnemy(pos) {
      const h = createHumanoid("#f24d7a");
      h.root.position.copyFrom(pos);
      const e = {
         root: h.root,
         parts: h.parts,
         hp: 40 + rand(0, 20),
         speed: 3.2 + rand(0, 1.2),
         alive: true,
         attackCd: 0,
         vel: new BABYLON.Vector3(0, 0, 0),
         grounded: false,
         prevPos: h.root.position.clone(),
         animPhase: 0,
         attackAnimT: 0
      };
      h.root.metadata = {
         parts: h.parts,
         animPhase: 0
      };
      return e;
   }

   function spawnWave(n) {
      for (let i = 0; i < n; i++) {
         const x = rand(-world.size / 3, world.size / 3),
            z = rand(-world.size / 3, world.size / 3),
            y = 2 + rand(0, 8);
         enemies.push(createEnemy(new BABYLON.Vector3(x, y, z)));
      }
   }

   // ------------ Combat / Abilities ------------
   function takeDamage(amount) {
      state.hp = Math.max(0, state.hp - amount);
      hud.health.style.width = `${(state.hp/state.maxHP)*100}%`;
      if (state.hp <= 0) {
         msg("You were defeated!");
      }
   }

   function spendNen(cost) {
      if (state.nen < cost) return false;
      state.nen -= cost;
      hud.nenbar.style.width = `${(state.nen/state.nenMax)*100}%`;
      return true;
   }

   function melee() {
      if (cdActive("meleehit")) return;
      setCooldown("meleehit", COOLDOWNS.meleehit);
      state.attackAnimT = 0.22;
      const range = 2.0;
      let base = 10 + (state.eff.power * 1.5) * (state.ch.nen === "Enhancer" ? 1.25 : 1);
      const mult = 1.0;
      let dmg = base * mult;
      if (state.buffs.electrify) dmg += 6;
      if (state.buffs.berserk) dmg *= 1.25;
      enemies.forEach(e => {
         if (!e.alive) return;
         const d = BABYLON.Vector3.Distance(e.root.position, playerRoot.position);
         if (d < range) {
            e.hp -= dmg;
            if (e.hp <= 0) {
               e.alive = false;
               e.root.dispose();
               gainXP(30 + Math.floor(rand(0, 10)));
            }
         }
      });
   }

   function playerForward() {
      const v = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
      v.y = 0;
      return v.normalize();
   }

   function playerMoveDir() {
      const fwd = playerForward();
      const right = camera.getDirection(new BABYLON.Vector3(1, 0, 0));
      right.y = 0;
      right.normalize();
      const dir = new BABYLON.Vector3(0, 0, 0);
      if (input["KeyW"]) dir.addInPlace(fwd);
      if (input["KeyS"]) dir.addInPlace(fwd.scale(-1));
      if (input["KeyA"]) dir.addInPlace(right.scale(-1));
      if (input["KeyD"]) dir.addInPlace(right);
      if (dir.lengthSquared() > 0) dir.normalize();
      return dir;
   }

   // Charged Jump (tap=2x height; full=4x; drains Nen while held)
   const JUMP_MAX_T = 3.0,
      JUMP_NEN_DRAIN = 12.0;

   function startJumpCharge() {
      if (state.chargingJump || !state.grounded) return;
      state.chargingJump = true;
      state.jumpChargeT = 0;
   }

   function updateJumpCharge(dt) {
      if (!state.chargingJump) return;
      const drain = JUMP_NEN_DRAIN * dt;
      if (state.nen <= 0) {
         performJump();
         return;
      }
      state.nen = Math.max(0, state.nen - drain);
      hud.nenbar.style.width = `${(state.nen/state.nenMax)*100}%`;
      state.jumpChargeT = Math.min(JUMP_MAX_T, state.jumpChargeT + dt);
      if (state.nenLight) state.nenLight.intensity = 0.2 + 0.6 * (state.jumpChargeT / JUMP_MAX_T);
   }

   function performJump() {
      if (!state.chargingJump) return;
      const baseV = 9 + state.eff.agility * 0.35;
      const t = state.jumpChargeT;
      const scale = 1.414 + (2.0 - 1.414) * (t / JUMP_MAX_T);
      state.vel.y = baseV * scale;
      state.grounded = false;
      state.chargingJump = false;
      state.jumpChargeT = 0;
      if (state.nenLight) state.nenLight.intensity = 0.0;
   }

   // Projectiles with manual hit tests
   function blast() {
      if (cdActive("nenblast")) return;
      const cost = 18 * (state.ch.nen === "Emitter" ? 0.75 : 1);
      if (!spendNen(cost)) {
         msg("Not enough Nen for blast.");
         return;
      }
      setCooldown("nenblast", COOLDOWNS.nenblast);
      const dir = playerForward().normalize();
      const orb = BABYLON.MeshBuilder.CreateSphere("blast", {
         diameter: 0.5
      }, scene);
      orb.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)).add(dir.scale(1.1));
      const om = new BABYLON.StandardMaterial("om", scene);
      const c = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");
      om.emissiveColor = c;
      om.diffuseColor = c.scale(0.2);
      orb.material = om;
      orb.checkCollisions = false;
      orb.isPickable = false;
      const speed = 12 + state.eff.focus * 0.6;
      const life = {
         t: 3.0
      };
      const dmg = (18 + state.eff.focus * 2.0 * (state.ch.nen === "Emitter" ? 1.35 : 1));
      projectiles.push({
         mesh: orb,
         dir,
         speed,
         life,
         dmg,
         radius: 0.55
      });
   }

   function dash() {
      if (cdActive("dash")) return;
      setCooldown("dash", COOLDOWNS.dash);
      const dir = playerMoveDir().normalize();
      if (dir.length() < 0.1) return;
      const boost = 10 + state.eff.agility * 0.8;
      state.vel.x += dir.x * boost;
      state.vel.z += dir.z * boost;
   }

   function special() {
      if (cdActive("special")) return;
      switch (state.ch.nen) {
         case "Conjurer":
            if (!spendNen(25)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            state.buffs.shield = 6;
            msg("Conjured shield!");
            break;
         case "Manipulator":
            if (!spendNen(20)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            const t = nearestEnemy();
            if (t) {
               t.charmed = 5;
               msg("Charmed an enemy!");
            }
            break;
         case "Specialist":
            if (state.timeStop) return;
            if (state.nen <= state.ultMinNen + 5) {
               msg("Not enough Nen for time distortion.");
               return;
            }
            state.timeStop = true;
            state.ultT = 0;
            msg("Time distorted! (Auto-ends as Nen drains)");
            break;
         case "Transmuter":
            if (!spendNen(22)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            state.buffs.electrify = 6;
            msg("Electrified strikes!");
            break;
         case "Enhancer":
            if (!spendNen(20)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            state.buffs.berserk = 6;
            msg("Berserk mode!");
            break;
         case "Emitter":
            if (!spendNen(24)) {
               msg("Not enough Nen.");
               return;
            }
            setCooldown("special", COOLDOWNS.special);
            for (let i = -2; i <= 2; i++) {
               const dir = playerForward().normalize().add(new BABYLON.Vector3(i * 0.15, 0, 0));
               const orb = BABYLON.MeshBuilder.CreateSphere("blast", {
                  diameter: 0.45
               }, scene);
               orb.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)).add(dir.scale(1.1));
               const om = new BABYLON.StandardMaterial("om", scene);
               const c = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");
               om.emissiveColor = c;
               orb.material = om;
               orb.checkCollisions = false;
               orb.isPickable = false;
               const speed = 11 + state.eff.focus * 0.5;
               const life = {
                  t: 3.0
               };
               const dmg = (12 + state.eff.focus * 1.6);
               projectiles.push({
                  mesh: orb,
                  dir,
                  speed,
                  life,
                  dmg,
                  radius: 0.5
               });
            }
            msg("Emitter volley!");
            break;
      }
   }

   function nearestEnemy() {
      let best = null,
         bd = 1e9;
      enemies.forEach(e => {
         if (!e.alive) return;
         const d = BABYLON.Vector3.Distance(e.root.position, playerRoot.position);
         if (d < bd) {
            bd = d;
            best = e;
         }
      });
      return best;
   }

   // ------------ Anim helpers ------------
   function updateWalkAnim(rootMesh, speed, grounded, dt, attackT = 0) {
      const P = rootMesh.metadata?.parts;
      if (!P) return;
      const phPrev = rootMesh.metadata.animPhase || 0;
      const ph = phPrev + (grounded ? speed * 4.8 : speed * 2.4) * dt * ANIM_SPEED;
      rootMesh.metadata.animPhase = ph;

      const swing = grounded ? Math.sin(ph) * 0.7 : 0.3 * Math.sin(ph * 0.6);
      const armSwing = swing * 0.8;

      P.legL.hip.rotation.x = swing;
      P.legR.hip.rotation.x = -swing;
      const kneeL = Math.max(0, -Math.sin(ph)) * 1.1;
      const kneeR = Math.max(0, Math.sin(ph)) * 1.1;
      P.legL.knee.rotation.x = kneeL;
      P.legR.knee.rotation.x = kneeR;
      P.legL.ankle.rotation.x = -kneeL * 0.35 + 0.1 * Math.sin(ph * 2);
      P.legR.ankle.rotation.x = -kneeR * 0.35 - 0.1 * Math.sin(ph * 2);

      P.armL.shoulder.rotation.x = -armSwing;
      P.armR.shoulder.rotation.x = armSwing;
      const elbowL = Math.max(0, Math.sin(ph)) * 0.6;
      const elbowR = Math.max(0, -Math.sin(ph)) * 0.6;
      P.armL.elbow.rotation.x = elbowL;
      P.armR.elbow.rotation.x = elbowR;
      P.armL.wrist.rotation.x = -elbowL * 0.4;
      P.armR.wrist.rotation.x = -elbowR * 0.4;

      if (!grounded) {
         P.armL.shoulder.rotation.x = 0.5;
         P.armR.shoulder.rotation.x = 0.5;
         P.legL.knee.rotation.x = Math.max(P.legL.knee.rotation.x, 0.4);
         P.legR.knee.rotation.x = Math.max(P.legR.knee.rotation.x, 0.4);
         P.legL.ankle.rotation.x = 0.15;
         P.legR.ankle.rotation.x = 0.15;
      }

      if (attackT > 0) {
         const t = Math.min(1, attackT / 0.22);
         const k = Math.sin(t * Math.PI);
         P.armR.shoulder.rotation.x = -1.6 * k;
         P.armR.elbow.rotation.x = 0.2 * (1 - k);
         P.armR.wrist.rotation.x = 0.12;
      }

      P.lowerTorso.rotation.x = 0.05 * Math.sin(ph * 2) * (grounded ? 1 : 0.3);
      P.upperTorso.rotation.x = 0.03 * Math.sin(ph * 2 + 0.4) * (grounded ? 1 : 0.3);
      P.neck.rotation.x = -0.03 * Math.sin(ph * 2 + 0.2);
   }

   // ------------ Main loop ------------
   function tick(dt) {
      // cooldowns & buffs
      Object.keys(state.cooldowns).forEach(k => {
         state.cooldowns[k].t = Math.max(0, state.cooldowns[k].t - dt);
         if (state.cooldowns[k].t === 0) delete state.cooldowns[k];
      });
      updateCooldownUI();
      Object.keys(state.buffs).forEach(k => {
         state.buffs[k] -= dt;
         if (state.buffs[k] <= 0) delete state.buffs[k];
      });

      // inputs / abilities
      if (inputOnce["Space"]) startJumpCharge();
      if (input["Space"]) updateJumpCharge(dt);
      if (inputUp["Space"]) performJump();
      if (input["KeyQ"]) blast();
      if (input["ShiftLeft"] || input["ShiftRight"]) dash();
      if (input["KeyE"]) special();

      // Nen charge (hold C)
      if (input["KeyC"]) {
         if (!state.chargingNen) {
            state.chargingNen = true;
            if (state.nenLight) state.nenLight.intensity = 0.8;
         }
      } else if (state.chargingNen) {
         state.chargingNen = false;
         if (state.nenLight) state.nenLight.intensity = 0.0;
      }

      // movement + rotation
      const moveDir = playerMoveDir();
      let moveSpeed = 7 + state.eff.agility * 0.6;
      if (state.buffs.berserk) moveSpeed *= 1.35;
      const moveVec = moveDir.scale(moveSpeed * dt);
      state.vel.y += world.gravityY * dt;
      const motion = new BABYLON.Vector3(moveVec.x + state.vel.x * dt, state.vel.y * dt, moveVec.z + state.vel.z * dt);
      player.moveWithCollisions(motion);
      const lastPos = playerRoot.position.clone();
      playerRoot.position.copyFrom(player.position);
      state.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
      state.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
      if (moveDir.lengthSquared() > 0.0001) {
         const targetYaw = Math.atan2(moveDir.x, moveDir.z);
         playerRoot.rotation.y = BABYLON.Scalar.LerpAngle(playerRoot.rotation.y, targetYaw, 1 - Math.pow(0.001, dt * 60));
      }

      // ground check
      const ray = new BABYLON.Ray(player.position, new BABYLON.Vector3(0, -1, 0), 1.1);
      const pick = scene.pickWithRay(ray, (m) => m === world.ground || world.platforms.includes(m));
      const wasGrounded = state.grounded;
      state.grounded = !!pick.hit && state.vel.y <= 0.1;
      if (state.grounded) {
         if (!wasGrounded) {
            player.moveWithCollisions(new BABYLON.Vector3(0, 0.02, 0));
         }
         if (state.vel.y < 0) state.vel.y = 0;
      }

      // passive regen
      state.nen = clamp(state.nen + state.baseNenRegen * dt + (state.chargingNen ? 4.0 * dt : 0), 0, state.nenMax);
      hud.nenbar.style.width = `${(state.nen/state.nenMax)*100}%`;
      state.hp = clamp(state.hp + state.baseHpRegen * dt, 0, state.maxHP);
      hud.health.style.width = `${(state.hp/state.maxHP)*100}%`;

      // Specialist ult drain
      if (state.timeStop) {
         state.ultT += dt;
         state.nen = Math.max(0, state.nen - state.ultDrainRate * dt);
         hud.nenbar.style.width = `${(state.nen/state.nenMax)*100}%`;
         if (state.nen <= state.ultMinNen || state.ultT >= state.ultMaxDur) {
            state.timeStop = false;
            setCooldown("special", COOLDOWNS.special);
            msg("Time resumes!");
         }
      }

      // projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
         const p = projectiles[i];
         p.life.t -= dt;
         if (p.life.t <= 0) {
            p.mesh.dispose();
            projectiles.splice(i, 1);
            continue;
         }
         p.mesh.position.addInPlace(p.dir.scale(p.speed * dt));
         for (const e of enemies) {
            if (!e.alive) continue;
            if (BABYLON.Vector3.Distance(e.root.position, p.mesh.position) < 0.9 + p.radius * 0.5) {
               e.hp -= p.dmg;
               p.life.t = 0;
               if (e.hp <= 0) {
                  e.alive = false;
                  e.root.dispose();
                  gainXP(30 + Math.floor(rand(0, 10)));
               }
               break;
            }
         }
      }

      // enemies AI
      for (const e of enemies) {
         if (!e.alive) continue;
         const toP2 = playerRoot.position.subtract(e.root.position);
         toP2.y = 0;
         const dist2d = toP2.length();
         if (dist2d > 0.001) {
            const yaw = Math.atan2(toP2.x, toP2.z);
            e.root.rotation.y = BABYLON.Scalar.LerpAngle(e.root.rotation.y, yaw, 1 - Math.pow(0.001, dt * 60));
         }

         if (!state.timeStop) {
            const toP = playerRoot.position.subtract(e.root.position);
            const dist = toP.length();
            if (dist > 1.6) {
               const dir = toP.normalize();
               const step = dir.scale(e.speed * dt);
               e.vel.y += world.gravityY * dt;
               const motionE = new BABYLON.Vector3(step.x + e.vel.x * dt, e.vel.y * dt, step.z + e.vel.z * dt);
               e.root.moveWithCollisions(motionE);
               e.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
               e.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
               if (e.grounded && Math.random() < 0.005) e.vel.y = 7 + Math.random() * 2;
            } else {
               e.attackCd -= dt;
               if (e.attackCd <= 0) {
                  const dmg = state.buffs.shield ? 6 : 12;
                  takeDamage(dmg);
                  e.attackCd = 1.2;
                  e.attackAnimT = 0.22;
               }
            }
         } else {
            e.vel.x = 0;
            e.vel.z = 0;
            e.vel.y += world.gravityY * dt * 0.1;
            e.root.moveWithCollisions(new BABYLON.Vector3(0, e.vel.y * dt, 0));
         }

         const rayE = new BABYLON.Ray(e.root.position, new BABYLON.Vector3(0, -1, 0), 1.1);
         const pickE = scene.pickWithRay(rayE, (m) => m === world.ground || world.platforms.includes(m));
         const wasG = e.grounded;
         e.grounded = !!pickE.hit && e.vel.y <= 0.1;
         if (e.grounded && e.vel.y < 0) e.vel.y = 0;
         if (e.grounded && !wasG) {
            e.root.moveWithCollisions(new BABYLON.Vector3(0, 0.02, 0));
         }

         const deltaXZ = e.root.position.subtract(e.prevPos);
         deltaXZ.y = 0;
         const spd = deltaXZ.length() / Math.max(dt, 1e-4);
         updateWalkAnim(e.root, spd * 0.12, e.grounded, dt, e.attackAnimT);
         if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
         e.prevPos.copyFrom(e.root.position);
      }

      // player walk anim
      const playerDelta = playerRoot.position.subtract(lastPos);
      playerDelta.y = 0;
      const playerSpd = playerDelta.length() / Math.max(dt, 1e-4);
      updateWalkAnim(playerRoot, playerSpd * 0.12, state.grounded, dt, state.attackAnimT);
      if (state.attackAnimT > 0) state.attackAnimT = Math.max(0, state.attackAnimT - dt);

      // wave clear / exit
      if (enemies.length && enemies.every(e => !e.alive)) {
         msg("Wave cleared! A glowing exit cube appeared — touch it to finish.");
         if (!scene.getMeshByName("exit")) {
            const exit = BABYLON.MeshBuilder.CreateBox("exit", {
               size: 1.5
            }, scene);
            exit.position = new BABYLON.Vector3(-8 + Math.random() * 16, 2.2, -8 + Math.random() * 16);
            const em = new BABYLON.StandardMaterial("xm", scene);
            em.emissiveColor = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc").scale(1.0);
            exit.material = em;
         } else {
            const exit = scene.getMeshByName("exit");
            if (BABYLON.Vector3.Distance(playerRoot.position, exit.position) < 1.8) {
               exit.dispose();
               msg("Next wave!");
               spawnWave(8);
               state.hp = Math.min(state.maxHP, state.hp + 20);
               hud.health.style.width = `${(state.hp/state.maxHP)*100}%`;
               state.nen = Math.min(state.nenMax, state.nen + 30);
               hud.nenbar.style.width = `${(state.nen/state.nenMax)*100}%`;
            }
         }
      }

      if (inputOnce["KeyL"]) {
         openLevelMenu();
      }
   }

   // ---------- Level menu ----------
   function openLevelMenu() {
      paused = true;
      hud.lvOverlay.classList.add("visible");
      hud.lvCur.textContent = progress.level;
      hud.lvUnspent.textContent = progress.unspent;
      Object.keys(progress.alloc).forEach(k => hud.statSpans[k].textContent = progress.alloc[k] ?? 0);
   }
   hud.lvClose?.addEventListener("click", () => {
      hud.lvOverlay.classList.remove("visible");
      paused = false;
   });
   hud.plusBtns().forEach(btn => btn.addEventListener("click", () => {
      if (progress.unspent <= 0) return;
      const stat = btn.getAttribute("data-stat");
      progress.alloc[stat] = (progress.alloc[stat] || 0) + 1;
      progress.unspent -= 1;
      recomputeDerived(); // update pools/regen/cooldowns from new totals
      updateHUD();
      hud.lvUnspent.textContent = progress.unspent;
      hud.statSpans[stat].textContent = progress.alloc[stat];
      saveProgress();
   }));

   // Pause UI
   hud.btnResume?.addEventListener("click", () => {
      paused = false;
      hud.pauseOverlay.classList.remove("visible");
   });
   hud.btnExit?.addEventListener("click", () => {
      paused = false;
      try {
         engine.stopRenderLoop();
         engine.dispose();
      } catch (e) {};
      document.getElementById("screen--game").classList.remove("visible");
      document.getElementById("screen--menu").classList.add("visible");
   });

   // Public API
   window.HXH = {
      startGame
   };
})();


// ===== Menu wiring =====
(function () {
   const scrMenu = document.getElementById("screen--menu");
   const btnResume = document.getElementById("btn-resume");
   const btnNew = document.getElementById("btn-new");
   const btnRig = document.getElementById("btn-rig");

   function showMenu() {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
      scrMenu.classList.add("visible");
      // show Resume only if we have a character saved
      if (btnResume) btnResume.hidden = !window.hasSave();
      // start menu background
      window.MenuBG && window.MenuBG.start();
   }

   btnResume?.addEventListener("click", () => {
      const ch = window.loadCharacter();
      if (!ch) {
         alert("No save found.");
         return;
      }
      window.MenuBG && window.MenuBG.stop();
      document.getElementById("screen--menu").classList.remove("visible");
      window.HXH.startGame(ch);
   });

	btnNew?.addEventListener("click", () => {
	  if (window.hasSave?.() && !confirm("Start a new game? This will reset your progress and character.")) return;
	  window.wipeSave?.();
	  window.MenuBG?.stop();

	  // hide all screens
	  document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));

	  // show the creator (your HTML id)
	  const create = document.getElementById("screen--creator");
	  if (!create) {
		alert('Could not find the character creation screen (screen--creator).');
		return;
	  }
	  create.classList.add("visible");

	  // wire the creator UI
	  window.CharacterUI?.boot?.();
	});



   btnRig?.addEventListener("click", () => {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
      document.getElementById("screen--rig").classList.add("visible");
      window.MenuBG && window.MenuBG.stop();
      window.RigEditor && window.RigEditor.boot();
   });

   // first load -> decide whether to show Resume
   document.addEventListener("DOMContentLoaded", showMenu);
})();