// /login (and /admin): a short, easy way in. It sends the browser to the console's hidden path, which is kept only in
// the site setting CONSOLE_SLUG (never in the code or the public pages). The console still asks for the password and the
// authenticator code, so this link only saves typing the long path.
export default async (req: Request) => {
  const slug = process.env.CONSOLE_SLUG || '';
  if (slug.length < 12) return new Response('Not configured.', { status: 404 });
  return Response.redirect(new URL(`/c/${slug}/`, req.url).toString(), 302);
};

export const config = { path: ['/login', '/admin'] };
