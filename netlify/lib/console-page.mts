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
    kindPlan:'Plan', kindAddon:'Add-on', kindTrial:'Free trial', bMonth:'Monthly', bYear:'Yearly', bLifetime:'One-off, lifetime', bOnce:'One-off', aPlayers:'More players', aUpgrade:'Upgrade to a plan', aMove:'Move to another computer', aSecond:'Second computer', pkgId:'ID (letters, digits, dashes)', pkgKind:'Kind', pkgName:'Name', pkgDesc:'Description', pkgPlayers:'Players at once', pkgBilling:'Payment', pkgOrder:'Order (small first)', seasonsLabel:'Seasons:', 'season-s6':'Season 6.3', 'season-s9':'Season 9', 'season-arena':'Arena', pkgActive:'On sale', pkgHighlight:'Highlighted', addonKind:'Add-on does', addPlayers:'Extra players', upgradeTo:'Upgrades to', priceVnd:'VND (whole đồng)', priceAud:'AUD (dollars, e.g. 19.90)', priceUsd:'USD (dollars, e.g. 12.50)', addPackage:'Add a package', removePackage:'Remove this package', removePackageAsk:'Remove this package? It is gone when you press Save.', stripeLive:'Card payments: ready (live keys found).', stripeTest:'Card payments: test keys found (no real money).', stripeOff:'Card payments: no Stripe keys yet (set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the site settings, then deploy).', webhookIs:'Webhook address:', stripeMin:'Stripe does not take a card payment below about 0.50 AUD or USD, so a test with real money cannot be 1 or 2 cents.', payosOn:'PayOS keys saved', payosOff:'PayOS: no keys yet, the PayOS button stays hidden', payosSite:'PayOS keys are set in the site settings', payosHint:'Paste the three keys from your PayOS channel (Client ID, API Key, Checksum Key) and save. They are stored encrypted and never shown again. Set the webhook address below in PayOS.', invalidPayos:'Could not save the PayOS keys. Check the three values.', pickBank:'Pick the bank',
    pkgIdAuto:'(made from the name if empty)', aFolders:'More server folders', addFolders:'Extra folders', playersShort:'players', daysShort:'days', stFree:'Free', stOff:'Off', stOn:'On sale', stNoPrice:'No price yet', newPackage:'New package', pricesTitle:'Prices', pricesHint:'Fill in any currency; empty means not sold in it. Stripe takes cards from about 0.50 AUD or USD. VND is for bank transfers (PayOS, VietQR).', advanced:'Advanced (ID, order)', copyPackage:'Duplicate', statsLine:'{on} on sale · {none} without a price · {off} off', previewTitle:'What buyers see', previewHint:'The License page of every server lists exactly this, after you press Save.', previewPlans:'Plans', previewExtras:'Add-ons', previewNone:'Nothing is on sale yet: give a package a price.', unsaved:'Unsaved changes', 'tpl-month':'Monthly plan', 'tpl-year':'Yearly plan', 'tpl-lifetime':'Lifetime plan', 'tpl-players':'More players', 'tpl-folders':'More server folders', 'tpl-second':'Second computer', 'tpl-upgrade':'Plan upgrade', 'tpl-move':'Move to another computer', createFromTemplate:'Create', newPackageTitle:'New package from a template:', ready:'ready', notReady:'not set up', paymentTitle:'Ways to pay', limitsTitle:'One folder per computer', limitsHint:'A licence runs one server folder on one computer; the Extra folders add-on allows more. Free computers sharing one public address are flagged too.', limitsTurnOn:'Turn on', limitsTurnOff:'Turn off', limitsOn:'on', limitsOff:'off', limitsOnNote:'On: a server holds a place per folder on its computer; a second folder gets no players until a place is free.', limitsOffNote:'Off while you test: everyone may run as many folders as they like. The hub still notes and flags them.', flagsTitle:'Flags (for you to judge, nothing is blocked by itself)', flagFolders:'Computer {machine} runs {count} folders, allowed {allowed}', flagAddress:'{count} free computers share the public address {code}', flagAside:'Set aside', noFlags:'No flags.',
    commerce:'Licence packages', orderReview:'Older test orders', commerceHint:'Open a package to edit it. Fill in a price in any currency; a package with no price is not sold, and the trial is free. Saving updates the License page of every server. Licences are signed by themselves once a payment is confirmed.', shopOrders:'Orders', bankTitle:'Bank transfer (VietQR)', bankHint:'Your account for ordinary transfers: the server shows its VietQR code with the amount and the order note. Mark an order paid when the money is on your statement; unpaid ones end after 7 days.', bankBin:'Bank', bankAccount:'Account number', bankName:'Account name', bankPrefix:'Note starts with', bankClear:'Remove', markPaid:'Mark as paid', cancelOrder:'Cancel', confirmPaid:'Did you see this amount with this note on your bank statement?', noShopOrders:'No orders yet.', 'st-pending':'Waiting for payment', 'st-awaiting-transfer':'Waiting for the transfer', 'st-paid':'Paid', 'st-issued':'Licence issued', 'st-refunded':'Refunded · withdrawn', 'st-failed':'Paid · nothing to change', 'st-cancelled':'Cancelled', 'st-expired':'Ended unpaid', invalidBank:'Check the bank: 6-digit BIN, account number, the account name in capitals.', invalidPackages:'Could not save. Review the package fields and make sure each ID is unique.', commerceUnavailable:'Could not load licence packages.', paid:'Test payment verified', review:'Refund or dispute — review required',
    orderStatus:'Status', allOrders:'All statuses', orderFrom:'From date (Sydney)', orderTo:'To date (Sydney)',
    pendingOrder:'Awaiting test payment', filterOrders:'Apply filters', resetOrders:'Clear filters', exportOrders:'Download filtered CSV',
    ordersLoading:'Loading test orders…', ordersUnavailable:'Could not load test orders.', ordersInvalid:'Enter a valid Sydney date range.',
    noOrders:'No test orders match these filters.', previousOrders:'Previous', nextOrders:'Next', orderPage:'Page',
    hosts:'Servers', real:'Real hosts', test:'Test machines', setups:'First setups', requests:'Licence requests', licences:'Licences', bugs:'Bug reports', security:'Security',
    lastSeen:'Last report', licence:'Licence', version:'Version', players:'Players (most at once / limit)', accounts:'Accounts / characters', health:'Crashes / errors this week', files:'Files', features:'Features',
    none:'None yet.', free:'free (10 players)', issue:'Issue a licence', decline:'Decline', revoke:'Withdraw', undo:'Give back', name:'Name', contact:'Contact', asked:'Players asked', note:'Note', machine:'Computer id', expires:'Last day (empty: none)', maxPlayers:'Players at once', bind:'Only this computer',
    open:'waiting', issued:'issued', declined:'declined', withdrawn:'withdrawn', copy:'Copy file', copied:'Copied', pending:'reports wait for the daily filing as issues', openIssues:'Open the issues',
    makeKey:'Make the licence key', keyMade:'Licence key made', keyHint:'Give this public key to Claude to put into HNMO (licence-pub.pem), once:', devices:'Trusted browsers', forget:'Remove', thisOne:'this browser', saved:'Done.', grace:'over the limit since', uptime:'Up', os:'System', integrity:{ok:'unchanged', modified:'MODIFIED', unsigned:'unsigned build', unknown:'unknown'},
    host:'Host', system:'System', game:'Game', place:'IP and country', autoWithdrawn:'withdrawn by itself', computers:'Computers seen', cloneFlagged:'clone flagged (passive)', manyOk:'more computers allowed', sentTimes:'times sent', oldId:'old id',
    noMuName:'(unnamed server)', noHost:'host not filled in', markTest:'It is a test machine', markReal:'It is a real host', allTest:'Mark every real host here as a test machine', allTestAsk:'Mark all these as your test machines?', details:'Details', firstSetup:'First setup', noReport:'no weekly report yet', latestTitle:'Newest HNMO release', latestHint:'The version HNMO servers are offered (their admin panel shows it with an Update button). Build it first: the package workflow uploads each version to the update storage. Empty version: none offered. The download link may stay empty (the version’s HNMO.zip on the update storage).', latestTag:'Version (1.0.0)', latestUrl:'Download link of the whole folder (optional)', latestNotes:'Notes', save:'Save', machineId:'Machine id', plugins:'plug-ins', reportsSent:'bug reports', none2:'No test machines.' },
  vi: { console:'Quản lý HNMO', pendingRequests:'Yêu cầu giấy phép đang chờ', pendingReports:'Báo lỗi đang chờ', menu:'Các mục', trustHint:'Mỗi lần đăng nhập, trình duyệt được tin cậy thêm 365 ngày. Xóa một trình duyệt để hủy tin cậy và đăng xuất trình duyệt đó.', active:'Đang hoạt động', expired:'Đã hết hạn', unbound:'Bất kỳ máy nào', noExpiry:'Không hết hạn', setupTitle:'Lần đầu: đặt cách đăng nhập', setupHint:'Dán khoá hub (HUB_KEY trong cài đặt site) để chứng minh là anh, rồi chọn mật khẩu khu quản lý. Chỉ hỏi một lần.', hubKey:'Khoá hub (HUB_KEY)', newPassword:'Mật khẩu mới (12 ký tự trở lên)', again:'Nhập lại mật khẩu', setupSave:'Lưu', differ:'Hai mật khẩu khác nhau hoặc ngắn hơn 12 ký tự.', appTitle:'Thêm khu quản lý vào app xác thực', appHint:'Trong Google Authenticator hoặc Microsoft Authenticator: thêm tài khoản, chọn "Nhập khoá thiết lập", đặt tên HNMO console, gõ khoá bên dưới (theo thời gian). Rồi gõ mã 6 số app hiện ra.', appKey:'Khoá:', appLink:'hoặc mở link này trên điện thoại', password:'Mật khẩu', code:'Mã 6 số từ app xác thực (trình duyệt mới)', signIn:'Đăng nhập', wrong:'Sai mật khẩu hoặc mã.', wait:'Thử quá nhiều lần; đợi một giờ.', signOut:'Đăng xuất',
    kindPlan:'Gói', kindAddon:'Mua thêm', kindTrial:'Dùng thử miễn phí', bMonth:'Theo tháng', bYear:'Theo năm', bLifetime:'Mua một lần, vĩnh viễn', bOnce:'Mua một lần', aPlayers:'Thêm người chơi', aUpgrade:'Nâng lên gói khác', aMove:'Chuyển sang máy khác', aSecond:'Máy thứ hai', pkgId:'Mã (chữ, số, gạch ngang)', pkgKind:'Loại', pkgName:'Tên', pkgDesc:'Mô tả', pkgPlayers:'Người chơi cùng lúc', pkgBilling:'Cách trả tiền', pkgOrder:'Thứ tự (nhỏ trước)', seasonsLabel:'Season:', 'season-s6':'Season 6.3', 'season-s9':'Season 9', 'season-arena':'Arena', pkgActive:'Đang bán', pkgHighlight:'Nổi bật', addonKind:'Mua thêm để', addPlayers:'Số người chơi thêm', upgradeTo:'Nâng lên gói', priceVnd:'VND (số đồng)', priceAud:'AUD (đô la, vd 19.90)', priceUsd:'USD (đô la, vd 12.50)', addPackage:'Thêm gói', removePackage:'Xoá gói này', removePackageAsk:'Xoá gói này? Gói sẽ mất khi anh bấm Lưu.', stripeLive:'Thanh toán thẻ: sẵn sàng (đã có khoá thật).', stripeTest:'Thanh toán thẻ: đang dùng khoá thử (không mất tiền thật).', stripeOff:'Thanh toán thẻ: chưa có khoá Stripe (đặt STRIPE_SECRET_KEY và STRIPE_WEBHOOK_SECRET trong cài đặt site rồi deploy).', webhookIs:'Địa chỉ webhook:', stripeMin:'Stripe không nhận thanh toán thẻ dưới khoảng 0,50 AUD hoặc USD, nên thử bằng tiền thật không thể chỉ 1-2 cent.', payosOn:'Đã lưu khoá PayOS', payosOff:'PayOS: chưa có khoá, nút PayOS đang ẩn', payosSite:'Khoá PayOS đang đặt trong cài đặt site', payosHint:'Dán ba khoá từ kênh PayOS của anh (Client ID, API Key, Checksum Key) rồi lưu. Khoá được lưu mã hoá và không hiện lại. Điền địa chỉ webhook bên dưới vào PayOS.', invalidPayos:'Không lưu được khoá PayOS. Kiểm tra lại ba giá trị.', pickBank:'Chọn ngân hàng',
    pkgIdAuto:'(tự đặt theo tên nếu để trống)', aFolders:'Thêm folder server', addFolders:'Số folder thêm', playersShort:'người chơi', daysShort:'ngày', stFree:'Miễn phí', stOff:'Tắt', stOn:'Đang bán', stNoPrice:'Chưa có giá', newPackage:'Gói mới', pricesTitle:'Giá', pricesHint:'Điền giá ở tiền tệ nào cũng được; để trống là không bán bằng tiền tệ đó. Stripe nhận thẻ từ khoảng 0,50 AUD hoặc USD. VND dành cho chuyển khoản (PayOS, VietQR).', advanced:'Nâng cao (mã, thứ tự)', copyPackage:'Nhân bản', statsLine:'{on} đang bán · {none} chưa có giá · {off} đang tắt', previewTitle:'Người mua thấy gì', previewHint:'Trang License của mọi server hiện đúng danh sách này sau khi anh bấm Lưu.', previewPlans:'Gói', previewExtras:'Mua thêm', previewNone:'Chưa gói nào được bán: hãy đặt giá cho một gói.', unsaved:'Có thay đổi chưa lưu', 'tpl-month':'Gói theo tháng', 'tpl-year':'Gói theo năm', 'tpl-lifetime':'Gói vĩnh viễn', 'tpl-players':'Thêm người chơi', 'tpl-folders':'Thêm folder server', 'tpl-second':'Máy thứ hai', 'tpl-upgrade':'Nâng cấp gói', 'tpl-move':'Chuyển sang máy khác', createFromTemplate:'Tạo', newPackageTitle:'Tạo gói mới từ mẫu:', ready:'sẵn sàng', notReady:'chưa cài', paymentTitle:'Cách thanh toán', limitsTitle:'Một folder mỗi máy', limitsHint:'Một licence chạy một folder server trên một máy; gói Thêm folder cho phép nhiều hơn. Các máy miễn phí cùng một địa chỉ công cộng cũng bị cắm cờ.', limitsTurnOn:'Bật', limitsTurnOff:'Tắt', limitsOn:'đang bật', limitsOff:'đang tắt', limitsOnNote:'Bật: server giữ một chỗ cho mỗi folder trên máy của nó; folder thứ hai không có người chơi cho tới khi có chỗ trống.', limitsOffNote:'Tắt khi đang test: ai cũng chạy bao nhiêu folder tùy ý. Hub vẫn ghi nhận và cắm cờ.', flagsTitle:'Cờ (để anh xem xét, không có gì bị chặn tự động)', flagFolders:'Máy {machine} chạy {count} folder, được phép {allowed}', flagAddress:'{count} máy miễn phí dùng chung địa chỉ công cộng {code}', flagAside:'Bỏ qua', noFlags:'Không có cờ.',
    commerce:'Gói giấy phép', orderReview:'Đơn thử nghiệm cũ', commerceHint:'Bấm vào từng gói để sửa. Điền giá ở tiền tệ nào cũng được; gói không có giá thì không bán, gói dùng thử miễn phí. Lưu xong, trang License của mọi server cập nhật theo. Giấy phép tự được ký khi thanh toán được xác nhận.', shopOrders:'Đơn hàng', bankTitle:'Chuyển khoản ngân hàng (VietQR)', bankHint:'Tài khoản nhận chuyển khoản thường: server hiện mã VietQR có sẵn số tiền và nội dung của đơn. Bấm "Đã nhận tiền" khi thấy tiền trong sao kê; đơn chưa trả quá 7 ngày tự hết hạn.', bankBin:'Ngân hàng', bankAccount:'Số tài khoản', bankName:'Tên chủ tài khoản', bankPrefix:'Nội dung bắt đầu bằng', bankClear:'Xoá', markPaid:'Đã nhận tiền', cancelOrder:'Huỷ', confirmPaid:'Anh đã thấy đúng số tiền với nội dung này trong sao kê chưa?', noShopOrders:'Chưa có đơn nào.', 'st-pending':'Chờ thanh toán', 'st-awaiting-transfer':'Chờ chuyển khoản', 'st-paid':'Đã trả tiền', 'st-issued':'Đã cấp giấy phép', 'st-refunded':'Đã hoàn tiền · đã thu hồi', 'st-failed':'Đã trả · không có gì để đổi', 'st-cancelled':'Đã huỷ', 'st-expired':'Hết hạn, chưa trả', invalidBank:'Kiểm tra ngân hàng: mã BIN 6 số, số tài khoản, tên chủ tài khoản viết hoa.', invalidPackages:'Không lưu được. Kiểm tra các trường và đảm bảo mỗi mã gói là duy nhất.', commerceUnavailable:'Không tải được các gói giấy phép.', paid:'Đã xác minh thanh toán thử', review:'Có hoàn tiền hoặc tranh chấp, cần kiểm tra',
    orderStatus:'Trạng thái', allOrders:'Mọi trạng thái', orderFrom:'Từ ngày (giờ Sydney)', orderTo:'Đến ngày (giờ Sydney)',
    pendingOrder:'Đang chờ thanh toán thử', filterOrders:'Lọc đơn', resetOrders:'Xóa bộ lọc', exportOrders:'Tải CSV theo bộ lọc',
    ordersLoading:'Đang tải đơn thử nghiệm…', ordersUnavailable:'Không tải được đơn thử nghiệm.', ordersInvalid:'Nhập khoảng ngày hợp lệ theo giờ Sydney.',
    noOrders:'Không có đơn thử nghiệm nào khớp bộ lọc.', previousOrders:'Trang trước', nextOrders:'Trang sau', orderPage:'Trang',
    hosts:'Server', real:'Máy thật', test:'Máy test', setups:'Cài đặt lần đầu', requests:'Yêu cầu giấy phép', licences:'Giấy phép', bugs:'Báo lỗi', security:'Bảo mật',
    lastSeen:'Báo cáo gần nhất', licence:'Giấy phép', version:'Phiên bản', players:'Người chơi (cao nhất / giới hạn)', accounts:'Tài khoản / nhân vật', health:'Sập / lỗi tuần này', files:'File', features:'Tính năng',
    none:'Chưa có.', free:'miễn phí (10 người)', issue:'Cấp giấy phép', decline:'Từ chối', revoke:'Thu hồi', undo:'Trả lại', name:'Tên', contact:'Liên lạc', asked:'Số người xin', note:'Ghi chú', machine:'Mã máy', expires:'Ngày cuối (trống: không hạn)', maxPlayers:'Số người cùng lúc', bind:'Chỉ máy này',
    open:'đang chờ', issued:'đã cấp', declined:'đã từ chối', withdrawn:'đã thu hồi', copy:'Copy file', copied:'Đã copy', pending:'báo lỗi chờ được chuyển thành issue mỗi ngày', openIssues:'Mở danh sách issue',
    makeKey:'Tạo khóa giấy phép', keyMade:'Đã có khóa giấy phép', keyHint:'Đưa public key này cho Claude để đặt vào HNMO (licence-pub.pem), một lần:', devices:'Trình duyệt tin cậy', forget:'Xóa', thisOne:'trình duyệt này', saved:'Xong.', grace:'vượt giới hạn từ', uptime:'Chạy', os:'Hệ điều hành', integrity:{ok:'nguyên vẹn', modified:'BỊ SỬA', unsigned:'bản chưa ký', unknown:'chưa rõ'},
    host:'Chủ server', system:'Hệ thống', game:'Game', place:'IP và quốc gia', autoWithdrawn:'tự thu hồi', computers:'Các máy đã thấy', cloneFlagged:'nghi nhân bản (chỉ gắn cờ)', manyOk:'cho phép nhiều máy', sentTimes:'lần gửi', oldId:'mã cũ',
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
async function load(background) {
  const next = await api('state');
  // A refresh in the background changes nothing on screen unless the data changed and nobody is busy in the page.
  if (background && state) {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    const busy = document.activeElement && view.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (busy || view.querySelector('details[open]')) { state = next; return; }
  }
  state = next; editing = false;
  document.getElementById('login').hidden = true; document.getElementById('app').hidden = false; document.getElementById('logout').hidden = false;
  const top = window.scrollY;
  render();
  if (background) window.scrollTo(0, top);
}
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
function orderResults(initial) {
  const results = el('div');
  const status = el('select', { id:'order-status' },
    ...[['', 'allOrders'], ['pending', 'pendingOrder'], ['verified', 'paid'], ['review', 'review']]
      .map(([value, label]) => el('option', { value, text:t(label) })));
  const from = el('input', { id:'order-from', type:'date' });
  const to = el('input', { id:'order-to', type:'date' });
  const submit = el('button', { type:'submit', class:'primary', text:t('filterOrders') });
  const clear = el('button', { type:'button', text:t('resetOrders'), on:{ click:() => {
    status.value = from.value = to.value = '';
    loadOrders(1, '');
  } } });
  const download = el('a', { text:t('exportOrders'), download:'' });
  const message = el('p', { role:'status' });
  const previous = el('button', { type:'button', text:t('previousOrders'), on:{ click:() => loadOrders(page - 1, applied) } });
  const next = el('button', { type:'button', text:t('nextOrders'), on:{ click:() => loadOrders(page + 1, applied) } });
  const pagination = el('div', { class:'row' }, previous, next);
  const list = el('ul');
  let page = 1, applied = '';
  let pending = false;
  const field = (label, input) => el('label', {}, t(label), input);
  const form = el('form', { on:{ submit:event => {
    event.preventDefault();
    if (from.value && to.value && from.value > to.value) {
      message.textContent = t('ordersInvalid');
      return;
    }
    const query = new URLSearchParams();
    if (status.value) query.set('status', status.value);
    if (from.value) query.set('from', from.value);
    if (to.value) query.set('to', to.value);
    loadOrders(1, query.toString());
  } } }, el('div', { class:'grid' }, field('orderStatus', status), field('orderFrom', from), field('orderTo', to)),
    el('p', { class:'row' }, submit, clear, download));

  function display(data, number, query) {
    page = number;
    applied = query;
    list.replaceChildren();
    for (const order of data.orders) {
      const { currency, unitAmount, name } = order.package;
      const amount = new Intl.NumberFormat(lang, { style:'currency', currency }).format(currency === 'vnd' ? unitAmount : unitAmount / 100);
      const labels = [when(order.at), name, amount, order.id, t(order.paid ? 'paid' : 'pendingOrder'), order.flagged ? t('review') : ''];
      list.append(el('li', { text:labels.filter(Boolean).join(' · ') }));
    }
    previous.disabled = page === 1;
    next.disabled = !data.hasMore;
    pagination.hidden = page === 1 && !data.hasMore;
    message.textContent = data.orders.length ? t('orderPage') + ' ' + number : t('noOrders');
    download.href = BASE + '/api/licence-orders.csv' + (query ? '?' + query : '');
    download.hidden = data.orders.length === 0;
  }

  async function loadOrders(number, query) {
    if (pending) return;
    pending = true;
    const wasPreviousDisabled = previous.disabled;
    const wasNextDisabled = next.disabled;
    submit.disabled = clear.disabled = previous.disabled = next.disabled = true;
    message.textContent = t('ordersLoading');
    try {
      const params = new URLSearchParams(query);
      params.set('page', String(number));
      const data = await api('licence-orders?' + params.toString());
      display(data, number, query);
    } catch (error) {
      message.textContent = t(error.message === 'filters' ? 'ordersInvalid' : 'ordersUnavailable');
      previous.disabled = wasPreviousDisabled;
      next.disabled = wasNextDisabled;
    } finally {
      pending = false;
      submit.disabled = clear.disabled = false;
    }
  }

  results.append(form, message, list, pagination);
  display(initial, 1, '');
  return results;
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
    const panel = el('div', { 'aria-live':'polite' });
    const SEASONS = ['s6', 's9', 'arena'];
    const BANKS = [['970436','Vietcombank'],['970407','Techcombank'],['970415','VietinBank'],['970418','BIDV'],['970405','Agribank'],['970422','MB Bank'],['970416','ACB'],['970432','VPBank'],['970423','TPBank'],['970403','Sacombank'],['970437','HDBank'],['970441','VIB'],['970443','SHB'],['970431','Eximbank'],['970426','MSB'],['970448','OCB'],['970440','SeABank'],['970449','LPBank'],['970454','Bản Việt (BVBank)'],['970429','SCB'],['970452','KienlongBank'],['970409','Bac A Bank'],['970425','ABBANK'],['970428','Nam A Bank'],['970433','VietBank'],['970427','VietABank'],['970412','PVcomBank'],['970419','NCB'],['970430','PGBank'],['970400','Saigonbank'],['970406','Vikki Bank (DongA Bank)'],['970424','Shinhan Bank'],['970458','UOB'],['970457','Woori Bank'],['963388','Timo'],['546034','CAKE by VPBank'],['546035','Ubank by VPBank']];
    const TEMPLATES = {
      month:    { kind:'plan', billing:'month', durationDays:31, maxPlayers:50, seasons:['s6'], vi:['Gói tháng', 'Tối đa 50 người chơi cùng lúc, nhận mọi bản cập nhật.'], en:['Monthly plan', 'Up to 50 players at once, every update.'] },
      year:     { kind:'plan', billing:'year', durationDays:366, maxPlayers:50, seasons:['s6'], vi:['Gói năm', 'Tối đa 50 người chơi cùng lúc trong 12 tháng, nhận mọi bản cập nhật.'], en:['Yearly plan', 'Up to 50 players at once for 12 months, every update.'] },
      lifetime: { kind:'plan', billing:'lifetime', durationDays:null, maxPlayers:50, seasons:['s6'], vi:['Gói vĩnh viễn', 'Tối đa 50 người chơi cùng lúc, trả một lần, dùng mãi.'], en:['Lifetime plan', 'Up to 50 players at once, paid once, yours for good.'] },
      players:  { kind:'addon', addon:'players', addPlayers:10, vi:['Thêm 10 người chơi', 'Thêm 10 người chơi cùng lúc cho license đang dùng.'], en:['+10 players', '10 more players at once on your licence.'] },
      folders:  { kind:'addon', addon:'folders', addFolders:1, vi:['Thêm 1 folder server', 'Cho chạy thêm 1 folder server cùng lúc trên máy đã có license.'], en:['+1 server folder', 'One more server folder at once on your licensed computer.'] },
      second:   { kind:'addon', addon:'second-machine', maxPlayers:20, vi:['Máy thứ hai', 'License cho máy thứ hai, tối đa 20 người, hết hạn cùng license chính.'], en:['Second computer', 'A licence for a second computer with up to 20 players.'] },
      upgrade:  { kind:'addon', addon:'upgrade', vi:['Nâng cấp gói', 'Nâng lên gói cao hơn cho thời gian còn lại của license.'], en:['Plan upgrade', 'Move to a higher plan for the rest of your licence.'] },
      move:     { kind:'addon', addon:'move', vi:['Chuyển sang máy khác', 'Chuyển license sang máy mới; máy này về bản miễn phí.'], en:['Move to another computer', 'Moves the licence to a new computer.'] },
    };
    const cents = text => { const n = Math.round(parseFloat(String(text).replace(',', '.')) * 100); return Number.isFinite(n) && n > 0 ? n : 0; };
    const dollars = value => value ? (value / 100).toFixed(2) : '';
    const both = (vi, en) => { vi = vi.trim(); en = en.trim(); return { vi:vi || en, en:en || vi }; };
    const slug = text => String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
    const field = (label, input, hint) => el('label', {}, label, input, hint ? el('span', { class:'muted', text:hint }) : null);
    const choice = (options, value) => { const s = el('select'); for (const [v, text] of options) s.append(el('option', { value:v, text })); s.value = value; return s; };
    const check = (label, on) => { const i = el('input', { type:'checkbox' }); i.checked = !!on; return { i, node:el('label', { class:'check' }, i, el('span', { text:label })) }; };
    const badge = (text, cls) => el('span', { class:'badge' + (cls ? ' ' + cls : ''), text });
    const chip = (text, cls) => el('span', { class:'chip' + (cls ? ' ' + cls : ''), text });
    const money = (out, only) => {
      const parts = [];
      if (out.prices.vnd) parts.push(out.prices.vnd.toLocaleString('vi-VN') + ' ₫');
      if (out.prices.aud) parts.push('A$' + (out.prices.aud / 100).toFixed(2));
      if (out.prices.usd) parts.push('US$' + (out.prices.usd / 100).toFixed(2));
      return only ? parts : parts.join(' · ');
    };
    const priced = out => !!(out.prices.vnd || out.prices.aud || out.prices.usd);

    const packageCard = (p, getPlanIds, onRemove, onCopy, onChange) => {
      const f = {
        id: el('input', { maxlength:'40', value:p.id ?? '', placeholder:t('pkgIdAuto') }),
        kind: choice([['plan', t('kindPlan')], ['addon', t('kindAddon')], ['trial', t('kindTrial')]], p.kind),
        nameVi: el('input', { maxlength:'80', value:p.name?.vi ?? '' }), nameEn: el('input', { maxlength:'80', value:p.name?.en ?? '' }),
        descVi: el('textarea', { rows:'2', maxlength:'600' }), descEn: el('textarea', { rows:'2', maxlength:'600' }),
        players: el('input', { type:'number', min:'1', value:String(p.maxPlayers ?? 50) }),
        billing: choice([['month', t('bMonth')], ['year', t('bYear')], ['lifetime', t('bLifetime')]], p.billing === 'once' ? 'lifetime' : (p.billing ?? 'month')),
        vnd: el('input', { inputmode:'numeric', placeholder:'0', value:p.prices?.vnd ? String(p.prices.vnd) : '' }),
        aud: el('input', { inputmode:'decimal', placeholder:'0.00', value:dollars(p.prices?.aud) }),
        usd: el('input', { inputmode:'decimal', placeholder:'0.00', value:dollars(p.prices?.usd) }),
        order: el('input', { type:'number', value:String(p.order ?? 0) }),
        addon: choice([['players', t('aPlayers')], ['folders', t('aFolders')], ['upgrade', t('aUpgrade')], ['move', t('aMove')], ['second-machine', t('aSecond')]], p.addon ?? 'players'),
        addPlayers: el('input', { type:'number', min:'1', value:String(p.addPlayers ?? 10) }),
        addFolders: el('input', { type:'number', min:'1', max:'50', value:String(p.addFolders ?? 1) }),
        upgradeTo: el('select'),
      };
      const fillUpgrade = () => { const keep = f.upgradeTo.value || p.upgradeTo || ''; f.upgradeTo.replaceChildren(...getPlanIds().map(id => el('option', { value:id, text:id }))); f.upgradeTo.value = keep; };
      f.descVi.value = p.description?.vi ?? ''; f.descEn.value = p.description?.en ?? '';
      const seasons = SEASONS.map(s => ({ s, ...check(t('season-' + s), (p.seasons ?? []).includes(s)) }));
      const active = check(t('pkgActive'), p.active !== false), highlight = check(t('pkgHighlight'), p.highlight === true);
      const addonBox = el('div', { class:'grid' }, field(t('addonKind'), f.addon), field(t('addPlayers'), f.addPlayers), field(t('addFolders'), f.addFolders), field(t('upgradeTo'), f.upgradeTo));
      const seasonBox = el('div', { class:'row' }, el('strong', { text:t('seasonsLabel') }), ...seasons.map(x => x.node));
      const sync = () => {
        const addon = f.kind.value === 'addon', which = f.addon.value;
        addonBox.hidden = !addon;
        f.addPlayers.parentElement.hidden = !addon || which !== 'players';
        f.addFolders.parentElement.hidden = !addon || which !== 'folders';
        f.upgradeTo.parentElement.hidden = !addon || which !== 'upgrade';
        f.players.parentElement.hidden = addon && which !== 'second-machine';
        seasonBox.hidden = addon;
        f.billing.parentElement.hidden = f.kind.value === 'trial' || addon;
      };
      const summary = el('summary', { class:'pkg-head' });
      const read = () => {
        const kind = f.kind.value;
        const out = { ...p, id:f.id.value.trim(), kind, name:both(f.nameVi.value, f.nameEn.value), description:both(f.descVi.value, f.descEn.value),
          order:Math.round(Number(f.order.value) || 0), active:active.i.checked, prices:{} };
        const vnd = Math.round(Number(f.vnd.value) || 0); if (vnd > 0) out.prices.vnd = vnd;
        const aud = cents(f.aud.value); if (aud) out.prices.aud = aud;
        const usd = cents(f.usd.value); if (usd) out.prices.usd = usd;
        if (highlight.i.checked) out.highlight = true; else delete out.highlight;
        out.seasons = kind === 'addon' ? (p.seasons ?? []) : seasons.filter(x => x.i.checked).map(x => x.s);
        out.billing = kind === 'trial' ? 'once' : kind === 'addon' ? 'lifetime' : f.billing.value;
        out.durationDays = out.billing === 'month' ? 31 : out.billing === 'year' ? 366 : (kind === 'trial' ? (p.durationDays ?? 14) : null);
        delete out.addon; delete out.addPlayers; delete out.addFolders; delete out.upgradeTo; delete out.maxPlayers;
        if (kind === 'addon') {
          out.addon = f.addon.value;
          if (out.addon === 'players') out.addPlayers = Math.round(Number(f.addPlayers.value) || 0);
          if (out.addon === 'folders') out.addFolders = Math.round(Number(f.addFolders.value) || 0);
          if (out.addon === 'second-machine') out.maxPlayers = Math.round(Number(f.players.value) || 0);
          if (out.addon === 'upgrade') out.upgradeTo = f.upgradeTo.value;
        } else out.maxPlayers = Math.round(Number(f.players.value) || 0);
        return out;
      };
      const facts = out => {
        if (out.kind === 'addon') return [t('kindAddon'), { players:'+' + out.addPlayers + ' ' + t('playersShort'), folders:'+' + out.addFolders + ' folder', upgrade:'→ ' + (out.upgradeTo || '?'), move:t('aMove'), 'second-machine':t('aSecond') + ' · ' + out.maxPlayers + ' ' + t('playersShort') }[out.addon] ?? ''];
        const span = out.kind === 'trial' ? (out.durationDays + ' ' + t('daysShort')) : out.billing === 'month' ? t('bMonth') : out.billing === 'year' ? t('bYear') : t('bLifetime');
        return [out.kind === 'trial' ? t('kindTrial') : t('kindPlan'), out.maxPlayers + ' ' + t('playersShort'), out.seasons.map(s => t('season-' + s).replace('Season ', 'S')).join(' + '), span];
      };
      const refresh = () => {
        const out = read();
        const state = out.kind === 'trial' ? badge(t('stFree'), 'ok') : !out.active ? badge(t('stOff'), 'bad') : priced(out) ? badge(t('stOn'), 'ok') : badge(t('stNoPrice'), 'warn');
        summary.replaceChildren(el('span', { class:'pkg-name', text:(out.name[lang] || out.name.en || t('newPackage')) }),
          el('span', { class:'chips' }, ...facts(out).filter(Boolean).map(x => chip(x))), el('span', { class:'chips' }, ...money(out, true).map(x => chip(x, 'price'))), state);
        sync(); fillUpgrade(); onChange();
      };
      const body = el('div', { class:'pkg-body' },
        el('div', { class:'grid' }, field(t('pkgName') + ' (VI)', f.nameVi), field(t('pkgName') + ' (EN)', f.nameEn), field(t('pkgKind'), f.kind)),
        el('div', { class:'grid' }, field(t('pkgDesc') + ' (VI)', f.descVi), field(t('pkgDesc') + ' (EN)', f.descEn)),
        el('div', { class:'grid' }, field(t('pkgPlayers'), f.players), field(t('pkgBilling'), f.billing)),
        seasonBox, addonBox,
        el('h3', { text:t('pricesTitle') }), el('p', { class:'muted', text:t('pricesHint') }),
        el('div', { class:'grid' }, field(t('priceVnd'), f.vnd), field(t('priceAud'), f.aud), field(t('priceUsd'), f.usd)),
        el('div', { class:'row' }, active.node, highlight.node),
        el('details', {}, el('summary', { text:t('advanced') }), el('div', { class:'grid' }, field(t('pkgId'), f.id), field(t('pkgOrder'), f.order))),
        el('p', { class:'row' }, el('button', { type:'button', text:t('copyPackage'), on:{ click:onCopy } }),
          el('button', { type:'button', class:'danger', text:t('removePackage'), on:{ click:() => { if (confirm(t('removePackageAsk'))) onRemove(); } } })));
      const node = el('details', { class:'card pkg' }, summary, body);
      node.addEventListener('input', refresh); node.addEventListener('change', refresh);
      refresh();
      return { node, read, refresh };
    };

    api('licence-commerce?page=1').then(({ packages, orders, hasMore, shopOrders, bank, payStatus }) => {
      const cards = [];
      const packageList = el('div', { class:'pkg-list' });
      const preview = el('div', { class:'card' });
      const stats = el('p', { class:'muted' });
      const bar = el('p', { class:'muted', role:'status' });
      const planIds = () => cards.map(c => c.read()).filter(o => o.kind === 'plan' && o.id).map(o => o.id);
      const changed = () => {
        const all = cards.map(c => c.read());
        const on = all.filter(o => o.kind !== 'trial' && o.active && priced(o)).length, none = all.filter(o => o.kind !== 'trial' && o.active && !priced(o)).length, off = all.filter(o => !o.active).length;
        stats.textContent = t('statsLine').replace('{on}', on).replace('{none}', none).replace('{off}', off);
        const shown = all.filter(o => o.active && (o.kind === 'trial' || priced(o))).sort((a, b) => a.order - b.order);
        const row = o => el('li', {}, el('strong', { text:(o.name[lang] || o.name.en) + ' ' }), el('span', { class:'muted', text:(o.description[lang] || o.description.en) + ' ' }), el('span', { class:'chips' }, ...(o.kind === 'trial' ? [chip(t('stFree'), 'price')] : money(o, true).map(x => chip(x, 'price')))));
        const plans = shown.filter(o => o.kind !== 'addon'), extras = shown.filter(o => o.kind === 'addon');
        preview.replaceChildren(el('h2', { text:t('previewTitle') }), el('p', { class:'muted', text:t('previewHint') }),
          shown.length ? el('div', {}, plans.length ? el('h3', { text:t('previewPlans') }) : null, plans.length ? el('ul', { class:'list' }, ...plans.map(row)) : null,
            extras.length ? el('h3', { text:t('previewExtras') }) : null, extras.length ? el('ul', { class:'list' }, ...extras.map(row)) : null) : el('p', { class:'warn', text:t('previewNone') }));
        bar.textContent = editing ? t('unsaved') : '';
      };
      const addCard = (p, open) => {
        const c = packageCard(p, planIds, () => { cards.splice(cards.indexOf(c), 1); c.node.remove(); editing = true; changed(); },
          () => { const copy = { ...c.read(), id:'', name:{ vi:c.read().name.vi + ' (2)', en:c.read().name.en + ' (2)' }, order:c.read().order + 1 }; const n = addCard(copy, true); packageList.insertBefore(n.node, c.node.nextSibling); editing = true; changed(); },
          () => { if (editing) bar.textContent = t('unsaved'); changed(); });
        cards.push(c); packageList.append(c.node); if (open) c.node.open = true; return c;
      };
      packages.forEach(p => addCard(p, false));

      const template = choice(Object.keys(TEMPLATES).map(k => [k, t('tpl-' + k)]), 'month');
      const create = el('button', { type:'button', class:'primary', text:t('createFromTemplate'), on:{ click:() => {
        const tpl = TEMPLATES[template.value];
        const base = { id:'', kind:tpl.kind, name:{ vi:tpl.vi[0], en:tpl.en[0] }, description:{ vi:tpl.vi[1], en:tpl.en[1] }, seasons:tpl.seasons ?? [], billing:tpl.billing ?? 'once',
          durationDays:tpl.durationDays ?? null, prices:{}, order:(cards.length + 1) * 10, active:true, addon:tpl.addon, addPlayers:tpl.addPlayers, addFolders:tpl.addFolders, maxPlayers:tpl.maxPlayers };
        const c = addCard(base, true); editing = true; changed(); c.node.scrollIntoView({ block:'nearest' });
      } } });
      const message = el('p', { role:'status' });
      const save = el('button', { type:'submit', class:'primary', text:t('save') });
      const uniqueIds = () => {
        const outs = cards.map(c => c.read()), used = new Set(outs.map(o => o.id).filter(Boolean));
        return outs.map(o => {
          if (o.id) return o;
          let base = slug(o.name.en) || (o.addon ? 'addon' : o.kind), id = base, n = 2;
          while (used.has(id)) id = base + '-' + n++;
          used.add(id); return { ...o, id };
        });
      };
      const form = el('form', { on:{ input:() => { editing = true; changed(); }, submit:async event => {
        event.preventDefault();
        save.disabled = true;
        try {
          const list = uniqueIds();
          await api('licence-commerce', { packages:list });
          cards.forEach((c, i) => { c.node.querySelector('input[maxlength="40"]').value = list[i].id; });
          editing = false; message.textContent = t('saved'); changed();
        } catch {
          message.textContent = t('invalidPackages');
        } finally {
          save.disabled = false;
        }
      } } }, el('p', { text:t('commerceHint') }), stats, packageList,
        el('div', { class:'card toolbar' }, el('div', { class:'row' }, el('strong', { text:t('newPackageTitle') }), template, create)),
        el('div', { class:'savebar' }, save, bar, message));
      changed();

      const status = payStatus ?? {};
      const stripeBox = el('div', { class:'card' }, el('h2', {}, 'Stripe ', badge(status.stripe ? t('ready') : t('notReady'), status.stripe ? 'ok' : 'warn')),
        el('p', { class:'muted', text:status.stripe === 'live' ? t('stripeLive') : status.stripe === 'test' ? t('stripeTest') : t('stripeOff') }),
        el('p', { class:'muted', text:t('webhookIs') + ' ' + location.origin + '/api/licence-stripe' }), el('p', { class:'muted', text:t('stripeMin') }));

      const payosFields = { clientId:el('input', { type:'password', autocomplete:'off' }), apiKey:el('input', { type:'password', autocomplete:'off' }), checksumKey:el('input', { type:'password', autocomplete:'off' }) };
      const payosMessage = el('p', { role:'status' });
      const sendPayos = async value => {
        try { const r = await api('shop-payos', { payos:value }); payosMessage.textContent = t('saved') + ' · ' + (r.payStatus?.payos ? t('payosOn') : t('payosOff')); for (const i of Object.values(payosFields)) i.value = ''; } catch { payosMessage.textContent = t('invalidPayos'); }
      };
      const payosState = status.payos === 'site' ? t('payosSite') : status.payos === 'console' ? t('payosOn') + ' (…' + status.payosClientTail + ')' : t('payosOff');
      const payosBox = el('form', { class:'card', on:{ submit:event => { event.preventDefault(); sendPayos(Object.fromEntries(Object.entries(payosFields).map(([k, i]) => [k, i.value.trim()]))); } } },
        el('h2', {}, 'PayOS ', badge(status.payos ? t('ready') : t('notReady'), status.payos ? 'ok' : 'warn')), el('p', { class:'muted', text:t('payosHint') }), el('p', { text:payosState }),
        el('p', { class:'muted', text:t('webhookIs') + ' ' + location.origin + '/api/licence-payos' }),
        el('div', { class:'grid' }, field('Client ID', payosFields.clientId), field('API Key', payosFields.apiKey), field('Checksum Key', payosFields.checksumKey)),
        el('p', { class:'row' }, el('button', { type:'submit', class:'primary', text:t('save') }), el('button', { type:'button', text:t('bankClear'), on:{ click:() => sendPayos(null) } })), payosMessage);

      const bankSelect = el('select');
      bankSelect.append(el('option', { value:'', text:t('pickBank') }));
      const bankList = BANKS.slice();
      if (bank?.bin && !bankList.some(b => b[0] === bank.bin)) bankList.push([bank.bin, 'BIN ' + bank.bin]);
      for (const [bin, name] of bankList) bankSelect.append(el('option', { value:bin, text:name + ' (' + bin + ')' }));
      bankSelect.value = bank?.bin ?? '';
      const fields = {
        account: el('input', { maxlength:'19', value:bank?.account ?? '' }),
        accountName: el('input', { maxlength:'50', value:bank?.accountName ?? '' }),
        notePrefix: el('input', { maxlength:'8', value:bank?.notePrefix ?? 'HNMO' }),
      };
      const bankMessage = el('p', { role:'status' });
      const sendBank = async value => {
        try { await api('shop-bank', { bank:value }); bankMessage.textContent = t('saved'); } catch { bankMessage.textContent = t('invalidBank'); }
      };
      const bankForm = el('form', { class:'card', on:{ submit:event => { event.preventDefault(); sendBank({ bin:bankSelect.value, ...Object.fromEntries(Object.entries(fields).map(([k, i]) => [k, i.value])) }); } } },
        el('h2', {}, t('bankTitle') + ' ', badge(bank ? t('ready') : t('notReady'), bank ? 'ok' : 'warn')), el('p', { class:'muted', text:t('bankHint') }),
        el('div', { class:'grid' }, field(t('bankBin'), bankSelect), field(t('bankAccount'), fields.account),
          field(t('bankName'), fields.accountName), field(t('bankPrefix'), fields.notePrefix)),
        el('p', { class:'row' }, el('button', { type:'submit', class:'primary', text:t('save') }),
          el('button', { type:'button', text:t('bankClear'), on:{ click:() => sendBank(null) } })), bankMessage);

      const limitsBox = el('div', { class:'card' }, el('h2', { text:t('limitsTitle') }), el('p', { class:'muted', text:t('limitsHint') }), el('p', { class:'muted', text:t('commerceUnavailable') }));
      const drawLimits = state => {
        const toggle = el('button', { type:'button', class:state.enforce ? '' : 'primary', text:state.enforce ? t('limitsTurnOff') : t('limitsTurnOn'), on:{ click:async () => {
          try { drawLimits(await api('limits-enforce', { enforce:!state.enforce }).then(() => api('limits'))); } catch { limitsBox.append(el('p', { class:'bad', text:t('invalidPackages') })); }
        } } });
        const flagText = flag => flag.kind === 'folders'
          ? t('flagFolders').replace('{machine}', flag.subject).replace('{count}', flag.count).replace('{allowed}', flag.allowed)
          : t('flagAddress').replace('{code}', flag.subject).replace('{count}', flag.count);
        const aside = flag => el('button', { type:'button', text:t('flagAside'), on:{ click:async () => { await api('limits-aside', { key:flag.key }); drawLimits(await api('limits')); } } });
        const flags = state.flags.length
          ? el('ul', { class:'list' }, ...state.flags.map(flag => el('li', {}, el('span', { text:flagText(flag) + ' · ' + when(flag.last) + ' ' }), aside(flag))))
          : el('p', { class:'muted', text:t('noFlags') });
        limitsBox.replaceChildren(el('h2', {}, t('limitsTitle') + ' ', badge(state.enforce ? t('limitsOn') : t('limitsOff'), state.enforce ? 'ok' : 'warn')), el('p', { class:'muted', text:t('limitsHint') }),
          el('p', { class:'muted', text:state.enforce ? t('limitsOnNote') : t('limitsOffNote') }), el('p', {}, toggle), el('h3', { text:t('flagsTitle') }), flags);
      };
      api('limits').then(drawLimits).catch(() => {});

      const list = el('ul', { class:'list' });
      if (!shopOrders.length) list.append(el('li', { class:'muted', text:t('noShopOrders') }));
      for (const o of shopOrders) {
        const name = o.name[lang] ?? o.name.en;
        const line = [when(o.at), name, o.amount, o.provider, t('st-' + o.status), o.transferCode, o.machine, o.toMachine ? '→ ' + o.toMachine : '', o.licenceId, o.note].filter(Boolean).join(' · ');
        const item = el('li', { text:line });
        if (o.status === 'awaiting-transfer') {
          const act = (action, ask) => el('button', { type:'button', text:t(action === 'shop-order-paid' ? 'markPaid' : 'cancelOrder'), on:{ click:async () => {
            if (ask && !confirm(t('confirmPaid') + ' · ' + o.amount + ' · ' + o.transferCode)) return;
            await api(action, { order:o.id });
            render();
          } } });
          item.append(' ', act('shop-order-paid', true), ' ', act('shop-order-cancel', false));
        }
        list.append(item);
      }
      panel.replaceChildren(form, preview, el('h2', { text:t('paymentTitle') }), el('div', { class:'methods' }, stripeBox, payosBox, bankForm), limitsBox, el('h2', { text:t('shopOrders') }), list, el('h2', { text:t('orderReview') }), orderResults({ orders, hasMore }));
    }).catch((error) => { console.error(error); panel.textContent = t('commerceUnavailable'); });
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
        l.clone && l.clone.flagged ? el('div', { class:'warn', text:t('cloneFlagged') + (l.clone.reason ? ': ' + l.clone.reason : '') }) : null,
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
  // New requests, reports and servers show up without a reload: when the tab comes back and every two minutes, unless a
  // form on the page has unsaved typing.
  document.getElementById('view').addEventListener('input', () => { editing = true; });
  const refresh = () => { if (document.visibilityState === 'visible' && !document.getElementById('app').hidden && !editing) load(true).catch(() => {}); };
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 120000);
}).catch(() => showLogin());
</script>
</body></html>`;
}
