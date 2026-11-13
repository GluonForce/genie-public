"use client";

import { useState } from "react";
import { fieldClass } from "@/components/ui/input";

/** The read-only prototype link with a Copy button (design screen 9). */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the field is still selectable */
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="proto-link" className="text-[15px] font-bold">
        Your link
      </label>
      <div className="flex flex-wrap gap-2.5">
        <input
          id="proto-link"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className={`${fieldClass} h-14 min-w-0 flex-[1_1_280px] px-[18px]`}
        />
        <button
          type="button"
          onClick={copy}
          className="h-14 cursor-pointer rounded-full border-2 border-navy bg-white px-6 text-[17px] font-bold hover:bg-blush"
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
        </button>
      </div>
    </div>
  );
}
