# lakhshit.in Learning Lab — quiz.lakhshit.in

Knowledge-check quizzes for engineering primers. Hosted on GitHub Pages, with a GoDaddy CNAME `quiz` → `Lakhshit.github.io`. No database: it works the same way as aiops.lakhshit.in.

## How it works

- **Team login:** everyone signs in with the shared `team` account. The site then asks for their name once per device, so reports and result emails carry the real person's name ("Not you?" switches person).
- **Take the quiz:** one video link, the questions, and a result report (print / save as PDF).
- **Results:** the report's **Email my result** button sends the score, section breakdown and missed questions to Lakhshit. Each person's history is kept in their browser.
- **Request access:** the form emails Lakhshit, who replies with the team login.
- **Change the team password:** replace the `team` line in `users.json` with a newly hashed one. Everyone using the old password is then refused at sign-in.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The site |
| `backend.js` | Sign-in check against `users.json`, local result history |
| `quizzes.js` | Quiz questions (add new quizzes here) |
| `users.json` | Members and their hashed passwords |
| `config.js` | Email address for requests and results, pass mark |
| `CNAME` | `quiz.lakhshit.in` for GitHub Pages |

## Adding another quiz

Add an entry to `QUIZZES` in `quizzes.js` with its own `id`, `title`, `video` and `questions`. It appears on everyone's dashboard automatically.

## Note on security

Like aiops.lakhshit.in, this is a static site: anyone could read the quiz questions in the source code, and `users.json` is public (passwords inside are salted PBKDF2 hashes, not plain text). It's suited to internal learning, not to anything confidential.
