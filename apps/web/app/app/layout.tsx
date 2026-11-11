import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { requireUser } from "@/lib/auth";
import { ensureUser } from "@/lib/users";

// The signed-in user area (design screens 3 to 10).
export default async function UserAreaLayout({ children }: LayoutProps<"/app">) {
  const session = await requireUser();
  // Sign-in always lands on /app; admins work in the admin panel instead
  if (session.role === "admin") redirect("/admin");
  // Creates the Supabase row on the first visit after sign-up
  await ensureUser(session);
  const user = await currentUser();

  return (
    <div className="flex min-h-screen flex-col bg-blush">
      <header className="flex flex-wrap items-center justify-between gap-3 px-8 py-4">
        <Link href="/" className="font-display text-[22px] font-extrabold no-underline">
          genie
        </Link>
        <div className="flex items-center gap-4.5 text-[15px]">
          <span>{user?.primaryEmailAddress?.emailAddress}</span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
