// The licence packages, as every HNMO server's License page shows them. Buying happens on that page (it knows the
// computer); this page only lists them and greets a host back from a payment page.
const copy = {
  en: {
    title: 'Licence packages',
    signIn: 'Sign in',
    mode: 'Buy from the License page of your HNMO admin panel: it knows your computer, and the licence arrives there by itself.',
    empty: 'No packages are on sale yet.',
    paid: 'Thank you. Go back to your admin panel: the licence arrives by itself within a minute.',
    cancelled: 'The payment was cancelled. Nothing was charged.',
    free: 'Free',
    players: 'players',
    error: 'The packages could not be loaded. Please try again.',
  },
  vi: {
    title: 'Gói giấy phép',
    signIn: 'Đăng nhập',
    mode: 'Mua ở trang License trong admin panel HNMO của bạn: trang đó biết máy của bạn, và giấy phép tự về đó.',
    empty: 'Chưa có gói nào đang bán.',
    paid: 'Cảm ơn bạn. Quay lại admin panel: giấy phép tự về trong khoảng một phút.',
    cancelled: 'Đã huỷ thanh toán. Không có khoản nào bị trừ.',
    free: 'Miễn phí',
    players: 'người chơi',
    error: 'Không tải được các gói. Vui lòng thử lại.',
  },
};

const language = document.querySelector('#language');
const status = document.querySelector('#status');
const packageList = document.querySelector('#packages');
const result = new URLSearchParams(location.search).get('checkout');
let lang = navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
try {
  const saved = localStorage.getItem('hnmo-site-language');
  if (saved === 'en' || saved === 'vi') lang = saved;
} catch {}
let catalogue = null;
let failure = false;

const money = (amount, currency) => new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-AU', { style: 'currency', currency })
  .format(currency === 'vnd' ? amount : amount / 100);

function render() {
  const strings = copy[lang];
  document.documentElement.lang = lang;
  document.title = strings.title + ' · HNMO';
  document.querySelector('#sign-in').textContent = strings.signIn;
  document.querySelector('#title').textContent = strings.title;
  document.querySelector('#mode').textContent = strings.mode;
  language.lang = lang === 'en' ? 'vi' : 'en';
  language.textContent = lang === 'en' ? 'Tiếng Việt' : 'English';
  status.textContent = failure ? strings.error
    : result === 'paid' ? strings.paid
    : result === 'cancelled' ? strings.cancelled
    : catalogue?.packages.length === 0 ? strings.empty : '';
  packageList.replaceChildren();
  for (const item of catalogue?.packages ?? []) {
    const card = document.createElement('article');
    if (item.highlight) card.className = 'highlight';
    const name = document.createElement('h2');
    const description = document.createElement('p');
    const price = document.createElement('p');
    name.textContent = item.name?.[lang] ?? item.name?.en ?? item.id;
    description.textContent = item.description?.[lang] ?? item.description?.en ?? '';
    const prices = Object.entries(item.prices ?? {}).map(([currency, amount]) => money(amount, currency));
    price.textContent = item.kind === 'trial' ? strings.free : prices.join(' · ');
    card.append(name, description, price);
    packageList.append(card);
  }
}

language.hidden = false;
language.addEventListener('click', () => {
  lang = lang === 'vi' ? 'en' : 'vi';
  try { localStorage.setItem('hnmo-site-language', lang); } catch {}
  render();
});
render();
fetch('/api/licence-packages').then(async response => {
  if (!response.ok) throw new Error('catalogue');
  catalogue = await response.json();
}).catch(() => {
  failure = true;
}).finally(render);
