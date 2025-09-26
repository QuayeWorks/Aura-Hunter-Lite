(function(){
  const Spawns = {
    mobsByColumn: new Map(),
    chestsByColumn: new Map(),

    reset(){
      // dispose old meshes if any
      for (const [, list] of this.mobsByColumn) list.forEach(m=>{ try{ m.dispose(); }catch{} });
      for (const [, list] of this.chestsByColumn) list.forEach(c=>{ try{ c.dispose(); }catch{} });
      this.mobsByColumn.clear();
      this.chestsByColumn.clear();
    },

    ensureForColumn(scene, columnIndex){
      const terrain = environment.terrain;
      if (!terrain) return;
      if (this.mobsByColumn.has(columnIndex)) return;

      const seed = Utils.hash3(environment.seed, columnIndex, 0xC0FFEE);
      const rng  = Utils.mulberry32(seed);
      const center = terrain.centers[columnIndex];
      if (!center) return;

      if (rng() < 0.08) this.spawnChest(scene, columnIndex, rng);

      const mobCount = (rng() < 0.15) ? 0 : (rng() < 0.55 ? 1 : (rng() < 0.85 ? 2 : 3));
      for (let i=0;i<mobCount;i++) this.spawnMob(scene, columnIndex, rng);
    },

    spawnChest(scene, columnIndex, rng){
      const t = environment.terrain;
      const center = t.centers[columnIndex];
      const dirtTop = getTerrainLayerTopForColumn(columnIndex, 1);
      if (dirtTop === null) return;
      const offsetX = (rng()-0.5)*t.cubeSize*0.9, offsetZ = (rng()-0.5)*t.cubeSize*0.9;
      const pos = new BABYLON.Vector3(center.x+offsetX, dirtTop+0.65, center.z+offsetZ);
      const chest = BABYLON.MeshBuilder.CreateBox("chest", { size: 0.6 }, scene);
      chest.position.copyFrom(pos);
      chest.checkCollisions = true; chest.isPickable = true;
      chest.metadata = { loot: Items.rollLoot(rng) };

      if (!this.chestsByColumn.has(columnIndex)) this.chestsByColumn.set(columnIndex, []);
      this.chestsByColumn.get(columnIndex).push(chest);
      chest.setEnabled(!!environment.terrain.columnStates[columnIndex]);
    },

    spawnMob(scene, columnIndex, rng){
      const t = environment.terrain;
      const center = t.centers[columnIndex];
      const dirtTop = getTerrainLayerTopForColumn(columnIndex, 1);
      if (dirtTop === null) return;

      const r = rng();
      const species = r < 0.45 ? Rigs.Species.HUMANOID
                    : r < 0.70 ? Rigs.Species.QUAD
                    : r < 0.85 ? Rigs.Species.AVIAN
                    : r < 0.95 ? Rigs.Species.AQUATIC
                    : Rigs.Species.ANTHRO;

      const size = Rigs.rollSize(rng, species);
      const mobRoot = Rigs.RigFactory.create(scene, species, size);

      const offsetX = (rng()-0.5)*t.cubeSize*0.9, offsetZ = (rng()-0.5)*t.cubeSize*0.9;
      mobRoot.position.set(center.x+offsetX, dirtTop+0.01, center.z+offsetZ);
      mobRoot.metadata.columnIndex = columnIndex;

      if (!this.mobsByColumn.has(columnIndex)) this.mobsByColumn.set(columnIndex, []);
      this.mobsByColumn.get(columnIndex).push(mobRoot);
      window.enemies?.push?.(mobRoot);
      mobRoot.setEnabled(!!environment.terrain.columnStates[columnIndex]);
    },
	
	

    update(scene){
      const t = environment.terrain;
      if (!t) return;
      const N = t.columns.length;
      for (let i=0;i<N;i++){
        const active = !!t.columnStates[i];
        if (active){
          this.ensureForColumn(scene, i);
          this.mobsByColumn.get(i)?.forEach(m => m.setEnabled(true));
          this.chestsByColumn.get(i)?.forEach(c => c.setEnabled(true));
        } else {
          this.mobsByColumn.get(i)?.forEach(m => m.setEnabled(false));
          this.chestsByColumn.get(i)?.forEach(c => c.setEnabled(false));
        }
      }
    }
  };
  
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
   
   	// ADD: utility to absorb one ability from victim
	function tryAnthroAbsorb(killerMesh, victimMesh) {
	  const k = killerMesh?.metadata?.stats;
	  const v = victimMesh?.metadata?.stats;
	  if (!k || !v) return;

	  if (k.species !== Species.ANTHRO) return;
	  if (Math.random() < 0.25) {
		// pick one victim ability (if any)
		const arr = Array.from(v.abilities || []);
		if (arr.length) {
		  const pick = arr[(Math.random() * arr.length) | 0];
		  k.abilities.add(pick);
		  // bonus power (portion of victim's dmg)
		  k.dmg += (v.dmg * 0.15);
		  msg(`Absorbed ${pick}! (+DMG)`);
		}
	  }
	}

   
  window.Spawns = Spawns;
})();
