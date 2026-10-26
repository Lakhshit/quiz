import { backend as B, AppError } from "./backend.js";
import { QUIZZES } from "./quizzes.js";
import { PASS_MARK, REQUEST_TO, ADMIN_NAME } from "./config.js";

const $app = document.getElementById("app");
const $who = document.getElementById("who");
const S = { me: null, run: null };

// ───────── helpers ─────────
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const fmtDate = (ms) => ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const quizById = (id) => QUIZZES.find(q => q.id === id);
const shuffle = (a) => { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
const passed = (pct) => pct >= PASS_MARK;
const resultPill = (pct) => passed(pct) ? `<span class="pill ok">Passed</span>` : `<span class="pill bad">Not yet</span>`;
const mailto = (subject, body) => `mailto:${REQUEST_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const fail = (e) => { if (!(e instanceof AppError)) console.error(e); return e instanceof AppError ? e.message : "Something went wrong. Try again."; };
function view(html) { $app.innerHTML = `<div class="stack fade">${html}</div>`; labelTables(); window.scrollTo({ top: 0 }); }
// Copies each column header into its cells so tables can stack into cards on phones.
function labelTables() { $app.querySelectorAll("table").forEach(t => { const h = [...t.querySelectorAll("thead th")].map(th => th.textContent.trim()); t.querySelectorAll("tbody tr").forEach(r => [...r.children].forEach((td, i) => { if (h[i] && !td.hasAttribute("colspan")) td.dataset.label = h[i]; })); }); }
function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || "Working…"; btn.disabled = true; } else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; } }
function copyButton(btn, getText) {
  btn.onclick = async () => {
    const t = getText();
    try { await navigator.clipboard.writeText(t); btn.textContent = "Copied"; }
    catch { const ta = btn.closest(".card").querySelector("textarea"); if (ta) { ta.focus(); ta.select(); } btn.textContent = "Press Ctrl+C to copy"; }
    setTimeout(() => { btn.textContent = btn.dataset.l || "Copy"; }, 2000);
  };
  btn.dataset.l = btn.textContent;
}

function header() {
  if (!S.me) { $who.innerHTML = ""; return; }
  $who.innerHTML = `<span>Signed in as <b>${esc(S.me.name)}</b></span>
    ${S.me.shared ? `<button id="notme" type="button">Not ${esc(S.me.name.split(" ")[0])}?</button>` : ""}<a href="#/">My quizzes</a><button id="signout" type="button">Sign out</button>`;
  const nm = document.getElementById("notme");
  if (nm) nm.onclick = () => { setPerson(null); S.run = null; location.hash = "#/"; render(); };
  document.getElementById("signout").onclick = () => { S.run = null; S.me = null; B.signOut(); location.hash = "#/"; render(); };
}

// ───────── sign in / request access ─────────
function authView(mode = "signin") {
  $who.innerHTML = "";
  const q = QUIZZES[0];
  view(`
  <section class="hero" style="max-width:560px;margin:0 auto">
    <div class="kicker">System design primers · Knowledge checks</div>
    <h1>Learn it. <em>Prove it.</em></h1>
    <p class="muted" style="margin:0">Watch the primer, then test what stuck. Sign in with the login ${esc(ADMIN_NAME)} sent you, or request access.</p>
  </section>
  <section class="card auth">
    <div class="tabs" role="tablist">
      <button role="tab" id="t-in" aria-selected="${mode === "signin"}">Sign in</button>
      <button role="tab" id="t-up" aria-selected="${mode !== "signin"}">Request access</button>
    </div>
    <div id="slot"></div>
  </section>
  <p class="muted" style="text-align:center;font-size:14px;margin:0">Now available: <b>${esc(q.title)}</b> · ${q.questions.length} questions</p>`);
  document.getElementById("t-in").onclick = () => authView("signin");
  document.getElementById("t-up").onclick = () => authView("request");
  const slot = document.getElementById("slot");

  if (mode === "signin") {
    slot.innerHTML = `<form id="f" novalidate>
      <label>Username<input id="u" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label>Password<input id="p" type="password" autocomplete="current-password" required></label>
      <div id="msg"></div>
      <button class="btn" id="go">Sign in</button>
    </form>`;
    const f = document.getElementById("f"); f.querySelector("input").focus();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById("msg"), btn = document.getElementById("go");
      const u = document.getElementById("u").value.trim(), p = document.getElementById("p").value;
      if (!u || !p) { msg.innerHTML = `<div class="err">Enter your username and password.</div>`; return; }
      busy(btn, true, "Signing in…");
      try { await B.signIn(u, p); S.me = await B.current(); location.hash = "#/"; render(); }
      catch (e) { msg.innerHTML = `<div class="err">${esc(fail(e))}</div>`; busy(btn, false); }
    };
    return;
  }

  if (mode === "sent") {
    slot.innerHTML = `<div class="stack" style="gap:12px">
      <div class="note">Your email app has opened with the request. Press <b>Send</b> there. ${esc(ADMIN_NAME)} will reply with your username and password.</div>
      <p class="muted" style="margin:0;font-size:14px">Email app didn't open? Send your request to <b style="user-select:all">${esc(REQUEST_TO)}</b>.</p>
      <button class="btn ghost" id="back">Back to sign in</button></div>`;
    document.getElementById("back").onclick = () => authView("signin");
    return;
  }

  slot.innerHTML = `<form id="f" novalidate>
    <label>Full name<input id="n" autocomplete="name" required></label>
    <label>Work email<input id="e" type="email" autocomplete="email" required></label>
    <label>Preferred username <small>Letters, numbers, dot or dash</small><input id="u" autocapitalize="none" spellcheck="false"></label>
    <label>Team or role <small>Optional</small><input id="t"></label>
    <div id="msg"></div>
    <button class="btn" id="go">Email my request</button>
    <p class="muted" style="margin:0;font-size:13px">This opens your email app with the request to ${esc(ADMIN_NAME)}. You'll get your login by reply once approved.</p>
  </form>`;
  const f = document.getElementById("f"); f.querySelector("input").focus();
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const v = (id) => document.getElementById(id).value.trim();
    const msg = document.getElementById("msg");
    if (!v("n") || !v("e")) { msg.innerHTML = `<div class="err">Enter your name and work email.</div>`; return; }
    if (!/^\S+@\S+\.\S+$/.test(v("e"))) { msg.innerHTML = `<div class="err">Enter a valid email address.</div>`; return; }
    const body = `Hi ${ADMIN_NAME.split(" ")[0]},\n\nPlease give me access to the Learning Lab quizzes at quiz.lakhshit.in.\n\nName: ${v("n")}\nEmail: ${v("e")}\nPreferred username: ${v("u") || "(any)"}\nTeam / role: ${v("t") || "-"}\n\nThanks,\n${v("n")}`;
    location.href = mailto(`Quiz access request: ${v("n")}`, body);
    setTimeout(() => authView("sent"), 400);
  };
}

// ───────── dashboard ─────────
function homeView() {
  const mine = B.myAttempts(S.me.username).filter(a => !S.me.shared || a.name === S.me.name).sort((a, b) => b.at - a.at);
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
  view(`<section class="hero"><div class="kicker">Welcome</div><h1>Hi ${esc(S.me.name.split(" ")[0])}, <em>ready?</em></h1></section>
    ${cards}
    <section class="card"><h2>My results</h2>${hist}<p class="muted" style="margin:0;font-size:13px">Results are saved in this browser. Each report has a button to send it to ${esc(ADMIN_NAME)}.</p></section>`);
}

// ───────── quiz ─────────
function quizView(id) {
  const quiz = quizById(id);
  if (!quiz) { location.hash = "#/"; return; }
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
  r.order = shuffle(q.o.map((_, k) => k));
  view(`${progress(quiz)}
    <section class="card" aria-live="polite">
      <div class="meta"><span class="tag" style="--c:var(${L.color})">${esc(L.name)} · ${esc(q.topic)}</span><span>${esc(quiz.title)}</span></div>
      <h2 class="q">${rich(q.q)}</h2>
      <div class="opts">${r.order.map((o, k) => `<button class="opt" id="opt${k}" data-o="${o}"><span class="k">${k + 1}</span><span>${rich(q.o[o])}</span></button>`).join("")}</div>
      <div id="after"></div>
    </section>
    <p class="hint" style="text-align:center">Press 1–${q.o.length} to answer</p>`);
  $app.querySelectorAll(".opt").forEach(b => b.onclick = () => answer(quiz, +b.dataset.o));
}
function answer(quiz, o) {
  const r = S.run; if (r.answers.length > r.i) return;
  const q = quiz.questions[r.i], ok = o === q.a;
  r.answers.push({ qi: r.i, chosen: o, ok });
  $app.querySelectorAll(".opt").forEach(b => { const n = +b.dataset.o; b.disabled = true; b.classList.add(n === q.a ? "right" : n === o ? "wrong" : "dim"); });
  $app.querySelector(".prog").outerHTML = progress(quiz);
  const last = r.i === quiz.questions.length - 1;
  document.getElementById("after").innerHTML = `<div class="explain ${ok ? "ok" : "no"}"><b>${ok ? "Correct" : "Not quite"}</b>${rich(q.e)}</div>
    <div class="row" style="margin-top:14px"><span></span><button class="btn" id="next">${last ? "Finish and see report" : "Next question →"}</button></div>`;
  const n = document.getElementById("next"); n.focus({ preventScroll: true });
  n.onclick = () => { r.i++; drawQuestion(quiz); };
}
function finish(quiz) {
  const r = S.run; r.done = true;
  const score = r.answers.filter(a => a.ok).length, total = quiz.questions.length, pct = Math.round(score / total * 100);
  const byLayer = {};
  quiz.questions.forEach((q, k) => { byLayer[q.l] ??= { r: 0, n: 0 }; byLayer[q.l].n++; if (r.answers[k]?.ok) byLayer[q.l].r++; });
  const id = B.saveAttempt({ username: S.me.username, name: S.me.name, quizId: quiz.id, quizTitle: quiz.title, score, total, pct, byLayer,
    answers: r.answers.map(a => ({ qi: a.qi, chosen: a.chosen, ok: a.ok })), seconds: Math.round((Date.now() - r.started) / 1000), at: Date.now() });
  S.run = null;
  location.hash = `#/report/${id}?new`;
}

