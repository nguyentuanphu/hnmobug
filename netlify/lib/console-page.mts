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
</style></head>
<body>
<header><h1>HNMO console</h1><button id="lang" type="button">EN</button><button id="logout" type="button" hidden></button></header>
<main>
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
  en: { password:'Password', code:'6-digit code from your authenticator app (new browser)', signIn:'Sign in', wrong:'Wrong password or code.', wait:'Too many tries; wait an hour.', signOut:'Sign out',
    hosts:'Servers', requests:'Licence requests', licences:'Licences', bugs:'Bug reports', security:'Security',
    lastSeen:'Last report', licence:'Licence', version:'Version', players:'Players (most at once / limit)', accounts:'Accounts / characters', health:'Crashes / errors this week', files:'Files', features:'Features',
    none:'None yet.', free:'free (10 players)', issue:'Issue a licence', decline:'Decline', revoke:'Withdraw', undo:'Give back', name:'Name', contact:'Contact', asked:'Players asked', note:'Note', machine:'Computer id', expires:'Last day (empty: none)', maxPlayers:'Players at once', bind:'Only this computer',
    open:'waiting', issued:'issued', declined:'declined', withdrawn:'withdrawn', copy:'Copy file', copied:'Copied', pending:'reports wait for the daily filing as issues', openIssues:'Open the issues',
    makeKey:'Make the licence key', keyMade:'Licence key made', keyHint:'Give this public key to Claude to put into HNMO (licence-pub.pem), once:', devices:'Trusted browsers', forget:'Remove', thisOne:'this browser', saved:'Done.', uptime:'Up', os:'System', integrity:{ok:'unchanged', modified:'MODIFIED', unsigned:'unsigned build', unknown:'unknown'} },
  vi: { password:'Mật khẩu', code:'Mã 6 số từ app xác thực (trình duyệt mới)', signIn:'Đăng nhập', wrong:'Sai mật khẩu hoặc mã.', wait:'Thử quá nhiều lần; đợi một giờ.', signOut:'Đăng xuất',
    hosts:'Server', requests:'Yêu cầu giấy phép', licences:'Giấy phép', bugs:'Báo lỗi', security:'Bảo mật',
    lastSeen:'Báo cáo gần nhất', licence:'Giấy phép', version:'Phiên bản', players:'Người chơi (cao nhất / giới hạn)', accounts:'Tài khoản / nhân vật', health:'Sập / lỗi tuần này', files:'File', features:'Tính năng',
    none:'Chưa có.', free:'miễn phí (10 người)', issue:'Cấp giấy phép', decline:'Từ chối', revoke:'Thu hồi', undo:'Trả lại', name:'Tên', contact:'Liên lạc', asked:'Số người xin', note:'Ghi chú', machine:'Mã máy', expires:'Ngày cuối (trống: không hạn)', maxPlayers:'Số người cùng lúc', bind:'Chỉ máy này',
    open:'đang chờ', issued:'đã cấp', declined:'đã từ chối', withdrawn:'đã thu hồi', copy:'Copy file', copied:'Đã copy', pending:'báo lỗi chờ được chuyển thành issue mỗi ngày', openIssues:'Mở danh sách issue',
    makeKey:'Tạo khóa giấy phép', keyMade:'Đã có khóa giấy phép', keyHint:'Đưa public key này cho Claude để đặt vào HNMO (licence-pub.pem), một lần:', devices:'Trình duyệt tin cậy', forget:'Xóa', thisOne:'trình duyệt này', saved:'Xong.', uptime:'Chạy', os:'Hệ điều hành', integrity:{ok:'nguyên vẹn', modified:'BỊ SỬA', unsigned:'bản chưa ký', unknown:'chưa rõ'} },
};
let lang = (() => { try { return localStorage.getItem('hnmo-console-lang') || 'vi'; } catch { return 'vi'; } })();
const t = (k) => T[lang][k] ?? T.en[k] ?? k;
let state = null, tab = 'hosts';
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); } for (const kid of kids) if (kid != null) e.append(kid); return e; };
const when = (iso) => iso ? new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-AU', { timeZone:'Australia/Sydney', dateStyle:'medium', timeStyle:'short' }).format(new Date(iso)) : '';
async function api(action, body) {
  const r = await fetch(BASE + '/api/' + action, body === undefined ? { credentials:'same-origin' } : { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json', 'X-Console':'1' }, body:JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && action !== 'login') { showLogin(); throw new Error('sign in'); }
  if (!r.ok) throw new Error(data.error || data.message || r.status);
  return data;
}
function labels() { document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); }); document.getElementById('lang').textContent = lang === 'vi' ? 'EN' : 'VI'; document.getElementById('logout').textContent = t('signOut'); document.documentElement.lang = lang; }
function showLogin() { document.getElementById('app').hidden = true; document.getElementById('logout').hidden = true; document.getElementById('login').hidden = false; labels(); }
async function load() { state = await api('state'); document.getElementById('login').hidden = true; document.getElementById('app').hidden = false; document.getElementById('logout').hidden = false; render(); }
function render() {
  labels();
  const tabs = document.getElementById('tabs'); tabs.replaceChildren();
  const openRequests = state.requests.filter((r) => r.status === 'open').length;
  for (const id of ['hosts', 'requests', 'licences', 'bugs', 'security']) {
    const label = t(id) + (id === 'requests' && openRequests ? ' (' + openRequests + ')' : id === 'hosts' ? ' (' + state.hosts.length + ')' : '');
    tabs.append(el('button', { type:'button', 'aria-pressed': String(tab === id), text: label, on:{ click:() => { tab = id; render(); } } }));
  }
  const view = document.getElementById('view'); view.replaceChildren(VIEWS[tab]());
}
const VIEWS = {
  hosts() {
    if (!state.hosts.length) return el('p', { class:'muted', text:t('none') });
    const table = el('table', {}, el('thead', {}, el('tr', {}, ...['licence', 'lastSeen', 'version', 'players', 'accounts', 'health', 'files', 'features'].map((k) => el('th', { text:t(k) })))));
    const body = el('tbody');
    for (const h of state.hosts) {
      const p = h.latest.players, f = h.latest.features, hl = h.latest.health;
      const lic = h.licensee ? h.licensee + (h.licenceExpires ? ' → ' + h.licenceExpires : '') : t('free');
      body.append(el('tr', {},
        el('td', {}, el('div', { text: lic, class: h.licenceProblem ? 'bad' : '' }), el('div', { class:'muted', text: h.machine + (h.licenceProblem ? ' · ' + h.licenceProblem : '') })),
        el('td', {}, el('div', { text: when(h.lastSeen) }), el('div', { class:'muted', text: t('os') + ': ' + h.latest.os + ' · ' + t('uptime') + ' ' + h.latest.uptimeHours + ' h' })),
        el('td', { text: h.latest.version }),
        el('td', { text: p.peak + ' / ' + (p.limit || 10), class: p.peak > (p.limit || 10) ? 'bad' : '' }),
        el('td', { text: p.accounts + ' / ' + p.characters }),
        el('td', { text: hl.crashes + ' / ' + hl.errors, class: hl.crashes ? 'warn' : '' }),
        el('td', { text: t('integrity')[hl.integrity] ?? hl.integrity, class: hl.integrity === 'modified' ? 'bad' : hl.integrity === 'ok' ? 'ok' : '' }),
        el('td', {}, el('div', { text: [f.season9 ? 'Season 9' : '', f.arena ? 'Arena' : '', 'EXP ' + f.expRate, f.dropRate ? 'drop ' + f.dropRate : ''].filter(Boolean).join(' · ') }), el('div', { class:'muted', text: f.plugins.length + ' plug-ins · ' + h.bugsSent + ' ' + t('bugs').toLowerCase() }))));
    }
    table.append(body);
    return el('div', { class:'card table' }, table);
  },
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
        el('div', {}, el('strong', { text: l.licensee }), document.createTextNode(' · ' + l.maxPlayers + ' · ' + (l.expires || '∞') + ' · ' + (l.machine || '*') + ' · '), el('span', { class: l.revoked ? 'bad' : 'ok', text: l.revoked ? t('withdrawn') + ' ' + when(l.revoked) : l.id })),
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
    wrap.append(keyCard, devices);
    return wrap;
  },
};
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
load().catch(() => showLogin());
</script>
</body></html>`;
}
