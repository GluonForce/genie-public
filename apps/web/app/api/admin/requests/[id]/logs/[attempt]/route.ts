import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { download } from "@/lib/storage";

/** One build attempt's log (FR-AD6): outcome, checks and the agent conversation, as JSON lines. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/admin/requests/[id]/logs/[attempt]">,
) {
  await requireAdmin();
  const { id, attempt } = await params;
  if (!isUuid(id) || !/^[1-9]\d{0,2}$/.test(attempt)) return new Response(null, { status: 404 });
  const [prototype] = await db
    .select({ slug: prototypes.slug, attempts: prototypes.buildAttempts })
    .from(prototypes)
    .where(eq(prototypes.id, id));
  if (!prototype || Number(attempt) > prototype.attempts) return new Response(null, { status: 404 });

  let log: ArrayBuffer;
  try {
    log = await download("logs", `${id}/${attempt}.jsonl`);
  } catch (error) {
    console.error("Build log download failed", error);
    return new Response(null, { status: 404 });
  }
  return new Response(log, {
    headers: {
      "content-type": "application/x-ndjson",
      "content-disposition": `attachment; filename="${prototype.slug ?? id}-attempt-${attempt}.jsonl"`,
      "cache-control": "private, no-store",
    },
  });
}
