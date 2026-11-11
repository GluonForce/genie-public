import { Fragment } from "react";
import { AnimatedWave } from "./animated-wave";

type WaveProps = {
  /** Bar heights as a percentage of the wave's height */
  bars: number[];
  /** Index where the navy playhead sits; bars from here on use `unplayedClass` */
  playhead?: number;
  /** Sets the wave's height and gap, e.g. "h-64 gap-1.5" */
  className?: string;
  align?: "center" | "end";
  playedClass?: string;
  unplayedClass?: string;
  barShape?: string;
  /** Bars move like live audio (no playhead) */
  animated?: boolean;
};

/** The sound-wave track used across the design. Decorative only. */
export function Wave({
  bars,
  playhead,
  className = "h-16 gap-1.5",
  align = "center",
  playedClass = "bg-coral",
  unplayedClass = "bg-coral-soft",
  barShape = "rounded",
  animated = false,
}: WaveProps) {
  if (animated) {
    return (
      <AnimatedWave
        bars={bars}
        className={className}
        align={align}
        barClass={playedClass}
        barShape={barShape}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex ${align === "end" ? "items-end" : "items-center"} ${className}`}
    >
      {bars.map((height, i) => (
        <Fragment key={i}>
          {i === playhead && <span className="h-full w-1 shrink-0 bg-navy" />}
          <span
            className={`flex-1 ${barShape} ${playhead !== undefined && i >= playhead ? unplayedClass : playedClass}`}
            style={{ height: `${height}%` }}
          />
        </Fragment>
      ))}
    </div>
  );
}
