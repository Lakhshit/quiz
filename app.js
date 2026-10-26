import { createBackend, isAdminName, AppError } from "./backend.js";
import { QUIZZES } from "./quizzes.js";
import { PASS_MARK } from "./config.js";

const $app = document.getElementById("app");
const $who = document.getElementById("who");
const S = { be: null, user: null, profile: null, admin: false, run: null };

// ───────── helpers ─────────
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const fmtDate = (ms) => ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const shortDate = (ms) => ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const quizById = (id) => QUIZZES.find(q => q.id === id);
const shuffle = (a) => { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };
const view = (html) => { $app.innerHTML = `<div class="stack fade">${html}</div>`; labelTables(); window.scrollTo({ top: 0 }); };
// Copies each column header into its cells so tables can stack into cards on phones.
function labelTables() { $app.querySelectorAll("table").forEach(t => { const h = [...t.querySelectorAll("thead th")].map(th => th.textContent.trim()); t.querySelectorAll("tbody tr").forEach(r => [...r.children].forEach((td, i) => { if (h[i] && !td.hasAttribute("colspan")) td.dataset.label = h[i]; })); }); }
const passed = (pct) => pct >= PASS_MARK;
const resultPill = (pct) => passed(pct) ? `<span class="pill ok">Passed</span>` : `<span class="pill bad">Not yet</span>`;
const statusPill = (s) => ({ approved: `<span class="pill ok">Approved</span>`, pending: `<span class="pill warn">Pending</span>`, rejected: `<span class="pill bad">Declined</span>` }[s] || esc(s));
function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || "Working…"; btn.disabled = true; } else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; } }
function fail(e) { if (!(e instanceof AppError)) console.error(e); return e instanceof AppError ? e.message : "Something went wrong. Try again."; }

function header() {
  if (!S.profile) { $who.innerHTML = ""; return; }
  $who.innerHTML = `<span>Signed in as <b>${esc(S.profile.name || S.profile.username)}</b></span>
    ${S.admin ? `<a href="#/admin">Admin</a>` : ""}<a href="#/">My quizzes</a><button id="signout" type="button">Sign out</button>`;
  document.getElementById("signout").onclick = async () => { S.run = null; await S.be.signOut(); location.hash = "#/"; };
}

// ───────── auth ─────────
function authView(mode = "signin") {
  $who.innerHTML = "";
  const q = QUIZZES[0];
  view(`
  <section class="hero" style="max-width:560px;margin:0 auto;text-align:left">
    <div class="kicker">System design primers · Knowledge checks</div>
    <h1>Learn it. <em>Prove it.</em></h1>
    <p class="muted" style="margin:0">Watch the primer, then test what stuck. Sign in with the username your admin approved, or request access.</p>
  </section>
  <section class="card auth">
    <div class="tabs" role="tablist">
      <button role="tab" id="t-in" aria-selected="${mode === "signin"}">Sign in</button>
      <button role="tab" id="t-up" aria-selected="${mode === "register"}">Request access</button>
    </div>
    <div id="form-slot"></div>
  </section>
  <p class="muted" style="text-align:center;font-size:14px;margin:0">Now available: <b>${esc(q.title)}</b> · ${q.questions.length} questions</p>`);
  document.getElementById("t-in").onclick = () => authView("signin");
  document.getElementById("t-up").onclick = () => authView("register");
  const slot = document.getElementById("form-slot");

  if (mode === "signin") {
    slot.innerHTML = `<form id="f" novalidate>
      <label>Username<input id="u" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label>Password<input id="p" type="password" autocomplete="current-password" required></label>
      <div id="msg"></div>
      <button class="btn" id="go">Sign in</button>
    </form>`;
  } else {
    slot.innerHTML = `<form id="f" novalidate>
      <label>Full name<input id="n" autocomplete="name" required></label>
      <label>Username <small>3–20 characters: letters, numbers, dot, dash or underscore</small><input id="u" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label>Work email <small>Optional, so the admin can reach you</small><input id="e" type="email" autocomplete="email"></label>
      <label>Password <small>At least 8 characters</small><input id="p" type="password" autocomplete="new-password" required></label>
      <label>Confirm password<input id="p2" type="password" autocomplete="new-password" required></label>
      <div id="msg"></div>
      <button class="btn" id="go">Request access</button>
    </form>`;
  }
  const f = document.getElementById("f");
  f.querySelector("input").focus();
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById("msg"), btn = document.getElementById("go");
    const val = (id) => (document.getElementById(id)?.value || "").trim();
    const u = val("u").toLowerCase(), p = document.getElementById("p").value;
    const say = (t) => { msg.innerHTML = `<div class="err">${esc(t)}</div>`; };
    if (!u || !p) return say("Enter your username and password.");
    if (mode === "register") {
      if (!val("n")) return say("Enter your full name.");
      if (!/^[a-z0-9._-]{3,20}$/.test(u)) return say("Username must be 3–20 characters: letters, numbers, dot, dash or underscore.");
      if (p.length < 8) return say("Use a password with at least 8 characters.");
      if (p !== document.getElementById("p2").value) return say("The two passwords don't match.");
    }
    busy(btn, true, mode === "register" ? "Sending request…" : "Signing in…");
    try {
      if (mode === "register") await S.be.register({ username: u, name: val("n"), email: val("e"), password: p });
      else await S.be.signIn(u, p);
    } catch (e) { say(fail(e)); busy(btn, false); }
  };
}

