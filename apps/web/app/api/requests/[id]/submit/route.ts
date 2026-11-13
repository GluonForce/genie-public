import { sql } from "drizzle-orm";
import { db, events, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { apiUser, logBlockedAttempt, reviewable } from "@/lib/requests";
import { getClientIp } from "@/lib/users";

/**
 * The user approves the requirements (FR-G6): they are locked (BR-14) and go to the admins for
 * review. The IP is logged and flagged when another account has used the same IP (BR-7).
 * The "request received" email comes with Resend (M4.3).
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/requests/[id]/submit">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const ip = await getClientIp();

  const submitted = await db.transaction(async (tx) => {
    // Other accounts seen on any IP of this user, including the one submitting now (architecture 5.4)
    const matches = await tx.execute<{ user_id: string }>(sql`
      select distinct e2.user_id from events e2
      where e2.user_id <> ${user.id}
        and e2.ip in (
          select ip from events where user_id = ${user.id} and ip is not null
          union select ${ip}::inet where ${ip}::inet is not null
        )`);
    const matchIds = [...matches].map((row) => row.user_id);

    const [row] = await tx
      .update(prototypes)
      .set({
        status: "pending_review",
        statusChangedAt: sql`now()`,
        submittedAt: sql`now()`,
        ipFlagged: matchIds.length > 0,
      })
      .where(reviewable(user.id, id))
      .returning({ id: prototypes.id });
    if (!row) return false;
    await tx.insert(events).values({
      actorId: user.id,
      actorRole: "user",
      userId: user.id,
      prototypeId: id,
      action: "submitted",
      fromStatus: "requirements_ready",
      toStatus: "pending_review",
      ip,
      details: { ip_flag_matches: matchIds },
    });
    return true;
  });

  if (!submitted) {
    await logBlockedAttempt(user.id, id, ip, "second_submission");
    return Response.json({ error: "These requirements have already been sent." }, { status: 409 });
  }
  return new Response(null, { status: 204 });
}
