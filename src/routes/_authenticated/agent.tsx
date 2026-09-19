import { createFileRoute } from "@tanstack/react-router";
import { ApplicationAgentPanel } from "@/components/application-agent-panel";

export const Route = createFileRoute("/_authenticated/agent")({
  head: () => ({ meta: [{ title: "Application agent — Job Radar AI" }] }),
  component: ApplicationAgentPanel,
});
