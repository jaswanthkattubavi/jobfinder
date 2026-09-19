import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bot, Download, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getAgentStateFn,
  saveAgentSettingsFn,
  prepareAgentQueueFn,
  prepareApplicationFn,
  saveAnswerFn,
  importQuestionsFn,
  downloadPacketFn,
  setTaskStatusFn,
  deleteMemoryAnswerFn,
} from "@/lib/services/application-agent.functions";

type Question = {
  key: string;
  label: string;
  required: boolean;
  options: string[];
  type: string;
  answer: string | null;
};
type Task = {
  id: string;
  job_id: string;
  title: string;
  company: string;
  apply_url: string;
  verdict: "APPLY" | "STRETCH" | "SKIP";
  fit: number;
  status: "queued" | "needs_input" | "ready" | "submitted" | "dismissed" | "blocked";
  reasons: string[];
  cv_text: string | null;
  cv_notes: string[];
  questions: Question[];
  last_error: string | null;
  updated_at: string;
};
type Settings = {
  enabled: boolean;
  daily_limit: number;
  min_fit: number;
  include_stretch: boolean;
};
type RunAction = (action: () => Promise<unknown>, success?: string) => Promise<void>;

function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function applicationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
const statuses: Record<Task["status"], string> = {
  queued: "Queued",
  needs_input: "Needs your answers",
  ready: "Prepared",
  submitted: "Submitted (reported)",
  dismissed: "Dismissed",
  blocked: "Needs attention",
};

