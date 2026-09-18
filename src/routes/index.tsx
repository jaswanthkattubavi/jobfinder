import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BadgeCheck, Radar, ShieldQuestion, Sparkles, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Job Radar AI — your personal UK job discovery agent" },
      {
        name: "description",
        content:
          "Job Radar AI scans UK tech roles daily, checks visa sponsorship, scores every role against your CV and tells you what to apply to today.",
      },
      { property: "og:title", content: "Job Radar AI — your personal UK job agent" },
      {
        property: "og:description",
        content:
          "Stop scrolling job boards. Get a short, ranked list of UK tech roles worth your time each morning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const points = [
  {
    icon: Radar,
    title: "Daily scan, not endless scrolling",
    body: "Roles are discovered, de-duplicated and link-checked before you ever see them.",
  },
  {
    icon: Target,
    title: "Scored against your CV",
    body: "Skills, experience, seniority and domain fit combine into one honest match score.",
  },
  {
    icon: ShieldQuestion,
    title: "Sponsorship, with evidence",
    body: "Never a yes/no guess — a status, a confidence level and the evidence behind it.",
  },
  {
    icon: BadgeCheck,
    title: "Applications tracked",
    body: "Every role you apply to moves through your own pipeline, with follow-up reminders.",
  },
];

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/today", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2.5">
          <span className="radar-glow flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Radar className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Job Radar AI</span>
        </div>
        <Button asChild size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24">
        <section className="pt-10 sm:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            For UK graduate & early-career tech candidates
          </p>
          <h1 className="mt-5 max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            What should I apply to today?
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Job Radar AI watches UK data, AI, cloud and software roles for you, checks visa
            sponsorship, scores each one against your CV, and gives you a short ranked list each
            morning — instead of hundreds of listings.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Create your radar</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/auth">I already have an account</Link>
            </Button>
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2">
          {points.map((point) => (
            <div key={point.title} className="surface rounded-xl border p-5">
              <point.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-sm font-semibold">{point.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{point.body}</p>
            </div>
          ))}
        </section>

        <p className="mt-12 text-xs text-muted-foreground">
          Live job sources are not connected yet, so new accounts start with clearly labelled demo
          roles. Job Radar AI never applies on your behalf, and sponsorship information is guidance,
          never a guarantee.
        </p>
      </main>
    </div>
  );
}
