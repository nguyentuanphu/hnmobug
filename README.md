# HNMO hub (private)

Takes the bug reports and licence requests that HNMO servers' admin panels send, and turns them into issues here.
No server owner signs up: a licensed server is known by its signed licence; a server without one (the free 10
players) may send 10 reports a day.

- `netlify/functions/report.mts`: `POST /api/report` (from the admin panels).
- `netlify/functions/reports.mts`: `GET /api/reports` and `POST /api/reports` (with the hub key): the waiting reports,
  and marking them filed.
- `tools/reports-to-issues.mts`, run every hour by `.github/workflows/reports-to-issues.yml`: one issue per bug (the
  same bug from other servers counts on it), licence requests, a daily summary after 9 am Sydney.
- Tests: `npm ci && npx tsc -p . && npm test`.

## Cài đặt một lần (chủ HNMO) / One-time setup

1. **Tạo khoá hub**: một chuỗi ngẫu nhiên dài (ví dụ chạy `openssl rand -hex 32`). Giữ kín.
2. **Netlify**: Add new site → Import an existing project → GitHub → chọn repo `hnmobug` (branch hiện có) → Deploy.
   Đặt tên site (Site configuration → Change site name), ví dụ `hnmobug` → địa chỉ `https://hnmobug.netlify.app`.
   Site configuration → Environment variables: thêm `HUB_KEY` = khoá ở bước 1, và `HUB_SALT` = một chuỗi ngẫu nhiên khác.
   Deploys → Trigger deploy.
3. **GitHub** (repo này): Settings → Secrets and variables → Actions → New repository secret:
   `HUB_URL` = địa chỉ site (ví dụ `https://hnmobug.netlify.app`), `HUB_KEY` = cùng khoá ở bước 1.
4. Gửi địa chỉ site cho Claude để đặt làm địa chỉ mặc định trong HNMO.
5. Thử: Actions → Reports to issues → Run workflow.

1. **Hub key**: a long random string (e.g. `openssl rand -hex 32`); keep it secret.
2. **Netlify**: add a site from this repository; name it (e.g. `hnmobug` → `https://hnmobug.netlify.app`); environment
   variables `HUB_KEY` (step 1) and `HUB_SALT` (another random string); deploy again.
3. **GitHub** (this repository): Actions secrets `HUB_URL` (the site's address) and `HUB_KEY` (the same key).
4. Give the site's address to Claude to set it as HNMO's default.
5. Try it: Actions → Reports to issues → Run workflow.
