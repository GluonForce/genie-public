import { formatCost, formatDateTime, parseTimestamp } from "@/lib/format";
import { EventFilter, type EventFilterValue } from "./event-filter";

// The prototype's event timeline (design A5, FR-AD8): every user, admin and system action,
// newest first, with a plain-English line for each.

export type LoggedEvent = {
  id: number;
  createdAt: string;
  actorRole: "user" | "admin" | "system";
  actorEmail: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  ip: string | null;
  reason: string | null;
  details: unknown;
};

const roleStyles = {
  user: ["User", "bg-blush"],
  admin: ["Admin", "bg-navy text-white"],
  system: ["System", "bg-admin-rule"],
} as const;

const statusNames: Record<string, string> = {
  pending_review: "Pending approval",
  approved: "Approved",
  awaiting_qa: "Ready for QA",
  released: "Live",
  offline: "Offline",
  expired: "Expired",
  declined: "Declined",
};

const blockedWhat: Record<string, string> = {
  second_request: "Tried to start a second request.",
  third_remark: "Tried to send a third change request.",
  second_submission: "Tried to submit again.",
};

export const categoryLabels: Record<string, string> = {
  unclear: "Unclear",
  out_of_scope: "Out of scope",
  abusive: "Abusive",
  duplicate: "Duplicate",
};

