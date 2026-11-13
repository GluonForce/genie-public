import { sql } from "drizzle-orm";
import { db, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { apiUser, recordable } from "@/lib/requests";
import { signUpload } from "@/lib/storage";

// 10 minutes in 30 s chunks is 20 chunks, plus a few samples left over when the limit stops it
const MAX_CHUNK_INDEX = 20;
const MAX_DURATION_MS = 10 * 60 * 1000 + 1000;

/**
 * A signed URL for uploading audio chunk `index` to audio/{id}/{index}.wav (FR-R2). Also records
 * how many chunks and how much audio the recording has, so Generate knows what to read.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/requests/[id]/audio-upload-url">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { index?: unknown; durationMs?: unknown } | null;
  const index = body?.index;
  const durationMs = body?.durationMs;
  if (
    !isUuid(id) ||
    !Number.isInteger(index) ||
    !Number.isInteger(durationMs) ||
    (index as number) < 0 ||
    (index as number) > MAX_CHUNK_INDEX ||
    (durationMs as number) < 0 ||
    (durationMs as number) > MAX_DURATION_MS
  ) {
    return Response.json({ error: "Invalid chunk." }, { status: 400 });
  }

  const [row] = await db
    .update(prototypes)
    .set({
      audioChunkCount: sql`greatest(${prototypes.audioChunkCount}, ${(index as number) + 1})`,
      recordingDurationMs: sql`greatest(coalesce(${prototypes.recordingDurationMs}, 0), ${durationMs as number})`,
    })
    .where(recordable(user.id, id))
    .returning({ id: prototypes.id });
  if (!row) return Response.json({ error: "This recording can no longer be changed." }, { status: 409 });

  return Response.json({ url: await signUpload("audio", `${id}/${index}.wav`) });
}
