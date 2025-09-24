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
   let startPos = new BABYLON.Vector3(0, 3, 0);
   const world = {
      size: 100,
      gravityY: -28,
      ground: null,
      platforms: []
   };
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
      terrain: null
   };
   const SKY_RADIUS = 420;
   const VEC3_UP = new BABYLON.Vector3(0, 1, 0);
   const VEC3_DOWN = new BABYLON.Vector3(0, -1, 0);
   const GROUND_RAY_EXTRA = 0.8;
   const GROUND_STICK_THRESHOLD = 0.35;
   const FOOT_CLEARANCE = 0.012;
   const lerp = (a, b, t) => a + (b - a) * t;

   function isGroundMesh(mesh) {
      return !!mesh && (mesh === world.ground || world.platforms.includes(mesh));
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
      const halfHeight = boundingInfo.boundingBox.extendSize.y;
      const origin = new BABYLON.Vector3(mesh.position.x, mesh.position.y + halfHeight + GROUND_RAY_EXTRA, mesh.position.z);
      const rayLen = halfHeight + GROUND_RAY_EXTRA + 1.5;
      const pick = scene.pickWithRay(new BABYLON.Ray(origin, VEC3_DOWN, rayLen), isGroundMesh);
      if (!pick || !pick.hit) {
         return {
            grounded: false,
            correction: 0,
            normal: VEC3_UP,
            distance: Infinity,
            hitPointY: -Infinity
         };
      }
      const bottom = boundingInfo.boundingBox.minimumWorld.y;
      const distToGround = bottom - pick.pickedPoint.y;
      const grounded = velY <= 0.4 && distToGround <= GROUND_STICK_THRESHOLD;
      const desiredMin = pick.pickedPoint.y + FOOT_CLEARANCE;
      const correction = grounded ? Math.max(0, desiredMin - bottom) : 0;
      const normal = pick.getNormal(true) || VEC3_UP;
      return {
         grounded,
         correction,
         normal,
         distance: distToGround,
         hitPointY: pick.pickedPoint.y
      };
   }

   function applyFootIK(rootMesh, grounded) {
      if (!rootMesh || !scene) return;
      const meta = rootMesh.metadata;
      if (!meta || !meta.footIK) return;
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
         const origin = new BABYLON.Vector3(center.x, center.y + foot.castUp, center.z);
         const pick = scene.pickWithRay(new BABYLON.Ray(origin, VEC3_DOWN, foot.castUp + foot.maxDrop), isGroundMesh);
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

   function reseedEnvironment() {
      environment.seed = Math.random() * 1000 + (Date.now() % 1000) * 0.001;
      environment.time = environment.dayLength * Math.random();
   }

   function noiseHash(x, z) {
      const s = Math.sin(x * 127.1 + z * 311.7 + environment.seed * 17.7) * 43758.5453;
      return s - Math.floor(s);
   }

   function smoothNoise(x, z) {
      const xi = Math.floor(x);
      const zi = Math.floor(z);
      const xf = x - xi;
      const zf = z - zi;
      const h00 = noiseHash(xi, zi);
      const h10 = noiseHash(xi + 1, zi);
      const h01 = noiseHash(xi, zi + 1);
      const h11 = noiseHash(xi + 1, zi + 1);
      const sx = xf * xf * (3 - 2 * xf);
      const sz = zf * zf * (3 - 2 * zf);
      const x0 = lerp(h00, h10, sx);
      const x1 = lerp(h01, h11, sx);
      return lerp(x0, x1, sz);
   }

   function terrainHeightBase(x, z) {
      const n1 = smoothNoise(x * 0.045, z * 0.045);
      const n2 = smoothNoise(x * 0.09 + 100, z * 0.09 - 75);
      const n3 = smoothNoise(x * 0.015 - 230, z * 0.015 + 110);
      let h = (n1 - 0.5) * 6.5 + (n2 - 0.5) * 2.4 + (n3 - 0.5) * 3.2;
      const ridgeBase = Math.abs(smoothNoise(x * 0.03 + 250, z * 0.03 - 180) - 0.5);
      const ridge = Math.max(0, 1 - Math.min(1, ridgeBase * 2));
      h += Math.pow(ridge, 4) * 2.2;
      const dist = Math.sqrt(x * x + z * z);
      if (dist < 12) {
         const fall = 1 - dist / 12;
         h = lerp(h, 0, fall * 0.85);
      }
      return h;
   }

   function createTerrain(scene) {
      if (environment.terrain && environment.terrain.mesh) {
         environment.terrain.mesh.dispose();
      }
      const subdivisions = 128;
      const ground = BABYLON.MeshBuilder.CreateGround("ground", {
         width: world.size,
         height: world.size,
         subdivisions,
         updatable: true
      }, scene);
      const positions = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      const normals = ground.getVerticesData(BABYLON.VertexBuffer.NormalKind);
      const indices = ground.getIndices();
      const size = subdivisions + 1;
      const heights = new Float32Array(size * size);
      for (let i = 0; i < size * size; i++) {
         const x = positions[i * 3];
         const z = positions[i * 3 + 2];
         const h = terrainHeightBase(x, z);
         positions[i * 3 + 1] = h;
         heights[i] = h;
      }
      BABYLON.VertexData.ComputeNormals(positions, indices, normals);
      ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions, true);
      ground.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals, true);
      ground.refreshBoundingInfo();
      const terrainMat = new BABYLON.StandardMaterial("terrainMat", scene);
      terrainMat.diffuseColor = new BABYLON.Color3(0.18, 0.32, 0.18);
      terrainMat.emissiveColor = new BABYLON.Color3(0.02, 0.08, 0.02);
      terrainMat.specularColor = BABYLON.Color3.Black();
      ground.material = terrainMat;
      ground.checkCollisions = true;
      world.ground = ground;
      environment.terrain = {
         mesh: ground,
         positions,
         normals,
         indices,
         heights,
         subdivisions,
         step: world.size / subdivisions,
         half: world.size / 2,
         minHeight: -14
      };
   }

   function getTerrainHeight(x, z) {
      const terrain = environment.terrain;
      if (!terrain) return null;
      const { step, half, subdivisions, heights } = terrain;
      const fx = (x + half) / step;
      const fz = (z + half) / step;
      if (fx < 0 || fz < 0 || fx > subdivisions || fz > subdivisions) return null;
      const ix0 = Math.floor(fx);
      const iz0 = Math.floor(fz);
      const ix1 = Math.min(ix0 + 1, subdivisions);
      const iz1 = Math.min(iz0 + 1, subdivisions);
      const sx = fx - ix0;
      const sz = fz - iz0;
      const stride = subdivisions + 1;
      const h00 = heights[iz0 * stride + ix0];
      const h10 = heights[iz0 * stride + ix1];
      const h01 = heights[iz1 * stride + ix0];
      const h11 = heights[iz1 * stride + ix1];
      const hx0 = lerp(h00, h10, sx);
      const hx1 = lerp(h01, h11, sx);
      return lerp(hx0, hx1, sz);
   }

   function deformTerrainAt(point, radius, depth) {
      const terrain = environment.terrain;
      if (!terrain) return;
      const { step, half, subdivisions, heights, positions, normals, indices, mesh, minHeight } = terrain;
      const stride = subdivisions + 1;
      const minX = Math.max(0, Math.floor((point.x + half - radius) / step));
      const maxX = Math.min(subdivisions, Math.ceil((point.x + half + radius) / step));
      const minZ = Math.max(0, Math.floor((point.z + half - radius) / step));
      const maxZ = Math.min(subdivisions, Math.ceil((point.z + half + radius) / step));
      let changed = false;
      for (let iz = minZ; iz <= maxZ; iz++) {
         const vz = -half + iz * step;
         for (let ix = minX; ix <= maxX; ix++) {
            const vx = -half + ix * step;
            const dx = vx - point.x;
            const dz = vz - point.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > radius) continue;
            const falloff = Math.cos((dist / radius) * Math.PI) * 0.5 + 0.5;
            const idx = iz * stride + ix;
            const current = heights[idx];
            const next = Math.max(minHeight, current - depth * falloff);
            if (next === current) continue;
            heights[idx] = next;
            positions[idx * 3 + 1] = next;
            changed = true;
         }
      }
      if (!changed) return;
      BABYLON.VertexData.ComputeNormals(positions, indices, normals);
      mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions, true);
      mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals, true);
      mesh.refreshBoundingInfo();
   }

   function scatterVegetation(scene) {
      const terrain = environment.terrain;
      if (!terrain) return;
      const treeCount = 18;
      const trunkHeight = 3.8;
      const trunkTemplate = BABYLON.MeshBuilder.CreateCylinder("treeTrunkTemplate", {
         height: trunkHeight,
         diameterTop: 0.35,
         diameterBottom: 0.55,
         tessellation: 8
      }, scene);
      const trunkMat = new BABYLON.StandardMaterial("treeTrunkMat", scene);
      trunkMat.diffuseColor = new BABYLON.Color3(0.36, 0.23, 0.13);
      trunkMat.specularColor = BABYLON.Color3.Black();
      trunkTemplate.material = trunkMat;
      trunkTemplate.isVisible = false;
      trunkTemplate.isPickable = false;
      trunkTemplate.checkCollisions = true;

      const leavesTemplate = BABYLON.MeshBuilder.CreateSphere("treeLeavesTemplate", {
         diameter: 2.6,
         segments: 6
      }, scene);
      const leavesMat = new BABYLON.StandardMaterial("treeLeavesMat", scene);
      leavesMat.diffuseColor = new BABYLON.Color3(0.12, 0.32, 0.16);
      leavesMat.emissiveColor = new BABYLON.Color3(0.04, 0.12, 0.06);
      leavesMat.specularColor = BABYLON.Color3.Black();
      leavesTemplate.material = leavesMat;
      leavesTemplate.isVisible = false;
      leavesTemplate.isPickable = false;

      for (let i = 0; i < treeCount; i++) {
         const x = rand(-world.size / 2 + 6, world.size / 2 - 6);
         const z = rand(-world.size / 2 + 6, world.size / 2 - 6);
         if (Math.sqrt(x * x + z * z) < 6) continue;
         const h = getTerrainHeight(x, z);
         if (h === null) continue;
         const hX = getTerrainHeight(x + 1.2, z);
         const hZ = getTerrainHeight(x, z + 1.2);
         if (hX === null || hZ === null) continue;
         if (Math.abs(h - hX) > 1.6 || Math.abs(h - hZ) > 1.6) continue;
         const parent = new BABYLON.TransformNode("tree" + i, scene);
         parent.position.set(x, h, z);
         parent.rotation.y = rand(0, Math.PI * 2);
         const scale = 0.8 + Math.random() * 1.2;
         parent.scaling.set(scale, scale, scale);
         const trunk = trunkTemplate.createInstance("treeTrunkInst" + i);
         trunk.parent = parent;
         trunk.position.y = trunkHeight / 2;
         trunk.checkCollisions = true;
         const leaves = leavesTemplate.createInstance("treeLeavesInst" + i);
         leaves.parent = parent;
         leaves.position.y = trunkHeight - 0.3;
      }

      const grassTemplate = BABYLON.MeshBuilder.CreatePlane("grassTemplate", {
         width: 0.75,
         height: 1.2,
         sideOrientation: BABYLON.Mesh.DOUBLESIDE
      }, scene);
      const grassMat = new BABYLON.StandardMaterial("grassMat", scene);
      grassMat.diffuseColor = new BABYLON.Color3(0.16, 0.44, 0.16);
      grassMat.emissiveColor = new BABYLON.Color3(0.04, 0.16, 0.04);
      grassMat.specularColor = BABYLON.Color3.Black();
      grassMat.backFaceCulling = false;
      grassTemplate.material = grassMat;
      grassTemplate.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_Y;
      grassTemplate.isVisible = false;
      grassTemplate.isPickable = false;

      const tuftCount = 130;
      for (let i = 0; i < tuftCount; i++) {
         const x = rand(-world.size / 2 + 2, world.size / 2 - 2);
         const z = rand(-world.size / 2 + 2, world.size / 2 - 2);
         const h = getTerrainHeight(x, z);
         if (h === null || h > 8) continue;
         const tuft = grassTemplate.createInstance("grassInst" + i);
         tuft.position.set(x, h + 0.05, z);
         const s = 0.6 + Math.random() * 0.8;
         tuft.scaling.set(s, s, s);
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

   function setupEnvironment(scene) {
      reseedEnvironment();
      environment.sky?.dispose();
      environment.sunMesh?.dispose();
      environment.moonMesh?.dispose();
      environment.sun?.dispose();
      environment.moon?.dispose();
      environment.hemi?.dispose();
      if (world.ground) {
         world.ground.dispose();
         world.ground = null;
      }
      world.platforms = [];
      environment.terrain = null;

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
      scatterVegetation(scene);
      createCloudLayer(scene);
      updateEnvironment(60);
   }

   function updateEnvironment(dt) {
      if (!environment.sun || !environment.skyMaterial) return;
      environment.time = (environment.time + dt) % environment.dayLength;
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
      groundNormal: new BABYLON.Vector3(0, 1, 0),

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
      setupEnvironment(scene);

      const spawnHeight = getTerrainHeight(0, 0);
      const baseY = spawnHeight === null ? 3 : spawnHeight + 1.8;
      startPos = new BABYLON.Vector3(0, baseY, 0);

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
         attackAnimT: 0
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

   function playerAimDir() {
      return camera.getDirection(new BABYLON.Vector3(0, 0, 1)).normalize();
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
      const dmg = (18 + state.eff.focus * 2.0 * (state.ch.nen === "Emitter" ? 1.35 : 1));
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
               const dmg = (12 + state.eff.focus * 1.6);
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
         P.armR.shoulder.rotation.x = -1.6 * k;
         P.armR.elbow.rotation.x = 0.2 * (1 - k);
         P.armR.wrist.rotation.x = 0.12;
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
         P.armR.shoulder.rotation.x = -1.6 * k;
         P.armR.elbow.rotation.x = 0.2 * (1 - k);
         P.armR.wrist.rotation.x = 0.12;
      }
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

      updateEnvironment(dt);

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
            if (world.ground) {
               const groundY = getTerrainHeight(p.mesh.position.x, p.mesh.position.z);
               if (groundY !== null && p.mesh.position.y - groundY < 6) {
                  deformTerrainAt(new BABYLON.Vector3(p.mesh.position.x, groundY, p.mesh.position.z), 2.2, 1.0);
               }
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
            if (collision.pickedMesh === world.ground && collision.pickedPoint) {
               const radius = 2.2 + (p.radius || 0) * 1.4;
               const depth = 1.0 + (p.radius || 0) * 0.6;
               deformTerrainAt(collision.pickedPoint, radius, depth);
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

         const deltaXZ = e.root.position.subtract(e.prevPos);
         deltaXZ.y = 0;
         const spd = deltaXZ.length() / Math.max(dt, 1e-4);
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
      const playerDelta = playerRoot.position.subtract(lastPos);
      playerDelta.y = 0;
      const playerSpd = playerDelta.length() / Math.max(dt, 1e-4);
      const playerAnimSpeed = playerSpd * 0.12;
      if (state.grounded && playerAnimSpeed < 0.05 && moveDir.lengthSquared() < 0.01) {
         updateIdleAnim(playerRoot, dt, state.attackAnimT);
      } else {
         updateWalkAnim(playerRoot, playerAnimSpeed, state.grounded, dt, state.attackAnimT);
      }
      applyFootIK(playerRoot, state.grounded);
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
})();
