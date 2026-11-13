import "server-only";

// Supabase Storage over its REST API. The buckets are private; the secret key bypasses RLS,
// so browsers only ever get short-lived signed URLs.

function storageConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  return { base: `${url.replace(/\/$/, "")}/storage/v1`, key };
}

async function storageFetch(path: string, init: RequestInit): Promise<Response> {
  const { base, key } = storageConfig();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Storage ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

/** A URL the browser can PUT one file to (overwriting it). Valid for 2 hours. */
export async function signUpload(bucket: string, path: string): Promise<string> {
  const response = await storageFetch(`/object/upload/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { "x-upsert": "true" },
  });
  const { url } = (await response.json()) as { url: string };
  return `${storageConfig().base}${url}`;
}

export async function download(bucket: string, path: string): Promise<ArrayBuffer> {
  const response = await storageFetch(`/object/${bucket}/${path}`, { method: "GET" });
  return response.arrayBuffer();
}

/** Deletes every file directly inside `folder`. */
export async function removeFolder(bucket: string, folder: string): Promise<void> {
  const listed = await storageFetch(`/object/list/${bucket}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefix: folder, limit: 1000 }),
  });
  const names = ((await listed.json()) as { name: string }[]).map((item) => `${folder}/${item.name}`);
  if (names.length === 0) return;
  await storageFetch(`/object/${bucket}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefixes: names }),
  });
}
