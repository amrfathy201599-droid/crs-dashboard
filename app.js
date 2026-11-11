/* Energya CRS Control Room - app.js
   Same logic as the Power BI measures:
   Received New X = rows(status=Received & remark=X)
   Processing X   = rows(status=Remaning & remark=X) + Received New X
   Released X     = rows(remark=X)
   Remaining X    = Processing X - Released X                                  */

const CFG = window.APP_CONFIG;
const TYPES = ["CR", "UPDATE", "CLARIFICATION"];
const TYPE_LABEL = { CR: "CRS", UPDATE: "UPDATE", CLARIFICATION: "CLARIFICATION" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const $ = (s) => document.querySelector(s);
const demoMode = !CFG.firebase.apiKey || CFG.firebase.apiKey.startsWith("PASTE");

/* ------------------------------------------------------------------ calc */
export function calc(rows) {
  const out = {};
  for (const t of TYPES) out[t] = { recv: 0, rem: 0, released: 0 };
  let items = 0;
  for (const r of rows) {
    const o = out[r.r];
    if (!o) continue;
    o.released++;
    r.s === "M" ? o.rem++ : o.recv++;
  }
  for (const r of rows) items += r.t || 0;
  for (const t of TYPES) {
    out[t].processing = out[t].rem + out[t].recv;
    out[t].remaining = out[t].processing - out[t].released;
  }
  out.items = items;
  return out;
}
window.__calc = calc;

/* ------------------------------------------------------------------ state */
const S = {
  chunks: new Map(), // key -> rows
  rows: [], // flattened + enriched
  region: "all",
  f: { y: "all", q: "all", m: "all", d: "all" },
  preset: "latest",
  meta: null,
  first: true,
  fresh: new Set(),
};
const rowKey = (r) => `${r.reg}|${r.i}|${r.r}|${r.o}`;

function rebuild() {
  const rows = [];
  for (const [key, list] of S.chunks) {
    const reg = key.split("_")[0];
    list.forEach((r, idx) => {
      const d = r.o || r.a;
      const [y, m, dd] = d.split("-").map(Number);
      rows.push({ ...r, reg, idx, d, y, m, dd, q: Math.ceil(m / 3), nm: r.n || "(Blank)" });
    });
  }
  S.rows = rows;
}
const maxDate = () => S.rows.reduce((a, r) => (r.d > a ? r.d : a), "");

function filtered(ignoreDate = false) {
  const { y, q, m, d } = S.f;
  return S.rows.filter(
    (r) =>
      (S.region === "all" || r.reg === S.region) &&
      (ignoreDate || ((y === "all" || r.y == y) && (q === "all" || r.q == q) && (m === "all" || r.m == m) && (d === "all" || r.dd == d)))
  );
}

/* ------------------------------------------------------------------ filters UI */
function setPreset(p) {
  S.preset = p;
  const now = new Date();
  const set = (y = "all", q = "all", m = "all", d = "all") => (S.f = { y, q, m, d });
  if (p === "all") set();
  if (p === "year") set(now.getFullYear());
  if (p === "month") set(now.getFullYear(), "all", now.getMonth() + 1);
  if (p === "today") set(now.getFullYear(), "all", now.getMonth() + 1, now.getDate());
  if (p === "latest") {
    const md = maxDate();
    if (md) {
      const [y, m, d] = md.split("-").map(Number);
      set(y, "all", m, d);
    }
  }
  syncFilterUI();
  render();
}
function fillSelect(el, opts, val) {
  const cur = String(val);
  el.innerHTML = opts.map(([v, l]) => `<option value="${v}" ${String(v) === cur ? "selected" : ""}>${l}</option>`).join("");
}
function syncFilterUI() {
  const years = [...new Set(S.rows.map((r) => r.y))].sort();
  fillSelect($("#fYear"), [["all", "All years"], ...years.map((y) => [y, y])], S.f.y);
  fillSelect($("#fQuarter"), [["all", "All quarters"], ...[1, 2, 3, 4].map((q) => [q, "Q" + q])], S.f.q);
  fillSelect($("#fMonth"), [["all", "All months"], ...MONTHS.map((n, i) => [i + 1, n])], S.f.m);
  fillSelect($("#fDay"), [["all", "All days"], ...Array.from({ length: 31 }, (_, i) => [i + 1, i + 1])], S.f.d);
  document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("on", b.dataset.p === S.preset));
}
function bindFilters() {
  document.querySelectorAll("#presets button").forEach((b) => (b.onclick = () => setPreset(b.dataset.p)));
  const map = { fYear: "y", fQuarter: "q", fMonth: "m", fDay: "d" };
  for (const id in map)
    $("#" + id).onchange = (e) => {
      S.f[map[id]] = e.target.value;
      S.preset = "custom";
      syncFilterUI();
      render();
    };
  document.querySelectorAll("#regionTabs button").forEach(
    (b) =>
      (b.onclick = () => {
        S.region = b.dataset.r;
        document.querySelectorAll("#regionTabs button").forEach((x) => x.classList.toggle("on", x === b));
        render();
      })
  );
}

