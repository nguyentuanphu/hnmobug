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

1. Trên máy anh, trong thư mục repo này: `npm ci`, rồi `node tools/make-secrets.mts`. Nhập mật khẩu khu quản lý
   (ít nhất 12 ký tự). Lệnh in ra các giá trị cần dán và khoá cho app xác thực; không lưu, không gửi đi đâu.
2. **App xác thực** (Google Authenticator, Microsoft Authenticator…): thêm tài khoản bằng "Nhập khoá thiết lập" với
   khoá vừa in (hoặc mở link `otpauth://…`).
3. **Netlify**: Add new site → Import an existing project → GitHub → repo `hnmobug`. Đặt tên site, ví dụ `hnmobug`
   (địa chỉ `https://hnmobug.netlify.app`). Site configuration → Environment variables: dán từng giá trị ở bước 1
   (`CONSOLE_PASSWORD_HASH`, `CONSOLE_TOTP_SECRET`, `CONSOLE_SLUG`, `SESSION_SECRET`, `LICENCE_KEY_SECRET`, `HUB_KEY`,
   `HUB_SALT`), đánh dấu là secret; thêm `ISSUES_URL` = `https://github.com/nguyentuanphu/hnmobug/issues`. Deploy lại.
4. **GitHub** (repo này): Settings → Secrets and variables → Actions: `HUB_KEY` (cùng giá trị) và `HUB_URL` (địa chỉ site).
5. Mở `https://<site>/c/<CONSOLE_SLUG>/`, đăng nhập (mật khẩu, rồi mã 6 số), vào **Bảo mật / Security** → **Tạo khoá
   giấy phép**, và gửi public key hiện ra cho Claude để đặt vào HNMO (một lần).

1. On your computer, in this repository: `npm ci`, then `node tools/make-secrets.mts`; type the console password.
2. Add the printed key to an authenticator app.
3. Netlify: add a site from this repository, name it, paste the printed values as secret environment variables, add
   `ISSUES_URL`, deploy again.
4. GitHub Actions secrets: `HUB_KEY` (same value) and `HUB_URL` (the site's address).
5. Open the console, sign in, Security → make the licence key, and give its public key to Claude for HNMO (once).
