/**
 * Integration status. Nothing here is faked: every entry describes what the
 * feature will do once a real service is connected, and reports honestly that
 * it is not connected yet.
 */
export interface IntegrationStatus {
  name: string;
  kind: string;
  detail: string;
  connected: boolean;
}

export const integrationStatuses: IntegrationStatus[] = [
  {
    name: "Job board sources",
    kind: "Discovery",
    detail: "Live UK job feeds will populate the radar automatically",
    connected: false,
  },
  {
    name: "Company careers pages",
    kind: "Discovery",
    detail: "Direct scraping of watchlist company career sites",
    connected: false,
  },
  {
    name: "UK sponsor register",
    kind: "Sponsorship",
    detail: "Official licensed-sponsor list for evidence-backed checks",
    connected: false,
  },
  {
    name: "AI job & CV analysis",
    kind: "Analysis",
    detail: "Deeper CV-to-role reasoning beyond the built-in rules engine",
    connected: false,
  },
  {
    name: "Email digest",
    kind: "Notifications",
    detail: "Daily digest by email — in-app notifications work today",
    connected: false,
  },
  {
    name: "Daily scheduler",
    kind: "Automation",
    detail: "Automatic overnight scans; scans run when you press Run Scan Now",
    connected: false,
  },
];
