import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAdmin } from "@/lib/auth";

// Admin panel (design screens A1 to A5). Non-admins get a 404, so the area stays hidden.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const user = await currentUser();

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5fa]">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b-4 border-navy bg-white px-8 py-2.5">
        <Link href="/admin" className="inline-flex items-center gap-2.5 no-underline">
          <span className="font-display text-xl font-extrabold">genie</span>
          <span className="rounded-full bg-navy px-2.5 py-0.5 text-[13px] font-bold text-white">
            Admin
          </span>
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
