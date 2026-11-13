"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { approvePrototype, declinePrototype, retryBuild } from "../actions";

/** Accept or decline at review (design A2). */
export function ReviewDecision({ prototypeId, title, email }: { prototypeId: string; title: string; email: string }) {
  const [state, approve, approving] = useActionState(approvePrototype.bind(null, prototypeId), undefined);
  const [declining, setDeclining] = useState(false);

  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] bg-navy p-[26px] text-white">
      <h2 className="text-lg font-bold">Decision</h2>
      <p className="text-[15px] text-rule">
        Accepting starts the build straight away. The requirements cannot be edited.
      </p>
      <form action={approve} className="flex flex-col">
        <Button type="submit" variant="inverse" disabled={approving}>
          {approving ? "Starting…" : "Accept and start build"}
        </Button>
      </form>
      <Button
        className="border-2 border-white"
        onClick={() => setDeclining(true)}
        disabled={approving}
      >
        Decline
      </Button>
      {state?.error && <ErrorNote>{state.error}</ErrorNote>}
      <DeclineDialog
        prototypeId={prototypeId}
        title={title}
        email={email}
        open={declining}
        onClose={() => setDeclining(false)}
      />
    </section>
  );
}

const categoryOptions = [
  ["unclear", "Unclear, cannot tell what to build"],
  ["out_of_scope", "Out of scope for a front-end prototype"],
  ["abusive", "Abusive or against the acceptable use policy"],
  ["duplicate", "Duplicate account or request"],
] as const;

/** Decline with a category and a reason the user sees (design A3). Used at review and at QA. */
export function DeclineDialog({
  prototypeId,
  title,
  email,
  open,
  onClose,
}: {
  prototypeId: string;
  title: string;
  email: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, decline, pending] = useActionState(declinePrototype.bind(null, prototypeId), undefined);
  const [category, setCategory] = useState("");

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="decline-title" className="max-w-[560px]">
      <form action={decline} className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <h2 id="decline-title" className="font-display text-2xl leading-[1.2] font-extrabold tracking-[-0.02em]">
            Decline &ldquo;{title}&rdquo;?
          </h2>
          <p className="text-ink-muted">
            Nothing will be built and the user ({email}) sees your reason on their status page.
            Their free prototype stays used. This cannot be undone.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2.5 text-[15px] font-bold">Category</legend>
          {categoryOptions.map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-[50px] cursor-pointer items-center gap-3 rounded-[14px] border-2 px-4 ${
                category === value ? "border-navy bg-blush font-bold" : "border-rule"
              }`}
            >
              <input
                type="radio"
                name="category"
                value={value}
                required
                checked={category === value}
                onChange={() => setCategory(value)}
                className="size-[18px] accent-navy"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <label htmlFor="decline-reason" className="text-[15px] font-bold">
            Reason shown to the user <span className="font-normal text-danger">(required)</span>
          </label>
          <Textarea id="decline-reason" name="reason" required minLength={10} maxLength={2000} />
          <p className="text-sm text-ink-muted">The user sees this text on their status page. Write it for them.</p>
        </div>
        {state?.error && <ErrorNote>{state.error}</ErrorNote>}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" className="flex-[1_1_160px]" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-[1_1_160px] bg-danger hover:bg-danger-ink"
            disabled={pending}
          >
            {pending ? "Declining…" : "Decline request"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Retry for a failed build (FR-AD7). */
export function RetryBuild({ prototypeId }: { prototypeId: string }) {
  const [state, retry, pending] = useActionState(retryBuild.bind(null, prototypeId), undefined);
  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] bg-navy p-[26px] text-white">
      <h2 className="text-lg font-bold">Build failed</h2>
      <p className="text-[15px] text-rule">
        The automatic checks failed after the fix round. Retrying sends it back to the builder with
        the same requirements.
      </p>
      <form action={retry} className="flex flex-col">
        <Button type="submit" variant="inverse" disabled={pending}>
          {pending ? "Sending…" : "Retry build"}
        </Button>
      </form>
      {state?.error && <ErrorNote>{state.error}</ErrorNote>}
    </section>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-[15px] text-danger-ink">
      {children}
    </p>
  );
}
