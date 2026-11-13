import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { previewUrl } from "@/lib/prototype-host";

// "Open preview" for admins: redirects to the prototype with a 15-minute signed token
// (architecture section 6). The host swaps the token for a cookie on the first visit.
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/requests/[id]/preview">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const [prototype] = await db
    .select({ slug: prototypes.slug, siteUrl: prototypes.siteUrl })
    .from(prototypes)
    .where(eq(prototypes.id, id));
  if (!prototype?.slug || !prototype.siteUrl) {
    return new Response("This prototype has not been built yet", { status: 404 });
  }
  return Response.redirect(previewUrl(prototype.siteUrl, prototype.slug), 302);
}
