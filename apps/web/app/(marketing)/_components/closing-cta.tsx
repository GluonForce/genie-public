import { ButtonLink } from "@/components/ui/button-link";
import { Container } from "@/components/ui/container";

export function ClosingCta() {
  return (
    <section className="bg-navy text-white">
      <Container className="flex flex-wrap items-center justify-between gap-7 py-20">
        <h2 className="min-w-0 flex-[1_1_520px] font-display text-4xl leading-tight font-extrabold tracking-tight sm:text-[44px]">
          Got an idea? Say it out loud.
        </h2>
        <ButtonLink href="/sign-up" variant="inverse" recordDot>
          Record your idea
        </ButtonLink>
      </Container>
    </section>
  );
}
