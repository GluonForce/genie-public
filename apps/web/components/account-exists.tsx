// Shown instead of the page when another active account already uses this email (BR-1 to BR-3).
export function AccountExists() {
  return (
    <main className="mx-auto w-full max-w-[1088px] px-6 py-8">
      <section className="flex flex-col gap-2 rounded-[28px] bg-white p-9">
        <h1 className="font-display text-3xl font-extrabold">
          An account already exists for this email address
        </h1>
        <p className="text-ink-muted">Sign out and sign in with the address you used first.</p>
      </section>
    </main>
  );
}
