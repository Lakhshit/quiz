// ─────────────────────────────────────────────────────────────
//  Site settings — edit this file, nothing else needs changing.
// ─────────────────────────────────────────────────────────────

// Usernames that get the admin dashboard (approve people, see all results).
// Must match ADMIN_EMAILS in firestore.rules (username + "@" + USERNAME_DOMAIN).
export const ADMIN_USERNAMES = ["admin"];

// Internal sign-in domain. People never see or type this.
export const USERNAME_DOMAIN = "users.quiz.lakhshit.in";

// Paste your Firebase web app config here (Firebase console → Project settings → Your apps).
// While apiKey is empty the site runs in DEMO MODE: everything is stored only in your own browser.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};

// Optional: free access key from https://web3forms.com to get an email
// whenever someone requests access. Leave empty to skip email alerts.
export const WEB3FORMS_KEY = "";

export const PASS_MARK = 80; // percent
