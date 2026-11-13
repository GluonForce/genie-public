import { buttonBase, buttonVariants } from "@/components/ui/button-styles";
import { ButtonLink } from "@/components/ui/button-link";
import { Pill } from "@/components/ui/pill";
import { Wave } from "@/components/ui/wave";
import type { Requirements } from "@/lib/agents/requirements";
import { formatDateTime } from "@/lib/format";
import { CopyLink } from "./copy-link";

// The status screens after the user approves (design screens 8 to 10).

const LIVE_DAYS = 3;

const stages = [
  "You approved the requirements",
  "Team review",
  "Genie builds the prototype",
  "We check that it works",
  "Link sent to your email",
];

// Which stage each status is at, and what the screen says. A failed build is retried by the team,
// so the user still sees "being built".
const progress: Record<string, { stage: number; pill: string; heading: string; text: string }> = {
  pending_review: {
    stage: 1,
    pill: "Waiting for review",
    heading: "A person on our team is reading your requirements",
    text: "Every request is read by someone before it is built. If it is accepted, Genie builds your prototype and we check that it works.",
  },
  approved: {
    stage: 2,
    pill: "Being built",
    heading: "Genie is building your prototype",
    text: "Our team accepted your requirements. Genie is building the prototype now; then we check that it works.",
  },
  awaiting_qa: {
    stage: 3,
    pill: "Being checked",
    heading: "We are checking your prototype",
    text: "Genie has built your prototype. A person on our team is clicking through it before we send you the link.",
  },
};
progress.building = progress.approved;
progress.build_failed = progress.approved;