/* ------------------------------------------------------------------ rendering */
const prevNums = new Map();
function countUp(el, to, key) {
  const from = prevNums.get(key) ?? 0;
  prevNums.set(key, to);
  if (from === to || matchMedia("(prefers-reduced-motion:reduce)").matches) return (el.textContent = to.toLocaleString());
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 700);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderHero(c) {
  const hero = $("#hero");
  if (!hero.children.length) {
    hero.innerHTML = TYPES.map(
      (t) => `<div class="kpi" data-t="${t}"><h3>${TYPE_LABEL[t]}</h3>
      <div class="main"><div><div class="num" data-k="released">0</div><div class="lbl">Released</div></div>
      <div class="ring"><svg viewBox="0 0 84 84" width="84" height="84"><circle class="bg" cx="42" cy="42" r="35"/><circle class="fg" cx="42" cy="42" r="35" stroke-dasharray="220" stroke-dashoffset="220"/></svg><span data-k="pct">0%</span></div></div>
      <div class="sub3"><div><b data-k="processing">0</b><span>Processing</span></div><div><b data-k="recv">0</b><span>Received new</span></div><div class="warn"><b data-k="remaining">0</b><span>Remaining</span></div></div></div>`
    ).join("");
  }
  for (const t of TYPES) {
    const card = hero.querySelector(`[data-t="${t}"]`);
    const v = c[t];
    for (const k of ["released", "processing", "recv", "remaining"]) countUp(card.querySelector(`[data-k=${k}]`), v[k], t + k);
    const pct = v.processing ? Math.min(1, v.released / v.processing) : 0;
    card.querySelector(".fg").style.strokeDashoffset = 220 * (1 - pct);
    card.querySelector("[data-k=pct]").textContent = Math.round(pct * 100) + "%";
  }
}

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
let charts = {};
function chartDefaults() {
  Chart.defaults.color = css("--mut");
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.borderColor = css("--line");
}
function ensureCharts() {
  if (charts.team) return;
  chartDefaults();
  const colors = { CR: css("--cr"), UPDATE: css("--up"), CLARIFICATION: css("--cl"), items: css("--it") };
  const common = { responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } } };
  charts.team = new Chart($("#cTeam"), {
    type: "bar",
    data: { labels: [], datasets: [
      ...TYPES.map((t) => ({ label: "Released " + TYPE_LABEL[t], data: [], backgroundColor: colors[t], borderRadius: 5, maxBarThickness: 26 })),
      { type: "line", label: "Items", data: [], yAxisID: "y2", borderColor: colors.items, backgroundColor: colors.items, tension: 0, pointRadius: 4, borderWidth: 2 },
    ] },
    options: { ...common, interaction: { mode: "index", intersect: false }, scales: { y: { beginAtZero: true, grid: { color: css("--line") } }, y2: { position: "right", beginAtZero: true, grid: { display: false }, title: { display: true, text: "Items" } }, x: { grid: { display: false } } } },
  });
  charts.mix = new Chart($("#cMix"), {
    type: "doughnut",
    data: { labels: TYPES.map((t) => TYPE_LABEL[t]), datasets: [{ data: [0, 0, 0], backgroundColor: TYPES.map((t) => colors[t]), borderWidth: 0, spacing: 3, borderRadius: 6 }] },
    options: { ...common, cutout: "68%" },
  });
  charts.trend = new Chart($("#cTrend"), {
    type: "line",
    data: { labels: [], datasets: TYPES.map((t) => ({ label: TYPE_LABEL[t], data: [], borderColor: colors[t], backgroundColor: colors[t] + "22", fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 })) },
    options: { ...common, interaction: { mode: "index", intersect: false }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } },
  });
}

