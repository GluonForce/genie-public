"use client";

import { Button } from "@/components/ui/button";
import { Wave } from "@/components/ui/wave";
import { Generating } from "./generating";
import { RecordingReview } from "./recording-review";
import { MAX_SECONDS, WARNING_SECONDS, formatClock, useRecorder } from "./use-recorder";

// Record your idea (design screen 3), listen back (screen 4), then Generate (screen 5).

const prompts = [
  "Who will use it",
  "The problem it solves",
  "The main things a person should be able to do",
  "What the first screen should show",
];

export function RecordScreen({ saved }: { saved?: { prototypeId: string; seconds: number } }) {
  const recorder = useRecorder(saved);
  const { phase, seconds, bars, error, recording } = recorder;

  if (phase === "generating" && recording) {
    return <Generating step={recorder.generateStep} seconds={recording.seconds} />;
  }
  if (phase === "review" && recording) {
    return (
      <RecordingReview
        recording={recording}
        error={error}
        onGenerate={recorder.generate}
        onRecordAgain={recorder.recordAgain}
      />
    );
  }

  const active = phase === "recording" || phase === "paused" || phase === "saving";

  return (
    <main className="mx-auto flex w-full max-w-[1088px] flex-wrap items-start gap-6 px-6 pt-8 pb-14">
      <section className="flex min-w-0 flex-[999_1_540px] flex-col gap-6 rounded-[28px] bg-white p-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[30px] leading-[1.15] font-extrabold">
              Tell us about your idea
            </h1>
            <p className="text-ink-muted">
              Speak naturally, as if you were explaining it to a colleague.
            </p>
          </div>
          {active && (
            <div className="flex items-center gap-2.5 font-bold" role="status">
              <span
                aria-hidden="true"
                className={`size-3.5 rounded-full ${phase === "recording" ? "bg-coral" : "bg-navy"}`}
              />
              {phase === "recording" ? "Recording" : phase === "paused" ? "Paused" : "Saving"}
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-3.5">
          <div className="font-display text-[76px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
            {formatClock(seconds)}
          </div>
          <div className="text-ink-muted">of {formatClock(MAX_SECONDS)}</div>
        </div>

        <Wave
          bars={bars}
          className="h-[150px] gap-[5px]"
          playedClass={active ? "bg-coral" : "bg-rule"}
        />

        {phase === "recording" && seconds >= WARNING_SECONDS && (
          <p role="alert" className="rounded-[20px] bg-amber px-[22px] py-[18px] text-amber-ink">
            <strong>One minute left.</strong> Recording stops by itself at 10:00.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {active ? (
            <>
              <Button onClick={recorder.stop} disabled={phase === "saving"}>
                <span aria-hidden="true" className="size-3.5 rounded-[3px] bg-white" />
                {phase === "saving" ? "Saving…" : "Stop recording"}
              </Button>
              <Button variant="outline" onClick={recorder.togglePause} disabled={phase === "saving"}>
                {phase === "paused" ? "Resume" : "Pause"}
              </Button>
            </>
          ) : (
            <Button onClick={recorder.start} disabled={phase === "starting"}>
              <span aria-hidden="true" className="size-3.5 rounded-full bg-coral" />
              {phase === "starting" ? "Starting…" : "Start recording"}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-[15px] text-danger-ink">
            {error}
          </p>
        )}
        <p className="text-[15px] text-ink-muted">
          Record at least 15 seconds. Recording stops by itself at 10 minutes.
        </p>
      </section>

      <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-5 pt-3">
        <div className="flex flex-col">
          <h2 className="mb-2.5 text-lg font-bold">Things worth mentioning</h2>
          {prompts.map((prompt, i) => (
            <div
              key={prompt}
              className={`py-[11px] ${i === 0 ? "border-t-4 border-navy" : "border-t-2 border-rule-blush"}`}
            >
              {prompt}
            </div>
          ))}
        </div>
        <p className="rounded-[20px] bg-white px-5 py-[18px] text-base">
          You can play the recording back and record again as many times as you like. Nothing is
          sent until you choose Generate requirements.
        </p>
      </aside>
    </main>
  );
}
