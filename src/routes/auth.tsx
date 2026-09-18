import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, Radar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Job Radar AI" },
      {
        name: "description",
        content:
          "Sign in to Job Radar AI to see today's UK roles worth applying to, with sponsorship checks and CV match scores.",
      },
      { property: "og:title", content: "Sign in — Job Radar AI" },
      {
        property: "og:description",
        content: "Access your personal UK job radar.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "magic" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/today", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/today", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSent(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/today", replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent("Check your inbox to confirm your email address, then sign in.");
        }
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setSent("We've emailed you a sign-in link. It works for one use.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("If that email has an account, a reset link is on its way.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in didn't complete. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/today", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="radar-glow flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Radar className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Job Radar AI</span>
        </Link>

        <div className="surface rounded-xl border p-6">
          <Tabs
            value={mode === "signup" ? "signup" : "signin"}
            onValueChange={(v) => setMode(v === "signup" ? "signup" : "signin")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" />
            <TabsContent value="signup" />
          </Tabs>

          <h1 className="mt-5 font-display text-xl font-semibold tracking-tight">
            {mode === "signup"
              ? "Create your radar"
              : mode === "magic"
                ? "Email me a link"
                : mode === "forgot"
                  ? "Reset your password"
                  : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "One account holds your CV, preferences and applications."
              : "Pick up your daily scan where you left off."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jaswanth"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            {(mode === "signin" || mode === "signup") && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            )}

            {sent && (
              <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
                {sent}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signup"
                ? "Create account"
                : mode === "magic"
                  ? "Send sign-in link"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <Button variant="outline" className="w-full" onClick={google} disabled={busy}>
              Continue with Google
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setSent(null);
                setMode(mode === "magic" ? "signin" : "magic");
              }}
            >
              <Mail className="mr-2 h-4 w-4" />
              {mode === "magic" ? "Use a password instead" : "Email me a sign-in link"}
            </Button>
            {mode !== "forgot" && (
              <button
                type="button"
                onClick={() => {
                  setSent(null);
                  setMode("forgot");
                }}
                className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Forgot your password?
              </button>
            )}
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Job Radar AI never applies on your behalf. You always apply yourself.
        </p>
      </div>
    </div>
  );
}
