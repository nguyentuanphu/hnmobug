const copy = {
  en: {
    title: 'Licence packages',
    signIn: 'Sign in',
    mode: 'Checkout is in test mode. No real payment or licence is issued by checkout.',
    empty: 'No packages are available.',
    returned: 'Check your test order with the owner. Returning here does not confirm payment.',
    cancelled: 'Checkout was cancelled.',
    checkout: 'Open Stripe test checkout',
    error: 'The request failed. Please try again.',
  },
  vi: {
    title: 'Gói giấy phép',
    signIn: 'Đăng nhập',
    mode: 'Trang thanh toán đang ở chế độ thử nghiệm. Trang này không thu tiền thật hay cấp giấy phép.',
    empty: 'Chưa có gói giấy phép.',
    returned: 'Kiểm tra đơn thử nghiệm với chủ hệ thống. Việc quay lại đây chưa xác nhận thanh toán.',
    cancelled: 'Đã hủy thanh toán.',
    checkout: 'Mở thanh toán thử qua Stripe',
    error: 'Yêu cầu thất bại. Vui lòng thử lại.',
  },
};

const language = document.querySelector('#language');
const status = document.querySelector('#status');
const packageList = document.querySelector('#packages');
const query = new URLSearchParams(location.search);
const result = query.get('checkout');
const reference = query.get('order') ?? '';
let lang = navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
try {
  const saved = localStorage.getItem('hnmo-site-language');
  if (saved === 'en' || saved === 'vi') lang = saved;
} catch {}
let catalogue = null;
let failure = false;

async function startCheckout(item, button) {
  button.disabled = true;
  try {
    const response = await fetch('/api/licence-packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId: item.id }),
    });
    if (!response.ok) throw new Error('checkout');
    const { url } = await response.json();
    const target = new URL(url);
    if (target.origin !== 'https://checkout.stripe.com') throw new Error('redirect');
    location.assign(target.href);
  } catch {
    status.textContent = copy[lang].error;
    button.disabled = false;
  }
}

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
    : result === 'returned' ? strings.returned + (/^[a-f0-9-]{36}$/.test(reference) ? ' ' + reference : '')
    : result === 'cancelled' ? strings.cancelled
    : catalogue?.packages.length === 0 ? strings.empty : '';
  packageList.replaceChildren();
  for (const item of catalogue?.packages ?? []) {
    const card = document.createElement('article');
    const name = document.createElement('h2');
    const description = document.createElement('p');
    const price = document.createElement('p');
    name.textContent = item.name;
    description.textContent = item.description;
    price.textContent = new Intl.NumberFormat(lang, { style: 'currency', currency: item.currency })
      .format(item.currency === 'vnd' ? item.unitAmount : item.unitAmount / 100);
    card.append(name, description, price);
    if (catalogue.testCheckout) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button primary';
      button.textContent = strings.checkout;
      button.addEventListener('click', () => startCheckout(item, button));
      card.append(button);
    }
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
