import { Container } from "@/components/ui/container";

const facts = [
  {
    title: "Works in the browser",
    text: "Screens, forms and navigation all work. Open it on a laptop or a phone.",
  },
  {
    title: "A link to share",
    text: "Anyone with the link can open it. It is not listed anywhere and search engines do not index it.",
  },
  {
    title: "Data stays on the device",
    text: "The prototype imitates a backend. What you type is saved in your own browser and is not sent to a server.",
  },
  {
    title: "Not a finished product",
    text: "There are no real accounts, payments or connections to other services. Web only for now.",
    muted: true,
  },
];

export function WhatYouGet() {
  return (
    <section id="get" aria-labelledby="get-title">
      <Container className="flex flex-wrap gap-x-18 gap-y-10 py-24">
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <h2
            id="get-title"
            className="font-display text-4xl leading-tight font-extrabold tracking-tight sm:text-[44px]"
          >
            What a Genie prototype is
          </h2>
          <p className="text-xl">
            A real web app you can click through and show to other people. It is made to test an
            idea, so it looks and behaves like the product without the parts that take months to
            build.
          </p>
        </div>
        <ul className="flex min-w-0 flex-[1.4_1_520px] flex-wrap gap-x-7 gap-y-8">
          {facts.map((fact) => (
            <li
              key={fact.title}
              className={`flex min-w-0 flex-[1_1_230px] flex-col gap-1.5 border-t-4 pt-3.5 ${fact.muted ? "border-rule" : "border-coral"}`}
            >
              <h3 className="text-xl font-bold">{fact.title}</h3>
              <p className="text-[17px] text-ink-muted">{fact.text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
