// The console's page (one HTML file with its script) and the public "not found" page. Everything a server sent is
// put on the page as text (textContent), never as HTML. English and Vietnamese, switched on the page.

export function notFoundPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found · HNMO</title><link rel="stylesheet" href="/showcase.css"></head>
<body><main class="shell section"><h1>Page not found</h1><p><a href="/">Back to HNMO</a></p></main></body></html>`;
}

export function consolePage(base: string): string {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>HNMO console</title>
<link rel="stylesheet" href="/console.css"></head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <p class="brand"><span class="monogram" aria-hidden="true">H</span> <span data-t="console"></span></p>
    <button id="lang" type="button" lang="en">English</button><button id="logout" type="button" hidden></button>
  </div>
</header>
<main>
  <form id="setup" class="card auth" hidden>
    <h1 data-t="setupTitle"></h1>
    <p class="muted" data-t="setupHint"></p>
    <label for="setup-key" data-t="hubKey"></label><input id="setup-key" autocomplete="off" required>
    <label for="setup-password" data-t="newPassword"></label><input id="setup-password" type="password" autocomplete="new-password" minlength="12" required>
    <label for="setup-again" data-t="again"></label><input id="setup-again" type="password" autocomplete="new-password" minlength="12" required>
    <p id="setup-error" class="bad" role="alert"></p>
    <button class="primary" type="submit" data-t="setupSave"></button>
  </form>
  <form id="setup-done" class="card auth" hidden>
    <h1 data-t="appTitle"></h1>
    <p data-t="appHint"></p>
    <p><span data-t="appKey"></span> <code id="setup-secret"></code></p>
    <p><a id="setup-link" data-t="appLink"></a></p>
    <label for="setup-code" data-t="code"></label><input id="setup-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
    <p id="setup-done-error" class="bad" role="alert"></p>
    <button class="primary" type="submit" data-t="signIn"></button>
  </form>
  <form id="login" class="card auth" hidden>
    <h1 data-t="signIn"></h1>
    <label for="password" data-t="password"></label><input id="password" type="password" autocomplete="current-password" required>
    <div id="code-row" hidden><label for="code" data-t="code"></label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></div>
    <p id="login-error" class="bad" role="alert"></p>
    <button class="primary" type="submit" data-t="signIn"></button>
  </form>
  <div id="app" hidden>
    <div id="navigation">
      <button id="menu" type="button" aria-expanded="false" aria-controls="tabs"></button>
      <nav id="tabs"></nav>
    </div>
    <div>
      <div class="overview" id="queue-actions"></div>
      <h1 id="view-title" tabindex="-1"></h1>
      <div id="view"></div>
    </div>
  </div>
</main>
<script>
const BASE = ${JSON.stringify(base)};
const T = {
  en: { console:'HNMO console', pendingRequests:'Pending licence requests', pendingReports:'Pending bug reports', menu:'Sections', trustHint:'Browser trust renews for 365 days each time you sign in. Remove a browser to end its trust and sign it out.', active:'Active', expired:'Expired', unbound:'Any computer', noExpiry:'No expiry', setupTitle:'First use: set your sign-in', setupHint:'Paste the hub key (HUB_KEY from the site settings) to prove it is you, and choose the console password. This is asked only once.', hubKey:'Hub key (HUB_KEY)', newPassword:'New password (12 characters or more)', again:'The password again', setupSave:'Save', differ:'The two passwords differ or are shorter than 12 characters.', appTitle:'Add the console to your authenticator app', appHint:'In Google Authenticator or Microsoft Authenticator: add an account, choose "Enter a setup key", name it HNMO console, and type the key below (time based). Then type the 6-digit code it shows.', appKey:'Key:', appLink:'or open this link on the phone', password:'Password', code:'6-digit code from your authenticator app (new browser)', signIn:'Sign in', wrong:'Wrong password or code.', wait:'Too many tries; wait an hour.', signOut:'Sign out',
    commerce:'Licence packages', orderReview:'Recent test orders', commerceHint:'Enter packages as a JSON array. Each package needs id, name, description, currency (aud, usd or vnd) and unitAmount (cents for AUD/USD, whole đồng for VND). Checkout is test-only. Review paid orders before issuing any licence.', invalidPackages:'Could not save. Review the package fields and make sure each ID is unique.', commerceUnavailable:'Could not load licence packages.', paid:'Test payment verified', review:'Refund or dispute — review required',
    hosts:'Servers', real:'Real hosts', test:'Test machines', setups:'First setups', requests:'Licence requests', licences:'Licences', bugs:'Bug reports', security:'Security',
    lastSeen:'Last report', licence:'Licence', version:'Version', players:'Players (most at once / limit)', accounts:'Accounts / characters', health:'Crashes / errors this week', files:'Files', features:'Features',
    none:'None yet.', free:'free (10 players)', issue:'Issue a licence', decline:'Decline', revoke:'Withdraw', undo:'Give back', name:'Name', contact:'Contact', asked:'Players asked', note:'Note', machine:'Computer id', expires:'Last day (empty: none)', maxPlayers:'Players at once', bind:'Only this computer',
    open:'waiting', issued:'issued', declined:'declined', withdrawn:'withdrawn', copy:'Copy file', copied:'Copied', pending:'reports wait for the daily filing as issues', openIssues:'Open the issues',
    makeKey:'Make the licence key', keyMade:'Licence key made', keyHint:'Give this public key to Claude to put into HNMO (licence-pub.pem), once:', devices:'Trusted browsers', forget:'Remove', thisOne:'this browser', saved:'Done.', grace:'over the limit since', uptime:'Up', os:'System', integrity:{ok:'unchanged', modified:'MODIFIED', unsigned:'unsigned build', unknown:'unknown'},
    host:'Host', system:'System', game:'Game', place:'IP and country', autoWithdrawn:'withdrawn by itself', computers:'Computers seen', manyOk:'more computers allowed', sentTimes:'times sent', oldId:'old id',
    noMuName:'(unnamed server)', noHost:'host not filled in', markTest:'It is a test machine', markReal:'It is a real host', allTest:'Mark every real host here as a test machine', allTestAsk:'Mark all these as your test machines?', details:'Details', firstSetup:'First setup', noReport:'no weekly report yet', latestTitle:'Newest HNMO release', latestHint:'The version HNMO servers are offered (their admin panel shows it with an Update button). Build it first: the package workflow uploads each version to the update storage. Empty version: none offered. The download link may stay empty (the version’s HNMO.zip on the update storage).', latestTag:'Version (1.0.0)', latestUrl:'Download link of the whole folder (optional)', latestNotes:'Notes', save:'Save', machineId:'Machine id', plugins:'plug-ins', reportsSent:'bug reports', none2:'No test machines.' },
  vi: { console:'Quản lý HNMO', pendingRequests:'Yêu cầu giấy phép đang chờ', pendingReports:'Báo lỗi đang chờ', menu:'Các mục', trustHint:'Mỗi lần đăng nhập, trình duyệt được tin cậy thêm 365 ngày. Xóa một trình duyệt để hủy tin cậy và đăng xuất trình duyệt đó.', active:'Đang hoạt động', expired:'Đã hết hạn', unbound:'Bất kỳ máy nào', noExpiry:'Không hết hạn', setupTitle:'Lần đầu: đặt cách đăng nhập', setupHint:'Dán khoá hub (HUB_KEY trong cài đặt site) để chứng minh là anh, rồi chọn mật khẩu khu quản lý. Chỉ hỏi một lần.', hubKey:'Khoá hub (HUB_KEY)', newPassword:'Mật khẩu mới (12 ký tự trở lên)', again:'Nhập lại mật khẩu', setupSave:'Lưu', differ:'Hai mật khẩu khác nhau hoặc ngắn hơn 12 ký tự.', appTitle:'Thêm khu quản lý vào app xác thực', appHint:'Trong Google Authenticator hoặc Microsoft Authenticator: thêm tài khoản, chọn "Nhập khoá thiết lập", đặt tên HNMO console, gõ khoá bên dưới (theo thời gian). Rồi gõ mã 6 số app hiện ra.', appKey:'Khoá:', appLink:'hoặc mở link này trên điện thoại', password:'Mật khẩu', code:'Mã 6 số từ app xác thực (trình duyệt mới)', signIn:'Đăng nhập', wrong:'Sai mật khẩu hoặc mã.', wait:'Thử quá nhiều lần; đợi một giờ.', signOut:'Đăng xuất',
    commerce:'Gói giấy phép', orderReview:'Đơn thử nghiệm gần đây', commerceHint:'Nhập danh sách gói dạng JSON. Mỗi gói cần id, name, description, currency (aud, usd hoặc vnd) và unitAmount (cent cho AUD/USD, số đồng cho VND). Chỉ thanh toán thử nghiệm. Kiểm tra đơn đã trả tiền trước khi cấp giấy phép.', invalidPackages:'Không lưu được. Kiểm tra các trường và đảm bảo mỗi mã gói là duy nhất.', commerceUnavailable:'Không tải được các gói giấy phép.', paid:'Đã xác minh thanh toán thử', review:'Có hoàn tiền hoặc tranh chấp, cần kiểm tra',
    hosts:'Server', real:'Máy thật', test:'Máy test', setups:'Cài đặt lần đầu', requests:'Yêu cầu giấy phép', licences:'Giấy phép', bugs:'Báo lỗi', security:'Bảo mật',
    lastSeen:'Báo cáo gần nhất', licence:'Giấy phép', version:'Phiên bản', players:'Người chơi (cao nhất / giới hạn)', accounts:'Tài khoản / nhân vật', health:'Sập / lỗi tuần này', files:'File', features:'Tính năng',
    none:'Chưa có.', free:'miễn phí (10 người)', issue:'Cấp giấy phép', decline:'Từ chối', revoke:'Thu hồi', undo:'Trả lại', name:'Tên', contact:'Liên lạc', asked:'Số người xin', note:'Ghi chú', machine:'Mã máy', expires:'Ngày cuối (trống: không hạn)', maxPlayers:'Số người cùng lúc', bind:'Chỉ máy này',
    open:'đang chờ', issued:'đã cấp', declined:'đã từ chối', withdrawn:'đã thu hồi', copy:'Copy file', copied:'Đã copy', pending:'báo lỗi chờ được chuyển thành issue mỗi ngày', openIssues:'Mở danh sách issue',
    makeKey:'Tạo khóa giấy phép', keyMade:'Đã có khóa giấy phép', keyHint:'Đưa public key này cho Claude để đặt vào HNMO (licence-pub.pem), một lần:', devices:'Trình duyệt tin cậy', forget:'Xóa', thisOne:'trình duyệt này', saved:'Xong.', grace:'vượt giới hạn từ', uptime:'Chạy', os:'Hệ điều hành', integrity:{ok:'nguyên vẹn', modified:'BỊ SỬA', unsigned:'bản chưa ký', unknown:'chưa rõ'},
    host:'Chủ server', system:'Hệ thống', game:'Game', place:'IP và quốc gia', autoWithdrawn:'tự thu hồi', computers:'Các máy đã thấy', manyOk:'cho phép nhiều máy', sentTimes:'lần gửi', oldId:'mã cũ',
    noMuName:'(server chưa có tên)', noHost:'chưa điền chủ server', markTest:'Đây là máy test', markReal:'Đây là máy thật', allTest:'Đánh dấu tất cả máy ở đây là máy test', allTestAsk:'Đánh dấu tất cả những máy này là máy test của anh?', details:'Chi tiết', firstSetup:'Cài đặt lần đầu', noReport:'chưa có báo cáo tuần', latestTitle:'Bản HNMO mới nhất', latestHint:'Phiên bản được đưa cho các server HNMO (admin panel của họ hiện kèm nút Cập nhật). Build trước: workflow đóng gói tự đưa mỗi phiên bản lên kho cập nhật. Để trống phiên bản: không đưa bản nào. Link tải có thể để trống (dùng HNMO.zip của phiên bản đó trên kho cập nhật).', latestTag:'Phiên bản (1.0.0)', latestUrl:'Link tải trọn bộ (không bắt buộc)', latestNotes:'Ghi chú', save:'Lưu', machineId:'Mã máy', plugins:'plug-in', reportsSent:'báo lỗi', none2:'Không có máy test.' },
};
let lang = (() => { try { return localStorage.getItem('hnmo-console-lang') === 'en' ? 'en' : 'vi'; } catch { return 'vi'; } })();
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
function labels() {
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
  const languageButton = document.getElementById('lang');
  languageButton.textContent = lang === 'vi' ? 'EN' : 'VI';
  languageButton.setAttribute('aria-label', lang === 'vi' ? 'English' : 'Tiếng Việt');
  languageButton.lang = lang === 'vi' ? 'en' : 'vi';
  document.getElementById('logout').textContent = t('signOut');
  document.documentElement.lang = lang;
}
function showSetup() { document.getElementById('app').hidden = true; document.getElementById('login').hidden = true; document.getElementById('setup').hidden = false; labels(); }
function showLogin() { document.getElementById('setup').hidden = true; document.getElementById('setup-done').hidden = true; document.getElementById('app').hidden = true; document.getElementById('logout').hidden = true; document.getElementById('login').hidden = false; labels(); }
let editing = false;
async function load() { state = await api('state'); editing = false; document.getElementById('login').hidden = true; document.getElementById('app').hidden = false; document.getElementById('logout').hidden = false; render(); }
const menu = document.getElementById('menu');
const tabs = document.getElementById('tabs');
const viewTitle = document.getElementById('view-title');
const view = document.getElementById('view');
function goTo(id) {
  tab = id;
  editing = false;
  menu.setAttribute('aria-expanded', 'false');
  render();
  viewTitle.focus({ preventScroll:true });
  viewTitle.scrollIntoView({ block:'nearest' });
}
menu.addEventListener('click', () => {
  menu.setAttribute('aria-expanded', String(menu.getAttribute('aria-expanded') !== 'true'));
});
const tabButtons = new Map();
for (const id of ['real', 'test', 'requests', 'licences', 'commerce', 'bugs', 'security']) {
  const button = el('button', { type:'button', on:{ click:() => goTo(id) } });
  tabButtons.set(id, button);
  tabs.append(button);
}
const queueActions = document.getElementById('queue-actions');
const queues = [['requests', 'pendingRequests'], ['bugs', 'pendingReports']].map(([id, label]) => {
  const count = el('strong');
  const title = el('span');
  queueActions.append(el('button', { type:'button', on:{ click:() => goTo(id) } }, count, title));
  return { id, label, count, title };
});
function render() {
  labels();
  const openRequests = state.requests.filter((r) => r.status === 'open').length;
  const counts = { real: machines(false).length, test: machines(true).length, requests: openRequests, bugs: state.pendingBugs };
  menu.textContent = t('menu') + ' · ' + t(tab);
  tabs.setAttribute('aria-label', t('menu'));
  for (const [id, button] of tabButtons) {
    button.textContent = t(id) + (id in counts ? ' (' + counts[id] + ')' : '');
    button.setAttribute('aria-pressed', String(tab === id));
  }
  for (const queue of queues) {
    queue.count.textContent = counts[queue.id];
    queue.title.textContent = t(queue.label);
  }
  viewTitle.textContent = t(tab);
  view.replaceChildren(VIEWS[tab]());
}
const VIEWS = {
  real() { return machineList(false); },
  test() { return machineList(true); },
  requests() {
    const wrap = el('div');
    if (!state.requests.length) wrap.append(el('p', { class:'muted', text:t('none') }));
    for (const r of state.requests) {
      const status = r.status === 'open' ? 'warn' : r.status === 'issued' ? 'ok' : 'muted';
      const card = el('article', { class:'card manage-card' },
        el('div', { class:'host-head' }, el('h3', { text: r.name }), el('span', { class:'badge ' + status, text:t(r.status) })),
        el('div', { class:'muted', text:when(r.at) }),
        el('div', { class:'stats' }, stat('contact', r.contact || '–'), stat('asked', r.players || '–'),
          stat('machine', r.machine), stat('version', r.version), r.licensee ? stat('licence', r.licensee) : null),
        r.message ? el('p', { text:r.message }) : null);
      if (r.status === 'open') card.append(issueForm({ request:r.id, licensee:r.name, maxPlayers:r.players || 30, machine:r.machine }),
        el('div', { class:'row' }, el('button', { type:'button', class:'danger', text:t('decline'), on:{ click:async () => { await api('decline', { request:r.id }); await load(); } } })));
      wrap.append(card);
    }
    return wrap;
  },
  commerce() {
    const panel = el('div', { class:'card', 'aria-live':'polite' });
    api('licence-commerce').then(({ packages, orders }) => {
      const input = el('textarea', { id:'package-catalogue', rows:'12', spellcheck:'false', on:{ input:() => { editing = true; } } });
      input.value = JSON.stringify(packages, null, 2);
      const message = el('p', { role:'status' });
      const save = el('button', { type:'submit', class:'primary', text:t('save') });
      const form = el('form', { on:{ submit:async event => {
        event.preventDefault();
        save.disabled = true;
        try {
          await api('licence-commerce', { packages:JSON.parse(input.value) });
          editing = false;
          message.textContent = t('saved');
        } catch {
          message.textContent = t('invalidPackages');
        } finally {
          save.disabled = false;
        }
      } } }, el('label', { for:'package-catalogue', text:t('commerce') }), el('p', { text:t('commerceHint') }), input, save, message);
      const list = el('ul');
      for (const order of orders) {
        const { currency, unitAmount, name } = order.package;
        const amount = new Intl.NumberFormat(lang, { style:'currency', currency }).format(currency === 'vnd' ? unitAmount : unitAmount / 100);
        list.append(el('li', { text:[when(order.at), name, amount, order.id, t(order.paid ? 'paid' : 'open'), order.flagged ? t('review') : ''].filter(Boolean).join(' · ') }));
      }
      panel.replaceChildren(form, el('h2', { text:t('orderReview') }), orders.length ? list : el('p', { text:t('none') }));
    }).catch(() => { panel.textContent = t('commerceUnavailable'); });
    return panel;
  },
  licences() {
    const wrap = el('div', {}, el('div', { class:'card' }, el('h2', { text: t('issue') }), issueForm({})));
    for (const l of state.licences) {
      const copy = el('button', { type:'button', text: t('copy'), on:{ click: async () => { await navigator.clipboard.writeText(l.file); copy.textContent = t('copied'); } } });
      const expired = l.expires && l.expires < state.today;
      const status = l.revoked ? (l.revokedReason ? 'autoWithdrawn' : 'withdrawn') : expired ? 'expired' : 'active';
      wrap.append(el('article', { class:'card manage-card' },
        el('div', { class:'host-head' }, el('h3', { text:l.licensee }),
          el('span', { class:'badge ' + (l.revoked ? 'bad' : expired ? 'warn' : 'ok'), text:t(status) })),
        el('div', { class:'stats' }, stat('licence', l.id), stat('maxPlayers', l.maxPlayers),
          stat('expires', l.expires || t('noExpiry')), stat('machine', l.machine || t('unbound'))),
        l.revoked ? el('div', { class:'muted', text:when(l.revoked) }) : null,
        l.revokedReason ? el('div', { class:'bad', text:l.revokedReason }) : null,
        l.manyComputers ? el('div', { class:'muted', text:t('manyOk') }) : null,
        l.computers.length ? el('div', { class:'muted', text:t('computers') + ': ' + l.computers.map((c) => c.machine + (c.legacy ? ' (' + t('oldId') + ' ' + c.legacy + ')' : '') + ' ' + when(c.last)).join(' · ') }) : null,
        el('div', { class:'row' }, copy, el('button', { type:'button', class:l.revoked ? '' : 'danger', text:t(l.revoked ? 'undo' : 'revoke'), on:{ click:async () => { await api('revoke', { licence:l.id, undo:!!l.revoked }); await load(); } } }))));

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
    const devices = el('div', { class:'card' }, el('h2', { text: t('devices') }), el('p', { class:'muted', text:t('trustHint') }));
    for (const d of state.devices) devices.append(el('div', { class:'row device' }, el('span', { text: when(d.added) + ' → ' + when(d.lastSeen) + (d.current ? ' (' + t('thisOne') + ')' : '') + ' · ' }), el('span', { class:'muted', text: d.name + ' ' }), el('button', { type:'button', class:'danger', text: t('forget'), on:{ click: async () => { await api('forget-device', { device: d.id }); await load(); } } })));
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
    el('div', {}, el('h3', { class:'host-name', text: muName || t('noMuName') }),
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
  const result = el('span', { class:'muted', role:'status' });
  f.append(field('name', licensee), field('maxPlayers', players), field('expires', expires), field('machine', machine), el('div', { class:'row' }, el('button', { class:'primary', type:'submit', text: t('issue') }), result));
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
    if (answer.needCode) {
      codeRow.hidden = false;
      document.getElementById('code').required = true;
      document.getElementById('code').focus();
      return;
    }
    codeRow.hidden = true;
    document.getElementById('code').required = false;
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
document.getElementById('setup-done').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = document.getElementById('setup-done-error'); error.textContent = '';
  try {
    await api('login', { password: setupPassword, code: document.getElementById('setup-code').value });
    setupPassword = '';
    document.getElementById('setup-done').hidden = true;
    await load();
  } catch { error.textContent = t('wrong'); }
});
labels();
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
