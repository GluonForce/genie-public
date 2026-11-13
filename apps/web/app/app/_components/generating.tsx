"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Wave } from "@/components/ui/wave";
import type { GenerateStep } from "./use-recorder";

// Writing your requirements (design screen 5).

const workingBars = [40, 90, 60, 100, 50, 75, 30];

export function Generating({ step, seconds }: { step: GenerateStep; seconds: number | null }) {
  const order: GenerateStep[] = ["transcribing", "analysing", "done"];
  const reached = order.indexOf(step);
  const rows = [
    { label: "Recording uploaded", state: "done", note: seconds === null ? "Done" : formatLength(seconds) },
    { label: "Speech turned into text", ...stateOf(0, reached) },
    { label: "Working out the requirements", ...stateOf(1, reached) },
    { label: "Ready for you to read", ...stateOf(2, reached) },
  ];

  return (
    <main className="mx-auto w-full max-w-[688px] px-6 pt-8 pb-14">
      <section className="flex flex-col gap-7 rounded-[28px] bg-white p-9">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[30px] leading-[1.15] font-extrabold">
            Writing your requirements
          </h1>
          <p className="text-ink-muted">This usually takes under a minute. Keep this page open.</p>
        </div>
        <ol className="flex flex-col" aria-live="polite">
          {rows.map((row) => (
            <li
              key={row.label}
              aria-current={row.state === "active" ? "step" : undefined}
              className={`flex items-center justify-between gap-4 border-l-6 py-4 pl-[18px] ${
                row.state === "done"
                  ? "border-coral"
                  : row.state === "active"
                    ? "rounded-r-[14px] border-navy bg-blush pr-[18px]"
                    : "border-rule text-ink-muted"
              }`}
            >
              <span className="font-bold">{row.label}</span>
              {row.state === "active" ? (
                <Wave
                  bars={workingBars}
                  className="h-7 w-[72px] gap-1"
                  playedClass="bg-navy"
                  barShape="rounded-[2px]"
                  animated
                />
              ) : (
                <span className="text-ink-muted">{row.note}</span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

/** Shown after a reload while Generate is still running: checks back every few seconds. */
export function GeneratingElsewhere() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [router]);
  return <Generating step="analysing" seconds={null} />;
}

function stateOf(index: number, reached: number) {
  if (index < reached) return { state: "done", note: "Done" };
  if (index === reached) return { state: index === 2 ? "done" : "active", note: "Done" };
  return { state: "next", note: "Next" };
}

function formatLength(seconds: number): string {
  const whole = Math.round(seconds);
  return whole < 60 ? `${whole} s` : `${Math.floor(whole / 60)} min ${whole % 60} s`;
}
