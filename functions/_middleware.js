export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // Redirect /wp-admin and /wp-login.php to /admin.html (Bot troll)
  if (url.pathname.startsWith('/wp-admin') || url.pathname === '/wp-login.php') {
    return Response.redirect(`${url.origin}/admin.html`, 302);
  }

  // Redirect root "/" to "/admin.html" on pages.dev/localhost
  if ((hostname.includes('friesescholzwebdesign.pages.dev') || hostname.includes('localhost') || hostname.includes('127.0.0.1')) && url.pathname === '/') {
    return Response.redirect(`${url.origin}/admin.html`, 302);
  }

  return await context.next();
}
