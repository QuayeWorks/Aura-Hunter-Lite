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
      btnExit: document.querySelector("#pause-overlay #btn-exit"),
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

   const HUD_BAR_EPS = 0.0025;
   const COOLDOWN_UI_INTERVAL = 1 / 30;
   const hudState = {
      bars: {
         health: -1,
         nen: -1,
         xp: -1
      },
      cooldowns: {
         nenblast: { active: false, pct: -1 },
         special: { active: false, pct: -1 },
         dash: { active: false, pct: -1 }
      }
   };
   let cooldownUiAccumulator = COOLDOWN_UI_INTERVAL;

   const isTouchDevice = (() => {
      if (typeof window === "undefined") return false;
      const hasTouch = "ontouchstart" in window || (typeof navigator !== "undefined" && (
         ("maxTouchPoints" in navigator && navigator.maxTouchPoints > 0) ||
         ("msMaxTouchPoints" in navigator && navigator.msMaxTouchPoints > 0)
      ));
      const coarseMatch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      return hasTouch || coarseMatch;
   })();

   const mobileUI = {
      container: $("#mobile-controls"),
      joystick: $("#mobile-joystick"),
      thumb: $("#mobile-joystick-thumb"),
      buttons: {
         attack: $("#mc-attack"),
         jump: $("#mc-jump"),
         dash: $("#mc-dash"),
         blast: $("#mc-blast"),
         special: $("#mc-special"),
         nen: $("#mc-nen")
      }
   };

   const mobileMove = { x: 0, y: 0, active: false };
   let mobileControlsInitialized = false;

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
   let startPos = new BABYLON.Vector3(0, 3, 0);
   const world = {
      size: 100,
      gravityY: -28,
      ground: null,
      platforms: []
   };

   const TERRAIN_LAYER_DEFS = [
      { key: "bedrock", color: [0.5, 0.5, 0.56], emissive: [0.14, 0.14, 0.16], destructible: false },
      { key: "dirt", color: [0.5, 0.34, 0.2], emissive: [0.1, 0.06, 0.03], destructible: true },
      { key: "grass", color: [0.32, 0.62, 0.3], emissive: [0.1, 0.22, 0.1], destructible: true }
   ];

   const defaultTerrainSettings = {
      length: 32,
      width: 32,
      cubeSize: 1.2,
      activeRadius: 48,
      streamingPadding: 6,
      layers: TERRAIN_LAYER_DEFS.length
   };

   const TERRAIN_SETTINGS_KEY = "hxh-terrain-settings";

   function clampSetting(value, min, max, fallback) {
      if (!Number.isFinite(value)) return fallback;
      return clamp(value, min, max);
   }

   function normalizeTerrainSettings(next = {}) {
      const out = { ...defaultTerrainSettings };
      if (typeof next.length === "number") out.length = Math.round(clampSetting(next.length, 8, 256, defaultTerrainSettings.length));
      if (typeof next.width === "number") out.width = Math.round(clampSetting(next.width, 8, 256, defaultTerrainSettings.width));
      if (typeof next.cubeSize === "number") out.cubeSize = clampSetting(next.cubeSize, 0.5, 4, defaultTerrainSettings.cubeSize);
      if (typeof next.activeRadius === "number") out.activeRadius = clampSetting(next.activeRadius, 6, 300, defaultTerrainSettings.activeRadius);
      if (typeof next.streamingPadding === "number") out.streamingPadding = clampSetting(next.streamingPadding, 2, 60, defaultTerrainSettings.streamingPadding);
      out.layers = TERRAIN_LAYER_DEFS.length;
      return out;
   }

   function loadTerrainSettings() {
      if (typeof localStorage === "undefined") return { ...defaultTerrainSettings };
      try {
         const raw = localStorage.getItem(TERRAIN_SETTINGS_KEY);
         if (!raw) return { ...defaultTerrainSettings };
         const parsed = JSON.parse(raw);
         return normalizeTerrainSettings(parsed);
      } catch (err) {
         return { ...defaultTerrainSettings };
      }
   }

   const savedTerrainSettings = normalizeTerrainSettings(loadTerrainSettings());

   const environment = {
      seed: 1,
      time: 0,
      dayLength: 160,
      sky: null,
      skyMaterial: null,
      sun: null,
      moon: null,
      sunMesh: null,
      moonMesh: null,
      hemi: null,
      clouds: [],
      trees: [],
      terrain: null,
      terrainSettings: { ...savedTerrainSettings },
      updateAccumulator: 0,
      updateInterval: 1 / 24
   };

   let fallbackTreeMaterials = null;

   const GameSettings = {
      getTerrainSettings() {
         return { ...environment.terrainSettings };
      },
      setTerrainSettings(update) {
         const merged = normalizeTerrainSettings({ ...environment.terrainSettings, ...update });
         environment.terrainSettings = merged;
         saveTerrainSettings(merged);
         if (environment.terrain) {
            environment.terrain.settings = { ...merged };
         }
         return merged;
      },
      resetTerrainSettings() {
         const merged = normalizeTerrainSettings(defaultTerrainSettings);
         environment.terrainSettings = merged;
         saveTerrainSettings(merged);
         if (environment.terrain) {
            environment.terrain.settings = { ...merged };
         }
         return merged;
      }
   };
   const SKY_RADIUS = 420;
   const VEC3_UP = new BABYLON.Vector3(0, 1, 0);
   const VEC3_DOWN = new BABYLON.Vector3(0, -1, 0);
   const GROUND_STICK_THRESHOLD = 0.35;
   const FOOT_CLEARANCE = 0.012;
   const IK_POS_EPS = 1e-4;
   const IK_ROT_EPS = 0.0015;
   const IK_IDLE_FRAME_LIMIT = 3;
   const TMP_PLAYER_MOVE_DIR = new BABYLON.Vector3();
   const TMP_PLAYER_MOVE_VEC = new BABYLON.Vector3();
   const TMP_PLAYER_MOTION = new BABYLON.Vector3();
   const TMP_PLAYER_DELTA = new BABYLON.Vector3();
   const TMP_ENEMY_TO_PLAYER = new BABYLON.Vector3();
   const TMP_ENEMY_DELTA = new BABYLON.Vector3();
   const TMP_IK_DELTA = new BABYLON.Vector3();
   const TMP_IK_ORIGIN = new BABYLON.Vector3();
   const lerp = (a, b, t) => a + (b - a) * t;
   const ENEMY_ACTIVE_RADIUS = 42;
   const ENEMY_RENDER_RADIUS = 60;
   const ENEMY_ACTIVE_RADIUS_SQ = ENEMY_ACTIVE_RADIUS * ENEMY_ACTIVE_RADIUS;
   const ENEMY_RENDER_RADIUS_SQ = ENEMY_RENDER_RADIUS * ENEMY_RENDER_RADIUS;
   const BLOODLUST_CONE_COS = Math.cos(Math.PI / 4);
   const BLOODLUST_RANGE_SQ = 16 * 16;
   const BLOODLUST_WEAK_HP = 55;

   function isGroundMesh(mesh) {
      if (!mesh) return false;
      const meta = mesh.metadata;
      if (meta && meta.terrainBlock && !meta.terrainBlock.destroyed && mesh.isEnabled && mesh.isEnabled()) return true;
      return world.platforms.includes(mesh);
   }

   function resolveGrounding(mesh, velY) {
      if (!scene || !mesh || mesh.isDisposed()) {
         return {
            grounded: false,
            correction: 0,
            normal: VEC3_UP,
            distance: Infinity,
            hitPointY: -Infinity
         };
      }
      mesh.computeWorldMatrix(true);
      const boundingInfo = mesh.getBoundingInfo();
      boundingInfo.update(mesh.getWorldMatrix());
      const groundY = getTerrainHeight(mesh.position.x, mesh.position.z);
      if (groundY === null) {
         return {
            grounded: false,
            correction: 0,
            normal: VEC3_UP,
            distance: Infinity,
            hitPointY: -Infinity
         };
      }
      const bottom = boundingInfo.boundingBox.minimumWorld.y;
      const distToGround = bottom - groundY;
      const grounded = velY <= 0.4 && distToGround <= GROUND_STICK_THRESHOLD;
      const desiredMin = groundY + FOOT_CLEARANCE;
      const correction = grounded ? Math.max(0, desiredMin - bottom) : 0;
      return {
         grounded,
         correction,
         normal: VEC3_UP,
         distance: distToGround,
         hitPointY: groundY
      };
   }

   function applyFootIK(rootMesh, grounded) {
      if (!rootMesh || !scene) return;
      const meta = rootMesh.metadata;
      if (!meta || !meta.footIK) return;
      let ikState = meta._ikState;
      if (!ikState) {
         ikState = {
            pos: rootMesh.position.clone(),
            yaw: rootMesh.rotation.y,
            grounded,
            idleFrames: 0
         };
         meta._ikState = ikState;
      }
      let skipIK = false;
      if (grounded && ikState.grounded) {
         TMP_IK_DELTA.copyFrom(rootMesh.position);
         TMP_IK_DELTA.subtractInPlace(ikState.pos);
         TMP_IK_DELTA.y = 0;
         const movedSq = TMP_IK_DELTA.lengthSquared();
         const rotDelta = Math.abs(rootMesh.rotation.y - ikState.yaw);
         if (movedSq < IK_POS_EPS && rotDelta < IK_ROT_EPS) {
            if (ikState.idleFrames < IK_IDLE_FRAME_LIMIT) {
               ikState.idleFrames++;
               skipIK = true;
            } else {
               ikState.idleFrames = 0;
            }
         } else {
            ikState.idleFrames = 0;
         }
      } else {
         ikState.idleFrames = 0;
      }
      if (skipIK) {
         ikState.pos.copyFrom(rootMesh.position);
         ikState.yaw = rootMesh.rotation.y;
         ikState.grounded = grounded;
         return;
      }
      ikState.pos.copyFrom(rootMesh.position);
      ikState.yaw = rootMesh.rotation.y;
      ikState.grounded = grounded;
      ikState.idleFrames = 0;
      const feet = [meta.footIK.left, meta.footIK.right];
      for (const foot of feet) {
         if (!foot || !foot.pivot || !foot.mesh) continue;
         const pivot = foot.pivot;
         const baseRotX = pivot.rotation.x;
         const baseRotZ = pivot.rotation.z;
         pivot.position.copyFrom(foot.restPos);
         if (!grounded) {
            pivot.rotation.x = baseRotX;
            pivot.rotation.z = baseRotZ;
            continue;
         }
         foot.mesh.computeWorldMatrix(true);
         const bInfo = foot.mesh.getBoundingInfo();
         bInfo.update(foot.mesh.getWorldMatrix());
         const bottomY = bInfo.boundingBox.minimumWorld.y;
         const center = bInfo.boundingBox.centerWorld;
         TMP_IK_ORIGIN.set(center.x, center.y + foot.castUp, center.z);
         const pick = scene.pickWithRay(new BABYLON.Ray(TMP_IK_ORIGIN, VEC3_DOWN, foot.castUp + foot.maxDrop), isGroundMesh);
         if (!pick || !pick.hit) {
            pivot.rotation.x = baseRotX;
            pivot.rotation.z = baseRotZ;
            continue;
         }
         const gap = bottomY - pick.pickedPoint.y;
         if (gap > foot.contactThreshold) {
            pivot.rotation.x = baseRotX;
            pivot.rotation.z = baseRotZ;
            continue;
         }
         const desiredMin = pick.pickedPoint.y + foot.clearance;
         const lift = desiredMin - bottomY;
         if (lift > 0) {
            pivot.position.y += Math.min(lift, foot.maxLift);
         }
         const normal = pick.getNormal(true) || VEC3_UP;
         const tiltX = Math.atan2(normal.z, normal.y);
         const tiltZ = -Math.atan2(normal.x, normal.y);
         pivot.rotation.x = baseRotX + tiltX;
         pivot.rotation.z = baseRotZ + tiltZ;
      }
   }

   function getCurrentDayPhase() {
      if (typeof Date !== "function") return 0;
      const now = new Date();
      const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
      return (seconds % 86400) / 86400;
   }

   function reseedEnvironment() {
      environment.seed = Math.random() * 1000 + (Date.now() % 1000) * 0.001;
      environment.time = environment.dayLength * getCurrentDayPhase();
   }

   function saveTerrainSettings(settings) {
      if (typeof localStorage === "undefined") return;
      try {
         localStorage.setItem(TERRAIN_SETTINGS_KEY, JSON.stringify(settings));
      } catch (err) {}
   }

   function disposeTerrain() {
      const terrain = environment.terrain;
      if (!terrain) return;
      if (terrain.columns) {
         terrain.columns.forEach(column => {
            if (!column) return;
            column.forEach(block => {
               if (block) block.dispose();
            });
         });
      }
      terrain.root?.dispose();
      environment.terrain = null;
      world.ground = null;
   }

   function createTerrain(scene) {
      disposeTerrain();
      const settings = environment.terrainSettings = normalizeTerrainSettings(environment.terrainSettings);
      saveTerrainSettings(settings);
      const { length, width, cubeSize, layers } = settings;
      const totalWidth = length * cubeSize;
      const totalDepth = width * cubeSize;
      world.size = Math.max(totalWidth, totalDepth);
      const halfX = totalWidth * 0.5;
      const halfZ = totalDepth * 0.5;
      const baseY = -layers * cubeSize;
      const root = new BABYLON.TransformNode("terrainRoot", scene);
      const columns = new Array(length * width);
      const heights = new Uint16Array(length * width);
      const columnStates = new Array(length * width).fill(false);
      const centers = new Array(length * width);
      const layerMaterials = TERRAIN_LAYER_DEFS.map(def => {
         const mat = new BABYLON.StandardMaterial(`terrain_${def.key}`, scene);
         const diffuse = new BABYLON.Color3(def.color[0], def.color[1], def.color[2]);
         const emissive = new BABYLON.Color3(def.emissive[0], def.emissive[1], def.emissive[2]);
         mat.diffuseColor = diffuse;
         mat.ambientColor = diffuse.scale(0.45);
         mat.emissiveColor = emissive;
         mat.specularColor = BABYLON.Color3.Black();
         return mat;
      });
      const template = BABYLON.MeshBuilder.CreateBox("terrainCubeTemplate", { size: cubeSize }, scene);
      template.isVisible = false;
      template.isPickable = false;
      template.checkCollisions = true;
      for (let z = 0; z < width; z++) {
         for (let x = 0; x < length; x++) {
            const idx = z * length + x;
            const column = new Array(layers);
            columns[idx] = column;
            heights[idx] = layers;
            const worldX = -halfX + (x + 0.5) * cubeSize;
            const worldZ = -halfZ + (z + 0.5) * cubeSize;
            centers[idx] = { x: worldX, z: worldZ };
            for (let layer = 0; layer < layers; layer++) {
               const block = template.createInstance(`terrainCube_${x}_${z}_${layer}`);
               block.parent = root;
               block.position.set(worldX, baseY + (layer + 0.5) * cubeSize, worldZ);
               block.material = layerMaterials[Math.min(layer, layerMaterials.length - 1)];
               block.metadata = {
                  terrainBlock: {
                     columnIndex: idx,
                     layer,
                     destructible: TERRAIN_LAYER_DEFS[layer]?.destructible ?? true,
                     destroyed: false
                  }
               };
               block.isPickable = true;
               block.checkCollisions = true;
               block.setEnabled(false);
               column[layer] = block;
            }
         }
      }
      template.dispose();
      environment.terrain = {
         root,
         columns,
         heights,
         centers,
         columnStates,
         baseY,
         cubeSize,
         colsX: length,
         colsZ: width,
         halfX,
         halfZ,
         settings: { ...settings },
         streamAccumulator: 0,
         streamInterval: 0.25
      };
   }

   function terrainColumnIndexFromWorld(x, z) {
      const terrain = environment.terrain;
      if (!terrain) return -1;
      const { cubeSize, colsX, colsZ, halfX, halfZ } = terrain;
      const fx = (x + halfX) / cubeSize;
      const fz = (z + halfZ) / cubeSize;
      if (fx < 0 || fz < 0 || fx >= colsX || fz >= colsZ) return -1;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      return iz * colsX + ix;
   }

   function getTerrainHeight(x, z) {
      const terrain = environment.terrain;
      if (!terrain) return null;
      const idx = terrainColumnIndexFromWorld(x, z);
      if (idx < 0) return null;
      const layers = terrain.heights[idx];
      if (!layers) return terrain.baseY;
      return terrain.baseY + layers * terrain.cubeSize;
   }

   function enableTerrainColumn(column) {
      for (const block of column) {
         if (!block) continue;
         const meta = block.metadata?.terrainBlock;
         if (meta && meta.destroyed) continue;
         block.setEnabled(true);
         block.isPickable = true;
         block.checkCollisions = true;
      }
   }

   function disableTerrainColumn(column) {
      for (const block of column) {
         if (!block) continue;
         block.setEnabled(false);
         block.isPickable = false;
         block.checkCollisions = false;
      }
   }

   function updateTerrainStreaming(center, dt = 0, force = false) {
      const terrain = environment.terrain;
      if (!terrain) return;
      const target = center || BABYLON.Vector3.Zero();
      terrain.streamAccumulator += dt;
      if (!force && terrain.streamAccumulator < terrain.streamInterval) return;
      terrain.streamAccumulator = 0;
      const { columnStates, columns, centers } = terrain;
      const activeRadius = terrain.settings.activeRadius;
      const padding = terrain.settings.streamingPadding;
      const activeSq = activeRadius * activeRadius;
      const inactiveSq = (activeRadius + padding) * (activeRadius + padding);
      const px = target.x;
      const pz = target.z;
      for (let i = 0; i < columns.length; i++) {
         const column = columns[i];
         if (!column) continue;
         const pos = centers[i];
         const dx = pos.x - px;
         const dz = pos.z - pz;
         const distSq = dx * dx + dz * dz;
         if (distSq <= activeSq) {
            if (!columnStates[i]) {
               enableTerrainColumn(column);
               columnStates[i] = true;
            }
         } else if (distSq >= inactiveSq) {
            if (columnStates[i]) {
               disableTerrainColumn(column);
               columnStates[i] = false;
            }
         }
      }
   }

   function recomputeColumnHeight(column) {
      let height = 0;
      for (let layer = 0; layer < column.length; layer++) {
         const block = column[layer];
         if (!block) continue;
         const meta = block.metadata?.terrainBlock;
         if (meta && !meta.destroyed) {
            height = layer + 1;
         }
      }
      return height;
   }

   function removeTopBlock(columnIndex) {
      const terrain = environment.terrain;
      if (!terrain) return false;
      const column = terrain.columns[columnIndex];
      if (!column) return false;
      for (let layer = column.length - 1; layer >= 0; layer--) {
         const block = column[layer];
         if (!block) continue;
         const meta = block.metadata?.terrainBlock;
         if (!meta || meta.destroyed) continue;
         if (!meta.destructible) return false;
         meta.destroyed = true;
         block.isPickable = false;
         block.checkCollisions = false;
         block.isVisible = false;
         block.setEnabled(false);
         terrain.heights[columnIndex] = recomputeColumnHeight(column);
         if (terrain.columnStates[columnIndex]) {
            enableTerrainColumn(column);
         }
         return true;
      }
      return false;
   }

   function removeTerrainBlockFromMesh(mesh) {
      if (!mesh) return false;
      const meta = mesh.metadata?.terrainBlock;
      if (!meta) return false;
      return removeTopBlock(meta.columnIndex);
   }

   function removeTerrainCubeAtPoint(point) {
      const idx = terrainColumnIndexFromWorld(point.x, point.z);
      if (idx < 0) return false;
      return removeTopBlock(idx);
   }

   function getFallbackTreeMaterials(scene) {
      if (fallbackTreeMaterials) return fallbackTreeMaterials;
      const trunkMat = new BABYLON.StandardMaterial("fallbackTreeTrunkMat", scene);
      trunkMat.diffuseColor = new BABYLON.Color3(0.36, 0.22, 0.12);
      trunkMat.specularColor = BABYLON.Color3.Black();
      const leavesMat = new BABYLON.StandardMaterial("fallbackTreeLeavesMat", scene);
      leavesMat.diffuseColor = new BABYLON.Color3(0.18, 0.35, 0.16);
      leavesMat.specularColor = new BABYLON.Color3(0.05, 0.1, 0.05);
      leavesMat.emissiveColor = new BABYLON.Color3(0.02, 0.05, 0.02);
      fallbackTreeMaterials = { trunkMat, leavesMat };
      return fallbackTreeMaterials;
   }

   function createFallbackTree(scene, name, position, scale) {
      const root = new BABYLON.TransformNode(name, scene);
      const { trunkMat, leavesMat } = getFallbackTreeMaterials(scene);

      const trunk = BABYLON.MeshBuilder.CreateCylinder(`${name}-trunk`, {
         height: 4,
         diameterTop: 0.55,
         diameterBottom: 0.75
      }, scene);
      trunk.material = trunkMat;
      trunk.parent = root;
      trunk.position.y = 2;

      const foliage = BABYLON.MeshBuilder.CreateSphere(`${name}-foliage`, {
         diameterX: 3.2,
         diameterY: 3.4,
         diameterZ: 3.2,
         segments: 2
      }, scene);
      foliage.material = leavesMat;
      foliage.parent = root;
      foliage.position.y = 4.5;

      const crown = BABYLON.MeshBuilder.CreateSphere(`${name}-crown`, {
         diameterX: 2.6,
         diameterY: 2.8,
         diameterZ: 2.6,
         segments: 2
      }, scene);
      crown.material = leavesMat;
      crown.parent = root;
      crown.position.y = 6;

      root.position.copyFrom(position);
      root.scaling.set(scale, scale, scale);

      const childMeshes = root.getChildMeshes();
      childMeshes.forEach(mesh => {
         mesh.isPickable = false;
         mesh.checkCollisions = true;
         mesh.computeWorldMatrix(true);
      });

      let minY = Infinity;
      childMeshes.forEach(mesh => {
         const info = mesh.getBoundingInfo();
         if (!info) return;
         const min = info.boundingBox.minimumWorld.y;
         if (min < minY) minY = min;
      });
      const offset = Number.isFinite(minY) ? position.y - minY : 0;
      if (offset !== 0) {
         root.position.y += offset;
      }

      return root;
   }

   async function scatterVegetation(scene) {
      const terrain = environment.terrain;
      if (!terrain) return;

      environment.trees.forEach(tree => tree.dispose());
      environment.trees = [];

      const treeCount = 18;
      const halfX = terrain.halfX;
      const halfZ = terrain.halfZ;
      if (halfX <= 6 || halfZ <= 6) return;

      for (let i = 0; i < treeCount; i++) {
         const x = rand(-halfX + 6, halfX - 6);
         const z = rand(-halfZ + 6, halfZ - 6);
         if (Math.sqrt(x * x + z * z) < 6) continue;
         const h = getTerrainHeight(x, z);
         if (h === null) continue;
         const hX = getTerrainHeight(x + 1.2, z);
         const hZ = getTerrainHeight(x, z + 1.2);
         if (hX === null || hZ === null) continue;
         if (Math.abs(h - hX) > 1.6 || Math.abs(h - hZ) > 1.6) continue;

         const scale = 0.8 + Math.random() * 1.2;
         const fallbackRoot = createFallbackTree(scene, `tree${i}`, new BABYLON.Vector3(x, h, z), scale);
         fallbackRoot.rotation.y = rand(0, Math.PI * 2);
         environment.trees.push(fallbackRoot);
      }
   }

   function createCloudLayer(scene) {
      environment.clouds.forEach(c => c.mesh.dispose());
      environment.clouds = [];
      const cloudMat = new BABYLON.StandardMaterial("cloudMat", scene);
      cloudMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
      cloudMat.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.95);
      cloudMat.specularColor = BABYLON.Color3.Black();
      cloudMat.alpha = 0.8;
      cloudMat.disableLighting = true;
      cloudMat.backFaceCulling = false;
      const count = 7;
      for (let i = 0; i < count; i++) {
         const cloud = BABYLON.MeshBuilder.CreatePlane("cloud" + i, {
            width: 18 + Math.random() * 14,
            height: 8 + Math.random() * 6,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
         }, scene);
         cloud.material = cloudMat;
         cloud.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
         cloud.isPickable = false;
         cloud.position.set(rand(-world.size, world.size), 45 + Math.random() * 12, rand(-world.size, world.size));
         environment.clouds.push({
            mesh: cloud,
            speed: 1 + Math.random() * 1.4,
            drift: (Math.random() - 0.5) * 0.6
         });
      }
   }

   async function setupEnvironment(scene) {
      reseedEnvironment();
      environment.sky?.dispose();
      environment.sunMesh?.dispose();
      environment.moonMesh?.dispose();
      environment.sun?.dispose();
      environment.moon?.dispose();
      environment.hemi?.dispose();
      disposeTerrain();
      world.platforms = [];
      environment.updateAccumulator = 0;

      environment.hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
      environment.hemi.intensity = 0.35;
      environment.hemi.groundColor = new BABYLON.Color3(0.08, 0.1, 0.12);

      environment.sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.35), scene);
      environment.sun.diffuse = new BABYLON.Color3(1.0, 0.95, 0.88);
      environment.sun.specular = new BABYLON.Color3(1.0, 0.95, 0.9);

      environment.moon = new BABYLON.DirectionalLight("moon", new BABYLON.Vector3(0.5, -1, 0.35), scene);
      environment.moon.diffuse = new BABYLON.Color3(0.55, 0.62, 0.9);
      environment.moon.specular = new BABYLON.Color3(0.55, 0.62, 0.9);
      environment.moon.intensity = 0.0;

      environment.sky = BABYLON.MeshBuilder.CreateBox("sky", {
         size: SKY_RADIUS * 2
      }, scene);
      environment.sky.isPickable = false;
      environment.sky.infiniteDistance = true;
      const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
      skyMat.backFaceCulling = false;
      skyMat.disableLighting = true;
      skyMat.emissiveColor = new BABYLON.Color3(0.04, 0.06, 0.1);
      environment.sky.material = skyMat;
      environment.skyMaterial = skyMat;

      environment.sunMesh = BABYLON.MeshBuilder.CreateDisc("sunMesh", {
         radius: 8,
         tessellation: 32
      }, scene);
      const sunMat = new BABYLON.StandardMaterial("sunMat", scene);
      sunMat.diffuseColor = new BABYLON.Color3(1.0, 0.85, 0.55);
      sunMat.emissiveColor = new BABYLON.Color3(1.0, 0.85, 0.55);
      sunMat.specularColor = BABYLON.Color3.Black();
      sunMat.disableLighting = true;
      sunMat.backFaceCulling = false;
      environment.sunMesh.material = sunMat;
      environment.sunMesh.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
      environment.sunMesh.isPickable = false;

      environment.moonMesh = BABYLON.MeshBuilder.CreateDisc("moonMesh", {
         radius: 6,
         tessellation: 30
      }, scene);
      const moonMat = new BABYLON.StandardMaterial("moonMat", scene);
      moonMat.diffuseColor = new BABYLON.Color3(0.85, 0.9, 1.0);
      moonMat.emissiveColor = new BABYLON.Color3(0.7, 0.76, 1.0);
      moonMat.specularColor = BABYLON.Color3.Black();
      moonMat.disableLighting = true;
      moonMat.backFaceCulling = false;
      environment.moonMesh.material = moonMat;
      environment.moonMesh.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
      environment.moonMesh.isPickable = false;

      createTerrain(scene);
      await scatterVegetation(scene);
      createCloudLayer(scene);
      updateEnvironment(240);
   }

   function advanceEnvironment(dt) {
      environment.updateAccumulator += dt;
      if (environment.updateAccumulator < environment.updateInterval) return;
      const step = environment.updateAccumulator;
      environment.updateAccumulator = 0;
      updateEnvironment(step);
   }

   function updateEnvironment(dt) {
      if (!environment.sun || !environment.skyMaterial) return;
      environment.time = environment.dayLength * getCurrentDayPhase();
      const phase = environment.time / environment.dayLength;
      const angle = phase * Math.PI * 2;
      const sunPos = new BABYLON.Vector3(Math.cos(angle) * SKY_RADIUS, Math.sin(angle) * SKY_RADIUS, Math.sin(angle * 0.6) * SKY_RADIUS);
      const moonAngle = angle + Math.PI;
      const moonPos = new BABYLON.Vector3(Math.cos(moonAngle) * SKY_RADIUS, Math.sin(moonAngle) * SKY_RADIUS, Math.sin(moonAngle * 0.6) * SKY_RADIUS);
      environment.sun.position.copyFrom(sunPos);
      environment.sun.direction = sunPos.clone().normalize().scale(-1);
      environment.moon.position.copyFrom(moonPos);
      environment.moon.direction = moonPos.clone().normalize().scale(-1);
      environment.sunMesh.position.copyFrom(sunPos);
      environment.moonMesh.position.copyFrom(moonPos);

      const sunHeight = sunPos.y / SKY_RADIUS;
      const moonHeight = moonPos.y / SKY_RADIUS;
      const daylight = clamp((sunHeight + 0.1) / 1.1, 0, 1);
      const nightLight = clamp((moonHeight + 0.25) / 1.3, 0, 1);
      const sunIntensity = Math.max(0, sunHeight);
      environment.sun.intensity = sunIntensity > 0 ? 0.25 + sunIntensity * 1.15 : 0;
      environment.moon.intensity = nightLight * 0.35;
      if (environment.hemi) {
         environment.hemi.intensity = 0.18 + daylight * 0.35 + nightLight * 0.1;
      }

      const dayColor = new BABYLON.Color3(0.48, 0.68, 0.9);
      const duskColor = new BABYLON.Color3(0.28, 0.32, 0.5);
      const nightColor = new BABYLON.Color3(0.03, 0.05, 0.09);
      const skyBlend = daylight * daylight;
      const twilight = clamp((sunHeight + 0.4) / 0.7, 0, 1);
      const skyDay = BABYLON.Color3.Lerp(duskColor, dayColor, skyBlend);
      const skyTint = BABYLON.Color3.Lerp(nightColor, skyDay, twilight);
      environment.skyMaterial.emissiveColor = skyTint;
      scene.clearColor = new BABYLON.Color4(skyTint.r, skyTint.g, skyTint.b, 1);
      scene.ambientColor = BABYLON.Color3.Lerp(new BABYLON.Color3(0.08, 0.1, 0.14), new BABYLON.Color3(0.32, 0.34, 0.4), twilight);
      environment.sunMesh.isVisible = sunHeight > -0.1;
      environment.moonMesh.isVisible = moonHeight > -0.4;

      const cloudLimit = world.size / 2 + 60;
      environment.clouds.forEach(cloud => {
         const { mesh, speed, drift } = cloud;
         mesh.position.x += speed * dt;
         mesh.position.z += drift * dt;
         if (mesh.position.x > cloudLimit) mesh.position.x = -cloudLimit;
         if (mesh.position.x < -cloudLimit) mesh.position.x = cloudLimit;
         if (mesh.position.z > cloudLimit) mesh.position.z = -cloudLimit;
         if (mesh.position.z < -cloudLimit) mesh.position.z = cloudLimit;
      });
   }
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
      markCooldownDirty();
   }

   function cdActive(key) {
      return state.cooldowns[key] && state.cooldowns[key].t > 0;
   }

   function markCooldownDirty() {
      cooldownUiAccumulator = COOLDOWN_UI_INTERVAL;
   }

   function setHudBarWidth(el, pct, key) {
      if (!el) return;
      const clamped = clamp(Number.isFinite(pct) ? pct : 0, 0, 1);
      const last = hudState.bars[key];
      if (last < 0 || Math.abs(last - clamped) > HUD_BAR_EPS) {
         el.style.width = `${clamped * 100}%`;
         hudState.bars[key] = clamped;
      }
   }

   function updateHealthHud() {
      setHudBarWidth(hud.health, state.hp / state.maxHP, "health");
   }

   function updateNenHud() {
      setHudBarWidth(hud.nenbar, state.nen / state.nenMax, "nen");
   }

   function updateXpHud(pct) {
      setHudBarWidth(hud.xpbar, pct, "xp");
   }

   function updateCooldownUI(dt = 0) {
      cooldownUiAccumulator += dt;
      if (cooldownUiAccumulator < COOLDOWN_UI_INTERVAL) return;
      cooldownUiAccumulator = 0;
      const targets = [
         { el: hud.cdQ, key: "nenblast" },
         { el: hud.cdE, key: "special" },
         { el: hud.cdDash, key: "dash" }
      ];
      for (const { el, key } of targets) {
         if (!el) continue;
         const cdState = hudState.cooldowns[key];
         const cooldown = state.cooldowns[key];
         if (!cooldown) {
            if (cdState.active || cdState.pct !== 1) {
               el.classList.remove("cooling");
               el.style.setProperty("--pct", "100%");
               cdState.active = false;
               cdState.pct = 1;
            }
            continue;
         }
         const pct = clamp(cooldown.t / cooldown.max, 0, 1);
         if (!cdState.active) {
            el.classList.add("cooling");
            cdState.active = true;
         }
         if (cdState.pct < 0 || Math.abs(cdState.pct - pct) > 0.01) {
            el.style.setProperty("--pct", `${pct * 100}%`);
            cdState.pct = pct;
         }
      }
   }

   function msg(s) {
      hud.msg.textContent = s;
   }

   function updateHUD() {
      hud.name.textContent = state.ch.name || "Hunter";
      hud.nen.textContent = `${state.ch.nen} — ${state.ch.clan||"Wanderer"}`;
      hud.level.textContent = `Lv ${progress.level}  •  Points: ${progress.unspent}`;
      updateHealthHud();
      updateNenHud();
      const req = xpToNext(progress.level);
      const pct = progress.level >= 410 ? 1 : (progress.xp / req);
      updateXpHud(pct);
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
      color: "#804a00",
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
         pelvis: {
            ...t0(),
            pos: {
               x: 0,
               y: 1.19,
               z: 0
            }
         },
         torsoLower: {
            ...t0(),
            pos: {
               x: 0,
               y: 0.45,
               z: 0
            }
         },
         torsoUpper: {
            ...t0(),
            pos: {
               x: 0,
               y: 0.71,
               z: 0
            }
         },
         neck: {
            ...t0(),
            pos: {
               x: 0,
               y: 0.25,
               z: 0
            }
         },
         head: t0(),
         shoulderL: {
            ...t0(),
            pos: {
               x: -0.65,
               y: 0,
               z: 0
            },
            rot: {
               x: 0,
               y: 180,
               z: 0
            }
         },
         armL_upper: t0(),
         armL_fore: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.75,
               z: 0
            }
         },
         armL_hand: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.71,
               z: 0
            }
         },
         shoulderR: {
            ...t0(),
            pos: {
               x: 0.65,
               y: 0,
               z: 0
            },
            rot: {
               x: 0,
               y: 180,
               z: 0
            }
         },
         armR_upper: t0(),
         armR_fore: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.75,
               z: 0
            }
         },
         armR_hand: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.71,
               z: 0
            }
         },
         hipL: {
            ...t0(),
            pos: {
               x: -0.25,
               y: -0.35,
               z: 0
            }
         },
         legL_thigh: t0(),
         legL_shin: {
            ...t0(),
            pos: {
               x: 0,
               y: -1.05,
               z: 0
            }
         },
         legL_foot: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.88,
               z: -0.21
            }
         },
         hipR: {
            ...t0(),
            pos: {
               x: 0.25,
               y: -0.35,
               z: 0
            }
         },
         legR_thigh: t0(),
         legR_shin: {
            ...t0(),
            pos: {
               x: 0,
               y: -1.05,
               z: 0
            }
         },
         legR_foot: {
            ...t0(),
            pos: {
               x: 0,
               y: -0.88,
               z: -0.21
            }
         },
      }
   };

   function deepClone(o) {
      return JSON.parse(JSON.stringify(o));
   }

   // ensure transforms exist and are numeric
   function ensureRig(rig) {
      const r = rig && typeof rig === "object" ? rig : {};
      const out = deepClone(DEFAULT_RIG);

      if (typeof r.color === "string") {
         out.color = r.color;
      }

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

   function parseFloatAttr(node, name) {
      if (!node || !node.hasAttribute(name)) return null;
      const v = parseFloat(node.getAttribute(name));
      return Number.isFinite(v) ? v : null;
   }

   function parseRigXML(text) {
      try {
         const doc = new DOMParser().parseFromString(text, "application/xml");
         if (doc.getElementsByTagName("parsererror").length) return null;
         const root = doc.querySelector("rig");
         if (!root) return null;

         const parsed = { transforms: {} };
         const col = root.getAttribute("color");
         if (col) parsed.color = col;

         const sizes = root.querySelector("sizes");
         if (sizes) {
            const assignDims = (tag, key) => {
               const node = sizes.querySelector(tag);
               if (!node) return;
               const dest = parsed[key] = parsed[key] || {};
               ["w", "h", "d"].forEach(attr => {
                  const val = parseFloatAttr(node, attr);
                  if (val !== null) dest[attr] = val;
               });
            };
            assignDims("pelvis", "pelvis");
            assignDims("torsoLower", "torsoLower");
            assignDims("torsoUpper", "torsoUpper");
            assignDims("neck", "neck");
            assignDims("head", "head");

            const arm = sizes.querySelector("arm");
            if (arm) {
               const dest = parsed.arm = parsed.arm || {};
               [
                  ["upperW", "upperW"],
                  ["upperD", "upperD"],
                  ["upperLen", "upperLen"],
                  ["foreW", "foreW"],
                  ["foreD", "foreD"],
                  ["foreLen", "foreLen"],
                  ["handLen", "handLen"]
               ].forEach(([attr, key]) => {
                  const val = parseFloatAttr(arm, attr);
                  if (val !== null) dest[key] = val;
               });
            }

            const leg = sizes.querySelector("leg");
            if (leg) {
               const dest = parsed.leg = parsed.leg || {};
               [
                  ["thighW", "thighW"],
                  ["thighD", "thighD"],
                  ["thighLen", "thighLen"],
                  ["shinW", "shinW"],
                  ["shinD", "shinD"],
                  ["shinLen", "shinLen"],
                  ["footW", "footW"],
                  ["footH", "footH"],
                  ["footLen", "footLen"]
               ].forEach(([attr, key]) => {
                  const val = parseFloatAttr(leg, attr);
                  if (val !== null) dest[key] = val;
               });
            }
         }

         const transforms = root.querySelector("transforms");
         if (transforms) {
            for (const key of PART_KEYS) {
               const node = transforms.querySelector(key);
               if (!node) continue;
               const tr = { pos: {}, rot: {} };
               let touched = false;
               [
                  ["posX", "x"],
                  ["posY", "y"],
                  ["posZ", "z"]
               ].forEach(([attr, axis]) => {
                  const val = parseFloatAttr(node, attr);
                  if (val !== null) {
                     tr.pos[axis] = val;
                     touched = true;
                  }
               });
               [
                  ["rotX", "x"],
                  ["rotY", "y"],
                  ["rotZ", "z"]
               ].forEach(([attr, axis]) => {
                  const val = parseFloatAttr(node, attr);
                  if (val !== null) {
                     tr.rot[axis] = val;
                     touched = true;
                  }
               });
               if (touched) parsed.transforms[key] = tr;
            }
         }

         return parsed;
      } catch (err) {
         console.warn("Failed to parse rig XML", err);
         return null;
      }
   }

   function loadRigFromStorage() {
      try {
         const txt = localStorage.getItem(RIG_KEY);
         if (!txt) return null;
         return ensureRig(JSON.parse(txt));
      } catch {
         return null;
      }
   }

   async function fetchRigDefault() {
      if (typeof fetch !== "function") return null;
      try {
         const res = await fetch("hxh_rig.xml", { cache: "no-cache" });
         if (!res.ok) throw new Error(`HTTP ${res.status}`);
         const text = await res.text();
         const parsed = parseRigXML(text);
         return parsed ? ensureRig(parsed) : null;
      } catch (err) {
         console.warn("Failed to load default rig XML", err);
         return null;
      }
   }

   let RIG = deepClone(DEFAULT_RIG);
   const rigReady = (async () => {
      const stored = loadRigFromStorage();
      if (stored) {
         RIG = stored;
         return;
      }

      const xmlRig = await fetchRigDefault();
      if (xmlRig) {
         RIG = xmlRig;
         try {
            localStorage.setItem(RIG_KEY, JSON.stringify(RIG));
         } catch {}
         return;
      }

      RIG = deepClone(DEFAULT_RIG);
   })();

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

      aura: {
         ten: true,
         zetsu: false,
         renActive: false,
         renCharge: 0,
         renMul: 1.0
      },

      buffs: {},
      cooldowns: {},
      vel: new BABYLON.Vector3(0, 0, 0),
      grounded: false,
      groundNormal: new BABYLON.Vector3(0, 1, 0),
      prevPlayerPos: null,

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

   function bindHoldButton(el, code) {
      if (!el) return;
      el.addEventListener("click", (e) => e.preventDefault());
      let pointerId = null;
      let active = false;

      const press = (e) => {
         e.preventDefault();
         pointerId = e.pointerId;
         try {
            el.setPointerCapture(pointerId);
         } catch (err) {}
         if (active) return;
         active = true;
         input[code] = true;
         inputOnce[code] = true;
         el.classList.add("active");
      };

      const release = (e) => {
         if (!active || (pointerId !== null && e.pointerId !== pointerId)) return;
         e.preventDefault();
         try {
            el.releasePointerCapture(pointerId);
         } catch (err) {}
         pointerId = null;
         active = false;
         input[code] = false;
         inputUp[code] = true;
         el.classList.remove("active");
      };

      el.addEventListener("pointerdown", press);
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("pointerleave", release);
   }

   function resetMobileJoystick() {
      mobileMove.x = 0;
      mobileMove.y = 0;
      mobileMove.active = false;
      if (mobileUI.thumb) {
         mobileUI.thumb.style.transform = "translate(-50%, -50%)";
      }
   }

   function initMobileControls() {
      if (!isTouchDevice || !mobileUI.container) return;
      mobileUI.container.classList.add("visible");

      if (!mobileControlsInitialized) {
         mobileControlsInitialized = true;
         const joystick = mobileUI.joystick;
         let joyPointerId = null;

         const updateJoystick = (e) => {
            const joystickEl = mobileUI.joystick;
            if (!joystickEl) return;
            const rect = joystickEl.getBoundingClientRect();
            const cx = rect.left + rect.width * 0.5;
            const cy = rect.top + rect.height * 0.5;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const max = rect.width * 0.5 || 1;
            let nx = clamp(dx / max, -1, 1);
            let ny = clamp(dy / max, -1, 1);
            let len = Math.hypot(nx, ny);
            if (len > 1) {
               nx /= len;
               ny /= len;
               len = 1;
            }
            mobileMove.x = nx;
            mobileMove.y = ny;
            mobileMove.active = len > 0.08;
            const thumbEl = mobileUI.thumb;
            if (thumbEl) {
               const offsetX = nx * rect.width * 0.32;
               const offsetY = ny * rect.height * 0.32;
               thumbEl.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
            }
         };

         if (joystick) {
            joystick.addEventListener("pointerdown", (e) => {
               e.preventDefault();
               joyPointerId = e.pointerId;
               try {
                  joystick.setPointerCapture(joyPointerId);
               } catch (err) {}
               updateJoystick(e);
            });
            joystick.addEventListener("pointermove", (e) => {
               if (e.pointerId !== joyPointerId) return;
               e.preventDefault();
               updateJoystick(e);
            });
            const end = (e) => {
               if (e.pointerId !== joyPointerId) return;
               e.preventDefault();
               try {
                  joystick.releasePointerCapture(joyPointerId);
               } catch (err) {}
               joyPointerId = null;
               resetMobileJoystick();
            };
            joystick.addEventListener("pointerup", end);
            joystick.addEventListener("pointercancel", end);
            joystick.addEventListener("pointerleave", end);
         }

         bindHoldButton(mobileUI.buttons.jump, "Space");
         bindHoldButton(mobileUI.buttons.dash, "ShiftLeft");
         bindHoldButton(mobileUI.buttons.blast, "KeyQ");
         bindHoldButton(mobileUI.buttons.special, "KeyE");
         bindHoldButton(mobileUI.buttons.nen, "KeyC");

         if (mobileUI.buttons.attack) {
            const attackBtn = mobileUI.buttons.attack;
            attackBtn.addEventListener("click", (e) => e.preventDefault());
            attackBtn.addEventListener("pointerdown", (e) => {
               e.preventDefault();
               attackBtn.classList.add("active");
               melee();
            });
            const clear = () => attackBtn.classList.remove("active");
            attackBtn.addEventListener("pointerup", clear);
            attackBtn.addEventListener("pointercancel", clear);
            attackBtn.addEventListener("pointerleave", clear);
         }
      }

      resetMobileJoystick();
      Object.values(mobileUI.buttons).forEach(btn => {
         if (btn) btn.classList.remove("active");
      });
      ["Space", "ShiftLeft", "KeyQ", "KeyE", "KeyC"].forEach(code => {
         input[code] = false;
         inputUp[code] = false;
      });
   }

   async function setupBabylon(canvas) {
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
      await setupEnvironment(scene);

      const spawnHeight = getTerrainHeight(0, 0);
      const baseY = spawnHeight === null ? 3 : spawnHeight + 1.8;
      startPos = new BABYLON.Vector3(0, baseY, 0);

      const p = createHumanoid(state.ch.color || "#00ffcc");
      playerRoot = player = p.root; // collider mesh
      playerRoot.position.copyFrom(startPos);
      state.prevPlayerPos = playerRoot.position.clone();
      player.checkCollisions = true;
      player.metadata = {
         parts: p.parts,
         animPhase: 0
      };
      updateTerrainStreaming(playerRoot.position, 0, true);

      state.nenLight = new BABYLON.PointLight("nenLight", playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0)), scene);
      state.nenLight.intensity = 0.0;
      state.nenLight.diffuse = BABYLON.Color3.FromHexString(state.ch.color || "#00ffcc");

      scene.registerBeforeRender(() => {
         camera.target = playerRoot.position.add(new BABYLON.Vector3(0, 0.9, 0));
         state.nenLight.position = playerRoot.position.add(new BABYLON.Vector3(0, 1.2, 0));
      });

      spawnWave(6);

      if (isTouchDevice) {
         initMobileControls();
      }

      canvas.addEventListener("pointerdown", (e) => {
         if (paused) return;
         if (e.pointerType === "mouse" && e.button === 0) {
            e.preventDefault();
            melee();
         }
      });

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
         if (e.button === 0 && e.target !== canvas) melee();
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

   async function startGame(ch) {
      await rigReady;

      state.ch = ch;
      saveCharacter(ch);
      // seed pools before recompute (so we don't clamp to zero)
      state.hp = state.maxHP;
      state.nen = state.nenMax;
      recomputeDerived(); // compute from (creator + alloc)
      // after recompute, fill to full
      state.hp = state.maxHP;
      state.nen = state.nenMax;
      Object.assign(state.aura, {
         ten: true,
         zetsu: false,
         renActive: false,
         renCharge: 0,
         renMul: 1.0
      });

      updateHUD();
      msg("Defeat enemies to trigger the exit portal! Press L to open the Level menu.");
      const canvas = $("#game-canvas");
      await setupBabylon(canvas);
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
            ankle: legL.foot.pivot,
            footMesh: legL.foot.mesh
         },
         legR: {
            hip: legR.thigh.pivot,
            knee: legR.shin.pivot,
            ankle: legR.foot.pivot,
            footMesh: legR.foot.mesh
         }
      };

      const footIK = {
         left: {
            pivot: legL.foot.pivot,
            mesh: legL.foot.mesh,
            restPos: legL.foot.pivot.position.clone(),
            castUp: 0.45,
            maxDrop: s.leg.thighLen + s.leg.shinLen + 0.6,
            clearance: FOOT_CLEARANCE,
            contactThreshold: 0.5,
            maxLift: 0.35
         },
         right: {
            pivot: legR.foot.pivot,
            mesh: legR.foot.mesh,
            restPos: legR.foot.pivot.position.clone(),
            castUp: 0.45,
            maxDrop: s.leg.thighLen + s.leg.shinLen + 0.6,
            clearance: FOOT_CLEARANCE,
            contactThreshold: 0.5,
            maxLift: 0.35
         }
      };

      root.metadata = {
         parts,
         animPhase: 0,
         footIK
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
         groundNormal: new BABYLON.Vector3(0, 1, 0),
         prevPos: h.root.position.clone(),
         animPhase: 0,
         attackAnimT: 0,
         dormant: false,
         fearT: 0
      };
      const meta = h.root.metadata || {};
      meta.parts = h.parts;
      meta.animPhase = 0;
      h.root.metadata = meta;
      return e;
   }

   function spawnWave(n) {
      for (let i = 0; i < n; i++) {
         let spawn = null;
         for (let attempts = 0; attempts < 12 && !spawn; attempts++) {
            const x = rand(-world.size / 2 + 6, world.size / 2 - 6);
            const z = rand(-world.size / 2 + 6, world.size / 2 - 6);
            const h = getTerrainHeight(x, z);
            if (h === null) continue;
            const hX = getTerrainHeight(x + 1.5, z);
            const hZ = getTerrainHeight(x, z + 1.5);
            if (hX === null || hZ === null) continue;
            if (Math.abs(h - hX) > 2 || Math.abs(h - hZ) > 2) continue;
            spawn = new BABYLON.Vector3(x, h + 1.4, z);
         }
         if (!spawn) {
            const x = rand(-world.size / 3, world.size / 3);
            const z = rand(-world.size / 3, world.size / 3);
            spawn = new BABYLON.Vector3(x, 3 + rand(0, 4), z);
         }
         enemies.push(createEnemy(spawn));
      }
   }

   // ------------ Combat / Abilities ------------
   function takeDamage(amount, type = "physical") {
      let dmg = amount;
      if (state.aura.ten && type !== "nen") {
         dmg *= 0.9;
      }
      if (state.aura.zetsu && type === "nen") {
         dmg *= 1.5;
      }
      state.hp = Math.max(0, state.hp - dmg);
      updateHealthHud();
      if (state.hp <= 0) {
         msg("You were defeated!");
      }
   }

   function updateAura(dt) {
      const aura = state.aura;

      if (inputOnce["KeyT"]) {
         if (!aura.ten) {
            const exitingZetsu = aura.zetsu;
            aura.ten = true;
            if (exitingZetsu) {
               aura.zetsu = false;
               msg("Ten restored — aura guard re-established.");
            } else {
               msg("Ten reinforced.");
            }
         } else {
            aura.ten = false;
            msg("Ten relaxed.");
         }
      }

      if (inputOnce["KeyZ"]) {
         aura.zetsu = !aura.zetsu;
         if (aura.zetsu) {
            aura.ten = false;
            aura.renActive = false;
            aura.renCharge = 0;
            aura.renMul = 1.0;
            if (state.chargingNen) {
               state.chargingNen = false;
            }
            if (state.nenLight) state.nenLight.intensity = 0.0;
            msg("Entered Zetsu — aura suppressed.");
         } else {
            msg("Exited Zetsu.");
         }
      }

      const renSuppressed = aura.zetsu;
      const holdingRen = !renSuppressed && input["KeyR"];
      if (holdingRen && state.nen > 0) {
         aura.renActive = true;
         aura.renCharge = Math.min(1, aura.renCharge + dt / 1.2);
      } else {
         aura.renCharge = Math.max(0, aura.renCharge - dt / 0.6);
         if (aura.renCharge <= 0.0001) {
            aura.renCharge = 0;
            aura.renActive = false;
         }
      }

      aura.renMul = aura.renActive ? 1.3 + 0.9 * aura.renCharge : 1.0;
      if (aura.zetsu) {
         aura.renMul = 1.0;
      }

      if (state.nenLight) {
         if (aura.zetsu) {
            state.nenLight.intensity = 0.0;
         } else if (!state.chargingNen) {
            const glow = aura.renActive ? 0.45 + 0.4 * aura.renCharge : 0.0;
            state.nenLight.intensity = glow;
         }
      }
   }

   function spendNen(cost) {
      if (state.nen < cost) return false;
      state.nen -= cost;
      updateNenHud();
      return true;
   }

   function melee() {
      if (cdActive("meleehit")) return;
      setCooldown("meleehit", COOLDOWNS.meleehit);
      state.attackAnimT = 0.22;
      const forward = playerForward();
      if (forward.lengthSquared() > 0.0001) {
         playerRoot.rotation.y = Math.atan2(forward.x, forward.z);
      }
      const range = 2.0;
      let base = 10 + (state.eff.power * 1.5) * (state.ch.nen === "Enhancer" ? 1.25 : 1);
      const mult = state.aura.renMul || 1.0;
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

   function playerAimDir() {
      return camera.getDirection(new BABYLON.Vector3(0, 0, 1)).normalize();
   }

   function playerMoveDir() {
      const fwd = playerForward();
      const right = camera.getDirection(new BABYLON.Vector3(1, 0, 0));
      right.y = 0;
      right.normalize();
      const dir = TMP_PLAYER_MOVE_DIR;
      dir.set(0, 0, 0);
      if (mobileMove.active) {
         dir.addInPlace(fwd.scale(-mobileMove.y));
         dir.addInPlace(right.scale(mobileMove.x));
         if (dir.lengthSquared() > 0.0001) {
            return dir.normalize();
         }
      }
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
      updateNenHud();
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
      const dir = playerAimDir();
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
      const dmg = (18 + state.eff.focus * 2.0 * (state.ch.nen === "Emitter" ? 1.35 : 1)) * state.aura.renMul;
      projectiles.push({
         mesh: orb,
         dir,
         speed,
         life,
         dmg,
         radius: 0.55,
         prevPos: orb.position.clone()
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
               const dir = playerAimDir().add(new BABYLON.Vector3(i * 0.15, 0, 0));
               dir.normalize();
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
               const dmg = (12 + state.eff.focus * 1.6) * state.aura.renMul;
               projectiles.push({
                  mesh: orb,
                  dir,
                  speed,
                  life,
                  dmg,
                  radius: 0.5,
                  prevPos: orb.position.clone()
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

      P.pelvis.position.x = 0;
      P.pelvis.position.y = 0;
      P.pelvis.position.z = 0;
      P.pelvis.rotation.set(0, 0, 0);
      if (P.head) {
         P.head.rotation.x = 0;
         P.head.rotation.y = 0;
         P.head.rotation.z = 0;
      }
      P.armL.shoulder.rotation.y = 0;
      P.armR.shoulder.rotation.y = 0;
      P.armL.shoulder.rotation.z = 0;
      P.armR.shoulder.rotation.z = 0;
      P.legL.hip.rotation.y = 0;
      P.legR.hip.rotation.y = 0;
      P.legL.hip.rotation.z = 0;
      P.legR.hip.rotation.z = 0;
      P.armL.elbow.rotation.y = 0;
      P.armR.elbow.rotation.y = 0;
      P.armL.wrist.rotation.z = 0;
      P.armR.wrist.rotation.z = 0;

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
         const reach = 1.6 * 1.9;
         const elbowStart = 0.2;
         const elbowEnd = -0.32;
         const wristStart = 0.12;
         const wristEnd = -0.08;
         P.armR.shoulder.rotation.x = -reach * k;
         P.armR.elbow.rotation.x = elbowStart * (1 - k) + elbowEnd * k;
         P.armR.wrist.rotation.x = wristStart * (1 - k) + wristEnd * k;
      }

      P.lowerTorso.rotation.x = 0.05 * Math.sin(ph * 2) * (grounded ? 1 : 0.3);
      P.upperTorso.rotation.x = 0.03 * Math.sin(ph * 2 + 0.4) * (grounded ? 1 : 0.3);
      P.neck.rotation.x = -0.03 * Math.sin(ph * 2 + 0.2);
   }

   function updateIdleAnim(rootMesh, dt, attackT = 0) {
      const P = rootMesh.metadata?.parts;
      if (!P) return;
      const phPrev = rootMesh.metadata.animPhase || 0;
      const ph = phPrev + dt * ANIM_SPEED * 0.9;
      rootMesh.metadata.animPhase = ph;

      const breathe = Math.sin(ph * 0.8) * 0.05;
      const sway = Math.sin(ph * 0.35) * 0.1;
      const shift = Math.sin(ph * 0.45 + 1.2) * 0.08;

      P.pelvis.position.x = shift * 0.4;
      P.pelvis.position.y = 0.02 * Math.sin(ph * 0.8 + 0.4);
      P.pelvis.position.z = 0;
      P.pelvis.rotation.x = 0;
      P.pelvis.rotation.y = sway * 0.45;
      P.pelvis.rotation.z = -shift * 0.35;

      P.lowerTorso.rotation.x = breathe * 0.6;
      P.lowerTorso.rotation.y = 0.08 * Math.sin(ph * 0.45);
      P.lowerTorso.rotation.z = sway * 0.25;

      P.upperTorso.rotation.x = 0.12 * Math.sin(ph * 0.85 + 0.6);
      P.upperTorso.rotation.y = 0.14 * Math.sin(ph * 0.35 + 0.3);
      P.upperTorso.rotation.z = -sway * 0.4;

      P.neck.rotation.x = -0.06 * Math.sin(ph * 0.9 + 0.9);
      P.neck.rotation.y = 0.04 * Math.sin(ph * 0.7);
      P.neck.rotation.z = 0.02 * Math.sin(ph * 0.5 + 0.5);

      if (P.head) {
         P.head.rotation.x = -0.03 * Math.sin(ph * 0.85 + 0.4);
         P.head.rotation.y = 0.05 * Math.sin(ph * 0.6 + 1.1);
         P.head.rotation.z = 0.01 * Math.sin(ph * 0.8);
      }

      const armOsc = Math.sin(ph * 0.8);
      P.armL.shoulder.rotation.x = -0.18 + 0.09 * armOsc;
      P.armR.shoulder.rotation.x = -0.12 - 0.09 * armOsc;
      P.armL.shoulder.rotation.y = 0.05 * Math.sin(ph * 0.5);
      P.armR.shoulder.rotation.y = -0.05 * Math.sin(ph * 0.5 + 0.4);
      P.armL.shoulder.rotation.z = 0.18 + 0.04 * Math.sin(ph * 0.7);
      P.armR.shoulder.rotation.z = -0.18 + 0.04 * Math.sin(ph * 0.7 + Math.PI);

      P.armL.elbow.rotation.x = 0.28 + 0.05 * Math.sin(ph * 0.9 + 0.3);
      P.armR.elbow.rotation.x = 0.28 + 0.05 * Math.sin(ph * 0.9 - 0.3);
      P.armL.elbow.rotation.y = 0;
      P.armR.elbow.rotation.y = 0;
      P.armL.wrist.rotation.x = -0.12 + 0.04 * Math.sin(ph * 1.1);
      P.armR.wrist.rotation.x = -0.12 + 0.04 * Math.sin(ph * 1.1 + 0.5);
      P.armL.wrist.rotation.z = 0.02 * Math.sin(ph * 1.4);
      P.armR.wrist.rotation.z = -0.02 * Math.sin(ph * 1.3);

      P.legL.hip.rotation.x = 0.12 + 0.03 * Math.sin(ph * 0.6);
      P.legR.hip.rotation.x = 0.12 + 0.03 * Math.sin(ph * 0.6 + Math.PI);
      P.legL.hip.rotation.y = 0.02 * Math.sin(ph * 0.4);
      P.legR.hip.rotation.y = -0.02 * Math.sin(ph * 0.4);
      P.legL.hip.rotation.z = shift * 0.8;
      P.legR.hip.rotation.z = -shift * 0.8;
      P.legL.knee.rotation.x = 0.14 + 0.025 * Math.sin(ph * 0.7);
      P.legR.knee.rotation.x = 0.14 + 0.025 * Math.sin(ph * 0.7 + Math.PI);
      P.legL.ankle.rotation.x = -0.08 + 0.02 * Math.sin(ph * 0.9);
      P.legR.ankle.rotation.x = -0.08 + 0.02 * Math.sin(ph * 0.9 + Math.PI);

      if (attackT > 0) {
         const t = Math.min(1, attackT / 0.22);
         const k = Math.sin(t * Math.PI);
         const reach = 1.6 * 1.9;
         const elbowStart = 0.2;
         const elbowEnd = -0.32;
         const wristStart = 0.12;
         const wristEnd = -0.08;
         P.armR.shoulder.rotation.x = -reach * k;
         P.armR.elbow.rotation.x = elbowStart * (1 - k) + elbowEnd * k;
         P.armR.wrist.rotation.x = wristStart * (1 - k) + wristEnd * k;
      }
   }

   // ------------ Main loop ------------
   function tick(dt) {
      const hasOwn = Object.prototype.hasOwnProperty;
      for (const key in state.cooldowns) {
         if (!hasOwn.call(state.cooldowns, key)) continue;
         const cd = state.cooldowns[key];
         cd.t = Math.max(0, cd.t - dt);
         if (cd.t === 0) {
            delete state.cooldowns[key];
            markCooldownDirty();
         }
      }
      updateCooldownUI(dt);
      for (const key in state.buffs) {
         if (!hasOwn.call(state.buffs, key)) continue;
         state.buffs[key] -= dt;
         if (state.buffs[key] <= 0) delete state.buffs[key];
      }

      advanceEnvironment(dt);

      // inputs / abilities
      if (inputOnce["Space"]) startJumpCharge();
      if (input["Space"]) updateJumpCharge(dt);
      if (inputUp["Space"]) performJump();
      if (input["KeyQ"]) blast();
      if (input["ShiftLeft"] || input["ShiftRight"]) dash();
      if (input["KeyE"]) special();

      updateAura(dt);

      // Nen charge (hold C)
      if (input["KeyC"] && !state.aura.zetsu) {
         if (!state.chargingNen) {
            state.chargingNen = true;
            if (state.nenLight) state.nenLight.intensity = 0.8;
         }
      } else if (state.chargingNen) {
         state.chargingNen = false;
         if (state.nenLight) state.nenLight.intensity = 0.0;
      }

      if (!state.prevPlayerPos) {
         state.prevPlayerPos = playerRoot.position.clone();
      }

      // movement + rotation
      const moveDir = playerMoveDir();
      let moveSpeed = 7 + state.eff.agility * 0.6;
      if (state.buffs.berserk) moveSpeed *= 1.35;
      const moveVec = TMP_PLAYER_MOVE_VEC;
      moveVec.copyFrom(moveDir);
      moveVec.scaleInPlace(moveSpeed * dt);
      state.vel.y += world.gravityY * dt;
      TMP_PLAYER_MOTION.set(
         moveVec.x + state.vel.x * dt,
         state.vel.y * dt,
         moveVec.z + state.vel.z * dt
      );
      player.moveWithCollisions(TMP_PLAYER_MOTION);
      const lastPos = state.prevPlayerPos;
      playerRoot.position.copyFrom(player.position);
      state.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
      state.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
      if (moveDir.lengthSquared() > 0.0001) {
         const targetYaw = Math.atan2(moveDir.x, moveDir.z);
         playerRoot.rotation.y = BABYLON.Scalar.LerpAngle(playerRoot.rotation.y, targetYaw, 1 - Math.pow(0.001, dt * 60));
      }

      // ground check
      const groundInfo = resolveGrounding(player, state.vel.y);
      state.grounded = groundInfo.grounded;
      if (state.grounded) {
         state.groundNormal.copyFrom(groundInfo.normal);
         if (groundInfo.correction > 0) {
            player.position.y += groundInfo.correction;
            player.computeWorldMatrix(true);
            playerRoot.position.copyFrom(player.position);
         }
         if (state.vel.y < 0) state.vel.y = 0;
      } else {
         state.groundNormal.copyFrom(VEC3_UP);
      }

      updateTerrainStreaming(playerRoot.position, dt);

      // passive regen + aura flow
      const aura = state.aura;
      const regenMult = aura.ten ? 0.85 : 1.0;
      let nenRate = state.baseNenRegen * regenMult;
      if (state.chargingNen && !aura.zetsu) nenRate += 4.0;
      let nenDrain = 0;
      if (!aura.ten && !aura.zetsu) nenDrain += 0.8;
      if (aura.renActive) nenDrain += 2 + 6 * aura.renCharge;
      const nenDelta = (nenRate - nenDrain) * dt;
      const prevNen = state.nen;
      state.nen = clamp(state.nen + nenDelta, 0, state.nenMax);
      if (state.nen !== prevNen) {
         updateNenHud();
      }
      if (state.nen <= 0 && aura.renActive) {
         aura.renActive = false;
         aura.renCharge = 0;
         aura.renMul = 1.0;
      }
      state.hp = clamp(state.hp + state.baseHpRegen * dt, 0, state.maxHP);
      updateHealthHud();

      // Specialist ult drain
      if (state.timeStop) {
         state.ultT += dt;
         const prevNen = state.nen;
         state.nen = Math.max(0, state.nen - state.ultDrainRate * dt);
         if (state.nen !== prevNen) {
            updateNenHud();
         }
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
            const groundY = getTerrainHeight(p.mesh.position.x, p.mesh.position.z);
            if (groundY !== null && p.mesh.position.y - groundY < 6) {
               removeTerrainCubeAtPoint(new BABYLON.Vector3(p.mesh.position.x, groundY, p.mesh.position.z));
            }
            p.mesh.dispose();
            projectiles.splice(i, 1);
            continue;
         }
         const from = p.prevPos ? p.prevPos.clone() : p.mesh.position.clone();
         const moveVec = p.dir.scale(p.speed * dt);
         const stepLen = moveVec.length();
         let collision = null;
         if (stepLen > 0.0001) {
            const rayDir = moveVec.clone();
            rayDir.normalize();
            const pick = scene.pickWithRay(new BABYLON.Ray(from, rayDir, stepLen), isGroundMesh);
            if (pick && pick.hit) collision = pick;
         }
         if (collision) {
            if (collision.pickedMesh && collision.pickedMesh.metadata?.terrainBlock) {
               removeTerrainBlockFromMesh(collision.pickedMesh);
            } else if (collision.pickedPoint) {
               removeTerrainCubeAtPoint(collision.pickedPoint);
            }
            p.mesh.dispose();
            projectiles.splice(i, 1);
            continue;
         }
         p.mesh.position.addInPlace(moveVec);
         if (p.prevPos) {
            p.prevPos.copyFrom(p.mesh.position);
         } else {
            p.prevPos = p.mesh.position.clone();
         }
         for (const e of enemies) {
            if (!e.alive || !e.root.isEnabled()) continue;
            const hitRadius = 0.9 + ((p.radius || 0) * 0.5);
            if (BABYLON.Vector3.Distance(e.root.position, p.mesh.position) < hitRadius) {
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
      const playerPos = playerRoot.position;
      const stealthMult = state.aura.zetsu ? 0.4 : 1.0;
      const activeRadius = ENEMY_ACTIVE_RADIUS * stealthMult;
      const activeRadiusSq = activeRadius * activeRadius;
      const renThreatActive = state.aura.renActive && !state.aura.zetsu;
      const bloodlustDir = renThreatActive ? playerAimDir() : null;
      const renFearStrength = renThreatActive ? state.aura.renCharge : 0;
      for (const e of enemies) {
         if (!e.alive) continue;
         TMP_ENEMY_TO_PLAYER.copyFrom(playerPos);
         TMP_ENEMY_TO_PLAYER.subtractInPlace(e.root.position);
         const distSq = TMP_ENEMY_TO_PLAYER.lengthSquared();

         if (distSq > ENEMY_RENDER_RADIUS_SQ) {
            if (e.root.isEnabled()) e.root.setEnabled(false);
            e.dormant = true;
            e.vel.x = 0;
            e.vel.z = 0;
            if (Math.abs(e.vel.y) < 0.01) e.vel.y = 0;
            e.prevPos.copyFrom(e.root.position);
            if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
            continue;
         }

         if (!e.root.isEnabled()) e.root.setEnabled(true);

         if (e.fearT > 0) {
            e.fearT = Math.max(0, e.fearT - dt);
         }
         const dist = Math.sqrt(distSq);
         if (renThreatActive && bloodlustDir && e.hp <= BLOODLUST_WEAK_HP && distSq <= BLOODLUST_RANGE_SQ) {
            const denom = dist > 1e-5 ? dist : 1e-5;
            const cos = (-(TMP_ENEMY_TO_PLAYER.x * bloodlustDir.x + TMP_ENEMY_TO_PLAYER.y * bloodlustDir.y + TMP_ENEMY_TO_PLAYER.z * bloodlustDir.z)) / denom;
            if (cos > BLOODLUST_CONE_COS) {
               const fearDur = 0.9 + 0.9 * renFearStrength;
               if (e.fearT < fearDur) e.fearT = fearDur;
            }
         }
         const frightened = e.fearT > 0;

         if (distSq > activeRadiusSq) {
            e.dormant = true;
            e.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
            e.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
            if (!e.grounded) {
               e.vel.y += world.gravityY * dt * 0.5;
               e.root.moveWithCollisions(new BABYLON.Vector3(0, e.vel.y * dt, 0));
               const groundDormant = resolveGrounding(e.root, e.vel.y);
               e.grounded = groundDormant.grounded;
               if (e.grounded) {
                  if (groundDormant.correction > 0) {
                     e.root.position.y += groundDormant.correction;
                     e.root.computeWorldMatrix(true);
                  }
                  if (e.vel.y < 0) e.vel.y = 0;
               }
            }
            e.prevPos.copyFrom(e.root.position);
            if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
            continue;
         }

         if (e.dormant) {
            e.prevPos.copyFrom(e.root.position);
            e.dormant = false;
         }

         const distXZSq = TMP_ENEMY_TO_PLAYER.x * TMP_ENEMY_TO_PLAYER.x + TMP_ENEMY_TO_PLAYER.z * TMP_ENEMY_TO_PLAYER.z;
         if (distXZSq > 1e-6) {
            const yaw = Math.atan2(TMP_ENEMY_TO_PLAYER.x, TMP_ENEMY_TO_PLAYER.z);
            e.root.rotation.y = BABYLON.Scalar.LerpAngle(e.root.rotation.y, yaw, 1 - Math.pow(0.001, dt * 60));
         }

         if (!state.timeStop) {
            if (frightened) {
               if (dist > 1e-4) {
                  TMP_ENEMY_TO_PLAYER.scaleInPlace(1 / dist);
               } else {
                  TMP_ENEMY_TO_PLAYER.set(0, 0, 0);
               }
               const fleeSpeed = e.speed * (1.2 + 0.6 * renFearStrength);
               TMP_ENEMY_TO_PLAYER.scaleInPlace(-fleeSpeed * dt);
               e.vel.y += world.gravityY * dt;
               TMP_ENEMY_DELTA.set(
                  TMP_ENEMY_TO_PLAYER.x + e.vel.x * dt,
                  e.vel.y * dt,
                  TMP_ENEMY_TO_PLAYER.z + e.vel.z * dt
               );
               e.root.moveWithCollisions(TMP_ENEMY_DELTA);
               e.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
               e.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
               e.attackCd = Math.max(e.attackCd, 0.6);
            } else if (dist > 1.6) {
               if (dist > 1e-4) {
                  TMP_ENEMY_TO_PLAYER.scaleInPlace(1 / dist);
               } else {
                  TMP_ENEMY_TO_PLAYER.set(0, 0, 0);
               }
               TMP_ENEMY_TO_PLAYER.scaleInPlace(e.speed * dt);
               e.vel.y += world.gravityY * dt;
               TMP_ENEMY_DELTA.set(
                  TMP_ENEMY_TO_PLAYER.x + e.vel.x * dt,
                  e.vel.y * dt,
                  TMP_ENEMY_TO_PLAYER.z + e.vel.z * dt
               );
               e.root.moveWithCollisions(TMP_ENEMY_DELTA);
               e.vel.x *= (1 - Math.min(0.92 * dt, 0.9));
               e.vel.z *= (1 - Math.min(0.92 * dt, 0.9));
               if (e.grounded && Math.random() < 0.005) e.vel.y = 7 + Math.random() * 2;
            } else {
               e.attackCd -= dt;
               if (e.attackCd <= 0) {
                  const dmg = state.buffs.shield ? 6 : 12;
                  takeDamage(dmg, "physical");
                  e.attackCd = 1.2;
                  e.attackAnimT = 0.22;
               }
            }
         } else {
            e.vel.x = 0;
            e.vel.z = 0;
            e.vel.y += world.gravityY * dt * 0.1;
            TMP_ENEMY_DELTA.set(0, e.vel.y * dt, 0);
            e.root.moveWithCollisions(TMP_ENEMY_DELTA);
         }

         const groundE = resolveGrounding(e.root, e.vel.y);
         e.grounded = groundE.grounded;
         if (e.grounded) {
            if (groundE.correction > 0) {
               e.root.position.y += groundE.correction;
               e.root.computeWorldMatrix(true);
            }
            if (e.vel.y < 0) e.vel.y = 0;
            e.groundNormal.copyFrom(groundE.normal);
         } else {
            e.groundNormal.copyFrom(VEC3_UP);
         }

         TMP_ENEMY_DELTA.copyFrom(e.root.position);
         TMP_ENEMY_DELTA.subtractInPlace(e.prevPos);
         TMP_ENEMY_DELTA.y = 0;
         const spd = TMP_ENEMY_DELTA.length() / Math.max(dt, 1e-4);
         const animSpeed = spd * 0.12;
         if (e.grounded && animSpeed < 0.05 && Math.abs(e.vel.y) < 0.5) {
            updateIdleAnim(e.root, dt, e.attackAnimT);
         } else {
            updateWalkAnim(e.root, animSpeed, e.grounded, dt, e.attackAnimT);
         }
         applyFootIK(e.root, e.grounded);
         if (e.attackAnimT > 0) e.attackAnimT = Math.max(0, e.attackAnimT - dt);
         e.prevPos.copyFrom(e.root.position);
      }

      // player walk anim
      TMP_PLAYER_DELTA.copyFrom(playerRoot.position);
      TMP_PLAYER_DELTA.subtractInPlace(lastPos);
      TMP_PLAYER_DELTA.y = 0;
      const playerSpd = TMP_PLAYER_DELTA.length() / Math.max(dt, 1e-4);
      const playerAnimSpeed = playerSpd * 0.12;
      if (state.grounded && playerAnimSpeed < 0.05 && moveDir.lengthSquared() < 0.01) {
         updateIdleAnim(playerRoot, dt, state.attackAnimT);
      } else {
         updateWalkAnim(playerRoot, playerAnimSpeed, state.grounded, dt, state.attackAnimT);
      }
      applyFootIK(playerRoot, state.grounded);
      if (state.attackAnimT > 0) state.attackAnimT = Math.max(0, state.attackAnimT - dt);
      lastPos.copyFrom(playerRoot.position);

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
               updateHealthHud();
               state.nen = Math.min(state.nenMax, state.nen + 30);
               updateNenHud();
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
   window.GameSettings = GameSettings;
   window.HXH = {
      startGame,
      rigReady,
      getRig: () => RIG
   };
})();


// ===== Settings UI =====
(function () {
   const btnSettings = document.getElementById("btn-settings");
   const scrSettings = document.getElementById("screen--settings");
   const form = document.getElementById("settings-form");
   if (!btnSettings || !scrSettings || !form) return;
   const inputLength = document.getElementById("settings-length");
   const inputWidth = document.getElementById("settings-width");
   const inputCube = document.getElementById("settings-cube");
   const inputRadius = document.getElementById("settings-radius");
   const btnCancel = document.getElementById("settings-cancel");

   function populate() {
      const settings = window.GameSettings?.getTerrainSettings?.() || {};
      if (inputLength) inputLength.value = settings.length ?? "";
      if (inputWidth) inputWidth.value = settings.width ?? "";
      if (inputCube) inputCube.value = settings.cubeSize ?? "";
      if (inputRadius) inputRadius.value = settings.activeRadius ?? "";
   }

   function showSettings() {
      populate();
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
      scrSettings.classList.add("visible");
      window.MenuBG?.stop();
   }

   function returnToMenu() {
      if (window.MenuScreen?.showMenu) {
         window.MenuScreen.showMenu();
      } else {
         document.querySelectorAll(".screen").forEach(s => s.classList.remove("visible"));
         const menu = document.getElementById("screen--menu");
         menu?.classList.add("visible");
         window.MenuBG?.start();
      }
   }

   form.addEventListener("submit", (e) => {
      e.preventDefault();
      const next = {
         length: inputLength ? parseInt(inputLength.value, 10) : undefined,
         width: inputWidth ? parseInt(inputWidth.value, 10) : undefined,
         cubeSize: inputCube ? parseFloat(inputCube.value) : undefined,
         activeRadius: inputRadius ? parseFloat(inputRadius.value) : undefined
      };
      window.GameSettings?.setTerrainSettings?.(next);
      returnToMenu();
   });

   btnCancel?.addEventListener("click", (e) => {
      e.preventDefault();
      returnToMenu();
   });

   btnSettings.addEventListener("click", () => {
      showSettings();
   });
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
	  document.getElementById("screen--game").classList.add("visible");
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

   window.MenuScreen = { showMenu };
})();
