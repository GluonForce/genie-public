"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db, events, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { setSiteState } from "@/lib/prototype-host";
import { ensureUser } from "@/lib/users";

export type ActionState = { error: string } | undefined;

const NOT_WAITING = "This prototype is no longer waiting for QA. Reload the page.";

/**
 * QA passed (FR-AD9): live for anyone with the link for 3 days (BR-12). The status change, the
 * KV switch and the event happen together; if Cloudflare fails, nothing is changed.
 * The "your prototype is ready" email comes with Resend (M4.3).
 */
export async function releasePrototype(id: string): Promise<ActionState> {
  const admin = await ensureUser(await requireAdmin());
  if (!isUuid(id)) return { error: NOT_WAITING };
  try {
    const released = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(prototypes)
        .set({
          status: "released",
          statusChangedAt: sql`now()`,
          releasedBy: admin.id,
          releasedAt: sql`now()`,
          expiresAt: sql`now() + interval '3 days'`,
        })
        .where(and(eq(prototypes.id, id), eq(prototypes.status, "awaiting_qa")))
        .returning({ slug: prototypes.slug, userId: prototypes.userId, expiresAt: prototypes.expiresAt });
      if (!row?.slug) return false;
      await setSiteState(row.slug, "live");
      await tx.insert(events).values({
        actorId: admin.id,
        actorRole: "admin",
        userId: row.userId,
        prototypeId: id,
        action: "released",
        fromStatus: "awaiting_qa",
        toStatus: "released",
        details: { expires_at: row.expiresAt },
      });
      return true;
    });
    if (!released) return { error: NOT_WAITING };
  } catch (error) {
    console.error("Release failed", error);
    return { error: "Releasing failed, so nothing was changed. Try again in a moment." };
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/prototypes/${id}`);
}

/**
 * QA failed (FR-AD9): back to the build queue with the admin's note for the agent. The worker
 * picks it up within seconds; the requirements stay unchanged (BR-14).
 */
export async function rebuildPrototype(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await ensureUser(await requireAdmin());
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return { error: "Describe what is broken, so the rebuild can fix it." };
  if (note.length > 2000) return { error: "Keep the note under 2000 characters." };
  if (!isUuid(id)) return { error: NOT_WAITING };

  const requeued = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(prototypes)
      .set({ status: "approved", statusChangedAt: sql`now()`, buildNote: note })
      .where(and(eq(prototypes.id, id), eq(prototypes.status, "awaiting_qa")))
      .returning({ userId: prototypes.userId });
    if (!row) return false;
    await tx.insert(events).values({
      actorId: admin.id,
      actorRole: "admin",
      userId: row.userId,
      prototypeId: id,
      action: "rebuild_requested",
      fromStatus: "awaiting_qa",
      toStatus: "approved",
      reason: note,
    });
    return true;
  });
  if (!requeued) return { error: NOT_WAITING };
  revalidatePath("/admin");
  revalidatePath(`/admin/prototypes/${id}`);
}
