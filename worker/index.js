const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}
function fail(message, status = 400) { return json({ error: message }, status); }
async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function b64url(bytes) {
  let binary = ""; for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function signToken(payload, secret) {
  const data = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}
async function verifyToken(token, secret) {
  try {
    const [data, signature] = token.split(".");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const raw = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, raw, new TextEncoder().encode(data));
    if (!ok) return null;
    const payload = JSON.parse(atob(data.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
async function getUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  return verifyToken(header.slice(7), env.JWT_SECRET);
}
function demoPlan(input) {
  const budget = Math.max(0, Number(input.budget) || 0);
  const name = { home: "Home refresh", party: "Celebration plan", jewelry: "Jewelry & style ideas" }[input.type] || "PocketSmart plan";
  let sections;
  if (input.type === "home") sections = [
    { heading: "Start with the essentials", items: ["Measure the room and list what you already own before buying anything.", "Choose one main color and two supporting colors to keep the space cohesive.", "Improve lighting and declutter before spending on new furniture."] },
    { heading: "Budget split", items: [`Set aside about ${Math.round(budget * .45)} for priority items.`, `Keep around ${Math.round(budget * .2)} for lighting and small decor.`, `Reserve ${Math.round(budget * .15)} for unexpected costs; compare local prices for the rest.`] },
    { heading: "Next steps", items: ["Create a short shopping list with dimensions.", "Compare at least three sellers and check return policies.", "Complete one corner first, then adjust based on what works."] }
  ];
  else if (input.type === "party") sections = [
    { heading: "Theme & setup", items: [`Choose a simple theme that matches: ${input.preference || "your preferred vibe"}.`, "Use a small focal backdrop, reusable lights, and a few coordinated table details.", "Confirm guest count, venue, start time, and any accessibility needs."] },
    { heading: "Budget split", items: [`Food and drinks: approximately ${Math.round(budget * .4)}.`, `Decor and supplies: approximately ${Math.round(budget * .2)}.`, `Venue, activities, and contingency: split the remaining budget based on your needs.`] },
    { heading: "Checklist", items: ["One week before: confirm guests, menu, and supplies.", "One day before: prepare decorations and confirm deliveries.", "On the day: set up early and keep a simple schedule."] }
  ];
  else sections = [
    { heading: "Style direction", items: [`For ${input.goal || "your occasion"}, start with one statement piece and keep the rest balanced.`, `Try colors that complement ${input.preference || "your outfit and skin-tone preferences"}.`, "Consider comfort, weight, material sensitivity, and how long you will wear each piece."] },
    { heading: "Budget approach", items: [`Set a firm ceiling of ₹${budget.toLocaleString("en-IN")} and prioritize the one item that matters most.`, "Compare plating, material details, warranty, and return policy instead of judging only by appearance.", "For everyday wear, consider durable lightweight pieces; for a special event, choose one standout accessory."] },
    { heading: "Before buying", items: ["Match metals and tones intentionally, but mixing can work when it looks deliberate.", "Check product dimensions and seller reviews.", "Try the complete combination with your outfit before the occasion."] }
  ];
  return { title: name, summary: `A practical starter plan for “${input.goal || name}” within a target budget of ₹${budget.toLocaleString("en-IN")}. ${input.details ? "Extra notes considered: " + input.details : ""}`, estimated_budget: budget, sections, source: "demo" };
}
async function generatePlan(input, env) {
  const fallback = demoPlan(input);
  if (!env.GEMINI_API_KEY) return fallback;
  const prompt = `You are PocketSmart AI, a practical planning assistant. Return ONLY valid JSON matching {"title":string,"summary":string,"estimated_budget":number,"sections":[{"heading":string,"items":[string]}]}. Type: ${input.type}. Goal: ${input.goal}. Budget in INR: ${input.budget}. Preference: ${input.preference || "not specified"}. Details: ${input.details || "none"}. Provide realistic, actionable, budget-conscious suggestions. Do not claim exact live prices, availability, or verified links. Use 3 sections and 3-5 concise items per section. Keep estimated_budget at or below the user's budget unless clearly explaining an optional extra.`;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7 } })
    });
    if (!response.ok) return fallback;
    const body = await response.json();
    const text = body.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
    return { ...parsed, estimated_budget: Number(parsed.estimated_budget ?? input.budget), source: "gemini" };
  } catch { return fallback; }
}
async function handle(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  if (url.pathname === "/api/health") return json({ status: "ok", app: "PocketSmart AI" });
  if (url.pathname === "/api/register" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
    const password = String(body.password || "");
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return fail("Enter a name, valid email, and password with at least 8 characters.");
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (exists) return fail("An account with this email already exists.", 409);
    const id = crypto.randomUUID();
    const passwordHash = await sha256(`${env.PASSWORD_PEPPER}:${password}`);
    await env.DB.prepare("INSERT INTO users (id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)").bind(id, name, email, passwordHash, new Date().toISOString()).run();
    const token = await signToken({ sub: id, email, name, exp: Math.floor(Date.now()/1000) + 60*60*24*7 }, env.JWT_SECRET);
    return json({ user: { id, name, email }, token }, 201);
  }
  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = await env.DB.prepare("SELECT id,name,email,password_hash FROM users WHERE email = ?").bind(email).first();
    if (!user || user.password_hash !== await sha256(`${env.PASSWORD_PEPPER}:${password}`)) return fail("Email or password is incorrect.", 401);
    const token = await signToken({ sub: user.id, email: user.email, name: user.name, exp: Math.floor(Date.now()/1000) + 60*60*24*7 }, env.JWT_SECRET);
    return json({ user: { id: user.id, name: user.name, email: user.email }, token });
  }
  const auth = await getUser(request, env);
  if (url.pathname === "/api/generate" && request.method === "POST") {
    if (!auth) return fail("Please log in again to continue.", 401);
    const body = await request.json().catch(() => ({}));
    const type = String(body.type || "");
    const goal = String(body.goal || "").trim().slice(0, 180);
    const budget = Number(body.budget);
    if (!["home","party","jewelry"].includes(type) || !goal || !Number.isFinite(budget) || budget < 0 || budget > 100000000) return fail("Enter a goal and a valid budget.");
    const input = { type, goal, budget, preference: String(body.preference || "").slice(0, 180), details: String(body.details || "").slice(0, 1000) };
    const plan = await generatePlan(input, env);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO plans (id,user_id,type,goal,budget,plan_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(id, auth.sub, type, goal, budget, JSON.stringify(plan), new Date().toISOString()).run();
    return json({ id, plan });
  }
  if (url.pathname === "/api/history" && request.method === "GET") {
    if (!auth) return fail("Please log in again to continue.", 401);
    const result = await env.DB.prepare("SELECT id,type,goal,budget,plan_json,created_at FROM plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(auth.sub).all();
    return json({ history: (result.results || []).map(row => ({ ...row, plan: JSON.parse(row.plan_json) })) });
  }
  return fail("Route not found.", 404);
}
export default { fetch: handle };
