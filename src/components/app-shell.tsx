import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bot,
  Bookmark,
  Building2,
  ClipboardList,
  Moon,
  Radar,
  RefreshCw,
  Settings,
  Sun,
  Sunrise,
  LogOut,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useRadar } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/today", label: "Today", icon: Sunrise },
  { to: "/feed", label: "Job Feed", icon: Radar },
  { to: "/agent", label: "Agent", icon: Bot },
  { to: "/saved", label: "Saved", icon: Bookmark },
  { to: "/applications", label: "Applications", icon: ClipboardList },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem("jra-theme");
    const isDark = stored ? stored === "dark" : true;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("jra-theme", next ? "dark" : "light");
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle colour theme">
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { scans, runScan, scanning, hasDemoData, jobs } = useRadar();
  const realCount = jobs.filter((j) => !j.demo).length;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const latest = scans[0];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
        <Link to="/today" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="size-4" aria-hidden />
          </span>
          <span className="font-display text-base font-semibold">Job Radar AI</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="surface radar-glow mt-4 p-3 text-xs">
          <p className="font-medium">Job discovery</p>
          <p className="mt-1 text-muted-foreground">
            Last scan: {latest ? `${formatDate(latest.date)}, ${latest.finishedAt}` : "not run yet"}
          </p>
          <p className="text-muted-foreground">Manage scheduled discovery in Settings</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3 w-full"
            onClick={runScan}
            disabled={scanning}
          >
            <RefreshCw className={cn("size-3.5", scanning && "animate-spin")} aria-hidden />
            {scanning ? "Scanning…" : "Run scan now"}
          </Button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Radar className="size-3.5" aria-hidden />
              </span>
              <span className="font-display text-sm font-semibold">Job Radar AI</span>
            </div>
            <p className="hidden text-xs text-muted-foreground lg:block">
              {realCount > 0
                ? `${realCount} real UK vacancies in your radar${hasDemoData ? " · demo roles are labelled DEMO" : ""}`
                : hasDemoData
                  ? "No job sources set up yet · showing clearly labelled demo roles"
                  : "No job sources set up yet"}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={runScan}
                disabled={scanning}
                className="lg:hidden"
              >
                <RefreshCw className={cn("size-4", scanning && "animate-spin")} aria-hidden />
                Scan
              </Button>
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                <LogOut className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-14">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden"
        aria-label="Primary mobile"
      >
        <div className="grid grid-cols-5">
          {nav.slice(0, 5).map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
