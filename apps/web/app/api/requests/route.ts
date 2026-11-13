import { eq } from "drizzle-orm";
import { db, events, prototypes } from "@/lib/db";
import { apiUser, discardRecording, logBlockedAttempt, recordable } from "@/lib/requests";
import { getClientIp } from "@/lib/users";

/**
 * Start recording: creates the user's one prototype in `recording` (BR-1). Starting again while
 * still recording discards the earlier chunks (BR-5). Once requirements exist, a new request is
 * refused (409).
 */
export async function POST() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const ip = await getClientIp();

  const created = await db.transaction(async (tx) => {
    // user_id is unique, so a parallel request or an earlier request inserts nothing
    const [row] = await tx
      .insert(prototypes)
      .values({ userId: user.id })
      .onConflictDoNothing()
      .returning({ id: prototypes.id, status: prototypes.status });
    if (!row) return undefined;
    await tx.insert(events).values({
      actorId: user.id,
      actorRole: "user",
      userId: user.id,
      prototypeId: row.id,
      action: "recording_started",
      toStatus: "recording",
      ip,
    });
    return row;
  });
  if (created) return Response.json(created, { status: 201 });

  const [existing] = await db
    .select({ id: prototypes.id, audioChunkCount: prototypes.audioChunkCount })
    .from(prototypes)
    .where(eq(prototypes.userId, user.id));
  const [stillRecording] = existing
    ? await db
        .select({ id: prototypes.id })
        .from(prototypes)
        .where(recordable(user.id, existing.id))
    : [];
  if (existing && stillRecording) {
    if (existing.audioChunkCount > 0) await discardRecording(user.id, existing.id, ip);
    return Response.json({ id: existing.id, status: "recording" });
  }

  await logBlockedAttempt(user.id, existing?.id, ip, "second_request");
  return Response.json({ error: "You have already used your prototype request." }, { status: 409 });
}
