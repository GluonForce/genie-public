import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { download } from "@/lib/storage";
import { encodeWav, joinSamples } from "@/lib/wav";

const WAV_HEADER_BYTES = 44;
const SAMPLE_RATE = 16000;

/** The whole recording as one WAV for the admin review player (FR-AD2): the chunks joined in order. */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/requests/[id]/audio">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  const [prototype] = await db
    .select({ chunks: prototypes.audioChunkCount })
    .from(prototypes)
    .where(eq(prototypes.id, id));
  if (!prototype?.chunks) return new Response(null, { status: 404 });

  const chunks = await Promise.all(
    Array.from({ length: prototype.chunks }, (_, index) => download("audio", `${id}/${index}.wav`)),
  );
  // Every chunk was written by lib/wav.ts, so its samples start right after the 44-byte header
  const wav = encodeWav(joinSamples(chunks.map((chunk) => new Int16Array(chunk.slice(WAV_HEADER_BYTES)))), SAMPLE_RATE);
  return new Response(wav, { headers: { "content-type": "audio/wav", "cache-control": "private, no-store" } });
}
