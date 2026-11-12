"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rebuildPrototype, releasePrototype } from "../actions";

/** The two QA decisions from design A4: Release, or Rebuild with a note. */
export function QaActions({ prototypeId }: { prototypeId: string }) {
  const [releaseState, release, releasing] = useActionState(
    releasePrototype.bind(null, prototypeId),
    undefined,
  );
  const [rebuildState, rebuild, rebuilding] = useActionState(
    rebuildPrototype.bind(null, prototypeId),
    undefined,
  );
  const busy = releasing || rebuilding;

  return (
    <>
      <section className="flex flex-col gap-3.5 rounded-[20px] bg-navy p-[26px] text-white">
        <h2 className="text-lg font-bold">Release</h2>
        <p className="text-[15px] text-rule">
          Makes the link public for 3 days. Emailing the user comes later; for now, send them the
          link yourself.
        </p>
        <form action={release} className="flex flex-col">
          <Button type="submit" variant="inverse" disabled={busy}>
            {releasing ? "Releasing…" : "Release"}
          </Button>
        </form>
        {releaseState?.error && (
          <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-[15px] text-danger-ink">
            {releaseState.error}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-[26px]">
        <h2 className="text-lg font-bold">Something is broken?</h2>
        <form action={rebuild} className="flex flex-col gap-3">
          <label htmlFor="qa-note" className="text-[15px] text-ink-muted">
            Describe the defect. Genie rebuilds with this note. The requirements stay the same.
          </label>
          <Textarea
            id="qa-note"
            name="note"
            rows={3}
            required
            minLength={5}
            maxLength={2000}
            placeholder="For example: closing the poll does not show the winner."
          />
          <Button type="submit" variant="outline" disabled={busy}>
            {rebuilding ? "Sending…" : "Rebuild with this note"}
          </Button>
        </form>
        {rebuildState?.error && (
          <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-[15px] text-danger-ink">
            {rebuildState.error}
          </p>
        )}
      </section>
    </>
  );
}