export function ApplicationAgentPanel() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("active");
  const state = useQuery({
    queryKey: ["application-agent"],
    queryFn: () => getAgentStateFn(),
    refetchInterval: 60000,
  });
  const run: RunAction = async (action, success) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
      await client.invalidateQueries({ queryKey: ["application-agent"] });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The action could not be completed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const data = state.data;
  const tasks = (data?.tasks ?? []) as Task[];
  const active = tasks.filter((task) => !["submitted", "dismissed"].includes(task.status));
  const visible =
    filter === "active"
      ? active
      : filter === "all"
        ? tasks
        : tasks.filter((task) => task.status === filter);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Application agent"
        description="Turn discovered roles into evidence-based application drafts, with your answers remembered where appropriate."
        action={
          <Button
            disabled={busy || !data?.cvReady}
            onClick={() =>
              void run(async () => {
                const result = await prepareAgentQueueFn();
                toast.success(`${result.created} added · ${result.prepared} prepared`);
                if (result.note) toast.info(result.note);
              })
            }
          >
            <Bot className="size-4" />
            Prepare applications
          </Button>
        }
      />
      <section className="surface border-primary/30 p-5 text-sm">
        <p className="font-medium">Daily preparation. You stay in control of submission.</p>
        <p className="mt-2 text-muted-foreground">
          When enabled, the agent prepares eligible roles after scheduled discovery. Use the browser
          companion to inspect questions and fill supported fields. Review the full application on
          the employer’s site; sign-in, verification codes, CAPTCHAs, file uploads and final
          submission remain with you. Inbox monitoring is not connected.
        </p>
      </section>
      {state.isPending && (
        <p role="status" className="text-muted-foreground">
          Loading your application workspace…
        </p>
      )}
      {state.isError && (
        <section role="alert" className="surface p-5">
          <h2 className="font-semibold">Application workspace unavailable</h2>
          <p className="my-2 text-sm text-muted-foreground">
            {state.error instanceof Error
              ? state.error.message
              : "We could not load your application workspace."}
          </p>
          <Button variant="outline" onClick={() => void state.refetch()}>
            Try again
          </Button>
        </section>
      )}
      {data && (
        <>
          {!data.cvReady && (
            <section className="surface p-5">
              <h2 className="font-medium">Add your verified CV to start</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The agent needs your actual experience before it can prepare applications.
              </p>
              <Link to="/settings" className="mt-3 inline-block text-sm text-primary underline">
                Open profile and CV settings
              </Link>
            </section>
          )}
          <SettingsForm
            key={JSON.stringify(data.settings)}
            settings={data.settings}
            busy={busy}
            run={run}
          />
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SectionHeading title="Application queue" count={active.length} />
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="queue-filter">
                  Filter applications
                </label>
                <select
                  id="queue-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="rounded-md border border-input bg-background p-2 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="needs_input">Needs answers</option>
                  <option value="ready">Prepared</option>
                  <option value="submitted">Submitted</option>
                  <option value="all">All applications</option>
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh applications"
                  onClick={() => void state.refetch()}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </div>
            {visible.length === 0 ? (
              <div className="surface p-8 text-center">
                <Bot className="mx-auto mb-3 size-7 text-muted-foreground" />
                <p className="font-medium">No applications in this view</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Run discovery, then prepare applications. Only real roles meeting your filters
                  enter the queue.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {visible.map((task) => (
                  <TaskCard
                    key={`${task.id}:${task.updated_at}`}
                    task={task}
                    busy={busy}
                    run={run}
                  />
                ))}
              </div>
            )}
          </section>
          <section className="surface p-5">
            <SectionHeading
              title="Answer memory"
              count={data.answers.length}
              hint="Only answers you choose to remember are saved for reuse."
            />
            {data.answers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved answers yet. Role-specific and sensitive questions still need your review.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.answers.map((answer) => (
                  <li key={answer.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{answer.question}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {answer.answer}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Scope: {answer.scope} · Confirmed{" "}
                        {new Date(answer.confirmed_at).toLocaleDateString("en-GB")}
                        {answer.expires_at
                          ? ` · Expires ${new Date(answer.expires_at).toLocaleDateString("en-GB")}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => deleteMemoryAnswerFn({ data: { id: answer.id } }),
                          "Saved answer removed",
                        )
                      }
                    >
                      Forget
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="surface p-5">
            <SectionHeading title="Recent activity" />
            {data.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Preparation, answer updates and submission reports will appear here.
              </p>
            ) : (
              <ol className="max-h-80 space-y-3 overflow-y-auto">
                {data.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-3 text-sm">
                    <span className="font-medium">{event.kind.replaceAll("_", " ")}</span>
                    <p className="break-words text-muted-foreground">
                      {typeof event.detail === "string"
                        ? event.detail
                        : JSON.stringify(event.detail)}
                    </p>
                    <time className="text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleString("en-GB")}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SettingsForm({
  settings,
  busy,
  run,
}: {
  settings: Settings;
  busy: boolean;
  run: RunAction;
}) {
  const [draft, setDraft] = useState(settings);
  return (
    <form
      className="surface space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => saveAgentSettingsFn({ data: draft }), "Agent preferences saved");
      }}
    >
      <SectionHeading
        title="Preparation preferences"
        hint="These controls do not activate an unconfigured discovery schedule."
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        Prepare applications after daily discovery
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-2 text-sm">
          <span>Daily preparation limit</span>
          <Input
            required
            type="number"
            min={1}
            max={20}
            value={draft.daily_limit}
            onChange={(e) => setDraft({ ...draft, daily_limit: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span>Minimum fit (50–100)</span>
          <Input
            required
            type="number"
            min={50}
            max={100}
            value={draft.min_fit}
            onChange={(e) => setDraft({ ...draft, min_fit: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.include_stretch}
            onChange={(e) => setDraft({ ...draft, include_stretch: e.target.checked })}
          />
          Include STRETCH roles
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        SKIP roles and roles requiring UK security clearance stay out of the preparation queue.
      </p>
      <Button type="submit" variant="secondary" disabled={busy}>
        Save preferences
      </Button>
    </form>
  );
}

function TaskCard({ task, busy, run }: { task: Task; busy: boolean; run: RunAction }) {
  const [confirmation, setConfirmation] = useState("");
  const url = applicationUrl(task.apply_url);
  const closed = ["submitted", "dismissed"].includes(task.status);
  async function importReport(file: File) {
    if (file.size > 1024 * 1024) throw new Error("Question report must be smaller than 1 MB.");
    const report = JSON.parse(await file.text());
    if (
      report.version !== 1 ||
      report.taskId !== task.id ||
      !Array.isArray(report.questions) ||
      report.questions.length > 100
    )
      throw new Error("Choose a version 1 question report for this application.");
    const questions = report.questions.map((q: unknown) => {
      if (!q || typeof q !== "object") throw new Error("Invalid question report.");
      const item = q as Record<string, unknown>;
      if (
        typeof item["key"] !== "string" ||
        typeof item["label"] !== "string" ||
        typeof item["required"] !== "boolean" ||
        typeof item["type"] !== "string" ||
        !Array.isArray(item["options"]) ||
        !item["options"].every((option) => typeof option === "string")
      )
        throw new Error("The question report contains invalid fields.");
      return {
        key: item["key"],
        label: item["label"],
        required: item["required"],
        type: item["type"],
        options: item["options"] as string[],
      };
    });
    await importQuestionsFn({ data: { taskId: task.id, questions } });
  }
  return (
    <article className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{task.title}</h3>
          <p className="text-sm text-muted-foreground">{task.company}</p>
        </div>
        <div className="text-right text-sm">
          <span className="rounded-md bg-muted px-2 py-1 font-medium">{statuses[task.status]}</span>
          <p className="mt-2 text-muted-foreground">
            {task.verdict} · {task.fit}% fit
          </p>
        </div>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {task.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
      {task.last_error && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
          {task.last_error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {url && (
          <Button variant="outline" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              Open application
            </a>
          </Button>
        )}
        {!closed && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => prepareApplicationFn({ data: { taskId: task.id } }),
                "Application prepared",
              )
            }
          >
            {task.cv_text ? "Refresh preparation" : "Prepare draft"}
          </Button>
        )}
        {!closed && task.cv_text && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const packet = await downloadPacketFn({ data: { taskId: task.id } });
                download(
                  `application-${task.id}.json`,
                  JSON.stringify(packet, null, 2),
                  "application/json",
                );
              })
            }
          >
            <Download className="size-4" />
            Browser companion packet
          </Button>
        )}
        {!closed && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(
                () => setTaskStatusFn({ data: { taskId: task.id, status: "dismissed" } }),
                "Application dismissed",
              )
            }
          >
            Dismiss
          </Button>
        )}
      </div>
      {task.cv_text && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Review prepared CV text and evidence notes
          </summary>
          <ul className="my-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {task.cv_notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
          <p className="mb-3 text-xs text-muted-foreground">
            Preparation preserves your verified experience and may reorder skills for this role.
            Original PDF or Word formatting is not retained. Upload the final CV yourself on the
            employer’s site.
          </p>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-sans text-sm">
            {task.cv_text}
          </pre>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => download(`cv-${task.id}.txt`, task.cv_text!)}
          >
            <Download className="size-4" />
            Download CV text
          </Button>
        </details>
      )}
      {!closed && (
        <div className="space-y-3 border-t border-border pt-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Import questions from the browser companion</span>
            <Input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void run(() => importReport(file), "Application questions imported");
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Load the application packet in the companion, inspect the employer’s form, then import
            its question report here.
          </p>
        </div>
      )}
      {task.questions.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Application questions</h4>
          {task.questions.map((q) => (
            <QuestionForm
              key={`${q.key}:${q.answer}`}
              taskId={task.id}
              question={q}
              busy={busy || closed}
              run={run}
            />
          ))}
        </div>
      )}
      {!closed && (
        <form
          className="space-y-2 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                setTaskStatusFn({
                  data: { taskId: task.id, status: "submitted", confirmation: confirmation.trim() },
                }),
              "Submission recorded",
            );
          }}
        >
          <label htmlFor={`confirmation-${task.id}`} className="text-sm font-medium">
            Already submitted on the employer’s site?
          </label>
          <Input
            id={`confirmation-${task.id}`}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
            maxLength={1000}
            placeholder="Confirmation reference or what you saw after submitting"
          />
          <p className="text-xs text-muted-foreground">
            This records your report. It does not submit or verify an application.
          </p>
          <Button type="submit" variant="outline" disabled={busy || !confirmation.trim()}>
            Record my submission
          </Button>
        </form>
      )}
    </article>
  );
}

function QuestionForm({
  taskId,
  question,
  busy,
  run,
}: {
  taskId: string;
  question: Question;
  busy: boolean;
  run: RunAction;
}) {
  const [answer, setAnswer] = useState(question.answer ?? "");
  const [remember, setRemember] = useState(false);
  const id = `${taskId}-${question.key}`;
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(
      () =>
        saveAnswerFn({ data: { taskId, question: question.key, answer: answer.trim(), remember } }),
      "Answer saved",
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-border p-3">
      <label htmlFor={id} className="block text-sm font-medium">
        {question.label}
        {question.required ? " *" : ""}
      </label>
      {question.options.length > 0 ? (
        <select
          id={id}
          required={question.required}
          disabled={busy}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="w-full rounded-md border border-input bg-background p-2 text-sm"
        >
          <option value="">Choose an answer</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <Textarea
          id={id}
          required={question.required}
          maxLength={10000}
          disabled={busy}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Use your actual experience and circumstances"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            disabled={busy}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember if suitable for reuse
        </label>
        <Button size="sm" variant="secondary" disabled={busy || !answer.trim()} type="submit">
          Save answer
        </Button>
      </div>
    </form>
  );
}
