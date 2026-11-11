/**
 * Prototype host (architecture section 8). Serves R2 `sites/{slug}/` at `{slug}.<PROTO_BASE_DOMAIN>`
 * according to the prototype's state in KV, which the worker and the web app set:
 *   preview  admins only, with a signed token (first as ?token=, then as a cookie)
 *   live     anyone with the link
 *   expired  "this prototype has expired" page
 *   offline  or missing: "unavailable" page
 */

interface Env {
  SITES: R2Bucket;
  STATE: KVNamespace;
  PROTO_BASE_DOMAIN: string;
  APP_URL: string;
  PREVIEW_TOKEN_SECRET: string;
}

// NFR-6: prototypes may not call any other origin
const CSP =
  "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; " +
  "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'";
const PREVIEW_COOKIE = "genie_preview";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return withHeaders(new Response("Method not allowed", { status: 405 }));
    }
    const url = new URL(request.url);
    const slug = slugFromHost(url.hostname, env.PROTO_BASE_DOMAIN);
    const state = slug ? await env.STATE.get(slug) : null;

    if (slug && state === "live") return serve(request, env, slug, url, false);
    if (slug && state === "preview") return servePreview(request, env, slug, url);
    if (state === "expired") return expiredPage(env);
    return unavailablePage();
  },
} satisfies ExportedHandler<Env>;

/** `habit-tracker-0tb1te.localhost:8787` → `habit-tracker-0tb1te`; anything else → null. */
function slugFromHost(hostname: string, baseDomain: string): string | null {
  const base = baseDomain.split(":")[0];
  if (!hostname.endsWith(`.${base}`)) return null;
  const slug = hostname.slice(0, -(base.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ? slug : null;
}

async function servePreview(request: Request, env: Env, slug: string, url: URL) {
  const fromQuery = url.searchParams.get("token");
  if (fromQuery !== null) {
    const expires = await verifyToken(env, slug, fromQuery);
    if (expires === null) return unavailablePage();
    // Swap the token for a cookie on this subdomain only, so it doesn't stay in the address bar
    url.searchParams.delete("token");
    const secure = url.protocol === "https:" ? "; Secure" : "";
    const maxAge = expires - Math.floor(Date.now() / 1000);
    return withHeaders(
      new Response(null, {
        status: 302,
        headers: {
          location: url.pathname + url.search,
          "set-cookie": `${PREVIEW_COOKIE}=${fromQuery}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
          "cache-control": "no-store",
        },
      }),
    );
  }
  const fromCookie = readCookie(request, PREVIEW_COOKIE);
  if (fromCookie === null || (await verifyToken(env, slug, fromCookie)) === null) {
    // The same answer as an unknown slug, so a preview's existence isn't revealed
    return unavailablePage();
  }
  return serve(request, env, slug, url, true);
}

/**
 * Token = `{expiresUnixSeconds}.{hex HMAC-SHA256(secret, "{slug}.{expires}")}`.
 * Returns the expiry when valid. The web app mints these for admins (M3.4).
 */
async function verifyToken(env: Env, slug: string, token: string): Promise<number | null> {
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match || !env.PREVIEW_TOKEN_SECRET) return null;
  const expires = Number(match[1]);
  if (expires <= Math.floor(Date.now() / 1000)) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.PREVIEW_TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = Uint8Array.from(match[2].match(/../g)!, (byte) => parseInt(byte, 16));
  // subtle.verify compares in constant time
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(`${slug}.${expires}`),
  );
  return valid ? expires : null;
}

async function serve(request: Request, env: Env, slug: string, url: URL, preview: boolean) {
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return notFound(request, env, slug, preview);
  }
  if (path.split("/").some((part) => part === "..")) return notFound(request, env, slug, preview);

  const prefix = `sites/${slug}`;
  let key: string;
  if (path.endsWith("/")) {
    key = `${prefix}${path}index.html`;
  } else if (/\.[a-z0-9]+$/i.test(path)) {
    key = `${prefix}${path}`;
  } else {
    // The export uses trailing slashes: /about is the folder /about/
    if (await env.SITES.head(`${prefix}${path}/index.html`)) {
      return withHeaders(
        new Response(null, { status: 308, headers: { location: `${path}/${url.search}` } }),
      );
    }
    key = `${prefix}${path}`;
  }

  const object = await env.SITES.get(key);
  if (!object) return notFound(request, env, slug, preview);
  return fileResponse(request, object, path, 200, preview);
}

async function notFound(request: Request, env: Env, slug: string, preview: boolean) {
  const page = await env.SITES.get(`sites/${slug}/404.html`);
  if (!page) return withHeaders(new Response("Not found", { status: 404 }));
  return fileResponse(request, page, "/404.html", 404, preview);
}

function fileResponse(
  request: Request,
  object: R2ObjectBody,
  path: string,
  status: number,
  preview: boolean,
): Response {
  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
    etag: object.httpEtag,
    // Build output under _next/static has content-hashed names, so it never changes
    "cache-control": path.startsWith("/_next/static/")
      ? "public, max-age=31536000, immutable"
      : preview
        ? "private, no-cache"
        : "no-cache",
  });
  const body = request.method === "HEAD" ? null : object.body;
  return withHeaders(new Response(body, { status, headers }));
}

function withHeaders(response: Response): Response {
  response.headers.set("content-security-policy", CSP);
  response.headers.set("x-robots-tag", "noindex, nofollow");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function expiredPage(env: Env): Response {
  return messagePage(
    410,
    "This prototype has expired",
    `Prototypes stay online for 3 days after release. <a href="${env.APP_URL}/sign-in">Sign in to Genie</a> to see your request.`,
  );
}

function unavailablePage(): Response {
  return messagePage(404, "This prototype is not available", "Check the link, or ask the person who sent it.");
}

function messagePage(status: number, title: string, text: string): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fdf0ec;color:#14213d;font:18px/1.5 system-ui,sans-serif}
main{max-width:520px;padding:32px 24px}h1{font-size:32px;line-height:1.15;margin:0 0 12px}a{color:#14213d;font-weight:700}
</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;
  return withHeaders(
    new Response(html, {
      status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    }),
  );
}
