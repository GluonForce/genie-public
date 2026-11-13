import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { db, events, prototypes } from "@/lib/db";
import { removeFolder } from "@/lib/storage";
import { ensureUser, type User } from "@/lib/users";

// Shared by the user's request API routes (/api/requests/…).

/** The signed-in user for an API route, or the error response to send. Admins get 404. */
export async function apiUser(): Promise<User | Response> {
  const session = await getSessionUser();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (session.role === "admin") return Response.json({ error: "Not found." }, { status: 404 });
  return ensureUser(session);
}

/**
 * Generate locks the recording while it runs (BR-5) and unlocks it if it fails. A lock older than
 * this belongs to a run that died (e.g. a server restart), so the user may record or generate again.
 */
export const GENERATE_LOCK_MINUTES = 3;

/** Only the owner, only while recording and not locked by a running Generate. */
export function recordable(userId: string, prototypeId: string) {
  return and(
    eq(prototypes.id, prototypeId),
    eq(prototypes.userId, userId),
    eq(prototypes.status, "recording"),
    or(
      isNull(prototypes.recordingLockedAt),
      lt(
        prototypes.recordingLockedAt,
        sql`now() - make_interval(mins => ${GENERATE_LOCK_MINUTES})`,
      ),
    ),
  );
}

/**
 * Record again (BR-5): forgets the uploaded chunks and deletes them from Storage.
 * Returns false when the recording can no longer be changed.
 */
export async function discardRecording(
  userId: string,
  prototypeId: string,
  ip: string | null,
): Promise<boolean> {
  const discarded = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(prototypes)
      .set({ audioChunkCount: 0, recordingDurationMs: null })
      .where(recordable(userId, prototypeId))
      .returning({ id: prototypes.id });
    if (!row) return false;
    await tx.insert(events).values({
      actorId: userId,
      actorRole: "user",
      userId,
      prototypeId,
      action: "recording_discarded",
      ip,
    });
    return true;
  });
  if (discarded) await removeFolder("audio", prototypeId);
  return discarded;
}

/** Logs a refused action, e.g. a third change request or a second submission (architecture 5.4). */
export async function logBlockedAttempt(
  userId: string,
  prototypeId: string | undefined,
  ip: string | null,
  what: string,
): Promise<void> {
  await db.insert(events).values({
    actorId: userId,
    actorRole: "user",
    userId,
    prototypeId,
    action: "blocked_attempt",
    ip,
    details: { what },
  });
}

/** Only the owner, only while the requirements can still be changed, approved or declined. */
export function reviewable(userId: string, prototypeId: string) {
  return and(
    eq(prototypes.id, prototypeId),
    eq(prototypes.userId, userId),
    eq(prototypes.status, "requirements_ready"),
  );
}