function renderCharts(rows) {
  ensureCharts();
  // team
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.nm)) by.set(r.nm, []);
    by.get(r.nm).push(r);
  }
  const team = [...by].map(([n, rs]) => ({ n, c: calc(rs) })).sort((a, b) => TYPES.reduce((s, t) => s + b.c[t].released, 0) - TYPES.reduce((s, t) => s + a.c[t].released, 0));
  charts.team.data.labels = team.map((x) => x.n);
  TYPES.forEach((t, i) => (charts.team.data.datasets[i].data = team.map((x) => x.c[t].released)));
  charts.team.data.datasets[3].data = team.map((x) => x.c.items);
  charts.team.update();
  // mix
  const c = calc(rows);
  charts.mix.data.datasets[0].data = TYPES.map((t) => c[t].released);
  charts.mix.update();
  // trend (last 30 days ending at last filtered date)
  const base = filtered(true);
  const end = rows.length ? rows.reduce((a, r) => (r.d > a ? r.d : a), "") : maxDate();
  const days = [];
  if (end) {
    const e = new Date(end + "T00:00:00");
    for (let i = 29; i >= 0; i--) {
      const d = new Date(e);
      d.setDate(e.getDate() - i);
      days.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
    }
  }
  const idx = new Map(days.map((d, i) => [d, i]));
  const series = TYPES.map(() => days.map(() => 0));
  for (const r of base) if (idx.has(r.d) && r.r) series[TYPES.indexOf(r.r)][idx.get(r.d)]++;
  charts.trend.data.labels = days.map((d) => d.slice(8) + " " + MONTHS[+d.slice(5, 7) - 1]);
  series.forEach((s, i) => (charts.trend.data.datasets[i].data = s));
  charts.trend.update();
}

function renderCustomers(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r.c) continue;
    const k = r.c.toUpperCase();
    const e = m.get(k) || { n: r.c, v: 0 };
    e.v++;
    m.set(k, e);
  }
  const top = [...m.values()].sort((a, b) => b.v - a.v).slice(0, 8);
  const mx = top[0]?.v || 1;
  $("#topCust").innerHTML = top.length
    ? top.map((x) => `<li><div><span>${esc(x.n)}</span><b>${x.v}</b></div><i style="width:${(x.v / mx) * 100}%"></i></li>`).join("")
    : `<li class="empty">No customer data for this selection</li>`;
}

function renderFeed(rows) {
  const last = [...rows].sort((a, b) => (a.d === b.d ? b.idx - a.idx : a.d < b.d ? 1 : -1)).slice(0, 14);
  $("#feed").innerHTML = last.length
    ? last.map((r) => `<li class="${S.fresh.has(rowKey(r)) ? "fresh" : ""}"><span class="tag ${r.r}">${r.r === "CLARIFICATION" ? "CLARIF." : r.r || "?"}</span>
      <span class="nm">${esc(r.i)}<em>${esc(r.c)}</em></span><span class="who">${esc(r.nm)}</span><span class="dt">${r.reg === "europe" ? "EU" : "AF"} · ${r.d.slice(8)} ${MONTHS[r.m - 1]}</span></li>`).join("")
    : `<li class="empty">No records for this selection</li>`;
}

