const $ = (id) => document.getElementById(id);

// 2π * r=41
const CIRC = 257.6;

function colorFor(pct) {
  if (pct == null) return "rgba(255,255,255,0.15)";
  if (pct < 50) return "#3fb950";
  if (pct < 80) return "#f0a020";
  return "#f85149";
}

function fmtUpdated(iso) {
  if (!iso) return "—";
  try { return `Updated ${new Date(iso).toLocaleTimeString()}`; }
  catch { return "—"; }
}

function setRing(arcEl, pctEl, pct) {
  const color = colorFor(pct);
  arcEl.setAttribute("stroke", color);
  if (pct == null) {
    arcEl.style.strokeDashoffset = CIRC;
    pctEl.textContent = "—";
  } else {
    arcEl.style.strokeDashoffset = CIRC * (1 - Math.min(100, pct) / 100);
    pctEl.textContent = `${Math.round(pct)}%`;
  }
}

function render(state) {
  if (!state.authenticated || (state.error && state.session_percent == null)) {
    $("data").style.display = "none";
    $("empty").style.display = "flex";
    $("emptyMsg").textContent =
      state.error && state.error !== "Not signed in"
        ? state.error
        : "Not signed in to claude.ai";
    $("plan").textContent = "";
  } else {
    $("data").style.display = "flex";
    $("empty").style.display = "none";
    $("plan").textContent = state.plan || "";

    setRing($("sessionArc"), $("sessionPct"), state.session_percent);
    $("sessionReset").textContent = state.session_resets_in
      ? `resets in ${state.session_resets_in}`
      : "—";

    setRing($("weeklyArc"), $("weeklyPct"), state.weekly_percent);
    $("weeklyReset").textContent = state.weekly_resets_at
      ? `resets ${state.weekly_resets_at}`
      : "—";
  }
  $("updated").textContent = fmtUpdated(state.last_updated);
}

window.api.onUsageUpdate(render);
window.api.getUsage().then(render);

$("refreshBtn").addEventListener("click", async () => {
  $("refreshBtn").textContent = "…";
  $("refreshBtn").disabled = true;
  try {
    const s = await window.api.refreshUsage();
    render(s);
  } finally {
    $("refreshBtn").textContent = "Refresh";
    $("refreshBtn").disabled = false;
  }
});

$("settingsBtn").addEventListener("click", () => window.api.openSettings());
$("signInBtn").addEventListener("click", async () => {
  await window.api.authLogin();
  const s = await window.api.refreshUsage();
  render(s);
});
