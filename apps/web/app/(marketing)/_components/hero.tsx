import { ButtonLink } from "@/components/ui/button-link";
import { Container } from "@/components/ui/container";

export function Hero() {
  return (
    <section>
      <Container className="flex flex-wrap items-end gap-x-16 gap-y-6 pt-8">
        <h1 className="min-w-0 flex-[1_1_600px] font-display text-4xl font-extrabold leading-[1.04] tracking-tight sm:text-5xl lg:text-[68px]">
          Say your idea. Get a working prototype.
        </h1>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col items-start gap-4">
          <p className="text-xl">
            Press record and talk. Everything after that, from requirements to a prototype you can
            click through, happens along one track.
          </p>
          <ButtonLink href="/sign-up" recordDot>
            Record your idea
          </ButtonLink>
          <p className="text-ink-muted">Your first prototype is free. No card needed.</p>
        </div>
      </Container>
    </section>
  );
}