function renderRange() {
  const { y, q, m, d } = S.f;
  const parts = [d !== "all" ? d : null, m !== "all" ? MONTHS[m - 1] : null, q !== "all" ? "Q" + q : null, y !== "all" ? y : null].filter(Boolean);
  $("#rangeLabel").innerHTML = `Showing <b>${parts.length ? parts.join(" ") : "all time"}</b> · ${S.region === "all" ? "Europe + Africa" : S.region === "europe" ? "Europe" : "Africa"}`;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function render() {
  const rows = filtered();
  const c = calc(rows);
  renderRange();
  renderHero(c);
  renderCharts(rows);
  renderCustomers(rows);
  renderFeed(rows);
  window.__state = { rows: rows.length, c };
}

/* ------------------------------------------------------------------ data layer */
function applyChunks(updates, initial) {
  const added = [];
  for (const [key, rows] of updates) {
    if (!initial) {
      const reg = key.split("_")[0];
      const old = new Set((S.chunks.get(key) || []).map((r) => rowKey({ ...r, reg })));
      for (const r of rows) {
        const k = rowKey({ ...r, reg });
        if (!old.has(k)) added.push({ ...r, reg, k });
      }
    }
    rows.length ? S.chunks.set(key, rows) : S.chunks.delete(key);
  }
  rebuild();
  if (S.first) {
    S.first = false;
    setPreset("latest");
    return;
  }
  syncFilterUI();
  if (added.length) {
    added.forEach((r) => S.fresh.add(r.k));
    setTimeout(() => added.forEach((r) => S.fresh.delete(r.k)), 9000);
    toast(added.length === 1 ? `New ${added[0].r}: ${added[0].i}` : `${added.length} new records just arrived`);
  }
  render();
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("#toasts").append(t);
  setTimeout(() => t.remove(), 6000);
}
function setSync(ts, ok = true) {
  const el = $("#syncInfo");
  el.classList.toggle("off", !ok);
  const em = el.querySelector("em");
  if (!ok) return (em.textContent = "offline");
  S.lastSync = ts;
  const upd = () => {
    if (!S.lastSync) return (em.textContent = "live");
    const mins = Math.max(0, Math.round((Date.now() - S.lastSync) / 60000));
    em.textContent = `live · synced ${new Date(S.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${mins > 1 ? ` (${mins} min ago)` : ""}`;
  };
  upd();
  clearInterval(setSync.t);
  setSync.t = setInterval(upd, 30000);
}

/* ---- Firebase backend ---- */
async function firebaseBackend() {
  const V = "10.12.2";
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const app = initializeApp(CFG.firebase);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  let unsubs = [];
  return {
    login: (u, p) => A.signInWithEmailAndPassword(auth, `${u.trim().toLowerCase()}@${CFG.userDomain}`, p),
    logout: () => A.signOut(auth),
    onAuth: (cb) => A.onAuthStateChanged(auth, (u) => cb(!!u)),
    subscribe() {
      let initial = true;
      unsubs.push(
        F.onSnapshot(F.collection(db, "crs"), (snap) => {
          const ups = snap.docChanges().map((ch) => [ch.doc.id, ch.type === "removed" ? [] : ch.doc.data().rows || []]);
          applyChunks(ups, initial);
          initial = false;
        }, () => setSync(0, false)),
        F.onSnapshot(F.doc(db, "meta", "sync"), (d) => {
          const ls = d.data()?.lastSync;
          if (ls) setSync(ls.toMillis ? ls.toMillis() : +new Date(ls));
        })
      );
    },
    unsubscribe() { unsubs.forEach((u) => u()); unsubs = []; },
  };
}

/* ---- Demo backend (local data.json) ---- */
function demoBackend() {
  let timer, listeners = [], last = null;
  const ok = () => { try { return sessionStorage.getItem("demo") === "1"; } catch { return false; } };
  const poll = async (initial) => {
    try {
      const j = await (await fetch("data.json?t=" + Date.now(), { cache: "no-store" })).json();
      if (j.meta.lastSync === last) return;
      last = j.meta.lastSync;
      const ups = Object.entries(j.chunks).map(([k, v]) => [k, v.rows]);
      applyChunks(ups, initial);
      setSync(+new Date(j.meta.lastSync));
    } catch (e) {
      if (initial) $("#loginErr").textContent = "data.json not found - run: python sync_excel.py --export ../web/data.json";
      setSync(0, false);
    }
  };
  return {
    login: async (u, p) => {
      if (u === CFG.demo.username && p === CFG.demo.password) { try { sessionStorage.setItem("demo", "1"); } catch {} listeners.forEach((l) => l(true)); return; }
      throw { code: "auth/invalid-credential" };
    },
    logout: async () => { try { sessionStorage.removeItem("demo"); } catch {} listeners.forEach((l) => l(false)); },
    onAuth: (cb) => { listeners.push(cb); cb(ok()); },
    subscribe() { poll(true); timer = setInterval(() => poll(false), 5000); },
    unsubscribe() { clearInterval(timer); },
  };
}

/* ------------------------------------------------------------------ boot */
(async function boot() {
  bindFilters();
  const theme = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  if (theme) document.documentElement.dataset.theme = theme;
  $("#themeBtn").onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch {}
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
    if (S.rows.length) render();
  };

  if (demoMode) {
    $("#demoHint").hidden = false;
    $("#demoHint").textContent = `Demo mode - sign in with ${CFG.demo.username} / ${CFG.demo.password}`;
  }
  let be;
  try { be = demoMode ? demoBackend() : await firebaseBackend(); }
  catch (e) { $("#loginErr").textContent = "Cannot reach the server. Check your internet connection."; return; }

  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#loginBtn");
    btn.disabled = true;
    $("#loginErr").textContent = "";
    try { await be.login($("#u").value, $("#p").value); }
    catch (err) {
      const bad = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"];
      $("#loginErr").textContent = bad.includes(err.code) ? "Wrong username or password" : err.code === "auth/too-many-requests" ? "Too many attempts - try again in a few minutes" : "Sign-in failed. Try again.";
    }
    btn.disabled = false;
  };
  $("#logoutBtn").onclick = () => be.logout();

  be.onAuth((signed) => {
    $("#login").hidden = signed;
    $("#app").hidden = !signed;
    if (signed) { S.first = true; S.chunks.clear(); be.subscribe(); }
    else { be.unsubscribe(); $("#p").value = ""; }
  });
})();
