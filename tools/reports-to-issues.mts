// Reports → GitHub issues, run every hour by .github/workflows/reports-to-issues.yml. It reads the reports waiting on
// the hub (HUB_URL/api/reports, with HUB_KEY) and keeps one issue per bug:
//   - a new bug gets an issue (labels hnmo-report, bug, area:<kind>, and licensed or no-licence);
//   - the same bug again (same kind and text) adds its report as a comment, updates the "seen" line (how many times,
//     on how many servers, which versions), and opens the issue again if it was closed;
//   - a licence request gets an issue of its own (label licence-request) with the signing command ready to copy;
//   - once a day, the first run after 9 am Sydney, the issue "Daily summary" (label hnmo-summary) is updated.
// Filed reports are marked done on the hub. Times are Sydney time.
//   HUB_URL=https://… HUB_KEY=… GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node tools/reports-to-issues.mts [--dry] [--summary]
import { createHash } from 'node:crypto';
import { sydneyDay, sydneyTime } from '../netlify/lib/day.mts';
import type { Stored } from '../netlify/lib/report.mts';

export type Pending = Stored & { key: string };
export interface Seen { n: number; servers: string[]; versions: string[]; last: string }
interface Issue { number: number; title: string; body: string | null; state: string; labels: { name: string }[]; updated_at: string; pull_request?: unknown }

// a report's text such as "@admin" would mention a real GitHub account; a zero-width space after every @ never does
export const noMention = (s: string): string => s.replace(/@(?=[A-Za-z0-9])/g, '@​');
export const normalize = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 300);
export const bugKey = (category: string, text: string): string => createHash('sha1').update(`${category}|${normalize(text)}`).digest('hex').slice(0, 16);
export const serverName = (r: Stored): string => r.licensee ? r.licensee : `unlicensed ${r.machine.slice(0, 6)}`;

export function readSeen(body: string | null): Seen | null {
  const m = /<!-- hnmo-seen:(.*?) -->/.exec(body ?? '');
  try { return m ? JSON.parse(m[1]) as Seen : null; } catch { return null; }
}

export function addSeen(seen: Seen | null, r: Stored): Seen {
  const next: Seen = seen ? { ...seen, servers: [...seen.servers], versions: [...seen.versions] } : { n: 0, servers: [], versions: [], last: '' };
  next.n += 1;
  const name = serverName(r);
  if (!next.servers.includes(name)) next.servers.push(name);
  if (r.version && !next.versions.includes(r.version)) next.versions.push(r.version);
  next.last = r.receivedAt;
  return next;
}

export const seenLine = (s: Seen): string =>
  `Seen ${s.n} time${s.n === 1 ? '' : 's'} on ${s.servers.length} server${s.servers.length === 1 ? '' : 's'} (${s.servers.join(', ')}); versions ${s.versions.join(', ') || 'unknown'}; last ${sydneyTime(new Date(s.last))}.`;

export function reportDetails(r: Stored): string {
  const b = r.bug!;
  return [
    `- Server: ${serverName(r)}${r.licenceProblem ? ` (licence ${r.licenceProblem})` : ''} · ${b.server || '?'} · version ${r.version || '?'}`,
    b.place ? `- Place: ${b.place}` : '',
    b.character ? `- Character: ${b.character}` : '',
    `- Report ${b.id || '?'} sent ${b.created || '?'}; received ${sydneyTime(new Date(r.receivedAt))}; owner's status: ${b.status || 'New'}`,
    b.reply ? `- Server owner's answer: ${b.reply}` : '',
    b.info ? `\n<details><summary>Details the game added</summary>\n\n\`\`\`\n${b.info.replace(/```/g, "'''")}\n\`\`\`\n</details>` : '',
  ].filter(Boolean).join('\n');
}

