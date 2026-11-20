// Days and times in Sydney time (the HNMO developer's rule).
export const sydneyDay = (at: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
export const sydneyTime = (at: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }).format(at) + ' Sydney';
