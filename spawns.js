// spawns.js
// Deterministic, per-column spawns for mobs and chests. Now uses RigFactory for humanoids,
// and respects column enable/disable for performance.

(function(){
  const { RigFactory, Species, SizeClass, rollSize, buildStats } = window.Rigs?.RigFactory ? window.Rigs : window.Rigs.RigFactory || window.Rigs;

  // Simple seeded RNG (xorshift)
  function XorShift(seed){
    let x = seed | 0 || 123456789;
    let y = 362436069, z = 521288629, w = 88675123;
    const fn = () => {
      const t = x ^ (x << 11);
      x = y; y = z; z = w;
      w = (w ^ (w >>> 19)) ^ (t ^ (t >>> 8));
      return (w >>> 0) / 4294967296;
    };
    return fn;
  }

  function hash3(a,b,c){
    // integer mix
    let h = 2166136261|0;
    h = Math.imul(h ^ a, 16777619);
    h = Math.imul(h ^ b, 16777619);
    h = Math.imul(h ^ c, 16777619);
    return h|0;
  }

  const Spawns = {
    init(scene){
      this.scene = scene;
      this.mobsByColumn = new Map();
      this.chestsByColumn = new Map();
      this.maxMobsPerColumn = 2;     // keep it lean for perf
      this.maxChestsPerColumn = 1;
      this.activeSet = new Set();    // currently enabled columns
    },

    disposeColumn(index){
      const mobs = this.mobsByColumn.get(index);
      if (mobs){
        for (const e of mobs){
          try { e.root?.dispose?.(); } catch{}
        }
        this.mobsByColumn.delete(index);
      }
      const chs = this.chestsByColumn.get(index);
      if (chs){
        for (const c of chs){
          try { c.dispose?.(); } catch{}
        }
        this.chestsByColumn.delete(index);
      }
      this.activeSet.delete(index);
    },

    ensureForColumn(environment, index){
      if (this.mobsByColumn.has(index) && this.chestsByColumn.has(index)) return;

      const centers = environment.terrain.centers;
      const heights = environment.terrain.heights;
      const center = centers[index];
      if (!center) return;

      // region/column seeded RNG
      const region = environment.region || { rx:0, rz:0, seed: (environment.seed|0)||1337 };
      const s = hash3(region.seed|0, (region.rx*73856093) ^ (region.rz*19349663), index|0);
      const rng = XorShift(s);

      // ---- enemies ----
      if (!this.mobsByColumn.has(index)){
        this.mobsByColumn.set(index, []);
        const mobCount = (rng() < 0.15) ? 2 : (rng() < 0.55 ? 1 : 0); // mostly 0–1, sometimes 2
        for (let i=0;i<Math.min(mobCount, this.maxMobsPerColumn);i++){
          const species = (rng()<0.65) ? Species.HUMANOID
                        : (rng()<0.15) ? Species.QUAD
                        : (rng()<0.1)  ? Species.ANTHRO
                        : (rng()<0.08) ? Species.AVIAN
                        : Species.HUMANOID;
          const size = rollSize(rng);
          const stats = buildStats(species, size);

          // random offset in the column footprint
          const offsetX = (rng()*0.6 - 0.3) * environment.terrain.settings.cubeSize;
          const offsetZ = (rng()*0.6 - 0.3) * environment.terrain.settings.cubeSize;

          const root = RigFactory.create(this.scene, species, size);
          root.position.set(center.x + offsetX, heights[index] + 0.02, center.z + offsetZ);

          root.metadata = {
            ...(root.metadata||{}),
            species, size, stats: {...stats}, hp: stats.hp, mob: true,
            columnIndex: index,
          };

          const enemy = {
            root, vel: new BABYLON.Vector3(0,0,0),
            prevPos: root.position.clone(),
            grounded: false, alive: true,
            aiT: 0, attackT: 0,
          };

          // keep disabled initially; update() will toggle on with the column
          root.setEnabled(false);

          this.mobsByColumn.get(index).push(enemy);
          (window.enemies = window.enemies || []).push(enemy);
        }
      }

      // ---- chests ----
      if (!this.chestsByColumn.has(index)){
        this.chestsByColumn.set(index, []);
        if (rng() < 0.18){ // 18% chance for a chest
          const chest = BABYLON.MeshBuilder.CreateBox("chest",{size:0.7}, this.scene);
          chest.position.set(center.x, heights[index]+0.35, center.z);
          const m = new BABYLON.StandardMaterial("chestM", this.scene);
          m.diffuseColor = new BABYLON.Color3(0.6,0.45,0.22); m.emissiveColor = m.diffuseColor.scale(0.07);
          chest.material=m;
          chest.setEnabled(false);
          chest.metadata = { chest:true, columnIndex:index, seed:s };
          this.chestsByColumn.get(index).push(chest);
          (window.chests = window.chests || []).push(chest);
        }
      }
    },

    // called whenever columnStates change due to terrain streaming
    syncEnabledWithColumns(environment){
      const states = environment.terrain.columnStates;
      if (!states) return;

      for (let i=0;i<states.length;i++){
        const on = !!states[i];
        const was = this.activeSet.has(i);
        if (on && !was){
          this.activeSet.add(i);
          const mobs = this.mobsByColumn.get(i);
          const chs  = this.chestsByColumn.get(i);
          mobs?.forEach(e=> e.root?.setEnabled?.(true));
          chs?.forEach(c=> c.setEnabled?.(true));
        }else if (!on && was){
          this.activeSet.delete(i);
          const mobs = this.mobsByColumn.get(i);
          const chs  = this.chestsByColumn.get(i);
          mobs?.forEach(e=> e.root?.setEnabled?.(false));
          chs?.forEach(c=> c.setEnabled?.(false));
        }
      }
    },

    update(environment){
      if (!environment?.terrain) return;
      // Ensure we have content for newly-visible columns
      const states = environment.terrain.columnStates;
      if (!states) return;

      for (let i=0;i<states.length;i++){
        if (states[i]) this.ensureForColumn(environment, i);
      }
      this.syncEnabledWithColumns(environment);

      // Lightweight AI tick for active columns only
      const dt = this.scene.getEngine().getDeltaTime()/1000;
      this.activeSet.forEach(i=>{
        const arr = this.mobsByColumn.get(i); if (!arr) return;
        for (let k=arr.length-1;k>=0;k--){
          const e = arr[k]; if (!e || !e.alive || !e.root?.isEnabled()) continue;
          // simple face-towards-player + drift
          const player = window.playerRoot;
          if (player){
            const to = player.position.subtract(e.root.position);
            const dist = to.length(); if (dist>0.0001) to.scaleInPlace(1.0/dist);
            const speed = (e.root.metadata?.stats?.speed || 3.6) * 0.4;
            e.root.movePOV(0,0,speed*dt); // use POV forward
            // rotate slowly towards player
            e.root.rotation.y = Math.atan2(to.x, to.z);
          }
        }
      });
    }
  };

  window.Spawns = Spawns;
})();
