import "server-only";
import { createHmac } from "node:crypto";

// Talks to the prototype host (infra/proto-host): signed preview links, and each
// prototype's state in Workers KV, which the host reads on every request.

export type SiteState = "preview" | "live" | "expired" | "offline";

const PREVIEW_MINUTES = 15;

/**
 * The prototype's URL with a short-lived admin token. Same format the host checks:
 * `{expires}.{hex HMAC-SHA256(PREVIEW_TOKEN_SECRET, "{slug}.{expires}")}`.
 */
export function previewUrl(siteUrl: string, slug: string): string {
  const secret = process.env.PREVIEW_TOKEN_SECRET;
  if (!secret) throw new Error("PREVIEW_TOKEN_SECRET is not set (see apps/web/.env.example)");
  const expires = Math.floor(Date.now() / 1000) + PREVIEW_MINUTES * 60;
  const signature = createHmac("sha256", secret).update(`${slug}.${expires}`).digest("hex");
  const url = new URL(siteUrl);
  url.searchParams.set("token", `${expires}.${signature}`);
  return url.toString();
}

/** Sets what the host serves for this slug. Takes effect within about 60 seconds. */
export async function setSiteState(slug: string, state: SiteState): Promise<void> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespace = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !namespace || !token) {
    throw new Error("Cloudflare KV is not configured (see apps/web/.env.example)");
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: state,
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Setting ${slug} to ${state} failed: ${response.status} ${await response.text()}`);
  }
}
