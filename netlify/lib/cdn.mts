// Public answers that change only when the developer changes them (the licence packages, the latest release) are kept on
// Netlify's CDN for a day and served stale for a week while one function call refreshes them, so servers and website
// visitors don't each run a function (owner, 2026-11-28: as few function calls as possible). Saving them in the console
// purges their tag.
import { purgeCache } from '@netlify/cache';

export const CDN_HEADERS = (tag: string): Record<string, string> => ({
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'public, durable, max-age=86400, stale-while-revalidate=604800',
  'Netlify-Cache-Tag': tag,
  'Cache-Tag': tag,
});

let purger: (tags: string[]) => Promise<void> = async (tags) => {
  // Only a deployed function has the credentials; elsewhere (tests, local runs) there is nothing to purge.
  if (!process.env.NETLIFY && !process.env.SITE_ID) return;
  await purgeCache({ tags });
};

/** Tests record the purges instead. */
export const usePurgerForTests = (fn: ((tags: string[]) => Promise<void>) | null): void => {
  purger = fn ?? (async () => {});
};

/** Purges cached answers by tag; a failure only means they refresh within a day. */
export async function purge(...tags: string[]): Promise<void> {
  try {
    await purger(tags);
  } catch {
    // The CDN copy expires by itself.
  }
}
