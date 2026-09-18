import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Job Radar AI" },
      {
        name: "description",
        content: "Set a new password for your Job Radar AI account and get back to your daily scan.",
      },
      { property: "og:title", content: "Choose a new password — Job Radar AI" },
      { property: "og:description", content: "Set a new Job Radar AI password." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      navigate({ to: "/today", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="radar-glow flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Radar className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Job Radar AI</span>
        </div>
        <div className="surface rounded-xl border p-6">
          <h1 className="font-display text-xl font-semibold tracking-tight">Choose a new password</h1>
          {ready ? (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save new password
              </Button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Open this page from the reset link in your email, then you can set a new password here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
