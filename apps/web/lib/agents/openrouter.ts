import "server-only";

// OpenRouter settings shared by the agents, named as in internal Genie's core/openrouter.py.

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class ModelError extends Error {}

/** The primary model id followed by the fallback, if one is configured. */
export function modelChain(primary: string | undefined, fallback: string | undefined): string[] {
  return [primary, fallback]
    .map((model) => (model ?? "").trim().replace(/^openrouter:/, ""))
    .filter(Boolean);
}

export async function openrouterPost(path: string, body: unknown): Promise<Response> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ModelError("OPENROUTER_API_KEY is not set");
  return fetch(`${OPENROUTER_BASE_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `status ${response.status}`;
}
