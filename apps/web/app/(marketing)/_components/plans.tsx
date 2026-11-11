import { ButtonLink } from "@/components/ui/button-link";
import { Container } from "@/components/ui/container";
import { Wave } from "@/components/ui/wave";

const freeFeatures = [
  "One prototype for each email address",
  "A recording of 15 seconds to 10 minutes",
  "Two rounds of changes to the requirements",
  "Reviewed and checked by a person",
  "A link you can share, live for 3 days",
  "An email when it is ready",
];

const paidFeatures = [
  "More than one prototype per account",
  "Put an expired prototype back online",
  "Change a prototype after it is built",
];

const freeWave = [30, 70, 100, 55, 80, 40, 90, 60, 35, 75, 50, 20];
const silentWave = Array<number>(12).fill(8);

function PlanHeading({ name, status }: { name: string; status: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-display text-[28px] font-extrabold">{name}</h3>
      <span className="font-bold">{status}</span>
    </div>
  );
}

export function Plans() {
  return (
    <section id="plans" aria-labelledby="plans-title" className="bg-blush">
      <Container className="flex flex-col gap-10 py-24">
        <div className="flex max-w-[680px] flex-col gap-3">
          <h2
            id="plans-title"
            className="font-display text-4xl leading-tight font-extrabold tracking-tight sm:text-[44px]"
          >
            Plans
          </h2>
          <p className="text-xl">
            Everyone starts with one free prototype. A paid plan is on the way for people who want
            more.
          </p>
        </div>

        <div className="flex flex-wrap items-stretch gap-7">
          <article className="flex min-w-0 flex-[1_1_400px] flex-col gap-4.5 rounded-[28px] bg-navy p-9 text-white">
            <PlanHeading name="Free" status="Available now" />
            <Wave bars={freeWave} className="h-12 gap-1.5" barShape="rounded-sm" animated />
            <ul className="flex list-disc flex-col gap-2 pl-5.5">
              {freeFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <ButtonLink href="/sign-up" variant="inverse" recordDot className="mt-auto self-start">
              Record your idea
            </ButtonLink>
            <p className="text-[15px] text-rule">
              If you decline the requirements, the free prototype is used up. Take your time with
              the recording.
            </p>
          </article>

          <article className="flex min-w-0 flex-[1_1_400px] flex-col gap-4.5 rounded-[28px] bg-white p-9">
            <PlanHeading name="Paid" status="Coming later" />
            <Wave
              bars={silentWave}
              className="h-12 gap-1.5"
              playedClass="bg-rule"
              barShape="rounded-sm"
            />
            <p>Nothing recorded here yet. This is what we expect the paid plan to add:</p>
            <ul className="flex list-disc flex-col gap-2 pl-5.5">
              {paidFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p className="mt-auto text-ink-muted">
              Price: [PRICE]. The features and the price may change before launch.
            </p>
          </article>
        </div>
      </Container>
    </section>
  );
}
