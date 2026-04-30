const $ = (id) => document.getElementById(id);

async function loadSettings() {
  const s = await window.api.getSettings();
  $("interval").value = s.poll_interval_seconds || 60;
  $("launch").checked = !!s.launch_at_login;
}

async function refreshAuth() {
  const { authenticated } = await window.api.authStatus();
  setAuth(authenticated);
}

function setAuth(authenticated) {
  const status = $("authStatus");
  const text = $("authText");
  const connect = $("connectBtn");
  const logout = $("logoutBtn");
  if (authenticated) {
    status.classList.add("connected");
    text.textContent = "Connected to claude.ai";
    connect.style.display = "none";
    logout.style.display = "inline-block";
  } else {
    status.classList.remove("connected");
    text.textContent = "Not connected";
    connect.style.display = "inline-block";
    logout.style.display = "none";
  }
}

$("connectBtn").addEventListener("click", async () => {
  $("connectBtn").disabled = true;
  $("connectBtn").textContent = "Opening login…";
  try {
    const r = await window.api.authLogin();
    setAuth(r.authenticated);
  } finally {
    $("connectBtn").disabled = false;
    $("connectBtn").textContent = "Sign in to claude.ai";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await window.api.authLogout();
  setAuth(false);
});

$("saveBtn").addEventListener("click", async () => {
  await window.api.saveSettings({
    poll_interval_seconds: Number($("interval").value),
    launch_at_login: $("launch").checked
  });
  const saved = $("saved");
  saved.style.display = "inline";
  setTimeout(() => (saved.style.display = "none"), 1600);
});

$("cancelBtn").addEventListener("click", () => window.close());

window.api.onAuthUpdate((s) => setAuth(s.authenticated));

loadSettings();
refreshAuth();
