// The test orders of the first checkout (before the licence shop, lib/shop.mts): kept so the console can still list them.
export interface Package {
  id: string;
  name: string;
  description: string;
  currency: 'aud' | 'usd' | 'vnd';
  unitAmount: number;
}

export interface Order {
  id: string;
  package: Package;
  at: string;
  sessionId?: string;
}
