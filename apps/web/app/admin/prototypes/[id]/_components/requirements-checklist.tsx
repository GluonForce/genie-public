"use client";

import { useEffect, useState } from "react";

/**
 * "Check against the approved requirements" (design A4). Ticks are kept in this browser only
 * (implementation plan M3.4); they help the admin, they are not a record.
 */
export function RequirementsChecklist({
  prototypeId,
  requirements,
}: {
  prototypeId: string;
  requirements: string[];
}) {
  const storageKey = `genie-qa-${prototypeId}`;
  const [checked, setChecked] = useState<number[]>([]);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (Array.isArray(stored)) setChecked(stored.filter((n) => typeof n === "number"));
    } catch {
      /* start empty */
    }
  }, [storageKey]);

  function toggle(index: number) {
    setChecked((previous) => {
      const next = previous.includes(index)
        ? previous.filter((n) => n !== index)
        : [...previous, index];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* still works for this visit */
      }
      return next;
    });
  }

  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] bg-white p-7">
      <div className="flex flex-col gap-2.5">
        <h2 className="text-lg font-bold">Check against the approved requirements</h2>
        <div aria-hidden="true" className="flex gap-1.5">
          {requirements.map((_, index) => (
            <i
              key={index}
              className={`h-1.5 flex-1 ${checked.includes(index) ? "bg-coral" : "bg-rule"}`}
            />
          ))}
        </div>
        <div className="text-sm text-ink-muted">
          {checked.length} of {requirements.length} checked
        </div>
      </div>
      <div className="flex flex-col">
        {requirements.map((requirement, index) => (
          <label
            key={index}
            className="flex min-h-11 cursor-pointer items-start gap-3 border-t-2 border-admin-rule py-[11px]"
          >
            <input
              type="checkbox"
              checked={checked.includes(index)}
              onChange={() => toggle(index)}
              className="mt-[3px] size-[18px] flex-none accent-navy"
            />
            {requirement}
          </label>
        ))}
      </div>
    </section>
  );
}
