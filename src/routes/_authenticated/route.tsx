// Pathless layout route that gates every child under `src/routes/_authenticated/`
// behind a signed-in Supabase user. The subtree is client-rendered (`ssr: false`)
// because Supabase stores the session in `localStorage`, which the server cannot
// read.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { OnboardingGate } from "@/components/onboarding-gate";
import { RadarProvider, useRadar } from "@/lib/store";

const SIGN_IN_ROUTE = "/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: SIGN_IN_ROUTE });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();

  return (
    <RadarProvider userId={user.id}>
      <RadarBoundary>
        <AppShell>
          <Outlet />
        </AppShell>
      </RadarBoundary>
    </RadarProvider>
  );
}

function RadarBoundary({ children }: { children: React.ReactNode }) {
  const { loading, error, reload, onboardingCompleted } = useRadar();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your radar…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-lg font-semibold">We couldn't load your radar</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={reload}
            className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!onboardingCompleted) return <OnboardingGate />;

  return <>{children}</>;
}
