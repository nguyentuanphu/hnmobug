const languageButton = document.querySelector('[data-language]');
const description = document.querySelector('meta[name="description"]');
const englishDescription = description.content;
const translations = [...document.querySelectorAll('[data-vi], [data-vi-label], [data-vi-alt]')].map(element => ({
  element,
  english: element.textContent,
  label: element.getAttribute('aria-label'),
  alt: element.getAttribute('alt'),
}));

let language = navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
try {
  const saved = localStorage.getItem('hnmo-site-language');
  if (saved === 'en' || saved === 'vi') language = saved;
} catch {}

function applyLanguage() {
  const vietnamese = language === 'vi';
  document.documentElement.lang = language;
  description.content = vietnamese ? description.dataset.viContent : englishDescription;
  languageButton.lang = vietnamese ? 'en' : 'vi';
  languageButton.textContent = vietnamese ? 'English' : 'Tiếng Việt';
  for (const { element, english, label, alt } of translations) {
    if (element.dataset.vi) element.textContent = vietnamese ? element.dataset.vi : english;
    if (element.dataset.viLabel) element.setAttribute('aria-label', vietnamese ? element.dataset.viLabel : label);
    if (element.dataset.viAlt) element.alt = vietnamese ? element.dataset.viAlt : alt;
  }
}

languageButton.hidden = false;
languageButton.addEventListener('click', () => {
  language = language === 'en' ? 'vi' : 'en';
  try { localStorage.setItem('hnmo-site-language', language); } catch {}
  applyLanguage();
});
applyLanguage();

const tourButtons = [...document.querySelectorAll('[data-tour]')];
for (const button of tourButtons) {
  button.addEventListener('click', () => {
    for (const option of tourButtons) {
      option.setAttribute('aria-pressed', String(option === button));
      document.getElementById(option.dataset.tour).hidden = option !== button;
    }
  });
}

document.getElementById('rate-demo')?.addEventListener('submit', event => {
  event.preventDefault();
  document.getElementById('applied-rate').textContent = document.getElementById('demo-rate').value;
});
