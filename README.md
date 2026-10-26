# lakhshit.in Learning Lab — quiz.lakhshit.in

Knowledge-check quizzes for engineering primers, with sign-in, admin approval and result reports.

**How it works**
- People **request access** with a username and password. Their account stays **Pending**.
- The admin approves or declines them in the **Admin** dashboard.
- Approved people take the quiz and get a **result report** (printable / save as PDF).
- The admin sees every result, can filter by person and **download a CSV**.

**Hosting:** GitHub Pages serves the site. Firebase (free Spark plan) stores accounts and results. GoDaddy points `quiz.lakhshit.in` at GitHub.

Until `config.js` has Firebase settings, the site runs in **demo mode** (data stays in your own browser) so you can try it.

---

## 1. Firebase (about 10 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** → name it `lakhshit-quiz`. Google Analytics can be off.
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
   (Usernames are stored as `username@users.quiz.lakhshit.in` behind the scenes. People only ever type their username.)
3. **Authentication → Settings → Authorized domains → Add domain →** `quiz.lakhshit.in`
4. **Build → Firestore Database → Create database →** Start in **production mode** → location `asia-south1 (Mumbai)`.
5. **Firestore → Rules →** replace everything with the contents of `firestore.rules` → **Publish**.
   If your admin username is not `admin`, change `'admin@users.quiz.lakhshit.in'` there first.
6. **Project settings (gear icon) → Your apps → Web (`</>`) →** register an app called `quiz` (no hosting).
   Copy `apiKey`, `authDomain`, `projectId` and `appId` into `config.js`.
7. In `config.js`, set `ADMIN_USERNAMES` to the same admin username as in the rules.

The Firebase web config is safe to publish: access is controlled by `firestore.rules`.

## 2. GitHub Pages

1. Put these files at the root of the `quiz` repository (including `CNAME` and `.nojekyll`).
2. Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save.**
3. **Custom domain:** `quiz.lakhshit.in` → **Save**. Once DNS works (step 3), tick **Enforce HTTPS**.

## 3. GoDaddy DNS

1. GoDaddy → **My Products → lakhshit.in → DNS → Add New Record.**
2. Type **CNAME** · Name **`quiz`** · Value **`YOUR-GITHUB-USERNAME.github.io`** · TTL **1 hour** → **Save.**
3. Wait 10 minutes to a few hours, then open <https://quiz.lakhshit.in>.

## 4. First sign-in

1. Open the site → **Request access** with your admin username. Admin accounts are approved automatically.
2. The **Admin** button appears at the top. New requests show under **Pending requests**.

## Optional: email alert on new requests

Get a free access key at <https://web3forms.com> (it is emailed to you) and paste it into `WEB3FORMS_KEY` in `config.js`.

## Adding another quiz

Add an entry to `QUIZZES` in `quizzes.js` with its own `id`, `title`, `video` and `questions`. It appears on everyone's dashboard automatically.

## Forgotten passwords

There is no email reset (people sign in with a username). In Firebase **Authentication → Users**, delete the person's account, then delete their document in **Firestore → users**. They can request access again with the same username.
