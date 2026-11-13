"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wave } from "@/components/ui/wave";
import { MIN_SECONDS, QUIET, formatClock, type Recording } from "./use-recorder";

// Listen back before you continue (design screen 4, FR-R4).

const PLAYBACK_BARS = 60;

export function RecordingReview({
  recording,
  error,
  onGenerate,
  onRecordAgain,
}: {
  recording: Recording;
  error: string | null;
  onGenerate: () => Promise<void>;
  onRecordAgain: () => Promise<void>;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const bars = summarise(recording.levels, PLAYBACK_BARS);
  const tooShort = recording.seconds < MIN_SECONDS;

  function togglePlay() {
    const player = audio.current;
    if (!player) return;
    if (player.paused) void player.play();
    else player.pause();
  }

  async function recordAgain() {
    audio.current?.pause();
    setDiscarding(true);
    await onRecordAgain();
    setDiscarding(false);
  }

  return (
    <main className="mx-auto flex w-full max-w-[808px] flex-col gap-5 px-6 pt-8 pb-14">
      <section className="flex flex-col gap-[26px] rounded-[28px] bg-white p-9">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[30px] leading-[1.15] font-extrabold">
            Listen back before you continue
          </h1>
          <p className="text-ink-muted">
            If anything is unclear or missing, record it again. You can do that as often as you
            like.
          </p>
        </div>

        {recording.url ? (
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause recording" : "Play recording"}
              className="flex size-[68px] flex-none cursor-pointer items-center justify-center rounded-full bg-navy hover:bg-[#1d2c6e]"
            >
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 20 20">
                {playing ? (
                  <path d="M5 3.5h3.5v13H5zM11.5 3.5H15v13h-3.5z" fill="#FFFFFF" />
                ) : (
                  <path d="M6 3.5v13l11-6.5z" fill="#FFFFFF" />
                )}
              </svg>
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Wave
                bars={bars}
                playhead={Math.min(bars.length - 1, Math.floor((position / recording.seconds) * bars.length))}
                className="h-[84px] gap-1"
              />
              <div className="flex justify-between text-[15px] text-ink-muted">
                <span>{formatClock(position)}</span>
                <span>{formatClock(recording.seconds)}</span>
              </div>
            </div>
            <audio
              ref={audio}
              src={recording.url}
              preload="auto"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPosition(0)}
              onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
            />
          </div>
        ) : (
          <p className="rounded-[20px] bg-blush px-5 py-[18px]">
            Your recording of {formatClock(recording.seconds)} is saved. Playback is only available
            right after recording.
          </p>
        )}

        {tooShort && (
          <p className="text-[15px] text-ink-muted">
            This recording is shorter than {MIN_SECONDS} seconds. Record again and tell us a bit more.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-[15px] text-danger-ink">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            className="flex-[1_1_260px]"
            onClick={onGenerate}
            disabled={tooShort || discarding}
          >
            Generate requirements
          </Button>
          <Button
            variant="outline"
            className="flex-[1_1_200px]"
            onClick={recordAgain}
            disabled={discarding}
          >
            <span aria-hidden="true" className="size-3.5 rounded-full bg-coral" />
            {discarding ? "Deleting…" : "Record again"}
          </Button>
        </div>
      </section>

      <p className="rounded-[20px] bg-amber px-[22px] py-[18px] text-amber-ink">
        <strong>Generating locks this recording.</strong> After that you cannot record again. You can
        still ask for changes to the requirements up to two times.
      </p>
    </main>
  );
}

/** Squeezes the 100 ms levels into `count` bars, keeping each group's loudest moment. */
function summarise(levels: number[], count: number): number[] {
  if (levels.length === 0) return Array.from({ length: count }, () => QUIET);
  const size = Math.max(1, levels.length / count);
  return Array.from({ length: Math.min(count, levels.length) }, (_, i) =>
    Math.max(...levels.slice(Math.floor(i * size), Math.floor((i + 1) * size)), QUIET),
  );
}
