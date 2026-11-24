// Owner-facing order views use the Hub's existing test-checkout records.
import { sydneyDay } from './day.mts';
import { listJson, READ_AT_ONCE, type Store } from './hub.mts';
import type { Order, Package } from './licence-purchase.mts';

const statuses = ['pending', 'verified', 'review'] as const;
export type LicenceOrderStatus = typeof statuses[number];
export interface OrderFilters {
  status?: LicenceOrderStatus;
  from?: string;
  to?: string;
}
export interface LicenceOrderRow {
  id: string;
  at: string;
  package: Pick<Package, 'id' | 'name' | 'currency' | 'unitAmount'>;
  paid: boolean;
  flagged: boolean;
}

export const licenceOrderPageSize = 50;

function isDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseLicenceOrderFilters(params: URLSearchParams): OrderFilters | null {
  const status = params.get('status') || undefined;
  const from = params.get('from') || undefined;
  const to = params.get('to') || undefined;
  if ((status && !statuses.some(value => value === status))
      || (from && !isDay(from)) || (to && !isDay(to)) || (from && to && from > to)) return null;
  return { status: status as LicenceOrderStatus | undefined, from, to };
}

export function licenceOrderStatus(row: LicenceOrderRow): LicenceOrderStatus {
  if (row.flagged) return 'review';
  return row.paid ? 'verified' : 'pending';
}

export async function listLicenceOrders(store: Store, filters: OrderFilters, page?: number) {
  const orders = await listJson<Order>(store, 'licence-orders/', Infinity);
  const eligible = orders.filter(order => {
    if (!Number.isFinite(Date.parse(order.at))) return false;
    if (!filters.from && !filters.to) return true;
    const day = sydneyDay(new Date(order.at));
    return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  }).sort((left, right) => right.at.localeCompare(left.at) || left.id.localeCompare(right.id));

  const offset = page === undefined ? 0 : (page - 1) * licenceOrderPageSize;
  const limit = page === undefined ? Infinity : licenceOrderPageSize;
  const candidates = filters.status ? eligible : eligible.slice(offset, offset + limit + 1);
  const rows: LicenceOrderRow[] = [];
  const batchSize = READ_AT_ONCE / 2;
  let matches = filters.status ? 0 : offset;
  for (let start = 0; start < candidates.length; start += batchSize) {
    const batch = await Promise.all(candidates.slice(start, start + batchSize).map(async order => {
      const [payments, flags] = await Promise.all([
        store.list({ prefix: 'licence-payments/' + order.id + '/' }),
        store.list({ prefix: 'licence-payment-flags/' + order.id + '/' }),
      ]);
      const { id, name, currency, unitAmount } = order.package;
      return { id: order.id, at: order.at, package: { id, name, currency, unitAmount },
        paid: payments.blobs.length > 0, flagged: flags.blobs.length > 0 };
    }));
    for (const row of batch) {
      if (filters.status && licenceOrderStatus(row) !== filters.status) continue;
      if (matches++ < offset) continue;
      if (rows.length === limit) return { orders: rows, hasMore: true };
      rows.push(row);
    }
  }
  return { orders: rows, hasMore: false };
}

const exportTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
});

function sydneyTimestamp(iso: string): string {
  const fields = Object.fromEntries(exportTime.formatToParts(new Date(iso)).map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}:${fields.second} ${fields.timeZoneName}`;
}

function csvCell(value: string | number): string {
  const original = String(value);
  const safe = typeof value === 'string' && (/^\s*[=+@-]/u.test(original) || /^[\t\r\n]/u.test(original))
    ? "'" + original : original;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function licenceOrdersCsv(orders: LicenceOrderRow[]): string {
  const header = ['Order ID', 'Created (Australia/Sydney)', 'Package ID', 'Package name', 'Currency',
    'Amount (minor units)', 'Status'];
  const rows = orders.map(row => [row.id, sydneyTimestamp(row.at), row.package.id, row.package.name,
    row.package.currency.toUpperCase(), row.package.unitAmount, licenceOrderStatus(row)]);
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
