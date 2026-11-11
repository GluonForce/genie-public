"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";

type AnimatedWaveProps = {
  bars: number[];
  className: string;
  align: "center" | "end";
  barClass: string;
  barShape: string;
};

/**
 * A Wave whose bars rise and fall like live audio. Each bar gets its own
 * depth and timing so the movement looks natural. It only runs while on
 * screen, and stays still for visitors who prefer reduced motion.
 */
export function AnimatedWave({ bars, className, align, barClass, barShape }: AnimatedWaveProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduceMotion = useReducedMotion();
  const animate = inView && !reduceMotion;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`flex ${align === "end" ? "items-end" : "items-center"} ${className}`}
    >
      {bars.map((height, i) => (
        <motion.span
          key={i}
          className={`flex-1 ${barShape} ${barClass}`}
          style={{ height: `${height}%`, originY: align === "end" ? 1 : 0.5 }}
          animate={animate ? { scaleY: [1, 0.35 + ((i * 37) % 45) / 100, 1] } : { scaleY: 1 }}
          transition={
            animate
              ? {
                  duration: 1.4 + (i % 5) * 0.3,
                  delay: (i % 7) * 0.12,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}
