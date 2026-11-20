// Makes the console's settings once, on the developer's computer: node tools/make-secrets.mts
// It asks for the console password (twice) and prints the values to put in Netlify (Site configuration → Environment
// variables) and the key to add to the authenticator app. Nothing is saved or sent anywhere.
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { base32Encode, hashPassword } from '../netlify/lib/auth.mts';

const ask = createInterface({ input: stdin, output: stdout });
const password = await ask.question('Console password (at least 12 characters) / Mật khẩu (ít nhất 12 ký tự): ');
const again = await ask.question('Again / Nhập lại: ');
ask.close();
if (password.length < 12 || password !== again) {
  console.error('The passwords differ or are too short. / Hai mật khẩu khác nhau hoặc quá ngắn.');
  process.exit(1);
}

const totp = base32Encode(randomBytes(20));
const values: [string, string][] = [
  ['CONSOLE_PASSWORD_HASH', hashPassword(password)],
  ['CONSOLE_TOTP_SECRET', totp],
  ['CONSOLE_SLUG', randomBytes(12).toString('hex')],
  ['SESSION_SECRET', randomBytes(32).toString('hex')],
  ['LICENCE_KEY_SECRET', randomBytes(32).toString('hex')],
  ['HUB_KEY', randomBytes(32).toString('hex')],
  ['HUB_SALT', randomBytes(16).toString('hex')],
];
console.log('\nNetlify → Site configuration → Environment variables (mark each as secret):\n');
for (const [name, value] of values) console.log(`${name}=${value}`);
console.log('\nGitHub (this repository) → Settings → Secrets and variables → Actions: HUB_KEY (the same value) and HUB_URL (the site address).');
console.log(`\nAuthenticator app (Google Authenticator, Microsoft Authenticator…): add an account by "Enter a setup key":`);
console.log(`  name: HNMO console   key: ${totp}   type: time based`);
console.log(`  or this link: otpauth://totp/HNMO%20console?secret=${totp}&issuer=HNMO`);
console.log(`\nThe console's address: https://<your site>/c/${values[2][1]}/  (keep it private)`);
