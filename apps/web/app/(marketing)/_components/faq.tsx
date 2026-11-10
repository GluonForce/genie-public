import { Container } from "@/components/ui/container";

const questions = [
  {
    q: "Why does a person review my requirements?",
    a: "So that nothing is built that is unclear, out of scope or abusive. The reviewer can only accept or decline. Your requirements stay exactly as you approved them.",
  },
  {
    q: "What if the requirements are not right?",
    a: "Tell Genie what to change and it rewrites them. You can do this twice. After that you either approve them or decline. Declining uses up your free prototype.",
  },
  {
    q: "Who can see my prototype?",
    a: "Anyone you give the link to. The link is hard to guess and is not listed publicly. We can take a prototype offline if it breaks our rules.",
  },
  {
    q: "What happens after 3 days?",
    a: "The link stops working. We keep the prototype, so it can be put back online once that feature is released.",
  },
  {
    q: "How long does it take?",
    a: "[REVIEW AND BUILD TIME]. You do not need to keep the page open. We email you when the prototype is ready.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title">
      <Container className="flex flex-wrap gap-x-18 gap-y-10 py-24">
        <h2
          id="faq-title"
          className="min-w-0 flex-[1_1_280px] font-display text-4xl leading-tight font-extrabold tracking-tight sm:text-[44px]"
        >
          Questions
        </h2>
        <dl className="flex min-w-0 flex-[2_1_560px] flex-col">
          {questions.map((item, i) => (
            <div
              key={item.q}
              className={`flex flex-col gap-1.5 py-5.5 ${i === 0 ? "border-t-4 border-navy" : "border-t-2 border-rule"}`}
            >
              <dt className="text-xl font-bold">{item.q}</dt>
              <dd className="text-ink-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
