const API_BASE = (window.POCKETSMART_API || localStorage.getItem("pocketsmart_api") || "").replace(/\/$/, "");
let authMode = "register";
let currentUser = JSON.parse(localStorage.getItem("ps_user") || "null");
let token = localStorage.getItem("ps_token") || "";

const $ = (id) => document.getElementById(id);
$("year").textContent = new Date().getFullYear();

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}
function setUser(user, accessToken) {
  currentUser = user; token = accessToken;
  if (user) { localStorage.setItem("ps_user", JSON.stringify(user)); localStorage.setItem("ps_token", token); }
  else { localStorage.removeItem("ps_user"); localStorage.removeItem("ps_token"); }
  renderAuth();
}
function renderAuth() {
  $("authActions").classList.toggle("hidden", !!currentUser);
  $("userActions").classList.toggle("hidden", !currentUser);
  $("welcomeText").textContent = currentUser ? `Hi, ${currentUser.name || currentUser.email.split("@")[0]}` : "";
}
function openAuth(mode) {
  authMode = mode; $("authTitle").textContent = mode === "register" ? "Create your account" : "Welcome back";
  $("authSubtitle").textContent = mode === "register" ? "Save your plans and pick up where you left off." : "Log in to access your saved plans.";
  $("authName").parentElement.classList.toggle("hidden", mode !== "register");
  $("authName").required = mode === "register";
  $("authSubmit").textContent = mode === "register" ? "Create account" : "Log in";
  $("authSwitch").innerHTML = mode === "register" ? 'Already have an account? <button type="button" id="switchAuth">Log in</button>' : 'New to PocketSmart? <button type="button" id="switchAuth">Create an account</button>';
  $("authMessage").textContent = ""; $("authModal").classList.remove("hidden");
  $("switchAuth").onclick = () => openAuth(mode === "register" ? "login" : "register");
}
function closeAuth() { $("authModal").classList.add("hidden"); }
async function api(path, options = {}) {
  if (!API_BASE) throw new Error("Backend URL is not configured yet. Deploy the Worker, then set API_BASE in frontend/app.js.");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || "Something went wrong.");
  return data;
}
$("openLogin").onclick = () => openAuth("login");
$("openRegister").onclick = () => openAuth("register");
$("heroStart").onclick = () => openAuth("register");
$("ctaStart").onclick = () => currentUser ? openPlanner("home") : openAuth("register");
$("closeAuth").onclick = closeAuth;
$("authModal").addEventListener("click", e => { if (e.target === $("authModal")) closeAuth(); });
$("logoutBtn").onclick = () => { setUser(null, ""); toast("You are logged out."); };
$("authForm").addEventListener("submit", async e => {
  e.preventDefault(); $("authMessage").textContent = "Please wait…"; $("authSubmit").disabled = true;
  try {
    const payload = { email: $("authEmail").value.trim(), password: $("authPassword").value };
    if (authMode === "register") payload.name = $("authName").value.trim();
    const data = await api(authMode === "register" ? "/api/register" : "/api/login", { method: "POST", body: JSON.stringify(payload) });
    setUser(data.user, data.token); closeAuth(); toast(authMode === "register" ? "Account created. Welcome!" : "Logged in successfully.");
  } catch (err) { $("authMessage").textContent = err.message; }
  finally { $("authSubmit").disabled = false; }
});

const plannerInfo = {
  home: ["Home Interior Planner", "Create a room refresh plan with a practical budget."],
  party: ["Party Planner", "Organize a celebration with a theme, checklist, and cost estimate."],
  jewelry: ["Jewelry & Style Planner", "Explore accessory ideas for your occasion and budget."]
};
function openPlanner(type) {
  $("plannerType").value = type; $("plannerTitle").textContent = plannerInfo[type][0]; $("plannerIntro").textContent = plannerInfo[type][1];
  $("plannerMessage").textContent = ""; $("planResult").classList.add("hidden"); $("planResult").innerHTML = "";
  $("plannerModal").classList.remove("hidden");
}
document.querySelectorAll("[data-planner]").forEach(button => button.addEventListener("click", () => {
  if (!currentUser) { openAuth("register"); toast("Create an account to generate and save plans."); return; }
  openPlanner(button.dataset.planner);
}));
$("closePlanner").onclick = () => $("plannerModal").classList.add("hidden");
$("plannerModal").addEventListener("click", e => { if (e.target === $("plannerModal")) $("plannerModal").classList.add("hidden"); });
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
function renderPlan(plan) {
  const result = $("planResult");
  const sections = Array.isArray(plan.sections) ? plan.sections : [];
  result.innerHTML = `<h3>${escapeHtml(plan.title || "Your PocketSmart plan")}</h3><p>${escapeHtml(plan.summary || "")}</p>` +
    sections.map(s => `<h4>${escapeHtml(s.heading || "Suggestions")}</h4><ul>${(s.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`).join("") +
    `<p><b>Estimated budget:</b> ₹${Number(plan.estimated_budget || 0).toLocaleString("en-IN")}</p>` +
    `<p class="source-note">${escapeHtml(plan.source === "gemini" ? "Generated with AI. Verify prices and availability before purchase." : "Demo plan: AI service is unavailable or not configured. Suggestions are illustrative.")}</p>`;
  result.classList.remove("hidden");
}
$("plannerForm").addEventListener("submit", async e => {
  e.preventDefault(); $("generateBtn").disabled = true; $("generateBtn").textContent = "Creating your plan…"; $("plannerMessage").textContent = "";
  const payload = { type: $("plannerType").value, goal: $("goal").value.trim(), budget: Number($("budget").value), preference: $("preference").value.trim(), details: $("details").value.trim() };
  try {
    const data = await api("/api/generate", { method: "POST", body: JSON.stringify(payload) });
    renderPlan(data.plan); toast("Your plan is ready and saved.");
  } catch (err) { $("plannerMessage").textContent = err.message; }
  finally { $("generateBtn").disabled = false; $("generateBtn").textContent = "Generate my plan ✦"; }
});
renderAuth();