// ───────── report ─────────
function resultEmail(a, quiz) {
  const L = quiz.layers;
  const missed = quiz.questions.map((q, k) => ({ q, ans: a.answers.find(x => x.qi === k) })).filter(x => !x.ans || !x.ans.ok);
  const body = `Quiz result — ${a.quizTitle}\n\nName: ${a.name}\nUsername: ${a.username}\nTaken: ${fmtDate(a.at)}\nTime spent: ${Math.floor(a.seconds / 60)}m ${a.seconds % 60}s\n\n` +
    `Score: ${a.score}/${a.total} (${a.pct}%) — ${passed(a.pct) ? "PASSED" : "NOT YET PASSED"} (pass mark ${PASS_MARK}%)\n\n` +
    `By section:\n${Object.entries(L).map(([k, l]) => `- ${l.name}: ${a.byLayer?.[k]?.r ?? 0}/${a.byLayer?.[k]?.n ?? 0}`).join("\n")}\n\n` +
    (missed.length ? `Missed (${missed.length}):\n${missed.map(x => `- Q${quiz.questions.indexOf(x.q) + 1} ${x.q.topic} (video ${x.q.t})`).join("\n")}` : "All questions correct.") +
    `\n\nSent from quiz.lakhshit.in`;
  return mailto(`Quiz result: ${a.name} — ${a.pct}% (${a.quizTitle})`, body);
}