export function EventLog({
  prototypeId,
  events,
  filter,
  recordingSeconds,
}: {
  prototypeId: string;
  /** Oldest first, so change requests can be numbered */
  events: LoggedEvent[];
  filter: EventFilterValue;
  recordingSeconds: number;
}) {
  const lines = events.map((event, index) => {
    const changes = events
      .slice(0, index + 1)
      .filter((earlier) => earlier.action === "requirements_revised").length;
    return { event, ...describe(event, changes, recordingSeconds) };
  });
  const shown = lines.filter((line) => filter === "all" || line.event.actorRole === filter).reverse();

  return (
    <section className="flex flex-col rounded-[20px] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-[22px]">
        <div>
          <h2 className="font-display text-xl font-extrabold">Event log</h2>
          <p className="text-[15px] text-ink-muted">Everything that has happened to this prototype, newest first.</p>
        </div>
        <EventFilter value={filter} />
      </div>
      {shown.length === 0 ? (
        <p className="border-t-4 border-navy px-6 py-8 text-center text-ink-muted">No events of this kind.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="text-sm">
                {["When", "Who", "What happened", "Details"].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-t-4 border-b-2 border-t-navy border-b-admin-rule px-6 py-3 font-bold"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ event, title, detail, logAttempt }) => {
                const [roleLabel, roleClass] = roleStyles[event.actorRole];
                return (
                  <tr key={event.id}>
                    <td className="border-b-2 border-admin-rule px-6 py-3.5 whitespace-nowrap">
                      {formatWhen(event.createdAt)}
                    </td>
                    <td className="border-b-2 border-admin-rule px-6 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold ${roleClass}`}>
                        {roleLabel}
                      </span>{" "}
                      {event.actorRole !== "system" && event.actorEmail}
                    </td>
                    <td className="border-b-2 border-admin-rule px-6 py-3.5 font-bold">{title}</td>
                    <td className="border-b-2 border-admin-rule px-6 py-3.5 text-ink-muted">
                      {detail}
                      {logAttempt !== undefined && (
                        <>
                          {detail ? " " : ""}
                          <a href={`/api/admin/requests/${prototypeId}/logs/${logAttempt}`}>Open log</a>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function describe(
  event: LoggedEvent,
  changeNumber: number,
  recordingSeconds: number,
): { title: string; detail: string; logAttempt?: number } {
  const details = (event.details ?? {}) as Record<string, unknown>;
  const attempt = typeof details.attempt === "number" ? details.attempt : undefined;
  const cost = details.cost_usd !== undefined && details.cost_usd !== null ? formatCost(String(details.cost_usd)) : null;
  const facts = [attempt ? `Attempt ${attempt}` : null, cost].filter(Boolean).join(", ");
  const quoted = event.reason ? `"${event.reason}"` : "";
  const transition =
    event.fromStatus && event.toStatus
      ? `${statusNames[event.fromStatus] ?? event.fromStatus} to ${statusNames[event.toStatus] ?? event.toStatus}.`
      : "";
  const until =
    typeof details.expires_at === "string" ? ` Live until ${formatDateTime(parseTimestamp(details.expires_at))}.` : "";

  switch (event.action) {
    case "signup":
      return { title: details.relinked ? "Signed in again" : "Signed up", detail: event.ip ? `IP ${event.ip}` : "" };
    case "recording_started":
      return { title: "Started recording", detail: "" };
    case "recording_discarded":
      return { title: "Recorded again", detail: "The earlier recording was discarded." };
    case "requirements_generated":
      return {
        title: "Requirements generated",
        detail: `Version 1 from a ${formatRecording(recordingSeconds)} recording.`,
      };
    case "requirements_revised":
      return {
        title: "Requirements revised",
        detail: `Change ${changeNumber} of 2: "${String(details.remark ?? "")}"`,
      };
    case "submitted": {
      const matches = Array.isArray(details.ip_flag_matches) ? details.ip_flag_matches.length : 0;
      const ip = event.ip ? `IP ${event.ip}. ` : "";
      return {
        title: "Submitted for review",
        detail:
          matches === 0
            ? `${ip}No other accounts on this IP.`
            : `${ip}Shared with ${matches} other account${matches === 1 ? "" : "s"}.`,
      };
    }
    case "user_declined":
      return { title: "Declined by the user", detail: quoted || "No reason given." };
    case "approved":
      return details.dev_enqueue
        ? { title: "Added for a test build", detail: "Created with the worker's enqueue command." }
        : { title: "Requirements accepted", detail: "Pending approval to Approved. Build queued." };
    case "declined": {
      const category = typeof details.category === "string" ? `${categoryLabels[details.category] ?? details.category}: ` : "";
      return { title: "Declined", detail: `${category}${quoted}` };
    }
    case "build_started":
      return { title: "Build started", detail: attempt ? `Attempt ${attempt}.` : "" };
    case "build_succeeded":
    case "build_failed":
      return {
        title: event.action === "build_succeeded" ? "Build succeeded" : "Build failed",
        detail: [facts && `${facts}.`, event.reason].filter(Boolean).join(" "),
        logAttempt: typeof details.log_path === "string" && attempt ? attempt : undefined,
      };
    case "build_retried":
      return { title: "Build retried", detail: "Build failed to Approved. Build queued." };
    case "rebuild_requested":
      return { title: "Rebuild requested", detail: quoted };
    case "build_requeued":
      return { title: "Build requeued", detail: event.reason ?? "" };
    case "qa_ready":
      return { title: "Ready for QA", detail: "Built and published as a private preview." };
    case "released":
      return { title: "Released", detail: `Ready for QA to Live.${until}` };
    case "expired":
      return { title: "Expired", detail: "The link's 3 days are over." };
    case "taken_offline":
      return { title: "Taken offline", detail: "Live to Offline." };
    case "restored":
      return event.fromStatus === "expired"
        ? { title: "Redeployed", detail: `Expired to Live for another 3 days.${until}` }
        : { title: "Restored", detail: `${transition}${until}` };
    case "blocked_attempt":
      return {
        title: "Blocked attempt",
        detail: blockedWhat[String(details.what)] ?? String(details.what ?? ""),
      };
    default:
      return {
        title: event.action.charAt(0).toUpperCase() + event.action.slice(1).replaceAll("_", " "),
        detail: [transition, quoted].filter(Boolean).join(" "),
      };
  }
}

/** "10 Nov, 14:20" */
function formatWhen(value: string): string {
  const date = parseTimestamp(value);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** "3 min 12 s" */
function formatRecording(seconds: number): string {
  const whole = Math.round(seconds);
  return whole < 60 ? `${whole} s` : `${Math.floor(whole / 60)} min ${whole % 60} s`;
}
