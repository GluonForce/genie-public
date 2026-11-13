"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rebuildPrototype, releasePrototype } from "../actions";
import { DeclineDialog } from "./review-decision";

/** The QA decisions from design A4: Release, Rebuild with a note, or Decline. */
export function QaActions({ prototypeId, title, email }: { prototypeId: string; title: string; email: string }) {
  const [declining, setDeclining] = useState(false);
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
        <button
          type="button"
          onClick={() => setDeclining(true)}
          disabled={busy}
          className="cursor-pointer self-start py-2.5 font-bold text-danger underline-offset-4 hover:underline disabled:opacity-50"
        >
          Decline instead
        </button>
      </section>
      <DeclineDialog
        prototypeId={prototypeId}
        title={title}
        email={email}
        open={declining}
        onClose={() => setDeclining(false)}
      />
    </>
  );
}
