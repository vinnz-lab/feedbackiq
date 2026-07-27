import { Card } from "@/components/ui";

export function PageStub({
  title,
  subtitle,
  milestone,
  features,
}: {
  title: string;
  subtitle: string;
  milestone: string;
  features: string[];
}) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
      </div>
      <Card className="p-8">
        <div className="mb-3 inline-flex items-center rounded-full bg-[var(--indigo-soft)] px-3 py-1 text-[11.5px] font-semibold text-indigo">
          Arriving in {milestone}
        </div>
        <p className="mb-4 max-w-2xl text-[14px] text-muted">
          This section is scaffolded and routed. The functional build lands in {milestone}:
        </p>
        <ul className="flex max-w-2xl flex-col gap-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
              <span className="mt-0.5 text-indigo">→</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
