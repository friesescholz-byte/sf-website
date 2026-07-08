export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // Redirect root "/" to "/admin.html" on pages.dev/localhost
  if ((hostname.includes('friesescholzwebdesign.pages.dev') || hostname.includes('localhost') || hostname.includes('127.0.0.1')) && url.pathname === '/') {
    return Response.redirect(`${url.origin}/admin.html`, 302);
  }

  return await context.next();
}
