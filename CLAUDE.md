# HNMO hub: rules for the assistant

- This private repository belongs to the HNMO developer. Name only HNMO; never name any other project, game, publisher
  or server suite in code, docs, issues or commits.
- Times in Sydney time (Australia/Sydney).
- Never put a key, token or private key in the repository: `HUB_KEY` and `HUB_SALT` live in Netlify's settings and the
  Actions secrets; the licence signing key stays on the developer's computer.
- Keep what the hub stores small: no player login, e-mail or password. The IP only as a salted hash for the daily
  limits, with one exception the owner chose (2026-11-21): the first-setup report (`/api/setup`) keeps the IP it came
  from and its country, and the HNMO setup page tells the host so.
- Before pushing: `npm ci && npx tsc -p . && npm test`.
