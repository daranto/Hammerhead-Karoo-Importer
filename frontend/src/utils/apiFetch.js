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
    // Auth proxy redirected to an external login page.
    // Reload so the browser handles the redirect as a normal navigation.
    window.location.reload();
    return new Promise(() => {}); // never resolves — page is navigating away
  }

  return res;
}
