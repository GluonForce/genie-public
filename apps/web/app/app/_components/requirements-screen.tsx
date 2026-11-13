"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Wave } from "@/components/ui/wave";
import type { Requirements } from "@/lib/agents/requirements";

// Your requirements (design screen 6) and the decline warning (screen 7).

const MAX_REVISIONS = 2;
const ordinals = ["first", "second"];
const declineBars = [100, 70, 85, 50, 60, 30, 8, 8, 8, 8, 8, 8, 8, 8];

export function RequirementsScreen({
  prototypeId,
  requirements,
  previousRequirements,
  remarks,
}: {
  prototypeId: string;
  requirements: Requirements;
  /** The version before the latest change request, to mark what it added */
  previousRequirements: string[] | null;
  /** Change requests used so far, oldest first */
  remarks: string[];
}) {
  const router = useRouter();
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState<"revise" | "submit" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"approve" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const used = remarks.length;
  const left = MAX_REVISIONS - used;

  async function post(path: string, body: unknown, action: "revise" | "submit" | "decline") {
    setBusy(action);
    setError(null);
    const response = await fetch(`/api/requests/${prototypeId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Could not reach Genie. Check your connection and try again.");
      setBusy(null);
      setDialog(null);
      return false;
    }
    router.refresh();
    return true;
  }

  async function revise(event: React.FormEvent) {
    event.preventDefault();
    if (await post("revise", { remark }, "revise")) setRemark("");
    setBusy(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-[1168px] flex-wrap items-start gap-6 px-6 pt-8 pb-14">
      <article className="flex min-w-0 flex-[999_1_560px] flex-col gap-[30px] rounded-[28px] bg-white p-9">
        <div className="flex flex-col gap-2.5">
          <p className="text-ink-muted">
            Version {used + 1} of {MAX_REVISIONS + 1}
            {used > 0 && `, updated after your ${ordinals[used - 1]} change request`}
          </p>
          <h1 className="font-display text-[34px] leading-[1.12] font-extrabold tracking-[-0.02em]">
            {requirements.title}
          </h1>
          <p className="text-[19px]">{requirements.summary}</p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">What you want to achieve</h2>
          <p className="text-ink-muted">{requirements.intent}</p>
        </section>

        <section className="flex flex-col gap-1">
          <h2 className="mb-2 text-xl font-bold">What the prototype will do</h2>
          <ol className="flex flex-col">
            {requirements.functional_requirements.map((item, index) => {
              const added = previousRequirements !== null && !previousRequirements.includes(item);
              return (
                <li
                  key={index}
                  className={`flex gap-[18px] py-3.5 ${
                    added
                      ? "-mx-4 rounded-[14px] bg-blush px-4"
                      : index === 0
                        ? "border-t-4 border-navy"
                        : "border-t-2 border-rule"
                  }`}
                >
                  <span className="w-6 flex-none font-display font-extrabold">{index + 1}</span>
                  <span>
                    {item} {added && <strong>Added from your change request.</strong>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {requirements.user_stories.length > 0 && (
          <details className="group flex flex-col gap-2.5">
            <summary className="cursor-pointer py-1 text-xl font-bold">User stories</summary>
            <ul className="mt-2.5 flex list-disc flex-col gap-2 pl-[22px] text-ink-muted">
              {requirements.user_stories.map((story, index) => (
                <li key={index}>{story}</li>
              ))}
            </ul>
          </details>
        )}

        <p className="border-t-2 border-rule pt-5 text-[15px] text-ink-muted">
          The prototype runs in the browser and imitates a backend. What you enter is saved on the
          device you use. Real payments, outside services and user accounts are not included.
        </p>
      </article>

      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
        <section className="flex flex-col gap-3.5 rounded-[28px] bg-white p-7">
          <div className="flex flex-col gap-2.5">
            <h2 className="text-xl font-bold">Something missing?</h2>
            <div className="flex gap-1.5 text-sm font-bold">
              {Array.from({ length: MAX_REVISIONS }, (_, index) => (
                <span
                  key={index}
                  className={`flex-1 border-t-6 pt-1.5 ${index < used ? "border-coral" : "border-rule"}`}
                >
                  Change {index + 1} {index < used ? "used" : "left"}
                </span>
              ))}
            </div>
          </div>
          {left > 0 ? (
            <form onSubmit={revise} className="flex flex-col gap-3.5">
              <label htmlFor="remark" className="text-ink-muted">
                Describe what to change and Genie rewrites the requirements.
              </label>
              <Textarea
                id="remark"
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                required
                minLength={5}
                maxLength={1000}
                placeholder="For example: managers should see the total amount waiting for approval."
              />
              <Button type="submit" variant="outline" disabled={busy !== null}>
                {busy === "revise" ? "Updating… this takes a few seconds" : "Update requirements"}
              </Button>
            </form>
          ) : (
            <p className="text-ink-muted">You have used both change requests.</p>
          )}
          {remarks.map((text, index) => (
            <div key={index} className="flex flex-col gap-1 border-t-2 border-rule pt-3.5 text-[15px]">
              <div className="font-bold">Your {ordinals[index]} change request</div>
              <p className="text-ink-muted">&ldquo;{text}&rdquo;</p>
            </div>
          ))}
        </section>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-[15px] text-danger-ink">
            {error}
          </p>
        )}

        <section className="flex flex-col gap-3.5 rounded-[28px] bg-navy p-7 text-white">
          <h2 className="text-xl font-bold">Happy with this?</h2>
          <p className="text-rule">
            Approving sends these requirements to our team for review. They cannot be changed
            afterwards.
          </p>
          <Button variant="inverse" onClick={() => setDialog("approve")} disabled={busy !== null}>
            Approve and send for review
          </Button>
          <button
            type="button"
            onClick={() => setDialog("decline")}
            disabled={busy !== null}
            className="cursor-pointer py-3 font-bold text-white underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Decline these requirements
          </button>
        </section>
      </aside>

      <Dialog open={dialog === "approve"} onClose={() => setDialog(null)} aria-labelledby="approve-title">
        <div className="flex flex-col gap-5">
          <h2 id="approve-title" className="font-display text-[28px] leading-tight font-extrabold">
            Send for review?
          </h2>
          <p>
            Our team checks the requirements before building. After you send them, they cannot be
            changed{left > 0 ? `, and your ${left === 1 ? "remaining change request" : "change requests"} can no longer be used` : ""}.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              className="flex-[1_1_200px]"
              disabled={busy !== null}
              onClick={() => post("submit", {}, "submit")}
            >
              {busy === "submit" ? "Sending…" : "Approve and send"}
            </Button>
            <Button variant="outline" className="flex-[1_1_200px]" onClick={() => setDialog(null)}>
              Go back
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "decline"}
        onClose={() => setDialog(null)}
        aria-labelledby="decline-title"
        className="max-w-[560px]"
      >
        <form
          className="flex flex-col gap-[22px]"
          onSubmit={(event) => {
            event.preventDefault();
            void post("user-decline", { reason }, "decline");
          }}
        >
          <Wave bars={declineBars} playhead={6} className="h-10 gap-[5px]" unplayedClass="bg-rule" barShape="rounded-[3px]" />
          <div className="flex flex-col gap-2.5">
            <h2 id="decline-title" className="font-display text-[28px] leading-[1.15] font-extrabold">
              Decline and stop here?
            </h2>
            <p>This cannot be undone. If you decline:</p>
            <ul className="flex flex-col">
              <li className="border-t-2 border-rule py-2.5">No prototype will be built.</li>
              <li className="border-t-2 border-rule py-2.5">You cannot generate the requirements again.</li>
              <li className="border-y-2 border-rule py-2.5 font-bold">Your one free prototype is used up.</li>
            </ul>
          </div>
          {left > 0 && (
            <p className="rounded-[14px] bg-blush px-[18px] py-3.5 text-base">
              You still have {left} change request{left === 1 ? "" : "s"} left. If the requirements are
              close, go back and tell Genie what to change.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="decline-reason" className="text-[15px] font-bold">
              Why do you not want to continue? <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <Textarea
              id="decline-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              placeholder="Your answer helps us improve Genie."
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" className="flex-[1_1_200px]" onClick={() => setDialog(null)}>
              Go back to the requirements
            </Button>
            <Button type="submit" variant="danger" className="flex-[1_1_200px]" disabled={busy !== null}>
              {busy === "decline" ? "Declining…" : "Decline and use my free prototype"}
            </Button>
          </div>
        </form>
      </Dialog>
    </main>
  );
}
