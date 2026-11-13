"use client";

import { useActionState } from "react";
import { restorePrototype, takeOffline } from "../actions";

const outline =
  "inline-block cursor-pointer rounded-full border-2 px-5 py-[9px] font-bold no-underline disabled:opacity-50";

/** Header actions on the record (design A5): Open prototype, Download source, Take offline or Restore. */
export function RecordActions({
  prototypeId,
  siteUrl,
  canDownload,
  mode,
}: {
  prototypeId: string;
  siteUrl: string | null;
  canDownload: boolean;
  /** live: take offline · restore: back online until the original expiry · redeploy: a fresh 3 days */
  mode: "live" | "restore" | "redeploy";
}) {
  const [offlineState, goOffline, goingOffline] = useActionState(takeOffline.bind(null, prototypeId), undefined);
  const [restoreState, restore, restoring] = useActionState(restorePrototype.bind(null, prototypeId), undefined);
  const error = offlineState?.error ?? restoreState?.error;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2.5">
        {mode === "live" && siteUrl && (
          <a href={siteUrl} target="_blank" rel="noopener" className={`${outline} border-navy bg-white text-navy hover:text-navy`}>
            Open prototype
          </a>
        )}
        {canDownload && (
          <a href={`/api/admin/requests/${prototypeId}/source`} className={`${outline} border-navy bg-white text-navy hover:text-navy`}>
            Download source
          </a>
        )}
        {mode === "live" ? (
          <form action={goOffline}>
            <button type="submit" disabled={goingOffline} className={`${outline} border-danger-ink bg-white text-danger-ink`}>
              {goingOffline ? "Taking offline…" : "Take offline"}
            </button>
          </form>
        ) : (
          <form action={restore}>
            <button type="submit" disabled={restoring} className={`${outline} border-navy bg-navy text-white`}>
              {restoring ? "Putting it online…" : mode === "restore" ? "Restore" : "Redeploy for 3 days"}
            </button>
          </form>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-[15px] text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