function reportView(id, fresh) {
  const a = B.getAttempt(id);
  if (!a) return view(`<section class="card"><h2>Report not found</h2><p class="muted" style="margin:0">Reports are saved in the browser where the quiz was taken.</p><a class="btn ghost" href="#/">Back to my quizzes</a></section>`);
  const quiz = quizById(a.quizId);
  const C = 2 * Math.PI * 50, col = passed(a.pct) ? "var(--ok)" : a.pct >= 60 ? "var(--l-ops)" : "var(--bad)";
  const v = passed(a.pct) ? ["Passed.", "Strong grasp of how the pieces connect."] : a.pct >= 60 ? ["Nearly there.", "Review the questions you missed below, then retake."] : ["Worth a second watch.", "Rewatch the primer, then retake."];
  const rows = quiz ? quiz.questions.map((q, k) => {
    const ans = a.answers.find(x => x.qi === k);
    return `<tr><td class="num">${k + 1}</td><td><b>${esc(q.topic)}</b><br><span class="muted" style="font-size:13px">${esc(quiz.layers[q.l].name)}</span></td>
      <td>${ans ? `<span class="mk ${ans.ok ? "ok" : "no"}">${ans.ok ? "✓" : "✗"}</span> ${rich(q.o[ans.chosen])}` : "—"}</td>
      <td>${ans && ans.ok ? `<span class="muted">Same</span>` : rich(q.o[q.a])}</td></tr>`;
  }).join("") : "";
  view(`
    <div class="print-head">lakhshit.in · Learning Lab — Quiz report</div>
    ${fresh && quiz ? `<section class="card no-print" style="border-color:var(--accent)">
      <div class="row"><div><h3>Send your result to ${esc(ADMIN_NAME)}</h3><p class="muted" style="margin:4px 0 0;font-size:14px">Opens your email app with your score and the questions you missed. Press Send there.</p></div>
      <a class="btn" href="${resultEmail(a, quiz)}">Email my result</a></div></section>` : ""}
    <section class="card">
      <div class="row"><div class="kicker">Result report</div><div class="actions no-print">
        ${quiz && !fresh ? `<a class="btn sm ghost" href="${resultEmail(a, quiz)}">Email result</a>` : ""}
        <button class="btn sm ghost" id="print">Print or save PDF</button>
        ${quiz ? `<a class="btn sm" href="#/quiz/${quiz.id}">Retake</a>` : ""}
      </div></div>
      <div class="res-top">
        <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${a.pct} percent"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" stroke-width="10"/><circle cx="60" cy="60" r="50" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * a.pct / 100} ${C}" transform="rotate(-90 60 60)"/><text class="pct" x="60" y="60" text-anchor="middle" font-size="28">${a.pct}%</text><text class="sub" x="60" y="80" text-anchor="middle" font-size="13">${a.score} / ${a.total}</text></svg>
        <div class="verdict"><span class="big">${v[0]}</span><span class="muted">${v[1]}</span></div>
      </div>
      <div class="facts">
        <div class="fact"><small>Name</small><b>${esc(a.name)}</b></div>
        <div class="fact"><small>Username</small><b>${esc(a.username)}</b></div>
        <div class="fact"><small>Quiz</small><b>${esc(a.quizTitle)}</b></div>
        <div class="fact"><small>Taken</small><b>${fmtDate(a.at)}</b></div>
        <div class="fact"><small>Time spent</small><b>${Math.floor(a.seconds / 60)}m ${a.seconds % 60}s</b></div>
        <div class="fact"><small>Result</small><b>${resultPill(a.pct)}</b></div>
      </div>
      ${quiz ? `<div class="bars">${Object.entries(quiz.layers).map(([k, L]) => { const b = a.byLayer?.[k] || { r: 0, n: 0 }; return `<div class="bar"><span>${esc(L.name)}</span><div class="t"><div style="width:${b.n ? b.r / b.n * 100 : 0}%;background:var(${L.color})"></div></div><span class="n">${b.r}/${b.n}</span></div>`; }).join("")}</div>` : ""}
    </section>
    ${quiz ? `<section class="card"><h2>Question by question</h2>
      <div class="tablewrap"><table><thead><tr><th>#</th><th>Topic</th><th>Answer given</th><th>Correct answer</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted" style="margin:0;font-size:14px">Missed a few? Rewatch <a href="${quiz.video}" target="_blank" rel="noopener">the primer video</a>, then retake the quiz.</p>
    </section>` : ""}
    <div class="row no-print"><a class="btn ghost" href="#/">← My quizzes</a></div>`);
  document.getElementById("print").onclick = () => window.print();
}

