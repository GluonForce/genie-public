import { Container } from "@/components/ui/container";
import { Wave } from "@/components/ui/wave";

// Bar heights (%) for the track; the playhead sits after the first 14 bars
const trackBars = [
  18, 34, 62, 44, 88, 56, 30, 72, 100, 64, 40, 78, 52, 26, 48, 70, 36, 58, 82, 46, 22, 60, 74, 38,
  54, 90, 66, 32, 50, 76, 42, 24, 58, 68, 34, 46, 80, 56, 28, 44, 62, 36, 20, 14,
];

const steps = [
  {
    title: "You record your idea",
    text: "Talk for 15 seconds to 10 minutes. Play it back and record again as often as you like.",
  },
  {
    title: "You approve the requirements",
    text: "Genie writes them from your recording. Ask for changes up to two times.",
  },
  {
    title: "A person reviews them",
    text: "Someone on our team accepts or declines. They never rewrite your idea.",
  },
  {
    title: "We email you the link",
    text: "Genie builds the prototype, we check that it works, then you can share it.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="pt-14 pb-24">
      <Container className="flex flex-col gap-2.5">
        <h2 id="how-title" className="sr-only">
          How it works
        </h2>
        <p aria-hidden="true" className="pl-[30%] font-display font-medium">
          01:42
        </p>
        <Wave bars={trackBars} playhead={14} className="h-40 gap-1.5 sm:h-64" />
        <ol className="mt-3.5 flex flex-wrap gap-y-7 border-t-4 border-navy">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="flex min-w-0 flex-[1_1_250px] flex-col gap-1.5 border-l-4 border-navy pt-4 pr-6 pl-4"
            >
              <span className="font-display text-2xl font-extrabold leading-none">{i + 1}</span>
              <h3 className="text-xl font-bold">{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
