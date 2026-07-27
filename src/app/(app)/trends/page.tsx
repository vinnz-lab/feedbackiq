import { PageStub } from "@/components/page-stub";

export default function TrendsPage() {
  return (
    <PageStub
      title="Trends"
      subtitle="Feedback trends for Acme App · Last 12 weeks"
      milestone="M4 (dashboards + digests)"
      features={[
        "Theme volume over time with per-theme legend toggles",
        "Sentiment shift (stacked positive / neutral / negative)",
        "Source-mix evolution",
        "An AI-written insight under every chart",
      ]}
    />
  );
}