/** Waiting for review, being built, or being checked (screen 8). */
export function InProgressStatus({
  status,
  email,
  requirements,
  submittedAt,
}: {
  status: string;
  email: string;
  requirements: Requirements;
  submittedAt: Date | null;
}) {
  const current = progress[status] ?? progress.pending_review;
  return (
    <main className="mx-auto flex w-full max-w-[1088px] flex-wrap items-start gap-6 px-6 pt-8 pb-14">
      <section className="flex min-w-0 flex-[999_1_540px] flex-col gap-6 rounded-[28px] bg-white p-9">
        <Pill tone="amber">{current.pill}</Pill>
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[32px] leading-[1.15] font-extrabold tracking-[-0.02em]">
            {current.heading}
          </h1>
          <p className="text-[19px]">{current.text}</p>
        </div>
        <p className="rounded-[20px] bg-blush px-[22px] py-[18px]">
          <strong>You can close this page.</strong> We will email {email} when your prototype is
          ready, or if we cannot build it.
        </p>
        <div className="flex flex-col gap-2 border-t-2 border-rule pt-[22px]">
          <div className="font-bold">What you approved</div>
          <div className="font-display text-xl font-extrabold">{requirements.title}</div>
          <p className="text-ink-muted">{requirements.summary}</p>
          <details>
            <summary className="cursor-pointer py-3 font-bold underline">Read the full requirements</summary>
            <ol className="flex list-decimal flex-col gap-2 pl-6">
              {requirements.functional_requirements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </details>
        </div>
      </section>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col pt-3">
        <h2 className="mb-3.5 text-lg font-bold">Where things stand</h2>
        <ol className="flex flex-col">
          {stages.map((label, index) => (
            <li
              key={label}
              aria-current={index === current.stage ? "step" : undefined}
              className={`border-l-6 py-3 pl-[18px] ${
                index < current.stage
                  ? "border-coral"
                  : index === current.stage
                    ? "rounded-r-[14px] border-navy bg-white pr-[18px]"
                    : "border-white text-ink-muted"
              }`}
            >
              <div className="font-bold">{label}</div>
              {index === 0 && submittedAt && (
                <div className="text-[15px] text-ink-muted">{formatDateTime(submittedAt)}</div>
              )}
              {index === current.stage && <div className="text-[15px]">In progress</div>}
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}

/** Your prototype is ready (screen 9). */
export function LiveStatus({
  title,
  siteUrl,
  expiresAt,
  expiresInMs,
}: {
  title: string;
  siteUrl: string;
  expiresAt: Date | null;
  expiresInMs: number | null;
}) {
  const left = Math.max(0, expiresInMs ?? 0);
  const bars = Array.from({ length: 24 }, (_, i) => 100 - i * 3.4);
  const remaining = Math.round((left / (LIVE_DAYS * 86_400_000)) * bars.length);
  return (
    <main className="mx-auto flex w-full max-w-[1088px] flex-wrap items-start gap-6 px-6 pt-8 pb-14">
      <section className="flex min-w-0 flex-[999_1_540px] flex-col gap-6 rounded-[28px] bg-white p-9">
        <Pill tone="success">Live</Pill>
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[34px] leading-[1.12] font-extrabold tracking-[-0.02em]">
            Your prototype is ready
          </h1>
          <p className="text-[19px]">
            {title} has been built and checked. Open it, click around, and send the link to anyone
            you want feedback from.
          </p>
        </div>
        <CopyLink url={siteUrl} />
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener"
          className={`${buttonBase} ${buttonVariants.primary} self-start px-[30px] py-[17px] text-lg`}
        >
          Open prototype
        </a>
        <p className="border-t-2 border-rule pt-5 text-[15px] text-ink-muted">
          Anyone with this link can open the prototype. It is not listed publicly. Anything typed
          into it stays in that person&apos;s browser.
        </p>
      </section>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-[28px] bg-navy p-7 text-white">
          <div className="font-bold">Link stays live for</div>
          <div className="font-display text-[30px] leading-[1.1] font-extrabold">{formatTimeLeft(left)}</div>
          <Wave
            bars={bars}
            playhead={Math.min(remaining, bars.length - 1)}
            className="h-11 gap-1"
            unplayedClass="bg-white/20"
            barShape="rounded-[3px]"
          />
          {expiresAt && (
            <div className="text-[15px] text-rule">Goes offline on {formatDateTime(expiresAt)}</div>
          )}
        </div>
        <ComingLater heading="Want it for longer?">
          We keep your prototype after the link expires. A paid plan will let you put it back online
          and build more.
        </ComingLater>
      </aside>
    </main>
  );
}

const categoryLabels: Record<string, string> = {
  unclear: "unclear",
  out_of_scope: "out of scope",
  abusive: "against our rules",
  duplicate: "duplicate",
};

/** Not accepted, declined by you, expired or offline (screen 10). */
export function ClosedStatus({
  status,
  title,
  decisionCategory,
  decisionReason,
  userDeclineReason,
  changedAt,
}: {
  status: string;
  title: string;
  decisionCategory: string | null;
  decisionReason: string | null;
  userDeclineReason: string | null;
  changedAt: Date;
}) {
  const day = changedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <main className="mx-auto flex w-full max-w-[808px] flex-col gap-5 px-6 pt-10 pb-14">
      <Wave
        bars={[100, 70, 85, 50, 60, 30, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]}
        playhead={6}
        className="h-11 gap-[5px]"
        unplayedClass="bg-white"
        barShape="rounded-[3px]"
      />
      <section className="flex flex-col gap-[22px] rounded-[28px] bg-white p-9">
        {status === "declined" ? (
          <>
            <Pill tone="danger">Not accepted</Pill>
            <Heading title="We could not build this one">
              Our team read your requirements for {title} and decided not to build the prototype.
            </Heading>
            {decisionReason && (
              <Quote label={`Reason from the reviewer${decisionCategory ? `: ${categoryLabels[decisionCategory] ?? decisionCategory}` : ""}`}>
                {decisionReason}
              </Quote>
            )}
            <p className="text-[15px] text-ink-muted">Reviewed on {day}. Your free prototype has been used.</p>
          </>
        ) : status === "user_declined" ? (
          <>
            <Pill>Declined by you</Pill>
            <Heading title="You declined the requirements">
              No prototype was built for {title}, and your free prototype has been used.
            </Heading>
            {userDeclineReason && <Quote label="The reason you gave">&ldquo;{userDeclineReason}&rdquo;</Quote>}
            <p className="text-[15px] text-ink-muted">Thank you for telling us. We read every reason.</p>
          </>
        ) : status === "offline" ? (
          <>
            <Pill>Offline</Pill>
            <Heading title="Your prototype is offline">
              Our team took {title} offline on {day}. We have kept it safe.
            </Heading>
          </>
        ) : (
          <>
            <Pill>Link expired</Pill>
            <Heading title="Your prototype link has expired">
              {title} was live for {LIVE_DAYS} days and went offline on {day}. We have kept it safe.
            </Heading>
            <p className="border-l-6 border-navy py-1 pl-[18px]">
              Putting an expired prototype back online is planned for the paid plan.
            </p>
          </>
        )}
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-white px-9 py-7">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <div className="font-bold text-ink-muted">Coming later</div>
          <h2 className="text-xl font-bold">Want to build another idea?</h2>
          <p className="text-base text-ink-muted">
            The free plan includes one prototype. A paid plan with more is on the way.
          </p>
        </div>
        <ButtonLink href="/#plans" variant="outline" className="px-[26px] py-3.5 text-base">
          See the plans
        </ButtonLink>
      </section>
    </main>
  );
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="font-display text-[32px] leading-[1.15] font-extrabold tracking-[-0.02em]">{title}</h1>
      <p className="text-[19px]">{children}</p>
    </div>
  );
}

function Quote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-l-6 border-navy py-1 pl-[18px]">
      <div className="font-bold">{label}</div>
      <p>{children}</p>
    </div>
  );
}

function ComingLater({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[28px] bg-white p-7">
      <div className="font-bold text-ink-muted">Coming later</div>
      <h2 className="text-xl font-bold">{heading}</h2>
      <p className="text-base text-ink-muted">{children}</p>
    </div>
  );
}

/** "2 days 21 hours" */
function formatTimeLeft(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(hours / 24);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days > 0) return `${plural(days, "day")} ${plural(hours % 24, "hour")}`;
  if (hours > 0) return plural(hours, "hour");
  return plural(Math.max(1, Math.floor(milliseconds / 60_000)), "minute");
}
