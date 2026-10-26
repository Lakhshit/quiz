// Data layer. Uses Firebase when configured, otherwise a demo store in this browser.
import { firebaseConfig, ADMIN_USERNAMES, USERNAME_DOMAIN, WEB3FORMS_KEY } from "./config.js";

export const isAdminName = (u) => ADMIN_USERNAMES.map(s => s.toLowerCase()).includes((u || "").toLowerCase());
const toEmail = (u) => `${u.toLowerCase()}@${USERNAME_DOMAIN}`;

export class AppError extends Error {}

async function notifyAdmin(profile) {
  if (!WEB3FORMS_KEY) return;
  try {
    await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: `New quiz access request: ${profile.username}`,
        from_name: "lakhshit.in Learning Lab",
        message: `${profile.name} (${profile.username}${profile.email ? ", " + profile.email : ""}) requested access. Approve them in the admin dashboard: https://quiz.lakhshit.in/#/admin`
      })
    });
  } catch { /* email alert is best-effort */ }
}

// ───────────────────────── Firebase ─────────────────────────
async function firebaseBackend() {
  const V = "10.12.2";
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);

  const mapErr = (e) => {
    const c = e?.code || "";
    if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return new AppError("Username or password is incorrect.");
    if (c.includes("email-already-in-use")) return new AppError("That username is already taken. Try another.");
    if (c.includes("weak-password")) return new AppError("Use a password with at least 8 characters.");
    if (c.includes("too-many-requests")) return new AppError("Too many attempts. Wait a minute and try again.");
    if (c.includes("permission-denied")) return new AppError("You don't have permission to do that.");
    if (c.includes("network")) return new AppError("Can't reach the server. Check your connection.");
    return new AppError(e?.message || "Something went wrong. Try again.");
  };
  const wrap = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { throw e instanceof AppError ? e : mapErr(e); } };

  return {
    mode: "firebase",
    onAuth(cb) { return A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid } : null)); },
    signIn: wrap(async (username, password) => { await A.signInWithEmailAndPassword(auth, toEmail(username), password); }),
    register: wrap(async ({ username, name, email, password }) => {
      const cred = await A.createUserWithEmailAndPassword(auth, toEmail(username), password);
      const profile = { username: username.toLowerCase(), name, email: email || "", status: isAdminName(username) ? "approved" : "pending", createdAt: Date.now() };
      await F.setDoc(F.doc(db, "users", cred.user.uid), profile);
      if (profile.status === "pending") notifyAdmin(profile);
    }),
    signOut: wrap(() => A.signOut(auth)),
    getProfile: wrap(async (uid) => { const s = await F.getDoc(F.doc(db, "users", uid)); return s.exists() ? { uid, ...s.data() } : null; }),
    listUsers: wrap(async () => (await F.getDocs(F.collection(db, "users"))).docs.map(d => ({ uid: d.id, ...d.data() }))),
    setStatus: wrap(async (uid, status) => { await F.updateDoc(F.doc(db, "users", uid), { status, reviewedAt: Date.now() }); }),
    saveAttempt: wrap(async (a) => (await F.addDoc(F.collection(db, "attempts"), a)).id),
    getAttempt: wrap(async (id) => { const s = await F.getDoc(F.doc(db, "attempts", id)); return s.exists() ? { id, ...s.data() } : null; }),
    myAttempts: wrap(async (uid) => (await F.getDocs(F.query(F.collection(db, "attempts"), F.where("uid", "==", uid)))).docs.map(d => ({ id: d.id, ...d.data() }))),
    allAttempts: wrap(async () => (await F.getDocs(F.collection(db, "attempts"))).docs.map(d => ({ id: d.id, ...d.data() })))
  };
}

// ───────────────────────── Demo (this browser only) ─────────────────────────
function demoBackend() {
  const KEY = "lakhshit-quiz-demo";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, attempts: {}, session: null }; } catch { return { users: {}, attempts: {}, session: null }; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  const hash = async (t) => { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); };
  const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  let listener = null;
  const emit = () => { const s = load(); listener && listener(s.session ? { uid: s.session } : null); };
  const strip = ({ passHash, ...p }) => p;

  return {
    mode: "demo",
    onAuth(cb) { listener = cb; setTimeout(emit, 0); return () => { listener = null; }; },
    async signIn(username, password) {
      const s = load(); const u = Object.entries(s.users).find(([, v]) => v.username === username.toLowerCase());
      if (!u || u[1].passHash !== await hash(password)) throw new AppError("Username or password is incorrect.");
      s.session = u[0]; save(s); emit();
    },
    async register({ username, name, email, password }) {
      const s = load();
      if (Object.values(s.users).some(v => v.username === username.toLowerCase())) throw new AppError("That username is already taken. Try another.");
      const uid = id();
      s.users[uid] = { username: username.toLowerCase(), name, email: email || "", status: isAdminName(username) ? "approved" : "pending", createdAt: Date.now(), passHash: await hash(password) };
      s.session = uid; save(s); emit();
    },
    async signOut() { const s = load(); s.session = null; save(s); emit(); },
    async getProfile(uid) { const u = load().users[uid]; return u ? { uid, ...strip(u) } : null; },
    async listUsers() { return Object.entries(load().users).map(([uid, v]) => ({ uid, ...strip(v) })); },
    async setStatus(uid, status) { const s = load(); if (s.users[uid]) { s.users[uid].status = status; s.users[uid].reviewedAt = Date.now(); save(s); } },
    async saveAttempt(a) { const s = load(); const k = id(); s.attempts[k] = a; save(s); return k; },
    async getAttempt(k) { const a = load().attempts[k]; return a ? { id: k, ...a } : null; },
    async myAttempts(uid) { return Object.entries(load().attempts).filter(([, a]) => a.uid === uid).map(([k, a]) => ({ id: k, ...a })); },
    async allAttempts() { return Object.entries(load().attempts).map(([k, a]) => ({ id: k, ...a })); }
  };
}

export async function createBackend() {
  return firebaseConfig.apiKey ? firebaseBackend() : demoBackend();
}