// ───────── who is taking it (shared team login) ─────────
const PERSON_KEY = "lq-person";
function getPerson() { try { return localStorage.getItem(PERSON_KEY) || ""; } catch { return ""; } }
function setPerson(n) { try { n ? localStorage.setItem(PERSON_KEY, n) : localStorage.removeItem(PERSON_KEY); } catch {} }
function personView() {
  $who.innerHTML = `<button id="signout" type="button">Sign out</button>`;
  document.getElementById("signout").onclick = () => { B.signOut(); render(); };
  view(`<section class="card auth">
    <div class="kicker">Before you start</div>
    <h2>Who's taking the quiz?</h2>
    <p class="muted" style="margin:0">Your name goes on your result report, so ${esc(ADMIN_NAME)} knows whose score it is.</p>
    <form id="f" novalidate>
      <label>Full name<input id="n" autocomplete="name" required></label>
      <div id="msg"></div>
      <button class="btn" id="go">Continue</button>
    </form></section>`);
  const f = document.getElementById("f"); f.querySelector("input").focus();
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const n = document.getElementById("n").value.trim().replace(/\s+/g, " ");
    if (n.length < 2) { document.getElementById("msg").innerHTML = `<div class="err">Enter your full name.</div>`; return; }
    setPerson(n.slice(0, 60)); render();
  };
}

// ───────── router ─────────
async function render() {
  try { S.me = await B.current(); }
  catch (e) { return view(`<section class="card auth"><div class="err">${esc(fail(e))}</div></section>`); }
  if (!S.me) return authView();
  if (S.me.role === "team") {
    const person = getPerson();
    if (!person) return personView();
    S.me = { ...S.me, name: person, shared: true };
  }
  header();
  const [path, query] = (location.hash || "#/").split("?");
  const [, route, arg] = path.split("/");
  if (route === "quiz") return quizView(arg);
  if (route === "report") return reportView(arg, query === "new");
  return homeView();
}

document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input,textarea")) return;
  const n = +e.key;
  if (n >= 1 && n <= 4) document.getElementById("opt" + (n - 1))?.click();
});
window.addEventListener("hashchange", render);
render();
