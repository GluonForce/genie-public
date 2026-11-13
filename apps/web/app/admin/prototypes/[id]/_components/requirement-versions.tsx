"use client";

import { useState } from "react";
import type { Requirements } from "@/lib/agents/requirements";

export type RequirementVersion = { requirements: Requirements; remark: string | null };

/** Every version of the requirements, read only (design A2, BR-14). The latest is selected. */
export function RequirementVersions({
  versions,
  submitted,
}: {
  versions: RequirementVersion[];
  /** Whether the user approved the latest version */
  submitted: boolean;
}) {
  const [selected, setSelected] = useState(versions.length - 1);
  const version = versions[selected];
  const remarks = versions.flatMap((v, index) => (v.remark ? [{ remark: v.remark, index }] : []));

  return (
    <article className="flex min-w-0 flex-col gap-[26px] rounded-[20px] bg-white p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Requirement versions" className="flex flex-wrap gap-2">
          {versions.map((_, index) => {
            const active = index === selected;
            return (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(index)}
                className={`h-11 cursor-pointer rounded-full border-2 px-[18px] text-[15px] font-bold ${
                  active ? "border-navy bg-navy text-white" : "border-rule bg-white text-navy"
                }`}
              >
                Version {index + 1}
                {submitted && index === versions.length - 1 && ", approved by the user"}
              </button>
            );
          })}
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
          </svg>
          Read only, exactly as the user {submitted ? "approved" : "saw"}
        </span>
      </div>

      <section role="tabpanel" className="flex flex-col gap-[26px]">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-bold">Title</h2>
          <p className="text-ink-muted">{version.requirements.title}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-bold">Summary</h2>
          <p className="text-ink-muted">{version.requirements.summary}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-bold">Intent</h2>
          <p className="text-ink-muted">{version.requirements.intent}</p>
        </div>
        <div className="flex flex-col">
          <h2 className="mb-2.5 text-lg font-bold">Functional requirements</h2>
          <ol className="flex flex-col">
            {version.requirements.functional_requirements.map((item, index) => (
              <li
                key={index}
                className={`flex gap-4 py-3 ${index === 0 ? "border-t-4 border-navy" : "border-t-2 border-admin-rule"}`}
              >
                <span className="w-[22px] flex-none font-display text-[15px] font-extrabold">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">User stories</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-[22px] text-ink-muted">
            {version.requirements.user_stories.map((story, index) => (
              <li key={index}>{story}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col gap-1.5 border-t-2 border-admin-rule pt-5">
        <h2 className="text-lg font-bold">Change requests from the user</h2>
        {remarks.length === 0 ? (
          <p className="text-ink-muted">None.</p>
        ) : (
          remarks.map(({ remark, index }, number) => (
            <p key={index} className="text-ink-muted">
              <strong className="text-navy">
                Change {number + 1} (version {index} to {index + 1}):
              </strong>{" "}
              &ldquo;{remark}&rdquo;
            </p>
          ))
        )}
        <p className="text-sm text-ink-muted">{remarks.length} of 2 change requests used.</p>
      </section>
    </article>
  );
}
