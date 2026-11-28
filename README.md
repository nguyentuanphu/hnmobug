# HNMO hub (private)

The public site introduces HNMO to server hosts. The developer's console is on a private path
(`/c/<CONSOLE_SLUG>/`) behind a password and, on a new or expired browser, a 6-digit code from an
authenticator app. Every successful sign-in renews browser trust for 365 days. The session itself lasts 12 hours.

The homepage's `/download` link serves the published `HNMO.zip` from the release storage configured in `UPDATES_URL`.

What HNMO servers send (never player accounts, e-mails or passwords; an IP only in the first-setup report):
- `POST /api/request`: a licence request (name, contact, players, note; a one-time secret only that server knows).
  `POST /api/licence`: the server asks for the answer with its secret and gets the licence the developer issued.
- `POST /api/weekly`: once in 6 days per server: licence, version, system, uptime, the most players at once against the
  limit, accounts and characters, crashes and errors, the file check, Season 9 / Arena, plug-ins, rates, and up to 50
  bug reports its owner forwarded. The answer says whether the licence was withdrawn. A licence seen on 2 or more
  computers in 30 days is withdrawn by itself (the console says why; "Give back" allows more computers for it).
- `POST /api/setup`: once, at a server's first setup: its system (OS, CPU and cores, RAM, free disk, HNMO and .NET
  versions, machine id), its game (name, servers and seasons, public address, language), the host's optional name and
  contact (from its licence request). The hub keeps it with the IP it came from and that IP's country (owner's choice,
  2026-11-21). The servers send all of this silently.
- `GET /api/latest`: the newest HNMO release the developer publishes in the console (Security, a version like 1.0.0):
  its notes, the whole folder's link, and where the updater finds the files (`UPDATES_URL`, the public address of the
  Cloudflare R2 bucket the package workflow uploads to: `releases/<version>/manifest.json`, `files/<sha256>`). HNMO
  servers' "Update" and their website's "Download HNMO" read it, so no HNMO folder points at where HNMO is built.
- Machine ids come from the system's own id; a server updated from the computer-name id sends its old id too
  (`legacyMachine`), so its record, its licence requests and its licence count as the same computer.

In the console: the servers and their weekly numbers, the first setups (host, IP and country, system, game), licence requests (issue or decline), licences (copy, withdraw),
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

## Licence shop (automatic)

An HNMO server's admin panel (License page) lists the packages, opens the payment, and gets the licence by itself: the
hub signs it with the licence key as soon as the payment is confirmed, and the server's next `POST /api/licence` brings it
back. Every package gets every update (owner, 2026-11-28).

- **Prices:** console → Licence packages. The catalogue starts with every package and no price (trial, Starter/Standard/
  Pro monthly, yearly and lifetime, +100 players, upgrades, move, second computer); a package without a price isn't
  sold. `"prices": {"vnd": whole đồng, "aud": cents, "usd": cents}`.
- **Cards (Stripe):** `STRIPE_SECRET_KEY` (`sk_live_…`) and `STRIPE_WEBHOOK_SECRET` (`whsec_…`); the test keys
  `LICENCE_STRIPE_TEST_KEY` / `LICENCE_STRIPE_WEBHOOK_SECRET` are used when no live key is set. Webhook:
  `https://<site>/api/licence-stripe` with `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `invoice.paid`, `charge.refunded`, `charge.dispute.created`.
- **VietQR through PayOS (automatic):** `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`; webhook
  `https://<site>/api/licence-payos`.
- **Ordinary bank transfer (VietQR, confirmed by hand):** console → Licence packages → Bank transfer: bank BIN, account,
  account name. The server shows the QR code with the amount and the order's note; "Mark as paid" in Orders signs the
  licence. Unpaid transfers end after 7 days.
- `HUB_ORIGIN` (optional): the address of the hub's own pages after a payment (default `https://hnmobug.netlify.app`).
- **Fewer function calls:** `GET /api/licence-packages`, `/api/latest` and `/download` stay on Netlify's CDN for a day
  (purged when the console changes them); `/api/licence` tells servers when to ask again (`retryAfterSeconds`).
