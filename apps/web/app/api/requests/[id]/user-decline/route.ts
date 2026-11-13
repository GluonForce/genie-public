import { sql } from "drizzle-orm";
import { db, events, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { apiUser, reviewable } from "@/lib/requests";
import { getClientIp } from "@/lib/users";

/** The user declines the requirements (FR-G7): the request ends and the free prototype is used (BR-6). */
export async function POST(request: Request, { params }: RouteContext<"/api/requests/[id]/user-decline">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() || null : null;
  if (reason && reason.length > 2000) {
    return Response.json({ error: "Keep the reason under 2000 characters." }, { status: 400 });
  }
  const ip = await getClientIp();

  const declined = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(prototypes)
      .set({ status: "user_declined", statusChangedAt: sql`now()`, userDeclineReason: reason })
      .where(reviewable(user.id, id))
      .returning({ id: prototypes.id });
    if (!row) return false;
    await tx.insert(events).values({
      actorId: user.id,
      actorRole: "user",
      userId: user.id,
      prototypeId: id,
      action: "user_declined",
      fromStatus: "requirements_ready",
      toStatus: "user_declined",
      ip,
      reason,
    });
    return true;
  });
  if (!declined) {
    return Response.json({ error: "These requirements can no longer be declined." }, { status: 409 });
  }
  return new Response(null, { status: 204 });
}
