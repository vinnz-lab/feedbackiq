import { PageStub } from "@/components/page-stub";

export default function RoadmapPage() {
  return (
    <PageStub
      title="Roadmap"
      subtitle="Score with configurable factors, place on the board, push to Jira with evidence attached"
      milestone="M3 (workspace + Jira)"
      features={[
        "Prioritised backlog with configurable scoring (demand, sentiment, benefit, effort)",
        "Benefit / effort matrix — quick wins surface automatically",
        "Drag-and-drop roadmap board (Under review → Planned → In progress → Shipped)",
        "One-click push to Jira Cloud with the AI summary and evidence links attached",
      ]}
    />
  );
}
