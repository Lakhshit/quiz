// Sign-in against users.json (same approach as aiops.lakhshit.in): no server, no database.
// Passwords are stored as salted PBKDF2-SHA256 hashes. Quiz attempts are kept in this browser
// and emailed to the admin from the report page.

export class AppError extends Error {}

const ITER = 150000;
const SESSION_KEY = "lq-session";
const ATTEMPTS_KEY = "lq-attempts";

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

async function derive(password, saltBytes, iter = ITER) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: iter }, key, 256));
}

// Used by the admin "Add a member" tool to make a users.json entry.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), iter: ITER, hash: await derive(password, salt) };
}

export function makePassword() {
  const words = ["Amber", "Cedar", "Delta", "Ember", "Falcon", "Harbor", "Indigo", "Juniper", "Kestrel", "Lumen", "Maple", "Nimbus", "Orbit", "Pixel", "Quartz", "Raven", "Sierra", "Tidal", "Umber", "Violet", "Willow", "Zephyr"];
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `${words[r[0] % words.length]}-${words[r[1] % words.length]}-${1000 + (r[2] % 9000)}`;
}

let usersPromise = null;
async function users() {
  if (!usersPromise) usersPromise = fetch("users.json", { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(d => d.users || [])
    .catch(() => { usersPromise = null; throw new AppError("Couldn't load the member list. Check your connection and refresh."); });
  return usersPromise;
}

export const backend = {
  // Returns the signed-in member, or null. Members removed from users.json are signed out.
  async current() {
    const s = store.get(SESSION_KEY, null);
    if (!s) return null;
    const list = await users();
    const u = list.find(x => x.u === s.u);
    if (!u) { store.del(SESSION_KEY); return null; }
    return { username: u.u, name: u.name || u.u, role: u.role || "member" };
  },
  async signIn(username, password) {
    usersPromise = null; // always check the latest member list
    const list = await users();
    const u = list.find(x => x.u === username.trim().toLowerCase());
    const ok = u && (await derive(password, unb64(u.salt), u.iter || ITER)) === u.hash;
    if (!ok) throw new AppError("Username or password is incorrect.");
    store.set(SESSION_KEY, { u: u.u, at: Date.now() });
  },
  signOut() { store.del(SESSION_KEY); },
  saveAttempt(a) {
    const all = store.get(ATTEMPTS_KEY, []);
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    all.push({ id, ...a }); store.set(ATTEMPTS_KEY, all);
    return id;
  },
  getAttempt(id) { return store.get(ATTEMPTS_KEY, []).find(a => a.id === id) || null; },
  myAttempts(username) { return store.get(ATTEMPTS_KEY, []).filter(a => a.username === username); }
};
