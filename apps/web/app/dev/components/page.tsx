import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import type { ButtonVariant } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill, type PillTone } from "@/components/ui/pill";
import { ProgressTrack } from "@/components/ui/progress-track";
import { Textarea } from "@/components/ui/textarea";
import { DialogDemo } from "./_components/dialog-demo";

const variants: ButtonVariant[] = ["primary", "inverse", "outline", "danger"];
const pillExamples: [PillTone, string][] = [
  ["amber", "Waiting for review"],
  ["success", "Live"],
  ["danger", "Not accepted"],
  ["neutral", "Building"],
];

// Every shared component in one place, for checking them against the design.
// Development only: production builds return 404.
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-screen bg-blush px-6 py-10">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-10">
        <h1 className="font-display text-4xl font-extrabold">Components</h1>

        <Showcase title="Button">
          {(["md", "sm"] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-4">
              {variants.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant} {size}
                </Button>
              ))}
              <Button size={size} disabled>
                disabled
              </Button>
            </div>
          ))}
        </Showcase>

        <Showcase title="ButtonLink">
          <div className="flex flex-wrap items-center gap-4">
            <ButtonLink href="#" recordDot>
              Record your idea
            </ButtonLink>
            <ButtonLink href="#" variant="outline">
              outline
            </ButtonLink>
          </div>
        </Showcase>

        <Showcase title="Input">
          <Input type="email" placeholder="you@company.com" aria-label="Email" />
          <Input
            readOnly
            value="https://invoice-approvals-k3x9.localhost:8787"
            aria-label="Prototype link"
          />
          <Input disabled placeholder="disabled" aria-label="Disabled" />
        </Showcase>

        <Showcase title="Textarea">
          <Textarea
            placeholder="For example: managers should see the total amount waiting for approval."
            aria-label="Change request"
          />
        </Showcase>

        <Showcase title="Card">
          <Card className="flex flex-col gap-2">
            <h3 className="font-display text-2xl font-extrabold">User card</h3>
            <p className="text-ink-muted">28px corners, used in the user app.</p>
          </Card>
          <div className="rounded-[28px] bg-admin-bg p-6">
            <Card size="admin" className="flex flex-col gap-1">
              <h3 className="font-bold">Admin card</h3>
              <p className="text-ink-muted">20px corners, on the admin background.</p>
            </Card>
          </div>
        </Showcase>

        <Showcase title="Pill">
          {(["md", "sm"] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-3">
              {pillExamples.map(([tone, label]) => (
                <Pill key={tone} tone={tone} size={size}>
                  {label}
                </Pill>
              ))}
            </div>
          ))}
        </Showcase>

        <Showcase title="ProgressTrack">
          <ProgressTrack steps={["Record", "Requirements", "Team review", "Prototype"]} current={1} />
        </Showcase>

        <Showcase title="Dialog">
          <DialogDemo />
        </Showcase>
      </div>
    </main>
  );
}

function Showcase({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t-4 border-navy pt-5">
      <h2 className="font-display text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}