export function bugIssue(r: Stored, key: string, seen: Seen): { title: string; body: string; labels: string[] } {
  const b = r.bug!;
  const first = b.text.split('\n')[0].slice(0, 80);
  return {
    title: noMention(`[${b.category}] ${first}`),
    body: noMention([
      `<!-- hnmo-key:${key} -->`, `<!-- hnmo-seen:${JSON.stringify(seen)} -->`,
      `**Bug report** (${b.category})`, '', `<!-- count -->${seenLine(seen)}<!-- /count -->`, '',
      '> ' + b.text.replace(/\n/g, '\n> '), '', reportDetails(r),
    ].join('\n')),
    labels: ['hnmo-report', 'bug', `area:${b.category}`, r.licensee ? 'licensed' : 'no-licence'],
  };
}

export function withSeen(body: string, seen: Seen): string {
  return body
    .replace(/<!-- hnmo-seen:.*? -->/, `<!-- hnmo-seen:${JSON.stringify(seen)} -->`)
    .replace(/<!-- count -->.*?<!-- \/count -->/, `<!-- count -->${seenLine(seen)}<!-- /count -->`);
}

export function requestIssue(r: Stored): { title: string; body: string; labels: string[] } {
  const q = r.request!;
  const players = q.players || 30;
  return {
    title: noMention(`Licence request: ${q.name}`),
    body: noMention([
      `**Licence request** received ${sydneyTime(new Date(r.receivedAt))}`, '',
      `- Name: ${q.name}`, q.contact ? `- Contact: ${q.contact}` : '', `- Players asked for: ${q.players || 'not said'}`,
      `- Computer id: \`${r.machine}\``, `- Version: ${r.version || '?'}`,
      `- Licence now: ${r.licensee ? `${r.licensee} (valid)` : r.licenceProblem ? `none usable (${r.licenceProblem})` : 'none'}`,
      q.message ? `\n> ${q.message.replace(/\n/g, '\n> ')}` : '', '',
      'Sign it on the HNMO Developer page, or:', '```',
      `client/web/tools/hnmo/sign-license.sh "${q.name.replace(/"/g, "'")}" ${players} - ${r.machine}`, '```',
    ].filter((line) => line !== '').join('\n')),
    labels: ['hnmo-report', 'licence-request'],
  };
}

export function summaryBody(issues: Issue[], day: string, now: Date): string {
  const open = issues.filter((i) => i.state === 'open' && !i.pull_request && i.labels.some((l) => l.name === 'bug'));
  const areas = new Map<string, number>();
  for (const i of open) for (const l of i.labels) if (l.name.startsWith('area:')) areas.set(l.name.slice(5), (areas.get(l.name.slice(5)) ?? 0) + 1);
  const dayAgo = now.getTime() - 24 * 3600 * 1000;
  const recent = issues.filter((i) => !i.pull_request && Date.parse(i.updated_at) >= dayAgo && i.labels.some((l) => l.name === 'bug' || l.name === 'licence-request'));
  return [
    `<!-- hnmo-summary-day:${day} -->`, `**Daily summary** ${day} (updated ${sydneyTime(now)})`, '',
    `Open bugs: ${open.length}${areas.size ? ' (' + [...areas].map(([a, n]) => `${a} ${n}`).join(', ') + ')' : ''}`, '',
    `New or seen again in the last 24 hours (${recent.length}):`,
    ...recent.slice(0, 50).map((i) => `- #${i.number} ${i.title}`),
  ].join('\n');
}

const arg = (name: string) => process.argv.includes(name);

