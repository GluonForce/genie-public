import "server-only";
import { isIP } from "node:net";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { SessionUser } from "@/lib/auth";
import { db, events, users } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";

export type User = typeof users.$inferSelect;

export type EnsureUserResult =
  | { status: "ok"; user: User }
  // Another active account already uses this normalised email (BR-1 to BR-3)
  | { status: "email_taken" };

/**
 * Makes sure the signed-in Clerk user has a row in `users`. On the first visit
 * after sign-up it creates the row and logs a `signup` event with the visitor's
 * IP (FR-A2). If the email belongs to a deleted account, that row is relinked
 * so the used quota comes back with it.
 */
export async function ensureUser(session: SessionUser): Promise<EnsureUserResult> {
  const existing = await findByClerkId(session.userId);
  if (existing) return { status: "ok", user: existing };

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) throw new Error(`Clerk user ${session.userId} has no primary email`);

  const emailNormalized = normalizeEmail(email);
  const ip = await getClientIp();

  const user = await db.transaction(async (tx) => {
    const [sameEmail] = await tx
      .select()
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized));

    let row: User | undefined;
    if (!sameEmail) {
      // onConflictDoNothing: a parallel request may have created the row first
      [row] = await tx
        .insert(users)
        .values({ clerkUserId: session.userId, email, emailNormalized, role: session.role, signupIp: ip })
        .onConflictDoNothing()
        .returning();
    } else if (sameEmail.deletedAt) {
      [row] = await tx
        .update(users)
        .set({ clerkUserId: session.userId, email, role: session.role, deletedAt: null })
        .where(eq(users.id, sameEmail.id))
        .returning();
    }
    if (!row) return undefined;

    await tx.insert(events).values({
      actorId: row.id,
      actorRole: row.role === "admin" ? "admin" : "user",
      userId: row.id,
      action: "signup",
      ip,
      details: sameEmail ? { relinked: true } : null,
    });
    return row;
  });

  if (user) return { status: "ok", user };

  // Nothing was written: either a parallel request created our row, or the
  // email belongs to another active account.
  const createdMeanwhile = await findByClerkId(session.userId);
  return createdMeanwhile ? { status: "ok", user: createdMeanwhile } : { status: "email_taken" };
}

async function findByClerkId(clerkUserId: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
  return row;
}

/** The visitor's IP from the proxy headers, or null if missing or malformed. */
async function getClientIp(): Promise<string | null> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() ?? headerList.get("x-real-ip");
  return ip && isIP(ip) ? ip : null;
}
