import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { download } from "@/lib/storage";

/** The latest build's source as the worker saved it (FR-AD7, `sources/{id}.tar.gz`). */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/requests/[id]/source">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  const [prototype] = await db
    .select({ slug: prototypes.slug, attempts: prototypes.buildAttempts })
    .from(prototypes)
    .where(eq(prototypes.id, id));
  if (!prototype?.attempts) return new Response(null, { status: 404 });

  let archive: ArrayBuffer;
  try {
    archive = await download("sources", `${id}.tar.gz`);
  } catch (error) {
    console.error("Source download failed", error);
    return new Response(null, { status: 404 });
  }
  return new Response(archive, {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${prototype.slug ?? id}-source.tar.gz"`,
      "cache-control": "private, no-store",
    },
  });
}
