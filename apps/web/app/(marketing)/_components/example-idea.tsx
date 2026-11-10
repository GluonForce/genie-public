import { Container } from "@/components/ui/container";

const requirements = [
  "Team members submit an invoice with supplier, amount and due date",
  "Managers approve or reject each invoice with a comment",
  "Finance sees a list of approved invoices that are ready to pay",
];

export function ExampleIdea() {
  return (
    <section aria-label="Example" className="bg-blush">
      <Container className="flex flex-wrap items-center gap-x-18 gap-y-10 py-22">
        <figure className="flex min-w-0 flex-[1_1_440px] flex-col gap-3.5">
          <figcaption className="font-bold">What you say</figcaption>
          <blockquote className="text-2xl leading-snug sm:text-3xl">
            &ldquo;Our team approves supplier invoices over email and they get lost. I want one
            place where a manager approves or rejects each invoice, and finance sees what is ready
            to pay.&rdquo;
          </blockquote>
        </figure>
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
          <p className="font-bold">What Genie writes</p>
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-white px-7 py-6">
            <h3 className="font-display text-xl font-extrabold">Supplier invoice approvals</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[17px]">
              {requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
