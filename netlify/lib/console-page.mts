// The console's page (one HTML file with its script) and the cover site's "not found" page. Everything a server sent is
// put on the page as text (textContent), never as HTML. English and Vietnamese, switched on the page.

export function notFoundPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found · Slow mornings</title><link rel="stylesheet" href="/style.css"></head>
<body><div class="wrap"><h1>Page not found</h1><p>This page is not here. <a href="/">Back to the notes</a>.</p></div></body></html>`;
}

export function consolePage(base: string): string {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>HNMO console</title>
<style>
:root { --bg:#f6f7f9; --panel:#fff; --text:#1d2330; --muted:#667085; --line:#e3e6ec; --accent:#3b5bdb; --ok:#2b8a3e; --warn:#e67700; --bad:#c92a2a; }
@media (prefers-color-scheme: dark) { :root { --bg:#12151c; --panel:#1b2029; --text:#e6e9ef; --muted:#98a2b3; --line:#2c333f; --accent:#7c94ff; --ok:#51cf66; --warn:#ffa94d; --bad:#ff6b6b; } }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.45 system-ui, sans-serif; background:var(--bg); color:var(--text); }
header { display:flex; gap:12px; align-items:center; padding:12px 16px; border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0; }
header h1 { font-size:17px; margin:0 auto 0 0; }
main { max-width:1100px; margin:0 auto; padding:16px; }
nav { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
button, input, select, textarea { font:inherit; color:inherit; }
button { border:1px solid var(--line); background:var(--panel); border-radius:6px; padding:6px 12px; cursor:pointer; }
button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
button.danger { color:var(--bad); }
button[aria-pressed="true"] { border-color:var(--accent); color:var(--accent); font-weight:600; }
input, textarea, select { border:1px solid var(--line); background:var(--panel); border-radius:6px; padding:6px 8px; width:100%; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; margin-bottom:12px; }
.muted { color:var(--muted); font-size:13px; }
.ok { color:var(--ok); } .warn { color:var(--warn); } .bad { color:var(--bad); }
table { width:100%; border-collapse:collapse; font-size:14px; }
th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
.table { overflow-x:auto; }
.grid { display:grid; gap:8px; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); }
pre { white-space:pre-wrap; word-break:break-all; font-size:12px; background:var(--bg); padding:8px; border-radius:6px; }
#login { max-width:360px; margin:12vh auto; }
#login label { display:block; margin:10px 0 4px; }
.host { display:flex; flex-direction:column; gap:8px; }
.host-head { display:flex; gap:8px; align-items:flex-start; justify-content:space-between; }
.host-name { font-size:17px; font-weight:600; line-height:1.25; }
.badge { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 10px; font-size:12px; white-space:nowrap; }
.badge.ok { border-color:var(--ok); } .badge.bad { border-color:var(--bad); } .badge.warn { border-color:var(--warn); }
.stats { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:6px 12px; font-size:14px; }
@media (min-width:700px) { .stats { grid-template-columns:repeat(4, minmax(0, 1fr)); } }
.stats .k { color:var(--muted); font-size:12px; display:block; }
details summary { cursor:pointer; color:var(--muted); font-size:13px; }
details .muted { word-break:break-word; }
.row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
@media (max-width:520px) { main { padding:10px; } .card { padding:12px; } header { padding:10px 12px; } }
</style></head>
<body>
<header><h1>HNMO console</h1><button id="lang" type="button">EN</button><button id="logout" type="button" hidden></button></header>
<main>
  <form id="setup" class="card" hidden>
    <h2 data-t="setupTitle"></h2>
    <p class="muted" data-t="setupHint"></p>
    <label for="setup-key" data-t="hubKey"></label><input id="setup-key" autocomplete="off" required>
    <label for="setup-password" data-t="newPassword"></label><input id="setup-password" type="password" autocomplete="new-password" minlength="12" required>
    <label for="setup-again" data-t="again"></label><input id="setup-again" type="password" autocomplete="new-password" minlength="12" required>
    <p id="setup-error" class="bad" role="alert"></p>
    <button class="primary" type="submit" data-t="setupSave"></button>
  </form>
  <div id="setup-done" class="card" hidden>
    <h2 data-t="appTitle"></h2>
    <p data-t="appHint"></p>
    <p><span data-t="appKey"></span> <code id="setup-secret"></code></p>
    <p><a id="setup-link" data-t="appLink"></a></p>
    <label for="setup-code" data-t="code"></label><input id="setup-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6">
    <p id="setup-done-error" class="bad" role="alert"></p>
    <button class="primary" id="setup-finish" type="button" data-t="signIn"></button>
  </div>
  <form id="login" class="card" hidden>
    <label for="password" data-t="password"></label><input id="password" type="password" autocomplete="current-password" required>
    <div id="code-row" hidden><label for="code" data-t="code"></label><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <p id="login-error" class="bad" role="alert"></p>
    <button class="primary" type="submit" data-t="signIn"></button>
  </form>
  <div id="app" hidden>
    <nav id="tabs"></nav>
    <div id="view"></div>
  </div>
</main>
<script>
const BASE = ${JSON.stringify(base)};
const T = {
  en: { setupTitle:'First use: set your sign-in', setupHint:'Paste the hub key (HUB_KEY from the site settings) to prove it is you, and choose the console password. This is asked only once.', hubKey:'Hub key (HUB_KEY)', newPassword:'New password (12 characters or more)', again:'The password again', setupSave:'Save', differ:'The two passwords differ or are shorter than 12 characters.', appTitle:'Add the console to your authenticator app', appHint:'In Google Authenticator or Microsoft Authenticator: add an account, choose "Enter a setup key", name it HNMO console, and type the key below (time based). Then type the 6-digit code it shows.', appKey:'Key:', appLink:'or open this link on the phone', password:'Password', code:'6-digit code from your authenticator app (new browser)', signIn:'Sign in', wrong:'Wrong password or code.', wait:'Too many tries; wait an hour.', signOut:'Sign out',
    hosts:'Servers', real:'Real hosts', test:'Test machines', setups:'First setups', requests:'Licence requests', licences:'Licences', bugs:'Bug reports', security:'Security',
    lastSeen:'Last report', licence:'Licence', version:'Version', players:'Players (most at once / limit)', accounts:'Accounts / characters', health:'Crashes / errors this week', files:'Files', features:'Features',
    none:'None yet.', free:'free (10 players)', issue:'Issue a licence', decline:'Decline', revoke:'Withdraw', undo:'Give back', name:'Name', contact:'Contact', asked:'Players asked', note:'Note', machine:'Computer id', expires:'Last day (empty: none)', maxPlayers:'Players at once', bind:'Only this computer',
    open:'waiting', issued:'issued', declined:'declined', withdrawn:'withdrawn', copy:'Copy file', copied:'Copied', pending:'reports wait for the daily filing as issues', openIssues:'Open the issues',
    makeKey:'Make the licence key', keyMade:'Licence key made', keyHint:'Give this public key to Claude to put into HNMO (licence-pub.pem), once:', devices:'Trusted browsers', forget:'Remove', thisOne:'this browser', saved:'Done.', grace:'over the limit since', uptime:'Up', os:'System', integrity:{ok:'unchanged', modified:'MODIFIED', unsigned:'unsigned build', unknown:'unknown'},
    host:'Host', system:'System', game:'Game', place:'IP and country', autoWithdrawn:'withdrawn by itself', computers:'Computers seen', manyOk:'more computers allowed', sentTimes:'times sent', oldId:'old id',
    noMuName:'(no MU name yet)', noHost:'host not filled in', markTest:'It is a test machine', markReal:'It is a real host', allTest:'Mark every real host here as a test machine', allTestAsk:'Mark all these as your test machines?', details:'Details', firstSetup:'First setup', noReport:'no weekly report yet', latestTitle:'Newest HNMO release', latestHint:'HNMO servers check for updates here and their website’s "Download HNMO" goes to this link. Empty link: none.', latestTag:'Version', latestUrl:'Download link (https://…)', latestNotes:'Notes', save:'Save', machineId:'Machine id', plugins:'plug-ins', reportsSent:'bug reports', none2:'No test machines.' },
  vi: { setupTitle:'Lần đầu: đặt cách đăng nhập', setupHint:'Dán khoá hub (HUB_KEY trong cài đặt site) để chứng minh là anh, rồi chọn mật khẩu khu quản lý. Chỉ hỏi một lần.', hubKey:'Khoá hub (HUB_KEY)', newPassword:'Mật khẩu mới (12 ký tự trở lên)', again:'Nhập lại mật khẩu', setupSave:'Lưu', differ:'Hai mật khẩu khác nhau hoặc ngắn hơn 12 ký tự.', appTitle:'Thêm khu quản lý vào app xác thực', appHint:'Trong Google Authenticator hoặc Microsoft Authenticator: thêm tài khoản, chọn "Nhập khoá thiết lập", đặt tên HNMO console, gõ khoá bên dưới (theo thời gian). Rồi gõ mã 6 số app hiện ra.', appKey:'Khoá:', appLink:'hoặc mở link này trên điện thoại', password:'Mật khẩu', code:'Mã 6 số từ app xác thực (trình duyệt mới)', signIn:'Đăng nhập', wrong:'Sai mật khẩu hoặc mã.', wait:'Thử quá nhiều lần; đợi một giờ.', signOut:'Đăng xuất',
    hosts:'Server', real:'Máy thật', test:'Máy test', setups:'Cài đặt lần đầu', requests:'Yêu cầu giấy phép', licences:'Giấy phép', bugs:'Báo lỗi', security:'Bảo mật',
    lastSeen:'Báo cáo gần nhất', licence:'Giấy phép', version:'Phiên bản', players:'Người chơi (cao nhất / giới hạn)', accounts:'Tài khoản / nhân vật', health:'Sập / lỗi tuần này', files:'File', features:'Tính năng',
    none:'Chưa có.', free:'miễn phí (10 người)', issue:'Cấp giấy phép', decline:'Từ chối', revoke:'Thu hồi', undo:'Trả lại', name:'Tên', contact:'Liên lạc', asked:'Số người xin', note:'Ghi chú', machine:'Mã máy', expires:'Ngày cuối (trống: không hạn)', maxPlayers:'Số người cùng lúc', bind:'Chỉ máy này',
    open:'đang chờ', issued:'đã cấp', declined:'đã từ chối', withdrawn:'đã thu hồi', copy:'Copy file', copied:'Đã copy', pending:'báo lỗi chờ được chuyển thành issue mỗi ngày', openIssues:'Mở danh sách issue',
    makeKey:'Tạo khóa giấy phép', keyMade:'Đã có khóa giấy phép', keyHint:'Đưa public key này cho Claude để đặt vào HNMO (licence-pub.pem), một lần:', devices:'Trình duyệt tin cậy', forget:'Xóa', thisOne:'trình duyệt này', saved:'Xong.', grace:'vượt giới hạn từ', uptime:'Chạy', os:'Hệ điều hành', integrity:{ok:'nguyên vẹn', modified:'BỊ SỬA', unsigned:'bản chưa ký', unknown:'chưa rõ'},
    host:'Chủ server', system:'Hệ thống', game:'Game', place:'IP và quốc gia', autoWithdrawn:'tự thu hồi', computers:'Các máy đã thấy', manyOk:'cho phép nhiều máy', sentTimes:'lần gửi', oldId:'mã cũ',
    noMuName:'(chưa có tên MU)', noHost:'chưa điền chủ server', markTest:'Đây là máy test', markReal:'Đây là máy thật', allTest:'Đánh dấu tất cả máy ở đây là máy test', allTestAsk:'Đánh dấu tất cả những máy này là máy test của anh?', details:'Chi tiết', firstSetup:'Cài đặt lần đầu', noReport:'chưa có báo cáo tuần', latestTitle:'Bản HNMO mới nhất', latestHint:'Server HNMO kiểm tra cập nhật ở đây và nút "Tải HNMO" trên website của họ dẫn tới link này. Để trống link: không có.', latestTag:'Phiên bản', latestUrl:'Link tải (https://…)', latestNotes:'Ghi chú', save:'Lưu', machineId:'Mã máy', plugins:'plug-in', reportsSent:'báo lỗi', none2:'Không có máy test.' },
};
let lang = (() => { try { return localStorage.getItem('hnmo-console-lang') || 'vi'; } catch { return 'vi'; } })();
const t = (k) => T[lang][k] ?? T.en[k] ?? k;
let state = null, tab = 'real';
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); } for (const kid of kids) if (kid != null) e.append(kid); return e; };
const when = (iso) => iso ? new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-AU', { timeZone:'Australia/Sydney', dateStyle:'medium', timeStyle:'short' }).format(new Date(iso)) : '';
async function api(action, body) {
  const r = await fetch(BASE + '/api/' + action, body === undefined ? { credentials:'same-origin' } : { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json', 'X-Console':'1' }, body:JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && action !== 'login' && action !== 'setup') { showLogin(); throw new Error('sign in'); }
  if (!r.ok) throw new Error(data.error || data.message || r.status);
  return data;
}
function labels() { document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); }); document.getElementById('lang').textContent = lang === 'vi' ? 'EN' : 'VI'; document.getElementById('logout').textContent = t('signOut'); document.documentElement.lang = lang; }
function showSetup() { document.getElementById('app').hidden = true; document.getElementById('login').hidden = true; document.getElementById('setup').hidden = false; labels(); }
function showLogin() { document.getElementById('setup').hidden = true; document.getElementById('setup-done').hidden = true; document.getElementById('app').hidden = true; document.getElementById('logout').hidden = true; document.getElementById('login').hidden = false; labels(); }
let editing = false;
async function load() { state = await api('state'); editing = false; document.getElementById('login').hidden = true; document.getElementById('app').hidden = false; document.getElementById('logout').hidden = false; render(); }
function render() {
  labels();
  const tabs = document.getElementById('tabs'); tabs.replaceChildren();
  const openRequests = state.requests.filter((r) => r.status === 'open').length;
  const counts = { real: machines(false).length, test: machines(true).length };
  for (const id of ['real', 'test', 'requests', 'licences', 'bugs', 'security']) {
    const label = t(id) + (id === 'requests' && openRequests ? ' (' + openRequests + ')' : id in counts ? ' (' + counts[id] + ')' : '');
    tabs.append(el('button', { type:'button', 'aria-pressed': String(tab === id), text: label, on:{ click:() => { tab = id; render(); } } }));
  }
  const view = document.getElementById('view'); view.replaceChildren(VIEWS[tab]());
}
const VIEWS = {
  real() { return machineList(false); },
  test() { return machineList(true); },
  requests() {
    const wrap = el('div');
    if (!state.requests.length) wrap.append(el('p', { class:'muted', text:t('none') }));
    for (const r of state.requests) {
      const card = el('div', { class:'card' },
        el('div', {}, el('strong', { text: r.name }), document.createTextNode(' · ' + when(r.at) + ' · '), el('span', { class: r.status === 'open' ? 'warn' : r.status === 'issued' ? 'ok' : 'muted', text: t(r.status) })),
        el('div', { class:'muted', text: t('contact') + ': ' + (r.contact || '-') + ' · ' + t('asked') + ': ' + (r.players || '-') + ' · ' + t('machine') + ': ' + r.machine + ' · ' + t('version') + ': ' + r.version + (r.licensee ? ' · ' + t('licence') + ': ' + r.licensee : '') }),
        r.message ? el('p', { text: r.message }) : null);
      if (r.status === 'open') card.append(issueForm({ request: r.id, licensee: r.name, maxPlayers: r.players || 30, machine: r.machine }), el('button', { type:'button', class:'danger', text: t('decline'), on:{ click: async () => { await api('decline', { request: r.id }); await load(); } } }));
      wrap.append(card);
    }
    return wrap;
  },
  licences() {
    const wrap = el('div', {}, el('div', { class:'card' }, el('h2', { text: t('issue') }), issueForm({})));
    for (const l of state.licences) {
      const copy = el('button', { type:'button', text: t('copy'), on:{ click: async () => { await navigator.clipboard.writeText(l.file); copy.textContent = t('copied'); } } });
      wrap.append(el('div', { class:'card' },
        el('div', {}, el('strong', { text: l.licensee }), document.createTextNode(' · ' + l.maxPlayers + ' · ' + (l.expires || '∞') + ' · ' + (l.machine || '*') + ' · '), el('span', { class: l.revoked ? 'bad' : 'ok', text: l.revoked ? (l.revokedReason ? t('autoWithdrawn') : t('withdrawn')) + ' ' + when(l.revoked) : l.id }), l.manyComputers ? el('span', { class:'muted', text: ' · ' + t('manyOk') }) : null),
        l.revokedReason ? el('div', { class:'bad', text: l.revokedReason }) : null,
        l.computers.length ? el('div', { class:'muted', text: t('computers') + ': ' + l.computers.map((c) => c.machine + (c.legacy ? ' (' + t('oldId') + ' ' + c.legacy + ')' : '') + ' ' + when(c.last)).join(' · ') }) : null,
        el('div', {}, copy, document.createTextNode(' '), el('button', { type:'button', class: l.revoked ? '' : 'danger', text: l.revoked ? t('undo') : t('revoke'), on:{ click: async () => { await api('revoke', { licence: l.id, undo: !!l.revoked }); await load(); } } }))));
    }
    return wrap;
  },
  bugs() {
    return el('div', { class:'card' }, el('p', { text: state.pendingBugs + ' ' + t('pending') }), state.issuesUrl ? el('a', { href: state.issuesUrl, target:'_blank', rel:'noopener', text: t('openIssues') }) : null);
  },
  security() {
    const wrap = el('div');
    const keyCard = el('div', { class:'card' }, el('h2', { text: t('makeKey') }));
    if (state.licenceKey) keyCard.append(el('p', { class:'ok', text: t('keyMade') + ' · ' + when(state.licenceKey.made) }), el('p', { class:'muted', text: t('keyHint') }), el('pre', { text: state.licenceKey.publicPem }));
    else keyCard.append(el('button', { type:'button', class:'primary', text: t('makeKey'), on:{ click: async () => { await api('make-key', {}); await load(); } } }));
    const devices = el('div', { class:'card' }, el('h2', { text: t('devices') }));
    for (const d of state.devices) devices.append(el('div', {}, el('span', { text: when(d.added) + ' → ' + when(d.lastSeen) + (d.current ? ' (' + t('thisOne') + ')' : '') + ' · ' }), el('span', { class:'muted', text: d.name + ' ' }), el('button', { type:'button', class:'danger', text: t('forget'), on:{ click: async () => { await api('forget-device', { device: d.id }); await load(); } } })));
    const latest = state.latest || {};
    const tagInput = el('input', { value: latest.tag || '' });
    const urlInput = el('input', { value: latest.url || '', placeholder: 'https://' });
    const notesInput = el('textarea', { rows: '3' }); notesInput.value = latest.notes || '';
    const latestResult = el('span', { class:'muted' });
    const latestCard = el('form', { class:'card' }, el('h2', { text: t('latestTitle') }), el('p', { class:'muted', text: t('latestHint') }),
      el('label', {}, el('span', { class:'muted', text: t('latestTag') }), tagInput),
      el('label', {}, el('span', { class:'muted', text: t('latestUrl') }), urlInput),
      el('label', {}, el('span', { class:'muted', text: t('latestNotes') }), notesInput),
      el('div', { class:'row', style:'margin-top:8px' }, el('button', { class:'primary', type:'submit', text: t('save') }), latestResult));
    latestCard.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('latest', { tag: tagInput.value, url: urlInput.value, notes: notesInput.value }); latestResult.textContent = t('saved'); await load(); } catch (err) { latestResult.textContent = String(err.message || err); } });
    wrap.append(keyCard, latestCard, devices);
    return wrap;
  },
};
const short = (iso) => iso ? new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-AU', { timeZone:'Australia/Sydney', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(iso)) : '';
/** Every computer once: its weekly report and its first-setup report together, real hosts or test machines. */
function machines(test) {
  const all = new Map();
  for (const h of state.hosts) all.set(h.machine, { machine: h.machine, host: h, setup: null, test: h.test, at: h.lastSeen });
  for (const s of state.setups) {
    const m = all.get(s.machine) || { machine: s.machine, host: null, setup: null, test: s.test, at: s.at };
    m.setup = s; m.test = m.host ? (m.host.marked ? m.host.test : (s.marked ? s.test : m.host.test || s.test)) : s.test;
    if (s.at > m.at) m.at = s.at;
    all.set(s.machine, m);
  }
  return [...all.values()].filter((m) => !!m.test === test).sort((a, b) => b.at.localeCompare(a.at));
}
function stat(key, value, cls) { return el('div', {}, el('span', { class:'k', text: t(key) }), el('span', { class: cls || '', text: value })); }
function machineCard(m) {
  const h = m.host, s = m.setup, latest = h ? h.latest : null;
  const muName = (latest && latest.game && latest.game.name) || (s && s.game.name) || '';
  const hostName = (latest && latest.host && latest.host.name) || (s && s.host.name) || '';
  const contact = (latest && latest.host && latest.host.contact) || (s && s.host.contact) || '';
  const licence = h && h.licensee ? h.licensee + (h.licenceExpires ? ' → ' + h.licenceExpires : '') : (s && s.licensee) || t('free');
  const card = el('div', { class:'card host' });
  card.append(el('div', { class:'host-head' },
    el('div', {}, el('div', { class:'host-name', text: muName || t('noMuName') }),
      el('div', { class: hostName ? '' : 'warn', text: hostName ? '👤 ' + hostName + (contact ? ' · ' + contact : '') : t('noHost') })),
    el('span', { class:'badge ' + (h && h.licenceProblem ? 'bad' : h && h.licensee ? 'ok' : ''), text: licence })));
  if (s) card.append(el('div', { class:'muted', text: '🌐 ' + (s.ip || '-') + (s.country ? ' · ' + s.country : '') }));
  if (h) {
    const p = latest.players, hl = latest.health;
    card.append(el('div', { class:'stats' },
      stat('players', p.peak + ' / ' + (p.limit || 10), p.peak > (p.limit || 10) ? 'bad' : ''),
      stat('accounts', p.accounts + ' / ' + p.characters),
      stat('health', hl.crashes + ' / ' + hl.errors, hl.crashes ? 'warn' : ''),
      stat('files', t('integrity')[hl.integrity] ?? hl.integrity, hl.integrity === 'modified' ? 'bad' : hl.integrity === 'ok' ? 'ok' : ''),
      stat('version', latest.version || '-'),
      stat('lastSeen', short(h.lastSeen))));
    if (p.graceStarted) card.append(el('div', { class:'warn', text: t('grace') + ' ' + when(p.graceStarted) }));
    if (h.licenceProblem) card.append(el('div', { class:'bad', text: h.licenceProblem }));
  } else card.append(el('div', { class:'muted', text: t('noReport') }));
  const info = [];
  if (h) {
    const f = latest.features;
    info.push(t('os') + ': ' + latest.os + ' · ' + t('uptime') + ' ' + latest.uptimeHours + ' h');
    info.push(t('features') + ': ' + [f.season9 ? 'Season 9' : '', f.arena ? 'Arena' : '', 'EXP ' + f.expRate, f.dropRate ? 'drop ' + f.dropRate : ''].filter(Boolean).join(' · ') + ' · ' + f.plugins.length + ' ' + t('plugins') + ' · ' + h.bugsSent + ' ' + t('reportsSent'));
  }
  if (s) {
    const sy = s.system, g = s.game;
    info.push(t('system') + ': ' + sy.os + ' · ' + sy.arch + ' · ' + sy.cpu + ' · ' + sy.cores + ' cores · ' + sy.ramGb + ' GB RAM · ' + (sy.freeDiskGb ?? '?') + ' GB free · ' + sy.dotnet);
    info.push(t('game') + ': ' + [g.seasons.join(', '), g.servers.length + ' servers', g.publicAddress, g.language].filter(Boolean).join(' · '));
    info.push(t('firstSetup') + ': ' + when(s.firstAt) + ' · ' + s.times + ' ' + t('sentTimes'));
  }
  info.push(t('machineId') + ': ' + m.machine + (s && s.legacyMachine ? ' · ' + t('oldId') + ' ' + s.legacyMachine : ''));
  card.append(el('details', {}, el('summary', { text: t('details') }), ...info.map((line) => el('div', { class:'muted', text: line }))));
  card.append(el('div', { class:'row' }, el('button', { type:'button', text: m.test ? t('markReal') : t('markTest'), on:{ click: async () => { await api('mark', { machine: m.machine, test: !m.test }); await load(); } } })));
  return card;
}
function machineList(test) {
  const list = machines(test);
  const wrap = el('div');
  if (!list.length) { wrap.append(el('p', { class:'muted', text: test ? t('none2') : t('none') })); return wrap; }
  if (!test) wrap.append(el('div', { class:'row', style:'margin-bottom:12px' }, el('button', { type:'button', text: t('allTest'), on:{ click: async () => { if (!confirm(t('allTestAsk'))) return; await api('mark', { machines: list.map((m) => m.machine), test: true }); await load(); } } })));
  for (const m of list) wrap.append(machineCard(m));
  return wrap;
}
function issueForm(start) {
  const f = el('form', { class:'grid' });
  const field = (key, input) => el('label', {}, el('span', { class:'muted', text: t(key) }), input);
  const licensee = el('input', { value: start.licensee || '', required:'' });
  const players = el('input', { type:'number', min:'1', value: String(start.maxPlayers || 30) });
  const expires = el('input', { type:'date' });
  const machine = el('input', { value: start.machine || '', placeholder:'8e5abdd396d53501' });
  const result = el('span', { class:'muted' });
  f.append(field('name', licensee), field('maxPlayers', players), field('expires', expires), field('machine', machine), el('div', {}, el('button', { class:'primary', type:'submit', text: t('issue') }), result));
  f.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('issue', { request: start.request, licensee: licensee.value, maxPlayers: Number(players.value), expires: expires.value || null, machine: machine.value || null }); result.textContent = t('saved'); await load(); } catch (err) { result.textContent = String(err.message || err); } });
  return f;
}
document.getElementById('lang').addEventListener('click', () => { lang = lang === 'vi' ? 'en' : 'vi'; try { localStorage.setItem('hnmo-console-lang', lang); } catch {} if (state) render(); else labels(); });
document.getElementById('logout').addEventListener('click', async () => { await api('logout', {}).catch(() => {}); state = null; showLogin(); });
document.getElementById('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = document.getElementById('login-error'); error.textContent = '';
  const codeRow = document.getElementById('code-row');
  try {
    const answer = await api('login', { password: document.getElementById('password').value, code: codeRow.hidden ? undefined : document.getElementById('code').value });
    if (answer.needCode) { codeRow.hidden = false; document.getElementById('code').focus(); return; }
    document.getElementById('password').value = ''; document.getElementById('code').value = '';
    await load();
  } catch (err) { error.textContent = String(err.message) === 'wait' ? t('wait') : t('wrong'); }
});
let setupPassword = '';
document.getElementById('setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = document.getElementById('setup-error'); error.textContent = '';
  const password = document.getElementById('setup-password').value, again = document.getElementById('setup-again').value;
  if (password.length < 12 || password !== again) { error.textContent = t('differ'); return; }
  try {
    const answer = await api('setup', { hubKey: document.getElementById('setup-key').value, password });
    setupPassword = password;
    document.getElementById('setup').hidden = true;
    document.getElementById('setup-secret').textContent = answer.totpSecret;
    document.getElementById('setup-link').href = answer.otpauth;
    document.getElementById('setup-done').hidden = false;
    labels();
  } catch (err) { error.textContent = String(err.message) === 'wait' ? t('wait') : t('wrong'); }
});
document.getElementById('setup-finish').addEventListener('click', async () => {
  const error = document.getElementById('setup-done-error'); error.textContent = '';
  try {
    await api('login', { password: setupPassword, code: document.getElementById('setup-code').value });
    setupPassword = '';
    document.getElementById('setup-done').hidden = true;
    await load();
  } catch { error.textContent = t('wrong'); }
});
fetch(BASE + '/api/status', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => {
  if (!s.configured) { showSetup(); return; }
  load().catch(() => showLogin());
  // New requests, reports and servers show up without a reload: when the tab comes back and every minute, unless a
  // form on the page has unsaved typing.
  document.getElementById('view').addEventListener('input', () => { editing = true; });
  const refresh = () => { if (document.visibilityState === 'visible' && !document.getElementById('app').hidden && !editing) load().catch(() => {}); };
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 60000);
}).catch(() => showLogin());
</script>
</body></html>`;
}
