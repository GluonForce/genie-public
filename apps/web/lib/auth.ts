import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

export type Role = "admin" | "user";

export type SessionUser = {
  userId: string;
  role: Role;
};

/**
 * The signed-in user, or null. The role comes from Clerk public metadata via the
 * session token, so no network call is made. Anyone without role "admin" is a user.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  return {
    userId,
    role: sessionClaims?.metadata?.role === "admin" ? "admin" : "user",
  };
}

/** For signed-in pages: sends signed-out visitors to the sign-in page. */
export async function requireUser(): Promise<SessionUser> {
  const { redirectToSignIn } = await auth();
  const user = await getSessionUser();
  if (!user) return redirectToSignIn();
  return user;
}

/** For admin pages: anyone who is not an admin gets a 404 (FR-A3). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user?.role !== "admin") notFound();
  return user;
}
