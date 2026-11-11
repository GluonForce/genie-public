import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

// Placeholder until the recorder (M2): proves sign-in, the user area and sign-out work.
export default async function UserHomePage() {
  // Checked here as well as in the layout: layouts don't re-run on every navigation
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-[1088px] px-6 py-8">
      <Card className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold">You are signed in</h1>
        <p className="text-ink-muted">The recorder will appear here.</p>
      </Card>
    </main>
  );
}
