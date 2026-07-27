import { PageStub } from "@/components/page-stub";

export default function ThemesPage() {
  return (
    <PageStub
      title="Themes"
      subtitle="AI-clustered feedback with cited summaries and trends"
      milestone="M2 (AI pipeline)"
      features={[
        "Cards ⇄ list toggle with type / sentiment / priority / area filters",
        "Theme detail with cited evidence (speaker + timestamp, row provenance)",
        "Editable AI classification — corrections persist and train the model",
        "Trend sparkline and source-mix per theme",
      ]}
    />
  );
}
