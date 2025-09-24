// character.js — creator wired to #screen--creator and cc-* fields
(function () {
  const MAX_POINTS = 10;

  function $(sel, root=document) { return root.querySelector(sel); }

  function loadRigColor() {
    try {
      const rig = JSON.parse(localStorage.getItem("hxh.rig.params") || "null");
      if (rig?.color) return rig.color;
    } catch {}
    return "#00ffcc";
  }

  function boot() {
    const screen = document.getElementById("screen--creator");
    if (!screen) return; // creator not present yet

    const form   = $("#creator-form", screen);
    const nameEl = $("#cc-name", screen);
    const clanEl = $("#cc-clan", screen);
    const nenEl  = $("#cc-nen", screen);
    const colEl  = $("#cc-color", screen);

    const pEl = $("#cc-power", screen);
    const aEl = $("#cc-agility", screen);
    const fEl = $("#cc-focus", screen);
    const remWrap = $("#points-remaining", screen);
    const remNum  = $("#points-remaining b", screen);
    const cancel  = $("#btn-cancel", screen);

    // default color from rig if user didn't pick
    if (colEl && !colEl.dataset.userTouched) {
      colEl.value = loadRigColor();
      colEl.addEventListener("input", ()=> colEl.dataset.userTouched = "1");
    }

    function clamp01(x,min,max){ return Math.min(max, Math.max(min, x)); }
    function nums() {
      const p = parseInt(pEl?.value ?? "0",10) || 0;
      const a = parseInt(aEl?.value ?? "0",10) || 0;
      const f = parseInt(fEl?.value ?? "0",10) || 0;
      return { p, a, f, sum: p+a+f };
    }
    function sync() {
      const n = nums();
      if (remNum) remNum.textContent = String(MAX_POINTS - n.sum);
      // hard cap: if sum > MAX_POINTS, reduce the last edited field
    }

    function onNumberInput(e){
      const el = e.target;
      el.value = String(clamp01(parseInt(el.value||"0",10)||0, 0, MAX_POINTS));
      let {p,a,f,sum} = nums();
      if (sum > MAX_POINTS) {
        // subtract overflow from the edited field
        const over = sum - MAX_POINTS;
        el.value = String(clamp01((parseInt(el.value,10)||0) - over, 0, MAX_POINTS));
      }
      sync();
    }

    [pEl,aEl,fEl].forEach(el => el && el.addEventListener("input", onNumberInput));

    cancel?.addEventListener("click", () => {
      // back to menu, restart menu bg
      document.querySelectorAll(".screen").forEach(s=>s.classList.remove("visible"));
      document.getElementById("screen--menu")?.classList.add("visible");
      window.MenuBG?.start();
    });

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const {p,a,f,sum} = nums();
      if (sum !== MAX_POINTS) {
        alert(`Please allocate exactly ${MAX_POINTS} points (you have ${MAX_POINTS - sum} remaining).`);
        return;
      }
      const ch = {
        name: (nameEl?.value || "Hunter").trim(),
        clan: (clanEl?.value || "Wanderer").trim(),
        nen:  nenEl?.value || "Enhancer",
        color: colEl?.value || loadRigColor(),
        stats: { power: p, agility: a, focus: f }
      };
      try { localStorage.setItem("hxh.character", JSON.stringify(ch)); } catch {}

      // go to game
      document.querySelectorAll(".screen").forEach(s=>s.classList.remove("visible"));
      document.getElementById("screen--game")?.classList.add("visible");
      window.MenuBG?.stop();
      window.HXH?.startGame(ch);
    });

    // initial sync
    sync();
  }

  document.addEventListener("DOMContentLoaded", boot);
  window.CharacterUI = { boot }; // call again when showing the creator screen
})();
