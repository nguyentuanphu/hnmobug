# HNMO hub (private)

The HNMO developer's console and the address HNMO servers send to. The site's front is a plain notes blog; the
console is on a hidden path (`/c/<CONSOLE_SLUG>/`) behind a password and, on a new browser, a 6-digit code from an
authenticator app (the browser is then trusted for 30 days).

What HNMO servers send (never player accounts, e-mails or IPs):
- `POST /api/request`: a licence request (name, contact, players, note; a one-time secret only that server knows).
  `POST /api/licence`: the server asks for the answer with its secret and gets the licence the developer issued.
- `POST /api/weekly`: once in 6 days per server: licence, version, system, uptime, the most players at once against the
  limit, accounts and characters, crashes and errors, the file check, Season 9 / Arena, plug-ins, rates, and up to 50
  bug reports its owner forwarded. The answer says whether the licence was withdrawn.

In the console: the servers and their weekly numbers, licence requests (issue or decline), licences (copy, withdraw),
the bug reports waiting, the licence key, trusted browsers. Licences are signed with a key of their own made by the hub
(kept encrypted); HNMO's build key stays on the developer's computer.

The daily GitHub Action (`.github/workflows/reports-to-issues.yml`) files the bug reports as issues here: one issue per
bug, counting the servers that saw it, opened again when it comes back, and a daily summary.

Tests: `npm ci && npx tsc -p . && npm test`.

## Cài đặt một lần / One-time setup

No command line is needed: the console's password is set in the browser on first use (the hub key proves it is the
developer), and the authenticator key is shown there. `tools/make-secrets.mts` is only an optional helper.

1. Netlify: add a site from this repository and branch; name it (e.g. `hnmobug`).
2. Environment variables (secret): `HUB_KEY`, `SESSION_SECRET`, `LICENCE_KEY_SECRET`, `CONSOLE_SLUG`, `HUB_SALT`
   (long random strings), and `ISSUES_URL` = `https://github.com/nguyentuanphu/hnmobug/issues`. Deploy again.
3. GitHub Actions secrets: `HUB_KEY` (same value) and `HUB_URL` (the site's address).
4. Open `https://<site>/c/<CONSOLE_SLUG>/`: paste the hub key, choose the password, add the shown key to an
   authenticator app, type its 6-digit code. Then Security → make the licence key and give its public key to Claude.
