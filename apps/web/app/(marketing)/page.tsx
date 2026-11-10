import { ClosingCta } from "./_components/closing-cta";
import { ExampleIdea } from "./_components/example-idea";
import { Faq } from "./_components/faq";
import { Hero } from "./_components/hero";
import { HowItWorks } from "./_components/how-it-works";
import { Plans } from "./_components/plans";
import { WhatYouGet } from "./_components/what-you-get";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <ExampleIdea />
      <WhatYouGet />
      <Plans />
      <Faq />
      <ClosingCta />
    </>
  );
}
