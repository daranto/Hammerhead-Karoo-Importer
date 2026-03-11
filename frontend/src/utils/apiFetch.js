/**
 * Drop-in fetch() wrapper that handles reverse-proxy auth redirects
 * (Authelia, Authentik, nginx auth_request, Caddy forward_auth, …).
 *
 * When an auth proxy intercepts a fetch() call and redirects it to an
 * external login page the browser cannot follow the cross-origin redirect
 * inside fetch() — it would fail with "CORS: no Access-Control-Allow-Origin"
 * because the auth domain has no such header for our origin.
 *
 * Using redirect:'manual' we receive an opaqueredirect response instead,
 * detect it, and reload the full page so the browser can navigate through
 * the auth flow normally — no CORS issue.
 */
export async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    redirect: 'manual',
  });

  if (res.type === 'opaqueredirect') {
    // Auth proxy (Authelia, …) redirected to an external login page.
    // We must NOT use window.location.reload() directly: the PWA service
    // worker would intercept the navigation and serve the cached index.html,
    // so Authelia would never see the request → infinite loop.
    // Unregistering the SW first forces the subsequent navigation to go to
    // the network, where Caddy/Authelia can redirect to the login page.
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.unregister();
    } catch { /* ignore — proceed with reload even if unregister fails */ }
    window.location.reload();
    return new Promise(() => {}); // never resolves — page is navigating away
  }

  return res;
}
