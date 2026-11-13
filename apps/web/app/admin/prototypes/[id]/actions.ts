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

const categories = ["unclear", "out_of_scope", "abusive", "duplicate"] as const;

/** Accept the requirements (FR-AD3): the worker picks the prototype up within seconds. */
export async function approvePrototype(id: string): Promise<ActionState> {
  const admin = await ensureUser(await requireAdmin());
  if (!isUuid(id)) return { error: "This request is no longer waiting for review. Reload the page." };
  const approved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(prototypes)
      .set({ status: "approved", statusChangedAt: sql`now()`, reviewedBy: admin.id, reviewedAt: sql`now()` })
      .where(and(eq(prototypes.id, id), eq(prototypes.status, "pending_review")))
      .returning({ userId: prototypes.userId });
    if (!row) return false;
    await tx.insert(events).values({
      actorId: admin.id,
      actorRole: "admin",
      userId: row.userId,
      prototypeId: id,
      action: "approved",
      fromStatus: "pending_review",
      toStatus: "approved",
    });
    return true;
  });
  if (!approved) return { error: "This request is no longer waiting for review. Reload the page." };
  revalidatePath("/admin");
  revalidatePath(`/admin/prototypes/${id}`);
}

/**
 * Decline at review or at QA (FR-AD4, FR-AD9) with a category and a reason the user sees. The
 * user's free prototype stays used (BR-6). The "declined" email comes with Resend (M4.3).
 */
export async function declinePrototype(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await ensureUser(await requireAdmin());
  const category = String(formData.get("category") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!categories.includes(category as (typeof categories)[number])) return { error: "Choose a category." };
  if (reason.length < 10) return { error: "Write a reason for the user (at least 10 characters)." };
  if (reason.length > 2000) return { error: "Keep the reason under 2000 characters." };
  if (!isUuid(id)) return { error: "This request can no longer be declined. Reload the page." };

  const declined = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: prototypes.status })
      .from(prototypes)
      .where(eq(prototypes.id, id))
      .for("update");
    if (current?.status !== "pending_review" && current?.status !== "awaiting_qa") return false;
    const [row] = await tx
      .update(prototypes)
      .set({
        status: "declined",
        statusChangedAt: sql`now()`,
        reviewedBy: admin.id,
        reviewedAt: sql`now()`,
        decisionCategory: category,
        decisionReason: reason,
      })
      .where(eq(prototypes.id, id))
      .returning({ userId: prototypes.userId });
    await tx.insert(events).values({
      actorId: admin.id,
      actorRole: "admin",
      userId: row.userId,
      prototypeId: id,
      action: "declined",
      fromStatus: current.status,
      toStatus: "declined",
      reason,
      details: { category },
    });
    return true;
  });
  if (!declined) return { error: "This request can no longer be declined. Reload the page." };
  revalidatePath("/admin");
  revalidatePath(`/admin/prototypes/${id}`);
}

/** Retry a failed build (FR-AD7): back to the build queue, requirements unchanged. */
export async function retryBuild(id: string): Promise<ActionState> {
  const admin = await ensureUser(await requireAdmin());
  if (!isUuid(id)) return { error: "This build can no longer be retried. Reload the page." };
  const retried = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(prototypes)
      .set({ status: "approved", statusChangedAt: sql`now()` })
      .where(and(eq(prototypes.id, id), eq(prototypes.status, "build_failed")))
      .returning({ userId: prototypes.userId });
    if (!row) return false;
    await tx.insert(events).values({
      actorId: admin.id,
      actorRole: "admin",
      userId: row.userId,
      prototypeId: id,
      action: "build_retried",
      fromStatus: "build_failed",
      toStatus: "approved",
    });
    return true;
  });
  if (!retried) return { error: "This build can no longer be retried. Reload the page." };
  revalidatePath("/admin");
  revalidatePath(`/admin/prototypes/${id}`);
}

/** Take a released prototype offline (FR-AD7): the host shows "not available" within about a minute. */
export async function takeOffline(id: string): Promise<ActionState> {
  const admin = await ensureUser(await requireAdmin());
  if (!isUuid(id)) return { error: "This prototype is no longer live. Reload the page." };
  try {
    const done = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(prototypes)
        .set({ status: "offline", statusChangedAt: sql`now()` })
        .where(and(eq(prototypes.id, id), eq(prototypes.status, "released")))
        .returning({ slug: prototypes.slug, userId: prototypes.userId });
      if (!row) return false;
      if (!row.slug) throw new Error(`Prototype ${id} has no slug`);
      await setSiteState(row.slug, "offline");
      await tx.insert(events).values({
        actorId: admin.id,
        actorRole: "admin",
        userId: row.userId,
        prototypeId: id,
        action: "taken_offline",
        fromStatus: "released",
        toStatus: "offline",
      });
      return true;
    });
    if (!done) return { error: "This prototype is no longer live. Reload the page." };
  } catch (error) {
    console.error("Taking offline failed", error);
    return { error: "Taking it offline failed, so nothing was changed. Try again in a moment." };
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/prototypes/${id}`);
}

/**
 * Put an offline or expired prototype back online. With time left on its link it keeps the
 * original expiry (restore); once the 3 days are over it gets a fresh 3 days (redeploy).
 */
export async function restorePrototype(id: string): Promise<ActionState> {
  const admin = await ensureUser(await requireAdmin());
  if (!isUuid(id)) return { error: "This prototype can no longer be restored. Reload the page." };
  try {
    const done = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: prototypes.status })
        .from(prototypes)
        .where(eq(prototypes.id, id))
        .for("update");
      if (current?.status !== "offline" && current?.status !== "expired") return false;
      const [row] = await tx
        .update(prototypes)
        .set({
          status: "released",
          statusChangedAt: sql`now()`,
          expiresAt: sql`case when ${prototypes.expiresAt} > now() then ${prototypes.expiresAt} else now() + interval '3 days' end`,
        })
        .where(eq(prototypes.id, id))
        .returning({ slug: prototypes.slug, userId: prototypes.userId, expiresAt: prototypes.expiresAt });
      if (!row.slug) throw new Error(`Prototype ${id} has no slug`);
      await setSiteState(row.slug, "live");
      await tx.insert(events).values({
        actorId: admin.id,
        actorRole: "admin",
        userId: row.userId,
        prototypeId: id,
        action: "restored",
        fromStatus: current.status,
        toStatus: "released",
        details: { expires_at: row.expiresAt },
      });
      return true;
    });
    if (!done) return { error: "This prototype can no longer be restored. Reload the page." };
  } catch (error) {
    console.error("Restore failed", error);
    return { error: "Putting it back online failed, so nothing was changed. Try again in a moment." };
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/prototypes/${id}`);
}
