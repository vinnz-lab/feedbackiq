import { PageStub } from "@/components/page-stub";

export default function SettingsPage() {
  return (
    <PageStub
      title="Settings"
      subtitle="Application scope · Acme App"
      milestone="M0b–M4 (progressively)"
      features={[
        "Application details, owner and team members with the four RBAC roles",
        "Taxonomy — the editable product-area library the AI proposes into",
        "The editable AI 'brain' — prompts, tagging rules and summary style you can tune",
        "Integrations — Jira Cloud, forwarding address, and Phase-2 connectors",
      ]}
    />
  );
}
