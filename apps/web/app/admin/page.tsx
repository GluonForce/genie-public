import { requireAdmin } from "@/lib/auth";

// Placeholder until the queue (M3): proves the admin check works.
export default async function AdminHomePage() {
  // Checked here as well as in the layout: layouts don't re-run on every navigation
  await requireAdmin();

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Queue</h1>
      <p className="text-ink-muted">Requests waiting for a decision will appear here.</p>
    </main>
  );
}