async function main(): Promise<void> {
  const HUB = (process.env.HUB_URL || '').replace(/\/$/, ''), KEY = process.env.HUB_KEY || '';
  const GH = process.env.GITHUB_TOKEN || '', REPO = process.env.GITHUB_REPOSITORY || '', DRY = arg('--dry');
  if (!HUB || !KEY || !GH || !REPO) { console.log('HUB_URL, HUB_KEY, GITHUB_TOKEN and GITHUB_REPOSITORY are needed; nothing done.'); return; }
  const gh = async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    if (DRY && method !== 'GET') { console.log('[dry]', method, path); return {} as T; }
    const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { method, headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`GitHub ${r.status} for ${method} ${path}: ${await r.text()}`);
    return (r.status === 204 ? {} : await r.json()) as T;
  };

  for (const [name, color] of [['hnmo-report', '5319e7'], ['bug', 'd73a4a'], ['licence-request', '0e8a16'], ['licensed', 'c5def5'], ['no-licence', 'fef2c0'], ['hnmo-summary', 'bfdadc'],
    ...['display', 'skill', 'item', 'quest', 'connection', 'other'].map((a) => [`area:${a}`, 'ededed'])]) {
    await gh(`labels/${encodeURIComponent(name)}`).catch(() => gh('labels', 'POST', { name, color }).catch(() => undefined));
  }

  const issues: Issue[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh<Issue[]>(`issues?labels=hnmo-report&state=all&per_page=100&page=${page}`);
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  const byKey = new Map<string, Issue>();
  for (const i of issues) { const m = /<!-- hnmo-key:([0-9a-f]+) -->/.exec(i.body ?? ''); if (m) byKey.set(m[1], i); }

  const hub = await fetch(`${HUB}/api/reports`, { headers: { 'X-Hub-Key': KEY } });
  if (!hub.ok) throw new Error(`hub ${hub.status}`);
  const { reports } = await hub.json() as { reports: Pending[] };
  const done: string[] = [];
  for (const r of reports) {
    if (r.kind === 'bug' && r.bug) {
      const key = bugKey(r.bug.category, r.bug.text);
      const existing = byKey.get(key);
      if (existing) {
        const seen = addSeen(readSeen(existing.body), r);
        await gh(`issues/${existing.number}`, 'PATCH', { body: withSeen(existing.body ?? '', seen), ...(existing.state === 'closed' ? { state: 'open' } : {}) });
        await gh(`issues/${existing.number}/comments`, 'POST', { body: noMention(`Seen again${existing.state === 'closed' ? ' (opened again)' : ''}:\n\n> ${r.bug.text.replace(/\n/g, '\n> ')}\n\n${reportDetails(r)}`) });
        existing.body = withSeen(existing.body ?? '', seen);
        existing.state = 'open';
        existing.updated_at = new Date().toISOString();
      } else {
        const issue = bugIssue(r, key, addSeen(null, r));
        const made = await gh<Issue>('issues', 'POST', issue);
        const created: Issue = { number: made.number ?? 0, title: issue.title, body: issue.body, state: 'open', labels: issue.labels.map((name) => ({ name })), updated_at: new Date().toISOString() };
        byKey.set(key, created);
        issues.push(created);
      }
    } else if (r.kind === 'licence-request' && r.request) {
      const issue = requestIssue(r);
      const made = await gh<Issue>('issues', 'POST', issue);
      issues.push({ number: made.number ?? 0, title: issue.title, body: issue.body, state: 'open', labels: issue.labels.map((name) => ({ name })), updated_at: new Date().toISOString() });
    }
    done.push(r.key);
  }
  if (done.length && !DRY) {
    const ack = await fetch(`${HUB}/api/reports`, { method: 'POST', headers: { 'X-Hub-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) });
    if (!ack.ok) throw new Error(`hub ${ack.status} marking done`);
  }
  console.log(`${reports.length} reports filed.`);

  // The daily summary: the first run after 9 am Sydney (or --summary).
  const now = new Date();
  const day = sydneyDay(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Sydney', hour: '2-digit', hourCycle: 'h23' }).format(now));
  const summary = issues.find((i) => i.labels.some((l) => l.name === 'hnmo-summary'));
  const doneToday = summary && (summary.body ?? '').includes(`<!-- hnmo-summary-day:${day} -->`);
  if (arg('--summary') || (hour >= 9 && !doneToday)) {
    const body = summaryBody(issues, day, now);
    if (summary) await gh(`issues/${summary.number}`, 'PATCH', { body, state: 'open' });
    else await gh('issues', 'POST', { title: 'Daily summary', body, labels: ['hnmo-report', 'hnmo-summary'] });
    console.log('Daily summary updated.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
