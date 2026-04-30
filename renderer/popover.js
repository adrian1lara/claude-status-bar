const $ = (id) => document.getElementById(id);

function colorFor(pct) {
  if (pct == null) return "#9a9aa2";
  if (pct < 50) return "#3fb950";
  if (pct < 80) return "#f0a020";
  return "#f85149";
}

function fmtUpdated(iso) {
  if (!iso) return "—";
  try { return `Updated ${new Date(iso).toLocaleTimeString()}`; }
  catch { return "—"; }
}

function setBar(barEl, pctEl, pct) {
  if (pct == null) {
    barEl.style.width = "0%";
    barEl.style.background = "#3a3a3d";
    pctEl.textContent = "—";
    pctEl.style.color = "var(--text)";
    return;
  }
  const c = colorFor(pct);
  barEl.style.width = `${Math.min(100, pct)}%`;
  barEl.style.background = c;
  pctEl.textContent = `${pct}%`;
  pctEl.style.color = c;
}

function render(state) {
  if (!state.authenticated) {
    $("data").style.display = "none";
    $("empty").style.display = "block";
    $("emptyMsg").textContent = "Not signed in to claude.ai";
    $("plan").textContent = "";
  } else {
    $("data").style.display = "block";
    $("empty").style.display = "none";
    $("plan").textContent = state.plan ? state.plan : "";

    setBar($("sessionBar"), $("sessionPct"), state.session_percent);
    $("sessionReset").textContent = state.session_resets_in
      ? `resets in ${state.session_resets_in}`
      : "—";

    setBar($("weeklyBar"), $("weeklyPct"), state.weekly_percent);
    $("weeklyReset").textContent = state.weekly_resets_at
      ? `resets ${state.weekly_resets_at}`
      : "—";

    if (state.error && state.session_percent == null) {
      $("data").style.display = "none";
      $("empty").style.display = "block";
      $("emptyMsg").textContent = state.error;
    }
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
