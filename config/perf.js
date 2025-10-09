(function () {
  const root = (window.HXH ||= {});
  const CONFIG = (root.CONFIG ||= {});

  const DEFAULTS = Object.freeze({
    innerRadius: 256,
    outerRadius: 768,
    hysteresis: 64,
    budgetMs: 4,
    budgetOps: 200
  });

  const clampPositive = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);
  const normalize = (value, fallback) => (Number.isFinite(value) ? value : fallback);

  const existing = typeof CONFIG.streaming === "object" && CONFIG.streaming ? { ...CONFIG.streaming } : {};
  const inner = clampPositive(existing.innerRadius, DEFAULTS.innerRadius);
  const hysteresis = Math.max(0, normalize(existing.hysteresis, DEFAULTS.hysteresis));
  const outerCandidate = clampPositive(existing.outerRadius, DEFAULTS.outerRadius);
  const outer = Math.max(inner + hysteresis, outerCandidate);
  const budgetMs = Math.max(0, normalize(existing.budgetMs, DEFAULTS.budgetMs));
  const budgetOps = Math.max(1, Math.round(clampPositive(existing.budgetOps, DEFAULTS.budgetOps)));

  CONFIG.streaming = {
    innerRadius: inner,
    outerRadius: outer,
    hysteresis,
    budgetMs,
    budgetOps
  };
})();