function pendingView() {
  const p = S.profile;
  const declined = p.status === "rejected";
  view(`<section class="card auth" style="text-align:left">
    <div class="kicker">${declined ? "Access declined" : "Request received"}</div>
    <h2>${declined ? "Your access request was declined" : `Thanks, ${esc(p.name || p.username)}. You're on the list.`}</h2>
    <p class="muted" style="margin:0">${declined
      ? "Contact the Learning Lab admin if you think this is a mistake."
      : "An admin needs to approve your account before you can take quizzes. This page updates when you check again."}</p>
    <div class="facts"><div class="fact"><small>Username</small><b>${esc(p.username)}</b></div><div class="fact"><small>Requested</small><b>${shortDate(p.createdAt)}</b></div><div class="fact"><small>Status</small><b>${statusPill(p.status)}</b></div></div>
    ${declined ? "" : `<div class="row"><span></span><button class="btn" id="chk">Check again</button></div>`}
  </section>`);
  const b = document.getElementById("chk");
  if (b) b.onclick = async () => { busy(b, true, "Checking…"); S.profile = await S.be.getProfile(S.user.uid); render(); };
}

// ───────── dashboard ─────────
async function homeView() {
  view(`<p class="muted loading">Loading your quizzes…</p>`);
  let mine = [];
  try { mine = (await S.be.myAttempts(S.user.uid)).sort((a, b) => b.at - a.at); } catch (e) { console.error(e); }
  const cards = QUIZZES.map(q => {
    const tries = mine.filter(a => a.quizId === q.id);
    const best = tries.length ? Math.max(...tries.map(a => a.pct)) : null;
    return `<section class="card">
      <div class="kicker">Knowledge check · Covers ${esc(q.coverage)} of the video</div>
      <div class="quizcard">
        <div class="stack" style="gap:8px">
          <h2 style="font-size:26px">${esc(q.title)}</h2>
          <p class="muted" style="margin:0">${esc(q.subtitle)}</p>
          <div class="chips"><span class="chip">${q.questions.length} questions</span><span class="chip">~${q.minutes} min</span><span class="chip">Pass ${PASS_MARK}%</span>${best !== null ? `<span class="chip">Your best ${best}%</span>` : ""}</div>
        </div>
        <a class="btn" href="#/quiz/${q.id}">${tries.length ? "Retake quiz" : "Start quiz"} →</a>
      </div>
      <div class="path">${Object.values(q.layers).map(L => `<div class="lay" style="--c:var(${L.color})"><b>${esc(L.name)}</b><p>${esc(L.desc)}</p></div>`).join("")}</div>
      <a class="video" href="${q.video}" target="_blank" rel="noopener"><span class="play">▶</span><span><b>Watch the primer first</b><small>${esc(q.source)} · ${esc(q.channel)}</small></span></a>
    </section>`;
  }).join("");
  const hist = mine.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Quiz</th><th>Score</th><th>Result</th><th></th></tr></thead><tbody>
      ${mine.map(a => `<tr><td class="num">${fmtDate(a.at)}</td><td>${esc(a.quizTitle)}</td><td class="num">${a.score}/${a.total} · ${a.pct}%</td><td>${resultPill(a.pct)}</td><td><a href="#/report/${a.id}">View report</a></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="empty">No attempts yet. Your reports will appear here.</p>`;
  view(`<section class="hero"><div class="kicker">Welcome back</div><h1>Hi ${esc((S.profile.name || S.profile.username).split(" ")[0])}, <em>ready?</em></h1></section>
    ${cards}
    <section class="card"><h2>My results</h2>${hist}</section>`);
}

// ───────── quiz ─────────
function quizView(id) {
  const quiz = quizById(id);
  if (!quiz) return go("#/");
  if (!S.run || S.run.quizId !== id || S.run.done) S.run = { quizId: id, i: 0, answers: [], order: [], started: Date.now() };
  drawQuestion(quiz);
}
function progress(quiz) {
  const r = S.run, right = r.answers.filter(a => a.ok).length;
  return `<div class="prog no-print"><div class="top"><span>Question ${Math.min(r.i + 1, quiz.questions.length)} of ${quiz.questions.length}</span><span>${right} correct</span></div>
    <div class="track">${quiz.questions.map((_, k) => `<i class="${k < r.answers.length ? (r.answers[k].ok ? "ok" : "no") : (k === r.i ? "cur" : "")}"></i>`).join("")}</div></div>`;
}
function drawQuestion(quiz) {
  const r = S.run;
  if (r.i >= quiz.questions.length) return finish(quiz);
  const q = quiz.questions[r.i], L = quiz.layers[q.l];
  r.order = shuffle([0, 1, 2, 3].slice(0, q.o.length));
  view(`${progress(quiz)}
    <section class="card" aria-live="polite">
      <div class="meta"><span class="tag" style="--c:var(${L.color})">${esc(L.name)} · ${esc(q.topic)}</span><span>${esc(quiz.title)}</span></div>
      <h2 class="q">${rich(q.q)}</h2>
      <div class="opts">${r.order.map((o, k) => `<button class="opt" id="opt${k}" data-o="${o}"><span class="k">${k + 1}</span><span>${rich(q.o[o])}</span></button>`).join("")}</div>
      <div id="after"></div>
    </section>
    <p class="hint" style="text-align:center">Press 1–${q.o.length} to answer · Enter for next</p>`);
  $app.querySelectorAll(".opt").forEach(b => b.onclick = () => answer(quiz, +b.dataset.o));
}
function answer(quiz, o) {
  const r = S.run; if (r.answers.length > r.i) return;
  const q = quiz.questions[r.i], ok = o === q.a;
  r.answers.push({ qi: r.i, chosen: o, ok });
  $app.querySelectorAll(".opt").forEach(b => { const n = +b.dataset.o; b.disabled = true; b.classList.add(n === q.a ? "right" : n === o ? "wrong" : "dim"); });
  $app.querySelector(".prog").outerHTML = progress(quiz);
  const last = r.i === quiz.questions.length - 1;
  document.getElementById("after").innerHTML = `<div class="explain ${ok ? "ok" : "no"}"><b>${ok ? "Correct" : "Not quite"}</b>${rich(q.e)}<span class="at">Explained in the video at ${esc(q.t)}</span></div>
    <div class="row" style="margin-top:14px"><span></span><button class="btn" id="next">${last ? "Finish and see report" : "Next question →"}</button></div>`;
  const n = document.getElementById("next"); n.focus({ preventScroll: true });
  n.onclick = () => { r.i++; drawQuestion(quiz); };
}
async function finish(quiz) {
  const r = S.run; r.done = true;
  const score = r.answers.filter(a => a.ok).length, total = quiz.questions.length, pct = Math.round(score / total * 100);
  const byLayer = {};
  quiz.questions.forEach((q, k) => { byLayer[q.l] ??= { r: 0, n: 0 }; byLayer[q.l].n++; if (r.answers[k]?.ok) byLayer[q.l].r++; });
  const attempt = { uid: S.user.uid, username: S.profile.username, name: S.profile.name || "", quizId: quiz.id, quizTitle: quiz.title,
    score, total, pct, passed: passed(pct), byLayer, answers: r.answers.map(a => ({ qi: a.qi, chosen: a.chosen, ok: a.ok })),
    seconds: Math.round((Date.now() - r.started) / 1000), at: Date.now() };
  view(`<p class="muted loading">Saving your result…</p>`);
  try { const id = await S.be.saveAttempt(attempt); S.run = null; go(`#/report/${id}`); }
  catch (e) { reportView(null, { ...attempt, id: null }, fail(e)); }
}

// ───────── report ─────────
async function reportView(id, preset, saveError) {
  let a = preset;
  if (!a) {
    view(`<p class="muted loading">Loading report…</p>`);
    try { a = await S.be.getAttempt(id); } catch (e) { return view(`<section class="card"><div class="err">${esc(fail(e))}</div></section>`); }
    if (!a) return view(`<section class="card"><h2>Report not found</h2><p class="muted">It may have been removed.</p><a class="btn ghost" href="#/">Back to my quizzes</a></section>`);
  }
  const quiz = quizById(a.quizId);
  const C = 2 * Math.PI * 50, col = passed(a.pct) ? "var(--ok)" : a.pct >= 60 ? "var(--l-ops)" : "var(--bad)";
  const v = passed(a.pct) ? ["Passed.", "Strong grasp of how the pieces connect."] : a.pct >= 60 ? ["Nearly there.", "Rewatch the moments listed for the questions you missed, then retake."] : ["Worth a second watch.", "Use the video times below to review, then retake."];
  const mins = a.seconds ? `${Math.floor(a.seconds / 60)}m ${a.seconds % 60}s` : "—";
  const own = a.uid === S.user.uid;
  const rows = quiz ? quiz.questions.map((q, k) => {
    const ans = a.answers.find(x => x.qi === k);
    const L = quiz.layers[q.l];
    return `<tr><td class="num">${k + 1}</td><td><b>${esc(q.topic)}</b><br><span class="muted" style="font-size:13px">${esc(L.name)}</span></td>
      <td>${ans ? `<span class="mk ${ans.ok ? "ok" : "no"}">${ans.ok ? "✓" : "✗"}</span> ${rich(q.o[ans.chosen])}` : "—"}</td>
      <td>${ans && ans.ok ? `<span class="muted">Same</span>` : rich(q.o[q.a])}</td><td class="num">${esc(q.t)}</td></tr>`;
  }).join("") : "";
  view(`
    ${saveError ? `<div class="err">Your result could not be saved: ${esc(saveError)} Take a screenshot of this report.</div>` : ""}
    <div class="print-head">lakhshit.in · Learning Lab — Quiz report</div>
    <section class="card">
      <div class="row"><div class="kicker">Result report</div><div class="actions no-print">
        <button class="btn sm ghost" id="print">Print or save PDF</button>
        ${own && quiz ? `<a class="btn sm" href="#/quiz/${quiz.id}">Retake</a>` : ""}
      </div></div>
      <div class="res-top">
        <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${a.pct} percent"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" stroke-width="10"/><circle cx="60" cy="60" r="50" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * a.pct / 100} ${C}" transform="rotate(-90 60 60)"/><text class="pct" x="60" y="60" text-anchor="middle" font-size="28">${a.pct}%</text><text class="sub" x="60" y="80" text-anchor="middle" font-size="13">${a.score} / ${a.total}</text></svg>
        <div class="verdict"><span class="big">${v[0]}</span><span class="muted">${v[1]}</span></div>
      </div>
      <div class="facts">
        <div class="fact"><small>Name</small><b>${esc(a.name || a.username)}</b></div>
        <div class="fact"><small>Username</small><b>${esc(a.username)}</b></div>
        <div class="fact"><small>Quiz</small><b>${esc(a.quizTitle)}</b></div>
        <div class="fact"><small>Taken</small><b>${fmtDate(a.at)}</b></div>
        <div class="fact"><small>Time spent</small><b>${mins}</b></div>
        <div class="fact"><small>Result</small><b>${resultPill(a.pct)}</b></div>
      </div>
      ${quiz ? `<div class="bars">${Object.entries(quiz.layers).map(([k, L]) => { const b = a.byLayer?.[k] || { r: 0, n: 0 }; return `<div class="bar"><span>${esc(L.name)}</span><div class="t"><div style="width:${b.n ? b.r / b.n * 100 : 0}%;background:var(${L.color})"></div></div><span class="n">${b.r}/${b.n}</span></div>`; }).join("")}</div>` : ""}
    </section>
    ${quiz ? `<section class="card"><h2>Question by question</h2>
      <div class="tablewrap"><table><thead><tr><th>#</th><th>Topic</th><th>Answer given</th><th>Correct answer</th><th>Video at</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted" style="margin:0;font-size:14px">Review any missed question at the time shown in <a href="${quiz.video}" target="_blank" rel="noopener">the primer video</a>.</p>
    </section>` : ""}
    <div class="row no-print"><a class="btn ghost" href="${S.admin && !own ? "#/admin" : "#/"}">← Back</a></div>`);
  document.getElementById("print").onclick = () => window.print();
}

// ───────── admin ─────────
async function adminView(tab = sessionStorage.getItem("adminTab") || "pending") {
  if (!S.admin) return go("#/");
  view(`<p class="muted loading">Loading admin dashboard…</p>`);
  let users = [], attempts = [];
  try { [users, attempts] = await Promise.all([S.be.listUsers(), S.be.allAttempts()]); }
  catch (e) { return view(`<section class="card"><div class="err">${esc(fail(e))}</div><p class="muted">Check that firestore.rules is published and your username is in ADMIN_EMAILS.</p></section>`); }
  attempts.sort((a, b) => b.at - a.at);
  const pending = users.filter(u => u.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
  const members = users.filter(u => u.status !== "pending").sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
  const avg = attempts.length ? Math.round(attempts.reduce((s, a) => s + a.pct, 0) / attempts.length) : 0;
  const passRate = attempts.length ? Math.round(attempts.filter(a => passed(a.pct)).length / attempts.length * 100) : 0;
  const statsFor = (uid) => { const t = attempts.filter(a => a.uid === uid); return { n: t.length, best: t.length ? Math.max(...t.map(a => a.pct)) : null }; };

  const tabs = [["pending", `Pending requests${pending.length ? `<span class="badge">${pending.length}</span>` : ""}`], ["members", "Members"], ["results", "Results"]];
  let body = "";
  if (tab === "pending") {
    body = pending.length ? `<div class="tablewrap"><table><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Requested</th><th></th></tr></thead><tbody>
      ${pending.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${esc(u.email) || "—"}</td><td class="num">${fmtDate(u.createdAt)}</td>
        <td><div class="actions"><button class="btn sm" data-act="approved" data-uid="${esc(u.uid)}">Approve</button><button class="btn sm danger" data-act="rejected" data-uid="${esc(u.uid)}">Decline</button></div></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">No one is waiting. New requests appear here.</p>`;
  } else if (tab === "members") {
    body = members.length ? `<div class="tablewrap"><table><thead><tr><th>Name</th><th>Username</th><th>Status</th><th>Attempts</th><th>Best</th><th></th></tr></thead><tbody>
      ${members.map(u => { const st = statsFor(u.uid); return `<tr><td>${esc(u.name)}${isAdminName(u.username) ? ` <span class="pill ok">Admin</span>` : ""}<br><span class="muted" style="font-size:13px">${esc(u.email)}</span></td><td>${esc(u.username)}</td><td>${statusPill(u.status)}</td><td class="num">${st.n}</td><td class="num">${st.best === null ? "—" : st.best + "%"}</td>
        <td>${isAdminName(u.username) ? "" : u.status === "approved" ? `<button class="btn sm danger" data-act="rejected" data-uid="${esc(u.uid)}">Remove access</button>` : `<button class="btn sm ghost" data-act="approved" data-uid="${esc(u.uid)}">Approve</button>`}</td></tr>`; }).join("")}
      </tbody></table></div>` : `<p class="empty">No members yet.</p>`;
  } else {
    body = `<div class="toolbar"><input id="filter" placeholder="Filter by name or username" aria-label="Filter results"><button class="btn sm ghost" id="csv">Download CSV</button></div>
      <div class="tablewrap"><table><thead><tr><th>Date</th><th>Name</th><th>Quiz</th><th>Score</th><th>Result</th><th></th></tr></thead><tbody id="rows">
      ${attempts.length ? attempts.map(a => `<tr data-k="${esc((a.name + " " + a.username).toLowerCase())}"><td class="num">${fmtDate(a.at)}</td><td>${esc(a.name || a.username)}<br><span class="muted" style="font-size:13px">${esc(a.username)}</span></td><td>${esc(a.quizTitle)}</td><td class="num">${a.score}/${a.total} · ${a.pct}%</td><td>${resultPill(a.pct)}</td><td><a href="#/report/${esc(a.id)}">Report</a></td></tr>`).join("") : `<tr><td colspan="6" class="empty">No quiz attempts yet.</td></tr>`}
      </tbody></table></div>`;
  }

  view(`<section class="hero"><div class="kicker">Admin dashboard</div><h1>Learning Lab <em>overview</em></h1></section>
    <div class="tiles">
      <div class="tile ${pending.length ? "alert" : ""}"><small>Pending</small><b>${pending.length}</b></div>
      <div class="tile"><small>Members</small><b>${users.filter(u => u.status === "approved").length}</b></div>
      <div class="tile"><small>Attempts</small><b>${attempts.length}</b></div>
      <div class="tile"><small>Avg score</small><b>${attempts.length ? avg + "%" : "—"}</b></div>
      <div class="tile"><small>Pass rate</small><b>${attempts.length ? passRate + "%" : "—"}</b></div>
    </div>
    <section class="card">
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>
      <div id="msg"></div>
      ${body}
    </section>`);

  $app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { sessionStorage.setItem("adminTab", b.dataset.tab); adminView(b.dataset.tab); });
  $app.querySelectorAll("[data-act]").forEach(b => b.onclick = async () => {
    busy(b, true, "Saving…");
    try { await S.be.setStatus(b.dataset.uid, b.dataset.act); adminView(tab); }
    catch (e) { document.getElementById("msg").innerHTML = `<div class="err">${esc(fail(e))}</div>`; busy(b, false); }
  });
  const f = document.getElementById("filter");
  if (f) f.oninput = () => { const t = f.value.trim().toLowerCase(); document.querySelectorAll("#rows tr[data-k]").forEach(r => r.hidden = t && !r.dataset.k.includes(t)); };
  const csv = document.getElementById("csv");
  if (csv) csv.onclick = () => {
    const L = QUIZZES[0].layers;
    const head = ["Date", "Name", "Username", "Quiz", "Score", "Total", "Percent", "Result", "Minutes", ...Object.values(L).map(l => l.name)];
    const lines = [head, ...attempts.map(a => [new Date(a.at).toISOString(), a.name, a.username, a.quizTitle, a.score, a.total, a.pct, passed(a.pct) ? "Passed" : "Not yet", a.seconds ? (a.seconds / 60).toFixed(1) : "",
      ...Object.keys(L).map(k => a.byLayer?.[k] ? `${a.byLayer[k].r}/${a.byLayer[k].n}` : "")])]
      .map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `quiz-results-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

// ───────── router ─────────
async function render() {
  if (!S.user) return authView();
  if (!S.profile) {
    try { S.profile = await S.be.getProfile(S.user.uid); } catch (e) { console.error(e); }
    if (!S.profile) { // profile is written right after sign-up; retry once
      await new Promise(r => setTimeout(r, 800));
      S.profile = await S.be.getProfile(S.user.uid).catch(() => null);
      if (!S.profile) return view(`<section class="card auth"><div class="err">Your account profile is missing. Sign out and request access again.</div><button class="btn ghost" id="so">Sign out</button></section>`), (document.getElementById("so").onclick = () => S.be.signOut());
    }
    S.admin = isAdminName(S.profile.username);
    if (S.admin && S.profile.status !== "approved") { try { await S.be.setStatus(S.user.uid, "approved"); S.profile.status = "approved"; } catch {} }
  }
  header();
  if (!S.admin && S.profile.status !== "approved") return pendingView();
  const [, route, arg] = (location.hash || "#/").split("/");
  if (route === "quiz") return quizView(arg);
  if (route === "report") return reportView(arg);
  if (route === "admin") return adminView();
  return homeView();
}

document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input,textarea")) return;
  const n = +e.key;
  if (n >= 1 && n <= 4) document.getElementById("opt" + (n - 1))?.click();
});

(async () => {
  try { S.be = await createBackend(); }
  catch (e) { console.error(e); $app.innerHTML = `<section class="card"><div class="err">Could not connect to the quiz server. Refresh the page to try again.</div></section>`; return; }
  if (S.be.mode === "demo") document.getElementById("demo-banner").hidden = false;
  S.be.onAuth((u) => {
    const changed = (u?.uid || null) !== (S.user?.uid || null);
    S.user = u; if (changed) { S.profile = null; S.admin = false; S.run = null; }
    render();
  });
  window.addEventListener("hashchange", () => { if (S.be) render(); });
})();
